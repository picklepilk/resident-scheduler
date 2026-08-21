from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.circadian import add_circadian_constraints
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

_SHIFTS = {
    "D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "E": {"startH": 15, "durationH": 8, "type": "eve", "area": "POD"},
    "N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"},
}


def _build(dates, eligible, coverage, residents=None):
    raw = make_payload(
        residents=residents or [make_resident("r1")], shifts=_SHIFTS, dates=dates,
        eligible=eligible, coverage=coverage,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)
    return payload, model, store


def test_eve_then_day_next_day_forbidden():
    dates = ["2026-01-05", "2026-01-06"]
    _, model, store = _build(
        dates, {"r1": {dates[0]: ["E"], dates[1]: ["D"]}},
        {"E": {dates[0]: {"min": 0, "max": 1}}, "D": {dates[1]: {"min": 0, "max": 1}}},
    )
    model.add(store.get_x("r1", "E", dates[0]) == 1)
    model.add(store.get_x("r1", "D", dates[1]) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_day_then_eve_next_day_forbidden():
    dates = ["2026-01-05", "2026-01-06"]
    _, model, store = _build(
        dates, {"r1": {dates[0]: ["D"], dates[1]: ["E"]}},
        {"D": {dates[0]: {"min": 0, "max": 1}}, "E": {dates[1]: {"min": 0, "max": 1}}},
    )
    model.add(store.get_x("r1", "D", dates[0]) == 1)
    model.add(store.get_x("r1", "E", dates[1]) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_day_then_night_next_day_is_allowed_by_this_rule():
    # rule 18 only restricts eve<->day adjacency, not day->night.
    dates = ["2026-01-05", "2026-01-06"]
    _, model, store = _build(
        dates, {"r1": {dates[0]: ["D"], dates[1]: ["N"]}},
        {"D": {dates[0]: {"min": 0, "max": 1}}, "N": {dates[1]: {"min": 0, "max": 1}}},
    )
    model.add(store.get_x("r1", "D", dates[0]) == 1)
    model.add(store.get_x("r1", "N", dates[1]) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_seven_consecutive_nights_forbidden_by_sliding_window():
    dates = [f"2026-01-{5 + i:02d}" for i in range(7)]
    eligible = {"r1": {d: ["N"] for d in dates}}
    coverage = {"N": {d: {"min": 0, "max": 1} for d in dates}}
    _, model, store = _build(dates, eligible, coverage, residents=[make_resident("r1", caps={"nights": 7})])
    for d in dates:
        model.add(store.get_x("r1", "N", d) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_six_consecutive_nights_allowed():
    dates = [f"2026-01-{5 + i:02d}" for i in range(6)]
    eligible = {"r1": {d: ["N"] for d in dates}}
    coverage = {"N": {d: {"min": 0, "max": 1} for d in dates}}
    _, model, store = _build(dates, eligible, coverage, residents=[make_resident("r1", caps={"nights": 6})])
    for d in dates:
        model.add(store.get_x("r1", "N", d) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_night_cap_enforced():
    dates = [f"2026-01-{5 + i:02d}" for i in range(3)]
    eligible = {"r1": {d: ["N"] for d in dates}}
    coverage = {"N": {d: {"min": 0, "max": 1} for d in dates}}
    _, model, store = _build(dates, eligible, coverage, residents=[make_resident("r1", caps={"nights": 2})])
    for d in dates:
        model.add(store.get_x("r1", "N", d) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_night_exempt_resident_skips_night_cap():
    dates = [f"2026-01-{5 + i:02d}" for i in range(3)]
    eligible = {"r1": {d: ["N"] for d in dates}}
    coverage = {"N": {d: {"min": 0, "max": 1} for d in dates}}
    _, model, store = _build(
        dates, eligible, coverage,
        residents=[make_resident("r1", caps={"nights": 2}, nightExempt=True)],
    )
    for d in dates:
        model.add(store.get_x("r1", "N", d) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_more_than_two_night_run_segments_forbidden():
    dates = [f"2026-01-{5 + i:02d}" for i in range(5)]  # N _ N _ N -> 3 segments
    eligible = {"r1": {d: ["N"] for d in dates}}
    coverage = {"N": {d: {"min": 0, "max": 1} for d in dates}}
    _, model, store = _build(dates, eligible, coverage, residents=[make_resident("r1", caps={"nights": 6})])
    for i, d in enumerate(dates):
        model.add(store.get_x("r1", "N", d) == (1 if i % 2 == 0 else 0))
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_two_night_run_segments_allowed():
    dates = [f"2026-01-{5 + i:02d}" for i in range(5)]
    eligible = {"r1": {d: ["N"] for d in dates}}
    coverage = {"N": {d: {"min": 0, "max": 1} for d in dates}}
    _, model, store = _build(dates, eligible, coverage, residents=[make_resident("r1", caps={"nights": 6})])
    pattern = [1, 1, 0, 1, 1]  # two runs of 2
    for d, v in zip(dates, pattern):
        model.add(store.get_x("r1", "N", d) == v)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
