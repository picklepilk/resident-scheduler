"""Chief decision: ranking follows Soft Rule Priority. With the default order
(coverageMin before postNightRest) a coverage slot may be filled even if it costs a
postNightRest violation; with postNightRest ranked first the rest rule wins and the slot is
left open. Also pins the objective-tier placement of the rest term in each order.
"""

from __future__ import annotations

from solver.build import build_model
from solver.io.payload import parse_payload
from solver.model.objective import (
    TIER_BLOCKING,
    TIER_REST,
    rest_outranks_coverage,
)
from solver.solve import solve
from tests.helpers import BASE_SHIFTS, make_payload, make_resident

D1, D2 = "2026-01-05", "2026-01-06"
DEFAULT_PRIORITY = ["coverageMin", "seniorComposition", "postNightRest"]
REST_FIRST = ["postNightRest", "coverageMin", "seniorComposition"]


def _payload(priority):
    dates = [D1, D2]
    coverage = {
        "D": {d: {"min": 0, "max": 0} for d in dates},
        "N": {D1: {"min": 1, "max": 1}, D2: {"min": 0, "max": 0}},
        "E": {D1: {"min": 0, "max": 0}, D2: {"min": 1, "max": 1}},
    }
    # ONE resident: night on day 1 then the day-2 evening is a postNightRest violation (gap well
    # under 24h) but legal under the hard rest rules -- the only way to staff both slots.
    raw = make_payload(
        residents=[make_resident("r1")], dates=dates, coverage=coverage,
        rulePriority=priority,
    )
    raw["shifts"] = {k: dict(v) for k, v in BASE_SHIFTS.items()}
    return parse_payload(raw)


def test_rest_outranks_coverage_semantics():
    assert rest_outranks_coverage(REST_FIRST) is True
    assert rest_outranks_coverage(DEFAULT_PRIORITY) is False
    # missing / invalid / partial -> default (coverage first)
    for bad in ([], None, ["postNightRest"], ["coverageMin"], ["x"], ["postNightRest", "x"]):
        assert rest_outranks_coverage(bad) is False


def test_rest_term_lives_in_rest_tier_by_default_and_blocking_tier_when_rest_first():
    default = build_model(_payload(DEFAULT_PRIORITY)).objective
    assert default.stage_exprs[TIER_BLOCKING] == 0
    assert not isinstance(default.stage_exprs[TIER_REST], int)

    rest_first = build_model(_payload(REST_FIRST)).objective
    assert rest_first.stage_exprs[TIER_REST] == 0
    assert not isinstance(rest_first.stage_exprs[TIER_BLOCKING], int)


def test_default_priority_fills_the_slot_despite_short_rest():
    result = solve(_payload(DEFAULT_PRIORITY))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.schedule["r1"] == {D1: "N", D2: "E"}
    assert result.tiers["tier3_qualityRank"] == 0       # coverage fully met
    assert result.tiers[TIER_REST] > 0                   # at the price of a rest violation


def test_rest_first_priority_leaves_the_slot_open():
    result = solve(_payload(REST_FIRST))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    # One of the two slots stays open (which one is a tie); never both staffed.
    assert len(result.schedule["r1"]) == 1
    assert result.tiers[TIER_BLOCKING] == 0
    assert result.tiers["tier3_qualityRank"] > 0         # the open slot
