"""Ground truth for "where is this solve actually running": identity + live load of the process
doing the work. Reported in /health and stamped on every progress tick, so the app shows what the
worker says about itself, not what the client hopes it routed to. Never raises."""

from __future__ import annotations

import os
import platform
import socket


def _kind() -> str:
    if os.environ.get("MODAL_TASK_ID") or os.environ.get("MODAL_IMAGE_ID") or os.environ.get("MODAL_ENVIRONMENT"):
        return "modal"
    if os.environ.get("FLY_APP_NAME") or os.environ.get("FLY_MACHINE_ID"):
        return "fly"
    return "self-hosted"


def runner_info() -> dict:
    try:
        load1 = round(os.getloadavg()[0], 2)
    except (OSError, AttributeError):
        load1 = None
    try:
        host = socket.gethostname()
    except Exception:
        host = None
    return {
        "kind": _kind(),
        "host": host,
        "os": platform.system() or None,
        "arch": platform.machine() or None,
        "cpus": os.cpu_count() or 1,
        "pid": os.getpid(),
        "load1": load1,
    }
