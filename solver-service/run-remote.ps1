# run-remote.ps1 -- start the CP-SAT solver on this Windows PC so the OWNER's app can send solves to it
# over the Tailscale tailnet (picker entries "PicklePower"/"PickleBook"; see DEPLOY-PC.md).
#
# Differences from run-local.ps1 (which stays unchanged, auth off, same-machine browser only):
#   - Still binds 127.0.0.1:8765 ONLY. Remote reach comes from `tailscale serve` (tailnet only,
#     TLS, never funnel), which proxies to this loopback port.
#   - Auth is ON: SOLVER_AUTH_MODE=supabase, session JWT verified, then the email must be in
#     SOLVER_ALLOWED_EMAILS. The allowlist and CORS origins come from solver-service\.env.remote
#     (gitignored, local to this PC). The script REFUSES to start if the allowlist or SUPABASE_URL
#     is missing, so a misconfigured PC can never run open to the tailnet.
#   - SOLVER_HOST_KIND=pc (default) so /health advertises preferJobs + default budget.
#
# Usage: from solver-service/, run  .\run-remote.ps1   (Ctrl+C to stop)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot '.env.remote'
if (-not (Test-Path $envFile)) {
  Write-Error "Missing $envFile. Copy .env.remote.example to .env.remote and fill it in (see DEPLOY-PC.md)."
  exit 1
}

foreach ($line in Get-Content $envFile) {
  $t = $line.Trim()
  if (-not $t -or $t.StartsWith('#')) { continue }
  $i = $t.IndexOf('=')
  if ($i -lt 1) { continue }
  $name = $t.Substring(0, $i).Trim()
  $value = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
  Set-Item -Path "Env:$name" -Value $value
}

# Fail closed: never serve to the tailnet without verification + an explicit allowlist.
if ($env:SOLVER_AUTH_MODE -ne 'supabase') { Write-Error 'SOLVER_AUTH_MODE must be "supabase" in .env.remote'; exit 1 }
if (-not $env:SOLVER_ALLOWED_EMAILS) { Write-Error 'SOLVER_ALLOWED_EMAILS is required in .env.remote'; exit 1 }
if (-not $env:SUPABASE_URL -and -not $env:SUPABASE_JWT_SECRET) { Write-Error 'SUPABASE_URL (or SUPABASE_JWT_SECRET) is required in .env.remote'; exit 1 }
if (-not $env:SOLVER_CORS_ORIGINS) { Write-Error 'SOLVER_CORS_ORIGINS is required in .env.remote'; exit 1 }
if (-not $env:SOLVER_HOST_KIND) { $env:SOLVER_HOST_KIND = 'pc' }

$venvPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  Write-Host 'Creating solver-service\.venv (first run only)...'
  $pythonCmd = Get-Command py -ErrorAction SilentlyContinue
  if ($pythonCmd) { & py -3 -m venv (Join-Path $PSScriptRoot '.venv') } else { & python -m venv (Join-Path $PSScriptRoot '.venv') }
}
Write-Host 'Checking/installing solver-service requirements...'
& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r (Join-Path $PSScriptRoot 'requirements.txt')

Write-Host ''
Write-Host '============================================================'
Write-Host " Remote solver on $env:COMPUTERNAME -- leave this window open"
Write-Host ' http://127.0.0.1:8765  (health: /health)  auth: supabase + allowlist'
Write-Host ' Expose to your tailnet with:  tailscale serve --bg --https=8765 http://127.0.0.1:8765'
Write-Host ' Press Ctrl+C to stop.'
Write-Host '============================================================'
Write-Host ''

& $venvPython -m uvicorn api.main:app --host 127.0.0.1 --port 8765
