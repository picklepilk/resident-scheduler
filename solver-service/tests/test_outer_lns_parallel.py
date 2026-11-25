"""Outer LNS opt-ins (2026-11-23): subWorkers, parallel, per-neighborhood gain/seconds, runlog byNeighborhood."""

from __future__ import annotations

import time

from solver.io.payload import parse_payload
from solver.lns_outer import OuterLnsConfig, parse_outer_lns, run_outer_lns
from solver.model.objective import TIER_QUALITY
from solver.solve import _STAGE_NAMES, _configure_solver, solve
from tests.test_outer_lns import _bad_incumbent, _raw


def _cfg(payload):
    return lambda: _configure_solver(payload, allow_repair_hint=False)


def test_parse_sub_workers_and_parallel():
    d = OuterLnsConfig()
    assert d.sub_workers == 0 and d.parallel == 1
    c = parse_outer_lns({"subWorkers": 4, "parallel": 3})
    assert c.sub_workers == 4 and c.parallel == 3
    assert parse_outer_lns({"parallel": 99}).parallel == 8
    assert parse_outer_lns({"parallel": 0}).parallel == 1
    assert parse_outer_lns({"parallel": "x", "subWorkers": -5}) == OuterLnsConfig()
    assert parse_outer_lns({"subWorkers": True, "parallel": True}) == OuterLnsConfig()
    assert parse_outer_lns({"subWorkers": 2.7}).sub_workers == 2
    p = parse_payload(_raw(outerLns={"subWorkers": 2, "parallel": 2}))
    assert p.config.outer_lns.sub_workers == 2 and p.config.outer_lns.parallel == 2


def test_default_path_report_shape_and_per_hood_stats():
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    _best, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, _cfg(payload),
        deadline=time.time() + 4, sub_solve_seconds=1, seed=7,
    )
    assert "parallel" not in rep and "subWorkers" not in rep
    for v in rep["byNeighborhood"].values():
        assert set(v) == {"tried", "accepted", "gain", "seconds"}
    assert sum(v["gain"] for v in rep["byNeighborhood"].values()) == rep["startObjective"] - rep["endObjective"]


def test_sub_workers_applied_and_clamped():
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    seen = []

    def cfg():
        slv = _configure_solver(payload, allow_repair_hint=False)
        slv.parameters.num_workers = 4  # pretend the main solve uses 4
        orig = slv.solve

        def spy(model, *a, **k):
            seen.append(slv.parameters.num_workers)
            return orig(model, *a, **k)

        slv.solve = spy
        return slv

    run_outer_lns(payload, br, s, _STAGE_NAMES, TIER_QUALITY, cfg,
                  deadline=time.time() + 3, sub_solve_seconds=1, seed=3, sub_workers=2)
    assert seen and set(seen) == {2}
    seen.clear()
    run_outer_lns(payload, br, s, _STAGE_NAMES, TIER_QUALITY, cfg,
                  deadline=time.time() + 2, sub_solve_seconds=1, seed=3, sub_workers=99)
    assert seen and set(seen) == {4}  # clamped to the main worker count


def test_parallel_never_worsens_any_tier_and_reports():
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    before = tuple(round(s.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES)
    best, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, _cfg(payload),
        deadline=time.time() + 6, sub_solve_seconds=1, seed=11, parallel=3,
    )
    after = tuple(round(best.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES)
    assert after <= before and after[-1] < before[-1]
    for i, n in enumerate(_STAGE_NAMES):
        if n != TIER_QUALITY:
            assert after[i] <= before[i], n
    assert rep["parallel"] == 3 and "mergedBatches" in rep
    assert rep["endObjective"] == after[-1]
    assert sum(v["tried"] for v in rep["byNeighborhood"].values()) == rep["iterations"]
    assert sum(v["accepted"] for v in rep["byNeighborhood"].values()) == rep["accepted"]


def test_parallel_end_to_end_via_solve():
    base = solve(parse_payload(_raw()))
    res = solve(parse_payload(_raw(outerLns={"enabled": True, "fraction": 0.5, "subSolveSeconds": 1,
                                             "parallel": 2, "subWorkers": 1})))
    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert tuple(res.tiers[n] for n in _STAGE_NAMES) <= tuple(base.tiers[n] for n in _STAGE_NAMES)


def test_runlog_keeps_by_neighborhood():
    from api.runlog import _outer_lns
    out = _outer_lns({"iterations": 3, "byNeighborhood": {"window": {"tried": 2, "accepted": 1, "gain": 5, "seconds": 1.5}}})
    assert out["iterations"] == 3 and out["byNeighborhood"]["window"]["gain"] == 5
    assert _outer_lns(None) is None


def test_eligibility_group_opt_in_parse_and_stats():
    night = ("nightCleanup", "qualityWorst")  # default extras since 2026-11-24 (night search on)
    assert parse_outer_lns({}).neighborhoods == night
    assert parse_outer_lns({"neighborhoods": ["eligibilityGroup", "bogus"]}).neighborhoods == ("eligibilityGroup",)
    assert parse_outer_lns({"eligibilityGroup": True}).neighborhoods == night + ("eligibilityGroup",)
    assert parse_outer_lns({"neighborhoods": [], "eligibilityGroup": True}).neighborhoods == ("eligibilityGroup",)
    assert parse_outer_lns({"neighborhoods": "x", "eligibilityGroup": 1}).neighborhoods == night
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    _best, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, _cfg(payload),
        deadline=time.time() + 6, sub_solve_seconds=1, seed=5, neighborhoods=("eligibilityGroup",),
    )
    assert rep["byNeighborhood"]["eligibilityGroup"]["tried"] >= 1
    assert sum(v["tried"] for v in rep["byNeighborhood"].values()) == rep["iterations"]


def test_eligibility_group_frees_only_available_residents_in_block():
    import random
    from solver.build import build_model
    from solver.lns_outer import _Neighborhoods
    payload = parse_payload(_raw())
    br = build_model(payload)
    hood = _Neighborhoods(payload, br.store, br.objective, random.Random(1))
    for _ in range(10):
        free = hood.eligibility_group(None)
        assert free and free <= set(br.store.x)
        assert all(k[2] in hood.date_index for k in free)
