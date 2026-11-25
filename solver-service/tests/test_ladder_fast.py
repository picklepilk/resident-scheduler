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


# ---- rankStallSeconds (round 2): end TIER_RANK early while the hint is still the floor ----

RANK_STALL = 3.5


class _FakeStall:
    """Replaces solver.solve.StallStop: records thresholds; the stage run with the rank threshold reports fired."""
    log: list = []

    def __init__(self, solver, threshold, clock=None):
        self.threshold = float(threshold)
        self.fired = False
        _FakeStall.log.append(self)

    def on_solution(self, cb):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.fired = self.threshold == RANK_STALL
        return False


def _run_fake(monkeypatch, raw):
    import solver.solve as S
    _FakeStall.log = []
    monkeypatch.setattr(S, "StallStop", _FakeStall)
    raw["config"]["stallSeconds"] = 0  # normal stall off: only the rank rule may create a threshold
    return solve(parse_payload(raw))


def _baseline_budgets(max_time):
    from solver.solve import _stage_time_budgets
    p = parse_payload(_raw({"skipZeroStages": False}, max_time=max_time))
    return dict(zip(_STAGE_NAMES, _stage_time_budgets(p)))


def test_rank_stall_off_changes_nothing(monkeypatch):
    res = _run_fake(monkeypatch, _raw({"skipZeroStages": False}, max_time=20))
    assert all(s.threshold == 0.0 for s in _FakeStall.log)
    assert all("stalled" not in s for s in res.report["timing"]["stages"])


def test_rank_stall_ends_rank_stage_and_rolls_budget(monkeypatch):
    from solver.model.objective import TIER_RANK
    res = _run_fake(monkeypatch, _raw({"skipZeroStages": False, "rankStallSeconds": RANK_STALL}, max_time=20))
    rows = {s["name"]: s for s in res.report["timing"]["stages"]}
    assert [n for n, r in rows.items() if r.get("stalled")] == [TIER_RANK]
    assert [s.threshold for s in _FakeStall.log].count(RANK_STALL) == 1
    stages = {r["name"]: r for r in res.report["stages"]}
    assert stages[TIER_RANK]["stalled"] is True
    names = list(_STAGE_NAMES)
    after = names[names.index(TIER_RANK) + 1]
    base = _baseline_budgets(20)
    # next stage budget = its own share + RANK's unused time (the small model solves in well under a second)
    assert stages[after]["budgetSeconds"] > base[after] + 0.5 * base[TIER_RANK]
    assert stages[TIER_RANK]["seconds"] < 0.5 * base[TIER_RANK]


def test_rank_stall_not_applied_without_hint(monkeypatch):
    res = _run_fake(monkeypatch, _raw({"rankStallSeconds": RANK_STALL}, hint=False, max_time=20))
    assert all(s.threshold == 0.0 for s in _FakeStall.log)
    assert all("stalled" not in s for s in res.report["timing"]["stages"])


def test_rank_stall_not_applied_with_infeasible_hint(monkeypatch):
    raw = _raw({"skipZeroStages": False, "rankStallSeconds": RANK_STALL}, max_time=20)
    # both residents on D every date (max 1): infeasible hint
    raw["hint"] = [{"residentId": r, "date": d, "shiftId": "D"} for r in ("r1", "r2") for d in raw["block"]["dates"]]
    res = _run_fake(monkeypatch, raw)
    assert res.report.get("hintPinning", {}).get("hintFeasible") is False
    assert all(s.threshold == 0.0 for s in _FakeStall.log)
