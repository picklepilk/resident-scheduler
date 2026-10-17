#!/usr/bin/env bash
# run-local.sh -- start the CP-SAT solver on THIS computer for "Run the optimizer on this
# computer" (see this repo's resident-scheduler app: Settings -> Optimizer -> "This computer").
# Bash equivalent of run-local.ps1 -- see that file's header comment for the full rationale
# (why 127.0.0.1-only + auth off is safe, why port 8765, why no numWorkers override is needed).
#
# Usage: from solver-service/, run  ./run-local.sh
# Leave the terminal open while generating/deep-solving from the app; Ctrl+C to stop.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

VENV_DIR=".venv"
if [ "$(uname -s | cut -c1-5)" = "MINGW" ] || [ "$(uname -s | cut -c1-4)" = "MSYS" ]; then
  VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
else
  VENV_PYTHON="$VENV_DIR/bin/python"
fi

if [ ! -x "$VENV_PYTHON" ]; then
  echo "Creating solver-service/.venv (first run only)..."
  PY=python3
  command -v python3 >/dev/null 2>&1 || PY=python
  "$PY" -m venv "$VENV_DIR"
fi

echo "Checking/installing solver-service requirements..."
"$VENV_PYTHON" -m pip install --quiet --upgrade pip
"$VENV_PYTHON" -m pip install --quiet -r requirements.txt

# Local-only: bound to 127.0.0.1 below, so nothing outside this machine can ever reach this port --
# auth-off here is not the same decision as auth-off on a public deployment. See run-local.ps1's
# header comment for the full rationale.
export SOLVER_AUTH_MODE=off
export SOLVER_CORS_ORIGINS="https://residentscheduling.netlify.app,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173,http://localhost:5216,http://127.0.0.1:5216"

echo ""
echo "============================================================"
echo " Optimizer running on this computer -- leave this window open"
echo " http://127.0.0.1:8765  (health check: /health)"
echo " In the app: Settings -> Optimizer -> \"This computer\""
echo " Press Ctrl+C to stop."
echo "============================================================"
echo ""

exec "$VENV_PYTHON" -m uvicorn api.main:app --host 127.0.0.1 --port 8765
