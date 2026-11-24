"""report.timing (2026-11-23): always present on pass-1 results."""

from __future__ import annotations

from solver.io.payload import parse_payload
from solver.solve import _STAGE_NAMES, solve
from tests.helpers import load_fixture


def _raw(hint=True):
    raw = load_fixture("small_feasible.json")
    if hint:
        raw["hint"] = [{"residentId": "r1", "date": d, "shiftId": "D"} for d in raw["block"]["dates"][:3]]
    raw["config"].update({"numWorkers": 1, "maxTimeSeconds": 4, "randomSeed": 1, "outerLns": {"enabled": False}})
    return raw


def _check_shape(t):
    assert set(t) == {"buildSeconds", "hintEvalSeconds", "presolveSeconds", "stages", "lnsSeconds"}
    assert t["buildSeconds"] >= 0 and t["hintEvalSeconds"] >= 0 and t["lnsSeconds"] >= 0
    assert t["presolveSeconds"] is None
    assert [s["name"] for s in t["stages"]] == list(_STAGE_NAMES)
    for s in t["stages"]:
        assert set(s) == {"name", "wallSeconds", "firstIncumbentSeconds", "skipped"}
        assert s["wallSeconds"] >= 0
        assert s["skipped"] in (None, "empty", "hintZero")
        assert s["firstIncumbentSeconds"] is None or s["firstIncumbentSeconds"] >= 0


def test_timing_shape_with_and_without_hint():
    for hint in (True, False):
        res = solve(parse_payload(_raw(hint)))
        _check_shape(res.report["timing"])


def test_first_incumbent_recorded_with_progress_sink():
    res = solve(parse_payload(_raw(False)), on_progress=lambda p: None)
    solved = [s for s in res.report["timing"]["stages"] if s["skipped"] is None]
    assert solved and all(s["firstIncumbentSeconds"] is not None for s in solved)


def test_outer_lns_time_reported():
    raw = _raw(False)
    raw["config"]["outerLns"] = {"enabled": True, "fraction": 0.5, "subSolveSeconds": 1}
    res = solve(parse_payload(raw))
    assert "outerLns" in res.report and res.report["timing"]["lnsSeconds"] >= 0
