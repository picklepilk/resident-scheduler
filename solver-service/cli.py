"""CLI entry point for the solver, independent of the FastAPI service.

    python cli.py --input payload.json --output result.json
    python cli.py --input payload.json               # prints to stdout
"""

from __future__ import annotations

import argparse
import json
import sys

from solver.bound_probe import probe_bounds
from solver.io.payload import PayloadError, parse_payload
from solver.io.result import build_response
from solver.solve import solve


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Run the CP-SAT resident scheduler solver on a payload JSON file.")
    parser.add_argument("--input", required=True, help="Path to a request payload JSON file")
    parser.add_argument("--output", help="Path to write the response JSON (default: stdout)")
    parser.add_argument(
        "--bound-probe",
        action="store_true",
        help=(
            "Instead of a normal solve, run solver/bound_probe.py's probe_bounds() -- the "
            "CP-SAT-proven best achievable value and lower bound for coverageMiss/underTargetCore/"
            "deficitCoreUnits, each measured in isolation. Writes {\"probes\": {...}} and always "
            "exits 0 (a probe's own per-metric status, not process exit code, reports solvability)."
        ),
    )
    parser.add_argument(
        "--probe-seconds",
        type=float,
        default=60.0,
        help="Per-probe CP-SAT time budget in seconds (only used with --bound-probe).",
    )
    args = parser.parse_args(argv)

    with open(args.input, encoding="utf-8") as f:
        raw = json.load(f)

    try:
        payload = parse_payload(raw)
    except PayloadError as exc:
        print(f"Invalid payload: {exc}", file=sys.stderr)
        return 2

    if args.bound_probe:
        probes = probe_bounds(payload, args.probe_seconds)
        text = json.dumps({"probes": probes}, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(text)
        else:
            print(text)
        return 0

    result = solve(payload)
    response = build_response(payload.version, result)
    text = json.dumps(response, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)

    return 0 if result.status != "INFEASIBLE" else 1


if __name__ == "__main__":
    raise SystemExit(main())
