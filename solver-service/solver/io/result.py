"""Map a `solver.solve.SolveResult` into the response JSON shape from
docs/PAYLOAD_SCHEMA.md."""

from __future__ import annotations


def build_response(payload_version: int, result) -> dict:
    return {
        "version": payload_version,
        "engine": "cpsat",
        "status": result.status,
        "mode": result.mode,
        "schedule": result.schedule,
        "objective": result.objective_value,
        "solveTimeMs": result.solve_time_ms,
        "seed": result.seed,
        "report": result.report,
        "feasibility": result.feasibility,
        "validation": result.validation,
    }
