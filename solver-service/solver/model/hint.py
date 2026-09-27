"""R9 (2026-09-27, CP-SAT-as-polisher): applies `payload.hint` as a CP-SAT
solution hint (`model.AddHint`) rather than a hard constraint.

Contract (see docs/PAYLOAD_SCHEMA.md's dated R9 section and
ResidentScheduler.jsx's `generateViaSolverOrLocal`): the JS side always runs
the local `generateScheduleBest` engine FIRST, then sends that schedule as
`hint` so CP-SAT starts its search from an already-good, already-legal
solution instead of from scratch. A hint is purely advisory -- it must never
be able to make an otherwise-feasible payload infeasible, and it must never
crash on a hint cell that doesn't correspond to any real decision variable
(ineligible, no coverage that date, wrong shift catalog, a stale hint from a
different block...). `CpSolverParameters.repair_hint` (set in solve.py) is
what makes CP-SAT tolerate a partially-illegal hint gracefully instead of
rejecting the whole thing.

Called once per model build (both `solver/build.py`'s pass-1 model and
`solver/model/elastic.py`'s pass-2 model), right after `build_variables` --
this is a pure additive: hints are metadata for the search, not new
constraints, so nothing else in either build needs to know about it.
"""

from __future__ import annotations

from solver.io.payload import Payload
from solver.model.variables import VarStore


def apply_hint(model, payload: Payload, store: VarStore) -> int:
    """Hints EVERY x[r,s,d] var: 1 if (r,d) -> s per payload.hint, else 0.

    `payload.hint` is sparse like `locked` (only non-empty cells -- see
    ResidentScheduler.jsx's `buildSolverPayload`'s hint-emission loop, which
    mirrors the `locked[]` loop exactly), so a (residentId, date) pair absent
    from it means "the local engine left this resident unassigned that day",
    which is itself real information: every one of that resident's OTHER
    candidate vars that date correctly gets hinted 0 too, not skipped. This
    can never crash: it only ever calls `model.add_hint` on vars that already
    exist in `store.x`, and a hint cell that names an illegal/nonexistent
    (resident,shift,date) combination just never matches any real var and is
    silently dropped -- combined with `repair_hint` (solve.py), an entirely
    stale or partially-illegal hint degrades to "no useful hint" rather than
    ever blocking or corrupting the solve.

    Returns the number of x vars hinted (0 when payload.hint is empty -- the
    exact no-op the docstring above promises).
    """
    if not payload.hint or not store.x:
        return 0

    hint_by_resident_date = {(h.resident_id, h.date): h.shift_id for h in payload.hint}

    hinted = 0
    for (resident_id, shift_id, date_str), var in store.x.items():
        wanted = hint_by_resident_date.get((resident_id, date_str))
        model.add_hint(var, 1 if wanted == shift_id else 0)
        hinted += 1
    return hinted
