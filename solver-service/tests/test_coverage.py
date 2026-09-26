from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.coverage import add_coverage_constraints
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident


def test_max_side_is_elastic_by_exactly_one_for_non_trauma():
    """Rule 25's max is no longer a pure hard cap: the app's own "under-target
    lift" policy (repairPass Phase 5 / `underTargetOverstaff`) allows
    exceeding coverage max by exactly 1 as a last resort for a non-TRAUMA
    shift -- see coverage.py's module docstring. 2 candidates forced onto a
    max:1 POD-area shift is now FEASIBLE (the extra body costs the
    `overstaffCoverage` objective term, checked separately in
    test_objective.py), but a 3rd forced candidate still can't fit -- the
    slack is capped at 1, not unbounded."""
    raw = make_payload(
        residents=[make_resident("r1"), make_resident("r2")],
        eligible={"r1": {"2026-01-05": ["D"]}, "r2": {"2026-01-05": ["D"]}},
        coverage={"D": {"2026-01-05": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    result = add_coverage_constraints(model, payload, store)
    model.add(store.get_x("r1", "D", "2026-01-05") == 1)
    model.add(store.get_x("r2", "D", "2026-01-05") == 1)
    solver = cp_model.CpSolver()
    status = solver.status_name(solver.solve(model))
    assert status in ("OPTIMAL", "FEASIBLE")
    assert solver.value(result.overstaff[("D", "2026-01-05")]) == 1


def test_max_side_still_caps_at_max_plus_one():
    raw = make_payload(
        residents=[make_resident("r1"), make_resident("r2"), make_resident("r3")],
        eligible={
            "r1": {"2026-01-05": ["D"]}, "r2": {"2026-01-05": ["D"]}, "r3": {"2026-01-05": ["D"]},
        },
        coverage={"D": {"2026-01-05": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_coverage_constraints(model, payload, store)
    model.add(store.get_x("r1", "D", "2026-01-05") == 1)
    model.add(store.get_x("r2", "D", "2026-01-05") == 1)
    model.add(store.get_x("r3", "D", "2026-01-05") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_max_side_is_hard_for_trauma():
    """TRAUMA is excluded from the +1-overstaff allowance -- its max is
    separately hard-clamped to 1 and its run cap (rule 43) is documented
    "never relaxed"; this module must not quietly reopen that door."""
    shifts = {"TRAUMA-D": {"startH": 7, "durationH": 9, "type": "day", "area": "TRAUMA"}}
    raw = make_payload(
        residents=[make_resident("r1"), make_resident("r2")],
        shifts=shifts,
        eligible={"r1": {"2026-01-05": ["TRAUMA-D"]}, "r2": {"2026-01-05": ["TRAUMA-D"]}},
        coverage={"TRAUMA-D": {"2026-01-05": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    result = add_coverage_constraints(model, payload, store)
    assert result.overstaff == {}
    model.add(store.get_x("r1", "TRAUMA-D", "2026-01-05") == 1)
    model.add(store.get_x("r2", "TRAUMA-D", "2026-01-05") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_max_side_is_hard_for_peds_night():
    """Peds nights (PED-N/PED-N-FM/PED-N12) are excluded from the +1-overstaff
    allowance too -- chief call 2026-09-26, mirrors repairPass Phase 5's
    overstaffFor guard. A Peds DAY shift still gets the allowance."""
    shifts = {
        "PED-N": {"startH": 19, "durationH": 9, "type": "night", "area": "PED"},
        "PED-D": {"startH": 7, "durationH": 9, "type": "day", "area": "PED"},
    }
    raw = make_payload(
        residents=[make_resident("r1"), make_resident("r2")],
        shifts=shifts,
        eligible={"r1": {"2026-01-05": ["PED-N"]}, "r2": {"2026-01-05": ["PED-N"]}},
        coverage={
            "PED-N": {"2026-01-05": {"min": 0, "max": 1}},
            "PED-D": {"2026-01-05": {"min": 0, "max": 1}},
        },
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    result = add_coverage_constraints(model, payload, store)
    assert ("PED-N", "2026-01-05") not in result.overstaff
    assert ("PED-D", "2026-01-05") in result.overstaff
    model.add(store.get_x("r1", "PED-N", "2026-01-05") == 1)
    model.add(store.get_x("r2", "PED-N", "2026-01-05") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_no_overstaff_var_when_max_is_zero():
    raw = make_payload(
        residents=[make_resident("r1")],
        eligible={"r1": {}},
        coverage={"D": {"2026-01-05": {"min": 0, "max": 0}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    result = add_coverage_constraints(model, payload, store)
    assert result.overstaff == {}


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
