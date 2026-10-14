"""Tests for api.ratelimit's token-bucket limiter on POST /solve.

`solve()` is monkeypatched to a trivial stub, same as test_api_auth.py --
these tests only exercise the rate-limit layer.
"""

from __future__ import annotations

import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
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
    # Generous by default so a test targeting the MAIN limiter isn't
    # incidentally gated by the preauth layer first -- tests that want to
    # exercise the preauth limiter itself override these.
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_PER_MIN", "6000")
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_BURST", "500")
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


def test_rate_limit_keys_on_fly_client_ip_header_not_proxy_host(monkeypatch):
    """MEDIUM finding fix: on Fly, request.client.host is the edge proxy, not
    the real caller -- every caller would share one bucket. Fly-Client-IP
    (set/overwritten by Fly itself, not attacker-controlled) must be used
    instead when present.
    """
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "6")
    monkeypatch.setenv("SOLVER_RATE_BURST", "1")
    client = TestClient(app)

    # Caller A's single token.
    resp = _post(client, headers={"Fly-Client-IP": "203.0.113.1"})
    assert resp.status_code == 200
    # Caller A again, same request cycle -- bucket now empty.
    resp = _post(client, headers={"Fly-Client-IP": "203.0.113.1"})
    assert resp.status_code == 429

    # Caller B, a DIFFERENT Fly-Client-IP, must get its own bucket even
    # though TestClient reports the same underlying `request.client.host`
    # for every request in this process.
    resp = _post(client, headers={"Fly-Client-IP": "203.0.113.2"})
    assert resp.status_code == 200


def test_rate_limit_never_trusts_x_forwarded_for(monkeypatch):
    """A caller cannot evade (or frame another caller into) the rate limit
    by setting X-Forwarded-For -- only Fly-Client-IP (or, absent that, the
    ASGI-reported client host) is ever used.
    """
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "6")
    monkeypatch.setenv("SOLVER_RATE_BURST", "1")
    client = TestClient(app)

    resp = _post(client, headers={"X-Forwarded-For": "203.0.113.9"})
    assert resp.status_code == 200
    # Same (spoofable) X-Forwarded-For, different claimed value -- if it were
    # honored this would look like a fresh caller and get a fresh bucket. It
    # isn't honored, so this still shares TestClient's real reported host and
    # must already be out of tokens.
    resp = _post(client, headers={"X-Forwarded-For": "203.0.113.10"})
    assert resp.status_code == 429


def test_preauth_limit_runs_before_require_auth(monkeypatch):
    """HIGH finding fix: the cheap per-IP preauth bucket must reject a
    flood BEFORE require_auth ever looks at the token -- demonstrated here
    by a JWKS fetch that would otherwise fire on every single request (an
    unknown kid) never getting called once the preauth bucket is empty.
    """
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_PER_MIN", "6")
    monkeypatch.setenv("SOLVER_PREAUTH_RATE_BURST", "1")
    # Generous so the MAIN limiter (keyed by IP here, since auth never
    # succeeds) doesn't confound this -- only the preauth layer is under
    # test.
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "6000")
    monkeypatch.setenv("SOLVER_RATE_BURST", "500")

    calls = {"n": 0}

    class _FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"keys": []}

    def _fake_get(url, timeout=None):
        calls["n"] += 1
        return _FakeResponse()

    monkeypatch.setattr(auth_module.httpx, "get", _fake_get)

    signing_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = jwt.encode(
        {
            "sub": "u1",
            "aud": "authenticated",
            "role": "authenticated",
            "exp": int(time.time()) + 3600,
        },
        signing_key,
        algorithm="RS256",
        headers={"kid": "unknown-kid"},
    )

    client = TestClient(app)
    headers = {"Authorization": f"Bearer {token}"}

    # First request: preauth bucket's single token spent, falls through to
    # require_auth, which does fetch the (empty) JWKS once and 401s.
    resp1 = _post(client, headers=headers)
    assert resp1.status_code == 401
    assert calls["n"] == 1

    # Second request: preauth bucket is empty -- 429, and require_auth (so
    # the JWKS fetch) is never reached at all.
    resp2 = _post(client, headers=headers)
    assert resp2.status_code == 429
    assert calls["n"] == 1


def test_idle_buckets_are_evicted(monkeypatch):
    """LOW finding fix: a bucket untouched for longer than the idle TTL gets
    swept out of the table (opportunistically, on a later `check()` call)
    instead of accumulating forever.
    """
    fake_now = {"t": 0.0}
    monkeypatch.setattr(ratelimit_module.time, "monotonic", lambda: fake_now["t"])

    limiter = ratelimit_module.TokenBucketLimiter(rate_per_minute=60, burst=5)
    limiter.check("stale-key")
    assert limiter.bucket_count() == 1

    # Past the idle TTL (600s) AND the sweep interval (60s) -- the next
    # check() call (for a DIFFERENT key) should opportunistically evict it.
    fake_now["t"] += 700
    limiter.check("fresh-key")

    assert limiter.bucket_count() == 1  # stale-key gone, fresh-key remains
