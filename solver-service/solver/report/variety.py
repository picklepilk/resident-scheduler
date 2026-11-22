"""Shift-variety counts of a concrete schedule (2026-11-22), computed independently of the CP-SAT terms.

Mirrors src/lib/variety.js: `runExcess` = sum over residents and NON-night shift ids of max(0, run - N) for
every maximal consecutive-date run; `pairExcess` = sum over EM-resident pairs and areas of
max(0, shared non-night same-area days - M). Both 0 when settings.variety is absent. The env-gated solver
parity test compares these to the JS validateAll `shiftVarietyRun` / `pairStacking` units.
"""

from __future__ import annotations


def compute_variety_report(payload, schedule: dict) -> dict:
    n_run = payload.settings.variety_max_run
    n_pair = payload.settings.variety_pair_days
    dates = payload.block.dates
    out = {"runExcess": 0, "pairExcess": 0}

    def non_night(sid):
        s = payload.shifts.get(sid)
        return s is not None and not s.is_night

    if n_run > 0:
        for by_date in schedule.values():
            i = 0
            while i < len(dates):
                sid = by_date.get(dates[i])
                if not sid or not non_night(sid):
                    i += 1
                    continue
                j = i
                while j + 1 < len(dates) and by_date.get(dates[j + 1]) == sid:
                    j += 1
                out["runExcess"] += max(0, (j - i + 1) - n_run)
                i = j + 1

    if n_pair > 0:
        tally: dict = {}
        for d in dates:
            by_area: dict = {}
            for rid in sorted(payload.em_resident_ids):
                sid = schedule.get(rid, {}).get(d)
                if sid and non_night(sid) and payload.shifts[sid].area:
                    by_area.setdefault(payload.shifts[sid].area, []).append(rid)
            for area, ids in by_area.items():
                for x in range(len(ids)):
                    for y in range(x + 1, len(ids)):
                        tally[(ids[x], ids[y], area)] = tally.get((ids[x], ids[y], area), 0) + 1
        out["pairExcess"] = sum(max(0, n - n_pair) for n in tally.values())
    return out
