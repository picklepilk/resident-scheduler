"""Seed portfolio (`config.portfolio`): K independent solves, best by tier ladder wins."""

from __future__ import annotations

import threading

import pytest

import solver.solve as solve_module
from api.schemas import ConfigModel
from solver.io.payload import parse_payload
from solver.solve import SolveResult, _PortfolioStopper, _result_rank_key, solve
from tests.helpers import load_fixture


def _raw(portfolio=None, workers=3, seconds=5):
    raw = load_fixture("small_feasible.json")
    raw["config"]["maxTimeSeconds"] = seconds
    raw["config"]["numWorkers"] = workers
    if portfolio is not None:
        raw["config"]["portfolio"] = portfolio
    return raw


def test_config_default_and_clamp():
    assert ConfigModel().portfolio == 1
    assert parse_payload(_raw()).config.portfolio == 1
    assert parse_payload(_raw(0)).config.portfolio == 1
    assert parse_payload(_raw(-4)).config.portfolio == 1
    assert parse_payload(_raw(99)).config.portfolio == 8
    assert parse_payload(_raw(3)).config.portfolio == 3


def test_portfolio_1_uses_single_path_and_adds_no_report_key(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("portfolio path must not run for portfolio=1")

    monkeypatch.setattr(solve_module, "_solve_portfolio", boom)
    result = solve(parse_payload(_raw(1, workers=1)))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert "portfolio" not in result.report
    assert result.seed == 42
    assert set(result.tiers) == {"tier1_errors", "tier2_blockingWarns", "tier3_qualityRank", "tier3b_restAfterCoverage", "tier4_quality"}


def test_portfolio_3_returns_valid_best_with_report():
    result = solve(parse_payload(_raw(3)))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.mode == "strict"
    assert result.validation["passed"]

    p = result.report["portfolio"]
    assert p["k"] == 3
    assert len(p["perRun"]) == 3
    assert [r["seed"] for r in p["perRun"]] == [42, 43, 44]
    for r in p["perRun"]:
        assert set(r) == {"seed", "status", "tiers", "wallSeconds"}
    # winner = lexicographic best of perRun, ties to the lowest index
    keys = [tuple(r["tiers"][n] for n in solve_module._STAGE_NAMES) for r in p["perRun"]]
    assert p["winnerIndex"] == keys.index(min(keys))
    assert result.seed == 42 + p["winnerIndex"]
    assert result.tiers == p["perRun"][p["winnerIndex"]]["tiers"]


def test_portfolio_batches_when_k_exceeds_workers():
    result = solve(parse_payload(_raw(3, workers=1)))  # 1 concurrent run, 3 batches
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert len(result.report["portfolio"]["perRun"]) == 3


def test_rank_key_orders_lexicographically_and_by_mode():
    def res(tiers=None, status="FEASIBLE", obj=0):
        return SolveResult(status, "strict", {}, obj, 0, 0, {}, {}, None, tiers)

    a = res({"tier1_errors": 0, "tier2_blockingWarns": 0, "tier3_qualityRank": 5, "tier4_quality": 900})
    b = res({"tier1_errors": 0, "tier2_blockingWarns": 0, "tier3_qualityRank": 6, "tier4_quality": 1})
    c = res({"tier1_errors": 1, "tier2_blockingWarns": 0, "tier3_qualityRank": 0, "tier4_quality": 0})
    relaxed = res(None, "RELAXED", 3)
    infeasible = res(None, "INFEASIBLE")
    ranked = sorted([infeasible, relaxed, c, b, a], key=_result_rank_key)
    assert ranked == [a, b, c, relaxed, infeasible]


def test_stopper_stop_search_reaches_every_run():
    class FakeSolver:
        def __init__(self):
            self.stopped = 0

        def stop_search(self):
            self.stopped += 1

    s1, s2 = FakeSolver(), FakeSolver()
    stopper = _PortfolioStopper()
    stopper.add_list([s1])
    stopper.add_list([FakeSolver(), s2])
    stopper.stop_search()
    assert stopper.stopped.is_set()
    assert s1.stopped == 1 and s2.stopped == 1


def test_failed_run_records_error_and_winner_still_chosen(monkeypatch):
    real = solve_module._solve_single

    def flaky(payload, cancel_event=None, on_progress=None):
        if payload.config.random_seed == 43:
            raise RuntimeError("boom build bug")
        return real(payload, cancel_event, on_progress)

    monkeypatch.setattr(solve_module, "_solve_single", flaky)
    result = solve(parse_payload(_raw(3)))
    per_run = result.report["portfolio"]["perRun"]
    assert per_run[1]["status"] == "ERROR"
    assert per_run[1]["tiers"] is None
    assert "boom build bug" in per_run[1]["error"]
    assert "error" not in per_run[0] and "error" not in per_run[2]
    assert result.report["portfolio"]["winnerIndex"] in (0, 2)
    assert result.status in ("OPTIMAL", "FEASIBLE")


def test_batching_splits_time_and_workers(monkeypatch):
    seen = []
    real = solve_module._solve_single

    def recorder(payload, cancel_event=None, on_progress=None):
        seen.append((payload.config.random_seed, payload.config.num_workers, payload.config.max_time_seconds))
        return real(payload, cancel_event, on_progress)

    monkeypatch.setattr(solve_module, "_solve_single", recorder)
    # 2 workers, K=5 -> concurrent 2, 3 batches, 1 worker each, budget 6s / 3 = 2s per run.
    monkeypatch.setattr(solve_module, "_num_workers", lambda payload: 2)
    solve(parse_payload(_raw(5, workers=2, seconds=6)))
    assert sorted(s[0] for s in seen) == [42, 43, 44, 45, 46]
    assert all(w == 1 for _s, w, _t in seen)
    assert all(t == pytest.approx(2.0) for _s, _w, t in seen)

    seen.clear()  # K <= workers: one batch, full budget
    monkeypatch.setattr(solve_module, "_num_workers", lambda payload: 4)
    solve(parse_payload(_raw(2, workers=4, seconds=6)))
    assert all(w == 2 and t == pytest.approx(6.0) for _s, w, t in seen)


def test_cancel_registry_receives_stopper_and_stop_is_honoured():
    """A stoppable caller's list gets the portfolio stopper; stopping before runs start
    makes the whole portfolio bail instead of solving."""
    solvers = solve_module.begin_stoppable_run()
    try:
        payload = parse_payload(_raw(3, workers=1, seconds=2))
        result = solve(payload)
        assert any(isinstance(s, _PortfolioStopper) for s in solvers)
        stopper = next(s for s in solvers if isinstance(s, _PortfolioStopper))
        assert result.report["portfolio"]["k"] == 3
        # Now cancel up front: a fresh portfolio with an already-set cancel_event runs nothing.
        ev = threading.Event()
        ev.set()
        with pytest.raises(RuntimeError, match="cancelled"):
            solve(payload, cancel_event=ev)
        assert not stopper.stopped.is_set()
    finally:
        solve_module.end_stoppable_run()
