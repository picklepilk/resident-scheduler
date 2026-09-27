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


# ---------------------------------------------------------------------------
# R7 (2026-09-27, gap 3): soft preference for the TRUE primary PGY over a
# Wellness-Wednesday/conference-away substitute, on a (shift, date) where one
# is actually available. Mirrors ResidentScheduler.jsx's preferTruePrimaryPass
# -- that function runs for every SENIOR_COMPOSITION area (POD and FLEX), so
# this does too; `payload.true_primary` is empty for an older JS build that
# doesn't send it, making this a documented no-op.
# ---------------------------------------------------------------------------

def add_true_primary_preference_terms(model, payload: Payload, store: VarStore, group, coef: int) -> None:
    """Charges `coef` exactly when a (shift, date) with a true primary AVAILABLE
    (`payload.true_primary[shift][date]` non-empty) ends up staffed ONLY by
    fallback/substitute residents -- never when nobody's assigned at all (no
    substitute is being used) and never on a date with no true primary to
    prefer in the first place (the hard rule's substitution is the accepted
    outcome there, per compositionSatisfies/seniorWellnessSubstituteAllowed).
    Needs a FULL biconditional reification for both `staffed` and `any_true`
    (unlike trauma_runs.py's one-directional cost-var trick) because the
    penalty is charged on the NEGATION of `any_true`, not its assertion --
    minimization pressure alone can't be trusted to derive that direction.
    """
    if coef == 0:
        return
    for shift_id, by_date in payload.true_primary.items():
        for date_str, true_ids in by_date.items():
            if not true_ids:
                continue  # no true primary available today -- the substitute is fully accepted
            all_assigned = store.x_sum_for_shift_date(shift_id, date_str)
            if not all_assigned:
                continue
            true_terms = [
                var for resident_id, var in store.by_shift_date.get((shift_id, date_str), [])
                if resident_id in true_ids
            ]
            if not true_terms:
                continue  # every true-primary candidate is ineligible here -- nothing to prefer

            staffed = model.new_bool_var(f"tpStaffed[{shift_id},{date_str}]")
            model.add(sum(all_assigned) >= 1).only_enforce_if(staffed)
            model.add(sum(all_assigned) == 0).only_enforce_if(staffed.negated())

            any_true = model.new_bool_var(f"tpAnyTrue[{shift_id},{date_str}]")
            model.add(sum(true_terms) >= 1).only_enforce_if(any_true)
            model.add(sum(true_terms) == 0).only_enforce_if(any_true.negated())

            fallback_used = model.new_bool_var(f"tpFallbackUsed[{shift_id},{date_str}]")
            model.add_bool_and([staffed, any_true.negated()]).only_enforce_if(fallback_used)
            model.add_bool_or([staffed.negated(), any_true]).only_enforce_if(fallback_used.negated())
            group.add(coef, fallback_used)
