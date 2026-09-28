"""R9 follow-up (2026-09-27, "pin the polisher to its own hint") --
solver/model/hint_pin.py + solve.py's `_apply_hint_pinning`. See that
module's own docstring and docs/PAYLOAD_SCHEMA.md's dated R9 section for the
full design: the staged solve now measures the warm-start hint's own
achieved value on 3 components (targetDeficitCore, postNightRest,
coverageMin slack) and adds each as a hard `<=` upper
bound on the real model BEFORE the staged solve runs, so the polisher can
never trade one of these for a cheaper move elsewhere and come back strictly
worse than the hint on anything the solver itself can measure.
"""

from __future__ import annotations

from ortools.sat.python import cp_model

import solver.solve as solve_module
from solver.build import build_model
from solver.io.payload import parse_payload
from solver.model.hint_pin import PINNED_COMPONENTS, apply_hint_pins, evaluate_hint, pinned_component_exprs
from solver.solve import solve
from tests.helpers import load_fixture


def _full_coverage_hint():
    """A hint that's fully LEGAL under EVERY hard constraint in
    small_feasible.json -- not just coverage. (A single-resident-every-date
    hint, the shape test_hint_and_staged.py's own `_small_feasible_hint`
    uses, only checks out as a SOFT hint; hard-PINNING it, as
    `evaluate_hint` does, exposes that it actually violates r1's own hard
    `targetCeiling` cap of 3 by assigning all 5 dates to one resident --
    count_caps.py's `targetCeiling` spec caps every resident's total
    assignments at their own `target`.) This hint instead splits D's 5 daily
    slots (min=1/max=1 every date) across r1 (first 3 dates -- exactly its
    target of 3, so its EM-core deficit pins at 0) and r2 (last 2 dates,
    under its own target of 3, non-core so unpinned).
    """
    payload_raw = load_fixture("small_feasible.json")
    dates = payload_raw["block"]["dates"]
    hint = [{"residentId": "r1", "date": d, "shiftId": "D"} for d in dates[:3]]
    hint += [{"residentId": "r2", "date": d, "shiftId": "D"} for d in dates[3:]]
    return hint


def test_no_hint_means_no_pinning_and_default_diagnostics():
    payload = parse_payload(load_fixture("small_feasible.json"))
    assert payload.hint == []
    result = solve(payload)
    assert result.report["hintPinning"] == {"applied": False, "hintFeasible": None, "pinned": {}}


def test_weighted_mode_never_pins_even_with_a_hint_present():
    raw = load_fixture("small_feasible.json")
    raw["hint"] = _full_coverage_hint()
    raw["config"]["objectiveMode"] = "weighted"
    result = solve(parse_payload(raw))
    assert result.report["hintPinning"] == {"applied": False, "hintFeasible": None, "pinned": {}}


def test_legal_hint_is_feasible_and_pinned_at_its_own_achieved_values():
    raw = load_fixture("small_feasible.json")
    raw["hint"] = _full_coverage_hint()
    payload = parse_payload(raw)

    build_result = build_model(payload)
    hint_eval = evaluate_hint(payload, build_result)
    assert hint_eval.feasible is True
    assert set(hint_eval.components) == set(PINNED_COMPONENTS)
    # This hint fully satisfies D's min=1/max=1 coverage, hints no night
    # shifts (no postNightRest exposure), and gives the one EM-core resident
    # (r1) exactly their target -- every pinned component should read 0.
    assert hint_eval.components == {
        "targetDeficitCore": 0, "postNightRest": 0, "coverageMin": 0,
    }

    result = solve(payload)
    diag = result.report["hintPinning"]
    assert diag["applied"] is True
    assert diag["hintFeasible"] is True
    assert diag["pinned"] == hint_eval.components
    # The real solve must never end up WORSE than what got pinned.
    assert result.report["unfilled"] == []  # coverageMin slack stayed at 0
    core_shortfall = sum(
        u["target"] - u["assigned"] for u in result.report["underTarget"]
        if payload.residents_by_id[u["residentId"]].is_em_core
    )
    assert core_shortfall <= diag["pinned"]["targetDeficitCore"]


def test_illegal_hint_is_infeasible_and_falls_back_to_unpinned_staged_solve():
    """Same illegal night->day hint shape as test_hint_and_staged.py's own
    crash-safety test -- fixing every x var to this hint makes the model
    infeasible (rule 17/18's hard rest gap), so pinning must be skipped
    entirely and the ordinary (pre-pinning) staged solve must still run."""
    raw = load_fixture("small_feasible.json")
    raw["hint"] = [
        {"residentId": "r1", "date": "2026-01-05", "shiftId": "N"},
        {"residentId": "r1", "date": "2026-01-06", "shiftId": "D"},
    ]
    payload = parse_payload(raw)

    build_result = build_model(payload)
    hint_eval = evaluate_hint(payload, build_result)
    assert hint_eval.feasible is False
    assert hint_eval.components == {}

    result = solve(payload)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.validation["passed"] is True
    diag = result.report["hintPinning"]
    assert diag == {"applied": False, "hintFeasible": False, "pinned": {}}


def test_pinned_component_exprs_only_counts_em_core_residents_for_target_deficit():
    """r1 is EM-core (target 3), r2/r3 are not -- a hint that leaves r2/r3
    under target must still pin targetDeficitCore at 0 (r1, the only core
    resident, met its target exactly), regardless of r2/r3's own (non-core,
    TIER_QUALITY-only) shortfall."""
    raw = load_fixture("small_feasible.json")
    raw["hint"] = _full_coverage_hint()  # r3 gets nothing at all -> non-core deficit 3
    payload = parse_payload(raw)
    build_result = build_model(payload)

    exprs = pinned_component_exprs(payload, build_result.objective)
    assert set(exprs) == set(PINNED_COMPONENTS)

    hint_eval = evaluate_hint(payload, build_result)
    assert hint_eval.feasible is True
    assert hint_eval.components["targetDeficitCore"] == 0  # r1 (the only core resident) met target

    result = solve(payload)
    non_core_shortfall = sum(
        u["target"] - u["assigned"] for u in result.report["underTarget"]
        if not payload.residents_by_id[u["residentId"]].is_em_core
    )
    # r2/r3 (non-core) are free to stay under target -- pinning never touches
    # them, so this is unconstrained by hintPinning and may be > 0.
    assert non_core_shortfall >= 0


def test_staged_stage1_unknown_with_feasible_hint_falls_back_to_hint_not_pass2(monkeypatch):
    """2026-09-28 fix ("never fall to pass 2 when the warm-start hint is
    feasible"): `evaluate_hint` can prove a hint feasible under the pass-1
    model's own hard constraints, then the staged solve's FIRST stage can
    still come back UNKNOWN if it merely runs out of its (small, 15% by
    default) time budget before finishing search -- this is NOT a real
    infeasibility. Before this fix, `_solve_pass1` collapsed that UNKNOWN
    into an outward "INFEASIBLE" status, and `solve()` then unconditionally
    escalated to pass 2 (`run_pass2`), which can legally relax rules
    (nightCap/nightSegments) the hint never needed to touch at all, and uses
    a different (single-shot weighted) objective that can score worse than
    the hint itself. The fix: when the first staged-solve stage fails with
    no earlier-stage solution to fall back to, and `evaluate_hint` already
    proved the hint feasible, report the hint's OWN already-solved clone as
    the pass-1 result instead.

    Call-count bookkeeping: call #1 is `evaluate_hint`'s clone solve (must
    succeed normally so the hint really is proven feasible); call #2 is
    stage 1 (TIER_ERRORS, the first non-empty stage for this fixture) --
    forced to UNKNOWN here. The fix must return immediately at that point
    (never touching stage 2/3), so no further `CpSolver.solve` calls happen.
    """
    raw = load_fixture("small_feasible.json")
    raw["hint"] = _full_coverage_hint()
    payload = parse_payload(raw)

    original_cpsolver_solve = cp_model.CpSolver.solve
    call_count = {"n": 0}

    def fake_solve(self, model):
        call_count["n"] += 1
        if call_count["n"] == 2:
            return cp_model.UNKNOWN
        return original_cpsolver_solve(self, model)

    monkeypatch.setattr(cp_model.CpSolver, "solve", fake_solve)

    result = solve_module.solve(payload)

    assert call_count["n"] == 2, "fix must return immediately on the hint fallback, never reaching stage 2/3"
    assert result.status == "FEASIBLE"
    assert result.mode == "strict"  # pass 2 (mode "relaxed") must never have run
    assert result.feasibility is None
    diag = result.report["hintPinning"]
    assert diag["applied"] is True
    assert diag["hintFeasible"] is True
    assert result.validation["passed"] is True
    # The fallback schedule must be exactly the hint's own placement.
    dates = load_fixture("small_feasible.json")["block"]["dates"]
    assert result.schedule["r1"] == {d: "D" for d in dates[:3]}
    assert result.schedule["r2"] == {d: "D" for d in dates[3:]}


def test_apply_hint_pins_adds_hard_constraints_to_the_real_model():
    """Direct check that pinning actually changes the model handed to the
    staged solve (not just a no-op diagnostic) -- constraint count on the
    real model must grow by exactly one `<=` per pinned component relative
    to an identical build with no hint at all."""
    raw_no_hint = load_fixture("small_feasible.json")
    payload_no_hint = parse_payload(raw_no_hint)
    build_no_hint = build_model(payload_no_hint)
    baseline_constraints = len(build_no_hint.model.proto.constraints)

    raw_hinted = load_fixture("small_feasible.json")
    raw_hinted["hint"] = _full_coverage_hint()
    payload_hinted = parse_payload(raw_hinted)
    build_hinted = build_model(payload_hinted)

    hint_eval = evaluate_hint(payload_hinted, build_hinted)
    assert hint_eval.feasible is True
    apply_hint_pins(build_hinted.model, payload_hinted, build_hinted.objective, hint_eval)
    pinned_constraints = len(build_hinted.model.proto.constraints)

    assert pinned_constraints == baseline_constraints + len(PINNED_COMPONENTS)
