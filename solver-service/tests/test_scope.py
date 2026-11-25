"""Scoped polish (`config.scope`): cells outside the scope stay at the hint's value."""

from __future__ import annotations

import copy

from solver.build import build_model
from solver.io.payload import parse_payload
from solver.model.hint_pin import evaluate_hint
from solver.solve import _STAGE_NAMES, solve
from tests.helpers import load_fixture


def _raw(scope=None, outer=False, hint=True):
    raw = load_fixture("small_feasible.json")
    dates = raw["block"]["dates"]
    if hint:
        raw["hint"] = [{"residentId": "r1", "date": d, "shiftId": "D"} for d in dates[:3]]
        raw["hint"] += [{"residentId": "r2", "date": d, "shiftId": "D"} for d in dates[3:]]
    cfg = raw.setdefault("config", {})
    cfg.update({"numWorkers": 1, "maxTimeSeconds": 3, "randomSeed": 1})
    cfg["outerLns"] = {"enabled": True, "fraction": 0.5, "subSolveSeconds": 1} if outer else {"enabled": False}
    if scope is not None:
        cfg["scope"] = scope
    return raw


def _hint_grid(raw):
    return {(h["residentId"], h["date"]): h["shiftId"] for h in raw["hint"]}


def _grid(result):
    return {(r, d): s for r, days in result.schedule.items() for d, s in days.items()}


def _vec(tiers):
    return tuple(tiers[n] for n in _STAGE_NAMES)


def _run(raw):
    payload = parse_payload(raw)
    return payload, solve(payload)


def _assert_fixed(raw, result, is_fixed):
    hint = _hint_grid(raw)
    got = _grid(result)
    cells = {(r["id"], d) for r in raw["residents"] for d in raw["block"]["dates"]}
    checked = 0
    for key in cells:
        if is_fixed(*key):
            checked += 1
            assert got.get(key) == hint.get(key), key
    assert checked


def test_dates_scope_outside_equals_hint_and_not_worse():
    dates = _raw()["block"]["dates"]
    raw = _raw({"dates": [dates[1], dates[2]]})
    payload, result = _run(raw)
    ev = evaluate_hint(payload, build_model(payload))
    assert result.report["scope"]["applied"] is True
    _assert_fixed(raw, result, lambda r, d: not (dates[1] <= d <= dates[2]))
    assert _vec(result.tiers) <= _vec(ev.tiers)


def test_resident_ids_scope_other_rows_unchanged():
    raw = _raw({"residentIds": ["r3"]})
    _, result = _run(raw)
    assert result.report["scope"]["applied"] is True
    _assert_fixed(raw, result, lambda r, d: r != "r3")


def test_keep_cells_only_including_empty_hint_cell():
    dates = _raw()["block"]["dates"]
    keep = [["r1", dates[0]], ["r3", dates[1]]]  # r3 is empty in the hint
    raw = _raw({"keepCells": keep})
    _, result = _run(raw)
    assert result.report["scope"]["applied"] is True
    assert result.report["scope"]["keepCells"] == 2
    _assert_fixed(raw, result, lambda r, d: [r, d] in keep)
    assert ("r3", dates[1]) not in _grid(result)


def test_combination():
    dates = _raw()["block"]["dates"]
    keep = [["r3", dates[2]]]
    raw = _raw({"dates": [dates[1], dates[3]], "residentIds": ["r2", "r3"], "keepCells": keep})
    _, result = _run(raw)
    rep = result.report["scope"]
    assert rep["applied"] is True and rep["dates"] == [dates[1], dates[3]]

    def fixed(r, d):
        return not (dates[1] <= d <= dates[3] and r in ("r2", "r3") and [r, d] not in keep)

    _assert_fixed(raw, result, fixed)


def test_no_hint_ignored():
    dates = _raw()["block"]["dates"]
    _, result = _run(_raw({"dates": [dates[0], dates[1]]}, hint=False))
    assert result.report["scope"]["applied"] is False
    assert result.report["scope"]["ignored"] == "no hint"
    assert result.status in ("OPTIMAL", "FEASIBLE")


def test_infeasible_hint_ignored_and_solve_still_returns():
    dates = _raw()["block"]["dates"]
    raw = _raw({"dates": [dates[0], dates[1]]})
    # one resident on D and E the same day: breaks a hard rule
    raw["hint"] = [{"residentId": "r1", "date": d, "shiftId": s} for d in dates for s in ("D", "E", "N")]
    payload, result = _run(raw)
    assert evaluate_hint(payload, build_model(payload)).feasible is False
    assert result.report["scope"]["applied"] is False
    assert result.report["scope"]["ignored"] == "hint infeasible"
    assert result.status in ("OPTIMAL", "FEASIBLE", "RELAXED", "INFEASIBLE")


def test_report_counts_and_absence():
    dates = _raw()["block"]["dates"]
    raw = _raw({"dates": [dates[0], dates[1]]})
    payload, result = _run(raw)
    n_x = len(build_model(payload).store.x)
    rep = result.report["scope"]
    assert rep["freeCells"] + rep["fixedCells"] == n_x
    assert rep["fixedCells"] > 0 and rep["freeCells"] > 0
    _, plain = _run(_raw())
    assert "scope" not in plain.report
    _, plain2 = _run(copy.deepcopy(_raw()))
    assert "scope" not in plain2.report


def test_outer_lns_keeps_out_of_scope_cells_fixed():
    dates = _raw()["block"]["dates"]
    raw = _raw({"dates": [dates[1], dates[2]]}, outer=True)
    _, result = _run(raw)
    assert result.report["scope"]["applied"] is True
    _assert_fixed(raw, result, lambda r, d: not (dates[1] <= d <= dates[2]))
