"""Request body size cap, enforced at the ASGI layer (ahead of Pydantic
parsing) so an oversized payload can't even reach `json.loads` inside
FastAPI's body parsing.

A client could send a `Content-Length` header that understates the real body
(or omit it and stream chunked), so this checks the header as a fast rejection
where present, but always also counts real bytes as they arrive and aborts
the moment the running total crosses the cap -- the header is a hint, not the
enforcement.

Env: `SOLVER_MAX_BODY_BYTES` (default 5 MiB). Read per-request (not cached at
import time) so tests can monkeypatch it per case.
"""

from __future__ import annotations

import os

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024


def _max_body_bytes() -> int:
    return int(os.environ.get("SOLVER_MAX_BODY_BYTES", str(DEFAULT_MAX_BODY_BYTES)))


class _BodyTooLarge(Exception):
    pass


class MaxBodySizeMiddleware:
    """Plain ASGI middleware (not `BaseHTTPMiddleware`) so it can reject a
    request by aborting the body stream rather than buffering the whole
    thing first.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        max_bytes = _max_body_bytes()

        content_length = next(
            (v for k, v in scope.get("headers", []) if k == b"content-length"), None
        )
        if content_length is not None:
            try:
                if int(content_length) > max_bytes:
                    await _reject(scope, send, max_bytes)
                    return
            except ValueError:
                pass  # malformed header -- let normal request handling reject it

        total = 0

        async def limited_receive():
            nonlocal total
            message = await receive()
            if message["type"] == "http.request":
                total += len(message.get("body", b""))
                if total > max_bytes:
                    raise _BodyTooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLarge:
            await _reject(scope, send, max_bytes)


async def _reject(scope: Scope, send: Send, max_bytes: int) -> None:
    response = JSONResponse(
        {"detail": f"request body exceeds {max_bytes} byte limit"}, status_code=413
    )
    await response(scope, receive=_noop_receive, send=send)


async def _noop_receive():  # pragma: no cover -- JSONResponse never calls receive
    return {"type": "http.request", "body": b"", "more_body": False}
