from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.hours_cap import add_hours_cap_constraints
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

_SHIFTS = {"D": {"startH": 7, "durationH": 12, "type": "day", "area": "POD"}}


def _build(dates, prior_tail_hours):
    raw = make_payload(
        residents=[make_resident("r1", priorTailHours=prior_tail_hours)],
        shifts=_SHIFTS, dates=dates,
        eligible={"r1": {d: ["D"] for d in dates}},
        coverage={"D": {d: {"min": 0, "max": 1} for d in dates}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_hours_cap_constraints(model, payload, store)
    return model, store


def test_hours_cap_enforced_with_tail_offset():
    dates = ["2026-01-05", "2026-01-06"]
    model, store = _build(dates, prior_tail_hours=300)
    # 300 (tail) + 12 + 12 = 324 > 320 -- both days can't be worked
    model.add(store.get_x("r1", "D", dates[0]) == 1)
    model.add(store.get_x("r1", "D", dates[1]) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_hours_cap_allows_under_limit():
    dates = ["2026-01-05", "2026-01-06"]
    model, store = _build(dates, prior_tail_hours=100)
    model.add(store.get_x("r1", "D", dates[0]) == 1)
    model.add(store.get_x("r1", "D", dates[1]) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
