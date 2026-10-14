"""In-memory token-bucket rate limit for /solve.

Keyed by the caller's JWT `sub` when `SOLVER_AUTH_MODE=supabase` (via
`api.auth.require_auth`'s `AuthResult`), else by client IP (auth off, or a
request that got past `require_auth` with no subject).

Env: `SOLVER_RATE_PER_MIN` (default 6), `SOLVER_RATE_BURST` (default 3).

**Per-process, not global.** Fly may run more than one machine for this
service; each machine holds its own bucket table, so the effective cap on a
caller hammering a multi-machine deployment is `SOLVER_RATE_PER_MIN *
machine_count`, not a hard global ceiling. Good enough for an internal tool
behind Supabase auth with a handful of callers -- a shared store (e.g. Redis)
would be needed to enforce one true global rate.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Request

from api.auth import AuthResult, require_auth


def _rate_per_min() -> float:
    return float(os.environ.get("SOLVER_RATE_PER_MIN", "6"))


def _burst() -> float:
    return float(os.environ.get("SOLVER_RATE_BURST", "3"))


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

    def check(self, key: str) -> Optional[float]:
        """Returns None if the call is allowed (and consumes one token), else
        the number of seconds the caller should wait before retrying.
        """
        now = time.monotonic()
        with self._lock:
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


_limiter_lock = threading.Lock()
_limiter: Optional[TokenBucketLimiter] = None
_limiter_config: Optional[tuple[float, float]] = None


def _get_limiter() -> TokenBucketLimiter:
    global _limiter, _limiter_config
    config = (_rate_per_min(), _burst())
    with _limiter_lock:
        if _limiter is None or _limiter_config != config:
            _limiter = TokenBucketLimiter(*config)
            _limiter_config = config
        return _limiter


def reset_rate_limiter() -> None:
    """Test-only: drop all bucket state so each test starts with a full
    bucket regardless of what earlier tests consumed.
    """
    global _limiter, _limiter_config
    with _limiter_lock:
        _limiter = None
        _limiter_config = None


def _rate_limit_key(request: Request, auth: AuthResult) -> str:
    if auth.enabled and auth.subject:
        return f"sub:{auth.subject}"
    client = request.client
    return f"ip:{client.host if client else 'unknown'}"


def enforce_rate_limit(request: Request, auth: AuthResult = Depends(require_auth)) -> AuthResult:
    """FastAPI dependency: runs `require_auth` first (so a rejected token
    never consumes a rate-limit token), then enforces the bucket. Returns the
    `AuthResult` through so route handlers that need it don't have to depend
    on `require_auth` a second time.
    """
    key = _rate_limit_key(request, auth)
    wait_seconds = _get_limiter().check(key)
    if wait_seconds is not None:
        retry_after = max(1, int(wait_seconds + 0.999))
        raise HTTPException(
            status_code=429,
            detail="rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )
    return auth
