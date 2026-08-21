"""Rule 21: rolling 320h (80h/wk avg over 4 weeks) cap.

The payload ships `priorTailHours` as a single pre-summed constant --
"hours already worked inside any 28-day window overlapping this block" -- not
a per-window series. Since a block is itself ~28 days (one rotation), that
collapses rule 21 to ONE linear constraint per resident: this block's total
assigned hours, plus the tail constant, must not exceed 320h. There is no
second window to slide over; the JS side already did that folding when it
computed the constant.
"""

from __future__ import annotations

from solver.io.payload import Payload
from solver.model.variables import VarStore

MAX_ROLLING_HOURS = 320
FAMILY = "hours320"


def add_hours_cap_constraints(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    for resident in payload.residents:
        terms = []
        for date_str in payload.block.dates:
            for shift_id, var in store.by_resident_date.get((resident.id, date_str), []):
                terms.append(payload.shifts[shift_id].duration_h * var)
        if not terms and resident.prior_tail_hours == 0:
            continue
        lit = enforcement(resident.id, FAMILY) if enforcement else None
        c = model.add(sum(terms) + resident.prior_tail_hours <= MAX_ROLLING_HOURS)
        if lit is not None:
            c.only_enforce_if(lit)
