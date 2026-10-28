# Solver on the owner's Windows PCs (picklepower, picklebook) over Tailscale

Written 2026-10-28. For the repo owner only, as-needed heavy solves. The Pi stays the shared cloud
target (`DEPLOY-PI.md`); "This computer" (`run-local.ps1`) is unchanged.

## How it fits
- App side: Netlify env `VITE_EXTRA_SOLVER_TARGETS` adds picker entries "PicklePower"/"PickleBook".
  An entry appears only for a signed-in admin AND while its `/health` answers (probed every 10 s),
  so any device off your tailnet (the chief's included) never sees it.
- Network: `tailscale serve` (tailnet only, TLS). **Never `tailscale funnel`** on these PCs.
- Security boundary is the PC's server: `SOLVER_AUTH_MODE=supabase` verifies the Supabase session JWT,
  then the email must be in `SOLVER_ALLOWED_EMAILS` (your two emails, only in the PC's local
  `.env.remote`). The app sends the JWT exactly as for the Pi. No emails live in the repo or bundle.
- Solves go through `/jobs` + poll, default budget 300 s (`SOLVER_HOST_KIND=pc`). On any failure the
  app keeps the built-in result, same as the cloud path.

## Per-PC setup (repeat on picklepower and picklebook)
1. Install Python 3.11+ and Tailscale; sign in to the same tailnet. Clone the repo, open PowerShell in `solver-service\`.
2. `Copy-Item .env.remote.example .env.remote`, then edit it: `SUPABASE_URL` (same project as the app), `SOLVER_ALLOWED_EMAILS` (your two emails), `SOLVER_CORS_ORIGINS` (`https://residentscheduling.netlify.app`, optionally `,http://localhost:5173`). Keep `SOLVER_HOST_KIND=pc`.
3. `.\run-remote.ps1` (first run creates `.venv` and installs requirements). It refuses to start if the allowlist, Supabase URL or CORS origins are missing. Leave the window open.
4. In another PowerShell: `tailscale serve --bg --https=8765 http://127.0.0.1:8765`. Check with `tailscale serve status`. Remove with `tailscale serve --https=8765 off`.
5. Verify from any tailnet device: `curl https://<host>.tail424ec7.ts.net:8765/health` returns `{"status":"ok",...,"host":"pc","preferJobs":true,"defaultBudgetSeconds":300}`. From an off-tailnet device it must not resolve.
6. Optional start at login (Task Scheduler, run as your user):
   `schtasks /Create /TN "ResidentSolver" /SC ONLOGON /RL LIMITED /TR "powershell -NoProfile -WindowStyle Minimized -ExecutionPolicy Bypass -File C:\path\to\solver-service\run-remote.ps1"`
   (`tailscale serve --bg` persists across reboots on its own.) Remove: `schtasks /Delete /TN "ResidentSolver" /F`.

## Netlify (once)
- Env var: `VITE_EXTRA_SOLVER_TARGETS` = `PicklePower=https://picklepower.tail424ec7.ts.net:8765,PickleBook=https://picklebook.tail424ec7.ts.net:8765` (use the `name=url` form, not JSON: the value is injected inside an inline script string). Redeploy.
- CSP `connect-src` already lists both origins in `netlify.toml`. Changing a host name means editing both together.

## Notes
- Chrome may ask once to allow "local network access" for the site (tailnet addresses are private-range); allow it.
- One solve at a time per PC (409 when busy; the app keeps the built-in result). Per-user limit 6/min is fine for polling.
- Picker choice is device-local (`res_solver_target`), never synced. If a PC is selected and goes down, its entry stays visible with a red dot; Generate then falls back to the built-in result.
