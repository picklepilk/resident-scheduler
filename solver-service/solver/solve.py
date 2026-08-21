"""Two-pass orchestration. `solve(payload)` runs pass 1 (strict); on
INFEASIBLE it runs pass 2 (elastic relaxation, `run_pass2`) and returns
whatever that produces. Pass 1 never calls pass 2 itself for any OTHER
reason -- e.g. a merely suboptimal-but-feasible pass-1 result is returned
as-is, never "upgraded" by relaxing anything.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from solver.build import build_model
from solver.io.payload import Payload
from solver.model.elastic import build_elastic_model
from solver.report.builder import HARD_RELAXABLE_RULES, build_feasibility_report
from solver.validate import validate_schedule

SOLVABLE_STATUSES = ("OPTIMAL", "FEASIBLE")
PROBE_TIME_SECONDS = 5.0


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


def _solve_pass1(payload: Payload) -> SolveResult:
    build_result = build_model(payload)
    model = build_result.model
    store = build_result.store
    objective = build_result.objective

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = payload.config.max_time_seconds
    solver.parameters.num_workers = payload.config.num_workers
    solver.parameters.random_seed = payload.config.random_seed

    t0 = time.time()
    status = solver.solve(model)
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
            report=_empty_report(),
            validation={"passed": True, "failures": []},
            feasibility=None,
        )

    schedule = _extract_schedule(solver, store)
    report = _build_report(solver, objective)

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
        objective_value=round(solver.objective_value),
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

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = payload.config.max_time_seconds
    solver.parameters.num_workers = payload.config.num_workers
    solver.parameters.random_seed = payload.config.random_seed

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
    probe_solver.parameters.num_workers = payload.config.num_workers
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


def _build_report(solver: cp_model.CpSolver, objective) -> dict:
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


def _empty_report() -> dict:
    return {"unfilled": [], "restCompromises": [], "underTarget": [], "seniorGaps": []}
