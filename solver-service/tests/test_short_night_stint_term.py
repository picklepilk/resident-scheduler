"""objective.py's `_add_short_night_stint_term` (2026-10-30): mirrors the validator's
"Isolated night stint of N" warning (len < 5, interior only, night-only residents exempt),
excluding length-1 runs (owned by `isolatedNight`). Same fixture trick as test_night_fragment.py.
"""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model import objective as objective_mod
from solver.model.circadian import add_circadian_constraints
from solver.model.objective import TermGroup
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

W = {"shortNightStint": {"perUnit": 60}}
SHIFT = {"N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"}}


def _dates(n):
    return [f"2026-01-{5 + i:02d}" for i in range(n)]


def _build(dates, eligible_dates, forced=(), exempt=False):
    raw = make_payload(
        residents=[make_resident("r1", caps={"nights": 10}, nightExempt=exempt)],
        shifts=SHIFT, dates=dates,
        eligible={"r1": {d: ["N"] for d in eligible_dates}},
        coverage={"N": {d: {"min": 0, "max": 1} for d in dates}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)
    for d in forced:
        model.add(store.get_x("r1", "N", d) == 1)
    return payload, model, store


def _cost(model, store, payload, weights=W):
    group = TermGroup("t")
    objective_mod._add_short_night_stint_term(model, payload, store, group, weights)
    expr = sum((c * e for c, e in group.terms), start=0)
    model.minimize(expr)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    return solver.value(expr), group


def test_interior_stints_cost_by_shortfall():
    dates = _dates(10)
    for length, expected in ((2, 180), (3, 120), (4, 60), (5, 0)):
        nights = dates[2:2 + length]
        payload, model, store = _build(dates, nights, forced=nights)
        assert _cost(model, store, payload)[0] == expected


def test_two_night_stint_cheaper_than_isolated_single():
    w = objective_mod.load_default_weights()
    assert 0 < w["shortNightStint"]["perUnit"] * 3 < w["isolatedNight"]["perUnit"]


def test_single_night_not_double_counted():
    dates = _dates(8)
    payload, model, store = _build(dates, [dates[3]], forced=[dates[3]])
    assert _cost(model, store, payload)[0] == 0


def test_edge_touching_stint_is_exempt():
    dates = _dates(8)
    for nights in (dates[0:2], dates[-2:]):
        payload, model, store = _build(dates, nights, forced=nights)
        assert _cost(model, store, payload)[0] == 0


def test_optimizer_prefers_edge_run_over_interior_short_stint():
    """Exactly 4 nights, free placement: the term's optimum is 0 (a block-edge run)."""
    dates = _dates(10)
    payload, model, store = _build(dates, dates)
    model.add(sum(store.night[("r1", d)] for d in dates) == 4)
    assert _cost(model, store, payload)[0] == 0


def test_forced_interior_short_stint_is_penalized_when_edges_unavailable():
    dates = _dates(10)
    payload, model, store = _build(dates, dates[1:9])  # edges not eligible
    model.add(sum(store.night[("r1", d)] for d in dates) == 4)
    assert _cost(model, store, payload)[0] == 60  # best is a single interior 4-night stint


def test_two_stints_each_charged():
    dates = _dates(12)
    nights = [dates[1], dates[2], dates[6], dates[7], dates[8]]
    payload, model, store = _build(dates, nights, forced=nights)
    assert _cost(model, store, payload)[0] == 180 + 120


def test_night_exempt_and_zero_weight_add_nothing():
    dates = _dates(8)
    nights = dates[2:4]
    payload, model, store = _build(dates, nights, forced=nights, exempt=True)
    assert _cost(model, store, payload)[0] == 0
    payload, model, store = _build(dates, nights, forced=nights)
    _, group = _cost(model, store, payload, weights={"shortNightStint": {"perUnit": 0}})
    assert group.terms == []
