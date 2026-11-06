"""Implied clique constraints (solver/model/implied.py): never cut a feasible solution."""

import copy
import itertools

from ortools.sat.python import cp_model

from solver.build import build_model
from solver.io.payload import parse_payload
from solver.solve import solve
from tests.helpers import load_fixture, make_payload, make_resident

_SHIFTS = {
    "D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "E": {"startH": 15, "durationH": 8, "type": "eve", "area": "POD"},
    "N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"},
}


def _with_flag(raw, on):
    raw = copy.deepcopy(raw)
    raw.setdefault("config", {})["impliedCliques"] = on
    return raw


def test_default_off_adds_nothing():
    payload = parse_payload(load_fixture("small_feasible.json"))
    assert payload.config.implied_cliques is False
    assert build_model(payload).implied_cliques == 0


def test_cliques_added_on_rest_conflict_fixture():
    counts = {}
    for name in ("small_feasible.json", "cross_midnight.json"):
        payload = parse_payload(_with_flag(load_fixture(name), True))
        counts[name] = build_model(payload).implied_cliques
    print("implied clique counts:", counts)
    assert max(counts.values()) > 0


def test_same_feasibility_and_objective_on_fixtures():
    for name in ("small_feasible.json", "cross_midnight.json"):
        raw = load_fixture(name)
        off = solve(parse_payload(_with_flag(raw, False)))
        on = solve(parse_payload(_with_flag(raw, True)))
        assert off.status == on.status, name
        if off.status == "OPTIMAL":
            assert off.objective_value == on.objective_value, name


def _status(raw, assignment):
    payload = parse_payload(raw)
    built = build_model(payload)
    for (rid, date), shift in assignment.items():
        for sid in _SHIFTS:
            v = built.store.x.get((rid, sid, date))
            if v is None:
                continue
            built.model.add(v == (1 if sid == shift else 0))
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    solver.parameters.max_time_in_seconds = 10
    return solver.status_name(solver.solve(built.model)) in ("OPTIMAL", "FEASIBLE")


def test_brute_force_feasible_set_identical():
    dates = ["2026-01-05", "2026-01-06", "2026-01-07"]
    raw = make_payload(residents=[make_resident("r1")], shifts=_SHIFTS, dates=dates)
    raw["config"]["numWorkers"] = 1
    raw_on = _with_flag(raw, True)
    assert build_model(parse_payload(raw_on)).implied_cliques > 0
    raw_off = _with_flag(raw, False)
    for combo in itertools.product([None, "D", "E", "N"], repeat=len(dates)):
        assignment = {("r1", d): s for d, s in zip(dates, combo)}
        assert _status(raw_off, assignment) == _status(raw_on, assignment), combo
