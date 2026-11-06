"""Fan-out solution callback (2026-11-04, em-scheduler port).

CP-SAT takes ONE solution callback per solve. Several features want to see every incumbent (progress
reporting, shortlist capture, stall detection), so `solve.py` wraps them in `MultiCallback`.

A handler is any object with `on_solution(cb)`, where `cb` is the live `CpSolverSolutionCallback`
(read values with `cb.value(var)`, `cb.objective_value`, `cb.wall_time`). A handler that raises is
dropped for the rest of that solve; it never breaks the search.
"""

from __future__ import annotations

import logging

from ortools.sat.python import cp_model


class MultiCallback(cp_model.CpSolverSolutionCallback):
    def __init__(self, handlers):
        super().__init__()
        self._handlers = [h for h in handlers if h is not None]

    def on_solution_callback(self):
        alive = []
        for h in self._handlers:
            try:
                h.on_solution(self)
                alive.append(h)
            except Exception:
                logging.getLogger(__name__).warning("solution handler %r failed; dropped", h, exc_info=True)
        self._handlers = alive
