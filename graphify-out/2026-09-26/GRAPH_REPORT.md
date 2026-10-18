# Graph Report - resident-scheduler  (2026-09-26)

## Corpus Check
- 210 files · ~348,602 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .toml 2, .mdc 1)

## Summary
- 2357 nodes · 6120 edges · 121 communities (87 shown, 34 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 507 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d4035628`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- dependencies
- shifts.js
- getEligibleShifts
- variables.py
- main.py
- ScheduleGrid
- Raw Session Log
- Resident Day-Off Request Implementation Plan
- vitest
- ShiftMatrixTab
- test_trauma_runs.py
- builder.py
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- Walkthrough.jsx
- 4. Real data vs. descriptive text
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- Findings
- payload.py
- formatDisplayDate
- schemas.py
- add
- parse_payload
- useMonthPager
- dates.js
- updateBlock
- Archived from CLAUDE.md on 2026-09-26 (compaction)
- formatResidentName
- Cloud Sync (Supabase)
- parseDate
- cellAlternatives.js
- Circadian Scheduling Rules
- Field-Ready Design System
- validateAll
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- solve
- Summary
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- parse.js
- Payload
- getBlockDates
- test_workday_limits.py
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- RequestsTab.jsx
- engineHeadToHead.test.js
- prettyDate
- BlockCalendarRow
- Caveman Terse-Response Mode (Cline rule)
- Caveman Terse-Response Mode (Copilot rule)
- Caveman Terse-Response Mode (OpenCode rule)
- Caveman Terse-Response Mode (Windsurf rule)
- overrideCapture.test.js
- Dark Mode
- Dashboard/Home Merge
- PDF Export (jspdf-autotable)
- QGenda CSV Export Rework
- Soft Rule Priority
- What's New Banner
- migrate_admin_email_allowlist.sql
- useWalkthroughSeen.js
- validate.py
- matchRosterByName
- exportResidentCalendarPDF
- DayRulesEditor
- optimizerSweep.js
- Overall: All addressed
- SidebarNav
- Solver performance investigation (2026-08-22)
- qgenda.js
- blockStatus.test.js
- objective.py
- Done — 7 PRs open, all review-clean, nothing touched prod branches
- session 2026-09-26
- useSpotlightTarget.js
- ResidentCard
- add_soft_sequence_constraint
- checkGenerateReadiness
- Resident walkthrough (`/requests`)
- Efficiency Review
- solve.py
- RulesTab
- qgendaImport.js
- Session Log: 06-09-2026 18:35 - nd-option
- solverClient.js
- pedNightMigration.test.js
- reviewPanel.test.js
- a520850a30cde04cc-users-amade-appdata-local 2026-09-18
- devDependencies
- fetchWithTimeout
- Raw Session Log
- Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local
- Raw Session Log
- package.json
- SettingsTab
- LitPool
- scoreWeights.test.js
- nd-option 2026-09-06
- holidays.js

## God Nodes (most connected - your core abstractions)
1. `Payload` - 119 edges
2. `parseDate()` - 106 edges
3. `4. Real data vs. descriptive text` - 94 edges
4. `parse_payload()` - 90 edges
5. `validateAll()` - 83 edges
6. `make_resident()` - 75 edges
7. `VarStore` - 74 edges
8. `ScheduleGrid()` - 71 edges
9. `ResidentScheduler()` - 66 edges
10. `Findings` - 62 edges

## Surprising Connections (you probably didn't know these)
- `When editing` --references--> `getEligibleShifts()`  [INFERRED]
  CLAUDE-Archive.md → src/ResidentScheduler.jsx
- `Reuse review findings` --references--> `isEm()`  [INFERRED]
  CC-Session-Logs/06-09-2026-18_35-nd-option.md → src/lib/scheduleGrouping.test.js
- `Efficiency Review` --references--> `computeCoverageByDate()`  [INFERRED]
  CC-Session-Logs/06-09-2026-18_35-nd-option.md → src/ResidentScheduler.jsx
- `UI conventions (full originals)` --references--> `computeCoverageByDate()`  [INFERRED]
  CLAUDE-Archive.md → src/ResidentScheduler.jsx
- `Imports & exports` --references--> `parseSequentialDateRange()`  [INFERRED]
  .claude/skills/imports-exports/SKILL.md → src/ResidentScheduler.jsx

## Import Cycles
- None detected.

## Communities (121 total, 34 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (100): RFC-4180, RFC-5545, AREA_COLORS, JC_WINDOW_END_H, JC_WINDOW_START_H, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY (+92 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.10
Nodes (29): getAcademicYear(), buildSnapData(), makeDefaultBlock(), ResidentScheduler(), blockReset(), buildGridCSVRows(), confirmPublishStep(), deleteBlockSnapshot() (+21 more)

### Community 2 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, qrcode (+4 more)

### Community 3 - "shifts.js"
Cohesion: 0.15
Nodes (18): AREA_CONCENTRATION_FLOOR, assignedCount(), groupedSpread(), groupKey(), RULE_METRIC_FIELD, secondRestDayPenaltyFor(), stddevPop(), NIGHT_RULES (+10 more)

### Community 4 - "getEligibleShifts"
Cohesion: 0.09
Nodes (43): Assistant, Reuse review findings, User, 12-hour shift windows, coverageFillStats(), applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS (+35 more)

### Community 5 - "variables.py"
Cohesion: 0.09
Nodes (33): dataclasses, ortools_sat_python, build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, Rules 24-25: per-(shift, date) staffing minimum/maximum. Min side depends on…, build_elastic_model(), ElasticBuildResult (+25 more)

### Community 6 - "main.py"
Cohesion: 0.11
Nodes (20): argparse, All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify., User, fastapi, fastapi_middleware_cors, get, importlib_metadata, json (+12 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.12
Nodes (28): isLongShiftId(), updateBlockTracked(), ScheduleGrid(), applyAssign(), applyGive(), applySweepCandidate(), assign(), cancelHover() (+20 more)

### Community 8 - "Raw Session Log"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "vitest"
Cohesion: 0.07
Nodes (32): vitest, SEEDS, acepFixture(), PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService() (+24 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.13
Nodes (33): Rule-default migration, applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty() (+25 more)

### Community 12 - "test_trauma_runs.py"
Cohesion: 0.07
Nodes (73): Applied, 2. Per-module size contribution (isolated measurement), 3. The fix, 4. Correctness guardrail, TL;DR, _add_trauma_run_batch2_terms(), add_night_duration_alternation_terms(), add_peds_intern_night_deficit_term() (+65 more)

### Community 13 - "builder.py"
Cohesion: 0.06
Nodes (52): datetime, _parse_shifts(), date_diff_days(), gap_between(), _ordinal_minutes(), overlaps_hour_window(), The ONLY cross-midnight math in the solver. Every constraint family that needs…, later - earlier, in days (can be negative). (+44 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.08
Nodes (30): GRID_GROUP_MODE_DEFAULT, GRID_GROUP_MODES, groupResidents(), PGY_GROUPS, pushNonEmpty(), ROTATION_EM_STYLE, BLOCK_TYPES, isEm() (+22 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.16
Nodes (16): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+8 more)

### Community 16 - "Walkthrough.jsx"
Cohesion: 0.19
Nodes (17): 2. Implementation details, CARD_GAP, CARD_H_FALLBACK, CARD_W, cornerBox(), inflate(), overlapArea(), pickCardCorner() (+9 more)

### Community 17 - "4. Real data vs. descriptive text"
Cohesion: 0.02
Nodes (91): 4. Real data vs. descriptive text, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+83 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (22): auth, auth.users, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests, day_off_requests_cancel_guard (+14 more)

### Community 19 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 20 - "Findings"
Cohesion: 0.06
Nodes (65): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+57 more)

### Community 21 - "payload.py"
Cohesion: 0.15
Nodes (17): AyPrior, Block, Config, CoverageEntry, LockedCell, _parse_coverage(), _parse_eligible(), _parse_locked() (+9 more)

### Community 22 - "formatDisplayDate"
Cohesion: 0.09
Nodes (20): UI conventions (full originals), AvailabilityRangesEditor(), DragConfirmModal(), FeasibilityReportCard(), formatDisplayDate(), GenerationReportCard(), JeopardySickCallsCard(), addIncident() (+12 more)

### Community 23 - "schemas.py"
Cohesion: 0.20
Nodes (17): BaseModel, pydantic, AyPriorModel, BlockModel, CapsModel, ConfigModel, CoverageEntryModel, HealthResponse (+9 more)

### Community 24 - "add"
Cohesion: 0.13
Nodes (9): BlockCalendarSection(), DateListEditor(), getMissingSpecialDayLists(), updateAyData(), SpecialDaysList(), WorkRestrictionsEditor(), add(), describe() (+1 more)

### Community 25 - "parse_payload"
Cohesion: 0.08
Nodes (70): What changed, parse_payload(), add_coverage_constraints(), `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, apply_rule_priority(), load_default_weights(), merged_weights(), Static config, read once per process rather than per solve. Cached safely… (+62 more)

### Community 26 - "useMonthPager"
Cohesion: 0.30
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), Harness(), mountPager(), Harness(), MonthCalendarView (+2 more)

### Community 27 - "dates.js"
Cohesion: 0.14
Nodes (24): Scheduling rules (full originals), ayWindowFor(), formatAY(), getAcademicYearFor(), qgendaDate(), applyDateRangePaint(), paintActionFor(), toggleDateInList() (+16 more)

### Community 28 - "updateBlock"
Cohesion: 0.07
Nodes (33): User, Policy (2026-09-26, mirrors `fix/under-target-lift`'s JS-side changes), Solver objective weight policy: target vs. soft rules vs. overstaffing, What was already aligned (no change needed), _anti_fill_sum(), Sum of every per-assignment term that could ever prefer NOT filling a slot…, test_coverage_min_dominates_anti_fill_terms(), DATES6 (+25 more)

### Community 29 - "Archived from CLAUDE.md on 2026-09-26 (compaction)"
Cohesion: 0.25
Nodes (7): Archived: 2026-09-26 (session-end hook, PICKLEBOOK), Archived from CLAUDE.md on 2026-09-26 (compaction), Auth, CLAUDE.md Archive, Layout & stack, When editing, AUTH_ENABLED()

### Community 30 - "formatResidentName"
Cohesion: 0.21
Nodes (11): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestsTab() (+3 more)

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "parseDate"
Cohesion: 0.15
Nodes (42): addDays(), getBlockWeekends(), parseDate(), toDateStr(), nightRunsFor(), dateRange(), nightRun(), papaBare (+34 more)

### Community 33 - "cellAlternatives.js"
Cohesion: 0.38
Nodes (7): byDeficitThenSoftCount(), clearCell(), findAssignOptions(), findGiveCandidates(), findSwapCandidates(), RESIDENTS, underTargetScore()

### Community 34 - "Circadian Scheduling Rules"
Cohesion: 0.40
Nodes (5): Circadian Scheduling Rules, Grand Rounds Lecture Day-Before Rule, Chief-Editable Journal Club Dates, Journal Club Rules, PED-N Split Into Two Shift IDs

### Community 35 - "Field-Ready Design System"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 36 - "validateAll"
Cohesion: 0.09
Nodes (40): Assistant, Assistant, runValidate(), runValidate(), shiftOverlapsJC(), buildSolverPayload(), buildStaticGenContext(), compositionSatisfies() (+32 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "solve"
Cohesion: 0.13
Nodes (30): copy, solve(), load_fixture(), schedule_has(), test_build_response_shape_matches_schema(), test_cross_midnight_rest_forces_reassignment(), test_small_feasible_solves_and_meets_coverage_min(), Batch 2: pass-2 elastic relaxation, conflict naming, feasibility report. (+22 more)

### Community 40 - "Summary"
Cohesion: 0.04
Nodes (53): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+45 more)

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "parse.js"
Cohesion: 0.14
Nodes (24): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), normalizeToken(), parseDateRangeInAY(), parseRosterText() (+16 more)

### Community 45 - "Payload"
Cohesion: 0.08
Nodes (44): date, Payload, Resident, add_circadian_constraints(), _add_eve_day_pairs(), _add_night_cap(), _add_night_run_segments(), _add_night_run_window() (+36 more)

### Community 46 - "getBlockDates"
Cohesion: 0.11
Nodes (32): User, Generator (full originals), CP-SAT solver service (optional second engine), baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname (+24 more)

### Community 47 - "test_workday_limits.py"
Cohesion: 0.46
Nodes (7): _build(), test_obligation_day_forces_work_var_true_with_no_shift(), test_post_run6_rest_blocks_shift_within_24h_after_completed_run_isolated_from_rule19(), test_seven_consecutive_workdays_forbidden(), test_shift_well_after_run_is_allowed(), test_six_consecutive_workdays_allowed(), test_work_var_false_with_no_shift_and_no_obligation()

### Community 52 - "RequestsTab.jsx"
Cohesion: 0.10
Nodes (27): lucide-react, react, SetNewPassword(), RequestPortalCard(), blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState() (+19 more)

### Community 53 - "engineHeadToHead.test.js"
Cohesion: 0.06
Nodes (37): User, ref_node_child_process, ref_node_fs, ref_node_os, ref_node_path, ref_node_url, vite, @vitejs/plugin-react (+29 more)

### Community 54 - "prettyDate"
Cohesion: 0.16
Nodes (20): Imports & exports, appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), AddResidentModal(), AYConferenceEditor(), ImportHistoryPanel(), deleteEntry() (+12 more)

### Community 58 - "BlockCalendarRow"
Cohesion: 0.29
Nodes (8): BlockCalendarRow(), BlockMonthGrid(), CoverageByAreaView(), CoverageByDateView(), coverageDayStatus(), getActiveCoverageShifts(), shiftCellStatus(), toPerShiftCounts()

### Community 63 - "overrideCapture.test.js"
Cohesion: 0.29
Nodes (5): REPORT, diffScheduleCells(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 71 - "migrate_admin_email_allowlist.sql"
Cohesion: 0.47
Nodes (5): admin_email_allowlist, profiles_admin_allowlist_promote, public.apply_admin_allowlist(), public.current_user_is_allowlisted_admin(), public.apply_admin_allowlist

### Community 76 - "useWalkthroughSeen.js"
Cohesion: 0.17
Nodes (18): User, User, Decisions, Round 2 (resident walkthrough), GettingStartedFooter(), UserGuideTab(), mergeWalkthroughSeen(), readLocalMirror() (+10 more)

### Community 77 - "validate.py"
Cohesion: 0.16
Nodes (27): _check_circadian_pairs(), _check_consecutive_work(), _check_count_caps(), _check_coverage_max(), _check_eligibility_and_locked(), _check_hours_cap(), _check_night_run_and_cap_and_segments(), _check_post_run6_rest() (+19 more)

### Community 78 - "matchRosterByName"
Cohesion: 0.16
Nodes (17): xlsx, matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), extractVacationDateCells(), findVacationSections() (+9 more)

### Community 79 - "exportResidentCalendarPDF"
Cohesion: 0.30
Nodes (12): jspdf, jspdf-autotable, demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), offRequestEntryFor(), pdfDemoBanner(), pdfPageFooter() (+4 more)

### Community 80 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 81 - "optimizerSweep.js"
Cohesion: 0.42
Nodes (7): buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates(), compareVectors()

### Community 82 - "Overall: All addressed"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 83 - "SidebarNav"
Cohesion: 0.33
Nodes (7): CollapsibleCard(), reconcileTabOrder(), reorderIds(), SidebarNav(), renderTabButton(), resetDrag(), useUiPrefsContext()

### Community 84 - "Solver performance investigation (2026-08-22)"
Cohesion: 0.33
Nodes (5): 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Files touched, Reproduction, Solver performance investigation (2026-08-22)

### Community 85 - "qgenda.js"
Cohesion: 0.28
Nodes (14): normalizeQgendaHeaderOverrides(), QGENDA_COLUMN_DEFAULTS, QGENDA_JEOPARDY_TASK_ID, QGENDA_NAME_FORMATS, QGENDA_TASKS, QGENDA_VARIANTS, qgendaEndDate(), qgendaName() (+6 more)

### Community 86 - "blockStatus.test.js"
Cohesion: 0.24
Nodes (6): BLOCK_STEP_IDS, deriveBlockSteps(), formatShortDate(), SHORT_MONTHS, BASE, BlockContextBar()

### Community 87 - "objective.py"
Cohesion: 0.08
Nodes (58): Assistant, Simplification Review, Skipped, functools, itertools, pathlib, CoverageResult, add_em_composition_terms() (+50 more)

### Community 88 - "Done — 7 PRs open, all review-clean, nothing touched prod branches"
Cohesion: 0.08
Nodes (25): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+17 more)

### Community 90 - "useSpotlightTarget.js"
Cohesion: 0.24
Nodes (13): ACQUIRE_TIMEOUT_MS, prefersReducedMotion(), rectsEqual(), roundRect(), SETTLE_FRAMES, useSpotlightTarget(), acquire(), acquireLoop() (+5 more)

### Community 91 - "ResidentCard"
Cohesion: 0.16
Nodes (21): Shift catalog & data model, classifyCellIssues(), formatGapH(), gapIsShort(), shiftGapsFor(), buildResidentICS(), effectiveChiefRole(), effectiveWellnessWednesdayDate() (+13 more)

### Community 92 - "add_soft_sequence_constraint"
Cohesion: 0.29
Nodes (10): add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges(), test_run_at_or_above_soft_min_costs_nothing() (+2 more)

### Community 94 - "checkGenerateReadiness"
Cohesion: 0.36
Nodes (6): keptCellsForMode(), issues, lockedCells, schedule, violatingCells(), checkGenerateReadiness()

### Community 95 - "Resident walkthrough (`/requests`)"
Cohesion: 0.08
Nodes (25): User, User, 1. Dashboard — your command center, 1. Request a day off, 2. EM Residents — the roster, 2. Requesting more than one date, 3. Reason (optional), 3. Shift Matrix — who can work what (+17 more)

### Community 96 - "Efficiency Review"
Cohesion: 0.05
Nodes (37): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+29 more)

### Community 97 - "solve.py"
Cohesion: 0.15
Nodes (22): CpSolver, os, Known gap (not fixed here, out of scope), 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), Environment, _assert_relaxed_matches_validation(), _build_report(), _build_report_relaxed() (+14 more)

### Community 98 - "RulesTab"
Cohesion: 0.15
Nodes (5): describeDayRules(), describeShiftGates(), eligKey(), RulesTab(), renderCoverageCell()

### Community 99 - "qgendaImport.js"
Cohesion: 0.19
Nodes (19): buildQGendaImport(), buildScheduleFromImport(), cell(), countDayNumbers(), countDowCells(), DOW_INDEX, findDayNumberRow(), isoFrom() (+11 more)

### Community 100 - "Session Log: 06-09-2026 18:35 - nd-option"
Cohesion: 0.22
Nodes (8): Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Recent Commits, Session Log: 06-09-2026 18:35 - nd-option, Tool Activity, Verification, Working Tree At Close

### Community 101 - "solverClient.js"
Cohesion: 0.39
Nodes (6): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, solveRemote(), freshModule()

### Community 107 - "reviewPanel.test.js"
Cohesion: 0.17
Nodes (20): coverageDirection(), GROUP_MESSAGE_LABELS, groupIssuesByKind(), groupKeyForIssue(), groupPanelIssues(), isJumpableIssue(), ISSUE_RULE_LABELS, issueJumpTarget() (+12 more)

### Community 109 - "devDependencies"
Cohesion: 0.25
Nodes (8): devDependencies, autoprefixer, jsdom, postcss, tailwindcss, vite, @vitejs/plugin-react, vitest

### Community 110 - "fetchWithTimeout"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 113 - "Raw Session Log"
Cohesion: 0.17
Nodes (12): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Raw Session Log (+4 more)

### Community 114 - "Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local"
Cohesion: 0.22
Nodes (8): 3. Verbatim excerpts, Files Modified, New breakage: 1 Minor, Quick Reference (for AI scanning), Quick Resume Context, Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local, Tool Activity, Working Tree At Close

### Community 115 - "Raw Session Log"
Cohesion: 0.09
Nodes (22): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+14 more)

### Community 117 - "package.json"
Cohesion: 0.07
Nodes (29): name, private, scripts, build, dev, preview, test, type (+21 more)

### Community 120 - "SettingsTab"
Cohesion: 0.15
Nodes (18): Persistence, getGeneralPedsTarget(), deleteDemo(), enterDemoFresh(), enterDemoResume(), exitDemo(), flushPendingCloudSave(), openDemoModal() (+10 more)

### Community 121 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

### Community 122 - "scoreWeights.test.js"
Cohesion: 0.40
Nodes (5): bandOf(), groupBand(), preferenceKeys, structuralKeys, SCORE_TIERS

### Community 128 - "holidays.js"
Cohesion: 0.26
Nodes (17): buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy(), holidaysInRange() (+9 more)

## Knowledge Gaps
- **588 isolated node(s):** `SHIFT_ORDER_INDEX`, `SHIFT_LABEL_BY_ID`, `QGENDA_NAME_FORMAT_LABEL`, `BLOCK_TYPES_EM`, `BLOCK_TYPE_MAP` (+583 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 948 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Efficiency Review` connect `Efficiency Review` to `parseDate`, `RulesTab`, `getEligibleShifts`, `validateAll`, `Session Log: 06-09-2026 18:35 - nd-option`, `ScheduleGrid`, `test_trauma_runs.py`, `Payload`, `getBlockDates`, `formatDisplayDate`, `prettyDate`, `parse_payload`?**
  _High betweenness centrality (0.213) - this node is a cross-community bridge._
- **Why does `VarStore` connect `Payload` to `Efficiency Review`, `variables.py`, `test_trauma_runs.py`, `objective.py`, `parse_payload`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **Why does `Payload` connect `Payload` to `solve.py`, `variables.py`, `solve`, `test_trauma_runs.py`, `builder.py`, `validate.py`, `payload.py`, `objective.py`, `parse_payload`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `validateAll()` (e.g. with `Reuse review findings` and `Assistant`) actually correct?**
  _`validateAll()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `SHIFT_ORDER_INDEX`, `SHIFT_LABEL_BY_ID`, `QGENDA_NAME_FORMAT_LABEL` to the rest of the system?**
  _588 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.01627202334193693 - nodes in this community are weakly interconnected._