"""Assembles every soft term (rules 32-42) into ONE integer linear objective.

WEIGHT SCHEME (2026-08-21 rewrite -- replaces a broken multiplicative ratchet):

Every term gets a fixed, MODERATE integer weight straight from
`config/default_weights.json` (merged with any `payload.config.weights`
override) -- no derived scaling. The old scheme instead computed one integer
SCALE per priority tier bottom-up, each tier's scale sized to exactly exceed
the tier below's maximum possible contribution (`bounds[next] * scales[next]
+ 1`), clamped by a `MAX_TIER_SCALE` of 1e9 once nine levels of exact
multiplicative compounding threatened int64 overflow. On a realistically
sized payload (dozens of residents, ~28 dates) that clamp triggered by
mid-stack, so MULTIPLE tiers -- including tier-1 coverageMin slack -- ended
up with the identical 1e9 weight. Lexicographic domination collapsed to
equality: an assignment that triggered several equally-weighted penalty
units (a workShape isolated day, a nightShape run edge, a fairness-spread
move, ...) made leaving a coverage slot EMPTY cheaper than filling it. Full
repro: `docs/` bug notes / the 58-resident production block that filled only
~90-295 of 482 min-coverage slots depending on time budget. The clamped
coefficients (~1e12) also made CP-SAT's search itself far slower.

The fix does not try to build a more careful ratchet -- three separate
attempts (recorded, not repeated here) showed that requiring each tier's
PER-UNIT weight to exceed 10x the SUM of every literal in every tier below it
is mathematically incompatible with int64 once any tier has hundreds of
literals stacked three or four tiers deep: the required weight grows by
roughly (10 x pool_size) per tier, so it blows past 9.2e18 by the third
level regardless of the starting point. That growth pattern is exactly what
broke the old scheme. Instead:

  - coverageMin and targetDeficit(Core) both push TOWARD assigning a shift,
    so they need no astronomical separation from each other -- a resident
    one short of target and an empty coverage slot are already pulling the
    solver the same direction.
  - What coverageMin actually needs to dominate is the SUM of every
    per-assignment ANTI-fill term (isolatedNight/workShape/fairness/band8/
    dowPreference/the batch-2 trauma-run-placement terms) that could
    conceivably prefer leaving a slot empty. Under the shipped weights that
    sum is comfortably below coverageMin's 1,000,000 with a >100x margin,
    asserted by `tests/test_weight_tiering.py` (see that file's
    `_anti_fill_sum` for the exact per-term accounting, updated for batch 2's
    2026-08-22 addition of traumaSecondInRun/traumaMidRun/
    nightDurationAlternation/secondRestDay -- `pedsInternNightDeficit` is
    excluded from that sum on purpose: like targetDeficit, it pushes TOWARD
    assigning a shift, not away from it).
  - postNightRest is a duty-safety soft rule (rest after a night run), so it
    sits well above the "toward-fill" terms and far above the anti-fill
    preference terms, but does not need to out-rank coverageMin/
    targetDeficitCore by construction -- `rulePriority` handles that
    reordering explicitly (see below), not a blanket tier ratchet.

`payload.rulePriority` still lets the chief promote `postNightRest` above
`coverageMin` (`seniorComposition`, its third canonical entry, is a hard
rule and never appears in the objective at all -- see
`solver/model/senior_composition.py`). Rather than rebuild a lexicographic
chain, `apply_rule_priority` just keeps the higher-ranked of the two at its
configured weight and divides the other's configured weight by 10 (there are
only ever two objective-relevant entries, so "per rank drop" is at most one
division). This is a deliberately simple, moderate adjustment -- not a proof
of exact dominance -- consistent with the rest of this rewrite.

CP-SAT coefficients and the running objective sum stay integer throughout;
see `tests/test_weight_tiering.py` for the numeric invariants this file is
held to.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from solver.io.payload import Payload
from solver.model import timing
from solver.model.coverage import CoverageResult
from solver.model.count_caps import terms_for
from solver.model.em_composition import add_em_composition_terms, add_pgy_fallback_terms
from solver.model.sequence_constraints import add_soft_sequence_constraint
from solver.model.trauma_runs import (
    add_night_duration_alternation_terms,
    add_peds_intern_night_deficit_term,
    add_second_rest_day_terms,
    add_trauma_mid_run_terms,
    add_trauma_second_in_run_terms,
)
from solver.model.variables import VarStore, as_literal, resident_candidates

DEFAULT_WEIGHTS_PATH = Path(__file__).resolve().parents[2] / "config" / "default_weights.json"

SATURDAY = 5
SUNDAY = 6
MAX_CONSECUTIVE_WORK_DAYS = 6

# The only two rulePriority entries that ever influence the objective --
# `seniorComposition` (rulePriority's third canonical entry) is a hard rule
# and is intentionally never looked up here.
PRIORITY_ORDERABLE_TERMS = ("coverageMin", "postNightRest")
PRIORITY_WEIGHT_KEY = {"coverageMin": "perSlack", "postNightRest": "perViolation"}
PRIORITY_DEMOTION_DIVISOR = 10


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


def _priority_order(rule_priority: list) -> list:
    """Relative order of the two objective-relevant rulePriority entries,
    ignoring `seniorComposition` and any unknown entry entirely. Missing or
    duplicate entries fall back to `PRIORITY_ORDERABLE_TERMS`'s own default
    order (coverageMin first)."""
    known = [r for r in rule_priority if r in PRIORITY_ORDERABLE_TERMS]
    for name in PRIORITY_ORDERABLE_TERMS:
        if name not in known:
            known.append(name)
    return known


def apply_rule_priority(weights: dict, rule_priority: list) -> dict:
    """Returns a copy of `weights` with the lower-ranked of coverageMin/
    postNightRest divided by `PRIORITY_DEMOTION_DIVISOR`. The higher-ranked
    one is left exactly as configured -- see module docstring for why this
    replaces the old lexicographic tier ratchet instead of extending it."""
    order = _priority_order(rule_priority)
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in weights.items()}
    for rank, name in enumerate(order):
        if rank == 0 or name not in out:
            continue
        key = PRIORITY_WEIGHT_KEY[name]
        sub = out[name]
        if isinstance(sub, dict) and key in sub:
            sub[key] = max(1, int(sub[key]) // (PRIORITY_DEMOTION_DIVISOR ** rank))
    return out


class TermGroup:
    """Flat accumulator for one weighted-term family. Replaces the old
    `Tier` class, which additionally tracked each term's declared upper
    bound so the removed `derive_scales` ratchet could size a tier's scale
    against the tier below it. Nothing needs a declared bound anymore -- a
    family's terms are summed directly at its own fixed weight."""

    def __init__(self, name: str):
        self.name = name
        self.terms = []  # list[(coef:int, expr)]

    def add(self, coef: int, expr) -> None:
        if coef != 0:
            self.terms.append((coef, expr))


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
    weights: dict = field(default_factory=dict)  # final, rule-priority-adjusted weights actually used


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


def _add_spread(model, group: TermGroup, prefix: str, weight: int, values: list, value_ub: int) -> None:
    if weight == 0 or len(values) < 2:
        return
    mx = model.new_int_var(0, value_ub, f"{prefix}_max")
    mn = model.new_int_var(0, value_ub, f"{prefix}_min")
    model.add_max_equality(mx, values)
    model.add_min_equality(mn, values)
    group.add(weight, mx - mn)


# ---- rule 24: coverageMin slack ----

def _add_coverage_term(payload: Payload, group: TermGroup, coverage_result: CoverageResult, weights: dict) -> None:
    coef = int(weights["coverageMin"]["perSlack"])
    for (shift_id, date_str), slack in coverage_result.slacks.items():
        group.add(coef, slack)


# ---- rule 33: targetDeficit, core and non-core ----

def _add_target_deficit_terms(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> dict:
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
        coef = core_coef if resident.is_em_core else noncore_coef
        group.add(coef, deficit)
    return result


# ---- rule 34: postNightRest ----

def _add_post_night_rest_term(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> list:
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
                        group.add(coef, p)
                        penalties.append(
                            PostNightRestPenalty(resident.id, date1, shift_id1, date2, shift_id2, gap, p)
                        )
    return penalties


# ---- rule 35: fairness ----

def _add_fairness_terms(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> None:
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
        _add_spread(model, group, f"fair_deficit[{cohort_name}]", w_deficit, ratios, 100)

        if D > 0:
            nights_ub = D + max((r.ay_prior.nights for r in members), default=0)
            nights_vals = []
            for r in members:
                v = model.new_int_var(0, nights_ub, f"fair_nights[{cohort_name},{r.id}]")
                model.add(v == sum(store.night[(r.id, d)] for d in payload.block.dates) + r.ay_prior.nights)
                nights_vals.append(v)
            _add_spread(model, group, f"fair_nights[{cohort_name}]", w_night, nights_vals, nights_ub)

            if weekend_dates:
                weekend_ub = len(weekend_dates) + max((r.ay_prior.weekends for r in members), default=0)
                weekend_vals = []
                for r in members:
                    v = model.new_int_var(0, weekend_ub, f"fair_weekend[{cohort_name},{r.id}]")
                    model.add(v == sum(store.work[(r.id, d)] for d in weekend_dates) + r.ay_prior.weekends)
                    weekend_vals.append(v)
                _add_spread(model, group, f"fair_weekend[{cohort_name}]", w_weekend, weekend_vals, weekend_ub)

            if holiday_dates_in_block:
                holiday_ub = len(holiday_dates_in_block) + max((r.ay_prior.holidays for r in members), default=0)
                holiday_vals = []
                for r in members:
                    v = model.new_int_var(0, holiday_ub, f"fair_holiday[{cohort_name},{r.id}]")
                    model.add(v == sum(store.work[(r.id, d)] for d in holiday_dates_in_block) + r.ay_prior.holidays)
                    holiday_vals.append(v)
                _add_spread(model, group, f"fair_holiday[{cohort_name}]", w_holiday, holiday_vals, holiday_ub)


# ---- rule 36: isolatedNight (batch 2, 2026-08-22: relaxed from "nightShape") ----

def _add_isolated_night_term(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> None:
    """Batch 2's night-run-shape relaxation (plan section B): runs of 2-6
    nights are now free; ONLY an isolated single night (length exactly 1)
    still costs anything. Chief's benchmark data showed 61% of his real runs
    are length 1-3, so the previous `soft_min=4` (penalizing 1-3) was
    fighting his own actual scheduling pattern -- lowering `soft_min` to 2
    keeps `add_soft_sequence_constraint`'s per-length cost formula
    `min_cost * (soft_min - length)` at exactly `min_cost` for length 1 and
    0 for every length >= 2.

    Renamed from `nightShape` to `isolatedNight` (config key too) since that
    is now an accurate description of what it penalizes -- it no longer
    shapes anything about runs of 2 or more. `hard_max == soft_max == 6`
    (the real max-6-nights-per-run cap, enforced HARD by circadian.py's own
    sliding window) makes `add_soft_sequence_constraint`'s "over soft_max"
    cost branch structurally unreachable (its range is empty whenever
    `soft_max == hard_max`) -- true before this rewrite too, so `max_cost`
    is passed as a fixed 0 rather than kept as dead config surface.
    """
    coef = int(weights["isolatedNight"]["perUnit"])
    for resident in payload.residents:
        if resident.night_exempt:
            continue
        works = [store.night[(resident.id, d)] for d in payload.block.dates]
        if len(works) < 2:
            continue
        cost_lits, cost_coefs = add_soft_sequence_constraint(
            model, works,
            hard_min=1, soft_min=2, min_cost=coef,
            soft_max=6, hard_max=6, max_cost=0,
            prefix=f"isolatedNight[{resident.id}]",
        )
        for lit, c in zip(cost_lits, cost_coefs):
            group.add(c, lit)


# ---- rule 37: workShape ----

def _prev_work_term_before_block(payload: Payload, resident) -> int:
    if not payload.tail_dates:
        return 0
    date_str = payload.tail_dates[-1]
    worked = date_str in resident.prior_tail
    obligated = date_str in resident.prior_tail_obligations
    return 1 if (worked or obligated) else 0


def _add_work_shape_term(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> None:
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
            group.add(coef, lit)

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
        group.add(fragment_cost, excess)


# ---- rules 38-41: band8 ----

def _add_weekend_off_term(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> None:
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
        group.add(coef, has_off_weekend.negated())


def _add_peds_mix_min_term(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> None:
    coef = int(weights["pedsMixMin"]["perUnit"])
    for resident in payload.residents:
        cap = resident.caps.peds_mix_min
        if cap is None or cap <= 0:
            continue
        peds_terms = terms_for(payload, store, resident.id, lambda sid: payload.shifts[sid].area == "PED", lambda d: True)
        assigned = sum(peds_terms) if peds_terms else 0
        shortfall = model.new_int_var(0, cap, f"peds_min_shortfall[{resident.id}]")
        model.add_max_equality(shortfall, [cap - assigned, 0])
        group.add(coef, shortfall)


def _add_fm1_peds_term(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> None:
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
        group.add(coef, overage)


def _add_intern_pair_term(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> None:
    coef = int(weights["internPair"]["perExcess"])
    for (shift_id, date_str), pairs in store.by_shift_date.items():
        intern_terms = [var for resident_id, var in pairs if payload.residents_by_id[resident_id].is_intern]
        if len(intern_terms) < 2:
            continue
        ub = len(intern_terms) - 1
        over = model.new_int_var(0, ub, f"intern_pair[{shift_id},{date_str}]")
        model.add_max_equality(over, [sum(intern_terms) - 1, 0])
        group.add(coef, over)


def _add_band8_terms(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> None:
    _add_weekend_off_term(model, payload, store, group, weights)
    _add_peds_mix_min_term(model, payload, store, group, weights)
    _add_fm1_peds_term(model, payload, store, group, weights)
    _add_intern_pair_term(model, payload, store, group, weights)


# ---- batch 2 (chief round-2 plan, section A/C): trauma-run placement,
# night-duration alternation, 2nd rest day, intern peds-night target ----
# All five terms live in solver/model/trauma_runs.py (also owns the hard
# <=2-trauma-per-run cap, added separately by build.py/elastic.py -- see that
# module's docstring). Every one is a documented no-op when its payload
# field(s) are absent/empty/zero, so this call is unconditional here.

def _add_trauma_run_batch2_terms(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> None:
    add_trauma_second_in_run_terms(model, payload, store, group, int(weights["traumaSecondInRun"]["perUnit"]))
    add_trauma_mid_run_terms(model, payload, store, group, int(weights["traumaMidRun"]["perUnit"]))
    add_night_duration_alternation_terms(
        model, payload, store, group, int(weights["nightDurationAlternation"]["perUnit"])
    )
    add_second_rest_day_terms(model, payload, store, group, int(weights["secondRestDay"]["perUnit"]))
    add_peds_intern_night_deficit_term(
        model, payload, store, group, int(weights["pedsInternNightDeficit"]["perUnit"])
    )


# ---- round 2b: EM-count composition + PGY gating pool-restrict (soft cost
# translation) -- both live in solver/model/em_composition.py, both
# documented no-ops when their id-list payload field(s) are absent/empty. ----

def _add_em_composition_round2b_terms(model, payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> None:
    add_em_composition_terms(model, payload, store, group, weights)
    add_pgy_fallback_terms(model, payload, store, group, weights)


# ---- rule 42: dowPreference ----

def _add_dow_preference_term(payload: Payload, store: VarStore, group: TermGroup, weights: dict) -> None:
    scale = int(weights["dowPreference"]["scale"])
    for p in payload.preferences:
        var = store.get_x(p.resident_id, p.shift_id, p.date)
        if var is None:
            continue
        group.add(-scale * p.bonus, var)


def build_objective(model, payload: Payload, store: VarStore, coverage_result: CoverageResult) -> ObjectiveInfo:
    weights = apply_rule_priority(merged_weights(payload), payload.rule_priority)
    group = TermGroup("objective")

    _add_coverage_term(payload, group, coverage_result, weights)
    target_deficit_vars = _add_target_deficit_terms(model, payload, store, group, weights)
    post_night_rest_penalties = _add_post_night_rest_term(model, payload, store, group, weights)
    _add_fairness_terms(model, payload, store, group, weights)
    _add_isolated_night_term(model, payload, store, group, weights)
    _add_work_shape_term(model, payload, store, group, weights)
    _add_band8_terms(model, payload, store, group, weights)
    _add_trauma_run_batch2_terms(model, payload, store, group, weights)
    _add_em_composition_round2b_terms(model, payload, store, group, weights)
    _add_dow_preference_term(payload, store, group, weights)

    total_expr = sum((coef * expr for coef, expr in group.terms), start=0)
    model.minimize(total_expr)

    return ObjectiveInfo(
        total_expr=total_expr,
        coverage_slacks=coverage_result.slacks,
        post_night_rest_penalties=post_night_rest_penalties,
        target_deficit_vars=target_deficit_vars,
        weights=weights,
    )
