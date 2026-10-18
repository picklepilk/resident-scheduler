"""Job backend abstraction: ModalJobs with injected fakes (no network), the progress hook on a
tiny real model, SOLVER_NUM_WORKERS, and the modal-mode /solve + /health behavior."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api import auth as auth_module
from api import jobs as jobs_module
from api import ratelimit as ratelimit_module
from api.jobs import InMemoryJobs, JobNotFound, ModalJobs
from api.main import app
from solver.io.payload import parse_payload
from solver.solve import _num_workers, solve
from tests.helpers import load_fixture, make_payload


# ---- fakes -----------------------------------------------------------------------------------
class _Pending(Exception):
    pass


class _Expired(Exception):
    pass


class FakeCall:
    def __init__(self, call_id, store):
        self.object_id = call_id
        self._store = store
        self.cancelled_with = None

    def get(self, timeout=None):
        state = self._store.setdefault(self.object_id, {"state": "pending"})
        if state["state"] == "pending":
            raise _Pending()
        if state["state"] == "expired":
            raise _Expired()
        if state["state"] == "error":
            raise RuntimeError(state["msg"])
        return state["result"]

    def cancel(self, terminate_containers=False):
        self.cancelled_with = terminate_containers


class FakeDict(dict):
    def put(self, key, value):
        self[key] = value


class FakeSolveFn:
    def __init__(self, store):
        self.store = store
        self.spawned = []

    def spawn(self, raw):
        call = FakeCall(f"fc-{len(self.spawned) + 1}", self.store)
        self.spawned.append((call, raw))
        self.store[call.object_id] = {"state": "pending"}
        return call


def _classify(exc):
    return {_Pending: "pending", _Expired: "expired"}.get(type(exc))


def _modal_backend():
    store = {}
    fn = FakeSolveFn(store)
    calls = {}

    def from_id(cid):
        if cid not in calls:
            calls[cid] = next((c for c, _ in fn.spawned if c.object_id == cid), None) or FakeCall(cid, store)
        return calls[cid]

    backend = ModalJobs(solve_fn=fn, call_from_id=from_id, meta=FakeDict(), progress=FakeDict(), classify=_classify)
    return backend, store, fn, calls


def _payload_obj(**kw):
    return parse_payload(make_payload(**kw))


@pytest.fixture(autouse=True)
def _isolated(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "off")
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "6000")
    monkeypatch.setenv("SOLVER_RATE_BURST", "500")
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_PER_MIN", "6000")
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_BURST", "500")
    monkeypatch.delenv("SOLVER_JOBS_BACKEND", raising=False)
    auth_module.reset_jwks_cache()
    ratelimit_module.reset_rate_limiter()
    jobs_module.reset_jobs_store()
    yield
    jobs_module.reset_jobs_store()
    ratelimit_module.reset_rate_limiter()


# ---- ModalJobs -------------------------------------------------------------------------------
def test_submit_spawns_raw_payload_and_records_meta():
    backend, _store, fn, _ = _modal_backend()
    raw = make_payload()
    job_id = backend.submit(parse_payload(raw), "sub:a", raw=raw)
    assert job_id == "fc-1"
    assert fn.spawned[0][1] is raw
    assert backend._meta["fc-1"]["owner"] == "sub:a"
    assert backend._meta["fc-1"]["budget"] == 5


def test_status_running_done_and_progress():
    backend, store, _fn, _ = _modal_backend()
    raw = make_payload()
    jid = backend.submit(parse_payload(raw), "sub:a", raw=raw)

    view = backend.status(jid, "sub:a")
    assert view["status"] == "running" and view["progress"] is None and view["result"] is None

    backend._progress["fc-1"] = {"stage": 2, "stages": 4, "elapsed": 3.0, "budget": 5.0, "best": 7}
    assert backend.status(jid, "sub:a")["progress"]["stage"] == 2

    store[jid] = {"state": "done", "result": {"status": "OPTIMAL"}}
    view = backend.status(jid, "sub:a")
    assert view["status"] == "done" and view["result"] == {"status": "OPTIMAL"}


def test_status_failed_and_lost():
    backend, store, _fn, _ = _modal_backend()
    raw = make_payload()
    jid = backend.submit(parse_payload(raw), "sub:a", raw=raw)
    store[jid] = {"state": "error", "msg": "kaboom"}
    v = backend.status(jid, "sub:a")
    assert v["status"] == "failed" and "kaboom" in v["error"]
    store[jid] = {"state": "expired"}
    assert backend.status(jid, "sub:a")["status"] == "lost"


def test_owner_mismatch_and_unknown_are_not_found():
    backend, _store, _fn, _ = _modal_backend()
    raw = make_payload()
    jid = backend.submit(parse_payload(raw), "sub:a", raw=raw)
    with pytest.raises(JobNotFound):
        backend.status(jid, "sub:b")
    with pytest.raises(JobNotFound):
        backend.cancel(jid, "sub:b")
    with pytest.raises(JobNotFound):
        backend.status("fc-999", "sub:a")
    # owner=None (auth off) skips enforcement
    assert backend.status(jid, None)["status"] == "running"


def test_cancel_terminates_and_sticks():
    backend, store, _fn, calls = _modal_backend()
    raw = make_payload()
    jid = backend.submit(parse_payload(raw), "sub:a", raw=raw)
    view = backend.cancel(jid, "sub:a")
    assert view["status"] == "cancelled"
    assert calls[jid].cancelled_with is True
    store[jid] = {"state": "done", "result": {}}  # even if it raced to finish
    assert backend.status(jid, "sub:a")["status"] == "cancelled"


def test_cancel_finished_job_is_noop():
    backend, store, _fn, calls = _modal_backend()
    raw = make_payload()
    jid = backend.submit(parse_payload(raw), "sub:a", raw=raw)
    store[jid] = {"state": "done", "result": {"status": "OPTIMAL"}}
    assert backend.cancel(jid, "sub:a")["status"] == "done"
    assert calls.get(jid) is None or calls[jid].cancelled_with is None


def test_modal_routes_per_owner_cap_and_ownership(monkeypatch):
    monkeypatch.setenv("SOLVER_JOBS_BACKEND", "modal")
    backend, store, _fn, _ = _modal_backend()
    jobs_module.set_backend(backend, "modal")
    client = TestClient(app)
    a = client.post("/jobs", json=make_payload())
    b = client.post("/jobs", json=make_payload())
    assert a.status_code == 200 and b.status_code == 409  # per-owner active-job cap
    jid = a.json()["jobId"]
    assert client.get(f"/jobs/{jid}").json()["status"] == "running"
    store[jid] = {"state": "done", "result": {"status": "OPTIMAL"}}
    assert client.get(f"/jobs/{jid}").json()["status"] == "done"
    assert client.get("/jobs/nope").status_code == 404
    assert client.delete(f"/jobs/{jid}").status_code == 200


# ---- InMemoryJobs unchanged + progress ---------------------------------------------------------
def test_in_memory_is_default_backend():
    assert isinstance(jobs_module.get_backend(), InMemoryJobs)


def test_in_memory_job_exposes_progress_from_real_solve():
    import time

    jobs_module.reset_jobs_store()
    client = TestClient(app)
    payload = make_payload()
    payload["config"]["maxTimeSeconds"] = 3
    resp = client.post("/jobs", json=payload)
    assert resp.status_code == 200
    jid = resp.json()["jobId"]
    deadline = time.time() + 30
    body = {}
    while time.time() < deadline:
        body = client.get(f"/jobs/{jid}").json()
        if body["status"] in ("done", "failed"):
            break
        time.sleep(0.1)
    assert body["status"] == "done", body
    p = body["progress"]
    assert p is not None and p["stages"] == 5 and p["stage"] == 5
    assert set(p) >= {"stage", "stages", "elapsed", "budget", "best"}


# ---- progress hook on a tiny model ------------------------------------------------------------
def test_progress_hook_stages_are_monotonic():
    events = []
    payload = parse_payload(load_fixture("small_feasible.json"))
    solve(payload, on_progress=events.append)
    assert events, "hook never called"
    stages = [e["stage"] for e in events]
    assert stages == sorted(stages)
    assert events[-1]["stage"] == events[-1]["stages"] == 5
    assert all(e["budget"] == payload.config.max_time_seconds for e in events)
    assert all(e["elapsed"] >= 0 for e in events)


def test_progress_hook_default_none_and_failing_sink_is_harmless():
    payload = parse_payload(load_fixture("small_feasible.json"))
    base = solve(payload)

    def boom(_p):
        raise RuntimeError("sink down")

    again = solve(payload, on_progress=boom)
    assert again.status == base.status


# ---- SOLVER_NUM_WORKERS ----------------------------------------------------------------------
def test_solver_num_workers_env_only_when_payload_leaves_it_unset(monkeypatch):
    monkeypatch.setenv("SOLVER_NUM_WORKERS", "8")
    auto = make_payload()
    auto["config"]["numWorkers"] = 0
    assert _num_workers(parse_payload(auto)) == 8
    explicit = make_payload()
    explicit["config"]["numWorkers"] = 1
    assert _num_workers(parse_payload(explicit)) == 1
    monkeypatch.setenv("SOLVER_NUM_WORKERS", "junk")
    assert _num_workers(parse_payload(auto)) >= 1


# ---- modal-mode /solve + /health --------------------------------------------------------------
def test_health_reports_jobs_backend(monkeypatch):
    client = TestClient(app)
    assert client.get("/health").json()["jobs"] == "memory"
    monkeypatch.setenv("SOLVER_JOBS_BACKEND", "modal")
    assert client.get("/health").json()["jobs"] == "durable"


def test_solve_is_400_use_jobs_on_modal(monkeypatch):
    monkeypatch.setenv("SOLVER_JOBS_BACKEND", "modal")
    resp = TestClient(app).post("/solve", json=make_payload())
    assert resp.status_code == 400
    assert resp.json() == {"error": "use_jobs"}


# ---- review fixes: error classification, cancel failure, poll bucket ----------------------------
def _real_classify_backend(exc, store_state=None):
    """ModalJobs using its REAL classifier (needs the modal package) with get() raising `exc`."""
    class Call:
        object_id = "fc-1"

        def get(self, timeout=None):
            raise exc

        def cancel(self, terminate_containers=False):
            raise exc

    b = ModalJobs(solve_fn=None, call_from_id=lambda _i: Call(), meta=FakeDict(), progress=FakeDict())
    b._meta["fc-1"] = {"owner": "o", "submitted_at": 0.0, "budget": 5}
    return b


def test_real_classifier_transient_vs_failed_vs_lost():
    mex = pytest.importorskip("modal.exception")
    cases = [
        (mex.ConnectionError("net down"), "running", True),
        (mex.InternalError("oops"), "running", True),
        (OSError("socket reset"), "running", True),
        (mex.TimeoutError("pending"), "running", False),
        (mex.FunctionTimeoutError("35 min"), "failed", False),
        (mex.ExecutionError("container crashed"), "failed", False),
        (RuntimeError("solver validate mismatch"), "failed", False),
        (mex.OutputExpiredError("gone"), "lost", False),
        (mex.NotFoundError("no such call"), "lost", False),
        (mex.InvalidError("bad request"), "failed", False),  # no longer treated as 'lost'
    ]
    for exc, status, transient in cases:
        v = _real_classify_backend(exc).status("fc-1", "o")
        assert v["status"] == status, (exc, v)
        assert ("transientError" in v) == transient, (exc, v)


def test_cancel_failure_is_502_and_not_marked_cancelled(monkeypatch):
    backend, store, _fn, calls = _modal_backend()
    monkeypatch.setenv("SOLVER_JOBS_BACKEND", "modal")
    jobs_module.set_backend(backend, "modal")
    client = TestClient(app)
    jid = client.post("/jobs", json=make_payload()).json()["jobId"]

    def boom(terminate_containers=False):
        raise RuntimeError("modal unreachable")

    backend._from_id(jid).cancel = boom
    assert client.delete(f"/jobs/{jid}").status_code == 502
    assert not backend._meta[jid].get("cancelled")
    assert client.get(f"/jobs/{jid}").json()["status"] == "running"


def test_job_polling_is_not_limited_by_preauth_bucket(monkeypatch):
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_PER_MIN", "30")
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_BURST", "10")
    monkeypatch.delenv("SOLVER_POLL_RATE_PER_MIN", raising=False)
    monkeypatch.delenv("SOLVER_POLL_RATE_BURST", raising=False)
    ratelimit_module.reset_rate_limiter()
    client = TestClient(app)
    # 40 polls in a burst would blow the preauth bucket (burst 10) but not the poll bucket (60).
    assert all(client.get("/jobs/nope").status_code == 404 for _ in range(40))
    # ...while POST routes still hit the strict preauth bucket.
    codes = [client.post("/jobs", json={}).status_code for _ in range(15)]
    assert 429 in codes


# ---- per-owner active-job cap ------------------------------------------------------------------
def test_second_submit_while_running_is_rejected_per_owner():
    from api.jobs import JobConflict
    backend, store, _fn, _ = _modal_backend()
    raw = make_payload()
    backend.submit(parse_payload(raw), "sub:a", raw=raw)
    with pytest.raises(JobConflict):
        backend.submit(parse_payload(raw), "sub:a", raw=raw)
    # a different owner is unaffected
    assert backend.submit(parse_payload(raw), "sub:b", raw=raw) == "fc-2"


def test_submit_allowed_again_once_previous_job_finished():
    backend, store, _fn, _ = _modal_backend()
    raw = make_payload()
    jid = backend.submit(parse_payload(raw), "sub:a", raw=raw)
    store[jid] = {"state": "done", "result": {"status": "OPTIMAL"}}
    assert backend.submit(parse_payload(raw), "sub:a", raw=raw) == "fc-2"
    assert backend._meta[jid]["done"] is True


def test_submit_allowed_after_cancel():
    backend, _store, _fn, _ = _modal_backend()
    raw = make_payload()
    jid = backend.submit(parse_payload(raw), "sub:a", raw=raw)
    backend.cancel(jid, "sub:a")
    assert backend.submit(parse_payload(raw), "sub:a", raw=raw) == "fc-2"
