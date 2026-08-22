"""Objective + pass-2 relaxation weight invariants -- rewritten for the
2026-08-21 fix (see solver/model/objective.py's docstring for the full bug
history: a 9-tier multiplicative ratchet collapsed multiple tiers onto the
same clamped `MAX_TIER_SCALE`, so coverage slack and several unrelated
preference terms became equally weighted and the solver started preferring
empty coverage slots). The old tests asserted an EXACT lexicographic ratchet
(`derive_scales`/`build_tier_order`); that mechanism is gone. These tests
assert the WEAKER, moderate invariants the new fixed-weight scheme is
actually held to:

  (a) coverageMin's slack weight dominates the sum of every per-assignment
      ANTI-fill term by a wide margin, so shape/fairness/preference noise
      can never make leaving a coverage slot empty look cheaper than
      filling it -- the actual production bug.
  (b) the 3 pass-2 relaxation weights (elastic.py) are each 10x the one
      below, are far above the soft objective's own largest per-unit term,
      and the worst-case total across every literal (using generous but
      finite production-scale counts) stays deep inside int64. This is
      deliberately NOT a proof of exact lexicographic dominance over the
      full worst-case sum of everything below each tier -- see
      elastic.py's module docstring for why that specific, stronger
      invariant is mathematically impossible under int64 once hundreds of
      literals are stacked 3-4 tiers deep (it's the same failure mode that
      broke the original ratchet).
  (c) every shipped weight is a positive integer.
"""

from __future__ import annotations

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.coverage import add_coverage_constraints
from solver.model.elastic import (
    DUTY_HOUR_FAMILIES,
    POLICY_CAP_FAMILIES,
    RELAXATION_WEIGHTS,
    TIER_COVERAGE_MIN,
    TIER_DUTY_HOUR,
    TIER_POLICY_CAPS,
)
from solver.model.objective import (
    PRIORITY_DEMOTION_DIVISOR,
    apply_rule_priority,
    build_objective,
    load_default_weights,
    merged_weights,
)
from solver.model.variables import build_variables
from tests.helpers import make_payload

# "Generous but finite" counts standing in for a large real block -- the
# production repro that motivated this fix (58 residents, a 28-date block,
# 482 min-coverage slots).
GENEROUS_RESIDENTS = 58
GENEROUS_DATES = 28
GENEROUS_COVERAGE_SLOTS = 482
GENEROUS_CAP_LITS = GENEROUS_RESIDENTS * len(POLICY_CAP_FAMILIES)
GENEROUS_DUTY_LITS = GENEROUS_RESIDENTS * len(DUTY_HOUR_FAMILIES)

INT64_MAX = 2 ** 63 - 1


def _build_objective_for(raw_payload: dict):
    payload = parse_payload(raw_payload)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    coverage_result = add_coverage_constraints(model, payload, store)
    return build_objective(model, payload, store, coverage_result)


def _anti_fill_sum(weights: dict) -> int:
    """Sum of every per-assignment term that could ever prefer NOT filling a
    slot (shape/fairness/dow preference/batch-2 trauma-run placement) --
    the thing coverageMin's slack weight must dominate.

    Batch 2 (2026-08-22) additions: traumaSecondInRun/traumaMidRun/
    nightDurationAlternation/secondRestDay are all "this assignment isn't
    the PREFERRED one" penalties, not "leave it empty" ones, but the same
    domination property matters for them -- generous, not exact, per-single-
    -assignment stacking multipliers (a trauma night can sit at the "b"
    endpoint of up to 5 different traumaSecondInRun windows, e.g.), matching
    this function's existing "generous but finite" posture.
    `pedsInternNightDeficit` is deliberately excluded -- like targetDeficit,
    it pushes TOWARD assigning a shift, never away from one.

    Round 2b additions: podEmComposition/flexEmComposition (one shortfall
    var per (POD|FLEX shift, date), same ×1 stacking as traumaMidRun -- a
    single (shift,date) pair only ever contributes one shortfall var) and
    podPgy2Fallback/flexPgy3Fallback (a flat per-assignment cost, same ×1
    stacking as weekendOff/internPair -- one assignment can only ever be
    charged once)."""
    isolated_night = weights["isolatedNight"]["perUnit"]
    work = max(weights["workShape"]["isolatedCost"], weights["workShape"]["fragmentCost"])
    fairness = sum(weights["fairness"].values())
    weekend_off = weights["weekendOff"]["perMissing"]
    intern_pair = weights["internPair"]["perExcess"]
    dow = weights["dowPreference"]["scale"] * 20
    trauma_second = weights["traumaSecondInRun"]["perUnit"] * 5
    trauma_mid = weights["traumaMidRun"]["perUnit"]
    night_alt = weights["nightDurationAlternation"]["perUnit"] * 2
    second_rest = weights["secondRestDay"]["perUnit"]
    pod_em_comp = weights["podEmComposition"]["perUnit"]
    flex_em_comp = weights["flexEmComposition"]["perUnit"]
    pod_pgy2_fallback = weights["podPgy2Fallback"]["perUnit"]
    flex_pgy3_fallback = weights["flexPgy3Fallback"]["perUnit"]
    return (
        isolated_night + work + fairness + weekend_off + intern_pair + dow
        + trauma_second + trauma_mid + night_alt + second_rest
        + pod_em_comp + flex_em_comp + pod_pgy2_fallback + flex_pgy3_fallback
    )


def _generous_soft_objective_max(weights: dict) -> int:
    """Generous, finite upper bound on the ENTIRE soft objective's total
    contribution, built the same way as `_anti_fill_sum` but for every term
    (including the "toward-fill" ones), using the production-scale counts
    above. Dominated in practice by coverageMin's own slack term."""
    target_unit = max(weights["targetDeficitCore"]["perUnit"], weights["targetDeficit"]["perUnit"])
    return (
        weights["coverageMin"]["perSlack"] * GENEROUS_COVERAGE_SLOTS
        + target_unit * GENEROUS_RESIDENTS * 30
        + weights["postNightRest"]["perViolation"] * GENEROUS_RESIDENTS * GENEROUS_DATES * 4
        + sum(weights["fairness"].values()) * 100 * 10
        + weights["isolatedNight"]["perUnit"] * GENEROUS_RESIDENTS * GENEROUS_DATES
        + (weights["workShape"]["isolatedCost"] + weights["workShape"]["fragmentCost"])
        * GENEROUS_RESIDENTS * GENEROUS_DATES
        + weights["weekendOff"]["perMissing"] * GENEROUS_RESIDENTS
        + weights["pedsMixMin"]["perUnit"] * GENEROUS_RESIDENTS * GENEROUS_DATES
        + weights["fm1Peds"]["perUnit"] * GENEROUS_RESIDENTS * GENEROUS_DATES
        + weights["internPair"]["perExcess"] * GENEROUS_COVERAGE_SLOTS
        + weights["dowPreference"]["scale"] * 20 * GENEROUS_COVERAGE_SLOTS
        # batch 2 (2026-08-22)
        + weights["traumaSecondInRun"]["perUnit"] * GENEROUS_RESIDENTS * GENEROUS_DATES
        + weights["traumaMidRun"]["perUnit"] * GENEROUS_RESIDENTS * GENEROUS_DATES
        + weights["nightDurationAlternation"]["perUnit"] * GENEROUS_RESIDENTS * GENEROUS_DATES * 2
        + weights["secondRestDay"]["perUnit"] * GENEROUS_RESIDENTS * GENEROUS_DATES
        + weights["pedsInternNightDeficit"]["perUnit"] * GENEROUS_RESIDENTS
        # round 2b (EM-count composition + PGY gating pool-restrict)
        + weights["podEmComposition"]["perUnit"] * GENEROUS_COVERAGE_SLOTS
        + weights["flexEmComposition"]["perUnit"] * GENEROUS_COVERAGE_SLOTS
        + weights["podPgy2Fallback"]["perUnit"] * GENEROUS_RESIDENTS * GENEROUS_DATES
        + weights["flexPgy3Fallback"]["perUnit"] * GENEROUS_RESIDENTS * GENEROUS_DATES
    )


# ---------------------------------------------------------------------------
# (a) coverageMin dominates anti-fill noise
# ---------------------------------------------------------------------------

def test_coverage_min_dominates_anti_fill_terms():
    weights = load_default_weights()
    coverage_min = weights["coverageMin"]["perSlack"]
    assert coverage_min >= 100 * _anti_fill_sum(weights)


# ---------------------------------------------------------------------------
# (c) positivity
# ---------------------------------------------------------------------------

def test_all_default_weights_are_positive_ints():
    weights = load_default_weights()
    for name, sub in weights.items():
        assert isinstance(sub, dict), name
        for key, value in sub.items():
            assert isinstance(value, int), f"{name}.{key}"
            assert value > 0, f"{name}.{key}"


def test_all_relaxation_weights_are_positive_ints():
    for name, value in RELAXATION_WEIGHTS.items():
        assert isinstance(value, int), name
        assert value > 0, name


# ---------------------------------------------------------------------------
# (b) relaxation tiers
# ---------------------------------------------------------------------------

def test_relaxation_tiers_step_down_by_10x():
    assert RELAXATION_WEIGHTS[TIER_DUTY_HOUR] == 10 * RELAXATION_WEIGHTS[TIER_COVERAGE_MIN]
    assert RELAXATION_WEIGHTS[TIER_COVERAGE_MIN] == 10 * RELAXATION_WEIGHTS[TIER_POLICY_CAPS]


def test_relaxation_tiers_dominate_soft_objective_per_unit():
    """Each relaxation tier's PER-LITERAL weight is far above the soft
    objective's own largest PER-UNIT weight (coverageMin's slack weight) --
    the property that actually matters for a realistic (small) conflict
    set. See this file's own module docstring for why a full
    ≥10x-of-the-worst-case-SUM invariant across 3-4 stacked pools of
    hundreds of literals isn't attempted here (it can't be satisfied under
    int64)."""
    weights = load_default_weights()
    largest_soft_unit = max(
        weights["coverageMin"]["perSlack"],
        weights["targetDeficitCore"]["perUnit"],
        weights["postNightRest"]["perViolation"],
        weights["targetDeficit"]["perUnit"],
    )
    assert RELAXATION_WEIGHTS[TIER_POLICY_CAPS] >= 100 * largest_soft_unit


def test_relaxation_worst_case_total_stays_well_under_int64():
    """Sum every literal in every pass-2 pool at its own weight, plus a
    generous estimate of the entire soft objective, using the "generous but
    finite" production-scale counts documented above. This is an
    overflow-safety check (the property that matters for CP-SAT numerical
    stability), not a lexicographic-dominance proof."""
    weights = load_default_weights()
    soft_max = _generous_soft_objective_max(weights)
    relax_total = (
        RELAXATION_WEIGHTS[TIER_DUTY_HOUR] * GENEROUS_DUTY_LITS
        + RELAXATION_WEIGHTS[TIER_COVERAGE_MIN] * GENEROUS_COVERAGE_SLOTS
        + RELAXATION_WEIGHTS[TIER_POLICY_CAPS] * GENEROUS_CAP_LITS
    )
    worst_case_total = relax_total + soft_max
    assert worst_case_total < 10 ** 16  # "well under" int64 -- comfortable margin
    assert worst_case_total < INT64_MAX


# ---------------------------------------------------------------------------
# rulePriority reordering
# ---------------------------------------------------------------------------

def test_apply_rule_priority_default_order_leaves_coverageMin_unchanged():
    weights = merged_weights(parse_payload(make_payload()))
    adjusted = apply_rule_priority(weights, ["coverageMin", "seniorComposition", "postNightRest"])
    assert adjusted["coverageMin"]["perSlack"] == weights["coverageMin"]["perSlack"]
    assert adjusted["postNightRest"]["perViolation"] == (
        weights["postNightRest"]["perViolation"] // PRIORITY_DEMOTION_DIVISOR
    )


def test_apply_rule_priority_reordered_demotes_coverageMin_instead():
    weights = merged_weights(parse_payload(make_payload()))
    adjusted = apply_rule_priority(weights, ["postNightRest", "seniorComposition", "coverageMin"])
    assert adjusted["postNightRest"]["perViolation"] == weights["postNightRest"]["perViolation"]
    assert adjusted["coverageMin"]["perSlack"] == weights["coverageMin"]["perSlack"] // PRIORITY_DEMOTION_DIVISOR


def test_apply_rule_priority_tolerates_missing_or_unknown_entries():
    weights = merged_weights(parse_payload(make_payload()))
    adjusted = apply_rule_priority(weights, [])
    assert adjusted["coverageMin"]["perSlack"] == weights["coverageMin"]["perSlack"]
    adjusted2 = apply_rule_priority(weights, ["somethingUnknown"])
    assert adjusted2["coverageMin"]["perSlack"] == weights["coverageMin"]["perSlack"]


def test_apply_rule_priority_never_floors_below_one():
    weights = {"coverageMin": {"perSlack": 3}, "postNightRest": {"perViolation": 1}}
    adjusted = apply_rule_priority(weights, ["coverageMin", "postNightRest"])
    assert adjusted["postNightRest"]["perViolation"] == 1  # max(1, 1 // 10)


# ---------------------------------------------------------------------------
# build_objective wiring
# ---------------------------------------------------------------------------

def test_build_objective_applied_weights_are_positive_ints():
    """`ObjectiveInfo.weights` is the FINAL, rule-priority-adjusted dict
    actually used to build coefficients -- a demoted weight floors at 1,
    never 0 or negative."""
    info = _build_objective_for(make_payload())
    for name, sub in info.weights.items():
        values = sub.values() if isinstance(sub, dict) else [sub]
        for value in values:
            assert isinstance(value, int)
            assert value > 0


def test_build_objective_sets_a_minimize_objective():
    info = _build_objective_for(make_payload())
    assert info.total_expr is not None
