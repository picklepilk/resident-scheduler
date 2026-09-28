"""R7 (2026-09-27, gap 3): soft preference for a TRUE primary PGY over a
Wellness-Wednesday/conference-away substitute (solver/model/senior_composition.py's
add_true_primary_preference_terms)."""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.objective import TermGroup
from solver.model.senior_composition import add_true_primary_preference_terms
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

_SHIFTS = {"D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"}}
_DATE = "2026-01-07"


def _build(true_primary, coef=100):
    raw = make_payload(
        residents=[make_resident("r1"), make_resident("r2")], shifts=_SHIFTS, dates=[_DATE],
        eligible={"r1": {_DATE: ["D"]}, "r2": {_DATE: ["D"]}},
        coverage={"D": {_DATE: {"min": 0, "max": 2}}},
        truePrimary=true_primary,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    # Exactly one of r1/r2 gets the shift -- bypasses coverage.py entirely so this test stays
    # focused on the preference term alone.
    model.add(store.get_x("r1", "D", _DATE) + store.get_x("r2", "D", _DATE) == 1)
    group = TermGroup("test")
    add_true_primary_preference_terms(model, payload, store, group, coef)
    total = sum((c * expr for c, expr in group.terms), start=0)
    model.minimize(total)
    return model, store


def test_prefers_true_primary_over_fallback_when_both_available():
    model, store = _build({"D": {_DATE: ["r1"]}})
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(store.get_x("r1", "D", _DATE)) == 1
    assert solver.value(store.get_x("r2", "D", _DATE)) == 0
    assert solver.objective_value == 0  # true primary chosen -- no penalty paid


def test_no_penalty_when_no_true_primary_is_available():
    model, store = _build({"D": {_DATE: []}})  # empty -- nobody is a true primary today
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
    assert solver.objective_value == 0  # fallback is fully accepted, whichever gets picked


def test_no_entry_means_no_constraint_at_all():
    model, store = _build({})
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
    assert solver.objective_value == 0


def test_zero_coef_is_a_documented_noop():
    model, store = _build({"D": {_DATE: ["r1"]}}, coef=0)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
    assert solver.objective_value == 0
