"""stop_event ("stop and keep best", 2026-11-23): the ladder side. Returns a valid result with
report.stoppedEarly, skips later stages / outer LNS / pass 2. cancel_event semantics unchanged."""

from __future__ import annotations

import threading
import time

from ortools.sat.python import cp_model

import solver.solve as solve_module
from solver.io.payload import parse_payload
from solver.solve import _StopWatcher, _register_active_solver, solve
from solver.validate import validate_schedule
from tests.helpers import load_fixture


def _raw(hint=True, outer=False):
    raw = load_fixture("small_feasible.json")
    dates = raw["block"]["dates"]
    if hint:
        raw["hint"] = [{"residentId": "r1", "date": d, "shiftId": "D"} for d in dates[:3]]
        raw["hint"] += [{"residentId": "r2", "date": d, "shiftId": "D"} for d in dates[3:]]
    raw["config"].update({"numWorkers": 1, "maxTimeSeconds": 6, "randomSeed": 1,
                          "outerLns": {"enabled": outer, "fraction": 0.5, "subSolveSeconds": 1}})
    return raw


def test_no_stop_event_means_no_flag():
    assert "stoppedEarly" not in solve(parse_payload(_raw())).report


def test_preset_event_with_feasible_hint_returns_hint():
    raw = _raw(outer=True)
    ev = threading.Event()
    ev.set()
    payload = parse_payload(raw)
    res = solve(payload, stop_event=ev)
    assert res.report["stoppedEarly"] is True
    assert res.status in ("OPTIMAL", "FEASIBLE") and res.mode == "strict"
    assert "outerLns" not in res.report
    assert {(r, d): s for r, ds in res.schedule.items() for d, s in ds.items()} == \
        {(h["residentId"], h["date"]): h["shiftId"] for h in raw["hint"]}
    assert validate_schedule(payload, res.schedule) == []


def test_preset_event_without_hint_skips_pass2():
    ev = threading.Event()
    ev.set()
    res = solve(parse_payload(_raw(hint=False)), stop_event=ev)
    assert res.report["stoppedEarly"] is True
    assert res.mode == "strict" and res.status == "INFEASIBLE" and res.schedule == {}


def test_stop_between_ladder_stages_keeps_incumbent(monkeypatch):
    ev = threading.Event()
    orig = solve_module._solve_with_progress
    calls = []

    def stop_after_first(solver, model, progress, handlers=()):
        status = orig(solver, model, progress, handlers)
        calls.append(1)
        ev.set()
        return status

    monkeypatch.setattr(solve_module, "_solve_with_progress", stop_after_first)
    payload = parse_payload(_raw(hint=False))
    res = solve(payload, stop_event=ev)
    assert len(calls) == 1
    assert res.report["stoppedEarly"] is True
    assert res.status in ("OPTIMAL", "FEASIBLE") and res.schedule
    assert validate_schedule(payload, res.schedule) == []
    ran = [s for s in res.report["timing"]["stages"] if s["wallSeconds"] > 0]
    assert len(ran) == 1


def test_stop_mid_outer_lns_returns_valid_result(monkeypatch):
    ev = threading.Event()
    real = solve_module.run_outer_lns

    def stop_then_run(*a, **kw):
        ev.set()
        return real(*a, **kw)

    monkeypatch.setattr(solve_module, "run_outer_lns", stop_then_run)
    payload = parse_payload(_raw(outer=True))
    res = solve(payload, stop_event=ev)
    assert res.report["stoppedEarly"] is True
    assert res.status in ("OPTIMAL", "FEASIBLE") and res.schedule
    assert validate_schedule(payload, res.schedule) == []


def test_watcher_stops_a_running_solver():
    model = cp_model.CpModel()
    xs = [model.new_bool_var(f"x{i}") for i in range(300)]
    model.add(sum((i % 17 + 3) * x for i, x in enumerate(xs)) <= 1111)
    model.maximize(sum(((i * 7919) % 101 + 50) * x for i, x in enumerate(xs)))
    ev = threading.Event()
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    solver.parameters.max_time_in_seconds = 60
    threading.Timer(0.3, ev.set).start()
    t0 = time.time()
    with _StopWatcher(ev):
        _register_active_solver(solver)
        status = solver.solve(model)
    assert time.time() - t0 < 20
    assert solver.status_name(status) in ("OPTIMAL", "FEASIBLE")
