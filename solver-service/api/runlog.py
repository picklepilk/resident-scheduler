"""Per-solve telemetry: one JSON line per finished solve, appended to `$SOLVER_RUNLOG_DIR/runs.jsonl`.

Off unless env `SOLVER_RUNLOG_DIR` is set. Records only counts, config flags, timings and report summaries
-- never resident ids/names, dates or the schedule. Every failure is swallowed (a log warning at most): telemetry
must never break a solve. Summarize with `python -I tools/runs_summary.py <dir>/runs.jsonl`.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

_lock = threading.Lock()
_SCALARS = (int, float, bool, str, type(None))


def runlog_path() -> Optional[Path]:
    d = os.environ.get("SOLVER_RUNLOG_DIR", "").strip()
    return Path(d) / "runs.jsonl" if d else None


def _scalars(d) -> Optional[dict]:
    if not isinstance(d, dict):
        return None
    return {k: v for k, v in d.items() if isinstance(v, _SCALARS)}


def build_record(payload, result, wall_seconds: float, source: str = "solve") -> dict:
    cfg = payload.config
    report = getattr(result, "report", None) or {}
    portfolio = report.get("portfolio") if isinstance(report.get("portfolio"), dict) else None
    stall = report.get("stall")
    return {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "host": os.environ.get("SOLVER_HOST_KIND") or socket.gethostname(),
        "cpuCount": os.cpu_count() or 1,
        "numWorkers": cfg.num_workers,
        "maxTimeSeconds": cfg.max_time_seconds,
        "deadlineSeconds": cfg.deadline_seconds,
        "portfolioK": (portfolio or {}).get("k", cfg.portfolio),
        "flags": {
            "outerLns": bool(cfg.outer_lns.enabled),
            "impliedCliques": bool(cfg.implied_cliques),
            "lexStrict": bool(cfg.lex_strict),
            "stallSeconds": cfg.stall_seconds,
            "shortlistSize": cfg.shortlist_size,
            "mode": cfg.mode,
        },
        "residents": len(payload.residents),
        "dates": len(payload.block.dates),
        "status": getattr(result, "status", None),
        "resultMode": getattr(result, "mode", None),
        "wallSeconds": round(float(wall_seconds), 2),
        "tiers": getattr(result, "tiers", None),
        "objective": getattr(result, "objective_value", None),
        "deadline": _scalars(report.get("deadline")),
        "stall": [_scalars(s) for s in stall] if isinstance(stall, list) else None,
        "outerLns": _scalars(report.get("outerLns")),
        "portfolioWinner": (portfolio or {}).get("winnerIndex"),
    }


def log_run(payload, result, wall_seconds: float, source: str = "solve") -> None:
    """Build + append one line; no-op when SOLVER_RUNLOG_DIR is unset; never raises."""
    try:
        path = runlog_path()
        if path is None:
            return
        line = json.dumps(build_record(payload, result, wall_seconds, source), separators=(",", ":"), default=str) + "\n"
        with _lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "a", encoding="utf-8") as f:
                f.write(line)
    except Exception as exc:  # noqa: BLE001
        log.warning("runlog write failed: %s", type(exc).__name__)
