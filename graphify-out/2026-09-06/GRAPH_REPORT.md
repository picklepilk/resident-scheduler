# Graph Report - resident-scheduler  (2026-08-27)

## Corpus Check
- 182 files · ~281,937 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1688 nodes · 4703 edges · 113 communities (96 shown, 17 thin omitted)
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
- getEligibleShifts
- Resident Day-Off Request Implementation Plan
- syntheticRoster.js
- ShiftMatrixTab
- parse.js
- RulesTab
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- journalClub.js
- validate.py
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- repairPass
- parseVacationWorkbook
- holidays.js
- parse_payload
- make_resident
- build_variables
- useMonthPager
- Payload
- updateBlock
- SettingsTab
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
- validateAll
- sbFetch
- test_weight_tiering.py
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- normalizeImportLog
- chiefBenchmark.solver.test.js
- vite.config.js
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
- elastic.py
- showToast
- VarStore
- schemas.py
- AppGate.jsx
- scheduleQuality.js
- test_em_composition.py
- shifts.js
- RequestsTab.jsx
- payload.py
- Solver performance investigation (2026-08-22)
- add_soft_sequence_constraint
- test_circadian.py
- main.jsx
- JeopardySickCallsCard
- JeopardyTab
- getBlockDates
- runOptimizationSweep
- workday_limits.py
- solverClient.js
- main.py
- coverageComposition.js
- chiefBenchmark.test.js
- LitPool
- dateSetPaint.test.js
- blockTargetReachability.test.js

## God Nodes (most connected - your core abstractions)
1. `Payload` - 119 edges
2. `parseDate()` - 99 edges
3. `parse_payload()` - 85 edges
4. `validateAll()` - 74 edges
5. `VarStore` - 72 edges
6. `make_resident()` - 71 edges
7. `toDateStr()` - 56 edges
8. `ResidentScheduler()` - 53 edges
9. `TermGroup` - 49 edges
10. `ScheduleGrid()` - 49 edges

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

## Communities (113 total, 17 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (105): RFC-4180, RFC-5545, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS, BLOCK_TYPE_MAP (+97 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.11
Nodes (25): getAcademicYear(), buildSnapData(), makeDefaultBlock(), ResidentScheduler(), blockReset(), deleteCurrentBlock(), doLoadBlock(), doNewBlock() (+17 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (47): autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jsdom, lucide-react, dependencies, @fontsource/barlow (+39 more)

### Community 3 - "blockLookup.js"
Cohesion: 0.17
Nodes (15): blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState(), fetchRosterForPicker(), findBlockForDate(), groupByBlock(), weeksUntil() (+7 more)

### Community 4 - "coverage.js"
Cohesion: 0.22
Nodes (16): AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, DOW_COVERAGE_OVERRIDE, implicitConferenceWindows() (+8 more)

### Community 5 - "formatDisplayDate"
Cohesion: 0.07
Nodes (33): AvailabilityRangesEditor(), AYConferenceEditor(), BlockCalendarRow(), BlockContextBar(), BlockMonthGrid(), computeCoverageByDate(), CoverageByAreaView(), CoverageByDateView() (+25 more)

### Community 6 - "parseDate"
Cohesion: 0.19
Nodes (29): addDays(), ayWindowFor(), getAcademicYearFor(), getBlockWeekends(), parseDate(), qgendaDate(), toDateStr(), nightRun() (+21 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.15
Nodes (23): checkGenerateReadiness(), updateBlockTracked(), ScheduleGrid(), applySweepCandidate(), assign(), cancelHover(), commitDrop(), generateViaSolverOrLocal() (+15 more)

### Community 8 - "getEligibleShifts"
Cohesion: 0.12
Nodes (31): CTX, elig(), shiftGapsFor(), buildResidentICS(), cellViolations(), computeTotalTargetDemand(), demoFilenameSuffix(), effectiveChiefRole() (+23 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "syntheticRoster.js"
Cohesion: 0.08
Nodes (29): acepFixture(), PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService(), pgyGateWarnings(), res() (+21 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.12
Nodes (34): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+26 more)

### Community 12 - "parse.js"
Cohesion: 0.14
Nodes (24): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), normalizeToken(), parseDateRangeInAY(), parseRosterText() (+16 more)

### Community 13 - "RulesTab"
Cohesion: 0.12
Nodes (15): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+7 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.09
Nodes (27): GRID_GROUP_MODE_DEFAULT, GRID_GROUP_MODES, groupResidents(), PGY_GROUPS, pushNonEmpty(), ROTATION_EM_STYLE, BLOCK_TYPES, ROSTER (+19 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.16
Nodes (16): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+8 more)

### Community 16 - "journalClub.js"
Cohesion: 0.20
Nodes (12): getFirstTuesdaysInRange(), isFirstTuesday(), isJcDate(), isJcDateAnyAy(), jcDatesInRange(), resolveJcDates(), sortedDedupedDates(), validStoredList() (+4 more)

### Community 17 - "validate.py"
Cohesion: 0.08
Nodes (54): date, add_days(), date_diff_days(), gap_between(), _ordinal_minutes(), overlaps_hour_window(), parse_date(), The ONLY cross-midnight math in the solver. Every constraint family that needs… (+46 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (21): auth, auth.users, public.apply_admin_allowlist, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests (+13 more)

### Community 19 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 20 - "repairPass"
Cohesion: 0.35
Nodes (17): hasSenior(), repairPass(), assignCell(), backfillVacated(), chainUnfilledSlot(), compositionStillSatisfied(), filledCount(), minFor() (+9 more)

### Community 21 - "parseVacationWorkbook"
Cohesion: 0.24
Nodes (12): matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), extractVacationDateCells(), findVacationSections(), pickFile() (+4 more)

### Community 22 - "holidays.js"
Cohesion: 0.26
Nodes (17): buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy(), holidaysInRange() (+9 more)

### Community 23 - "parse_payload"
Cohesion: 0.18
Nodes (28): parse_payload(), solve(), load_fixture(), schedule_has(), test_build_response_shape_matches_schema(), test_cross_midnight_rest_forces_reassignment(), test_small_feasible_solves_and_meets_coverage_min(), Batch 2: pass-2 elastic relaxation, conflict naming, feasibility report. (+20 more)

### Community 24 - "make_resident"
Cohesion: 0.13
Nodes (43): _add_isolated_night_term(), Flat accumulator for one weighted-term family. Replaces the old `Tier` class,…, Batch 2's night-run-shape relaxation (plan section B): runs of 2-6 nights are…, TermGroup, add_peds_intern_night_deficit_term(), deficit_r = max(0, pedsInternNightTarget - assigned_peds_nights_r) for every…, make_resident(), _build() (+35 more)

### Community 25 - "build_variables"
Cohesion: 0.14
Nodes (29): add_coverage_constraints(), CoverageResult, Rules 24-25: per-(shift, date) staffing minimum/maximum. Max side is always a…, `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, add_rest_constraints(), build_variables(), make_payload(), Shared tiny-payload builders for the model-family unit tests. Not a test module… (+21 more)

### Community 26 - "useMonthPager"
Cohesion: 0.28
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), containers, Harness(), mountPager(), Harness() (+2 more)

### Community 27 - "Payload"
Cohesion: 0.08
Nodes (52): Payload, Resident, add_circadian_constraints(), _add_eve_day_pairs(), _add_night_cap(), _add_night_run_segments(), _add_night_run_window(), _link_night() (+44 more)

### Community 28 - "updateBlock"
Cohesion: 0.17
Nodes (16): DashboardTab(), onStartDateChange(), setBlockField(), updSD(), EMResidentsTab(), removeRes(), setBA(), target() (+8 more)

### Community 29 - "SettingsTab"
Cohesion: 0.22
Nodes (9): blockDayIndex(), getGeneralPedsTarget(), getTraumaCap(), SettingsTab(), exportData(), qgendaDefaultForCompare(), updQgendaTask(), summarizeGenerationReport() (+1 more)

### Community 30 - "overrideCapture.test.js"
Cohesion: 0.29
Nodes (5): REPORT, diffScheduleCells(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "baselineSuite.js"
Cohesion: 0.11
Nodes (17): baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname, errorCount(), loadBaseline(), makeBaselineSuite() (+9 more)

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
Nodes (30): shiftActiveOnDow(), shiftOverlapsJC(), buildSolverPayload(), compositionSatisfies(), computeTotalCoverageSupply(), countCurrentBlockJC(), countPublishedJC(), eligKey() (+22 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "builder.py"
Cohesion: 0.11
Nodes (21): _assigned_count_for_cap(), build_feasibility_report(), build_recommendations(), build_violations(), _cap_recommendation(), _coverage_recommendation(), _coverage_violations(), _duty_recommendation() (+13 more)

### Community 40 - "SidebarNav"
Cohesion: 0.33
Nodes (7): CollapsibleCard(), reconcileTabOrder(), reorderIds(), SidebarNav(), renderTabButton(), resetDrag(), useUiPrefsContext()

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "qgendaImport.js"
Cohesion: 0.17
Nodes (21): QGENDA_TASKS, buildQGendaImport(), buildScheduleFromImport(), cell(), countDayNumbers(), countDowCells(), DOW_INDEX, findDayNumberRow() (+13 more)

### Community 45 - "validateAll"
Cohesion: 0.17
Nodes (19): papaFixture(), runValidate(), isNightShiftId(), overlappingAssignments(), shiftEndMs(), shiftStartMs(), checkCircadianViolations(), countNightsInSchedule() (+11 more)

### Community 46 - "sbFetch"
Cohesion: 0.21
Nodes (12): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), FeedbackWidget(), handleSubmit(), reset(), fetchFeedbackAdmin() (+4 more)

### Community 47 - "test_weight_tiering.py"
Cohesion: 0.11
Nodes (26): apply_rule_priority(), load_default_weights(), merged_weights(), _priority_order(), Static config, read once per process rather than per solve. Cached safely…, Relative order of the two objective-relevant rulePriority entries, ignoring…, Returns a copy of `weights` with the lower-ranked of coverageMin/ postNightRest…, _anti_fill_sum() (+18 more)

### Community 52 - "normalizeImportLog"
Cohesion: 0.19
Nodes (17): formatAY(), appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), AddResidentModal(), ImportHistoryPanel(), deleteEntry(), ImportLecturesModal() (+9 more)

### Community 53 - "chiefBenchmark.solver.test.js"
Cohesion: 0.20
Nodes (8): buildAllResidents(), __dirname, nightRunsFor(), PYTHON, REPO_ROOT, SOLVER_DIR, buildAllResidents(), offServiceWindowTargetDelta()

### Community 63 - "solve.py"
Cohesion: 0.22
Nodes (17): CpSolver, _assert_relaxed_matches_validation(), _build_report(), _build_report_relaxed(), _empty_report(), _extract_schedule(), _num_workers(), Two-pass orchestration. `solve(payload)` runs pass 1 (strict); on INFEASIBLE it… (+9 more)

### Community 80 - "elastic.py"
Cohesion: 0.15
Nodes (22): build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, build_elastic_model(), ElasticBuildResult, Pass-2 relaxation: rebuilds the model FROM SCRATCH (batch 1's pass-1 model,…, add_hours_cap_constraints(), Rule 21: rolling 320h (80h/wk avg over 4 weeks) cap. The payload ships… (+14 more)

### Community 81 - "showToast"
Cohesion: 0.19
Nodes (14): deleteBlockSnapshot(), deleteDemo(), enterDemoFresh(), enterDemoResume(), exitDemo(), flushPendingCloudSave(), saveCloudNow(), showToast() (+6 more)

### Community 82 - "VarStore"
Cohesion: 0.12
Nodes (33): _add_trauma_run_batch2_terms(), add_night_duration_alternation_terms(), add_second_rest_day_terms(), add_trauma_mid_run_terms(), add_trauma_run_hard_cap(), add_trauma_second_in_run_terms(), _and_cost_var(), _link_trauma() (+25 more)

### Community 83 - "schemas.py"
Cohesion: 0.21
Nodes (16): BaseModel, AyPriorModel, BlockModel, CapsModel, ConfigModel, CoverageEntryModel, HealthResponse, LockedCellModel (+8 more)

### Community 84 - "AppGate.jsx"
Cohesion: 0.13
Nodes (10): SetNewPassword(), LoginScreen(), MODES, ALLOWED_EMAIL_DOMAIN, AUTH_ENABLED, isUnresolvedToken(), readGlobal(), ROLE (+2 more)

### Community 86 - "scheduleQuality.js"
Cohesion: 0.20
Nodes (13): applyTraumaClampAndDow(), getCoverageFor(), AREA_CONCENTRATION_FLOOR, assignedCount(), betterQuality(), computeQualityMetrics(), groupedSpread(), groupKey() (+5 more)

### Community 87 - "test_em_composition.py"
Cohesion: 0.19
Nodes (23): add_em_composition_terms(), add_pgy_fallback_terms(), _area_shift_dates(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, _add_em_composition_round2b_terms() (+15 more)

### Community 88 - "shifts.js"
Cohesion: 0.15
Nodes (19): QGENDA_NAME_FORMATS, QGENDA_VARIANTS, qgendaName(), qgendaTaskFor(), AREA_COLORS, formatGapH(), gapIsShort(), JC_WINDOW_END_H (+11 more)

### Community 89 - "RequestsTab.jsx"
Cohesion: 0.20
Nodes (12): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestPortalCard() (+4 more)

### Community 90 - "payload.py"
Cohesion: 0.15
Nodes (17): AyPrior, Block, Config, CoverageEntry, LockedCell, _parse_coverage(), _parse_eligible(), _parse_locked() (+9 more)

### Community 91 - "Solver performance investigation (2026-08-22)"
Cohesion: 0.17
Nodes (11): 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), 2. Per-module size contribution (isolated measurement), 3. The fix, 4. Correctness guardrail, 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Environment, Files touched (+3 more)

### Community 92 - "add_soft_sequence_constraint"
Cohesion: 0.29
Nodes (10): add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges(), test_run_at_or_above_soft_min_costs_nothing() (+2 more)

### Community 94 - "test_circadian.py"
Cohesion: 0.35
Nodes (10): _build(), test_day_then_eve_next_day_forbidden(), test_day_then_night_next_day_is_allowed_by_this_rule(), test_eve_then_day_next_day_forbidden(), test_more_than_two_night_run_segments_forbidden(), test_night_cap_enforced(), test_night_exempt_resident_skips_night_cap(), test_seven_consecutive_nights_forbidden_by_sliding_window() (+2 more)

### Community 95 - "main.jsx"
Cohesion: 0.22
Nodes (6): AppGate(), crashKey(), ErrorBoundary, reportCrash(), ResidentRequestsApp(), SUPABASE_ENABLED

### Community 96 - "JeopardySickCallsCard"
Cohesion: 0.36
Nodes (5): computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), JeopardySickCallsCard(), addIncident()

### Community 97 - "JeopardyTab"
Cohesion: 0.27
Nodes (7): DATES6, dateInRanges(), fillJeopardy(), jeopardyCandidatesFor(), JeopardyTab(), runFill(), setCell()

### Community 98 - "getBlockDates"
Cohesion: 0.17
Nodes (14): getBlockDates(), makeSnapshot(), nightSpreadFor(), VARIANTS, mkDates(), BlockCalendarSection(), buildQualityInput(), computeAyPriorTotals() (+6 more)

### Community 99 - "runOptimizationSweep"
Cohesion: 0.36
Nodes (9): buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates(), compareVectors(), runOptimizationSweep() (+1 more)

### Community 100 - "workday_limits.py"
Cohesion: 0.17
Nodes (18): _add_post_run6_rest(), _add_six_day_window(), add_workday_limit_constraints(), _forbid_triple(), _link_work(), Rule 19 (work-day linking + max 6 consecutive work days) and rule 20 (>=24h…, Forbid (run6_end AND shift1 AND shift2) firing together. `run6_val` is a plain…, work[r,d] == max(any shift assigned that day, obligation that day). `sum(x)` is… (+10 more)

### Community 101 - "solverClient.js"
Cohesion: 0.39
Nodes (6): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, solveRemote(), freshModule()

### Community 102 - "main.py"
Cohesion: 0.20
Nodes (12): get, post, health(), FastAPI app: POST /solve, GET /health. Kept deliberately thin -- request…, solve_endpoint(), main(), CLI entry point for the solver, independent of the FastAPI service. python…, PayloadError (+4 more)

### Community 107 - "coverageComposition.js"
Cohesion: 0.31
Nodes (7): shiftCoverageForDate(), bucketLabel(), composeCoverage(), COVERAGE_GROUPS, groupForCategory(), CoverageTab(), CoverageTotalsView()

### Community 108 - "chiefBenchmark.test.js"
Cohesion: 0.29
Nodes (3): coverageFillStats(), nightRunsFor(), twelveHourStateFor()

### Community 109 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

### Community 110 - "dateSetPaint.test.js"
Cohesion: 0.53
Nodes (4): applyDateRangePaint(), paintActionFor(), toggleDateInList(), startDrag()

## Knowledge Gaps
- **171 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+166 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Payload` connect `Payload` to `workday_limits.py`, `builder.py`, `test_weight_tiering.py`, `elastic.py`, `validate.py`, `VarStore`, `test_em_composition.py`, `parse_payload`, `make_resident`, `build_variables`, `payload.py`, `solve.py`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `ResidentScheduler()` connect `ResidentScheduler` to `ResidentScheduler.jsx`, `getBlockDates`, `formatDisplayDate`, `parseDate`, `ScheduleGrid`, `getEligibleShifts`, `ShiftMatrixTab`, `validateAll`, `showToast`, `AppGate.jsx`, `chiefBenchmark.solver.test.js`, `shifts.js`, `updateBlock`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `parse_payload()` connect `parse_payload` to `workday_limits.py`, `main.py`, `builder.py`, `test_weight_tiering.py`, `elastic.py`, `validate.py`, `test_em_composition.py`, `make_resident`, `build_variables`, `payload.py`, `Payload`, `test_circadian.py`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Are the 53 inferred relationships involving `VarStore` (e.g. with `BuildResult` and `add_circadian_constraints()`) actually correct?**
  _`VarStore` has 53 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _171 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.016316015457277802 - nodes in this community are weakly interconnected._