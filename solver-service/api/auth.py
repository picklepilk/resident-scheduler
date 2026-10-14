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

Also checked: `iss == f"{SUPABASE_URL}/auth/v1"` (trailing slash stripped) --
this ties a token to THIS Supabase project specifically, not just "some
project's JWKS validated the signature". Only enforced when `SUPABASE_URL` is
configured; a legacy deployment running HS256-only with no `SUPABASE_URL` has
no expected value to compare against, so `iss` is left unchecked there (the
shared secret itself is already project-specific).

**JWKS amplification guard**: an attacker can hand `/solve` an RS256/ES256
token with a random, never-valid `kid` to force a JWKS fetch on every single
request (3s timeout each) -- before any auth succeeds or fails, and before
`ratelimit.py`'s per-subject bucket ever runs (that bucket keys off the
*verified* subject, which doesn't exist yet). Two defenses, both inside
`_JwksCache`:
  1. A fetch is attempted at most once every `_MIN_REFETCH_INTERVAL_SECONDS`
     (60s), globally, regardless of whether it succeeds -- an unknown `kid`
     seen again inside that window is rejected immediately with no network
     call at all.
  2. A lock serializes concurrent fetch attempts (no thundering herd of N
     simultaneous requests each independently hitting the JWKS endpoint).
This guard only blunts the JWKS-specific amplification; the broader "cheap
request before any of this expensive work runs" fix is
`ratelimit.enforce_preauth_ip_limit`, which must run before `require_auth` is
even invoked (see that module).

The raw bearer token is never logged or included in any exception message --
only derived claims (e.g. `sub`) are ever retained, and only in memory for
the lifetime of one request.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from typing import Optional

import httpx
import jwt
from fastapi import Header, HTTPException

_JWKS_TIMEOUT_SECONDS = 3.0
_JWKS_CACHE_TTL_SECONDS = 600
_MIN_REFETCH_INTERVAL_SECONDS = 60
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
    is older than `_JWKS_CACHE_TTL_SECONDS` -- but never more than once every
    `_MIN_REFETCH_INTERVAL_SECONDS`, and never concurrently (see the module
    docstring's "JWKS amplification guard").
    """

    def __init__(self, jwks_url: str):
        self._jwks_url = jwks_url
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at = 0.0
        self._last_fetch_attempt = 0.0
        self._lock = threading.Lock()

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
        # Fast path: no lock needed when the cache already has a fresh answer.
        cached = self._keys.get(kid)
        if cached is not None and (time.monotonic() - self._fetched_at) <= _JWKS_CACHE_TTL_SECONDS:
            return cached

        with self._lock:
            # Re-check inside the lock -- another thread may have just
            # refreshed the cache while we were waiting for it.
            cached = self._keys.get(kid)
            stale = (time.monotonic() - self._fetched_at) > _JWKS_CACHE_TTL_SECONDS
            if cached is not None and not stale:
                return cached

            now = time.monotonic()
            if now - self._last_fetch_attempt >= _MIN_REFETCH_INTERVAL_SECONDS:
                self._last_fetch_attempt = now
                self._fetch()  # may raise httpx.HTTPError -- still throttled above

            result = self._keys.get(kid)
            if result is None:
                # Either a genuinely unknown kid, or a recent fetch attempt
                # already happened and we're inside the throttle window --
                # either way, no network call here. Same 401 either way.
                raise jwt.InvalidTokenError("unknown signing key")
            return result


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
    """Verify signature + exp + aud + role + (when SUPABASE_URL is set) iss.
    Raises `jwt.PyJWTError` (or lets an `httpx.HTTPError` from a JWKS fetch
    propagate) on any failure -- `require_auth` maps all of it to a flat 401
    so callers can't distinguish "bad signature" from "expired" from "JWKS
    unreachable" from "wrong project".
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

    # Ties the token to THIS Supabase project, not just "some project's key
    # happened to validate the signature". Only checked when we have an
    # expected value to check against -- see module docstring.
    supabase_url = _supabase_url()
    if supabase_url:
        expected_iss = f"{supabase_url}/auth/v1"
        if claims.get("iss") != expected_iss:
            raise jwt.InvalidTokenError("token iss does not match SUPABASE_URL")

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
