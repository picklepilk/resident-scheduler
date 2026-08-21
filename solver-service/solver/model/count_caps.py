"""Rules 26, 28, 27, 29, 30, 31: every "count of shifts matching some
predicate, capped per resident" rule, driven by one generic (shift predicate,
date predicate, cap-getter) spec list rather than five near-identical
hand-written loops.

- `trauma` (26): TRAUMA-area shifts, any date, cap = caps.trauma.
- `jcRemaining` (28): shifts whose timing overlaps 18:00-21:00, on `jcDates`,
  cap = caps.jcRemaining (already "3 minus prior published-block count").
- `bamcWedNights` (27): night-type shifts on Wednesdays, cap = caps.bamcWedNights.
- `pedsMixMax` (29): PED-area shifts, any date, cap = caps.pedsMixMax.
- `targetCeiling` (31): every assigned shift, any date, cap = target (skipped
  entirely when target is None -- self-cover residents have no ceiling).
- `traumaPedsSplit` (30): two resident-specific sub-caps, each with its own
  date SUBSET (traumaDates / pedsDates) rather than the whole block -- kept
  separate from the generic spec list below since the date predicate is
  per-resident data, not a shared rule.

Every cap is `None` (not subject) for a given resident by simply being absent
from that resident's `caps`/`traumaPedsSplit` -- no constraint is added.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from solver.io.payload import Payload, Resident
from solver.model import timing
from solver.model.variables import VarStore

WEDNESDAY = 2  # datetime.date.weekday(): Monday=0 ... Sunday=6
JC_WINDOW_START_H = 18
JC_WINDOW_END_H = 21

# spec.name -> rule-registry family id, for pass 2's per-(resident, family)
# enforcement literal (solver/model/elastic.py). `targetCeiling` keeps the
# same name on both sides.
SPEC_TO_RULE = {
    "trauma": "traumaCap",
    "jcRemaining": "jcCap",
    "bamcWedNights": "bamcWedNight",
    "pedsMixMax": "pedsMixMax",
    "targetCeiling": "targetCeiling",
}
FAMILY_TRAUMA_PEDS_SPLIT = "traumaPedsSplit"


@dataclass
class CapSpec:
    name: str
    cap_getter: Callable[[Resident], Optional[int]]
    shift_pred: Callable[[str], bool]
    date_pred: Callable[[str], bool]


def _build_simple_specs(payload: Payload) -> list:
    return [
        CapSpec(
            name="trauma",
            cap_getter=lambda r: r.caps.trauma,
            shift_pred=lambda sid: payload.shifts[sid].area == "TRAUMA",
            date_pred=lambda d: True,
        ),
        CapSpec(
            name="jcRemaining",
            cap_getter=lambda r: r.caps.jc_remaining,
            shift_pred=lambda sid: timing.overlaps_hour_window(payload.shifts[sid], JC_WINDOW_START_H, JC_WINDOW_END_H),
            date_pred=lambda d: d in payload.jc_dates,
        ),
        CapSpec(
            name="bamcWedNights",
            cap_getter=lambda r: r.caps.bamc_wed_nights,
            shift_pred=lambda sid: payload.shifts[sid].is_night,
            date_pred=lambda d: timing.parse_date(d).weekday() == WEDNESDAY,
        ),
        CapSpec(
            name="pedsMixMax",
            cap_getter=lambda r: r.caps.peds_mix_max,
            shift_pred=lambda sid: payload.shifts[sid].area == "PED",
            date_pred=lambda d: True,
        ),
        CapSpec(
            name="targetCeiling",
            cap_getter=lambda r: r.target,
            shift_pred=lambda sid: True,
            date_pred=lambda d: True,
        ),
    ]


def terms_for(payload: Payload, store: VarStore, resident_id: str, shift_pred, date_pred) -> list:
    terms = []
    for date_str in payload.block.dates:
        if not date_pred(date_str):
            continue
        for shift_id, var in store.by_resident_date.get((resident_id, date_str), []):
            if shift_pred(shift_id):
                terms.append(var)
    return terms


def add_count_cap_constraints(model, payload: Payload, store: VarStore, enforcement=None) -> None:
    specs = _build_simple_specs(payload)
    for resident in payload.residents:
        for spec in specs:
            cap = spec.cap_getter(resident)
            if cap is None:
                continue
            terms = terms_for(payload, store, resident.id, spec.shift_pred, spec.date_pred)
            if terms:
                lit = enforcement(resident.id, SPEC_TO_RULE[spec.name]) if enforcement else None
                c = model.add(sum(terms) <= cap)
                if lit is not None:
                    c.only_enforce_if(lit)

        _add_trauma_peds_split(model, payload, store, resident, enforcement)


def _add_trauma_peds_split(model, payload: Payload, store: VarStore, resident: Resident, enforcement=None) -> None:
    """Rule 30: BOTH halves share ONE `ok[resident,"traumaPedsSplit"]`
    literal in pass 2 -- the plan groups this as one cap-family per resident,
    not two, even though it guards two separate sub-constraints.
    """
    split = resident.trauma_peds_split
    if split is None:
        return

    trauma_terms = terms_for(
        payload, store, resident.id,
        shift_pred=lambda sid: payload.shifts[sid].area == "TRAUMA",
        date_pred=lambda d: d in split.trauma_dates,
    )
    if trauma_terms:
        lit = enforcement(resident.id, FAMILY_TRAUMA_PEDS_SPLIT) if enforcement else None
        c = model.add(sum(trauma_terms) <= split.trauma_cap)
        if lit is not None:
            c.only_enforce_if(lit)

    peds_terms = terms_for(
        payload, store, resident.id,
        shift_pred=lambda sid: payload.shifts[sid].area == "PED",
        date_pred=lambda d: d in split.peds_dates,
    )
    if peds_terms:
        lit = enforcement(resident.id, FAMILY_TRAUMA_PEDS_SPLIT) if enforcement else None
        c = model.add(sum(peds_terms) <= split.peds_cap)
        if lit is not None:
            c.only_enforce_if(lit)
