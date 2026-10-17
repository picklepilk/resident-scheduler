# Deploying the solver on Modal

You run these steps; nothing here is automated. Modal replaces the Fly.io machine: per-second billing,
scale to zero, and solves run as spawned function calls that survive a closed tab or a stopped web container.

## Why jobs-only on Modal

A Modal web endpoint (including `@modal.asgi_app()`) caps a single HTTP request at 150 s, then answers 303 to a
result URL that CORS browser requests cannot follow. A default solve is ~120 s + overhead and Deep Solve is 300 s.
So on Modal `POST /solve` returns `400 {"error": "use_jobs"}` and the browser submits `POST /jobs` and polls
`GET /jobs/{id}`. `GET /health` reports `"jobs": "durable"` there (`"memory"` on Fly/local), which is how the app
decides which path to use.

## Steps

1. Install the CLI and log in (from `solver-service/`, in any Python env):
   ```
   pip install modal
   modal token new
   ```
2. Create the secret. `web` loads it as environment variables. Use your own values:
   ```
   modal secret create resident-scheduler-solver \
     SOLVER_AUTH_MODE=supabase \
     SUPABASE_URL=<Supabase dashboard -> Project Settings -> API -> Project URL> \
     SOLVER_CORS_ORIGINS=https://residentscheduling.netlify.app,http://localhost:5173
   ```
   Optional keys: `SUPABASE_JWT_SECRET` (only if the project still signs with legacy HS256: Project Settings -> API
   -> JWT Secret), `SOLVER_RATE_PER_MIN` / `SOLVER_RATE_BURST` (default 6 / 3, per-user bucket on `POST /jobs`),
   `SOLVER_MAX_BODY_BYTES` (default 5 MiB), `SOLVER_PREAUTH_RATE_PER_MIN` / `SOLVER_PREAUTH_RATE_BURST` (default 30 / 10, POST routes only), `SOLVER_POLL_RATE_PER_MIN` / `SOLVER_POLL_RATE_BURST` (default 300 / 60, per-IP bucket for job polling/cancel).
   - Job polling (`GET`/`DELETE /jobs/{id}`, ~every 2 s) has its own generous per-IP bucket, so no tuning is needed. Behind Modal's proxy the service can't see real client IPs (it ignores `X-Forwarded-For` on purpose), so callers may share one bucket; auth is the real gate.
   - `SOLVER_JOBS_BACKEND=modal` and `SOLVER_NUM_WORKERS=8` are set in `modal_app.py`'s images, not the secret.
3. Deploy (from `solver-service/`):
   ```
   modal deploy modal_app.py
   ```
   Copy the printed URL for `web` (`https://<workspace>--resident-scheduler-solver-web.modal.run`).
4. In Netlify set env `VITE_SOLVER_URL` to that URL (no trailing slash), then redeploy the site.
5. Smoke tests:
   - `curl <url>/health` returns `{"status":"ok", ..., "jobs":"durable"}` (first hit may take a few seconds: cold start).
   - Generate in the app with the cloud optimizer; the progress bar should advance by stage.
   - Long solve: start one, close the tab, reopen later; the job result must still be there.
6. Rollback: set `VITE_SOLVER_URL` back to the Fly URL and redeploy Netlify. Fly is untouched until step 7.
7. After a week of good behavior retire Fly: `fly scale count 0 -a <fly-app-name>`, later `fly apps destroy <fly-app-name>`.

## What gets created

- App `resident-scheduler-solver` with functions `solve_fn` (4 Modal cpu = 4 physical cores = 8 vCPU, 8 GiB,
  35 min timeout) and `web` (0.5 cpu, 1 GiB, `max_containers=1`, `@modal.concurrent(max_inputs=50)`).
- Dicts `solver-jobs-meta` (job id -> owner/budget, so only the submitting user can poll or cancel) and
  `solver-progress` (job id -> stage/elapsed/best). Dict entries expire after 7 days idle; spawned results are
  retained 7 days, after which a poll reports `lost`.
- `max_containers=1` on `web` keeps the in-process rate limiters effectively global. Don't raise it without moving
  them to a shared store.

## `SOLVER_NUM_WORKERS`

`os.cpu_count()` inside a container can report the host's cores, so "use every core" would oversubscribe CP-SAT.
`solver/solve.py` uses `SOLVER_NUM_WORKERS` whenever the payload's `config.numWorkers` is 0/absent (Modal sets 8 =
cpu 4 x 2 vCPU). An explicit positive `numWorkers` still wins, clamped to `os.cpu_count()`.

## Cost (checked 2026-10-17, re-check on modal.com/pricing)

CPU $0.0000131 per physical core-second, memory $0.00000222 per GiB-second, $30/month free credit. A 2-minute solve on
cpu=4 / 8 GiB is about $0.008; the always-cheap `web` container only bills while awake. At 2-3 long solves a month
plus routine generations this should stay inside the free credit.

## Alternative considered: Google Cloud Run

Would run the existing container unchanged, but CPU is throttled outside request handling (background work after the
response), and a long request hits the same timeout/durability concerns, so submit-then-poll jobs would still need a
durable store. Modal's `Function.spawn` gives that for free.

## Local notes

`modal_app.py` imports only `modal` at module level, so `python -c "import modal_app"` works with just `pip install modal`.
Fly and local `uvicorn` do not need `modal`; `ModalJobs` imports it lazily and only when `SOLVER_JOBS_BACKEND=modal`.
Spawn inputs are size-limited by Modal; if a very large block payload is ever rejected, trim the payload or store it in a `modal.Dict` and pass a key.
