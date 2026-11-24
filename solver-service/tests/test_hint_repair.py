"""config.hintRepair (2026-11-23): an infeasible hint is repaired with few changes, then treated like a
feasible hint (pins, floor). Default off == unchanged. Locked cells survive."""

from __future__ import annotations

import solver.solve as solve_module
from solver.build import build_model
from solver.io.payload import parse_payload
from solver.model.hint_pin import evaluate_hint, hint_violations
from solver.solve import solve
from tests.helpers import load_fixture


def _raw(repair=True, **extra):
    raw = load_fixture("small_feasible.json")
    dates = raw["block"]["dates"]
    # r1 and r2 both on D every date: coverage max 1 is broken on every date
    raw["hint"] = [{"residentId": r, "date": d, "shiftId": "D"} for r in ("r1", "r2") for d in dates]
    raw["config"].update({"numWorkers": 1, "maxTimeSeconds": 10, "randomSeed": 1, "outerLns": {"enabled": False}})
    if repair:
        raw["config"]["hintRepair"] = {"enabled": True, "seconds": 3}
    raw.update(extra)
    return raw


def test_hint_is_infeasible_and_violations_named():
    p = parse_payload(_raw())
    assert not evaluate_hint(p, build_model(p)).feasible
    rules, residents = hint_violations(p)
    assert "coverageMax" in rules and residents >= {"r1", "r2"}


def test_repaired_then_pinned_and_floored():
    result = solve(parse_payload(_raw()))
    rep = result.report["hintRepair"]
    assert rep["attempted"] and rep["repaired"]
    assert 0 < rep["changedCells"] <= 10
    assert "coverageMax" in rep["violatedRules"]
    assert rep["scope"] in ("residents", "all")
    assert rep["seconds"] <= 3.5
    # treated as a feasible hint from now on: pins applied, hint floor ran
    assert result.report["hintPinning"]["applied"] is True
    assert result.report["hintPinning"]["hintFeasible"] is False  # the ORIGINAL hint
    assert "hintKept" in result.report
    assert result.status in ("OPTIMAL", "FEASIBLE") and result.mode == "strict"


def test_repair_off_is_unchanged():
    result = solve(parse_payload(_raw(repair=False)))
    assert "hintRepair" not in result.report
    assert result.report["hintPinning"]["applied"] is False
    assert "hintKept" not in result.report


def test_repair_not_attempted_for_feasible_hint():
    raw = _raw()
    raw["hint"] = [{"residentId": "r1", "date": d, "shiftId": "D"} for d in raw["block"]["dates"][:3]]
    result = solve(parse_payload(raw))
    assert result.report["hintRepair"]["attempted"] is False
    assert result.report["hintPinning"]["hintFeasible"] is True


def test_pins_applied_with_repaired_components(monkeypatch):
    calls = []
    orig = solve_module.apply_hint_pins
    monkeypatch.setattr(solve_module, "apply_hint_pins", lambda m, p, o, ev: (calls.append(ev.feasible), orig(m, p, o, ev))[1])
    solve(parse_payload(_raw()))
    assert calls == [True]


def test_locked_cells_survive_repair():
    d0 = load_fixture("small_feasible.json")["block"]["dates"][0]
    raw = _raw(locked=[{"residentId": "r2", "date": d0, "shiftId": "E"}])
    result = solve(parse_payload(raw))
    assert result.report["hintRepair"]["repaired"]
    assert result.schedule["r2"][d0] == "E"


def test_repair_time_capped_by_fraction_of_budget():
    raw = _raw()
    raw["config"]["hintRepair"] = {"enabled": True, "seconds": 500}
    raw["config"]["maxTimeSeconds"] = 5
    result = solve(parse_payload(raw))
    assert result.report["hintRepair"]["seconds"] <= 0.2 * 5 + 0.5


def test_config_parsing_defaults_and_garbage():
    p = parse_payload(load_fixture("small_feasible.json"))
    assert p.config.hint_repair.enabled is False and p.config.hint_repair.seconds == 20.0
    raw = load_fixture("small_feasible.json")
    raw["config"]["hintRepair"] = {"enabled": "yes", "seconds": -4}
    c = parse_payload(raw).config.hint_repair
    assert c.enabled is False and c.seconds == 20.0
