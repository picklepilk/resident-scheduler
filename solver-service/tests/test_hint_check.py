"""score mode adds report.hintCheck = {feasible, violations: [{rule, count}]} (no resident ids)."""

from __future__ import annotations

from solver.io.payload import parse_payload
from solver.solve import solve
from tests.helpers import load_fixture


def _raw(hint):
    raw = load_fixture("small_feasible.json")
    raw["config"].update({"mode": "score", "numWorkers": 1, "maxTimeSeconds": 10})
    raw["hint"] = hint
    return raw


def test_feasible_hint_has_no_violations():
    base = load_fixture("small_feasible.json")
    base["config"].update({"numWorkers": 1, "maxTimeSeconds": 5})
    normal = solve(parse_payload(base))
    hint = [{"residentId": r, "date": d, "shiftId": s} for r, days in normal.schedule.items() for d, s in days.items()]
    result = solve(parse_payload(_raw(hint)))
    assert result.report["hintCheck"] == {"feasible": True, "violations": []}


def test_broken_hint_lists_rule_with_count():
    dates = load_fixture("small_feasible.json")["block"]["dates"]
    hint = [{"residentId": r, "date": d, "shiftId": "D"} for r in ("r1", "r2") for d in dates]
    result = solve(parse_payload(_raw(hint)))
    check = result.report["hintCheck"]
    assert check["feasible"] is False
    by_rule = {v["rule"]: v["count"] for v in check["violations"]}
    assert by_rule["coverageMax"] == len(dates)
    assert all("residentIds" not in v for v in check["violations"])
