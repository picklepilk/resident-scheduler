"""Batch 2: pass-2 elastic relaxation, conflict naming, feasibility report."""

from __future__ import annotations

import copy

import solver.validate as validate
from solver.io.payload import parse_payload
from solver.solve import solve
from tests.helpers import load_fixture, make_payload, make_resident


def test_coverage_shortage_elastic_always_stays_strict_no_pass2():
    """Default mode: coverage-min is already elastic in pass 1, so a plain
    staffing shortage never even reaches pass 2."""
    payload = parse_payload(load_fixture("infeasible_coverage.json"))
    result = solve(payload)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.mode == "strict"
    assert result.feasibility is None
    assert result.report["unfilled"] == [
        {"dateStr": "2026-04-06", "shiftId": "D", "shortBy": 1, "reason": "coverageShort"}
    ]


def test_coverage_shortage_hard_then_elastic_drives_real_pass2():
    payload = parse_payload(load_fixture("infeasible_coverage_hard.json"))
    result = solve(payload)

    assert result.status == "RELAXED"
    assert result.mode == "relaxed"
    assert result.feasibility["mode"] == "relaxed"

    violations = result.feasibility["violations"]
    assert len(violations) == 1
    v = violations[0]
    assert v["rule"] == "coverageMin"
    assert v["tier"] == 2
    assert v["dates"] == ["2026-04-06"]
    assert v["shiftIds"] == ["D"]

    # Both residents were eligible and un-targeted, so the objective's own
    # per-slack-unit gradient (from the slack var pass 2 registers even in
    # hard_then_elastic mode) should still pull toward staffing as many as
    # actually exist (2), not accepting an arbitrary shortfall for free.
    assert result.report["unfilled"] == [
        {"dateStr": "2026-04-06", "shiftId": "D", "shortBy": 1, "reason": "coverageShort"}
    ]

    # validate.py never checks coverageMin (it's the pre-existing soft rule
    # 24, not a hard one) -- relaxed-mode failures are correctly empty here.
    assert result.validation["passed"] is True
    assert result.validation["failures"] == []


def test_coverage_recommendation_verified_when_lowering_min_fixes_it():
    payload = parse_payload(load_fixture("infeasible_coverage_hard.json"))
    result = solve(payload)

    recs = result.feasibility["recommendations"]
    assert len(recs) == 1
    rec = recs[0]
    assert rec["rule"] == "coverageMin"
    assert "Reduce D minimum to 2" in rec["text"]
    assert rec["verified"] is True


def test_infeasible_rest_locked_cells_stays_infeasible_never_relaxed():
    """R7 rest-tier fix (2026-09-27): `restGap` is tier `acgme` in
    `src/lib/rulePolicy.js` -- "never broken, anywhere. No 'place anyway'
    path" -- so it's no longer one of pass 2's relaxable duty-hour families
    (see `solver/model/elastic.py`'s `ALWAYS_HARD_DUTY_HOUR_FAMILIES`). Two
    LOCKED cells (chief-entered, can't be moved) that violate rest between
    them used to be "solved" by silently breaking the rest rule instead;
    that's exactly the class of bug `chiefBenchmark.solver.test.js` caught
    live (JS `validateAll` flagging real `restShiftLength` errors on the
    solver's mapped-out schedule). The correct behavior is the same as any
    other genuinely unfixable hard conflict (see the double-locked-TRAUMA
    test below): INFEASIBLE, not a silently illegal schedule."""
    payload = parse_payload(load_fixture("infeasible_rest.json"))
    result = solve(payload)

    assert result.status == "INFEASIBLE"
    assert result.mode == "relaxed"  # pass 2 was reached and also failed
    assert result.schedule == {}
    assert result.feasibility == {"mode": "relaxed", "violations": [], "conflicts": [], "recommendations": []}
    assert result.validation == {"passed": True, "failures": []}

    # independent re-check still recognizes this AS a rest violation if you
    # hand it the (never delivered) locked-only schedule directly -- proves
    # validate.py itself didn't lose the ability to see the conflict; the
    # solver just correctly refuses to ship it.
    locked_schedule = {"r1": {"2026-02-02": "N", "2026-02-03": "D"}}
    independent = validate.validate_schedule(payload, locked_schedule)
    assert any(f["rule"] == "restGap" for f in independent)


def test_conflict_probe_on_the_rest_fixture_has_no_relaxable_literal_to_blame():
    """With restGap no longer wrapped by an `ok[...]` literal at all, the
    contradiction between the two locked cells is a plain, unconditional
    hard-constraint clash -- there's no assumption CP-SAT could drop to
    explain it away, so the probe (best-effort, diagnostic only) correctly
    comes back empty rather than pointing at a family that was never
    negotiable in the first place."""
    payload = parse_payload(load_fixture("infeasible_rest.json"))
    result = solve(payload)

    assert result.feasibility["conflicts"] == []


def test_determinism_same_fixture_solved_twice_identical_report():
    raw = load_fixture("infeasible_rest.json")
    r1 = solve(parse_payload(raw))
    r2 = solve(parse_payload(raw))

    assert r1.status == r2.status == "INFEASIBLE"
    assert r1.schedule == r2.schedule == {}
    assert r1.feasibility == r2.feasibility
    assert r1.report == r2.report


def _night_cap_relaxation_payload() -> dict:
    """A resident LOCKED into 2 nights while `caps.nights == 1` -- unlike
    restGap, `nightCap` ("6 nights total/block") is tier `override` in
    `rulePolicy.js` ("a chief may break one by hand"), so it's still one of
    pass 2's genuinely relaxable duty-hour families
    (`RELAXABLE_DUTY_HOUR_FAMILIES`). The two locked nights are 4 calendar
    days apart -- no rest/circadian/run-length rule is anywhere near
    triggered -- so `nightCap` is the ONLY thing pass 2 can possibly be
    relaxing here."""
    return make_payload(
        residents=[make_resident("r1", caps={"nights": 1})],
        eligible={"r1": {"2026-01-05": ["N"], "2026-01-09": ["N"]}},
        locked=[
            {"residentId": "r1", "date": "2026-01-05", "shiftId": "N"},
            {"residentId": "r1", "date": "2026-01-09", "shiftId": "N"},
        ],
    )


def test_infeasible_circadian_pair_locked_cells_stays_infeasible_never_relaxed():
    """Same shape as the restGap test above, for `circadianPair`
    (eve(D)->day(D+1), rule 18) -- also tier `acgme` in `rulePolicy.js`
    ("Evening shift followed by a day shift the next day" — never broken
    anywhere) and therefore also removed from
    `ALWAYS_HARD_DUTY_HOUR_FAMILIES`'s complement. Two locked cells forcing
    exactly that forbidden pair must come back INFEASIBLE, never a silently
    relaxed schedule."""
    payload_dict = make_payload(
        residents=[make_resident("r1")],
        eligible={"r1": {"2026-01-05": ["E"], "2026-01-06": ["D"]}},
        locked=[
            {"residentId": "r1", "date": "2026-01-05", "shiftId": "E"},
            {"residentId": "r1", "date": "2026-01-06", "shiftId": "D"},
        ],
    )
    payload = parse_payload(payload_dict)
    result = solve(payload)

    assert result.status == "INFEASIBLE"
    assert result.mode == "relaxed"
    assert result.schedule == {}
    assert result.feasibility == {"mode": "relaxed", "violations": [], "conflicts": [], "recommendations": []}


def test_night_cap_is_still_a_genuinely_relaxable_last_resort():
    payload = parse_payload(_night_cap_relaxation_payload())
    result = solve(payload)

    assert result.status == "RELAXED"
    assert result.mode == "relaxed"
    assert result.schedule == {"r1": {"2026-01-05": "N", "2026-01-09": "N"}}

    violations = result.feasibility["violations"]
    assert len(violations) == 1
    assert violations[0]["rule"] == "nightCap"
    assert violations[0]["residentIds"] == ["r1"]
    assert "cap 1" in violations[0]["magnitude"]


def test_mismatch_guard_raises_when_validator_check_disabled(monkeypatch):
    """If validate.py's night-cap checker silently stopped detecting the
    violation the model actually relaxed, solve() must raise rather than
    return a feasibility report the independent validator can't confirm.
    (Moved off the old `infeasible_rest.json`/restGap fixture -- restGap can
    no longer be relaxed at all, so it can never reach this guard; nightCap
    is the still-relaxable family this guard now needs to exercise.)"""
    monkeypatch.setattr(validate, "_check_night_run_and_cap_and_segments", lambda payload, schedule: [])

    payload = parse_payload(_night_cap_relaxation_payload())
    try:
        solve(payload)
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "do not correspond 1:1" in str(exc)


def test_double_locked_max_collision_absorbed_by_plus_one_overstaff():
    """Two locked cells colliding on a non-TRAUMA coverage max by exactly 1
    are no longer a never-relax conflict -- `solver/model/coverage.py`'s
    +1-overstaff allowance (mirrors the JS repairPass's
    `underTargetOverstaff` last resort, see that module's docstring) absorbs
    it directly in pass 1, before pass 2 is ever reached. This used to be
    the fixture for "never relax" (coverage max was a pure hard cap); the
    policy change means this exact scenario is the new allowed case -- see
    the TRAUMA variant below for a conflict that's still genuinely
    unfixable."""
    raw = copy.deepcopy(load_fixture("infeasible_rest.json"))
    # Drop the fixture's own r1 N(2/2)->D(2/3) lock pair -- that's restGap's
    # OWN never-relax fixture (see the tests above); this test wants ONLY
    # the coverage-max collision below isolated, not that rest conflict
    # riding along and forcing INFEASIBLE for an unrelated reason (R7 fix:
    # restGap is no longer relaxable at all).
    raw["locked"] = [lc for lc in raw["locked"] if lc["shiftId"] != "N"]
    # Lock r2 into the same D slot on 2026-02-03, where max is 2 -- still
    # fine on its own. Instead, clamp coverage max for D that date to 1
    # while TWO residents are locked onto it (exceeds max by exactly 1).
    raw["locked"].append({"residentId": "r2", "date": "2026-02-03", "shiftId": "D"})
    raw["coverage"]["D"]["2026-02-03"]["max"] = 1

    payload = parse_payload(raw)
    result = solve(payload)

    assert result.status in ("OPTIMAL", "FEASIBLE", "RELAXED")
    assert result.schedule["r1"]["2026-02-03"] == "D"
    assert result.schedule["r2"]["2026-02-03"] == "D"


def test_double_locked_max_collision_on_trauma_still_infeasible():
    """Same double-lock shape as above, but on a TRAUMA-area shift --
    TRAUMA is excluded from the +1-overstaff allowance (its max is
    separately hard-clamped to 1 and its run cap is "never relaxed"), so
    this exact conflict must still come back INFEASIBLE."""
    raw = copy.deepcopy(load_fixture("infeasible_rest.json"))
    # Same isolation as the +1-overstaff test above -- keep this test's
    # INFEASIBLE result attributable to the TRAUMA coverage-max collision
    # it's actually testing, not the fixture's own (also never-relax, but
    # unrelated) restGap conflict.
    raw["locked"] = [lc for lc in raw["locked"] if lc["shiftId"] != "N"]
    raw["shifts"]["D"]["area"] = "TRAUMA"
    raw["locked"].append({"residentId": "r2", "date": "2026-02-03", "shiftId": "D"})
    raw["coverage"]["D"]["2026-02-03"]["max"] = 1

    payload = parse_payload(raw)
    result = solve(payload)

    assert result.status == "INFEASIBLE"
    assert result.schedule == {}
