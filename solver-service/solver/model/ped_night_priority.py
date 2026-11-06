"""pedNightOverSwing: soft preference for filling the optional PED Night over PED Swing.

On a date where both PED-N and PED-S have coverage max > 0 and PED-N has candidates, each PED-S
body in excess of the PED-N bodies costs `pedNightOverSwing.perUnit` (excess >= s - n). So a
resident is better spent on PED-N than PED-S when only one can be filled. Inert when the weight
is 0/absent.
"""

from __future__ import annotations

from solver.io.payload import Payload
from solver.model.variables import VarStore

NIGHT_ID = "PED-N"
SWING_ID = "PED-S"


def add_ped_night_priority_terms(model, payload: Payload, store: VarStore, group, weights: dict) -> None:
    coef = int((weights.get("pedNightOverSwing") or {}).get("perUnit", 0))
    if coef == 0:
        return
    night_cov = payload.coverage.get(NIGHT_ID, {})
    swing_cov = payload.coverage.get(SWING_ID, {})
    for date_str, n_entry in night_cov.items():
        s_entry = swing_cov.get(date_str)
        if s_entry is None or n_entry.max <= 0 or s_entry.max <= 0:
            continue
        n_vars = store.x_sum_for_shift_date(NIGHT_ID, date_str)
        s_vars = store.x_sum_for_shift_date(SWING_ID, date_str)
        if not n_vars or not s_vars:
            continue
        excess = model.new_int_var(0, len(s_vars), f"pedNightOverSwing[{date_str}]")
        model.add(excess >= sum(s_vars) - sum(n_vars))
        group.add(coef, excess)
