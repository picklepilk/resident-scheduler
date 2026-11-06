"""One full weekend off per block (chief decision 2026-11-01): the GOAL, broken only to fill a coverage MINIMUM.

The weekendOff term is priced at `asNeededUse.perUnit` (TIER_RANK): above target deficit / fairness, far below
coverageMin. JS mirror: validateAll's `asNeededException` 'No full weekend off this block'.
"""

from solver.io.payload import parse_payload
from solver.solve import solve
from tests.helpers import make_payload, make_resident

SHIFTS = {"D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"}}
# 2026-01-05 is a Monday: weekends are 01-10/11 and 01-17/18.
DATES = [f"2026-01-{5 + i:02d}" for i in range(14)]
WE1, WE2 = ["2026-01-10", "2026-01-11"], ["2026-01-17", "2026-01-18"]


def _solve(min_days, enforce=True, target=None):
    raw = make_payload(
        residents=[make_resident("r1", target=target)], shifts=SHIFTS, dates=DATES,
        eligible={"r1": {d: ["D"] for d in DATES}},
        coverage={"D": {d: ({"min": 1, "max": 1} if d in min_days else {"min": 0, "max": 1}) for d in DATES}},
        settings={"enforceRest": True, "enforceWeekendOff": enforce},
    )
    result = solve(parse_payload(raw))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    return result


def _worked(result):
    return {d for d, s in result.schedule.get("r1", {}).items() if s}


def test_keeps_a_full_weekend_off_when_coverage_allows():
    # Minimum only on the first weekend; a big target would love extra weekend shifts but must not take weekend 2.
    result = _solve(set(WE1), target=10)
    worked = _worked(result)
    assert set(WE1) <= worked
    assert not (set(WE2) & worked)
    assert result.report["unfilled"] == []


def test_breaks_weekend_off_only_to_fill_a_coverage_minimum():
    result = _solve(set(WE1 + WE2))
    assert set(WE1 + WE2) <= _worked(result)
    assert result.report["unfilled"] == []


def test_setting_off_means_no_weekend_protection():
    # With the setting off the solver is free to fill weekend days toward target.
    result = _solve(set(), enforce=False, target=14)
    assert len(_worked(result)) > len(DATES) - 4
