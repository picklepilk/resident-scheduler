"""objective.py shift-variety terms (run excess per shift id, pair stacking), mirroring src/lib/variety.js."""

from datetime import date, timedelta

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model import objective as objective_mod
from solver.model.objective import TermGroup
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

SHIFTS = {
    "POD-D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "PED-D": {"startH": 7, "durationH": 9, "type": "day", "area": "PED"},
    "POD-N": {"startH": 21, "durationH": 9, "type": "night", "area": "POD"},
}
W = {"varietyRun": {"perUnit": 150}, "pairStack": {"perUnit": 50}}
PAIR_DAYS = {0: "POD-D", 1: "POD-D", 3: "POD-D", 4: "POD-D", 6: "POD-D", 7: "POD-D"}


def _dates(n):
    d0 = date(2026, 1, 5)
    return [(d0 + timedelta(days=i)).isoformat() for i in range(n)]


def _cost(picks, rids, n=8, run=3, pair=4, em=None):
    """picks: {rid: {dayIndex: shiftId}}. Returns the variety objective with every x pinned."""
    dates = _dates(n)
    residents = [make_resident(r) for r in rids]
    raw = make_payload(
        residents=residents, shifts=SHIFTS, dates=dates,
        eligible={r: {d: list(SHIFTS) for d in dates} for r in rids},
        coverage={s: {d: {"min": 0, "max": 5} for d in dates} for s in SHIFTS},
        settings={"enforceRest": True, "enforceWeekendOff": True,
                  "variety": {"maxSameShiftRun": run, "pairStackDays": pair}},
        emResidentIds=list(rids if em is None else em),
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    for rid in rids:
        for i, d in enumerate(dates):
            for sid in SHIFTS:
                v = store.get_x(rid, sid, d)
                if v is not None:
                    model.add(v == (1 if picks.get(rid, {}).get(i) == sid else 0))
    group = TermGroup("t")
    objective_mod._add_variety_terms(model, payload, store, group, W)
    expr = sum((c * e for c, e in group.terms), start=0)
    model.minimize(expr)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) == "OPTIMAL"
    return int(solver.value(expr))


def test_run_within_limit_is_free():
    assert _cost({"r1": {0: "POD-D", 1: "POD-D", 2: "POD-D"}}, ["r1"]) == 0


def test_run_excess_counts_days_beyond_limit():
    assert _cost({"r1": {i: "POD-D" for i in range(5)}}, ["r1"]) == 2 * 150
    assert _cost({"r1": {0: "POD-D", 1: "POD-D", 2: "POD-D", 3: "PED-D", 4: "POD-D"}}, ["r1"]) == 0
    assert _cost({"r1": {i: "POD-D" for i in range(8)}}, ["r1"]) == 5 * 150


def test_night_runs_exempt():
    assert _cost({"r1": {i: "POD-N" for i in range(6)}}, ["r1"]) == 0


def test_run_term_off_when_zero():
    assert _cost({"r1": {i: "POD-D" for i in range(8)}}, ["r1"], run=0) == 0


def test_pair_stacking_beyond_limit():
    picks = {"r1": PAIR_DAYS, "r2": PAIR_DAYS}
    assert _cost(picks, ["r1", "r2"], run=0) == 2 * 50  # 6 shared days, limit 4
    assert _cost(picks, ["r1", "r2"], run=0, pair=6) == 0


def test_pair_requires_em_and_ignores_nights():
    picks = {"r1": PAIR_DAYS, "r2": PAIR_DAYS}
    assert _cost(picks, ["r1", "r2"], run=0, em=["r1"]) == 0
    nights = {r: {i: "POD-N" for i in range(6)} for r in ("r1", "r2")}
    assert _cost(nights, ["r1", "r2"], n=8, run=0) == 0


def test_report_counts_match_term_pricing():
    from solver.report.variety import compute_variety_report

    dates = _dates(8)
    raw = make_payload(
        residents=[make_resident("r1"), make_resident("r2")], shifts=SHIFTS, dates=dates,
        settings={"enforceRest": True, "enforceWeekendOff": True, "variety": {"maxSameShiftRun": 3, "pairStackDays": 4}},
        emResidentIds=["r1", "r2"],
    )
    payload = parse_payload(raw)
    sched = {r: {dates[i]: "POD-D" for i in range(8)} for r in ("r1", "r2")}
    assert compute_variety_report(payload, sched) == {"runExcess": 10, "pairExcess": 4}
    nights = {r: {dates[i]: "POD-N" for i in range(6)} for r in ("r1", "r2")}
    assert compute_variety_report(payload, nights) == {"runExcess": 0, "pairExcess": 0}
