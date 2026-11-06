"""Stall stop (solver/stall.py): threshold rule, watcher fire/cleanup, end-to-end report shape."""

from __future__ import annotations

import threading
import time

from solver.io.payload import parse_payload
from solver.solve import solve
from solver.stall import StallStop, stall_threshold
from tests.helpers import load_fixture


class _Cb:
    def __init__(self, obj):
        self.objective_value = obj


class _FakeSolver:
    def __init__(self):
        self.stops = 0

    def stop_search(self):
        self.stops += 1


def _raw(**cfg):
    raw = load_fixture("small_feasible.json")
    raw["config"].update(maxTimeSeconds=6, numWorkers=1, **cfg)
    return raw


def test_threshold_rule():
    assert stall_threshold(None, 10) == 30.0
    assert stall_threshold(None, 300) == 60.0  # 0.2 * budget
    assert stall_threshold(5, 300) == 5.0
    assert stall_threshold(0, 300) == 0.0


def test_fires_only_after_first_incumbent_and_stops_search():
    slv = _FakeSolver()
    with StallStop(slv, 0.15) as st:
        time.sleep(0.4)  # no incumbent yet: must not fire
        assert not st.fired and slv.stops == 0
        st.on_solution(_Cb(10))
        time.sleep(0.5)
        assert st.fired and slv.stops >= 1 and st.idle_at_fire >= 0.15


def test_improvement_resets_but_equal_does_not():
    slv = _FakeSolver()
    with StallStop(slv, 0.4) as st:
        for obj in (10, 9, 8):
            st.on_solution(_Cb(obj))
            time.sleep(0.15)
        assert not st.fired  # strictly improving every 0.15 s
        for _ in range(4):
            st.on_solution(_Cb(8))  # not strictly better
            time.sleep(0.15)
        assert st.fired


def test_disabled_and_no_leaked_thread():
    before = threading.active_count()
    with StallStop(_FakeSolver(), 0.0) as st:
        st.on_solution(_Cb(1))
    assert not st.fired
    with StallStop(_FakeSolver(), 0.1):
        pass
    time.sleep(0.1)
    assert threading.active_count() <= before
    assert not any(t.name == "stall-watch" for t in threading.enumerate())


def test_end_to_end_report_shape_and_validity():
    res = solve(parse_payload(_raw(stallSeconds=0.05, outerLns={"enabled": False})))
    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert res.validation["passed"]
    stalls = res.report["stall"]
    assert isinstance(stalls, list)
    for e in stalls:
        assert set(e) == {"stage", "stoppedAfterSeconds", "budgetSeconds", "reseeded"}
        assert e["stage"] in ("rank", "rest", "quality") or isinstance(e["stage"], str)
        assert e["stoppedAfterSeconds"] >= 0 and e["budgetSeconds"] > 0 and isinstance(e["reseeded"], bool)
    assert not any(t.name == "stall-watch" for t in threading.enumerate())


def test_stall_off_has_no_entries():
    res = solve(parse_payload(_raw(stallSeconds=0, outerLns={"enabled": False})))
    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert res.report["stall"] == []
