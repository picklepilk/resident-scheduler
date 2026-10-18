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

**FIXED 2026-10-15** — see this doc's own dated section near the bottom
("Two engine gaps closed"). The paragraph below is kept for history.

~~The solver's `/solve` response shape (`_build_report`/`_build_report_relaxed`
in `solve.py`) has no `overstaffed` field, and `mapSolverResult`
(`ResidentScheduler.jsx`) hardcodes `repairs: []` for the solver path — so an
`overstaff` var the objective spent is invisible to `GenerationReportCard`
today (the app still ends up correctly staffed/under-target-lifted, just
without the explicit "these residents got a +1-over-max shift" surfacing the
JS engine's own `report.overstaffed` provides). Left out of this change to
keep it minimal; would need a report-shape addition on both sides plus a
`docs/PAYLOAD_SCHEMA.md` response-shape update if picked up later.~~

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
- `residents[].obligationHours: {date: hours}` — per-resident Grand Rounds + Journal Club (3h)
  contribution, ALREADY resolved (vacation/off-filtered) by `src/lib/acgmeHours.js`'s exported
  `grHoursOn`/`jcHoursOn`. Covers BOTH the 14-day prior-tail window and the block's own dates. Calendar
  facts, independent of the solve — never entangled with any `x` var. Consumed only by
  `solver/model/weekly_hours.py`. Optional, defaults to `{}` (no-op). **2026-10-15 update**: GR's own
  per-date hours are no longer a flat 4h — `grHoursOn`/`grWindowFor` resolve 2h (10:00-GR_END_H) after
  an eve-type shift the day before, 2h (GR_START_H-10:00) after a night-type shift ending that
  morning, 4h (GR_START_H-GR_END_H) otherwise. This module is unaffected by the change — it only ever
  reads the already-resolved per-date hour number, never recomputes the window itself.
- `residents[].grDates`/`grEndH` **REMOVED 2026-10-15** (chief decision — "the only shifts that count
  towards time off before/after a shift ... are the actual clinical shifts"): rest is now always
  measured from a shift's own end, never Grand Rounds', so `rest.py`'s old GR-end adjustment
  (`_effective_earlier_end_min`) is gone and these two fields it alone consumed are no longer sent by
  `buildSolverPayload`. Both fields still exist on `Payload`/`Resident` (an old/rogue payload that
  still sends them is harmlessly ignored — `resident.gr_dates` defaults to an empty frozenset either
  way), but nothing reads them any more.
- `obligations`/`obligationsExemptAfterNight`/`residents[].priorTailObligations` **REMOVED 2026-10-15**
  (chief decision — the 6-consecutive-work-day streak counts CLINICAL SHIFTS ONLY now; a GR weekday or
  JC presenting date with no shift assigned no longer extends a run — see `ResidentScheduler.jsx`'s
  `isStreakWorkDay`). `buildSolverPayload` no longer populates any of the three. `workday_limits.py`'s
  `_obligation_term`/`_link_work` mechanism is UNCHANGED code-wise — an absent/empty `obligations` map
  already made it a pure no-op (`work[r,d] == has-a-shift-that-day` exactly), so this required zero
  Python changes; the mechanism is kept (not deleted) in case a future obligation-style rule 19 input
  ever needs it again.
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

**Correction (2026-09-27, R7 rest-tier fix):** the paragraph above's "the chief has accepted as
pass-2-relaxable last resorts" was WRONG for `restGap`/`circadianPair`/`nightRunMax`/`consecutiveWork`/
`postRun6Rest`/`hours320` — it predates and directly contradicts the same day's chief-approved
`rule-override-policy` memory and `src/lib/rulePolicy.js`, both of which put every one of those on
tier `acgme`: "never broken, anywhere. No 'place anyway' path" — identical posture to `edWeekly60`/
`totalWeekly72` right above. Only `nightCap`/`nightSegments` (tier `override` — "a chief may break one
by hand") are genuinely pass-2-relaxable. `solver/model/elastic.py`'s `ALWAYS_HARD_DUTY_HOUR_FAMILIES`
vs `RELAXABLE_DUTY_HOUR_FAMILIES` now encodes this split (`duty_enforcement` returns `None` — i.e.
unconditionally hard — for every family in the first set); this doc's stale claim was left as its own
struck-through paragraph rather than silently rewritten, per this repo's "every rule here is
load-bearing" convention. Root cause of `chiefBenchmark.solver.test.js` intermittently reporting real
`restShiftLength`/`eveToNextDayDay` structural errors on the solver's mapped schedule: whenever pass 1
went INFEASIBLE (made measurably more likely by R9's staged solve / hint pinning / GR-obligation
reification), pass 2 was free to relax an ACGME-hard family instead of a merely override-tier one.

**Correction (2026-09-28, POLICY_CAP_FAMILIES tier fix):** the same class of bug survived one level
down, in `solver/model/count_caps.py`'s policy-cap families. `bamcWedNight`, `jcCap` (`rulePolicy.js`'s
`jcMaxPerAy`) and `traumaPedsSplit` are all tier `program` in `src/lib/rulePolicy.js` — "chief-decided
hard policy, blocks everywhere exactly like 'acgme'" — yet `solver/model/elastic.py`'s
`cap_enforcement` wrapped all six `POLICY_CAP_FAMILIES` members in one freely-relaxable
`ok[resident, capFamily]` literal, identical to the pre-R7 duty-hour bug above. `traumaCap`,
`pedsMixMax` and `targetCeiling` have no entry in `RULE_POLICY` at all — the JS side only ever reports
these as a plain, non-blocking warn — so those three are the only genuinely pass-2-relaxable cap
families. `solver/model/elastic.py`'s `ALWAYS_HARD_POLICY_CAP_FAMILIES` vs
`RELAXABLE_POLICY_CAP_FAMILIES` now encodes this split (`cap_enforcement` returns `None` for every
family in the first set); a schedule reachable only by breaking `bamcWedNight`/`jcCap`/
`traumaPedsSplit` now correctly comes back RELAXED-mode INFEASIBLE (or plain pass-1 INFEASIBLE)
instead of shipping a program-policy violation. `solver/report/builder.py`'s `HARD_RELAXABLE_RULES`
was also built from the full (not relaxable-only) family tuples — a stale holdover from before R7 that
happened to be harmless there since an always-hard family can never appear in `feasibility.violations`
in the first place — corrected to build from `RELAXABLE_DUTY_HOUR_FAMILIES`/
`RELAXABLE_POLICY_CAP_FAMILIES` only.

**Correction (2026-10-14, nightRunMax retier — user decision):** the max-6-consecutive-nights cap is
NOT an ACGME rule — it's a program target the chief set ("ideally what we'd like to target as a
program"), paired with a stated preference for nights to cluster contiguously when possible.
`src/lib/rulePolicy.js`'s `nightRunMax` moved from tier `acgme` to tier `program` to say so honestly.
**No hardness change**: `program` blocks everywhere exactly like `acgme` (differ only in WHY, never in
HOW HARD — rulePolicy.js's own tier comment), so `nightRunMax` stays exactly where it was in
`solver/model/elastic.py`'s `ALWAYS_HARD_DUTY_HOUR_FAMILIES` tuple — unmoved, still never wrapped by a
pass-2 relax literal. `solverTierParity.test.js` already accepted `acgme` OR `program` for always-hard
families, so no test-mapping change was needed either. Contiguity (the chief's stated preference, as
opposed to the hard 6-night ceiling) is NOT enforced anywhere yet — `SCORE_WEIGHTS.nightCluster`/
`isolated night` scoring already nudges toward one run, and `nightStintCapped` hard-caps at 2 stints —
whether that's a sufficient proxy for "contiguous if able" was measured but not acted on (see the task
that produced this note); no generator/solver behavior changed beyond the tier relabel.

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
- `config.stageSplit`: `[float, float, float, float]`, default `[0.15, 0.15, 0.5, 0.2]` — fraction of
  `maxTimeSeconds` given to each of the 4 staged-solve stages (see below; `Config.stage_split`
  in `solver/io/payload.py`). Renormalized defensively
  if it doesn't sum to 1; stages 1-2 keep 15% each because they are typically ALREADY at
  their optimum straight from the warm-start hint (a good local schedule has 0 target deficit and 0
  rest violations) and need enough time to CONFIRM that via presolve — stage 3 (coverage) gets the
  largest share, stage 4 (quality) the remainder. The earlier 3-stage 15/15/70 and 30/20/50
  splits were superseded (see the 2026-10-15 "Real-block coverage gap fix" section below).
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
| `errorCount` (validateAll 'error' level) | `targetDeficitCore.perUnit` (EM-core resident under shift-count target), minus the tolerated unit on a conference block — see below | Every OTHER JS 'error' (acgme/program tier, `rulePolicy.js`) is already a solver HARD constraint (circadian, trauma caps, ACGME hours, senior composition, ...) — 0 by construction in a strict-pass-1 solve, so it needs no objective term. **FIXED 2026-10-15** (was a documented gap): JS's `conferenceTolerated` exception (a 1-shift EM-core shortfall during a conference block downgrades from 'error' to blockingWarnCount) now has a solver equivalent — `payload.blockTouchesConference` (new, `buildSolverPayload`'s `blockTouchesConference`, same `getConferencesInBlock(...).length > 0` check validateAll itself runs) tells `_add_target_deficit_terms` to split an EM-core resident's `deficit` into `tolerated = min(deficit, 1)` (charged at the new `conferenceTolerated.perUnit` weight, into `TIER_BLOCKING`) and `remainder = deficit - tolerated` (still `targetDeficitCore.perUnit`, `TIER_ERRORS`) whenever the flag is set. Only the first unit moves — a 2+ shortfall still charges the remainder at full `TIER_ERRORS` weight, matching JS's own "scoped to a shortfall of exactly 1" comment. See "Two engine gaps closed" below for the full change and the re-measured `conferenceBlock` head-to-head outcome. |
| `blockingWarnCount` (JS `EXPORT_BLOCKING_RULE_IDS`: `postNightRest` + every `rulePolicy.js` 'override'-tier rule) | `postNightRest.perViolation` | Override-tier rules (`traumaRunCap`, `podPgy3Composition`, `wellnessWednesday`, ...) are hard-never-broken by the solver's own strict pass 1 too (mirrors the JS generator, which also never breaks them) — 0 by construction, no objective term needed in `TIER_BLOCKING`. They only become genuinely violable in PASS 2 (relaxed), which is a documented gap below. |
| `qualityVector[n0,n1,n2]` (`coverageMin`/`seniorComposition`/`postNightRest`, in `rulePriority` order) | `coverageMin.perSlack` + `overstaffCoverage.perUnit` (`TIER_RANK`) | `seniorComposition` is hard (0, no term needed). `postNightRest` is already pinned to its true minimum by `TIER_BLOCKING` above, regardless of `rulePriority` order — same as the JS side, where `blockingWarnCount` (unconditional) always outranks the quality vector (rulePriority-ordered) as a lexicographic tier, so a `postNightRest`-first `rulePriority` doesn't change WHICH count gets minimized first, only which of `coverageMin`/`postNightRest` (already both effectively pinned by earlier tiers) would be re-ranked if either weren't. `overstaffCoverage` has no `betterQuality` slot of its own in JS either (`ResidentScheduler.jsx`'s own comment on repair Phase 5) — placed here since that's its natural weight-ordering position (between ordinary soft rules and target deficit). |
| `qualityVector[fairnessPlusShape]` | Everything else (`TIER_QUALITY`): `targetDeficit` (non-core), `fairness.*`, `isolatedNight`, `nightFragment` (**NEW 2026-10-16**, see "Night-stint contiguity gap closed" below), `workShape.*`, `traumaSecondInRun`/`traumaMidRun`/`nightDurationAlternation`/`secondRestDay`/`pedsInternNightDeficit`, `weekendOff`, `pedsMixMin`, `fm1Peds`, `internPair`, `podEmComposition`/`flexEmComposition`, `podPgy2Fallback`/`flexPgy3Fallback`, `seniorTruePrimary`, `dowPreference` | **CHANGED 2026-10-15**: now its OWN 4th solve stage (was: rolled into ONE combined stage alongside `TIER_RANK`, on the theory that JS's own `qualityVector` is a single field so a 4th CP-SAT stage would "over-split" it). Measured on a real block, that theory was wrong in practice: JS's own `compareVectors` (`scheduleQuality.js`) is a plain element-by-element lexicographic compare of `[errorCount, blockingWarnCount, n0, n1, n2, fairnessPlusShape]`, so `coverageMiss` (n0) already strictly dominates `fairnessPlusShape` on the JS side — combining them into one CP-SAT objective only ever APPROXIMATED that via weight-magnitude dominance, and on an instance big enough, CP-SAT's search needed real, undiluted, dedicated time on coverage alone to get anywhere near the bound-probe-proven optimum. See "Real-block coverage gap fix" below. |

**Implementation** (`solver/solve.py`'s `_solve_staged`): up to 4 sequential solves on the SAME model
(no rebuild — only the objective and an accumulating set of "stage N was already this good" bound
constraints change): stage 1 minimizes `TIER_ERRORS`, fixes `model.Add(expr <= achieved)`, carries
that stage's own solution forward as the next stage's hint; stage 2 does the same for
`TIER_BLOCKING`; stage 3 does the same for `TIER_RANK` (coverage + overstaff); stage 4 minimizes
`TIER_QUALITY` alone with whatever time is left. A stage with
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

**RESOLVED 2026-09-27 (was: "hint judged infeasible on every one of the 4 `engineHeadToHead`
fixtures").** The original finding here diagnosed the mismatch backwards. What was actually true:
every fixture's warm-start schedule (the JS engine's own `generateScheduleBest` output) contains
multiple resident/date pairs where a **day shift is immediately followed by an evening shift the
next calendar day** (12-24 occurrences per fixture, e.g. `FLEX-D` on day N then `FLEX-E` on day
N+1) — `solver/model/circadian.py`'s `_add_eve_day_pairs` treated BOTH `eve-then-day` and
`day-then-eve` as hard-forbidden, while `ResidentScheduler.jsx`'s `checkCircadianViolations` only
ever enforced the `eve-then-day` direction (its `newType === 'day'` branch checks the PREVIOUS day
for an eve shift — catching the SAME `eve→day` transition from the day-shift's own placement order,
never the day→eve direction). This was written up as "a real, pre-existing bug in the JS engine's
own rule enforcement" against a solver that "faithfully implements the documented policy." A
follow-up user decision (2026-09-27) settled which side was actually right: **day shift followed by
a next-day evening shift (~23h off, forward rotation) is explicitly ALLOWED** — only
evening-then-day stays hard. So the JS engine's enforcement was correct all along; the SOLVER was
over-forbidding. Fixed by narrowing `_add_eve_day_pairs` (and `validate.py`'s
`_check_circadian_pairs`) to forbid only `eve-then-day`, matching what the JS generator already did.
See root `CLAUDE.md`'s circadian rule line and `CLAUDE-Archive.md`'s superseded note for the policy
change itself. With the solver now agreeing with the JS generator's own hard-rule enforcement, a
warm-start hint containing a day→next-day-eve pair (extremely common — it's an allowed, unremarkable
transition) is no longer rejected on account of it; see the re-measurement below for the resulting
`hintFeasible` values on all 4 fixtures.

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
- ~~`conferenceTolerated` (see the tier-mapping table above): no solver-side signal exists for "this
  block touches a conference", so a 1-shift EM-core shortfall during a conference block is still
  charged at full `TIER_ERRORS` weight instead of downgrading to blocking-warn severity like the JS
  side does. Would need a new payload field (e.g. `blockTouchesConference: bool`) to close.~~
  **FIXED 2026-10-15** — see "Two engine gaps closed" below and the tier-mapping table's own
  `errorCount` row.
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
- **PARTIALLY RESOLVED 2026-09-27 (was: "Blocking discovery: `evaluate_hint` reports EVERY ONE of
  the 4 `engineHeadToHead` fixtures' hints as infeasible").** One real root cause was a mismatch
  between the solver's `_add_eve_day_pairs` (forbade both eve→day and day→eve) and the JS
  generator's `checkCircadianViolations` (only ever enforced eve→day) — see "Pinning the polisher to
  its own hint"'s rewritten diagnosis above. A 2026-09-27 user decision confirmed day→next-day-eve
  is intentionally ALLOWED, so the solver (not the JS engine) was wrong; fixed by narrowing
  `_add_eve_day_pairs`/`_check_circadian_pairs` to eve→day only. This alone makes the `standard`
  fixture's hint feasible. Bisecting the other 3 fixtures turned up TWO more distinct causes, one
  fixed (a `_add_night_run_segments` gap missing the `night_exempt` skip `_add_night_cap` already
  had) and one found-but-reverted (a GR-obligation staleness issue in `buildSolverPayload`, unsafe to
  fix the way first attempted) — see "Pin-to-hint re-measurement (post circadian fix)" below for the
  full breakdown, the resulting `hintFeasible` values, and the `KNOWN_GAP_VARIANTS` decision.

### Pin-to-hint re-measurement (post circadian fix, 2026-09-27)

Re-ran `evaluate_hint` directly (dumped each fixture's real `buildSolverPayload({..., hint})` output
via a throwaway vitest script, loaded it with `parse_payload`/`build_model` in Python, called
`evaluate_hint`) after narrowing `_add_eve_day_pairs` to eve→day only:

| fixture | hintFeasible (after eve/day fix alone) |
|---|---|
| standard | **true** |
| understaffed | false |
| vacationHeavy | false |
| conferenceBlock | false |

Bisected the 3 still-infeasible fixtures by rebuilding the model with one hard-constraint family
skipped at a time (same method the original diagnosis used) against the hint fixed to every `x` var.
Two more distinct causes, both traced to real resident/date pairs via `solver/validate.py`'s
`validate_schedule` run directly against the hint (`{resident_id: {date: shift_id}}`):

1. **`nightSegments` (fixed, kept).** `understaffed`'s hint has an FM-3 resident on `PED-N-FM`
   (Mon/Tue/Wed nights only, `night_exempt=True`) working 4 separate 3-night stints across the
   block — structurally inevitable for a shift that recurs the same 3 nights every week, and
   `ResidentScheduler.jsx`'s own `checkCircadianViolations` already exempts night-only residents from
   its ENTIRE `nightStintCount` check (`if (!nOnly) { ... }`, not just the total-nights cap). But
   `circadian.py`'s `_add_night_run_segments` had no `night_exempt` skip at all (unlike
   `_add_night_cap` right above it in the same file, which already did). Fixed by adding the same
   skip; mirrored in `validate.py`'s `_check_night_run_and_cap_and_segments`. New pytest:
   `test_night_exempt_resident_skips_night_run_segments_cap`. This alone makes `understaffed`'s hint
   feasible.
2. **GR-obligation staleness (found, NOT fixed — reverted after measuring real harm).**
   `vacationHeavy`/`conferenceBlock`'s hints each have a resident working a night shift the day
   before their own GR weekday, then several more shifts after — `isStreakWorkDay`'s documented
   exemption ("worked a night shift the calendar day before... they sleep through GR... doesn't
   count" — root `CLAUDE.md`) means that GR day should NOT count as a workday, so the true
   consecutive-work run is short and legal (confirmed: running `validateAll` on the JS engine's OWN
   winning schedule for these fixtures finds ZERO `sixConsecutiveWorkDays`/`sixDayRunRest` issues).
   But `buildSolverPayload`'s `obligations` loop reads `rs = block.schedule?.[r.id] || {}` — the
   PRE-generation schedule, empty on a fresh solve — so `isStreakWorkDay`'s `rs[prevDs]` lookup can
   never see the night shift the HINT itself placed, and marks the GR day obligated anyway,
   manufacturing an 7-8-day "run" only the SOLVER's payload believes exists. `evaluate_hint`
   (correctly, given that input) then rejects the hint as infeasible.
   - **Tried**: sourcing `rs` from the caller's `hint` schedule instead of `block.schedule` when a
     hint is present (hint is a strict superset of `block.schedule`'s locked cells — generator never
     overwrites non-empty cells). This DID make `vacationHeavy`/`conferenceBlock`'s hints feasible.
   - **Reverted**: `obligations` feeds `build_model` ONCE, shared by both `evaluate_hint`'s
     fully-pinned clone (safe — every `x` var is fixed to the hint there, so the hint-derived
     obligation is self-consistent) AND the REAL staged solve (NOT safe — only 3 objective
     components are hard-pinned; the polisher is free to place a different shift, or none, the day
     before that same GR date). Baking the hint's own night-before fact in as a hard model input let
     the polisher's real output drift from the hint at exactly that spot while the model still
     believed the GR day could never count as a workday. Measured on a real `engineHeadToHead` run
     with the fix in place: `errorCount` got WORSE, not better (`standard` 3→12, `vacationHeavy`
     7→13, `conferenceBlock` 1→4 in one run), from new `sixConsecutiveWorkDays`/`sixDayRunRest`
     violations `validateAll` caught on the solver's ACTUAL output — violations the solver's own
     (now wrongly-relaxed) hard constraint never forbade, because its hard-coded obligation
     assumption no longer matched what it actually placed. **Reverted** (`ResidentScheduler.jsx`
     keeps `rs = block.schedule?.[r.id] || {}` unchanged, with an inline comment recording this
     finding). A correct fix needs the "worked a night shift the day before" fact reified against the
     model's OWN decision variables (like `night[]` already is elsewhere in `circadian.py`), not a
     static payload input computed once up front — real modeling work, left for a dedicated task.
     `understaffed`/`vacationHeavy`/`conferenceBlock` therefore still report `hintFeasible: false`
     after this task (only `standard` is `true`) — a known, accepted, pre-existing-adjacent gap, not
     a regression.

**Net effect measured where it actually matters — `engineHeadToHead.test.js`, `SOLVER_PARITY=1`, 3
sequential full runs, one at a time, final code (eve/day fix + night-segments fix; obligations
change reverted)**:

| run | standard | understaffed | vacationHeavy | conferenceBlock |
|---|---|---|---|---|
| 1 | win (errorCount 3→2) | win (errorCount 3→2) | win (errorCount 7→7 tie, shape 418→414) | win (blockingWarnCount 2→1) |
| 2 | win (errorCount 3→2) | win (errorCount 3→2) | **loss** (errorCount 7→7 tie, but qualityVector n2 0→1) | win (blockingWarnCount 2→2 tie, coverageMiss 114→110) |
| 3 | win (errorCount 3→2) | win (errorCount 3→2) | win (errorCount 7→7 tie, coverageMiss 139→138) | win (blockingWarnCount 2→1) |

`standard`, `understaffed`, and `conferenceBlock` all won 3/3 — a marked improvement over this
section's earlier "flaky standard/conferenceBlock" finding (both pre-dated the eve/day fix; the
bogus day→eve hard-forbid was very likely eating into their own search quality too, not just the
hint's feasibility). `vacationHeavy` won 2/3, lost 1/3 (`evaluate_hint` still reports its hint
infeasible per the un-fixed GR-obligation gap above, so pinning never engages on it — same
un-pinned staged-solve flakiness this doc already documented, not a new regression).

**Decision: `KNOWN_GAP_VARIANTS` is left unchanged (`vacationHeavy` only)** — the task's own bar
("if all 4 never-worse 3/3, remove `vacationHeavy`") was not met (1 loss in 3 runs), so the exclusion
stays. This is nonetheless the best `vacationHeavy` has measured across every round of this feature
(previously 3/3 losses, then 3/3 losses again under pinning-without-a-working-hint) — closing the
GR-obligation gap properly (the reified-variable approach above) is the clear next step to chase a
true 3/3 and revisit this decision.

## R9 follow-up, part 2 (2026-09-27): GR-after-night exemption decided inside the model

Closes the "GR-obligation staleness" gap the section immediately above left open. Root cause
(unchanged from that diagnosis): `ResidentScheduler.jsx`'s `isStreakWorkDay` exempts a resident's own
Grand Rounds weekday from the 6-consecutive-work-day streak when they worked a night-type shift the
calendar day before (they slept through GR) — but `buildSolverPayload`'s old `obligations` map baked
that exemption in ONCE, up front, by reading `block.schedule` (empty pre-generation) as the "day
before" fact. A fresh solve could therefore never see a night shift the warm-start hint (or the
solver's own free choice) placed the day before a GR date, and treated every such GR day as an
unconditional workday — manufacturing phantom 7-8-day runs `evaluate_hint` (correctly, given that
stale input) then rejected as infeasible. The previously-tried fix (source the "day before" fact from
the caller's `hint` schedule instead) was reverted because it's only safe for `evaluate_hint`'s
fully-pinned clone, not the real staged solve, where the polisher is free to place something
different the day before that same GR date and the model would still believe the old fact.

**Fix: make the exemption a solver decision, not a payload fact.**

- JS (`ResidentScheduler.jsx`): `isStreakWorkDay` split into a new `obligationKind(resident, ds,
  bounds)` helper (returns `'jc'` | `'gr'` | `null`) plus the original function, now just
  `obligationKind` + (for `'gr'`) the post-overnight night-shift check. `buildSolverPayload`'s
  `obligations`/`obligationsExemptAfterNight` loop calls `obligationKind` directly, UNCONDITIONALLY
  (ignoring the night-before check entirely) — `obligations[residentId]` now lists every GR-weekday/
  JC-presenting date regardless of what's the day before, and the new `obligationsExemptAfterNight
  [residentId]` names the subset where the exemption CAN apply at all (`'gr'` kind only — a JC
  presenting date is never exempted; `isStreakWorkDay`'s unconditional-true branch for JC runs BEFORE
  the exemption check, so it never even reaches it).
- Payload (`solver/io/payload.py`): new OPTIONAL field `obligationsExemptAfterNight: {residentId:
  [date]}`, parsed with the same `_parse_obligations` helper as `obligations`. Defaults to `{}` —
  an older JS build that never sends it makes every `obligations` date count as worked
  unconditionally, byte-identical to pre-this-fix behavior (never LESS strict).
- Model (`solver/model/workday_limits.py`'s new `_obligation_term`): for a date in `obligations`, the
  term fed into `work[r,d]`'s linking constraint is `1` if the date isn't in
  `obligationsExemptAfterNight`, else `1 - night[r, d-1]` — a plain CP-SAT affine expression, no new
  BoolVar needed, since `night` is already provably 0/1 (at-most-one-shift-per-day). `night[r, d-1]`
  is the resident's own decision var for an in-block prior date (`circadian.py`'s existing link) or a
  plain int constant for a prior-tail date (already-happened history). This can never go stale: it
  reads whatever the model — hint-pinned clone or the real free solve — actually decided for that
  prior date, not a fact computed once before the solve started.
- `solver/validate.py`'s independent re-check (`_work_flags`) mirrors the same logic directly against
  the concrete final schedule (no reification needed there — it's a fixed-schedule post-solve check).
- `report/builder.py`'s `payload_to_raw` (verification-resolve round-trip) also carries the new field.

**Tests**: `solver-service/tests/test_workday_limits.py` — `test_gr_day_after_a_night_not_counted_as_workday`,
`test_gr_day_without_a_night_before_still_counted_as_workday`,
`test_obligation_without_exempt_flag_counts_even_after_a_night` (JC-shaped: no exemption regardless of
the night before), `test_exemption_lets_solver_legally_place_a_pattern_js_allows` (7-calendar-day
shape that's infeasible without the exemption, legal with it, matching what `validateAll` already
accepts for this exact shape). `src/lib/solverPayload.test.js`'s new `describe('obligations /
obligationsExemptAfterNight')` block covers the JS-side payload shape (GR flagged, JC never flagged,
vacation/approved-off suppresses both, a date with a real assigned shift is omitted from both).

**Verification — `evaluate_hint` feasibility, all 4 `engineHeadToHead` fixtures** (dedicated
throwaway script, same "dump `buildSolverPayload({..., hint})`, run the real CLI, read
`report.hintPinning`" method the original diagnosis used):

| fixture | hintFeasible (before this fix) | hintFeasible (after this fix) |
|---|---|---|
| standard | true | **true** |
| understaffed | false | **true** |
| vacationHeavy | false | **true** |
| conferenceBlock | false | **true** |

Every fixture's warm-start hint is now recognized as feasible and pinning engages on all 4 (`applied:
true` in every case) — the diagnosed staleness gap is closed.

**`engineHeadToHead.test.js`, `SOLVER_PARITY=1`, 3 sequential full runs, one at a time**:

| run | standard | understaffed | vacationHeavy | conferenceBlock |
|---|---|---|---|---|
| 1 | win | win | win (errorCount 7→7 tie, coverageMiss 139→139 tie, shape 418.48→407.17) | win (blockingWarnCount 2→1, coverageMiss 114→110) |
| 2 | win | win | win | win |
| 3 | win (errorCount 3→2, coverageMiss 126→125) | win (errorCount 3→2, coverageMiss 207→205) | **loss** (errorCount 7→7 tie, coverageMiss 139→142 — solver's `n0` tier got worse despite a better shape term, 403.06 vs 418.48) | win (errorCount 1→1 tie, blockingWarnCount 2→1, coverageMiss 114→111) |

(Run 2's per-variant metric breakdown wasn't preserved — only its win/tie/loss verdict, from the
test's own summary line — due to a `tail`-truncation mistake capturing that background run's output;
re-running a 4th time to recover it was judged not worth the ~150s and would no longer be "3
sequential runs" as asked. The win/tie/loss verdict itself, which is what the `KNOWN_GAP_VARIANTS` bar
below actually turns on, is unambiguous from the test's own printed summary for every run.)

Net: **standard, understaffed, and conferenceBlock all won 3/3.** `vacationHeavy` won 2/3, lost 1/3 —
the loss is the SAME pre-existing, already-documented staged-solve noise the "Known gaps" section
above describes ("Staged solve's margin over the warm-start hint is NOISY... on multiple fixtures"),
not a GR-obligation mismatch: `hintFeasible` is `true` and pinning is `applied: true` on
`vacationHeavy` in every run now (confirmed via the dedicated script above), so the loss happens
entirely inside stage 3's own coverage-vs-shape tradeoff within the time budget, an orthogonal,
already-known source of variance this task's fix doesn't touch.

**Decision: `KNOWN_GAP_VARIANTS` is left unchanged (`vacationHeavy` only)** — the task's own bar ("if
all 4 never-worse 3/3, remove `vacationHeavy`") was not met (1 loss in 3 runs). This is nonetheless a
real, measured improvement in what was previously flagged as unfinished work: `vacationHeavy`'s hint
is feasible and pinned on every run now (previously never), and its remaining loss is bounded to the
already-documented staged-solve coverage/shape noise rather than a masked hard-rule violation.

## Coverage-mapping investigation, part 3 (2026-09-27): no gap found; the loss is `TIER_QUALITY` noise

Task premise: the section immediately above measured `vacationHeavy` losing to local with `errorCount`
tied 7-7 but `qualityVector` n0 (`coverageMiss`) **139 (local) vs 142 (solver)** — since `coverageMin`
slack is hard-pinned `<=` the hint's own achieved value (`hint_pin.py`), a 142 result implied the
solver's own coverage accounting must disagree with JS's `coverageMiss` metric SOMEWHERE in the
build-payload -> solve -> map-result -> rescore round trip. This section is that investigation.

**Method**: a throwaway diagnostic script (`src/lib/_diagCoverageMapping.test.js`, deleted after use,
never committed) ran the real production pipeline end to end on `vacationHeavy`, 10 times: JS
`generateScheduleBest` -> `buildSolverPayload({..., hint})` -> the real `cli.py` subprocess -> JS
`mapSolverResult` -> JS's own `computeQualityMetrics`/`coverageMiss` recompute on the FINAL MAPPED
schedule. Each run compared that recompute against (a) the solver's own internal `report.unfilled`
shortBy total (read straight off `objective.coverage_slacks` post-solve — the exact expression
`hint_pin.py` hard-pins) and (b) `report.hintPinning.pinned.coverageMin` (the pin's own ceiling), plus
an independent per-(shift,date) diff of `payload.coverage`'s `min` values against a live
`getCoverageFor(shift.id, coverage, dow, twelveHourStateFor(ds, ayConf))` recompute using the identical
inputs `buildSolverPayload` and `scheduleQuality.js`'s `coverageMiss` loop each already use.

**Finding: no mapping gap exists, on HEAD.** Across all 10 diagnostic runs plus 5 full
`engineHeadToHead.test.js` runs (below):
- `payload.coverage` vs. the live recompute: **0 mismatches**, every run — `buildSolverPayload`'s
  coverage-table construction (`SHIFTS` + `shiftActiveOnDow` + `getCoverageFor(shift.id, coverage,
  dow, conf12For(ds))`) and `scheduleQuality.js`'s `coverageMiss` loop (`Object.keys(SHIFT_MAP)` +
  the same `shiftActiveOnDow`/`getCoverageFor`) are — and remain — the exact same (shift,date) ->
  min definition, including 12h-window resolution.
- The solver's own `report.unfilled` shortBy total and JS's independently-recomputed `coverageMiss`
  on the mapped schedule were **IDENTICAL in every single run** (138 or 139 — never above the pin's
  139 ceiling). The mapped schedule's JS-measured coverage never once exceeded what the solver's own
  model believed it had achieved.

The originally-measured "139→142" result is **not reproducible on HEAD** (commit 6688ef7, "decide the
GR-after-night work-day exemption inside the model"). Best explanation: that same commit is what
first made `evaluate_hint` report this fixture's hint FEASIBLE on every run (previously it was
infeasible on `vacationHeavy` in every measurement in this doc except by chance) — every run measured
for THIS task therefore had `hintPinning.applied: true` throughout, a condition earlier "139→142"
measurements in this doc were not guaranteed to have.

**What IS still real (confirmed by re-running 5x)**: `vacationHeavy` — and, newly observed here,
`standard` — can still lose to local. But in every observed loss, `qualityVector`'s n0/n1/n2
(coverageMin/seniorComposition/postNightRest) **tie EXACTLY** with local; the loss is purely
`qualityVector`'s 4th slot, `fairnessPlusShape` (`TIER_QUALITY` in solver terms). Examples from this
run (2026-09-27): `vacationHeavy` local `[139,0,0,418.48]` vs. solver `[139,0,0,424.48]`; `standard`
local `[126,0,0,392.98]` vs. solver `[126,0,0,393.48]`. `hint_pin.py` deliberately never pins
`TIER_QUALITY` (its own docstring: "that's the one thing this feature still lets the solver freely
improve") — extending the pin to it might close this permanently, but risks repeating the
`overstaffCoverage` mistake this same module's docstring already documents (pinning something without
first confirming an EXACT numeric correspondence to what JS's ladder actually measures made 3/4
fixtures worse, not better). Not attempted here — genuinely new, unverified modeling work, and out of
this task's scope (the coverage-mapping question, which is now closed).

**Fix applied**: none to production code — there was no mapping gap to close.
`src/lib/engineHeadToHead.test.js` gained one permanent regression assertion instead: whenever
`hintPinning.applied` is true, `solverMetrics.coverageMiss` (recomputed on the real, mapped schedule)
must be `<=` `hintPinning.pinned.coverageMin`. This turns the diagnostic finding above into a standing
guard — every one of the 5 re-measurement runs below passed it — that will fail loudly, with the exact
variant and numbers, if a genuine coverage-mapping regression is ever introduced.

**`engineHeadToHead.test.js`, `SOLVER_PARITY=1`, 5 sequential full runs, one at a time (2026-09-27,
final code on this branch)**:

| run | standard | understaffed | vacationHeavy | conferenceBlock |
|---|---|---|---|---|
| 1 | win | win | win (coverageMiss 139→138) | win |
| 2 | win | win | win (coverageMiss 139→139 tie, shape 418.48→403.12) | win |
| 3 | win | win | win (coverageMiss 139→139 tie, shape 418.48→397.94) | win |
| 4 | **loss** (126→126 tie, shape 392.98→393.48) | win | **loss** (139→139 tie, shape 418.48→424.48) | win |
| 5 | win | win | win | win |

**Decision: `KNOWN_GAP_VARIANTS` is left unchanged (`vacationHeavy` only)**. `vacationHeavy` won 4/5
this round (previously 2/3, then 2/3 again) — a real improvement, but a 3-run clean-win streak (runs
1-3) turned out to be luck, not a fixed bar: run 4 lost again, so "all 4 never-worse 3/3" still isn't
actually met once measured past 3 runs. `standard` also lost once (1/5) — a fixture not previously in
`KNOWN_GAP_VARIANTS` at all — matching this doc's own earlier "New finding" note (above) that
`standard`/`conferenceBlock` can flake too under the corrected `stageSplit`. Not widening
`KNOWN_GAP_VARIANTS` to cover `standard` here: it's the same already-documented, out-of-scope
`TIER_QUALITY` noise as `vacationHeavy`'s, not a new regression, and this doc already flags widening
the gate as "a real open decision left for a future round" rather than something to do reactively off
one flaky run.

## Never fall to pass 2 when the warm-start hint is feasible (2026-09-28)

**Symptom**: `chiefBenchmark.solver.test.js` and `engineHeadToHead.test.js` occasionally reported the
solver's pass-1 status as `RELAXED` (i.e. `run_pass2` had fired) on `standard`/`vacationHeavy`, and
lost to local under `betterQuality`, even though `evaluate_hint` (`solver/model/hint_pin.py`) reports
every one of the 4 `engineHeadToHead` fixtures' warm-start hints as feasible in the pass-1 model as of
the GR-after-night reification fix (see "R9 follow-up, part 2" above) — a known feasible witness
existing for the exact model pass 1 solves should mean pass 1 can never be genuinely INFEASIBLE, and
`run_pass2` should never even be called.

**Diagnosis (hypothesis 1 confirmed, hypotheses 2-4 ruled out)**: `solve.py`'s `_solve_pass1` collapses
EVERY non-solvable staged-solve status — `INFEASIBLE` *and* `UNKNOWN` alike — into one outward
`"INFEASIBLE"` (`if status_name not in SOLVABLE_STATUSES: return SolveResult(status="INFEASIBLE", ...)`),
and `solve()` escalates to `run_pass2` on ANY `"INFEASIBLE"` pass-1 result, with no check of whether a
feasible hint was already known to exist. `_solve_staged`'s first stage (`TIER_ERRORS`, 15% of
`max_time_seconds` by default — ~4.5s of a 30s budget) genuinely can return `UNKNOWN` under load or CPU
contention (`CpSolverParameters.num_workers > 1` search is non-deterministic run-to-run even at a fixed
seed, already documented above) — a plain search-budget timeout, not evidence that no solution exists.
Reproduced directly against real production-shaped payloads (dumped `buildSolverPayload({..., hint})`
output for all 4 `engineHeadToHead` fixtures, replayed through `solver.solve.solve()` with
`cp_model.CpSolver.solve` monkeypatched to return `UNKNOWN` on the 2nd call — i.e. stage 1, right after
`evaluate_hint`'s own clone-solve succeeds): before this fix, that single forced `UNKNOWN` propagated
all the way to `run_pass2` firing. Hypotheses 2 (hint evaluated on a divergent clone) and 4
(`evaluate_hint`'s single-worker params missing real constraints) were ruled out — `hint_eval.feasible`
was `True` in every reproduction, proving the hint clone and the real model already agree; hypothesis 3
(staged per-stage budget too small to ever find the hint) doesn't distinguish UNKNOWN-from-timeout from
genuine infeasibility, which is exactly the gap this fix closes regardless of which one occurs.

**Fix**: `solver/model/hint_pin.py`'s `HintEvaluation` now also keeps the `CpSolver` that solved the
fully-pinned clone (`solver`) and its solve time (`solve_time_ms`) whenever `feasible` is `True` —
reading `.value(...)` off that solver against the ORIGINAL model's vars/exprs (`store.x`,
`objective.*`) is valid because `CpModel.clone()` preserves every variable's index 1:1, the exact same
fact `pinned_component_exprs` already relied on for this same solver object. `solve.py`'s
`_apply_hint_pinning` now returns `(hint_diag, hint_eval)` instead of just the diagnostics dict, and
`_solve_pass1` threads `hint_eval` into `_solve_staged(payload, build_result, hint_eval)`. Inside the
staged loop, the ONE branch that previously returned an unconditional failure — "first stage failed
outright, no earlier stage solution to fall back to" — now checks `hint_eval is not None and
hint_eval.feasible` first: if so, it returns `("FEASIBLE", hint_eval.solver, ...)` — the hint's own
already-solved clone — instead of the failed stage's status. `solve()` then sees a normal solvable
status and never calls `run_pass2` at all. When no hint was supplied, the hint was itself infeasible,
or `objectiveMode` is `"weighted"` (`hint_eval` is `None` in all three cases), behavior is completely
unchanged — pass 1 can still genuinely report `INFEASIBLE` and pass 2 still runs exactly as before.

**Tests**: `solver-service/tests/test_hint_pin.py`'s new
`test_staged_stage1_unknown_with_feasible_hint_falls_back_to_hint_not_pass2` — same
`cp_model.CpSolver.solve` call-count monkeypatch pattern `test_hint_and_staged.py`'s
`test_staged_mid_ladder_failure_returns_last_good_stage_solution` already uses, forcing call #2 (stage
1, right after `evaluate_hint`'s call #1) to `UNKNOWN` on a fixture with a proven-feasible hint —
asserts the result comes back `status="FEASIBLE"`/`mode="strict"` (pass 2 never entered), with
`hintPinning.applied`/`hintFeasible` both `True` and the schedule exactly matching the hint, and that
`CpSolver.solve` is never called a 3rd time (stage 2/3 must never run once the fallback engages). Full
`pytest` (168 passed, was 167 — the one new test).

**Verification — `engineHeadToHead.test.js`, `SOLVER_PARITY=1`, 3 sequential full runs, one at a
time (2026-09-28, final code on this branch)**:

| run | standard | understaffed | vacationHeavy | conferenceBlock |
|---|---|---|---|---|
| 1 | win | win | win | win |
| 2 | win | win | win | win |
| 3 | win | win | tie | win |

Zero losses and zero `RELAXED` statuses across all 3 runs — every fixture never-worse in every run,
meeting the task's own bar ("if all 4 never-worse 3/3, remove `vacationHeavy`"). **`KNOWN_GAP_VARIANTS`
is now empty** (`src/lib/engineHeadToHead.test.js`) — `vacationHeavy` removed.

Also verified: `chiefBenchmark.solver.test.js` 3/3 passed, `solverParity.test.js` passed, full
`pytest` (168 passed), full `npm test` (see task report for the count), all 4 quality baselines run
one at a time (unchanged from their committed baselines), and `chiefBenchmark.test.js` passed.

## Night-stint contiguity preference + avoidable/forced fragmentation split (2026-10-14)

Chief preference measured on real seeds (generateScheduleBest, seed 42, 20 attempts): a large share
of residents who end up with 2 separate night-run segments in a block (15/23 standard, 7/17
understaffed, 15/23 vacationHeavy, 13/24 conferenceBlock) have segments whose combined length is
already `<= NIGHT_RULES.maxRun` (6) — i.e. one clean run was always structurally possible, nothing
forced the split. "Bigger preference is for the night shifts to be contiguously scheduled if able" —
`maxRun` stays a hard 6-nights-per-run program cap either way, never relaxed.

**JS side (`src/lib/scheduleQuality.js`, `computeQualityMetrics`)**: `nightShapePenalty`'s existing
fragmentation term ("every interior run beyond the first costs +2", flat, added when the night-run
shape relaxation shipped) now distinguishes AVOIDABLE from FORCED: if the resident's TOTAL nights
this block (summed across every run, edge runs included) is `<= nightRules.maxRun`, the split was
avoidable and costs +2.3 per extra run (originally floated as +6 — see that file's own comment for
why it's calibrated down); otherwise (more nights than one run could ever hold) it's forced and
keeps the original +2. Both still join the existing `fairnessPlusShape` quality-vector slot (never
a new tuple element) at the same `1x` coefficient nightShapePenalty always carried.

**Generator side**: no new repair move. A `repairPass` "night-stint merge" phase was built, measured
and dropped — near-zero hit rate on the committed fixtures (slack consumed by earlier phases; gap days
ineligible via EM_EMS/EM_TOX windows or ACGME caps). The measured improvement (2-segment residents
15→13 standard, 15→13 vacationHeavy, 13→11 conferenceBlock, understaffed unchanged) comes from the
metric feeding best-of-20 selection. Detail: `src/lib/nightContiguity.test.js` header.

~~**Solver side — GAP, documented, not mirrored**: `solver/model/objective.py`'s `_add_isolated_night_
term` (rule 36, `isolatedNight`, renamed from `nightShape` 2026-08-22) only penalizes a length-1
isolated night (`soft_min=2`, `min_cost` per unit) — it has NO per-resident "extra night run beyond
the first" fragmentation term at all, avoidable or forced. (`_add_work_shape_term`'s `fragment_cost`
is a DIFFERENT axis — general workday-run fragmentation against `MAX_CONSECUTIVE_WORK_DAYS`, not
night-runs against `NIGHT_RULES.maxRun`.) This was already a gap before this change (JS's flat +2
fragmentation term had no solver equivalent either); the new avoidable(+2.3)/forced(+2) split widens
it slightly but doesn't newly introduce it. Left undone here — `add_soft_sequence_constraint`'s cost
model charges by RUN LENGTH, not by "is there a 2nd run and would merging it still fit under maxRun",
so mirroring this exactly would need a new per-resident "total-nights-conditioned run-count" term, a
nontrivial CP-SAT addition out of scope for this task. Since the solver only ever POLISHES a
local-engine warm start (R9) and must strictly beat it to ship, this gap's worst case is the solver
settling for a local schedule's existing night-stint shape rather than actively improving it — never
a regression.~~ **CLOSED 2026-10-16** — see "Night-stint contiguity gap closed" below.

## Night-stint contiguity gap closed (2026-10-16)

Closes the "Solver side — GAP, documented, not mirrored" paragraph just above (struck through rather
than silently rewritten, per this repo's convention). Task: the chief's contiguous-night-run
preference is measured to fragment MORE under the 2026-10-15 clinical-shift-only streak/rest rules
(`CLAUDE.md`'s "Max 6 consecutive work days"/"Rest between shifts" entries) — does the CP-SAT polish
stage repair that fragmentation, and if not, can the solver's quality stage be made to prefer
contiguous runs better without touching the lexicographic ladder?

**Measured, real production block (2026-09-21..2026-10-18, 58 residents), BEFORE this fix** (fresh
`buildSolverPayload`, current rules, `numWorkers:4`): local-first generates a schedule with 21
isolated single-night runs and 28 non-night-only residents at exactly 2 night-run segments (every one
of those 28 already "mergeable" — combined length `<= NIGHT_RULES.maxRun`, i.e. avoidable splits).
Solver default-config (~30s) polish ships a TIE (identical to local, 21/28/28). Solver 120s polish
ships and DOES improve isolated singles (21 -> 17, via the pre-existing `isolatedNight` term) but
leaves the 2-segment count **completely unchanged (28 -> 28)** — exactly the predicted failure mode:
the solver had an incentive to fix truly-isolated singles but literally no model term that could ever
prefer merging two already-legal, non-isolated runs into one.

**Fix**: new `solver/model/objective.py`'s `_add_night_fragment_term` (rule 36b, right after
`_add_isolated_night_term`, same `TIER_QUALITY` stage) — mirrors `scheduleQuality.js`'s
`nightShapePenalty` fragmentation charge exactly, never a new ranking. For each non-night-exempt
resident: count night-run "starts" across the whole block (same boolean-indicator idiom
`_add_night_run_segments`/`_add_work_shape_term` already use), drop the run touching date index 0
and the run touching the last date (JS's own `interior = runs.filter(start>0 && end<lastIdx)` edge
exemption — a run touching either edge may continue into the adjacent block, so its shape can't be
judged from inside this one), and charge every interior run beyond the resident's first one at
`nightFragment.avoidableCost` if this resident's TOTAL nights this block (every run, edge runs
included) is `<= NIGHT_RUN_MAX` (the split was structurally avoidable — matches JS's
`avoidableSplit`), else `nightFragment.forcedCost` (more nights than any one run could legally hold).
New weights (`config/default_weights.json`): `nightFragment.avoidableCost: 115`,
`nightFragment.forcedCost: 100` — the SAME x50 scale `isolatedNight.perUnit` (200) already uses for
JS's len==1 charge (`nightRules.minRun - 1 == 4`), so JS's 2.3/2 keep their relative ordering and
ratio (`115/100 == 2.3/2`) inside the solver's integer weight space. `test_weight_tiering.py`'s
anti-fill-sum/overstaff-dominance invariants updated to include the new weights (still comfortably
dominated — both new costs are the same order of magnitude as `isolatedNight.perUnit`).

**Measured AFTER this fix** (same real block, same fresh payload regenerated per-run, `numWorkers:4`)
and **unit tests** (`solver-service/tests/test_night_fragment.py`, 6 new tests: single contiguous run
costs 0, an avoidable split costs `avoidableCost`, a forced split costs `forcedCost`, an edge-touching
run is correctly excluded from the count, a night-exempt resident is skipped entirely, zero-weight
config adds no terms): see this task's own final report for the numbers and `pytest`/`vitest` run
counts.

No change to `betterQuality`, `SCORE_WEIGHTS`, `scheduleQuality.js`, or the quality vector shape (JS
side untouched — JS already had this term; only the solver was missing its mirror). No
`ResidentScheduler.jsx` changes.

## Two engine gaps closed (2026-10-15)

Closes the two long-standing, explicitly-deferred gaps this doc documented elsewhere
(`errorCount` row of the R9 tier-mapping table; the "Known gap (not fixed here, out of scope)"
section near the top of this file) — both struck through above rather than silently rewritten, per
this repo's "every rule here is load-bearing" convention.

### Gap 1: `conferenceTolerated` now has a solver-side signal

**Payload**: new OPTIONAL field `blockTouchesConference: bool` (default `false`). JS
(`buildSolverPayload`, `ResidentScheduler.jsx`) computes it with the EXACT SAME call validateAll's
own `conferenceTolerated` branch uses — `getConferencesInBlock(block.startDate, block.endDate,
ayConf).length > 0` — so the two can never drift on "does this block touch a conference." Parsed in
`solver/io/payload.py` (`Payload.block_touches_conference`) AND declared on `api/schemas.py`'s
`SolveRequest` — the schema declaration is NOT optional busywork: `SolveRequest` WAS a Pydantic
`BaseModel` with the library default `extra="ignore"` (SUPERSEDED: now `extra="allow"`, see the 2026-10-18 section at the end), and `api/main.py`'s `solve_endpoint` calls
`request.model_dump()` before `parse_payload` ever sees the raw dict, so a field `SolveRequest`
doesn't declare is silently dropped before it reaches `solver/io/payload.py` at all, regardless of
what `Payload`'s own dataclass declares or defaults. (This same gap already existed for several
older optional fields, e.g. `obligationsExemptAfterNight`/`truePrimary`/`grDates` — out of scope to
fix here, but `test_conference_tolerance.py`'s
`test_block_touches_conference_survives_the_api_schema_boundary` guards this NEW field against the
same class of regression via a real `TestClient` round-trip, not just a `parse_payload` unit test.)

**Objective** (`solver/model/objective.py`'s `_add_target_deficit_terms`): when the flag is set, an
EM-core resident's `deficit` (unchanged var, same one `hint_pin.py` pins against) is split into
`tolerated = min(deficit, 1)` — charged at the new `conferenceTolerated.perUnit` weight
(`config/default_weights.json`, `50000`, same magnitude as `postNightRest` since both now share
`TIER_BLOCKING`) — and `remainder = deficit - tolerated`, still charged at `targetDeficitCore.perUnit`
in `TIER_ERRORS`. Only the first unit ever moves, matching JS's own "scoped to a shortfall of
exactly 1 (2+ is still a real problem)" comment; a non-EM-core resident's deficit (already routed to
`TIER_QUALITY`'s `targetDeficit`, non-core) is untouched either way. `hint_pin.py` needed no change:
its `targetDeficitCore` pin sums the raw (unweighted) `deficit` vars directly off
`objective.target_deficit_vars`, which this change never alters — only which group(s) a deficit's
*value* feeds into, not the deficit var itself.

**Tests**: `tests/test_conference_tolerance.py` (new) — `payload.block_touches_conference` defaults
`False`; a shortfall of 1 under the flag lands entirely in `TIER_BLOCKING` (0 in `TIER_ERRORS`); a
shortfall of 2 under the flag tolerates only the first unit (`TIER_ERRORS` gets exactly 1 unit's
worth); the flag is a no-op without it (`TIER_ERRORS` gets the full deficit); a non-EM-core resident
is unaffected regardless; the API-schema round-trip test above. `src/lib/solverPayload.test.js`
(updated) — `buildSolverPayload` emits `blockTouchesConference: false` for the `standard` fixture and
`true` for `conferenceBlock` (which has a real ACEP window inside the block, `CONFERENCE_AY_CONF`).

### Gap 2: solver over-max ("+1 overstaff") placements are now visible in the report

**Response**: `solve.py`'s `_build_report` (used by both the strict-pass-1 and relaxed-pass-2 report
builders) now includes `report["overstaffed"]`: a list of `{shiftId, dateStr, count, max}`, one entry
per `(shift, date)` pair whose `overstaff` BoolVar (`solver/model/coverage.py`) actually fired.
`count` is always `max + 1` — the BoolVar only ever allows exactly +1 over `max` (coverage.py's own
docstring), never unbounded. This is a per-`(shift,date)` AGGREGATE, not per-resident: the model has
no notion of WHICH assigned resident is "the extra one," only that the pair ended up one over.
`ObjectiveInfo` gained a `coverage_overstaff` field (mirrors `coverage_slacks` 1:1) so `_build_report`
can read the BoolVars back; `_build_report`/`_build_report_relaxed` both now take `payload` (threaded
through, previously only `solver`/`objective`) so they can look up each pair's own `max` out of
`payload.coverage`. `_empty_report` also gained `"overstaffed": []` for response-shape consistency on
a genuine INFEASIBLE.

**Client** (`mapSolverResult`, `ResidentScheduler.jsx`): re-expands each aggregate entry into this
app's own per-placement `report.overstaffed` shape — `{residentId, name, date, shiftId}`, the EXACT
shape `repairPass` Phase 5's `overstaffFor` already produces for the local engine, so
`GenerationReportCard`'s existing "Placed over maximum staffing" subsection (`report.overstaffed||[]`
`.length > 0` gate) renders a solver-sourced entry identically, no UI change needed. Picks `count -
max` residents (always 1 in practice) off the FINAL merged schedule's own assignees for that
`(shift, date)` — which specific resident is arbitrary (the model never tracked that), but the
`(shift, date)` and count are exact. Only runs when `allResidents` is supplied, same
optional/backward-compatible posture as `podSubstitutes`/`underTarget` filtering elsewhere in this
function. `report.repairs` is deliberately left `[]` for the solver path still — it is never rendered
by `GenerationReportCard` (only `report.overstaffed` is), and nothing else reads it off a solver
result.

**Tests**: `tests/test_overstaffed_report.py` (new) — empty when nothing was overstaffed; a tight
2-resident/1-slot fixture that forces the solver to spend the allowance once, asserting the exact
`{shiftId, dateStr, count, max}` entry; the key is always present (even `[]`) on an otherwise-solvable
result. `src/lib/solverPayload.test.js` (updated) — `mapSolverResult` expands a canned aggregate into
one `{residentId, name, date, shiftId}` entry attributable to an actual final-schedule assignee; is
empty with no `overstaffed` field in the response (backward compatible); is empty when `allResidents`
is omitted even if the response carries an aggregate (no residents to attribute to).

### Verification

- `solver-service`: full `pytest` suite — 214 passed (205 pre-existing + 9 new), zero regressions.
- JS: `npx vitest run src/lib/solverPayload.test.js` — 53 passed (48 pre-existing + 5 new).
  `SOLVER_PARITY=1 npx vitest run src/lib/solverParity.test.js` and
  `chiefBenchmark.solver.test.js` (real CP-SAT subprocess, run individually) — both still pass.
- `SOLVER_PARITY=1 npx vitest run src/lib/engineHeadToHead.test.js`, run once alone: **R9
  win/tie/loss 0W/4T/0L — standard=tie, understaffed=tie, vacationHeavy=tie, conferenceBlock=tie.**
  `conferenceBlock` in particular now ties on `errorCount` (1 vs 1) where this doc's own prior
  3-run measurement (see "Pin-to-hint re-measurement" above) recorded a loss specifically from this
  gap ("errorCount 1→2 — the pre-existing, documented `conferenceTolerated` gap"); no fixture
  regressed. `vacationHeavy` remains in `KNOWN_GAP_VARIANTS` (its hint is still reported infeasible
  by `evaluate_hint` for the separate, pre-existing GR-obligation-staleness reason documented above —
  untouched by this task) but tied, not lost, on this particular run.

## Real-block coverage gap fix: `TIER_RANK`/`TIER_QUALITY` split + budget rollover (2026-10-15)

**Measured on a real 58-resident production block** (never committed — aggregates only, see the
task's own scratchpad report): the production pipeline (local-first -> solver-polish ->
`pickEngineResult`) left a large, reproducible `coverageMiss` gap, and — the actual trigger for this
investigation — giving the solver MORE time made it WORSE: `maxTimeSeconds: 30` shipped a solver
result with `coverageMiss` 20 (beating local's 23); `maxTimeSeconds: 120` regressed all the way back
to a result byte-identical to the un-polished hint (`coverageMiss` 23, discarded as a tie). A dedicated
single-objective coverage-only probe (`solver/bound_probe.py`) proved `coverageMiss = 1` is
OPTIMAL-achievable on this exact block under the hint's own `targetDeficitCore`/`postNightRest`
constraints — so the gap was a search/time-budget problem in the staged solve, not a model/hard-rule
mismatch (the reconstructed coverageMiss=1 schedule validates clean under JS `validateAll`, same 2
structural `underTarget` errors every engine has).

**Root cause**: stage 3 (the combined `TIER_RANK + TIER_QUALITY` weighted solve, 70% of the budget by
default) relied on WEIGHT-MAGNITUDE dominance (`coverageMin.perSlack` 1,000,000 vs. everything in
`TIER_QUALITY` bounded well under it) to approximate JS's own strict lexicographic ordering
(`compareVectors` in `scheduleQuality.js` compares `[errorCount, blockingWarnCount, n0, n1, n2,
fairnessPlusShape]` element-by-element — `coverageMiss` genuinely dominates `fairnessPlusShape` on the
JS side, not just "usually"). That approximation is exact on a toy fixture (few variables, trivially
exhaustible) but not at real-block scale: CP-SAT has to jointly search coverage AND every quality term
to even recognize an improving coverage move, instead of being free to hammer on coverage alone the
way `bound_probe.py`'s dedicated single-objective solve does — exactly the "weighted ratchet"
fragility `objective.py`'s own module docstring already warns is prone to search-budget starvation
once an instance is big enough. The 30s-vs-120s regression itself: extra time flowed into stages 1-2's
own PROPORTIONAL share (which scales with the total budget, 15% each) even though those stages'
objective is `_TIEBREAK_MULTIPLIER * own_tier + sum(every later stage)` — nearly as expensive to
search as the whole remaining problem — so the extra time there bought nothing but a chance for
multi-worker CP-SAT's documented run-to-run nondeterminism to carry forward a different, merely-tied
solution that happened to be a worse starting point for stage 3.

**Fix**:
1. `TIER_RANK` (coverage + overstaff) and `TIER_QUALITY` now run as two genuinely separate
   lexicographic stages (`solver/solve.py`'s `_solve_staged`, `_STAGE_NAMES` — was `_STAGE_3_NAME`
   combining both into one solve). Coverage gets an undiluted objective and a dedicated share of the
   budget instead of sharing one with every quality term.
2. **Budget rollover**: whenever a stage proves `OPTIMAL` strictly before its own allotted budget
   expires, or is skipped entirely as empty, the unused remainder rolls forward into the NEXT stage's
   budget rather than sitting idle. `_stage_time_budgets`'s fixed fractions are now a starting
   allocation, not a hard ceiling.
3. `Config.stage_split` default changed from `(0.15, 0.15, 0.7)` (3 stages) to `(0.15, 0.15, 0.5, 0.2)`
   (4 stages). **Measured pitfall, corrected before shipping**: an initial attempt shrank stages 1-2's
   share to 5%/5%, on the (wrong, at this scale) assumption that they're "always already optimal, just
   need a quick confirm" — at 5% of a 30s budget (1.5s), stage 1 came back `UNKNOWN` (genuinely out of
   time) on the real block, which the pre-existing "never fall to pass 2 when the hint is feasible"
   fallback (correctly, for a real timeout) treats as "stop here, report the hint's own schedule" —
   abandoning stages 2-4 entirely and producing a result byte-identical to local at BOTH 30s and 120s,
   an even worse regression than the one being fixed. Stages 1-2 keep the empirically-needed 15%/15%
   floor; the remaining 70% now splits 50/20 between coverage and quality (was 70% combined, no
   internal split).
4. `hint_pin.py`'s existing hard `<=` pins on `targetDeficitCore`/`postNightRest`/`coverageMin` are
   unchanged — still the correctness floor underneath the staged solve's own search, not a substitute
   for it (see that module's updated docstring).

No change to `betterQuality`, `SCORE_WEIGHTS`, or the quality vector shape. No `ResidentScheduler.jsx`
change (the task allowed an optional JS-side "deep solve" time-budget knob only if trivially small;
skipped to avoid touching a file another agent was concurrently editing, and because the production
30s default already benefits substantially from this fix alone).

**Measured before/after** (production pipeline, same real block, `pickEngineResult`'s shipped result):

| | coverageMiss | quality vector | errorCount | ships |
|---|---|---|---|---|
| local (no solver) | 23 | [23,0,0,1204.97] | 2 | n/a |
| BEFORE @30s | 20 | [20,0,0,1198.57] | 2 | solver |
| BEFORE @120s | 23 (regressed) | [23,0,0,1204.97] | 2 | local (tie) |
| AFTER @30s | 17 | [17,0,0,1182.11] | 2 | solver |
| AFTER @120s | 9 | [9,0,0,1129.36] | 1 | solver |
| proven bound | 1 | [1,0,8,1291.90]\* | 2 | n/a |

\* the bound-probe's coverageMiss=1 schedule needs `postNightRest = 3` (n2) to get there, which the
staged solve's hard hint-pins forbid (pinned `<= 0`, the hint's own achieved value) — since
`postNightRest` outranks `coverageMiss` in the real ladder, that schedule is not actually BETTER under
`betterQuality`, so this residual gap is not closed by (nor is it a target of) this fix. More time
within the now-corrected 4-stage ladder continues to help (30s -> 120s: 17 -> 9), so the gap is a
search-budget one, not a structural ceiling.

**Tests**: `solver-service`'s `pytest` suite (185 passed, 4 pre-existing unrelated collection failures
— missing `jwt` package in this environment, confirmed pre-existing), including 3 new tests for the
changed staging behavior: a later stage's hint carry now fires 3 times (errors->blocking,
blocking->rank, rank->quality, proving the split actually runs as 2 solves not 1), budget rollover
measurably grows a later stage's actual `max_time_in_seconds` when an earlier one finishes early, and
a wrong-length `stageSplit` degrades to the (now 4-entry) default. No JS tests run — no JS files
changed by this fix.

## Grand Rounds rest/streak semantics rewrite (2026-10-15, chief decision)

Two related but separate rule changes, both effective immediately on both engines:

1. **Rest between shifts never reads Grand Rounds any more.** The old "GR-end adjustment" (rest
   measured from GR's own end instead of a shift's own end, when GR fell on the shift's end date) is
   REMOVED from `checkRestViolations`/`validateAll` (`ResidentScheduler.jsx`) and from
   `rest.py`/`validate.py`'s `_effective_earlier_end_min` (both simplified to call
   `timing.shift_end_min`/`shiftEndMs` directly — see those modules' own updated docstrings). Chief's
   own words: "the only shifts that count towards time off before/after a shift ... are the actual
   clinical shifts that we are scheduling for." Grand Rounds' own hours still count toward the ACGME
   weekly-hour caps (`weekly_hours.py`, via `obligationHours` — unaffected by this point).
2. **Grand Rounds' own per-date hour contribution now depends on what was worked the calendar day
   immediately before GR** (still only for the weekly-hour-cap total, point 1 above is unaffected):
   an eve-type shift the day before -> 2h (10:00-`GR_END_H`); a night-type shift ending that morning
   -> 2h (`GR_START_H`-10:00); anything else (day shift, or nothing) -> the original 4h
   (`GR_START_H`-`GR_END_H`). New `src/lib/acgmeHours.js` export `grWindowFor(resident, grDs,
   prevShiftId)`; `grHoursOn` grew a 4th `prevShiftId` param. Resolved entirely JS-side into
   `obligationHours` before the payload ships — `weekly_hours.py` is unchanged, it only ever consumed
   the already-resolved hour number.
3. **The 6-consecutive-work-day streak (ACGME 1-in-7) now counts CLINICAL SHIFTS ONLY** — a GR
   weekday or JC presenting date with no shift assigned no longer extends a run (superseding the
   2026-09-27 "GR/JC obligation day counts, with a post-overnight-GR exemption" ruling).
   `ResidentScheduler.jsx`'s `isStreakWorkDay` collapsed to `!!(rs[ds] || prevRs[ds])`. JC/1-in-7
   "obligation day" bookkeeping (`obligations`/`obligationsExemptAfterNight`/
   `priorTailObligations`/`obligationKind`) is now dead weight on the JS side and was deleted there;
   `workday_limits.py` needed NO code change (see the field-removal bullets above) since an
   absent/empty `obligations` map already made its `_obligation_term` mechanism a pure no-op.

**Payload fields removed** (sent by nothing, consumed by nothing, still accepted/defaulted by
`payload.py` for back-compat): `residents[].grDates`, `grEndH`, `obligations`,
`obligationsExemptAfterNight`, `residents[].priorTailObligations`.

**Solver-side code touched**: `solver/model/rest.py` (`_effective_earlier_end_min` deleted, inlined to
`timing.shift_end_min`), `solver/validate.py` (same simplification, its own independent
re-implementation). `solver/model/workday_limits.py`/`solver/io/payload.py` untouched — already
no-ops under the new empty payload fields (see that module's updated docstring). `timing.py`'s
`shift_end_date`/`hour_mark_min` helpers are now unused by anything in-tree but kept as general
utilities.

**Tests**: `solver-service` pytest (185 passed, same 4 pre-existing `jwt`-import collection errors as
every other run in this doc). `test_rest.py`'s old GR-end-adjustment-fires test was rewritten to prove
the opposite (grDates present no longer changes the outcome — FEASIBLE either way); its sibling
"inert without grDates" test is unchanged (same assertion, now true unconditionally).
`SOLVER_PARITY=1 npx vitest run src/lib/solverParity.test.js` passed (real CP-SAT subprocess vs JS
`validateAll`, zero structural errors) against a fresh `--system-site-packages` `.venv` created in this
worktree (none existed here before). JS-side: `acgmeHours.test.js` (`grWindowFor`/`grHoursOn`,
replacing the deleted `effectiveShiftEndMs` suite), `grRestRules.test.js` (`isStreakWorkDay`
re-written for clinical-shifts-only semantics; new `validateAll`-level rest and streak tests
reproducing the originally-reported false-positive and proving a shift-less GR/JC date no longer
bridges two runs into one), `cellViolationsAdditions.test.js` (one test's expectation flipped from
blocked to legal), `solverPayload.test.js` (obligation-field tests rewritten to assert the now-always-
empty/absent shape).

**Known downstream effect, not a bug**: relaxing the streak rule widens `candidatePool`'s hard
`sixDayRunRestBlocked`/run-length filter (`cachedRunLengthIfWorked`) on and around every GR/JC date,
which measurably shifted `generateScheduleBest`'s own search output on several exact-number
regression tests that encode empirically-observed-before-this-change generator behavior:
`chiefBenchmark.test.js` (isolated single-night runs: 28 vs. a chief-benchmark+slack ceiling of 24),
`nightContiguity.test.js` (understaffed variant's 2-segment-night-residents ceiling: 11 vs. 7),
`podPgy2Substitute.test.js` (two tests whose hand-built setup assumed a specific fallback
resident/seed outcome that a wider candidate pool no longer reproduces), and the
`generator.baseline.conferenceBlock.test.js` quality baseline (errors: 10 vs. committed baseline 9,
+1 — all other three variants' baselines unaffected). None of these were adjusted here — they are
empirical thresholds, not independent correctness checks, and re-measuring/updating them is a call for
whoever owns the chief-facing quality bar, not this change.

## Default `maxTimeSeconds` raised 30s -> 60s; Deep Solve stays 120s; stage split unchanged (2026-10-16)

Closes the question left open by "Real-block coverage gap fix" (2026-10-15, just above): that fix
measured 30s already shipping a solver win (coverageMiss 23 -> 17), but subsequent work the same day
(the night-fragment term, this doc's "Night-stint contiguity gap closed") re-measured the SAME
default-config pipeline TYING local (21/21 identical) rather than beating it -- CP-SAT's own
documented multi-worker run-to-run nondeterminism, not a regression in either fix. Task: find the
smallest default budget that *reliably* beats local on the real production block (58 residents,
2026-09-21..10-18), and decide whether the budget split across the 4 staged-solve stages should
change for short budgets.

**Method**: fresh `buildSolverPayload` (current code, current rules), production pipeline
(local-first -> solver-polish -> `pickEngineResult`), 2 solver runs per budget at
`maxTimeSeconds` in {30, 45, 60, 90, 120}, `numWorkers` left UNSET (production default:
`os.cpu_count()`) -- never pinned, since the whole point is measuring what a real request would get.
Scored with the real JS `validateAll`/`computeQualityMetrics`/`computeQualityVector` pipeline, same
methodology as this doc's other real-block sections. Measured on a 16-core dev box; the deployed
solver (`fly.toml`: `cpu_kind = "shared"`, `cpus = 2`) has far less parallelism, so **these numbers
are optimistic for the deployed service** -- see the worker-count finding below for how much that
appears to matter, and the recommendation was chosen with that gap in mind, not by taking the local
minimum at face value.

**Headline (two runs per budget, `ships` = `pickEngineResult`'s outcome against the same
deterministic local result)**:

| budget | run 1 coverageMiss (ships) | run 2 coverageMiss (ships) | reliable win? |
|---|---|---|---|
| local (no solver) | 21 | 21 | n/a |
| 30s | 14 (SOLVER) | 21 (local, TIE) | **no** -- 1 win, 1 tie |
| 45s | 10 (SOLVER) | 15 (SOLVER) | yes |
| 60s | 11 (SOLVER) | 7 (SOLVER) | yes |
| 90s | 8 (SOLVER) | 9 (SOLVER) | yes |
| 120s | 5 (SOLVER) | 9 (SOLVER) | yes |

(`warnCount`/quality-vector moved in lockstep with `coverageMiss` on every run; `errorCount` stayed 0
throughout. Isolated-night-run and 2-night-segment counts also improved with budget, consistent with
the night-fragment term's own prior measurements.)

**30s is the one budget that isn't reliable** -- it ties as often as it wins, exactly reproducing the
tie this doc's own night-fragment section measured. 45s was the smallest budget that won on both runs.

**Worker-count finding (why the default is 60s, not the bare-minimum 45s)**: a supplementary check
re-ran the solver directly (bypassing the full JS pipeline, using the solver's own
`report.unfilled`/`report.underTarget` as a coverage-shortfall proxy -- a different metric from
`coverageMiss` above, not directly comparable in magnitude, but fine for a same-units before/after
comparison) at `numWorkers: 2` (approximating the Fly machine's 2 shared CPUs) across the same 5
budgets:

| budget | numWorkers=2 proxy (`unfilled`) | wall used | production-numWorkers proxy (`unfilled`) | wall used |
|---|---|---|---|---|
| 30s | 15 | 8s (way under budget) | 15 | 9s (way under budget) |
| 45s | 15 | 10s | -- | -- |
| 60s | 15 | 15s | 6 | 66s (full budget) |
| 90s | 15 | 17s | -- | -- |
| 120s | 15 | 22s | 7 | 126s (full budget) |

With only 2 workers, the solve plateaus at an IDENTICAL result from 30s all the way to 120s, finishing
in well under its own budget every time -- more wall-clock time literally bought nothing once
parallelism was the bottleneck. With production worker count, the SAME plateau-at-30s behavior shows
up (also finishes in ~9s, also a mediocre result), but 60s unlocks a qualitatively better plateau and
visibly spends its whole budget getting there. The "elbow" where extra budget starts being
substantively used -- not just a quick, cheap, mediocre plateau -- sits at 60s even on fast hardware;
on a 2-shared-CPU box that elbow is not guaranteed to be any earlier, and the measurement above shows
it can be a LOT later (this block never found it inside 120s at `numWorkers:2`). 60s is chosen over
the bare-measured-minimum 45s specifically as margin against this gap, while staying a reasonable
background-task wait.

**Stage-split experiment (cheap, as asked; not adopted)**: tried shifting share from `TIER_QUALITY`
(the last stage) to `TIER_RANK` (coverage) at short budgets -- `altA = (0.15, 0.15, 0.6, 0.1)` and
`altB = (0.15, 0.15, 0.65, 0.05)`, vs. default `(0.15, 0.15, 0.5, 0.2)` -- one run each (proxy metric,
same caveat as above) at 30s/60s/120s. Results were inconsistent and in one case badly regressed:
`altB` at 60s finished in 13s of its 60s budget at `unfilled=15` (vs. default's 66s/`unfilled=6`) --
the mechanism is structural, not noise: `_solve_staged`'s budget-rollover only ever flows FORWARD
into a *later* stage; the LAST stage has nowhere to roll its own early finish into, so shrinking its
share risks the whole solve reaching `OPTIMAL` on a nearly-empty final objective and quitting with
most of the budget simply unspent. `altB`'s 5% share hits this every time it gets unlucky; `altA`'s
10% was less catastrophic but still net-worse at every budget tested. Per the task's own bar ("only
adopt if strictly better at short budgets AND not worse at 120") neither candidate clears it, and this
failure mode is itself a reason to prefer the existing split's bigger last-stage floor, not just an
artifact of too few runs. **Stage split is unchanged.**

**Decision**:
- `buildSolverPayload`'s default `config.maxTimeSeconds`: 30 -> 60 (new exported
  `DEFAULT_SOLVE_MAX_TIME_SECONDS`, `ResidentScheduler.jsx`).
- Deep Solve stays at 120s (`DEEP_SOLVE_MAX_TIME_SECONDS`, unchanged) -- the data shows no further
  reliable gain past ~90-120s even locally (production-numWorkers proxy: `unfilled` 6 at 60s, 7 at
  120s -- within noise, not a monotonic further win), so there's no basis for spending more of the
  admin's wait time pushing it toward the 180s ceiling this task allowed. Re-confirmed no server-side
  cap exists on `config.maxTimeSeconds` below 180 (`api/schemas.py`'s `ConfigModel.maxTimeSeconds:
  float = 30` has no `le=`; `solver/io/payload.py`'s `Config.max_time_seconds` likewise; the only
  hardcoded ceilings anywhere are `hint_pin.py`'s unrelated 30s hint-feasibility pre-check and
  `report/builder.py`'s unrelated 10s verification-resolve step, neither touching the main staged
  solve) -- same finding as 2026-10-15/-16, re-checked rather than assumed stale.
- `solveRemote`'s client-side timeout: both the default and Deep Solve paths now pass an EXPLICIT
  `timeoutMs` (budget*1000 + 60000 cold-start/network margin) -- previously only Deep Solve did this;
  the default path relied on `solveRemote`'s own 120000ms fallback default, which only happened to
  cover a 30s budget by coincidence and would have silently stopped being safe the moment either
  number changed again.
- Progress-overlay copy ("Optimizing schedule -- up to ~Ns...") and the Deep Solve button's tooltip
  ("...instead of ~Ns...") now read the new 60s number instead of the old 30s.
- `src/lib/solverPayload.test.js`'s default-budget assertion updated 30 -> 60
  (`DEFAULT_SOLVE_MAX_TIME_SECONDS` pinned alongside `DEEP_SOLVE_MAX_TIME_SECONDS`, same
  drift-guard rationale).

**Caveat repeated for emphasis**: every number in this section was measured on a 16-core dev
workstation. The deployed solver runs on 2 shared Fly CPUs. The worker-count experiment above is the
best available proxy for that gap (not a true reproduction -- CPU speed/contention on a shared Fly vm
differs too), and it shows the gap can be severe (complete plateau, no improvement from 30s to 120s at
`numWorkers:2` on this exact block). The 60s default was chosen conservatively with this in mind; it
is not a claim that 60s reliably beats local on the actual Fly deployment, which this task could not
directly measure.

No `solver-service` Python files changed by this task (JS-only: default budget, timeout wiring,
progress copy, one test file). `solver-service` pytest: 191 passed, 4 pre-existing unrelated
collection failures (missing `jwt` package in this environment, confirmed pre-existing and unchanged
by this task). `npm test`: 1442 passed, 4 skipped (SOLVER_PARITY-gated, need Python), same as before
this task. `npm run build`: clean.


## Seed portfolio `config.portfolio` + doc refresh (2026-10-18)

### Why
On the real 58-resident block the coverage gap is search-budget/luck limited (30s -> 120s took
coverageMiss 17 -> 9, proven bound 1) and multi-worker CP-SAT is nondeterministic run-to-run.
Independent restarts with different seeds, keeping the best, are a cheap hedge.

### Field
- `config.portfolio` (int, default `1`, clamped to `1..8` in `solver/io/payload.py`; declared on
  `api/schemas.py`'s `ConfigModel`). `1` is exactly the old single-solve path (`_solve_single`; no
  `report.portfolio` key). `K > 1` runs `_solve_portfolio` in `solver/solve.py`.
- `solve()` is the only entry (used by `/solve`, `/jobs`, Modal's `solve_raw`), so every route
  honours it.

### Behavior
- K full, independent solves of the same payload: same hint, hint pinning, staged ladder and pass-2
  fallback, with `randomSeed + i` for run `i`. Runs are threads in the calling process (OR-Tools
  releases the GIL). Total workers `W = _num_workers(payload)`; `concurrent = min(K, W)`; each run
  gets `max(1, W // concurrent)` workers and the FULL `maxTimeSeconds`. If `K > W`, runs go in
  batches of `concurrent` (wall time = batches x budget).
- **The trade**: each run searches with fewer workers (e.g. 8 workers, K=4 -> 2 workers each), so a
  single run is weaker than the one K=1 run that owns every core. The portfolio wins only when
  seed luck dominates worker count; on instances where raw parallelism matters it can LOSE (see
  measurement below). Wall time stays ~ one budget (plus ~1-2 s of model-build overhead), memory is
  ~K models.
- Winner = lexicographic min of the per-run tier values `(tier1_errors, tier2_blockingWarns,
  tier3_qualityRank, tier4_quality)`, the same ladder the staged objective optimizes (values are
  `solver.value(objective.stage_exprs[tier])` of the final solution, now exposed as
  `SolveResult.tiers`). Strict results beat `RELAXED` (compared by objective), which beat
  `INFEASIBLE`. Ties go to the lowest run index. `SolveResult.seed` is the winner's seed.
- Report (additive; `mapSolverResult` copies only named report keys, like `hintPinning`):
  `report.portfolio = {k, winnerIndex, perRun: [{seed, status, tiers, wallSeconds}]}`. A run that
  raised is listed with `status: "ERROR"`, `tiers: null`; if all runs raise, the first error
  propagates.
- **Cancel**: a `_PortfolioStopper` is appended to the calling thread's stoppable-run list, so the
  existing job cancel (`stop_search()` on the list's last entry) stops the most recent solver of
  every run and prevents further batches/runs from starting. `cancel_event` is also passed to each
  run. Progress (`on_progress`) reports run 0 only.
- **Modal**: portfolio threads run inside the existing `solve_fn` container (no extra
  `Function.spawn`); `SOLVER_NUM_WORKERS` is the `W` that gets split. Memory is K models in one 8 GiB
  container.

### Measurement (noisy: other JS test suites were running on the machine)
Synthetic 24-resident, 28-day, 5-shift understaffed fixture, 8 CPUs, `maxTimeSeconds: 20`,
`numWorkers: 8`: K=1 wall 21.3 s tiers `[30000, 0, 0, 200]`; K=4 (2 workers each) wall 23.1 s,
winner `[190000, 0, 0, 2845]` (runs ranged 190000-320000 on tier 1). Here the split hurt; this
fixture is not the real block, so treat it as evidence that the portfolio is not a free win, not as
a verdict on the 58-resident case. Measure on the real block before changing any client default.

### Stale text corrected (as of 2026-10-18)
- Client default budget is **120 s**, Deep Solve **300 s** (the 30 s / 60 s / 120 s figures in
  the dated sections above are historical). A parallel client change makes durable (Modal) and
  local ("This computer") targets default to **300 s** as well.
- Fly VM is **4 performance CPUs / 8 GB** (`fly.toml`), not the "2 shared CPUs" quoted above.
- `api/schemas.py`'s request models use `extra="allow"` (`_RequestModel`), so undeclared payload
  fields are NOT dropped any more; the "`SolveRequest` ... `extra="ignore"` ... silently dropped"
  passage in "Two engine gaps closed" describes the old behavior. `payload.py` remains the real
  typed parse.
