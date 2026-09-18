# Graph Report - resident-scheduler  (2026-09-17)

## Corpus Check
- 193 files · ~330,362 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1782 nodes · 4851 edges · 114 communities (95 shown, 19 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 208 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c0d95e4d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- dependencies
- RequestsTab.jsx
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
- Walkthrough.jsx
- builder.py
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- repairPass
- parseVacationWorkbook
- validate.py
- solve
- make_resident
- parse_payload
- useMonthPager
- workday_limits.py
- updateBlock
- exportResidentCalendarPDF
- overrideCapture.test.js
- Cloud Sync (Supabase)
- getBlockDates
- scoreWeights.test.js
- Circadian Scheduling Rules
- Field-Ready Design System
- validateAll
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- timing.py
- SidebarNav
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- qgendaImport.js
- Payload
- FeedbackAdminTab
- test_weight_tiering.py
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- solve.py
- chiefBenchmark.solver.test.js
- vite.config.js
- Caveman Terse-Response Mode (Cline rule)
- Caveman Terse-Response Mode (Copilot rule)
- Caveman Terse-Response Mode (OpenCode rule)
- Caveman Terse-Response Mode (Windsurf rule)
- Caveman Terse-Response Mode (top-level AGENTS.md)
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
- Walkthrough steps
- solver-service
- variables.py
- TermGroup
- shifts.js
- main.py
- payload.py
- Solver performance investigation (2026-08-22)
- add_soft_sequence_constraint
- CLAUDE.md
- test_circadian.py
- prettyDate
- JeopardySickCallsCard
- JeopardyTab
- SettingsTab
- runOptimizationSweep
- test_workday_limits.py
- solverClient.js
- test_count_caps.py
- seniorWellnessSubstituteAllowed
- test_validate_trauma_run.py
- dateSetPaint.test.js
- blockTargetReachability.test.js
- rollingWindowHours.test.js
- pedNightMigration.test.js

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
- **Caveman terse-response rule duplicated across every AI tool config in this repo** — _clinerules_caveman_caveman_mode, _github_copilot_instructions_caveman_mode, _opencode_agents_caveman_mode, _windsurf_rules_caveman_caveman_mode, agents_caveman_mode [INFERRED 0.85]
- **End-to-end day-off request flow: resident submission through chief approval into the schedule** — docs_superpowers_plans_2026_07_18_resident_day_off_requests_task7_request_form, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task10_approval_queue, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task11_pending_badge [INFERRED 0.85]
- **Feedback capture-to-triage pipeline: widget/crash capture write, admin function/tab read** — docs_superpowers_plans_2026_07_18_user_feedback_plan_task1_schema_helper, docs_superpowers_plans_2026_07_18_user_feedback_plan_task2_widget, docs_superpowers_plans_2026_07_18_user_feedback_plan_task3_crash_capture, docs_superpowers_plans_2026_07_18_user_feedback_plan_task4_admin_function, docs_superpowers_plans_2026_07_18_user_feedback_plan_task5_admin_tab [INFERRED 0.85]
- **Generator Quality Improvement Program** — claude_md_score_weights_audit, claude_md_work_shape_scoring, claude_md_ay_carryover, claude_md_override_capture [INFERRED 0.85]

## Communities (114 total, 19 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (96): RFC-4180, RFC-5545, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS, BLOCK_TYPE_MAP (+88 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.12
Nodes (26): ResidentScheduler(), buildGridCSVRows(), deleteDemo(), downloadCSV(), downloadICS(), enterDemoFresh(), enterDemoResume(), exitDemo() (+18 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (47): autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jsdom, lucide-react, dependencies, @fontsource/barlow (+39 more)

### Community 3 - "RequestsTab.jsx"
Cohesion: 0.06
Nodes (44): AppGate(), SetNewPassword(), crashKey(), ErrorBoundary, reportCrash(), AdminManagement(), residentLabel(), setRole() (+36 more)

### Community 4 - "coverage.js"
Cohesion: 0.12
Nodes (26): coverageFillStats(), nightRunsFor(), applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX (+18 more)

### Community 5 - "formatDisplayDate"
Cohesion: 0.10
Nodes (15): AvailabilityRangesEditor(), DateListEditor(), DragConfirmModal(), FeasibilityReportCard(), formatDisplayDate(), GenerationReportCard(), renderChangelogText(), ShiftOverlapInfo() (+7 more)

### Community 6 - "parseDate"
Cohesion: 0.10
Nodes (45): addDays(), ayWindowFor(), getAcademicYearFor(), getBlockWeekends(), parseDate(), qgendaDate(), toDateStr(), nightRun() (+37 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.14
Nodes (24): Pre-Generation Readiness Gate, checkGenerateReadiness(), updateBlockTracked(), ScheduleGrid(), applySweepCandidate(), assign(), cancelHover(), commitDrop() (+16 more)

### Community 8 - "getEligibleShifts"
Cohesion: 0.19
Nodes (22): CTX, elig(), buildResidentICS(), cellViolations(), computeTotalTargetDemand(), effectiveChiefRole(), effectiveWellnessWednesdayDate(), findBlockingRestriction() (+14 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "syntheticRoster.js"
Cohesion: 0.09
Nodes (27): acepFixture(), PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService(), pgyGateWarnings(), res() (+19 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.13
Nodes (32): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+24 more)

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
Cohesion: 0.17
Nodes (15): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota), Phase 0 Measured Result: Rescale Rejected (+7 more)

### Community 16 - "Walkthrough.jsx"
Cohesion: 0.08
Nodes (42): UserGuideTab(), CARD_GAP, CARD_H_FALLBACK, CARD_W, cornerBox(), inflate(), overlapArea(), pickCardCorner() (+34 more)

### Community 17 - "builder.py"
Cohesion: 0.11
Nodes (21): _assigned_count_for_cap(), build_feasibility_report(), build_recommendations(), build_violations(), _cap_recommendation(), _coverage_recommendation(), _coverage_violations(), _duty_recommendation() (+13 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (21): auth, auth.users, public.apply_admin_allowlist, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests (+13 more)

### Community 19 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 20 - "repairPass"
Cohesion: 0.33
Nodes (18): compositionSatisfies(), hasSenior(), repairPass(), assignCell(), backfillVacated(), chainUnfilledSlot(), compositionStillSatisfied(), filledCount() (+10 more)

### Community 21 - "parseVacationWorkbook"
Cohesion: 0.22
Nodes (13): matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), extractVacationDateCells(), findVacationSections(), matchLectureRosterName() (+5 more)

### Community 22 - "validate.py"
Cohesion: 0.22
Nodes (22): _check_circadian_pairs(), _check_consecutive_work(), _check_count_caps(), _check_coverage_max(), _check_eligibility_and_locked(), _check_hours_cap(), _check_night_run_and_cap_and_segments(), _check_post_run6_rest() (+14 more)

### Community 23 - "solve"
Cohesion: 0.15
Nodes (27): solve(), load_fixture(), schedule_has(), test_build_response_shape_matches_schema(), test_cross_midnight_rest_forces_reassignment(), test_small_feasible_solves_and_meets_coverage_min(), Batch 2: pass-2 elastic relaxation, conflict naming, feasibility report., Best-effort per the plan -- ortools' `sufficient_assumptions_for_… (+19 more)

### Community 24 - "make_resident"
Cohesion: 0.14
Nodes (39): make_resident(), _build(), _build_alt(), _build_iso(), _build_rest(), _cost_of(), _dates(), Batch 2 (chief round-2 plan, "Confirmed rule changes" A/B/C): trauma-run hard… (+31 more)

### Community 25 - "parse_payload"
Cohesion: 0.15
Nodes (30): Block, Config, _parse_eligible(), _parse_obligations(), parse_payload(), Settings, build_variables(), make_payload() (+22 more)

### Community 26 - "useMonthPager"
Cohesion: 0.28
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), containers, Harness(), mountPager(), Harness() (+2 more)

### Community 27 - "workday_limits.py"
Cohesion: 0.18
Nodes (15): as_literal(), const_lit(), Normalize a rolling-window/sequence term (python int OR a real BoolVar) into…, A fixed-value CP-SAT literal (usable in add_bool_and/or, OnlyEnforceIf, and…, _add_post_run6_rest(), _add_six_day_window(), add_workday_limit_constraints(), _forbid_triple() (+7 more)

### Community 28 - "updateBlock"
Cohesion: 0.15
Nodes (18): AddResidentModal(), DashboardTab(), onStartDateChange(), setBlockField(), updSD(), EMResidentsTab(), removeRes(), setBA() (+10 more)

### Community 29 - "exportResidentCalendarPDF"
Cohesion: 0.42
Nodes (9): demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), offRequestEntryFor(), pdfDemoBanner(), pdfPageFooter(), pdfPageHeader(), pdfSafeText() (+1 more)

### Community 30 - "overrideCapture.test.js"
Cohesion: 0.29
Nodes (5): REPORT, diffScheduleCells(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "getBlockDates"
Cohesion: 0.08
Nodes (36): baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname, errorCount(), loadBaseline(), makeBaselineSuite() (+28 more)

### Community 33 - "scoreWeights.test.js"
Cohesion: 0.40
Nodes (5): bandOf(), groupBand(), preferenceKeys, structuralKeys, SCORE_TIERS

### Community 34 - "Circadian Scheduling Rules"
Cohesion: 0.40
Nodes (5): Circadian Scheduling Rules, Grand Rounds Lecture Day-Before Rule, Chief-Editable Journal Club Dates, Journal Club Rules, PED-N Split Into Two Shift IDs

### Community 35 - "Field-Ready Design System"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 36 - "validateAll"
Cohesion: 0.10
Nodes (40): runValidate(), shiftActiveOnDow(), shiftOverlapsJC(), blockDayIndex(), buildSolverPayload(), checkRestViolations(), computeTotalCoverageSupply(), countCurrentBlockJC() (+32 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "timing.py"
Cohesion: 0.11
Nodes (28): date, _parse_shifts(), add_days(), date_diff_days(), gap_between(), _ordinal_minutes(), overlaps_hour_window(), parse_date() (+20 more)

### Community 40 - "SidebarNav"
Cohesion: 0.33
Nodes (7): CollapsibleCard(), reconcileTabOrder(), reorderIds(), SidebarNav(), renderTabButton(), resetDrag(), useUiPrefsContext()

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "qgendaImport.js"
Cohesion: 0.06
Nodes (59): formatAY(), buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy() (+51 more)

### Community 45 - "Payload"
Cohesion: 0.14
Nodes (29): Payload, CoverageResult, Rules 24-25: per-(shift, date) staffing minimum/maximum. Max side is always a…, _area_shift_dates(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, _add_band8_terms(), _add_coverage_term() (+21 more)

### Community 46 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 47 - "test_weight_tiering.py"
Cohesion: 0.11
Nodes (26): apply_rule_priority(), load_default_weights(), merged_weights(), _priority_order(), Static config, read once per process rather than per solve. Cached safely…, Relative order of the two objective-relevant rulePriority entries, ignoring…, Returns a copy of `weights` with the lower-ranked of coverageMin/ postNightRest…, _anti_fill_sum() (+18 more)

### Community 52 - "solve.py"
Cohesion: 0.22
Nodes (17): CpSolver, _assert_relaxed_matches_validation(), _build_report(), _build_report_relaxed(), _empty_report(), _extract_schedule(), _num_workers(), Two-pass orchestration. `solve(payload)` runs pass 1 (strict); on INFEASIBLE it… (+9 more)

### Community 53 - "chiefBenchmark.solver.test.js"
Cohesion: 0.12
Nodes (13): buildAllResidents(), __dirname, nightRunsFor(), PYTHON, REPO_ROOT, SOLVER_DIR, buildAllResidents(), __dirname (+5 more)

### Community 80 - "elastic.py"
Cohesion: 0.16
Nodes (16): CpModel, build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, add_coverage_constraints(), `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, build_elastic_model(), ElasticBuildResult (+8 more)

### Community 81 - "showToast"
Cohesion: 0.17
Nodes (16): getAcademicYear(), buildSnapData(), FeedbackWidget(), handleSubmit(), reset(), makeDefaultBlock(), blockReset(), deleteBlockSnapshot() (+8 more)

### Community 82 - "VarStore"
Cohesion: 0.11
Nodes (35): _add_trauma_run_batch2_terms(), add_night_duration_alternation_terms(), add_peds_intern_night_deficit_term(), add_second_rest_day_terms(), add_trauma_mid_run_terms(), add_trauma_run_hard_cap(), add_trauma_second_in_run_terms(), _and_cost_var() (+27 more)

### Community 83 - "schemas.py"
Cohesion: 0.21
Nodes (16): BaseModel, AyPriorModel, BlockModel, CapsModel, ConfigModel, CoverageEntryModel, HealthResponse, LockedCellModel (+8 more)

### Community 84 - "Walkthrough steps"
Cohesion: 0.13
Nodes (14): 1. Dashboard — your command center, 2. EM Residents — the roster, 3. Shift Matrix — who can work what, 4. Schedule — the grid, 5. Scheduling Rules — coverage targets, 6. Violations — the generation report, 7. Jeopardy — backup call, 8. Requests — resident day-off requests (+6 more)

### Community 85 - "solver-service"
Cohesion: 0.10
Nodes (18): Notes, Objective tiers (high → low; integer weights derived at build time with ratchet separation), Request — `POST /solve`, Response, Rule registry ids (report/`rule` field values), Solver Payload Schema v1, Alternates, Contract (+10 more)

### Community 86 - "variables.py"
Cohesion: 0.13
Nodes (23): add_circadian_constraints(), _add_eve_day_pairs(), _add_night_cap(), _add_night_run_segments(), _add_night_run_window(), _link_night(), Rule 18 (eve<->day adjacency + night-run<=6 sliding window), rule 22 (max…, Rule 22: total nights THIS block <= caps.nights, unless night-exempt (e.g. a… (+15 more)

### Community 87 - "TermGroup"
Cohesion: 0.23
Nodes (21): add_em_composition_terms(), add_pgy_fallback_terms(), podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, Flat accumulator for one weighted-term family. Replaces the old `Tier` class,…, TermGroup, _build(), _cost_of() (+13 more)

### Community 88 - "shifts.js"
Cohesion: 0.14
Nodes (26): AREA_COLORS, formatGapH(), gapIsShort(), isNightShiftId(), JC_WINDOW_END_H, JC_WINDOW_START_H, overlappingAssignments(), NOTE: AREA_COLORS is not in the original extraction spec's const list, but… (+18 more)

### Community 89 - "main.py"
Cohesion: 0.20
Nodes (12): get, post, health(), FastAPI app: POST /solve, GET /health. Kept deliberately thin -- request…, solve_endpoint(), main(), CLI entry point for the solver, independent of the FastAPI service. python…, PayloadError (+4 more)

### Community 90 - "payload.py"
Cohesion: 0.16
Nodes (19): AyPrior, CoverageEntry, LockedCell, _parse_coverage(), _parse_locked(), _parse_preferences(), _parse_residents(), Preference (+11 more)

### Community 91 - "Solver performance investigation (2026-08-22)"
Cohesion: 0.17
Nodes (11): 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), 2. Per-module size contribution (isolated measurement), 3. The fix, 4. Correctness guardrail, 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Environment, Files touched (+3 more)

### Community 92 - "add_soft_sequence_constraint"
Cohesion: 0.29
Nodes (10): add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges(), test_run_at_or_above_soft_min_costs_nothing() (+2 more)

### Community 93 - "CLAUDE.md"
Cohesion: 0.18
Nodes (10): Auth, roles & day-off request feature, CLAUDE.md, CP-SAT solver service (optional second scheduling engine), Data model & conventions, Eligibility overrides are a DIFF, not a snapshot, Layout & stack, Map of ResidentScheduler.jsx, Rule-default migration (+2 more)

### Community 94 - "test_circadian.py"
Cohesion: 0.35
Nodes (10): _build(), test_day_then_eve_next_day_forbidden(), test_day_then_night_next_day_is_allowed_by_this_rule(), test_eve_then_day_next_day_forbidden(), test_more_than_two_night_run_segments_forbidden(), test_night_cap_enforced(), test_night_exempt_resident_skips_night_cap(), test_seven_consecutive_nights_forbidden_by_sliding_window() (+2 more)

### Community 95 - "prettyDate"
Cohesion: 0.18
Nodes (14): bucketLabel(), AYConferenceEditor(), BlockCalendarRow(), BlockContextBar(), BlockMonthGrid(), computeCoverageByDate(), CoverageByAreaView(), CoverageByDateView() (+6 more)

### Community 96 - "JeopardySickCallsCard"
Cohesion: 0.36
Nodes (5): computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), JeopardySickCallsCard(), addIncident()

### Community 97 - "JeopardyTab"
Cohesion: 0.27
Nodes (7): DATES6, dateInRanges(), fillJeopardy(), jeopardyCandidatesFor(), JeopardyTab(), runFill(), setCell()

### Community 98 - "SettingsTab"
Cohesion: 0.25
Nodes (8): getGeneralPedsTarget(), sbDeleteState(), SettingsTab(), clearAll(), exportData(), importData(), qgendaDefaultForCompare(), updQgendaTask()

### Community 99 - "runOptimizationSweep"
Cohesion: 0.32
Nodes (10): buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates(), compareVectors(), runOptimizationSweep() (+2 more)

### Community 100 - "test_workday_limits.py"
Cohesion: 0.46
Nodes (7): _build(), test_obligation_day_forces_work_var_true_with_no_shift(), test_post_run6_rest_blocks_shift_within_24h_after_completed_run_isolated_from_rule19(), test_seven_consecutive_workdays_forbidden(), test_shift_well_after_run_is_allowed(), test_six_consecutive_workdays_allowed(), test_work_var_false_with_no_shift_and_no_obligation()

### Community 101 - "solverClient.js"
Cohesion: 0.39
Nodes (6): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, solveRemote(), freshModule()

### Community 102 - "test_count_caps.py"
Cohesion: 0.52
Nodes (6): _build(), test_target_ceiling_enforced(), test_target_none_means_no_ceiling(), test_trauma_cap_enforced(), test_trauma_peds_split_peds_half_ok_when_trauma_half_ok(), test_trauma_peds_split_sub_caps_are_independent()

### Community 107 - "seniorWellnessSubstituteAllowed"
Cohesion: 0.29
Nodes (7): conferenceAwayPgys(), conferenceDefs(), flexWellnessSubstituteAllowed(), isConferenceAwayFor(), narrowForPgyGate(), podWellnessSubstituteAllowed(), seniorWellnessSubstituteAllowed()

### Community 108 - "test_validate_trauma_run.py"
Cohesion: 0.53
Nodes (5): _payload(), Batch 2: solver/validate.py's independent re-implementation of the…, test_three_trauma_nights_in_one_run_fails_validation(), test_two_trauma_nights_each_in_separate_runs_passes_validation(), test_two_trauma_nights_in_one_run_passes_validation()

### Community 109 - "dateSetPaint.test.js"
Cohesion: 0.53
Nodes (4): applyDateRangePaint(), paintActionFor(), toggleDateInList(), startDrag()

### Community 111 - "rollingWindowHours.test.js"
Cohesion: 0.50
Nodes (3): maxRollingWindowHoursFor(), ROLLING_WINDOW_CAP_H, ROLLING_WINDOW_MS

## Knowledge Gaps
- **213 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+208 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Payload` connect `Payload` to `timing.py`, `test_weight_tiering.py`, `elastic.py`, `builder.py`, `VarStore`, `solve.py`, `solve`, `variables.py`, `TermGroup`, `validate.py`, `parse_payload`, `payload.py`, `workday_limits.py`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `parse_payload()` connect `parse_payload` to `test_workday_limits.py`, `test_count_caps.py`, `timing.py`, `test_validate_trauma_run.py`, `Payload`, `test_weight_tiering.py`, `builder.py`, `TermGroup`, `solve`, `make_resident`, `main.py`, `payload.py`, `test_circadian.py`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `parseDate()` connect `parseDate` to `getBlockDates`, `ResidentScheduler.jsx`, `JeopardyTab`, `coverage.js`, `validateAll`, `formatDisplayDate`, `ScheduleGrid`, `getEligibleShifts`, `syntheticRoster.js`, `seniorWellnessSubstituteAllowed`, `qgendaImport.js`, `repairPass`, `shifts.js`, `useMonthPager`, `exportResidentCalendarPDF`, `prettyDate`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Are the 53 inferred relationships involving `VarStore` (e.g. with `BuildResult` and `add_circadian_constraints()`) actually correct?**
  _`VarStore` has 53 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _213 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.01734182360113806 - nodes in this community are weakly interconnected._