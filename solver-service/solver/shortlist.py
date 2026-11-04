"""report.shortlist capture (2026-11-04, em-scheduler port).

A pass-1 solution handler (`on_solution(cb)`, see solver/callbacks.py) that records the N best DISTINCT
schedules seen across every staged-stage incumbent, ranked lexicographically by the tier tuple
(same order as solve.py's `_result_rank_key`). Every incumbent of the strict model satisfies every hard
constraint by construction, so each entry is a legal schedule. The client re-ranks them with betterQuality.
"""

from __future__ import annotations

import time

MAX_CAPTURES = 400
MIN_CAPTURE_GAP_SECONDS = 0.5
IMPROVE_FRACTION = 0.01


class ShortlistCapture:
    def __init__(self, store, stage_exprs: dict, stage_names, size: int):
        self._cells = list(store.x.items())  # [((rid, shift, date), var)]
        self._exprs = {n: stage_exprs[n] for n in stage_names if n in stage_exprs}
        self._names = tuple(stage_names)
        self._size = size
        self._pool: dict = {}  # frozenset(cells) -> (tier_tuple, tiers)
        self._captures = 0
        self._last_capture_t = None
        self._last_obj = None
        self._last_wall = None

    def _tiers(self, cb) -> dict:
        out = {}
        for n in self._names:
            e = self._exprs.get(n)
            out[n] = 0 if e is None or isinstance(e, int) else round(cb.value(e))
        return out

    def on_solution(self, cb) -> None:
        if self._captures >= MAX_CAPTURES:
            return
        now = time.monotonic()
        wall = cb.wall_time
        obj = cb.objective_value
        if self._last_wall is not None and wall < self._last_wall:
            self._last_obj = None  # a new stage solve started (its clock restarted)
        self._last_wall = wall
        improved = self._last_obj is None or (self._last_obj - obj) >= IMPROVE_FRACTION * abs(self._last_obj)
        self._last_obj = obj if improved or self._last_obj is None else min(self._last_obj, obj)
        if self._last_capture_t is not None and now - self._last_capture_t < MIN_CAPTURE_GAP_SECONDS and not improved:
            return
        self._last_capture_t = now
        self._captures += 1

        tiers = self._tiers(cb)
        key = tuple(tiers[n] for n in self._names)
        if len(self._pool) > self._size:
            worst = max(v[0] for v in self._pool.values())
            if key > worst:
                return
        cells = frozenset(k for k, var in self._cells if cb.value(var) == 1)
        if cells in self._pool:
            return
        self._pool[cells] = (key, tiers)
        if len(self._pool) > self._size + 1:  # +1 spare so excluding the winner still leaves `size`
            worst_cells = max(self._pool, key=lambda c: self._pool[c][0])
            del self._pool[worst_cells]

    def result(self, winner_schedule: dict) -> list:
        winner = frozenset((rid, shift, date) for rid, days in winner_schedule.items() for date, shift in days.items())
        # store.x keys are (rid, shift, date); winner above matches that order.
        items = sorted(((k, c) for c, k in self._pool.items() if c != winner), key=lambda t: t[0][0])
        out = []
        for (_key, tiers), cells in ((kv[0], kv[1]) for kv in items):
            sched: dict = {}
            for rid, shift, date in cells:
                sched.setdefault(rid, {})[date] = shift
            out.append({"schedule": sched, "tiers": tiers})
        return out[: self._size]
