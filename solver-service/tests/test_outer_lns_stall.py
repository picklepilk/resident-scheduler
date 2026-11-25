"""config.outerLns.subStallSeconds: a polishing sub-solve stops once it goes quiet (2026-11-24)."""

from __future__ import annotations

import datetime
import threading
import time

from solver.build import build_model
from solver.lns_outer import run_outer_lns
from solver.io.payload import parse_payload
from solver.model.objective import TIER_QUALITY
from solver.solve import _STAGE_NAMES, _configure_solver
from tests.helpers import make_payload, make_resident


SH = {"N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"},
      "D": {"startH": 7, "durationH": 12, "type": "day", "area": "POD"}}


def _payload_only():
    dates = [(datetime.date(2026, 1, 5) + datetime.timedelta(days=i)).isoformat() for i in range(35)]
    return parse_payload(make_payload(
        residents=[make_resident(f"r{i}") for i in range(16)], shifts=SH, dates=dates,
        coverage={s: {d: {"min": 2, "max": 3} for d in dates} for s in SH}))


_CACHE = []


def _setup():
    if _CACHE:
        return _CACHE[0]
    """16 synthetic residents x 35 days, two shifts: big enough that some sub-solves are not proven optimal fast."""
    payload = _payload_only()
    br = build_model(payload)
    br.model.maximize(br.objective.stage_exprs[TIER_QUALITY])  # deliberately poor incumbent
    s = _configure_solver(payload, allow_repair_hint=False)
    s.parameters.max_time_in_seconds = 20
    s.parameters.stop_after_first_solution = True
    assert s.status_name(s.solve(br.model)) in ("OPTIMAL", "FEASIBLE")
    _CACHE.append((payload, br, s))
    return payload, br, s


def _go(stall, parallel=1, budget=6.0, cap=4.0):
    payload, br, s = _setup()
    before = {n: round(s.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES}
    kw = {} if stall is None else {"sub_stall_seconds": stall}
    best, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _configure_solver(payload, allow_repair_hint=False),
        deadline=time.time() + budget, sub_solve_seconds=cap, seed=7, parallel=parallel, **kw,
    )
    after = {n: round(best.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES}
    return rep, before, after


def _no_worse(before, after):
    for n in _STAGE_NAMES:
        if n != TIER_QUALITY:
            assert after[n] <= before[n], n
    assert after[TIER_QUALITY] <= before[TIER_QUALITY]


def test_off_by_default_has_no_gain_or_stall_fields():
    rep, before, after = _go(None, budget=3.0, cap=1.0)
    assert rep["steps"]
    for row in rep["steps"]:
        assert row["lastGain"] is None and row["stalled"] is False
    _no_worse(before, after)


def test_stall_stops_quiet_substeps_early():
    rep, before, after = _go(0.3)
    steps = rep["steps"]
    assert steps
    assert any(r["stalled"] for r in steps)
    assert sum(r["s"] for r in steps) / len(steps) < 3.0
    for r in steps:
        if r["gain"] > 0:
            assert r["lastGain"] is not None and r["lastGain"] <= r["s"] + 0.05
    _no_worse(before, after)


def test_no_leaked_threads():
    before = threading.active_count()
    _go(0.3, budget=3.0, cap=2.0)
    time.sleep(0.3)
    assert threading.active_count() <= before


def test_parallel_two_works():
    rep, before, after = _go(0.3, parallel=2)
    assert rep["steps"]
    assert any(r["stalled"] for r in rep["steps"])
    _no_worse(before, after)
