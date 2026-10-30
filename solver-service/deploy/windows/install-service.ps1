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
$me = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute $ps -Argument $arg -WorkingDirectory $serviceDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $me
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Task $taskName registered and started (127.0.0.1:8766)."
Write-Host 'Next: tailscale funnel --bg --https=10000 http://127.0.0.1:8766'
