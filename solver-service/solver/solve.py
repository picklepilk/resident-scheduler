"""Two-pass orchestration. `solve(payload)` runs pass 1 (strict); on
INFEASIBLE it runs pass 2 (elastic relaxation, `run_pass2`) and returns
whatever that produces. Pass 1 never calls pass 2 itself for any OTHER
reason -- e.g. a merely suboptimal-but-feasible pass-1 result is returned
as-is, never "upgraded" by relaxing anything.
"""

from __future__ import annotations

import dataclasses
import logging
import os
import threading
import time
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from solver.runner import runner_info

# ─── Cancellable background solves (jobs API, api/jobs.py) ─────────────────
# `solve()` itself knows nothing about jobs/threads -- this is a thin,
# additive registry so a job runner thread can ask whatever CpSolver
# instance(s) `solve()` is CURRENTLY using (there can be several across a
# staged solve's stages) to stop. Per-thread (not global) so the
# synchronous /solve request path -- which never calls `begin_stoppable_run`
# -- pays zero cost and sees zero behavior change; only a thread that opted
# in via `begin_stoppable_run()` ever has entries appended to it.
#
# `StopSearch()` is documented by OR-Tools as safe to call from a different
# thread while `Solve`/`solve` is running on the registered solver, and a
# no-op if the solve has already finished -- so a cancel racing the gap
# between two staged-solve stages just means the NEXT solver (appended right
# before its own `.solve()` call) still gets stopped almost immediately,
# rather than running to completion.
_tls = threading.local()


def begin_stoppable_run(on_progress=None) -> list:
    """Call once, on the thread that is about to call `solve(payload)`, before
    doing so. Returns the (empty) list that will be appended to -- a job
    runner keeps this list and calls `.StopSearch()` on every entry to cancel.

    `on_progress` (optional): in-process progress sink for this thread's solve
    -- `solve()` falls back to it when no explicit `on_progress=` is passed, so
    a job runner can get progress without changing `solve()`'s call shape. See
    `ProgressReporter` for the payload it receives.
    """
    _tls.solvers = []
    _tls.on_progress = on_progress
    return _tls.solvers


def end_stoppable_run() -> None:
    """Call when the stoppable run is done (success or failure) so a later,
    unrelated `solve()` call on the SAME pooled thread doesn't keep appending
    into a stale list from a previous job.
    """
    _tls.solvers = None
    _tls.on_progress = None


def _register_active_solver(solver: cp_model.CpSolver) -> None:
    lst = getattr(_tls, "solvers", None)
    if lst is not None:
        lst.append(solver)

from solver.build import BuildResult, build_model
from solver.io.payload import Config, Payload
from solver.model.elastic import build_elastic_model
from solver.model.hint_pin import apply_hint_pins, evaluate_hint, pinned_components_for
from solver.model.objective import (
    TIER_BLOCKING,
    TIER_ERRORS,
    TIER_QUALITY,
    TIER_RANK,
    TIER_REST,
    rest_outranks_coverage,
)
from solver.report.builder import HARD_RELAXABLE_RULES, build_feasibility_report
from solver.validate import validate_schedule

SOLVABLE_STATUSES = ("OPTIMAL", "FEASIBLE")
PROBE_TIME_SECONDS = 5.0

# R9 (2026-09-27, CP-SAT-as-polisher): the staged solve runs the JS engine's
# betterQuality ladder (errorCount, blockingWarnCount, qualityVector) as a
# sequence of SEPARATE solves on the SAME model, each fixing an upper bound on
# the tier(s) before it and re-optimizing only what's left -- see
# solve()/`_solve_staged`'s own docstring and docs/PAYLOAD_SCHEMA.md's dated
# R9 section for the full tier-to-objective-term mapping.
#
# 2026-10-15 (real-block gap fix): `TIER_RANK` (coverageMin + overstaff) and
# `TIER_QUALITY` (fairness/workShape/...) used to be combined into ONE 3rd
# solve, on the theory that JS's own `qualityVector` is a single field so a
# 4th stage would "over-split" it. Measured on a real 58-resident block, that
# combined stage left a LOT of coverage on the table: a dedicated
# coverageMiss-only CP-SAT solve (`solver/bound_probe.py`) proved coverageMiss
# 1 achievable, OPTIMAL, where the combined stage 3 only ever got to ~20 (vs.
# local's 23) even at a 120s budget -- and JS's own `compareVectors`
# (`scheduleQuality.js`) is in fact a PLAIN element-by-element lexicographic
# compare of `[errorCount, blockingWarnCount, n0, n1, n2, fairnessPlusShape]`,
# so `coverageMiss` (n0) already strictly dominates `fairnessPlusShape` on the
# JS side -- combining them into one CP-SAT objective relies on WEIGHT-
# MAGNITUDE dominance (`coverageMin.perSlack` 1,000,000 vs. everything in
# `TIER_QUALITY` bounded well under it, see objective.py's own module
# docstring) to approximate that same ordering, which is exactly the kind of
# "weighted ratchet" fragility that module's docstring already warns is prone
# to search-budget starvation on a big-enough instance: CP-SAT has to jointly
# search coverage AND quality to even recognize an improving move, instead of
# being free to hammer on coverage alone the way `bound_probe.py`'s dedicated
# single-objective solve does. Splitting them into two true lexicographic
# stages -- `TIER_RANK` alone, then `TIER_QUALITY` alone -- gives coverage a
# clean, undiluted objective and (with `_stage_time_budgets`' rollover) a much
# bigger share of the time budget, without changing what either tier actually
# measures.
# All tier names in JS-vector order (errors, blocking, coverage/rank, rest-after-coverage,
# quality). Exactly one of TIER_BLOCKING's rest term / TIER_REST is populated per payload (see
# objective.py); empty stages are skipped by `_solve_staged`.
_STAGE_NAMES = (TIER_ERRORS, TIER_BLOCKING, TIER_RANK, TIER_REST, TIER_QUALITY)


PROGRESS_MIN_INTERVAL_SECONDS = 2.0


class ProgressReporter:
    """Optional progress hook for a solve (jobs API). Calls
    `on_progress({stage, stages, elapsed, budget, best})` at every staged-solve
    stage boundary (always) and from CP-SAT's solution callback (at most once
    per PROGRESS_MIN_INTERVAL_SECONDS). `stage` is 1-based and never decreases;
    `stages` is 5 for the staged objective, 1 for `objectiveMode: 'weighted'`;
    `best` is the CURRENT stage's incumbent objective (stage-local, tiebreak
    weighted -- not comparable across stages), None before the first solution.
    A failing sink never affects the solve.
    """

    def __init__(self, on_progress, budget: float, stages: int):
        self._cb = on_progress
        self.budget = float(budget)
        self.stages = stages
        self.stage = 0
        self.best = None
        self._t0 = time.time()
        self._last_emit = 0.0

    def emit(self) -> None:
        self._last_emit = time.time()
        try:
            self._cb({
                "stage": self.stage,
                "stages": self.stages,
                "elapsed": round(time.time() - self._t0, 1),
                "budget": self.budget,
                "best": self.best,
                "runner": runner_info(),
            })
        except Exception:
            pass

    def begin_stage(self, stage: int) -> None:
        self.stage = max(self.stage, stage)
        self.best = None
        self.emit()

    def finish(self) -> None:
        self.stage = self.stages
        self.emit()

    def solution_callback(self):
        reporter = self

        class _Cb(cp_model.CpSolverSolutionCallback):
            def on_solution_callback(self):
                reporter.best = self.objective_value
                if time.time() - reporter._last_emit >= PROGRESS_MIN_INTERVAL_SECONDS:
                    reporter.emit()

        return _Cb()


def _solve_with_progress(solver: cp_model.CpSolver, model, progress):
    """`solver.solve(model)`, plus the solution callback when a reporter is set."""
    if progress is None:
        return solver.solve(model)
    return solver.solve(model, progress.solution_callback())


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
        # SOLVER_NUM_WORKERS: deploy-time override of "every core". Inside containers
        # (Modal, Docker with CPU limits) os.cpu_count() can report the HOST's cores,
        # oversubscribing CP-SAT -- modal_app.py sets this to the container's real vCPUs.
        # Only consulted when the payload leaves numWorkers at 0/absent; an explicit
        # positive config.numWorkers still wins (clamped to cpu_count as always).
        try:
            env_workers = int(os.environ.get("SOLVER_NUM_WORKERS", "0") or 0)
        except ValueError:
            env_workers = 0
        return env_workers if env_workers > 0 else cpu_count
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
    solver object). The staged solve re-solves the SAME model up to 4 times,
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
    _register_active_solver(solver)
    return solver


def _is_empty_stage(expr) -> bool:
    """`objective.py`'s TermGroup.add() only ever appends when coef != 0, and
    `stage_exprs[name]` is built via `sum((...), start=0)` -- a tier with NO
    terms at all comes back as the bare python int 0, never a degenerate
    OrTools LinearExpr. Spec: "stage with no terms is skipped" -- skipping
    means no solve, no bound, no hint-carry for that stage at all.
    """
    return isinstance(expr, int) and expr == 0


def _expand_split(payload: Payload, a, b, c, d) -> list:
    """4-entry (errors, blocking, rank, quality) -> 5-entry split. Rest first: rest lives in
    TIER_BLOCKING. Coverage first: blocking keeps half only if conferenceTolerated can populate it
    (block touches a conference), else rest gets the whole blocking share."""
    if rest_outranks_coverage(payload.rule_priority):
        return [a, b, c, 0.0, d]
    if payload.block_touches_conference:
        return [a, b / 2, c, b / 2, d]
    return [a, 0.0, c, b, d]


def _stage_time_budgets(payload: Payload) -> list:
    """Splits `config.max_time_seconds` across the staged-solve stages
    (`_STAGE_NAMES`) per `config.stage_split` (default 15/15/50/20, see
    payload.py's Config). Defensively renormalizes so the fractions sum to 1
    (a misconfigured payload degrades to the default split rather than
    mis-sizing every stage), and floors each stage at 0.1s so a very small
    fraction still gets A solve rather than none -- then rescales back down if
    that flooring would have pushed the total over `max_time_seconds` (spec:
    "total <= the existing time limit"). These are a STARTING allocation only
    -- `_solve_staged` rolls a stage's unused time forward into the next
    stage's budget when that stage proves OPTIMAL (or is skipped as empty)
    before spending its whole share.
    """
    total = max(0.1, payload.config.max_time_seconds)
    splits = list(payload.config.stage_split)
    if len(splits) == len(_STAGE_NAMES) - 1 and sum(splits) > 0:
        # Legacy/default 4-entry split (errors, blocking, rank, quality): TIER_REST has no entry of
        # its own. Rest ranked first -> its term lives in TIER_BLOCKING, TIER_REST stays empty.
        # Coverage first -> blocking's share is split with TIER_REST (blocking then holds only
        # conferenceTolerated). Empty stages roll their share forward anyway.
        a, b, c, d = splits
        splits = _expand_split(payload, a, b, c, d)
    if len(splits) != len(_STAGE_NAMES) or sum(splits) <= 0:
        splits = list(Config.stage_split)
        a, b, c, d = splits
        splits = _expand_split(payload, a, b, c, d)
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


def _solve_staged(payload: Payload, build_result: BuildResult, hint_eval=None, progress=None):
    """Runs the (up to 5-stage) lexicographic ladder described at `_STAGE_NAMES`'s
    own module-level comment, on the SAME model/store build_model() already
    produced (no rebuild between stages -- only the objective and an
    ever-growing set of "stage N was already this good" bound constraints
    change). Returns (status_name, solver, solve_time_ms): `solver` holds the
    LAST stage that actually produced a solution, so callers extract the
    schedule/report from it exactly like the single-shot path does.

    BUDGET ROLLOVER (2026-10-15, real-block gap fix): whenever a stage proves
    OPTIMAL (the tiebreak-weighted objective -- see TIEBREAK paragraph below
    -- is PROVEN to go no lower, not just "ran out the clock") strictly before
    its own allotted budget expires, or is skipped entirely as empty, the
    unused remainder is carried forward and ADDED to the next stage's budget
    rather than left idle. `_stage_time_budgets`' fixed fractions are
    therefore a starting allocation, not a hard ceiling per stage. This is
    the direct fix for a measured anomaly: stages 1-2 (targetDeficitCore/
    postNightRest) can reach a SOLVABLE status well before their own share of
    a big budget runs out (their own 15% share of `max_time_seconds` scales up
    right along with the total -- 4.5s each of 30s, 18s each of 120s -- even
    when a couple of seconds would have done), and any time beyond that bought
    nothing for those two stages while giving their own (tiebreak-weighted,
    effectively-whole-problem-sized) search MORE opportunity to settle on a
    different, merely-TIED-for-its-own-tier solution via multi-worker racing
    (see `_configure_solver`'s own nondeterminism note) whose carried-forward
    hint happened to be a worse starting point for the coverage stage that
    follows -- this is the mechanism behind the measured "giving the solver
    120s instead of 30s made coverageMiss WORSE (23 instead of 20)"
    regression. Rolling the surplus forward instead spends it on the stage
    that still has real combinatorial search left to do (coverage, then
    quality) rather than burning it on stages that were already done. NOTE:
    on a block big enough that stages 1-2 DON'T reach OPTIMAL early (the
    common case on a real-sized block -- see PAYLOAD_SCHEMA.md's dated
    2026-10-15 section for a measured case where an overly-aggressive cut to
    their own base share, not rollover, was the actual mistake), rollover is a
    no-op and the fixed `stage_split` floor is what's actually load-bearing.

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
    fall back to from WITHIN this ladder.

    `hint_eval` (2026-09-28 fix, "never fall to pass 2 when the warm-start
    hint is feasible"): when the FIRST stage fails outright (no earlier
    stage solution to fall back to) but `hint_eval.feasible` is True, this
    is NOT a real infeasibility -- `evaluate_hint` already proved a complete,
    hard-constraint-satisfying solution exists for this exact model (the
    hint itself, possibly hard-pinned). A stage returning UNKNOWN/INFEASIBLE
    here only ever means the search ran out of its (deliberately small,
    15% by default) time budget before CP-SAT's own hint-validation/search
    machinery reported back -- it does NOT mean no solution exists. Treating
    it as real infeasibility was a bug: `solve()`'s caller collapses ANY
    non-solvable pass-1 status into "run pass 2", and pass 2's elastic model
    is then free to relax (or blow the search on) rules the hint never
    needed to touch at all. The fix: fall back to `hint_eval`'s own
    already-solved clone as this ladder's result instead -- see that
    dataclass's own docstring for why evaluating the ORIGINAL model's
    vars/exprs against that clone's solver is valid.
    """
    model = build_result.model
    store = build_result.store
    objective = build_result.objective

    stage_defs = [(name, objective.stage_exprs[name]) for name in _STAGE_NAMES]
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
    # See this function's own BUDGET ROLLOVER paragraph: time a stage didn't
    # need (proven OPTIMAL early, or skipped as empty) flows into the NEXT
    # stage's budget instead of sitting unused.
    rollover_seconds = 0.0

    for i, ((name, expr), budget) in enumerate(zip(stage_defs, budgets)):
        budget = budget + rollover_seconds
        rollover_seconds = 0.0
        if _is_empty_stage(expr):
            rollover_seconds = budget  # nothing to solve here -- hand the whole share onward
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
        if progress is not None:
            progress.begin_stage(i + 1)
        t0 = time.time()
        status = _solve_with_progress(solver, model, progress)
        elapsed_seconds = time.time() - t0
        total_time_ms += int(elapsed_seconds * 1000)
        status_name = solver.status_name(status)

        if status_name not in SOLVABLE_STATUSES:
            if have_solution:
                break  # keep the previous stage's solver/solution as final
            if hint_eval is not None and hint_eval.feasible:
                # See this function's own `hint_eval` docstring paragraph:
                # the first stage found no solution inside its time budget,
                # but a feasible witness (the hint) is already proven to
                # exist for this model -- report THAT instead of a bogus
                # INFEASIBLE that would otherwise send solve() into an
                # unnecessary (and possibly rule-relaxing) pass 2.
                return "FEASIBLE", hint_eval.solver, total_time_ms + hint_eval.solve_time_ms
            return status_name, solver, total_time_ms  # first stage failed outright -- nothing to fall back to

        have_solution = True
        last_status_name = status_name
        last_good_solver = solver
        if not is_last:
            model.add(expr <= round(solver.value(expr)))
            _carry_hint(model, store, solver)
            # BUDGET ROLLOVER: only when CP-SAT PROVED this stage's
            # (tiebreak-weighted) objective optimal -- "FEASIBLE" means it
            # merely ran out the clock, and the clock was already set to
            # exactly `budget`, so there is no real surplus to hand onward in
            # that case (and in fact MORE of this stage's own time might
            # still have helped it).
            if status_name == "OPTIMAL":
                rollover_seconds = max(0.0, budget - elapsed_seconds)

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
    # Strict (pass-1) results only: {tier name: achieved stage-expression value}, the same
    # lexicographic ladder the staged objective optimizes. None for relaxed/infeasible results.
    tiers: dict = None


def solve(payload: Payload, cancel_event: "threading.Event | None" = None, on_progress=None) -> SolveResult:
    """Entry point. `config.portfolio` == 1 (default) is exactly `_solve_single`; K > 1 runs
    `_solve_portfolio`. Everything else about the pipeline lives in `_solve_single`."""
    if payload.config.portfolio > 1:
        return _solve_portfolio(payload, cancel_event, on_progress)
    return _solve_single(payload, cancel_event, on_progress)


def _solve_single(payload: Payload, cancel_event: "threading.Event | None" = None, on_progress=None) -> SolveResult:
    """`cancel_event` (optional, used only by api/jobs.py's background runner):
    when a stage-1 solve is stopped early via `begin_stoppable_run()`'s
    registry + `CpSolver.stop_search()`, CP-SAT can come back with status
    UNKNOWN (no incumbent yet) -- `_solve_pass1` maps anything outside
    OPTIMAL/FEASIBLE to `status="INFEASIBLE"`, which would otherwise make
    `solve()` kick off a SECOND full solve (`run_pass2`'s elastic rebuild) for
    a job that was just asked to stop. Checking the event here (rather than
    inside `_solve_pass1`, which has no concept of jobs/cancellation) skips
    that second solve when the caller already knows this run was cancelled.
    The synchronous /solve request path never passes this, so it's an exact
    no-op there -- "INFEASIBLE from a genuine pass-1 search" still always
    falls through to pass 2 as before.
    """
    if on_progress is None:
        on_progress = getattr(_tls, "on_progress", None)
    progress = None
    if on_progress is not None:
        stages = len(_STAGE_NAMES) if payload.config.objective_mode == "staged" else 1
        progress = ProgressReporter(on_progress, payload.config.max_time_seconds, stages)
    result = _solve_pass1(payload, progress)
    if progress is not None:
        progress.finish()
    if result.status != "INFEASIBLE":
        return result
    if cancel_event is not None and cancel_event.is_set():
        return result
    return run_pass2(payload)


def _apply_hint_pinning(payload: Payload, build_result: BuildResult):
    """R9 follow-up ("pin to hint", see solver/model/hint_pin.py): only in
    staged mode, and only when a hint was actually supplied -- weighted mode
    is the deliberate pre-R9 rollback path and gets none of this. Mutates
    `build_result.model` in place (adds hard `<=` constraints) when the hint
    is feasible.

    Returns `(hint_diag, hint_eval)`: `hint_diag` is the small diagnostics
    dict that rides along in every SolveResult's `report["hintPinning"]`
    regardless of outcome, per the "record hintFeasible:false" spec.
    `hint_eval` is the full `HintEvaluation` (or `None` when pinning never
    even ran) -- `_solve_staged` needs it too, as a guaranteed fallback pass-1
    result when the staged solve itself can't reproduce a solution despite
    the hint already being proven feasible (2026-09-28 fix).
    """
    if payload.config.objective_mode != "staged" or not payload.hint:
        return {"applied": False, "hintFeasible": None, "pinned": {}}, None

    hint_eval = evaluate_hint(payload, build_result)
    if not hint_eval.feasible:
        return {"applied": False, "hintFeasible": False, "pinned": {}}, hint_eval

    apply_hint_pins(build_result.model, payload, build_result.objective, hint_eval)
    return {"applied": True, "hintFeasible": True, "pinned": {k: v for k, v in hint_eval.components.items() if k in pinned_components_for(payload)}}, hint_eval


def _solve_pass1(payload: Payload, progress=None) -> SolveResult:
    build_result = build_model(payload)
    store = build_result.store
    objective = build_result.objective

    hint_diag, hint_eval = _apply_hint_pinning(payload, build_result)

    # R9: staged is the new default (payload.py's Config.objective_mode) --
    # `"weighted"` keeps the pre-R9 single-shot solve on `objective.total_expr`
    # for comparison/rollback. build_model() already called
    # `model.minimize(objective.total_expr)` as its own default, so the
    # weighted branch needs no further setup beyond solving as before.
    if payload.config.objective_mode == "staged":
        status_name, solver, solve_time_ms = _solve_staged(payload, build_result, hint_eval, progress)
    else:
        solver = _configure_solver(payload)
        solver.parameters.max_time_in_seconds = payload.config.max_time_seconds
        if progress is not None:
            progress.begin_stage(1)
        t0 = time.time()
        status = _solve_with_progress(solver, build_result.model, progress)
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
    report = _build_report(payload, solver, objective, hint_diag)
    tiers = {name: round(solver.value(expr)) for name, expr in objective.stage_exprs.items()}

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
        # `model.minimize()` call was the final stage's own (partial,
        # tiebreak-weighted) expression, not `total_expr`, so
        # `.objective_value` would report the wrong number.
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
        tiers=tiers,
    )


# --- Seed portfolio ---------------------------------------------------------
class _PortfolioStopper:
    """Registered in the CALLING thread's stoppable-run list (when it has one) so a job cancel --
    which calls `.stop_search()` on that list's last entry -- reaches every portfolio run, and so
    runs not yet started never start."""

    def __init__(self):
        self.stopped = threading.Event()
        self._lists: list = []
        self._lock = threading.Lock()

    def add_list(self, lst: list) -> None:
        with self._lock:
            self._lists.append(lst)

    def stop_search(self) -> None:
        self.stopped.set()
        with self._lock:
            lists = list(self._lists)
        for lst in lists:
            # Same rule as api/jobs.py's cancel: only the most recent solver of each run.
            for s in lst[-1:]:
                try:
                    s.stop_search()
                except Exception:
                    pass


def _result_rank_key(result: SolveResult) -> tuple:
    """Lower is better. Strict solvable results beat relaxed, relaxed beat infeasible; strict
    results compare their tier values lexicographically (errors, blocking, coverage, quality) --
    the same ladder `_solve_staged` optimizes. Relaxed results compare by objective value."""
    if result.tiers is not None:
        return (0, tuple(result.tiers.get(n, 0) for n in _STAGE_NAMES))
    if result.status == "RELAXED":
        return (1, (result.objective_value,))
    return (2, ())


def _solve_portfolio(payload: Payload, cancel_event, on_progress) -> SolveResult:
    """K independent full solves (seed = base + i), run concurrently in threads (OR-Tools releases
    the GIL), best by `_result_rank_key` wins, ties go to the lowest i. Workers are split
    `max(1, total // concurrent)` per run and each run gets the full `maxTimeSeconds`; if K exceeds
    the worker count, runs go in batches of `concurrent` runs and each run gets `maxTimeSeconds / batches`
    (wall time stays ~ maxTimeSeconds)."""
    cfg = payload.config
    k = cfg.portfolio
    total_workers = _num_workers(payload)
    concurrent = max(1, min(k, total_workers))
    per_run_workers = max(1, total_workers // concurrent)
    batch_count = -(-k // concurrent)
    # Wall time stays ~ maxTimeSeconds: when runs need several batches each gets an equal share.
    per_run_seconds = cfg.max_time_seconds / batch_count

    if on_progress is None:
        on_progress = getattr(_tls, "on_progress", None)

    stopper = _PortfolioStopper()
    parent_list = getattr(_tls, "solvers", None)
    if parent_list is not None:
        parent_list.append(stopper)

    outcomes: list = [None] * k  # (result | None, error | None, wall_seconds)

    def run(i: int) -> None:
        sub = dataclasses.replace(
            payload,
            config=dataclasses.replace(cfg, portfolio=1, random_seed=cfg.random_seed + i, num_workers=per_run_workers,
                                       max_time_seconds=per_run_seconds),
        )
        my_list = begin_stoppable_run(on_progress if i == 0 else None)
        stopper.add_list(my_list)
        t0 = time.time()
        try:
            if stopper.stopped.is_set():
                raise RuntimeError("cancelled")
            outcomes[i] = (_solve_single(sub, cancel_event, None), None, time.time() - t0)
        except BaseException as exc:  # one failed run must not lose the others
            logging.getLogger(__name__).warning("portfolio run %d (seed %d) failed: %r", i, cfg.random_seed + i, exc)
            outcomes[i] = (None, exc, time.time() - t0)
        finally:
            end_stoppable_run()

    for start in range(0, k, concurrent):
        if stopper.stopped.is_set() or (cancel_event is not None and cancel_event.is_set()):
            break
        threads = [
            threading.Thread(target=run, args=(i,), daemon=True) for i in range(start, min(k, start + concurrent))
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

    done = [(i, o[0]) for i, o in enumerate(outcomes) if o is not None and o[0] is not None]
    if not done:
        errs = [o[1] for o in outcomes if o is not None and o[1] is not None]
        if errs:
            raise errs[0]
        raise RuntimeError("portfolio cancelled before any run finished")

    winner_index, winner = min(done, key=lambda t: (_result_rank_key(t[1]), t[0]))
    per_run = []
    for i, o in enumerate(outcomes):
        if o is None:
            continue
        res, _err, wall = o
        per_run.append({
            "seed": cfg.random_seed + i,
            "status": res.status if res is not None else "ERROR",
            "tiers": res.tiers if res is not None else None,
            "wallSeconds": round(wall, 1),
            **({"error": str(_err)} if _err is not None else {}),
        })
    winner.report = dict(winner.report)
    winner.report["portfolio"] = {"k": k, "winnerIndex": winner_index, "perRun": per_run}
    winner.seed = cfg.random_seed + winner_index
    return winner


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


def _build_report(payload: Payload, solver: cp_model.CpSolver, objective, hint_diag: dict = None) -> dict:
    unfilled = []
    for (shift_id, date_str), slack in objective.coverage_slacks.items():
        short = solver.value(slack)
        if short > 0:
            unfilled.append({"dateStr": date_str, "shiftId": shift_id, "shortBy": int(short), "reason": "coverageShort"})

    # Gap fix: surface the solver's own last-resort +1-over-max placements (previously invisible --
    # mapSolverResult hardcoded `repairs: []`). Aggregate per (shift,date) rather than per-resident:
    # the `overstaff` BoolVar (coverage.py) only ever allows exactly +1 over `max`, and the model has
    # no notion of WHICH assigned resident is "the extra one" -- `mapSolverResult` (ResidentScheduler
    # .jsx) attributes it to one of the final schedule's own assignees for display.
    overstaffed = []
    for (shift_id, date_str), var in objective.coverage_overstaff.items():
        if solver.value(var) >= 1:
            max_val = int(payload.coverage[shift_id][date_str].max)
            overstaffed.append({"shiftId": shift_id, "dateStr": date_str, "count": max_val + 1, "max": max_val})

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
        "overstaffed": overstaffed,
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
    report = _build_report(payload, solver, objective)
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
        "overstaffed": [],
        "hintPinning": hint_diag if hint_diag is not None else _default_hint_diag(),
    }
