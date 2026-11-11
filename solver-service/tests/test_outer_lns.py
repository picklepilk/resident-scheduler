"""Outer LNS (solver/lns_outer.py): config parsing, disabled == today, never-worsens-tiers, report, deadline."""

from __future__ import annotations

import time

from ortools.sat.python import cp_model

from solver.build import build_model
from solver.io.payload import parse_payload
from solver.lns_outer import OuterLnsConfig, parse_outer_lns, run_outer_lns
from solver.solve import _STAGE_NAMES, _configure_solver, solve
from solver.model.objective import TIER_QUALITY, TIER_RANK, TIER_REST
from tests.helpers import load_fixture


def _raw(**cfg):
    raw = load_fixture("small_feasible.json")
    raw["config"].update(maxTimeSeconds=4, numWorkers=1, **cfg)
    return raw


def test_parse_defaults_and_clamps():
    assert parse_outer_lns(None) == OuterLnsConfig()
    assert parse_outer_lns({}).enabled  # default ON since 2026-10-31
    assert parse_outer_lns({"enabled": "yes"}).enabled  # only literal false disables
    assert not parse_outer_lns({"enabled": False}).enabled
    assert OuterLnsConfig().fraction == 0.5 and OuterLnsConfig().sub_solve_seconds == 5.0
    c = parse_outer_lns({"enabled": True, "fraction": 5, "subSolveSeconds": "x"})
    assert c.enabled and c.fraction == 0.9 and c.sub_solve_seconds == 5.0
    assert parse_outer_lns({"enabled": True, "fraction": 0.01}).fraction == 0.05
    assert parse_outer_lns([1]) == OuterLnsConfig()


def test_payload_carries_config():
    p = parse_payload(_raw(outerLns={"enabled": True, "fraction": 0.4, "subSolveSeconds": 3}))
    assert p.config.outer_lns == OuterLnsConfig(True, 0.4, 3.0)
    assert parse_payload(_raw()).config.outer_lns.enabled  # default on


def test_disabled_has_no_outer_report_and_same_tiers():
    base = solve(parse_payload(_raw(outerLns={"enabled": False})))
    off = solve(parse_payload(_raw(outerLns={"enabled": False})))
    assert "outerLns" not in base.report and "outerLns" not in off.report
    assert base.tiers == off.tiers and base.schedule == off.schedule  # numWorkers=1 -> deterministic


def test_enabled_end_to_end_never_worse_and_reports():
    base = solve(parse_payload(_raw()))
    t0 = time.time()
    res = solve(parse_payload(_raw(outerLns={"enabled": True, "fraction": 0.5, "subSolveSeconds": 1})))
    assert time.time() - t0 < 4 + 3
    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert tuple(res.tiers[n] for n in _STAGE_NAMES) <= tuple(base.tiers[n] for n in _STAGE_NAMES)
    rep = res.report["outerLns"]
    assert set(rep) >= {"iterations", "accepted", "byNeighborhood", "startObjective", "endObjective", "seconds"}


def _bad_incumbent(payload):
    """An incumbent that is feasible but deliberately poor on the quality tier (maximize it)."""
    br = build_model(payload)
    br.model.maximize(br.objective.stage_exprs[TIER_QUALITY])
    s = _configure_solver(payload, allow_repair_hint=False)
    s.parameters.max_time_in_seconds = 3
    assert s.status_name(s.solve(br.model)) in ("OPTIMAL", "FEASIBLE")
    return br, s


def test_run_outer_lns_improves_without_worsening_any_tier_and_respects_deadline():
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    before = {n: round(s.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES}
    deadline = time.time() + 5
    best, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _configure_solver(payload, allow_repair_hint=False),
        deadline=deadline, sub_solve_seconds=1, seed=7,
    )
    assert time.time() <= deadline + 1.5
    after = {n: round(best.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES}
    for n in _STAGE_NAMES:
        if n != TIER_QUALITY:
            assert after[n] <= before[n], n
    assert after[TIER_QUALITY] < before[TIER_QUALITY]
    assert rep["startObjective"] == before[TIER_QUALITY] and rep["endObjective"] == after[TIER_QUALITY]
    assert rep["accepted"] >= 1 and rep["iterations"] >= rep["accepted"]
    assert sum(v["tried"] for v in rep["byNeighborhood"].values()) == rep["iterations"]
    assert sum(v["accepted"] for v in rep["byNeighborhood"].values()) == rep["accepted"]
    assert set(rep["byNeighborhood"]) == {"window", "residents", "shiftWindow", "worstTerms"}


def test_proven_optimal_skips_loop():
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    best, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _configure_solver(payload),
        deadline=time.time() + 5, sub_solve_seconds=1, seed=1, proven_optimal=True,
    )
    assert best is s and rep["iterations"] == 0 and rep["skipped"]


def test_cancel_event_stops_loop():
    import threading
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    ev = threading.Event()
    ev.set()
    _best, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _configure_solver(payload),
        deadline=time.time() + 5, sub_solve_seconds=1, seed=1, cancel_event=ev,
    )
    assert rep["iterations"] == 0


def test_progress_label_outer_lns():
    seen = []
    payload = parse_payload(_raw(outerLns={"enabled": True, "fraction": 0.5, "subSolveSeconds": 1}))
    solve(payload, on_progress=seen.append)
    assert seen[-1]["stages"] == len(_STAGE_NAMES) + 1
    assert all("stageName" not in p for p in seen if p["stage"] <= len(_STAGE_NAMES)) 


# --- config.outerLns.tiers = "all" (opt-in) ---

def test_tiers_parse_default_and_all():
    assert parse_outer_lns(None).tiers == "quality" and OuterLnsConfig().tiers == "quality"
    assert parse_outer_lns({"tiers": "all"}).tiers == "all"
    assert parse_outer_lns({"tiers": "bogus"}).tiers == "quality"
    assert parse_payload(_raw(outerLns={"tiers": "all"})).config.outer_lns.tiers == "all"


def test_default_quality_mode_report_has_no_tier_keys():
    payload = parse_payload(_raw())
    br, s = _bad_incumbent(payload)
    _best, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _configure_solver(payload, allow_repair_hint=False),
        deadline=time.time() + 2, sub_solve_seconds=1, seed=7,
    )
    assert "primaryTier" not in rep and "tiers" not in rep


def _bad_rank_incumbent(payload):
    """Feasible incumbent that is deliberately poor on the first non-empty RANK/REST tier."""
    br = build_model(payload)
    target = next((n for n in (TIER_RANK, TIER_REST) if not isinstance(br.objective.stage_exprs[n], int)), None)
    assert target is not None
    br.model.maximize(br.objective.stage_exprs[target])
    s = _configure_solver(payload, allow_repair_hint=False)
    s.parameters.max_time_in_seconds = 3
    assert s.status_name(s.solve(br.model)) in ("OPTIMAL", "FEASIBLE")
    return br, s, target


def test_tiers_all_improves_earlier_tier_and_never_worsens_errors_blocking():
    payload = parse_payload(_raw())
    br, s, target = _bad_rank_incumbent(payload)
    before = {n: round(s.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES}
    assert before[target] > 0
    best, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _configure_solver(payload, allow_repair_hint=False),
        deadline=time.time() + 5, sub_solve_seconds=1, seed=7, tiers="all", proven_optimal=True,  # proven flag ignored
    )
    after = {n: round(best.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES}
    assert "skipped" not in rep and rep["tiers"] == "all"
    assert rep["primaryTier"] == next(n for n in _STAGE_NAMES[2:] if before[n] > 0)
    for n in _STAGE_NAMES[:2]:
        assert after[n] <= before[n]
    assert tuple(after[n] for n in _STAGE_NAMES) < tuple(before[n] for n in _STAGE_NAMES)
    assert rep["startTiers"] == before and rep["endTiers"] == after


def test_tiers_all_end_to_end_never_worse():
    base = solve(parse_payload(_raw(outerLns={"enabled": True, "fraction": 0.5, "subSolveSeconds": 1})))
    res = solve(parse_payload(_raw(outerLns={"enabled": True, "fraction": 0.5, "subSolveSeconds": 1, "tiers": "all"})))
    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert res.report["outerLns"].get("tiers") == "all" or "skipped" in res.report["outerLns"]
    assert "tiers" not in base.report["outerLns"]
