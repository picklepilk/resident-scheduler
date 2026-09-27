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

R7 also adds the GR-end adjustment (EM FAQ: "rest counts from end of conference when attended"): when
the EARLIER shift's own end falls on that resident's own Grand Rounds date and before GR's end
(`payload.gr_end_h`, default 12:00), the rest gap is measured from GR's end instead of the shift's
own end -- see `_effective_earlier_end_min`. The REQUIRED gap (`required_rest_gap_min`, still the
earlier shift's own duration) is unchanged; only the point rest is measured FROM moves later, which
can only make the constraint stricter, never looser.

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


def _effective_earlier_end_min(payload: Payload, date1: str, shift1, resident) -> int:
    """The timestamp rest should be measured FROM after working `shift1` on `date1` -- normally the
    shift's own end, pushed forward to Grand Rounds' own end when `resident`'s GR obligation lands on
    the shift's END calendar date and the shift ends before GR does. Mirrors
    src/lib/acgmeHours.js's effectiveShiftEndMs exactly (that module is the resolved source of
    truth for WHICH dates are `gr_dates` -- already vacation/off-filtered there)."""
    end_min = timing.shift_end_min(date1, shift1)
    if not resident.gr_dates:
        return end_min
    end_date = timing.shift_end_date(date1, shift1)
    if end_date not in resident.gr_dates:
        return end_min
    gr_end_min = timing.hour_mark_min(end_date, payload.gr_end_h)
    return max(end_min, gr_end_min)


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
                    earlier_end = _effective_earlier_end_min(payload, date1, shift1, resident)
                    for shift_id2, var2 in by_date[date2]:
                        shift2 = payload.shifts[shift_id2]
                        gap = timing.shift_start_min(date2, shift2) - earlier_end
                        if gap >= required:
                            continue
                        lit = enforcement(resident.id, FAMILY) if enforcement else None
                        forbid_pair(model, var1, var2, lit)
