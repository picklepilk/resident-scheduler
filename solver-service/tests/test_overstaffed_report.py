"""Gap fix: solver over-max placements used to be invisible in the response
-- `solve.py`'s `_build_report` hardcoded no `overstaffed` key at all, and
`mapSolverResult` (ResidentScheduler.jsx) hardcoded `repairs: []`, so a
solver +1-over-max placement (the `overstaff` BoolVar in
`solver/model/coverage.py`, mirroring the JS repair pass's Phase 5
`underTargetOverstaff`) never showed up in `GenerationReportCard`. See
docs/PAYLOAD_SCHEMA.md's known-gaps section.

`_build_report` now aggregates `objective.coverage_overstaff` into a
`report["overstaffed"]` list of `{shiftId, dateStr, count, max}` -- one entry
per (shift,date) pair that actually spent the allowance, `count` always
`max + 1` since the BoolVar only ever allows exactly +1 (coverage.py's own
docstring). The JS side (`mapSolverResult`) re-expands this aggregate into
the app's own per-placement `report.overstaffed` shape.
"""

from __future__ import annotations

from solver.io.payload import parse_payload
from solver.solve import solve
from tests.helpers import make_payload, make_resident


def test_overstaffed_is_empty_when_nothing_was_overstaffed():
    raw = make_payload(
        residents=[make_resident("r1", isEmCore=True, target=1)],
        dates=["2026-01-05"],
        eligible={"r1": {"2026-01-05": ["D"]}},
        coverage={"D": {"2026-01-05": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    result = solve(payload)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.report["overstaffed"] == []


def test_overstaffed_reports_the_shift_date_count_and_max_when_the_allowance_is_spent():
    # 2 EM-core residents, both targeting 1 shift, but D's own coverage max is 1 that date and
    # there is no OTHER shift either resident is eligible for -- the only way to hit both targets
    # is to spend the +1-over-max allowance once on D/2026-01-05.
    raw = make_payload(
        residents=[
            make_resident("r1", isEmCore=True, target=1),
            make_resident("r2", isEmCore=True, target=1),
        ],
        dates=["2026-01-05"],
        eligible={"r1": {"2026-01-05": ["D"]}, "r2": {"2026-01-05": ["D"]}},
        coverage={"D": {"2026-01-05": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    result = solve(payload)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.report["overstaffed"] == [
        {"shiftId": "D", "dateStr": "2026-01-05", "count": 2, "max": 1}
    ]
    # Both residents actually landed on D that date (the model's only way to hit both targets).
    assert result.schedule["r1"]["2026-01-05"] == "D"
    assert result.schedule["r2"]["2026-01-05"] == "D"


def test_overstaffed_key_present_and_empty_on_an_infeasible_strict_result():
    # A payload with zero eligible shifts anywhere still produces a solvable (if empty) strict
    # result -- `_empty_report`'s shape is only exercised on a genuine INFEASIBLE, which this isn't,
    # but asserting the key exists either way guards the response contract.
    raw = make_payload(
        residents=[make_resident("r1")],
        dates=["2026-01-05"],
        eligible={"r1": {}},
        coverage={"D": {"2026-01-05": {"min": 0, "max": 1}}},
    )
    payload = parse_payload(raw)
    result = solve(payload)
    assert "overstaffed" in result.report
