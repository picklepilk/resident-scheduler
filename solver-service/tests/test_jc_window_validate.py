"""validate.py / report builder must honour the payload's JC window, not a hard-coded 18-21."""

from __future__ import annotations

from solver.io.payload import parse_payload
from solver.report.builder import _assigned_count_for_cap
from solver.validate import validate_schedule
from tests.helpers import make_payload, make_resident

DATES = ["2026-01-05", "2026-01-06"]
SCHEDULE = {"r1": {d: "D" for d in DATES}}  # D = 07:00-16:00: overlaps 10-12, not 18-21


def _payload(**window):
    return parse_payload(make_payload(
        residents=[make_resident("r1", caps={"jcRemaining": 1})],
        dates=DATES,
        eligible={"r1": {d: ["D"] for d in DATES}},
        jcDates=DATES,
        **window,
    ))


def test_custom_jc_window_counts_in_validate_and_report():
    p = _payload(jcWindowStartH=10, jcWindowEndH=12)
    assert any(f["rule"] == "jcCap" for f in validate_schedule(p, SCHEDULE))
    assert _assigned_count_for_cap(p, SCHEDULE, "r1", "jcCap") == 2


def test_default_jc_window_unchanged():
    p = _payload()
    assert not any(f["rule"] == "jcCap" for f in validate_schedule(p, SCHEDULE))
    assert _assigned_count_for_cap(p, SCHEDULE, "r1", "jcCap") == 0
