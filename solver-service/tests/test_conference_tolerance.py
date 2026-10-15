"""Gap fix (solver-side conference tolerance): mirrors JS validateAll's
`conferenceTolerated` branch (ResidentScheduler.jsx) -- on a block that
touches an ACEP/AAEM/SAEM-style conference, an EM-core resident's shortfall
of exactly 1 shift is a 'warn' (blockingWarnCount), not an 'error'
(errorCount). Before this fix the solver had no "does this block touch a
conference" signal at all and charged every EM-core shortfall at full
TIER_ERRORS weight regardless -- see docs/PAYLOAD_SCHEMA.md's R9 tier-mapping
table, "Gap" note on the `errorCount` row.

`payload.block_touches_conference` (from `buildSolverPayload`'s
`blockTouchesConference`, same `getConferencesInBlock(...).length > 0` check
validateAll itself runs) is the new signal. `objective.py`'s
`_add_target_deficit_terms` splits an EM-core resident's `deficit` into
`tolerated = min(deficit, 1)` (TIER_BLOCKING, `conferenceTolerated` weight)
and `remainder = deficit - tolerated` (TIER_ERRORS, `targetDeficitCore`
weight) whenever the flag is set -- exactly 1 unit moves, any further
shortfall stays in TIER_ERRORS, matching JS's "scoped to a shortfall of
exactly 1 (2+ is still a real problem)" comment.
"""

from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient
from ortools.sat.python import cp_model

from api.main import app
from solver.io.payload import parse_payload
from solver.model.coverage import add_coverage_constraints
from solver.model.objective import TIER_BLOCKING, TIER_ERRORS, load_default_weights, build_objective
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

DATES = ["2026-01-05", "2026-01-06"]


def _tier_values(target: int, block_touches_conference: bool):
    raw = make_payload(
        residents=[make_resident("r1", isEmCore=True, target=target)],
        dates=DATES,
        eligible={"r1": {d: ["D"] for d in DATES}},
        coverage={"D": {d: {"min": 0, "max": 5} for d in DATES}},
        blockTouchesConference=block_touches_conference,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    coverage_result = add_coverage_constraints(model, payload, store)
    objective = build_objective(model, payload, store, coverage_result)
    # Force r1 to work zero shifts on both dates -> deficit == target exactly.
    for d in DATES:
        model.add(store.get_x("r1", "D", d) == 0)
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    errors = round(solver.value(objective.stage_exprs[TIER_ERRORS]))
    blocking = round(solver.value(objective.stage_exprs[TIER_BLOCKING]))
    return errors, blocking


def test_block_touches_conference_defaults_false():
    raw = make_payload()
    payload = parse_payload(raw)
    assert payload.block_touches_conference is False


_FAKE_RESULT = SimpleNamespace(
    status="OPTIMAL", mode="strict", schedule={}, objective_value=0, solve_time_ms=1,
    seed=1, report={"overstaffed": []}, feasibility=None, validation={"passed": True},
)


def test_block_touches_conference_survives_the_api_schema_boundary(monkeypatch):
    """Pydantic's `SolveRequest` (api/schemas.py) silently DROPS a field it never declared --
    `request.model_dump()` wouldn't carry an undeclared `blockTouchesConference` through to
    `parse_payload` at all. This is the regression this test guards against: the field must be
    declared on `SolveRequest`, not just `Payload`."""
    captured = {}

    def _fake_solve(payload):
        captured["payload"] = payload
        return _FAKE_RESULT

    monkeypatch.setattr("api.main.solve", _fake_solve)
    body = make_payload(blockTouchesConference=True)
    resp = TestClient(app).post("/solve", json=body)
    assert resp.status_code == 200
    assert captured["payload"].block_touches_conference is True


def test_without_conference_full_deficit_is_tier_errors():
    weights = load_default_weights()
    core_coef = weights["targetDeficitCore"]["perUnit"]
    errors, blocking = _tier_values(target=2, block_touches_conference=False)
    assert errors == core_coef * 2
    assert blocking == 0


def test_shortfall_of_one_during_conference_moves_entirely_to_blocking():
    weights = load_default_weights()
    tolerated_coef = weights["conferenceTolerated"]["perUnit"]
    errors, blocking = _tier_values(target=1, block_touches_conference=True)
    assert errors == 0
    assert blocking == tolerated_coef


def test_shortfall_of_two_during_conference_tolerates_only_the_first_unit():
    weights = load_default_weights()
    core_coef = weights["targetDeficitCore"]["perUnit"]
    tolerated_coef = weights["conferenceTolerated"]["perUnit"]
    errors, blocking = _tier_values(target=2, block_touches_conference=True)
    # Only ONE unit tolerated -- the 2nd stays at full TIER_ERRORS weight, matching JS's "scoped
    # to a shortfall of exactly 1 (2+ is still a real problem)".
    assert errors == core_coef * 1
    assert blocking == tolerated_coef


def test_non_em_core_resident_is_unaffected_by_the_conference_flag():
    raw = make_payload(
        residents=[make_resident("r1", isEmCore=False, target=2)],
        dates=DATES,
        eligible={"r1": {d: ["D"] for d in DATES}},
        coverage={"D": {d: {"min": 0, "max": 5} for d in DATES}},
        blockTouchesConference=True,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    coverage_result = add_coverage_constraints(model, payload, store)
    objective = build_objective(model, payload, store, coverage_result)
    for d in DATES:
        model.add(store.get_x("r1", "D", d) == 0)
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    # A non-core resident's deficit never touches TIER_ERRORS/TIER_BLOCKING at all (it lands in
    # TIER_QUALITY's `targetDeficit`, non-core) -- both stay 0 regardless of the conference flag.
    assert round(solver.value(objective.stage_exprs[TIER_ERRORS])) == 0
    assert round(solver.value(objective.stage_exprs[TIER_BLOCKING])) == 0
