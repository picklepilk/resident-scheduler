from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.coverage import add_coverage_constraints
from solver.model.objective import build_objective, build_tier_order
from solver.model.variables import build_variables
from tests.helpers import make_payload


def test_tier_order_default_rule_priority():
    order = build_tier_order(["coverageMin", "seniorComposition", "postNightRest"])
    assert order[:3] == ["coverageMin", "targetDeficitCore", "postNightRest"]
    assert order[3:] == ["targetDeficit", "fairness", "nightShape", "workShape", "band8", "dowPreference"]
    assert len(order) == 9
    assert len(set(order)) == 9


def test_tier_order_reordered_rule_priority_moves_postNightRest_first():
    order = build_tier_order(["postNightRest", "seniorComposition", "coverageMin"])
    assert order[0] == "postNightRest"
    assert set(order[1:3]) == {"coverageMin", "targetDeficitCore"}
    # targetDeficitCore always trails coverageMin specifically
    assert order.index("targetDeficitCore") == order.index("coverageMin") + 1


def test_tier_order_tolerates_missing_or_unknown_entries():
    order = build_tier_order([])
    assert order[:3] == ["coverageMin", "targetDeficitCore", "postNightRest"]
    order2 = build_tier_order(["somethingUnknown"])
    assert set(order2) == set(build_tier_order([]))


def _build_objective_for(raw_payload: dict):
    payload = parse_payload(raw_payload)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    coverage_result = add_coverage_constraints(model, payload, store)
    return build_objective(model, payload, store, coverage_result)


def test_ratchet_invariant_holds_on_default_config():
    info = _build_objective_for(make_payload())
    order = info.tier_order
    for i in range(len(order) - 1):
        hi, lo = order[i], order[i + 1]
        lo_max_contribution = info.tier_bounds[lo] * info.tier_scales[lo]
        assert lo_max_contribution < info.tier_scales[hi], (
            f"{lo}'s max possible contribution ({lo_max_contribution}) must stay under "
            f"one unit of {hi}'s scale ({info.tier_scales[hi]})"
        )


def test_ratchet_invariant_holds_with_reordered_rule_priority():
    raw = make_payload(rulePriority=["postNightRest", "seniorComposition", "coverageMin"])
    info = _build_objective_for(raw)
    order = info.tier_order
    assert order[0] == "postNightRest"
    for i in range(len(order) - 1):
        hi, lo = order[i], order[i + 1]
        lo_max_contribution = info.tier_bounds[lo] * info.tier_scales[lo]
        assert lo_max_contribution < info.tier_scales[hi]


def test_every_tier_scale_is_a_positive_integer():
    info = _build_objective_for(make_payload())
    for name in info.tier_order:
        scale = info.tier_scales[name]
        assert isinstance(scale, int)
        assert scale >= 1
