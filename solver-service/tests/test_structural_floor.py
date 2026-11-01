"""report.structuralFloor: lower bound on the unavoidable part of fairness+shape."""

from __future__ import annotations

from solver.io.payload import parse_payload
from solver.report.structural import compute_structural_floor
from solver.solve import solve
from tests.helpers import make_payload, make_resident


def _shifts_two_areas():
    return {
        "D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
        "F": {"startH": 7, "durationH": 9, "type": "day", "area": "FLEX"},
    }


def test_target_excess_and_area_points():
    dates = ["2026-01-05", "2026-01-06"]
    raw = make_payload(
        residents=[
            make_resident("r1", isEmCore=True, target=4),
            make_resident("r2", isEmCore=True, target=2),
        ],
        shifts=_shifts_two_areas(),
        dates=dates,
        eligible={
            "r1": {d: ["D"] for d in dates},            # single area POD
            "r2": {d: ["D", "F"] for d in dates},       # two areas
        },
        coverage={
            "D": {d: {"min": 0, "max": 1} for d in dates},
            "F": {d: {"min": 0, "max": 1} for d in dates},
        },
    )
    floor = compute_structural_floor(parse_payload(raw))
    assert floor["supply"] == 4
    assert floor["demand"] == 6
    assert floor["targetExcess"] == 2
    assert floor["underTargetPoints"] == 4
    assert floor["singleAreaResidents"] == 1
    assert floor["areaSpreadUnits"] == 2   # target 4 - ceil(2)
    assert floor["areaSpreadPoints"] == 4
    assert floor["totalPoints"] == 8
    assert floor["approximate"] is True


def test_no_excess_no_points():
    dates = ["2026-01-05"]
    raw = make_payload(
        residents=[make_resident("r1", isEmCore=True, target=1)],
        shifts=_shifts_two_areas(),
        dates=dates,
        eligible={"r1": {dates[0]: ["D", "F"]}},
        coverage={"D": {dates[0]: {"min": 0, "max": 1}}, "F": {dates[0]: {"min": 0, "max": 1}}},
    )
    floor = compute_structural_floor(parse_payload(raw))
    assert floor["targetExcess"] == 0 and floor["totalPoints"] == 0


def test_solve_report_carries_floor():
    dates = ["2026-01-05"]
    raw = make_payload(
        residents=[make_resident("r1", isEmCore=True, target=1)],
        dates=dates,
        eligible={"r1": {dates[0]: ["D"]}},
        coverage={"D": {dates[0]: {"min": 0, "max": 1}}},
    )
    result = solve(parse_payload(raw))
    assert result.report["structuralFloor"]["supply"] == 1
