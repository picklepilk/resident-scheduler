# Graph Report - resident-scheduler  (2026-09-06)

## Corpus Check
- 184 files · ~282,052 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1695 nodes · 4790 edges · 98 communities (64 shown, 17 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 204 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c0d95e4d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- dependencies
- blockLookup.js
- coverage.js
- formatDisplayDate
- parseDate
- ScheduleGrid
- validateAll
- Resident Day-Off Request Implementation Plan
- vitest
- ShiftMatrixTab
- parse.js
- RulesTab
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- dates.js
- validate.py
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- repairPass
- parseVacationWorkbook
- devDependencies
- parse_payload
- test_trauma_runs.py
- make_resident
- useMonthPager
- Payload
- updateBlock
- rollingWindowHours.test.js
- overrideCapture.test.js
- Cloud Sync (Supabase)
- baselineSuite.js
- scoreWeights.test.js
- Circadian Scheduling Rules
- Field-Ready Design System
- generateSchedule
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- builder.py
- SidebarNav
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- qgendaImport.js
- handleSubmit
- FeedbackAdminTab
- test_weight_tiering.py
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- normalizeImportLog
- chiefBenchmark.test.js
- SKILL.md
- package.json
- Caveman Terse-Response Mode (Cline rule)
- Caveman Terse-Response Mode (Copilot rule)
- Caveman Terse-Response Mode (OpenCode rule)
- Caveman Terse-Response Mode (Windsurf rule)
- solve.py
- Dark Mode
- Dashboard/Home Merge
- PDF Export (jspdf-autotable)
- QGenda CSV Export Rework
- Soft Rule Priority
- What's New Banner
- migrate_admin_email_allowlist.sql
- CLAUDE.md
- AppGate.jsx
- getBlockDates
- test_em_composition.py
- shifts.js
- RequestsTab.jsx
- Solver performance investigation (2026-08-22)
- add_soft_sequence_constraint
- main.jsx
- JeopardySickCallsCard
- JeopardyTab
- runOptimizationSweep
- solverClient.js
- LitPool

## God Nodes (most connected - your core abstractions)
1. `Payload` - 119 edges
2. `parseDate()` - 99 edges
3. `parse_payload()` - 85 edges
4. `validateAll()` - 74 edges
5. `VarStore` - 72 edges
6. `make_resident()` - 71 edges
7. `toDateStr()` - 56 edges
8. `ResidentScheduler()` - 53 edges
9. `vitest` - 51 edges
10. `TermGroup` - 49 edges

## Surprising Connections (you probably didn't know these)
- `Pre-Generation Readiness Gate` --references--> `checkGenerateReadiness()`  [EXTRACTED]
  CLAUDE.md → src/ResidentScheduler.jsx
- `Generator Quality Harness (best-of-N + repair)` --references--> `generateScheduleBest()`  [EXTRACTED]
  CLAUDE.md → src/ResidentScheduler.jsx
- `Override Capture Loop` --references--> `withOverrideEvents()`  [EXTRACTED]
  CLAUDE.md → src/ResidentScheduler.jsx
- `AY-to-Date Fairness Carryover` --references--> `computeQualityMetrics()`  [EXTRACTED]
  CLAUDE.md → src/lib/scheduleQuality.js
- `Work-Shape Scoring` --references--> `computeQualityMetrics()`  [EXTRACTED]
  CLAUDE.md → src/lib/scheduleQuality.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **PWA Icon Set** — public_icons_icon_512_asset, public_icons_icon_192_asset, public_icons_apple_touch_icon_asset [INFERRED 0.75]
- **End-to-end day-off request flow: resident submission through chief approval into the schedule** — docs_superpowers_plans_2026_07_18_resident_day_off_requests_task7_request_form, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task10_approval_queue, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task11_pending_badge [INFERRED 0.85]
- **Feedback capture-to-triage pipeline: widget/crash capture write, admin function/tab read** — docs_superpowers_plans_2026_07_18_user_feedback_plan_task1_schema_helper, docs_superpowers_plans_2026_07_18_user_feedback_plan_task2_widget, docs_superpowers_plans_2026_07_18_user_feedback_plan_task3_crash_capture, docs_superpowers_plans_2026_07_18_user_feedback_plan_task4_admin_function, docs_superpowers_plans_2026_07_18_user_feedback_plan_task5_admin_tab [INFERRED 0.85]
- **Generator Quality Improvement Program** — claude_md_score_weights_audit, claude_md_work_shape_scoring, claude_md_ay_carryover, claude_md_override_capture [INFERRED 0.85]

## Communities (98 total, 17 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (105): RFC-4180, RFC-5545, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS, BLOCK_TYPE_MAP (+97 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.09
Nodes (39): buildSnapData(), makeDefaultBlock(), ResidentScheduler(), blockReset(), deleteBlockSnapshot(), deleteCurrentBlock(), deleteDemo(), doLoadBlock() (+31 more)

### Community 2 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, qrcode (+4 more)

### Community 3 - "blockLookup.js"
Cohesion: 0.16
Nodes (15): lucide-react, blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState(), findBlockForDate(), groupByBlock(), weeksUntil() (+7 more)

### Community 4 - "coverage.js"
Cohesion: 0.13
Nodes (25): applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, DOW_COVERAGE_OVERRIDE (+17 more)

### Community 5 - "formatDisplayDate"
Cohesion: 0.08
Nodes (35): jspdf, jspdf-autotable, AvailabilityRangesEditor(), BlockCalendarRow(), BlockMonthGrid(), buildResidentICS(), computeCoverageByDate(), CoverageByAreaView() (+27 more)

### Community 6 - "parseDate"
Cohesion: 0.14
Nodes (29): addDays(), parseDate(), toDateStr(), nightRun(), papaBare, runValidate(), sixDayRun(), nightRunsFor() (+21 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.15
Nodes (25): checkGenerateReadiness(), effectiveChiefRole(), updateBlockTracked(), ScheduleGrid(), applySweepCandidate(), assign(), cancelHover(), commitDrop() (+17 more)

### Community 8 - "validateAll"
Cohesion: 0.11
Nodes (34): papaFixture(), runValidate(), CTX, elig(), isNightShiftId(), blockDayIndex(), buildStaticGenContext(), cellViolations() (+26 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "vitest"
Cohesion: 0.08
Nodes (32): vitest, acepFixture(), PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService(), pgyGateWarnings() (+24 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.13
Nodes (32): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+24 more)

### Community 12 - "parse.js"
Cohesion: 0.13
Nodes (25): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), normalizeToken(), parseDateRangeInAY(), parseRosterText() (+17 more)

### Community 13 - "RulesTab"
Cohesion: 0.12
Nodes (15): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+7 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.09
Nodes (27): GRID_GROUP_MODE_DEFAULT, GRID_GROUP_MODES, groupResidents(), PGY_GROUPS, pushNonEmpty(), ROTATION_EM_STYLE, BLOCK_TYPES, ROSTER (+19 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.16
Nodes (16): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+8 more)

### Community 16 - "dates.js"
Cohesion: 0.12
Nodes (22): ayWindowFor(), formatAY(), getAcademicYear(), getAcademicYearFor(), getBlockWeekends(), qgendaDate(), applyDateRangePaint(), paintActionFor() (+14 more)

### Community 17 - "validate.py"
Cohesion: 0.07
Nodes (54): date, _parse_shifts(), date_diff_days(), gap_between(), _ordinal_minutes(), overlaps_hour_window(), parse_date(), The ONLY cross-midnight math in the solver. Every constraint family that needs… (+46 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (21): auth, auth.users, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests, day_off_requests_cancel_guard (+13 more)

### Community 19 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 20 - "repairPass"
Cohesion: 0.33
Nodes (18): compositionSatisfies(), hasSenior(), repairPass(), assignCell(), backfillVacated(), chainUnfilledSlot(), compositionStillSatisfied(), filledCount() (+10 more)

### Community 21 - "parseVacationWorkbook"
Cohesion: 0.17
Nodes (16): xlsx, matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), extractVacationDateCells(), findVacationSections() (+8 more)

### Community 22 - "devDependencies"
Cohesion: 0.25
Nodes (8): devDependencies, autoprefixer, jsdom, postcss, tailwindcss, vite, @vitejs/plugin-react, vitest

### Community 23 - "parse_payload"
Cohesion: 0.08
Nodes (58): post, solve_endpoint(), main(), CLI entry point for the solver, independent of the FastAPI service. python…, AyPrior, Block, Config, CoverageEntry (+50 more)

### Community 24 - "test_trauma_runs.py"
Cohesion: 0.07
Nodes (71): _add_isolated_night_term(), _add_trauma_run_batch2_terms(), Flat accumulator for one weighted-term family. Replaces the old `Tier` class,…, Batch 2's night-run-shape relaxation (plan section B): runs of 2-6 nights are…, TermGroup, add_night_duration_alternation_terms(), add_peds_intern_night_deficit_term(), add_second_rest_day_terms() (+63 more)

### Community 25 - "make_resident"
Cohesion: 0.11
Nodes (48): add_coverage_constraints(), `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, add_rest_constraints(), build_variables(), make_payload(), make_resident(), _build(), test_day_then_eve_next_day_forbidden() (+40 more)

### Community 26 - "useMonthPager"
Cohesion: 0.28
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), containers, Harness(), mountPager(), Harness() (+2 more)

### Community 27 - "Payload"
Cohesion: 0.06
Nodes (85): build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, Payload, Resident, add_circadian_constraints(), _add_eve_day_pairs(), _add_night_cap() (+77 more)

### Community 28 - "updateBlock"
Cohesion: 0.17
Nodes (16): DashboardTab(), onStartDateChange(), setBlockField(), updSD(), EMResidentsTab(), removeRes(), setBA(), target() (+8 more)

### Community 29 - "rollingWindowHours.test.js"
Cohesion: 0.40
Nodes (5): maxRollingWindowHoursFor(), ROLLING_WINDOW_CAP_H, ROLLING_WINDOW_MS, timedAssignmentsFor(), weeklyHourStats()

### Community 30 - "overrideCapture.test.js"
Cohesion: 0.22
Nodes (7): REPORT, diffScheduleCells(), offReasonText(), offRequestEntryFor(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "baselineSuite.js"
Cohesion: 0.09
Nodes (33): baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname, errorCount(), loadBaseline(), makeBaselineSuite() (+25 more)

### Community 33 - "scoreWeights.test.js"
Cohesion: 0.40
Nodes (5): bandOf(), groupBand(), preferenceKeys, structuralKeys, SCORE_TIERS

### Community 34 - "Circadian Scheduling Rules"
Cohesion: 0.40
Nodes (5): Circadian Scheduling Rules, Grand Rounds Lecture Day-Before Rule, Chief-Editable Journal Club Dates, Journal Club Rules, PED-N Split Into Two Shift IDs

### Community 35 - "Field-Ready Design System"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 36 - "generateSchedule"
Cohesion: 0.13
Nodes (30): getCoverageFor(), shiftActiveOnDow(), shiftOverlapsJC(), buildSolverPayload(), computeTotalCoverageSupply(), computeTotalTargetDemand(), countCurrentBlockJC(), countPublishedJC() (+22 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "builder.py"
Cohesion: 0.07
Nodes (39): BaseModel, get, health(), FastAPI app: POST /solve, GET /health. Kept deliberately thin -- request…, AyPriorModel, BlockModel, CapsModel, ConfigModel (+31 more)

### Community 40 - "SidebarNav"
Cohesion: 0.33
Nodes (7): CollapsibleCard(), reconcileTabOrder(), reorderIds(), SidebarNav(), renderTabButton(), resetDrag(), useUiPrefsContext()

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "qgendaImport.js"
Cohesion: 0.14
Nodes (24): QGENDA_NAME_FORMATS, QGENDA_TASKS, QGENDA_VARIANTS, qgendaName(), qgendaTaskFor(), buildQGendaImport(), buildScheduleFromImport(), cell() (+16 more)

### Community 45 - "handleSubmit"
Cohesion: 1.00
Nodes (3): FeedbackWidget(), handleSubmit(), reset()

### Community 46 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 47 - "test_weight_tiering.py"
Cohesion: 0.11
Nodes (26): apply_rule_priority(), load_default_weights(), merged_weights(), _priority_order(), Static config, read once per process rather than per solve. Cached safely…, Relative order of the two objective-relevant rulePriority entries, ignoring…, Returns a copy of `weights` with the lower-ranked of coverageMin/ postNightRest…, _anti_fill_sum() (+18 more)

### Community 52 - "normalizeImportLog"
Cohesion: 0.14
Nodes (22): appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), AddResidentModal(), AYConferenceEditor(), BlockCalendarSection(), BlockContextBar(), ImportHistoryPanel() (+14 more)

### Community 53 - "chiefBenchmark.test.js"
Cohesion: 0.12
Nodes (10): buildAllResidents(), __dirname, nightRunsFor(), PYTHON, REPO_ROOT, SOLVER_DIR, buildAllResidents(), nightRunsFor() (+2 more)

### Community 58 - "package.json"
Cohesion: 0.09
Nodes (22): name, private, scripts, build, dev, preview, test, type (+14 more)

### Community 63 - "solve.py"
Cohesion: 0.16
Nodes (21): CpSolver, build_feasibility_report(), build_violations(), _coverage_violations(), Recomputed directly from the concrete schedule vs. `payload.coverage` -- works…, _assert_relaxed_matches_validation(), _build_report(), _build_report_relaxed() (+13 more)

### Community 71 - "migrate_admin_email_allowlist.sql"
Cohesion: 0.47
Nodes (5): admin_email_allowlist, profiles_admin_allowlist_promote, public.apply_admin_allowlist(), public.current_user_is_allowlisted_admin(), public.apply_admin_allowlist

### Community 84 - "AppGate.jsx"
Cohesion: 0.15
Nodes (12): react, SetNewPassword(), fetchRosterForPicker(), LoginScreen(), MODES, ResidentPicker(), ALLOWED_EMAIL_DOMAIN, AUTH_ENABLED (+4 more)

### Community 86 - "getBlockDates"
Cohesion: 0.11
Nodes (26): coverageFillStats(), twelveHourStateFor(), getBlockDates(), makeSnapshot(), nightSpreadFor(), VARIANTS, AREA_CONCENTRATION_FLOOR, assignedCount() (+18 more)

### Community 87 - "test_em_composition.py"
Cohesion: 0.25
Nodes (19): add_em_composition_terms(), add_pgy_fallback_terms(), podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, _build(), _cost_of(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, Solves for the MINIMUM of the given weighted terms, not just any feasible value… (+11 more)

### Community 88 - "shifts.js"
Cohesion: 0.18
Nodes (20): AREA_COLORS, formatGapH(), gapIsShort(), JC_WINDOW_END_H, JC_WINDOW_START_H, overlappingAssignments(), NOTE: AREA_COLORS is not in the original extraction spec's const list, but…, SHIFT_AREAS (+12 more)

### Community 89 - "RequestsTab.jsx"
Cohesion: 0.20
Nodes (12): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestPortalCard() (+4 more)

### Community 91 - "Solver performance investigation (2026-08-22)"
Cohesion: 0.17
Nodes (11): 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), 2. Per-module size contribution (isolated measurement), 3. The fix, 4. Correctness guardrail, 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Environment, Files touched (+3 more)

### Community 92 - "add_soft_sequence_constraint"
Cohesion: 0.29
Nodes (10): add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges(), test_run_at_or_above_soft_min_costs_nothing() (+2 more)

### Community 95 - "main.jsx"
Cohesion: 0.21
Nodes (7): AppGate(), crashKey(), ErrorBoundary, reportCrash(), ResidentRequestsApp(), submitFeedback(), SUPABASE_ENABLED

### Community 96 - "JeopardySickCallsCard"
Cohesion: 0.36
Nodes (5): computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), JeopardySickCallsCard(), addIncident()

### Community 97 - "JeopardyTab"
Cohesion: 0.27
Nodes (7): DATES6, dateInRanges(), fillJeopardy(), jeopardyCandidatesFor(), JeopardyTab(), runFill(), setCell()

### Community 99 - "runOptimizationSweep"
Cohesion: 0.36
Nodes (9): buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates(), compareVectors(), runOptimizationSweep() (+1 more)

### Community 101 - "solverClient.js"
Cohesion: 0.39
Nodes (6): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, solveRemote(), freshModule()

### Community 109 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

## Knowledge Gaps
- **181 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+176 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 507 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Payload` connect `Payload` to `builder.py`, `test_weight_tiering.py`, `validate.py`, `parse_payload`, `test_em_composition.py`, `test_trauma_runs.py`, `make_resident`, `solve.py`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `ResidentScheduler()` connect `ResidentScheduler` to `ResidentScheduler.jsx`, `formatDisplayDate`, `ScheduleGrid`, `validateAll`, `ShiftMatrixTab`, `qgendaImport.js`, `AppGate.jsx`, `chiefBenchmark.test.js`, `normalizeImportLog`, `getBlockDates`, `updateBlock`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `vitest` connect `vitest` to `ResidentScheduler.jsx`, `coverage.js`, `parseDate`, `validateAll`, `ShiftMatrixTab`, `parse.js`, `src/uiPrefs.js`, `dates.js`, `parseVacationWorkbook`, `useMonthPager`, `rollingWindowHours.test.js`, `overrideCapture.test.js`, `baselineSuite.js`, `scoreWeights.test.js`, `generateSchedule`, `qgendaImport.js`, `normalizeImportLog`, `chiefBenchmark.test.js`, `package.json`, `getBlockDates`, `shifts.js`, `JeopardySickCallsCard`, `JeopardyTab`, `runOptimizationSweep`, `solverClient.js`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Are the 53 inferred relationships involving `VarStore` (e.g. with `BuildResult` and `add_circadian_constraints()`) actually correct?**
  _`VarStore` has 53 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _181 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.016160984256073402 - nodes in this community are weakly interconnected._