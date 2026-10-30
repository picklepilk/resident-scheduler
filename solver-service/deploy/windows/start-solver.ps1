# start-solver.ps1 -- run the solver as a Funnel-fronted pool member (Windows).
# Loads %APPDATA%\resident-solver\solver.env, refuses to start without auth config (mirrors the
# Pi unit's ExecStartPre guard), binds 127.0.0.1:8766 ONLY. 8766 on purpose: run-local.ps1 uses
# 8765 with auth OFF; the two must never share a port.
$ErrorActionPreference = 'Stop'
$serviceDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $env:APPDATA 'resident-solver\solver.env'

function Fail($msg) { [Console]::Error.WriteLine($msg); exit 1 }

if (-not (Test-Path $envFile)) { Fail "Missing $envFile (run install-service.ps1)" }

foreach ($line in Get-Content $envFile) {
  $t = $line.Trim()
  if ($t -eq '' -or $t.StartsWith('#')) { continue }
  $i = $t.IndexOf('=')
  if ($i -lt 1) { continue }
  $k = $t.Substring(0, $i).Trim()
  $v = $t.Substring($i + 1).Trim()
  Set-Item -Path "Env:$k" -Value $v
}

if ($env:SOLVER_AUTH_MODE -ne 'supabase') { Fail 'Refusing to start: SOLVER_AUTH_MODE must be supabase' }
if ([string]::IsNullOrWhiteSpace($env:SOLVER_ALLOWED_EMAILS)) { Fail 'Refusing to start: SOLVER_ALLOWED_EMAILS not set' }
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_URL)) { Fail 'Refusing to start: SUPABASE_URL not set' }
if ($env:SUPABASE_URL -match 'YOUR-PROJECT' -or $env:SOLVER_ALLOWED_EMAILS -match '@example\.org') {
  Fail 'Refusing to start: solver.env still has placeholder values'
}

$py = Join-Path $serviceDir '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { Fail "Missing venv at $py (run install-service.ps1)" }

Set-Location $serviceDir
& $py -m uvicorn api.main:app --host 127.0.0.1 --port 8766
exit $LASTEXITCODE
