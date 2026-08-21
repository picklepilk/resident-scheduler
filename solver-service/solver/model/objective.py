"""Assembles every soft term (rules 32-42) into ONE integer linear objective.

Nine priority tiers (see docs/PAYLOAD_SCHEMA.md "Objective tiers"):
  1 coverageMin slack   2 targetDeficit(core)   3 postNightRest
  4 targetDeficit(non-core)   5 fairness   6 nightShape   7 workShape
  8 band8 (weekendOff + pedsMixMin + fm1Peds + internPair)   9 dowPreference

`payload.rulePriority` only ever reorders tiers 1 and 3 (`coverageMin`,
`postNightRest` -- `seniorComposition`, its third entry, is a hard rule and
never appears in the objective at all). Tier 2 (`targetDeficitCore`) always
sits immediately after wherever `coverageMin` lands, matching the plan's
canonical 1/2/3 ordering when `rulePriority` is left at its default. Tiers
4-9 are always in the fixed order above.

RATCHET: each tier gets one integer SCALE, derived bottom-up so tier i's
smallest possible per-unit weight (>= 1 * scale[i]) strictly exceeds tier
i+1's maximum POSSIBLE total contribution (bound[i+1] * scale[i+1]). Every
auxiliary IntVar's own declared domain upper bound doubles as that term's
exact contribution bound -- e.g. a coverage slack var built as
`new_int_var(0, entry.min, ...)` can literally never exceed `entry.min`, so
`entry.min` is not just "generous", it's the true max. This mirrors the
app's own `PREFERENCE_BAND_CEILING` ratchet (see CLAUDE.md), extended from
two levels to nine.

CP-SAT coefficients are int64. Nine levels of exact multiplicative
compounding on a realistically sized payload (dozens of residents, ~28
dates) can overflow that well before tier 1 -- so `MAX_TIER_SCALE` caps each
derived scale. Below the cap the ratchet is an exact mathematical guarantee
(asserted by tests/test_weight_tiering.py on the small fixtures, where the
cap never triggers); above it, ordering degrades gracefully to "tier i's
scale is still >= tier i+1's", a documented, accepted tradeoff rather than a
silent bug.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from solver.io.payload import Payload
from solver.model import timing
from solver.model.coverage import CoverageResult
from solver.model.count_caps import terms_for
from solver.model.sequence_constraints import add_soft_sequence_constraint
from solver.model.variables import VarStore, as_literal, resident_candidates

DEFAULT_WEIGHTS_PATH = Path(__file__).resolve().parents[2] / "config" / "default_weights.json"

SATURDAY = 5
SUNDAY = 6
MAX_CONSECUTIVE_WORK_DAYS = 6
MAX_TIER_SCALE = 10 ** 9

FIXED_TAIL_TIERS = ["targetDeficit", "fairness", "nightShape", "workShape", "band8", "dowPreference"]


def load_default_weights() -> dict:
    with open(DEFAULT_WEIGHTS_PATH, encoding="utf-8") as f:
        return json.load(f)


def merged_weights(payload: Payload) -> dict:
    weights = {k: dict(v) for k, v in load_default_weights().items()}
    for key, sub in (payload.config.weights or {}).items():
        if key in weights and isinstance(sub, dict):
            weights[key].update(sub)
        else:
            weights[key] = sub
    return weights


def build_tier_order(rule_priority: list) -> list:
    known = [r for r in rule_priority if r in ("coverageMin", "postNightRest")]
    for name in ("coverageMin", "postNightRest"):
        if name not in known:
            known.append(name)
    idx = known.index("coverageMin")
    head = known[: idx + 1] + ["targetDeficitCore"] + known[idx + 1:]
    return head + FIXED_TAIL_TIERS


class Tier:
    def __init__(self, name: str):
        self.name = name
        self.terms = []  # list[(coef:int, expr)]
        self.bound = 0    # sum(abs(coef) * term_max) -- exact max raw contribution

    def add(self, coef: int, expr, term_max: int) -> None:
        if coef == 0:
            return
        self.terms.append((coef, expr))
        self.bound += abs(coef) * max(term_max, 0)


@dataclass(frozen=True)
class PostNightRestPenalty:
    resident_id: str
    date1: str
    shift_id1: str
    date2: str
    shift_id2: str
    gap_min: int
    var: object


@dataclass
class ObjectiveInfo:
    total_expr: object
    coverage_slacks: dict
    post_night_rest_penalties: list
    target_deficit_vars: dict          # residentId -> (target:int, deficitVar)
    tier_order: list
    tier_scales: dict = field(default_factory=dict)
    tier_bounds: dict = field(default_factory=dict)


def derive_scales(tier_order: list, bounds: dict) -> dict:
    """Public (not `_`-prefixed) because solver/model/elastic.py reuses this
    EXACT adjacent-tier ratchet algorithm to extend the same 9-tier ordering
    with 3 more tiers above it for pass-2 relaxation penalties -- one shared
    implementation of the ratchet, not two.
    """
    scales = {tier_order[-1]: 1}
    for i in range(len(tier_order) - 2, -1, -1):
        nxt = tier_order[i + 1]
        raw = bounds[nxt] * scales[nxt] + 1
        scales[tier_order[i]] = min(raw, MAX_TIER_SCALE)
    return scales


def _weekend_dates(payload: Payload) -> list:
    return [d for d in payload.block.dates if timing.parse_date(d).weekday() in (SATURDAY, SUNDAY)]


def _weekend_pairs(payload: Payload) -> list:
    dates_set = set(payload.block.dates)
    pairs = []
    for d in payload.block.dates:
        if timing.parse_date(d).weekday() == SATURDAY:
            sun = timing.add_days(d, 1)
            if sun in dates_set:
                pairs.append((d, sun))
    return pairs


def _cohorts(payload: Payload) -> dict:
    groups = {}
    for r in payload.residents:
        if r.cohort is None:
            continue
        groups.setdefault(r.cohort, []).append(r)
    return {k: v for k, v in groups.items() if len(v) >= 2}


def _assigned_expr(payload: Payload, store: VarStore, resident_id: str):
    terms = []
    for date_str in payload.block.dates:
        terms.extend(store.x_sum_for_resident_date(resident_id, date_str))
    return sum(terms)


def _add_spread(model, tier: Tier, prefix: str, weight: int, values: list, value_ub: int) -> None:
    if weight == 0 or len(values) < 2:
        return
    mx = model.new_int_var(0, value_ub, f"{prefix}_max")
    mn = model.new_int_var(0, value_ub, f"{prefix}_min")
    model.add_max_equality(mx, values)
    model.add_min_equality(mn, values)
    tier.add(weight, mx - mn, value_ub)


# ---- rule 24: coverageMin slack (tier 1) ----

def _add_coverage_term(payload: Payload, tier: Tier, coverage_result: CoverageResult, weights: dict) -> None:
    coef = int(weights["coverageMin"]["perSlack"])
    for (shift_id, date_str), slack in coverage_result.slacks.items():
        term_max = payload.coverage[shift_id][date_str].min
        tier.add(coef, slack, term_max)


# ---- rule 33: targetDeficit, core (tier 2) and non-core (tier 4) ----

def _add_target_deficit_terms(model, payload: Payload, store: VarStore, tiers: dict, weights: dict) -> dict:
    core_coef = int(weights["targetDeficitCore"]["perUnit"])
    noncore_coef = int(weights["targetDeficit"]["perUnit"])
    result = {}
    for resident in payload.residents:
        if resident.target is None:
            continue
        assigned_expr = _assigned_expr(payload, store, resident.id)
        deficit = model.new_int_var(0, resident.target, f"deficit[{resident.id}]")
        model.add_max_equality(deficit, [resident.target - assigned_expr, 0])
        result[resident.id] = (resident.target, deficit)
        if resident.is_em_core:
            tiers["targetDeficitCore"].add(core_coef, deficit, resident.target)
        else:
            tiers["targetDeficit"].add(noncore_coef, deficit, resident.target)
    return result


# ---- rule 34: postNightRest (tier 3) ----

def _add_post_night_rest_term(model, payload: Payload, store: VarStore, tier: Tier, weights: dict) -> list:
    coef = int(weights["postNightRest"]["perViolation"])
    penalties = []

    for resident in payload.residents:
        by_date = {}
        for date_str, shift_id, var in resident_candidates(payload, store, resident.id):
            by_date.setdefault(date_str, []).append((shift_id, var))
        date_set = set(by_date.keys())

        for date1 in sorted(by_date.keys()):
            night_entries = [(sid, v) for sid, v in by_date[date1] if payload.shifts[sid].is_night]
            if not night_entries:
                continue
            for delta in (1, 2):
                date2 = timing.add_days(date1, delta)
                if date2 not in date_set:
                    continue
                target_entries = [(sid, v) for sid, v in by_date[date2] if payload.shifts[sid].type in ("day", "eve")]
                if not target_entries:
                    continue
                for shift_id1, var1 in night_entries:
                    shift1 = payload.shifts[shift_id1]
                    for shift_id2, var2 in target_entries:
                        shift2 = payload.shifts[shift_id2]
                        gap = timing.gap_between(date1, shift1, date2, shift2)
                        if gap >= 24 * 60:
                            continue
                        if var1 is None and var2 is None:
                            continue  # both historical -- var2 None+var1 real is impossible (tail always precedes block)
                        term1 = 1 if var1 is None else var1
                        p = model.new_int_var(
                            0, 1, f"postNightRest[{resident.id},{date1},{shift_id1},{date2},{shift_id2}]"
                        )
                        model.add(p >= term1 + var2 - 1)
                        tier.add(coef, p, 1)
                        penalties.append(
                            PostNightRestPenalty(resident.id, date1, shift_id1, date2, shift_id2, gap, p)
                        )
    return penalties


# ---- rule 35: fairness (tier 5) ----

def _add_fairness_terms(model, payload: Payload, store: VarStore, tier: Tier, weights: dict) -> None:
    w = weights["fairness"]
    w_deficit, w_holiday, w_night, w_weekend = (
        int(w["deficit"]), int(w["holiday"]), int(w["night"]), int(w["weekend"]),
    )
    cohorts = _cohorts(payload)
    if not cohorts:
        return
    D = len(payload.block.dates)
    weekend_dates = _weekend_dates(payload)
    holiday_dates_in_block = [d for d in payload.holidays if d in set(payload.block.dates)]

    for cohort_name, members in cohorts.items():
        ratios = []
        for r in members:
            if r.target is None or r.target <= 0:
                continue
            deficit_expr = r.target - _assigned_expr(payload, store, r.id)
            ratio = model.new_int_var(0, 100, f"fair_ratio[{cohort_name},{r.id}]")
            model.add_division_equality(ratio, deficit_expr * 100, model.new_constant(r.target))
            ratios.append(ratio)
        _add_spread(model, tier, f"fair_deficit[{cohort_name}]", w_deficit, ratios, 100)

        if D > 0:
            nights_ub = D + max((r.ay_prior.nights for r in members), default=0)
            nights_vals = []
            for r in members:
                v = model.new_int_var(0, nights_ub, f"fair_nights[{cohort_name},{r.id}]")
                model.add(v == sum(store.night[(r.id, d)] for d in payload.block.dates) + r.ay_prior.nights)
                nights_vals.append(v)
            _add_spread(model, tier, f"fair_nights[{cohort_name}]", w_night, nights_vals, nights_ub)

            if weekend_dates:
                weekend_ub = len(weekend_dates) + max((r.ay_prior.weekends for r in members), default=0)
                weekend_vals = []
                for r in members:
                    v = model.new_int_var(0, weekend_ub, f"fair_weekend[{cohort_name},{r.id}]")
                    model.add(v == sum(store.work[(r.id, d)] for d in weekend_dates) + r.ay_prior.weekends)
                    weekend_vals.append(v)
                _add_spread(model, tier, f"fair_weekend[{cohort_name}]", w_weekend, weekend_vals, weekend_ub)

            if holiday_dates_in_block:
                holiday_ub = len(holiday_dates_in_block) + max((r.ay_prior.holidays for r in members), default=0)
                holiday_vals = []
                for r in members:
                    v = model.new_int_var(0, holiday_ub, f"fair_holiday[{cohort_name},{r.id}]")
                    model.add(v == sum(store.work[(r.id, d)] for d in holiday_dates_in_block) + r.ay_prior.holidays)
                    holiday_vals.append(v)
                _add_spread(model, tier, f"fair_holiday[{cohort_name}]", w_holiday, holiday_vals, holiday_ub)


# ---- rule 36: nightShape (tier 6) ----

def _add_night_shape_term(model, payload: Payload, store: VarStore, tier: Tier, weights: dict) -> None:
    w = weights["nightShape"]
    min_cost, max_cost = int(w["minCost"]), int(w["maxCost"])
    for resident in payload.residents:
        if resident.night_exempt:
            continue
        works = [store.night[(resident.id, d)] for d in payload.block.dates]
        if len(works) < 2:
            continue
        cost_lits, cost_coefs = add_soft_sequence_constraint(
            model, works,
            hard_min=1, soft_min=4, min_cost=min_cost,
            soft_max=6, hard_max=6, max_cost=max_cost,
            prefix=f"nightShape[{resident.id}]",
        )
        for lit, coef in zip(cost_lits, cost_coefs):
            tier.add(coef, lit, 1)


# ---- rule 37: workShape (tier 7) ----

def _prev_work_term_before_block(payload: Payload, resident) -> int:
    if not payload.tail_dates:
        return 0
    date_str = payload.tail_dates[-1]
    worked = date_str in resident.prior_tail
    obligated = date_str in resident.prior_tail_obligations
    return 1 if (worked or obligated) else 0


def _add_work_shape_term(model, payload: Payload, store: VarStore, tier: Tier, weights: dict) -> None:
    w = weights["workShape"]
    isolated_cost, fragment_cost = int(w["isolatedCost"]), int(w["fragmentCost"])
    D = len(payload.block.dates)
    if D < 2:
        return

    for resident in payload.residents:
        works = [store.work[(resident.id, d)] for d in payload.block.dates]

        # hard_min=1 (not 0): a length-0 "span" is a degenerate edge case in
        # the sequence-constraint algorithm -- it fires on every adjacent
        # pair of OFF days (both neighbors of a zero-length gap being off),
        # which would spuriously penalize normal rest days. hard_min=1 keeps
        # only length==1 (an isolated single workday) in the penalty zone,
        # matching the actual intent below.
        cost_lits, cost_coefs = add_soft_sequence_constraint(
            model, works,
            hard_min=1, soft_min=2, min_cost=isolated_cost,
            soft_max=D, hard_max=D, max_cost=0,
            prefix=f"workShape[{resident.id}]",
        )
        for lit, coef in zip(cost_lits, cost_coefs):
            tier.add(coef, lit, 1)

        starts = []
        for idx, date_str in enumerate(payload.block.dates):
            cur = works[idx]
            prev_term = works[idx - 1] if idx > 0 else _prev_work_term_before_block(payload, resident)
            prev_lit = as_literal(model, prev_term)
            start_var = model.new_bool_var(f"work_run_start[{resident.id},{date_str}]")
            model.add_bool_and([cur, prev_lit.negated()]).only_enforce_if(start_var)
            model.add_bool_or([cur.negated(), prev_lit]).only_enforce_if(start_var.negated())
            starts.append(start_var)

        num_runs = model.new_int_var(0, D, f"work_num_runs[{resident.id}]")
        model.add(num_runs == sum(starts))
        worked = model.new_int_var(0, D, f"work_total[{resident.id}]")
        model.add(worked == sum(works))
        ceil_runs = model.new_int_var(0, D, f"work_ceil_runs[{resident.id}]")
        model.add_division_equality(
            ceil_runs, worked + (MAX_CONSECUTIVE_WORK_DAYS - 1), model.new_constant(MAX_CONSECUTIVE_WORK_DAYS)
        )
        excess = model.new_int_var(0, D, f"work_excess_runs[{resident.id}]")
        model.add_max_equality(excess, [num_runs - ceil_runs, 0])
        tier.add(fragment_cost, excess, D)


# ---- rules 38-41: band8 ----

def _add_weekend_off_term(model, payload: Payload, store: VarStore, tier: Tier, weights: dict) -> None:
    if not payload.settings.enforce_weekend_off:
        return
    coef = int(weights["weekendOff"]["perMissing"])
    pairs = _weekend_pairs(payload)
    if not pairs:
        return
    for resident in payload.residents:
        both_off_vars = []
        for sat, sun in pairs:
            work_sat = store.work[(resident.id, sat)]
            work_sun = store.work[(resident.id, sun)]
            both_off = model.new_bool_var(f"weekend_off[{resident.id},{sat}]")
            model.add_bool_and([work_sat.negated(), work_sun.negated()]).only_enforce_if(both_off)
            model.add_bool_or([work_sat, work_sun]).only_enforce_if(both_off.negated())
            both_off_vars.append(both_off)
        has_off_weekend = model.new_bool_var(f"has_off_weekend[{resident.id}]")
        model.add_max_equality(has_off_weekend, both_off_vars)
        tier.add(coef, has_off_weekend.negated(), 1)


def _add_peds_mix_min_term(model, payload: Payload, store: VarStore, tier: Tier, weights: dict) -> None:
    coef = int(weights["pedsMixMin"]["perUnit"])
    for resident in payload.residents:
        cap = resident.caps.peds_mix_min
        if cap is None or cap <= 0:
            continue
        peds_terms = terms_for(payload, store, resident.id, lambda sid: payload.shifts[sid].area == "PED", lambda d: True)
        assigned = sum(peds_terms) if peds_terms else 0
        shortfall = model.new_int_var(0, cap, f"peds_min_shortfall[{resident.id}]")
        model.add_max_equality(shortfall, [cap - assigned, 0])
        tier.add(coef, shortfall, cap)


def _add_fm1_peds_term(model, payload: Payload, store: VarStore, tier: Tier, weights: dict) -> None:
    coef = int(weights["fm1Peds"]["perUnit"])
    D = len(payload.block.dates)
    for resident in payload.residents:
        cap = resident.caps.fm1_peds_max
        if cap is None:
            continue
        ub = max(D - cap, 0)
        if ub == 0:
            continue
        peds_terms = terms_for(payload, store, resident.id, lambda sid: payload.shifts[sid].area == "PED", lambda d: True)
        assigned = sum(peds_terms) if peds_terms else 0
        overage = model.new_int_var(0, ub, f"fm1_peds_overage[{resident.id}]")
        model.add_max_equality(overage, [assigned - cap, 0])
        tier.add(coef, overage, ub)


def _add_intern_pair_term(model, payload: Payload, store: VarStore, tier: Tier, weights: dict) -> None:
    coef = int(weights["internPair"]["perExcess"])
    for (shift_id, date_str), pairs in store.by_shift_date.items():
        intern_terms = [var for resident_id, var in pairs if payload.residents_by_id[resident_id].is_intern]
        if len(intern_terms) < 2:
            continue
        ub = len(intern_terms) - 1
        over = model.new_int_var(0, ub, f"intern_pair[{shift_id},{date_str}]")
        model.add_max_equality(over, [sum(intern_terms) - 1, 0])
        tier.add(coef, over, ub)


def _add_band8_terms(model, payload: Payload, store: VarStore, tier: Tier, weights: dict) -> None:
    _add_weekend_off_term(model, payload, store, tier, weights)
    _add_peds_mix_min_term(model, payload, store, tier, weights)
    _add_fm1_peds_term(model, payload, store, tier, weights)
    _add_intern_pair_term(model, payload, store, tier, weights)


# ---- rule 42: dowPreference (tier 9) ----

def _add_dow_preference_term(payload: Payload, store: VarStore, tier: Tier, weights: dict) -> None:
    scale = int(weights["dowPreference"]["scale"])
    for p in payload.preferences:
        var = store.get_x(p.resident_id, p.shift_id, p.date)
        if var is None:
            continue
        tier.add(-scale * p.bonus, var, 1)


def build_objective(model, payload: Payload, store: VarStore, coverage_result: CoverageResult) -> ObjectiveInfo:
    weights = merged_weights(payload)
    tier_order = build_tier_order(payload.rule_priority)
    tiers = {name: Tier(name) for name in tier_order}

    _add_coverage_term(payload, tiers["coverageMin"], coverage_result, weights)
    target_deficit_vars = _add_target_deficit_terms(model, payload, store, tiers, weights)
    post_night_rest_penalties = _add_post_night_rest_term(model, payload, store, tiers["postNightRest"], weights)
    _add_fairness_terms(model, payload, store, tiers["fairness"], weights)
    _add_night_shape_term(model, payload, store, tiers["nightShape"], weights)
    _add_work_shape_term(model, payload, store, tiers["workShape"], weights)
    _add_band8_terms(model, payload, store, tiers["band8"], weights)
    _add_dow_preference_term(payload, store, tiers["dowPreference"], weights)

    bounds = {name: t.bound for name, t in tiers.items()}
    scales = derive_scales(tier_order, bounds)

    total_terms = []
    for name, t in tiers.items():
        scale = scales[name]
        for coef, expr in t.terms:
            total_terms.append((scale * coef) * expr)

    total_expr = sum(total_terms) if total_terms else 0
    model.minimize(total_expr)

    return ObjectiveInfo(
        total_expr=total_expr,
        coverage_slacks=coverage_result.slacks,
        post_night_rest_penalties=post_night_rest_penalties,
        target_deficit_vars=target_deficit_vars,
        tier_order=tier_order,
        tier_scales=scales,
        tier_bounds=bounds,
    )
