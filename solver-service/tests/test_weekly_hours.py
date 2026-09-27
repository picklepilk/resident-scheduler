"""R7 (2026-09-27): ACGME EM 6.17.a.3 rolling-7-day 60 ED / 72 total hour caps
(solver/model/weekly_hours.py)."""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.variables import build_variables
from solver.model.weekly_hours import add_weekly_hours_cap_constraints
from tests.helpers import make_payload, make_resident

_SEVEN_DATES = [f"2026-03-{d:02d}" for d in range(2, 9)]  # Mon 2026-03-02 .. Sun 2026-03-08


def _build(residents, shifts, dates, eligible, coverage):
    raw = make_payload(residents=residents, shifts=shifts, dates=dates, eligible=eligible, coverage=coverage)
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_weekly_hours_cap_constraints(model, payload, store)
    return model, store


def _force_all(model, store, resident_id, shift_id, dates):
    for ds in dates:
        model.add(store.get_x(resident_id, shift_id, ds) == 1)


def test_ed_cap_forbids_seven_twelve_hour_shifts_in_one_week():
    # 7 x 12h = 84h ED in the rolling 7-day window -- well over the 60h cap.
    shifts = {"D12": {"startH": 7, "durationH": 12, "type": "day", "area": "POD"}}
    residents = [make_resident("r1", isEmCore=True, target=10)]
    eligible = {"r1": {d: ["D12"] for d in _SEVEN_DATES}}
    coverage = {"D12": {d: {"min": 0, "max": 1} for d in _SEVEN_DATES}}
    model, store = _build(residents, shifts, _SEVEN_DATES, eligible, coverage)
    _force_all(model, store, "r1", "D12", _SEVEN_DATES)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_ed_cap_allows_five_twelve_hour_shifts_in_one_week():
    # 5 x 12h = 60h -- exactly at the cap, allowed.
    shifts = {"D12": {"startH": 7, "durationH": 12, "type": "day", "area": "POD"}}
    residents = [make_resident("r1", isEmCore=True, target=10)]
    dates = _SEVEN_DATES[:5]
    eligible = {"r1": {d: ["D12"] for d in dates}}
    coverage = {"D12": {d: {"min": 0, "max": 1} for d in dates}}
    model, store = _build(residents, shifts, dates, eligible, coverage)
    _force_all(model, store, "r1", "D12", dates)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_total_cap_includes_obligation_hours_even_when_ed_is_under_60():
    # 7 x 8h = 56h ED (under the 60h ED cap on its own), but 5 obligation (GR/JC) days at 4h each
    # push the TOTAL to 76h, over the 72h total cap.
    shifts = {"D": {"startH": 7, "durationH": 8, "type": "day", "area": "POD"}}
    obligation_hours = {d: 4 for d in _SEVEN_DATES[:5]}
    residents = [make_resident("r1", isEmCore=True, target=10, obligationHours=obligation_hours)]
    eligible = {"r1": {d: ["D"] for d in _SEVEN_DATES}}
    coverage = {"D": {d: {"min": 0, "max": 1} for d in _SEVEN_DATES}}
    model, store = _build(residents, shifts, _SEVEN_DATES, eligible, coverage)
    _force_all(model, store, "r1", "D", _SEVEN_DATES)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_off_service_resident_not_subject_to_weekly_caps():
    # Same 7x12h load as the first test, but isEmCore=False -- off-service residents keep only the
    # 80h/4wk rule (hours_cap.py), never this pair.
    shifts = {"D12": {"startH": 7, "durationH": 12, "type": "day", "area": "POD"}}
    residents = [make_resident("r1", isEmCore=False, target=10)]
    eligible = {"r1": {d: ["D12"] for d in _SEVEN_DATES}}
    coverage = {"D12": {d: {"min": 0, "max": 1} for d in _SEVEN_DATES}}
    model, store = _build(residents, shifts, _SEVEN_DATES, eligible, coverage)
    _force_all(model, store, "r1", "D12", _SEVEN_DATES)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_off_rotation_resident_not_subject_to_weekly_caps():
    # isEmCore=True, schedulable=False (not on the EM rotation this block, e.g. an atUH:false
    # rotation) -- mirrors candidatePool's isEmResident(r) && isSchedulable(r) gate exactly. target
    # is also None here (as buildSolverPayload always sends for a non-schedulable resident), but
    # `schedulable` -- not `target` -- is what actually puts them out of scope (gap fix 2026-09-27,
    # see next test for the case target is None for an UNRELATED reason).
    shifts = {"D12": {"startH": 7, "durationH": 12, "type": "day", "area": "POD"}}
    residents = [make_resident("r1", isEmCore=True, target=None, schedulable=False)]
    eligible = {"r1": {d: ["D12"] for d in _SEVEN_DATES}}
    coverage = {"D12": {d: {"min": 0, "max": 1} for d in _SEVEN_DATES}}
    model, store = _build(residents, shifts, _SEVEN_DATES, eligible, coverage)
    _force_all(model, store, "r1", "D12", _SEVEN_DATES)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_schedulable_resident_with_bought_down_target_still_capped():
    # Gap fix (2026-09-27, review of 4d1b7ba): isEmCore=True, schedulable=True (default, still on
    # the EM rotation this block, still fully eligible for shifts), but target=None because their
    # target was bought down to <=0 (getShiftTarget returns None, never 0 -- CLAUDE.md). The old
    # scope predicate (`target is not None`) wrongly treated this exactly like the off-rotation case
    # above and left them uncapped; `is_em_core and schedulable` must still catch them.
    shifts = {"D12": {"startH": 7, "durationH": 12, "type": "day", "area": "POD"}}
    residents = [make_resident("r1", isEmCore=True, target=None, schedulable=True)]
    eligible = {"r1": {d: ["D12"] for d in _SEVEN_DATES}}
    coverage = {"D12": {d: {"min": 0, "max": 1} for d in _SEVEN_DATES}}
    model, store = _build(residents, shifts, _SEVEN_DATES, eligible, coverage)
    _force_all(model, store, "r1", "D12", _SEVEN_DATES)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_schedulable_defaults_true_for_back_compat():
    # An older JS build that never sends `schedulable` at all must still get capped when is_em_core
    # and eligible for >60h/week -- default True, same as before this field existed.
    shifts = {"D12": {"startH": 7, "durationH": 12, "type": "day", "area": "POD"}}
    residents = [make_resident("r1", isEmCore=True, target=10)]  # no `schedulable` key at all
    eligible = {"r1": {d: ["D12"] for d in _SEVEN_DATES}}
    coverage = {"D12": {d: {"min": 0, "max": 1} for d in _SEVEN_DATES}}
    model, store = _build(residents, shifts, _SEVEN_DATES, eligible, coverage)
    _force_all(model, store, "r1", "D12", _SEVEN_DATES)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"
