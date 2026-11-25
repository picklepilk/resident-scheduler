"""config.outerLns.subStallAdaptive: the sub-solve stall rule switches itself off on a polished grid (2026-11-25)."""

from __future__ import annotations

import time

from solver.io.payload import parse_payload
from solver.lns_outer import SUB_STALL_WINDOW, StallRuleGate, parse_outer_lns
from solver.model.objective import TIER_QUALITY
from tests.helpers import make_payload
from tests.test_outer_lns_stall import _go, _no_worse, _payload_only


def test_parse_defaults():
    c = parse_outer_lns({})
    assert c.sub_stall_adaptive is False
    assert (c.sub_stall_off_below, c.sub_stall_on_at) == (0.45, 0.60)
    assert parse_outer_lns(None).sub_stall_adaptive is False


def test_parse_adaptive_strict_bool():
    assert parse_outer_lns({"subStallAdaptive": True}).sub_stall_adaptive is True
    for bad in (1, "true", "yes", [True], None, 0):
        assert parse_outer_lns({"subStallAdaptive": bad}).sub_stall_adaptive is False


def test_parse_thresholds_clamp_and_order():
    c = parse_outer_lns({"subStallOffBelow": -3, "subStallOnAt": 9})
    assert (c.sub_stall_off_below, c.sub_stall_on_at) == (0.0, 1.0)
    c = parse_outer_lns({"subStallOffBelow": 0.8, "subStallOnAt": 0.5})
    assert c.sub_stall_off_below == 0.8 and c.sub_stall_on_at == 0.8  # raised to offBelow
    c = parse_outer_lns({"subStallOffBelow": "junk", "subStallOnAt": float("nan")})
    assert (c.sub_stall_off_below, c.sub_stall_on_at) == (0.45, 0.60)
    c = parse_outer_lns({"subStallOffBelow": 0.7})  # default onAt 0.6 < 0.7 -> raised
    assert c.sub_stall_on_at == 0.7


def test_values_reach_parsed_payload():
    p = parse_payload(make_payload(config={"outerLns": {
        "subStallSeconds": 2, "subStallAdaptive": True, "subStallOffBelow": 0.3, "subStallOnAt": 0.7}}))
    c = p.config.outer_lns
    assert c.sub_stall_seconds == 2.0 and c.sub_stall_adaptive is True
    assert (c.sub_stall_off_below, c.sub_stall_on_at) == (0.3, 0.7)


def _feed(g, wins, losses):
    for won in [True] * wins + [False] * losses:
        g.record(won)
        g.end_batch()


def test_gate_stays_on_when_wins_high_enough():
    g = StallRuleGate(0.45, 0.60)
    for i in range(SUB_STALL_WINDOW * 3):
        g.record(i % 2 == 0)  # 50% >= 0.45
        g.end_batch()
    assert g.on and g.switches == 0


def test_gate_fewer_than_window_never_switches():
    g = StallRuleGate(0.45, 0.60)
    for _ in range(SUB_STALL_WINDOW - 1):
        g.record(False)
        g.end_batch()
    assert g.on and g.switches == 0
    g.record(False)
    g.end_batch()
    assert not g.on and g.switches == 1


def test_gate_off_then_back_on_needs_fresh_window():
    g = StallRuleGate(0.45, 0.60)
    _feed(g, 0, SUB_STALL_WINDOW)
    assert not g.on and g.switches == 1 and len(g.window) == 0  # window cleared on switch
    # Wins alone do not switch until a full fresh window exists.
    for _ in range(SUB_STALL_WINDOW - 1):
        g.record(True)
        g.end_batch()
    assert not g.on
    g.record(True)
    g.end_batch()
    assert g.on and g.switches == 2 and len(g.window) == 0


def test_gate_hysteresis_between_thresholds_holds_state():
    g = StallRuleGate(0.45, 0.60)
    _feed(g, 0, SUB_STALL_WINDOW)
    assert not g.on
    # 50% (6/12) is >= offBelow but < onAt: stays off.
    for i in range(SUB_STALL_WINDOW * 2):
        g.record(i % 2 == 0)
        g.end_batch()
    assert not g.on and g.switches == 1


def test_gate_switches_only_at_batch_end():
    g = StallRuleGate(0.45, 0.60)
    for _ in range(SUB_STALL_WINDOW + 3):
        g.record(False)  # a whole oversized batch recorded, no end_batch yet
    assert g.on
    g.end_batch()
    assert not g.on and g.switches == 1 and len(g.window) == 0


def test_off_has_no_report_or_rule_keys():
    rep, before, after = _go(None, budget=3.0, cap=1.0)
    assert "subStallAdaptive" not in rep
    assert all("rule" not in r for r in rep["steps"])
    rep, _, _ = _go(0.3, budget=3.0, cap=1.0)  # stall on, adaptive off
    assert "subStallAdaptive" not in rep
    assert all("rule" not in r for r in rep["steps"])


def _go_adaptive(parallel=1, budget=5.0, cap=1.5, **kw):
    from solver.lns_outer import run_outer_lns
    from solver.solve import _STAGE_NAMES, _configure_solver
    from tests.test_outer_lns_stall import _setup
    payload, br, s = _setup()
    before = {n: round(s.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES}
    best, rep = run_outer_lns(
        payload, br, s, _STAGE_NAMES, TIER_QUALITY, lambda: _configure_solver(payload, allow_repair_hint=False),
        deadline=time.time() + budget, sub_solve_seconds=cap, seed=7, parallel=parallel,
        sub_stall_seconds=0.3, sub_stall_adaptive=True, **kw)
    after = {n: round(best.value(br.objective.stage_exprs[n])) for n in _STAGE_NAMES}
    return rep, before, after


def test_real_run_reports_adaptive():
    rep, before, after = _go_adaptive()
    a = rep["subStallAdaptive"]
    assert a["stepsOn"] + a["stepsOff"] == rep["iterations"] == len(rep["steps"])
    assert a["offBelow"] == 0.45 and a["onAt"] == 0.60
    assert rep["steps"] and all(isinstance(r["rule"], bool) for r in rep["steps"])
    _no_worse(before, after)


def test_real_run_forced_off_runs_without_stall():
    # offBelow 1.0: the first full window (win rate < 1) switches the rule off; onAt 1.0 keeps it off unless every step wins.
    rep, before, after = _go_adaptive(budget=8.0, cap=1.0, sub_stall_off_below=1.0, sub_stall_on_at=1.0)
    steps = rep["steps"]
    assert all(isinstance(r["rule"], bool) for r in steps)
    if len(steps) > SUB_STALL_WINDOW:
        assert any(not r["rule"] for r in steps)
        assert all(not r["stalled"] for r in steps if not r["rule"])
    _no_worse(before, after)
