# start-solver-wsl.ps1 -- Windows scheduled-task entry that runs the resident solver inside WSL (see
# ../wsl/run-solver.sh). Exits 0 when 127.0.0.1:8766 already answers (the task also refires every
# 5 minutes), otherwise keeps wsl.exe in the foreground so the task tracks it and the VM stays up.
# run-solver.sh itself copies %APPDATA%\resident-solver\solver.env into WSL (CR stripped).
$ErrorActionPreference = 'Stop'
$logFile = Join-Path $env:LOCALAPPDATA 'resident-solver\solver.log'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $logFile) | Out-Null
function Log($msg) { Add-Content -Path $logFile -Value ("{0:s} [wsl] {1}" -f (Get-Date), $msg) }
try {
  $h = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:8766/health
  if ($h.StatusCode -eq 200) { exit 0 }
} catch { }
$envFile = Join-Path $env:APPDATA 'resident-solver\solver.env'
if (-not (Test-Path $envFile)) { Log "Missing $envFile"; exit 1 }
Log 'starting solver in WSL (Ubuntu)'
$ErrorActionPreference = 'Continue'   # wsl.exe may write to stderr
wsl.exe -d Ubuntu -e sh -c 'sh ~/rs-solver-live/solver-service/deploy/wsl/run-solver.sh' 2>&1 |
  ForEach-Object { Add-Content -Path $logFile -Value "$_" }
$code = $LASTEXITCODE
Log "WSL solver exited ($code)"
exit $code
