"""2026-11-23 (owner): the EM PGY-2/3 per-block trauma cap (`caps.trauma`, TRAUMA-D + TRAUMA-N) is SOFT, matching the
app's non-blocking "cap is 2/block" warning. Hard in the solver before; now a penalised excess (`traumaCapExcess`,
TIER_QUALITY), reported in `report.traumaCapExcess`. The per-night-run limit stays hard. Synthetic ids only."""

from __future__ import annotations

import json
import os

from ortools.sat.python import cp_model

from solver.build import build_model
from solver.io.payload import parse_payload
from solver.model.hint_pin import evaluate_hint, hint_violations
from solver.model.objective import load_default_weights
from solver.report.trauma_cap import compute_trauma_cap_excess
from solver.solve import solve
from solver.validate import validate_schedule
from tests.helpers import make_payload, make_resident

SHIFTS = {
    "TRAUMA-D": {"startH": 7, "durationH": 9, "type": "day", "area": "TRAUMA"},
    "TRAUMA-N": {"startH": 21, "durationH": 9, "type": "night", "area": "TRAUMA"},
    "N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"},
}
DATES = [f"2026-01-{5 + i:02d}" for i in range(5)]


def _raw(residents, eligible, min_cov=1, shifts=None, dates=DATES, **kw):
    shifts = shifts or {"TRAUMA-D": SHIFTS["TRAUMA-D"]}
    coverage = {sid: {d: {"min": min_cov if sid == "TRAUMA-D" else 0, "max": 1} for d in dates} for sid in shifts}
    return make_payload(residents=residents, shifts=shifts, dates=dates, eligible=eligible, coverage=coverage, **kw)


def test_weight_loads_and_is_above_second_in_run():
    w = load_default_weights()
    assert w["traumaCapExcess"]["perUnit"] == 600
    assert w["traumaCapExcess"]["perUnit"] > w["traumaSecondInRun"]["perUnit"]


def test_hint_with_three_trauma_shifts_evaluates_feasible_and_keeps_floor():
    dates = DATES[:3]
    raw = _raw(
        [make_resident("r1", caps={"trauma": 2}, isEmCore=True)],
        {"r1": {d: ["TRAUMA-D"] for d in dates}}, dates=dates,
    )
    raw["hint"] = [{"residentId": "r1", "date": d, "shiftId": "TRAUMA-D"} for d in dates]
    payload = parse_payload(raw)
    assert hint_violations(payload) == ([], set())
    ev = evaluate_hint(payload, build_model(payload))
    assert ev.feasible
    assert ev.tiers  # hint floor inputs present
    result = solve(payload)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.report["hintPinning"]["applied"] is True
    # coverage min 1 each date, only r1 eligible: all three trauma shifts stay (hint is the optimum)
    assert sum(1 for s in result.schedule["r1"].values() if s == "TRAUMA-D") == 3
    assert result.report["traumaCapExcess"] == [{"residentId": "r1", "count": 3, "cap": 2}]


def test_prefers_two_when_equal_alternative_exists():
    dates = DATES[:3]
    residents = [make_resident("r1", caps={"trauma": 2}), make_resident("r2")]
    elig = {r: {d: ["TRAUMA-D"] for d in dates} for r in ("r1", "r2")}
    result = solve(parse_payload(_raw(residents, elig, dates=dates)))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert sum(1 for s in result.schedule.get("r1", {}).values() if s == "TRAUMA-D") <= 2
    assert result.report["traumaCapExcess"] == []
    assert sum(len(v) for v in result.schedule.values()) == 3  # coverage still met


def test_uses_third_when_only_way_to_fill_coverage_minimum():
    dates = DATES[:3]
    elig = {"r1": {d: ["TRAUMA-D"] for d in dates}}
    result = solve(parse_payload(_raw([make_resident("r1", caps={"trauma": 2})], elig, dates=dates)))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.mode == "strict"
    assert len(result.schedule["r1"]) == 3
    assert result.report["traumaCapExcess"] == [{"residentId": "r1", "count": 3, "cap": 2}]


def test_locked_trauma_above_cap_is_strict_not_relaxed():
    dates = DATES[:2]
    raw = _raw([make_resident("r1", caps={"trauma": 1})], {"r1": {d: ["TRAUMA-D"] for d in dates}}, dates=dates)
    raw["locked"] = [{"residentId": "r1", "date": d, "shiftId": "TRAUMA-D"} for d in dates]
    result = solve(parse_payload(raw))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.mode == "strict"
    assert result.report["traumaCapExcess"] == [{"residentId": "r1", "count": 2, "cap": 1}]


def test_per_night_run_limit_stays_hard_even_with_soft_cap():
    shifts = {"TRAUMA-N": SHIFTS["TRAUMA-N"], "N": SHIFTS["N"]}
    elig = {"r1": {d: ["TRAUMA-N", "N"] for d in DATES}}
    raw = _raw([make_resident("r1", caps={"nights": 6, "trauma": 5})], elig, shifts=shifts, traumaNightShiftIds=["TRAUMA-N"])
    payload = parse_payload(raw)
    br = build_model(payload)
    store = br.store
    for d, sid in zip(DATES, ["TRAUMA-N", "TRAUMA-N", "N", "TRAUMA-N", "N"]):
        br.model.add(store.get_x("r1", sid, d) == 1)
    solver = cp_model.CpSolver()
    assert solver.status_name(solver.solve(br.model)) == "INFEASIBLE"


def test_validate_no_longer_reports_trauma_cap_but_report_does():
    dates = DATES[:3]
    payload = parse_payload(_raw(
        [make_resident("r1", caps={"trauma": 1})], {"r1": {d: ["TRAUMA-D"] for d in dates}}, dates=dates,
    ))
    schedule = {"r1": {d: "TRAUMA-D" for d in dates}}
    assert not any(f["rule"] == "traumaCap" for f in validate_schedule(payload, schedule))
    assert compute_trauma_cap_excess(payload, schedule) == [{"residentId": "r1", "count": 3, "cap": 1}]
    assert compute_trauma_cap_excess(payload, {"r1": {dates[0]: "TRAUMA-D"}}) == []


def test_score_mode_prices_soft_cap_breach_instead_of_infeasible():
    dates = DATES[:3]
    raw = _raw([make_resident("r1", caps={"trauma": 1})], {"r1": {d: ["TRAUMA-D"] for d in dates}}, dates=dates)
    raw["hint"] = [{"residentId": "r1", "date": d, "shiftId": "TRAUMA-D"} for d in dates]
    raw["config"].update({"mode": "score", "numWorkers": 1, "maxTimeSeconds": 10})
    scored = solve(parse_payload(raw))
    assert scored.status == "SCORED"
    assert scored.report["score"]["feasible"] is True
    assert scored.report["traumaCapExcess"] == [{"residentId": "r1", "count": 3, "cap": 1}]
    assert scored.tiers["tier4_quality"] >= 2 * 600  # 2 excess shifts


def test_weights_file_is_valid_json_with_positive_ints():
    here = os.path.dirname(os.path.dirname(__file__))
    with open(os.path.join(here, "config", "default_weights.json"), encoding="utf-8") as fh:
        data = json.load(fh)
    assert isinstance(data["traumaCapExcess"]["perUnit"], int) and data["traumaCapExcess"]["perUnit"] > 0
