"""Night-run fragmentation (avoidable vs forced), objective.py's
`_add_night_fragment_term` -- closes the gap docs/PAYLOAD_SCHEMA.md's
"Night-stint contiguity preference" section (2026-10-14) explicitly deferred.
Mirrors scheduleQuality.js's `nightShapePenalty` fragmentation charge
("AVOIDABLE vs FORCED fragmentation" comment in that file) exactly. Follows
the same tiny-fixture-plus-forced-x pattern as test_trauma_runs.py's own
isolatedNight tests (`_build_iso`/`_cost_of`).
"""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model import objective as objective_mod
from solver.model.circadian import add_circadian_constraints, NIGHT_RUN_MAX
from solver.model.objective import TermGroup
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

FRAG_WEIGHTS = {"nightFragment": {"avoidableCost": 115, "forcedCost": 100}}

REST_SHIFT = {"N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"}}


def _dates(n, start_day=5):
    return [f"2026-01-{start_day + i:02d}" for i in range(n)]


def _cost_of(model, store, group_terms):
    """Solves for the MINIMUM of the given weighted terms (every derived var
    here is only lower-bounded by its defining constraints), not just any
    feasible value -- same discipline as test_trauma_runs.py's own
    `_cost_of`."""
    total_expr = sum((coef * expr for coef, expr in group_terms), start=0)
    model.minimize(total_expr)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
    return solver.value(total_expr)


def _build(dates, night_dates, caps_nights=10, night_exempt=False):
    """Fully-linked tiny model: `night[r,d]` is real (circadian's own link),
    and `r1` is ONLY eligible for "N" on the exact dates in `night_dates` --
    no candidate shift exists for any other date, so the solver has no
    freedom to add or remove nights beyond what's forced below (same trick
    test_trauma_runs.py's `_build_iso` uses)."""
    eligible = {"r1": {d: ["N"] for d in night_dates}}
    coverage = {"N": {d: {"min": 0, "max": 1} for d in dates}}
    raw = make_payload(
        residents=[make_resident("r1", caps={"nights": caps_nights}, nightExempt=night_exempt)],
        shifts=REST_SHIFT, dates=dates, eligible=eligible, coverage=coverage,
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)
    for d in night_dates:
        model.add(store.get_x("r1", "N", d) == 1)
    return payload, model, store


def test_single_contiguous_run_costs_nothing():
    """One run, however long, is never fragmented -- 0 extra interior runs."""
    dates = _dates(7)
    night_dates = dates[1:5]  # one run, length 4, interior (doesn't touch edges)
    payload, model, store = _build(dates, night_dates)

    group = TermGroup("t")
    objective_mod._add_night_fragment_term(model, payload, store, group, FRAG_WEIGHTS)
    assert _cost_of(model, store, group.terms) == 0


def test_avoidable_split_is_penalized_at_avoidable_cost():
    """Two interior runs (len 2 + len 2 == 4 total nights <= NIGHT_RUN_MAX)
    -- everything could have fit in one run, so the split is AVOIDABLE."""
    dates = _dates(7)
    night_dates = [dates[1], dates[2], dates[4], dates[5]]  # runs at [1,2] and [4,5], both interior
    payload, model, store = _build(dates, night_dates)
    assert sum(1 for d in night_dates) <= NIGHT_RUN_MAX  # sanity: this fixture IS the avoidable case

    group = TermGroup("t")
    objective_mod._add_night_fragment_term(model, payload, store, group, FRAG_WEIGHTS)
    assert _cost_of(model, store, group.terms) == FRAG_WEIGHTS["nightFragment"]["avoidableCost"]


def test_forced_split_is_penalized_at_forced_cost():
    """Two interior runs totalling MORE nights than NIGHT_RUN_MAX (6) could
    ever hold in one run -- the split is structurally FORCED, cheaper per
    extra run than the avoidable case."""
    dates = _dates(11)
    night_dates = dates[1:5] + dates[6:9]  # runs [1..4] (len4) + [6..8] (len3) == 7 total nights > 6
    payload, model, store = _build(dates, night_dates, caps_nights=10)
    assert len(night_dates) > NIGHT_RUN_MAX  # sanity: this fixture IS the forced case

    group = TermGroup("t")
    objective_mod._add_night_fragment_term(model, payload, store, group, FRAG_WEIGHTS)
    assert _cost_of(model, store, group.terms) == FRAG_WEIGHTS["nightFragment"]["forcedCost"]


def test_edge_touching_run_is_not_counted_as_fragmentation():
    """A run touching the block's FIRST date is exempt (may continue from
    the adjacent block) -- only the genuinely interior 2nd run counts, so
    there's exactly 1 countable interior run here, not 2, and the cost is 0."""
    dates = _dates(6)
    night_dates = [dates[0], dates[1], dates[3], dates[4]]  # run [0,1] touches the left edge; run [3,4] interior
    payload, model, store = _build(dates, night_dates)

    group = TermGroup("t")
    objective_mod._add_night_fragment_term(model, payload, store, group, FRAG_WEIGHTS)
    assert _cost_of(model, store, group.terms) == 0


def test_night_exempt_resident_is_skipped():
    dates = _dates(7)
    night_dates = [dates[1], dates[2], dates[4], dates[5]]  # same as the avoidable-split fixture
    payload, model, store = _build(dates, night_dates, night_exempt=True)

    group = TermGroup("t")
    objective_mod._add_night_fragment_term(model, payload, store, group, FRAG_WEIGHTS)
    assert _cost_of(model, store, group.terms) == 0


def test_zero_weights_add_nothing():
    dates = _dates(7)
    night_dates = [dates[1], dates[2], dates[4], dates[5]]
    payload, model, store = _build(dates, night_dates)

    group = TermGroup("t")
    objective_mod._add_night_fragment_term(
        model, payload, store, group, {"nightFragment": {"avoidableCost": 0, "forcedCost": 0}}
    )
    assert group.terms == []
