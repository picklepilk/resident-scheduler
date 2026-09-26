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
