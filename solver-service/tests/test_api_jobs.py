"""Tests for api.jobs: POST /jobs, GET /jobs/{id}, DELETE /jobs/{id}.

`api.jobs.solve` is monkeypatched to small, fast/controllable stubs -- real
CP-SAT correctness is covered elsewhere in tests/; these only exercise the
job lifecycle (submit -> poll -> done/cancelled), the one-job-at-a-time 409,
and auth ownership.
"""

from __future__ import annotations

import time
from types import SimpleNamespace

import jwt
import pytest
from fastapi.testclient import TestClient

from api import auth as auth_module
from api import jobs as jobs_module
from api import ratelimit as ratelimit_module
from api.main import app
from tests.helpers import make_payload

_FAKE_RESULT = SimpleNamespace(
    status="OPTIMAL",
    mode="strict",
    schedule={"r1": {"2026-01-05": "D"}},
    objective_value=0,
    solve_time_ms=1,
    seed=1,
    report={},
    feasibility=None,
    validation={"passed": True},
)


@pytest.fixture(autouse=True)
def _isolated_state(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "off")
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "6000")
    monkeypatch.setenv("SOLVER_RATE_BURST", "500")
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_PER_MIN", "6000")
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_BURST", "500")
    auth_module.reset_jwks_cache()
    ratelimit_module.reset_rate_limiter()
    jobs_module.reset_jobs_store()
    yield
    jobs_module.reset_jobs_store()
    ratelimit_module.reset_rate_limiter()


def _fast_solve(payload, cancel_event=None):
    return _FAKE_RESULT


def _poll_until(client, job_id, *, predicate, timeout=2.0, headers=None):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        resp = client.get(f"/jobs/{job_id}", headers=headers or {})
        last = resp
        if resp.status_code == 200 and predicate(resp.json()):
            return resp
        time.sleep(0.02)
    return last


def test_submit_then_poll_to_done(monkeypatch):
    monkeypatch.setattr(jobs_module, "solve", _fast_solve)
    client = TestClient(app)

    resp = client.post("/jobs", json=make_payload())
    assert resp.status_code == 200
    job_id = resp.json()["jobId"]
    assert job_id

    final = _poll_until(client, job_id, predicate=lambda b: b["status"] == "done")
    assert final.status_code == 200
    body = final.json()
    assert body["status"] == "done"
    assert body["result"]["status"] == "OPTIMAL"
    assert body["result"]["schedule"] == _FAKE_RESULT.schedule
    assert body["error"] is None
    assert body["elapsedSeconds"] >= 0


def test_poll_unknown_job_is_404(monkeypatch):
    monkeypatch.setattr(jobs_module, "solve", _fast_solve)
    client = TestClient(app)
    resp = client.get("/jobs/does-not-exist")
    assert resp.status_code == 404


def test_failed_job_reports_error(monkeypatch):
    def _boom(payload, cancel_event=None):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(jobs_module, "solve", _boom)
    client = TestClient(app)

    resp = client.post("/jobs", json=make_payload())
    job_id = resp.json()["jobId"]

    final = _poll_until(client, job_id, predicate=lambda b: b["status"] == "failed")
    assert final.json()["status"] == "failed"
    assert "kaboom" in final.json()["error"]


def test_cancel_stops_a_running_job(monkeypatch):
    """A slow, cooperative fake solve that checks cancel_event -- exercises
    the job lifecycle around DELETE without depending on real CP-SAT timing.
    Actual CpSolver.stop_search() wiring is covered by
    test_begin_stoppable_run_registers_solver below.
    """
    def _slow_solve(payload, cancel_event=None):
        for _ in range(100):
            if cancel_event is not None and cancel_event.is_set():
                break
            time.sleep(0.02)
        return _FAKE_RESULT

    monkeypatch.setattr(jobs_module, "solve", _slow_solve)
    client = TestClient(app)

    resp = client.post("/jobs", json=make_payload())
    job_id = resp.json()["jobId"]

    # Let it actually start running before cancelling.
    _poll_until(client, job_id, predicate=lambda b: b["status"] == "running")

    cancel_resp = client.delete(f"/jobs/{job_id}")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    # Stays cancelled on a later poll too.
    final = client.get(f"/jobs/{job_id}")
    assert final.json()["status"] == "cancelled"


def test_cancel_an_already_done_job_is_a_noop(monkeypatch):
    monkeypatch.setattr(jobs_module, "solve", _fast_solve)
    client = TestClient(app)

    resp = client.post("/jobs", json=make_payload())
    job_id = resp.json()["jobId"]
    _poll_until(client, job_id, predicate=lambda b: b["status"] == "done")

    cancel_resp = client.delete(f"/jobs/{job_id}")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "done"


def test_second_concurrent_submit_is_409(monkeypatch):
    def _slow_solve(payload, cancel_event=None):
        time.sleep(0.5)
        return _FAKE_RESULT

    monkeypatch.setattr(jobs_module, "solve", _slow_solve)
    client = TestClient(app)

    resp1 = client.post("/jobs", json=make_payload())
    assert resp1.status_code == 200
    job_id = resp1.json()["jobId"]
    _poll_until(client, job_id, predicate=lambda b: b["status"] == "running")

    resp2 = client.post("/jobs", json=make_payload())
    assert resp2.status_code == 409

    # Once the first finishes, submitting again is allowed.
    _poll_until(client, job_id, predicate=lambda b: b["status"] == "done", timeout=3.0)
    resp3 = client.post("/jobs", json=make_payload())
    assert resp3.status_code == 200


def _hs256_token(secret: str, sub: str) -> str:
    claims = {
        "sub": sub,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(claims, secret, algorithm="HS256")


def test_only_the_owning_subject_can_poll_or_cancel(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setattr(jobs_module, "solve", _fast_solve)
    client = TestClient(app)

    token_a = _hs256_token("test-secret", "user-a")
    token_b = _hs256_token("test-secret", "user-b")

    resp = client.post("/jobs", json=make_payload(), headers={"Authorization": f"Bearer {token_a}"})
    assert resp.status_code == 200
    job_id = resp.json()["jobId"]

    # A different subject gets 404 (same as nonexistent -- never a 403, see
    # api/jobs.py's module docstring).
    other = client.get(f"/jobs/{job_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert other.status_code == 404
    other_cancel = client.delete(f"/jobs/{job_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert other_cancel.status_code == 404

    # The owner can poll it fine.
    mine = client.get(f"/jobs/{job_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert mine.status_code == 200

    # No token at all when auth is on: require_auth itself 401s before
    # ownership is even checked.
    anon = client.get(f"/jobs/{job_id}")
    assert anon.status_code == 401


def test_begin_stoppable_run_registers_solver():
    """Unit-level proof that solve.py's cancellation plumbing actually wires
    a real CpSolver into the per-thread registry api.jobs relies on -- the
    job-lifecycle tests above stub out `solve()` entirely, so this is the
    one place the real `_configure_solver` registration path gets exercised.
    """
    from solver.io.payload import parse_payload
    from solver.solve import _configure_solver, begin_stoppable_run, end_stoppable_run

    payload = parse_payload(make_payload())
    solvers = begin_stoppable_run()
    assert solvers == []
    solver = _configure_solver(payload)
    assert solvers == [solver]
    # stop_search() on a solver that hasn't even started solving yet must be
    # a harmless no-op (exactly the no-op cancel_job relies on when a cancel
    # arrives in the brief gap between two staged-solve stages).
    solver.stop_search()
    end_stoppable_run()
