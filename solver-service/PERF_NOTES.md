# Solver performance investigation (2026-08-22)

Scope: `solver-service/` only. Goal: make the CP-SAT solve measurably faster
and/or produce better schedules within the same 30s budget, without
weakening any rule.

## TL;DR

- `solver/model/trauma_runs.py`'s hard cap and all four of its soft terms
  iterate **every** resident x a sliding window over **every** date,
  regardless of eligibility. On the real production payload only 16/58
  residents (28%) are ever eligible for `TRAUMA-N` at all, and 18/58 (31%)
  have zero night-shift eligibility of any kind — yet the module paid full
  price for all 58.
- Added structural-impossibility pruning (skip a resident/window/position
  only when the triggering assignment is a **provable python constant 0**,
  never a preference) to `add_trauma_run_hard_cap`,
  `add_trauma_second_in_run_terms`, `add_trauma_mid_run_terms`,
  `add_night_duration_alternation_terms`, and `add_second_rest_day_terms`.
- Measured on the real 58-resident/28-date production payload: this
  module's own contribution to the model dropped **~90%** (17,748 -> 1,758
  vars, 27,434 -> 3,382 constraints) when `traumaNightShiftIds` is empty
  (today's default — every existing payload), and **~85%** (18,070 -> 2,707
  vars, 27,916 -> 5,132 constraints) on a payload with the new round-2
  fields populated. Full-model size: -22 to -23% vars, -13.6 to -14.5%
  constraints.
- `em_composition.py` was already well-guarded (an `if not payload.
  em_resident_ids: return` early-out plus an `if not all_vars: continue`
  per shift-date) — **no changes needed there**, confirmed by direct
  measurement (it contributes only 320 vars / 480 constraints on the
  augmented payload, not worth touching).
- The real 58-resident payload never proves OPTIMAL in 30s (~55-83% gap)
  either before or after this change — it's a genuinely large, capacity-
  saturated CP-SAT instance, and this fix doesn't change that. Build time
  improved consistently; solve-time-to-optimum on smaller synthetic
  instances did **not** show a statistically significant improvement (see
  "Honest negative result" below). Parameter tuning (linearization level,
  presolve, worker count) is already correctly configured and no
  alternative measurably beat current defaults.
- **9 new pytest cases** added, each proving a pruning rule is exact at its
  boundary (not just in the empty-set fast path). Full suite: **119 passed**
  (110 before, all still green).

## Environment

- venv: `solver-service/.venv/Scripts/python.exe`
- Local machine: 16 logical CPUs (`os.cpu_count()`). Production (Fly.io):
  2 vCPUs. `solver/solve.py`'s `_num_workers()` already does
  `min(payload.config.num_workers, os.cpu_count())`, so it already asks for
  the right number of workers per environment with no code change needed —
  confirmed by directly running with `num_workers=2`, see below.
- Benchmark payloads:
  - **original**: `~/Downloads/demo_solver_payload.json` (58 residents, 28
    dates, 482 min slots; no round-2 fields — `config.weights={}`,
    `numWorkers:8`, `maxTimeSeconds:30`).
  - **round2**: same payload + `traumaNightShiftIds:["TRAUMA-N"]`,
    `pedsNightShiftIds:["PED-N"]`, `pedsInternNightTarget:5`,
    `pedsSplitInternIds` (2 residents with `traumaPedsSplit` set),
    `emResidentIds` (42 residents with `isEmCore:true`),
    `emPgy2ResidentIds`/`emPgy3ResidentIds` (13 each, from `cohort ==
    "EM_HOME_2"/"EM_HOME_3"`). Built by
    `scratchpad/perf/build_augmented.py` from the resident metadata already
    present in the payload (`isEmCore`, `cohort`, `traumaPedsSplit`) — no
    synthesis needed, the real payload carries this data.
  - **mid** (16 residents, 10 dates, 8 trauma-eligible) and **tiny** (12
    residents, 7 dates, 6 trauma-eligible): subsets of the round2 payload,
    built to actually reach `OPTIMAL` within a short budget so solve time
    itself (not just "did it time out") could be compared — the full
    58-resident payload never converges either before or after this
    change, so it can't show a solve-time delta on its own.

## 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget)

| payload  | vars  | constraints | build_ms (avg) | status  | solve_s | gap%          |
|----------|-------|-------------|-----------------|---------|---------|----------------|
| original | 69308 | 166440      | ~2127           | FEASIBLE| 30.1    | 61.6 / 64.6 / 72.2 |
| round2   | 69630 | 166922      | ~2038           | FEASIBLE| 30.1    | 67.2 / 69.2 / 73.6 |

Neither payload proves OPTIMAL in 30s at 8 workers; both time out FEASIBLE
with a large (60-75%) optimality gap. `ResponseStats()` for a representative
run (original, run 0):

```
status: FEASIBLE
objective: 18325800        best_bound: 5088500
booleans: 15101             conflicts: 57            branches: 69147
propagations: 490195        integer_propagations: 897859
restarts: 1                 lp_iterations: 0
deterministic_time: 146.422 gap_integral: 2412.57
```

At **2 workers** (simulating Fly's 2 vCPUs, `_num_workers()`'s actual clamp
in production), both payloads are meaningfully worse — gap 72-83% instead
of 55-75% — confirming this is a genuinely hard instance for the production
hardware, independent of anything this change touches.

## 2. Per-module size contribution (isolated measurement)

Built the model through `coverage/rest/circadian/workday_limits/hours_cap`
only, then added each `trauma_runs.py`/`em_composition.py` function one at a
time, measuring the *cumulative* vars/constraints delta
(`scratchpad/perf/module_contrib.py`):

**Before this change** (identical for both payloads — see "why" below):

| function                     | vars   | constraints |
|-------------------------------|--------|-------------|
| `add_trauma_run_hard_cap`     | +0     | +8120       |
| `add_trauma_second_in_run_terms` | +8120 | +8120    |
| `add_trauma_mid_run_terms`    | +3132  | +4698       |
| `add_night_duration_alternation_terms` | +3248 | +3248 |
| `add_second_rest_day_terms`   | +3248  | +3248       |
| `add_peds_intern_night_deficit_term` | +0 (orig) / +2 (round2) | same |
| `add_em_composition_terms`    | +0 (orig) / +320 (round2) | +0 / +480 |
| `add_pgy_fallback_terms`      | +0     | +0          |
| **total**                     | **+17,748 (orig) / +18,070 (round2)** | **+27,434 / +27,916** |

**Why "before" is nearly identical between the two payloads**: none of the
five trauma-run functions were gated on `trauma_night_shift_ids` being
non-empty — only `add_trauma_run_hard_cap`'s docstring *claimed* the module
is "a documented no-op" when that field is empty. It's a no-op in the sense
that every derived cost var is provably forced to 0 (via `_link_trauma`),
but the python-level loop still built the **full** O(residents x
window-offsets) set of vars/constraints to force it there. That's the
actual finding this task's hypothesis was pointing at: the "no-op" was
semantically true but not free.

**After this change:**

| payload  | trauma_runs.py + em_composition.py total | reduction |
|----------|-------------------------------------------|-----------|
| original | vars +1,758 / constraints +3,382           | -90.1% / -87.7% |
| round2   | vars +2,707 / constraints +5,132           | -85.0% / -81.6% |

Full-model totals (production 58-resident payload, `build_model()`):

| payload  | vars (before -> after) | constraints (before -> after) |
|----------|--------------------------|----------------------------------|
| original | 69,308 -> 53,318 (**-23.1%**) | 166,440 -> 142,388 (**-14.5%**) |
| round2   | 69,630 -> 54,267 (**-22.1%**) | 166,922 -> 144,138 (**-13.6%**) |

`em_composition.py` was **not modified** — it already guards
`add_em_composition_terms` with `if not payload.em_resident_ids: return`
and `if not all_vars: continue` per (shift, date) before creating any
reification var, and `add_pgy_fallback_terms` never reifies anything (flat
sum over existing x-vars only). Its total contribution (320 vars / 480
constraints on the round2 payload) is small and already minimal.

## 3. The fix

`solver/model/trauma_runs.py` gained two helpers:

- `_trauma_possible_indices(payload, store, resident)`: the exact set of
  `payload.all_dates` indices where `trauma[resident, date]` could ever be
  forced to 1 — a fixed historical fact from `prior_tail` (contributes a
  constant 1) or a live x-var for a trauma shift that date (from
  `store.by_resident_date`, the same source `_link_trauma` itself sums
  over). Empty exactly when `_link_trauma` would force `trauma[r,d] == 0`
  for every date — computed once per resident instead of rediscovered by
  every window.
- `_night_possible_indices(payload, store, resident)`: same idea, keyed off
  any NIGHT-type shift (not just trauma), for the two soft terms that key
  off night runs generally (`nightDurationAlternation`, `secondRestDay`).

Applied pruning, each one an exact equivalence (never a preference):

- **`add_trauma_run_hard_cap`**: skip a resident entirely with no
  trauma-possible date at all (every window's constraint would reduce to
  "0 <= 2 + M*(...)", always true). Per window, skip when fewer than 3
  positions in the window are trauma-possible — the true achievable trauma
  sum in that window can never exceed that count, so a count <=2 already
  satisfies the cap of 2 by construction, no matter what the non-night
  terms are.
- **`add_trauma_second_in_run_terms`**: skip a candidate `(a, b)` pair
  unless BOTH endpoints are trauma-possible — the AND requires
  `trauma[a] == trauma[b] == 1`, and either endpoint being a provable 0
  forces the whole AND to 0.
- **`add_trauma_mid_run_terms`**: skip position `d` unless it is itself
  trauma-possible — `trauma[d]` being a provable 0 forces the whole
  4-conjunct AND to 0 regardless of the other three.
- **`add_night_duration_alternation_terms`**: skip a resident with zero
  night-possible dates at all; per date-pair, skip unless BOTH `idx` and
  `idx+1` are night-possible (regardless of which two duration classes are
  being compared — if either date can never be ANY night shift, every
  class-pair AND for that pair is 0).
- **`add_second_rest_day_terms`**: skip a resident with zero night-possible
  dates; per candidate run-end `e`, skip unless `e-2`, `e-1`, and `e` are
  ALL night-possible (the `run_end` AND requires all three to be nights).

None of this touches `_link_trauma` itself (cheap — 1,624 constraints total,
one linking equality per resident-date, needed regardless) or
`circadian.py`'s own `night[r,d]` linking. Nothing about `elastic.py`
(pass 2) needed a separate fix: it calls the exact same
`add_trauma_run_hard_cap(model, payload, store)` function build.py does, so
the pruning applies to both passes automatically.

## 4. Correctness guardrail

9 new pytest cases in `tests/test_trauma_runs.py`, each proving a specific
pruning rule is exact **at its boundary**, not just in the trivial
empty-eligibility case:

- `test_trauma_possible_indices_empty_when_never_eligible_for_trauma` /
  `test_trauma_possible_indices_includes_a_trauma_shift_in_the_prior_tail`:
  the helper itself is correct, including reading a fixed tail-history
  trauma shift.
- `test_hard_cap_still_forbids_three_trauma_nights_when_exactly_three_positions_are_possible`:
  boundary at count == 3 (the smallest count the skip must NOT fire for) —
  the hard cap still catches the violation.
- `test_hard_cap_emits_no_window_constraint_when_only_two_positions_are_possible`:
  boundary at count == 2 — confirms the skip actually fires (asserts the
  exact constraint count added equals `len(dates)`, i.e. only
  `_link_trauma`'s linking equalities, zero window constraints) AND that
  nothing is over-constrained (both eligible dates as TRAUMA-N stays
  feasible).
- `test_second_in_run_stays_inert_when_one_endpoint_is_never_trauma_eligible`:
  both candidate pairs have >=1 structurally-impossible endpoint — group
  stays empty.
- `test_mid_run_stays_inert_when_the_middle_date_is_never_trauma_eligible`:
  resident IS trauma-eligible **elsewhere** in the block (so the
  resident-level skip must not fire) but never on the specific interior
  dates being tested — proves the finer per-position skip is what's doing
  the work.
- `test_night_possible_indices_empty_when_never_night_eligible`,
  `test_alternation_stays_inert_for_a_resident_with_zero_night_eligibility`,
  `test_second_rest_day_stays_inert_for_a_resident_with_zero_night_eligibility`:
  the night-based pruning for the two non-trauma-specific soft terms.

All pre-existing positive-case tests (hard cap catching a real 3rd trauma
night with full eligibility, second-in-run/mid-run/alternation/second-rest-
day firing when the assignment IS reachable) continue to pass unmodified —
they already exercise the pruned code path with full eligibility, so they
prove the "don't skip when the term CAN be nonzero" side.

**Full suite: 119 passed** (was 110; `.venv/Scripts/python.exe -m pytest -q`).

## 5. Solve-time impact (honest result)

The 58-resident production payload never reaches OPTIMAL in 30s regardless
of this change (both before and after time out FEASIBLE with a large gap),
so it cannot show a solve-time delta directly. To get an instance that
actually *converges*, two smaller subsets of the same payload were built
(same shift catalog, same eligibility structure, same trauma-eligible
fraction ~50%):

| instance | residents | dates | vars (before->after) | solve_s before (n=10, mean+-sd) | solve_s after (n=10, mean+-sd) |
|----------|-----------|-------|------------------------|-----------------------------------|-----------------------------------|
| tiny     | 12        | 7     | 4051 -> 3345           | 1.43 +- 0.35 (n=5)                 | 1.73 +- 0.28 (n=5)                 |
| mid      | 16        | 10    | 7357 -> 6001           | 5.60 +- 1.23 (n=10)                | 6.49 +- 1.61 (n=10)                |

Both instances reach OPTIMAL (0% gap) either way. **The apparent "after is
slower" direction is not statistically significant** (mid-size instance,
Welch t = 1.39, n=10 each — nowhere near the ~2.1 needed for p<0.05 at this
sample size); it's within the run-to-run wall-clock noise inherent to
CP-SAT's parallel-portfolio search on an 8-worker box. **Build time did
improve consistently** at every scale tested (mid: ~250ms -> ~211ms avg;
full production payload: ~2127ms -> ~1631ms avg for `original`).

**Interpretation, stated plainly**: this change is a **provably-correct,
substantial model-size reduction** (13-23% fewer vars/constraints
full-model, ~85-90% less waste specifically from `trauma_runs.py`) with a
consistent **build-time** win. It does **not** demonstrably change
wall-clock **solve** time on the instance sizes I could get to actually
converge, and it does not flip the real 58-resident payload from FEASIBLE
to OPTIMAL at 30s (that instance is capacity-saturated and hard regardless
of how many redundant-but-quickly-presolved constraints it carries). I'm
reporting this directly rather than overselling a build-time win as a
solve-time one.

## 6. Parameter tuning (measured, not shipped)

- **`num_workers`**: already correctly clamped (`min(payload.config.
  num_workers, os.cpu_count())` in `solver/solve.py`). Verified directly:
  running with `num_workers=2` (Fly's actual vCPU count) on both payloads
  produces a materially worse gap (72-83%) than 8 workers (55-75%) at 30s
  — expected, and not something a code change here can fix. No change
  needed; the clamp already does the right thing per-environment.
- **`linearization_level`** (0 vs default(1) vs 2) and **`cp_model_presolve`**
  (True vs False), swept at a 12s budget on the round2 payload
  (`scratchpad/perf/param_sweep.py`, single run each, exploratory):
  presolve OFF is much worse (91% gap vs 85% default) as expected;
  `linearization_level` 0 and 2 were both slightly worse than the default
  in this one-shot comparison. **No parameter change is recommended** —
  current defaults already win or tie every alternative tried.
- **`add_hint()` warm start**: not implemented. Building a real warm-start
  hint requires generating a candidate feasible schedule first (e.g. via
  the existing JS greedy generator's output, or a cheap heuristic pass),
  which is a substantially larger change than this task's scope and wasn't
  attempted — flagged here as unexplored future work rather than
  guessed-at.

## Files touched

- `solver/model/trauma_runs.py` — pruning helpers + 5 call sites (+115
  lines, all additive; no existing logic removed or reordered beyond
  inserting `continue`/skip checks).
- `tests/test_trauma_runs.py` — 9 new boundary-correctness tests (+223
  lines).
- Nothing outside `solver-service/` was touched. Nothing committed, nothing
  deployed, per instructions.

## Reproduction

```bash
cd solver-service
.venv/Scripts/python.exe -m pytest -q                      # 119 passed
# benchmark scripts used for the numbers above live in the session
# scratchpad under perf/ (bench.py, module_contrib.py, build_augmented.py,
# build_small.py / build_mid.py / build_tiny.py, param_sweep.py) -- not
# committed, per "solver-service scope only" / "don't commit".
```

## em-scheduler ports A/B (2026-11-05, PicklePower)

PicklePower (8 cores, Windows, OR-Tools 9.15), EMSolver idle (`busy:false`, CPU 8%). `scripts/bench-engines.mjs --fixture realScale --budgets 300 --seeds 3 --variants <file>` (58 synthetic residents), warm-started from the local best-of-20 (`errors 6, blockWarn 4, [14,0,0,1971.4]`). Columns are the JS `betterQuality` inputs, scored by `validateAll` on the returned schedule. Every variant has stall on except A.

| Variant | Seed 42 | Seed 43 | Seed 44 |
|---|---|---|---|
| A base (stall off) | 5 / 5 / [5,0,0,1953.8] | 5 / 4 / [6,0,0,1680.3] | 4 / 6 / [6,0,0,1886.3] |
| B stall | 5 / 5 / [7,0,0,1814.0] | 5 / 4 / [5,0,0,1825.4] | 4 / 5 / [4,0,0,1924.9] |
| C stall + impliedCliques (1825) | 5 / 5 / [7,0,0,1775.2] | 5 / 4 / [6,0,0,1622.0] | 5 / 5 / [9,0,0,1418.1] |
| **D stall + lexStrict** | **3 / 3 / [0,0,0,1293.1]** | **3 / 3 / [0,0,0,1317.2]** | **3 / 3 / [0,0,0,1416.1]** |
| E stall + shortlist 5 | 5 / 5 / [6,0,0,1544.5] | 5 / 4 / [6,0,0,1512.5] | 5 / 4 / [9,0,0,1301.4] |

Format: errors / blocking warns / quality `[miss, senior, rest, fair]`. Wall time was 300.5–301.6 s on every run, so the deadline held (`deadlineHit` false). CP-SAT beat local on all 15 runs.

Decisions:
- **`lexStrict` default ON.** It won 3/3 seeds on every ladder slot: errors 3 vs 4–5, blocking warns 3 vs 4–6, coverage miss 0 vs 4–9. The tiebreak sum (`1e6 × stage + later`) made each stage chase later tiers at the cost of its own proof; with pure stage objectives, LNS also accepted more moves (38–44 of 58–61, against 9–27 of 43–48 for base). `lexStrict: false` restores the old ladder.
- `impliedCliques` stays off: it added 1825 constraints and won 0/3.
- Stall stays on by default: it is neutral. It fired once in 15 runs (D, seed 44). The real block rarely plateaus long enough at 300 s.
- Shortlist stays on (client sends 5): it never beat the winner here (`shortlistIndex` null), and the re-rank can't make the result worse.
- Fixed the same day: a cold solve (no hint) of the parity `standard` fixture at 30 s used to overrun its 40 s deadline by about 13 s. The cause was the pass-2 recommendation verify re-solves (up to 2 × 10 s, each with its own fresh deadline plus grace). They now fit inside the run deadline (`report/builder.py` `_verify_single_edit`, skipped below 1 s left), and the overrun is down to 0.5 s.

## lexStrict follow-ups (2026-11-05/06, PicklePower)

Same setup as above, with lexStrict now the default. Each cell shows errors / blocking warns / `[miss, senior, rest, fair]`.

**120 s (the app's default budget).** Local best-of-20 scored 4 / 6 / [10,0,0,1845.6].

| Variant | Seed 42 | Seed 43 | Seed 44 |
|---|---|---|---|
| lexStrict (default) | 3 / 6 / [2,0,0,1795.9] | 3 / 6 / [0,0,1,1726.2] | 3 / 7 / [0,0,1,1535.0] |
| `lexStrict: false` | 4 / 6 / [13,0,0,1739.3] (local won) | 4 / 6 / [9,0,0,1449.2] | 4 / 6 / [10,0,0,1555.0] |

lexStrict also wins 3/3 at 120 s: one fewer error and coverage miss 0–2 instead of 9–13.

**300 s, settings stacked on lexStrict.** The lexStrict baseline is row D in the table above: 3 / 3 / [0,0,0, 1293.1 · 1317.2 · 1416.1].

| Variant | Seed 42 | Seed 43 | Seed 44 |
|---|---|---|---|
| + impliedCliques | 3 / 3 / [0,0,0,1425.0] | 3 / 3 / [0,0,0,1368.8] | 3 / 3 / [0,0,0,1294.3] |
| + shortlist 5 | 3 / 3 / [0,0,0,1300.7] | 3 / 3 / [0,0,0,1320.5] | 3 / 3 / [0,0,0,1305.5] |
| outerLns.fraction 0.7 | 3 / 3 / [1,0,0,1402.7] | 3 / 4 / [0,0,0,1404.4] | 3 / 3 / [0,0,0,1994.5] |
| outerLns.fraction 0.3 | 3 / 3 / [0,0,0,1419.7] | lost (host went offline) | lost |

Decisions: no further default changes.
- Cliques: 1/3 wins against the lexStrict baseline, so they stay off.
- Shortlist: still never chosen (`shortlistIndex` null). The fairness differences are noise.
- LNS fraction: 0.7 is worse (one coverage miss, one extra blocking warn, fair 1994). 0.3 was worse on the only seed that finished. The 0.5 default stays.

**The 3 remaining errors are inherent to the fixture.** All are `underTarget` on the three PGY-1 Trauma/Peds split interns (`syn_rs_r01..03`, target 19 = traumaCap 8 + pedsCap 11). The trauma half allows only TRAUMA-D, which has a max of 1 per day, so 3 × 8 = 24 trauma shifts compete for at most 14 slots. This is not drift between the solver and JS. Diagnose with `bench-engines.mjs --dump <dir>`. (Corrected 2026-11-07: TRAUMA-D runs Tue/Thu/Sat/Sun only, so each 14-day half has 8 slots, and a split intern's vacation inside a half is a second cause. See below.)

## Current master + staggered fixture (2026-11-07, PicklePower)

**Current master `6ec0bec`** (2026-11-06 rule changes + Neuro Tue/Thu night preference), `--fixture realScale`, EMSolver idle. Local best-of-20: 3 / 7 / [10,0,0,2067.2].

| Budget | Seed 42 | Seed 43 | Seed 44 |
|---|---|---|---|
| 120 s | 3 / 5 / [0,0,4,1564.1] | 3 / 6 / [1,0,0,1563.0] | 3 / 6 / [0,0,0,1570.6] |
| 300 s | 3 / 3 / [0,0,0,1343.0] | 3 / 3 / [0,0,0,1298.8] | 3 / 3 / [0,0,0,1395.3] |

CP-SAT won 6/6, wall within 0.2 s of budget (`deadlineHit` false), shortlist never picked. 300 s matches the lexStrict baseline above (1293 / 1317 / 1416); 120 s is slightly better than the follow-up table (5-6 blocking warns, fair ~1565). The rule changes cost nothing measurable.

**New `--fixture realScaleStaggered`** (`makeRealScaleFixture({ staggerSplit: true })`): 1 TRAUMA_PEDS + 1 PEDS_TRAUMA intern (one per half) + 5 EM PGY-1s, and split interns kept off vacation. The default `realScale` shape stays as-is because the quality baseline ratchet is built on it. With the default shape, every engine ends at exactly 3 `underTarget` errors, so the errors slot can't separate engines; staggered makes it measure the engine. (A first try that only staggered the halves still left 1 error: the PEDS_TRAUMA intern's 7-day vacation sat inside their 14-day peds half.)

Local best-of-20: 3 / 6 / [7,0,1,2067.8].

| Budget | Seed 42 | Seed 43 | Seed 44 |
|---|---|---|---|
| 120 s | 2 / 5 / [0,0,0,1536.2] | 0 / 9 / [5,0,1,2143.9] | 1 / 7 / [0,0,3,1858.2] |
| 300 s | 0 / 7 / [0,0,0,1669.9] | 0 / 5 / [0,0,0,1366.7] | 0 / 5 / [0,0,0,1443.7] |

At 300 s CP-SAT reaches 0 errors on 3/3 seeds; at 120 s it still leaves 0-2 under-target EM PGY-1s, and seed 43 trades 0 errors for 5 coverage misses. Use 300 s (Long Solve) for a final block. `--dump` now records each error's synthetic `residentId`.
