"""Pass-2 relaxation: rebuilds the model FROM SCRATCH (batch 1's pass-1
model, built by solver/build.py, is never mutated -- a fresh `CpModel` is
created here) with three groups of previously-hard constraints wrapped in
`ok[...]` enforcement literals so CP-SAT can choose to break them, paying an
integer penalty that sits above the ENTIRE pass-1 soft objective. See
docs/PAYLOAD_SCHEMA.md's rule-registry/tier table and the plan's "Two-pass
relaxation" section.

Enforcement literal groups (never overlapping -- exactly the plan's batch-2
grouping):
  - duty-hour: one `ok[resident, family]` per (resident, family) for family
    in DUTY_HOUR_FAMILIES; wraps rest.py / circadian.py / workday_limits.py /
    hours_cap.py.
  - coverageMin: one `ok[shift, date]` per (shift, date) -- ONLY when
    `config.coverageMinMode == "hard_then_elastic"`. In the default
    "elastic_always" mode, coverage-min slack already exists unconditionally
    from batch 1's coverage.py, so nothing needs assumption wrapping there.
  - policy caps: one `ok[resident, capFamily]` per (resident, capFamily) for
    capFamily in POLICY_CAP_FAMILIES; wraps count_caps.py. (traumaPedsSplit's
    two sub-constraints intentionally share ONE literal per resident -- see
    count_caps.py's `_add_trauma_peds_split`.)

Every literal is created LAZILY via `LitPool.get(...)`, called right where
the underlying family's `add_*_constraints` function is about to emit a
REAL constraint for that key -- never once-per-resident up front. This
guarantees no dangling/unused `ok[...]` literal ever appears in the penalty
sum, the assumption probe, or the feasibility report: a family that never
actually applies to a resident (e.g. `caps.trauma is None`, or a resident
with no eve/day shifts in their eligible set at all) never shows up
anywhere downstream.

Never touches (rebuilt via the EXACT SAME functions build.py uses for pass
1, so there is only one encoding of every never-relax rule): eligibility /
variable existence / at-most-one / locked cells (`build_variables`),
coverage MAX (`coverage.py`, always hard), trauma solo / senior composition
(`senior_composition.py`, always hard).

Objective ratchet: pass-2's objective = pass-1's soft objective (unchanged,
same 9 tiers) PLUS 3 more tiers stacked on top via `objective.derive_scales`
-- the EXACT SAME adjacent-tier ratchet algorithm objective.py already uses
for its own 9 tiers, extended to 12. Order (highest priority first):
`relaxDutyHour` > `relaxCoverageMin` > `relaxPolicyCaps` > [the original 9
soft tiers], matching "tier-1 duty-hour >> tier-2 coverage >> tier-3 caps >>
all soft weights" from docs/PAYLOAD_SCHEMA.md. Each new tier's bound is
simply the COUNT of `ok[...]` literals in its pool (each contributes a
`(1 - ok)` term, so its raw max is exactly 1 per literal). Same accepted
`MAX_TIER_SCALE` cap / graceful-degradation tradeoff as objective.py --
see that module's own docstring.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from solver.io.payload import Payload
from solver.model.circadian import add_circadian_constraints
from solver.model.count_caps import add_count_cap_constraints
from solver.model.coverage import add_coverage_constraints
from solver.model.hours_cap import add_hours_cap_constraints
from solver.model.objective import ObjectiveInfo, build_objective, derive_scales
from solver.model.rest import add_rest_constraints
from solver.model.senior_composition import add_senior_composition_constraints
from solver.model.variables import VarStore, build_variables
from solver.model.workday_limits import add_workday_limit_constraints

# One literal per (resident, family) gates EVERY instance of that family for
# that resident -- see the docstrings of rest.py / circadian.py /
# workday_limits.py / hours_cap.py for exactly which constraint each family
# name corresponds to.
DUTY_HOUR_FAMILIES = (
    "restGap",
    "circadianPair",
    "nightRunMax",
    "consecutiveWork",
    "postRun6Rest",
    "hours320",
    "nightCap",
    "nightSegments",
)

# One literal per (resident, capFamily) -- see count_caps.py's SPEC_TO_RULE
# and FAMILY_TRAUMA_PEDS_SPLIT for the source of truth on these names.
POLICY_CAP_FAMILIES = (
    "traumaCap",
    "bamcWedNight",
    "jcCap",
    "pedsMixMax",
    "traumaPedsSplit",
    "targetCeiling",
)

TIER_DUTY_HOUR = "relaxDutyHour"
TIER_COVERAGE_MIN = "relaxCoverageMin"
TIER_POLICY_CAPS = "relaxPolicyCaps"
RELAXATION_TIER_ORDER = (TIER_DUTY_HOUR, TIER_COVERAGE_MIN, TIER_POLICY_CAPS)


class LitPool:
    """Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary
    tuple. `label_by_index` maps each literal's CP-SAT var index back to a
    human "family:resident" / "coverageMin:shift:date" string -- the exact
    shape docs/PAYLOAD_SCHEMA.md's `feasibility.conflicts` examples use --
    for mapping `sufficient_assumptions_for_infeasibility()` results back to
    rule labels.
    """

    def __init__(self, model: cp_model.CpModel):
        self.model = model
        self.lits: dict = {}          # key tuple -> BoolVar
        self.label_by_index: dict = {}  # var.index -> "a:b:c" label

    def get(self, *key_parts):
        key = key_parts
        if key not in self.lits:
            label = ":".join(str(p) for p in key_parts)
            lit = self.model.new_bool_var(f"ok[{label}]")
            self.lits[key] = lit
            self.label_by_index[lit.index] = label
        return self.lits[key]

    def __len__(self) -> int:
        return len(self.lits)


@dataclass
class ElasticBuildResult:
    model: cp_model.CpModel
    store: VarStore
    objective: ObjectiveInfo             # pass-1-shaped soft-objective info (tiers 1-9, unchanged)
    duty_pool: LitPool
    coverage_pool: LitPool
    cap_pool: LitPool
    all_ok_lits: list = field(default_factory=list)   # every created ok[...] literal, creation order
    label_by_index: dict = field(default_factory=dict)
    relaxation_scales: dict = field(default_factory=dict)  # tier name -> int scale


def build_elastic_model(payload: Payload) -> ElasticBuildResult:
    model = cp_model.CpModel()
    store = build_variables(model, payload)

    duty_pool = LitPool(model)
    coverage_pool = LitPool(model)
    cap_pool = LitPool(model)

    def duty_enforcement(resident_id: str, family: str):
        return duty_pool.get(family, resident_id)

    def coverage_enforcement(shift_id: str, date_str: str):
        return coverage_pool.get("coverageMin", shift_id, date_str)

    def cap_enforcement(resident_id: str, family: str):
        return cap_pool.get(family, resident_id)

    coverage_result = add_coverage_constraints(model, payload, store, min_enforcement=coverage_enforcement)
    add_rest_constraints(model, payload, store, enforcement=duty_enforcement)
    add_circadian_constraints(model, payload, store, enforcement=duty_enforcement)
    add_workday_limit_constraints(model, payload, store, enforcement=duty_enforcement)
    add_hours_cap_constraints(model, payload, store, enforcement=duty_enforcement)
    add_count_cap_constraints(model, payload, store, enforcement=cap_enforcement)
    add_senior_composition_constraints(model, payload, store)  # always hard, unchanged

    # build_objective() sets model.minimize(objective.total_expr) as a side
    # effect -- harmless, since the combined pass-2 objective computed below
    # overwrites it with the final model.minimize() call before this
    # function returns. Nothing about the CONSTRAINTS it adds (the reified
    # deficit/fairness/shape helper vars) depends on which minimize() call
    # wins; only the objective *expression* is replaced.
    objective = build_objective(model, payload, store, coverage_result)

    relaxation_scales = _derive_relaxation_scales(objective, duty_pool, coverage_pool, cap_pool)

    penalty_terms = []
    for lit in duty_pool.lits.values():
        penalty_terms.append(relaxation_scales[TIER_DUTY_HOUR] * (1 - lit))
    for lit in coverage_pool.lits.values():
        penalty_terms.append(relaxation_scales[TIER_COVERAGE_MIN] * (1 - lit))
    for lit in cap_pool.lits.values():
        penalty_terms.append(relaxation_scales[TIER_POLICY_CAPS] * (1 - lit))

    total_expr = objective.total_expr
    if penalty_terms:
        total_expr = total_expr + sum(penalty_terms)
    model.minimize(total_expr)

    all_ok_lits = [*duty_pool.lits.values(), *coverage_pool.lits.values(), *cap_pool.lits.values()]
    label_by_index = {}
    label_by_index.update(duty_pool.label_by_index)
    label_by_index.update(coverage_pool.label_by_index)
    label_by_index.update(cap_pool.label_by_index)

    return ElasticBuildResult(
        model=model,
        store=store,
        objective=objective,
        duty_pool=duty_pool,
        coverage_pool=coverage_pool,
        cap_pool=cap_pool,
        all_ok_lits=all_ok_lits,
        label_by_index=label_by_index,
        relaxation_scales=relaxation_scales,
    )


def _derive_relaxation_scales(objective: ObjectiveInfo, duty_pool: LitPool, coverage_pool: LitPool, cap_pool: LitPool) -> dict:
    """Extends objective.py's own 9-tier `derive_scales` ratchet with 3 more
    tiers stacked above `coverageMin` (tier 1 of the original 9) -- one
    shared algorithm, same accepted MAX_TIER_SCALE-cap tradeoff, just a
    longer chain.
    """
    order = [TIER_DUTY_HOUR, TIER_COVERAGE_MIN, TIER_POLICY_CAPS, *objective.tier_order]
    bounds = dict(objective.tier_bounds)
    bounds[TIER_DUTY_HOUR] = len(duty_pool)
    bounds[TIER_COVERAGE_MIN] = len(coverage_pool)
    bounds[TIER_POLICY_CAPS] = len(cap_pool)
    return derive_scales(order, bounds)
