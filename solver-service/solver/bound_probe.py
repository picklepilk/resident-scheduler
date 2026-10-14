"""Bound probe: for a given payload, measures the CP-SAT-PROVEN best
achievable value AND a proven lower bound for 3 metrics independently --
coverageMiss, underTargetCore (count of EM-core residents left under
target), deficitCoreUnits (total EM-core shift-count shortfall).

Why this exists (CLAUDE.md's "optimality gap" measurement): the JS
generator's own baselines show coverageMiss 112-206 and 9-35 underTarget
errors per fixture, and we don't know whether that's STRUCTURAL (the roster
genuinely cannot do better under the hard rules) or LEFT BEHIND by the
greedy generator/repair pass. `solve()`/`_solve_staged` (solver/solve.py)
answers a different question -- it finds ONE schedule that's good across
every rule simultaneously, in the JS `betterQuality` ladder's own order.
This module instead asks, independently per metric: "what is the best this
roster could possibly do on JUST this one axis, ignoring every other soft
rule entirely?" -- and whether CP-SAT can PROVE that's optimal (status
OPTIMAL, bound == value) or only report a lower bound it ran out of time to
close (status FEASIBLE/UNKNOWN, bound < value, a real but unclosed gap).
Comparing this probe's bound against the JS generator's own measured value
on the same axis is what actually answers "structural or generator-left-
on-the-table".

Each probe:
  - builds a COMPLETELY FRESH model via `solver.build.build_model` -- never
    reuses another probe's model, and never applies hint PINNING
    (`solve.py`'s `_apply_hint_pinning` / `solver/model/hint_pin.py`'s hard
    `<=` constraints are a pass-1-only seam this module never calls).
    `build_model` itself still calls `apply_hint` (a plain, soft `AddHint`
    warm start) whenever `payload.hint` is set -- that's fine, even useful
    (a good warm start only speeds up the search; it can never change what's
    provably optimal), it's only the HARD pin this module avoids.
  - overrides `payload.config.coverage_min_mode` to "elastic_always" so a
    coverage-slack IntVar always exists per (shift, date) regardless of what
    the caller's own payload asked for -- this probe's whole job is to
    measure/minimize that slack, which needs the var to exist at all (see
    `solver/model/coverage.py`'s own docstring: "hard_then_elastic" mode
    builds NO slack var on pass 1).
  - re-points the model's objective (`model.minimize(...)`) at exactly the
    one metric being probed, discarding `build_objective`'s own default
    `total_expr` minimize call -- safe because each probe gets its OWN fresh
    `build_model()` call, so this never disturbs another probe or the real
    solve path.
  - solves with the SAME solver tuning `solve.py`'s own single-shot
    (non-staged) path uses (`_configure_solver(payload, allow_repair_hint=
    False)`, reused directly rather than reimplemented, so a future tuning
    change there is picked up here for free), capped at `seconds_per_probe`.
"""

from __future__ import annotations

import copy
import dataclasses
import math
import time

from solver.build import BuildResult, build_model
from solver.io.payload import Payload
from solver.solve import SOLVABLE_STATUSES, _configure_solver


def _with_elastic_coverage(payload: Payload) -> Payload:
    """Returns `payload` unchanged if it already requests elastic coverage,
    else a shallow copy with a new `config` swapped in. `Config` is its own
    frozen dataclass (`dataclasses.replace` builds the new one); `Payload`
    itself is a plain (non-frozen) dataclass, so `copy.copy` makes a shallow
    copy sharing every OTHER field (residents, eligible, coverage, ...) by
    reference. Safe: nothing downstream (`build_model` and everything it
    calls) ever mutates the payload it's given, and `Payload.__post_init__`'s
    derived `tail_dates`/`all_dates` depend only on `block`, which this never
    touches -- no need to re-run it.
    """
    if payload.config.coverage_min_mode == "elastic_always":
        return payload
    forced = copy.copy(payload)
    forced.config = dataclasses.replace(payload.config, coverage_min_mode="elastic_always")
    return forced


def _solve_one_metric(payload: Payload, expr_fn, seconds_per_probe: float):
    """Builds one fresh model, re-points its objective at `expr_fn(payload,
    build_result)`'s own expression, and solves it in isolation. Returns
    (status_name, solver, build_result, expr, time_ms).
    """
    build_result: BuildResult = build_model(payload)
    expr = expr_fn(payload, build_result)
    build_result.model.minimize(expr)

    solver = _configure_solver(payload, allow_repair_hint=False)
    solver.parameters.max_time_in_seconds = seconds_per_probe

    t0 = time.time()
    status = solver.solve(build_result.model)
    time_ms = int((time.time() - t0) * 1000)
    status_name = solver.status_name(status)
    return status_name, solver, build_result, expr, time_ms


def _result_dict(status_name: str, solver, expr, time_ms: int) -> dict:
    value = round(solver.value(expr)) if status_name in SOLVABLE_STATUSES else None
    # `best_objective_bound` is a valid LOWER bound (this is always a
    # minimize) once CP-SAT has started searching, whether it ended
    # OPTIMAL, FEASIBLE (found a solution but didn't prove it optimal within
    # the time budget), or UNKNOWN (no incumbent yet, but presolve/the LP
    # relaxation can still have produced a real bound). Only a genuinely
    # INFEASIBLE model (never expected for these probes under forced elastic
    # coverage, but kept defensive -- a locked-cell/hard-rule conflict could
    # still make the whole model infeasible regardless of coverage mode) has
    # no meaningful bound to report.
    if status_name == "INFEASIBLE":
        bound = None
    else:
        try:
            bound = math.ceil(solver.best_objective_bound)
        except Exception:
            bound = None
    return {"status": status_name, "value": value, "bound": bound, "timeMs": time_ms}


# ---- probe 1: coverageMiss (sum of every coverage-min slack unit) ----

def _coverage_miss_expr(_payload: Payload, build_result: BuildResult):
    return sum(build_result.objective.coverage_slacks.values(), start=0)


def _unfilled_by_slot(status_name: str, solver, build_result: BuildResult) -> list:
    if status_name not in SOLVABLE_STATUSES:
        return []
    unfilled = []
    for (shift_id, date_str), slack in build_result.objective.coverage_slacks.items():
        short = solver.value(slack)
        if short > 0:
            unfilled.append({"shiftId": shift_id, "dateStr": date_str, "shortBy": int(short)})
    return unfilled


def _probe_coverage_miss(payload: Payload, seconds_per_probe: float) -> dict:
    status_name, solver, build_result, expr, time_ms = _solve_one_metric(
        payload, _coverage_miss_expr, seconds_per_probe
    )
    result = _result_dict(status_name, solver, expr, time_ms)
    result["unfilledBySlot"] = _unfilled_by_slot(status_name, solver, build_result)
    return result


# ---- probe 2: underTargetCore (COUNT of EM-core residents left under their
# own shift-count target, not the total deficit units -- see probe 3 for
# that) ----

def _under_target_core_count_expr(payload: Payload, build_result: BuildResult):
    """Adds one new bool `b_r` per EM-core resident with a non-null target
    and the hard-ish (model-local, this probe's own fresh model only)
    constraint `deficit_r <= target_r * b_r`. `deficit_r`'s own domain is
    already `[0, target_r]` (see objective.py's `_add_target_deficit_terms`),
    so `b_r == 0` forces `deficit_r <= 0` (i.e. exactly 0, deficit is never
    negative) and `b_r == 1` is no additional constraint at all (deficit's
    own upper bound already matches `target_r`). Minimizing `sum(b_r)`
    therefore counts exactly the residents CP-SAT cannot avoid leaving under
    target -- it is never advantageous for the solver to set a `b_r` to 1
    when 0 remains feasible, since that only costs the objective more.
    """
    model = build_result.model
    bools = []
    for resident_id, (target, deficit) in build_result.objective.target_deficit_vars.items():
        if not payload.residents_by_id[resident_id].is_em_core:
            continue
        b = model.new_bool_var(f"bound_probe_under_target_core[{resident_id}]")
        model.add(deficit <= target * b)
        bools.append(b)
    return sum(bools, start=0)


def _probe_under_target_core(payload: Payload, seconds_per_probe: float) -> dict:
    status_name, solver, _build_result, expr, time_ms = _solve_one_metric(
        payload, _under_target_core_count_expr, seconds_per_probe
    )
    return _result_dict(status_name, solver, expr, time_ms)


# ---- probe 3: deficitCoreUnits (total EM-core shift-count shortfall, in
# shift-units -- the sum objective.py's own `targetDeficitCore` weight
# charges against, unweighted) ----

def _core_deficit_units_expr(payload: Payload, build_result: BuildResult):
    return sum(
        (
            deficit
            for resident_id, (_target, deficit) in build_result.objective.target_deficit_vars.items()
            if payload.residents_by_id[resident_id].is_em_core
        ),
        start=0,
    )


def _probe_deficit_core_units(payload: Payload, seconds_per_probe: float) -> dict:
    status_name, solver, _build_result, expr, time_ms = _solve_one_metric(
        payload, _core_deficit_units_expr, seconds_per_probe
    )
    return _result_dict(status_name, solver, expr, time_ms)


def probe_bounds(payload: Payload, seconds_per_probe: float = 60.0) -> dict:
    """Runs all 3 probes against `payload` (coverage mode forced to
    "elastic_always" regardless of what the payload itself requests -- see
    `_with_elastic_coverage`), each with its own fresh model and up to
    `seconds_per_probe` seconds of CP-SAT time. Returns
    `{name: {"status", "value", "bound", "timeMs", ...}}`; `coverageMiss`
    additionally carries `"unfilledBySlot"` (same shape as
    `solver/solve.py`'s `_build_report`'s own `unfilled` list).
    """
    payload = _with_elastic_coverage(payload)
    return {
        "coverageMiss": _probe_coverage_miss(payload, seconds_per_probe),
        "underTargetCore": _probe_under_target_core(payload, seconds_per_probe),
        "deficitCoreUnits": _probe_deficit_core_units(payload, seconds_per_probe),
    }
