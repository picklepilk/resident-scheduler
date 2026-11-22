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

## Hosting via WSL (optional, faster)
Same CP-SAT work runs ~2x faster under Linux than the Windows build (measured on PicklePower for EM Scheduler, 2026-11-20: presolve 59 s vs 123 s). WSL forwards 127.0.0.1 to Windows, so Funnel :10000 keeps proxying `127.0.0.1:8766` unchanged; the listener shows as `wslrelay`.

- Layout inside WSL (Ubuntu): venv `~/rs-venv` (`python3 -m venv --without-pip` + `get-pip.py`, because ensurepip is missing; then `pip install -r requirements.txt`), code `~/rs-solver-live/solver-service` with `~/rs-solver-live/DEPLOYED_COMMIT`, previous copy `~/rs-solver-live.prev`, env `~/.config/resident-solver/solver.env`, log and runlog under `~/.local/share/resident-solver/`.
- `deploy/wsl/run-solver.sh`: on every start copies `%APPDATA%\resident-solver\solver.env` (CR stripped, chmod 600), overrides `SOLVER_RUNLOG_DIR` (the Windows path is invalid in Linux), applies the same refusal guards as `start-solver.ps1`, then `exec uvicorn api.main:app --host 127.0.0.1 --port ${PORT:-8766}`. Test solver on a spare port: `RS_TEST_NOAUTH=1 PORT=8791 sh run-solver.sh` (auth off, accepted only on 8791-8794).
- `deploy/windows/start-solver-wsl.ps1`: task entry; exits 0 if 8766 already answers, else keeps `wsl.exe -d Ubuntu` in the foreground (task tracks it) and logs to `%LOCALAPPDATA%\resident-solver\solver.log`.
- `deploy/windows/switch-solver.ps1 -To windows|wsl [-Force]`: repoints the `ResidentSolver` task action, refuses when `/health` says `busy:true`, kills only the uvicorn with `--port 8766` (never by process name, never 8767), restarts the task, prints `/health`. Revert = `-To windows`.
- `deploy/wsl/deploy-wsl.sh [--ref origin/master] [--force] picklepower|picklebook|all`: run from Git Bash at the repo root. `git archive` of `solver-service`, swap into `~/rs-solver-live` (keeps `.prev`, pip only if requirements changed), mirror to `%LOCALAPPDATA%\resident-solver`, `pkill -9 -f port.8766` (after the busy check), task relaunches, confirms a new pid and `/health`. Skips a busy host unless `--force`. picklebook goes via `ssh picklebook` with helper files scp'd to its home (no inline quoting through cmd). Rollback: rerun with an older `--ref`, or `switch-solver.ps1 -To windows`.
- First time per host: build `~/rs-venv`, deploy once, then `switch-solver.ps1 -To wsl` from `%LOCALAPPDATA%\resident-solver\solver-service\deploy\windows`.
