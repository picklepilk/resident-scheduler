"""2026-10-30: optional hintStickiness penalty (solver/model/hint_stickiness.py)."""

from __future__ import annotations

import copy

from solver.io.payload import parse_payload
from solver.model.hint_stickiness import changed_cells
from solver.solve import solve
from tests.helpers import load_fixture


def _raw(weight=None):
    raw = load_fixture("small_feasible.json")
    # Legal but lopsided hint: r1 works D every day, nobody else works.
    raw["hint"] = [{"residentId": "r1", "date": d, "shiftId": "D"} for d in raw["block"]["dates"]]
    raw["config"] = dict(raw.get("config", {}), maxTimeSeconds=10, numWorkers=1, randomSeed=1)
    if weight is not None:
        raw["config"]["hintStickiness"] = weight
    return raw


def _solve(raw):
    payload = parse_payload(copy.deepcopy(raw))
    result = solve(payload)
    return payload, result


def test_config_parsing_default_and_explicit():
    assert parse_payload(_raw()).config.hint_stickiness is None
    assert parse_payload(_raw(7)).config.hint_stickiness == 7


def test_off_adds_no_report_key():
    _p, res = _solve(_raw())
    assert "hintStickiness" not in res.report
    _p, res0 = _solve(_raw(0))
    assert "hintStickiness" not in res0.report


def test_on_moves_fewer_cells_and_never_worsens_higher_tiers():
    p_off, off = _solve(_raw(0))
    p_on, on = _solve(_raw(10_000))
    n_off = changed_cells(p_off, off.schedule)
    n_on = changed_cells(p_on, on.schedule)
    assert n_off > 0, "fixture must have an unpenalized optimum that moves cells"
    assert n_on < n_off
    assert on.report["hintStickiness"]["weight"] == 10_000
    assert on.report["hintStickiness"]["changedCells"] == n_on
    for tier in ("errors", "blocking", "rank", "rest"):
        if tier in off.tiers and tier in on.tiers:
            assert on.tiers[tier] <= off.tiers[tier]
    assert on.validation["passed"] is True
