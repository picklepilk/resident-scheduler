from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.circadian import add_circadian_constraints
from solver.model.variables import build_variables
from solver.model.workday_limits import add_workday_limit_constraints
from tests.helpers import make_payload, make_resident

_SHIFTS = {
    "D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "N": {"startH": 23, "durationH": 9, "type": "night", "area": "POD"},
}


def _build(dates, eligible, coverage, obligations=None, residents=None, obligations_exempt_after_night=None):
    raw = make_payload(
        residents=residents or [make_resident("r1")], shifts=_SHIFTS, dates=dates,
        eligible=eligible, coverage=coverage, obligations=obligations or {},
        obligationsExemptAfterNight=obligations_exempt_after_night or {},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    # circadian.py owns the `night[r,d]` link workday_limits.py's own GR-after-night exemption
    # reads (_obligation_term) -- both are always added together in the real model (build.py), and
    # the exemption tests below need `night` actually tied to the resident's own x vars rather than
    # floating free.
    add_circadian_constraints(model, payload, store)
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


# ── GR-after-night exemption as a model decision (R9 follow-up, 2026-09-27) ─
# Mirrors ResidentScheduler.jsx's isStreakWorkDay: an `obligations` date that's
# ALSO in `obligationsExemptAfterNight` (own GR weekday -- never JC, see
# Payload.obligations_exempt_after_night's own docstring) only counts as
# worked when the resident did NOT work a night-type shift the calendar day
# immediately before. Reified against the model's own `night[r, d-1]` decision
# var (workday_limits.py's `_obligation_term`), not a static payload fact, so
# it can never go stale relative to whatever the solver itself places there.

def test_gr_day_after_a_night_not_counted_as_workday():
    dates = ["2026-01-05", "2026-01-06"]  # d0: night shift, d1: GR obligation (exempt)
    eligible = {"r1": {dates[0]: ["N"], dates[1]: ["D"]}}
    coverage = {"N": {dates[0]: {"min": 0, "max": 1}}, "D": {dates[1]: {"min": 0, "max": 1}}}
    _, model, store = _build(
        dates, eligible, coverage,
        obligations={"r1": [dates[1]]}, obligations_exempt_after_night={"r1": [dates[1]]},
    )
    model.add(store.get_x("r1", "N", dates[0]) == 1)
    model.add(store.get_x("r1", "D", dates[1]) == 0)  # no shift on the GR day itself
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(store.work[("r1", dates[1])]) == 0


def test_gr_day_without_a_night_before_still_counted_as_workday():
    dates = ["2026-01-05", "2026-01-06"]  # d0: day shift (not night), d1: GR obligation (exempt)
    eligible = {"r1": {dates[0]: ["D"], dates[1]: ["D"]}}
    coverage = {"D": {d: {"min": 0, "max": 1} for d in dates}}
    _, model, store = _build(
        dates, eligible, coverage,
        obligations={"r1": [dates[1]]}, obligations_exempt_after_night={"r1": [dates[1]]},
    )
    model.add(store.get_x("r1", "D", dates[0]) == 1)
    model.add(store.get_x("r1", "D", dates[1]) == 0)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(store.work[("r1", dates[1])]) == 1


def test_obligation_without_exempt_flag_counts_even_after_a_night():
    # Same shape as the first test above, but the obligation date is NOT in
    # obligationsExemptAfterNight (mirrors a JC presenting date, which
    # isStreakWorkDay never exempts) -- must count as worked regardless of
    # what happened the day before.
    dates = ["2026-01-05", "2026-01-06"]
    eligible = {"r1": {dates[0]: ["N"], dates[1]: ["D"]}}
    coverage = {"N": {dates[0]: {"min": 0, "max": 1}}, "D": {dates[1]: {"min": 0, "max": 1}}}
    _, model, store = _build(
        dates, eligible, coverage, obligations={"r1": [dates[1]]},
    )
    model.add(store.get_x("r1", "N", dates[0]) == 1)
    model.add(store.get_x("r1", "D", dates[1]) == 0)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(store.work[("r1", dates[1])]) == 1


def test_exemption_lets_solver_legally_place_a_pattern_js_allows():
    # 7 calendar days: d0-d3 day shifts, d4 a night shift, d5 a shift-less GR
    # obligation (exempt) the day right after that night, d6 a day shift.
    # Without the exemption this is 7 consecutive workdays (d0..d6, since d5
    # would count as obligated) -- infeasible under the 6-day cap. With the
    # exemption reified against d4's actual night placement, d5 legitimately
    # drops out of the run (mirrors isStreakWorkDay/JS's own validateAll,
    # which raises zero sixConsecutiveWorkDays issues for exactly this shape).
    dates = [f"2026-01-{5 + i:02d}" for i in range(7)]
    eligible = {"r1": {d: ["D"] for d in dates}}
    eligible["r1"][dates[4]] = ["N"]
    coverage = {"D": {d: {"min": 0, "max": 1} for d in dates}, "N": {dates[4]: {"min": 0, "max": 1}}}
    del coverage["D"][dates[4]]
    del eligible["r1"][dates[5]]  # no shift eligible/assignable on the GR day itself
    _, model, store = _build(
        dates, eligible, coverage,
        obligations={"r1": [dates[5]]}, obligations_exempt_after_night={"r1": [dates[5]]},
    )
    for d in dates[:4]:
        model.add(store.get_x("r1", "D", d) == 1)
    model.add(store.get_x("r1", "N", dates[4]) == 1)
    model.add(store.get_x("r1", "D", dates[6]) == 1)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(store.work[("r1", dates[5])]) == 0


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
