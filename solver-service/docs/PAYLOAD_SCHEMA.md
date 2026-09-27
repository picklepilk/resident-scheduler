# Solver objective weight policy: target vs. soft rules vs. overstaffing

(NOTE: this file was found empty at HEAD when this section was added
2026-09-26 — every other reference to "PAYLOAD_SCHEMA.md" elsewhere in this
repo, e.g. CLAUDE.md/solver-service/CLAUDE.md, apparently points at content
that never actually landed here. Not reconstructed as part of this change —
out of scope — but flagged so it isn't mistaken for "nothing to see here."
This section only documents the specific weight-ordering change below.)

## Policy (2026-09-26, mirrors `fix/under-target-lift`'s JS-side changes)

A resident's shift-count TARGET is an obligation that beats ordinary SOFT
rules; hard rules (circadian, trauma-run caps, senior composition, ...) are
never broken by any of this. As a genuine last resort, a shift's coverage
`max` may be exceeded by exactly 1 (never TRAUMA, never a shift whose `max`
is already 0 that date) rather than leave a resident under target — the
solver-side mirror of `ResidentScheduler.jsx`'s repairPass Phase 5
(`underTargetOverstaff`).

## What changed

- `solver/model/coverage.py`: `add_coverage_constraints` no longer emits a
  pure hard `sum(assigned) <= entry.max` for every (shift, date). For every
  non-TRAUMA entry with `max > 0`, it instead emits a 0/1 `overstaff` BoolVar
  and constrains `sum(assigned) <= entry.max + overstaff` — i.e. elastic by
  *exactly* 1, never unbounded. TRAUMA-area shifts (and any shift whose `max`
  is 0 that date) keep the old, fully hard `<=`. The new var is returned on
  `CoverageResult.overstaff` (parallel to the existing `.slacks` dict).
- `solver/model/objective.py`: charges every `overstaff` var at a new
  `overstaffCoverage.perUnit` weight.
- `config/default_weights.json`: `overstaffCoverage.perUnit = 2000`. Chosen to
  sit strictly between the largest ordinary preference-only soft-rule weight
  (`podEmComposition`/`flexEmComposition` at 600) and the smaller of the two
  target-shortfall weights (`targetDeficit` non-core at 5000) — asserted by
  `tests/test_weight_tiering.py::test_overstaff_coverage_dominates_ordinary_soft_rules`
  and `::test_overstaff_coverage_is_cheaper_than_any_target_shortfall`.
  `coverageMin` and `postNightRest` are deliberately excluded from the
  "ordinary soft rule" comparison — both are already structurally elevated,
  rulePriority-orderable terms in their own bracket (see `objective.py`'s
  module docstring), not ordinary preference-only soft rules, and this
  change doesn't touch their relative ordering.

## What was already aligned (no change needed)

- `targetDeficitCore`/`targetDeficit` (10000 / 5000) already dominate every
  ordinary anti-fill soft-rule term by construction
  (`test_coverage_min_dominates_anti_fill_terms`'s `_anti_fill_sum` — the
  same invariant covers target deficit indirectly since it and coverageMin
  are both "toward-fill" terms explicitly called out as not needing
  astronomical separation from each other, per the 2026-08-21 rewrite).
- `postNightRest` ships at `perViolation: 50000` (nominally above target
  deficit), but `apply_rule_priority`'s DEFAULT rule order
  (`["coverageMin", "seniorComposition", "postNightRest"]`, matching the
  app's own default `appSettings.rulePriority`) demotes it by
  `PRIORITY_DEMOTION_DIVISOR` (10x) to an effective 5000 — tied with
  `targetDeficit` (non-core) and below `targetDeficitCore` (10000). A chief
  who explicitly re-ranks `postNightRest` above `coverageMin` restores its
  full weight; that's an intentional, documented override surface
  (`appSettings.rulePriority`), not a bug.
- `buildSolverPayload` (`ResidentScheduler.jsx`) already computes every
  resident's payload `target` via `getShiftTarget(r, appSettings)` — the same
  function `fix/under-target-lift`'s A1 change (vacation-rotation
  `BLOCK_TARGETS` beating a non-chief's Settings `targetOverrides`) lives in.
  No separate target computation exists in the payload builder, so that fix
  flows into the solver path automatically; no solver-side change was needed
  for A1.

## Known gap (not fixed here, out of scope)

The solver's `/solve` response shape (`_build_report`/`_build_report_relaxed`
in `solve.py`) has no `overstaffed` field, and `mapSolverResult`
(`ResidentScheduler.jsx`) hardcodes `repairs: []` for the solver path — so an
`overstaff` var the objective spent is invisible to `GenerationReportCard`
today (the app still ends up correctly staffed/under-target-lifted, just
without the explicit "these residents got a +1-over-max shift" surfacing the
JS engine's own `report.overstaffed` provides). Left out of this change to
keep it minimal; would need a report-shape addition on both sides plus a
`docs/PAYLOAD_SCHEMA.md` response-shape update if picked up later.

## R7 (2026-09-27): rule-severity policy + ACGME EM work-hour rules — solver parity

Plan: `~/.claude/plans/resume-scheduling-discussion-mellow-petal.md`. Policy source: memory
`acgme-em-work-hours`/`rule-override-policy`, `src/lib/rulePolicy.js` (tiers `acgme`/`program`/
`override`/`info`). Principle unchanged: **the app resolves ALL policy into the payload; the solver
only solves.**

### New/changed request fields

- `residents[].schedulable: bool` — gap fix (2026-09-27, reviewer finding on 4d1b7ba): the app's own
  `isSchedulable(r)`, sent independently of `target`. `target` is null for TWO different reasons — a
  resident off-rotation this block (this flag `false`) AND a schedulable resident whose target was
  bought down to <=0 (`getShiftTarget` returns `null`, never `0` — CLAUDE.md; this flag stays `true`).
  `edWeekly60`/`totalWeekly72` (below) and `solver/validate.py`'s matching re-check now scope on
  `is_em_core and schedulable`, not `target is not None`, which used to leave a bought-down-target EM
  resident silently uncapped. Optional, defaults to `True` for back-compat with an older JS build
  that doesn't send it (matches that build's own — buggy — `target is not None` behavior exactly, so
  nothing gets narrower for a payload that predates this field).
- `residents[].obligationHours: {date: hours}` — per-resident Grand Rounds (4h) + Journal Club (3h)
  contribution, ALREADY resolved (vacation/off-filtered) by `src/lib/acgmeHours.js`'s exported
  `grHoursOn`/`jcHoursOn`. Covers BOTH the 14-day prior-tail window and the block's own dates (same
  range `priorTail`/`priorTailObligations` already span). Calendar facts, independent of the solve —
  never entangled with any `x` var. Consumed only by `solver/model/weekly_hours.py`. Optional,
  defaults to `{}` (no-op).
- `residents[].grDates: [date]` — the subset of those same dates (tail or block) that are this
  resident's OWN Grand Rounds obligation day (weekday match, not vacation/off). Consumed only by
  `solver/model/rest.py`'s GR-end adjustment. Optional, defaults to `[]` (no-op — rest is measured
  from the shift's own end only, today's behavior).
- `grEndH: int` — Grand Rounds' own end hour (`GR_END_H`, today always 12). Same "altitude fix"
  convention as `jcWindowStartH`/`jcWindowEndH`/`postNightDayRestH`. Optional, defaults to 12.
- `truePrimary[shiftId][date]: [residentId]` — SAME shape/keys as `seniorPrimary`, but restricted to
  residents who satisfy the area's hard composition as the TRUE primary PGY (never a
  Wellness-Wednesday/conference-away substitute). Built for every `SENIOR_COMPOSITION` area (POD and
  FLEX), mirroring `ResidentScheduler.jsx`'s `preferTruePrimaryPass` scope exactly. An empty array is
  meaningful ("no true primary available today — the substitute is the fully accepted outcome, no
  preference penalty"), same posture as `seniorPrimary`'s own empty-array convention. Consumed only
  by `solver/model/senior_composition.py`'s `add_true_primary_preference_terms`. Optional, defaults
  to `{}` (no-op).
- `settings.enforceRest` no longer has any effect on `solver/model/rest.py`'s rule 17 (rest >= the
  earlier shift's own length) — it is unconditionally on now, matching the chief's 2026-09-26 policy
  that this is ACGME-hard with no toggle. (Rules 18–23 already ignored this setting; this closes the
  one remaining gap. `enforceWeekendOff` is unaffected.)

### New rule: `edWeekly60` / `totalWeekly72` (ACGME EM 6.17.a.3, tier `acgme`)

`solver/model/weekly_hours.py` — for every EM resident (`is_em_core`) on a schedulable EM rotation
(`schedulable`, mirroring `candidatePool`'s `isEmResident(r) && isSchedulable(r)` gate — see
`residents[].schedulable` above; fixed 2026-09-27, was `target is not None`, which wrongly excluded a
schedulable resident whose target was bought down to <=0) and every rolling 7-day window touching the
block (tail-only windows are pure history and skipped, same convention as every other sliding-window
family in this codebase):

- scheduled ED hours (shift durations only) in the window `<= 60`
- ED hours + `obligationHours` in the window `<= 72`

**Always hard, never wrapped by pass-2 relaxation** — called unconditionally from both `build.py` and
`elastic.py` with no `enforcement` parameter, exactly like `senior_composition.py` and
`trauma_runs.add_trauma_run_hard_cap`. This is an accreditation requirement, stricter than the
ordinary duty-hour families (`hours_cap.py`/`rest.py`/`circadian.py`/`workday_limits.py`) the chief
has accepted as pass-2-relaxable last resorts. `solver/validate.py`'s independent re-check
(`_check_weekly_hours_cap`) mirrors the same scope/skip logic.

### Changed rule: `restGap` (rule 17) — GR-end adjustment

`solver/model/rest.py`'s `_effective_earlier_end_min` (and `solver/validate.py`'s independent
re-implementation of the same): when the earlier shift's own end falls on that resident's own GR date
(`gr_dates`) and before GR's own end (`gr_end_h`), rest is measured from GR's end instead of the
shift's end. The REQUIRED gap (still the earlier shift's own duration) is unchanged — only the point
rest is measured FROM moves later, which can only make the constraint stricter, never looser. Mirrors
`src/lib/acgmeHours.js`'s `effectiveShiftEndMs` exactly (EM FAQ: "rest counts from end of conference
when attended").

### New soft term: `seniorTruePrimary`

`solver/model/senior_composition.py`'s `add_true_primary_preference_terms`, wired into
`solver/model/objective.py`, weight `config/default_weights.json`'s `seniorTruePrimary.perUnit = 600`
(same order of magnitude as `podEmComposition`/`flexEmComposition`; included in
`tests/test_weight_tiering.py`'s `_anti_fill_sum`/`_generous_soft_objective_max`/
`test_overstaff_coverage_dominates_ordinary_soft_rules` accounting). Charges the weight exactly when a
(shift, date) with a true primary AVAILABLE ends up staffed only by a fallback/substitute — never when
unstaffed, and never on a date with no true primary to prefer (the substitute is the fully accepted
outcome there). `mapSolverResult` (`ResidentScheduler.jsx`) now also rebuilds `report.podSubstitutes`
from the solver's own final schedule (previously hardcoded `[]`), the same scan
`generateSchedule` runs post-repair, excluding any cell already present in the request's
`block.schedule` (a locked/manual entry, not the solver's own decision).

### Response shape

Unchanged. `report.podSubstitutes` was already part of `mapSolverResult`'s OUTPUT shape (JS-side
superset); the solver's own `/solve` response never carried it and still doesn't — `weekly_hours.py`/
`seniorTruePrimary` are both enforced/costed purely inside the model, with no new response field needed
(a rolling-hours violation would only ever appear as a genuine `INFEASIBLE`/`RELAXED` outcome, already
covered by the existing status/feasibility shape).

## R9 (2026-09-27): CP-SAT as a reliable POLISHER, not a from-scratch competitor

Chief-approved goal: at 30s CP-SAT ended FEASIBLE and trailed the built-in engine
(`generateScheduleBest`); at 300s it only matched. Instead of chasing more raw solve time, the
pipeline changes to **local first, solver polishes**: `generateViaSolverOrLocal`
(`ResidentScheduler.jsx`) now ALWAYS runs `generateScheduleBest` first, sends its schedule to the
solver as a warm-start `hint`, and only ships the solver's result if it STRICTLY beats the local
result under the exact same `betterQuality` ladder (`pickEngineResult`, unchanged tie-goes-local
policy). On any solver failure the already-computed local result is returned directly — there is no
second, wasted local run any more.

### New request field: `hint`

- `hint: [{residentId, date, shiftId}]` — SAME shape as `locked[]`, but a **soft** suggestion
  (`model.AddHint`, `solver/model/hint.py`), never a hard pin. Optional; omitted (not even `[]`)
  when the caller passes no hint or the hint schedule has zero assigned cells, so a payload built
  without it is byte-identical to a pre-R9 payload (`solverPayload.test.js`'s dedicated test).
  `ResidentScheduler.jsx`'s `buildSolverPayload({..., hint})` accepts `hint` as a schedule object
  (`{residentId: {dateStr: shiftId}}` — the same shape as `block.schedule` / a `{schedule,report}`
  result's `.schedule`) and converts it to this flat list with the same loop `locked[]` already
  uses — the simplest mapping onto the solver's own `x[r,s,d]` var keys.
- Python: `solver/io/payload.py`'s `Payload.hint` (parsed via the same `_parse_locked` helper as
  `locked`). `solver/model/hint.py`'s `apply_hint(model, payload, store)` hints **every** `x` var:
  1 if `(residentId, date) -> shiftId` matches the hint, else 0 — a `(residentId, date)` pair
  absent from `hint` means "off that day", and every OTHER candidate var for that resident/date
  correctly gets hinted 0 too, not skipped. A hint cell naming an illegal/nonexistent
  `(resident, shift, date)` triple simply never matches any real var and is dropped — this can
  never crash.
- `CpSolverParameters.repair_hint = True` is set (`solve.py`'s `_configure_solver`) whenever
  `payload.hint` is non-empty, **except** inside the staged solve's own per-stage solves (see the
  "search tuning" section below for why — a real OR-Tools 9.15 native-crash finding, not a design
  choice). Without `repair_hint`, CP-SAT's documented behavior for a hint that can't be fully
  honored is to ignore it — never a crash, never an invalid schedule (covered by
  `tests/test_hint_and_staged.py`'s illegal-hint-cell test).
- Applied in BOTH model builds that create decision variables: `solver/build.py` (pass 1, strict)
  and `solver/model/elastic.py` (pass 2, relaxed) — right after `build_variables`, since a hint is
  pure search metadata, not a new constraint.

### New config fields

- `config.objectiveMode`: `"staged"` (new default) or `"weighted"` (the pre-R9 single-shot solve on
  the flat weighted sum, kept for comparison/rollback).
- `config.stageSplit`: `[float, float, float]`, default `[0.15, 0.15, 0.7]` — fraction of
  `maxTimeSeconds` given to each of the 3 staged-solve stages (see below). Renormalized defensively
  if it doesn't sum to 1; skewed hard toward stage 3 because stages 1-2 are typically ALREADY at
  their optimum straight from the warm-start hint (a good local schedule has 0 target deficit and 0
  rest violations) and only need enough time to CONFIRM that via presolve, not to search — stage 3
  (coverage + every quality term) is where the real combinatorial work happens. The original
  30/20/50 split under-resourced stage 3 badly enough to cause a real head-to-head loss (see the
  measurement below).
- `config.symmetryLevel`: optional int, `CpSolverParameters.symmetry_level` override. This codebase
  has no hand-written symmetry-breaking constraints to conflict with it, so this is a pure search
  knob — left unset (OR-Tools' own default) unless a caller has a specific reason to change it.
- `config.numWorkers` default changed from a hardcoded `8` (JS `buildSolverPayload`'s
  `resolvedConfig`) to **absent** — `solver/solve.py`'s `_num_workers` treats `0`/absent as "use
  `os.cpu_count()`, clamped >= 1", so the solver actually uses whatever box it's deployed on
  instead of every request pinning a stale worker count. An explicit `numWorkers` still overrides.
  **Determinism**: with `num_workers > 1`, CP-SAT's search is NOT deterministic run-to-run even at
  a fixed `randomSeed` (the seed only fixes each worker's own exploration order, not the
  cross-worker race for who reports an incumbent first) — `random_seed` stays fixed regardless, and
  tests must assert on score/feasibility, never on an exact schedule, for any multi-worker solve.

### Staged (lexicographic) objective — JS `betterQuality` tier mapping

`betterQuality` compares `(errorCount, blockingWarnCount, qualityVector)` lexicographically, where
`qualityVector = [n0, n1, n2, fairnessPlusShape]` (`n0/n1/n2` = `coverageMin`/`seniorComposition`/
`postNightRest` counts in `rulePriority` order; `fairnessPlusShape` is a single weighted sum of
every remaining quality term — see `src/lib/scheduleQuality.js`). `solver/model/objective.py` now
builds 4 `TermGroup`s (`TIER_ERRORS`, `TIER_BLOCKING`, `TIER_RANK`, `TIER_QUALITY`) instead of 1
flat sum — every existing weight/term is re-partitioned into exactly one group, so
`sum(stage_exprs.values()) == total_expr` exactly (the pre-R9 `"weighted"` mode is numerically
unchanged, only re-partitioned; `tests/test_hint_and_staged.py` proves this by evaluation, and
every pre-existing `test_weight_tiering.py` invariant stays green unchanged).

| JS `betterQuality` slot | Solver objective term(s) | Notes / gaps |
|---|---|---|
| `errorCount` (validateAll 'error' level) | `targetDeficitCore.perUnit` (EM-core resident under shift-count target) | Every OTHER JS 'error' (acgme/program tier, `rulePolicy.js`) is already a solver HARD constraint (circadian, trauma caps, ACGME hours, senior composition, ...) — 0 by construction in a strict-pass-1 solve, so it needs no objective term. **Gap**: JS's `conferenceTolerated` exception (a 1-shift EM-core shortfall during a conference block downgrades from 'error' to blockingWarnCount) has NO solver equivalent — the solver payload carries no "does this block touch a conference" signal, so a solver-side conference-tolerated shortfall is still charged at full `targetDeficitCore` weight, same tier as any other EM-core shortfall. Not fixed here (would need a new payload field); in practice the solver still gets PUSHED toward the same target the JS side aims for, so this only matters for the exact objective magnitude, not the direction. |
| `blockingWarnCount` (JS `EXPORT_BLOCKING_RULE_IDS`: `postNightRest` + every `rulePolicy.js` 'override'-tier rule) | `postNightRest.perViolation` | Override-tier rules (`traumaRunCap`, `podPgy3Composition`, `wellnessWednesday`, ...) are hard-never-broken by the solver's own strict pass 1 too (mirrors the JS generator, which also never breaks them) — 0 by construction, no objective term needed in `TIER_BLOCKING`. They only become genuinely violable in PASS 2 (relaxed), which is a documented gap below. |
| `qualityVector[n0,n1,n2]` (`coverageMin`/`seniorComposition`/`postNightRest`, in `rulePriority` order) | `coverageMin.perSlack` + `overstaffCoverage.perUnit` (`TIER_RANK`) | `seniorComposition` is hard (0, no term needed). `postNightRest` is already pinned to its true minimum by `TIER_BLOCKING` above, regardless of `rulePriority` order — same as the JS side, where `blockingWarnCount` (unconditional) always outranks the quality vector (rulePriority-ordered) as a lexicographic tier, so a `postNightRest`-first `rulePriority` doesn't change WHICH count gets minimized first, only which of `coverageMin`/`postNightRest` (already both effectively pinned by earlier tiers) would be re-ranked if either weren't. `overstaffCoverage` has no `betterQuality` slot of its own in JS either (`ResidentScheduler.jsx`'s own comment on repair Phase 5) — placed here since that's its natural weight-ordering position (between ordinary soft rules and target deficit). |
| `qualityVector[fairnessPlusShape]` | Everything else (`TIER_QUALITY`): `targetDeficit` (non-core), `fairness.*`, `isolatedNight`, `workShape.*`, `traumaSecondInRun`/`traumaMidRun`/`nightDurationAlternation`/`secondRestDay`/`pedsInternNightDeficit`, `weekendOff`, `pedsMixMin`, `fm1Peds`, `internPair`, `podEmComposition`/`flexEmComposition`, `podPgy2Fallback`/`flexPgy3Fallback`, `seniorTruePrimary`, `dowPreference` | Rolled into ONE combined solve stage (`_STAGE_3_NAME`, alongside `TIER_RANK`) rather than a 4th separate stage — JS's own `qualityVector` is itself one lexicographic tuple, not two further top-level `betterQuality` slots, so a 4th CP-SAT stage would over-split it relative to what it's modeling. |

**Implementation** (`solver/solve.py`'s `_solve_staged`): 3 sequential solves on the SAME model
(no rebuild — only the objective and an accumulating set of "stage N was already this good" bound
constraints change): stage 1 minimizes `TIER_ERRORS`, fixes `model.Add(expr <= achieved)`, carries
that stage's own solution forward as the next stage's hint; stage 2 does the same for
`TIER_BLOCKING`; stage 3 minimizes `TIER_RANK + TIER_QUALITY` with the remaining time. A stage with
no terms at all (`_is_empty_stage`, e.g. no EM-core residents in the payload) is skipped entirely —
no solve, no bound, no hint-carry. If a stage returns no solution, the loop stops and returns the
PREVIOUS stage's real solution (never worse than that stage's own input) rather than discarding it;
only the first stage failing outright (rare) has nothing to fall back to.

**Tiebreak (found by hand via `engineHeadToHead.test.js`'s R9 proof)**: minimizing a stage's own
term in isolation leaves CP-SAT free to pick ANY solution tied for that stage's optimum — including
one that's arbitrarily bad for every LATER stage, since a term outside the current stage costs
nothing during that stage's solve. The first version of this feature reproduced exactly that: a
warm-started stage 1/2 solve, with zero cost signal for coverage, would trade coverage away as a
side effect even though the hint started from an already-good schedule, and the "vacationHeavy"
fixture came back with the solver strictly WORSE than local (142 vs. 139 unfilled slots) purely from
this effect. Fix: every non-final stage actually minimizes
`_TIEBREAK_MULTIPLIER * this_stage_expr + sum(every LATER stage's expr)` (`_TIEBREAK_MULTIPLIER =
1_000_000`) — the multiplier keeps the current tier strictly primary (never traded away for a later
one), while the added tail sum breaks ties toward whatever's cheapest downstream, which is exactly
what keeps an already-good warm-started schedule from being needlessly disturbed. The BOUND fixed
before advancing to the next stage is still on the stage's own raw (un-tiebroken) expr.

### Pinning the polisher to its own hint (2026-09-27 follow-up, "pin to hint")

Even with the tiebreak above, stage 3 still minimizes `TIER_RANK + TIER_QUALITY` as ONE combined
expression — nothing stopped CP-SAT from trading coverage slack (TIER_RANK) for a cheaper quality
move (TIER_QUALITY) inside that single solve, or from simply not reconverging on the hint's own
coverage value within the time budget (multi-worker search is non-deterministic, see "New config
fields" above). Chief-approved goal: make the polisher provably unable to give up ground on
anything the JS `betterQuality` ladder can measure — it can only improve.

**Design** (`solver/model/hint_pin.py`, wired in by `solve.py`'s `_apply_hint_pinning`, staged mode
only — `objectiveMode: 'weighted'` gets none of this, unchanged rollback path):

1. `evaluate_hint(payload, build_result)`: clones the already-built pass-1 model
   (`build_result.model.clone()` — never the model the real solve will use, and never solved twice;
   see "Native-crash finding" below for why), fixes EVERY `x` var to the hint's own value (1 if
   `(residentId, date) -> shiftId` matches the hint, 0 otherwise — identical matching logic to
   `apply_hint`), and solves that fully-pinned clone ONCE (single worker, deterministic) to read
   back the RAW (unweighted) achieved value of each pinned component. `feasible=False` (no
   components) means fixing the hint's own schedule breaks one of this payload's OWN hard
   constraints — the hint is simply inapplicable here, and `_apply_hint_pinning` falls back to the
   pre-existing, un-pinned staged solve exactly as before this feature existed, recording
   `hintFeasible: false` (see below).
2. If feasible: `apply_hint_pins` adds `expr <= achieved` as a HARD constraint on the REAL model for
   3 components — `targetDeficitCore` (all of TIER_ERRORS), `postNightRest` (all of TIER_BLOCKING),
   and `coverageMin` (the raw coverage-slack sum, i.e. exactly JS's `coverageMiss` metric). A hard
   constraint holds for every solution the solver can ever return, at any time budget or worker
   count — so the polisher can only match or beat the hint on each of these three, never trade one
   for another or drift worse under search noise. `TIER_QUALITY` (fairness/workShape/...) is
   deliberately left unpinned — that's the one thing this feature still lets the solver freely
   improve.
3. The staged solve (`_solve_staged`) then runs completely unchanged — the pins are just 3 more
   hard constraints baked into `build_result.model` before stage 1 ever starts.

**Diagnosed-and-fixed mapping gap**: the first version of this feature ALSO pinned
`overstaffCoverage` (the solver's last-resort +1-over-max allowance) as a 4th independent
component, mirroring `TIER_RANK`'s two internal terms 1:1. Measured result: `engineHeadToHead`
went from the pre-existing single `vacationHeavy` gap to **3 of 4 fixtures losing**
(standard/vacationHeavy/conferenceBlock), strictly worse than doing nothing. Diagnosis: JS's
`report.overstaffed` (the JS-side equivalent) is purely informational — it never appears in
`errorCount`, `blockingWarnCount`, or `qualityVector` (this doc's own tier-mapping table already
noted "`overstaffCoverage` has no `betterQuality` slot of its own in JS either"). Pinning it anyway
handcuffed the solver's own designed relief valve: using one more +1-over-max placement to close a
coverage gap is a mechanism the app itself uses (`ResidentScheduler.jsx`'s `overstaffFor`/repair
Phase 5) and pays no JS-side scoring penalty for, so forbidding the solver from using MORE of it
than the hint happened to use could only ever make `coverageMin` (the metric that actually matters)
worse, never better. Fixed by pinning only the 3 components JS's ladder can actually see.

**Bigger, NOT-fixed-here finding: the hint is judged infeasible on every one of the 4
`engineHeadToHead` fixtures**, so pinning never actually engages on any of them (`evaluate_hint`
returns `feasible=False` for standard/understaffed/vacationHeavy/conferenceBlock alike — verified by
dumping each fixture's real `buildSolverPayload` output and running `evaluate_hint` on it directly).
Root cause, confirmed by bisecting hard-constraint families one at a time against the fixed hint:
every fixture's warm-start schedule (the JS engine's own `generateScheduleBest` output) contains
multiple resident/date pairs where a **day shift is immediately followed by an evening shift the
next calendar day** (12-24 occurrences per fixture, e.g. `FLEX-D` on day N then `FLEX-E` on day
N+1) — `solver/model/circadian.py`'s `_add_eve_day_pairs` treats BOTH `eve-then-day` and
`day-then-eve` as hard-forbidden (per this doc's own tier-mapping table and this repo's
`CLAUDE.md`: "eve→day next day (and reverse) hard"), but `ResidentScheduler.jsx`'s
`checkCircadianViolations` only actually implements the `eve-then-day` direction — its `newType ===
'day'` branch checks the PREVIOUS day for an eve shift (catching the SAME `eve→day` transition from
the day-shift's own placement order, for a generator that fills passes in either direction), not the
NEXT day, so `day→eve` is never checked at all despite the function's own comment claiming "(and the
reverse)". This is a real, pre-existing bug in the JS engine's own rule enforcement — the SOLVER
faithfully implements the documented policy; the JS generator does not — but it is a hard,
never-relaxed rule (`rulePolicy.js` tiers `acgme`/`program`, both always-blocking) whose enforcement
sits inside the ~8,300-line generator/repair/validator core, exercised by every quality-baseline
ratchet test and `chiefBenchmark`. Fixing it changes what the GENERATOR is allowed to place, which
can shift quality-baseline numbers and needs its own dedicated, reviewed task (see this repo's
`rule-override-policy` memory note on how deliberately hard-rule changes are handled here) — **not
fixed in this task**. Until it is, `evaluate_hint` will keep (correctly) rejecting most real hints,
and pinning will mostly sit inert, falling back to the pre-existing staged behavior. The fallback
itself is safe and exercised by `tests/test_hint_pin.py`; this is a missed-opportunity gap, not a
correctness bug in the pinning feature.

### Search tuning

- `num_workers`/`symmetry_level`: see "New config fields" above.
- **Native-crash finding (OR-Tools 9.15.6755, Windows)**: reusing the SAME `CpSolver` instance to
  `.solve()` a model MULTIPLE times (objective/hints changed between calls) with `num_workers > 1`
  is fine — but if ANY of those solves had `repair_hint = True`, a LATER solve on that same
  (mutated) model — even with a brand-new `CpSolver` instance — hits a native
  `CHECK failed: heuristics.fixed_search != nullptr` abort (not a catchable Python exception; the
  whole process aborts). Confirmed by hand to be specifically the `repair_hint` + repeated-solve
  combination, not multi-worker alone and not hint-carrying alone. `_solve_staged` therefore NEVER
  sets `repair_hint` on any of its per-stage solvers (`_configure_solver(payload,
  allow_repair_hint=False)`) — safe, because `repair_hint` only ever mattered for the ORIGINAL,
  possibly-illegal JS-supplied hint (stage 1); every hint staged-solve carries forward after that is
  this model's OWN just-found feasible solution, which by construction already satisfies every hard
  constraint and every bound fixed so far, so it needs no repair. `repair_hint` remains available
  (and safe) for the single-solve paths: `"weighted"` mode and pass 2 (`run_pass2`).
- A FRESH `CpSolver` per stage (not one reused across the 3 `.solve()` calls) — cheap, and the
  robust way to avoid the crash above regardless of `repair_hint`.

### Head-to-head proof (`engineHeadToHead.test.js`, `SOLVER_PARITY=1`)

Extended to warm-start the solver from the JS engine's own winning schedule for all 4 baseline
fixtures (standard/understaffed/vacationHeavy/conferenceBlock), score both raw results through the
exact `pickEngineResult`/`betterQuality` ladder, and assert the solver is never STRICTLY worse than
local. See the commit history / task report for the actual win/tie/loss numbers and timings from the
final run — this file's own per-variant "betterQuality ladder" table (written to a scratch markdown
file plus stdout) is the regression gate; everything else in that file remains measurement-only.

### Known gaps (not fixed here, out of scope)

- Pass 2 (`run_pass2`, relaxed/elastic solve) keeps the single-shot WEIGHTED objective regardless of
  `config.objectiveMode` — its own 3-tier relaxation-penalty stack (`relaxDutyHour` >
  `relaxCoverageMin` > `relaxPolicyCaps` > the whole soft objective, `solver/model/elastic.py`) is a
  different, orthogonal lexicographic ladder from `betterQuality`'s. Staging BOTH ladders in one
  solve is real design work left for a future round. The warm-start hint still applies in pass 2
  (and `repair_hint` is allowed there, since pass 2 is a single solve, not a repeated one).
- `conferenceTolerated` (see the tier-mapping table above): no solver-side signal exists for "this
  block touches a conference", so a 1-shift EM-core shortfall during a conference block is still
  charged at full `TIER_ERRORS` weight instead of downgrading to blocking-warn severity like the JS
  side does. Would need a new payload field (e.g. `blockTouchesConference: bool`) to close.
- **`stageSplit`-default bug invalidated the ORIGINAL characterization below (fixed 2026-09-27)**:
  `solver/io/payload.py`'s `parse_payload` had a second, stale hardcoded fallback of `(0.3, 0.2,
  0.5)` for an absent `config.stageSplit`, disagreeing with `Config.stage_split`'s own default of
  `(0.15, 0.15, 0.7)` used everywhere else in this doc. `buildSolverPayload` (JS) never sends
  `stageSplit` explicitly, so **every production solve and every `engineHeadToHead.test.js` run ever
  measured before this fix actually ran the stale 30/20/50 split**, not the tuned 15/15/70 one this
  doc describes. Fixed by having the fallback reference `Config.stage_split` directly (one source of
  truth). The 3-run re-measurement below is the first data taken under the SPLIT ACTUALLY DESCRIBED
  IN THIS DOC.
- **Staged solve's margin over the warm-start hint is NOISY (not guaranteed-win) on multiple
  fixtures under the now-corrected 15/15/70 default** (`engineHeadToHead.test.js`'s R9 proof,
  `SOLVER_PARITY=1`, 3 sequential full runs, one at a time, immediately after the `stageSplit` fix
  above):

  | run | standard | understaffed | vacationHeavy | conferenceBlock |
  |---|---|---|---|---|
  | 1 | loss (126→127 coverageMiss) | win (207→205) | loss (139→142) | win (114→120, wins on blockingWarnCount 2→1 despite worse coverage) |
  | 2 | win (126→127, wins on blockingWarnCount despite worse coverage) | win (207→205) | loss (139→142) | loss (114→115) |
  | 3 | win (126→128, wins on blockingWarnCount despite worse coverage) | win (207→205) | loss (139→143) | win (114→114 tie, wins on blockingWarnCount) |

  `vacationHeavy` LOST all 3/3 runs this time (local coverageMiss 139 vs. solver 142, 142, 143 — every
  run strictly worse, no win observed in this batch, unlike the earlier under-the-bug
  characterization's one win-out-of-three). `errorCount`/`blockingWarnCount` still tie exactly on this
  fixture in every run, same root cause as before: many residents on vacation means few x-vars exist,
  tier-1/2 have many equally-cheap solutions for the tiebreak to choose among, and coverage
  optimization (the one thing actually on trial) has genuine multi-worker CP-SAT search variance
  (`CpSolverParameters.num_workers > 1` is documented as non-deterministic run-to-run even at a fixed
  `random_seed` — see "search tuning" above). **Decision: `vacationHeavy` stays in
  `KNOWN_GAP_VARIANTS`** — if anything the corrected split's measured margin is worse (consistently
  -3/-3/-4) than the mixed result under the old stale split, so removing the exclusion would make the
  hard gate fail routinely, not just flakily. The previously-identified surgical fix (pin stage 1/2
  fully to the hint via a temporary cloned/pinned sub-model, so stage 3 gets 100% of the real search
  budget deterministically) was **not implemented** — same call as before, real additional work,
  tracked rather than rushed.
  - **New finding, not previously flagged**: `standard` and `conferenceBlock` — both assumed solid,
    un-flaky winners under the old (buggy, stale-split) measurements this doc used to cite — each
    flipped to a `loss` in exactly 1 of these 3 runs under the CORRECTED default split.
    `engineHeadToHead.test.js`'s hard gate (`KNOWN_GAP_VARIANTS`) still excludes only `vacationHeavy`
    (unchanged by this investigation, since only `vacationHeavy` was in scope to re-examine) — this
    means the gate is now flaky-fails on `standard`/`conferenceBlock` too, not just noisy-passes.
    Whether to widen `KNOWN_GAP_VARIANTS` to cover them, revisit the 15/15/70 split's tuning, or
    accept the flakiness is a real open decision left for a future round.
- **"Pin to hint" re-measurement (2026-09-27, 3 sequential full `engineHeadToHead.test.js` runs, one
  at a time, after the pinning fix above)** — see "Pinning the polisher to its own hint" for the
  design and the diagnosed-and-fixed `overstaffCoverage` mapping gap:

  | run | standard | understaffed | vacationHeavy | conferenceBlock |
  |---|---|---|---|---|
  | 1 | loss | win (207→205) | loss | win |
  | 2 | loss (126→129 coverageMiss) | win (207→205) | loss (139→145) | win (114→115, wins on blockingWarnCount 2→1) |
  | 3 | win (errorCount 3→2, 126→127) | win (207→205) | loss (139→141, errorCount 7→8) | loss (errorCount 1→2 — the pre-existing, documented `conferenceTolerated` gap, see the tier-mapping table) |

  **`understaffed` wins all 3/3.** `vacationHeavy` still LOSES all 3/3 — but for a DIFFERENT reason
  than before: `evaluate_hint` reports this fixture's hint (and every other fixture's hint) as
  **infeasible** (see "Pinning the polisher to its own hint"'s big caveat above), so pinning never
  actually engages here — these 3 losses are the SAME pre-existing, un-pinned staged-solve
  flakiness this doc already documented before this task, not a new regression and not something
  pinning could have fixed given the hint is rejected outright. `standard` (2/3 losses) and
  `conferenceBlock` (1/3 losses, the known `conferenceTolerated` gap) are likewise unaffected by
  pinning for the same reason and consistent with the flakiness already flagged above. **Decision:
  `KNOWN_GAP_VARIANTS` is left unchanged (`vacationHeavy` only)** — this task did not observe or
  produce a regression, and did not close the loop needed to actually fix `vacationHeavy` (that
  requires the separate circadian-rule fix below first, so a REAL hint can get pinned on this
  fixture and be measured). The pinning mechanism itself is verified correct and safe in isolation
  by `tests/test_hint_pin.py` (6 tests: feasible hints get pinned at their own achieved values,
  infeasible hints fall back cleanly with `hintFeasible: false`, only EM-core residents count toward
  `targetDeficitCore`, and the pins are real hard constraints on the model CP-SAT actually solves).
- **Blocking discovery: `evaluate_hint` reports EVERY ONE of the 4 `engineHeadToHead` fixtures'
  hints as infeasible**, so the pinning feature above never actually engages on any of them —
  see "Pinning the polisher to its own hint"'s big caveat for the full diagnosis (a real,
  pre-existing bug in `ResidentScheduler.jsx`'s `checkCircadianViolations`: it only enforces the
  `eve`-immediately-followed-by-`day` direction of the hard eve/day adjacency rule, never the
  `day`-immediately-followed-by-`eve` direction its own comment and `CLAUDE.md` both claim is also
  hard). **Not fixed here** — deliberately out of scope: it's a correction to a hard,
  never-relaxed rule's enforcement inside the ~8,300-line generator/repair/validator core, exercised
  by every quality-baseline ratchet test and `chiefBenchmark`, and this repo's own
  `rule-override-policy` memory note treats changes to hard-rule enforcement as needing dedicated,
  reviewed work rather than a drive-by fix inside an unrelated solver task. Until it's fixed, `pin to
  hint` will keep gracefully falling back to the pre-existing (un-pinned) staged solve on most real
  hints instead of providing its intended protection.
