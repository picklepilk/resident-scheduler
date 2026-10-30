"""Single-solve slot shared by /solve and POST /jobs (api/concurrency.py)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from api.concurrency import solve_slot
from api.main import app
from tests.helpers import make_payload

_FAKE = SimpleNamespace(
    status="OPTIMAL", mode="strict", schedule={}, objective_value=0, solve_time_ms=1,
    seed=1, report={}, feasibility=None, validation={"passed": True},
)


@pytest.fixture(autouse=True)
def _state(monkeypatch):
    monkeypatch.setattr("api.main.solve", lambda payload: _FAKE)
    monkeypatch.setenv("SOLVER_AUTH_MODE", "off")
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "600")
    monkeypatch.setenv("SOLVER_RATE_BURST", "50")
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_PER_MIN", "600")
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_BURST", "50")
    yield
    if solve_slot.locked():
        solve_slot.release()


def test_solve_409_while_slot_held():
    client = TestClient(app)
    assert solve_slot.acquire(blocking=False)
    assert client.post("/solve", json=make_payload()).status_code == 409


def test_solve_releases_slot_after_success_and_failure(monkeypatch):
    client = TestClient(app)
    assert client.post("/solve", json=make_payload()).status_code == 200
    assert not solve_slot.locked()

    def boom(payload):
        raise RuntimeError("x")

    monkeypatch.setattr("api.main.solve", boom)
    assert client.post("/solve", json=make_payload()).status_code == 500
    assert not solve_slot.locked()


def test_jobs_submit_409_while_slot_held():
    client = TestClient(app)
    assert solve_slot.acquire(blocking=False)
    assert client.post("/jobs", json=make_payload()).status_code == 409


def test_health_busy_reflects_slot():
    client = TestClient(app)
    assert client.get("/health").json()["busy"] is False
    assert solve_slot.acquire(blocking=False)
    try:
        assert client.get("/health").json()["busy"] is True
    finally:
        solve_slot.release()
    assert client.get("/health").json()["busy"] is False


def test_health_busy_false_on_modal(monkeypatch):
    monkeypatch.setattr("api.main.jobs_backend_name", lambda: "modal")
    assert solve_slot.acquire(blocking=False)
    try:
        assert TestClient(app).get("/health").json()["busy"] is False
    finally:
        solve_slot.release()
