"""payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no
solving -- kept separate from solve.py so tests can build a model and inspect
it without paying for a solve, and so a future pass-2 orchestration can
rebuild specific families elastic without duplicating everything else here.
"""

from __future__ import annotations

from dataclasses import dataclass

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


@dataclass
class BuildResult:
    model: cp_model.CpModel
    store: VarStore
    objective: ObjectiveInfo


def build_model(payload: Payload) -> BuildResult:
    model = cp_model.CpModel()
    store = build_variables(model, payload)

    coverage_result = add_coverage_constraints(model, payload, store)
    add_rest_constraints(model, payload, store)
    add_circadian_constraints(model, payload, store)
    add_workday_limit_constraints(model, payload, store)
    add_hours_cap_constraints(model, payload, store)
    add_count_cap_constraints(model, payload, store)
    add_senior_composition_constraints(model, payload, store)

    objective = build_objective(model, payload, store, coverage_result)

    return BuildResult(model=model, store=store, objective=objective)
