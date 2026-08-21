from solver.io.payload import parse_payload
from solver.io.result import build_response
from solver.solve import solve
from tests.helpers import load_fixture


def test_small_feasible_solves_and_meets_coverage_min():
    payload = parse_payload(load_fixture("small_feasible.json"))
    result = solve(payload)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.mode == "strict"
    # D's coverage min is 1 every day -- elastic slack should sit at 0 given
    # 3 residents easily cover 5 mandatory D-shifts.
    assert result.report["unfilled"] == []

    for date_str in payload.block.dates:
        staffed = sum(1 for r in payload.residents if schedule_has(result.schedule, r.id, date_str, "D"))
        assert staffed == 1


def test_cross_midnight_rest_forces_reassignment():
    payload = parse_payload(load_fixture("cross_midnight.json"))
    result = solve(payload)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    # r1 is locked into the night shift on day 1...
    assert result.schedule["r1"]["2026-02-02"] == "N"
    # ...which makes the very next morning's day shift illegal for r1 (rule 17,
    # required gap = the night shift's own 9h duration; actual gap here is
    # negative -- the day shift starts before the night shift even ends).
    assert result.schedule.get("r1", {}).get("2026-02-03") != "D"
    # coverage min=1 for D that date, and r2 is the only other eligible
    # resident, so r2 must cover it.
    assert result.schedule["r2"]["2026-02-03"] == "D"
    assert result.validation["passed"] is True


def test_build_response_shape_matches_schema():
    payload = parse_payload(load_fixture("small_feasible.json"))
    result = solve(payload)
    response = build_response(payload.version, result)

    for key in ("version", "engine", "status", "mode", "schedule", "objective", "solveTimeMs", "seed", "report", "feasibility", "validation"):
        assert key in response
    assert response["engine"] == "cpsat"
    assert response["mode"] == "strict"
    assert response["feasibility"] is None  # strict-mode results carry no feasibility report


def schedule_has(schedule: dict, resident_id: str, date_str: str, shift_id: str) -> bool:
    return schedule.get(resident_id, {}).get(date_str) == shift_id
