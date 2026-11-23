"""Opt-in live incumbent feed (config.liveIncumbent): progress.incumbent rows, throttle, flush, LNS, off == today."""

from __future__ import annotations

import solver.solve as solve_mod
from solver.io.payload import parse_payload
from solver.solve import solve
from tests.helpers import load_fixture


def _raw(**cfg):
    raw = load_fixture("small_feasible.json")
    raw["config"].update(maxTimeSeconds=4, numWorkers=1, **cfg)
    return raw


def _rows_of(schedule):
    return sorted([r, d, sh] for r, days in schedule.items() for d, sh in days.items())


def _run(**cfg):
    seen = []
    res = solve(parse_payload(_raw(**cfg)), on_progress=lambda p: seen.append(dict(p)))
    return res, seen


def test_flag_parsing():
    assert parse_payload(_raw()).config.live_incumbent is False
    assert parse_payload(_raw(liveIncumbent=True)).config.live_incumbent is True
    assert parse_payload(_raw(liveIncumbent="yes")).config.live_incumbent is False


def test_off_has_no_incumbent_and_no_extra_callback(monkeypatch):
    used = []
    orig = solve_mod.ProgressReporter.offer
    monkeypatch.setattr(solve_mod.ProgressReporter, "offer", lambda self, *a: used.append(1) or orig(self, *a))
    res, seen = _run(outerLns={"enabled": False})
    assert seen and all("incumbent" not in p for p in seen)
    assert not used


def test_on_final_incumbent_equals_result_schedule():
    res, seen = _run(liveIncumbent=True, outerLns={"enabled": False})
    inc = [p["incumbent"] for p in seen if "incumbent" in p]
    assert inc
    last = inc[-1]
    assert set(last) == {"stage", "elapsed", "objective", "rows"}
    assert all(len(r) == 3 for r in last["rows"]) and last["rows"] == sorted(last["rows"])
    assert last["rows"] == _rows_of(res.schedule)


def test_throttle_respected_and_stage_last_flushed(monkeypatch):
    monkeypatch.setattr(solve_mod, "PROGRESS_MIN_INTERVAL_SECONDS", 1e9)
    res, seen = _run(liveIncumbent=True, outerLns={"enabled": False})
    published = []
    for p in seen:
        i = p.get("incumbent")
        if i is not None and (not published or published[-1] != i):
            published.append(i)
    # Callback publications are throttled away; each stage's end flushes its newest solution once.
    stages = [i["stage"] for i in published]
    assert published and len(stages) == len(set(stages))
    assert published[-1]["rows"] == _rows_of(res.schedule)


def test_lns_publishes():
    res, seen = _run(liveIncumbent=True, outerLns={"enabled": True, "fraction": 0.6, "subSolveSeconds": 1})
    inc = [p["incumbent"] for p in seen if "incumbent" in p]
    assert inc and inc[-1]["rows"] == _rows_of(res.schedule)
