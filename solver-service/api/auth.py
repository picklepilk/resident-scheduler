"""Optional Supabase JWT verification for compute endpoints (/solve).

Controlled by the `SOLVER_AUTH_MODE` env var:
  - "off" (default): `require_auth` is a no-op -- keeps local dev, `pytest`,
    and the `cli.py` tool working unauthenticated, exactly as before this
    file existed.
  - "supabase": every request must carry `Authorization: Bearer <access_token>`,
    where `<access_token>` is the Supabase session's own JWT (the one
    `supabase.auth.getSession()` returns client-side). Verified here:
    signature, `exp`, `aud == "authenticated"`, `role == "authenticated"`.

Two Supabase signing schemes are both supported, since a project can be on
either one:
  - Asymmetric (current Supabase default): RS256/ES256, verified against the
    project's JWKS at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Keys
    are cached in-process and only refetched when an unknown `kid` shows up
    (a key rotation) or the cache has gone stale -- never on every request.
  - Legacy shared-secret: HS256 via `SUPABASE_JWT_SECRET` (the project's
    legacy JWT secret, still valid on older Supabase projects).

The raw bearer token is never logged or included in any exception message --
only derived claims (e.g. `sub`) are ever retained, and only in memory for
the lifetime of one request.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx
import jwt
from fastapi import Header, HTTPException

_JWKS_TIMEOUT_SECONDS = 3.0
_JWKS_CACHE_TTL_SECONDS = 600
_REQUIRED_AUDIENCE = "authenticated"
_REQUIRED_ROLE = "authenticated"


def _auth_mode() -> str:
    # Read live (not cached at import time) so tests can monkeypatch the env
    # var per-case without reimporting this module.
    return os.environ.get("SOLVER_AUTH_MODE", "off").strip().lower()


def _supabase_url() -> str:
    return os.environ.get("SUPABASE_URL", "").rstrip("/")


def _jwt_secret() -> str:
    return os.environ.get("SUPABASE_JWT_SECRET", "")


@dataclass
class AuthResult:
    """What a dependency chained after `require_auth` gets to key on.

    `enabled=False` means auth mode is "off" -- there was no token to check,
    and `subject` is always None in that case (the rate limiter falls back to
    client IP).
    """

    enabled: bool
    subject: Optional[str] = None


class _JwksCache:
    """Per-process cache of one project's JWKS, keyed by `kid`. Refetches on
    an unknown `kid` (the project rotated its signing key) or once the cache
    is older than `_JWKS_CACHE_TTL_SECONDS` -- never on every request, which
    would turn every /solve call into two network round trips.
    """

    def __init__(self, jwks_url: str):
        self._jwks_url = jwks_url
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at = 0.0

    def _fetch(self) -> None:
        resp = httpx.get(self._jwks_url, timeout=_JWKS_TIMEOUT_SECONDS)
        resp.raise_for_status()
        data = resp.json()
        keys: dict[str, jwt.PyJWK] = {}
        for raw_key in data.get("keys", []):
            kid = raw_key.get("kid")
            if not kid:
                continue
            keys[kid] = jwt.PyJWK.from_dict(raw_key)
        self._keys = keys
        self._fetched_at = time.monotonic()

    def get(self, kid: str) -> jwt.PyJWK:
        stale = (time.monotonic() - self._fetched_at) > _JWKS_CACHE_TTL_SECONDS
        if kid not in self._keys or stale:
            self._fetch()
        if kid not in self._keys:
            raise jwt.InvalidTokenError("unknown signing key")
        return self._keys[kid]


# Keyed by jwks_url so a changed SUPABASE_URL (prod vs. a test monkeypatch)
# never serves another project's cached keys.
_jwks_caches: dict[str, _JwksCache] = {}


def _get_jwks_cache(jwks_url: str) -> _JwksCache:
    cache = _jwks_caches.get(jwks_url)
    if cache is None:
        cache = _JwksCache(jwks_url)
        _jwks_caches[jwks_url] = cache
    return cache


def reset_jwks_cache() -> None:
    """Test-only: drop all cached JWKS state so a monkeypatched fetch starts
    clean between cases.
    """
    _jwks_caches.clear()


def _decode(token: str) -> dict:
    """Verify signature + exp + aud + role. Raises `jwt.PyJWTError` (or lets
    an `httpx.HTTPError` from a JWKS fetch propagate) on any failure --
    `require_auth` maps all of it to a flat 401 so callers can't distinguish
    "bad signature" from "expired" from "JWKS unreachable".
    """
    header = jwt.get_unverified_header(token)
    alg = header.get("alg")

    if alg == "HS256":
        secret = _jwt_secret()
        if not secret:
            raise jwt.InvalidTokenError("HS256 token but no SUPABASE_JWT_SECRET configured")
        claims = jwt.decode(token, secret, algorithms=["HS256"], audience=_REQUIRED_AUDIENCE)
    elif alg in ("RS256", "ES256"):
        kid = header.get("kid")
        if not kid:
            raise jwt.InvalidTokenError("asymmetric token missing kid")
        supabase_url = _supabase_url()
        if not supabase_url:
            raise jwt.InvalidTokenError("SUPABASE_URL not configured")
        jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
        signing_key = _get_jwks_cache(jwks_url).get(kid)
        claims = jwt.decode(token, signing_key.key, algorithms=[alg], audience=_REQUIRED_AUDIENCE)
    else:
        raise jwt.InvalidTokenError(f"unsupported alg {alg!r}")

    if claims.get("role") != _REQUIRED_ROLE:
        raise jwt.InvalidTokenError("token role is not 'authenticated'")
    return claims


def require_auth(authorization: Optional[str] = Header(default=None)) -> AuthResult:
    """FastAPI dependency guarding /solve. No-op when `SOLVER_AUTH_MODE` isn't
    "supabase" (the default) -- local dev, tests, and `cli.py` keep working
    with no token at all. In "supabase" mode, demands a valid bearer token
    and returns its subject for the rate limiter to key on.
    """
    if _auth_mode() != "supabase":
        return AuthResult(enabled=False)

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization[len("Bearer "):].strip()
    if not token:
        raise HTTPException(status_code=401, detail="missing bearer token")

    try:
        claims = _decode(token)
    except (jwt.PyJWTError, httpx.HTTPError):
        # Never surface the underlying reason (and never the token) to the
        # client or a log line -- "invalid" covers bad signature, expired,
        # wrong aud/role, and an unreachable JWKS alike.
        raise HTTPException(status_code=401, detail="invalid token") from None

    return AuthResult(enabled=True, subject=claims.get("sub"))
