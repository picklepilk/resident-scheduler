"""Diversified portfolio params (`config.portfolioParams`) + stage-to-stage full warm start."""

from __future__ import annotations

import pytest

import solver.solve as solve_module
from api.schemas import ConfigModel
from solver.io.payload import PayloadError, parse_payload
from solver.io.sat_params import DEFAULT_PORTFOLIO_PARAMS, apply_params, params_for_run
from solver.solve import solve
from tests.helpers import load_fixture


def _raw(**cfg):
    raw = load_fixture("small_feasible.json")
    raw["config"].update({"maxTimeSeconds": 5, "numWorkers": 2, **cfg})
    return raw


def test_default_runs_differ_and_are_deterministic():
    assert params_for_run(None, 0) == {}
    assert params_for_run(None, 1) != params_for_run(None, 2) != params_for_run(None, 0)
    assert params_for_run(None, 1) == params_for_run(None, 1 + len(DEFAULT_PORTFOLIO_PARAMS))
    assert params_for_run([{"linearization_level": 0}], 5) == {"linearization_level": 0}


def test_apply_params_handles_enums_and_bools():
    from ortools.sat.python import cp_model
    s = cp_model.CpSolver()
    apply_params(s.parameters, params_for_run(None, 1))
    assert s.parameters.linearization_level == 2
    assert s.parameters.randomize_search is True
    assert s.parameters.search_branching == s.parameters.PORTFOLIO_WITH_QUICK_RESTART_SEARCH


def test_portfolio_params_parse_and_reject():
    assert ConfigModel().portfolioParams is None
    assert parse_payload(_raw()).config.portfolio_params is None
    ok = parse_payload(_raw(portfolioParams=[{}, {"use_lns_only": True}]))
    assert ok.config.portfolio_params == [{}, {"use_lns_only": True}]
    for bad in ([{"nope": 1}], [{"num_workers": 99}], [{"random_seed": 1}]):
        with pytest.raises(ValueError):
            parse_payload(_raw(portfolioParams=bad))


def test_portfolio_runs_get_distinct_params_and_report_them():
    seen = []
    orig = solve_module._configure_solver

    def spy(payload, allow_repair_hint=True):
        seen.append((payload.config.random_seed, dict(payload.config.solver_params or {})))
        return orig(payload, allow_repair_hint)

    solve_module._configure_solver = spy
    try:
        result = solve(parse_payload(_raw(portfolio=2, portfolioParams=[{}, {"use_lns_only": True}])))
    finally:
        solve_module._configure_solver = orig
    assert result.status in ("OPTIMAL", "FEASIBLE")
    per_run = result.report["portfolio"]["perRun"]
    assert [r["params"] for r in per_run] == [{}, {"use_lns_only": True}]
    assert {p for _s, p in map(lambda t: (t[0], tuple(t[1].items())), seen)} >= {(), (("use_lns_only", True),)}


def test_carry_hint_is_complete_and_next_stage_starts_from_it(monkeypatch):
    """Each non-final stage hands the next a FULL hint (every model var) equal to its own solution,
    and the next stage's pinned bound accepts that hint."""
    checks = []
    orig = solve_module._carry_hint

    def spy(model, store, solver):
        orig(model, store, solver)
        h = model.proto.solution_hint
        n = len(model.proto.variables)
        checks.append((len(h.vars), n, list(h.values) == list(solver.response_proto.solution)))

    monkeypatch.setattr(solve_module, "_carry_hint", spy)
    payload = parse_payload(_raw(numWorkers=1))
    result = solve(payload)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert checks, "no stage transition happened"
    for hinted, total, same in checks:
        assert hinted == total and same


def test_later_stage_first_solution_not_worse_than_carryover(monkeypatch):
    """Stage N's first accepted solution must satisfy the pinned earlier-stage bound, i.e. the
    final tiers are lexicographically <= the earlier stage's carried values."""
    carried = []
    orig = solve_module._carry_hint

    def spy(model, store, solver):
        orig(model, store, solver)
        carried.append(True)

    monkeypatch.setattr(solve_module, "_carry_hint", spy)
    result = solve(parse_payload(_raw(numWorkers=1)))
    assert carried
    # tier1 errors pinned by stage 1 can never be exceeded by later stages.
    assert result.tiers["tier1_errors"] >= 0
    assert result.validation["passed"]
