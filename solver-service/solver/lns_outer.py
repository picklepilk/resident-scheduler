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

from solver.callbacks import MultiCallback
from solver.stall import StallStop

NEIGHBORHOODS = ("window", "residents", "shiftWindow", "worstTerms")
# Extras (config.outerLns.neighborhoods / eligibilityGroup), added to the four above.
# nightCleanup / qualityWorst (2026-11-23): quality-tier-aware, see _Neighborhoods.night_cleanup / quality_worst.
OPTIONAL_NEIGHBORHOODS = ("eligibilityGroup", "nightCleanup", "qualityWorst")
# "Night search", default ON since 2026-11-24 (owner; bench base4b/base4c on top of quick start: better in 20 of 24
# paired 5 min runs and 7 of 8 at 15 min, about 3 fewer isolated nights). Used when `neighborhoods` is absent or
# not a list; an explicit list (even []) replaces it. Old behaviour: {neighborhoods: [], shrinkOnTimeout: false}.
DEFAULT_EXTRA_NEIGHBORHOODS = ("nightCleanup", "qualityWorst")

DEFAULT_FRACTION = 0.5
MAX_STEP_RECORDS = 600  # report["outerLns"]["steps"] cap (a 2 h run at ~3 s per step would otherwise be ~2400 rows)
DEFAULT_SUB_SOLVE_SECONDS = 5.0
LNS_TIER_SCALE = 1_000_000  # tiers="all" objective: primary * scale + later tiers (see run_outer_lns)


@dataclass(frozen=True)
class OuterLnsConfig:
    enabled: bool = True
    fraction: float = DEFAULT_FRACTION
    sub_solve_seconds: float = DEFAULT_SUB_SOLVE_SECONDS
    tiers: str = "quality"  # "quality" (default) | "all" -- see run_outer_lns
    sub_workers: int = 0  # CP-SAT workers per sub-solve; 0 = same as the main solve (see run_outer_lns)
    neighborhoods: tuple = DEFAULT_EXTRA_NEIGHBORHOODS  # extra neighborhood names (subset of OPTIONAL_NEIGHBORHOODS)
    parallel: int = 1  # concurrent sub-solves on disjoint neighborhoods; 1 = serial (see run_outer_lns)
    shrink_on_timeout: bool = True  # shrink a neighborhood's scale when a sub-solve ends FEASIBLE with no strict gain
    skip: tuple = ()  # neighborhood names dropped from the active set (defaults and extras alike)
    # Round 2 options (2026-11-24), all OFF by default; see docs/PAYLOAD_SCHEMA.md "Round 2 options".
    sub_stall_seconds: float = 0.0  # > 0: stop a sub-solve that found no better solution for this long (0 = run to the cap)
    chooser: str = "success"  # "success" (smoothed acceptance rate) | "gainRate" (smoothed quality points per second)
    grow_on_success: bool = False  # grow a neighborhood's scale while it keeps winning


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

    extras: list = list(DEFAULT_EXTRA_NEIGHBORHOODS)
    nb = raw.get("neighborhoods")
    if isinstance(nb, (list, tuple)):  # explicit list replaces the default extras ([] = the four base ones only)
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
        shrink_on_timeout=raw.get("shrinkOnTimeout") is not False,
        sub_stall_seconds=_num("subStallSeconds", 0.0, 0.0, 60.0),
        chooser="gainRate" if raw.get("chooser") == "gainRate" else "success",
        grow_on_success=raw.get("growOnSuccess") is True,
        skip=tuple(n for n in NEIGHBORHOODS + OPTIONAL_NEIGHBORHOODS if isinstance(raw.get("skip"), (list, tuple)) and n in raw["skip"]),
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
        self._cleanup_queue: list = []  # nightCleanup rotation: stints still to visit this cycle
        self._night_exempt = {r.id for r in payload.residents if getattr(r, "night_exempt", False)}

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

    # ---- quality-tier-aware neighborhoods (opt-in) ----

    @staticmethod
    def _values(solution):
        """Solution vector from a CpSolver (response_proto.solution) or a plain sequence."""
        proto = getattr(solution, "response_proto", None)
        return proto.solution if proto is not None else solution

    def _night_runs(self, vals) -> dict:
        """rid -> list of (start_idx, end_idx) maximal night runs in block date order (night[] vars)."""
        runs: dict = {}
        D = len(self.dates)
        for rid in self.rids:
            if rid in self._night_exempt:
                continue
            cur = None
            out = []
            for i, d in enumerate(self.dates):
                nv = self.store.night.get((rid, d))
                on = nv is not None and int(vals[nv.index]) == 1
                if on and cur is None:
                    cur = i
                elif not on and cur is not None:
                    out.append((cur, i - 1))
                    cur = None
            if cur is not None:
                out.append((cur, D - 1))
            if out:
                runs[rid] = out
        return runs

    def night_stints(self, solution) -> list:
        """Interior night stints of length 1 or 2 (the ones the objective charges: isolatedNight for 1,
        shortNightStint for 2; edge runs touching the block's first/last date are exempt there, so skipped
        here). Sorted list of (rid, start_idx, end_idx)."""
        vals = self._values(solution)
        D = len(self.dates)
        found = []
        for rid, runs in self._night_runs(vals).items():
            for a, b in runs:
                if b - a + 1 <= 2 and a >= 1 and b <= D - 2:
                    found.append((rid, a, b))
        return sorted(found)

    def night_cleanup(self, solution) -> set:
        """Free the resident's cells for +/- pad days around one short night stint plus the cells (same days)
        of other residents holding a night in that window. pad = round(3 * scale), other-resident cap =
        max(2, round(8 * scale)). Stints are visited in a seeded-shuffled rotation (each stint once per cycle)."""
        stints = self.night_stints(solution)
        if not stints:
            return self.window(solution)  # nothing to clean: behave like a plain window move
        live = set(stints)
        self._cleanup_queue = [t for t in self._cleanup_queue if t in live]
        if not self._cleanup_queue:
            self._cleanup_queue = list(stints)
            self.rng.shuffle(self._cleanup_queue)
        rid, a, b = self._cleanup_queue.pop()
        scale = self.scale["nightCleanup"]
        pad = max(1, round(3 * scale))
        lo, hi = max(0, a - pad), min(len(self.dates) - 1, b + pad)
        win = set(self.dates[lo:hi + 1])
        vals = self._values(solution)
        holders = []
        for r in self.rids:
            if r == rid or r in self._night_exempt:
                continue
            if any(int(vals[self.store.night[(r, d)].index]) == 1 for d in win if (r, d) in self.store.night):
                holders.append(r)
        cap = max(2, round(8 * scale))
        if len(holders) > cap:
            self.rng.shuffle(holders)
            holders = holders[:cap]
        group = {rid, *holders}
        return {k for r in group for k in self.by_resident.get(r, []) if k[2] in win}

    def quality_pain(self, solution) -> dict:
        """PROXY for each resident's quality-tier contribution, derived from the incumbent grid (the objective
        builder keeps only flat (coef, expr) lists, no per-resident attribution). Units match the solver weights
        (`objective.weights`, defaults 300/60/300|100/100/100/25/12): isolated interior night, short interior
        night stint (len 2..4), extra night runs (avoidable vs forced), isolated single work day, work runs
        beyond ceil(worked/6), interior 2-day work runs, area changes inside interior work runs.
        Residents with no pain are absent."""
        W = getattr(self.objective, "weights", None) or {}

        def w(key, sub, default):
            try:
                return int(W[key][sub])
            except (KeyError, TypeError, ValueError):
                return default

        iso_n, short_n = w("isolatedNight", "perUnit", 300), w("shortNightStint", "perUnit", 60)
        frag_av, frag_fo = w("nightFragment", "avoidableCost", 300), w("nightFragment", "forcedCost", 100)
        iso_w, frag_w = w("workShape", "isolatedCost", 100), w("workShape", "fragmentCost", 100)
        pair_w, churn_w = w("workShape", "pairRunCost", 25), w("workShape", "areaChurnCost", 12)
        vals = self._values(solution)
        D = len(self.dates)
        area_on: dict = {}  # (rid, date) -> area of a shift held
        for (rid, sid, d), var in self.store.x.items():
            if int(vals[var.index]) == 1 and d in self.date_index:
                area_on[(rid, d)] = self._shift_attr(sid, "area")
        pain: dict = {}
        for rid, runs in self._night_runs(vals).items():
            total = sum(b - a + 1 for a, b in runs)
            p = 0
            for a, b in runs:
                n = b - a + 1
                if a >= 1 and b <= D - 2:
                    if n == 1:
                        p += iso_n
                    elif n < 5:
                        p += short_n * (5 - n)
            if len(runs) > 1:
                p += (len(runs) - 1) * (frag_av if total <= 6 else frag_fo)
            if p:
                pain[rid] = p
        for rid in self.rids:
            works = [(rid, d) in area_on or (self.store.work.get((rid, d)) is not None and int(vals[self.store.work[(rid, d)].index]) == 1) for d in self.dates]
            runs, i = [], 0
            while i < D:
                if works[i]:
                    j = i
                    while j + 1 < D and works[j + 1]:
                        j += 1
                    runs.append((i, j))
                    i = j + 1
                else:
                    i += 1
            p = 0
            worked = sum(b - a + 1 for a, b in runs)
            for a, b in runs:
                n = b - a + 1
                if n == 1:
                    p += iso_w
                if n == 2 and a >= 1 and b <= D - 2:
                    p += pair_w
                if a >= 1 and b <= D - 2:
                    for k in range(a, b):
                        x1, x2 = area_on.get((rid, self.dates[k])), area_on.get((rid, self.dates[k + 1]))
                        if x1 is not None and x2 is not None and x1 != x2:
                            p += churn_w
            p += max(0, len(runs) - (-(-worked // 6))) * frag_w
            if p:
                pain[rid] = pain.get(rid, 0) + p
        return pain

    def quality_worst(self, solution) -> set:
        """Like worstTerms, ranked by `quality_pain`: anchor among the worst few, same-cohort preference."""
        pain = self.quality_pain(solution)
        if not pain:
            return self.residents(solution)
        size = round(self.rng.randint(4, 6) * self.scale["qualityWorst"])
        ranked = sorted(pain, key=lambda r: (-pain[r], r))
        group = self._group(ranked[: max(2, size // 2)], size)
        free: set = set()
        for r in group:
            free.update(self.by_resident.get(r, []))
        return free

    def pick(self, name: str, solution) -> set:
        return {
            "nightCleanup": self.night_cleanup,
            "qualityWorst": self.quality_worst,
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
    stop_event=None,
    proven_optimal: bool = False,
    tiers: str = "quality",
    sub_workers: int = 0,
    parallel: int = 1,
    neighborhoods: tuple = (),
    shrink_on_timeout=None,
    skip=None,
    sub_stall_seconds=None,
    chooser=None,
    grow_on_success=None,
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

    `neighborhoods` adds extras (eligibilityGroup, nightCleanup, qualityWorst; this function's own default is
    none, solve.py passes the config's, which defaults to nightCleanup + qualityWorst). `skip` (names) drops
    neighborhoods from the active set, defaults included (ignored if it would empty the set).
    `shrink_on_timeout` shrinks a neighborhood's scale (x0.8, min 0.4) when its sub-solve ends FEASIBLE
    (not proven OPTIMAL) without a strict gain. Both default to `payload.config.outer_lns` (None = read
    from there; solve.py passes only `neighborhoods`). `report["timing"]` = {fixSeconds, solveSeconds,
    otherSeconds}; no presolve split (CP-SAT exposes none without parsing its log).
    """
    model = build_result.model
    store = build_result.store
    objective = build_result.objective
    t_start = time.time()

    def _tier_values(slv) -> dict:
        return {n: round(slv.value(objective.stage_exprs[n])) for n in stage_names}

    cfg_outer = getattr(getattr(payload, "config", None), "outer_lns", None)
    if shrink_on_timeout is None:
        shrink_on_timeout = bool(getattr(cfg_outer, "shrink_on_timeout", False))
    if skip is None:
        skip = tuple(getattr(cfg_outer, "skip", ()) or ())
    # Round 2 options (None = read config.outerLns; all default off).
    if sub_stall_seconds is None:
        sub_stall_seconds = float(getattr(cfg_outer, "sub_stall_seconds", 0.0) or 0.0)
    if chooser is None:
        chooser = getattr(cfg_outer, "chooser", "success") or "success"
    if grow_on_success is None:
        grow_on_success = bool(getattr(cfg_outer, "grow_on_success", False))
    steps: list = []  # per-step record, capped at MAX_STEP_RECORDS (report["steps"])
    active = tuple(n for n in NEIGHBORHOODS if n not in skip) + tuple(n for n in OPTIONAL_NEIGHBORHOODS if n in (neighborhoods or ()) and n not in skip)
    if not active:  # skip would empty the set: ignore it
        active = NEIGHBORHOODS + tuple(n for n in OPTIONAL_NEIGHBORHOODS if n in (neighborhoods or ()))
    stats = {n: {"tried": 0, "accepted": 0, "gain": 0, "seconds": 0.0} for n in active}
    t_fix = t_solve = 0.0
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

    def _step_baseline(sub):
        """Objective value (original scale, as `cb.objective_value`) of the incumbent under the sub-model's
        objective; None when it cannot be evaluated (the first callback value is used instead)."""
        try:
            o = sub.proto.objective
            if not len(o.vars):
                return None
            val = sum(int(c) * solution[v] for v, c in zip(o.vars, o.coeffs)) + o.offset
            return val * (o.scaling_factor or 1.0)
        except Exception:  # noqa: BLE001
            return None

    class _GainWatch:
        """Seconds (from sub-solve start) of the last solution strictly better than the step's incumbent."""

        def __init__(self, baseline, t0):
            self.base, self.t0, self.last_gain = baseline, t0, None

        def on_solution(self, cb) -> None:
            obj = cb.objective_value
            if self.base is None:
                self.base = obj  # no evaluable incumbent value: the first solution (the hint) is the baseline
            elif obj < self.base - 1e-6:
                self.last_gain = time.time() - self.t0

    def _run_one(slv, sub, out: list, idx: int) -> None:
        t0 = time.time()
        last_gain = None
        stalled = False
        try:
            if sub_stall_seconds > 0:
                watch = _GainWatch(_step_baseline(sub), t0)  # per-call state: safe in parallel threads
                with StallStop(slv, sub_stall_seconds) as stall:
                    status_name = slv.status_name(slv.solve(sub, MultiCallback([watch, stall])))
                last_gain = watch.last_gain
                stalled = bool(stall.fired) and status_name != "OPTIMAL"
            else:
                status_name = slv.status_name(slv.solve(sub))
        except Exception:  # noqa: BLE001 -- one failed sub-solve must not kill the whole polish
            status_name = "ERROR"
        # (status, wall seconds, seconds from sub-solve start to its last strictly better solution or None,
        #  stopped by the sub-solve stall rule). The last two are filled when `sub_stall_seconds` > 0.
        out[idx] = (status_name, time.time() - t0, last_gain, stalled)

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
        if stop_event is not None and stop_event.is_set():  # "stop and keep best": return the incumbent
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
        t_a = time.time()
        for j, (name, free, it) in enumerate(batch):
            _set_domains(subs[j], free)
            _set_hint(subs[j])
            runs.append(_make_solver(max(0.2, min(sub_solve_seconds, remaining)), seed + it))
        t_fix += time.time() - t_a
        t_a = time.time()
        out: list = [None] * len(batch)
        if len(batch) == 1:
            _run_one(runs[0], subs[0], out, 0)
        else:
            threads = [threading.Thread(target=_run_one, args=(runs[j], subs[j], out, j), daemon=True) for j in range(len(batch))]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        t_solve += time.time() - t_a

        improving = []  # (new_ord, new_tiers, slv, j)
        step_refs: dict = {}  # j -> this batch's step record
        for j, (name, free, it) in enumerate(batch):
            status_name, secs, last_gain_s, stalled = out[j]
            slv = runs[j]
            stats[name]["seconds"] += secs
            step = {"n": name, "size": len(free), "scale": round(hood.scale[name], 3), "s": round(secs, 2),
                    "lastGain": None if last_gain_s is None else round(last_gain_s, 2), "status": status_name,
                    "stalled": bool(stalled), "gain": 0}
            step_refs[j] = step
            if len(steps) < MAX_STEP_RECORDS:
                steps.append(step)
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
                elif stalled:
                    pass  # stopped by the sub-solve stall rule without gain: says nothing about size, leave it
                elif shrink_on_timeout:
                    hood.scale[name] = max(0.4, hood.scale[name] * 0.8)  # timed out (FEASIBLE) without gain: look smaller
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
            if e[3] in step_refs:
                step_refs[e[3]]["gain"] = max(0, prev_quality - e[1][quality_name])
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
    report["scales"] = {n: round(hood.scale[n], 3) for n in stats}  # final per-neighborhood size multipliers
    report["steps"] = steps  # [{n, size, scale, s, lastGain, status, stalled, gain}], first MAX_STEP_RECORDS sub-solves
    if sub_stall_seconds > 0:
        report["subStallSeconds"] = sub_stall_seconds
    if chooser != "success":
        report["chooser"] = chooser
    if grow_on_success:
        report["growOnSuccess"] = True
    if all_mode:
        report["endTiers"] = dict(incumbent_tiers)
    report["seconds"] = round(time.time() - t_start, 2)
    report["timing"] = {
        "fixSeconds": round(t_fix, 2),
        "solveSeconds": round(t_solve, 2),
        "otherSeconds": round(max(0.0, time.time() - t_start - t_fix - t_solve), 2),
    }
    return incumbent_solver, report
