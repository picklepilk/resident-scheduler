"""
Prototype Netlify Function: CP-SAT solver for resident scheduling.

Scope (prototype only — NOT the full rule engine from ResidentScheduler.jsx):
  - one shift (or off) per resident per day
  - per-shift per-day coverage {min, max}
  - per-resident total shift-count target (soft, minimized deviation)

Does NOT yet implement: circadian night-run/rest rules, seniority composition,
Journal Club caps, Grand Rounds stripping, trauma/peds split, jeopardy policy,
off-service availability windows. Those would need to be translated from
ResidentScheduler.jsx into CP-SAT constraints before this could replace the
in-browser greedy generateSchedule().

Request JSON body:
{
  "residents": ["r1", "r2", ...],
  "days": ["2026-08-01", "2026-08-02", ...],
  "shifts": ["POD-D", "POD-E", ...],
  "coverage": {"POD-D": {"min": 1, "max": 2}, ...},
  "eligibility": {"r1": ["POD-D", "MT-N", ...], ...},
  "targets": {"r1": 13, ...}
}

Response JSON body:
{ "status": "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "ERROR",
  "assignments": {"2026-08-01": {"POD-D": ["r1"], ...}, ...},
  "message": "..." }
"""
import json
from ortools.sat.python import cp_model


def handler(event, context):
    if event.get("httpMethod") != "POST":
        return _response(405, {"status": "ERROR", "message": "POST only"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"status": "ERROR", "message": "invalid JSON"})

    residents = body.get("residents", [])
    days = body.get("days", [])
    shifts = body.get("shifts", [])
    coverage = body.get("coverage", {})
    eligibility = body.get("eligibility", {})
    targets = body.get("targets", {})

    if not residents or not days or not shifts:
        return _response(400, {"status": "ERROR", "message": "residents, days, shifts are required"})

    model = cp_model.CpModel()

    # x[r, d, s] = 1 if resident r works shift s on day d
    x = {}
    for r in residents:
        elig = set(eligibility.get(r, shifts))
        for d in days:
            for s in shifts:
                if s in elig:
                    x[r, d, s] = model.NewBoolVar(f"x_{r}_{d}_{s}")

    def var(r, d, s):
        return x.get((r, d, s))

    # at most one shift per resident per day
    for r in residents:
        for d in days:
            vars_today = [var(r, d, s) for s in shifts if var(r, d, s) is not None]
            if vars_today:
                model.Add(sum(vars_today) <= 1)

    # coverage min/max per shift per day
    for d in days:
        for s in shifts:
            cov = coverage.get(s, {"min": 0, "max": 1})
            vars_shift = [var(r, d, s) for r in residents if var(r, d, s) is not None]
            if not vars_shift:
                continue
            model.Add(sum(vars_shift) >= cov.get("min", 0))
            model.Add(sum(vars_shift) <= cov.get("max", 1))

    # soft target: minimize total absolute deviation from each resident's target shift count
    deviation_terms = []
    for r in residents:
        target = targets.get(r)
        if target is None:
            continue
        total = sum(var(r, d, s) for d in days for s in shifts if var(r, d, s) is not None)
        dev = model.NewIntVar(-len(days), len(days), f"dev_{r}")
        model.Add(dev == total - target)
        abs_dev = model.NewIntVar(0, len(days), f"absdev_{r}")
        model.AddAbsEquality(abs_dev, dev)
        deviation_terms.append(abs_dev)

    if deviation_terms:
        model.Minimize(sum(deviation_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 20.0
    solver.parameters.num_search_workers = 4
    status = solver.Solve(model)

    status_name = solver.StatusName(status)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return _response(200, {"status": status_name, "assignments": {}, "message": "no feasible solution"})

    assignments = {}
    for d in days:
        assignments[d] = {}
        for s in shifts:
            assigned = [r for r in residents if var(r, d, s) is not None and solver.Value(var(r, d, s))]
            if assigned:
                assignments[d][s] = assigned

    return _response(200, {"status": status_name, "assignments": assignments, "message": ""})


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
