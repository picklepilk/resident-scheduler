"""Count-based as-needed rules (chief + program director, 2026-10-30).

1. Nights per block: `caps.nights` (6) is the SOFT target, `caps.nightsMax` (12) the HARD cap. Each night above the
   target costs `asNeededUse.perUnit`; an older payload without `nightsMax` keeps `nights` as the hard cap
   (stricter-or-equal for old payloads).
2. BAMC: Thursday DAY + Wednesday NIGHT cells combined <= `caps.bamcGrExceptions` (1) per block.
"""

from ortools.sat.python import cp_model

from solver.io.payload import parse_payload
from solver.model.circadian import add_circadian_constraints
from solver.model.count_caps import add_count_cap_constraints
from solver.model.variables import build_variables
from solver.solve import solve
from tests.helpers import make_payload, make_resident

SHIFTS = {
    "D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "E": {"startH": 15, "durationH": 8, "type": "eve", "area": "POD"},
    "N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"},
}
# 2026-01-05 is a Monday: Wed = 01-07, Thu = 01-08.
WEEK = [f"2026-01-{5 + i:02d}" for i in range(7)]
WED, THU = WEEK[2], WEEK[3]


def _night_dates(n_days=14):
    return [f"2026-01-{5 + i:02d}" for i in range(n_days)]


def _build_circadian(dates, caps):
    raw = make_payload(
        residents=[make_resident("r1", caps=caps)], shifts=SHIFTS, dates=dates,
        eligible={"r1": {d: ["N"] for d in dates}}, coverage={"N": {d: {"min": 0, "max": 1} for d in dates}},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_circadian_constraints(model, payload, store)
    return model, store


def _force_nights(model, store, days):
    for d in days:
        model.add(store.get_x("r1", "N", d) == 1)


def _status(model):
    solver = cp_model.CpSolver()
    return solver.status_name(solver.solve(model))


# ---------------------------------------------------------------- nights: hard cap ----

def test_legacy_payload_without_nights_max_keeps_nights_as_hard_cap():
    dates = _night_dates(8)
    model, store = _build_circadian(dates, {"nights": 6})
    # 6 nights + a gap + 1 more = 7 nights over a 2-run split would break the legacy cap of 6
    _force_nights(model, store, dates[0:6] + [dates[7]])
    assert _status(model) == "INFEASIBLE"


def test_seventh_night_allowed_when_nights_max_present():
    dates = _night_dates(8)
    model, store = _build_circadian(dates, {"nights": 6, "nightsMax": 12})
    _force_nights(model, store, dates[0:6] + [dates[7]])
    assert _status(model) in ("OPTIMAL", "FEASIBLE")


def test_thirteenth_night_is_infeasible():
    dates = _night_dates(14)
    model, store = _build_circadian(dates, {"nights": 6, "nightsMax": 12})
    # 6 + gap + 6 = 12 (two stints) is legal ...
    _force_nights(model, store, dates[0:6] + dates[7:13])
    assert _status(model) in ("OPTIMAL", "FEASIBLE")
    # ... a 13th night (even ignoring the run/stint rules) exceeds nightsMax
    model2, store2 = _build_circadian(dates, {"nights": 6, "nightsMax": 12})
    model2.add(sum(store2.night[("r1", d)] for d in dates) >= 13)
    assert _status(model2) == "INFEASIBLE"


# ---------------------------------------------------------------- nights: soft target ----

def _nights(result):
    return sum(1 for s in result.schedule.get("r1", {}).values() if s == "N")


def _night_payload(caps, cov_days, target=None):
    dates = _night_dates(14)
    raw = make_payload(
        residents=[make_resident("r1", caps=caps, target=target)], shifts=SHIFTS, dates=dates,
        eligible={"r1": {d: ["N"] for d in dates}},
        coverage={"N": {d: ({"min": 1, "max": 1} if d in cov_days else {"min": 0, "max": 1}) for d in dates}},
    )
    return parse_payload(raw)


def test_goes_above_six_nights_only_to_fill_a_coverage_minimum():
    dates = _night_dates(14)
    cov_days = set(dates[0:6] + dates[7:13])  # 12 minimum nights, two runs of 6 with a gap day
    result = solve(_night_payload({"nights": 6, "nightsMax": 12}, cov_days))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert _nights(result) == 12
    assert result.report["unfilled"] == []


def test_never_above_six_for_optional_headroom_or_target_deficit():
    """No minimum anywhere, target 10: every night above 6 costs 20000 vs 5000 per unit of target deficit."""
    result = solve(_night_payload({"nights": 6, "nightsMax": 12}, set(), target=10))
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert _nights(result) <= 6


# ---------------------------------------------------------------- BAMC combined cap ----

def _build_caps(caps, eligible_days):
    raw = make_payload(
        residents=[make_resident("b1", caps=caps)], shifts=SHIFTS, dates=WEEK,
        eligible={"b1": {d: ["D", "E", "N"] for d in eligible_days}},
        coverage={sid: {d: {"min": 0, "max": 1} for d in WEEK} for sid in SHIFTS},
    )
    payload = parse_payload(raw)
    model = cp_model.CpModel()
    store = build_variables(model, payload)
    add_count_cap_constraints(model, payload, store)
    return model, store


def test_thursday_day_plus_wednesday_night_combined_cap():
    caps = {"bamcWedNights": 1, "bamcGrExceptions": 1}
    model, store = _build_caps(caps, WEEK)
    model.add(store.get_x("b1", "D", THU) == 1)
    model.add(store.get_x("b1", "N", WED) == 1)
    assert _status(model) == "INFEASIBLE"


def test_one_of_the_two_is_fine():
    caps = {"bamcWedNights": 1, "bamcGrExceptions": 1}
    model, store = _build_caps(caps, WEEK)
    model.add(store.get_x("b1", "D", THU) == 1)
    assert _status(model) in ("OPTIMAL", "FEASIBLE")
    model2, store2 = _build_caps(caps, WEEK)
    model2.add(store2.get_x("b1", "N", WED) == 1)
    assert _status(model2) in ("OPTIMAL", "FEASIBLE")


def test_thursday_evening_and_night_do_not_count():
    caps = {"bamcWedNights": 1, "bamcGrExceptions": 1}
    model, store = _build_caps(caps, WEEK)
    model.add(store.get_x("b1", "E", THU) == 1)
    model.add(store.get_x("b1", "N", WED) == 1)
    assert _status(model) in ("OPTIMAL", "FEASIBLE")


def test_absent_field_adds_no_combined_cap():
    """Old payload: no bamcGrExceptions -> the combined constraint is not built (legacy Wed-night cap only)."""
    model, store = _build_caps({"bamcWedNights": 1}, WEEK)
    model.add(store.get_x("b1", "D", THU) == 1)
    model.add(store.get_x("b1", "N", WED) == 1)
    assert _status(model) in ("OPTIMAL", "FEASIBLE")
