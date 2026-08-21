"""Independent post-solve re-check.

Deliberately reimplements every hard-rule check directly from the raw
payload + a plain `schedule` dict (`residentId -> date -> shiftId`), sharing
ONLY `solver/model/timing.py` with the constraint builders in
`solver/model/*`. The whole point is a second, independently-written
opinion: if `build.py`/`objective.py` have a bug that lets an illegal
schedule through, a validator built out of the same helper functions could
share the bug. A plain-python re-scan of the concrete schedule is also
simpler than the model's sliding-window/reification tricks (those exist to
avoid O(shifts^2) pool calls and to let CP-SAT search efficiently; a
validator checking one fixed schedule can just walk day-by-day).

`solve.py` calls this after every pass-1 solve; a strict-mode failure list
is a bug (raise -> HTTP 500, client falls back to the JS engine) since pass 1
never legitimately relaxes anything itself.
"""

from __future__ import annotations

from solver.io.payload import Payload
from solver.model import timing

MAX_CONSECUTIVE_WORK_DAYS = 6
NIGHT_RUN_MAX = 6
NIGHT_SEGMENTS_MAX = 2
REQUIRED_REST_AFTER_RUN_MIN = 24 * 60
JC_WINDOW_START_H = 18
JC_WINDOW_END_H = 21
WEDNESDAY = 2
SATURDAY = 5


def _fail(rule: str, resident_ids=(), dates=(), shift_ids=(), detail: str = "") -> dict:
    return {
        "rule": rule,
        "residentIds": list(resident_ids),
        "dates": list(dates),
        "shiftIds": list(shift_ids),
        "detail": detail,
    }


def _shift_on(payload: Payload, resident, date_str: str, schedule: dict):
    """The shift id actually assigned on `date_str` -- from `schedule` for an
    in-block date, from `prior_tail` for a tail date. None if nothing.

    Guards against an id that isn't in the shift catalog at all: the timing-
    dependent checks below all key off `payload.shifts[shift_id]`, and a
    bogus/unknown id would otherwise crash them with a KeyError instead of
    reporting a clean failure. `_check_eligibility_and_locked` already
    reports any such cell on its own (it never eligible), so treating it as
    "nothing assigned" here doesn't hide the problem -- it just keeps every
    OTHER check from crashing on data the eligibility check already flagged.
    """
    if date_str in payload.tail_dates:
        shift_id = resident.prior_tail.get(date_str)
    else:
        shift_id = schedule.get(resident.id, {}).get(date_str)
    return shift_id if shift_id in payload.shifts else None


def _work_flags(payload: Payload, resident, schedule: dict) -> dict:
    obligations = payload.obligations.get(resident.id, set())
    flags = {}
    for d in payload.tail_dates:
        flags[d] = (d in resident.prior_tail) or (d in resident.prior_tail_obligations)
    for d in payload.block.dates:
        flags[d] = bool(schedule.get(resident.id, {}).get(d)) or (d in obligations)
    return flags


def _night_flags(payload: Payload, resident, schedule: dict) -> dict:
    flags = {}
    for d in payload.all_dates:
        sid = _shift_on(payload, resident, d, schedule)
        flags[d] = bool(sid) and sid in payload.shifts and payload.shifts[sid].is_night
    return flags


def _max_run(dates_in_order: list, flags: dict) -> int:
    best = cur = 0
    for d in dates_in_order:
        if flags.get(d):
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


def _runs_touching_block(dates_in_order: list, flags: dict, block_dates: set) -> int:
    """Count maximal True-runs that include at least one block date."""
    count = 0
    cur_touches_block = False
    in_run = False
    for d in dates_in_order:
        if flags.get(d):
            in_run = True
            if d in block_dates:
                cur_touches_block = True
        else:
            if in_run and cur_touches_block:
                count += 1
            in_run = False
            cur_touches_block = False
    if in_run and cur_touches_block:
        count += 1
    return count


def validate_schedule(payload: Payload, schedule: dict) -> list:
    failures = []
    failures += _check_eligibility_and_locked(payload, schedule)
    failures += _check_coverage_max(payload, schedule)
    failures += _check_senior_composition(payload, schedule)
    if payload.settings.enforce_rest:
        failures += _check_rest_gap(payload, schedule)
    failures += _check_circadian_pairs(payload, schedule)
    failures += _check_night_run_and_cap_and_segments(payload, schedule)
    failures += _check_consecutive_work(payload, schedule)
    failures += _check_post_run6_rest(payload, schedule)
    failures += _check_hours_cap(payload, schedule)
    failures += _check_count_caps(payload, schedule)
    return failures


def _check_eligibility_and_locked(payload: Payload, schedule: dict) -> list:
    failures = []
    locked_set = {(lc.resident_id, lc.date, lc.shift_id) for lc in payload.locked}
    for resident_id, by_date in schedule.items():
        for date_str, shift_id in by_date.items():
            if payload.is_eligible(resident_id, date_str, shift_id):
                continue
            if (resident_id, date_str, shift_id) in locked_set:
                continue
            failures.append(_fail("eligibility", [resident_id], [date_str], [shift_id], "not eligible and not locked"))
    for lc in payload.locked:
        if schedule.get(lc.resident_id, {}).get(lc.date) != lc.shift_id:
            failures.append(_fail("locked", [lc.resident_id], [lc.date], [lc.shift_id], "locked cell not honored"))
    return failures


def _check_coverage_max(payload: Payload, schedule: dict) -> list:
    failures = []
    counts = {}
    for resident_id, by_date in schedule.items():
        for date_str, shift_id in by_date.items():
            counts[(shift_id, date_str)] = counts.get((shift_id, date_str), 0) + 1
    for shift_id, by_date in payload.coverage.items():
        for date_str, entry in by_date.items():
            n = counts.get((shift_id, date_str), 0)
            if n > entry.max:
                failures.append(_fail("coverageMax", [], [date_str], [shift_id], f"{n} assigned, max {entry.max}"))
    return failures


def _check_senior_composition(payload: Payload, schedule: dict) -> list:
    failures = []
    assigned_by = {}
    for resident_id, by_date in schedule.items():
        for date_str, shift_id in by_date.items():
            assigned_by.setdefault((shift_id, date_str), []).append(resident_id)
    for shift_id, by_date in payload.senior_primary.items():
        for date_str, primary_ids in by_date.items():
            assigned = assigned_by.get((shift_id, date_str), [])
            if not assigned:
                continue
            if not any(rid in primary_ids for rid in assigned):
                failures.append(
                    _fail("seniorComposition", assigned, [date_str], [shift_id], "staffed with no senior primary")
                )
    return failures


def _check_rest_gap(payload: Payload, schedule: dict) -> list:
    failures = []
    for resident in payload.residents:
        for date1 in payload.all_dates:
            shift_id1 = _shift_on(payload, resident, date1, schedule)
            if not shift_id1:
                continue
            shift1 = payload.shifts[shift_id1]
            required = timing.required_rest_gap_min(shift1)
            for delta in (1, 2):
                date2 = timing.add_days(date1, delta)
                shift_id2 = _shift_on(payload, resident, date2, schedule)
                if not shift_id2:
                    continue
                shift2 = payload.shifts[shift_id2]
                gap = timing.gap_between(date1, shift1, date2, shift2)
                if gap < required:
                    failures.append(
                        _fail(
                            "restGap", [resident.id], [date1, date2], [shift_id1, shift_id2],
                            f"{gap}min gap, required {required}min",
                        )
                    )
    return failures


def _check_circadian_pairs(payload: Payload, schedule: dict) -> list:
    failures = []
    for resident in payload.residents:
        for date1 in payload.all_dates:
            shift_id1 = _shift_on(payload, resident, date1, schedule)
            if not shift_id1:
                continue
            type1 = payload.shifts[shift_id1].type
            if type1 not in ("eve", "day"):
                continue
            date2 = timing.add_days(date1, 1)
            shift_id2 = _shift_on(payload, resident, date2, schedule)
            if not shift_id2:
                continue
            type2 = payload.shifts[shift_id2].type
            forbidden = "day" if type1 == "eve" else "eve"
            if type2 == forbidden:
                failures.append(
                    _fail("circadianPair", [resident.id], [date1, date2], [shift_id1, shift_id2], f"{type1}->{type2}")
                )
    return failures


def _check_night_run_and_cap_and_segments(payload: Payload, schedule: dict) -> list:
    failures = []
    block_dates = set(payload.block.dates)
    for resident in payload.residents:
        flags = _night_flags(payload, resident, schedule)
        run = _max_run(payload.all_dates, flags)
        if run > NIGHT_RUN_MAX:
            failures.append(_fail("nightRunMax", [resident.id], [], [], f"night run of {run}"))

        if not resident.night_exempt and resident.caps.nights is not None:
            total = sum(1 for d in payload.block.dates if flags.get(d))
            if total > resident.caps.nights:
                failures.append(_fail("nightCap", [resident.id], [], [], f"{total} nights, cap {resident.caps.nights}"))

        segments = _runs_touching_block(payload.all_dates, flags, block_dates)
        if segments > NIGHT_SEGMENTS_MAX:
            failures.append(_fail("nightSegments", [resident.id], [], [], f"{segments} night-run segments"))
    return failures


def _check_consecutive_work(payload: Payload, schedule: dict) -> list:
    failures = []
    for resident in payload.residents:
        flags = _work_flags(payload, resident, schedule)
        run = _max_run(payload.all_dates, flags)
        if run > MAX_CONSECUTIVE_WORK_DAYS:
            failures.append(_fail("consecutiveWork", [resident.id], [], [], f"work run of {run}"))
    return failures


def _check_post_run6_rest(payload: Payload, schedule: dict) -> list:
    failures = []
    for resident in payload.residents:
        flags = _work_flags(payload, resident, schedule)
        dates = payload.all_dates
        for idx in range(MAX_CONSECUTIVE_WORK_DAYS - 1, len(dates)):
            window = dates[idx - MAX_CONSECUTIVE_WORK_DAYS + 1: idx + 1]
            if not all(flags.get(d) for d in window):
                continue
            date1 = dates[idx]
            shift_id1 = _shift_on(payload, resident, date1, schedule)
            if not shift_id1:
                continue
            shift1 = payload.shifts[shift_id1]
            for delta in (1, 2, 3):
                date2 = timing.add_days(date1, delta)
                if date2 not in payload.block.dates:
                    continue
                shift_id2 = _shift_on(payload, resident, date2, schedule)
                if not shift_id2:
                    continue
                shift2 = payload.shifts[shift_id2]
                gap = timing.gap_between(date1, shift1, date2, shift2)
                if gap < REQUIRED_REST_AFTER_RUN_MIN:
                    failures.append(
                        _fail(
                            "postRun6Rest", [resident.id], [date1, date2], [shift_id1, shift_id2],
                            f"{gap}min after a completed 6-day run",
                        )
                    )
    return failures


def _check_hours_cap(payload: Payload, schedule: dict) -> list:
    failures = []
    for resident in payload.residents:
        total = resident.prior_tail_hours
        for date_str, shift_id in schedule.get(resident.id, {}).items():
            shift = payload.shifts.get(shift_id)
            if shift is not None:
                total += shift.duration_h
        if total > 320:
            failures.append(_fail("hours320", [resident.id], [], [], f"{total}h in rolling window"))
    return failures


def _check_count_caps(payload: Payload, schedule: dict) -> list:
    failures = []
    for resident in payload.residents:
        by_date = schedule.get(resident.id, {})

        def count(shift_pred, date_pred=lambda d: True):
            return sum(
                1 for d, sid in by_date.items()
                if sid in payload.shifts and date_pred(d) and shift_pred(sid)
            )

        trauma_n = count(lambda sid: payload.shifts[sid].area == "TRAUMA")
        if resident.caps.trauma is not None and trauma_n > resident.caps.trauma:
            failures.append(_fail("traumaCap", [resident.id], [], [], f"{trauma_n} trauma, cap {resident.caps.trauma}"))

        jc_n = count(
            lambda sid: timing.overlaps_hour_window(payload.shifts[sid], JC_WINDOW_START_H, JC_WINDOW_END_H),
            lambda d: d in payload.jc_dates,
        )
        if resident.caps.jc_remaining is not None and jc_n > resident.caps.jc_remaining:
            failures.append(_fail("jcCap", [resident.id], [], [], f"{jc_n} JC shifts, remaining budget {resident.caps.jc_remaining}"))

        bamc_n = count(lambda sid: payload.shifts[sid].is_night, lambda d: timing.parse_date(d).weekday() == WEDNESDAY)
        if resident.caps.bamc_wed_nights is not None and bamc_n > resident.caps.bamc_wed_nights:
            failures.append(_fail("bamcWedNight", [resident.id], [], [], f"{bamc_n} BAMC Wed nights, cap {resident.caps.bamc_wed_nights}"))

        peds_n = count(lambda sid: payload.shifts[sid].area == "PED")
        if resident.caps.peds_mix_max is not None and peds_n > resident.caps.peds_mix_max:
            failures.append(_fail("pedsMixMax", [resident.id], [], [], f"{peds_n} peds, cap {resident.caps.peds_mix_max}"))

        if resident.target is not None:
            total_n = len(by_date)
            if total_n > resident.target:
                failures.append(_fail("targetCeiling", [resident.id], [], [], f"{total_n} assigned, target {resident.target}"))

        split = resident.trauma_peds_split
        if split is not None:
            trauma_half = count(lambda sid: payload.shifts[sid].area == "TRAUMA", lambda d: d in split.trauma_dates)
            if trauma_half > split.trauma_cap:
                failures.append(_fail("traumaPedsSplit", [resident.id], [], [], f"trauma half {trauma_half} > {split.trauma_cap}"))
            peds_half = count(lambda sid: payload.shifts[sid].area == "PED", lambda d: d in split.peds_dates)
            if peds_half > split.peds_cap:
                failures.append(_fail("traumaPedsSplit", [resident.id], [], [], f"peds half {peds_half} > {split.peds_cap}"))
    return failures
