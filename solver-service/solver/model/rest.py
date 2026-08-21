"""Rule 17: pairwise rest -- gap between consecutive shifts (same resident)
must be >= the EARLIER shift's own duration.

Generic forbidden-pair builder: for each resident, walk every pair of
"occupied slot candidates" (a prior-tail constant assignment, or an in-block
eligible x-var) within 0-2 calendar days of each other. Two candidates dated
the same day never need a rest check -- the at-most-one-per-day constraint
already forbids both firing -- so only 1- and 2-day-apart pairs matter, per
the "scan d..d+2" spec.

Ordering by calendar date is always consistent with ordering by absolute
start-minute here: an hour-of-day offset (0-23h) can never exceed a full
calendar day (24h), so a pair with dates d1 < d2 always has start(d1) <
start(d2) regardless of each shift's own start hour. That means the earlier
CANDIDATE is always the earlier shift, and `required = duration(earlier)` per
`timing.required_rest_gap_min`.

A tail candidate is a python constant (the resident already worked it, or
didn't); pairing it against an in-block var collapses to a unary constraint
(`x == 0`) rather than a disjunction, since only one side is a decision.
Tail-vs-tail pairs are historical fact and need no constraint at all.

`settings.enforceRest = false` skips this rule ONLY -- rules 18-23 always run
regardless of that toggle (matches the app: the toggle only ever gated the
plain legal-rest-hours check).

`enforcement`, when given, is `(resident_id, family) -> BoolVar` (see
solver/model/elastic.py's `LitPool`) -- pass 2 passes it so every forbidden
pair for a given resident is gated by ONE shared `ok[resident,"restGap"]`
literal, fetched lazily right where the first real constraint for that
resident is about to be added (so a resident with zero actual rest conflicts
never gets a dangling, unused literal). Pass 1 never passes it.
"""

from __future__ import annotations

from solver.io.payload import Payload
from solver.model import timing
from solver.model.variables import VarStore, forbid_pair, resident_candidates

_SCAN_DAYS = (1, 2)  # date2 - date1 in {1, 2}; 0 handled by at-most-one already
FAMILY = "restGap"


def add_rest_constraints(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    if not payload.settings.enforce_rest:
        return

    for resident in payload.residents:
        candidates = resident_candidates(payload, store, resident.id)
        by_date = {}
        for date_str, shift_id, var_or_none in candidates:
            by_date.setdefault(date_str, []).append((shift_id, var_or_none))

        dates_sorted = sorted(by_date.keys())
        date_set = set(dates_sorted)

        for date1 in dates_sorted:
            for delta in _SCAN_DAYS:
                date2 = timing.add_days(date1, delta)
                if date2 not in date_set:
                    continue
                for shift_id1, var1 in by_date[date1]:
                    shift1 = payload.shifts[shift_id1]
                    required = timing.required_rest_gap_min(shift1)
                    for shift_id2, var2 in by_date[date2]:
                        shift2 = payload.shifts[shift_id2]
                        gap = timing.gap_between(date1, shift1, date2, shift2)
                        if gap >= required:
                            continue
                        lit = enforcement(resident.id, FAMILY) if enforcement else None
                        forbid_pair(model, var1, var2, lit)
