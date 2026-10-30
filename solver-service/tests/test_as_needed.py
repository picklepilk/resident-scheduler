"""asNeeded cells (program decision 2026-10-30): a day-rule gate flagged `asNeeded` withholds shifts from
`eligible`; the JS side ships them in a separate top-level `asNeeded` list. The solver merges them into
`eligible` at parse time, charges `asNeededUse.perUnit` per use in TIER_RANK, only lets one fill a coverage
MINIMUM (coverage.py link), and keeps every hard constraint binding for them.
"""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model import objective as objective_mod
from solver.model.objective import TermGroup, load_default_weights
from solver.model.variables import build_variables
from solver.solve import solve
from tests.helpers import make_payload, make_resident

DATES = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"]
SHIFTS = {
    "D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"},
}


def _payload(r1_dates=DATES, intern_kwargs=None, cov=None, locked=(), as_needed_dates=DATES, weights=None):
    """r1 = normal resident eligible for D on `r1_dates`; r2 = intern with NO strict eligibility whose D
    cells on `as_needed_dates` are as-needed."""
    r2_kwargs = dict(intern_kwargs or {})
    raw = make_payload(
        residents=[make_resident("r1"), make_resident("r2", **r2_kwargs)],
        shifts=SHIFTS, dates=DATES,
        eligible={"r1": {d: ["D"] for d in r1_dates}, "r2": {}},
        coverage={"D": {d: dict(cov or {"min": 1, "max": 1}) for d in DATES}},
        asNeeded=[{"residentId": "r2", "date": d, "shiftId": "D"} for d in as_needed_dates],
        locked=[{"residentId": a, "date": d, "shiftId": s} for a, d, s in locked],
    )
    if weights:
        raw["config"]["weights"] = weights
    return raw


def _r2_days(result):
    return sorted(d for d, s in result.schedule.get("r2", {}).items() if s)


def test_parse_merges_as_needed_into_eligible_and_absent_is_empty():
    p = parse_payload(_payload())
    assert ("r2", DATES[0], "D") in p.as_needed
    assert p.is_eligible("r2", DATES[0], "D")
    assert parse_payload(make_payload()).as_needed == frozenset()


def test_not_used_when_a_strictly_eligible_resident_can_fill_the_minimum():
    result = solve(parse_payload(_payload()))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert _r2_days(result) == []
    assert result.report["unfilled"] == []


def test_used_only_for_the_day_nothing_else_can_fill():
    gap = DATES[2]
    result = solve(parse_payload(_payload(r1_dates=[d for d in DATES if d != gap])))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert _r2_days(result) == [gap]
    assert result.report["unfilled"] == []


def test_never_used_to_top_up_past_the_minimum():
    """min 1 / max 2: r1 fills the minimum; the as-needed intern must not ride along into the headroom."""
    result = solve(parse_payload(_payload(cov={"min": 1, "max": 2})))
    assert _r2_days(result) == []


def test_not_recruited_to_bring_an_under_target_resident_up_to_target():
    """A core resident under target would normally be pulled toward any available cell (errors tier).
    As-needed cells are excluded from the deficit count, so the intern is not recruited just for that."""
    result = solve(parse_payload(_payload(intern_kwargs={"target": 3, "isEmCore": True}, cov={"min": 1, "max": 2})))
    assert _r2_days(result) == []


def test_hard_constraints_still_bind_an_as_needed_cell():
    """r2 works N on day 1 (locked); D on day 2 would break rest, so the as-needed D cell stays unusable
    and the slot is left unfilled rather than the rule broken."""
    d1, d2 = DATES[0], DATES[1]
    raw = _payload(r1_dates=[d for d in DATES if d != d2], as_needed_dates=[d2], locked=[("r2", d1, "N")])
    raw["eligible"]["r2"] = {d1: ["N"]}
    raw["coverage"]["N"] = {d: {"min": 0, "max": 1} for d in DATES}
    result = solve(parse_payload(raw))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.schedule["r2"].get(d2) != "D"
    assert any(u["dateStr"] == d2 and u["shiftId"] == "D" for u in result.report["unfilled"])


def test_a_locked_as_needed_cell_over_the_minimum_does_not_make_the_model_infeasible():
    result = solve(parse_payload(_payload(cov={"min": 1, "max": 2}, locked=[("r2", DATES[0], "D")])))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.schedule["r2"][DATES[0]] == "D"


def test_penalty_term_charges_each_as_needed_cell_at_the_default_weight():
    payload = parse_payload(_payload())
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    group = TermGroup("t")
    objective_mod._add_as_needed_term(payload, store, group, load_default_weights())
    assert len(group.terms) == len(DATES)
    assert {coef for coef, _ in group.terms} == {20000}
    # no as-needed cells -> no terms
    empty = TermGroup("e")
    objective_mod._add_as_needed_term(parse_payload(make_payload()), build_variables(cp_model.CpModel(), parse_payload(make_payload())), empty, load_default_weights())
    assert empty.terms == []


def test_default_weight_sits_between_coverage_and_every_target_deficit_weight():
    w = load_default_weights()
    unit = w["asNeededUse"]["perUnit"]
    assert unit > 0
    assert unit < w["coverageMin"]["perSlack"]            # a coverage minimum is always worth one as-needed use
    assert unit > w["targetDeficit"]["perUnit"]           # never worth it just to cut a non-core deficit
    assert unit > w["targetDeficitCore"]["perUnit"]       # ...nor a core one
    assert unit > max(w["fairness"].values())             # ...nor fairness/shape
