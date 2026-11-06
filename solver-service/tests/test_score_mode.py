"""config.mode == "score" (solver/score.py): price a fixed schedule, never search."""

from __future__ import annotations

from solver.io.payload import parse_payload
from solver.solve import solve
from tests.helpers import load_fixture


def _raw(hint):
    raw = load_fixture("small_feasible.json")
    raw["config"].update({"mode": "score", "numWorkers": 1, "maxTimeSeconds": 10})
    raw["hint"] = hint
    return raw


def _hint_from(schedule):
    return [{"residentId": r, "date": d, "shiftId": s} for r, days in schedule.items() for d, s in days.items()]


def test_score_matches_normal_solve_tiers():
    base = load_fixture("small_feasible.json")
    base["config"].update({"numWorkers": 1, "maxTimeSeconds": 5})
    normal = solve(parse_payload(base))
    scored = solve(parse_payload(_raw(_hint_from(normal.schedule))))
    assert scored.status == "SCORED"
    assert scored.mode == "strict"
    assert scored.schedule == normal.schedule
    assert scored.tiers == normal.tiers
    assert scored.report["score"]["feasible"] is True
    assert scored.report["score"]["missingCells"] == []


def test_score_illegal_hint_reports_conflicts():
    dates = load_fixture("small_feasible.json")["block"]["dates"]
    # eve -> next-day day shift breaks the hard circadian rule
    hint = [{"residentId": "r1", "date": dates[0], "shiftId": "E"},
            {"residentId": "r1", "date": dates[1], "shiftId": "D"}]
    result = solve(parse_payload(_raw(hint)))
    assert result.status == "INFEASIBLE"
    score = result.report["score"]
    assert score["feasible"] is False
    assert score["conflicts"] or score["missingCells"]


def test_score_unknown_cell_is_missing():
    dates = load_fixture("small_feasible.json")["block"]["dates"]
    result = solve(parse_payload(_raw([{"residentId": "ghost", "date": dates[0], "shiftId": "D"}])))
    assert result.status == "INFEASIBLE"
    assert result.report["score"]["missingCells"] == [{"residentId": "ghost", "date": dates[0], "shiftId": "D"}]
