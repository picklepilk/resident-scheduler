"""Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,
items 2b-1/2b-2): solver/model/em_composition.py's two soft term families --
EM-count composition (podEmComposition/flexEmComposition) and PGY gating
pool-restrict's soft-cost translation (podPgy2Fallback/flexPgy3Fallback).
Follows test_trauma_runs.py's "fix everything except one free choice,
minimize a single term" pattern for steering, plus explicit inert-when-
absent checks (both id-list guards are the whole reason each term is a
documented no-op on an older/unconfigured payload).
"""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.em_composition import add_em_composition_terms, add_pgy_fallback_terms
from solver.model.objective import TermGroup
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

POD_SHIFT = {"POD-D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"}}
FLEX_SHIFT = {"FLEX-D": {"startH": 7, "durationH": 9, "type": "day", "area": "FLEX"}}
POD_FLEX_SHIFTS = {**POD_SHIFT, **FLEX_SHIFT}

# Full weight dict -- both add_em_composition_terms and add_pgy_fallback_terms
# unconditionally look up all four keys before checking whether any shift of
# the relevant area even exists in the payload (see each function's own
# per-area loop), so every test below must supply all four regardless of
# which one it's actually exercising.
WEIGHTS = {
    "podEmComposition": {"perUnit": 600},
    "flexEmComposition": {"perUnit": 600},
    "podPgy2Fallback": {"perUnit": 250},
    "flexPgy3Fallback": {"perUnit": 250},
}


def _build(shifts, eligible, coverage, residents, dates=None, raw_overrides=None):
    dates = dates or ["2026-01-05"]
    raw = make_payload(residents=residents, shifts=shifts, dates=dates, eligible=eligible, coverage=coverage)
    if raw_overrides:
        raw.update(raw_overrides)
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    return payload, model, store


def _cost_of(model, group_terms):
    """Solves for the MINIMUM of the given weighted terms, not just any
    feasible value -- every derived cost var here is only lower-bounded (see
    em_composition.py's own docstring), so a plain feasibility solve with no
    objective could legally report a non-tight value."""
    total_expr = sum((coef * expr for coef, expr in group_terms), start=0)
    model.minimize(total_expr)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    return solver.value(total_expr)


# ---------------------------------------------------------------------------
# inert-when-absent
# ---------------------------------------------------------------------------

def test_em_composition_inert_when_em_resident_ids_absent():
    dates = ["2026-01-05"]
    eligible = {"em1": {dates[0]: ["POD-D"]}, "off1": {dates[0]: ["POD-D"]}}
    coverage = {"POD-D": {dates[0]: {"min": 0, "max": 2}}}
    payload, model, store = _build(
        POD_SHIFT, eligible, coverage, [make_resident("em1"), make_resident("off1")], dates,
        # no emResidentIds override -- defaults to empty
    )
    model.add(store.get_x("em1", "POD-D", dates[0]) == 1)
    model.add(store.get_x("off1", "POD-D", dates[0]) == 1)
    group = TermGroup("t")
    add_em_composition_terms(model, payload, store, group, WEIGHTS)
    assert group.terms == []


def test_pgy_fallback_inert_when_id_lists_absent():
    dates = ["2026-01-05"]
    eligible = {"pgy2": {dates[0]: ["POD-D"]}}
    coverage = {"POD-D": {dates[0]: {"min": 0, "max": 1}}}
    payload, model, store = _build(
        POD_SHIFT, eligible, coverage, [make_resident("pgy2")], dates,
        # no emPgy2ResidentIds/emPgy3ResidentIds override -- defaults to empty
    )
    model.add(store.get_x("pgy2", "POD-D", dates[0]) == 1)
    group = TermGroup("t")
    add_pgy_fallback_terms(model, payload, store, group, WEIGHTS)
    assert group.terms == []


# ---------------------------------------------------------------------------
# 2b-1: EM-count composition
# ---------------------------------------------------------------------------

def test_pod_em_composition_charges_shortfall_at_two_staffed_one_em():
    dates = ["2026-01-05"]
    eligible = {"em1": {dates[0]: ["POD-D"]}, "off1": {dates[0]: ["POD-D"]}}
    coverage = {"POD-D": {dates[0]: {"min": 0, "max": 2}}}
    payload, model, store = _build(
        POD_SHIFT, eligible, coverage, [make_resident("em1"), make_resident("off1")], dates,
        raw_overrides={"emResidentIds": ["em1"]},
    )
    model.add(store.get_x("em1", "POD-D", dates[0]) == 1)
    model.add(store.get_x("off1", "POD-D", dates[0]) == 1)
    group = TermGroup("t")
    add_em_composition_terms(model, payload, store, group, WEIGHTS)
    # staffed at 2, required 2 EM, actual 1 EM -> shortfall 1 * 600
    assert _cost_of(model, group.terms) == 600


def test_pod_em_composition_free_when_both_em_at_two_staffed():
    dates = ["2026-01-05"]
    eligible = {"em1": {dates[0]: ["POD-D"]}, "em2": {dates[0]: ["POD-D"]}}
    coverage = {"POD-D": {dates[0]: {"min": 0, "max": 2}}}
    payload, model, store = _build(
        POD_SHIFT, eligible, coverage, [make_resident("em1"), make_resident("em2")], dates,
        raw_overrides={"emResidentIds": ["em1", "em2"]},
    )
    model.add(store.get_x("em1", "POD-D", dates[0]) == 1)
    model.add(store.get_x("em2", "POD-D", dates[0]) == 1)
    group = TermGroup("t")
    add_em_composition_terms(model, payload, store, group, WEIGHTS)
    assert _cost_of(model, group.terms) == 0


def test_pod_em_composition_free_below_the_two_staffed_threshold():
    # only one resident assigned (staffed at 1) -- POD's own requirement
    # never turns on below 2, regardless of EM status.
    dates = ["2026-01-05"]
    eligible = {"off1": {dates[0]: ["POD-D"]}}
    coverage = {"POD-D": {dates[0]: {"min": 0, "max": 1}}}
    payload, model, store = _build(
        POD_SHIFT, eligible, coverage, [make_resident("off1")], dates,
        raw_overrides={"emResidentIds": ["someone_else"]},
    )
    model.add(store.get_x("off1", "POD-D", dates[0]) == 1)
    group = TermGroup("t")
    add_em_composition_terms(model, payload, store, group, WEIGHTS)
    assert _cost_of(model, group.terms) == 0


def test_flex_em_composition_charges_when_zero_em_at_any_staffing():
    dates = ["2026-01-05"]
    eligible = {"off1": {dates[0]: ["FLEX-D"]}}
    coverage = {"FLEX-D": {dates[0]: {"min": 0, "max": 1}}}
    payload, model, store = _build(
        FLEX_SHIFT, eligible, coverage, [make_resident("off1")], dates,
        raw_overrides={"emResidentIds": ["someone_else"]},
    )
    model.add(store.get_x("off1", "FLEX-D", dates[0]) == 1)
    group = TermGroup("t")
    add_em_composition_terms(model, payload, store, group, WEIGHTS)
    assert _cost_of(model, group.terms) == 600


def test_flex_em_composition_steers_the_free_slot_toward_em():
    dates = ["2026-01-05"]
    eligible = {"em1": {dates[0]: ["FLEX-D"]}, "off1": {dates[0]: ["FLEX-D"]}}
    coverage = {"FLEX-D": {dates[0]: {"min": 0, "max": 1}}}
    payload, model, store = _build(
        FLEX_SHIFT, eligible, coverage, [make_resident("em1"), make_resident("off1")], dates,
        raw_overrides={"emResidentIds": ["em1"]},
    )
    model.add_exactly_one(store.get_x("em1", "FLEX-D", dates[0]), store.get_x("off1", "FLEX-D", dates[0]))
    group = TermGroup("t")
    add_em_composition_terms(model, payload, store, group, WEIGHTS)
    total_expr = sum((coef * expr for coef, expr in group.terms), start=0)
    model.minimize(total_expr)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(store.get_x("em1", "FLEX-D", dates[0])) == 1
    assert solver.value(total_expr) == 0


# ---------------------------------------------------------------------------
# 2b-2: PGY gating fallback soft cost
# ---------------------------------------------------------------------------

def test_pod_pgy2_fallback_charges_per_assignment():
    dates = ["2026-01-05"]
    eligible = {"pgy2": {dates[0]: ["POD-D"]}}
    coverage = {"POD-D": {dates[0]: {"min": 0, "max": 1}}}
    payload, model, store = _build(
        POD_SHIFT, eligible, coverage, [make_resident("pgy2")], dates,
        raw_overrides={"emPgy2ResidentIds": ["pgy2"]},
    )
    model.add(store.get_x("pgy2", "POD-D", dates[0]) == 1)
    group = TermGroup("t")
    add_pgy_fallback_terms(model, payload, store, group, WEIGHTS)
    assert _cost_of(model, group.terms) == 250


def test_flex_pgy3_fallback_charges_per_assignment():
    dates = ["2026-01-05"]
    eligible = {"pgy3": {dates[0]: ["FLEX-D"]}}
    coverage = {"FLEX-D": {dates[0]: {"min": 0, "max": 1}}}
    payload, model, store = _build(
        FLEX_SHIFT, eligible, coverage, [make_resident("pgy3")], dates,
        raw_overrides={"emPgy3ResidentIds": ["pgy3"]},
    )
    model.add(store.get_x("pgy3", "FLEX-D", dates[0]) == 1)
    group = TermGroup("t")
    add_pgy_fallback_terms(model, payload, store, group, WEIGHTS)
    assert _cost_of(model, group.terms) == 250


def test_pod_pgy2_fallback_steers_the_free_slot_away_from_pgy2():
    dates = ["2026-01-05"]
    eligible = {"pgy2": {dates[0]: ["POD-D"]}, "pgy3": {dates[0]: ["POD-D"]}}
    coverage = {"POD-D": {dates[0]: {"min": 0, "max": 1}}}
    payload, model, store = _build(
        POD_SHIFT, eligible, coverage, [make_resident("pgy2"), make_resident("pgy3")], dates,
        raw_overrides={"emPgy2ResidentIds": ["pgy2"]},
    )
    model.add_exactly_one(store.get_x("pgy2", "POD-D", dates[0]), store.get_x("pgy3", "POD-D", dates[0]))
    group = TermGroup("t")
    add_pgy_fallback_terms(model, payload, store, group, WEIGHTS)
    total_expr = sum((coef * expr for coef, expr in group.terms), start=0)
    model.minimize(total_expr)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(model)) in ("OPTIMAL", "FEASIBLE")
    assert solver.value(store.get_x("pgy3", "POD-D", dates[0])) == 1
    assert solver.value(total_expr) == 0


# ---------------------------------------------------------------------------
# both areas wired independently from a shared shift catalog
# ---------------------------------------------------------------------------

def test_pod_and_flex_em_composition_do_not_cross_contaminate():
    dates = ["2026-01-05"]
    eligible = {"off1": {dates[0]: ["POD-D", "FLEX-D"]}}
    coverage = {
        "POD-D": {dates[0]: {"min": 0, "max": 1}},
        "FLEX-D": {dates[0]: {"min": 0, "max": 1}},
    }
    payload, model, store = _build(
        POD_FLEX_SHIFTS, eligible, coverage, [make_resident("off1")], dates,
        raw_overrides={"emResidentIds": ["someone_else"]},
    )
    model.add(store.get_x("off1", "FLEX-D", dates[0]) == 1)
    model.add(store.get_x("off1", "POD-D", dates[0]) == 0)
    group = TermGroup("t")
    add_em_composition_terms(model, payload, store, group, WEIGHTS)
    # POD stays below its 2-staffed threshold (0 assigned) -- only FLEX's
    # any-staffing-needs-1-EM rule should fire.
    assert _cost_of(model, group.terms) == 600
