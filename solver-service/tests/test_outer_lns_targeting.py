"""Outer LNS targeting options (2026-11-23): nightCleanup / qualityWorst neighborhoods, shrinkOnTimeout,
skip, per-step timing. Synthetic residents only (r1, r2, ...)."""

from __future__ import annotations

import random
import time

from ortools.sat import sat_parameters_pb2

from solver.build import build_model
from solver.io.payload import parse_payload
from solver.lns_outer import NEIGHBORHOODS, OuterLnsConfig, _Neighborhoods, _choose, parse_outer_lns, run_outer_lns
from solver.model.objective import TIER_QUALITY
from solver.solve import _STAGE_NAMES, _configure_solver
from tests.helpers import load_fixture, make_payload, make_resident
from tests.test_outer_lns import _bad_incumbent, _raw

N_SHIFT = {"N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"}}


def _dates(n):
    return [f"2026-01-{5 + i:02d}" for i in range(n)]


def _payload(n_dates, rids, cov_min=0):
    dates = _dates(n_dates)
    return parse_payload(make_payload(
        residents=[make_resident(r) for r in rids], shifts=N_SHIFT, dates=dates,
        coverage={"N": {d: {"min": cov_min, "max": 1} for d in dates}},
    ))


def _incumbent(payload, pattern):
    """Solve a model whose x vars are all pinned to `pattern` ({(rid, dateIdx)}). Returns the CpSolver; its solution
    vector is index-compatible with a FRESH build_model(payload) (pins add constraints, not variables)."""
    br = build_model(payload)
    dates = list(payload.block.dates)
    for (rid, _sid, d), var in br.store.x.items():
        br.model.add(var == (1 if (rid, dates.index(d)) in pattern else 0))
    s = _configure_solver(payload, allow_repair_hint=False)
    s.parameters.max_time_in_seconds = 10
    assert s.status_name(s.solve(br.model)) in ("OPTIMAL", "FEASIBLE")
    return s


def _hood(payload, seed=1):
    br = build_model(payload)
    return br, _Neighborhoods(payload, br.store, br.objective, random.Random(seed))


def _run(n_dates, pattern, rids, cov_min, **kw):
    payload = _payload(n_dates, rids, cov_min)
    inc = _incumbent(payload, pattern)
    br = build_model(payload)
    return payload, br, inc


# ---- nightCleanup ----

def _spread_pattern():
    # 14 days: r1 nights d0-4 (edge run), r2 isolated night d7, r3 nights d12-13 (edge run)
    return {("r1", i) for i in range(5)} | {("r2", 7)} | {("r3", 12), ("r3", 13)}


def test_night_stints_only_interior_short_runs():
    payload = _payload(14, ["r1", "r2", "r3"])
    _br, hood = _hood(payload)
    inc = _incumbent(payload, _spread_pattern())
    assert hood.night_stints(inc) == [("r2", 7, 7)]


def test_night_cleanup_free_set_is_local():
    payload = _payload(14, ["r1", "r2", "r3"])
    br, hood = _hood(payload)
    inc = _incumbent(payload, _spread_pattern())
    dates = list(payload.block.dates)
    free = hood.night_cleanup(inc)
    win = set(dates[4:11])  # d7 +/- 3
    assert free and free <= set(br.store.x)
    assert {k[2] for k in free} <= win  # nothing outside the window
    assert {k[0] for k in free} == {"r1", "r2"}  # stint resident + night holder (r1 on d4); r3 is far away
    for rid in ("r1", "r2"):
        assert {k for k in br.store.x if k[0] == rid and k[2] in win} <= free


def test_night_cleanup_rotates_over_stints():
    payload = _payload(14, ["r1", "r2", "r3"])
    br, hood = _hood(payload, seed=4)
    pattern = {("r1", 3), ("r2", 7), ("r3", 11)}  # three interior isolated nights
    inc = _incumbent(payload, pattern)
    assert len(hood.night_stints(inc)) == 3
    anchors = set()
    for _ in range(3):
        free = hood.night_cleanup(inc)
        anchors.add(frozenset(k[2] for k in free))
    # three calls = one full cycle over three stints: the free windows differ
    assert len(anchors) == 3


def test_night_cleanup_without_stints_falls_back_to_window():
    payload = _payload(14, ["r1", "r2"])
    _br, hood = _hood(payload)
    inc = _incumbent(payload, {("r1", i) for i in range(5)})
    assert hood.night_stints(inc) == []
    assert hood.night_cleanup(inc)


def test_night_cleanup_removes_mergeable_isolated_night():
    # r2's lone night on d3 sits between two r1 runs; merging into one run is cheaper.
    pattern = {("r1", i) for i in (0, 1, 2, 4, 5, 6, 7)} | {("r2", 3)}
    payload, br, inc = _run(8, pattern, ["r1", "r2"], cov_min=1)
    hood = _Neighborhoods(payload, br.store, br.objective, random.Random(1))
    assert hood.night_stints(inc) == [("r2", 3, 3)]
    before = round(inc.value(br.objective.stage_exprs[TIER_QUALITY]))
    best, rep = run_outer_lns(
        payload, br, inc, _STAGE_NAMES, TIER_QUALITY, lambda: _configure_solver(payload, allow_repair_hint=False),
        deadline=time.time() + 10, sub_solve_seconds=3, seed=3, neighborhoods=("nightCleanup",), skip=NEIGHBORHOODS,
    )
    assert set(rep["byNeighborhood"]) == {"nightCleanup"}
    assert rep["byNeighborhood"]["nightCleanup"]["accepted"] >= 1
    assert round(best.value(br.objective.stage_exprs[TIER_QUALITY])) < before
    assert hood.night_stints(best) == []


# ---- qualityWorst ----

def test_quality_pain_ranks_bad_night_shape_above_clean():
    payload = _payload(14, ["r1", "r2", "r3"])
    br, hood = _hood(payload)
    inc = _incumbent(payload, _spread_pattern())
    pain = hood.quality_pain(inc)
    assert pain["r2"] >= 300  # isolated interior night (+ isolated work day)
    assert pain.get("r1", 0) < pain["r2"] and pain.get("r3", 0) < pain["r2"]
    # the worst resident is always freed whole-block
    for _ in range(5):
        free = hood.quality_worst(inc)
        assert {k for k in br.store.x if k[0] == "r2"} <= free


def test_quality_worst_without_pain_falls_back_to_residents():
    payload = _payload(14, ["r1", "r2", "r3"])
    br, hood = _hood(payload)
    inc = _incumbent(payload, {("r1", i) for i in range(5)})
    assert hood.quality_pain(inc) == {}
    assert hood.quality_worst(inc) <= set(br.store.x)


# ---- config surface ----

def test_parse_new_options():
    c = parse_outer_lns({"neighborhoods": ["nightCleanup", "qualityWorst", "bogus"], "shrinkOnTimeout": True,
                         "skip": ["shiftWindow", "bogus"]})
    assert c.neighborhoods == ("nightCleanup", "qualityWorst") and c.shrink_on_timeout and c.skip == ("shiftWindow",)
    # Night search default ON since 2026-11-24: absent / garbage -> nightCleanup + qualityWorst, shrink on.
    d = parse_outer_lns({})
    assert d == OuterLnsConfig() and d.shrink_on_timeout and d.skip == ()
    assert d.neighborhoods == ("nightCleanup", "qualityWorst")
    assert parse_outer_lns({"neighborhoods": "nightCleanup"}).neighborhoods == ("nightCleanup", "qualityWorst")
    assert parse_outer_lns({"shrinkOnTimeout": "yes", "skip": "shiftWindow"}).skip == ()
    assert parse_outer_lns({"shrinkOnTimeout": "yes"}).shrink_on_timeout
    # Old behaviour per request: explicit empty list and literal false.
    off = parse_outer_lns({"neighborhoods": [], "shrinkOnTimeout": False})
    assert off.neighborhoods == () and not off.shrink_on_timeout
    assert parse_outer_lns({"neighborhoods": [], "eligibilityGroup": True}).neighborhoods == ("eligibilityGroup",)
    p = parse_payload(_raw(outerLns={"shrinkOnTimeout": True, "skip": ["window"]}))
    assert p.config.outer_lns.shrink_on_timeout and p.config.outer_lns.skip == ("window",)


def test_skip_drops_defaults_and_all_skipped_is_ignored():
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    cfg = lambda: _configure_solver(payload, allow_repair_hint=False)  # noqa: E731
    _b, rep = run_outer_lns(payload, br, s, _STAGE_NAMES, TIER_QUALITY, cfg, deadline=time.time() + 2, sub_solve_seconds=1, seed=7, skip=("shiftWindow",))
    assert set(rep["byNeighborhood"]) == {"window", "residents", "worstTerms"}
    _b, rep = run_outer_lns(payload, br, s, _STAGE_NAMES, TIER_QUALITY, cfg, deadline=time.time() + 2, sub_solve_seconds=1, seed=7, skip=NEIGHBORHOODS)
    assert set(rep["byNeighborhood"]) == set(NEIGHBORHOODS)


def test_skip_and_options_read_from_payload_config():
    payload = parse_payload(_raw(outerLns={"skip": ["shiftWindow", "worstTerms"], "neighborhoods": ["qualityWorst"]}))
    br, s = _bad_incumbent(payload)
    _b, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _configure_solver(payload, allow_repair_hint=False),
        deadline=time.time() + 2, sub_solve_seconds=1, seed=7, neighborhoods=payload.config.outer_lns.neighborhoods,
    )
    assert set(rep["byNeighborhood"]) == {"window", "residents", "qualityWorst"}


# ---- shrinkOnTimeout ----

class _FeasibleNoGain:
    """Stands in for a CpSolver whose sub-solve times out FEASIBLE with the incumbent (no strict gain)."""

    def __init__(self, incumbent):
        self.parameters = sat_parameters_pb2.SatParameters()
        self.response_proto = incumbent.response_proto
        self.value = incumbent.value

    def solve(self, _model):
        return 0

    def status_name(self, _status):
        return "FEASIBLE"


def _scales(shrink):
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    _b, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _FeasibleNoGain(s),
        deadline=time.time() + 1.0, sub_solve_seconds=1, seed=5, shrink_on_timeout=shrink,
    )
    assert rep["iterations"] > 4 and rep["accepted"] == 0
    return rep["scales"]


def test_shrink_on_timeout_only_when_enabled():
    assert set(_scales(False).values()) == {1.0}
    on = _scales(True)
    assert all(0.4 <= v < 1.0 for v in on.values())


# ---- options off == old behaviour; timing ----

class _ZeroSolution:
    def value(self, _v):
        return 0


def test_options_off_sequence_matches_pre_change_reference():
    # Reference captured on the pre-change code (seed 11, small_feasible, 16 picks, no accepts).
    expected = [("window", 45), ("residents", 45), ("shiftWindow", 15), ("worstTerms", 45), ("window", 45), ("window", 45),
                ("shiftWindow", 45), ("shiftWindow", 15), ("window", 45), ("shiftWindow", 15), ("shiftWindow", 45),
                ("residents", 45), ("worstTerms", 45), ("residents", 45), ("window", 45), ("residents", 45)]
    raw = load_fixture("small_feasible.json")
    raw["config"].update(maxTimeSeconds=4, numWorkers=1)
    payload = parse_payload(raw)
    br = build_model(payload)
    hood = _Neighborhoods(payload, br.store, br.objective, random.Random(11))
    stats = {n: {"tried": 0, "accepted": 0, "gain": 0, "seconds": 0.0} for n in NEIGHBORHOODS}
    got = []
    for it in range(16):
        n = _choose(stats, hood.rng, it)
        free = hood.pick(n, _ZeroSolution())
        stats[n]["tried"] += 1
        got.append((n, len(free)))
    assert got == expected


def test_default_report_has_timing_and_default_neighborhoods_only():
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    _b, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _configure_solver(payload, allow_repair_hint=False),
        deadline=time.time() + 3, sub_solve_seconds=1, seed=7,
    )
    t = rep["timing"]
    assert set(t) == {"fixSeconds", "solveSeconds", "otherSeconds"}
    assert all(v >= 0 for v in t.values()) and t["solveSeconds"] > 0
    assert abs(sum(t.values()) - rep["seconds"]) < 0.1
    assert set(rep["byNeighborhood"]) == set(NEIGHBORHOODS)
    assert all(set(v) == {"tried", "accepted", "gain", "seconds"} for v in rep["byNeighborhood"].values())
