"""wedPodBamcBody: soft preference that Wednesday POD-D has at least one BAMC body (chief 2026-11-06).

QUALITY tier only. Charged `wedPodBamcBody.perUnit` per Wednesday POD-D date that has no BAMC
resident on it. The charge is the same whether the shift is empty or staffed (it only depends on
BAMC presence), so it never pushes the solver toward leaving a minimum unfilled. Dates where no
BAMC resident can possibly work POD-D add nothing. BAMC residents are identified by cohort
(`EM_BAMC_<pgy>`). Inert when the weight is 0/absent.
"""

from __future__ import annotations

import datetime as _dt

from solver.io.payload import Payload
from solver.model.variables import VarStore

SHIFT_ID = "POD-D"


def _is_wednesday(date_str: str) -> bool:
    return _dt.date.fromisoformat(date_str).weekday() == 2


def add_wed_pod_bamc_terms(model, payload: Payload, store: VarStore, group, weights: dict) -> None:
    coef = int((weights.get("wedPodBamcBody") or {}).get("perUnit", 0))
    if coef == 0:
        return
    bamc_ids = {r.id for r in payload.residents if (r.cohort or "").startswith("EM_BAMC")}
    if not bamc_ids:
        return
    for date_str in payload.block.dates:
        if not _is_wednesday(date_str):
            continue
        bamc_vars = [v for rid, v in store.by_shift_date.get((SHIFT_ID, date_str), []) if rid in bamc_ids]
        if not bamc_vars:
            continue
        lack = model.new_bool_var(f"wedPodNoBamc[{date_str}]")
        model.add(lack + sum(bamc_vars) >= 1)
        group.add(coef, lack)
