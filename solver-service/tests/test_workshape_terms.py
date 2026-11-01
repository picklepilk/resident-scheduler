"""objective.py's workShape extras (area churn, interior 2-day runs, off adjacency), mirroring
scheduleQuality.js workShapePenalty. Weights 25 each (JS unit x 0.5 x 50)."""

import random
from datetime import date, timedelta

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model import objective as objective_mod
from solver.model.objective import TermGroup
from solver.model.variables import build_variables
from tests.helpers import make_payload, make_resident

SHIFTS = {
    "POD-D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "PED-D": {"startH": 7, "durationH": 9, "type": "day", "area": "PED"},
    "FLX-D": {"startH": 7, "durationH": 9, "type": "day", "area": "FLEX"},
}
W = {"areaChurnCost": 25, "pairRunCost": 25, "offAdjacencyCost": 25}


def _dates(n):
    d0 = date(2026, 1, 5)
    return [(d0 + timedelta(days=i)).isoformat() for i in range(n)]


def _build(n=8, off=(), shifts=SHIFTS):
    dates = _dates(n)
    res = make_resident("r1")
    if off:
        res["offDates"] = list(off)
    raw = make_payload(
        residents=[res], shifts=shifts, dates=dates,
        eligible={"r1": {d: list(shifts) for d in dates}},
        coverage={s: {d: {"min": 0, "max": 1} for d in dates} for s in shifts},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    return dates, payload, model, store


def _cost(picks, n=8, off=(), w=W, shifts=SHIFTS):
    dates, payload, model, store = _build(n, off, shifts)
    for i, d in enumerate(dates):
        for sid in shifts:
            v = store.get_x("r1", sid, d)
            if v is not None:
                model.add(v == (1 if picks.get(i) == sid else 0))
        model.add(store.work[("r1", d)] == (1 if i in picks else 0))  # work link lives in coverage/rest modules
    group = TermGroup("t")
    objective_mod._add_work_shape_extras(model, payload, store, group, w)
    expr = sum((c * e for c, e in group.terms), start=0)
    model.minimize(expr)
    solver = cp_model.CpSolver()
    status = solver.solve(model)
    assert solver.status_name(status) == "OPTIMAL"
    return int(solver.value(expr))


def js_reference(sched, dates, off, w=W):
    """Literal port of the JS loop (sched: date index -> shift id), scaled by weights."""
    n = len(dates)
    last = n - 1
    runs = []
    i = 0
    while i < n:
        if i not in sched:
            i += 1
            continue
        j = i
        while j + 1 < n and (j + 1) in sched:
            j += 1
        runs.append((i, j))
        i = j + 1
    total = 0
    for s, e in runs:
        if s > 0 and e < last:
            if e - s + 1 == 2:
                total += w["pairRunCost"]
            for k in range(s, e):
                a, b = SHIFTS[sched[k]]["area"], SHIFTS[sched[k + 1]]["area"]
                if a != b:
                    total += w["areaChurnCost"]
    offs = set(off)
    for k in sched:
        d = date.fromisoformat(dates[k])
        if (d - timedelta(days=1)).isoformat() in offs or (d + timedelta(days=1)).isoformat() in offs:
            total += w["offAdjacencyCost"]
    return total


def test_churn_charged_inside_interior_run():
    assert _cost({2: "POD-D", 3: "PED-D", 4: "PED-D"}) == 25 + 0  # churn once; run len 3 no pair


def test_churn_exempt_at_block_edges():
    assert _cost({0: "POD-D", 1: "PED-D", 2: "POD-D"}) == 0  # touches first day
    assert _cost({5: "POD-D", 6: "PED-D", 7: "POD-D"}) == 0  # touches last day


def test_churn_not_across_day_off():
    assert _cost({2: "POD-D", 4: "PED-D"}) == 0


def test_pair_interior_vs_edge():
    assert _cost({2: "POD-D", 3: "POD-D"}) == 25
    assert _cost({0: "POD-D", 1: "POD-D"}) == 0
    assert _cost({6: "POD-D", 7: "POD-D"}) == 0
    assert _cost({2: "POD-D", 3: "POD-D", 4: "POD-D"}) == 0


def test_off_adjacency_including_outside_block_dates():
    dates = _dates(8)
    assert _cost({3: "POD-D"}, off=[dates[4]]) == 25
    assert _cost({0: "POD-D"}, off=[(date(2026, 1, 4)).isoformat()]) == 25  # day before the block
    assert _cost({7: "POD-D"}, off=[(date(2026, 1, 13)).isoformat()]) == 25  # day after the block
    assert _cost({2: "POD-D"}, off=[dates[5]]) == 0


def test_random_schedule_parity_with_js_loop():
    dates = _dates(10)
    for seed in range(20):
        rnd = random.Random(seed)
        sched = {i: rnd.choice(list(SHIFTS)) for i in range(10) if rnd.random() < 0.65}
        off = [dates[rnd.randrange(10)] for _ in range(rnd.randrange(3))]
        assert _cost(sched, n=10, off=off) == js_reference(sched, dates, off), (seed, sched, off)


def test_absent_weights_default_to_zero():
    assert _cost({2: "POD-D", 3: "PED-D"}, w={}) == 0
    assert _cost({2: "POD-D", 3: "PED-D"}, w={"isolatedCost": 100}) == 0
