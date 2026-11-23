"""Hint floor (2026-11-23): Optimize from a good grid must never return a result lexicographically
worse than the hint. See docs/PAYLOAD_SCHEMA.md "Hint floor (2026-11-23)"."""

from __future__ import annotations

import solver.solve as solve_module
from solver.build import build_model
from solver.io.payload import parse_payload
from solver.model.hint_pin import evaluate_hint
from solver.solve import _STAGE_NAMES, _hint_beats, solve
from tests.helpers import load_fixture


def _raw(with_hint=True):
    raw = load_fixture("small_feasible.json")
    dates = raw["block"]["dates"]
    if with_hint:
        raw["hint"] = [{"residentId": "r1", "date": d, "shiftId": "D"} for d in dates[:3]]
        raw["hint"] += [{"residentId": "r2", "date": d, "shiftId": "D"} for d in dates[3:]]
    raw.setdefault("config", {}).update({"numWorkers": 1, "maxTimeSeconds": 3, "randomSeed": 1})
    raw["config"]["outerLns"] = {"enabled": False}
    return raw


def _vec(tiers):
    return tuple(tiers[n] for n in _STAGE_NAMES)


def _grid(raw):
    return {(h["residentId"], h["date"]): h["shiftId"] for h in raw["hint"]}


def _result_grid(result):
    return {(r, d): s for r, days in result.schedule.items() for d, s in days.items()}


def test_hint_eval_exposes_tier_values():
    payload = parse_payload(_raw())
    ev = evaluate_hint(payload, build_model(payload))
    assert ev.feasible
    assert set(ev.tiers) == set(_STAGE_NAMES)


def test_hint_beats_is_lexicographic():
    a = {n: 0 for n in _STAGE_NAMES}
    b = dict(a)
    b[_STAGE_NAMES[-1]] = 5
    assert _hint_beats(a, b)
    assert not _hint_beats(b, a)
    assert not _hint_beats(a, dict(a))
    c = dict(a)
    c[_STAGE_NAMES[0]] = 1
    c[_STAGE_NAMES[-1]] = -9
    assert _hint_beats(a, c)


def test_result_never_worse_than_feasible_hint():
    payload = parse_payload(_raw())
    ev = evaluate_hint(payload, build_model(payload))
    result = solve(payload)
    assert _vec(result.tiers) <= _vec(ev.tiers)
    assert result.report["hintKept"] in (True, False)


def test_hint_carried_while_it_stays_optimal(monkeypatch):
    calls = []
    orig = solve_module._carry_hint_eval

    def spy(model, ev):
        calls.append(1)
        return orig(model, ev)

    monkeypatch.setattr(solve_module, "_carry_hint_eval", spy)
    result = solve(parse_payload(_raw()))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    # hint is already zero on every pinned tier of this tiny fixture, so at least one stage carries it
    assert calls


def test_hint_kept_path_returns_hint_grid(monkeypatch):
    raw = _raw()
    real = solve_module.evaluate_hint

    def better_than_anything(payload, build_result, cap=None):
        ev = real(payload, build_result, cap)
        ev.tiers = {n: -1000 for n in _STAGE_NAMES}  # pretend hint beats whatever the search finds
        return ev

    monkeypatch.setattr(solve_module, "evaluate_hint", better_than_anything)
    result = solve(parse_payload(raw))
    assert result.report["hintKept"] is True
    assert _result_grid(result) == _grid(raw)


def test_no_hint_unchanged():
    raw = _raw(with_hint=False)
    r1 = solve(parse_payload(raw))
    r2 = solve(parse_payload(raw))
    assert "hintKept" not in r1.report
    assert r1.report["hintPinning"]["hintFeasible"] is None
    assert _vec(r1.tiers) == _vec(r2.tiers)


def test_infeasible_hint_unchanged():
    raw = _raw()
    # both residents on D every date (max 1): infeasible hint
    raw["hint"] = [{"residentId": r, "date": d, "shiftId": "D"} for r in ("r1", "r2") for d in raw["block"]["dates"]]
    result = solve(parse_payload(raw))
    assert result.report["hintPinning"]["hintFeasible"] is False
    assert "hintKept" not in result.report
    assert result.status in ("OPTIMAL", "FEASIBLE")
