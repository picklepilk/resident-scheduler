"""Tests for api.auth's SOLVER_AUTH_MODE gate on POST /solve.

`solve()` itself is monkeypatched to a trivial stub -- these tests exercise
only the HTTP auth boundary (api/auth.py + the FastAPI wiring in api/main.py),
not solver correctness, which the rest of tests/ already covers.
"""

from __future__ import annotations

import json
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi.testclient import TestClient
from jwt.algorithms import ECAlgorithm, RSAAlgorithm

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
    # Real CP-SAT solving is irrelevant to the auth boundary and only slows
    # the suite down.
    monkeypatch.setattr("api.main.solve", lambda payload: _FAKE_RESULT)
    auth_module.reset_jwks_cache()
    ratelimit_module.reset_rate_limiter()
    # Generous so these tests never trip the rate limiter on their own --
    # that behavior has its own test file.
    monkeypatch.setenv("SOLVER_RATE_PER_MIN", "600")
    monkeypatch.setenv("SOLVER_RATE_BURST", "50")
    yield
    ratelimit_module.reset_rate_limiter()


def _post(headers=None):
    client = TestClient(app)
    return client.post("/solve", json=make_payload(), headers=headers or {})


def _hs256_token(secret: str, **claim_overrides) -> str:
    claims = {
        "sub": "u-hs256",
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    claims.update(claim_overrides)
    return jwt.encode(claims, secret, algorithm="HS256")


def _patch_jwks(monkeypatch, jwks_doc: dict) -> None:
    class _FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return jwks_doc

    monkeypatch.setattr(auth_module.httpx, "get", lambda url, timeout=None: _FakeResponse())


def test_off_mode_requires_no_token(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "off")
    resp = _post()
    assert resp.status_code == 200


def test_off_mode_ignores_a_garbage_header(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "off")
    resp = _post(headers={"Authorization": "Bearer not-even-a-jwt"})
    assert resp.status_code == 200


def test_supabase_mode_rejects_missing_token(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    resp = _post()
    assert resp.status_code == 401


def test_supabase_mode_rejects_malformed_header(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    resp = _post(headers={"Authorization": "not-a-bearer-token"})
    assert resp.status_code == 401


def test_supabase_mode_rejects_bad_signature(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "correct-secret")
    token = _hs256_token("wrong-secret")
    resp = _post(headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_supabase_mode_rejects_expired_token(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "s3cret")
    token = _hs256_token("s3cret", exp=int(time.time()) - 10)
    resp = _post(headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_supabase_mode_rejects_wrong_audience(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "s3cret")
    token = _hs256_token("s3cret", aud="some-other-service")
    resp = _post(headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_supabase_mode_rejects_wrong_role(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "s3cret")
    token = _hs256_token("s3cret", role="anon")
    resp = _post(headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_supabase_mode_accepts_valid_hs256(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "s3cret")
    token = _hs256_token("s3cret")
    resp = _post(headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_supabase_mode_accepts_valid_rs256_via_jwks(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = jwt.encode(
        {
            "sub": "u-rsa",
            "aud": "authenticated",
            "role": "authenticated",
            "exp": int(time.time()) + 3600,
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-rsa-kid"},
    )
    jwk = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    jwk["kid"] = "test-rsa-kid"
    _patch_jwks(monkeypatch, {"keys": [jwk]})

    resp = _post(headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_supabase_mode_accepts_valid_es256_via_jwks(monkeypatch):
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)

    private_key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(
        {
            "sub": "u-ec",
            "aud": "authenticated",
            "role": "authenticated",
            "exp": int(time.time()) + 3600,
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "test-ec-kid"},
    )
    jwk = json.loads(ECAlgorithm.to_jwk(private_key.public_key()))
    jwk["kid"] = "test-ec-kid"
    _patch_jwks(monkeypatch, {"keys": [jwk]})

    resp = _post(headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_supabase_mode_refetches_jwks_on_unknown_kid(monkeypatch):
    """A key rotation: the cache gets populated by the first request (one
    fetch, old key only), then a token signed with a brand new `kid` must
    force a second fetch rather than failing against the stale cache.
    """
    monkeypatch.setenv("SOLVER_AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)

    old_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    new_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    old_jwk = json.loads(RSAAlgorithm.to_jwk(old_key.public_key()))
    old_jwk["kid"] = "old-kid"
    new_jwk = json.loads(RSAAlgorithm.to_jwk(new_key.public_key()))
    new_jwk["kid"] = "new-kid"

    calls = {"n": 0}

    class _FakeResponse:
        def __init__(self, doc):
            self._doc = doc

        def raise_for_status(self):
            return None

        def json(self):
            return self._doc

    def _fake_get(url, timeout=None):
        calls["n"] += 1
        # Simulates the project's signing key rotating between the two
        # requests below: the server only serves one key at a time.
        return _FakeResponse({"keys": [old_jwk]}) if calls["n"] == 1 else _FakeResponse({"keys": [new_jwk]})

    monkeypatch.setattr(auth_module.httpx, "get", _fake_get)

    def _rsa_token(key, kid):
        return jwt.encode(
            {
                "sub": "u-rotated",
                "aud": "authenticated",
                "role": "authenticated",
                "exp": int(time.time()) + 3600,
            },
            key,
            algorithm="RS256",
            headers={"kid": kid},
        )

    resp1 = _post(headers={"Authorization": f"Bearer {_rsa_token(old_key, 'old-kid')}"})
    assert resp1.status_code == 200
    assert calls["n"] == 1

    resp2 = _post(headers={"Authorization": f"Bearer {_rsa_token(new_key, 'new-kid')}"})
    assert resp2.status_code == 200
    assert calls["n"] == 2
