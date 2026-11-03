# install-service.ps1 -- idempotent install of the "ResidentSolver" Task Scheduler task.
# Usage:  .\install-service.ps1             install/refresh
#         .\install-service.ps1 -Uninstall  remove the task (venv and solver.env are kept)
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$taskName = 'ResidentSolver'
$here = $PSScriptRoot
$serviceDir = Split-Path -Parent (Split-Path -Parent $here)
$cfgDir = Join-Path $env:APPDATA 'resident-solver'
$envFile = Join-Path $cfgDir 'solver.env'

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed task $taskName."
  } else {
    Write-Host "Task $taskName not present."
  }
  exit 0
}

$venvPython = Join-Path $serviceDir '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  Write-Host 'Creating solver-service\.venv ...'
  if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 -m venv (Join-Path $serviceDir '.venv')
  } else {
    & python -m venv (Join-Path $serviceDir '.venv')
  }
}
& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r (Join-Path $serviceDir 'requirements.txt')

if (-not (Test-Path $envFile)) {
  New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
  Copy-Item (Join-Path $here 'solver.env.example') $envFile
  Write-Host "Created $envFile from the template."
  Write-Host 'Fill in SUPABASE_URL and SOLVER_ALLOWED_EMAILS, then re-run this script.'
  exit 0
}

$ps = (Get-Process -Id $PID).Path   # powershell.exe or pwsh.exe, whichever runs this
$startScript = Join-Path $here 'start-solver.ps1'
$arg = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
# Account from the process token, not $env:USERDOMAIN: over SSH that reads "WORKGROUP" and
# Register-ScheduledTask fails with "No mapping between account names and security IDs".
$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $ps -Argument $arg -WorkingDirectory $serviceDir
# Logon starts it; the 5-min repeat restarts it if it was killed (RestartCount only covers launch
# failures, not a Ctrl-C/logoff kill). IgnoreNew makes the repeat a no-op while it is running.
$trigger = @(
  (New-ScheduledTaskTrigger -AtLogOn -User $me),
  (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5))
)
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Task $taskName registered and started (127.0.0.1:8766)."
Write-Host 'Next: tailscale funnel --bg --https=10000 http://127.0.0.1:8766'
