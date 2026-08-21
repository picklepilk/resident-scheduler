from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident


def test_vars_only_created_for_eligible_and_covered_triples():
    raw = make_payload(
        residents=[make_resident("r1")],
        eligible={"r1": {"2026-01-05": ["D"]}},
        coverage={"D": {"2026-01-05": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    assert store.get_x("r1", "D", "2026-01-05") is not None
    assert store.get_x("r1", "E", "2026-01-05") is None
    assert store.get_x("r1", "D", "2026-01-06") is None


def test_eligible_but_uncovered_shift_gets_no_var():
    raw = make_payload(
        residents=[make_resident("r1")],
        eligible={"r1": {"2026-01-05": ["D", "E"]}},
        coverage={"D": {"2026-01-05": {"min": 0, "max": 1}}},  # E has no coverage entry -> doesn't run
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    assert store.get_x("r1", "D", "2026-01-05") is not None
    assert store.get_x("r1", "E", "2026-01-05") is None


def test_locked_shift_not_in_eligible_still_gets_a_var_and_is_forced():
    raw = make_payload(
        residents=[make_resident("r1")],
        eligible={"r1": {}},
        coverage={"N": {"2026-01-05": {"min": 0, "max": 1}}},
        locked=[{"residentId": "r1", "date": "2026-01-05", "shiftId": "N"}],
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    var = store.get_x("r1", "N", "2026-01-05")
    assert var is not None
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(var) == 1


def test_at_most_one_shift_per_resident_per_day():
    raw = make_payload(
        residents=[make_resident("r1")],
        eligible={"r1": {"2026-01-05": ["D", "E"]}},
        coverage={"D": {"2026-01-05": {"min": 0, "max": 1}}, "E": {"2026-01-05": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    d = store.get_x("r1", "D", "2026-01-05")
    e = store.get_x("r1", "E", "2026-01-05")
    model.add(d == 1)
    model.add(e == 1)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) == "INFEASIBLE"


def test_work_and_night_vars_exist_for_every_resident_and_block_date():
    payload = parse_payload(make_payload())
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    for r in payload.residents:
        for d in payload.block.dates:
            assert (r.id, d) in store.work
            assert (r.id, d) in store.night
