# Graph Report - resident-scheduler  (2026-09-06)

## Corpus Check
- 185 files · ~301,281 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1797 nodes · 4817 edges · 113 communities (74 shown, 18 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 205 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f7835561`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- variables.py
- blockLookup.js
- coverage.js
- getBlockDates
- parseDate
- ScheduleGrid
- Raw Session Log
- Resident Day-Off Request Implementation Plan
- syntheticRoster.js
- ShiftMatrixTab
- parse.js
- RulesTab
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- journalClub.js
- ShiftTiming
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- repairPass
- parseVacationWorkbook
- validate.py
- solve
- test_trauma_runs.py
- parse_payload
- useMonthPager
- elastic.py
- updateBlock
- Payload
- main.py
- Cloud Sync (Supabase)
- holidays.js
- scoreWeights.test.js
- Circadian Scheduling Rules
- Field-Ready Design System
- validateAll
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- builder.py
- prettyDate
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- qgendaImport.js
- showToast
- FeedbackAdminTab
- test_weight_tiering.py
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- normalizeImportLog
- chiefBenchmark.test.js
- SKILL.md
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
- migrate_admin_email_allowlist.sql
- CLAUDE.md
- schemas.py
- JeopardyTab
- DateListEditor
- exportResidentCalendarPDF
- payload.py
- workday_limits.py
- AppGate.jsx
- baselineSuite.js
- TermGroup
- splitName
- RequestsTab.jsx
- emCompositionAndPgyGating.test.js
- Solver performance investigation (2026-08-22)
- add_soft_sequence_constraint
- getAcademicYearFor
- main.jsx
- Efficiency Review
- shifts.js
- qgenda.js
- solverParity.test.js
- Session Log: 06-09-2026 18:35 - nd-option
- solverClient.js
- dependencies
- LitPool

## God Nodes (most connected - your core abstractions)
1. `Payload` - 119 edges
2. `parseDate()` - 100 edges
3. `parse_payload()` - 85 edges
4. `validateAll()` - 74 edges
5. `VarStore` - 73 edges
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
- `AY-to-Date Fairness Carryover` --references--> `computeQualityMetrics()`  [EXTRACTED]
  CLAUDE.md → src/lib/scheduleQuality.js
- `Work-Shape Scoring` --references--> `computeQualityMetrics()`  [EXTRACTED]
  CLAUDE.md → src/lib/scheduleQuality.js
- `SCORE_WEIGHTS Tier Audit` --references--> `SCORE_WEIGHTS`  [EXTRACTED]
  CLAUDE.md → src/ResidentScheduler.jsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **PWA Icon Set** — public_icons_icon_512_asset, public_icons_icon_192_asset, public_icons_apple_touch_icon_asset [INFERRED 0.75]
- **End-to-end day-off request flow: resident submission through chief approval into the schedule** — docs_superpowers_plans_2026_07_18_resident_day_off_requests_task7_request_form, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task10_approval_queue, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task11_pending_badge [INFERRED 0.85]
- **Feedback capture-to-triage pipeline: widget/crash capture write, admin function/tab read** — docs_superpowers_plans_2026_07_18_user_feedback_plan_task1_schema_helper, docs_superpowers_plans_2026_07_18_user_feedback_plan_task2_widget, docs_superpowers_plans_2026_07_18_user_feedback_plan_task3_crash_capture, docs_superpowers_plans_2026_07_18_user_feedback_plan_task4_admin_function, docs_superpowers_plans_2026_07_18_user_feedback_plan_task5_admin_tab [INFERRED 0.85]
- **Generator Quality Improvement Program** — claude_md_score_weights_audit, claude_md_work_shape_scoring, claude_md_ay_carryover, claude_md_override_capture [INFERRED 0.85]

## Communities (113 total, 18 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (118): RFC-4180, RFC-5545, bucketLabel(), AREA_LAST_SHIFT, AvailabilityRangesEditor(), AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS (+110 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.09
Nodes (27): getAcademicYear(), buildSnapData(), deepEqualNormalized(), makeDefaultBlock(), migratePedNightAssignments(), migratePedsPgy1ToPgy2(), normalizeForCompare(), ResidentScheduler() (+19 more)

### Community 2 - "variables.py"
Cohesion: 0.08
Nodes (35): date, add_circadian_constraints(), _add_eve_day_pairs(), _add_night_cap(), _add_night_run_segments(), _add_night_run_window(), _link_night(), Rule 18 (eve<->day adjacency + night-run<=6 sliding window), rule 22 (max… (+27 more)

### Community 3 - "blockLookup.js"
Cohesion: 0.20
Nodes (12): blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState(), findBlockForDate(), groupByBlock(), weeksUntil(), RequestForm() (+4 more)

### Community 4 - "coverage.js"
Cohesion: 0.08
Nodes (46): coverageFillStats(), applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE (+38 more)

### Community 5 - "getBlockDates"
Cohesion: 0.13
Nodes (20): getBlockDates(), acepFixture(), PRE_12H_EM_HOME_2, makeSnapshot(), nightSpreadFor(), VARIANTS, mulberry32(), computeQualityVector() (+12 more)

### Community 6 - "parseDate"
Cohesion: 0.13
Nodes (38): addDays(), getBlockWeekends(), parseDate(), qgendaDate(), toDateStr(), dateRange(), nightRun(), papaBare (+30 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.15
Nodes (23): checkGenerateReadiness(), updateBlockTracked(), ScheduleGrid(), applySweepCandidate(), assign(), cancelHover(), commitDrop(), generateViaSolverOrLocal() (+15 more)

### Community 8 - "Raw Session Log"
Cohesion: 0.04
Nodes (45): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+37 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "syntheticRoster.js"
Cohesion: 0.14
Nodes (14): papaFixture(), runValidate(), buildStandardRoster(), CONFERENCE_AY_CONF, makeBlock(), makeDefaultAppSettings(), makeFixture(), makeResident() (+6 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.13
Nodes (32): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+24 more)

### Community 12 - "parse.js"
Cohesion: 0.18
Nodes (15): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), parseDateRangeInAY(), parseRosterText(), NOTE: CATEGORIES/CAT_MAP/normalizeToken/DATE_RANGE_RE are not in the original… (+7 more)

### Community 13 - "RulesTab"
Cohesion: 0.12
Nodes (15): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+7 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.07
Nodes (34): GRID_GROUP_MODE_DEFAULT, GRID_GROUP_MODES, groupResidents(), PGY_GROUPS, pushNonEmpty(), ROTATION_EM_STYLE, BLOCK_TYPES, ROSTER (+26 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.11
Nodes (19): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+11 more)

### Community 16 - "journalClub.js"
Cohesion: 0.14
Nodes (19): ayWindowFor(), getFirstTuesdaysInRange(), isFirstTuesday(), isJcDate(), isJcDateAnyAy(), jcDatesInRange(), resolveJcDates(), sortedDedupedDates() (+11 more)

### Community 17 - "ShiftTiming"
Cohesion: 0.15
Nodes (20): _parse_shifts(), gap_between(), overlaps_hour_window(), Absolute minute offset (arbitrary but consistent epoch) a shift begins on…, Absolute minute offset the shift ends -- may land on the next calendar day., Rule 17: required rest gap equals the EARLIER shift's own duration., Minutes from shift1's end to shift2's start (negative = overlap)., Whether a shift's local [start, end) interval overlaps an hour-of-day window… (+12 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (21): auth, auth.users, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests, day_off_requests_cancel_guard (+13 more)

### Community 19 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 20 - "repairPass"
Cohesion: 0.20
Nodes (23): compositionSatisfies(), flexWellnessSubstituteAllowed(), fillDayPass(), hasSenior(), repairPass(), assignCell(), backfillVacated(), chainUnfilledSlot() (+15 more)

### Community 21 - "parseVacationWorkbook"
Cohesion: 0.30
Nodes (10): matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), findVacationSections(), pickFile(), matchLectureRosterName() (+2 more)

### Community 22 - "validate.py"
Cohesion: 0.17
Nodes (27): _check_circadian_pairs(), _check_consecutive_work(), _check_count_caps(), _check_coverage_max(), _check_eligibility_and_locked(), _check_hours_cap(), _check_night_run_and_cap_and_segments(), _check_post_run6_rest() (+19 more)

### Community 23 - "solve"
Cohesion: 0.16
Nodes (25): solve(), load_fixture(), schedule_has(), test_build_response_shape_matches_schema(), test_cross_midnight_rest_forces_reassignment(), test_small_feasible_solves_and_meets_coverage_min(), Batch 2: pass-2 elastic relaxation, conflict naming, feasibility report., Best-effort per the plan -- ortools' `sufficient_assumptions_for_… (+17 more)

### Community 24 - "test_trauma_runs.py"
Cohesion: 0.14
Nodes (33): _add_isolated_night_term(), Batch 2's night-run-shape relaxation (plan section B): runs of 2-6 nights are…, _build(), _build_alt(), _cost_of(), _dates(), Batch 2 (chief round-2 plan, "Confirmed rule changes" A/B/C): trauma-run hard…, Solves for the MINIMUM of the given weighted terms, not just any feasible value… (+25 more)

### Community 25 - "parse_payload"
Cohesion: 0.12
Nodes (51): parse_payload(), add_rest_constraints(), build_variables(), make_payload(), make_resident(), Shared tiny-payload builders for the model-family unit tests. Not a test module…, _build(), test_day_then_eve_next_day_forbidden() (+43 more)

### Community 26 - "useMonthPager"
Cohesion: 0.28
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), containers, Harness(), mountPager(), Harness() (+2 more)

### Community 27 - "elastic.py"
Cohesion: 0.16
Nodes (22): build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, add_coverage_constraints(), CoverageResult, Rules 24-25: per-(shift, date) staffing minimum/maximum. Max side is always a…, `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, build_elastic_model() (+14 more)

### Community 28 - "updateBlock"
Cohesion: 0.17
Nodes (16): DashboardTab(), onStartDateChange(), setBlockField(), updSD(), EMResidentsTab(), removeRes(), setBA(), target() (+8 more)

### Community 29 - "Payload"
Cohesion: 0.09
Nodes (55): Payload, _add_band8_terms(), _add_dow_preference_term(), _add_fairness_terms(), _add_intern_pair_term(), _add_peds_mix_and_fm1_terms(), _add_post_night_rest_term(), _add_spread() (+47 more)

### Community 30 - "main.py"
Cohesion: 0.20
Nodes (12): get, post, health(), FastAPI app: POST /solve, GET /health. Kept deliberately thin -- request…, solve_endpoint(), main(), CLI entry point for the solver, independent of the FastAPI service. python…, PayloadError (+4 more)

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

### Community 36 - "validateAll"
Cohesion: 0.14
Nodes (34): isNightShiftId(), blockDayIndex(), buildSolverPayload(), checkCircadianViolations(), countNightsInSchedule(), countPublishedTraumaNights(), eligKey(), emCompositionRequired() (+26 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "builder.py"
Cohesion: 0.13
Nodes (17): build_recommendations(), build_violations(), _coverage_recommendation(), _coverage_violations(), _duty_recommendation(), _generic_recommendation(), _index_failures(), payload_to_raw() (+9 more)

### Community 40 - "prettyDate"
Cohesion: 0.23
Nodes (12): formatAY(), normalizeToken(), AYConferenceEditor(), BlockContextBar(), detectHomeAndOffSheetsByContent(), extractVacationDateCells(), ImportMatrixModal(), commit() (+4 more)

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "qgendaImport.js"
Cohesion: 0.19
Nodes (19): buildQGendaImport(), buildScheduleFromImport(), cell(), countDayNumbers(), countDowCells(), DOW_INDEX, findDayNumberRow(), isoFrom() (+11 more)

### Community 45 - "showToast"
Cohesion: 0.13
Nodes (21): getGeneralPedsTarget(), deleteBlockSnapshot(), deleteDemo(), enterDemoFresh(), enterDemoResume(), exitDemo(), flushPendingCloudSave(), saveCloudNow() (+13 more)

### Community 46 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 47 - "test_weight_tiering.py"
Cohesion: 0.13
Nodes (22): apply_rule_priority(), load_default_weights(), merged_weights(), _priority_order(), Static config, read once per process rather than per solve. Cached safely…, Relative order of the two objective-relevant rulePriority entries, ignoring…, Returns a copy of `weights` with the lower-ranked of coverageMin/ postNightRest…, _anti_fill_sum() (+14 more)

### Community 52 - "normalizeImportLog"
Cohesion: 0.19
Nodes (15): appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), AddResidentModal(), ImportHistoryPanel(), deleteEntry(), ImportLecturesModal(), commit() (+7 more)

### Community 53 - "chiefBenchmark.test.js"
Cohesion: 0.13
Nodes (9): buildAllResidents(), __dirname, nightRunsFor(), PYTHON, REPO_ROOT, SOLVER_DIR, buildAllResidents(), nightRunsFor() (+1 more)

### Community 63 - "solve.py"
Cohesion: 0.20
Nodes (18): CpSolver, build_feasibility_report(), _assert_relaxed_matches_validation(), _build_report(), _build_report_relaxed(), _empty_report(), _extract_schedule(), _num_workers() (+10 more)

### Community 71 - "migrate_admin_email_allowlist.sql"
Cohesion: 0.47
Nodes (5): admin_email_allowlist, profiles_admin_allowlist_promote, public.apply_admin_allowlist(), public.current_user_is_allowlisted_admin(), public.apply_admin_allowlist

### Community 78 - "schemas.py"
Cohesion: 0.21
Nodes (16): BaseModel, AyPriorModel, BlockModel, CapsModel, ConfigModel, CoverageEntryModel, HealthResponse, LockedCellModel (+8 more)

### Community 79 - "JeopardyTab"
Cohesion: 0.27
Nodes (7): DATES6, dateInRanges(), fillJeopardy(), jeopardyCandidatesFor(), JeopardyTab(), runFill(), setCell()

### Community 80 - "DateListEditor"
Cohesion: 0.22
Nodes (4): DateListEditor(), WorkRestrictionsEditor(), describe(), remove()

### Community 81 - "exportResidentCalendarPDF"
Cohesion: 0.22
Nodes (16): buildResidentICS(), demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), icsEscape(), icsStamp(), offRequestEntryFor(), pdfDemoBanner() (+8 more)

### Community 82 - "payload.py"
Cohesion: 0.10
Nodes (27): AyPrior, Block, Config, CoverageEntry, LockedCell, _parse_coverage(), _parse_eligible(), _parse_locked() (+19 more)

### Community 83 - "workday_limits.py"
Cohesion: 0.17
Nodes (18): _add_post_run6_rest(), _add_six_day_window(), add_workday_limit_constraints(), _forbid_triple(), _link_work(), Rule 19 (work-day linking + max 6 consecutive work days) and rule 20 (>=24h…, Forbid (run6_end AND shift1 AND shift2) firing together. `run6_val` is a plain…, work[r,d] == max(any shift assigned that day, obligation that day). `sum(x)` is… (+10 more)

### Community 84 - "AppGate.jsx"
Cohesion: 0.13
Nodes (13): SetNewPassword(), fetchRosterForPicker(), LoginScreen(), MODES, ResidentPicker(), ALLOWED_EMAIL_DOMAIN, AUTH_ENABLED, isUnresolvedToken() (+5 more)

### Community 86 - "baselineSuite.js"
Cohesion: 0.21
Nodes (12): baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname, errorCount(), loadBaseline(), makeBaselineSuite() (+4 more)

### Community 87 - "TermGroup"
Cohesion: 0.18
Nodes (25): add_em_composition_terms(), add_pgy_fallback_terms(), _area_shift_dates(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, _add_em_composition_round2b_terms() (+17 more)

### Community 88 - "splitName"
Cohesion: 0.36
Nodes (8): splitName(), findDateHeaderRow(), inferGroupPgy(), matchBlockType(), parseHomeResidentMatrix(), parseHomeResidentMatrixGrouped(), parseSequentialDateRange(), pgyExclusiveRotationIds()

### Community 89 - "RequestsTab.jsx"
Cohesion: 0.20
Nodes (12): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestPortalCard() (+4 more)

### Community 90 - "emCompositionAndPgyGating.test.js"
Cohesion: 0.43
Nodes (6): block, emCountWarnings(), issuesFor(), offService(), pgyGateWarnings(), res()

### Community 91 - "Solver performance investigation (2026-08-22)"
Cohesion: 0.17
Nodes (11): 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), 2. Per-module size contribution (isolated measurement), 3. The fix, 4. Correctness guardrail, 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Environment, Files touched (+3 more)

### Community 92 - "add_soft_sequence_constraint"
Cohesion: 0.29
Nodes (10): add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges(), test_run_at_or_above_soft_min_costs_nothing() (+2 more)

### Community 94 - "getAcademicYearFor"
Cohesion: 0.18
Nodes (12): getAcademicYearFor(), applyDateRangePaint(), paintActionFor(), toggleDateInList(), computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), applyStartDate() (+4 more)

### Community 95 - "main.jsx"
Cohesion: 0.17
Nodes (10): AppGate(), crashKey(), ErrorBoundary, reportCrash(), ResidentRequestsApp(), FeedbackWidget(), handleSubmit(), reset() (+2 more)

### Community 96 - "Efficiency Review"
Cohesion: 0.05
Nodes (37): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+29 more)

### Community 97 - "shifts.js"
Cohesion: 0.08
Nodes (43): CTX, elig(), block, compositionIssues(), AREA_COLORS, formatGapH(), gapIsShort(), JC_WINDOW_END_H (+35 more)

### Community 98 - "qgenda.js"
Cohesion: 0.52
Nodes (5): QGENDA_NAME_FORMATS, QGENDA_TASKS, QGENDA_VARIANTS, qgendaName(), qgendaTaskFor()

### Community 99 - "solverParity.test.js"
Cohesion: 0.33
Nodes (4): __dirname, PYTHON, REPO_ROOT, SOLVER_DIR

### Community 100 - "Session Log: 06-09-2026 18:35 - nd-option"
Cohesion: 0.12
Nodes (16): Applied, Assistant, Assistant, Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Recent Commits, Reuse review findings (+8 more)

### Community 101 - "solverClient.js"
Cohesion: 0.39
Nodes (6): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, solveRemote(), freshModule()

### Community 108 - "dependencies"
Cohesion: 0.04
Nodes (47): autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jsdom, lucide-react, dependencies, @fontsource/barlow (+39 more)

### Community 109 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

## Knowledge Gaps
- **266 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+261 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 595 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Payload` connect `Payload` to `variables.py`, `builder.py`, `test_weight_tiering.py`, `payload.py`, `workday_limits.py`, `solve`, `validate.py`, `TermGroup`, `test_trauma_runs.py`, `parse_payload`, `elastic.py`, `solve.py`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `parse_payload()` connect `parse_payload` to `builder.py`, `test_weight_tiering.py`, `ShiftTiming`, `payload.py`, `workday_limits.py`, `TermGroup`, `solve`, `test_trauma_runs.py`, `validate.py`, `elastic.py`, `Payload`, `main.py`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `ShiftMatrixTab()` connect `ShiftMatrixTab` to `ResidentScheduler.jsx`, `updateBlock`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Are the 54 inferred relationships involving `VarStore` (e.g. with `BuildResult` and `add_circadian_constraints()`) actually correct?**
  _`VarStore` has 54 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _266 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.017539149888143177 - nodes in this community are weakly interconnected._