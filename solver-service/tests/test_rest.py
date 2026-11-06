from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.rest import add_rest_constraints
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

_SHIFTS = {
    "D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "N": {"startH": 23, "durationH": 9, "type": "night", "area": "POD"},
}


def _two_day_payload(**overrides):
    dates = ["2026-02-02", "2026-02-03"]
    return make_payload(
        residents=[make_resident("r1")],
        shifts=_SHIFTS,
        dates=dates,
        eligible={"r1": {"2026-02-02": ["N"], "2026-02-03": ["D"]}},
        coverage={"N": {"2026-02-02": {"min": 0, "max": 1}}, "D": {"2026-02-03": {"min": 0, "max": 1}}},
        **overrides,
    )


def test_insufficient_gap_forbidden_when_enforce_rest_true():
    payload = parse_payload(_two_day_payload())
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_rest_constraints(model, payload, store)
    model.add(store.get_x("r1", "N", "2026-02-02") == 1)
    model.add(store.get_x("r1", "D", "2026-02-03") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_insufficient_gap_still_forbidden_when_enforce_rest_false():
    # R7 (2026-09-27): rest >= shift length is ACGME-hard and always on now -- settings.enforceRest
    # no longer gates this rule at all (a stale/rogue payload can't switch it off either).
    raw = _two_day_payload(settings={"enforceRest": False, "enforceWeekendOff": True})
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_rest_constraints(model, payload, store)
    model.add(store.get_x("r1", "N", "2026-02-02") == 1)
    model.add(store.get_x("r1", "D", "2026-02-03") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def _gr_pair(grDates, first="N", second_start=18):
    shifts = {
        "N": {"startH": 23, "durationH": 9, "type": "night", "area": "POD"},   # 23:00-08:00
        "E": {"startH": 15, "durationH": 9, "type": "eve", "area": "POD"},     # 15:00-24:00
        "L": {"startH": second_start, "durationH": 4, "type": "eve", "area": "POD"},
    }
    raw = make_payload(
        residents=[make_resident("r1", grDates=grDates)],
        shifts=shifts,
        dates=["2026-02-02", "2026-02-03"],
        eligible={"r1": {"2026-02-02": [first], "2026-02-03": ["L"]}},
        coverage={first: {"2026-02-02": {"min": 0, "max": 1}}, "L": {"2026-02-03": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_rest_constraints(model, payload, store)
    model.add(store.get_x("r1", first, "2026-02-02") == 1)
    model.add(store.get_x("r1", "L", "2026-02-03") == 1)
    solver = cp_model.CpSolver()
    return solver.status_name(solver.solve(model))


def test_gr_end_pushes_rest_clock_after_night():
    # 2026-11-06 (chief "follow ACGME for now", reverses 2026-10-15): attended Grand Rounds is work.
    # Night 23:00-08:00 (9h) then GR on 02-03 (08-10 after a night): rest runs from 10:00, so the
    # next shift may start no earlier than 19:00. An 18:00 start is legal ONLY without GR that day.
    assert _gr_pair(["2026-02-03"]) == "INFEASIBLE"


def test_gr_end_adjustment_inert_without_gr_dates():
    # Same pair, no grDates (or GR not on the day after): plain shift-end math, 08:00 + 9h = 17:00 <= 18:00.
    assert _gr_pair([]) in ("OPTIMAL", "FEASIBLE")
    assert _gr_pair(["2026-02-10"]) in ("OPTIMAL", "FEASIBLE")


def test_gr_end_exactly_met_is_legal():
    # Start at 19:00 == GR end (10:00) + 9h -> legal.
    assert _gr_pair(["2026-02-03"], second_start=19) in ("OPTIMAL", "FEASIBLE")


def test_gr_after_eve_ends_at_noon():
    # Eve 15:00-24:00 (9h), GR next day 10-12 after an eve: next shift no earlier than 21:00.
    assert _gr_pair(["2026-02-03"], first="E", second_start=20) == "INFEASIBLE"
    assert _gr_pair(["2026-02-03"], first="E", second_start=21) in ("OPTIMAL", "FEASIBLE")


def test_tail_constant_forces_block_var_to_zero():
    raw = make_payload(
        residents=[make_resident("r1", priorTail={"2026-02-02": "N"})],
        shifts=_SHIFTS,
        dates=["2026-02-03"],
        eligible={"r1": {"2026-02-03": ["D"]}},
        coverage={"D": {"2026-02-03": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    assert payload.tail_dates[-1] == "2026-02-02"  # sanity: tail is contiguous, ends right before block
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_rest_constraints(model, payload, store)
    model.add(store.get_x("r1", "D", "2026-02-03") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_two_days_apart_with_ample_gap_is_allowed():
    raw = make_payload(
        residents=[make_resident("r1")],
        shifts=_SHIFTS,
        dates=["2026-02-02", "2026-02-03", "2026-02-04"],
        eligible={"r1": {"2026-02-02": ["D"], "2026-02-04": ["D"]}},
        coverage={"D": {"2026-02-02": {"min": 0, "max": 1}, "2026-02-04": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_rest_constraints(model, payload, store)
    model.add(store.get_x("r1", "D", "2026-02-02") == 1)
    model.add(store.get_x("r1", "D", "2026-02-04") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
