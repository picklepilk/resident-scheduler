"""config.ladder (2026-11-23): skipZeroStages and qualityStageSeconds. Defaults ON since 2026-11-24 (owner, bench base4)."""

from __future__ import annotations

from solver.io.payload import parse_payload
from solver.model.objective import TIER_QUALITY
from solver.solve import _STAGE_NAMES, solve
from tests.helpers import load_fixture


def _raw(ladder=None, hint=True, outer=False, max_time=6):
    raw = load_fixture("small_feasible.json")
    dates = raw["block"]["dates"]
    if hint:
        raw["hint"] = [{"residentId": "r1", "date": d, "shiftId": "D"} for d in dates[:3]]
        raw["hint"] += [{"residentId": "r2", "date": d, "shiftId": "D"} for d in dates[3:]]
    raw["config"].update({"numWorkers": 1, "maxTimeSeconds": max_time, "randomSeed": 1,
                          "outerLns": {"enabled": outer, "fraction": 0.5, "subSolveSeconds": 1}})
    if ladder is not None:
        raw["config"]["ladder"] = ladder
    return raw


def _skipped(result):
    return [s["name"] for s in result.report["timing"]["stages"] if s["skipped"] == "hintZero"]


def test_config_defaults_and_garbage():
    # Defaults ON since 2026-11-24; garbage falls back to the defaults; only explicit false / null turns them off.
    c = parse_payload(_raw()).config.ladder
    assert c.skip_zero_stages is True and c.quality_stage_seconds == 20.0
    c = parse_payload(_raw(ladder={"skipZeroStages": 1, "qualityStageSeconds": "x"})).config.ladder
    assert c.skip_zero_stages is True and c.quality_stage_seconds == 20.0
    c = parse_payload(_raw(ladder={"skipZeroStages": False, "qualityStageSeconds": None})).config.ladder
    assert c.skip_zero_stages is False and c.quality_stage_seconds is None
    c = parse_payload(_raw(ladder={"skipZeroStages": True, "qualityStageSeconds": 2})).config.ladder
    assert c.skip_zero_stages is True and c.quality_stage_seconds == 2.0


def test_zero_stage_skipped_unless_flag_off():
    off = solve(parse_payload(_raw({"skipZeroStages": False})))
    assert _skipped(off) == []
    on = solve(parse_payload(_raw()))
    skipped = _skipped(on)
    assert skipped and TIER_QUALITY not in skipped
    rows = {r["name"]: r for r in on.report["stages"]}
    for name in skipped:
        assert rows[name]["status"] == "SKIPPED"
    assert on.status in ("OPTIMAL", "FEASIBLE")
    assert tuple(on.tiers[n] for n in _STAGE_NAMES) <= tuple(off.tiers[n] for n in _STAGE_NAMES)


def test_no_skip_without_hint():
    res = solve(parse_payload(_raw({"skipZeroStages": True}, hint=False)))
    assert _skipped(res) == []


def test_quality_stage_capped_when_outer_lns_enabled():
    res = solve(parse_payload(_raw({"qualityStageSeconds": 0.2}, outer=True, max_time=8)))
    row = [r for r in res.report["stages"] if r["name"] == TIER_QUALITY][0]
    assert row["budgetSeconds"] <= 0.2 + 1e-6
    assert res.report["timing"]["lnsSeconds"] >= 0
    assert "outerLns" in res.report


def test_quality_cap_ignored_without_outer_lns_and_when_null():
    for ladder, outer in (({"qualityStageSeconds": 0.2}, False), ({"qualityStageSeconds": None}, True)):
        res = solve(parse_payload(_raw(ladder, outer=outer, max_time=8)))
        row = [r for r in res.report["stages"] if r["name"] == TIER_QUALITY][0]
        assert row["budgetSeconds"] > 0.2
