"""Batch 2: solver/validate.py's independent re-implementation of the
`traumaRunCap` hard rule (>2 trauma nights in one contiguous night run) --
built directly from a hand-written schedule dict, per test_validate_roundtrip.py's
own pattern, no model/solve involved.
"""

from solver.io.payload import parse_payload
from solver.validate import validate_schedule
from tests.helpers import make_payload, make_resident

TRAUMA_SHIFTS = {
    "TRAUMA-N": {"startH": 21, "durationH": 9, "type": "night", "area": "TRAUMA"},
    "N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"},
}


def _payload(dates):
    eligible = {"r1": {d: ["TRAUMA-N", "N"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    raw = make_payload(
        residents=[make_resident("r1")], shifts=TRAUMA_SHIFTS, dates=dates,
        eligible=eligible, coverage=coverage, traumaNightShiftIds=["TRAUMA-N"],
    )
    return parse_payload(raw)


def test_three_trauma_nights_in_one_run_fails_validation():
    dates = [f"2026-01-{5 + i:02d}" for i in range(5)]
    payload = _payload(dates)
    schedule = {
        "r1": {
            dates[0]: "TRAUMA-N",
            dates[1]: "TRAUMA-N",
            dates[2]: "N",
            dates[3]: "TRAUMA-N",
            dates[4]: "N",
        }
    }
    failures = validate_schedule(payload, schedule)
    assert any(f["rule"] == "traumaRunCap" for f in failures)


def test_two_trauma_nights_in_one_run_passes_validation():
    dates = [f"2026-01-{5 + i:02d}" for i in range(5)]
    payload = _payload(dates)
    schedule = {
        "r1": {
            dates[0]: "TRAUMA-N",
            dates[1]: "TRAUMA-N",
            dates[2]: "N",
            dates[3]: "N",
            dates[4]: "N",
        }
    }
    failures = validate_schedule(payload, schedule)
    assert not any(f["rule"] == "traumaRunCap" for f in failures)


def test_two_trauma_nights_each_in_separate_runs_passes_validation():
    dates = [f"2026-01-{5 + i:02d}" for i in range(5)]
    payload = _payload(dates)
    # dates[2] deliberately not scheduled at all -- splits the run in two.
    schedule = {
        "r1": {
            dates[0]: "TRAUMA-N",
            dates[1]: "TRAUMA-N",
            dates[3]: "TRAUMA-N",
            dates[4]: "TRAUMA-N",
        }
    }
    failures = validate_schedule(payload, schedule)
    assert not any(f["rule"] == "traumaRunCap" for f in failures)
