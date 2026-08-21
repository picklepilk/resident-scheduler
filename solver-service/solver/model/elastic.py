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

Objective: pass-2's objective = pass-1's soft objective (unchanged, built by
`objective.build_objective` with its own fixed, moderate per-term weights --
see that module's docstring) PLUS 3 more penalty groups stacked on top, each
at its own FIXED weight (`RELAXATION_WEIGHTS` below), highest priority first:
`relaxDutyHour` (1e10) > `relaxCoverageMin` (1e9) > `relaxPolicyCaps` (1e8) >
[the original soft objective, whose largest single term -- coverageMin's
own slack weight -- is smaller still], matching "tier-1 duty-hour >>
tier-2 coverage >> tier-3 caps >> all soft weights" from
docs/PAYLOAD_SCHEMA.md. Each `ok[...]` literal contributes a `(1 - ok)`
term at its group's weight when broken.

This used to be derived via `objective.derive_scales`, the same
adjacent-tier ratchet objective.py used for its own tiers, extended to 12
levels. That approach is gone (see objective.py's docstring for the full
story of why): with hundreds of `ok[...]` literals per pool and 3-4 levels
stacked, requiring each tier's PER-UNIT weight to exceed 10x the SUM of
every literal below it grows by roughly (10 x pool_size) per level and blows
past int64 by the third level, independent of the starting weight -- the
same failure mode that made the original 9-tier ratchet collapse tiers
together. `RELAXATION_WEIGHTS` are fixed, round, comfortably-separated
constants instead: each is 10x the one below, and each is far above the
soft objective's own largest per-term weight (1e6, for coverageMin's slack).
Worst-case total across every literal in every pool plus the whole soft
objective stays several orders of magnitude under int64's ~9.2e18 ceiling
(see `tests/test_weight_tiering.py`, which asserts this numerically rather
than proving exact lexicographic dominance -- a moderate, documented
tradeoff, not an oversight).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from solver.io.payload import Payload
from solver.model.circadian import add_circadian_constraints
from solver.model.count_caps import add_count_cap_constraints
from solver.model.coverage import add_coverage_constraints
from solver.model.hours_cap import add_hours_cap_constraints
from solver.model.objective import ObjectiveInfo, build_objective
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

# Fixed per-literal weights, highest priority first -- see module docstring
# for why these replace the old derived ratchet. Each is exactly 10x the
# next, and each is far above the soft objective's own largest per-term
# weight (coverageMin's 1e6 slack weight in config/default_weights.json).
RELAXATION_WEIGHTS = {
    TIER_DUTY_HOUR: 10 ** 10,
    TIER_COVERAGE_MIN: 10 ** 9,
    TIER_POLICY_CAPS: 10 ** 8,
}


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
    objective: ObjectiveInfo             # pass-1-shaped soft-objective info, unchanged
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

    relaxation_scales = dict(RELAXATION_WEIGHTS)

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
