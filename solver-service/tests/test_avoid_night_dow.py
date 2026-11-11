"""neuroTueThuNight: NEURO_1 avoids Tue/Thu NIGHT shifts (soft, QUALITY tier)."""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.avoid_night_dow import add_avoid_night_dow_terms
from solver.model.objective import TermGroup
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

_TUE, _WED, _THU = "2026-01-06", "2026-01-07", "2026-01-08"
_SHIFTS = {
    "POD-N": {"startH": 19, "durationH": 12, "type": "night", "area": "POD"},
    "POD-D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
}


def _solve(weight, date, shift="POD-N"):
    residents = [make_resident("n1", cohort="NEURO_1"), make_resident("o1", cohort="ANES_1")]
    raw = make_payload(
        residents=residents, shifts=_SHIFTS, dates=[date],
        eligible={r["id"]: {date: [shift]} for r in residents},
        coverage={shift: {date: {"min": 0, "max": 2}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    model.add(sum(store.x_sum_for_shift_date(shift, date)) == 1)
    group = TermGroup("t")
    weights = {} if weight is None else {"neuroTueThuNight": {"perUnit": weight}}
    add_avoid_night_dow_terms(model, payload, store, group, weights)
    model.minimize(sum((c * e for c, e in group.terms), start=0))
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "OPTIMAL"
    return solver, store


def test_avoids_neuro_on_tue_and_thu_nights():
    for d in (_TUE, _THU):
        solver, store = _solve(150, d)
        assert solver.value(store.get_x("o1", "POD-N", d)) == 1
        assert solver.objective_value == 0


def test_not_avoided_on_wednesday_or_day_shift():
    s, store = _solve(150, _WED)
    assert s.objective_value == 0
    s, store = _solve(150, _TUE, shift="POD-D")
    assert s.objective_value == 0


def test_soft_only_when_neuro_is_the_only_option():
    residents = [make_resident("n1", cohort="NEURO_1")]
    raw = make_payload(
        residents=residents, shifts=_SHIFTS, dates=[_TUE],
        eligible={"n1": {_TUE: ["POD-N"]}}, coverage={"POD-N": {_TUE: {"min": 1, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    model.add(sum(store.x_sum_for_shift_date("POD-N", _TUE)) == 1)
    group = TermGroup("t")
    add_avoid_night_dow_terms(model, payload, store, group, {"neuroTueThuNight": {"perUnit": 150}})
    model.minimize(sum((c * e for c, e in group.terms), start=0))
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "OPTIMAL"
    assert solver.objective_value == 150


def test_disabled_when_weight_zero_or_absent():
    # With no penalty either resident is a valid optimum; just check the objective is 0.
    for w in (0, None):
        solver, _ = _solve(w, _TUE)
        assert solver.objective_value == 0
