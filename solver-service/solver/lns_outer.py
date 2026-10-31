"""Optional domain-aware outer LNS (large neighborhood search) on top of the staged solve.

`solve.py`'s staged lexicographic ladder is time-limited on real blocks: its last (quality) stage is still
improving when the clock runs out. When `config.outerLns.enabled`, `_solve_pass1` gives the staged solve
`(1 - fraction)` of the budget and hands the incumbent to `run_outer_lns`, which spends the rest on
many short sub-solves:

  1. pick a neighborhood (a set of x-variables allowed to move),
  2. fix EVERY other x-variable to the incumbent value by reducing its domain on a private model clone
     (domain reduction, not hints: presolve then collapses the problem to the neighborhood's size),
  3. keep every earlier tier (errors, blocking, rank, rest) as a hard `<=` bound at the incumbent's
     value, so no tier can get worse,
  4. minimize the final quality-tier expression for `subSolveSeconds`,
  5. accept only a strict lexicographic improvement.

Design notes (why not the alternatives):
- Assumption literals were considered for the fixing. They keep one model, but CP-SAT then runs a much
  weaker presolve (assumptions disable most of it), which defeats the point of shrinking the problem.
- The clone is made ONCE and then only its x-variable DOMAINS (and hint) are rewritten per iteration; no
  repeat_hint / repair_hint is involved, so the "repair_hint + re-solve" native crash noted in
  solve._configure_solver does not apply (same re-solve-a-mutated-model pattern `_solve_staged` uses).
- The clone has identical variable indexing, so the accepted sub-solve's CpSolver can be returned and
  `solver.value(expr)` still works for every expression built on the original model.
- Deterministic given a seed up to CP-SAT's own multi-worker nondeterminism: neighborhood choice and
  sizes come from `random.Random(seed)`; sub-solve seeds are `seed + iteration`.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass

from ortools.sat.python import cp_model

NEIGHBORHOODS = ("window", "residents", "shiftWindow", "worstTerms")

DEFAULT_FRACTION = 0.5
DEFAULT_SUB_SOLVE_SECONDS = 5.0


@dataclass(frozen=True)
class OuterLnsConfig:
    enabled: bool = True
    fraction: float = DEFAULT_FRACTION
    sub_solve_seconds: float = DEFAULT_SUB_SOLVE_SECONDS


def parse_outer_lns(raw) -> OuterLnsConfig:
    """Lenient parse of `config.outerLns` (untrusted shape): anything malformed degrades to defaults /
    disabled rather than failing the request. fraction clamps to [0.05, 0.9], subSolveSeconds to [0.5, 120]."""
    if not isinstance(raw, dict):
        return OuterLnsConfig()  # absent / malformed => default on (2026-10-31 bench: ~5% better score at equal time)

    def _num(key, default, lo, hi):
        try:
            v = float(raw.get(key, default))
        except (TypeError, ValueError):
            return default
        if v != v:  # NaN
            return default
        return max(lo, min(hi, v))

    return OuterLnsConfig(
        enabled=raw.get("enabled") is not False,
        fraction=_num("fraction", DEFAULT_FRACTION, 0.05, 0.9),
        sub_solve_seconds=_num("subSolveSeconds", DEFAULT_SUB_SOLVE_SECONDS, 0.5, 120.0),
    )


class _Neighborhoods:
    """Builds the 'free' key sets. Every method returns a set of x keys `(rid, sid, date)` that may move."""

    def __init__(self, payload, store, objective, rng: random.Random):
        self.payload = payload
        self.store = store
        self.objective = objective
        self.rng = rng
        self.keys = list(store.x.keys())
        self.dates = list(payload.block.dates)
        self.date_index = {d: i for i, d in enumerate(self.dates)}
        self.rids = sorted({k[0] for k in self.keys})
        self.by_resident: dict = {}
        for k in self.keys:
            self.by_resident.setdefault(k[0], []).append(k)
        self.cohort = {r.id: r.cohort for r in payload.residents}
        self.areas = sorted({self._shift_attr(k[1], "area") for k in self.keys} - {None})
        self.types = sorted({self._shift_attr(k[1], "type") for k in self.keys} - {None})
        # Per-neighborhood size multiplier, adapted by the driver (grow when proven-optimal-and-no-gain,
        # shrink when the sub-solve found nothing in its limit).
        self.scale = {n: 1.0 for n in NEIGHBORHOODS}

    def _shift_attr(self, sid, attr):
        s = self.payload.shifts.get(sid)
        if s is None:
            return None
        return getattr(s, attr, None) if not isinstance(s, dict) else s.get(attr)

    def _window_dates(self, days: int) -> set:
        n = len(self.dates)
        days = max(1, min(n, days))
        start = self.rng.randrange(0, n - days + 1)
        return set(self.dates[start:start + days])

    def window(self, solution) -> set:
        days = round(7 * self.scale["window"])
        win = self._window_dates(days)
        return {k for k in self.keys if k[2] in win}

    def _group(self, anchor_pool: list, size: int) -> list:
        """~size residents, anchored on one resident and preferring that resident's cohort."""
        rids = list(self.rids)
        if not rids:
            return []
        size = max(2, min(len(rids), size))
        anchor = self.rng.choice(anchor_pool or rids)
        mates = [r for r in rids if r != anchor and self.cohort.get(r) == self.cohort.get(anchor) and self.cohort.get(r) is not None]
        others = [r for r in rids if r != anchor and r not in set(mates)]
        self.rng.shuffle(mates)
        self.rng.shuffle(others)
        return ([anchor] + mates + others)[:size]

    def residents(self, solution) -> set:
        size = round(self.rng.randint(4, 6) * self.scale["residents"])
        group = self._group([], size)
        free: set = set()
        for r in group:
            free.update(self.by_resident[r])
        return free

    def shift_window(self, solution) -> set:
        use_area = bool(self.areas) and (not self.types or self.rng.random() < 0.5)
        pool = self.areas if use_area else self.types
        if not pool:
            return self.window(solution)
        value = self.rng.choice(pool)
        attr = "area" if use_area else "type"
        win = self._window_dates(round(10 * self.scale["shiftWindow"]))
        return {k for k in self.keys if k[2] in win and self._shift_attr(k[1], attr) == value}

    def _resident_pain(self, slv) -> dict:
        """Per-resident incumbent soft penalty from the cheap-to-read terms (target deficit, post-night
        rest compromises). Residents with no penalty are absent."""
        pain: dict = {}
        for rid, (_target, deficit_var) in self.objective.target_deficit_vars.items():
            v = slv.value(deficit_var)
            if v > 0:
                pain[rid] = pain.get(rid, 0) + v
        for p in self.objective.post_night_rest_penalties:
            if slv.value(p.var) >= 1:
                pain[p.resident_id] = pain.get(p.resident_id, 0) + 1
        return pain

    def worst_terms(self, solution) -> set:
        pain = self._resident_pain(solution)
        size = round(self.rng.randint(4, 6) * self.scale["worstTerms"])
        if not pain:
            return self.residents(solution)
        ranked = sorted(pain, key=lambda r: (-pain[r], r))
        # Anchor among the worst few (varies iteration to iteration), fill from the anchor's cohort.
        top = ranked[: max(2, size // 2)]
        group = self._group(top, size)
        free: set = set()
        for r in group:
            free.update(self.by_resident.get(r, []))
        return free

    def pick(self, name: str, solution) -> set:
        return {
            "window": self.window,
            "residents": self.residents,
            "shiftWindow": self.shift_window,
            "worstTerms": self.worst_terms,
        }[name](solution)


def _choose(stats: dict, rng: random.Random, iteration: int) -> str:
    """Rotate through every neighborhood once, then sample proportionally to a smoothed success rate
    (floored so a neighborhood that has not paid off recently still gets tried)."""
    if iteration < len(NEIGHBORHOODS):
        return NEIGHBORHOODS[iteration]
    weights = [max(0.1, (stats[n]["accepted"] + 1) / (stats[n]["tried"] + 2)) for n in NEIGHBORHOODS]
    return rng.choices(NEIGHBORHOODS, weights=weights, k=1)[0]


def run_outer_lns(
    payload,
    build_result,
    solver,
    stage_names,
    quality_name,
    configure_solver,
    *,
    deadline: float,
    sub_solve_seconds: float,
    seed: int,
    progress=None,
    cancel_event=None,
    proven_optimal: bool = False,
):
    """Improve `solver`'s incumbent until `deadline` (a `time.time()` value). Returns `(solver, report)`:
    `solver` is the CpSolver holding the best solution (the input one if nothing was accepted) and `report`
    is `report["outerLns"]`.

    `configure_solver()` -> a fresh CpSolver with the payload's shared params (solve._configure_solver, passed
    in to avoid an import cycle). `stage_names` is solve._STAGE_NAMES; `quality_name` the last/optimized tier.
    """
    model = build_result.model
    store = build_result.store
    objective = build_result.objective
    t_start = time.time()

    def _tier_values(slv) -> dict:
        return {n: round(slv.value(objective.stage_exprs[n])) for n in stage_names}

    stats = {n: {"tried": 0, "accepted": 0} for n in NEIGHBORHOODS}
    quality_expr = objective.stage_exprs[quality_name]
    incumbent_tiers = _tier_values(solver)
    start_obj = incumbent_tiers[quality_name]
    report = {
        "iterations": 0,
        "accepted": 0,
        "byNeighborhood": stats,
        "startObjective": start_obj,
        "endObjective": start_obj,
        "seconds": 0.0,
    }
    if proven_optimal:
        # The last staged solve minimized exactly the quality tier under all earlier bounds and proved it.
        report["skipped"] = "staged solve proved optimal"
        return solver, report
    if isinstance(quality_expr, int) or not store.x:
        report["skipped"] = "empty quality tier" if isinstance(quality_expr, int) else "no variables"
        return solver, report

    # Earlier tiers can never get worse: hard bounds at the incumbent's value (redundant with the bounds
    # `_solve_staged` already added, but also covers the hint-fallback path where none were added).
    for n in stage_names:
        if n == quality_name or isinstance(objective.stage_exprs[n], int):
            continue
        model.add(objective.stage_exprs[n] <= incumbent_tiers[n])
    model.minimize(quality_expr)
    sub = model.clone()

    incumbent_solver = solver
    solution = list(solver.response_proto.solution)
    x_items = list(store.x.items())
    hood = _Neighborhoods(payload, store, objective, random.Random(seed))
    rng = hood.rng

    def _set_domains(free: set) -> None:
        vars_pb = sub.proto.variables
        for key, var in x_items:
            vp = vars_pb[var.index]
            vp.domain.clear()
            if key in free:
                vp.domain.extend([0, 1])
            else:
                v = int(solution[var.index])
                vp.domain.extend([v, v])

    def _set_hint() -> None:
        sub.clear_hints()
        hint = sub.proto.solution_hint
        hint.vars.extend(range(len(solution)))
        hint.values.extend(solution)

    last_ord = tuple(incumbent_tiers[n] for n in stage_names)
    iteration = 0
    while True:
        now = time.time()
        remaining = deadline - now
        if remaining < 0.3:
            break
        if cancel_event is not None and cancel_event.is_set():
            break
        name = _choose(stats, rng, iteration)
        free = hood.pick(name, incumbent_solver)
        iteration += 1
        stats[name]["tried"] += 1
        if not free:
            continue
        _set_domains(free)
        _set_hint()
        slv = configure_solver()
        slv.parameters.max_time_in_seconds = max(0.2, min(sub_solve_seconds, remaining))
        slv.parameters.random_seed = seed + iteration
        if progress is not None:
            progress.set_best(float(incumbent_tiers[quality_name]))
        status = slv.solve(sub)
        status_name = slv.status_name(status)
        accepted = False
        if status_name in ("OPTIMAL", "FEASIBLE"):
            new_tiers = _tier_values(slv)
            new_ord = tuple(new_tiers[n] for n in stage_names)
            if new_ord < last_ord:  # strict lexicographic improvement (tiers are bounded <=, so quality drives it)
                accepted = True
                incumbent_solver = slv
                solution = list(slv.response_proto.solution)
                incumbent_tiers = new_tiers
                last_ord = new_ord
            elif status_name == "OPTIMAL":
                hood.scale[name] = min(2.5, hood.scale[name] * 1.25)  # proven no gain here: look wider
        else:
            hood.scale[name] = max(0.4, hood.scale[name] * 0.8)  # nothing found in the limit: look smaller
        if accepted:
            stats[name]["accepted"] += 1
            report["accepted"] += 1

    report["iterations"] = iteration
    report["endObjective"] = incumbent_tiers[quality_name]
    report["seconds"] = round(time.time() - t_start, 2)
    return incumbent_solver, report
