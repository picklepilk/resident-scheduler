"""Rule 18 (eve<->day adjacency + night-run<=6 sliding window), rule 22 (max
nights/block), rule 23 (<=2 separate night-run segments/block).

Owns the `night[r, d]` link (`night == 1` iff a night-type shift is assigned
that day) since every rule in this module needs it and nothing outside it
does -- see variables.py's module docstring for why that link lives with its
sole consumer rather than in variables.py itself.
"""

from __future__ import annotations

from solver.io.payload import Payload
from solver.model import timing
from solver.model.variables import VarStore, as_literal, forbid_pair, resident_candidates

NIGHT_RUN_WINDOW = 7   # sliding window length; hard cap is window-1 = 6 consecutive nights
NIGHT_RUN_MAX = 6

# Rule-registry family names for the two DISTINCT relaxable rules this module
# owns (rule 18's eve/day adjacency + night-run window, rule 22's per-block
# cap, rule 23's segment cap) -- each gets its own `ok[resident, family]`
# literal from pass 2 (solver/model/elastic.py), never shared.
FAMILY_CIRCADIAN_PAIR = "circadianPair"
FAMILY_NIGHT_RUN_MAX = "nightRunMax"
FAMILY_NIGHT_CAP = "nightCap"
FAMILY_NIGHT_SEGMENTS = "nightSegments"


def _term_for_position(payload: Payload, store: VarStore, resident, idx: int):
    """The (possibly constant) night-indicator term for `resident` at position
    `idx` in `payload.all_dates` (tail dates first, then block dates)."""
    date_str = payload.all_dates[idx]
    if idx < len(payload.tail_dates):
        shift_id = resident.prior_tail.get(date_str)
        is_night = bool(shift_id) and shift_id in payload.shifts and payload.shifts[shift_id].is_night
        return 1 if is_night else 0
    return store.night[(resident.id, date_str)]


def add_circadian_constraints(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    _link_night(model, payload, store)
    _add_eve_day_pairs(model, payload, store, enforcement)
    _add_night_run_window(model, payload, store, enforcement)
    _add_night_cap(model, payload, store, enforcement)
    _add_night_run_segments(model, payload, store, enforcement)


def _link_night(model, payload: Payload, store: VarStore) -> None:
    for resident in payload.residents:
        for date_str in payload.block.dates:
            night_shift_vars = [
                var
                for shift_id, var in store.by_resident_date.get((resident.id, date_str), [])
                if payload.shifts[shift_id].is_night
            ]
            model.add(store.night[(resident.id, date_str)] == sum(night_shift_vars))


def _add_eve_day_pairs(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    """Hard: an eve shift can never be immediately followed by a day shift the
    next calendar day, and a day shift can never be immediately followed by
    an eve shift the next calendar day (both directions are separately
    forbidden per the rule registry, independent of plain rest-hour math).
    """
    for resident in payload.residents:
        by_date = {}
        for date_str, shift_id, var in resident_candidates(payload, store, resident.id):
            by_date.setdefault(date_str, []).append((shift_id, var))
        date_set = set(by_date.keys())

        for date1 in by_date:
            date2 = timing.add_days(date1, 1)
            if date2 not in date_set:
                continue
            for shift_id1, var1 in by_date[date1]:
                type1 = payload.shifts[shift_id1].type
                if type1 not in ("eve", "day"):
                    continue
                forbidden_type2 = "day" if type1 == "eve" else "eve"
                for shift_id2, var2 in by_date[date2]:
                    if payload.shifts[shift_id2].type == forbidden_type2:
                        lit = enforcement(resident.id, FAMILY_CIRCADIAN_PAIR) if enforcement else None
                        forbid_pair(model, var1, var2, lit)


def _add_night_run_window(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    """Rule 18's hard consecutive-night cap, encoded as: no 7-day window may
    sum to more than 6 nights. Any 7 consecutive night shifts would sum to 7
    in their own window, so this forbids a run of 7+ while additionally
    forbidding some non-contiguous 7-in-7 patterns -- a deliberately
    conservative superset, per the plan's "sliding 7-day window" spec.
    """
    n = len(payload.all_dates)
    tail_len = len(payload.tail_dates)
    for resident in payload.residents:
        def get_term(idx, _r=resident):
            return _term_for_position(payload, store, _r, idx)

        for start, terms in timing.rolling_window(get_term, n, NIGHT_RUN_WINDOW):
            if start + NIGHT_RUN_WINDOW <= tail_len:
                continue  # window entirely inside the tail -- constants only, nothing to constrain
            lit = enforcement(resident.id, FAMILY_NIGHT_RUN_MAX) if enforcement else None
            c = model.add(sum(terms) <= NIGHT_RUN_MAX)
            if lit is not None:
                c.only_enforce_if(lit)


def _add_night_cap(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    """Rule 22: total nights THIS block <= caps.nights, unless night-exempt
    (e.g. a night-only resident like FM-3, whose Mon/Tue/Wed-only day rule
    already makes a long night run structurally impossible)."""
    for resident in payload.residents:
        if resident.night_exempt or resident.caps.nights is None:
            continue
        nights_this_block = [store.night[(resident.id, d)] for d in payload.block.dates]
        lit = enforcement(resident.id, FAMILY_NIGHT_CAP) if enforcement else None
        c = model.add(sum(nights_this_block) <= resident.caps.nights)
        if lit is not None:
            c.only_enforce_if(lit)


def _add_night_run_segments(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    """Rule 23: at most 2 separate night-run segments per block. A "start of
    run" fires when today is a night and yesterday wasn't -- a run continuing
    from the prior-tail window is NOT a new start, which is exactly what
    comparing against the (possibly constant) previous-day term achieves.
    The start-of-run REIFICATION stays hard/unconditional even in pass 2 --
    it's a definitional derived variable, not a policy limit; only the final
    `<= 2` cap is what rule 23 actually relaxes.
    """
    tail_len = len(payload.tail_dates)
    for resident in payload.residents:
        starts = []
        for idx in range(tail_len, len(payload.all_dates)):
            date_str = payload.all_dates[idx]
            cur = as_literal(model, _term_for_position(payload, store, resident, idx))
            prev = as_literal(model, _term_for_position(payload, store, resident, idx - 1))

            start_var = model.new_bool_var(f"night_run_start[{resident.id},{date_str}]")
            model.add_bool_and([cur, prev.negated()]).only_enforce_if(start_var)
            model.add_bool_or([cur.negated(), prev]).only_enforce_if(start_var.negated())
            starts.append(start_var)

        if starts:
            lit = enforcement(resident.id, FAMILY_NIGHT_SEGMENTS) if enforcement else None
            c = model.add(sum(starts) <= 2)
            if lit is not None:
                c.only_enforce_if(lit)
