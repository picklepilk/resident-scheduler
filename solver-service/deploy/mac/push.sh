#!/bin/sh
# Run from the repo root on a machine that can ssh to the Mac: copies solver-service/ to
# ~/resident-solver/solver-service on the Mac and runs deploy/mac/install.sh there.
# Usage: sh solver-service/deploy/mac/push.sh user@host
set -eu
MAC="${1:?usage: push.sh user@host}"
tar -C solver-service --exclude .venv --exclude __pycache__ --exclude .pytest_cache -czf - . \
  | ssh "$MAC" 'mkdir -p ~/resident-solver/solver-service && tar -C ~/resident-solver/solver-service -xzf -'
ssh "$MAC" 'sh ~/resident-solver/solver-service/deploy/mac/install.sh'
