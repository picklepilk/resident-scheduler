"""Tests for api.limits' request body size cap."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from api import auth as auth_module
from api import ratelimit as ratelimit_module
from api.main import app
from tests.helpers import make_payload

_FAKE_RESULT = SimpleNamespace(
    status="OPTIMAL",
    mode="strict",
    schedule={},
    objective_value=0,
    solve_time_ms=1,
    seed=1,
    report={},
    feasibility=None,
    validation={"passed": True},
)


@pytest.fixture(autouse=True)
def _isolated_state(monkeypatch):
    monkeypatch.setattr("api.main.solve", lambda payload: _FAKE_RESULT)
    monkeypatch.setenv("SOLVER_AUTH_MODE", "off")
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "600")
    monkeypatch.setenv("SOLVER_RATE_BURST", "50")
    auth_module.reset_jwks_cache()
    ratelimit_module.reset_rate_limiter()
    yield
    ratelimit_module.reset_rate_limiter()


def test_ordinary_payload_is_well_under_default_cap():
    resp = TestClient(app).post("/solve", json=make_payload())
    assert resp.status_code == 200


def test_oversized_body_is_rejected(monkeypatch):
    monkeypatch.setenv("SOLVER_MAX_BODY_BYTES", "1024")
    payload = make_payload(preferences=[{"residentId": "r1", "shiftId": "D", "date": "2026-01-05", "bonus": 1, "tag": "x" * 5000}])
    resp = TestClient(app).post("/solve", json=payload)
    assert resp.status_code == 413
