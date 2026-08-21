"""Pydantic models mirroring the request/response shapes in
docs/PAYLOAD_SCHEMA.md. This is the outer HTTP-boundary shape check only --
`solver/io/payload.py` does the deeper typed parse once a request has passed
this layer. Fields are deliberately permissive (defaults everywhere
sensible) since JS is the single writer of this contract and the schema doc
is the actual source of truth; this layer exists to turn a malformed request
into a clean 400 rather than a stack trace.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ConfigModel(BaseModel):
    maxTimeSeconds: float = 30
    numWorkers: int = 8
    randomSeed: int = 42
    coverageMinMode: str = "elastic_always"
    maxVerificationResolves: int = 2
    weights: dict = Field(default_factory=dict)


class BlockModel(BaseModel):
    startDate: str
    endDate: str
    dates: list


class ShiftModel(BaseModel):
    startH: int
    durationH: int
    type: str
    area: str


class CapsModel(BaseModel):
    nights: Optional[int] = None
    trauma: Optional[int] = None
    jcRemaining: Optional[int] = None
    bamcWedNights: Optional[int] = None
    pedsMixMax: Optional[int] = None
    pedsMixMin: Optional[int] = None
    fm1PedsMax: Optional[int] = None


class TraumaPedsSplitModel(BaseModel):
    traumaDates: list = Field(default_factory=list)
    pedsDates: list = Field(default_factory=list)
    traumaCap: int
    pedsCap: int


class AyPriorModel(BaseModel):
    nights: int = 0
    weekends: int = 0
    holidays: int = 0


class ResidentModel(BaseModel):
    id: str
    cohort: Optional[str] = None
    target: Optional[int] = None
    isEmCore: bool = False
    isIntern: bool = False
    nightExempt: bool = False
    caps: CapsModel = Field(default_factory=CapsModel)
    traumaPedsSplit: Optional[TraumaPedsSplitModel] = None
    priorTail: dict = Field(default_factory=dict)
    priorTailObligations: list = Field(default_factory=list)
    priorTailHours: int = 0
    ayPrior: AyPriorModel = Field(default_factory=AyPriorModel)


class LockedCellModel(BaseModel):
    residentId: str
    date: str
    shiftId: str


class CoverageEntryModel(BaseModel):
    min: int
    max: int


class PreferenceModel(BaseModel):
    residentId: str
    shiftId: str
    date: str
    bonus: int
    tag: str = ""


class SettingsModel(BaseModel):
    enforceRest: bool = True
    enforceWeekendOff: bool = True


class SolveRequest(BaseModel):
    version: int = 1
    config: ConfigModel = Field(default_factory=ConfigModel)
    block: BlockModel
    shifts: dict[str, ShiftModel] = Field(default_factory=dict)
    residents: list[ResidentModel] = Field(default_factory=list)
    eligible: dict = Field(default_factory=dict)
    obligations: dict = Field(default_factory=dict)
    locked: list[LockedCellModel] = Field(default_factory=list)
    coverage: dict = Field(default_factory=dict)
    seniorPrimary: dict = Field(default_factory=dict)
    jcDates: list = Field(default_factory=list)
    holidays: dict = Field(default_factory=dict)
    preferences: list[PreferenceModel] = Field(default_factory=list)
    rulePriority: list = Field(default_factory=list)
    settings: SettingsModel = Field(default_factory=SettingsModel)


class SolveResponse(BaseModel):
    version: int
    engine: str
    status: str
    mode: str
    schedule: dict
    objective: int
    solveTimeMs: int
    seed: int
    report: dict
    feasibility: Optional[dict] = None
    validation: dict


class HealthResponse(BaseModel):
    status: str
    ortools: str
