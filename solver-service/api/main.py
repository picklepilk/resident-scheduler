"""FastAPI app: POST /solve, GET /health.

Kept deliberately thin -- request validation lives in `schemas.py`, deeper
parsing in `solver/io/payload.py`, all solving logic in `solver/solve.py`.
This module only wires the three together and translates exceptions to
HTTP status codes per docs/PAYLOAD_SCHEMA.md's "Errors" note (400 schema,
422 semantic, 500 internal validation mismatch).
"""

from __future__ import annotations

import os

from importlib.metadata import version as _pkg_version

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api.auth import AuthResult
from api.limits import MaxBodySizeMiddleware
from api.ratelimit import enforce_preauth_ip_limit, enforce_rate_limit
from api.schemas import HealthResponse, SolveRequest, SolveResponse
from solver.io.payload import PayloadError, parse_payload
from solver.io.result import build_response
from solver.solve import solve

try:
    ORTOOLS_VERSION = _pkg_version("ortools")
except Exception:  # pragma: no cover -- package metadata should always exist
    ORTOOLS_VERSION = "unknown"

app = FastAPI(title="resident-scheduler-solver", version="1")

# The service is called directly from the scheduler app's browser origin (solverClient.js fetch),
# so CORS must be open to that origin or every call dies in preflight and the app silently falls
# back to its built-in generator. SOLVER_CORS_ORIGINS is a comma-separated allowlist set at deploy
# time (the app's own origin(s), never "*" — one specific frontend is the only intended caller);
# the localhost defaults keep `uvicorn` + `npm run dev` working with no env var at all.
_cors_origins = [
    o.strip()
    for o in os.environ.get(
        "SOLVER_CORS_ORIGINS", "http://localhost:5173,http://localhost:4173"
    ).split(",")
    if o.strip()
]
# Starlette's `add_middleware` PREPENDS, so the LAST call here ends up
# OUTERMOST. CORS must be outermost: a rejection raised by any inner layer
# (MaxBodySizeMiddleware's 413, or a 401/429 raised from inside a route's own
# dependencies) still needs to pass back out through CORSMiddleware's `send`
# wrapper to get its Access-Control-Allow-Origin header -- a browser caller
# would otherwise see those error responses as a raw CORS failure with no way
# to read the actual status/body. Caps real request body bytes before they
# reach Pydantic parsing (see api/limits.py); /health has no body worth
# capping but this runs ahead of routing so it applies uniformly, harmlessly.
app.add_middleware(MaxBodySizeMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> dict:
    # Deliberately open: no auth, no rate limit -- Fly's health check (and
    # anyone else) must always be able to reach this.
    return {"status": "ok", "ortools": ORTOOLS_VERSION}


@app.post("/solve", response_model=SolveResponse)
def solve_endpoint(
    request: SolveRequest,
    _preauth: None = Depends(enforce_preauth_ip_limit),
    auth: AuthResult = Depends(enforce_rate_limit),
) -> dict:
    raw = request.model_dump(mode="python")

    try:
        payload = parse_payload(raw)
    except PayloadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = solve(payload)
    except RuntimeError as exc:
        # validate.py disagreed with a strict-mode result -- an internal bug,
        # not a client error. Client falls back to the JS engine on any
        # non-200.
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return build_response(payload.version, result)
