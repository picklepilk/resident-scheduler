"""`report.traumaCapExcess` (2026-11-23): residents over the SOFT EM PGY-2/3 trauma cap in a concrete schedule.

`caps.trauma` is no longer a hard constraint (objective.py `_add_trauma_cap_excess_term` prices each excess shift;
validate.py no longer fails it). Count = every TRAUMA-area shift (TRAUMA-D + TRAUMA-N), the same count as the app's
non-blocking "Trauma shifts: N - EM PGY-2/3 cap is C/block" warning.
"""

from __future__ import annotations


def compute_trauma_cap_excess(payload, schedule: dict) -> list:
    out = []
    for resident in payload.residents:
        cap = resident.caps.trauma
        if cap is None:
            continue
        by_date = schedule.get(resident.id, {})
        count = sum(1 for sid in by_date.values() if sid in payload.shifts and payload.shifts[sid].area == "TRAUMA")
        if count > cap:
            out.append({"residentId": resident.id, "count": count, "cap": int(cap)})
    return out
