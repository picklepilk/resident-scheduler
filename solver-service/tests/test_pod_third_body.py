"""podThirdBodyCore: a core resident beyond the first two POD bodies costs the weight."""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.objective import TermGroup
from solver.model.pod_third_body import add_pod_third_body_terms
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

_DATE = "2026-01-07"
_SHIFTS = {"POD-D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"}}


def _solve(weight, residents, force=3, max_cov=3):
    ids = [r["id"] for r in residents]
    raw = make_payload(
        residents=residents, shifts=_SHIFTS, dates=[_DATE],
        eligible={i: {_DATE: ["POD-D"]} for i in ids},
        coverage={"POD-D": {_DATE: {"min": 0, "max": max_cov}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    model.add(sum(store.x_sum_for_shift_date("POD-D", _DATE)) == force)
    group = TermGroup("t")
    weights = {} if weight is None else {"podThirdBodyCore": {"perUnit": weight}}
    add_pod_third_body_terms(model, payload, store, group, weights)
    model.minimize(sum((c * e for c, e in group.terms), start=0))
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "OPTIMAL"
    return solver, store


def _res():
    return [make_resident(f"c{i}", isEmCore=True) for i in range(3)] + [make_resident("o1")]


def test_prefers_off_service_third_body():
    solver, store = _solve(6000, _res())
    assert solver.value(store.get_x("o1", "POD-D", _DATE)) == 1
    assert solver.objective_value == 0


def test_core_third_body_charged_when_only_option():
    solver, _ = _solve(6000, [make_resident(f"c{i}", isEmCore=True) for i in range(3)])
    assert solver.objective_value == 6000


def test_disabled_when_weight_zero_or_absent():
    for w in (0, None):
        solver, _ = _solve(w, [make_resident(f"c{i}", isEmCore=True) for i in range(3)])
        assert solver.objective_value == 0


def test_inert_when_max_below_three():
    solver, _ = _solve(6000, [make_resident(f"c{i}", isEmCore=True) for i in range(3)], force=2, max_cov=2)
    assert solver.objective_value == 0
