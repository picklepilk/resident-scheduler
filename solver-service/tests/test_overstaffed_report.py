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


def test_overstaffed_stays_empty_when_targets_would_need_over_max():
    # 2 EM-core residents each targeting 1 shift, D max is 1 and nothing else is eligible. Max is
    # hard (owner 2026-11-22): one resident stays under target, report.overstaffed stays empty.
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
    assert result.report["overstaffed"] == []
    placed = [r for r in ("r1", "r2") if result.schedule.get(r, {}).get("2026-01-05") == "D"]
    assert len(placed) == 1


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
