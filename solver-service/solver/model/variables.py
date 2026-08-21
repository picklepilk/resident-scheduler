"""Decision variables shared by every constraint family.

Creates:
- `x[r, s, d]` -- BoolVar, only for (resident, shift, date) triples that are
  either in the resolved `eligible` set or explicitly `locked`. A locked cell
  whose shift isn't in that day's eligible set still gets a var (locked wins)
  -- see `_locked_triples`.
- `work[r, d]` / `night[r, d]` -- bare BoolVars, declared here but NOT linked
  to `x` here. The link for `work` needs the day's obligation flag (rule 19,
  an "obligation day counts as worked even with no shift" fact that lives in
  the payload, not in this module) so that linking constraint is added by
  `workday_limits.py`. The link for `night` only needs shift-type data, but
  is likewise added by its sole consumer, `circadian.py`, to keep one owner
  per derived variable's defining constraint.

Also builds the at-most-one-shift-per-resident-per-day constraint and pins
locked cells to 1 -- these are structural facts about `x` itself, not tied to
any one rule family, so they belong here.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from solver.io.payload import Payload


def const_lit(model, value: int):
    """A fixed-value CP-SAT literal (usable in add_bool_and/or, OnlyEnforceIf,
    and linear sums alike) for a prior-tail constant. Prefer a plain python
    int in pure linear-sum contexts; use this wherever boolean-logic APIs
    require a literal object rather than a python bool/int.
    """
    return model.new_constant(1 if value else 0)


@dataclass
class VarStore:
    model: object
    x: dict = field(default_factory=dict)             # (residentId, shiftId, date) -> BoolVar
    work: dict = field(default_factory=dict)           # (residentId, date) -> BoolVar
    night: dict = field(default_factory=dict)          # (residentId, date) -> BoolVar
    by_resident_date: dict = field(default_factory=dict)  # (residentId, date) -> list[(shiftId, BoolVar)]
    by_shift_date: dict = field(default_factory=dict)     # (shiftId, date) -> list[(residentId, BoolVar)]

    def get_x(self, resident_id: str, shift_id: str, date_str: str):
        return self.x.get((resident_id, shift_id, date_str))

    def x_sum_for_resident_date(self, resident_id: str, date_str: str) -> list:
        return [v for _sid, v in self.by_resident_date.get((resident_id, date_str), [])]

    def x_sum_for_shift_date(self, shift_id: str, date_str: str) -> list:
        return [v for _rid, v in self.by_shift_date.get((shift_id, date_str), [])]


def _locked_triples(payload: Payload):
    return {(lc.resident_id, lc.shift_id, lc.date) for lc in payload.locked}


def build_variables(model, payload: Payload) -> VarStore:
    store = VarStore(model=model)
    locked_triples = _locked_triples(payload)

    wanted = set(locked_triples)
    for resident in payload.residents:
        by_date = payload.eligible.get(resident.id, {})
        for date_str, shift_ids in by_date.items():
            for shift_id in shift_ids:
                if not payload.has_coverage(shift_id, date_str):
                    # Shift doesn't run this date at all (e.g. suppressed by a
                    # 12h conference window) -- no var, per payload contract.
                    continue
                wanted.add((resident.id, shift_id, date_str))

    for resident_id, shift_id, date_str in wanted:
        var = model.new_bool_var(f"x[{resident_id},{shift_id},{date_str}]")
        store.x[(resident_id, shift_id, date_str)] = var
        store.by_resident_date.setdefault((resident_id, date_str), []).append((shift_id, var))
        store.by_shift_date.setdefault((shift_id, date_str), []).append((resident_id, var))

    # At-most-one shift per resident per day, then pin locked cells to 1.
    # (Pinning after the at-most-one constraint is fine -- CP-SAT propagates
    # the rest of that day's vars to 0 for this resident automatically.)
    for (resident_id, date_str), pairs in store.by_resident_date.items():
        vars_today = [v for _sid, v in pairs]
        if len(vars_today) > 1:
            model.add_at_most_one(vars_today)

    for lc in payload.locked:
        var = store.get_x(lc.resident_id, lc.shift_id, lc.date)
        if var is None:
            # Locked shift wasn't in the wanted set at all (shouldn't happen
            # given `wanted` seeds from locked_triples, but stay defensive).
            var = model.new_bool_var(f"x[{lc.resident_id},{lc.shift_id},{lc.date}](locked)")
            store.x[(lc.resident_id, lc.shift_id, lc.date)] = var
            store.by_resident_date.setdefault((lc.resident_id, lc.date), []).append((lc.shift_id, var))
            store.by_shift_date.setdefault((lc.shift_id, lc.date), []).append((lc.resident_id, var))
        model.add(var == 1)

    for resident in payload.residents:
        for date_str in payload.block.dates:
            store.work[(resident.id, date_str)] = model.new_bool_var(f"work[{resident.id},{date_str}]")
            store.night[(resident.id, date_str)] = model.new_bool_var(f"night[{resident.id},{date_str}]")

    return store


def resident_candidates(payload: Payload, store: VarStore, resident_id: str):
    """Yield (date, shiftId, var_or_None) for a resident across prior-tail +
    block dates -- a tail entry's var is None (it's a constant, already
    happened); an in-block entry's var is the real x-var. Shared by any
    pairwise-forbid rule (rest.py rule 17, circadian.py rule 18) that needs to
    walk "everything this resident could be doing on date D".
    """
    for date_str, shift_id in payload.resident(resident_id).prior_tail.items():
        yield date_str, shift_id, None
    for date_str in payload.block.dates:
        for shift_id, var in store.by_resident_date.get((resident_id, date_str), []):
            yield date_str, shift_id, var


def as_literal(model, term):
    """Normalize a rolling-window/sequence term (python int OR a real BoolVar)
    into something usable in add_bool_and/add_bool_or/OnlyEnforceIf calls.
    """
    if isinstance(term, int):
        return const_lit(model, term)
    return term


def forbid_pair(model, var1, var2, enforce_lit=None) -> None:
    """Forbid two candidate slots firing together. A None var is a prior-tail
    constant (already true) -- pairing it with a real var collapses the
    disjunction to a unary `== 0`; pairing two constants is a no-op (history
    can't be un-scheduled by this solve).

    `enforce_lit`, when given, gates the whole constraint via
    `only_enforce_if` -- pass 2's elastic rebuild (solver/model/elastic.py)
    passes a per-(resident, family) `ok` literal here so the constraint can
    be switched off at a penalty; pass 1's strict build never passes it, so
    this stays a plain hard constraint by default (unchanged behavior).
    """
    if var1 is None and var2 is None:
        return
    if var1 is None:
        c = model.add(var2 == 0)
    elif var2 is None:
        c = model.add(var1 == 0)
    else:
        c = model.add(var1 + var2 <= 1)
    if enforce_lit is not None:
        c.only_enforce_if(enforce_lit)
