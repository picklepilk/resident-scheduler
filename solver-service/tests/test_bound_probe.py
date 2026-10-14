"""solver/bound_probe.py: measures the CP-SAT-provable best achievable value
and lower bound for coverageMiss/underTargetCore/deficitCoreUnits,
independently per metric, to tell apart a "structural" JS-generator gap
(roster genuinely can't do better) from one the greedy generator merely
left on the table. See that module's own docstring for the full design.
"""

from __future__ import annotations

from solver.bound_probe import probe_bounds
from solver.io.payload import parse_payload
from tests.helpers import load_fixture

PROBE_SECONDS = 5  # fixtures here are tiny (1-5 residents, 1-5 dates) -- fast to prove optimal.


def test_probe_bounds_covers_all_three_metrics_with_the_documented_shape():
    payload = parse_payload(load_fixture("small_feasible.json"))
    probes = probe_bounds(payload, PROBE_SECONDS)

    assert set(probes) == {"coverageMiss", "underTargetCore", "deficitCoreUnits"}
    for name, p in probes.items():
        assert set(p) >= {"status", "value", "bound", "timeMs"}, name
    assert "unfilledBySlot" in probes["coverageMiss"]


def test_bound_never_exceeds_value_on_any_probe():
    for fixture in ("small_feasible.json", "cross_midnight.json", "infeasible_coverage.json"):
        payload = parse_payload(load_fixture(fixture))
        probes = probe_bounds(payload, PROBE_SECONDS)
        for name, p in probes.items():
            if p["value"] is not None and p["bound"] is not None:
                assert p["bound"] <= p["value"], f"{fixture}/{name}: bound {p['bound']} > value {p['value']}"


def test_trivially_coverable_payload_has_zero_coverage_miss_value_and_bound():
    """small_feasible.json: D's coverage min is 1/day, 3 residents easily
    cover every date -- the best achievable AND provably-optimal coverageMiss
    is 0, with no unfilled slots at all.
    """
    payload = parse_payload(load_fixture("small_feasible.json"))
    probes = probe_bounds(payload, PROBE_SECONDS)

    cov = probes["coverageMiss"]
    assert cov["status"] in ("OPTIMAL", "FEASIBLE")
    assert cov["value"] == 0
    assert cov["bound"] == 0
    assert cov["unfilledBySlot"] == []


def test_uncoverable_min_gives_a_nonzero_proven_lower_bound():
    """infeasible_coverage.json: only r1/r2 are eligible for D that date, and
    D has no per-resident conflict (it's the only shift defined), so at most
    2 assignments can ever cover it -- min is 3, so AT LEAST 1 unit of
    coverageMiss is unavoidable no matter what the rest of a schedule looks
    like. CP-SAT should both find (value) and prove (bound) exactly that.
    """
    payload = parse_payload(load_fixture("infeasible_coverage.json"))
    probes = probe_bounds(payload, PROBE_SECONDS)

    cov = probes["coverageMiss"]
    assert cov["value"] is not None and cov["value"] >= 1
    assert cov["bound"] is not None and cov["bound"] >= 1
    assert len(cov["unfilledBySlot"]) == 1
    assert cov["unfilledBySlot"][0] == {"shiftId": "D", "dateStr": "2026-04-06", "shortBy": 1}


def test_forces_elastic_coverage_even_when_payload_requests_hard_then_elastic():
    """infeasible_coverage_hard.json is byte-identical to infeasible_coverage
    .json except `coverageMinMode: "hard_then_elastic"` -- under THAT mode,
    pass 1 builds no slack var at all and would go straight to INFEASIBLE
    (solver/model/coverage.py's own docstring). bound_probe must override
    this internally so the probe still runs and reports a real value/bound,
    identical to the elastic-mode fixture above.
    """
    raw = load_fixture("infeasible_coverage_hard.json")
    payload = parse_payload(raw)
    assert payload.config.coverage_min_mode == "hard_then_elastic"

    probes = probe_bounds(payload, PROBE_SECONDS)

    cov = probes["coverageMiss"]
    assert cov["value"] == 1
    assert cov["bound"] == 1
    # The original payload object must be left untouched -- bound_probe's own
    # internal override works on a copy, never the caller's payload.
    assert payload.config.coverage_min_mode == "hard_then_elastic"


def test_under_target_core_probes_are_zero_when_no_em_core_residents_exist():
    """small_feasible.json has r1 as its only isEmCore resident with a
    target -- but the fixture's own 3-every-5-days coverage lets r1 easily
    reach its target of 3, so both core probes should prove 0.
    """
    payload = parse_payload(load_fixture("small_feasible.json"))
    probes = probe_bounds(payload, PROBE_SECONDS)

    assert probes["underTargetCore"]["value"] == 0
    assert probes["underTargetCore"]["bound"] == 0
    assert probes["deficitCoreUnits"]["value"] == 0
    assert probes["deficitCoreUnits"]["bound"] == 0


def test_probe_bounds_does_not_mutate_the_caller_s_payload():
    """probe_bounds must never hard-pin anything onto the real model or
    mutate the payload it's handed -- re-running it twice on the same
    payload object must be idempotent and side-effect free.
    """
    payload = parse_payload(load_fixture("small_feasible.json"))
    first = probe_bounds(payload, PROBE_SECONDS)
    second = probe_bounds(payload, PROBE_SECONDS)
    assert first["coverageMiss"]["value"] == second["coverageMiss"]["value"]
    assert first["coverageMiss"]["bound"] == second["coverageMiss"]["bound"]
