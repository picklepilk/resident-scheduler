"""neuroTueThuNight: soft preference that listed cohorts avoid NIGHT shifts on given weekdays (chief 2026-11-06).

QUALITY tier only. Charges `neuroTueThuNight.perUnit` per assignment of a resident whose cohort is a
key of AVOID_NIGHT_DOW to a shift of type "night" on a listed weekday (Python weekday: Mon=0, so
Tue=1, Thu=3). Mirrors `AVOID_NIGHT_DOW` in src/ResidentScheduler.jsx (JS getDay: Tue=2, Thu=4):
change both together. Never forbids anything, so a coverage minimum can still be filled by these
residents; the penalty is per assignment so it only orders choices. Inert when the weight is 0/absent.
"""

from __future__ import annotations

import datetime as _dt

from solver.io.payload import Payload
from solver.model.variables import VarStore

# cohort (JS eligKey) -> weekdays in JS getDay numbering (0=Sun).
AVOID_NIGHT_DOW = {"NEURO_1": (2, 4)}


def _js_dow(date_str: str) -> int:
    return (_dt.date.fromisoformat(date_str).weekday() + 1) % 7


def add_avoid_night_dow_terms(model, payload: Payload, store: VarStore, group, weights: dict) -> None:
    coef = int((weights.get("neuroTueThuNight") or {}).get("perUnit", 0))
    if coef == 0:
        return
    avoid = {r.id: AVOID_NIGHT_DOW[r.cohort] for r in payload.residents if r.cohort in AVOID_NIGHT_DOW}
    if not avoid:
        return
    night_ids = {sid for sid, s in payload.shifts.items() if getattr(s, "type", None) == "night"}
    dow_cache: dict = {}
    for date_str in payload.block.dates:
        dow_cache[date_str] = _js_dow(date_str)
    for sid in night_ids:
        for date_str in payload.block.dates:
            dow = dow_cache[date_str]
            for rid, var in store.by_shift_date.get((sid, date_str), []):
                if rid in avoid and dow in avoid[rid]:
                    group.add(coef, var)
