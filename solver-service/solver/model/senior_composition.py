"""Rule 16: senior composition, hard and never-relaxable.

`payload.seniorPrimary[shiftId][date]` lists the resident ids who count as
"primary" for that (shift, date) -- every exception (Wednesday day-shift
exemption, Wellness-Wednesday PGY-2 substitution, conference away
carve-outs) is already pre-applied in JS: an exempt (shift, date) simply has
no entry here at all, and a substitution day already lists the substitute
PGY's ids as primary. This module therefore only needs one rule: IF the
shift is staffed at all that date, at least one assigned resident must be
from the listed primary set.

`staffed[s,d]` needs a full biconditional reification (both directions) --
without the `sum == 0 => staffed = 0` direction, the solver could leave the
shift staffed-but-primary-less by simply never setting `staffed` to 1, which
would silently defeat the whole rule.
"""

from __future__ import annotations

from solver.io.payload import Payload
from solver.model.variables import VarStore


def add_senior_composition_constraints(model, payload: Payload, store: VarStore) -> None:
    for shift_id, by_date in payload.senior_primary.items():
        for date_str, primary_ids in by_date.items():
            all_assigned = store.x_sum_for_shift_date(shift_id, date_str)
            if not all_assigned:
                continue  # nobody could ever be assigned this (s,d) -- nothing to reify

            staffed = model.new_bool_var(f"staffed[{shift_id},{date_str}]")
            model.add(sum(all_assigned) >= 1).only_enforce_if(staffed)
            model.add(sum(all_assigned) == 0).only_enforce_if(staffed.negated())

            primary_terms = [
                var
                for resident_id, var in store.by_shift_date.get((shift_id, date_str), [])
                if resident_id in primary_ids
            ]
            model.add(sum(primary_terms) >= staffed)
