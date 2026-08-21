from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.variables import build_variables
from solver.model.workday_limits import add_workday_limit_constraints
from tests.helpers import make_payload, make_resident

_SHIFTS = {
    "D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "N": {"startH": 23, "durationH": 9, "type": "night", "area": "POD"},
}


def _build(dates, eligible, coverage, obligations=None, residents=None):
    raw = make_payload(
        residents=residents or [make_resident("r1")], shifts=_SHIFTS, dates=dates,
        eligible=eligible, coverage=coverage, obligations=obligations or {},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_workday_limit_constraints(model, payload, store)
    return payload, model, store


def test_obligation_day_forces_work_var_true_with_no_shift():
    dates = ["2026-01-05"]
    _, model, store = _build(
        dates, {"r1": {dates[0]: ["D"]}}, {"D": {dates[0]: {"min": 0, "max": 1}}},
        obligations={"r1": [dates[0]]},
    )
    model.add(store.get_x("r1", "D", dates[0]) == 0)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(store.work[("r1", dates[0])]) == 1


def test_work_var_false_with_no_shift_and_no_obligation():
    dates = ["2026-01-05"]
    _, model, store = _build(dates, {"r1": {dates[0]: ["D"]}}, {"D": {dates[0]: {"min": 0, "max": 1}}})
    model.add(store.get_x("r1", "D", dates[0]) == 0)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(store.work[("r1", dates[0])]) == 0


def test_seven_consecutive_workdays_forbidden():
    dates = [f"2026-01-{5 + i:02d}" for i in range(7)]
    eligible = {"r1": {d: ["D"] for d in dates}}
    coverage = {"D": {d: {"min": 0, "max": 1} for d in dates}}
    _, model, store = _build(dates, eligible, coverage)
    for d in dates:
        model.add(store.get_x("r1", "D", d) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_six_consecutive_workdays_allowed():
    dates = [f"2026-01-{5 + i:02d}" for i in range(6)]
    eligible = {"r1": {d: ["D"] for d in dates}}
    coverage = {"D": {d: {"min": 0, "max": 1} for d in dates}}
    _, model, store = _build(dates, eligible, coverage)
    for d in dates:
        model.add(store.get_x("r1", "D", d) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_post_run6_rest_blocks_shift_within_24h_after_completed_run_isolated_from_rule19():
    # Run = 5 D-shifts + 1 N-shift (6 consecutive workdays), then a day OFF
    # (breaks the run so rule 19's 7-day window is untouched), then an
    # attempted D-shift 2 calendar days after the run's last (night) shift --
    # only rule 20 can explain this being infeasible.
    dates = [f"2026-01-{5 + i:02d}" for i in range(8)]
    eligible = {"r1": {d: ["D"] for d in dates}}
    eligible["r1"][dates[5]] = ["N"]
    coverage = {"D": {d: {"min": 0, "max": 1} for d in dates}, "N": {dates[5]: {"min": 0, "max": 1}}}
    del coverage["D"][dates[5]]
    _, model, store = _build(dates, eligible, coverage)
    for d in dates[:5]:
        model.add(store.get_x("r1", "D", d) == 1)
    model.add(store.get_x("r1", "N", dates[5]) == 1)
    model.add(store.get_x("r1", "D", dates[6]) == 0)  # explicit day off, breaks the run
    model.add(store.get_x("r1", "D", dates[7]) == 1)  # 2 days after the run's last shift
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_shift_well_after_run_is_allowed():
    dates = [f"2026-01-{5 + i:02d}" for i in range(9)]
    eligible = {"r1": {d: ["D"] for d in dates}}
    eligible["r1"][dates[5]] = ["N"]
    coverage = {"D": {d: {"min": 0, "max": 1} for d in dates}, "N": {dates[5]: {"min": 0, "max": 1}}}
    del coverage["D"][dates[5]]
    _, model, store = _build(dates, eligible, coverage)
    for d in dates[:5]:
        model.add(store.get_x("r1", "D", d) == 1)
    model.add(store.get_x("r1", "N", dates[5]) == 1)
    model.add(store.get_x("r1", "D", dates[6]) == 0)
    model.add(store.get_x("r1", "D", dates[7]) == 0)
    model.add(store.get_x("r1", "D", dates[8]) == 1)  # 3 days after -- ample rest
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
