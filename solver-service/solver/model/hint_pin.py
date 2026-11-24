"""R9 follow-up (2026-09-27, "pin the polisher to its own hint"): at the time
this was written, the staged solve (`solve.py`'s `_solve_staged`) bounded each
of its 3 stages lexicographically, but its last stage minimized
`TIER_RANK + TIER_QUALITY` as ONE combined expression -- nothing stopped
CP-SAT from trading coverage slack (TIER_RANK) for a cheaper quality move
(TIER_QUALITY) inside that single solve, even though the warm-start hint
already achieved some particular coverage value. That's the diagnosed root
cause of `engineHeadToHead.test.js` losses where the solver's `qualityVector`
total improved but its own `coverageMiss` got WORSE than the JS engine's hint
schedule (see docs/PAYLOAD_SCHEMA.md's dated R9 section).

2026-10-15: `_solve_staged` now runs `TIER_RANK` and `TIER_QUALITY` as two
genuinely separate lexicographic stages (see that function's own docstring),
which closes most of this same gap structurally -- but the pins below stay:
they're a cheap, always-on, multi-worker-nondeterminism-proof floor underneath
whatever the staged solve's own search does, not a substitute for it.

Fix: before the staged solve ever runs, measure exactly what the hint itself
achieves on the 3 components the JS `betterQuality` ladder can actually see
(targetDeficitCore, postNightRest -- only when rest outranks coverage -- and
coverageMin slack), and add each as a HARD
upper bound (`expr <= hintValue`) on the real model. A hard constraint holds
for every solution the solver can return, at any time budget -- so the
polisher can only ever match or beat the hint on each of these, never trade
one for another. `TIER_QUALITY` itself (fairness/workShape/...) is
deliberately left unpinned: that's the one thing this feature still lets the
solver freely improve.

**Diagnosed mapping gap, fixed here (2026-09-27)**: an earlier version of this
module also pinned `overstaffCoverage` (the solver's own last-resort +1-over-
max allowance, `solver/model/coverage.py`) as a 4th independent component,
mirroring `TIER_RANK`'s two internal terms 1:1. That made every
`engineHeadToHead.test.js` fixture WORSE, not better (3/4 losses instead of
the pre-existing single `vacationHeavy` gap) -- diagnosed by comparing JS's
own `betterQuality` inputs against the pinned solver values: JS's
`coverageMiss` metric (`scheduleQuality.js`, `rulePriority`'s `coverageMin`
slot) is EXACTLY the raw `coverageMin` slack sum, but `report.overstaffed`
(the JS-side equivalent of the solver's `overstaff` var) is purely
informational -- it never appears in `errorCount`, `blockingWarnCount`, or
`qualityVector` at all (see `docs/PAYLOAD_SCHEMA.md`'s R9 tier-mapping table:
"`overstaffCoverage` has no `betterQuality` slot of its own in JS either").
Pinning it anyway handcuffed the solver's own designed relief valve -- using
one more +1-over-max placement to close a coverage gap is a mechanism the app
ITSELF uses (`ResidentScheduler.jsx`'s `overstaffFor`/repair Phase 5) and pays
no JS-side scoring penalty for, so forbidding the solver from using MORE of it
than the hint happened to use could only ever make `coverageMin` (the metric
that actually matters) worse, never better. Fixed by pinning only what JS's
ladder can see.

Two entry points, used together by `solve.py`'s `_solve_pass1`:
  - `evaluate_hint(payload, build_result)`: fixes EVERY x var to the hint's
    own value on a CLONE of the already-built model (NEVER the model the
    real solve will use -- `solve.py`'s own docstring documents a native
    OR-Tools crash from repeatedly solving/mutating the same model after a
    `repair_hint=True` solve; cloning sidesteps that entirely, since the
    clone is solved exactly once and then discarded). `feasible=False` means
    the hint itself breaks one of THIS payload's hard constraints (a stale
    roster, a locked-cell conflict, ...) -- callers fall back to the
    pre-existing, un-pinned staged solve in that case, same as before this
    feature existed.
  - `apply_hint_pins(model, payload, objective, hint_eval)`: adds the 3
    `expr <= achieved` constraints to the REAL model. Only ever called when
    `hint_eval.feasible` -- the hint's own concrete assignment is then, by
    construction, a feasible witness for the pinned model (see this module's
    own inline note on `evaluate_hint`), so pinning can never make an
    otherwise-feasible payload infeasible.

Both entry points share `pinned_component_exprs` -- ONE definition of "what
gets measured" and "what gets pinned", so they can never drift apart.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from solver.io.payload import Payload
from solver.model.objective import rest_outranks_coverage

SOLVABLE_STATUSES = ("OPTIMAL", "FEASIBLE")

# Names match the JS-facing concepts these mirror 1:1 (see module docstring).
# targetDeficitCore/postNightRest are each the WHOLE of TIER_ERRORS/
# TIER_BLOCKING respectively (objective.py adds no other term to either
# group), so pinning them is equivalent to pinning those tiers outright.
# coverageMin is HALF of TIER_RANK -- deliberately NOT paired with a separate
# overstaffCoverage pin (see module docstring's "diagnosed mapping gap": JS's
# betterQuality ladder never scores overstaff at all, so pinning it only
# handcuffs the solver's own +1-over-max relief valve without protecting
# anything JS can actually see).
PINNED_COMPONENTS = ("targetDeficitCore", "postNightRest", "coverageMin")


def pinned_components_for(payload: Payload) -> tuple:
    """Which components actually get a hard pin. postNightRest is pinned only when `rulePriority`
    ranks it ABOVE coverageMin; otherwise (the default) coverage outranks rest, and pinning rest at
    the hint's value would block the very rest-for-coverage trade the ladder allows."""
    if rest_outranks_coverage(payload.rule_priority):
        return PINNED_COMPONENTS
    return tuple(c for c in PINNED_COMPONENTS if c != "postNightRest")


def pinned_component_exprs(payload: Payload, objective) -> dict:
    """Raw (UNWEIGHTED) sums -- deliberately not multiplied by their
    objective weight. Pinning `expr <= n` means exactly "at most n slack
    units/violations/deficits", independent of whatever weight config is in
    play, which is both simpler to reason about and immune to a future
    `config.weights` override changing what a pin even means."""
    core_deficit = sum(
        (
            deficit
            for resident_id, (_target, deficit) in objective.target_deficit_vars.items()
            if payload.residents_by_id[resident_id].is_em_core
        ),
        start=0,
    )
    post_night_rest = sum((p.var for p in objective.post_night_rest_penalties), start=0)
    coverage_min = sum(objective.coverage_slacks.values(), start=0)
    return {
        "targetDeficitCore": core_deficit,
        "postNightRest": post_night_rest,
        "coverageMin": coverage_min,
    }


@dataclass
class HintEvaluation:
    feasible: bool
    # name -> achieved int value (PINNED_COMPONENTS keys), populated only
    # when feasible is True.
    components: dict = field(default_factory=dict)
    # The CpSolver that solved the fully-pinned CLONE (every x var fixed to
    # the hint), kept only when feasible. Populated so a caller can use it as
    # a GUARANTEED fallback pass-1 result -- see solve.py's `_solve_staged`
    # -- when the real staged solve times out (UNKNOWN) or is otherwise
    # unable to reproduce a solution despite this already-proven feasible
    # witness. Reading `.value(...)` off this solver against the ORIGINAL
    # model's vars/exprs (`store.x`, `objective.*`) is valid: `CpModel.clone()`
    # preserves every variable's index 1:1, and `pinned_component_exprs`
    # above already relies on exactly this fact (it evaluates original-model
    # expressions against this same clone-solved solver).
    solver: object = None
    solve_time_ms: int = 0
    # stage name -> the hint schedule's own value of that stage's expression (2026-11-23 hint floor;
    # same order/keys as `objective.stage_exprs`). Populated only when feasible.
    tiers: dict = field(default_factory=dict)


def evaluate_hint(payload: Payload, build_result, time_cap: float = None) -> HintEvaluation:
    """Never mutates `build_result.model` -- always clones first. Returns
    `feasible=False` (no components) when `payload.hint` is empty, when the
    model has no x vars at all, or when fixing every x var to the hint's
    value makes the model infeasible under this payload's hard constraints.
    `time_cap` (seconds, optional): upper bound on the clone solve's limit (solve.py passes
    `Deadline.cap(...)` so the whole solve respects `config.deadlineSeconds`).
    """
    store = build_result.store
    if not payload.hint or not store.x:
        return HintEvaluation(feasible=False)

    hint_by_resident_date = {(h.resident_id, h.date): h.shift_id for h in payload.hint}

    # Same clone-and-fix approach as evaluating any "what if" schedule against
    # this model's own hard constraints, without ever touching the model the
    # real (possibly repair_hint'd) solve will use.
    clone = build_result.model.clone()
    for (resident_id, shift_id, date_str), var in store.x.items():
        wanted = hint_by_resident_date.get((resident_id, date_str))
        target_val = 1 if wanted == shift_id else 0
        clone_var = clone.get_bool_var_from_proto_index(var.index)
        clone.add(clone_var == target_val)

    solver = cp_model.CpSolver()
    # Single-worker: with every x var fixed, everything left (slack/
    # overstaff/deficit/postNightRest bookkeeping vars) decomposes into small,
    # independent pieces -- there is no real search here, just propagation
    # plus trivial per-piece optimization, so this is fast regardless of
    # worker count. Fixed at 1 for a deterministic, reproducible measurement.
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = payload.config.random_seed
    # Generous but bounded: this solve should finish in well under a second on
    # any realistic payload (see comment above) -- the cap is a safety net,
    # not a real budget.
    limit = min(30.0, max(5.0, payload.config.max_time_seconds))
    solver.parameters.max_time_in_seconds = limit if time_cap is None else max(0.1, min(limit, time_cap))
    t0 = time.time()
    status = solver.solve(clone)
    solve_time_ms = int((time.time() - t0) * 1000)
    if solver.status_name(status) not in SOLVABLE_STATUSES:
        return HintEvaluation(feasible=False)

    # The clone keeps the ORIGINAL model's objective (build_objective already
    # called model.minimize(total_expr) before this ever clones it) -- with
    # every x var fixed, minimizing still matters: it drives each slack/
    # overstaff/postNightRest var down to the tightest value consistent with
    # the fixed assignment (e.g. `assigned + slack >= min` alone would let
    # slack float above its true shortfall; minimizing pins it to exactly
    # `max(min - assigned, 0)`), so the values read back here are the hint
    # schedule's OWN true measured shortfalls, not an arbitrary feasible
    # extension of them.
    exprs = pinned_component_exprs(payload, build_result.objective)
    components = {name: round(solver.value(expr)) for name, expr in exprs.items()}
    stage_exprs = getattr(build_result.objective, "stage_exprs", None) or {}
    tiers = {name: round(solver.value(expr)) for name, expr in stage_exprs.items()}
    return HintEvaluation(feasible=True, components=components, solver=solver, solve_time_ms=solve_time_ms, tiers=tiers)


def apply_hint_pins(model, payload: Payload, objective, hint_eval: HintEvaluation) -> None:
    """Adds `expr <= achieved` for every pinned component as a HARD
    constraint on the REAL model. Only ever called when
    `hint_eval.feasible` -- see module docstring for why this can never make
    an otherwise-feasible payload infeasible."""
    exprs = pinned_component_exprs(payload, objective)
    for name in pinned_components_for(payload):
        expr = exprs[name]
        model.add(expr <= hint_eval.components[name])


# --- Hint repair (2026-11-23, `config.hintRepair`) ---------------------------------------------------
# `evaluate_hint` says "infeasible" as soon as ONE hard rule breaks, which switches off pins, hint floor
# and fallback. `repair_hint_grid` finds a feasible grid close to the hint (fewest changed cells) so the
# rest of the pipeline can treat it exactly like a feasible hint. Never uses CpSolver `repair_hint`.

@dataclass
class RepairOutcome:
    attempted: bool = False
    repaired: bool = False
    hint: list = field(default_factory=list)   # repaired LockedCell list (only when repaired)
    changed_cells: int = 0                     # (resident, date) cells whose shift differs from the hint
    seconds: float = 0.0
    violated_rules: list = field(default_factory=list)
    scope: str = None                          # "residents" | "all" (scope that produced the repair, or the last tried)

    def report(self) -> dict:
        return {
            "attempted": self.attempted,
            "repaired": self.repaired,
            "changedCells": self.changed_cells,
            "seconds": round(self.seconds, 2),
            "violatedRules": list(self.violated_rules),
            "scope": self.scope,
        }


def hint_grid(payload: Payload) -> dict:
    grid: dict = {}
    for h in payload.hint:
        grid.setdefault(h.resident_id, {})[h.date] = h.shift_id
    return grid


def hint_violations(payload: Payload) -> tuple:
    """(sorted rule names, set of resident ids involved) for the hard rules `payload.hint` breaks,
    via solver/validate.py (the independent fixed-grid checker). A failure naming no resident (coverage
    max, senior composition) involves whoever the hint puts on its dates/shifts."""
    from solver.validate import validate_schedule

    grid = hint_grid(payload)
    try:
        failures = validate_schedule(payload, grid)
    except Exception:
        return [], set()
    rules = sorted({f["rule"] for f in failures})
    residents: set = set()
    for f in failures:
        if f["residentIds"]:
            residents.update(f["residentIds"])
            continue
        dates, shifts = set(f["dates"]), set(f["shiftIds"])
        for rid, by_date in grid.items():
            for d, sid in by_date.items():
                if d in dates and (not shifts or sid in shifts):
                    residents.add(rid)
    return rules, residents


def _repair_solve(payload: Payload, build_result, free_residents, seconds: float, make_solver):
    """One repair solve on a CLONE: hard rules only, x fixed to the hint for every resident not in
    `free_residents` (None = free everyone), minimise the number of x cells that differ from the hint.
    Returns the solver (with a solution) or None."""
    store = build_result.store
    wanted = {(h.resident_id, h.date): h.shift_id for h in payload.hint}
    clone = build_result.model.clone()
    clone.clear_hints()
    diffs = []
    for (rid, sid, d), var in store.x.items():
        cv = clone.get_bool_var_from_proto_index(var.index)
        hv = 1 if wanted.get((rid, d)) == sid else 0
        clone.add_hint(cv, hv)
        if free_residents is not None and rid not in free_residents:
            clone.add(cv == hv)
        else:
            diffs.append(1 - cv if hv else cv)
    clone.minimize(sum(diffs, start=0))
    solver = make_solver()
    solver.parameters.max_time_in_seconds = max(0.1, seconds)
    status = solver.solve(clone)
    if solver.status_name(status) not in SOLVABLE_STATUSES:
        return None
    return solver


def repair_hint_grid(payload: Payload, build_result, seconds: float, make_solver, stop_event=None) -> RepairOutcome:
    """Repair an infeasible hint. First frees only the residents involved in violations (everyone else
    fixed to the hint); if that is infeasible or yields nothing within half of `seconds`, frees everyone
    for the rest. `make_solver()` returns a configured CpSolver (solve.py's, registered for cancel)."""
    out = RepairOutcome(attempted=True)
    t0 = time.time()
    out.violated_rules, involved = hint_violations(payload)
    all_residents = {r.id for r in payload.residents}
    involved &= all_residents
    plan = []
    if involved and involved != all_residents:
        plan.append(("residents", involved, seconds / 2.0))
    plan.append(("all", None, None))
    solver = None
    for scope, free, cap in plan:
        if stop_event is not None and stop_event.is_set():
            break
        remaining = seconds - (time.time() - t0)
        if remaining <= 0.05:
            break
        out.scope = scope
        solver = _repair_solve(payload, build_result, free, remaining if cap is None else min(cap, remaining), make_solver)
        if solver is not None:
            break
    out.seconds = time.time() - t0
    if solver is None:
        return out

    from solver.io.payload import LockedCell

    rows = sorted((rid, d, sid) for (rid, sid, d), var in build_result.store.x.items() if solver.value(var))
    out.hint = [LockedCell(resident_id=r, date=d, shift_id=s) for r, d, s in rows]
    old = {(h.resident_id, h.date): h.shift_id for h in payload.hint}
    new = {(r, d): s for r, d, s in rows}
    out.changed_cells = sum(1 for k in old.keys() | new.keys() if old.get(k) != new.get(k))
    out.repaired = True
    return out
