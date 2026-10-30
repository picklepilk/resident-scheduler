# Hosting the solver on the Pi (picklehub) behind Tailscale Funnel

Written 2026-10-27. Alternative to Fly/Modal (`fly.toml`, `DEPLOY-MODAL.md`). Jobs backend stays
`memory` (default): `/solve` and `/jobs` both work, one solve at a time per process.

Windows PCs as additional pool members: see `DEPLOY-WINDOWS.md`.

## Layout
- venv: `solver-service/.venv` (`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`; ortools has an aarch64 wheel, 9.15.6755 verified).
- systemd **user** unit: `deploy/pi/resident-solver.service` -> `~/.config/systemd/user/`. Binds `127.0.0.1:8765` only, `Restart=on-failure`. `ExecStartPre` refuses to start unless `SOLVER_AUTH_MODE=supabase`, `SOLVER_ALLOWED_EMAILS` and `SUPABASE_URL` are set.
- Secrets/config: `~/.config/resident-solver/solver.env` (chmod 600, NEVER committed; template `deploy/pi/solver.env.example`).
- Funnel: `tailscale funnel --bg --https=10000 http://127.0.0.1:8765`. **Not 443/8443**: those carry Claude OS and Home Assistant (tailnet-only serves). Public URL: `https://picklehub.tail424ec7.ts.net:10000`. Stop: `tailscale funnel --https=10000 off`.

## Security posture
- Caller must present a Supabase session JWT (`Authorization: Bearer`), verified via JWKS (`SUPABASE_URL`), `aud`/`role`/`iss`/`exp` checked, then the email must be in `SOLVER_ALLOWED_EMAILS` (blocks `pending` accounts). `/health` is open.
- Preauth per-IP limit (behind Funnel every caller is 127.0.0.1, so effectively a global cap — set `SOLVER_PREAUTH_RATE_*` high enough for polling), per-user bucket (6/min, burst 3), 5 MiB body cap, CORS allowlist = Netlify origin only.
- `api/concurrency.py`: one solve at a time across `/solve` and `/jobs` (409 when busy; client falls back to the in-browser generator).

## Budget and jobs path (2026-10-28)
Set `SOLVER_HOST_KIND=pi` in `solver.env` (optional `SOLVER_DEFAULT_BUDGET_SECONDS`, default 300, clamped 10..1800). `/health` then adds `host: "pi"`, `preferJobs: true`, `defaultBudgetSeconds`; `jobs` stays `"memory"` (truthful). The app (`probeSolverHealth` in `src/lib/solverClient.js`) then labels "Cloud (Pi)", submits via `/jobs` + poll (no 6-minute synchronous request through Funnel), and uses the advertised budget (Deep Solve stays >= 300 s). Without the env var the Pi looks like Fly (120 s, sync `/solve`). A busy server answers 409 on submit; the app keeps the built-in result. Restart the unit after editing the env.

## App side (Netlify env, owner action)
Set `VITE_SOLVER_URL=https://picklehub.tail424ec7.ts.net:10000` and redeploy. CSP `connect-src` must list it (see `netlify.toml`).

## Ops
`systemctl --user status|restart resident-solver`, `journalctl --user -u resident-solver -f`. The Pi must stay on; if it is off the app silently uses the built-in generator.
