"""Stop-and-keep-best, durable finished jobs and /health.features (api/jobs.py)."""

from __future__ import annotations

import json
import os
import threading
import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from api import auth as auth_module
from api import jobs as jobs_module
from api import ratelimit as ratelimit_module
from api.jobs import InMemoryJobs, ModalJobs
from api.main import app
from tests.helpers import make_payload
from solver.io.payload import parse_payload

_RESULT = SimpleNamespace(
    status="FEASIBLE", mode="strict", schedule={"r1": {"2026-01-05": "D"}}, objective_value=0,
    solve_time_ms=1, seed=1, report={}, feasibility=None, validation={"passed": True},
)


def _instant(payload, cancel_event=None, stop_event=None):
    return _RESULT


@pytest.fixture(autouse=True)
def _state(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "off")
    for k, v in (("SOLVER_RATE_PER_MIN", "6000"), ("SOLVER_RATE_BURST", "500"),
                 ("SOLVER_PREAUTH_RATE_PER_MIN", "6000"), ("SOLVER_PREAUTH_RATE_BURST", "500")):
        monkeypatch.setenv(k, v)
    auth_module.reset_jwks_cache()
    ratelimit_module.reset_rate_limiter()
    jobs_module.reset_jobs_store()
    yield
    jobs_module.reset_jobs_store()
    ratelimit_module.reset_rate_limiter()


def _poll(client, jid, pred, timeout=3.0):
    end = time.time() + timeout
    r = None
    while time.time() < end:
        r = client.get(f"/jobs/{jid}")
        if r.status_code == 200 and pred(r.json()):
            return r
        time.sleep(0.02)
    return r


def _stoppable_solve(seen):
    def _solve(payload, cancel_event=None, stop_event=None):
        seen["cancel"], seen["stop"] = cancel_event, stop_event
        for _ in range(250):
            if stop_event.is_set() or cancel_event.is_set():
                break
            time.sleep(0.02)
        return _RESULT
    return _solve


# ---- stop -----------------------------------------------------------------------------------------
def test_stop_sets_stop_event_not_cancel_and_job_is_done(monkeypatch):
    seen = {}
    monkeypatch.setattr(jobs_module, "solve", _stoppable_solve(seen))
    client = TestClient(app)
    jid = client.post("/jobs", json=make_payload()).json()["jobId"]
    _poll(client, jid, lambda b: b["status"] == "running")
    r = client.post(f"/jobs/{jid}/stop")
    assert r.status_code == 200
    assert r.json().get("stopping") is True or r.json()["status"] == "done"
    final = _poll(client, jid, lambda b: b["status"] in ("done", "cancelled", "failed")).json()
    assert final["status"] == "done"
    assert final["result"]["schedule"] == _RESULT.schedule
    assert seen["stop"].is_set()
    assert not seen["cancel"].is_set()


def test_stop_is_idempotent_and_noop_on_finished_job(monkeypatch):
    monkeypatch.setattr(jobs_module, "solve", _instant)
    client = TestClient(app)
    jid = client.post("/jobs", json=make_payload()).json()["jobId"]
    done = _poll(client, jid, lambda b: b["status"] == "done").json()
    r1 = client.post(f"/jobs/{jid}/stop")
    r2 = client.post(f"/jobs/{jid}/stop")
    assert r1.status_code == r2.status_code == 200
    assert "stopping" not in r1.json()
    assert r1.json()["status"] == "done" and r1.json()["result"] == done["result"]
    assert r2.json() == r1.json()


def test_stop_unknown_job_404():
    assert TestClient(app).post("/jobs/nope/stop").status_code == 404


def test_stop_calls_stop_search_on_latest_solver_only():
    backend = InMemoryJobs()
    jobs_module.set_backend(backend, "memory")
    calls = []
    old = SimpleNamespace(stop_search=lambda: calls.append("old"))
    new = SimpleNamespace(stop_search=lambda: calls.append("new"))
    job = jobs_module._Job(id="j", owner="ip:x", status="running", solvers=[old, new])
    backend._jobs["j"] = job
    backend._loaded = True

    def _finish():
        time.sleep(0.25)
        with backend._lock:
            job.status = "done"
            job.finished_at = time.time()

    threading.Thread(target=_finish).start()
    view = backend.stop("j", None)
    assert "new" in calls and "old" not in calls
    assert not job.cancel_event.is_set() and job.stop_event.is_set()
    assert view["status"] in ("running", "done")


def test_stop_owner_enforced():
    backend = InMemoryJobs()
    jobs_module.set_backend(backend, "memory")
    job = jobs_module._Job(id="j", owner="sub:alice", status="running")
    backend._jobs["j"] = job
    backend._loaded = True
    with pytest.raises(jobs_module.JobNotFound):
        backend.stop("j", "sub:bob")
    assert not job.stop_event.is_set()
    backend.stop("j", "sub:alice")
    assert job.stop_event.is_set()


def test_stop_modal_not_supported(monkeypatch):
    monkeypatch.setenv("SOLVER_JOBS_BACKEND", "modal")
    jobs_module.set_backend(ModalJobs(meta={}, progress={}), "modal")
    r = TestClient(app).post("/jobs/abc/stop")
    assert r.status_code == 501
    assert r.json()["detail"] == "stop_not_supported"


# ---- durable --------------------------------------------------------------------------------------
def _run(backend, solve_fn, monkeypatch, owner="ip:t"):
    monkeypatch.setattr(jobs_module, "solve", solve_fn)
    jid = backend.submit(parse_payload(make_payload()), owner)
    end = time.time() + 3
    while time.time() < end and backend.status(jid, None)["status"] in ("queued", "running"):
        time.sleep(0.02)
    time.sleep(0.05)  # let _run_job's finally (persist) complete
    return jid


def test_finished_job_reloads_after_restart(tmp_path, monkeypatch):
    b1 = InMemoryJobs(tmp_path)
    jid = _run(b1, _instant, monkeypatch, owner="sub:alice")
    assert [f.stem for f in tmp_path.glob("*.json")] == [jid]
    b2 = InMemoryJobs(tmp_path)  # "restart"
    v = b2.status(jid, "sub:alice")
    assert v["status"] == "done" and v["result"]["schedule"] == _RESULT.schedule
    with pytest.raises(jobs_module.JobNotFound):  # owner survives reload
        b2.status(jid, "sub:bob")


def test_failed_job_persisted(tmp_path, monkeypatch):
    def boom(p, cancel_event=None, stop_event=None):
        raise RuntimeError("kaboom")

    b1 = InMemoryJobs(tmp_path)
    jid = _run(b1, boom, monkeypatch)
    v = InMemoryJobs(tmp_path).status(jid, None)
    assert v["status"] == "failed" and "kaboom" in v["error"]


def test_running_at_death_becomes_lost(tmp_path, monkeypatch):
    release = threading.Event()

    def hang(p, cancel_event=None, stop_event=None):
        release.wait(5)
        return _RESULT

    b1 = InMemoryJobs(tmp_path)
    monkeypatch.setattr(jobs_module, "solve", hang)
    jid = b1.submit(parse_payload(make_payload()), "sub:alice")
    marker = json.loads((tmp_path / f"{jid}.json").read_text())
    assert marker["state"] == "queued"
    b2 = InMemoryJobs(tmp_path)  # the process "died": marker still there
    assert b2.status(jid, "sub:alice")["status"] == "lost"
    assert json.loads((tmp_path / f"{jid}.json").read_text())["state"] == "lost"
    release.set()
    time.sleep(0.2)


def test_cancelled_job_leaves_no_file(tmp_path, monkeypatch):
    b = InMemoryJobs(tmp_path)
    monkeypatch.setattr(jobs_module, "solve", _stoppable_solve({}))
    jid = b.submit(parse_payload(make_payload()), "ip:t")
    b.cancel(jid, None)
    time.sleep(0.6)
    assert not list(tmp_path.glob("*.json"))


def test_ttl_sweep_deletes_old_files_on_load(tmp_path, monkeypatch):
    b1 = InMemoryJobs(tmp_path)
    jid = _run(b1, _instant, monkeypatch)
    f = tmp_path / f"{jid}.json"
    old = time.time() - 25 * 3600
    os.utime(f, (old, old))
    b2 = InMemoryJobs(tmp_path)
    with pytest.raises(jobs_module.JobNotFound):
        b2.status(jid, None)
    assert not f.exists()


def test_in_memory_sweep_removes_file_after_ttl(tmp_path, monkeypatch):
    b = InMemoryJobs(tmp_path)
    jid = _run(b, _instant, monkeypatch)
    with b._lock:
        b._jobs[jid].finished_at = time.time() - 25 * 3600
    with pytest.raises(jobs_module.JobNotFound):
        b.status(jid, None)
    assert not (tmp_path / f"{jid}.json").exists()


def test_persisted_job_outlives_in_memory_ttl(tmp_path, monkeypatch):
    b = InMemoryJobs(tmp_path)
    jid = _run(b, _instant, monkeypatch)
    with b._lock:
        b._jobs[jid].finished_at = time.time() - 5 * 3600  # > 2 h, < 24 h
    assert b.status(jid, None)["status"] == "done"


def test_unwritable_dir_degrades_to_memory(tmp_path, monkeypatch):
    blocker = tmp_path / "file"
    blocker.write_text("x")
    b = InMemoryJobs(blocker / "sub")  # cannot mkdir under a file
    jid = _run(b, _instant, monkeypatch)
    assert b.status(jid, None)["status"] == "done"
    assert "durableJobs" not in b.feature_list()


def test_dir_inside_repo_refused():
    root = jobs_module._repo_root()
    if root is None:
        pytest.skip("no .git ancestor")
    target = root / "solver-service" / "tmp-jobs-never"
    b = InMemoryJobs(target)
    assert not b._store.available
    assert not target.exists()


def test_default_dir_follows_runlog_and_env(tmp_path, monkeypatch):
    monkeypatch.delenv("SOLVER_JOBS_DIR", raising=False)
    monkeypatch.setenv("SOLVER_RUNLOG_DIR", str(tmp_path / "rl"))
    assert jobs_module.default_jobs_dir() == tmp_path / "rl" / "jobs"
    monkeypatch.setenv("SOLVER_JOBS_DIR", str(tmp_path / "x"))
    assert jobs_module.default_jobs_dir() == tmp_path / "x"


# ---- longRun / health -----------------------------------------------------------------------------
def test_long_run_budget_over_modal_ceiling_rejected(monkeypatch):
    monkeypatch.setenv("SOLVER_JOBS_BACKEND", "modal")
    jobs_module.set_backend(ModalJobs(meta={}, progress={}), "modal")
    raw = make_payload()
    raw["config"].update(maxTimeSeconds=7200, longRun=True)
    r = TestClient(app).post("/jobs", json=raw)
    assert r.status_code == 400 and r.json()["detail"] == "long_run_not_supported"


def test_long_run_job_accepts_7200_on_memory_backend(monkeypatch):
    monkeypatch.setattr(jobs_module, "solve", _instant)
    raw = make_payload()
    raw["config"].update(maxTimeSeconds=7200, longRun=True)
    client = TestClient(app)
    jid = client.post("/jobs", json=raw).json()["jobId"]
    assert _poll(client, jid, lambda b: b["status"] == "done").json()["budgetSeconds"] == 7200


def test_health_features_memory(tmp_path):
    jobs_module.set_backend(InMemoryJobs(tmp_path), "memory")
    assert TestClient(app).get("/health").json()["features"] == ["stop", "longRun", "durableJobs"]


def test_health_features_memory_without_store(tmp_path):
    blocker = tmp_path / "f"
    blocker.write_text("x")
    jobs_module.set_backend(InMemoryJobs(blocker / "s"), "memory")
    assert TestClient(app).get("/health").json()["features"] == ["stop", "longRun"]


def test_health_features_modal(monkeypatch):
    monkeypatch.setenv("SOLVER_JOBS_BACKEND", "modal")
    jobs_module.set_backend(ModalJobs(meta={}, progress={}), "modal")
    assert TestClient(app).get("/health").json()["features"] == ["durableJobs"]
