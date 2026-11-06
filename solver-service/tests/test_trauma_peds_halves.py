"""Chief decision 2026-11-01: Trauma/Peds interns work trauma in block days 1-14 and peds in
days 15-28 (Peds/Trauma the reverse); TRAUMA-D only on Sun/Tue/Thu/Sat, no run preference.
The solver gets the halves from the browser's `eligible` map (buildSolverPayload) plus
`traumaPedsSplit`; this proves a real solve never crosses the halves and the validator's
split-cap check agrees."""

import datetime

from solver.io.payload import parse_payload
from solver.solve import solve
from tests.helpers import make_payload, make_resident

START = datetime.date(2026, 7, 5)  # Sunday
DATES = [(START + datetime.timedelta(days=i)).isoformat() for i in range(28)]
FIRST, SECOND = DATES[:14], DATES[14:]
SHIFTS = {
    "TRAUMA-D": {"startH": 7, "durationH": 12, "type": "day", "area": "TRAUMA"},
    "PED-D": {"startH": 7, "durationH": 9, "type": "day", "area": "PED"},
}


def _is_trauma_day(d):
    return datetime.date.fromisoformat(d).weekday() in (6, 1, 3, 5)  # Sun Tue Thu Sat


def _eligible(trauma_dates, peds_dates):
    out = {}
    for d in DATES:
        if d in trauma_dates:
            out[d] = ["TRAUMA-D"] if _is_trauma_day(d) else []
        else:
            out[d] = ["PED-D"]
    return out


def _shifts_on(result, rid):
    got = {}
    for d, v in result.schedule.get(rid, {}).items():
        vals = v if isinstance(v, list) else [v]
        got[d] = [s for s in vals if s]
    return got


def _solve(residents, eligible):
    # Demand work on both sides so a vacuous (empty) schedule cannot pass.
    coverage = {
        "TRAUMA-D": {d: {"min": 1 if _is_trauma_day(d) else 0, "max": 1} for d in DATES},
        "PED-D": {d: {"min": 1 if i % 2 == 0 else 0, "max": 1} for i, d in enumerate(DATES)},
    }
    raw = make_payload(residents=residents, shifts=SHIFTS, dates=DATES, eligible=eligible, coverage=coverage)
    return solve(parse_payload(raw))


def test_solver_keeps_trauma_peds_and_peds_trauma_inside_their_halves():
    split_tp = {"traumaDates": FIRST, "pedsDates": SECOND, "traumaCap": 7, "pedsCap": 14}
    split_pt = {"traumaDates": SECOND, "pedsDates": FIRST, "traumaCap": 7, "pedsCap": 14}
    residents = [
        make_resident("tp", isIntern=True, traumaPedsSplit=split_tp),
        make_resident("pt", isIntern=True, traumaPedsSplit=split_pt),
    ]
    eligible = {"tp": _eligible(set(FIRST), set(SECOND)), "pt": _eligible(set(SECOND), set(FIRST))}
    result = _solve(residents, eligible)
    assert result.status in ("OPTIMAL", "FEASIBLE", "RELAXED")

    tp, pt = _shifts_on(result, "tp"), _shifts_on(result, "pt")
    assert any("TRAUMA-D" in v for v in tp.values()) and any("PED-D" in v for v in tp.values())
    assert any("TRAUMA-D" in v for v in pt.values()) and any("PED-D" in v for v in pt.values())
    for d, v in tp.items():
        if "PED-D" in v:
            assert d in SECOND, f"tp peds in first half {d}"
        if "TRAUMA-D" in v:
            assert d in FIRST and _is_trauma_day(d), f"tp trauma {d}"
    for d, v in pt.items():
        if "PED-D" in v:
            assert d in FIRST, f"pt peds in second half {d}"
        if "TRAUMA-D" in v:
            assert d in SECOND and _is_trauma_day(d), f"pt trauma {d}"
    assert not [f for f in result.validation.get("failures", []) if f.get("rule") == "traumaPedsSplit"]
