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

R7 (2026-09-27, chief policy 2026-09-26, memory acgme-em-work-hours): "rest >= shift length" is
ACGME-hard and ALWAYS ON now -- `settings.enforceRest` no longer gates this rule at all (it used to;
the app itself always sends `enforceRest: true` as a literal, but a payload built by a stale/rogue
client must not be able to switch this rule off either -- see CLAUDE.md's "the app resolves ALL
policy into the payload; the solver only solves" and this rule's own `restShiftLength` entry in
src/lib/rulePolicy.js, tier 'acgme'). Rules 18-23 already always ran regardless of that toggle; this
just closes the one remaining gap.

R9 follow-up (2026-10-15, chief decision): the earlier "GR-end adjustment" (rest measured from Grand
Rounds' own end instead of the shift's own end, when GR fell on the shift's end date) is REMOVED --
"the only shifts that count towards time off before/after a shift ... are the actual clinical shifts
that we are scheduling for." Rest is now always measured from the EARLIER shift's own end, full
stop, mirroring `src/lib/acgmeHours.js`/`ResidentScheduler.jsx`'s `checkRestViolations`/`validateAll`,
which no longer read Grand Rounds for this at all. (Grand Rounds' own hours still count toward the
ACGME weekly-hour caps -- see weekly_hours.py -- just never toward this rest gap.)

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
from solver.model.variables import VarStore, forbid_pair, candidates_by_date, resident_candidates

_SCAN_DAYS = (1, 2)  # date2 - date1 in {1, 2}; 0 handled by at-most-one already
FAMILY = "restGap"


def add_rest_constraints(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    for resident in payload.residents:
        by_date = candidates_by_date(payload, store, resident.id)

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
                    earlier_end = timing.shift_end_min(date1, shift1)
                    for shift_id2, var2 in by_date[date2]:
                        shift2 = payload.shifts[shift_id2]
                        gap = timing.shift_start_min(date2, shift2) - earlier_end
                        if gap >= required:
                            continue
                        lit = enforcement(resident.id, FAMILY) if enforcement else None
                        forbid_pair(model, var1, var2, lit)
