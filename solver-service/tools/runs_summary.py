"""Summarize the solver runs log. Usage: python -I tools/runs_summary.py [runs.jsonl ...]

Groups by host + maxTimeSeconds + flags. Stdlib only. Default path: $SOLVER_RUNLOG_DIR/runs.jsonl.
"""

import json
import os
import statistics
import sys
from pathlib import Path


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args:
        d = os.environ.get("SOLVER_RUNLOG_DIR")
        if not d:
            print("usage: runs_summary.py <runs.jsonl ...> (or set SOLVER_RUNLOG_DIR)")
            return 2
        args = [str(Path(d) / "runs.jsonl")]
    groups: dict = {}
    for p in args:
        try:
            fh = open(p, encoding="utf-8")
        except OSError:
            continue
        with fh:
            for line in fh:
                try:
                    r = json.loads(line)
                    f = r.get("flags") or {}
                    flags = ",".join(k for k in ("outerLns", "impliedCliques", "lexStrict") if f.get(k)) or "-"
                    key = (str(r.get("host")), str(r.get("maxTimeSeconds")), flags, f"k={r.get('portfolioK')}")
                except (ValueError, AttributeError):
                    continue
                groups.setdefault(key, []).append(r)
    print(f"{'host':<14}{'budget':>7} {'flags':<34}{'k':<6}{'n':>4}{'med_wall':>10}{'max_wall':>10}{'optimal':>8}{'dl_hit':>7}{'workers':>8}{'med_setup':>10}  med_stage_seconds")
    for (host, budget, flags, k), rs in sorted(groups.items()):
        walls = [r["wallSeconds"] for r in rs if isinstance(r.get("wallSeconds"), (int, float))]
        opt = sum(1 for r in rs if r.get("status") == "OPTIMAL")
        hit = sum(1 for r in rs if (r.get("deadline") or {}).get("hit"))
        med = f"{statistics.median(walls):.1f}" if walls else "-"
        mx = f"{max(walls):.1f}" if walls else "-"
        ws = sorted({r["effectiveWorkers"] for r in rs if isinstance(r.get("effectiveWorkers"), int)})
        wtxt = "/".join(map(str, ws)) or "-"
        setups = [r["setupSeconds"] for r in rs if isinstance(r.get("setupSeconds"), (int, float))]
        stxt = f"{statistics.median(setups):.1f}" if setups else "-"
        per: dict = {}
        for r in rs:
            for n, v in (r.get("stageSeconds") or {}).items():
                if isinstance(v, (int, float)):
                    per.setdefault(n, []).append(v)
        ptxt = " ".join(f"{n}={statistics.median(v):.1f}" for n, v in per.items()) or "-"
        print(f"{host:<14}{budget:>7} {flags:<34}{k:<6}{len(rs):>4}{med:>10}{mx:>10}{opt:>8}{hit:>7}{wtxt:>8}{stxt:>10}  {ptxt}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
