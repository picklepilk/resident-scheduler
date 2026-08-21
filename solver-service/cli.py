"""CLI entry point for the solver, independent of the FastAPI service.

    python cli.py --input payload.json --output result.json
    python cli.py --input payload.json               # prints to stdout
"""

from __future__ import annotations

import argparse
import json
import sys

from solver.io.payload import PayloadError, parse_payload
from solver.io.result import build_response
from solver.solve import solve


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Run the CP-SAT resident scheduler solver on a payload JSON file.")
    parser.add_argument("--input", required=True, help="Path to a request payload JSON file")
    parser.add_argument("--output", help="Path to write the response JSON (default: stdout)")
    args = parser.parse_args(argv)

    with open(args.input, encoding="utf-8") as f:
        raw = json.load(f)

    try:
        payload = parse_payload(raw)
    except PayloadError as exc:
        print(f"Invalid payload: {exc}", file=sys.stderr)
        return 2

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
