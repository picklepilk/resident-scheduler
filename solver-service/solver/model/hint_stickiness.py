"""Optional "stick close to the starting schedule" penalty (2026-10-30).

Observed on a real block: the polisher, warm-started from the browser
engine's schedule, rewrote ~90% of cells for a modest score gain. When
`config.hintStickiness` (weight per changed cell; falls back to
default_weights.json `hintStickiness.perChange`; 0 = off) is > 0 and a hint is
present, every (resident, date) cell whose final assignment differs from the
hint costs `weight` in TIER_QUALITY -- the lowest tier, so it can only trade
against shape/fairness, never coverage, hard rules, targets or rest.

Linear form, no extra vars/solves:
  - hint cell (r, d) -> shift h with an x var: cost = 1 - x[r,h,d]
    (covers "removed" and "replaced by another shift")
  - cell with no hint (or whose hinted var does not exist): cost = sum of x
    on that cell (a new shift on a hint-empty cell)
A hinted cell that keeps h AND gains a second shift is not penalised for the
extra (multi-shift days are rare/disallowed); documented simplification.
"""

from __future__ import annotations


def _hint_by_cell(payload) -> dict:
    return {(h.resident_id, h.date): h.shift_id for h in payload.hint}


def stickiness_weight(payload, weights: dict) -> int:
    w = payload.config.hint_stickiness
    if w is None:
        w = (weights.get("hintStickiness") or {}).get("perChange", 0)
    return max(0, int(w or 0))


def add_hint_stickiness_term(model, payload, store, group, weights: dict) -> None:
    weight = stickiness_weight(payload, weights)
    if weight <= 0 or not payload.hint:
        return
    hinted = _hint_by_cell(payload)
    for (rid, date), shift_id in hinted.items():
        var = store.get_x(rid, shift_id, date)
        if var is not None:
            group.add(weight, 1 - var)
    cells = {}
    for (rid, sid, date), var in store.x.items():
        h = hinted.get((rid, date))
        if h is not None and store.get_x(rid, h, date) is not None:
            continue
        cells.setdefault((rid, date), []).append(var)
    for vars_ in cells.values():
        group.add(weight, sum(vars_))


def changed_cells(payload, schedule: dict) -> int:
    """Count (resident, date) cells where `schedule` differs from the hint."""
    hinted = _hint_by_cell(payload)
    cells = set(hinted)
    for rid, by_date in schedule.items():
        for date in by_date:
            cells.add((rid, date))
    return sum(1 for (rid, date) in cells if hinted.get((rid, date)) != schedule.get(rid, {}).get(date))
