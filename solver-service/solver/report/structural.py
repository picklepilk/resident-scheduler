"""Structural (unavoidable) floor of the fairness+shape score.

`compute_structural_floor(payload, schedule)` returns a LOWER BOUND on the browser's
quality-vector slot 3 (fairnessPlusShape) that no schedule can beat, from two terms only:

- underTarget: sum(target) over schedulable residents exceeds total coverage-max supply, so at
  least `demand - supply` shifts are under target. Browser weight 2/shift
  (scheduleQuality.js FAIRNESS_AXIS_WEIGHTS.underTargetTotal).
- areaSpread: a resident whose eligibility spans a single shift AREA across the whole block puts
  every worked shift in one area; charge = worked - ceil(worked * 0.5) (AREA_CONCENTRATION_FLOOR),
  browser weight 2/unit. `worked` is estimated as the resident's target (approximate).

These are already INSIDE slot 3, so the floor is a share of it, never an addition to it.
`schedule` is accepted for signature stability; the floor is schedule-independent.
"""

from __future__ import annotations

import math

UNDER_TARGET_WEIGHT = 2
AREA_SPREAD_WEIGHT = 2
AREA_CONCENTRATION_FLOOR = 0.5


def compute_structural_floor(payload, schedule=None) -> dict:
    supply = 0
    for by_date in payload.coverage.values():
        for entry in by_date.values():
            supply += int(entry.max)

    demand = 0
    single_area = 0
    area_units = 0
    for resident in payload.residents:
        if not resident.schedulable or resident.target is None or resident.target <= 0:
            continue
        target = int(resident.target)
        demand += target
        areas = set()
        for sids in (payload.eligible.get(resident.id) or {}).values():
            for sid in sids:
                shift = payload.shifts.get(sid)
                if shift is not None and shift.area:
                    areas.add(shift.area)
        if len(areas) == 1:
            single_area += 1
            area_units += max(0, target - math.ceil(target * AREA_CONCENTRATION_FLOOR))

    excess = max(0, demand - supply)
    under_points = excess * UNDER_TARGET_WEIGHT
    area_points = area_units * AREA_SPREAD_WEIGHT
    return {
        "supply": supply,
        "demand": demand,
        "targetExcess": excess,
        "underTargetPoints": under_points,
        "singleAreaResidents": single_area,
        "areaSpreadUnits": area_units,
        "areaSpreadPoints": area_points,
        "totalPoints": under_points + area_points,
        "approximate": True,
    }
