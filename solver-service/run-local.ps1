# run-local.ps1 -- start the CP-SAT solver on THIS computer for "Run the optimizer on this
# computer" (see this repo's resident-scheduler app: Settings -> Optimizer -> "This computer").
#
# What this does, and why:
#   - Creates (or reuses) solver-service/.venv and installs requirements.txt into it, so this is
#     a one-command "just make it work" script, not a multi-step setup.
#   - Binds uvicorn to 127.0.0.1:8765 ONLY -- never 0.0.0.0. This means the server is reachable
#     from THIS machine's own browser only, never from another device on the network. Port 8765
#     is a fixed, arbitrary choice distinct from 8000 (common dev-server default, avoids clashes)
#     and from solver-service's own Fly deployment (which uses 8080 inside its container, see
#     fly.toml/Dockerfile) -- picking a different number here avoids any confusion between "the
#     cloud solver" and "the one on my laptop" if both ever run at once.
#   - Sets SOLVER_AUTH_MODE=off. This is safe BECAUSE of the bind address above: nothing outside
#     this machine's own loopback interface can ever reach this port, so there is no real caller
#     to authenticate. If this script is ever changed to bind anywhere other than 127.0.0.1, this
#     decision must be revisited -- auth-off + a non-loopback bind would be a real hole.
#   - Sets SOLVER_CORS_ORIGINS to the deployed app's origin plus the usual local dev origins, so
#     the browser's CORS preflight (and, for the deployed https origin specifically, Chrome's
#     Private Network Access preflight -- see api/pna.py) both succeed. CORS is still a real
#     restriction even with auth off: it's what stops an arbitrary web page the admin happens to
#     have open from quietly POSTing to this local solver in the admin's own browser.
#   - Leaves SOLVER_RATE_PER_MIN/SOLVER_MAX_BODY_BYTES etc. at their defaults (api/ratelimit.py,
#     api/limits.py) -- they're harmless here (usage is a handful of solves a month) and there's
#     no reason to diverge from the service's normal defaults.
#   - Does NOT set numWorkers/config.numWorkers anywhere -- that's a request-payload field the APP
#     sends (buildSolverPayload), not a server env var. The server already defaults to every core
#     on the machine it runs on (solver/solve.py's `_num_workers`: payload.config.numWorkers <= 0
#     means "use os.cpu_count()"), and the app no longer hardcodes a Fly-sized override (R9,
#     2026-09-27) -- so running this script on a 16-core laptop already uses all 16 cores with no
#     extra configuration on either side.
#
# Usage: from solver-service/, run  .\run-local.ps1
# Leave the window open while generating/deep-solving from the app; Ctrl+C to stop.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$venvPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
  Write-Host 'Creating solver-service\.venv (first run only)...'
  $pythonCmd = Get-Command py -ErrorAction SilentlyContinue
  if ($pythonCmd) {
    & py -3 -m venv (Join-Path $PSScriptRoot '.venv')
  } else {
    & python -m venv (Join-Path $PSScriptRoot '.venv')
  }
}

Write-Host 'Checking/installing solver-service requirements...'
& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r (Join-Path $PSScriptRoot 'requirements.txt')

# Local-only: no real caller can ever reach 127.0.0.1 from outside this machine, so auth-off here
# is not the same decision as auth-off on a public deployment -- see the file header above.
$env:SOLVER_AUTH_MODE = 'off'
$env:SOLVER_CORS_ORIGINS = 'https://residentscheduling.netlify.app,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173,http://localhost:5216,http://127.0.0.1:5216'

Write-Host ''
Write-Host '============================================================'
Write-Host ' Optimizer running on this computer -- leave this window open'
Write-Host ' http://127.0.0.1:8765  (health check: /health)'
Write-Host ' In the app: Settings -> Optimizer -> "This computer"'
Write-Host ' Press Ctrl+C to stop.'
Write-Host '============================================================'
Write-Host ''

& $venvPython -m uvicorn api.main:app --host 127.0.0.1 --port 8765
