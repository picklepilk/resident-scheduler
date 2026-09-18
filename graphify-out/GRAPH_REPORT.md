# Graph Report - resident-scheduler  (2026-09-17)

## Corpus Check
- 193 files · ~332,115 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1791 nodes · 4868 edges · 110 communities (93 shown, 17 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 208 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8ddf5047`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- dependencies
- ResidentRequestsApp.jsx
- coverage.js
- formatDisplayDate
- dates.js
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
- parseDate
- solve
- make_resident
- parse_payload
- TimeOffModal
- holidays.js
- updateBlock
- normalizeImportLog
- RequestsTab.jsx
- Cloud Sync (Supabase)
- baselineSuite.js
- scoreWeights.test.js
- Circadian Scheduling Rules
- Field-Ready Design System
- generateSchedule
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- validate.py
- useWalkthroughSeen.js
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- qgendaImport.js
- getBlockDates
- FeedbackAdminTab
- objective.py
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- solve.py
- chiefBenchmark.test.js
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
- LitPool
- main.jsx
- trauma_runs.py
- schemas.py
- Admin walkthrough steps (`/`)
- solver-service
- Payload
- test_em_composition.py
- shifts.js
- main.py
- useSpotlightTarget
- Solver performance investigation (2026-08-22)
- add_soft_sequence_constraint
- CLAUDE.md
- test_circadian.py
- prettyDate
- emCompositionAndPgyGating.test.js
- JeopardyTab
- showToast
- optimizerSweep.js
- scheduleQuality.test.js
- solverClient.js
- test_count_caps.py
- DateListEditor
- splitName
- qgenda.js

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

## Communities (110 total, 17 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (112): RFC-4180, RFC-5545, bucketLabel(), REPORT, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS (+104 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.09
Nodes (26): getAcademicYear(), buildSnapData(), deepEqualNormalized(), makeDefaultBlock(), migratePedNightAssignments(), migratePedsPgy1ToPgy2(), normalizeForCompare(), ResidentScheduler() (+18 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (47): autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jsdom, lucide-react, dependencies, @fontsource/barlow (+39 more)

### Community 3 - "ResidentRequestsApp.jsx"
Cohesion: 0.10
Nodes (24): SetNewPassword(), blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState(), fetchRosterForPicker(), findBlockForDate(), groupByBlock() (+16 more)

### Community 4 - "coverage.js"
Cohesion: 0.14
Nodes (23): applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, DOW_COVERAGE_OVERRIDE (+15 more)

### Community 5 - "formatDisplayDate"
Cohesion: 0.09
Nodes (19): AvailabilityRangesEditor(), BlockCalendarSection(), computeScarceSeniorReservations(), DragConfirmModal(), FeasibilityReportCard(), formatDisplayDate(), GenerationReportCard(), getTraumaCap() (+11 more)

### Community 6 - "dates.js"
Cohesion: 0.10
Nodes (26): ayWindowFor(), getAcademicYearFor(), getBlockWeekends(), qgendaDate(), computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), getFirstTuesdaysInRange() (+18 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.14
Nodes (24): solveRemote(), checkGenerateReadiness(), updateBlockTracked(), ScheduleGrid(), applySweepCandidate(), assign(), cancelHover(), commitDrop() (+16 more)

### Community 8 - "getEligibleShifts"
Cohesion: 0.09
Nodes (44): CTX, elig(), blockTypeFilterPasses(), buildResidentICS(), computeTotalTargetDemand(), demoFilenameSuffix(), effectiveChiefRole(), effectiveWellnessWednesdayDate() (+36 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "syntheticRoster.js"
Cohesion: 0.09
Nodes (20): papaFixture(), runValidate(), buildStandardRoster(), CONFERENCE_AY_CONF, makeBlock(), makeDefaultAppSettings(), makeFixture(), makeResident() (+12 more)

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
Cohesion: 0.16
Nodes (16): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+8 more)

### Community 16 - "Walkthrough.jsx"
Cohesion: 0.16
Nodes (19): GettingStartedFooter(), UserGuideTab(), CARD_GAP, CARD_H_FALLBACK, CARD_W, cornerBox(), inflate(), overlapArea() (+11 more)

### Community 17 - "builder.py"
Cohesion: 0.11
Nodes (20): _assigned_count_for_cap(), build_recommendations(), build_violations(), _cap_recommendation(), _coverage_recommendation(), _coverage_violations(), _duty_recommendation(), _generic_recommendation() (+12 more)

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
Cohesion: 0.30
Nodes (10): matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), findVacationSections(), pickFile(), matchLectureRosterName() (+2 more)

### Community 22 - "parseDate"
Cohesion: 0.14
Nodes (44): addDays(), parseDate(), toDateStr(), dateRange(), nightRun(), papaBare, runValidate(), sixDayRun() (+36 more)

### Community 23 - "solve"
Cohesion: 0.16
Nodes (25): solve(), load_fixture(), schedule_has(), test_build_response_shape_matches_schema(), test_cross_midnight_rest_forces_reassignment(), test_small_feasible_solves_and_meets_coverage_min(), Batch 2: pass-2 elastic relaxation, conflict naming, feasibility report., Best-effort per the plan -- ortools' `sufficient_assumptions_for_… (+17 more)

### Community 24 - "make_resident"
Cohesion: 0.11
Nodes (50): Resident, _add_isolated_night_term(), Flat accumulator for one weighted-term family. Replaces the old `Tier` class,…, Batch 2's night-run-shape relaxation (plan section B): runs of 2-6 nights are…, TermGroup, add_peds_intern_night_deficit_term(), Index set (into `payload.all_dates`) of every position where…, deficit_r = max(0, pedsInternNightTarget - assigned_peds_nights_r) for every… (+42 more)

### Community 25 - "parse_payload"
Cohesion: 0.08
Nodes (56): AyPrior, Block, Config, CoverageEntry, LockedCell, _parse_coverage(), _parse_eligible(), _parse_locked() (+48 more)

### Community 26 - "TimeOffModal"
Cohesion: 0.17
Nodes (15): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), applyDateRangePaint(), paintActionFor(), toggleDateInList(), containers (+7 more)

### Community 27 - "holidays.js"
Cohesion: 0.26
Nodes (17): buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy(), holidaysInRange() (+9 more)

### Community 28 - "updateBlock"
Cohesion: 0.17
Nodes (16): DashboardTab(), onStartDateChange(), setBlockField(), updSD(), EMResidentsTab(), removeRes(), setBA(), target() (+8 more)

### Community 29 - "normalizeImportLog"
Cohesion: 0.19
Nodes (15): appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), AddResidentModal(), ImportHistoryPanel(), deleteEntry(), ImportLecturesModal(), commit() (+7 more)

### Community 30 - "RequestsTab.jsx"
Cohesion: 0.16
Nodes (13): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestPortalCard() (+5 more)

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "baselineSuite.js"
Cohesion: 0.21
Nodes (12): baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname, errorCount(), loadBaseline(), makeBaselineSuite() (+4 more)

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
Cohesion: 0.15
Nodes (27): getCoverageFor(), shiftActiveOnDow(), shiftOverlapsJC(), blockDayIndex(), buildSolverPayload(), compositionSatisfies(), computeAyPriorTotals(), computeTotalCoverageSupply() (+19 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "validate.py"
Cohesion: 0.08
Nodes (51): date_diff_days(), gap_between(), _ordinal_minutes(), overlaps_hour_window(), The ONLY cross-midnight math in the solver. Every constraint family that needs…, later - earlier, in days (can be negative)., Absolute minute offset (arbitrary but consistent epoch) a shift begins on…, Absolute minute offset the shift ends -- may land on the next calendar day. (+43 more)

### Community 40 - "useWalkthroughSeen.js"
Cohesion: 0.24
Nodes (12): mergeWalkthroughSeen(), readLocalMirror(), useWalkthroughSeen(), WALKTHROUGH_SEEN_LS_KEY, writeLocalMirror(), WalkthroughProvider(), WalkthroughRoot(), APP_KEY (+4 more)

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "qgendaImport.js"
Cohesion: 0.19
Nodes (19): buildQGendaImport(), buildScheduleFromImport(), cell(), countDayNumbers(), countDowCells(), DOW_INDEX, findDayNumberRow(), isoFrom() (+11 more)

### Community 45 - "getBlockDates"
Cohesion: 0.24
Nodes (12): getBlockDates(), makeSnapshot(), nightSpreadFor(), VARIANTS, computeQualityVector(), buildQualityInput(), generateScheduleBest(), normalizeRulePriority() (+4 more)

### Community 46 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 47 - "objective.py"
Cohesion: 0.08
Nodes (42): date, CoverageResult, _add_band8_terms(), _add_coverage_term(), _add_dow_preference_term(), _add_fairness_terms(), _add_intern_pair_term(), _add_post_night_rest_term() (+34 more)

### Community 52 - "solve.py"
Cohesion: 0.20
Nodes (18): CpSolver, build_feasibility_report(), _assert_relaxed_matches_validation(), _build_report(), _build_report_relaxed(), _empty_report(), _extract_schedule(), _num_workers() (+10 more)

### Community 53 - "chiefBenchmark.test.js"
Cohesion: 0.11
Nodes (12): buildAllResidents(), __dirname, nightRunsFor(), PYTHON, REPO_ROOT, SOLVER_DIR, buildAllResidents(), coverageFillStats() (+4 more)

### Community 80 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

### Community 81 - "main.jsx"
Cohesion: 0.16
Nodes (11): AppGate(), crashKey(), ErrorBoundary, reportCrash(), ResidentRequestsApp(), FeedbackWidget(), handleSubmit(), reset() (+3 more)

### Community 82 - "trauma_runs.py"
Cohesion: 0.13
Nodes (27): _add_trauma_run_batch2_terms(), add_night_duration_alternation_terms(), add_second_rest_day_terms(), add_trauma_mid_run_terms(), add_trauma_second_in_run_terms(), _and_cost_var(), _night_duration_classes(), _night_possible_indices() (+19 more)

### Community 83 - "schemas.py"
Cohesion: 0.21
Nodes (16): BaseModel, AyPriorModel, BlockModel, CapsModel, ConfigModel, CoverageEntryModel, HealthResponse, LockedCellModel (+8 more)

### Community 84 - "Admin walkthrough steps (`/`)"
Cohesion: 0.09
Nodes (21): 1. Dashboard — your command center, 1. Request a day off, 2. EM Residents — the roster, 2. Requesting more than one date, 3. Reason (optional), 3. Shift Matrix — who can work what, 4. Schedule — the grid, 4. Submit request (+13 more)

### Community 85 - "solver-service"
Cohesion: 0.10
Nodes (18): Notes, Objective tiers (high → low; integer weights derived at build time with ratchet separation), Request — `POST /solve`, Response, Rule registry ids (report/`rule` field values), Solver Payload Schema v1, Alternates, Contract (+10 more)

### Community 86 - "Payload"
Cohesion: 0.07
Nodes (65): build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, Payload, add_circadian_constraints(), _add_eve_day_pairs(), _add_night_cap(), _add_night_run_segments() (+57 more)

### Community 87 - "test_em_composition.py"
Cohesion: 0.19
Nodes (23): add_em_composition_terms(), add_pgy_fallback_terms(), _area_shift_dates(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, _add_em_composition_round2b_terms() (+15 more)

### Community 88 - "shifts.js"
Cohesion: 0.15
Nodes (21): groupedSpread(), groupKey(), RULE_METRIC_FIELD, stddevPop(), AREA_COLORS, formatGapH(), gapIsShort(), JC_WINDOW_END_H (+13 more)

### Community 89 - "main.py"
Cohesion: 0.20
Nodes (12): get, post, health(), FastAPI app: POST /solve, GET /health. Kept deliberately thin -- request…, solve_endpoint(), main(), CLI entry point for the solver, independent of the FastAPI service. python…, PayloadError (+4 more)

### Community 90 - "useSpotlightTarget"
Cohesion: 0.24
Nodes (13): ACQUIRE_TIMEOUT_MS, prefersReducedMotion(), rectsEqual(), roundRect(), SETTLE_FRAMES, useSpotlightTarget(), acquire(), acquireLoop() (+5 more)

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
Cohesion: 0.23
Nodes (12): formatAY(), normalizeToken(), AYConferenceEditor(), BlockContextBar(), detectHomeAndOffSheetsByContent(), extractVacationDateCells(), ImportMatrixModal(), commit() (+4 more)

### Community 96 - "emCompositionAndPgyGating.test.js"
Cohesion: 0.23
Nodes (9): acepFixture(), PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService(), pgyGateWarnings(), res() (+1 more)

### Community 97 - "JeopardyTab"
Cohesion: 0.27
Nodes (7): DATES6, dateInRanges(), fillJeopardy(), jeopardyCandidatesFor(), JeopardyTab(), runFill(), setCell()

### Community 98 - "showToast"
Cohesion: 0.13
Nodes (20): getGeneralPedsTarget(), deleteBlockSnapshot(), deleteDemo(), enterDemoFresh(), enterDemoResume(), exitDemo(), flushPendingCloudSave(), saveCloudNow() (+12 more)

### Community 99 - "optimizerSweep.js"
Cohesion: 0.42
Nodes (7): buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates(), compareVectors()

### Community 100 - "scheduleQuality.test.js"
Cohesion: 0.22
Nodes (7): AREA_CONCENTRATION_FLOOR, assignedCount(), betterQuality(), computeQualityMetrics(), secondRestDayPenaltyFor(), NIGHT_RULES, traumaRunPenaltyFor()

### Community 101 - "solverClient.js"
Cohesion: 0.43
Nodes (5): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, freshModule()

### Community 102 - "test_count_caps.py"
Cohesion: 0.52
Nodes (6): _build(), test_target_ceiling_enforced(), test_target_none_means_no_ceiling(), test_trauma_cap_enforced(), test_trauma_peds_split_peds_half_ok_when_trauma_half_ok(), test_trauma_peds_split_sub_caps_are_independent()

### Community 107 - "DateListEditor"
Cohesion: 0.22
Nodes (4): DateListEditor(), WorkRestrictionsEditor(), describe(), remove()

### Community 108 - "splitName"
Cohesion: 0.36
Nodes (8): splitName(), findDateHeaderRow(), inferGroupPgy(), matchBlockType(), parseHomeResidentMatrix(), parseHomeResidentMatrixGrouped(), parseSequentialDateRange(), pgyExclusiveRotationIds()

### Community 109 - "qgenda.js"
Cohesion: 0.52
Nodes (5): QGENDA_NAME_FORMATS, QGENDA_TASKS, QGENDA_VARIANTS, qgendaName(), qgendaTaskFor()

## Knowledge Gaps
- **218 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+213 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Payload` connect `Payload` to `validate.py`, `objective.py`, `builder.py`, `trauma_runs.py`, `solve.py`, `solve`, `test_em_composition.py`, `make_resident`, `parse_payload`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `parse_payload()` connect `parse_payload` to `test_count_caps.py`, `validate.py`, `objective.py`, `builder.py`, `make_resident`, `Payload`, `solve`, `test_em_composition.py`, `main.py`, `test_circadian.py`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `parseDate()` connect `parseDate` to `ResidentScheduler.jsx`, `JeopardyTab`, `coverage.js`, `scheduleQuality.test.js`, `dates.js`, `generateSchedule`, `getEligibleShifts`, `formatDisplayDate`, `syntheticRoster.js`, `ScheduleGrid`, `getBlockDates`, `repairPass`, `chiefBenchmark.test.js`, `shifts.js`, `TimeOffModal`, `holidays.js`, `prettyDate`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Are the 53 inferred relationships involving `VarStore` (e.g. with `BuildResult` and `add_circadian_constraints()`) actually correct?**
  _`VarStore` has 53 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _218 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.017780441514334232 - nodes in this community are weakly interconnected._