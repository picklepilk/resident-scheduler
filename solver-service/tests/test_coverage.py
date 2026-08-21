from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.coverage import add_coverage_constraints
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident


def test_max_side_is_hard():
    raw = make_payload(
        residents=[make_resident("r1"), make_resident("r2")],
        eligible={"r1": {"2026-01-05": ["D"]}, "r2": {"2026-01-05": ["D"]}},
        coverage={"D": {"2026-01-05": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_coverage_constraints(model, payload, store)
    model.add(store.get_x("r1", "D", "2026-01-05") == 1)
    model.add(store.get_x("r2", "D", "2026-01-05") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_elastic_min_absorbs_shortfall_when_nobody_eligible():
    raw = make_payload(
        residents=[make_resident("r1")],
        eligible={"r1": {}},
        coverage={"D": {"2026-01-05": {"min": 1, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    result = add_coverage_constraints(model, payload, store)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    slack = result.slacks[("D", "2026-01-05")]
    assert solver.value(slack) == 1


def test_hard_then_elastic_mode_builds_no_slack_and_can_be_infeasible():
    raw = make_payload(
        residents=[make_resident("r1")],
        eligible={"r1": {}},
        coverage={"D": {"2026-01-05": {"min": 1, "max": 1}}},
        config={
            "maxTimeSeconds": 5, "numWorkers": 1, "randomSeed": 1,
            "coverageMinMode": "hard_then_elastic", "maxVerificationResolves": 2, "weights": {},
        },
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    result = add_coverage_constraints(model, payload, store)
    assert result.slacks == {}
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"
