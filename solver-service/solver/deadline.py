"""One wall-clock deadline for a whole solve (2026-11-04, em-scheduler port).

Every phase of a pass-1/pass-2 solve (hint-pin evaluation, staged ladder, outer LNS, pass 2) sizes
its own `max_time_in_seconds` from `Deadline.cap(want)` so the TOTAL never exceeds
`config.deadlineSeconds` (default `maxTimeSeconds + DEFAULT_GRACE_SECONDS`). em-scheduler measured a
300 s run taking 466 s without this; the client's request timeout is budget + 60 s, so an overrun
silently became a local-engine fallback.
"""

from __future__ import annotations

import time

DEFAULT_GRACE_SECONDS = 10.0
# Never hand CP-SAT a 0/negative limit: a tiny positive floor still lets it return the hint/incumbent.
MIN_PHASE_SECONDS = 0.1


class Deadline:
    def __init__(self, seconds: float, start: float | None = None):
        self.start = time.time() if start is None else start
        self.at = self.start + max(MIN_PHASE_SECONDS, float(seconds))

    @classmethod
    def for_config(cls, config, start: float | None = None) -> "Deadline":
        seconds = config.deadline_seconds
        if seconds is None:
            seconds = config.max_time_seconds + DEFAULT_GRACE_SECONDS
        return cls(seconds, start)

    def remaining(self) -> float:
        return max(0.0, self.at - time.time())

    def expired(self) -> bool:
        return time.time() >= self.at

    def cap(self, want: float) -> float:
        """`want` seconds, clipped to what is left (floored at MIN_PHASE_SECONDS)."""
        return max(MIN_PHASE_SECONDS, min(float(want), self.remaining()))
