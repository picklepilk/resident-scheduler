"""Process-wide single-solve slot shared by `/solve` and `InMemoryJobs`.

CP-SAT's `num_workers` already saturates every core (4 on the Pi), so a second concurrent
solve only starves both. `/solve` previously had no cap of its own (only job submits got
the 409), so a sync solve and a job -- or two sync solves -- could overlap.
"""

from __future__ import annotations

import threading

solve_slot = threading.Lock()
