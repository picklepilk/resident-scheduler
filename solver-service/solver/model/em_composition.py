"""Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,
"ROUND 2b" section, items 2b-1/2b-2): EM-count composition and PGY gating
pool-restrict. Both are objective-only soft terms, mirroring
ResidentScheduler.jsx's score()/narrowForPgyGate on the JS side. Every term
here is driven by three OPTIONAL payload fields (`emResidentIds`,
`emPgy2ResidentIds`, `emPgy3ResidentIds`) that all default to empty -- every
term this module adds is therefore a documented no-op on a payload that
doesn't set them (see each function's own early-return guard below).

Unlike solver/model/senior_composition.py's hard PGY-CLASS requirement
(rule 16, one qualifying primary PGY on the shift's first body, never
relaxed), both rules here are genuinely soft everywhere on the JS side too --
one is a score() preference (EM-count composition), the other a candidate-
pool restriction WITH a fallback (PGY gating, `narrowForPgyGate`), neither of
which ever blocks a fill in JS. CP-SAT has no equivalent to "restrict the
pool, but only if a fallback exists" -- the natural translation of a soft,
fallback-having preference is a soft objective cost, so BOTH rules become
pure cost terms here (see the plan's own "generator (JS): pool-restrict;
solver: soft cost" split for 2b-2).
"""

from __future__ import annotations

from solver.io.payload import Payload
from solver.model.variables import VarStore

# POD/FLEX -> required EM headcount once the shift's total assigned headcount
# reaches the area's own threshold. Mirrors ResidentScheduler.jsx's
# emCompositionRequired exactly: POD wants >=2 EM once staffed at 2+ (a
# 2-body shift needs both EM; a 3-body shift needs at least 2, third body
# free to be off-service); FLEX wants >=1 EM at any headcount >=1. Areas
# outside this map never generate a term. Threshold and required happen to
# be identical numbers for both areas today, but are kept as two separate
# maps since they mean different things (one gates whether the rule is even
# live, the other is the target count once it is).
EM_COMPOSITION_THRESHOLD = {"POD": 2, "FLEX": 1}
EM_COMPOSITION_REQUIRED = {"POD": 2, "FLEX": 1}


def _area_shift_dates(payload: Payload, area: str):
    """Yields every (shiftId, date) pair for shifts in the given area, over
    the whole block. Cheap to over-enumerate (a handful of POD/FLEX shift ids
    x ~28 dates) -- callers guard on `store.x_sum_for_shift_date` returning
    something before creating any var, same posture as
    senior_composition.py's own per-(shift,date) loop."""
    shift_ids = [sid for sid, s in payload.shifts.items() if s.area == area]
    for shift_id in shift_ids:
        for date_str in payload.block.dates:
            yield shift_id, date_str


# ---------------------------------------------------------------------------
# 2b-1: EM-count composition (SOFT everywhere, both engines)
# ---------------------------------------------------------------------------

def add_em_composition_terms(model, payload: Payload, store: VarStore, group, weights: dict) -> None:
    """podEmComposition / flexEmComposition: for every (POD|FLEX shift, date)
    pair, penalizes the gap between the required EM headcount
    (EM_COMPOSITION_REQUIRED) and the actual EM headcount, but ONLY once the
    shift's total headcount reaches the area's own threshold
    (EM_COMPOSITION_THRESHOLD) -- an empty or below-threshold shift owes
    nothing. `required` is expressed as `R * meets_threshold`, a boolean
    forced BOTH ways off the actual total (needed in both directions: without
    the `total < threshold => meets_threshold = 0` half, the solver could
    dodge the whole term by just never setting the indicator), so
    `shortfall = max(0, required - em_total)` collapses to 0 whenever the
    threshold isn't met -- exactly mirroring the JS side's
    `emCompositionRequired(area, total)`.

    Inert (creates no vars at all) when `emResidentIds` is empty/absent --
    without that guard `em_total` would be permanently 0 and every staffed
    shift would look maximally short, which is the OPPOSITE of a documented
    no-op default.
    """
    if not payload.em_resident_ids:
        return
    for area, coef_key in (("POD", "podEmComposition"), ("FLEX", "flexEmComposition")):
        coef = int(weights[coef_key]["perUnit"])
        if coef == 0:
            continue
        threshold = EM_COMPOSITION_THRESHOLD[area]
        required = EM_COMPOSITION_REQUIRED[area]
        for shift_id, date_str in _area_shift_dates(payload, area):
            all_vars = store.x_sum_for_shift_date(shift_id, date_str)
            if not all_vars:
                continue  # nobody could ever be assigned this (s,d) -- nothing to reify
            total = sum(all_vars)
            em_vars = [
                var for resident_id, var in store.by_shift_date.get((shift_id, date_str), [])
                if resident_id in payload.em_resident_ids
            ]
            em_total = sum(em_vars) if em_vars else 0

            meets_threshold = model.new_bool_var(f"emCompMeets[{shift_id},{date_str}]")
            model.add(total >= threshold).only_enforce_if(meets_threshold)
            model.add(total < threshold).only_enforce_if(meets_threshold.negated())

            shortfall = model.new_int_var(0, required, f"emCompShortfall[{shift_id},{date_str}]")
            model.add_max_equality(shortfall, [required * meets_threshold - em_total, 0])
            group.add(coef, shortfall)


# ---------------------------------------------------------------------------
# 2b-2: PGY gating pool-restrict (JS: candidatePool restriction w/ fallback;
# solver: flat soft cost, no reification needed)
# ---------------------------------------------------------------------------

def add_pgy_fallback_terms(model, payload: Payload, store: VarStore, group, weights: dict) -> None:
    """podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for
    every EM PGY-2 placed on a POD shift (or EM PGY-3 on FLEX) -- the soft-
    cost translation of the JS generator's pool-restrict-with-fallback
    (`narrowForPgyGate`, which excludes the "gated" PGY from a POD/FLEX
    candidate pool while a qualifying primary is still available, falling
    back to including them only when it isn't). CP-SAT has no pool to
    restrict, so this is just a plain weighted sum over the existing x-vars
    for the gated PGY's residents -- no reification needed at all, unlike
    the headcount-dependent EM-count term above. Each of the two directions
    is independently inert when its own id list
    (`emPgy2ResidentIds`/`emPgy3ResidentIds`) is empty/absent.
    """
    for area, ids, coef_key in (
        ("POD", payload.em_pgy2_resident_ids, "podPgy2Fallback"),
        ("FLEX", payload.em_pgy3_resident_ids, "flexPgy3Fallback"),
    ):
        if not ids:
            continue
        coef = int(weights[coef_key]["perUnit"])
        if coef == 0:
            continue
        for shift_id, date_str in _area_shift_dates(payload, area):
            for resident_id, var in store.by_shift_date.get((shift_id, date_str), []):
                if resident_id in ids:
                    group.add(coef, var)
