"""Batch 2 (chief round-2 plan, "Confirmed rule changes" A/B/C): trauma-run
hard cap plus every soft term in solver/model/trauma_runs.py, and the
`isolatedNight`-relaxed night-shape term in objective.py. Follows the same
tiny-fixture-plus-forced-x pattern as test_circadian.py/test_count_caps.py
for hard rules, and a "fix everything except one free choice, minimize a
single term" pattern for soft-term steering.
"""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model import objective as objective_mod
from solver.model import trauma_runs as trauma_runs_mod
from solver.model.circadian import add_circadian_constraints
from solver.model.objective import TermGroup
from solver.model.trauma_runs import (
    add_night_duration_alternation_terms,
    add_peds_intern_night_deficit_term,
    add_second_rest_day_terms,
    add_trauma_mid_run_terms,
    add_trauma_run_hard_cap,
    add_trauma_second_in_run_terms,
)
from solver.model.variables import build_variables
from solver.model.workday_limits import add_workday_limit_constraints
from solver.solve import solve
from tests.helpers import load_fixture, make_payload, make_resident

TRAUMA_SHIFTS = {
    "TRAUMA-N": {"startH": 21, "durationH": 9, "type": "night", "area": "TRAUMA"},
    "N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"},
}


def _dates(n, start_day=5):
    return [f"2026-01-{start_day + i:02d}" for i in range(n)]


def _build(dates, shifts, eligible, coverage, residents, raw_overrides=None):
    """Fully-linked tiny model: night (circadian), work (workday_limits), and
    trauma (trauma_runs' own hard cap) are all real linking constraints, not
    free-floating vars -- every soft-term test below depends on that being
    true, or the solver could trivially dodge a penalty by just setting the
    derived indicator to whatever's cheapest instead of what the forced x's
    actually mean."""
    raw = make_payload(residents=residents, shifts=shifts, dates=dates, eligible=eligible, coverage=coverage)
    if raw_overrides:
        raw.update(raw_overrides)
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)
    add_workday_limit_constraints(model, payload, store)
    add_trauma_run_hard_cap(model, payload, store)
    return payload, model, store


# ---------------------------------------------------------------------------
# hard cap
# ---------------------------------------------------------------------------

def test_hard_cap_forbids_a_third_trauma_night_in_one_run():
    dates = _dates(5)
    eligible = {"r1": {d: ["TRAUMA-N", "N"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    _, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage,
        [make_resident("r1", caps={"nights": 6})],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    model.add(store.get_x("r1", "TRAUMA-N", dates[0]) == 1)
    model.add(store.get_x("r1", "TRAUMA-N", dates[1]) == 1)
    model.add(store.get_x("r1", "N", dates[2]) == 1)          # keeps the run continuous, not trauma
    model.add(store.get_x("r1", "TRAUMA-N", dates[3]) == 1)   # 3rd trauma night in the same run
    model.add(store.get_x("r1", "N", dates[4]) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_hard_cap_allows_exactly_two_trauma_nights_in_one_run():
    dates = _dates(5)
    eligible = {"r1": {d: ["TRAUMA-N", "N"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    _, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage,
        [make_resident("r1", caps={"nights": 6})],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    model.add(store.get_x("r1", "TRAUMA-N", dates[0]) == 1)
    model.add(store.get_x("r1", "TRAUMA-N", dates[1]) == 1)
    model.add(store.get_x("r1", "N", dates[2]) == 1)
    model.add(store.get_x("r1", "N", dates[3]) == 1)
    model.add(store.get_x("r1", "N", dates[4]) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_hard_cap_allows_two_trauma_nights_each_in_separate_runs():
    # run 1: days 0-1 (2 trauma), rest day (no shift at all -- not eligible),
    # run 2: days 3-4 (2 trauma). 4 trauma total in the block, but never more
    # than 2 in any ONE run -- must stay feasible.
    dates = _dates(5)
    eligible = {"r1": {d: ["TRAUMA-N"] for d in dates if d != dates[2]}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    _, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage,
        [make_resident("r1", caps={"nights": 6})],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    model.add(store.get_x("r1", "TRAUMA-N", dates[0]) == 1)
    model.add(store.get_x("r1", "TRAUMA-N", dates[1]) == 1)
    model.add(store.get_x("r1", "TRAUMA-N", dates[3]) == 1)
    model.add(store.get_x("r1", "TRAUMA-N", dates[4]) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


# ---------------------------------------------------------------------------
# soft: traumaSecondInRun
# ---------------------------------------------------------------------------

def _cost_of(model, store, group_terms):
    """Solves for the MINIMUM of the given weighted terms, not just any
    feasible value -- every derived cost var in trauma_runs.py is only
    lower-bounded (see that module's docstring), so a plain feasibility
    solve with no objective could legally report a non-tight value for a
    var this test expects to read as exactly 0."""
    total_expr = sum((coef * expr for coef, expr in group_terms), start=0)
    model.minimize(total_expr)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    return solver.value(total_expr)


def test_trauma_second_in_run_fires_once_for_a_two_trauma_run():
    dates = _dates(3)
    eligible = {"r1": {d: ["TRAUMA-N", "N"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    payload, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage,
        [make_resident("r1", caps={"nights": 6})],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    model.add(store.get_x("r1", "TRAUMA-N", dates[0]) == 1)
    model.add(store.get_x("r1", "N", dates[1]) == 1)
    model.add(store.get_x("r1", "TRAUMA-N", dates[2]) == 1)

    group = TermGroup("t")
    add_trauma_second_in_run_terms(model, payload, store, group, coef=1000)
    assert _cost_of(model, store, group.terms) == 1000


def test_trauma_second_in_run_is_free_with_only_one_trauma_night():
    dates = _dates(3)
    eligible = {"r1": {d: ["TRAUMA-N", "N"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    payload, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage,
        [make_resident("r1", caps={"nights": 6})],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    model.add(store.get_x("r1", "TRAUMA-N", dates[0]) == 1)
    model.add(store.get_x("r1", "N", dates[1]) == 1)
    model.add(store.get_x("r1", "N", dates[2]) == 1)

    group = TermGroup("t")
    add_trauma_second_in_run_terms(model, payload, store, group, coef=1000)
    assert _cost_of(model, store, group.terms) == 0


# ---------------------------------------------------------------------------
# soft: traumaMidRun -- steers a free choice to the run's edge
# ---------------------------------------------------------------------------

def test_trauma_mid_run_steers_the_free_night_away_from_trauma():
    dates = _dates(3)
    eligible = {"r1": {d: ["TRAUMA-N", "N"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    payload, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage,
        [make_resident("r1", caps={"nights": 6})],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    # day0 and day2 (the run's edges) are non-trauma nights, fixed.
    model.add(store.get_x("r1", "N", dates[0]) == 1)
    model.add(store.get_x("r1", "N", dates[2]) == 1)
    # day1 (strictly interior) is a FREE choice: TRAUMA-N or N.
    model.add_exactly_one(store.get_x("r1", "TRAUMA-N", dates[1]), store.get_x("r1", "N", dates[1]))

    group = TermGroup("t")
    add_trauma_mid_run_terms(model, payload, store, group, coef=1000)
    total_expr = sum((coef * expr for coef, expr in group.terms), start=0)
    model.minimize(total_expr)

    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(store.get_x("r1", "TRAUMA-N", dates[1])) == 0
    assert solver.value(store.get_x("r1", "N", dates[1])) == 1
    assert solver.value(total_expr) == 0


def test_trauma_mid_run_is_free_at_the_edge_of_a_run():
    # day0 is the FIRST night of the run (a neighbor -- day "-1" -- doesn't
    # exist), so even a trauma night there must be free of the mid-run cost.
    dates = _dates(2)
    eligible = {"r1": {d: ["TRAUMA-N", "N"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    payload, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage,
        [make_resident("r1", caps={"nights": 6})],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    model.add(store.get_x("r1", "TRAUMA-N", dates[0]) == 1)
    model.add(store.get_x("r1", "N", dates[1]) == 1)

    group = TermGroup("t")
    add_trauma_mid_run_terms(model, payload, store, group, coef=1000)
    assert _cost_of(model, store, group.terms) == 0


# ---------------------------------------------------------------------------
# soft: nightDurationAlternation -- steers a free choice toward same duration
# ---------------------------------------------------------------------------

ALT_SHIFTS = {
    "N8": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"},
    "N9": {"startH": 21, "durationH": 9, "type": "night", "area": "MT"},
}


def _build_alt(dates, raw_overrides=None):
    eligible = {"r1": {d: ["N8", "N9"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in ALT_SHIFTS}
    raw = make_payload(
        residents=[make_resident("r1", caps={"nights": 6})], shifts=ALT_SHIFTS, dates=dates,
        eligible=eligible, coverage=coverage,
    )
    if raw_overrides:
        raw.update(raw_overrides)
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)
    return payload, model, store


def test_night_duration_alternation_steers_toward_matching_duration():
    dates = _dates(2)
    payload, model, store = _build_alt(dates)
    model.add(store.get_x("r1", "N8", dates[0]) == 1)
    model.add_exactly_one(store.get_x("r1", "N8", dates[1]), store.get_x("r1", "N9", dates[1]))

    group = TermGroup("t")
    add_night_duration_alternation_terms(model, payload, store, group, coef=1000)
    total_expr = sum((coef * expr for coef, expr in group.terms), start=0)
    model.minimize(total_expr)

    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(store.get_x("r1", "N8", dates[1])) == 1  # matches day0's duration, no penalty
    assert solver.value(total_expr) == 0


def test_night_duration_alternation_penalizes_a_forced_mismatch():
    dates = _dates(2)
    payload, model, store = _build_alt(dates)
    model.add(store.get_x("r1", "N8", dates[0]) == 1)
    model.add(store.get_x("r1", "N9", dates[1]) == 1)

    group = TermGroup("t")
    add_night_duration_alternation_terms(model, payload, store, group, coef=1000)
    assert _cost_of(model, store, group.terms) == 1000


def test_night_duration_alternation_exempt_date_is_free_despite_mismatch():
    dates = _dates(2)
    payload, model, store = _build_alt(dates, raw_overrides={"alternationExemptDates": [dates[1]]})
    model.add(store.get_x("r1", "N8", dates[0]) == 1)
    model.add(store.get_x("r1", "N9", dates[1]) == 1)

    group = TermGroup("t")
    add_night_duration_alternation_terms(model, payload, store, group, coef=1000)
    assert _cost_of(model, store, group.terms) == 0


# ---------------------------------------------------------------------------
# soft: secondRestDay
# ---------------------------------------------------------------------------

REST_SHIFTS = {
    "N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"},
    "D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
}


def _build_rest(dates, day4_shift_ids):
    eligible = {"r1": {d: ["N"] for d in dates[:3]}}
    eligible["r1"][dates[4]] = day4_shift_ids
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in REST_SHIFTS}
    raw = make_payload(
        residents=[make_resident("r1", caps={"nights": 6})], shifts=REST_SHIFTS, dates=dates,
        eligible=eligible, coverage=coverage,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)
    add_workday_limit_constraints(model, payload, store)
    for d in dates[:3]:
        model.add(store.get_x("r1", "N", d) == 1)  # 3-night run, ends at dates[2]
    return payload, model, store


def test_second_rest_day_penalizes_working_two_days_after_a_three_night_run():
    dates = _dates(5)
    payload, model, store = _build_rest(dates, day4_shift_ids=["D"])
    model.add(store.get_x("r1", "D", dates[4]) == 1)  # dates[4] = run-end(dates[2]) + 2

    group = TermGroup("t")
    add_second_rest_day_terms(model, payload, store, group, coef=1000)
    assert _cost_of(model, store, group.terms) == 1000


def test_second_rest_day_is_free_when_the_second_rest_day_is_actually_off():
    dates = _dates(5)
    payload, model, store = _build_rest(dates, day4_shift_ids=[])
    # nothing eligible on dates[4] -- resident can't be scheduled there at all.

    group = TermGroup("t")
    add_second_rest_day_terms(model, payload, store, group, coef=1000)
    assert _cost_of(model, store, group.terms) == 0


# ---------------------------------------------------------------------------
# soft: pedsInternNightDeficit -- pulls assignment toward the target
# ---------------------------------------------------------------------------

PEDS_SHIFTS = {"PED-N": {"startH": 19, "durationH": 9, "type": "night", "area": "PED"}}


def test_peds_intern_night_deficit_pulls_assignment_toward_target():
    dates = _dates(3)
    eligible = {"r1": {d: ["PED-N"] for d in dates}}
    coverage = {"PED-N": {d: {"min": 0, "max": 1} for d in dates}}
    raw = make_payload(
        residents=[make_resident("r1", caps={"nights": 6})], shifts=PEDS_SHIFTS, dates=dates,
        eligible=eligible, coverage=coverage,
        pedsSplitInternIds=["r1"], pedsNightShiftIds=["PED-N"], pedsInternNightTarget=5,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)

    group = TermGroup("t")
    add_peds_intern_night_deficit_term(model, payload, store, group, coef=100)
    total_expr = sum((coef * expr for coef, expr in group.terms), start=0)
    model.minimize(total_expr)

    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
    for d in dates:
        assert solver.value(store.get_x("r1", "PED-N", d)) == 1  # every available night taken
    assert solver.value(total_expr) == 100 * (5 - 3)  # still short of the target=5 ceiling


def test_peds_intern_night_deficit_inert_when_resident_not_in_the_list():
    dates = _dates(3)
    eligible = {"r1": {d: ["PED-N"] for d in dates}}
    coverage = {"PED-N": {d: {"min": 0, "max": 1} for d in dates}}
    raw = make_payload(
        residents=[make_resident("r1")], shifts=PEDS_SHIFTS, dates=dates,
        eligible=eligible, coverage=coverage,
        pedsSplitInternIds=[], pedsNightShiftIds=["PED-N"], pedsInternNightTarget=5,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)

    group = TermGroup("t")
    add_peds_intern_night_deficit_term(model, payload, store, group, coef=100)
    assert group.terms == []


# ---------------------------------------------------------------------------
# soft: isolatedNight (objective.py, renamed/relaxed from nightShape)
# ---------------------------------------------------------------------------

ISO_WEIGHTS = {"isolatedNight": {"perUnit": 100}}


def _build_iso(dates, night_dates):
    eligible = {"r1": {d: ["N"] for d in night_dates}}
    coverage = {"N": {d: {"min": 0, "max": 1} for d in dates}}
    raw = make_payload(
        residents=[make_resident("r1", caps={"nights": 6})], shifts={"N": REST_SHIFTS["N"]}, dates=dates,
        eligible=eligible, coverage=coverage,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)
    for d in night_dates:
        model.add(store.get_x("r1", "N", d) == 1)
    return payload, model, store


def test_isolated_single_night_is_penalized():
    dates = _dates(4)
    payload, model, store = _build_iso(dates, [dates[1]])

    group = TermGroup("t")
    objective_mod._add_isolated_night_term(model, payload, store, group, ISO_WEIGHTS)
    assert _cost_of(model, store, group.terms) == 100


def test_two_night_run_is_not_penalized():
    dates = _dates(4)
    payload, model, store = _build_iso(dates, [dates[1], dates[2]])

    group = TermGroup("t")
    objective_mod._add_isolated_night_term(model, payload, store, group, ISO_WEIGHTS)
    assert _cost_of(model, store, group.terms) == 0


# ---------------------------------------------------------------------------
# full pipeline: batch-2 fields flow through build -> solve -> validate ->
# report without crashing, exactly like a real (bigger) production payload
# would carry them alongside every other rule family.
# ---------------------------------------------------------------------------

def test_full_solve_with_batch2_fields_populated_end_to_end():
    raw = load_fixture("small_feasible.json")
    raw["traumaNightShiftIds"] = ["N"]
    raw["pedsSplitInternIds"] = ["r1"]
    raw["pedsNightShiftIds"] = ["N"]
    raw["pedsInternNightTarget"] = 2
    raw["alternationExemptDates"] = ["2026-01-07"]

    payload = parse_payload(raw)
    result = solve(payload)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.validation["passed"] is True
    assert result.validation["failures"] == []


def test_full_solve_unaffected_when_batch2_fields_absent():
    """The exact pre-batch-2 fixture, byte-identical -- confirms the five new
    optional fields default to fully inert and never change a payload that
    doesn't send them."""
    raw = load_fixture("small_feasible.json")
    payload = parse_payload(raw)
    assert payload.trauma_night_shift_ids == frozenset()
    assert payload.peds_split_intern_ids == frozenset()
    assert payload.peds_intern_night_target == 0

    result = solve(payload)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.validation["passed"] is True


# ---------------------------------------------------------------------------
# structural-impossibility pruning (perf): on a real roster only a minority
# of residents are ever eligible for TRAUMA-N, yet every window/soft-term
# loop in this module used to iterate ALL residents regardless. Every skip
# added is provably safe (the term it would have generated is a python
# constant 0, not a preference or heuristic) -- these tests prove that two
# ways: (1) the skip actually fires (helper returns empty / group stays
# empty) exactly where the underlying assignment is structurally impossible,
# and (2) right at the boundary the skip uses (exactly 3 trauma-possible
# dates in a hard-cap window, an endpoint that IS trauma-possible, a
# resident who IS trauma-eligible elsewhere in the block), the pruned code
# still emits the constraint/term and still catches a real violation -- so
# the boundary itself, not just the empty-set fast path, is exercised.
# ---------------------------------------------------------------------------

def test_trauma_possible_indices_empty_when_never_eligible_for_trauma():
    dates = _dates(4)
    eligible = {"r1": {d: ["N"] for d in dates}}  # TRAUMA-N never offered at all
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    payload, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage,
        [make_resident("r1", caps={"nights": 6})],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    resident = payload.resident("r1")
    assert trauma_runs_mod._trauma_possible_indices(payload, store, resident) == frozenset()


def test_trauma_possible_indices_includes_a_trauma_shift_in_the_prior_tail():
    dates = _dates(3)  # starts 2026-01-05
    tail_date = "2026-01-04"  # the last of the 14 prior-tail dates
    eligible = {"r1": {d: ["TRAUMA-N", "N"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    resident_raw = make_resident("r1", caps={"nights": 6}, priorTail={tail_date: "TRAUMA-N"})
    payload, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage, [resident_raw],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    resident = payload.resident("r1")
    tail_idx = payload.all_dates.index(tail_date)
    assert tail_idx in trauma_runs_mod._trauma_possible_indices(payload, store, resident)


def test_hard_cap_still_forbids_three_trauma_nights_when_exactly_three_positions_are_possible():
    """Boundary for the '<3 trauma-possible positions -> skip the window'
    rule: a resident eligible for TRAUMA-N on EXACTLY the 3 dates of one
    window (count == 3, the smallest count the skip must NOT fire for) must
    still be caught working all 3 as trauma nights."""
    dates = _dates(3)
    eligible = {"r1": {d: ["TRAUMA-N", "N"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    _, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage,
        [make_resident("r1", caps={"nights": 6})],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    model.add(store.get_x("r1", "TRAUMA-N", dates[0]) == 1)
    model.add(store.get_x("r1", "TRAUMA-N", dates[1]) == 1)
    model.add(store.get_x("r1", "TRAUMA-N", dates[2]) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) == "INFEASIBLE"


def test_hard_cap_emits_no_window_constraint_when_only_two_positions_are_possible():
    """Boundary the OTHER direction: a resident eligible for TRAUMA-N on
    only 2 dates (nowhere else) can never reach a 3rd trauma night in any
    run by construction. Confirms both that the '<3 possible' skip actually
    fires (zero window constraints added, only `_link_trauma`'s per-date
    linking equalities survive) AND that nothing is over-constrained --
    working both eligible dates as TRAUMA-N stays feasible."""
    dates = _dates(3)
    eligible = {"r1": {dates[0]: ["TRAUMA-N", "N"], dates[1]: ["TRAUMA-N", "N"], dates[2]: ["N"]}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    raw = make_payload(
        residents=[make_resident("r1", caps={"nights": 6})], shifts=TRAUMA_SHIFTS, dates=dates,
        eligible=eligible, coverage=coverage, traumaNightShiftIds=["TRAUMA-N"],
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)
    add_workday_limit_constraints(model, payload, store)

    resident = payload.resident("r1")
    assert len(trauma_runs_mod._trauma_possible_indices(payload, store, resident)) == 2

    n_before = len(model.proto.constraints)
    add_trauma_run_hard_cap(model, payload, store)
    added = len(model.proto.constraints) - n_before
    assert added == len(dates)  # only _link_trauma's per-date equalities -- no window constraints

    model.add(store.get_x("r1", "TRAUMA-N", dates[0]) == 1)
    model.add(store.get_x("r1", "TRAUMA-N", dates[1]) == 1)
    model.add(store.get_x("r1", "N", dates[2]) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")


def test_second_in_run_stays_inert_when_one_endpoint_is_never_trauma_eligible():
    """Both candidate (a,b) pairs here have at least one endpoint where
    TRAUMA-N was never offered at all (structurally impossible, not just
    'chose N instead') -- the AND term must stay fully suppressed, proving
    the endpoint-index skip fires rather than merely happening to cost 0."""
    dates = _dates(3)
    eligible = {
        "r1": {
            dates[0]: ["TRAUMA-N", "N"],
            dates[1]: ["N"],  # TRAUMA-N never offered here
            dates[2]: ["N"],  # nor here
        }
    }
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    payload, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage,
        [make_resident("r1", caps={"nights": 6})],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    model.add(store.get_x("r1", "TRAUMA-N", dates[0]) == 1)
    model.add(store.get_x("r1", "N", dates[1]) == 1)
    model.add(store.get_x("r1", "N", dates[2]) == 1)

    group = TermGroup("t")
    add_trauma_second_in_run_terms(model, payload, store, group, coef=1000)
    assert group.terms == []


def test_mid_run_stays_inert_when_the_middle_date_is_never_trauma_eligible():
    """Resident IS trauma-eligible elsewhere in the block (dates[3]), so the
    coarse per-resident skip must NOT fire -- proves the finer per-position
    skip inside add_trauma_mid_run_terms is what suppresses this term for
    the interior dates where TRAUMA-N was never offered."""
    dates = _dates(4)
    eligible = {
        "r1": {
            dates[0]: ["N"],
            dates[1]: ["N"],                 # candidate mid date -- TRAUMA-N never offered
            dates[2]: ["N"],
            dates[3]: ["TRAUMA-N", "N"],      # trauma-eligible ELSEWHERE in the block
        }
    }
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in TRAUMA_SHIFTS}
    payload, model, store = _build(
        dates, TRAUMA_SHIFTS, eligible, coverage,
        [make_resident("r1", caps={"nights": 6})],
        raw_overrides={"traumaNightShiftIds": ["TRAUMA-N"]},
    )
    model.add(store.get_x("r1", "N", dates[0]) == 1)
    model.add(store.get_x("r1", "N", dates[1]) == 1)
    model.add(store.get_x("r1", "N", dates[2]) == 1)
    model.add(store.get_x("r1", "N", dates[3]) == 1)

    resident = payload.resident("r1")
    assert trauma_runs_mod._trauma_possible_indices(payload, store, resident)  # non-empty

    group = TermGroup("t")
    add_trauma_mid_run_terms(model, payload, store, group, coef=1000)
    # The only candidate mid-positions with a known idx+1 are dates[0..2]
    # (dates[3] is the block's last date -- no idx+1 in range); none of them
    # is ever trauma-eligible, so the group stays empty even though the
    # resident overall IS trauma-eligible.
    assert group.terms == []


def test_night_possible_indices_empty_when_never_night_eligible():
    dates = _dates(3)
    day_only_shifts = {"D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"}}
    eligible = {"r1": {d: ["D"] for d in dates}}
    coverage = {"D": {d: {"min": 0, "max": 1} for d in dates}}
    raw = make_payload(
        residents=[make_resident("r1")], shifts=day_only_shifts, dates=dates,
        eligible=eligible, coverage=coverage,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    resident = payload.resident("r1")
    assert trauma_runs_mod._night_possible_indices(payload, store, resident) == frozenset()


def test_alternation_stays_inert_for_a_resident_with_zero_night_eligibility():
    dates = _dates(2)
    day_only_shifts = {"D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"}}
    shifts = {**ALT_SHIFTS, **day_only_shifts}
    eligible = {"r1": {d: ["D"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in shifts}
    raw = make_payload(
        residents=[make_resident("r1")], shifts=shifts, dates=dates,
        eligible=eligible, coverage=coverage,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)
    model.add(store.get_x("r1", "D", dates[0]) == 1)
    model.add(store.get_x("r1", "D", dates[1]) == 1)

    group = TermGroup("t")
    add_night_duration_alternation_terms(model, payload, store, group, coef=1000)
    assert group.terms == []


def test_second_rest_day_stays_inert_for_a_resident_with_zero_night_eligibility():
    dates = _dates(5)
    eligible = {"r1": {d: ["D"] for d in dates}}
    coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in REST_SHIFTS}
    raw = make_payload(
        residents=[make_resident("r1", caps={"nights": 6})], shifts=REST_SHIFTS, dates=dates,
        eligible=eligible, coverage=coverage,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)
    add_workday_limit_constraints(model, payload, store)
    for d in dates:
        model.add(store.get_x("r1", "D", d) == 1)

    group = TermGroup("t")
    add_second_rest_day_terms(model, payload, store, group, coef=1000)
    assert group.terms == []
