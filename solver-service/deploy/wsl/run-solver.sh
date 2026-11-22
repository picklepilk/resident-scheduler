#!/bin/sh
# run-solver.sh -- run the resident CP-SAT solver inside WSL (Ubuntu) on a Windows host.
# Default bind 127.0.0.1:8766 (WSL forwards localhost to Windows, so Tailscale Funnel :10000 path /
# keeps proxying 127.0.0.1:8766 unchanged). Layout inside WSL: code ~/rs-solver-live/solver-service,
# venv ~/rs-venv, env ~/.config/resident-solver/solver.env (copied from Windows on every start).
# Test solver on a spare port with auth off: RS_TEST_NOAUTH=1 PORT=8791 sh run-solver.sh
# (RS_TEST_NOAUTH is refused unless PORT is 8791-8794; never allowed on 8766/8767/8765).
set -e
PORT="${PORT:-8766}"
LIVE="$HOME/rs-solver-live"
ENVF="$HOME/.config/resident-solver/solver.env"
RUNLOG="$HOME/.local/share/resident-solver"
mkdir -p "$RUNLOG/runlog" "$(dirname "$ENVF")"
LOG="$RUNLOG/solver.log"
fail() { echo "$(date -Is) $1" >> "$LOG"; echo "$1" >&2; exit 1; }

# Refresh env from the Windows copy (CR stripped, owner-only).
WINENV=
for f in /mnt/c/Users/*/AppData/Roaming/resident-solver/solver.env; do
  [ -f "$f" ] && { WINENV=$f; break; }
done
if [ -n "$WINENV" ]; then
  tr -d '\r' < "$WINENV" > "$ENVF.tmp" && chmod 600 "$ENVF.tmp" && mv "$ENVF.tmp" "$ENVF"
fi
[ -f "$ENVF" ] || fail "Missing $ENVF (no Windows solver.env under /mnt/c/Users/*/AppData/Roaming/resident-solver)"

set -a; . "$ENVF"; set +a
# The Windows path in the env file is invalid on Linux.
export SOLVER_RUNLOG_DIR="$RUNLOG/runlog"

if [ "${RS_TEST_NOAUTH:-}" = 1 ]; then
  case "$PORT" in 8791|8792|8793|8794) ;; *) fail "Refusing RS_TEST_NOAUTH on port $PORT (allowed 8791-8794)" ;; esac
  export SOLVER_AUTH_MODE=off
else
  [ "${SOLVER_AUTH_MODE:-}" = supabase ] || fail "Refusing to start: SOLVER_AUTH_MODE must be supabase"
  [ -n "${SOLVER_ALLOWED_EMAILS:-}" ] || fail "Refusing to start: SOLVER_ALLOWED_EMAILS not set"
  [ -n "${SUPABASE_URL:-}" ] || fail "Refusing to start: SUPABASE_URL not set"
  case "$SUPABASE_URL$SOLVER_ALLOWED_EMAILS" in
    *YOUR-PROJECT*|*@example.org*) fail "Refusing to start: solver.env still has placeholder values" ;;
  esac
fi

[ -x "$HOME/rs-venv/bin/python" ] || fail "Missing venv $HOME/rs-venv"
cd "$LIVE/solver-service" || fail "Missing $LIVE/solver-service"
echo "$(date -Is) starting (pid $$, port $PORT, commit $(cat "$LIVE/DEPLOYED_COMMIT" 2>/dev/null))" >> "$LOG"
exec "$HOME/rs-venv/bin/python" -m uvicorn api.main:app --host 127.0.0.1 --port "$PORT" >> "$LOG" 2>&1
