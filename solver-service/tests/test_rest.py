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


def test_gr_end_pushes_required_rest_start_later():
    # A night shift ending at 08:00 normally needs only 9h rest (its own duration) before the next
    # shift can start -- 08:00 + 9h = 17:00. But if this resident's OWN Grand Rounds obligation lands
    # on that end date (grDates) and GR runs until 12:00 (gr_end_h default), rest must be measured
    # from 12:00 instead: 12:00 + 9h = 21:00. A shift starting at 19:00 that day is far enough past
    # 17:00 to be legal under the plain shift-end math, but still inside the GR-adjusted window.
    shifts = {
        "N": {"startH": 23, "durationH": 9, "type": "night", "area": "POD"},   # 23:00-08:00
        "E": {"startH": 19, "durationH": 4, "type": "eve", "area": "POD"},     # 19:00 start
    }
    raw = make_payload(
        residents=[make_resident("r1", grDates=["2026-02-03"])],
        shifts=shifts,
        dates=["2026-02-02", "2026-02-03"],
        eligible={"r1": {"2026-02-02": ["N"], "2026-02-03": ["E"]}},
        coverage={"N": {"2026-02-02": {"min": 0, "max": 1}}, "E": {"2026-02-03": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_rest_constraints(model, payload, store)
    model.add(store.get_x("r1", "N", "2026-02-02") == 1)
    model.add(store.get_x("r1", "E", "2026-02-03") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_gr_end_adjustment_inert_without_gr_dates():
    # Same shift pair as above, but this resident has no grDates -- plain shift-end math applies
    # (08:00 + 9h = 17:00 <= 19:00 start), so the pair is legal.
    shifts = {
        "N": {"startH": 23, "durationH": 9, "type": "night", "area": "POD"},
        "E": {"startH": 19, "durationH": 4, "type": "eve", "area": "POD"},
    }
    raw = make_payload(
        residents=[make_resident("r1")],
        shifts=shifts,
        dates=["2026-02-02", "2026-02-03"],
        eligible={"r1": {"2026-02-02": ["N"], "2026-02-03": ["E"]}},
        coverage={"N": {"2026-02-02": {"min": 0, "max": 1}}, "E": {"2026-02-03": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_rest_constraints(model, payload, store)
    model.add(store.get_x("r1", "N", "2026-02-02") == 1)
    model.add(store.get_x("r1", "E", "2026-02-03") == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


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
