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
import threading
import time
from dataclasses import dataclass

from ortools.sat.python import cp_model

NEIGHBORHOODS = ("window", "residents", "shiftWindow", "worstTerms")
# Opt-in extras (config.outerLns.neighborhoods / eligibilityGroup); absent = the four above only.
OPTIONAL_NEIGHBORHOODS = ("eligibilityGroup",)

DEFAULT_FRACTION = 0.5
DEFAULT_SUB_SOLVE_SECONDS = 5.0
LNS_TIER_SCALE = 1_000_000  # tiers="all" objective: primary * scale + later tiers (see run_outer_lns)


@dataclass(frozen=True)
class OuterLnsConfig:
    enabled: bool = True
    fraction: float = DEFAULT_FRACTION
    sub_solve_seconds: float = DEFAULT_SUB_SOLVE_SECONDS
    tiers: str = "quality"  # "quality" (default) | "all" -- see run_outer_lns
    sub_workers: int = 0  # CP-SAT workers per sub-solve; 0 = same as the main solve (see run_outer_lns)
    neighborhoods: tuple = ()  # opt-in extra neighborhood names (subset of OPTIONAL_NEIGHBORHOODS)
    parallel: int = 1  # concurrent sub-solves on disjoint neighborhoods; 1 = serial (see run_outer_lns)


def parse_outer_lns(raw) -> OuterLnsConfig:
    """Lenient parse of `config.outerLns` (untrusted shape): anything malformed degrades to defaults /
    disabled rather than failing the request. fraction clamps to [0.05, 0.9], subSolveSeconds to [0.5, 120],
    subWorkers to [0, 1024] (0 = auto), parallel to [1, 8]."""
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

    def _int(key, default, lo, hi):
        v = raw.get(key, default)
        if isinstance(v, bool):
            return default
        try:
            v = int(float(v))
        except (TypeError, ValueError, OverflowError):
            return default
        return max(lo, min(hi, v))

    extras: list = []
    nb = raw.get("neighborhoods")
    if isinstance(nb, (list, tuple)):
        extras = [n for n in OPTIONAL_NEIGHBORHOODS if n in nb]
    if raw.get("eligibilityGroup") is True and "eligibilityGroup" not in extras:
        extras.append("eligibilityGroup")

    return OuterLnsConfig(
        enabled=raw.get("enabled") is not False,
        fraction=_num("fraction", DEFAULT_FRACTION, 0.05, 0.9),
        sub_solve_seconds=_num("subSolveSeconds", DEFAULT_SUB_SOLVE_SECONDS, 0.5, 120.0),
        tiers="all" if raw.get("tiers") == "all" else "quality",
        sub_workers=_int("subWorkers", 0, 0, 1024),
        parallel=_int("parallel", 1, 1, 8),
        neighborhoods=tuple(extras),
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
        self.scale = {n: 1.0 for n in NEIGHBORHOODS + OPTIONAL_NEIGHBORHOODS}
        self._slots: dict = {}  # rid -> set of (shift, date) the resident could take (x keys exist)

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

    def _eligible_slots(self, rid) -> set:
        got = self._slots.get(rid)
        if got is None:
            got = {(k[1], k[2]) for k in self.by_resident.get(rid, []) if k[2] in self.date_index}  # this block's dates, x keys = real availability
            self._slots[rid] = got
        return got

    def eligibility_group(self, solution) -> set:
        """~4-6 residents chosen by overlap of eligible (shift, date) slots with a random anchor (residents who
        could legally take the anchor's shifts on the same dates), ties random -- instead of the cohort label,
        which off-service residents often lack."""
        size = round(self.rng.randint(4, 6) * self.scale["eligibilityGroup"])
        if not self.rids:
            return set()
        avail = [r for r in self.rids if self._eligible_slots(r)]  # no availability in this block => never freed
        if not avail:
            return set()
        size = max(2, min(len(avail), size))
        anchor = self.rng.choice(avail)
        a_slots = self._eligible_slots(anchor)
        others = [r for r in avail if r != anchor]
        self.rng.shuffle(others)  # random tie-break (sort below is stable)
        others.sort(key=lambda r: -len(a_slots & self._eligible_slots(r)))
        free: set = set()
        for r in [anchor] + others[: size - 1]:
            free.update(self.by_resident.get(r, []))
        return free

    def pick(self, name: str, solution) -> set:
        return {
            "eligibilityGroup": self.eligibility_group,
            "window": self.window,
            "residents": self.residents,
            "shiftWindow": self.shift_window,
            "worstTerms": self.worst_terms,
        }[name](solution)


def _choose(stats: dict, rng: random.Random, iteration: int) -> str:
    """Rotate through every neighborhood once, then sample proportionally to a smoothed success rate
    (floored so a neighborhood that has not paid off recently still gets tried)."""
    names = tuple(stats)  # active neighborhoods, in order
    if iteration < len(names):
        return names[iteration]
    weights = [max(0.1, (stats[n]["accepted"] + 1) / (stats[n]["tried"] + 2)) for n in names]
    return rng.choices(names, weights=weights, k=1)[0]


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
    tiers: str = "quality",
    sub_workers: int = 0,
    parallel: int = 1,
    neighborhoods: tuple = (),
):
    """Improve `solver`'s incumbent until `deadline` (a `time.time()` value). Returns `(solver, report)`:
    `solver` is the CpSolver holding the best solution (the input one if nothing was accepted) and `report`
    is `report["outerLns"]`.

    `configure_solver()` -> a fresh CpSolver with the payload's shared params (solve._configure_solver, passed
    in to avoid an import cycle). `stage_names` is solve._STAGE_NAMES; `quality_name` the last/optimized tier.

    `tiers="all"` (opt-in, `config.outerLns.tiers`): the default minimizes the quality tier only, so a coverage
    (RANK) or rest (REST) miss left by the staged ladder can never improve here. In "all" mode only the tiers
    BEFORE the first still-open one are held `<=` incumbent; the primary is the first of `stage_names[2:]`
    (RANK, REST, QUALITY -- everything after ERRORS/BLOCKING) that is non-zero at the incumbent, bounded `<=`
    incumbent too, and the objective is `LNS_TIER_SCALE * primary + sum(later tiers)`. LATER tiers are NOT
    bounded: a sub-solve may trade them for a primary gain, which the (always lexicographic over all five
    tiers) accept test treats as a strict improvement. Scale 1_000_000 (= solve._TIEBREAK_MULTIPLIER): primary
    stage values are ~1e3..1e7 so the product stays below ~1e14, far from int64; the scale is not a strict
    dominance guarantee (a later-tier swing > 1e6 can outweigh one primary unit) but the lexicographic accept
    test makes that harmless. `proven_optimal` is ignored in this mode (it only proves the quality tier given
    earlier tiers, which may themselves be unproven) unless RANK/REST/QUALITY are all already zero.

    `sub_workers` (opt-in, `config.outerLns.subWorkers`): CP-SAT workers per sub-solve, clamped to
    `1..main worker count`; 0 = unchanged (same count as the main solve). Each sub-solve is a tiny fixed-domain
    model, so 16 workers on it are mostly idle overhead.

    `parallel` (opt-in, `config.outerLns.parallel`, 1..8): run that many sub-solves concurrently (threads; CP-SAT
    releases the GIL), each on its own model clone over a neighborhood whose free key set is disjoint from the
    others'. Workers per sub-solve default to `main // parallel` (min 1) unless `sub_workers` is set. After a
    batch, improving sub-solutions with pairwise-disjoint free sets are merged onto the incumbent, and the
    merge is VERIFIED by solving a clone with every x fixed to the merged assignment (full objective, all
    tiers re-evaluated; infeasible or not strictly better than the best single sub-solution => fall back to
    that best single one). So the accepted incumbent is always a real solver solution that lexicographically
    beats the previous incumbent.
    """
    model = build_result.model
    store = build_result.store
    objective = build_result.objective
    t_start = time.time()

    def _tier_values(slv) -> dict:
        return {n: round(slv.value(objective.stage_exprs[n])) for n in stage_names}

    stats = {n: {"tried": 0, "accepted": 0, "gain": 0, "seconds": 0.0} for n in NEIGHBORHOODS + tuple(n for n in OPTIONAL_NEIGHBORHOODS if n in (neighborhoods or ()))}
    parallel = max(1, min(8, int(parallel or 1)))
    sub_workers = max(0, int(sub_workers or 0))
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
    all_mode = tiers == "all"
    tail = [n for n in stage_names if n in stage_names[2:]]  # RANK, REST, QUALITY (everything after ERRORS/BLOCKING)
    primary = quality_name
    if all_mode:
        primary = next((n for n in tail if incumbent_tiers[n] > 0 and not isinstance(objective.stage_exprs[n], int)), quality_name)
        report["tiers"] = "all"
        report["primaryTier"] = primary
        report["startTiers"] = dict(incumbent_tiers)
    skip_proven = proven_optimal and not (all_mode and any(incumbent_tiers[n] > 0 for n in tail))
    if skip_proven:
        # The last staged solve minimized exactly the quality tier under all earlier bounds and proved it.
        report["skipped"] = "staged solve proved optimal"
        return solver, report
    if isinstance(quality_expr, int) or not store.x:
        if not (all_mode and not isinstance(objective.stage_exprs[primary], int) and store.x):
            report["skipped"] = "empty quality tier" if isinstance(quality_expr, int) else "no variables"
            return solver, report

    # Earlier tiers can never get worse: hard bounds at the incumbent's value (redundant with the bounds
    # `_solve_staged` already added, but also covers the hint-fallback path where none were added).
    if all_mode:
        pi = list(stage_names).index(primary)
        for n in stage_names[: pi + 1]:
            if not isinstance(objective.stage_exprs[n], int):
                model.add(objective.stage_exprs[n] <= incumbent_tiers[n])
        later = sum((objective.stage_exprs[n] for n in stage_names[pi + 1:]), start=0)
        model.minimize(objective.stage_exprs[primary] if isinstance(later, int) and later == 0 else LNS_TIER_SCALE * objective.stage_exprs[primary] + later)
    else:
        for n in stage_names:
            if n == quality_name or isinstance(objective.stage_exprs[n], int):
                continue
            model.add(objective.stage_exprs[n] <= incumbent_tiers[n])
        model.minimize(quality_expr)
    subs = [model.clone() for _ in range(parallel)]
    ver = None  # lazily cloned verification model (parallel merges only)

    incumbent_solver = solver
    solution = list(solver.response_proto.solution)
    x_items = list(store.x.items())
    hood = _Neighborhoods(payload, store, objective, random.Random(seed))
    rng = hood.rng

    def _set_domains(sub, free: set) -> None:
        vars_pb = sub.proto.variables
        for key, var in x_items:
            vp = vars_pb[var.index]
            vp.domain.clear()
            if key in free:
                vp.domain.extend([0, 1])
            else:
                v = int(solution[var.index])
                vp.domain.extend([v, v])

    def _set_hint(sub) -> None:
        sub.clear_hints()
        hint = sub.proto.solution_hint
        hint.vars.extend(range(len(solution)))
        hint.values.extend(solution)

    def _make_solver(time_limit: float, run_seed: int):
        slv = configure_solver()
        slv.parameters.max_time_in_seconds = time_limit
        slv.parameters.random_seed = run_seed
        main_w = max(1, int(slv.parameters.num_workers) or 1)
        if sub_workers > 0:
            slv.parameters.num_workers = max(1, min(main_w, sub_workers))
        elif parallel > 1:
            slv.parameters.num_workers = max(1, main_w // parallel)
        return slv

    def _run_one(slv, sub, out: list, idx: int) -> None:
        t0 = time.time()
        try:
            status_name = slv.status_name(slv.solve(sub))
        except Exception:  # noqa: BLE001 -- one failed sub-solve must not kill the whole polish
            status_name = "ERROR"
        out[idx] = (status_name, time.time() - t0)

    def _verify_merge(merged: list):
        """Solve a clone with every x fixed to `merged`: returns a CpSolver holding the full re-evaluated
        solution, or None when the merge is infeasible (cross-neighborhood coupling)."""
        nonlocal ver
        if ver is None:
            ver = model.clone()
        vars_pb = ver.proto.variables
        for _key, var in x_items:
            vp = vars_pb[var.index]
            vp.domain.clear()
            v = int(merged[var.index])
            vp.domain.extend([v, v])
        ver.clear_hints()
        slv = configure_solver()
        slv.parameters.max_time_in_seconds = 10.0
        slv.parameters.num_workers = 1
        slv.parameters.random_seed = seed
        try:
            status_name = slv.status_name(slv.solve(ver))
        except Exception:  # noqa: BLE001
            return None
        return slv if status_name in ("OPTIMAL", "FEASIBLE") else None

    last_ord = tuple(incumbent_tiers[n] for n in stage_names)
    iteration = 0
    merged_batches = 0
    stop = False
    while not stop:
        now = time.time()
        remaining = deadline - now
        if remaining < 0.3:
            break
        if cancel_event is not None and cancel_event.is_set():
            break
        # Pick up to `parallel` neighborhoods with pairwise-disjoint free sets (serial: exactly one).
        batch = []  # (name, free, iteration)
        used: set = set()
        attempts = 0
        while len(batch) < parallel and attempts < (1 if parallel == 1 else 6 * parallel):
            attempts += 1
            name = _choose(stats, rng, iteration)
            free = hood.pick(name, incumbent_solver)
            iteration += 1
            if not free:
                stats[name]["tried"] += 1
                continue
            if parallel > 1 and not used.isdisjoint(free):
                continue
            used |= free
            batch.append((name, free, iteration))
            stats[name]["tried"] += 1
        if not batch:
            continue
        if progress is not None:
            progress.set_best(float(incumbent_tiers[quality_name]))
        runs = []
        for j, (name, free, it) in enumerate(batch):
            _set_domains(subs[j], free)
            _set_hint(subs[j])
            runs.append(_make_solver(max(0.2, min(sub_solve_seconds, remaining)), seed + it))
        out: list = [None] * len(batch)
        if len(batch) == 1:
            _run_one(runs[0], subs[0], out, 0)
        else:
            threads = [threading.Thread(target=_run_one, args=(runs[j], subs[j], out, j), daemon=True) for j in range(len(batch))]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

        improving = []  # (new_ord, new_tiers, slv, j)
        for j, (name, free, it) in enumerate(batch):
            status_name, secs = out[j]
            slv = runs[j]
            stats[name]["seconds"] += secs
            if all_mode and status_name == "MODEL_INVALID":
                stop = True  # objective overflow / invalid scaling: stop rather than spin (never expected, see LNS_TIER_SCALE)
                continue
            if status_name in ("OPTIMAL", "FEASIBLE"):
                new_tiers = _tier_values(slv)
                new_ord = tuple(new_tiers[n] for n in stage_names)
                if new_ord < last_ord:  # strict lexicographic improvement (tiers are bounded <=, so quality drives it)
                    improving.append((new_ord, new_tiers, slv, j))
                elif status_name == "OPTIMAL":
                    hood.scale[name] = min(2.5, hood.scale[name] * 1.25)  # proven no gain here: look wider
            else:
                hood.scale[name] = max(0.4, hood.scale[name] * 0.8)  # nothing found in the limit: look smaller
        if not improving:
            continue
        improving.sort(key=lambda e: (e[0], e[3]))
        chosen = [improving[0]]
        accepted_slv, accepted_tiers = improving[0][2], improving[0][1]
        if len(improving) > 1:
            taken = set(batch[improving[0][3]][1])
            selected = [improving[0]]
            for e in improving[1:]:
                if taken.isdisjoint(batch[e[3]][1]):
                    selected.append(e)
                    taken |= batch[e[3]][1]
            if len(selected) > 1:
                merged = list(solution)
                for e in selected:
                    sol_j = e[2].response_proto.solution
                    for key, var in x_items:
                        if key in batch[e[3]][1]:
                            merged[var.index] = sol_j[var.index]
                vslv = _verify_merge(merged)
                if vslv is not None:
                    v_tiers = _tier_values(vslv)
                    v_ord = tuple(v_tiers[n] for n in stage_names)
                    if v_ord < improving[0][0]:
                        chosen, accepted_slv, accepted_tiers = selected, vslv, v_tiers
                        merged_batches += 1
        prev_quality = incumbent_tiers[quality_name]
        for e in chosen:
            name = batch[e[3]][0]
            stats[name]["accepted"] += 1
            stats[name]["gain"] += max(0, prev_quality - e[1][quality_name])
            report["accepted"] += 1
        incumbent_solver = accepted_slv
        solution = list(accepted_slv.response_proto.solution)
        incumbent_tiers = accepted_tiers
        last_ord = tuple(incumbent_tiers[n] for n in stage_names)
        if progress is not None:
            progress.offer(accepted_slv.value, float(accepted_tiers[quality_name]))  # live feed; no-op unless opted in

    if progress is not None:
        progress.flush(incumbent_solver, float(incumbent_tiers[quality_name]))  # live feed; no-op unless opted in
    report["iterations"] = sum(v["tried"] for v in stats.values())
    for v in stats.values():
        v["seconds"] = round(v["seconds"], 2)
    if sub_workers > 0:
        report["subWorkers"] = sub_workers
    if parallel > 1:
        report["parallel"] = parallel
        report["mergedBatches"] = merged_batches
    report["endObjective"] = incumbent_tiers[quality_name]
    if all_mode:
        report["endTiers"] = dict(incumbent_tiers)
    report["seconds"] = round(time.time() - t_start, 2)
    return incumbent_solver, report
