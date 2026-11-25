"""Scoped polish (`config.scope`, round 2): cells outside the scope are fixed to the hint's value.

Explicit `model.add(var == value)` constraints, NOT domain narrowing: the outer LNS rewrites every x
domain on its model clones (`lns_outer._set_domains`), which would un-fix a narrowed domain; a constraint
survives `clone()`. See docs/PAYLOAD_SCHEMA.md "Round 2 options".
"""

from __future__ import annotations


def _report(scope, applied: bool, free: int = 0, fixed: int = 0, ignored: str = None) -> dict:
    out = {
        "applied": applied,
        "dates": list(scope.dates) if scope.dates else None,
        "residentIds": list(scope.resident_ids),
        "keepCells": len(scope.keep_cells),
        "freeCells": free,
        "fixedCells": fixed,
    }
    if ignored:
        out["ignored"] = ignored
    return out


def apply_scope(payload, build_result, hint_feasible) -> dict:
    """Fix every x var outside `payload.config.scope` to the hint's value (1 if the hint assigns exactly
    that (resident, shift, date), else 0). Returns the `report.scope` dict. Not applied (model untouched)
    without a hint or when the hint is not known feasible (`hint_feasible` must be True)."""
    scope = payload.config.scope
    x = build_result.store.x
    if not payload.hint:
        return _report(scope, False, free=len(x), ignored="no hint")
    if hint_feasible is not True:
        return _report(scope, False, free=len(x), ignored="hint infeasible")
    hint = {(h.resident_id, h.date): h.shift_id for h in payload.hint}
    keep = set(scope.keep_cells)
    rids = set(scope.resident_ids)
    lo, hi = scope.dates if scope.dates else (None, None)
    model = build_result.model
    free = fixed = 0
    for (rid, sid, date), var in x.items():
        in_scope = (
            (lo is None or lo <= date <= hi)
            and (not rids or rid in rids)
            and (rid, date) not in keep
        )
        if in_scope:
            free += 1
            continue
        model.add(var == (1 if hint.get((rid, date)) == sid else 0))
        fixed += 1
    return _report(scope, True, free=free, fixed=fixed)
