# solver-service

Python/FastAPI + OR-Tools CP-SAT service, the optional second scheduling engine
for `resident-scheduler`. Full contract: `CLAUDE.md` (architecture/seams) and
`docs/PAYLOAD_SCHEMA.md` (request/response shape — mostly empty at HEAD, see
its own header note).

> The rest of this README was never written. This section only documents the
> `/solve` auth/rate-limit/body-cap gate added 2026-10-14 — not reconstructed
> beyond that, out of scope for that change.

## Auth, rate limiting, body size cap (`/solve`)

`/solve` is CPU-expensive and was previously reachable by anyone who had the
Fly URL (CORS only blocks *browsers*, not a script or `curl`). It now supports
an optional auth gate, a per-caller rate limit, and a request body size cap.
`/health` is always open (no auth, no rate limit) — Fly's own health check
has no token to present.

### Env vars

| Var | Default | Meaning |
|---|---|---|
| `SOLVER_AUTH_MODE` | `off` | `off` — no auth, local dev/tests/`cli.py` keep working unauthenticated. `supabase` — `/solve` requires a valid Supabase session JWT. |
| `SUPABASE_URL` | unset | Your Supabase project URL. Required in `supabase` mode if any caller's token is RS256/ES256 (Supabase's current default) — used to fetch `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, and (when set) to check the token's `iss` matches this exact project. |
| `SUPABASE_JWT_SECRET` | unset | Legacy HS256 shared secret, if your project still issues HS256 tokens. Optional — set it alongside `SUPABASE_URL` to accept both signing schemes at once. |
| `SOLVER_PREAUTH_RATE_PER_MIN` | `30` | Cheap, IP-only token-bucket that runs BEFORE token verification — blunts a flood of bad/unknown-key tokens before any of the expensive per-subject work below runs. |
| `SOLVER_PREAUTH_RATE_BURST` | `10` | Burst capacity for the preauth bucket above. |
| `SOLVER_RATE_PER_MIN` | `6` | The real per-caller token-bucket refill rate, keyed by JWT `sub` (supabase mode) or client IP (auth off). |
| `SOLVER_RATE_BURST` | `3` | Token-bucket capacity (how many requests can fire back-to-back before the rate kicks in). |
| `SOLVER_MAX_BODY_BYTES` | `5242880` (5 MiB) | Hard cap on request body size, checked against the real byte stream (not just a trusted `Content-Length` header). |

Both rate limiters key by IP using the `Fly-Client-IP` header (Fly sets and
overwrites this on every request that reaches the app) first, falling back to
the ASGI-reported `request.client.host` only when that header is absent
(e.g. running locally, not behind Fly). `X-Forwarded-For` is never trusted —
unlike `Fly-Client-IP`, Fly does not scrub it, so a client can set it freely.

Both limiters are **in-memory and per-process**. Fly can run more than one
machine for this service; each machine holds its own bucket table, so the
effective global cap under N machines is `SOLVER_RATE_PER_MIN × N`, not a
hard ceiling. Fine for an internal tool behind Supabase auth with a handful
of callers — would need a shared store (e.g. Redis) to enforce a true global
rate. Idle buckets (no request for 10 minutes) are swept out of the table
opportunistically so a flood of one-off keys doesn't grow it forever.

### Client contract

In `supabase` mode, every `/solve` request must carry:

```
Authorization: Bearer <access_token>
```

where `<access_token>` is the **Supabase session's own JWT** — the same
token the browser app already holds via `supabaseClient.js` /
`supabase.auth.getSession()`. A shared secret baked into the client bundle
would be pointless here (any caller can read it straight out of the JS); the
per-user Supabase session token is the only thing that can't be lifted from
the bundle and still proves "a logged-in resident/admin made this call."

**Wiring the client to actually send this token is a separate task** — not
done as part of adding this server-side gate. Until `src/lib/solverClient.js`
sends the bearer token, keep `SOLVER_AUTH_MODE=off` in production, or every
real `/solve` call will 401 and silently fall back to the local JS generator.

Token is verified for: valid signature, unexpired `exp`, `aud ==
"authenticated"`, `role == "authenticated"`, and (when `SUPABASE_URL` is
configured) `iss == "${SUPABASE_URL}/auth/v1"`. Any failure — missing header,
malformed token, bad signature, expired, wrong `aud`/`role`/`iss`, or an
unreachable JWKS — comes back as a flat `401`; the client already treats any
non-200 from `/solve` as "fall back to local" (see `CLAUDE.md`'s solver
section), so no new client-side error handling is needed to be safe, only to
be functional once the real token wiring lands.

A JWKS-amplification guard also applies regardless of client behavior: a
token carrying a random, never-valid `kid` is throttled to at most one real
JWKS fetch attempt per 60 seconds, process-wide, and a cheap IP-only rate
limit (`SOLVER_PREAUTH_RATE_PER_MIN`/`SOLVER_PREAUTH_RATE_BURST`) runs before
token verification even starts.

### Fly secrets (set by hand, not run here)

```bash
fly secrets set SOLVER_AUTH_MODE=supabase
fly secrets set SUPABASE_URL=https://<project-ref>.supabase.co
# Only if your project still issues HS256 tokens; omit if you're on the
# current asymmetric (RS256/ES256 + JWKS) default.
fly secrets set SUPABASE_JWT_SECRET=<your-project's-legacy-jwt-secret>
# Optional — override the rate-limit/body-cap defaults above.
fly secrets set SOLVER_PREAUTH_RATE_PER_MIN=30 SOLVER_PREAUTH_RATE_BURST=10
fly secrets set SOLVER_RATE_PER_MIN=6 SOLVER_RATE_BURST=3
fly secrets set SOLVER_MAX_BODY_BYTES=5242880
```

## Run on your own computer

The deployed Fly service is sized for a low, occasional load (`fly.toml`: `cpu_kind = "shared"`,
`cpus = 2`) — fine for its cost, but a real CP-SAT solve is CPU-bound and scales with cores (see
`PERF_NOTES.md`). If you have a multi-core machine handy and only solve a few times a month, it's
faster to run a copy of the solver locally and point the app at it for those runs, instead of
waiting on the shared cloud instance.

```powershell
# Windows (PowerShell), from solver-service/
.\run-local.ps1
```

```bash
# macOS/Linux (bash), from solver-service/
./run-local.sh
```

Either script: creates/reuses `solver-service/.venv`, installs `requirements.txt` if needed, then
starts uvicorn bound to **127.0.0.1:8765 only** — reachable from this machine's own browser, never
from another device on the network. It prints "Optimizer running on this computer — leave this
window open" once it's up; `Ctrl+C` stops it.

In the app: **Settings → Optimizer → "Where to run"**, pick **This computer**. The Settings tab
polls `http://127.0.0.1:8765/health` and shows a live status line ("Connected · OR-Tools x · N
cores" or "Not running — start it with run-local.ps1/.sh"). If the local solver isn't reachable at
the moment you click Generate, the app falls back to Cloud (or the built-in generator, if Cloud
isn't configured either) with a toast — a generate request never fails just because the local
solver happened to be stopped.

Why auth is off and CORS still matters: the scripts set `SOLVER_AUTH_MODE=off`, which is safe
*because* the server binds only to the loopback interface (127.0.0.1) — nothing outside this
machine can ever open a connection to it, so there's no real remote caller to authenticate against.
`SOLVER_CORS_ORIGINS` is still set (to the deployed app's origin plus local dev origins) because
CORS is a browser-side restriction independent of auth: it's what stops some other, unrelated web
page open in the same browser from quietly POSTing to this local solver. See `run-local.ps1`'s
header comment for the full rationale, including why no `numWorkers` override is needed — the
server already defaults to every core on whatever machine it runs on (`solver/solve.py`'s
`_num_workers`), and the app's payload no longer pins a Fly-sized worker count (R9, 2026-09-27).

### Tests

```bash
.venv/Scripts/python.exe -m pytest -q
```

`tests/test_api_auth.py`, `tests/test_api_ratelimit.py`, and
`tests/test_api_limits.py` cover this gate specifically: off mode unchanged;
missing/expired/wrong-aud/wrong-role/wrong-iss/bad-signature tokens rejected;
valid HS256 and valid RS256/ES256-via-mocked-JWKS accepted; JWKS refetch on a
genuine key rotation but throttled to one attempt/60s against a flood of
unknown `kid`s; preauth limit blocks before `require_auth` ever runs (and
before any JWKS fetch); main limiter keys on `Fly-Client-IP`, never
`X-Forwarded-For`; idle buckets evicted; burst then 429 with `Retry-After`;
oversized body rejected, and still carries CORS headers.
