"""Tests for api.ratelimit's token-bucket limiter on POST /solve.

`solve()` is monkeypatched to a trivial stub, same as test_api_auth.py --
these tests only exercise the rate-limit layer.
"""

from __future__ import annotations

import time
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
    auth_module.reset_jwks_cache()
    ratelimit_module.reset_rate_limiter()
    yield
    ratelimit_module.reset_rate_limiter()


def _post(client: TestClient, headers=None):
    return client.post("/solve", json=make_payload(), headers=headers or {})


def test_requests_within_burst_all_succeed(monkeypatch):
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "6")
    monkeypatch.setenv("SOLVER_RATE_BURST", "3")
    client = TestClient(app)

    for _ in range(3):
        assert _post(client).status_code == 200


def test_exceeding_burst_returns_429_with_retry_after(monkeypatch):
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "6")
    monkeypatch.setenv("SOLVER_RATE_BURST", "3")
    client = TestClient(app)

    for _ in range(3):
        assert _post(client).status_code == 200

    resp = _post(client)
    assert resp.status_code == 429
    assert int(resp.headers["Retry-After"]) >= 1


def test_bucket_refills_after_wait(monkeypatch):
    # A fast rate so the test doesn't need to sleep long: burst of 1,
    # refilling at 120/min = one token every 0.5s.
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "120")
    monkeypatch.setenv("SOLVER_RATE_BURST", "1")
    client = TestClient(app)

    assert _post(client).status_code == 200
    assert _post(client).status_code == 429

    time.sleep(0.6)
    assert _post(client).status_code == 200


def test_different_callers_get_independent_buckets(monkeypatch):
    """Two different JWT subjects must not share a bucket -- simulated here
    by driving the limiter directly, since TestClient always presents the
    same client IP and SOLVER_AUTH_MODE=off keys on IP alone.
    """
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "6")
    monkeypatch.setenv("SOLVER_RATE_BURST", "1")

    limiter = ratelimit_module._get_limiter()
    assert limiter.check("sub:user-a") is None
    assert limiter.check("sub:user-a") is not None  # user-a's single token spent
    assert limiter.check("sub:user-b") is None  # user-b has their own bucket
