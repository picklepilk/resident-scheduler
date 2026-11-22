#!/bin/sh
# deploy-wsl.sh [--ref origin/master] [--force] picklepower|picklebook|all
# Run from Git Bash on PicklePower, at the resident-scheduler repo root. Ships `solver-service/` at REF
# into the WSL solver on each host (~/rs-solver-live/solver-service, previous copy kept as
# ~/rs-solver-live.prev), copies ONLY deploy/windows/*.ps1 into %LOCALAPPDATA%\resident-solver
# (so switch-solver.ps1 / start-solver-wsl.ps1 exist where the ResidentSolver task points; the
# Windows build's code stays last known-good for `switch-solver.ps1 -To windows`), restarts the
# WSL uvicorn on 8766 and checks /health + new pid. Skips a host whose /health says busy:true unless
# --force. Rollback: rerun with --ref <older>, or `switch-solver.ps1 -To windows`.
# picklebook = ssh alias (Windows, cmd shell, home C:/Users/amade): only simple args cross ssh; helper
# scripts are scp'd and run by file name, never inline `sh -c '...'`.
set -eu
REF=origin/master FORCE=0 TARGET=
USAGE="usage: $0 [--ref REF] [--force] picklepower|picklebook|all"
while [ $# -gt 0 ]; do
  case $1 in
    --ref) REF=${2:?--ref needs a value}; shift 2 ;;
    --force) FORCE=1; shift ;;
    picklepower|picklebook|all) TARGET=$1; shift ;;
    *) echo "$USAGE" >&2; exit 2 ;;
  esac
done
[ -n "$TARGET" ] || { echo "$USAGE" >&2; exit 2; }
case $TARGET in all) HOSTS="picklepower picklebook" ;; *) HOSTS=$TARGET ;; esac

git fetch -q
COMMIT=$(git rev-parse --short "$REF")
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
git -c core.autocrlf=false archive --format=tar "$REF" solver-service > "$TMP/rs-solver-deploy.tar"
echo "[deploy] $REF = $COMMIT, tar $(wc -c < "$TMP/rs-solver-deploy.tar") bytes"

# WSL-side helper (runs inside Ubuntu): swap keeping the previous copy, pip only if requirements changed.
cat > "$TMP/rs-solver-deploy.sh" <<'SH'
set -eu
C=$1; L=$HOME/rs-solver-live; P=$HOME/rs-solver-live.prev; N=$HOME/rs-solver-live.new
rm -rf "$N"; mkdir -p "$N"
tar -xf /mnt/c/Users/amade/rs-solver-deploy.tar -C "$N"
sed -i 's/\r$//' "$N/solver-service/deploy/wsl/run-solver.sh"; chmod +x "$N/solver-service/deploy/wsl/run-solver.sh"
NEEDPIP=1
if [ -f "$L/solver-service/requirements.txt" ] && cmp -s "$L/solver-service/requirements.txt" "$N/solver-service/requirements.txt"; then NEEDPIP=0; fi
echo "$C" > "$N/DEPLOYED_COMMIT"
rm -rf "$P"; [ -d "$L" ] && mv "$L" "$P"
mv "$N" "$L"
if [ $NEEDPIP = 1 ]; then "$HOME/rs-venv/bin/pip" install -q -r "$L/solver-service/requirements.txt"; fi
echo "wsl ok $C"
SH

# Windows-side helper, run on each host with -Mode health|extract|start|clean.
cat > "$TMP/rs-solver-deploy.ps1" <<'PS'
param([string]$Mode)
$ErrorActionPreference = 'Stop'
$d = Join-Path $env:LOCALAPPDATA 'resident-solver'
if ($Mode -eq 'extract') {
  New-Item -ItemType Directory -Force $d | Out-Null
  # Windows tar explicitly: from Git Bash, PATH finds GNU tar first, which reads 'C:' as a remote host.
  & (Join-Path $env:SystemRoot 'System32\tar.exe') -xf (Join-Path $HOME 'rs-solver-deploy.tar') -C $d solver-service/deploy/windows
} elseif ($Mode -eq 'start') {
  Start-ScheduledTask ResidentSolver
} elseif ($Mode -eq 'clean') {
  Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $HOME 'rs-solver-deploy.*')
} else {
  try { $h = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8766/health -TimeoutSec 3).Content } catch { $h = 'DOWN' }
  $p = try { (Get-Process -Id (Get-NetTCPConnection -LocalPort 8766 -State Listen -EA Stop | Select-Object -First 1).OwningProcess).ProcessName } catch { 'none' }
  $a = try { (Get-ScheduledTask ResidentSolver -EA Stop).Actions[0].Arguments } catch { 'no-task' }
  "health=$h listener=$p task=$a"
}
PS

# run HOST CMD... : local for picklepower (Git Bash, no path mangling), ssh for picklebook (cmd shell).
# Each host command is bounded by timeout (timeout cannot wrap a shell function, so it lives in here).
run() { h=$1; shift; if [ "$h" = picklepower ]; then MSYS_NO_PATHCONV=1 timeout 300 "$@"; else timeout 300 ssh "$h" "$@"; fi; }
hps() { h=$1; shift; run "$h" powershell -NoProfile -ExecutionPolicy Bypass -File rs-solver-deploy.ps1 "$@"; }
put() { if [ "$1" = picklepower ]; then cp "$2" "$HOME/"; else scp -q "$2" "$1:"; fi; }  # put HOST FILE -> host home
pids() { run "$1" wsl.exe -d Ubuntu -e pgrep -f port.8766 | tr '\n\r' '  ' || true; }

deploy_host() {
  h=$1
  if [ "$h" = picklepower ]; then cd "$HOME"; fi
  for f in rs-solver-deploy.ps1 rs-solver-deploy.sh rs-solver-deploy.tar; do put "$h" "$TMP/$f"; done
  H=$(hps "$h" -Mode health); echo "[$h] before: $H"
  if echo "$H" | grep -Eq '"busy": *true' && [ $FORCE = 0 ]; then echo "[$h] SKIP busy (use --force)"; return 2; fi
  case $H in *start-solver-wsl.ps1*) ;; *) echo "[$h] WARN ResidentSolver task does not point at start-solver-wsl.ps1 (run switch-solver.ps1 -To wsl after deploy)" ;; esac
  OLD=$(pids "$h")
  run "$h" wsl.exe -d Ubuntu -e sh /mnt/c/Users/amade/rs-solver-deploy.sh "$COMMIT" || { echo "[$h] FAIL wsl swap"; return 1; }
  hps "$h" -Mode extract
  # Busy was checked above; kill only the resident uvicorn on 8766, the task relaunches it.
  run "$h" wsl.exe -d Ubuntu -e pkill -9 -f port.8766 || true
  sleep 3
  hps "$h" -Mode start || true
  i=0; H=DOWN
  while [ $i -lt 30 ]; do
    H=$(hps "$h" -Mode health); case $H in *health=DOWN*) i=$((i+1)); sleep 3 ;; *) break ;; esac
  done
  NEW=$(pids "$h")
  D=$(run "$h" wsl.exe -d Ubuntu -e cat /home/amade/rs-solver-live/DEPLOYED_COMMIT | tr -cd '0-9a-f')
  echo "[$h] commit=$COMMIT wsl=$D oldpid=[$OLD] newpid=[$NEW] $H"
  [ "$D" = "$COMMIT" ] || { echo "[$h] FAIL WSL copy is $D, expected $COMMIT"; return 1; }
  if [ -z "$NEW" ] || [ "$NEW" = "$OLD" ]; then
    case $H in
      *start-solver-wsl.ps1*) echo "[$h] FAIL no new solver pid"; return 1 ;;
      *) echo "[$h] WSL copy updated; task still on Windows launcher, run switch-solver.ps1 -To wsl"; return 0 ;;
    esac
  fi
  case $H in *health=DOWN*) echo "[$h] FAIL unhealthy"; return 1 ;; esac
}

OUT=$TMP/out; mkdir -p "$OUT"
run_host() { rc=0; deploy_host "$1" > "$OUT/$1.log" 2>&1 || rc=$?; run "$1" powershell -NoProfile -Command "Remove-Item -Force -EA SilentlyContinue rs-solver-deploy.*" >/dev/null 2>&1 || true; return $rc; }

rc=0
set -- $HOSTS
if [ $# -eq 2 ]; then
  run_host "$1" & PID1=$!
  run_host "$2" & PID2=$!
  wait $PID1 || rc=1
  wait $PID2 || rc=1
else
  run_host "$1" || rc=1
fi
for h in $HOSTS; do cat "$OUT/$h.log"; done
exit $rc
