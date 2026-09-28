"""Rule 19 (work-day linking + max 6 consecutive work days) and rule 20
(>=24h rest after a completed 6-day run).

A "workday" is broader than "has a shift": it's also true on the resident's
own obligation days (GR weekday, JC presenting) per the payload's resolved
`obligations` map (rule 19 input, already suppressed by vacation/off in JS).
This module owns the `work[r, d]` link for exactly that reason -- the
obligation fact is workday-limits-specific data, not something variables.py
or any other family needs.

R9 follow-up (2026-09-27): a GR-weekday obligation (never JC -- see
`Payload.obligations_exempt_after_night`'s own docstring) only counts as
worked when the resident did NOT work a night-type shift the calendar day
before (`ResidentScheduler.jsx`'s `isStreakWorkDay` post-overnight GR
exemption). That fact is now reified against the model's own `night[r, d-1]`
decision var (`_obligation_term` below) instead of read from a static payload
input computed once up front -- a static input could never see a night shift
the solver itself (via warm-start hint or its own free choice) places the day
before, and either wrongly forced a phantom workday or, if computed from a
hint schedule, went stale the moment the real solve diverged from that hint.
See docs/PAYLOAD_SCHEMA.md's dated section for the full history.
"""

from __future__ import annotations

from solver.io.payload import Payload
from solver.model import timing
from solver.model.variables import VarStore, as_literal

WORK_RUN_WINDOW = 7   # sliding window length; hard cap is window-1 = 6 consecutive workdays
WORK_RUN_MAX = 6
RUN_LENGTH = 6         # the "completed run" length rule 20 measures from
REQUIRED_REST_AFTER_RUN_MIN = 24 * 60
_D2_SCAN_DAYS = (1, 2, 3)  # generous vs. rest.py's (1,2): longest shift here can be ~13h

FAMILY_CONSECUTIVE_WORK = "consecutiveWork"
FAMILY_POST_RUN6_REST = "postRun6Rest"


def _work_term_for_position(payload: Payload, store: VarStore, resident, idx: int):
    date_str = payload.all_dates[idx]
    if idx < len(payload.tail_dates):
        worked = date_str in resident.prior_tail
        obligated = date_str in resident.prior_tail_obligations
        return 1 if (worked or obligated) else 0
    return store.work[(resident.id, date_str)]


def add_workday_limit_constraints(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    _link_work(model, payload, store)
    _add_six_day_window(model, payload, store, enforcement)
    _add_post_run6_rest(model, payload, store, enforcement)


def _obligation_term(payload: Payload, store: VarStore, resident, date_str: str, obligations, exempt_dates):
    """The (possibly non-constant) obligation term for `_link_work` below: 1
    if `date_str` is one of `resident`'s own GR-weekday/JC-presenting
    `obligations` dates -- UNLESS it's also in `exempt_dates` (GR only -- see
    `Payload.obligations_exempt_after_night`'s own docstring for why JC dates
    never appear there) AND the resident worked a night-type shift the
    calendar day before, in which case it's 0. Mirrors isStreakWorkDay's own
    post-overnight GR exemption in ResidentScheduler.jsx exactly: JC's
    unconditional-true branch runs BEFORE that exemption check there, so a JC
    date is never exempt.

    Returns a plain python int when the date isn't obligated at all, or when
    it IS obligated but not exemptable (JC, or an older payload that never
    sends `obligationsExemptAfterNight` at all -- back-compat: every
    obligation counts as worked unconditionally, same as before this fix).
    Otherwise returns a CP-SAT affine expression `1 - night[r, d-1]` built off
    the resident's own `night` decision var for an in-block prior date, or a
    plain int for a prior-tail date (already-happened history, not a
    decision) -- `night` is provably 0/1 (at-most-one-shift-per-day), so this
    never needs its own reified BoolVar.
    """
    if date_str not in obligations:
        return 0
    if date_str not in exempt_dates:
        return 1
    prev_date = timing.add_days(date_str, -1)
    if prev_date in payload.block.dates:
        return 1 - store.night[(resident.id, prev_date)]
    prior_shift_id = resident.prior_tail.get(prev_date)
    was_night = bool(prior_shift_id) and prior_shift_id in payload.shifts and payload.shifts[prior_shift_id].is_night
    return 0 if was_night else 1


def _link_work(model, payload: Payload, store: VarStore) -> None:
    """work[r,d] == max(any shift assigned that day, obligation that day).
    `sum(x)` is provably in {0,1} thanks to the at-most-one-per-day
    constraint, and (see `_obligation_term`) so is the obligation term itself,
    so three plain linear inequalities pin `work` exactly without needing a
    reified AddMaxEquality:
        work >= sum(x)          (a shift forces work=1)
        work >= obligation      (an obligation forces work=1)
        work <= sum(x) + obligation   (neither present forces work=0)
    """
    for resident in payload.residents:
        obligations = payload.obligations.get(resident.id, set())
        exempt_dates = payload.obligations_exempt_after_night.get(resident.id, set())
        for date_str in payload.block.dates:
            work_var = store.work[(resident.id, date_str)]
            x_terms = store.x_sum_for_resident_date(resident.id, date_str)
            obligation_term = _obligation_term(payload, store, resident, date_str, obligations, exempt_dates)
            model.add(work_var >= sum(x_terms))
            model.add(work_var >= obligation_term)
            model.add(work_var <= sum(x_terms) + obligation_term)


def _add_six_day_window(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    n = len(payload.all_dates)
    tail_len = len(payload.tail_dates)
    for resident in payload.residents:
        def get_term(idx, _r=resident):
            return _work_term_for_position(payload, store, _r, idx)

        for start, terms in timing.rolling_window(get_term, n, WORK_RUN_WINDOW):
            if start + WORK_RUN_WINDOW <= tail_len:
                continue  # constants only
            lit = enforcement(resident.id, FAMILY_CONSECUTIVE_WORK) if enforcement else None
            c = model.add(sum(terms) <= WORK_RUN_MAX)
            if lit is not None:
                c.only_enforce_if(lit)


def _run6_end_terms(model, payload: Payload, store: VarStore, resident):
    """idx -> (int constant | BoolVar): 'a 6-consecutive-workday run completes
    AT this position' (i.e. positions idx-5..idx are all workdays). Forced to
    1 exactly when the window is fully worked (both directions enforced by
    the AND-biconditional reification), never elsewhere.
    """
    tail_len = len(payload.tail_dates)
    n = len(payload.all_dates)
    out = {}
    for idx in range(RUN_LENGTH - 1, n):
        window = [_work_term_for_position(payload, store, resident, i) for i in range(idx - RUN_LENGTH + 1, idx + 1)]
        if idx < tail_len:
            out[idx] = 1 if all(t == 1 for t in window) else 0
            continue
        lits = [as_literal(model, t) for t in window]
        b = model.new_bool_var(f"run6_end[{resident.id},{payload.all_dates[idx]}]")
        model.add_bool_and(lits).only_enforce_if(b)
        model.add_bool_or([lit.negated() for lit in lits]).only_enforce_if(b.negated())
        out[idx] = b
    return out


def _add_post_run6_rest(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    tail_len = len(payload.tail_dates)
    for resident in payload.residents:
        run6_end = _run6_end_terms(model, payload, store, resident)  # stays hard: a definitional reification, not a policy limit

        for idx, run6_val in run6_end.items():
            date1 = payload.all_dates[idx]
            is_tail_day1 = idx < tail_len

            if is_tail_day1:
                if run6_val == 0:
                    continue
                shift_id1 = payload.resident(resident.id).prior_tail.get(date1)
                if shift_id1 is None:
                    continue  # obligation-only tail day -- no shift to measure rest from
                shift1_candidates = [(shift_id1, None)]
            else:
                shift1_candidates = store.by_resident_date.get((resident.id, date1), [])

            for shift_id1, var1 in shift1_candidates:
                shift1 = payload.shifts[shift_id1]
                for delta in _D2_SCAN_DAYS:
                    date2 = timing.add_days(date1, delta)
                    if date2 not in payload.block.dates:
                        continue
                    for shift_id2, var2 in store.by_resident_date.get((resident.id, date2), []):
                        shift2 = payload.shifts[shift_id2]
                        gap = timing.gap_between(date1, shift1, date2, shift2)
                        if gap >= REQUIRED_REST_AFTER_RUN_MIN:
                            continue
                        lit = enforcement(resident.id, FAMILY_POST_RUN6_REST) if enforcement else None
                        _forbid_triple(model, run6_val, var1, var2, lit)


def _forbid_triple(model, run6_val, var1, var2, enforce_lit=None) -> None:
    """Forbid (run6_end AND shift1 AND shift2) firing together. `run6_val` is
    a plain python int ONLY when day1 was a tail day (in which case `var1` is
    also None -- a known-true tail fact); otherwise both are real CP-SAT
    objects. `var2` is always a real in-block x-var. Must check `isinstance`
    before any `==` comparison -- CP-SAT IntVar equality builds a constraint
    expression, not a python bool, so `if some_intvar == 0` raises rather
    than evaluating.

    `enforce_lit`, when given, gates whichever branch actually fires -- see
    variables.py's `forbid_pair` docstring for the same pass-2 convention.
    """
    if isinstance(run6_val, int):
        if run6_val == 0:
            return
        if var1 is None:
            # tail fact: shift1 is certainly assigned, and run6_val == 1 here.
            c = model.add(var2 == 0)
        else:
            c = model.add(var1 + var2 <= 1)
    else:
        c = model.add_bool_or([run6_val.negated(), var1.negated(), var2.negated()])
    if enforce_lit is not None:
        c.only_enforce_if(enforce_lit)
