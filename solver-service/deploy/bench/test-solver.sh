#!/bin/sh
# test-solver.sh -- start/stop a BENCH copy of the resident solver (auth off, loopback only).
#   sh test-solver.sh start <python> [port]   # run from the unpacked code dir (contains solver-service/)
#   sh test-solver.sh stop [port]
#   sh test-solver.sh status [port]
# Port must be 8791-8794 (never 8765/8766/8767: live resident + student-app solvers).
# Code: whatever tree this script sits in (deploy with `git archive HEAD solver-service | ssh host tar -x -C ~/rs-solver-bench`).
# Runlog: ~/rs-bench-runlog/runs.jsonl. Log: ~/rs-bench-runlog/solver-<port>.log.
set -e
cmd=$1; shift || true
case "$cmd" in start) PY=$1; PORT=${2:-8792} ;; *) PORT=${1:-8792} ;; esac
case "$PORT" in 8791|8792|8793|8794) ;; *) echo "refusing port $PORT (allowed 8791-8794)" >&2; exit 1 ;; esac
HERE=$(cd "$(dirname "$0")/../../.." && pwd)
RL="$HOME/rs-bench-runlog"; mkdir -p "$RL"
pidof_port() { pgrep -f "api.main:app --host 127.0.0.1 --port $PORT" || true; }
case "$cmd" in
  start)
    [ -n "$(pidof_port)" ] && { echo "already running on $PORT: $(pidof_port)"; exit 0; }
    [ -x "$PY" ] || { echo "no python at $PY" >&2; exit 1; }
    cd "$HERE/solver-service"
    SOLVER_AUTH_MODE=off SOLVER_RUNLOG_DIR="$RL" SOLVER_HOST_KIND=pc SOLVER_NUM_WORKERS= \
      nohup "$PY" -m uvicorn api.main:app --host 127.0.0.1 --port "$PORT" >> "$RL/solver-$PORT.log" 2>&1 < /dev/null &
    sleep 3; echo "started pid $(pidof_port) port $PORT code $(cat "$HERE/BENCH_COMMIT" 2>/dev/null)" ;;
  stop)
    for p in $(pidof_port); do kill "$p"; done; echo "stopped port $PORT" ;;
  status)
    echo "pid: $(pidof_port)"; curl -s -m 3 "127.0.0.1:$PORT/health" | cut -c1-160; echo ;;
  *) echo "usage: test-solver.sh start <python> [port] | stop [port] | status [port]" >&2; exit 1 ;;
esac
