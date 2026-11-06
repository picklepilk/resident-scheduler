"""objective.py's `_add_area_spread_term` (2026-10-30): mirrors scheduleQuality.js's areaSpread,
penalty = max(0, topAreaCount - ceil(worked * 0.5)) per resident.
"""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model import objective as objective_mod
from solver.model.objective import TermGroup
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

W = {"areaSpread": {"perUnit": 100}}
SHIFTS = {
    "POD-D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "PED-D": {"startH": 7, "durationH": 9, "type": "day", "area": "PED"},
}


def _build(n_dates=6, shifts=SHIFTS):
    dates = [f"2026-01-{5 + i:02d}" for i in range(n_dates)]
    raw = make_payload(
        residents=[make_resident("r1")], shifts=shifts, dates=dates,
        eligible={"r1": {d: list(shifts) for d in dates}},
        coverage={s: {d: {"min": 0, "max": 1} for d in dates} for s in shifts},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    return dates, payload, model, store


def _force(model, store, dates, picks):
    """picks: {date_index: shift_id}; all other dates forced off."""
    for i, d in enumerate(dates):
        for sid in SHIFTS:
            v = store.get_x("r1", sid, d)
            if v is not None:
                model.add(v == (1 if picks.get(i) == sid else 0))


def _cost(model, store, payload, weights=W):
    group = TermGroup("t")
    objective_mod._add_area_spread_term(model, payload, store, group, weights)
    expr = sum((c * e for c, e in group.terms), start=0)
    model.minimize(expr)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    return solver.value(expr), group


def test_all_one_area_pays_excess_over_half():
    dates, payload, model, store = _build()
    _force(model, store, dates, {i: "POD-D" for i in range(4)})  # worked 4, top 4, ceil 2
    assert _cost(model, store, payload)[0] == 200


def test_balanced_areas_cost_nothing():
    dates, payload, model, store = _build()
    _force(model, store, dates, {0: "POD-D", 1: "POD-D", 2: "PED-D", 3: "PED-D"})
    assert _cost(model, store, payload)[0] == 0


def test_odd_worked_uses_ceil():
    dates, payload, model, store = _build()
    _force(model, store, dates, {0: "POD-D", 1: "POD-D", 2: "PED-D"})  # worked 3, ceil 2, top 2
    assert _cost(model, store, payload)[0] == 0
    dates, payload, model, store = _build()
    _force(model, store, dates, {0: "POD-D", 1: "POD-D", 2: "POD-D"})  # top 3 - 2
    assert _cost(model, store, payload)[0] == 100


def test_optimum_balances_areas_when_worked_fixed():
    dates, payload, model, store = _build()
    model.add(sum(store.x.values()) == 4)
    assert _cost(model, store, payload)[0] == 0


def test_nothing_worked_costs_nothing():
    dates, payload, model, store = _build()
    _force(model, store, dates, {})
    assert _cost(model, store, payload)[0] == 0


def test_single_area_resident_skipped_and_zero_weight_adds_nothing():
    one = {"POD-D": SHIFTS["POD-D"]}
    dates, payload, model, store = _build(shifts=one)
    for d in dates[:4]:
        model.add(store.get_x("r1", "POD-D", d) == 1)
    cost, group = _cost(model, store, payload)
    assert cost == 0 and group.terms == []
    dates, payload, model, store = _build()
    _, group = _cost(model, store, payload, weights={"areaSpread": {"perUnit": 0}})
    assert group.terms == []


def test_ceil_floor_linear_encoding_exact_for_every_worked_count():
    """Division-free ceil(worked/2): fixed worked = w with one area has top = w -> cost 100*(w - ceil(w/2))."""
    for w in range(0, 7):
        dates, payload, model, store = _build(n_dates=8)
        _force(model, store, dates, {i: "POD-D" for i in range(w)})
        assert _cost(model, store, payload)[0] == 100 * (w - (w + 1) // 2), w


def test_cost_monotone_in_concentration_and_same_optimum():
    """Shifting one shift from the minority area to the majority never lowers cost; optimum over 5 worked is 100."""
    costs = []
    for n_pod in range(0, 6):  # 5 shifts: n_pod POD, rest PED
        dates, payload, model, store = _build(n_dates=8)
        _force(model, store, dates, {i: ("POD-D" if i < n_pod else "PED-D") for i in range(5)})
        costs.append(_cost(model, store, payload)[0])
    # ceil(5/2)=3; top = max(n, 5-n) -> 5,4,3,3,4,5 -> excess 2,1,0,0,1,2
    assert costs == [200, 100, 0, 0, 100, 200]
    dates, payload, model, store = _build(n_dates=8)
    model.add(sum(store.x.values()) == 5)
    assert _cost(model, store, payload)[0] == 0
