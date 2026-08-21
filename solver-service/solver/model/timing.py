"""The ONLY cross-midnight math in the solver.

Every constraint family that needs to know when a shift actually starts/ends,
or how much time separates two shifts, goes through this module. Dates are
"YYYY-MM-DD" strings; we convert to an absolute minute offset via the
proleptic Gregorian ordinal so that arithmetic across month/year boundaries,
and across the block-start/prior-tail boundary, is just integer subtraction
-- no calendar-day-index bookkeeping anywhere else in the codebase.

Also owns `rolling_window`, a small generic helper shared by circadian.py
(night-run sliding window, rule 18) and workday_limits.py (6-consecutive-
workday sliding window, rule 19). It isn't cross-midnight math itself, but it
is the one other piece of "walk a resident's day sequence, prior-tail days
included as constants" logic these families share, and keeping it here avoids
a second import target.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

MINUTES_PER_DAY = 24 * 60


def parse_date(date_str: str) -> date:
    y, m, d = (int(p) for p in date_str.split("-"))
    return date(y, m, d)


def add_days(date_str: str, n: int) -> str:
    return (parse_date(date_str) + timedelta(days=n)).isoformat()


def date_diff_days(later: str, earlier: str) -> int:
    """later - earlier, in days (can be negative)."""
    return (parse_date(later) - parse_date(earlier)).days


def _ordinal_minutes(date_str: str) -> int:
    return parse_date(date_str).toordinal() * MINUTES_PER_DAY


@dataclass(frozen=True)
class ShiftTiming:
    shift_id: str
    start_h: int
    duration_h: int
    type: str  # 'day' | 'eve' | 'night' | 'swing'
    area: str

    @property
    def is_night(self) -> bool:
        return self.type == "night"


def shift_start_min(date_str: str, shift: ShiftTiming) -> int:
    """Absolute minute offset (arbitrary but consistent epoch) a shift begins on `date_str`."""
    return _ordinal_minutes(date_str) + shift.start_h * 60


def shift_end_min(date_str: str, shift: ShiftTiming) -> int:
    """Absolute minute offset the shift ends -- may land on the next calendar day."""
    return shift_start_min(date_str, shift) + shift.duration_h * 60


def required_rest_gap_min(earlier_shift: ShiftTiming) -> int:
    """Rule 17: required rest gap equals the EARLIER shift's own duration."""
    return earlier_shift.duration_h * 60


def gap_between(date1: str, shift1: ShiftTiming, date2: str, shift2: ShiftTiming) -> int:
    """Minutes from shift1's end to shift2's start (negative = overlap)."""
    return shift_start_min(date2, shift2) - shift_end_min(date1, shift1)


def overlaps_hour_window(shift: ShiftTiming, window_start_h: float, window_end_h: float) -> bool:
    """Whether a shift's local [start, end) interval overlaps an hour-of-day window
    (e.g. 18:00-21:00 for Journal Club), measured on the shift's own start day.
    Used to derive which shifts "count as" a JC/obligation collision from timing alone.
    """
    s = shift.start_h * 60
    e = s + shift.duration_h * 60
    ws = window_start_h * 60
    we = window_end_h * 60
    return s < we and e > ws


def rolling_window(get_term, num_positions: int, window_len: int):
    """Yield (start_index, [terms]) for every window of `window_len` consecutive
    positions in a combined tail+block day sequence of length `num_positions`.

    `get_term(i)` returns either a plain python int (0/1, for a prior-tail
    constant day) or a CP-SAT BoolVar/IntVar (for an in-block day). Callers are
    responsible for skipping windows that are entirely constant (nothing to
    constrain) if they want to save a trivial constraint.
    """
    if window_len <= 0 or window_len > num_positions:
        return
    for start in range(0, num_positions - window_len + 1):
        yield start, [get_term(i) for i in range(start, start + window_len)]
