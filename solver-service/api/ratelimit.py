"""In-memory token-bucket rate limit for /solve.

Two layers, in order:
  1. `enforce_preauth_ip_limit` -- cheap, generous, IP-only, runs BEFORE
     `require_auth`. Without this, a caller can force an expensive JWT
     signature check (or, worse, a JWKS fetch -- see `api.auth`'s own
     amplification guard) on every single request ahead of any per-subject
     limiting, since the per-subject bucket below only knows the subject
     AFTER `require_auth` has already verified the token. Env:
     `SOLVER_PREAUTH_RATE_PER_MIN` (default 30), `SOLVER_PREAUTH_RATE_BURST`
     (default 10).
  2. `enforce_rate_limit` -- the real per-caller limit, keyed by the caller's
     JWT `sub` when `SOLVER_AUTH_MODE=supabase`, else by client IP. Runs
     `require_auth` as its own sub-dependency, so a rejected token never
     consumes one of ITS tokens either (it just never gets there -- a 401
     from `require_auth` short-circuits before this bucket is touched). Env:
     `SOLVER_RATE_PER_MIN` (default 6), `SOLVER_RATE_BURST` (default 3).

IP for both is read from the `Fly-Client-IP` header first, falling back to
the ASGI-reported `request.client.host`. On Fly, every request reaching this
service has already passed through Fly's edge proxy, which sets (overwrites,
not merely appends to) `Fly-Client-IP` with the real origin IP -- trusting
`request.client.host` alone would bucket every caller worldwide together
under the proxy's own address. `X-Forwarded-For` is deliberately never
read: unlike `Fly-Client-IP`, a client can set it on the way in and Fly does
not scrub it, so it's attacker-controlled.

**Per-process, not global.** Fly may run more than one machine for this
service; each machine holds its own bucket table, so the effective cap on a
caller hammering a multi-machine deployment is `SOLVER_RATE_PER_MIN *
machine_count`, not a hard global ceiling. Good enough for an internal tool
behind Supabase auth with a handful of callers -- a shared store (e.g. Redis)
would be needed to enforce one true global rate.

Idle buckets (no request in `_IDLE_TTL_SECONDS`) are swept out of the table
opportunistically (at most once every `_SWEEP_INTERVAL_SECONDS`, piggybacked
on whatever request happens to notice it's due) so a flood of one-off keys
(e.g. many distinct IPs) doesn't grow the table forever.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Request

from api.auth import AuthResult, require_auth

_IDLE_TTL_SECONDS = 600.0
_SWEEP_INTERVAL_SECONDS = 60.0


def _client_ip(request: Request) -> str:
    fly_ip = request.headers.get("fly-client-ip")
    if fly_ip:
        return fly_ip.strip()
    client = request.client
    return client.host if client else "unknown"


@dataclass
class _Bucket:
    tokens: float
    updated_at: float


class TokenBucketLimiter:
    def __init__(self, rate_per_minute: float, burst: float):
        self._rate_per_second = rate_per_minute / 60.0
        self._capacity = max(burst, 1.0)
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()
        self._last_sweep = time.monotonic()

    def check(self, key: str) -> Optional[float]:
        """Returns None if the call is allowed (and consumes one token), else
        the number of seconds the caller should wait before retrying.
        """
        now = time.monotonic()
        with self._lock:
            self._sweep_idle_locked(now)

            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _Bucket(tokens=self._capacity, updated_at=now)
                self._buckets[key] = bucket
            else:
                elapsed = now - bucket.updated_at
                bucket.tokens = min(self._capacity, bucket.tokens + elapsed * self._rate_per_second)
                bucket.updated_at = now

            if bucket.tokens >= 1.0:
                bucket.tokens -= 1.0
                return None

            deficit = 1.0 - bucket.tokens
            wait = deficit / self._rate_per_second if self._rate_per_second > 0 else 60.0
            return wait

    def _sweep_idle_locked(self, now: float) -> None:
        """Caller must hold `self._lock`. Cheap no-op most calls -- only
        actually walks the bucket table once every `_SWEEP_INTERVAL_SECONDS`.
        """
        if now - self._last_sweep < _SWEEP_INTERVAL_SECONDS:
            return
        self._last_sweep = now
        idle_cutoff = now - _IDLE_TTL_SECONDS
        stale_keys = [k for k, b in self._buckets.items() if b.updated_at < idle_cutoff]
        for k in stale_keys:
            del self._buckets[k]

    def bucket_count(self) -> int:
        """Test-only: current table size, for asserting the sweep worked."""
        with self._lock:
            return len(self._buckets)


class _ConfiguredLimiter:
    """Lazily (re)builds a `TokenBucketLimiter` whenever its configured
    (rate, burst) env values change, so tests can monkeypatch env vars
    per-case without reaching into module internals.
    """

    def __init__(self, rate_env: str, rate_default: str, burst_env: str, burst_default: str):
        self._rate_env = rate_env
        self._rate_default = rate_default
        self._burst_env = burst_env
        self._burst_default = burst_default
        self._lock = threading.Lock()
        self._limiter: Optional[TokenBucketLimiter] = None
        self._config: Optional[tuple[float, float]] = None

    def _current_config(self) -> tuple[float, float]:
        rate = float(os.environ.get(self._rate_env, self._rate_default))
        burst = float(os.environ.get(self._burst_env, self._burst_default))
        return (rate, burst)

    def get(self) -> TokenBucketLimiter:
        config = self._current_config()
        with self._lock:
            if self._limiter is None or self._config != config:
                self._limiter = TokenBucketLimiter(*config)
                self._config = config
            return self._limiter

    def reset(self) -> None:
        with self._lock:
            self._limiter = None
            self._config = None


_main_limiter = _ConfiguredLimiter("SOLVER_RATE_PER_MIN", "6", "SOLVER_RATE_BURST", "3")
_preauth_limiter = _ConfiguredLimiter(
    "SOLVER_PREAUTH_RATE_PER_MIN", "30", "SOLVER_PREAUTH_RATE_BURST", "10"
)


def _get_limiter() -> TokenBucketLimiter:
    return _main_limiter.get()


def _get_preauth_limiter() -> TokenBucketLimiter:
    return _preauth_limiter.get()


def reset_rate_limiter() -> None:
    """Test-only: drop all bucket state (both layers) so each test starts
    with full buckets regardless of what earlier tests consumed.
    """
    _main_limiter.reset()
    _preauth_limiter.reset()


def _rate_limit_key(request: Request, auth: AuthResult) -> str:
    if auth.enabled and auth.subject:
        return f"sub:{auth.subject}"
    return f"ip:{_client_ip(request)}"


def _raise_429(wait_seconds: float) -> None:
    retry_after = max(1, int(wait_seconds + 0.999))
    raise HTTPException(
        status_code=429,
        detail="rate limit exceeded",
        headers={"Retry-After": str(retry_after)},
    )


def enforce_preauth_ip_limit(request: Request) -> None:
    """FastAPI dependency: a coarse, IP-only limit that must run before
    `require_auth` gets anywhere near a token (see module docstring). Not a
    substitute for `enforce_rate_limit` -- it exists to blunt flooding/
    amplification, not to be the real per-caller cap.
    """
    wait_seconds = _get_preauth_limiter().check(f"preauth:{_client_ip(request)}")
    if wait_seconds is not None:
        _raise_429(wait_seconds)


def enforce_rate_limit(request: Request, auth: AuthResult = Depends(require_auth)) -> AuthResult:
    """FastAPI dependency: runs `require_auth` first (so a rejected token
    never consumes a rate-limit token), then enforces the per-subject/per-IP
    bucket. Returns the `AuthResult` through so route handlers that need it
    don't have to depend on `require_auth` a second time.
    """
    wait_seconds = _get_limiter().check(_rate_limit_key(request, auth))
    if wait_seconds is not None:
        _raise_429(wait_seconds)
    return auth
