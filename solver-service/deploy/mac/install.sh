#!/bin/sh
# Runs ON the Mac (macOS, Apple silicon). Expects solver-service/ already copied to
# ~/resident-solver/solver-service (push.sh does that). Installs a per-user LaunchAgent that keeps the
# solver on 127.0.0.1:8766. Not exposed by the Mac itself: picklehub reaches it through an ssh tunnel
# (deploy/pi/rs-solver-mac-relay.service) and publishes it on its Funnel at /rs-mac. Idempotent.
set -eu
BASE="$HOME/resident-solver"
SRC="$BASE/solver-service"
CFG="$BASE/solver.env"
LABEL="com.residentscheduler.solver"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[ -f "$SRC/requirements.txt" ] || { echo "Missing $SRC/requirements.txt (run push.sh)"; exit 1; }
UV="$HOME/.local/bin/uv"
if [ ! -x "$BASE/.venv/bin/python" ]; then
  if [ -x "$UV" ]; then "$UV" venv --quiet --python 3.12 "$BASE/.venv"; else python3 -m venv "$BASE/.venv"; fi
fi
if [ -x "$UV" ]; then
  VIRTUAL_ENV="$BASE/.venv" "$UV" pip install --quiet -r "$SRC/requirements.txt"
else
  "$BASE/.venv/bin/pip" install --quiet -r "$SRC/requirements.txt"
fi
mkdir -p "$BASE/runlog"

if [ ! -f "$CFG" ]; then
  cp "$SRC/deploy/mac/solver.env.example" "$CFG"
  # Point the runlog at this account's real home (the template has no usable default).
  sed "s|^SOLVER_RUNLOG_DIR=.*|SOLVER_RUNLOG_DIR=$BASE/runlog|" "$CFG" > "$CFG.tmp" && mv "$CFG.tmp" "$CFG"
  chmod 600 "$CFG"
  echo "Created $CFG -- fill in SUPABASE_URL + SOLVER_ALLOWED_EMAILS, then re-run."
  exit 0
fi

# Start script: load solver.env, refuse half-configured auth or placeholders, run uvicorn in the
# foreground under caffeinate (-i: no idle sleep while the solver lives; the Mac Studio is a desktop).
cat > "$BASE/start.sh" <<'EOF'
#!/bin/sh
cd "$HOME/resident-solver/solver-service" || exit 1
set -a; . "$HOME/resident-solver/solver.env"; set +a
if [ "${SOLVER_AUTH_MODE:-}" != supabase ] || [ -z "${SOLVER_ALLOWED_EMAILS:-}" ] || [ -z "${SUPABASE_URL:-}" ]; then
  echo "Refusing to start: need SOLVER_AUTH_MODE=supabase, SOLVER_ALLOWED_EMAILS and SUPABASE_URL"; exit 1
fi
case "$SUPABASE_URL$SOLVER_ALLOWED_EMAILS" in
  *YOUR-PROJECT*|*@example.org*) echo "Refusing to start: solver.env still has placeholder values"; exit 1 ;;
esac
exec /usr/bin/caffeinate -i "$HOME/resident-solver/.venv/bin/python" -m uvicorn api.main:app --host 127.0.0.1 --port 8766 --proxy-headers --forwarded-allow-ips=127.0.0.1
EOF
chmod 755 "$BASE/start.sh"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>$BASE/start.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$BASE/solver.log</string>
  <key>StandardErrorPath</key><string>$BASE/solver.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
# bootout returns before the job is gone; bootstrap then fails with "5: Input/output error". Retry.
for i in 1 2 3 4 5 6; do
  launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null && break
  sleep 2
done
sleep 5
curl -s -m 5 http://127.0.0.1:8766/health && echo
echo "Logs: $BASE/solver.log"
