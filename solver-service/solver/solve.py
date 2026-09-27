"""Two-pass orchestration. `solve(payload)` runs pass 1 (strict); on
INFEASIBLE it runs pass 2 (elastic relaxation, `run_pass2`) and returns
whatever that produces. Pass 1 never calls pass 2 itself for any OTHER
reason -- e.g. a merely suboptimal-but-feasible pass-1 result is returned
as-is, never "upgraded" by relaxing anything.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from solver.build import BuildResult, build_model
from solver.io.payload import Payload
from solver.model.elastic import build_elastic_model
from solver.model.hint_pin import apply_hint_pins, evaluate_hint
from solver.model.objective import TIER_BLOCKING, TIER_ERRORS, TIER_QUALITY, TIER_RANK
from solver.report.builder import HARD_RELAXABLE_RULES, build_feasibility_report
from solver.validate import validate_schedule

SOLVABLE_STATUSES = ("OPTIMAL", "FEASIBLE")
PROBE_TIME_SECONDS = 5.0

# R9 (2026-09-27, CP-SAT-as-polisher): the staged solve runs the JS engine's
# 3-tier ladder (errorCount, blockingWarnCount, qualityVector) as 3 SEPARATE
# solves on the SAME model, each fixing an upper bound on the tier(s) before
# it and re-optimizing only what's left -- see solve()/`_solve_staged`'s own
# docstring and docs/PAYLOAD_SCHEMA.md's dated R9 section for the full
# tier-to-objective-term mapping. `TIER_RANK`/`TIER_QUALITY` (objective.py's
# 4 groups) are deliberately combined into ONE 3rd solve rather than 4 -- the
# JS side's own qualityVector is itself just one lexicographic tuple, not two
# further top-level betterQuality slots, so a 4th stage would over-split it.
_STAGE_3_NAME = "tier3_rankAndQuality"


def _num_workers(payload: Payload) -> int:
    """Requested worker count, clamped to what the machine actually has --
    production runs on a small box, and an unclamped high count just thrashes
    CP-SAT's own scheduler instead of parallelizing. `num_workers <= 0` (the
    new default, payload.py's Config.num_workers) means "use every core";
    an explicit positive `config.numWorkers` still overrides and is clamped
    the same way it always was.
    """
    cpu_count = os.cpu_count() or 1
    requested = payload.config.num_workers
    if requested <= 0:
        return cpu_count
    return max(1, min(requested, cpu_count))


def _configure_solver(payload: Payload, allow_repair_hint: bool = True) -> cp_model.CpSolver:
    """One place every CpSolver instance in this module gets its shared
    tuning knobs from -- num_workers/random_seed (unchanged), plus R9's
    symmetry_level override and hint-repair wiring. Determinism note: with
    num_workers > 1, CP-SAT's search is NOT deterministic run-to-run even at
    a fixed random_seed (the seed only fixes each individual worker's
    exploration order, not the cross-worker race for who reports first) --
    tests must assert on SCORE/feasibility, never on an exact schedule, for
    any multi-worker solve. `random_seed` stays fixed regardless, so a
    single-worker (`numWorkers: 1`, as every existing test payload sets)
    solve remains exactly reproducible as before.

    `allow_repair_hint=False` (used only by `_solve_staged`'s per-stage
    solves): OR-Tools 9.15's multi-worker search hits a native
    `CHECK failed: heuristics.fixed_search != nullptr` abort when a CpSolver
    with `repair_hint=True` solves a model, and that SAME model (mutated --
    a new bound + new hints) is solved AGAIN afterward, even by a brand-new
    CpSolver instance with repair_hint left at its default (confirmed by
    hand -- the corruption lives in the model's own cached state, not the
    solver object). The staged solve re-solves the SAME model up to 3 times,
    so it can never safely set this. It doesn't need to: repair_hint only
    matters for the ORIGINAL, possibly-illegal JS-supplied hint (stage 1);
    every hint staged-solve carries forward after that is this model's OWN
    just-found optimal solution, which by construction already satisfies
    every hard constraint AND the new bound it's paired with, so it needs no
    repair at all. Without `repair_hint`, CP-SAT's documented fallback for a
    hint it can't fully honor is simply to ignore it (never a crash, never an
    invalid schedule) -- verified by hand for the illegal-hint-cell case
    this same module's tests cover.
    """
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = _num_workers(payload)
    solver.parameters.random_seed = payload.config.random_seed
    if payload.config.symmetry_level is not None:
        solver.parameters.symmetry_level = payload.config.symmetry_level
    if payload.hint and allow_repair_hint:
        # repair_hint lets CP-SAT accept a hint that's PARTIALLY illegal
        # under this model's hard constraints (a stale/locked-conflicting
        # cell) without rejecting the whole hint -- see solver/model/hint.py.
        solver.parameters.repair_hint = True
    return solver


def _is_empty_stage(expr) -> bool:
    """`objective.py`'s TermGroup.add() only ever appends when coef != 0, and
    `stage_exprs[name]` is built via `sum((...), start=0)` -- a tier with NO
    terms at all comes back as the bare python int 0, never a degenerate
    OrTools LinearExpr. Spec: "stage with no terms is skipped" -- skipping
    means no solve, no bound, no hint-carry for that stage at all.
    """
    return isinstance(expr, int) and expr == 0


def _stage_time_budgets(payload: Payload) -> list:
    """Splits `config.max_time_seconds` across the 3 staged-solve stages per
    `config.stage_split` (default 15/15/70, see payload.py's Config).
    Defensively renormalizes so the 3 fractions sum to 1 (a misconfigured
    payload degrades to the default split rather than mis-sizing every
    stage), and floors each stage at 0.1s so a very small fraction still gets
    A solve rather than none -- then rescales back down if that flooring
    would have pushed the total over `max_time_seconds` (spec: "total <= the
    existing time limit").
    """
    total = max(0.1, payload.config.max_time_seconds)
    splits = list(payload.config.stage_split)
    if len(splits) != 3 or sum(splits) <= 0:
        splits = [0.15, 0.15, 0.7]
    s = sum(splits)
    normalized = [x / s for x in splits]
    budgets = [max(0.1, total * f) for f in normalized]
    budget_sum = sum(budgets)
    if budget_sum > total:
        budgets = [b * (total / budget_sum) for b in budgets]
    return budgets


def _carry_hint(model, store, solver: cp_model.CpSolver) -> None:
    """Replaces the model's hint with THIS stage's own solution -- every
    later stage's search then starts from an already-optimal-for-earlier-
    tiers point, not from the original (pre-any-stage) JS warm start. Cheap:
    x is the only variable family staged-solve hints, same as `apply_hint`.
    """
    model.clear_hints()
    for var in store.x.values():
        model.add_hint(var, solver.value(var))


# Tiebreak multiplier for the staged solve (see `_solve_staged`'s own
# docstring for the problem this fixes). Chosen the same "moderate, generous,
# documented -- not a proof for pathological inputs" way objective.py's own
# weights are (that module's docstring's whole point is that an exact
# multiplicative ratchet is mathematically impossible under int64 once
# hundreds of literals stack -- this is the SAME family of tradeoff, just
# only 2 levels deep per stage instead of N). `coverageMin`'s own per-slot
# weight (the single largest per-term weight in the whole objective,
# config/default_weights.json) is 1,000,000 -- even a worst-case block with
# thousands of coverage/quality terms stacked keeps the "everything after
# this stage" sum many orders of magnitude below `_TIEBREAK_MULTIPLIER`
# times this stage's own smallest per-unit weight (targetDeficitCore's
# 10,000), and the whole product stays deep inside int64's ~9.2e18 ceiling.
_TIEBREAK_MULTIPLIER = 1_000_000


def _solve_staged(payload: Payload, build_result: BuildResult):
    """Runs the 3-stage lexicographic ladder described at `_STAGE_3_NAME`'s
    own module-level comment, on the SAME model/store build_model() already
    produced (no rebuild between stages -- only the objective and an
    ever-growing set of "stage N was already this good" bound constraints
    change). Returns (status_name, solver, solve_time_ms): `solver` holds the
    LAST stage that actually produced a solution, so callers extract the
    schedule/report from it exactly like the single-shot path does.

    TIEBREAK (found by hand via engineHeadToHead.test.js's R9 proof, part 4 --
    the "vacationHeavy" fixture initially LOST to local under a naive staged
    solve): minimizing a stage's own term in isolation leaves CP-SAT free to
    pick ANY solution tied for that stage's optimum, including one that's
    arbitrarily bad for every LATER stage -- e.g. stage 1 (targetDeficitCore)
    has zero cost signal for coverage, so an optimal-for-stage-1 solution can
    trash coverage (stage 3's job) as a side effect, even starting from an
    already-good warm-start hint. Each non-final stage therefore actually
    minimizes `_TIEBREAK_MULTIPLIER * this_stage_expr + sum(every LATER
    stage's expr)` -- the multiplier keeps this stage strictly primary (a
    real lexicographic tier is never traded away for a later one), while the
    added tail sum breaks ties in favor of whatever's cheapest downstream,
    which is exactly what keeps a warm-started, already-good schedule from
    being needlessly disturbed. The BOUND fixed before moving to the next
    stage is still on the stage's OWN raw expr (never the composite), so
    "stage N was already this good" means exactly what it says.

    "If a stage returns no solution, return the best solution found so far"
    (spec): a later stage's own INFEASIBLE/UNKNOWN never discards an earlier
    stage's real solution -- the loop just stops and hands back the last
    successful `solver`. Only the FIRST stage failing outright has nothing to
    fall back to, so that (rare -- pass 1 is only ever called when a full
    strict solve is expected to be feasible) case reports whatever status
    that first solve returned, same as the pre-staged code path always did.
    """
    model = build_result.model
    store = build_result.store
    objective = build_result.objective

    stage_defs = [
        (TIER_ERRORS, objective.stage_exprs[TIER_ERRORS]),
        (TIER_BLOCKING, objective.stage_exprs[TIER_BLOCKING]),
        (_STAGE_3_NAME, objective.stage_exprs[TIER_RANK] + objective.stage_exprs[TIER_QUALITY]),
    ]
    budgets = _stage_time_budgets(payload)

    total_time_ms = 0
    last_status_name = None
    have_solution = False
    solver = None
    # The solver instance from the LAST stage that actually produced a
    # solvable status. A later stage's own solver is reassigned every
    # iteration (including on failure) -- returning that failed solver's
    # (invalid) values instead of this one was a real bug: on `break`, the
    # bare `solver` variable held the FAILED stage's CpSolver, whose
    # `.value(...)`/schedule extraction is meaningless (no accepted
    # solution). `last_good_solver` is the one thing this function may ever
    # hand back to a caller.
    last_good_solver = None

    for i, ((name, expr), budget) in enumerate(zip(stage_defs, budgets)):
        if _is_empty_stage(expr):
            continue
        is_last = name == stage_defs[-1][0]
        # See this function's own TIEBREAK paragraph: every stage after this
        # one is added at a heavily discounted weight purely to break ties
        # among solutions that are equally good for THIS stage.
        later_sum = sum((e for _n, e in stage_defs[i + 1:]), start=0)
        minimize_expr = expr if is_last or _is_empty_stage(later_sum) else _TIEBREAK_MULTIPLIER * expr + later_sum
        model.minimize(minimize_expr)
        # A FRESH CpSolver per stage (cheap -- parameters are trivial to
        # reapply), with repair_hint never set -- see `_configure_solver`'s
        # own docstring for the native-crash reason. `allow_repair_hint`
        # covers repair_hint specifically; num_workers/seed/symmetry are
        # still reapplied every stage.
        solver = _configure_solver(payload, allow_repair_hint=False)
        solver.parameters.max_time_in_seconds = budget
        t0 = time.time()
        status = solver.solve(model)
        total_time_ms += int((time.time() - t0) * 1000)
        status_name = solver.status_name(status)

        if status_name not in SOLVABLE_STATUSES:
            if have_solution:
                break  # keep the previous stage's solver/solution as final
            return status_name, solver, total_time_ms  # first stage failed outright -- nothing to fall back to

        have_solution = True
        last_status_name = status_name
        last_good_solver = solver
        if not is_last:
            model.add(expr <= round(solver.value(expr)))
            _carry_hint(model, store, solver)

    if last_status_name is None:
        # Degenerate payload: every stage was empty (no soft terms anywhere
        # -- e.g. no EM-core residents, no night shifts, no coverage minimums
        # at all). The loop above never called solver.solve() at all, so fall
        # back to one plain solve against whatever build_objective() already
        # set as the model's objective (0, in this exact case) rather than
        # reporting a bogus INFEASIBLE for what may be a perfectly feasible
        # (just unscored) schedule.
        solver = solver or _configure_solver(payload, allow_repair_hint=False)
        solver.parameters.max_time_in_seconds = payload.config.max_time_seconds
        t0 = time.time()
        status = solver.solve(model)
        total_time_ms += int((time.time() - t0) * 1000)
        last_status_name = solver.status_name(status)
        last_good_solver = solver

    return last_status_name, last_good_solver, total_time_ms


@dataclass
class SolveResult:
    status: str            # "OPTIMAL" | "FEASIBLE" | "RELAXED" | "INFEASIBLE" | "ERROR"
    mode: str               # "strict" | "relaxed"
    schedule: dict
    objective_value: int
    solve_time_ms: int
    seed: int
    report: dict
    validation: dict
    feasibility: dict = None


def solve(payload: Payload) -> SolveResult:
    result = _solve_pass1(payload)
    if result.status != "INFEASIBLE":
        return result
    return run_pass2(payload)


def _apply_hint_pinning(payload: Payload, build_result: BuildResult) -> dict:
    """R9 follow-up ("pin to hint", see solver/model/hint_pin.py): only in
    staged mode, and only when a hint was actually supplied -- weighted mode
    is the deliberate pre-R9 rollback path and gets none of this. Mutates
    `build_result.model` in place (adds hard `<=` constraints) when the hint
    is feasible; returns a small diagnostics dict that rides along in every
    SolveResult's `report["hintPinning"]` regardless of outcome, per the
    "record hintFeasible:false" spec.
    """
    if payload.config.objective_mode != "staged" or not payload.hint:
        return {"applied": False, "hintFeasible": None, "pinned": {}}

    hint_eval = evaluate_hint(payload, build_result)
    if not hint_eval.feasible:
        return {"applied": False, "hintFeasible": False, "pinned": {}}

    apply_hint_pins(build_result.model, payload, build_result.objective, hint_eval)
    return {"applied": True, "hintFeasible": True, "pinned": hint_eval.components}


def _solve_pass1(payload: Payload) -> SolveResult:
    build_result = build_model(payload)
    store = build_result.store
    objective = build_result.objective

    hint_diag = _apply_hint_pinning(payload, build_result)

    # R9: staged is the new default (payload.py's Config.objective_mode) --
    # `"weighted"` keeps the pre-R9 single-shot solve on `objective.total_expr`
    # for comparison/rollback. build_model() already called
    # `model.minimize(objective.total_expr)` as its own default, so the
    # weighted branch needs no further setup beyond solving as before.
    if payload.config.objective_mode == "staged":
        status_name, solver, solve_time_ms = _solve_staged(payload, build_result)
    else:
        solver = _configure_solver(payload)
        solver.parameters.max_time_in_seconds = payload.config.max_time_seconds
        t0 = time.time()
        status = solver.solve(build_result.model)
        solve_time_ms = int((time.time() - t0) * 1000)
        status_name = solver.status_name(status)

    if status_name not in SOLVABLE_STATUSES:
        return SolveResult(
            status="INFEASIBLE",
            mode="strict",
            schedule={},
            objective_value=0,
            solve_time_ms=solve_time_ms,
            seed=payload.config.random_seed,
            report=_empty_report(hint_diag),
            validation={"passed": True, "failures": []},
            feasibility=None,
        )

    schedule = _extract_schedule(solver, store)
    report = _build_report(solver, objective, hint_diag)

    failures = validate_schedule(payload, schedule)
    if failures:
        raise RuntimeError(
            f"solver/validate.py found {len(failures)} failure(s) in a strict-mode (pass-1) result "
            f"-- this is a build/objective bug, not a legitimate relaxation: {failures[:3]}"
        )

    return SolveResult(
        status=status_name,
        mode="strict",
        schedule=schedule,
        # `solver.value(objective.total_expr)` rather than
        # `solver.objective_value`: in staged mode the model's LAST
        # `model.minimize()` call was stage 3's own (partial) expression, not
        # `total_expr`, so `.objective_value` would report the wrong number.
        # `Value()` evaluates any expression against the current solution
        # regardless of what was actually minimized, so this is exactly
        # `.objective_value` in weighted mode (unchanged) and the FULL
        # objective's value for the final staged solution otherwise.
        objective_value=round(solver.value(objective.total_expr)),
        solve_time_ms=solve_time_ms,
        seed=payload.config.random_seed,
        report=report,
        validation={"passed": True, "failures": []},
        feasibility=None,
    )


def run_pass2(payload: Payload) -> SolveResult:
    """Pass 2: rebuild the model from scratch with relaxable families
    elastic (solver/model/elastic.py), probe for a minimal conflicting set
    of assumptions (best-effort, for `feasibility.conflicts`), then run the
    real optimizing solve WITHOUT assumptions -- penalties, not assumptions,
    decide what actually breaks.
    """
    elastic = build_elastic_model(payload)
    model = elastic.model
    store = elastic.store

    conflicts = _run_conflict_probe(payload, elastic)

    # R9 gap (documented, out of scope here -- see docs/PAYLOAD_SCHEMA.md):
    # pass 2 keeps the single-shot WEIGHTED objective regardless of
    # `config.objectiveMode`. Its own 3-tier relaxation-penalty stack
    # (relaxDutyHour > relaxCoverageMin > relaxPolicyCaps > the whole soft
    # objective, see elastic.py's module docstring) is a different,
    # orthogonal lexicographic ladder from betterQuality's -- staging BOTH
    # ladders in one solve is real design work left for a future round; the
    # warm-start hint (`_configure_solver`/`apply_hint`) still applies here.
    solver = _configure_solver(payload)
    solver.parameters.max_time_in_seconds = payload.config.max_time_seconds

    t0 = time.time()
    status = solver.solve(model)
    solve_time_ms = int((time.time() - t0) * 1000)
    status_name = solver.status_name(status)

    if status_name not in SOLVABLE_STATUSES:
        # Even the elastic model is infeasible -- a never-relax rule
        # conflict (e.g. two locked cells vs. coverage max). Client falls
        # back to the JS engine on any non-"strict schedule" status.
        return SolveResult(
            status="INFEASIBLE",
            mode="relaxed",
            schedule={},
            objective_value=0,
            solve_time_ms=solve_time_ms,
            seed=payload.config.random_seed,
            report=_empty_report(),
            validation={"passed": True, "failures": []},
            feasibility={"mode": "relaxed", "violations": [], "conflicts": conflicts, "recommendations": []},
        )

    schedule = _extract_schedule(solver, store)
    report = _build_report_relaxed(payload, schedule, solver, elastic.objective)

    failures = validate_schedule(payload, schedule)
    feasibility = build_feasibility_report(
        payload, schedule, elastic, solver, failures, conflicts, payload.config.max_verification_resolves
    )
    _assert_relaxed_matches_validation(failures, feasibility["violations"])

    return SolveResult(
        status="RELAXED",
        mode="relaxed",
        schedule=schedule,
        objective_value=round(solver.objective_value),
        solve_time_ms=solve_time_ms,
        seed=payload.config.random_seed,
        report=report,
        validation={"passed": True, "failures": failures},
        feasibility=feasibility,
    )


def _run_conflict_probe(payload: Payload, elastic) -> list:
    """Best-effort: solve the elastic model with EVERY `ok[...]` literal
    assumed true (equivalent to the strict model for every relaxable
    family), and on INFEASIBLE, ask CP-SAT for a minimal conflicting subset.
    Empty list on a probe timeout or an unexpectedly-feasible probe --
    conflicts are diagnostic, never load-bearing for the real solve below.
    """
    if not elastic.all_ok_lits:
        return []

    model = elastic.model
    model.add_assumptions(elastic.all_ok_lits)

    probe_solver = cp_model.CpSolver()
    probe_solver.parameters.max_time_in_seconds = min(PROBE_TIME_SECONDS, payload.config.max_time_seconds)
    probe_solver.parameters.num_workers = _num_workers(payload)
    probe_solver.parameters.random_seed = payload.config.random_seed

    status = probe_solver.solve(model)
    conflicts = []
    if probe_solver.status_name(status) == "INFEASIBLE":
        labels = [
            elastic.label_by_index[idx]
            for idx in probe_solver.sufficient_assumptions_for_infeasibility()
            if idx in elastic.label_by_index
        ]
        if labels:
            conflicts.append(labels)

    model.clear_assumptions()
    return conflicts


def _assert_relaxed_matches_validation(failures: list, violations: list) -> None:
    """The independent validate.py re-check's failures must correspond 1:1
    (by rule + residentId) to the hard-rule subset of feasibility.violations
    -- coverageMin is excluded from this comparison since validate.py never
    claims to check it (rule 24 is the pre-existing soft/elastic rule, not a
    hard one; see solver/validate.py's own docstring). A mismatch means
    build.py/elastic.py and validate.py disagree about what actually broke
    -- a bug, not a legitimate relaxation -- so this raises (-> HTTP 500,
    client falls back to the JS engine), matching pass 1's own convention.
    """
    failure_keys = {(f["rule"], rid) for f in failures if f["rule"] in HARD_RELAXABLE_RULES for rid in f["residentIds"]}
    violation_keys = {
        (v["rule"], rid) for v in violations if v["rule"] in HARD_RELAXABLE_RULES for rid in v["residentIds"]
    }
    if failure_keys != violation_keys:
        raise RuntimeError(
            "solver/validate.py's failures do not correspond 1:1 to feasibility.violations in relaxed mode "
            f"-- only in failures: {sorted(failure_keys - violation_keys)}, "
            f"only in violations: {sorted(violation_keys - failure_keys)}"
        )


def _extract_schedule(solver: cp_model.CpSolver, store) -> dict:
    schedule = {}
    for (resident_id, shift_id, date_str), var in store.x.items():
        if solver.value(var) == 1:
            schedule.setdefault(resident_id, {})[date_str] = shift_id
    return schedule


def _default_hint_diag() -> dict:
    return {"applied": False, "hintFeasible": None, "pinned": {}}


def _build_report(solver: cp_model.CpSolver, objective, hint_diag: dict = None) -> dict:
    unfilled = []
    for (shift_id, date_str), slack in objective.coverage_slacks.items():
        short = solver.value(slack)
        if short > 0:
            unfilled.append({"dateStr": date_str, "shiftId": shift_id, "shortBy": int(short), "reason": "coverageShort"})

    rest_compromises = []
    for p in objective.post_night_rest_penalties:
        if solver.value(p.var) >= 1:
            rest_compromises.append(
                {
                    "residentId": p.resident_id,
                    "dateStr": p.date1,
                    "shiftId": p.shift_id1,
                    "gapH": round(p.gap_min / 60, 1),
                }
            )

    under_target = []
    for resident_id, (target, deficit_var) in objective.target_deficit_vars.items():
        deficit = solver.value(deficit_var)
        if deficit > 0:
            under_target.append(
                {"residentId": resident_id, "assigned": int(target - deficit), "target": int(target)}
            )

    return {
        "unfilled": unfilled,
        "restCompromises": rest_compromises,
        "underTarget": under_target,
        "seniorGaps": [],
        # R9 follow-up ("pin to hint", solver/model/hint_pin.py): diagnostics
        # for whether the warm-start hint was feasible under this model's own
        # hard constraints and, if so, what got pinned. Additive-only key --
        # `api/schemas.py`'s SolveResponse.report is a plain `dict`, and
        # `mapSolverResult` (ResidentScheduler.jsx) never inspects unknown
        # report keys, so this can never break either contract.
        "hintPinning": hint_diag if hint_diag is not None else _default_hint_diag(),
    }


def _build_report_relaxed(payload: Payload, schedule: dict, solver: cp_model.CpSolver, objective) -> dict:
    """Same shape as `_build_report`, but `unfilled` is recomputed directly
    from the concrete schedule vs. `payload.coverage` rather than from
    `objective.coverage_slacks` -- that dict is EMPTY in "hard_then_elastic"
    mode (coverage.py never builds the slack branch there), so relying on it
    would silently under-report coverage shortfalls in that mode.
    """
    report = _build_report(solver, objective)
    counts: dict = {}
    for _rid, by_date in schedule.items():
        for d, sid in by_date.items():
            counts[(sid, d)] = counts.get((sid, d), 0) + 1
    unfilled = []
    for shift_id, by_date in payload.coverage.items():
        for date_str, entry in by_date.items():
            assigned = counts.get((shift_id, date_str), 0)
            if assigned < entry.min:
                unfilled.append(
                    {"dateStr": date_str, "shiftId": shift_id, "shortBy": int(entry.min - assigned), "reason": "coverageShort"}
                )
    report["unfilled"] = unfilled
    return report


def _empty_report(hint_diag: dict = None) -> dict:
    return {
        "unfilled": [],
        "restCompromises": [],
        "underTarget": [],
        "seniorGaps": [],
        "hintPinning": hint_diag if hint_diag is not None else _default_hint_diag(),
    }
