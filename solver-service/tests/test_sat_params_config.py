import pytest

from solver.io.sat_params import validate_params


def test_validate_params_accepts_known_fields():
    assert validate_params({"num_violation_ls": 2, "exploit_best_solution": True}) == {"num_violation_ls": 2, "exploit_best_solution": True}


@pytest.mark.parametrize("bad", [{"num_workers": 4}, {"repair_hint": True}, {"not_a_field": 1}])
def test_validate_params_rejects_forbidden_and_unknown(bad):
    with pytest.raises(ValueError):
        validate_params(bad)


def test_sat_params_reach_configured_solver():
    from ortools.sat.python import cp_model
    from solver.io.sat_params import apply_params

    s = cp_model.CpSolver()
    apply_params(s.parameters, validate_params({"num_violation_ls": 3, "exploit_best_solution": True}))
    assert s.parameters.num_violation_ls == 3 and s.parameters.exploit_best_solution
