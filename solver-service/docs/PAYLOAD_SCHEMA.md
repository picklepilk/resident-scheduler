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
