"""report.shortlist (solver/shortlist.py): N best distinct strict incumbents from pass 1."""

from __future__ import annotations

from solver.io.payload import parse_payload
from solver.solve import _STAGE_NAMES, solve
from solver.validate import validate_schedule
from tests.helpers import load_fixture


def _payload(size, seconds=6):
    raw = load_fixture("small_feasible.json")
    raw["config"].update({"shortlistSize": size, "maxTimeSeconds": seconds, "numWorkers": 1})
    return parse_payload(raw)


def _cells(schedule):
    return frozenset((r, d, s) for r, days in schedule.items() for d, s in days.items())


def test_shortlist_off_by_default():
    result = solve(_payload(0, seconds=3))
    assert not result.report.get("shortlist")


def test_shortlist_shape_validity_and_ordering():
    payload = _payload(3)
    result = solve(payload)
    sl = result.report["shortlist"]
    assert isinstance(sl, list) and len(sl) <= 3
    seen = {_cells(result.schedule)}
    keys = []
    for entry in sl:
        assert set(entry) == {"schedule", "tiers", "unfilled", "underTarget"}
        assert isinstance(entry["unfilled"], list) and isinstance(entry["underTarget"], list)
        c = _cells(entry["schedule"])
        assert c not in seen  # distinct and excludes the winner
        seen.add(c)
        assert validate_schedule(payload, entry["schedule"]) == []
        keys.append(tuple(entry["tiers"][n] for n in _STAGE_NAMES))
    assert keys == sorted(keys)
    assert sl, "fixture should yield at least one alternative"
    assert keys[0] >= tuple(result.tiers[n] for n in _STAGE_NAMES)
