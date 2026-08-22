"""Batch 2 of the chief's round-2 plan (~/.claude/plans/refactor-this-app-s-
scheduling-stateless-locket.md, "Confirmed rule changes" A-C): trauma-night
placement inside a night run, night-duration alternation, a 2nd full rest day
after a long night run, and an intern peds-night target. Every rule here is
driven by five OPTIONAL payload fields (`traumaNightShiftIds`,
`pedsSplitInternIds`, `pedsNightShiftIds`, `pedsInternNightTarget`,
`alternationExemptDates`) that all default to empty/zero -- every constraint
and objective term this module adds is therefore a documented no-op on a
payload that doesn't set them (an empty `trauma_night_shift_ids` forces
`store.trauma[r,d] == 0` everywhere via `_link_trauma`, which propagates to
every rule below being permanently inert).

Encoding conventions shared by every soft term in this module (see
`_and_cost_var`/`_or_cost_var`): rather than a full two-directional boolean
reification (`add_bool_and`/`add_bool_or` in both directions, as
senior_composition.py's `staffed` var needs because OTHER constraints read
it), every derived var here is consumed ONLY as a positively-weighted term
inside the objective's minimization sum. For a "cost when AND holds" var,
one direction is sufficient: `v >= sum(terms) - (len(terms) - 1)` forces
`v == 1` exactly when every term is 1, and CP-SAT's own minimization pressure
(v costs money, nothing ever benefits from setting it higher than forced)
drives it to 0 whenever the AND doesn't hold -- there is no need for the
opposite-direction `add_bool_or` half at all. This is exactly the trick
`objective.py`'s pre-existing `postNightRest` term already uses for a 2-way
AND (`p >= term1 + var2 - 1`); this module just generalizes it to k terms
and adds the OR-dual (`v >= term_i` for each term, i.e. "the max"). Chaining
several such derived vars into a further AND/OR is still valid as long as
every one of them is only ever summed with a NONNEGATIVE coefficient into
something being minimized -- true of every call site below.
"""

from __future__ import annotations

from itertools import permutations

from solver.io.payload import Payload
from solver.model.variables import VarStore

# Mirrors circadian.py's NIGHT_RUN_MAX -- a night run can never exceed 6
# consecutive nights (hard, enforced by circadian.py's own sliding window),
# so "b - a in [2, 5]" below covers every possible window shorter than a
# full run (window length 3..6 inclusive).
TRAUMA_PER_RUN_HARD_CAP = 2

# BIG-M for the hard cap's "only binds when every day in the window is a
# night" gate (see `add_trauma_run_hard_cap`'s docstring for the derivation
# of why 3 is EXACT, not a rough safety margin, given trauma[r,d] <=
# night[r,d] for every d and a window length capped at 6).
TRAUMA_HARD_CAP_BIG_M = 3

MAX_WINDOW_OFFSET = 5  # b - a upper bound: a run can't exceed 6 nights (offset 5 = length 6)


# ---------------------------------------------------------------------------
# small "objective-only" reification helpers -- see module docstring
# ---------------------------------------------------------------------------

def _and_cost_var(model, name: str, terms: list):
    """[0,1] IntVar forced to 1 exactly when every term in `terms` (each a
    python 0/1 int or a CP-SAT BoolVar/LinearExpr) is 1; free to fall to 0
    under minimization pressure otherwise. See module docstring."""
    k = len(terms)
    v = model.new_int_var(0, 1, name)
    model.add(v >= sum(terms) - (k - 1))
    return v


def _or_cost_var(model, name: str, terms: list):
    """[0,1] IntVar forced to 1 when ANY term in `terms` is 1 (each term
    itself 0/1); free to fall to 0 under minimization pressure otherwise."""
    v = model.new_int_var(0, 1, name)
    for t in terms:
        model.add(v >= t)
    return v


# ---------------------------------------------------------------------------
# position helpers -- mirror circadian.py's/workday_limits.py's own private
# per-module `_*_term_for_position` helpers. Duplicated rather than imported
# (those are private to their own module) -- each is ~5 lines and this keeps
# "one owner per derived variable" intact per variables.py's own convention.
# ---------------------------------------------------------------------------

def _night_term_for_position(payload: Payload, store: VarStore, resident, idx: int):
    date_str = payload.all_dates[idx]
    if idx < len(payload.tail_dates):
        shift_id = resident.prior_tail.get(date_str)
        is_night = bool(shift_id) and shift_id in payload.shifts and payload.shifts[shift_id].is_night
        return 1 if is_night else 0
    return store.night[(resident.id, date_str)]


def _trauma_term_for_position(payload: Payload, store: VarStore, resident, idx: int):
    date_str = payload.all_dates[idx]
    if idx < len(payload.tail_dates):
        shift_id = resident.prior_tail.get(date_str)
        is_trauma = bool(shift_id) and shift_id in payload.trauma_night_shift_ids
        return 1 if is_trauma else 0
    return store.trauma[(resident.id, date_str)]


def _work_term_for_position(payload: Payload, store: VarStore, resident, idx: int):
    date_str = payload.all_dates[idx]
    if idx < len(payload.tail_dates):
        worked = date_str in resident.prior_tail
        obligated = date_str in resident.prior_tail_obligations
        return 1 if (worked or obligated) else 0
    return store.work[(resident.id, date_str)]


def _nightclass_term(payload: Payload, store: VarStore, resident, idx: int, shift_ids: frozenset):
    """The (possibly-constant) indicator that `resident` worked a night shift
    IN THIS DURATION CLASS on the date at `idx`. For an in-block date this is
    `sum(x[r,s,d] for s in shift_ids)`, not a fresh reified OR -- the
    at-most-one-shift-per-resident-per-day constraint (variables.py) already
    guarantees that sum is itself in {0,1}, so no extra var is needed."""
    date_str = payload.all_dates[idx]
    if idx < len(payload.tail_dates):
        shift_id = resident.prior_tail.get(date_str)
        return 1 if shift_id in shift_ids else 0
    vars_today = [v for sid, v in store.by_resident_date.get((resident.id, date_str), []) if sid in shift_ids]
    return sum(vars_today) if vars_today else 0


def _night_duration_classes(payload: Payload) -> dict:
    """durationH -> frozenset[shiftId], for every NIGHT-type shift in the
    catalog. Only classes with >=2 distinct duration values ever produce an
    alternation term (nothing to alternate between otherwise)."""
    classes: dict = {}
    for sid, s in payload.shifts.items():
        if s.is_night:
            classes.setdefault(s.duration_h, set()).add(sid)
    return {d: frozenset(ids) for d, ids in classes.items()}


# ---------------------------------------------------------------------------
# rule A (hard): <=2 trauma nights per contiguous night run
# ---------------------------------------------------------------------------

def _link_trauma(model, payload: Payload, store: VarStore) -> None:
    for resident in payload.residents:
        for date_str in payload.block.dates:
            trauma_vars = [
                var
                for shift_id, var in store.by_resident_date.get((resident.id, date_str), [])
                if shift_id in payload.trauma_night_shift_ids
            ]
            model.add(store.trauma[(resident.id, date_str)] == sum(trauma_vars))


def add_trauma_run_hard_cap(model, payload: Payload, store: VarStore) -> None:
    """Rule A's hard cap: never wrapped by pass-2 relaxation (solver/model/
    elastic.py) -- called identically from build.py and elastic.py, with no
    `enforcement` parameter at all, exactly like senior_composition.py's
    always-hard rule. The chief's rule is "never" allow a 3rd trauma night in
    one run, not "avoid when possible".

    Encoding: for every window [a, b] of consecutive dates with length 3..6
    (b - a in [2, 5] -- a run can't exceed 6 nights, and any SHORTER window
    trivially can't hold 3 trauma nights, so length 1-2 windows need no
    constraint at all):

        sum(trauma[d] for d in [a,b]) <= 2 + BIG_M * sum(1 - night[d] for d in [a,b])

    If every date in the window is a night (the window sits entirely inside
    one run), the right side is exactly 2 and the real cap binds. If ANY date
    in the window is a non-night day, the window spans a run BOUNDARY (or
    more than one run) and the constraint must not bind at all.

    BIG_M = 3 is EXACT here, not a rough safety margin, because
    trauma[r,d] <= night[r,d] is already guaranteed by `_link_trauma` (a
    trauma assignment IS a night assignment) -- so for a window of length L,
    the true trauma sum can never exceed L minus however many non-night days
    it contains. With exactly ONE non-night day in the window (the boundary
    case that most needs the constraint to go slack), the true trauma sum is
    at most L - 1, and L <= 6 (the hard night-run-length cap enforced
    separately by circadian.py), so L - 1 <= 5. The relaxed bound
    `2 + BIG_M * 1` must be >= 5, i.e. BIG_M >= 3. Any additional non-night
    day in the window only shrinks the true achievable trauma sum further
    while growing the relaxed bound linearly, so BIG_M = 3 stays sufficient
    for every non-night-day count from 1 up to L.
    """
    _link_trauma(model, payload, store)

    n = len(payload.all_dates)
    tail_len = len(payload.tail_dates)
    for resident in payload.residents:
        for a in range(n):
            for offset in range(2, MAX_WINDOW_OFFSET + 1):
                b = a + offset
                if b >= n:
                    break
                if b < tail_len:
                    continue  # entirely inside the tail -- constants only, nothing to constrain
                window = range(a, b + 1)
                trauma_terms = [_trauma_term_for_position(payload, store, resident, i) for i in window]
                nonnight_terms = [1 - _night_term_for_position(payload, store, resident, i) for i in window]
                model.add(sum(trauma_terms) <= TRAUMA_PER_RUN_HARD_CAP + TRAUMA_HARD_CAP_BIG_M * sum(nonnight_terms))


# ---------------------------------------------------------------------------
# rule A (soft): a 2nd trauma night in a run
# ---------------------------------------------------------------------------

def add_trauma_second_in_run_terms(model, payload: Payload, store: VarStore, group, coef: int) -> None:
    """One pair (d1, d2) of dates within 1..5 days of each other, with every
    date in between also a night (same run), can have `trauma[d1] ==
    trauma[d2] == 1` simultaneously -- given the hard cap above already
    forbids a 3rd trauma night in any one run, AT MOST ONE such pair can ever
    be simultaneously true for a given run in a feasible schedule, so summing
    this cost var over every candidate pair charges exactly one penalty unit
    per run that ends up with 2 trauma nights, not per pair."""
    if coef == 0:
        return
    n = len(payload.all_dates)
    tail_len = len(payload.tail_dates)
    for resident in payload.residents:
        for a in range(n):
            for offset in range(1, MAX_WINDOW_OFFSET + 1):
                b = a + offset
                if b >= n:
                    break
                if b < tail_len:
                    continue
                window = range(a, b + 1)
                terms = [_trauma_term_for_position(payload, store, resident, a)]
                terms.append(_trauma_term_for_position(payload, store, resident, b))
                terms.extend(_night_term_for_position(payload, store, resident, i) for i in window)
                p = _and_cost_var(model, f"traumaSecondInRun[{resident.id},{a},{b}]", terms)
                group.add(coef, p)


# ---------------------------------------------------------------------------
# rule A (soft): trauma night in the MIDDLE of a mixed run
# ---------------------------------------------------------------------------

def add_trauma_mid_run_terms(model, payload: Payload, store: VarStore, group, coef: int) -> None:
    """mid[r,d] = trauma[d] AND night[d-1] AND night[d+1] AND NOT(trauma[d-1]
    AND trauma[d+1]) -- `d` is strictly interior to a run (both neighbors are
    nights, so the run has length >= 3) and the run is "mixed" (not every
    night in it is trauma). The hard cap above already guarantees a run of
    length >= 3 has at most 2 trauma nights, so the "mixed" condition is
    actually implied whenever the first three conjuncts hold -- it is
    included anyway so this term stays correct on its own, independent of
    the hard cap continuing to hold exactly as encoded (defense in depth,
    per the plan's own suggested encoding). Pure-trauma runs (impossible at
    length >= 3 under the hard cap), 1-night runs, and start/end placements
    (a neighbor is not a night) are free, matching the chief's rule."""
    if coef == 0:
        return
    n = len(payload.all_dates)
    tail_len = len(payload.tail_dates)
    for resident in payload.residents:
        for idx in range(max(tail_len, 1), n - 1):
            date_str = payload.all_dates[idx]
            trauma_d = _trauma_term_for_position(payload, store, resident, idx)
            night_prev = _night_term_for_position(payload, store, resident, idx - 1)
            night_next = _night_term_for_position(payload, store, resident, idx + 1)
            trauma_prev = _trauma_term_for_position(payload, store, resident, idx - 1)
            trauma_next = _trauma_term_for_position(payload, store, resident, idx + 1)

            mixed = _or_cost_var(
                model, f"traumaMixedRun[{resident.id},{date_str}]",
                [1 - trauma_prev, 1 - trauma_next],
            )
            p = _and_cost_var(
                model, f"traumaMidRun[{resident.id},{date_str}]",
                [trauma_d, night_prev, night_next, mixed],
            )
            group.add(coef, p)


# ---------------------------------------------------------------------------
# rule A (soft): alternating different-duration night shifts in one run
# ---------------------------------------------------------------------------

def add_night_duration_alternation_terms(model, payload: Payload, store: VarStore, group, coef: int) -> None:
    """Generalizes the trauma-9h-vs-other-durations mixing rule to ANY pair
    of night-shift durations (also covers D12/N12 conference windows):
    penalize a resident working one duration class on date d and a DIFFERENT
    duration class on date d+1, grouped by duration rather than by shift id
    (`nightclass_c[r,d]` = the sum of x-vars in duration class c on date d,
    provably 0/1 already thanks to the at-most-one-shift-per-day
    constraint) so this stays O(durations^2) per date pair rather than
    O(shifts^2). Exempts any pair straddling a chief-flagged 12h-conference-
    window boundary date (`alternationExemptDates`) -- that mixing is
    calendar-forced, not a scheduling choice."""
    if coef == 0:
        return
    classes = _night_duration_classes(payload)
    if len(classes) < 2:
        return
    durations = sorted(classes)
    n = len(payload.all_dates)
    tail_len = len(payload.tail_dates)
    exempt = payload.alternation_exempt_dates

    for resident in payload.residents:
        for idx in range(n - 1):
            if idx + 1 < tail_len:
                continue  # entirely inside the tail
            date1 = payload.all_dates[idx]
            date2 = payload.all_dates[idx + 1]
            if date1 in exempt or date2 in exempt:
                continue
            for d1, d2 in permutations(durations, 2):
                term1 = _nightclass_term(payload, store, resident, idx, classes[d1])
                term2 = _nightclass_term(payload, store, resident, idx + 1, classes[d2])
                p = _and_cost_var(model, f"nightDurAlt[{resident.id},{date1},{d1}-{d2}]", [term1, term2])
                group.add(coef, p)


# ---------------------------------------------------------------------------
# rule B (soft): a 2nd full rest day after a night run of >=3 nights
# ---------------------------------------------------------------------------

def add_second_rest_day_terms(model, payload: Payload, store: VarStore, group, coef: int) -> None:
    """runEnd3plus[r,e] = night[e-2] AND night[e-1] AND night[e] AND NOT
    night[e+1] -- `e` is the last night of a run whose final 3 positions are
    all nights (sufficient to prove length >= 3 given the separate hard
    6-night-run cap; no need to walk further back). Penalizes working ANY
    shift on `e+2`, the 2nd rest day after that run ends. Skips when e+2
    would fall beyond the known date horizon (`payload.all_dates`) -- the
    plan's own block-edge exemption, since a run that hasn't been observed to
    truly end yet has an unknown continuation."""
    if coef == 0:
        return
    n = len(payload.all_dates)
    tail_len = len(payload.tail_dates)
    for resident in payload.residents:
        for e in range(2, n - 2):
            if e + 2 < tail_len:
                continue  # entirely inside the tail
            night_e2 = _night_term_for_position(payload, store, resident, e - 2)
            night_e1 = _night_term_for_position(payload, store, resident, e - 1)
            night_e = _night_term_for_position(payload, store, resident, e)
            night_next = _night_term_for_position(payload, store, resident, e + 1)
            run_end = _and_cost_var(
                model, f"traumaRunEnd3plus[{resident.id},{e}]",
                [night_e2, night_e1, night_e, 1 - night_next],
            )
            work_e2 = _work_term_for_position(payload, store, resident, e + 2)
            p = _and_cost_var(model, f"secondRestDay[{resident.id},{e}]", [run_end, work_e2])
            group.add(coef, p)


# ---------------------------------------------------------------------------
# rule C (soft): intern peds-night deficit
# ---------------------------------------------------------------------------

def add_peds_intern_night_deficit_term(model, payload: Payload, store: VarStore, group, coef: int) -> None:
    """deficit_r = max(0, pedsInternNightTarget - assigned_peds_nights_r) for
    every resident named in `pedsSplitInternIds` -- soft-target push toward
    ~5-6 clustered peds nights for TRAUMA_PEDS/PEDS_TRAUMA interns (the
    `allowSplitPedsNights` chief toggle and eligibility itself are already
    resolved upstream in JS; this term only prefers MORE of the peds-night
    shifts the resident is already eligible for, exactly like
    `targetDeficit`'s own max-equality pattern)."""
    target = payload.peds_intern_night_target
    if coef == 0 or target <= 0 or not payload.peds_split_intern_ids or not payload.peds_night_shift_ids:
        return
    for resident in payload.residents:
        if resident.id not in payload.peds_split_intern_ids:
            continue
        terms = []
        for date_str in payload.block.dates:
            for shift_id, var in store.by_resident_date.get((resident.id, date_str), []):
                if shift_id in payload.peds_night_shift_ids:
                    terms.append(var)
        assigned = sum(terms) if terms else 0
        deficit = model.new_int_var(0, target, f"pedsInternNightDeficit[{resident.id}]")
        model.add_max_equality(deficit, [target - assigned, 0])
        group.add(coef, deficit)
