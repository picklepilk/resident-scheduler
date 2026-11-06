"""podThirdBodyCore: soft preference that a POD D/E/N third body is NOT an EM-core resident.

Chief rule: the optional third POD body should come from off-service residents; core only if no
other option. That exemption ("core only if no other option") is not expressible as a soft term,
so this is soft by design: each core body beyond the first two on a POD-D/E/N shift-date (with
coverage max >= 3) costs `podThirdBodyCore.perUnit`. A core coverage/target deficit already
outranks this (TIER_ERRORS / TIER_RANK sit above TIER_QUALITY), so core is still used when it is
the only way to fill a minimum or a target. Inert when the weight is 0/absent or no residents
are `isEmCore`.
"""

from __future__ import annotations

from solver.io.payload import Payload
from solver.model.variables import VarStore

POD_THIRD_BODY_SHIFT_IDS = ("POD-D", "POD-E", "POD-N")


def add_pod_third_body_terms(model, payload: Payload, store: VarStore, group, weights: dict) -> None:
    coef = int((weights.get("podThirdBodyCore") or {}).get("perUnit", 0))
    if coef == 0:
        return
    core_ids = {r.id for r in payload.residents if r.is_em_core}
    if not core_ids:
        return
    for shift_id in POD_THIRD_BODY_SHIFT_IDS:
        for date_str, entry in payload.coverage.get(shift_id, {}).items():
            if entry.max < 3:
                continue
            core_vars = [v for rid, v in store.by_shift_date.get((shift_id, date_str), []) if rid in core_ids]
            if len(core_vars) < 3:
                continue
            excess = model.new_int_var(0, len(core_vars) - 2, f"podThirdCore[{shift_id},{date_str}]")
            model.add(excess >= sum(core_vars) - 2)
            group.add(coef, excess)
