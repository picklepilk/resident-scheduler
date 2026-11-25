"""Outer LNS chooser (gainRate) and growOnSuccess (2026-11-24). Synthetic data only."""

from __future__ import annotations

import collections
import random
import time

from ortools.sat import sat_parameters_pb2

from solver.lns_outer import _choose, run_outer_lns
from solver.io.payload import parse_payload
from solver.model.objective import TIER_QUALITY
from solver.solve import _STAGE_NAMES, _configure_solver
from tests.test_outer_lns import _bad_incumbent, _raw


def _old_choose(stats, rng, iteration):
    """Verbatim copy of the pre-chooser `_choose`."""
    names = tuple(stats)
    if iteration < len(names):
        return names[iteration]
    weights = [max(0.1, (stats[n]["accepted"] + 1) / (stats[n]["tried"] + 2)) for n in names]
    return rng.choices(names, weights=weights, k=1)[0]


def _stats(**kw):
    return {n: {"tried": t, "accepted": a, "gain": 0, "seconds": 0.0} for n, (t, a) in kw.items()}


def _hist(**kw):
    return {n: collections.deque(v, maxlen=8) for n, v in kw.items()}


def test_gain_rate_prefers_high_rate_but_keeps_floor():
    stats = _stats(window=(10, 9), residents=(10, 7), worstTerms=(10, 7))
    hist = _hist(window=[(100, 1.0, True)] * 8, residents=[(10, 1.0, True)] * 8, worstTerms=[(0, 1.0, False)] * 8)
    rng = random.Random(1)
    picks = collections.Counter(_choose(stats, rng, 99, "gainRate", hist) for _ in range(2000))
    assert picks["window"] > picks["residents"] > 0
    assert picks["window"] > 0.7 * 2000
    assert picks["worstTerms"] >= 0.03 * 2000  # floor = 0.1 * max rate, about 9% here


def test_gain_rate_all_zero_falls_back_to_success_weighting():
    stats = _stats(a=(10, 9), b=(10, 1))
    hist = _hist(a=[(0, 1.0, False)] * 8, b=[(0, 1.0, False)])
    r1, r2 = random.Random(5), random.Random(5)
    got = [_choose(stats, r1, 99, "gainRate", hist) for _ in range(200)]
    assert got == [_old_choose(stats, r2, 99) for _ in range(200)]


def test_gain_rate_still_round_robins_first():
    stats = _stats(a=(0, 0), b=(0, 0), c=(0, 0))
    assert [_choose(stats, random.Random(1), i, "gainRate", {}) for i in range(3)] == ["a", "b", "c"]


def test_default_chooser_identical_to_old_sequence():
    names = ("window", "residents", "worstTerms", "nightCleanup")
    stats = _stats(**{n: (0, 0) for n in names})
    new_rng, old_rng = random.Random(42), random.Random(42)
    sim = random.Random(7)
    for it in range(300):
        a = _choose(stats, new_rng, it)
        b = _old_choose(stats, old_rng, it)
        assert a == b
        stats[a]["tried"] += 1
        if sim.random() < 0.5:
            stats[a]["accepted"] += 1
    assert new_rng.random() == old_rng.random()


def _run(seconds=4, **kw):
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    before = {n: round(s.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES}
    best, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _configure_solver(payload, allow_repair_hint=False),
        deadline=time.time() + seconds, sub_solve_seconds=1, seed=7, **kw,
    )
    after = {n: round(best.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES}
    for n in _STAGE_NAMES:
        assert after[n] <= before[n], n
    return rep


def test_gain_rate_end_to_end():
    rep = _run(chooser="gainRate")
    assert rep["chooser"] == "gainRate"
    assert rep["accepted"] >= 1


class _AlwaysImproves:
    """Fake CpSolver: every sub-solve returns FEASIBLE with a quality one point better than the last one."""

    counter = 0

    def __init__(self, incumbent, qexpr, base):
        self.parameters = sat_parameters_pb2.SatParameters()
        self.response_proto = incumbent.response_proto
        self._inc, self._qexpr, self._base, self.q = incumbent, qexpr, base, base

    def solve(self, _model):
        type(self).counter += 1
        self.q = self._base - type(self).counter
        return 0

    def status_name(self, _status):
        return "FEASIBLE"

    def value(self, expr):
        return self.q if expr is self._qexpr else self._inc.value(expr)


def _always_improving(grow):
    _AlwaysImproves.counter = 0
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    qexpr = br.objective.stage_exprs[TIER_QUALITY]
    base = round(s.value(qexpr))
    _b, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _AlwaysImproves(s, qexpr, base),
        deadline=time.time() + 1.0, sub_solve_seconds=1, seed=5, grow_on_success=grow,
    )
    assert rep["accepted"] >= 8 and rep["accepted"] <= base
    return rep


def test_grow_on_success_grows_scale_only_when_enabled():
    on, off = _always_improving(True), _always_improving(False)
    assert on["growOnSuccess"] is True and "growOnSuccess" not in off
    assert max(on["scales"].values()) > 1.0
    assert set(off["scales"].values()) == {1.0}  # accepts alone never change scale today
    assert all(v <= 2.5 for v in on["scales"].values())


def test_chooser_default_reports_nothing_and_grow_end_to_end_never_worsens():
    rep = _run(grow_on_success=True)
    assert rep["growOnSuccess"] is True
    assert "chooser" not in _run()
