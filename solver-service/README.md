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
| `SUPABASE_URL` | unset | Your Supabase project URL. Required in `supabase` mode if any caller's token is RS256/ES256 (Supabase's current default) — used to fetch `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. |
| `SUPABASE_JWT_SECRET` | unset | Legacy HS256 shared secret, if your project still issues HS256 tokens. Optional — set it alongside `SUPABASE_URL` to accept both signing schemes at once. |
| `SOLVER_RATE_PER_MIN` | `6` | Token-bucket refill rate per caller (JWT `sub`, or client IP when auth is off). |
| `SOLVER_RATE_BURST` | `3` | Token-bucket capacity (how many requests can fire back-to-back before the rate kicks in). |
| `SOLVER_MAX_BODY_BYTES` | `5242880` (5 MiB) | Hard cap on request body size, checked against the real byte stream (not just a trusted `Content-Length` header). |

The rate limiter is **in-memory and per-process**. Fly can run more than one
machine for this service; each machine holds its own bucket table, so the
effective global cap under N machines is `SOLVER_RATE_PER_MIN × N`, not a
hard ceiling. Fine for an internal tool behind Supabase auth with a handful
of callers — would need a shared store (e.g. Redis) to enforce a true global
rate.

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
"authenticated"`, `role == "authenticated"`. Any failure — missing header,
malformed token, bad signature, expired, wrong `aud`/`role`, or an
unreachable JWKS — comes back as a flat `401`; the client already treats any
non-200 from `/solve` as "fall back to local" (see `CLAUDE.md`'s solver
section), so no new client-side error handling is needed to be safe, only to
be functional once the real token wiring lands.

### Fly secrets (set by hand, not run here)

```bash
fly secrets set SOLVER_AUTH_MODE=supabase
fly secrets set SUPABASE_URL=https://<project-ref>.supabase.co
# Only if your project still issues HS256 tokens; omit if you're on the
# current asymmetric (RS256/ES256 + JWKS) default.
fly secrets set SUPABASE_JWT_SECRET=<your-project's-legacy-jwt-secret>
# Optional — override the rate-limit/body-cap defaults above.
fly secrets set SOLVER_RATE_PER_MIN=6 SOLVER_RATE_BURST=3
fly secrets set SOLVER_MAX_BODY_BYTES=5242880
```

### Tests

```bash
.venv/Scripts/python.exe -m pytest -q
```

`tests/test_api_auth.py`, `tests/test_api_ratelimit.py`, and
`tests/test_api_limits.py` cover this gate specifically (off mode unchanged;
missing/expired/wrong-aud/wrong-role/bad-signature tokens rejected; valid
HS256 and valid RS256/ES256-via-mocked-JWKS accepted; burst then 429 with
`Retry-After`; oversized body rejected).
