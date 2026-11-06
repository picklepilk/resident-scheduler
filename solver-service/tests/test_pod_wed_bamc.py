"""wedPodBamcBody: Wednesday POD-D prefers a BAMC body (soft, QUALITY tier)."""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.objective import TermGroup
from solver.model.pod_wed_bamc import add_wed_pod_bamc_terms
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

_WED = "2026-01-07"  # Wednesday
_THU = "2026-01-08"
_SHIFTS = {"POD-D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"}}


def _solve(weight, date, residents, force=1):
    ids = [r["id"] for r in residents]
    raw = make_payload(
        residents=residents, shifts=_SHIFTS, dates=[date],
        eligible={i: {date: ["POD-D"]} for i in ids},
        coverage={"POD-D": {date: {"min": 0, "max": 3}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    model.add(sum(store.x_sum_for_shift_date("POD-D", date)) == force)
    group = TermGroup("t")
    weights = {} if weight is None else {"wedPodBamcBody": {"perUnit": weight}}
    add_wed_pod_bamc_terms(model, payload, store, group, weights)
    model.minimize(sum((c * e for c, e in group.terms), start=0))
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "OPTIMAL"
    return solver, store


def _res():
    return [make_resident("b1", cohort="EM_BAMC_1"), make_resident("o1", cohort="ANES_1")]


def test_prefers_bamc_body_on_wednesday():
    solver, store = _solve(150, _WED, _res())
    assert solver.value(store.get_x("b1", "POD-D", _WED)) == 1
    assert solver.objective_value == 0


def test_no_bamc_available_costs_nothing():
    solver, _ = _solve(150, _WED, [make_resident("o1", cohort="ANES_1")])
    assert solver.objective_value == 0


def test_only_wednesday():
    solver, _ = _solve(150, _THU, _res())
    assert solver.objective_value == 0


def test_disabled_when_weight_zero_or_absent():
    for w in (0, None):
        solver, store = _solve(w, _WED, _res())
        assert solver.objective_value == 0
