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


def test_payload_to_raw_round_trips_inputs_the_rebuild_dropped():
    from solver.report.builder import payload_to_raw

    raw = make_payload(
        residents=[make_resident("r1")],
        dates=DATES,
        eligible={"r1": {d: ["D"] for d in DATES}},
        jcWindowStartH=10,
        jcWindowEndH=12,
        alternationExemptDates=[DATES[0]],
        truePrimary={"x": ["r1"]},
        emResidentIds=["r1"],
    )
    p = parse_payload(raw)
    rebuilt = payload_to_raw(p)
    assert rebuilt == raw
    assert rebuilt is not p.raw  # deep copy: edits must not leak back into the payload
    p2 = parse_payload(rebuilt)
    assert p2.jc_window_start_h == 10 and p2.jc_window_end_h == 12
    assert p2.alternation_exempt_dates == p.alternation_exempt_dates
    assert p2.true_primary == p.true_primary
    assert p2.em_resident_ids == p.em_resident_ids == frozenset({"r1"})
