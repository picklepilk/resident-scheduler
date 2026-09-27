"""R9 (2026-09-27, CP-SAT-as-polisher): warm-start hint, staged objective,
and search-tuning knobs (num_workers default, symmetry_level pass-through).
See docs/PAYLOAD_SCHEMA.md's dated R9 section for the full design.
"""

from __future__ import annotations

import os

from ortools.sat.python import cp_model

from solver.build import build_model
from solver.io.payload import parse_payload
from solver.model.hint import apply_hint
from solver.model.objective import TIER_BLOCKING, TIER_ERRORS, TIER_QUALITY, TIER_RANK
from solver.solve import _num_workers, _stage_time_budgets, solve
from tests.helpers import load_fixture, make_payload


def _small_feasible_hint(resident_id="r1", shift_id="D"):
    """A hint that's fully LEGAL under the small_feasible fixture's own
    coverage requirements: ONE resident on `shift_id` every date (D's
    coverage max is 1/day, so hinting more than one resident to it on the
    same date would itself be an illegal/over-committed hint -- see the
    dedicated illegal-hint test below for that case instead)."""
    payload_raw = load_fixture("small_feasible.json")
    return [{"residentId": resident_id, "date": d, "shiftId": shift_id} for d in payload_raw["block"]["dates"]]


# ---------------------------------------------------------------------------
# Warm-start hint
# ---------------------------------------------------------------------------

def test_hint_defaults_to_empty_and_is_a_no_op():
    payload = parse_payload(load_fixture("small_feasible.json"))
    assert payload.hint == []

    build_result = build_model(payload)
    hinted = apply_hint(cp_model.CpModel(), payload, build_result.store)
    assert hinted == 0


def test_apply_hint_sets_one_and_zero_for_every_x_var():
    raw = load_fixture("small_feasible.json")
    raw["hint"] = _small_feasible_hint("r1", "D")
    payload = parse_payload(raw)
    assert len(payload.hint) > 0

    model = cp_model.CpModel()
    from solver.model.variables import build_variables
    store = build_variables(model, payload)
    hinted = apply_hint(model, payload, store)
    assert hinted == len(store.x)

    proto_hint = dict(zip(model.Proto().solution_hint.vars, model.Proto().solution_hint.values))
    for (resident_id, shift_id, date_str), var in store.x.items():
        expected = 1 if (resident_id == "r1" and shift_id == "D") else 0
        assert proto_hint[var.index] == expected


def test_solve_with_legal_hint_stays_valid_and_solves():
    raw = load_fixture("small_feasible.json")
    raw["hint"] = _small_feasible_hint("r1", "D")
    payload = parse_payload(raw)
    result = solve(payload)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.validation["passed"] is True
    assert result.report["unfilled"] == []
    assert result.report["underTarget"] == []


def test_illegal_hint_cell_does_not_crash_and_still_returns_valid_schedule():
    """A hint that names a real resident/date but an INELIGIBLE shift (not in
    `eligible[r][d]`, so no x var exists for it at all) must not crash the
    solve -- `apply_hint` only ever hints vars that already exist, and
    `repair_hint` (set whenever `payload.hint` is non-empty) tolerates the
    rest. Also includes a hint cell for a resident/date pair that violates a
    HARD constraint (locking r1 to a night shift the day before r1 is also
    locked to a day shift -- illegal under rule 17/18's rest gap) to prove a
    hint that's actively wrong under this model's hard constraints still
    yields a valid solve, not a crash or an invalid schedule.
    """
    raw = load_fixture("small_feasible.json")
    raw["hint"] = [
        # Not a real var: "Z" isn't in the shift catalog / eligible set at all.
        {"residentId": "r1", "date": "2026-01-05", "shiftId": "Z"},
        # Legal var, but paired with the next entry it describes an
        # impossible circadian sequence (night then day next date, no rest).
        {"residentId": "r2", "date": "2026-01-06", "shiftId": "N"},
        {"residentId": "r2", "date": "2026-01-07", "shiftId": "D"},
        # Unknown resident id entirely -- must be silently ignored.
        {"residentId": "does-not-exist", "date": "2026-01-05", "shiftId": "D"},
    ]
    payload = parse_payload(raw)
    result = solve(payload)

    assert result.status in ("OPTIMAL", "FEASIBLE", "RELAXED")
    assert result.validation["passed"] is True
    # The illegal night->day pair for r2 must not have survived into the
    # actual solution -- the hard rest constraint always wins over a hint.
    if result.schedule.get("r2", {}).get("2026-01-06") == "N":
        assert result.schedule.get("r2", {}).get("2026-01-07") != "D"


# ---------------------------------------------------------------------------
# Staged (lexicographic) objective
# ---------------------------------------------------------------------------

def test_default_objective_mode_is_staged():
    payload = parse_payload(load_fixture("small_feasible.json"))
    assert payload.config.objective_mode == "staged"


def test_stage_exprs_partition_sums_to_total_expr():
    """Every term lives in exactly one of the 4 groups -- summing them back
    together must reproduce total_expr exactly (same terms, same
    coefficients, just re-partitioned -- see objective.py's own comment).
    Proven by evaluating both expressions against the SAME found solution
    rather than comparing expression-tree internals: two linear expressions
    built from the identical (coef, var) pairs must evaluate identically at
    ANY solution, feasible or optimal.
    """
    payload = parse_payload(load_fixture("small_feasible.json"))
    build_result = build_model(payload)
    objective = build_result.objective
    assert set(objective.stage_exprs) == {TIER_ERRORS, TIER_BLOCKING, TIER_RANK, TIER_QUALITY}

    resummed = sum(objective.stage_exprs.values(), start=0)
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = 1
    solver.parameters.max_time_in_seconds = 5
    status = solver.solve(build_result.model)  # model.minimize(total_expr) already set by build_objective
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(objective.total_expr) == solver.value(resummed)


def test_staged_solve_matches_weighted_solve_quality_on_small_fixture():
    """Staged and weighted must both find a fully-covered, on-target,
    hard-error-free schedule for this trivially-feasible fixture -- staging
    must never make an easy instance worse."""
    raw = load_fixture("small_feasible.json")
    raw["config"]["objectiveMode"] = "staged"
    staged_result = solve(parse_payload(raw))

    raw2 = load_fixture("small_feasible.json")
    raw2["config"]["objectiveMode"] = "weighted"
    weighted_result = solve(parse_payload(raw2))

    for result in (staged_result, weighted_result):
        assert result.status in ("OPTIMAL", "FEASIBLE")
        assert result.report["unfilled"] == []
        assert result.report["underTarget"] == []


def test_staged_stage_with_no_terms_is_skipped_without_crashing():
    """A payload with no EM-core residents at all has an empty TIER_ERRORS
    group (see objective.py's `_add_target_deficit_terms` is_em_core split)
    -- the staged loop must skip straight to TIER_BLOCKING/TIER_RANK+QUALITY
    without attempting a solve on a literal `model.minimize(0)`."""
    residents = [
        {
            "id": "r1", "cohort": None, "target": None, "isEmCore": False, "isIntern": False,
            "nightExempt": False, "caps": {}, "traumaPedsSplit": None, "priorTail": {},
            "priorTailObligations": [], "priorTailHours": 0, "ayPrior": {},
        },
    ]
    raw = make_payload(residents=residents)
    result = solve(parse_payload(raw))
    assert result.status in ("OPTIMAL", "FEASIBLE")


def test_stage_time_budgets_sum_within_total_and_respect_split():
    payload = parse_payload(load_fixture("small_feasible.json"))
    object.__setattr__(payload.config, "max_time_seconds", 30.0)
    object.__setattr__(payload.config, "stage_split", (0.3, 0.2, 0.5))
    budgets = _stage_time_budgets(payload)
    assert len(budgets) == 3
    assert sum(budgets) <= payload.config.max_time_seconds + 1e-6
    # Roughly proportional (30/20/50) -- exact equality isn't required, but
    # the largest stage must be stage 3 and the smallest stage 2.
    assert budgets[2] > budgets[0] > budgets[1]


def test_stage_time_budgets_falls_back_to_default_split_when_misconfigured():
    payload = parse_payload(load_fixture("small_feasible.json"))
    object.__setattr__(payload.config, "stage_split", (0.0, 0.0, 0.0))
    budgets = _stage_time_budgets(payload)
    assert sum(budgets) <= payload.config.max_time_seconds + 1e-6
    # Default split is 15/15/70 (see payload.py's Config.stage_split) --
    # stages 1-2 tied, stage 3 by far the largest.
    assert budgets[2] > budgets[0] == budgets[1]


# ---------------------------------------------------------------------------
# Search tuning: num_workers default, symmetry_level pass-through
# ---------------------------------------------------------------------------

def test_num_workers_defaults_to_cpu_count_when_unset():
    payload = parse_payload(load_fixture("small_feasible.json"))
    raw = load_fixture("small_feasible.json")
    del raw["config"]["numWorkers"]
    payload = parse_payload(raw)
    assert payload.config.num_workers == 0  # sentinel
    assert _num_workers(payload) == (os.cpu_count() or 1)


def test_num_workers_explicit_override_still_clamped_to_cpu_count():
    raw = load_fixture("small_feasible.json")
    raw["config"]["numWorkers"] = 999999
    payload = parse_payload(raw)
    assert _num_workers(payload) == (os.cpu_count() or 1)


def test_symmetry_level_none_by_default_and_overridable():
    payload = parse_payload(load_fixture("small_feasible.json"))
    assert payload.config.symmetry_level is None

    raw = load_fixture("small_feasible.json")
    raw["config"]["symmetryLevel"] = 0
    payload2 = parse_payload(raw)
    assert payload2.config.symmetry_level == 0
    # Solving with symmetry breaking turned off must still work -- this is a
    # search-strategy knob, never a correctness one.
    result = solve(payload2)
    assert result.status in ("OPTIMAL", "FEASIBLE")
