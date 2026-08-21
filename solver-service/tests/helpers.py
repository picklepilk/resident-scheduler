"""Shared tiny-payload builders for the model-family unit tests. Not a test
module itself (no test_ prefix) so pytest won't try to collect it.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

BASE_SHIFTS = {
    "D": {"startH": 7, "durationH": 9, "type": "day", "area": "POD"},
    "E": {"startH": 15, "durationH": 8, "type": "eve", "area": "POD"},
    "N": {"startH": 23, "durationH": 8, "type": "night", "area": "POD"},
}

BASE_DATES = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"]


def load_fixture(name: str) -> dict:
    with open(FIXTURES_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def make_resident(rid: str, **overrides) -> dict:
    r = {
        "id": rid,
        "cohort": None,
        "target": None,
        "isEmCore": False,
        "isIntern": False,
        "nightExempt": False,
        "caps": {
            "nights": None, "trauma": None, "jcRemaining": None, "bamcWedNights": None,
            "pedsMixMax": None, "pedsMixMin": None, "fm1PedsMax": None,
        },
        "traumaPedsSplit": None,
        "priorTail": {},
        "priorTailObligations": [],
        "priorTailHours": 0,
        "ayPrior": {"nights": 0, "weekends": 0, "holidays": 0},
    }
    for k, v in overrides.items():
        if k == "caps":
            r["caps"].update(v)
        else:
            r[k] = v
    return r


def make_payload(residents=None, shifts=None, dates=None, eligible=None, coverage=None, **overrides) -> dict:
    dates = dates or list(BASE_DATES)
    shifts = shifts if shifts is not None else copy.deepcopy(BASE_SHIFTS)
    residents = residents if residents is not None else [make_resident("r1"), make_resident("r2"), make_resident("r3")]
    if eligible is None:
        eligible = {r["id"]: {d: list(shifts.keys()) for d in dates} for r in residents}
    if coverage is None:
        coverage = {sid: {d: {"min": 0, "max": 1} for d in dates} for sid in shifts}

    payload = {
        "version": 1,
        "config": {
            "maxTimeSeconds": 5, "numWorkers": 1, "randomSeed": 1,
            "coverageMinMode": "elastic_always", "maxVerificationResolves": 2, "weights": {},
        },
        "block": {"startDate": dates[0], "endDate": dates[-1], "dates": dates},
        "shifts": shifts,
        "residents": residents,
        "eligible": eligible,
        "obligations": {},
        "locked": [],
        "coverage": coverage,
        "seniorPrimary": {},
        "jcDates": [],
        "holidays": {},
        "preferences": [],
        "rulePriority": ["coverageMin", "seniorComposition", "postNightRest"],
        "settings": {"enforceRest": True, "enforceWeekendOff": True},
    }
    payload.update(overrides)
    return payload
