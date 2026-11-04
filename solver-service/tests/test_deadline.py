"""config.deadlineSeconds: one Deadline bounds the whole solve; report.deadline is always present."""

from __future__ import annotations

import time

from solver.io.payload import parse_payload
from solver.solve import solve
from tests.helpers import load_fixture


def _raw(fixture="small_feasible.json", **cfg):
    raw = load_fixture(fixture)
    raw["config"].update(numWorkers=1, **cfg)
    return raw


def test_strict_report_deadline_shape():
    t0 = time.time()
    res = solve(parse_payload(_raw(maxTimeSeconds=4)))
    rep = res.report["deadline"]
    assert set(rep) == {"seconds", "hit", "overrunSeconds"}
    assert rep["seconds"] == 14.0  # maxTimeSeconds + 10 default grace
    assert rep["hit"] is False and rep["overrunSeconds"] == 0
    assert time.time() - t0 < 14


def test_small_deadline_bounds_wall_time():
    t0 = time.time()
    res = solve(parse_payload(_raw(maxTimeSeconds=30, deadlineSeconds=3)))
    wall = time.time() - t0
    assert wall < 3 + 3
    assert res.status in ("OPTIMAL", "FEASIBLE")
    assert res.report["deadline"]["seconds"] == 3.0


def test_relaxed_and_infeasible_results_carry_deadline():
    res = solve(parse_payload(_raw("infeasible_coverage_hard.json", maxTimeSeconds=4, deadlineSeconds=6)))
    assert res.mode == "relaxed" and res.status == "RELAXED"
    assert set(res.report["deadline"]) == {"seconds", "hit", "overrunSeconds"}
    res = solve(parse_payload(_raw("infeasible_rest.json", maxTimeSeconds=4, deadlineSeconds=6)))
    assert res.status == "INFEASIBLE"
    assert res.report["deadline"]["seconds"] == 6.0


def test_pass2_still_gets_a_floor_when_deadline_is_tiny():
    t0 = time.time()
    res = solve(parse_payload(_raw("infeasible_coverage_hard.json", maxTimeSeconds=4, deadlineSeconds=0.2)))
    assert res.status == "RELAXED" and res.schedule is not None
    assert time.time() - t0 < 0.2 + 2 + 3
