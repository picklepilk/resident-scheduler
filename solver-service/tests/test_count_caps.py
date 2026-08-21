from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.count_caps import add_count_cap_constraints
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

_SHIFTS = {
    "TRAUMA-D": {"startH": 7, "durationH": 9, "type": "day", "area": "TRAUMA"},
    "PED-D": {"startH": 7, "durationH": 9, "type": "day", "area": "PED"},
}


def _build(dates, eligible, coverage, residents):
    raw = make_payload(residents=residents, shifts=_SHIFTS, dates=dates, eligible=eligible, coverage=coverage)
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_count_cap_constraints(model, payload, store)
    return model, store


def test_trauma_cap_enforced():
    dates = ["2026-01-05", "2026-01-06", "2026-01-07"]
    eligible = {"r1": {d: ["TRAUMA-D"] for d in dates}}
    coverage = {"TRAUMA-D": {d: {"min": 0, "max": 1} for d in dates}}
    model, store = _build(dates, eligible, coverage, [make_resident("r1", caps={"trauma": 2})])
    for d in dates:
        model.add(store.get_x("r1", "TRAUMA-D", d) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_target_ceiling_enforced():
    dates = ["2026-01-05", "2026-01-06", "2026-01-07"]
    eligible = {"r1": {d: ["TRAUMA-D"] for d in dates}}
    coverage = {"TRAUMA-D": {d: {"min": 0, "max": 1} for d in dates}}
    model, store = _build(dates, eligible, coverage, [make_resident("r1", target=2)])
    for d in dates:
        model.add(store.get_x("r1", "TRAUMA-D", d) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_target_none_means_no_ceiling():
    dates = ["2026-01-05", "2026-01-06", "2026-01-07"]
    eligible = {"r1": {d: ["TRAUMA-D"] for d in dates}}
    coverage = {"TRAUMA-D": {d: {"min": 0, "max": 1} for d in dates}}
    model, store = _build(dates, eligible, coverage, [make_resident("r1", target=None)])
    for d in dates:
        model.add(store.get_x("r1", "TRAUMA-D", d) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_trauma_peds_split_sub_caps_are_independent():
    dates = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"]
    eligible = {"r1": {d: ["TRAUMA-D", "PED-D"] for d in dates}}
    coverage = {
        "TRAUMA-D": {d: {"min": 0, "max": 1} for d in dates},
        "PED-D": {d: {"min": 0, "max": 1} for d in dates},
    }
    split = {"traumaDates": dates[:2], "pedsDates": dates[2:], "traumaCap": 1, "pedsCap": 1}
    model, store = _build(dates, eligible, coverage, [make_resident("r1", traumaPedsSplit=split)])
    model.add(store.get_x("r1", "TRAUMA-D", dates[0]) == 1)
    model.add(store.get_x("r1", "TRAUMA-D", dates[1]) == 1)  # 2 on the trauma half, cap 1
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_trauma_peds_split_peds_half_ok_when_trauma_half_ok():
    dates = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"]
    eligible = {"r1": {d: ["TRAUMA-D", "PED-D"] for d in dates}}
    coverage = {
        "TRAUMA-D": {d: {"min": 0, "max": 1} for d in dates},
        "PED-D": {d: {"min": 0, "max": 1} for d in dates},
    }
    split = {"traumaDates": dates[:2], "pedsDates": dates[2:], "traumaCap": 1, "pedsCap": 2}
    model, store = _build(dates, eligible, coverage, [make_resident("r1", traumaPedsSplit=split)])
    model.add(store.get_x("r1", "TRAUMA-D", dates[0]) == 1)
    model.add(store.get_x("r1", "PED-D", dates[2]) == 1)
    model.add(store.get_x("r1", "PED-D", dates[3]) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
