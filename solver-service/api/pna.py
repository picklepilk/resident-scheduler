"""Chrome's Private Network Access (PNA) response header.

A public HTTPS page (e.g. https://residentscheduling.netlify.app) that fetches a loopback/private
address — exactly what "run the optimizer on this computer" does, targeting http://127.0.0.1:8765
— triggers an extra signal on top of ordinary CORS: Chrome's preflight `OPTIONS` request carries
`Access-Control-Request-Private-Network: true`, and Chrome requires the response to answer back
`Access-Control-Allow-Private-Network: true` or it blocks the real request even though normal CORS
already passed. Firefox/Safari don't implement PNA (as of this writing) and ignore the header
either way, so adding it is a no-op for them, never a regression.

Starlette's `CORSMiddleware` (wired in `api/main.py`) has no concept of this header — it answers
the preflight itself (short-circuiting before the request ever reaches further down the ASGI
stack) and never asks this middleware's permission. So this sits OUTSIDE `CORSMiddleware` (added
LAST in `api/main.py` — Starlette's `add_middleware` prepends, so the last call ends up outermost)
and rewrites whatever response comes back up through it, including that short-circuited preflight
response, adding the one extra header Chrome wants whenever the incoming request asked for it.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Receive, Scope, Send

_REQUEST_HEADER = b"access-control-request-private-network"
_RESPONSE_HEADER = b"access-control-allow-private-network"


class PrivateNetworkAccessMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        wants_pna = any(
            k.lower() == _REQUEST_HEADER and v.strip().lower() == b"true"
            for k, v in scope.get("headers", [])
        )
        if not wants_pna:
            await self.app(scope, receive, send)
            return

        async def send_with_pna(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((_RESPONSE_HEADER, b"true"))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_pna)
