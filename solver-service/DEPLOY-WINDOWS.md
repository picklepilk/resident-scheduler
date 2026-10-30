# Hosting the solver on a Windows 11 PC behind Tailscale Funnel

Pool member, same shape as the Pi (`DEPLOY-PI.md`). Do this on each PC (`picklepower`, `picklebook`). Jobs backend stays `memory`: one solve at a time per process.

## Layout
- venv: `solver-service\.venv` (created by the installer).
- Config/secrets: `%APPDATA%\resident-solver\solver.env` (NEVER committed; template `deploy/windows/solver.env.example`).
- `deploy/windows/start-solver.ps1`: loads solver.env, refuses to start unless `SOLVER_AUTH_MODE=supabase`, `SOLVER_ALLOWED_EMAILS` and `SUPABASE_URL` are set (and not placeholders), runs uvicorn on **127.0.0.1:8766**. Never 0.0.0.0. 8766 is deliberate: `run-local.ps1` ("This computer", auth OFF) owns 8765; they must never collide.
- `deploy/windows/install-service.ps1`: Task Scheduler task `ResidentSolver` (at logon, hidden, restarts on failure, no time limit). Idempotent.

## Install
1. From `solver-service\deploy\windows`: `.\install-service.ps1`. First run creates the venv, copies the template to `%APPDATA%\resident-solver\solver.env`, and stops.
2. Edit solver.env (real `SUPABASE_URL`, `SOLVER_ALLOWED_EMAILS`). Re-run `.\install-service.ps1`; it registers and starts the task.
3. Funnel: `tailscale funnel --bg --https=10000 http://127.0.0.1:8766`. Funnel allows only 443/8443/10000; each PC has its own hostname so 10000 is fine. The tailnet ACL may need the `funnel` nodeAttr for these nodes.
4. Check: `curl https://<host>.<tailnet>.ts.net:10000/health` (shows `runner.host`).

## Stop / uninstall
- Stop: `Stop-ScheduledTask ResidentSolver`. Funnel off: `tailscale funnel --https=10000 off`.
- Remove: `.\install-service.ps1 -Uninstall` (keeps venv and solver.env).

## Host hint
`solver.env` sets `SOLVER_HOST_KIND=pc`: `/health` then also reports `host: "pc"`, `preferJobs: true` and `defaultBudgetSeconds` (env `SOLVER_DEFAULT_BUDGET_SECONDS`, default 300). The app's pool probe reads these, so Generate on this machine uses the jobs path and a 300 s budget. Leave it out and the app falls back to its 120 s default.

## Security posture
Same as the Pi: Supabase JWT verified via JWKS, then email must be in `SOLVER_ALLOWED_EMAILS`; `/health` open; per-user and preauth rate limits, 5 MiB body cap, CORS = Netlify origin only. Bind is loopback; only Funnel exposes it.

## Power
The task runs only while the user is logged in. An in-memory job dies if the PC sleeps; the app shows "lost" and you run again. Optional (owner's choice, not applied): keep awake while plugged in, e.g. `powercfg /change standby-timeout-ac 0`.

## App side (owner action)
- Netlify env `VITE_SOLVER_POOL`: `PicklePower=https://picklepower.<tailnet>.ts.net:10000,PickleBook=https://picklebook.<tailnet>.ts.net:10000,Pi=https://picklehub.<tailnet>.ts.net:10000`. Order = Auto order. Redeploy.
- Add each origin to `netlify.toml` CSP `connect-src`.
