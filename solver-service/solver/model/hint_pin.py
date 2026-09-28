"""R9 follow-up (2026-09-27, "pin the polisher to its own hint"): the staged
solve (`solve.py`'s `_solve_staged`) already bounds each of its 3 stages
lexicographically, but stage 3 minimizes `TIER_RANK + TIER_QUALITY` as ONE
combined expression -- nothing stops CP-SAT from trading coverage slack
(TIER_RANK) for a cheaper quality move (TIER_QUALITY) inside that single
solve, even though the warm-start hint already achieved some particular
coverage value. That's the diagnosed root cause of `engineHeadToHead.test.js`
losses where the solver's `qualityVector` total improved but its own
`coverageMiss` got WORSE than the JS engine's hint schedule (see
docs/PAYLOAD_SCHEMA.md's dated R9 section).

Fix: before the staged solve ever runs, measure exactly what the hint itself
achieves on the 3 components the JS `betterQuality` ladder can actually see
(targetDeficitCore, postNightRest, coverageMin slack), and add each as a HARD
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


def evaluate_hint(payload: Payload, build_result) -> HintEvaluation:
    """Never mutates `build_result.model` -- always clones first. Returns
    `feasible=False` (no components) when `payload.hint` is empty, when the
    model has no x vars at all, or when fixing every x var to the hint's
    value makes the model infeasible under this payload's hard constraints.
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
    solver.parameters.max_time_in_seconds = min(30.0, max(5.0, payload.config.max_time_seconds))
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
    return HintEvaluation(feasible=True, components=components, solver=solver, solve_time_ms=solve_time_ms)


def apply_hint_pins(model, payload: Payload, objective, hint_eval: HintEvaluation) -> None:
    """Adds `expr <= achieved` for every pinned component as a HARD
    constraint on the REAL model. Only ever called when
    `hint_eval.feasible` -- see module docstring for why this can never make
    an otherwise-feasible payload infeasible."""
    exprs = pinned_component_exprs(payload, objective)
    for name, expr in exprs.items():
        model.add(expr <= hint_eval.components[name])
