# Graph Report - resident-scheduler  (2026-09-06)

## Corpus Check
- 184 files · ~297,293 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1691 nodes · 4786 edges · 108 communities (74 shown, 17 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 204 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c86f2e31`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- Payload
- blockLookup.js
- coverage.js
- formatDisplayDate
- parseDate
- ScheduleGrid
- buildStaticGenContext
- Resident Day-Off Request Implementation Plan
- vitest
- ShiftMatrixTab
- parse.js
- RulesTab
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- journalClub.js
- timing.py
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- repairPass
- parseVacationWorkbook
- validate.py
- parse_payload
- test_trauma_runs.py
- build_variables
- useMonthPager
- VarStore
- updateBlock
- trauma_runs.py
- overrideCapture.test.js
- Cloud Sync (Supabase)
- holidays.js
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
- validateAll
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
- schemas.py
- make_resident
- coverageComposition.js
- prettyDate
- payload.py
- workday_limits.py
- AppGate.jsx
- getBlockDates
- TermGroup
- getEligibleShifts
- RequestsTab.jsx
- test_workday_limits.py
- Solver performance investigation (2026-08-22)
- add_soft_sequence_constraint
- TimeOffModal
- main.jsx
- JeopardySickCallsCard
- JeopardyTab
- SettingsTab
- optimizerSweep.js
- RequestList
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
- `Override Capture Loop` --references--> `withOverrideEvents()`  [EXTRACTED]
  CLAUDE.md → src/ResidentScheduler.jsx
- `AY-to-Date Fairness Carryover` --references--> `computeQualityMetrics()`  [EXTRACTED]
  CLAUDE.md → src/lib/scheduleQuality.js
- `Work-Shape Scoring` --references--> `computeQualityMetrics()`  [EXTRACTED]
  CLAUDE.md → src/lib/scheduleQuality.js
- `Generator Quality Harness (best-of-N + repair)` --references--> `generateScheduleBest()`  [EXTRACTED]
  CLAUDE.md → src/ResidentScheduler.jsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **PWA Icon Set** — public_icons_icon_512_asset, public_icons_icon_192_asset, public_icons_apple_touch_icon_asset [INFERRED 0.75]
- **End-to-end day-off request flow: resident submission through chief approval into the schedule** — docs_superpowers_plans_2026_07_18_resident_day_off_requests_task7_request_form, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task10_approval_queue, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task11_pending_badge [INFERRED 0.85]
- **Feedback capture-to-triage pipeline: widget/crash capture write, admin function/tab read** — docs_superpowers_plans_2026_07_18_user_feedback_plan_task1_schema_helper, docs_superpowers_plans_2026_07_18_user_feedback_plan_task2_widget, docs_superpowers_plans_2026_07_18_user_feedback_plan_task3_crash_capture, docs_superpowers_plans_2026_07_18_user_feedback_plan_task4_admin_function, docs_superpowers_plans_2026_07_18_user_feedback_plan_task5_admin_tab [INFERRED 0.85]
- **Generator Quality Improvement Program** — claude_md_score_weights_audit, claude_md_work_shape_scoring, claude_md_ay_carryover, claude_md_override_capture [INFERRED 0.85]

## Communities (108 total, 17 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (114): RFC-4180, RFC-5545, AREA_COLORS, JC_WINDOW_END_H, JC_WINDOW_START_H, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY (+106 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.09
Nodes (33): getAcademicYear(), buildSnapData(), makeDefaultBlock(), ResidentScheduler(), blockReset(), deleteBlockSnapshot(), deleteCurrentBlock(), doLoadBlock() (+25 more)

### Community 2 - "Payload"
Cohesion: 0.15
Nodes (28): Payload, _add_trauma_peds_split(), Rule 30: BOTH halves share ONE `ok[resident,"traumaPedsSplit"]` literal in pass…, terms_for(), CoverageResult, _add_band8_terms(), _add_coverage_term(), _add_dow_preference_term() (+20 more)

### Community 3 - "blockLookup.js"
Cohesion: 0.27
Nodes (8): blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState(), findBlockForDate(), groupByBlock(), weeksUntil(), RequestForm()

### Community 4 - "coverage.js"
Cohesion: 0.20
Nodes (17): applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, DOW_COVERAGE_OVERRIDE (+9 more)

### Community 5 - "formatDisplayDate"
Cohesion: 0.10
Nodes (15): AvailabilityRangesEditor(), DateListEditor(), DragConfirmModal(), FeasibilityReportCard(), formatDisplayDate(), GenerationReportCard(), renderChangelogText(), ShiftOverlapInfo() (+7 more)

### Community 6 - "parseDate"
Cohesion: 0.18
Nodes (28): addDays(), getAcademicYearFor(), getBlockWeekends(), parseDate(), qgendaDate(), toDateStr(), nightRun(), papaBare (+20 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.14
Nodes (27): checkGenerateReadiness(), showToast(), updateBlockTracked(), ScheduleGrid(), applySweepCandidate(), assign(), cancelHover(), commitDrop() (+19 more)

### Community 8 - "buildStaticGenContext"
Cohesion: 0.24
Nodes (9): papaFixture(), runValidate(), buildStaticGenContext(), computeScarceSeniorReservations(), finalSundayOf(), findNextBlockSnapshot(), nextBlockRotationFor(), nextRotationFromSnapshot() (+1 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "vitest"
Cohesion: 0.07
Nodes (32): vitest, acepFixture(), PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService(), pgyGateWarnings() (+24 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.13
Nodes (32): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+24 more)

### Community 12 - "parse.js"
Cohesion: 0.14
Nodes (20): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), parseDateRangeInAY(), NOTE: CATEGORIES/CAT_MAP/normalizeToken/DATE_RANGE_RE are not in the original…, splitCsvLine() (+12 more)

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
Cohesion: 0.16
Nodes (17): ayWindowFor(), getFirstTuesdaysInRange(), isFirstTuesday(), isJcDate(), isJcDateAnyAy(), jcDatesInRange(), resolveJcDates(), sortedDedupedDates() (+9 more)

### Community 17 - "timing.py"
Cohesion: 0.10
Nodes (30): date, _build_simple_specs(), CapSpec, Rules 26, 28, 27, 29, 30, 31: every "count of shifts matching some predicate,…, date_diff_days(), gap_between(), _ordinal_minutes(), overlaps_hour_window() (+22 more)

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
Cohesion: 0.27
Nodes (11): matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), extractVacationDateCells(), findVacationSections(), matchLectureRosterName() (+3 more)

### Community 22 - "validate.py"
Cohesion: 0.16
Nodes (28): add_days(), _check_circadian_pairs(), _check_consecutive_work(), _check_count_caps(), _check_coverage_max(), _check_eligibility_and_locked(), _check_hours_cap(), _check_night_run_and_cap_and_segments() (+20 more)

### Community 23 - "parse_payload"
Cohesion: 0.12
Nodes (38): post, solve_endpoint(), main(), CLI entry point for the solver, independent of the FastAPI service. python…, parse_payload(), PayloadError, Raised for structurally invalid request JSON (maps to HTTP 400/422)., build_response() (+30 more)

### Community 24 - "test_trauma_runs.py"
Cohesion: 0.11
Nodes (46): Resident, add_circadian_constraints(), add_night_duration_alternation_terms(), add_peds_intern_night_deficit_term(), Index set (into `payload.all_dates`) of every position where…, Generalizes the trauma-9h-vs-other-durations mixing rule to ANY pair of night-…, deficit_r = max(0, pedsInternNightTarget - assigned_peds_nights_r) for every…, _trauma_possible_indices() (+38 more)

### Community 25 - "build_variables"
Cohesion: 0.17
Nodes (23): build_variables(), make_payload(), test_elastic_min_absorbs_shortfall_when_nobody_eligible(), test_hard_then_elastic_mode_builds_no_slack_and_can_be_infeasible(), test_max_side_is_hard(), _build(), test_hours_cap_allows_under_limit(), test_hours_cap_enforced_with_tail_offset() (+15 more)

### Community 26 - "useMonthPager"
Cohesion: 0.28
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), containers, Harness(), mountPager(), Harness() (+2 more)

### Community 27 - "VarStore"
Cohesion: 0.09
Nodes (41): build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, _add_eve_day_pairs(), _add_night_cap(), _add_night_run_segments(), _add_night_run_window(), _link_night() (+33 more)

### Community 28 - "updateBlock"
Cohesion: 0.17
Nodes (16): DashboardTab(), onStartDateChange(), setBlockField(), updSD(), EMResidentsTab(), removeRes(), setBA(), target() (+8 more)

### Community 29 - "trauma_runs.py"
Cohesion: 0.13
Nodes (25): _add_trauma_run_batch2_terms(), add_second_rest_day_terms(), add_trauma_mid_run_terms(), add_trauma_second_in_run_terms(), _and_cost_var(), _night_duration_classes(), _night_possible_indices(), _night_possible_indices_cached() (+17 more)

### Community 30 - "overrideCapture.test.js"
Cohesion: 0.29
Nodes (5): REPORT, diffScheduleCells(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "holidays.js"
Cohesion: 0.26
Nodes (17): buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy(), holidaysInRange() (+9 more)

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
Cohesion: 0.11
Nodes (30): shiftActiveOnDow(), buildSolverPayload(), computeTotalCoverageSupply(), computeTotalTargetDemand(), eligKey(), emCompositionRequired(), generateSchedule(), candidatePool() (+22 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "builder.py"
Cohesion: 0.11
Nodes (22): ElasticBuildResult, _assigned_count_for_cap(), build_feasibility_report(), build_recommendations(), build_violations(), _cap_recommendation(), _coverage_recommendation(), _coverage_violations() (+14 more)

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
Cohesion: 0.15
Nodes (23): formatAY(), appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), normalizeToken(), parseRosterText(), AddResidentModal(), ImportHistoryPanel() (+15 more)

### Community 53 - "validateAll"
Cohesion: 0.10
Nodes (31): buildAllResidents(), __dirname, nightRunsFor(), PYTHON, REPO_ROOT, SOLVER_DIR, buildAllResidents(), nightRunsFor() (+23 more)

### Community 58 - "package.json"
Cohesion: 0.05
Nodes (42): dependencies, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, qrcode (+34 more)

### Community 63 - "solve.py"
Cohesion: 0.22
Nodes (17): CpSolver, _assert_relaxed_matches_validation(), _build_report(), _build_report_relaxed(), _empty_report(), _extract_schedule(), _num_workers(), Two-pass orchestration. `solve(payload)` runs pass 1 (strict); on INFEASIBLE it… (+9 more)

### Community 71 - "migrate_admin_email_allowlist.sql"
Cohesion: 0.47
Nodes (5): admin_email_allowlist, profiles_admin_allowlist_promote, public.apply_admin_allowlist(), public.current_user_is_allowlisted_admin(), public.apply_admin_allowlist

### Community 78 - "schemas.py"
Cohesion: 0.17
Nodes (19): BaseModel, get, health(), FastAPI app: POST /solve, GET /health. Kept deliberately thin -- request…, AyPriorModel, BlockModel, CapsModel, ConfigModel (+11 more)

### Community 79 - "make_resident"
Cohesion: 0.26
Nodes (17): make_resident(), _build(), test_day_then_eve_next_day_forbidden(), test_day_then_night_next_day_is_allowed_by_this_rule(), test_eve_then_day_next_day_forbidden(), test_more_than_two_night_run_segments_forbidden(), test_night_cap_enforced(), test_night_exempt_resident_skips_night_cap() (+9 more)

### Community 80 - "coverageComposition.js"
Cohesion: 0.15
Nodes (16): shiftCoverageForDate(), bucketLabel(), composeCoverage(), COVERAGE_GROUPS, groupForCategory(), BlockCalendarRow(), BlockMonthGrid(), computeCoverageByDate() (+8 more)

### Community 81 - "prettyDate"
Cohesion: 0.13
Nodes (18): jspdf, jspdf-autotable, xlsx, AYConferenceEditor(), BlockCalendarSection(), BlockContextBar(), detectHomeAndOffSheetsByContent(), exportMatrixPDF() (+10 more)

### Community 82 - "payload.py"
Cohesion: 0.15
Nodes (17): AyPrior, Block, Config, CoverageEntry, LockedCell, _parse_coverage(), _parse_eligible(), _parse_locked() (+9 more)

### Community 83 - "workday_limits.py"
Cohesion: 0.19
Nodes (13): as_literal(), const_lit(), Normalize a rolling-window/sequence term (python int OR a real BoolVar) into…, A fixed-value CP-SAT literal (usable in add_bool_and/or, OnlyEnforceIf, and…, _add_post_run6_rest(), _forbid_triple(), _link_work(), Rule 19 (work-day linking + max 6 consecutive work days) and rule 20 (>=24h… (+5 more)

### Community 84 - "AppGate.jsx"
Cohesion: 0.12
Nodes (16): lucide-react, react, SetNewPassword(), fetchRosterForPicker(), LoginScreen(), MODES, STATUS_STYLE, ResidentPicker() (+8 more)

### Community 86 - "getBlockDates"
Cohesion: 0.09
Nodes (39): baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname, errorCount(), loadBaseline(), makeBaselineSuite() (+31 more)

### Community 87 - "TermGroup"
Cohesion: 0.19
Nodes (24): add_em_composition_terms(), add_pgy_fallback_terms(), _area_shift_dates(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, Flat accumulator for one weighted-term family. Replaces the old `Tier` class,… (+16 more)

### Community 88 - "getEligibleShifts"
Cohesion: 0.17
Nodes (28): CTX, elig(), formatGapH(), gapIsShort(), shiftGapsFor(), buildResidentICS(), demoFilenameSuffix(), effectiveChiefRole() (+20 more)

### Community 89 - "RequestsTab.jsx"
Cohesion: 0.20
Nodes (12): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestPortalCard() (+4 more)

### Community 90 - "test_workday_limits.py"
Cohesion: 0.46
Nodes (7): _build(), test_obligation_day_forces_work_var_true_with_no_shift(), test_post_run6_rest_blocks_shift_within_24h_after_completed_run_isolated_from_rule19(), test_seven_consecutive_workdays_forbidden(), test_shift_well_after_run_is_allowed(), test_six_consecutive_workdays_allowed(), test_work_var_false_with_no_shift_and_no_obligation()

### Community 91 - "Solver performance investigation (2026-08-22)"
Cohesion: 0.17
Nodes (11): 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), 2. Per-module size contribution (isolated measurement), 3. The fix, 4. Correctness guardrail, 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Environment, Files touched (+3 more)

### Community 92 - "add_soft_sequence_constraint"
Cohesion: 0.29
Nodes (10): add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges(), test_run_at_or_above_soft_min_costs_nothing() (+2 more)

### Community 94 - "TimeOffModal"
Cohesion: 0.43
Nodes (5): applyDateRangePaint(), paintActionFor(), toggleDateInList(), TimeOffModal(), startDrag()

### Community 95 - "main.jsx"
Cohesion: 0.21
Nodes (7): AppGate(), crashKey(), ErrorBoundary, reportCrash(), ResidentRequestsApp(), submitFeedback(), SUPABASE_ENABLED

### Community 96 - "JeopardySickCallsCard"
Cohesion: 0.36
Nodes (5): computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), JeopardySickCallsCard(), addIncident()

### Community 97 - "JeopardyTab"
Cohesion: 0.27
Nodes (7): DATES6, dateInRanges(), fillJeopardy(), jeopardyCandidatesFor(), JeopardyTab(), runFill(), setCell()

### Community 98 - "SettingsTab"
Cohesion: 0.29
Nodes (7): getGeneralPedsTarget(), deleteDemo(), sbDeleteState(), SettingsTab(), clearAll(), qgendaDefaultForCompare(), updQgendaTask()

### Community 99 - "optimizerSweep.js"
Cohesion: 0.42
Nodes (7): buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates(), compareVectors()

### Community 100 - "RequestList"
Cohesion: 1.00
Nodes (3): RequestList(), cancel(), load()

### Community 101 - "solverClient.js"
Cohesion: 0.39
Nodes (6): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, solveRemote(), freshModule()

### Community 109 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

## Knowledge Gaps
- **181 isolated node(s):** `Imports & exports`, `CP-SAT solver service (optional second engine)`, `AREA_LAST_SHIFT`, `AY_CONF_DATE_FIELDS`, `BASE_ELIGIBILITY` (+176 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 503 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Payload` connect `Payload` to `builder.py`, `test_weight_tiering.py`, `timing.py`, `payload.py`, `workday_limits.py`, `validate.py`, `parse_payload`, `test_trauma_runs.py`, `TermGroup`, `VarStore`, `trauma_runs.py`, `build_variables`, `solve.py`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `parseDate()` connect `parseDate` to `holidays.js`, `ResidentScheduler.jsx`, `JeopardyTab`, `generateSchedule`, `formatDisplayDate`, `ScheduleGrid`, `buildStaticGenContext`, `vitest`, `parse.js`, `coverageComposition.js`, `journalClub.js`, `prettyDate`, `repairPass`, `validateAll`, `getBlockDates`, `getEligibleShifts`, `useMonthPager`, `TimeOffModal`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `vitest` connect `vitest` to `ResidentScheduler.jsx`, `coverage.js`, `parseDate`, `buildStaticGenContext`, `ShiftMatrixTab`, `parse.js`, `src/uiPrefs.js`, `journalClub.js`, `parseVacationWorkbook`, `useMonthPager`, `overrideCapture.test.js`, `holidays.js`, `scoreWeights.test.js`, `generateSchedule`, `qgendaImport.js`, `normalizeImportLog`, `validateAll`, `package.json`, `coverageComposition.js`, `getBlockDates`, `getEligibleShifts`, `TimeOffModal`, `JeopardySickCallsCard`, `JeopardyTab`, `optimizerSweep.js`, `solverClient.js`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Are the 53 inferred relationships involving `VarStore` (e.g. with `BuildResult` and `add_circadian_constraints()`) actually correct?**
  _`VarStore` has 53 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Imports & exports`, `CP-SAT solver service (optional second engine)`, `AREA_LAST_SHIFT` to the rest of the system?**
  _181 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.015588096362777516 - nodes in this community are weakly interconnected._