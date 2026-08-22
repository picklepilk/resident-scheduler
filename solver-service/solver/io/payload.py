"""Parse the request JSON (see docs/PAYLOAD_SCHEMA.md) into typed, read-only
dataclasses. This is the single boundary between "untrusted JSON" and every
solver/model/* constraint builder -- nothing downstream touches raw dicts.

All policy resolution (eligibility, coverage, seniority, targets, caps...)
already happened in JS. This module does no policy work of its own beyond
basic shape validation; it just gives the rest of the solver a typed surface.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from solver.model.timing import ShiftTiming, add_days

# Depth of the prior-block tail window every sliding-window constraint (night
# run, 6-consecutive-workday) pads with constants. Matches the app's own
# "14-day prior tail" convention (see CLAUDE.md / prevBlockTailSchedules).
TAIL_WINDOW_DAYS = 14


class PayloadError(ValueError):
    """Raised for structurally invalid request JSON (maps to HTTP 400/422)."""


@dataclass(frozen=True)
class Config:
    max_time_seconds: float = 30.0
    num_workers: int = 8
    random_seed: int = 42
    coverage_min_mode: str = "elastic_always"  # or "hard_then_elastic"
    max_verification_resolves: int = 2
    weights: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Block:
    start_date: str
    end_date: str
    dates: list  # ordered list[str], authoritative


@dataclass(frozen=True)
class ResidentCaps:
    nights: Optional[int] = None
    trauma: Optional[int] = None
    jc_remaining: Optional[int] = None
    bamc_wed_nights: Optional[int] = None
    peds_mix_max: Optional[int] = None
    peds_mix_min: Optional[int] = None
    fm1_peds_max: Optional[int] = None


@dataclass(frozen=True)
class TraumaPedsSplit:
    trauma_dates: frozenset
    peds_dates: frozenset
    trauma_cap: int
    peds_cap: int


@dataclass(frozen=True)
class AyPrior:
    nights: int = 0
    weekends: int = 0
    holidays: int = 0


@dataclass(frozen=True)
class Resident:
    id: str
    cohort: Optional[str]
    target: Optional[int]
    is_em_core: bool
    is_intern: bool
    night_exempt: bool
    caps: ResidentCaps
    trauma_peds_split: Optional[TraumaPedsSplit]
    prior_tail: dict          # date -> shiftId
    prior_tail_obligations: frozenset  # dates
    prior_tail_hours: int
    ay_prior: AyPrior


@dataclass(frozen=True)
class LockedCell:
    resident_id: str
    date: str
    shift_id: str


@dataclass(frozen=True)
class CoverageEntry:
    min: int
    max: int


@dataclass(frozen=True)
class Preference:
    resident_id: str
    shift_id: str
    date: str
    bonus: int
    tag: str


@dataclass(frozen=True)
class Settings:
    enforce_rest: bool = True
    enforce_weekend_off: bool = True


@dataclass
class Payload:
    version: int
    config: Config
    block: Block
    shifts: dict                       # shiftId -> ShiftTiming
    residents: list                    # list[Resident]
    residents_by_id: dict               # residentId -> Resident
    eligible: dict                     # residentId -> date -> set[shiftId]
    obligations: dict                  # residentId -> set[date]
    locked: list                       # list[LockedCell]
    coverage: dict                     # shiftId -> date -> CoverageEntry
    senior_primary: dict               # shiftId -> date -> list[residentId]
    jc_dates: frozenset
    holidays: dict                     # date -> name
    preferences: list                  # list[Preference]
    rule_priority: list
    settings: Settings

    # ---- batch 2 (chief round-2 rules): all five default to empty/zero, and
    # every constraint/term consuming them (solver/model/trauma_runs.py) is a
    # documented no-op under those defaults -- additive, payload version
    # stays 1. See docs/PAYLOAD_SCHEMA.md's request shape for the field docs.
    trauma_night_shift_ids: frozenset = field(default_factory=frozenset)
    peds_split_intern_ids: frozenset = field(default_factory=frozenset)
    peds_night_shift_ids: frozenset = field(default_factory=frozenset)
    peds_intern_night_target: int = 0
    alternation_exempt_dates: frozenset = field(default_factory=frozenset)

    # ---- round 2b (EM-count composition + PGY gating pool-restrict): three
    # OPTIONAL id lists, all default to empty -- solver/model/em_composition.py
    # is a documented no-op under those defaults (each of its two term
    # families guards on its own list(s) being non-empty). Additive, payload
    # version stays 1. See docs/PAYLOAD_SCHEMA.md.
    em_resident_ids: frozenset = field(default_factory=frozenset)
    em_pgy2_resident_ids: frozenset = field(default_factory=frozenset)
    em_pgy3_resident_ids: frozenset = field(default_factory=frozenset)

    # ---- derived, computed once in __post_init__ ----
    tail_dates: list = field(default_factory=list, repr=False)   # 14 contiguous dates before block.dates[0]
    all_dates: list = field(default_factory=list, repr=False)    # tail_dates + block.dates, contiguous

    def __post_init__(self):
        if self.block.dates:
            first = self.block.dates[0]
            self.tail_dates = [add_days(first, -TAIL_WINDOW_DAYS + i) for i in range(TAIL_WINDOW_DAYS)]
        else:
            self.tail_dates = []
        self.all_dates = [*self.tail_dates, *self.block.dates]

    def is_eligible(self, resident_id: str, date_str: str, shift_id: str) -> bool:
        return shift_id in self.eligible.get(resident_id, {}).get(date_str, ())

    def has_coverage(self, shift_id: str, date_str: str) -> bool:
        return date_str in self.coverage.get(shift_id, {})

    def resident(self, resident_id: str) -> Resident:
        return self.residents_by_id[resident_id]


def _parse_shifts(raw: dict) -> dict:
    out = {}
    for sid, s in raw.items():
        out[sid] = ShiftTiming(
            shift_id=sid,
            start_h=int(s["startH"]),
            duration_h=int(s["durationH"]),
            type=s["type"],
            area=s["area"],
        )
    return out


def _parse_residents(raw: list) -> list:
    out = []
    for r in raw:
        caps_raw = r.get("caps", {}) or {}
        caps = ResidentCaps(
            nights=caps_raw.get("nights"),
            trauma=caps_raw.get("trauma"),
            jc_remaining=caps_raw.get("jcRemaining"),
            bamc_wed_nights=caps_raw.get("bamcWedNights"),
            peds_mix_max=caps_raw.get("pedsMixMax"),
            peds_mix_min=caps_raw.get("pedsMixMin"),
            fm1_peds_max=caps_raw.get("fm1PedsMax"),
        )
        tps_raw = r.get("traumaPedsSplit")
        tps = None
        if tps_raw:
            tps = TraumaPedsSplit(
                trauma_dates=frozenset(tps_raw.get("traumaDates", ())),
                peds_dates=frozenset(tps_raw.get("pedsDates", ())),
                trauma_cap=int(tps_raw["traumaCap"]),
                peds_cap=int(tps_raw["pedsCap"]),
            )
        ay_raw = r.get("ayPrior", {}) or {}
        ay = AyPrior(
            nights=int(ay_raw.get("nights", 0)),
            weekends=int(ay_raw.get("weekends", 0)),
            holidays=int(ay_raw.get("holidays", 0)),
        )
        out.append(
            Resident(
                id=r["id"],
                cohort=r.get("cohort"),
                target=r.get("target"),
                is_em_core=bool(r.get("isEmCore", False)),
                is_intern=bool(r.get("isIntern", False)),
                night_exempt=bool(r.get("nightExempt", False)),
                caps=caps,
                trauma_peds_split=tps,
                prior_tail=dict(r.get("priorTail", {}) or {}),
                prior_tail_obligations=frozenset(r.get("priorTailObligations", ()) or ()),
                prior_tail_hours=int(r.get("priorTailHours", 0) or 0),
                ay_prior=ay,
            )
        )
    return out


def _parse_eligible(raw: dict) -> dict:
    return {rid: {d: set(shifts) for d, shifts in by_date.items()} for rid, by_date in raw.items()}


def _parse_obligations(raw: dict) -> dict:
    return {rid: set(dates) for rid, dates in raw.items()}


def _parse_locked(raw: list) -> list:
    return [LockedCell(resident_id=e["residentId"], date=e["date"], shift_id=e["shiftId"]) for e in raw]


def _parse_coverage(raw: dict) -> dict:
    out = {}
    for sid, by_date in raw.items():
        out[sid] = {d: CoverageEntry(min=int(v["min"]), max=int(v["max"])) for d, v in by_date.items()}
    return out


def _parse_preferences(raw: list) -> list:
    return [
        Preference(
            resident_id=p["residentId"],
            shift_id=p["shiftId"],
            date=p["date"],
            bonus=int(p["bonus"]),
            tag=p.get("tag", ""),
        )
        for p in raw
    ]


def parse_payload(raw: dict) -> Payload:
    try:
        block_raw = raw["block"]
        block = Block(
            start_date=block_raw["startDate"],
            end_date=block_raw["endDate"],
            dates=list(block_raw["dates"]),
        )
        config_raw = raw.get("config", {}) or {}
        config = Config(
            max_time_seconds=float(config_raw.get("maxTimeSeconds", 30)),
            num_workers=int(config_raw.get("numWorkers", 8)),
            random_seed=int(config_raw.get("randomSeed", 42)),
            coverage_min_mode=config_raw.get("coverageMinMode", "elastic_always"),
            max_verification_resolves=int(config_raw.get("maxVerificationResolves", 2)),
            weights=dict(config_raw.get("weights", {}) or {}),
        )
        settings_raw = raw.get("settings", {}) or {}
        settings = Settings(
            enforce_rest=bool(settings_raw.get("enforceRest", True)),
            enforce_weekend_off=bool(settings_raw.get("enforceWeekendOff", True)),
        )
        residents = _parse_residents(raw.get("residents", []))
        payload = Payload(
            version=int(raw.get("version", 1)),
            config=config,
            block=block,
            shifts=_parse_shifts(raw.get("shifts", {})),
            residents=residents,
            residents_by_id={r.id: r for r in residents},
            eligible=_parse_eligible(raw.get("eligible", {})),
            obligations=_parse_obligations(raw.get("obligations", {})),
            locked=_parse_locked(raw.get("locked", [])),
            coverage=_parse_coverage(raw.get("coverage", {})),
            senior_primary=raw.get("seniorPrimary", {}) or {},
            jc_dates=frozenset(raw.get("jcDates", ()) or ()),
            holidays=dict(raw.get("holidays", {}) or {}),
            preferences=_parse_preferences(raw.get("preferences", [])),
            rule_priority=list(raw.get("rulePriority", []) or []),
            settings=settings,
            trauma_night_shift_ids=frozenset(raw.get("traumaNightShiftIds", ()) or ()),
            peds_split_intern_ids=frozenset(raw.get("pedsSplitInternIds", ()) or ()),
            peds_night_shift_ids=frozenset(raw.get("pedsNightShiftIds", ()) or ()),
            peds_intern_night_target=int(raw.get("pedsInternNightTarget", 0) or 0),
            alternation_exempt_dates=frozenset(raw.get("alternationExemptDates", ()) or ()),
            em_resident_ids=frozenset(raw.get("emResidentIds", ()) or ()),
            em_pgy2_resident_ids=frozenset(raw.get("emPgy2ResidentIds", ()) or ()),
            em_pgy3_resident_ids=frozenset(raw.get("emPgy3ResidentIds", ()) or ()),
        )
    except (KeyError, TypeError) as exc:
        raise PayloadError(f"Malformed payload: {exc!r}") from exc
    return payload
