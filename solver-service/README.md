# solver-service

A standalone CP-SAT (Google OR-Tools) scheduling service for the [resident-scheduler](../) app.
It solves the same EM residency scheduling problem the app's own built-in JS generator
(`generateScheduleBest` in `src/ResidentScheduler.jsx`) solves greedily, but as a true constraint
program — useful when the JS generator's heuristic fill leaves coverage gaps a human then has to
patch by hand.

This service is **optional and additive**. The app works exactly as it always has with no solver
configured (`VITE_SOLVER_URL` unset) — Generate Schedule/Regenerate just use the built-in JS
generator, as before. When configured, the app tries the solver first and falls back to the JS
generator on any non-200 response, network failure, or timeout (`generateViaSolverOrLocal` in
`src/ResidentScheduler.jsx`). Nobody is ever blocked on this service being up.

## Contract

The full request/response shape is documented in **[docs/PAYLOAD_SCHEMA.md](docs/PAYLOAD_SCHEMA.md)**
— read that first if you're touching either side of the integration. Division of labor, in short:
the app resolves all policy (eligibility, coverage, seniority, fairness cohorts, etc.) into plain
data and ships it as JSON; this service only does the constraint solve. It never re-implements any
scheduling *policy* itself.

- `POST /solve` — the main endpoint. Body/response per PAYLOAD_SCHEMA.md.
- `GET /health` — `{ "status": "ok", "ortools": "<version>" }`.

## JS-side integration points (in the main app, not this directory)

| File | Role |
|---|---|
| `src/ResidentScheduler.jsx` — `buildSolverPayload()` | Resolves the app's whole rule set into a `POST /solve` request body. |
| `src/ResidentScheduler.jsx` — `mapSolverResult()` | Reshapes a `/solve` response into the app's own `{schedule, report}` shape — the same shape `generateScheduleBest()` returns, so both are interchangeable downstream. |
| `src/ResidentScheduler.jsx` — `generateViaSolverOrLocal()` | Tries the solver when configured, catches any failure, and falls back to `generateScheduleBest()`. This is the ONLY place that decides solver-vs-local. |
| `src/lib/solverClient.js` | Pure `fetch` wrapper (`solveRemote`) + the `VITE_SOLVER_URL` → `SOLVER_ENABLED` resolution, mirroring `supabaseClient.js`'s `%VITE_*%`-unresolved-token guard. |

A `response.feasibility` object (only present when `mode: 'relaxed'` — the solver could only reach
a feasible schedule by relaxing one or more rules) rides through `mapSolverResult` unchanged into
`block.generationReport.feasibility`, and surfaces in three places in the app:

- A **"BEST EFFORT — rules relaxed"** banner above the Schedule tab's grid.
- A **`FeasibilityReportCard`** on the Violations tab, above the regular Generation Report — lists
  every relaxed rule (grouped, with tier/resident/date/magnitude), the solver's own reported
  constraint conflicts, and any recommendations (a "Verified" recommendation means the solver
  re-solved with only that one change applied and confirmed it restores full feasibility).
- **Dashed amber cell outlines** on the Schedule grid itself, on every cell named in
  `feasibility.violations` — distinct from the plain red ring `validateAll` uses for ordinary
  violations, with a tooltip line naming the relaxed rule.

## Local dev

```bash
cd solver-service
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows; use .venv/bin/... on macOS/Linux
.venv/Scripts/python.exe -m uvicorn api.main:app --port 8000 --reload
```

Then, in the main app's own `.env` (see `.env.example` at the repo root):

```
VITE_SOLVER_URL=http://localhost:8000
```

Restart `npm run dev` after adding it — Vite only substitutes `%VITE_*%` tokens at build/dev-server
start. `GET http://localhost:8000/health` should return `{"status":"ok","ortools":"..."}` once the
service is up.

### Running the solver directly (no HTTP server)

`cli.py` runs one solve against a payload JSON file, independent of FastAPI — useful for debugging
a specific payload without a running server, and is exactly what the JS-side parity test below
shells out to:

```bash
.venv/Scripts/python.exe cli.py --input payload.json --output result.json
# or, to print the response to stdout instead:
.venv/Scripts/python.exe cli.py --input payload.json
```

### Python tests

```bash
.venv/Scripts/python.exe -m pytest
```

## Parity test (JS side)

`src/lib/solverParity.test.js`, in the main app's own test suite, builds a real payload from a
synthetic fixture via `buildSolverPayload`, shells out to this service's `cli.py` as a real
subprocess (not a mock), maps the result back via `mapSolverResult`, and asserts the app's own
`validateAll()` reports zero structural errors on the returned schedule. It's the one place that
verifies the JS and Python sides actually agree on what a valid schedule looks like, end to end.

It's gated behind an env var so it never runs as part of a plain `npm test` (no Python dependency
for anyone just working on the frontend):

```bash
# bash / git-bash
SOLVER_PARITY=1 npx vitest run src/lib/solverParity.test.js

# PowerShell
$env:SOLVER_PARITY=1; npx vitest run src/lib/solverParity.test.js
```

Requires `solver-service/.venv` to already exist (see "Local dev" above) — the test shells out to
`solver-service/.venv/Scripts/python.exe` directly, it does not create the venv for you.

(No `solve:parity` npm script is defined for this — `cross-env` isn't a dependency of the main
app, and a plain `SOLVER_PARITY=1 npm run ...` script would silently do nothing under Windows'
default `cmd.exe` script shell, which doesn't understand that inline-env-var syntax. Run the
command above directly instead.)

## Deploy

### Fly.io

```bash
cd solver-service
fly launch --no-deploy   # picks up fly.toml; you'll be prompted for an app name (see its own
                          # comment — "resident-scheduler-solver" is a placeholder, not reserved)
fly deploy
```

`fly.toml` sets `auto_stop_machines = true` / `min_machines_running = 0` — this service is only
ever called synchronously by the app's Generate Schedule action and has no state to keep warm, so
scaling to zero between uses is the right default for a low-traffic internal tool. A cold start
just makes the next solve request a few seconds slower; it never surfaces as an error (the client
has a generous timeout and falls back to the JS generator regardless).

Then set, in the main app's deploy environment (e.g. Netlify):

```
VITE_SOLVER_URL=https://<your-app-name>.fly.dev
```

**CORS**: `api/main.py` does not currently configure `CORSMiddleware`. A browser calling this
service directly from the app's own origin will hit a CORS preflight failure once deployed
cross-origin from the app — server-to-server calls (`curl`, etc.) are unaffected. See the
`fly.toml` CORS TODO comment for the fix (a `SOLVER_CORS_ORIGINS` env var, not `*`) — not applied
here since `api/` was under active development elsewhere at the time this was written.

### Alternates

Any Docker host works — this is a plain `Dockerfile` (Python 3.12-slim + uvicorn, `EXPOSE 8080`),
nothing Fly-specific in the image itself:

- **Render**: "New Web Service" → point at this repo/subdirectory → it detects the Dockerfile.
  Set the port to 8080 (matching the `Dockerfile`/`fly.toml`).
- **Google Cloud Run**: `gcloud run deploy --source solver-service --port 8080`. Cloud Run also
  scales to zero by default, matching the Fly config's posture above.

## Determinism caveat

A `status: "FEASIBLE"` result (the solver hit `config.maxTimeSeconds` before proving optimality) is
**not byte-replayable** — re-running the identical payload can return a different, equally-valid
schedule, because CP-SAT's search order isn't guaranteed stable across runs/versions/thread counts.
`status: "OPTIMAL"` results are stable in *value* (there's only one best objective) but not
necessarily in which specific among-equal-cost assignment is chosen. The response's own `seed`
field is diagnostic only (see PAYLOAD_SCHEMA.md) — **the returned `schedule` itself is the record**,
not something to regenerate from the seed later. This is a real difference from the JS generator's
own `generateScheduleBest`, which IS fully seed-replayable (see CLAUDE.md's "Generator quality
harness" section) — don't assume solver results share that property.

## Privacy

The payload this service receives carries opaque resident **ids** only (`r_abc`, etc.) — never
names. See PAYLOAD_SCHEMA.md's request shape and the JS-side test
(`solverPayload.test.js`'s "never puts a resident name anywhere in the payload" case) that asserts
this. This repo (and the main app's repo) are both public — don't add a name/PII field to either
side of this contract.
