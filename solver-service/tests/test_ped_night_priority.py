"""pedNightOverSwing: prefer filling PED-N over PED-S."""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.objective import TermGroup
from solver.model.ped_night_priority import add_ped_night_priority_terms
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

_DATE = "2026-01-07"
_SHIFTS = {
    "PED-N": {"startH": 23, "durationH": 8, "type": "night", "area": "PED"},
    "PED-S": {"startH": 15, "durationH": 8, "type": "eve", "area": "PED"},
}


def _solve(weight, n_max=1, s_max=1):
    raw = make_payload(
        residents=[make_resident("r1")], shifts=_SHIFTS, dates=[_DATE],
        eligible={"r1": {_DATE: ["PED-N", "PED-S"]}},
        coverage={"PED-N": {_DATE: {"min": 0, "max": n_max}}, "PED-S": {_DATE: {"min": 0, "max": s_max}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    n, s = store.get_x("r1", "PED-N", _DATE), store.get_x("r1", "PED-S", _DATE)
    model.add(n + s == 1)  # exactly one of the two
    group = TermGroup("t")
    weights = {} if weight is None else {"pedNightOverSwing": {"perUnit": weight}}
    add_ped_night_priority_terms(model, payload, store, group, weights)
    model.minimize(sum((c * e for c, e in group.terms), start=0))
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "OPTIMAL"
    return solver, n, s


def test_prefers_night_over_swing():
    solver, n, s = _solve(600)
    assert solver.value(n) == 1 and solver.value(s) == 0
    assert solver.objective_value == 0


def test_disabled_when_weight_zero_or_absent():
    for w in (0, None):
        solver, _n, _s = _solve(w)
        assert solver.objective_value == 0


def test_inert_when_night_max_zero():
    solver, _n, s = _solve(600, n_max=0)
    assert solver.objective_value == 0
