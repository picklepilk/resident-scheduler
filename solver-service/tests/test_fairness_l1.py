"""objective.py's `_add_spread`: L1 deviation from the cohort mean (replaces max-min range)."""

from ortools.sat.python import cp_model

from solver.model.objective import TermGroup, _add_spread


def _eval(values, weight=100, ub=20):
    model = cp_model.CpModel()
    vs = []
    for i, val in enumerate(values):
        v = model.new_int_var(0, ub, f"v{i}")
        model.add(v == val)
        vs.append(v)
    group = TermGroup("t")
    _add_spread(model, group, "p", weight, vs, ub)
    expr = sum((c * e for c, e in group.terms), start=0)
    model.minimize(expr)
    s = cp_model.CpSolver()
    assert s.solve(model) == cp_model.OPTIMAL
    return int(s.value(expr)), group


def test_l1_prefers_spread_over_single_outlier():
    # same range (10), but one outlier is a bigger L1 total than a gradual spread? compare totals
    a, _ = _eval([0, 5, 5, 5, 10])
    b, _ = _eval([0, 0, 0, 0, 10])
    assert a < b


def test_two_members_equal_range_times_weight():
    cost, _ = _eval([3, 9], weight=100)
    assert cost == 6 * 100


def test_equal_values_cost_zero_and_early_returns():
    assert _eval([4, 4, 4])[0] == 0
    assert _eval([1, 7], weight=0)[1].terms == []
    assert _eval([5], weight=100)[1].terms == []


def test_coef_scaling():
    for n, expected in ((2, 100), (5, 80), (13, 31)):
        _, group = _eval([0] * n, weight=100)
        assert group.terms[0][0] == expected, n
