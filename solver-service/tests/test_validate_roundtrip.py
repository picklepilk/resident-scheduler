import copy

from solver.io.payload import parse_payload
from solver.solve import solve
from solver.validate import validate_schedule
from tests.helpers import load_fixture


def test_solve_small_feasible_passes_validation():
    payload = parse_payload(load_fixture("small_feasible.json"))
    result = solve(payload)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.validation["passed"] is True
    assert result.validation["failures"] == []
    # solve() itself raises on a strict-mode validation mismatch -- reaching
    # here at all is already a pass, but re-run the independent check too.
    assert validate_schedule(payload, result.schedule) == []


def test_hand_broken_schedule_fails_validation_on_coverage_max():
    payload = parse_payload(load_fixture("small_feasible.json"))
    result = solve(payload)
    schedule = copy.deepcopy(result.schedule)

    # D's coverage max is 1 every day in this fixture, and D (POD/day) gets the +1 last-resort
    # overstaff allowance (solver/model/coverage.py) -- validate.py's independent re-check must
    # mirror that allowance (fixed 2026-09-27, was failing on the allowed +1 too), so triple-book it
    # to genuinely exceed max+1=2.
    schedule.setdefault("r1", {})["2026-01-05"] = "D"
    schedule.setdefault("r2", {})["2026-01-05"] = "D"
    schedule.setdefault("r3", {})["2026-01-05"] = "D"

    failures = validate_schedule(payload, schedule)
    assert any(f["rule"] == "coverageMax" for f in failures)


def test_coverage_max_allows_the_same_plus_one_overstaff_validate_side():
    """Mirrors test_coverage.py's build-side `test_max_side_is_elastic_by_exactly_one_for_non_trauma`
    -- validate.py's independent `_check_coverage_max` must allow the exact same +1 for a non-TRAUMA,
    non-Peds-night shift, not just the build side (this is the pre-existing gap fixed 2026-09-27)."""
    payload = parse_payload(load_fixture("small_feasible.json"))
    result = solve(payload)
    schedule = copy.deepcopy(result.schedule)

    # D's coverage max is 1 -- exactly ONE over is the documented last-resort allowance, not a
    # failure.
    schedule.setdefault("r1", {})["2026-01-05"] = "D"
    schedule.setdefault("r2", {})["2026-01-05"] = "D"

    failures = validate_schedule(payload, schedule)
    assert not any(f["rule"] == "coverageMax" for f in failures)


def test_hand_broken_schedule_fails_validation_on_eligibility():
    payload = parse_payload(load_fixture("small_feasible.json"))
    # 2026-01-10 is outside the fixture's block/eligible dates entirely, so a
    # real catalog shift ("D") assigned there is unambiguously not eligible.
    schedule = {"r1": {"2026-01-10": "D"}}

    failures = validate_schedule(payload, schedule)
    assert any(f["rule"] == "eligibility" for f in failures)


def test_hand_broken_schedule_fails_validation_on_locked_cell_dropped():
    payload = parse_payload(load_fixture("cross_midnight.json"))
    # cross_midnight.json locks r1 into "N" on 2026-02-02 -- an empty schedule
    # silently drops that fact.
    failures = validate_schedule(payload, {})
    assert any(f["rule"] == "locked" for f in failures)
