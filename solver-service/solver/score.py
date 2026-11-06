"""Score mode (2026-11-04, em-scheduler port): price an exact schedule, never search.

`config.mode == "score"`: every x var of the strict model is fixed to `payload.hint` (1 for hint cells, 0 for the
rest) and the model is solved once, so the slack/penalty bookkeeping vars settle at their tightest values and the
stage expressions give that schedule's tier values -- the parity oracle for JS-vs-Python quality.

Result: status "SCORED" (mode "strict", `tiers`, normal report plus `report.score = {feasible: True, components,
missingCells: []}`), or "INFEASIBLE" with `report.score = {feasible: False, conflicts, missingCells}` when the hint
breaks a hard constraint (conflicts name the elastic `ok[...]` groups, as pass 2's probe does) or names a
(resident, shift, date) cell the model has no variable for.
"""

from __future__ import annotations

import dataclasses
import time

from ortools.sat.python import cp_model

from solver.build import build_model
from solver.model.elastic import build_elastic_model
from solver.model.hint_pin import SOLVABLE_STATUSES, pinned_component_exprs

SCORE_TIME_CAP_SECONDS = 30.0


def _missing_cells(payload, store) -> list:
    return [
        {"residentId": h.resident_id, "date": h.date, "shiftId": h.shift_id}
        for h in payload.hint
        if (h.resident_id, h.shift_id, h.date) not in store.x
    ]


def _fix_x(model, store, payload) -> None:
    wanted = {(h.resident_id, h.date): h.shift_id for h in payload.hint}
    for (rid, shift_id, date), var in store.x.items():
        model.add(var == (1 if wanted.get((rid, date)) == shift_id else 0))


def _solver(payload, cap: float) -> cp_model.CpSolver:
    s = cp_model.CpSolver()
    s.parameters.num_workers = 1
    s.parameters.random_seed = payload.config.random_seed
    s.parameters.max_time_in_seconds = cap
    return s


def solve_score(payload):
    from solver import solve as S  # late import: solve.py dispatches here

    t0 = time.time()
    cap = min(SCORE_TIME_CAP_SECONDS, float(payload.config.max_time_seconds))
    build_result = build_model(payload)
    store, objective = build_result.store, build_result.objective
    missing = _missing_cells(payload, store)

    status_name = "INFEASIBLE"
    solver = None
    if not missing:
        _fix_x(build_result.model, store, payload)
        solver = _solver(payload, cap)
        status_name = solver.status_name(solver.solve(build_result.model))

    if status_name in SOLVABLE_STATUSES:
        schedule = S._extract_schedule(solver, store)
        report = S._build_report(payload, solver, objective, S._default_hint_diag())
        tiers = {n: round(solver.value(e)) for n, e in objective.stage_exprs.items()}
        components = {n: round(solver.value(e)) for n, e in pinned_component_exprs(payload, objective).items()}
        report["score"] = {"feasible": True, "components": components, "missingCells": []}
        return S.SolveResult(
            status="SCORED", mode="strict", schedule=schedule,
            objective_value=round(solver.value(objective.total_expr)),
            solve_time_ms=int((time.time() - t0) * 1000), seed=payload.config.random_seed,
            report=report, validation={"passed": True, "failures": []}, feasibility=None, tiers=tiers,
        )

    conflicts: list = []
    if not missing:
        capped = dataclasses.replace(payload, config=dataclasses.replace(payload.config, max_time_seconds=cap))
        elastic = build_elastic_model(capped)
        _fix_x(elastic.model, elastic.store, capped)
        conflicts = S._run_conflict_probe(capped, elastic)
    report = S._empty_report()
    report["score"] = {"feasible": False, "conflicts": conflicts, "missingCells": missing}
    return S.SolveResult(
        status="INFEASIBLE", mode="strict", schedule={}, objective_value=0,
        solve_time_ms=int((time.time() - t0) * 1000), seed=payload.config.random_seed,
        report=report, validation={"passed": True, "failures": []}, feasibility=None,
    )
