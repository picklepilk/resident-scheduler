"""Stall stop for a staged-ladder stage (2026-11-04, em-scheduler port of lexico.py StallGuard).

`StallStop` is a `solver/callbacks.py` handler (`on_solution(cb)`) plus a watcher thread. It records the
time of the last STRICTLY improving objective; once at least one incumbent exists and no improvement has
landed for `threshold` seconds it calls `solver.stop_search()` (CP-SAT then returns its incumbent as
FEASIBLE). Use as a context manager around the solve so the watcher always ends with it:

    with StallStop(solver, threshold) as stall:
        solver.solve(model, MultiCallback([..., stall]))
    stall.fired, stall.idle_at_fire

`threshold <= 0` = disabled (no thread, never fires).
"""

from __future__ import annotations

import threading
import time

DEFAULT_STALL_SECONDS = 30.0
DEFAULT_STALL_FRACTION = 0.2
STALL_RECOVERY_MIN_SECONDS = 20.0  # re-seed only when this much of the stage budget is still unspent
STALL_RESEED_STEP = 7919


def stall_threshold(config_stall_seconds, stage_budget: float) -> float:
    """`config.stallSeconds` when set (0 = off), else `max(30, 0.2 * stage_budget)`."""
    if config_stall_seconds is not None:
        return max(0.0, float(config_stall_seconds))
    return max(DEFAULT_STALL_SECONDS, DEFAULT_STALL_FRACTION * float(stage_budget))


class StallStop:
    def __init__(self, solver, threshold: float, clock=time.monotonic):
        self.solver = solver
        self.threshold = float(threshold)
        self._clock = clock
        self._lock = threading.Lock()
        self._best = None
        self._last = None
        self.n_solutions = 0
        self.fired = False
        self.idle_at_fire = 0.0
        self._done = threading.Event()
        self._thread = None

    # -- handler (CP-SAT callback thread) --
    def on_solution(self, cb) -> None:
        obj = cb.objective_value
        with self._lock:
            self.n_solutions += 1
            if self._best is None or obj < self._best - 1e-9:
                self._best = obj
                self._last = self._clock()

    # -- watcher --
    def _check_and_fire(self) -> bool:
        with self._lock:
            if self._last is None:
                return False
            idle = self._clock() - self._last
            if idle >= self.threshold:
                self.fired = True
                self.idle_at_fire = idle
                return True
            return False

    def _watch(self) -> None:
        poll = min(0.25, max(0.02, self.threshold / 4.0))
        while not self._done.is_set():
            if self._check_and_fire():
                # Repeat until the solve returns; the first call can race the solver's own startup.
                while not self._done.is_set():
                    try:
                        self.solver.stop_search()
                    except Exception:
                        pass
                    self._done.wait(0.1)
                return
            self._done.wait(poll)

    def __enter__(self) -> "StallStop":
        if self.threshold > 0:
            self._thread = threading.Thread(target=self._watch, daemon=True, name="stall-watch")
            self._thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self._done.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
