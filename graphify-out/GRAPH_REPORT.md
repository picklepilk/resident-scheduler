# Graph Report - resident-scheduler  (2026-08-23)

## Corpus Check
- 179 files · ~316,515 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1688 nodes · 4656 edges · 107 communities (90 shown, 17 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 201 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `973598f8`
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
- builder.py
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- repairPass
- parseVacationWorkbook
- holidays.js
- parse_payload
- test_trauma_runs.py
- make_resident
- TimeOffModal
- Payload
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
- VarStore
- FeedbackAdminTab
- test_weight_tiering.py
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- normalizeImportLog
- isNightShiftId
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
- trauma_runs.py
- schemas.py
- AppGate.jsx
- solver-service
- variables.py
- test_em_composition.py
- shifts.js
- RequestsTab.jsx
- payload.py
- Solver performance investigation (2026-08-22)
- add_soft_sequence_constraint
- CLAUDE.md
- test_circadian.py
- main.jsx
- getAcademicYearFor
- JeopardyTab
- count_caps.py
- optimizerSweep.js
- test_workday_limits.py
- solverClient.js
- test_senior_composition.py

## God Nodes (most connected - your core abstractions)
1. `Payload` - 117 edges
2. `parseDate()` - 99 edges
3. `parse_payload()` - 85 edges
4. `validateAll()` - 72 edges
5. `make_resident()` - 71 edges
6. `VarStore` - 70 edges
7. `toDateStr()` - 56 edges
8. `ResidentScheduler()` - 53 edges
9. `TermGroup` - 50 edges
10. `addDays()` - 49 edges

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

## Communities (107 total, 17 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (110): RFC-4180, RFC-5545, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS, BLOCK_TYPE_MAP (+102 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.10
Nodes (30): getAcademicYear(), buildSnapData(), makeDefaultBlock(), ResidentScheduler(), blockReset(), deleteCurrentBlock(), doLoadBlock(), doNewBlock() (+22 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (47): autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jsdom, lucide-react, dependencies, @fontsource/barlow (+39 more)

### Community 3 - "blockLookup.js"
Cohesion: 0.17
Nodes (15): blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState(), fetchRosterForPicker(), findBlockForDate(), groupByBlock(), weeksUntil() (+7 more)

### Community 4 - "coverage.js"
Cohesion: 0.14
Nodes (26): coverageFillStats(), applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE (+18 more)

### Community 5 - "formatDisplayDate"
Cohesion: 0.06
Nodes (33): bucketLabel(), AvailabilityRangesEditor(), AYConferenceEditor(), BlockCalendarRow(), BlockCalendarSection(), BlockContextBar(), BlockMonthGrid(), computeScarceSeniorReservations() (+25 more)

### Community 6 - "parseDate"
Cohesion: 0.18
Nodes (34): addDays(), ayWindowFor(), getBlockWeekends(), parseDate(), qgendaDate(), toDateStr(), dateRange(), nightRun() (+26 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.15
Nodes (23): checkGenerateReadiness(), updateBlockTracked(), ScheduleGrid(), applySweepCandidate(), assign(), cancelHover(), commitDrop(), generateViaSolverOrLocal() (+15 more)

### Community 8 - "getEligibleShifts"
Cohesion: 0.15
Nodes (22): CTX, elig(), buildResidentICS(), computeTotalTargetDemand(), effectiveChiefRole(), effectiveWellnessWednesdayDate(), eligKey(), getEffectiveDayRules() (+14 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "syntheticRoster.js"
Cohesion: 0.10
Nodes (25): PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService(), pgyGateWarnings(), res(), papaFixture() (+17 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.14
Nodes (30): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+22 more)

### Community 12 - "parse.js"
Cohesion: 0.13
Nodes (22): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), parseDateRangeInAY(), NOTE: CATEGORIES/CAT_MAP/normalizeToken/DATE_RANGE_RE are not in the original…, splitCsvLine() (+14 more)

### Community 13 - "RulesTab"
Cohesion: 0.12
Nodes (15): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+7 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.14
Nodes (18): clampGridColExtra(), clampGridZoom(), DEFAULT_UI_PREFS, GRID_COL_EXTRA_MAX, GRID_ZOOM_DEFAULT, GRID_ZOOM_MAX, GRID_ZOOM_MIN, normalizeUiPrefs() (+10 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.16
Nodes (16): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+8 more)

### Community 16 - "journalClub.js"
Cohesion: 0.18
Nodes (13): getFirstTuesdaysInRange(), isFirstTuesday(), isJcDate(), isJcDateAnyAy(), jcDatesInRange(), resolveJcDates(), sortedDedupedDates(), validStoredList() (+5 more)

### Community 17 - "builder.py"
Cohesion: 0.06
Nodes (65): CpSolver, _assigned_count_for_cap(), build_feasibility_report(), build_recommendations(), build_violations(), _cap_recommendation(), _coverage_recommendation(), _coverage_violations() (+57 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (21): auth, auth.users, public.apply_admin_allowlist, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests (+13 more)

### Community 19 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 20 - "repairPass"
Cohesion: 0.37
Nodes (16): hasSenior(), repairPass(), assignCell(), backfillVacated(), chainUnfilledSlot(), compositionStillSatisfied(), filledCount(), minFor() (+8 more)

### Community 21 - "parseVacationWorkbook"
Cohesion: 0.24
Nodes (12): matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), extractVacationDateCells(), findVacationSections(), pickFile() (+4 more)

### Community 22 - "holidays.js"
Cohesion: 0.26
Nodes (17): buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy(), holidaysInRange() (+9 more)

### Community 23 - "parse_payload"
Cohesion: 0.11
Nodes (42): post, solve_endpoint(), main(), CLI entry point for the solver, independent of the FastAPI service. python…, Block, Config, _parse_eligible(), _parse_obligations() (+34 more)

### Community 24 - "test_trauma_runs.py"
Cohesion: 0.11
Nodes (43): Resident, _add_trauma_run_batch2_terms(), Flat accumulator for one weighted-term family. Replaces the old `Tier` class,…, TermGroup, add_night_duration_alternation_terms(), add_second_rest_day_terms(), _night_possible_indices(), Same idea as `_trauma_possible_indices`, for `_night_term_for_position` (any… (+35 more)

### Community 25 - "make_resident"
Cohesion: 0.15
Nodes (33): add_peds_intern_night_deficit_term(), deficit_r = max(0, pedsInternNightTarget - assigned_peds_nights_r) for every…, build_variables(), make_payload(), make_resident(), Shared tiny-payload builders for the model-family unit tests. Not a test module…, _build(), test_target_ceiling_enforced() (+25 more)

### Community 26 - "TimeOffModal"
Cohesion: 0.17
Nodes (15): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), applyDateRangePaint(), paintActionFor(), toggleDateInList(), containers (+7 more)

### Community 27 - "Payload"
Cohesion: 0.12
Nodes (27): Payload, add_circadian_constraints(), _add_night_cap(), _add_night_run_segments(), _add_night_run_window(), _link_night(), Rule 18 (eve<->day adjacency + night-run<=6 sliding window), rule 22 (max…, Rule 22: total nights THIS block <= caps.nights, unless night-exempt (e.g. a… (+19 more)

### Community 28 - "updateBlock"
Cohesion: 0.17
Nodes (16): DashboardTab(), onStartDateChange(), setBlockField(), updSD(), EMResidentsTab(), removeRes(), setBA(), target() (+8 more)

### Community 29 - "exportResidentCalendarPDF"
Cohesion: 0.21
Nodes (14): demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), getGeneralPedsTarget(), offRequestEntryFor(), pdfDemoBanner(), pdfPageFooter(), pdfPageHeader() (+6 more)

### Community 30 - "overrideCapture.test.js"
Cohesion: 0.29
Nodes (5): REPORT, diffScheduleCells(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "getBlockDates"
Cohesion: 0.09
Nodes (38): baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname, errorCount(), loadBaseline(), makeBaselineSuite() (+30 more)

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
Cohesion: 0.12
Nodes (39): runValidate(), shiftOverlapsJC(), blockDayIndex(), buildSolverPayload(), checkCircadianViolations(), compositionSatisfies(), countCurrentBlockJC(), countNightsInSchedule() (+31 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "timing.py"
Cohesion: 0.12
Nodes (27): date, _weekend_dates(), date_diff_days(), gap_between(), _ordinal_minutes(), overlaps_hour_window(), parse_date(), The ONLY cross-midnight math in the solver. Every constraint family that needs… (+19 more)

### Community 40 - "SidebarNav"
Cohesion: 0.33
Nodes (7): CollapsibleCard(), reconcileTabOrder(), reorderIds(), SidebarNav(), renderTabButton(), resetDrag(), useUiPrefsContext()

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "qgendaImport.js"
Cohesion: 0.14
Nodes (24): QGENDA_NAME_FORMATS, QGENDA_TASKS, QGENDA_VARIANTS, qgendaName(), qgendaTaskFor(), buildQGendaImport(), buildScheduleFromImport(), cell() (+16 more)

### Community 45 - "VarStore"
Cohesion: 0.15
Nodes (24): add_pgy_fallback_terms(), _area_shift_dates(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, _add_band8_terms(), _add_coverage_term(), _add_dow_preference_term() (+16 more)

### Community 46 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 47 - "test_weight_tiering.py"
Cohesion: 0.11
Nodes (25): apply_rule_priority(), load_default_weights(), merged_weights(), _priority_order(), Relative order of the two objective-relevant rulePriority entries, ignoring…, Returns a copy of `weights` with the lower-ranked of coverageMin/ postNightRest…, _anti_fill_sum(), _build_objective_for() (+17 more)

### Community 52 - "normalizeImportLog"
Cohesion: 0.15
Nodes (23): formatAY(), appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), normalizeToken(), parseRosterText(), AddResidentModal(), ImportHistoryPanel() (+15 more)

### Community 53 - "isNightShiftId"
Cohesion: 0.09
Nodes (17): buildAllResidents(), __dirname, nightRunsFor(), PYTHON, REPO_ROOT, SOLVER_DIR, buildAllResidents(), nightRunsFor() (+9 more)

### Community 80 - "elastic.py"
Cohesion: 0.14
Nodes (18): CpModel, build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, add_coverage_constraints(), CoverageResult, Rules 24-25: per-(shift, date) staffing minimum/maximum. Max side is always a…, `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used… (+10 more)

### Community 81 - "showToast"
Cohesion: 0.18
Nodes (15): FeedbackWidget(), handleSubmit(), reset(), deleteBlockSnapshot(), deleteDemo(), enterDemoFresh(), showToast(), sbDeleteState() (+7 more)

### Community 82 - "trauma_runs.py"
Cohesion: 0.15
Nodes (21): add_trauma_mid_run_terms(), add_trauma_run_hard_cap(), add_trauma_second_in_run_terms(), _and_cost_var(), _link_trauma(), _night_duration_classes(), _night_term_for_position(), _nightclass_term() (+13 more)

### Community 83 - "schemas.py"
Cohesion: 0.17
Nodes (19): BaseModel, get, health(), FastAPI app: POST /solve, GET /health. Kept deliberately thin -- request…, AyPriorModel, BlockModel, CapsModel, ConfigModel (+11 more)

### Community 84 - "AppGate.jsx"
Cohesion: 0.13
Nodes (10): SetNewPassword(), LoginScreen(), MODES, ALLOWED_EMAIL_DOMAIN, AUTH_ENABLED, isUnresolvedToken(), readGlobal(), ROLE (+2 more)

### Community 85 - "solver-service"
Cohesion: 0.10
Nodes (18): Notes, Objective tiers (high → low; integer weights derived at build time with ratchet separation), Request — `POST /solve`, Response, Rule registry ids (report/`rule` field values), Solver Payload Schema v1, Alternates, Contract (+10 more)

### Community 86 - "variables.py"
Cohesion: 0.16
Nodes (15): _add_eve_day_pairs(), Hard: an eve shift can never be immediately followed by a day shift the next…, _add_post_night_rest_term(), PostNightRestPenalty, add_rest_constraints(), Rule 17: pairwise rest -- gap between consecutive shifts (same resident) must…, add_days(), const_lit() (+7 more)

### Community 87 - "test_em_composition.py"
Cohesion: 0.27
Nodes (17): add_em_composition_terms(), podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, _build(), _cost_of(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, Solves for the MINIMUM of the given weighted terms, not just any feasible value…, test_em_composition_inert_when_em_resident_ids_absent(), test_flex_em_composition_charges_when_zero_em_at_any_staffing() (+9 more)

### Community 88 - "shifts.js"
Cohesion: 0.24
Nodes (15): AREA_COLORS, formatGapH(), gapIsShort(), overlappingAssignments(), NOTE: AREA_COLORS is not in the original extraction spec's const list, but…, SHIFT_AREAS, SHIFT_DOW, SHIFT_TIMING (+7 more)

### Community 89 - "RequestsTab.jsx"
Cohesion: 0.20
Nodes (12): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestPortalCard() (+4 more)

### Community 90 - "payload.py"
Cohesion: 0.23
Nodes (12): AyPrior, CoverageEntry, LockedCell, _parse_coverage(), _parse_locked(), _parse_preferences(), _parse_residents(), _parse_shifts() (+4 more)

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

### Community 95 - "main.jsx"
Cohesion: 0.22
Nodes (6): AppGate(), crashKey(), ErrorBoundary, reportCrash(), ResidentRequestsApp(), SUPABASE_ENABLED

### Community 96 - "getAcademicYearFor"
Cohesion: 0.38
Nodes (6): getAcademicYearFor(), computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), JeopardySickCallsCard(), addIncident()

### Community 97 - "JeopardyTab"
Cohesion: 0.27
Nodes (7): DATES6, dateInRanges(), fillJeopardy(), jeopardyCandidatesFor(), JeopardyTab(), runFill(), setCell()

### Community 98 - "count_caps.py"
Cohesion: 0.36
Nodes (7): add_count_cap_constraints(), _add_trauma_peds_split(), _build_simple_specs(), CapSpec, Rules 26, 28, 27, 29, 30, 31: every "count of shifts matching some predicate,…, Rule 30: BOTH halves share ONE `ok[resident,"traumaPedsSplit"]` literal in pass…, terms_for()

### Community 99 - "optimizerSweep.js"
Cohesion: 0.44
Nodes (6): buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates()

### Community 100 - "test_workday_limits.py"
Cohesion: 0.46
Nodes (7): _build(), test_obligation_day_forces_work_var_true_with_no_shift(), test_post_run6_rest_blocks_shift_within_24h_after_completed_run_isolated_from_rule19(), test_seven_consecutive_workdays_forbidden(), test_shift_well_after_run_is_allowed(), test_six_consecutive_workdays_allowed(), test_work_var_false_with_no_shift_and_no_obligation()

### Community 101 - "solverClient.js"
Cohesion: 0.39
Nodes (6): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, solveRemote(), freshModule()

### Community 102 - "test_senior_composition.py"
Cohesion: 0.60
Nodes (5): _build(), test_no_entry_means_no_constraint_at_all(), test_staffed_shift_requires_a_primary_resident(), test_staffed_shift_with_primary_present_is_allowed(), test_unstaffed_shift_has_no_senior_requirement()

## Knowledge Gaps
- **187 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+182 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Payload` connect `Payload` to `count_caps.py`, `timing.py`, `VarStore`, `test_weight_tiering.py`, `elastic.py`, `builder.py`, `trauma_runs.py`, `variables.py`, `parse_payload`, `test_trauma_runs.py`, `test_em_composition.py`, `payload.py`, `make_resident`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `parseDate()` connect `parseDate` to `getAcademicYearFor`, `getBlockDates`, `ResidentScheduler.jsx`, `JeopardyTab`, `coverage.js`, `validateAll`, `formatDisplayDate`, `ScheduleGrid`, `getEligibleShifts`, `syntheticRoster.js`, `journalClub.js`, `repairPass`, `isNightShiftId`, `holidays.js`, `shifts.js`, `TimeOffModal`, `exportResidentCalendarPDF`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `parse_payload()` connect `parse_payload` to `test_workday_limits.py`, `test_senior_composition.py`, `test_weight_tiering.py`, `builder.py`, `schemas.py`, `test_em_composition.py`, `test_trauma_runs.py`, `make_resident`, `payload.py`, `Payload`, `test_circadian.py`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 95 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 95 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `validateAll()` (e.g. with `isEmIntern()` and `isEmResident()`) actually correct?**
  _`validateAll()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _187 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.015804597701149427 - nodes in this community are weakly interconnected._