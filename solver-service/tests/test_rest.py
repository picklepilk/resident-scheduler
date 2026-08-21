from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.rest import add_rest_constraints
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

_SHIFTS = {
    "D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "N": {"startH": 23, "durationH": 9, "type": "night", "area": "POD"},
}


def _two_day_payload(**overrides):
    dates = ["2026-02-02", "2026-02-03"]
    return make_payload(
        residents=[make_resident("r1")],
        shifts=_SHIFTS,
        dates=dates,
        eligible={"r1": {"2026-02-02": ["N"], "2026-02-03": ["D"]}},
        coverage={"N": {"2026-02-02": {"min": 0, "max": 1}}, "D": {"2026-02-03": {"min": 0, "max": 1}}},
        **overrides,
    )


def test_insufficient_gap_forbidden_when_enforce_rest_true():
    payload = parse_payload(_two_day_payload())
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_rest_constraints(model, payload, store)
    model.add(store.get_x("r1", "N", "2026-02-02") == 1)
    model.add(store.get_x("r1", "D", "2026-02-03") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_pair_allowed_when_enforce_rest_false():
    raw = _two_day_payload(settings={"enforceRest": False, "enforceWeekendOff": True})
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_rest_constraints(model, payload, store)
    model.add(store.get_x("r1", "N", "2026-02-02") == 1)
    model.add(store.get_x("r1", "D", "2026-02-03") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_tail_constant_forces_block_var_to_zero():
    raw = make_payload(
        residents=[make_resident("r1", priorTail={"2026-02-02": "N"})],
        shifts=_SHIFTS,
        dates=["2026-02-03"],
        eligible={"r1": {"2026-02-03": ["D"]}},
        coverage={"D": {"2026-02-03": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    assert payload.tail_dates[-1] == "2026-02-02"  # sanity: tail is contiguous, ends right before block
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_rest_constraints(model, payload, store)
    model.add(store.get_x("r1", "D", "2026-02-03") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_two_days_apart_with_ample_gap_is_allowed():
    raw = make_payload(
        residents=[make_resident("r1")],
        shifts=_SHIFTS,
        dates=["2026-02-02", "2026-02-03", "2026-02-04"],
        eligible={"r1": {"2026-02-02": ["D"], "2026-02-04": ["D"]}},
        coverage={"D": {"2026-02-02": {"min": 0, "max": 1}, "2026-02-04": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_rest_constraints(model, payload, store)
    model.add(store.get_x("r1", "D", "2026-02-02") == 1)
    model.add(store.get_x("r1", "D", "2026-02-04") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
