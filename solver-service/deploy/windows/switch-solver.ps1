# switch-solver.ps1 -To wsl|windows -- repoint the ResidentSolver scheduled task at the WSL or the
# Windows solver, stop the resident uvicorn on 8766 (only), restart the task, print /health.
# Refuses when /health on 127.0.0.1:8766 says busy:true (a solve is running) unless -Force.
# Safe to run twice. Never touches 8767 (EM solver) or 8765 (run-local).
param([Parameter(Mandatory)][ValidateSet('wsl', 'windows')][string]$To, [switch]$Force)
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot $(if ($To -eq 'wsl') { 'start-solver-wsl.ps1' } else { 'start-solver.ps1' })
if (-not (Test-Path $script)) { throw "Missing $script" }
$h = $null
try { $h = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8766/health -TimeoutSec 3).Content } catch { }  # not answering = nothing to protect
if ($h -and $h -match '"busy"\s*:\s*true' -and -not $Force) { throw "Solver busy, not switching (use -Force): $h" }
$task = Get-ScheduledTask ResidentSolver
$act = $task.Actions[0]
# Swap only the script file name: the action may be `conhost.exe --headless powershell.exe ... -File <script>`,
# so rewriting the whole argument string would break the launcher.
if ($act.Arguments -notmatch 'start-solver(-wsl)?\.ps1') { throw "Unexpected task arguments: $($act.Arguments)" }
$act.Arguments = $act.Arguments -replace 'start-solver(-wsl)?\.ps1', (Split-Path -Leaf $script)
Stop-ScheduledTask ResidentSolver
Set-ScheduledTask -TaskName ResidentSolver -Action $act | Out-Null
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
  Where-Object { $_.CommandLine -match 'uvicorn' -and $_.CommandLine -match '--port 8766(\s|$)' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
# One token, no shell: Windows PowerShell 5 drops embedded double quotes when calling native exes, which
# once turned this into `pkill -f uvicorn` and killed the EM solver (8767) too. port.8766 matches only ours.
wsl.exe -d Ubuntu -e pkill -f 'port.8766'
Start-Sleep 3
Start-ScheduledTask ResidentSolver
$h = 'DOWN'
for ($i = 0; $i -lt 40; $i++) { Start-Sleep 3; try { $h = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8766/health -TimeoutSec 3).Content; break } catch { } }
"ResidentSolver now runs: $To"; "health $h"
