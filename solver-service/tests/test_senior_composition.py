from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.senior_composition import add_senior_composition_constraints
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

_SHIFTS = {"D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"}}


def _build(seniorPrimary):
    dates = ["2026-01-05"]
    raw = make_payload(
        residents=[make_resident("r1"), make_resident("r2")], shifts=_SHIFTS, dates=dates,
        eligible={"r1": {dates[0]: ["D"]}, "r2": {dates[0]: ["D"]}},
        coverage={"D": {dates[0]: {"min": 0, "max": 2}}},
        seniorPrimary=seniorPrimary,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_senior_composition_constraints(model, payload, store)
    return model, store


def test_staffed_shift_requires_a_primary_resident():
    model, store = _build({"D": {"2026-01-05": ["r2"]}})
    model.add(store.get_x("r1", "D", "2026-01-05") == 1)
    model.add(store.get_x("r2", "D", "2026-01-05") == 0)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_staffed_shift_with_primary_present_is_allowed():
    model, store = _build({"D": {"2026-01-05": ["r2"]}})
    model.add(store.get_x("r1", "D", "2026-01-05") == 1)
    model.add(store.get_x("r2", "D", "2026-01-05") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_unstaffed_shift_has_no_senior_requirement():
    model, store = _build({"D": {"2026-01-05": ["r2"]}})
    model.add(store.get_x("r1", "D", "2026-01-05") == 0)
    model.add(store.get_x("r2", "D", "2026-01-05") == 0)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_no_entry_means_no_constraint_at_all():
    model, store = _build({})
    model.add(store.get_x("r1", "D", "2026-01-05") == 1)
    model.add(store.get_x("r2", "D", "2026-01-05") == 0)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
