"""Batch 2: pass-2 elastic relaxation, conflict naming, feasibility report."""

from __future__ import annotations

import copy

import solver.validate as validate
from solver.io.payload import parse_payload
from solver.solve import solve
from tests.helpers import load_fixture


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


def test_infeasible_rest_locked_cells_force_relaxation():
    payload = parse_payload(load_fixture("infeasible_rest.json"))
    result = solve(payload)

    assert result.status == "RELAXED"
    assert result.mode == "relaxed"

    # both locked cells still land in the final schedule -- locked cells are
    # never relaxable.
    assert result.schedule["r1"]["2026-02-02"] == "N"
    assert result.schedule["r1"]["2026-02-03"] == "D"

    violations = result.feasibility["violations"]
    assert len(violations) == 1
    v = violations[0]
    assert v["rule"] == "restGap"
    assert v["tier"] == 1
    assert v["residentIds"] == ["r1"]
    assert set(v["dates"]) == {"2026-02-02", "2026-02-03"}
    assert "540min" in v["magnitude"]  # required gap == the night shift's own 9h duration


def test_infeasible_rest_validation_matches_violations_exactly():
    payload = parse_payload(load_fixture("infeasible_rest.json"))
    result = solve(payload)

    assert result.validation["passed"] is True
    failures = result.validation["failures"]
    assert len(failures) == 1
    f = failures[0]
    assert f["rule"] == "restGap"
    assert f["residentIds"] == ["r1"]

    # independent re-check agrees.
    independent = validate.validate_schedule(payload, result.schedule)
    assert independent == failures


def test_conflict_probe_reports_something_on_the_rest_fixture():
    """Best-effort per the plan -- ortools' `sufficient_assumptions_for_
    infeasibility` returns A sufficient conflicting subset, not necessarily
    a minimal one, so we only assert shape/non-emptiness rather than an
    exact literal set (that would make this test flaky against solver
    version/search changes)."""
    payload = parse_payload(load_fixture("infeasible_rest.json"))
    result = solve(payload)

    conflicts = result.feasibility["conflicts"]
    assert isinstance(conflicts, list)
    assert len(conflicts) >= 1
    assert all(isinstance(group, list) and group for group in conflicts)
    assert any("restGap:r1" in group for group in conflicts)


def test_determinism_same_fixture_solved_twice_identical_report():
    raw = load_fixture("infeasible_rest.json")
    r1 = solve(parse_payload(raw))
    r2 = solve(parse_payload(raw))

    assert r1.status == r2.status == "RELAXED"
    assert r1.schedule == r2.schedule
    assert r1.feasibility == r2.feasibility
    assert r1.report == r2.report


def test_mismatch_guard_raises_when_validator_check_disabled(monkeypatch):
    """If validate.py's rest-gap checker silently stopped detecting the
    violation the model actually relaxed, solve() must raise rather than
    return a feasibility report the independent validator can't confirm."""
    monkeypatch.setattr(validate, "_check_rest_gap", lambda payload, schedule: [])

    payload = parse_payload(load_fixture("infeasible_rest.json"))
    try:
        solve(payload)
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "do not correspond 1:1" in str(exc)


def test_double_infeasible_never_relax_conflict_stays_infeasible():
    """Two locked cells that ALSO collide on coverage max (never-relax) can't
    be fixed by any relaxation -- pass 2 itself must come back INFEASIBLE."""
    raw = copy.deepcopy(load_fixture("infeasible_rest.json"))
    # Lock r2 into the same D slot on 2026-02-03, where max is 2 -- still
    # fine on its own. Instead, force a genuine never-relax conflict: clamp
    # coverage max for D that date to 1 while TWO residents are locked onto it.
    raw["locked"].append({"residentId": "r2", "date": "2026-02-03", "shiftId": "D"})
    raw["coverage"]["D"]["2026-02-03"]["max"] = 1

    payload = parse_payload(raw)
    result = solve(payload)

    assert result.status == "INFEASIBLE"
    assert result.schedule == {}
