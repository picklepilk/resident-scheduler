# Graph Report - resident-scheduler  (2026-09-26)

## Corpus Check
- 196 files · ~319,875 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .toml 2, .mdc 1)

## Summary
- 2151 nodes · 5575 edges · 120 communities (85 shown, 35 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 400 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7c1a210e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- dependencies
- ResidentRequestsApp.jsx
- shifts.js
- formatDisplayDate
- ResidentCard
- ScheduleGrid
- Raw Session Log
- Resident Day-Off Request Implementation Plan
- vitest
- ShiftMatrixTab
- objective.py
- builder.py
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- tourGeometry.js
- 4. Real data vs. descriptive text
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- repairPass
- qgendaImport.js
- parseDate
- solve
- test_trauma_runs.py
- parse_payload
- TimeOffModal
- holidays.js
- getAcademicYearFor
- trauma_runs.py
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
- Summary
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- parse.js
- getBlockDates
- FeedbackAdminTab
- load_default_weights
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- solve.py
- chiefBenchmark.solver.test.js
- normalizeImportLog
- cli.py
- Caveman Terse-Response Mode (Cline rule)
- Caveman Terse-Response Mode (Copilot rule)
- Caveman Terse-Response Mode (OpenCode rule)
- Caveman Terse-Response Mode (Windsurf rule)
- blockLookup.js
- Dark Mode
- Dashboard/Home Merge
- PDF Export (jspdf-autotable)
- QGenda CSV Export Rework
- Soft Rule Priority
- What's New Banner
- migrate_admin_email_allowlist.sql
- useWalkthroughSeen.js
- dates.js
- matchRosterByName
- exportResidentCalendarPDF
- LitPool
- package.json
- Overall: All addressed
- main.py
- Resident walkthrough (`/requests`)
- Payload
- test_em_composition.py
- Done — 7 PRs open, all review-clean, nothing touched prod branches
- payload.py
- useSpotlightTarget.js
- Solver performance investigation (2026-08-22)
- add_soft_sequence_constraint
- Walkthrough.jsx
- Admin walkthrough steps (`/`)
- Efficiency Review
- RulesTab
- showToast
- runOptimizationSweep
- Session Log: 06-09-2026 18:35 - nd-option
- solverClient.js
- DayRulesEditor
- BlockCalendarRow
- a520850a30cde04cc-users-amade-appdata-local 2026-09-18
- devDependencies
- overrideCapture.test.js
- SidebarNav
- nthWeekdayOnOrAfter
- Raw Session Log
- Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local
- scripts
- target
- normalizeForCompare
- nd-option 2026-09-06

## God Nodes (most connected - your core abstractions)
1. `Payload` - 119 edges
2. `parseDate()` - 101 edges
3. `4. Real data vs. descriptive text` - 94 edges
4. `parse_payload()` - 85 edges
5. `validateAll()` - 76 edges
6. `VarStore` - 74 edges
7. `make_resident()` - 71 edges
8. `ResidentScheduler()` - 63 edges
9. `toDateStr()` - 58 edges
10. `Summary` - 55 edges

## Surprising Connections (you probably didn't know these)
- `User` --references--> `generateScheduleBest()`  [INFERRED]
  CC-Session-Logs/06-09-2026-18_35-nd-option.md → src/ResidentScheduler.jsx
- `Reuse review findings` --references--> `isEm()`  [INFERRED]
  CC-Session-Logs/06-09-2026-18_35-nd-option.md → src/lib/scheduleGrouping.test.js
- `All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify.` --references--> `main()`  [INFERRED]
  CC-Session-Logs/18-09-2026-11_21-a520850a30cde04cc-users-amade-appdata-local.md → solver-service/cli.py
- `User` --references--> `main()`  [INFERRED]
  CC-Session-Logs/18-09-2026-11_21-a520850a30cde04cc-users-amade-appdata-local.md → solver-service/cli.py
- `Simplification Review` --references--> `terms_for()`  [INFERRED]
  CC-Session-Logs/06-09-2026-18_35-nd-option.md → solver-service/solver/model/count_caps.py

## Import Cycles
- None detected.

## Communities (120 total, 35 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (101): RFC-4180, RFC-5545, AREA_COLORS, JC_WINDOW_END_H, JC_WINDOW_START_H, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY (+93 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.10
Nodes (30): getAcademicYear(), buildSnapData(), isSchedulable(), makeDefaultBlock(), mapSolverResult(), ResidentScheduler(), blockReset(), deleteCurrentBlock() (+22 more)

### Community 2 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, qrcode (+4 more)

### Community 3 - "ResidentRequestsApp.jsx"
Cohesion: 0.15
Nodes (13): react, SetNewPassword(), fetchRosterForPicker(), LoginScreen(), MODES, STATUS_STYLE, ResidentPicker(), ALLOWED_EMAIL_DOMAIN (+5 more)

### Community 4 - "shifts.js"
Cohesion: 0.12
Nodes (29): applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, DOW_COVERAGE_OVERRIDE (+21 more)

### Community 5 - "formatDisplayDate"
Cohesion: 0.07
Nodes (18): AvailabilityRangesEditor(), BlockCalendarSection(), DateListEditor(), DragConfirmModal(), FeasibilityReportCard(), formatDisplayDate(), getMissingSpecialDayLists(), ResidentForm() (+10 more)

### Community 6 - "ResidentCard"
Cohesion: 0.16
Nodes (20): formatGapH(), gapIsShort(), shiftGapsFor(), buildResidentICS(), effectiveWellnessWednesdayDate(), gapWords(), getEffectiveDayRules(), grWorkDow() (+12 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.14
Nodes (27): solveRemote(), checkGenerateReadiness(), isEmResident(), offServiceWindowStatus(), updateBlockTracked(), ScheduleGrid(), applySweepCandidate(), assign() (+19 more)

### Community 8 - "Raw Session Log"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "vitest"
Cohesion: 0.07
Nodes (40): vitest, resident(), acepFixture(), PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService() (+32 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.14
Nodes (30): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+22 more)

### Community 12 - "objective.py"
Cohesion: 0.08
Nodes (40): Skipped, date, datetime, functools, pathlib, CoverageResult, _add_band8_terms(), _add_coverage_term() (+32 more)

### Community 13 - "builder.py"
Cohesion: 0.06
Nodes (44): _parse_shifts(), gap_between(), overlaps_hour_window(), Absolute minute offset (arbitrary but consistent epoch) a shift begins on…, Absolute minute offset the shift ends -- may land on the next calendar day., Rule 17: required rest gap equals the EARLIER shift's own duration., Minutes from shift1's end to shift2's start (negative = overlap)., Whether a shift's local [start, end) interval overlaps an hour-of-day window… (+36 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.08
Nodes (32): react-dom, GRID_GROUP_MODE_DEFAULT, GRID_GROUP_MODES, groupResidents(), PGY_GROUPS, pushNonEmpty(), ROTATION_EM_STYLE, BLOCK_TYPES (+24 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.16
Nodes (16): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+8 more)

### Community 16 - "tourGeometry.js"
Cohesion: 0.24
Nodes (13): 2. Implementation details, CARD_GAP, CARD_H_FALLBACK, CARD_W, cornerBox(), inflate(), overlapArea(), pickCardCorner() (+5 more)

### Community 17 - "4. Real data vs. descriptive text"
Cohesion: 0.02
Nodes (91): 4. Real data vs. descriptive text, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+83 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (22): auth, auth.users, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests, day_off_requests_cancel_guard (+14 more)

### Community 19 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 20 - "repairPass"
Cohesion: 0.37
Nodes (16): hasSenior(), repairPass(), assignCell(), backfillVacated(), chainUnfilledSlot(), compositionStillSatisfied(), filledCount(), minFor() (+8 more)

### Community 21 - "qgendaImport.js"
Cohesion: 0.17
Nodes (20): QGENDA_NAME_FORMATS, QGENDA_TASKS, QGENDA_VARIANTS, qgendaName(), qgendaTaskFor(), cell(), countDayNumbers(), countDowCells() (+12 more)

### Community 22 - "parseDate"
Cohesion: 0.14
Nodes (46): addDays(), getBlockWeekends(), parseDate(), toDateStr(), dateRange(), nightRun(), papaBare, runValidate() (+38 more)

### Community 23 - "solve"
Cohesion: 0.17
Nodes (23): copy, solve(), load_fixture(), test_cross_midnight_rest_forces_reassignment(), Batch 2: pass-2 elastic relaxation, conflict naming, feasibility report., Best-effort per the plan -- ortools' `sufficient_assumptions_for_…, If validate.py's rest-gap checker silently stopped detecting the violation the…, Default mode: coverage-min is already elastic in pass 1, so a plain staffing… (+15 more)

### Community 24 - "test_trauma_runs.py"
Cohesion: 0.12
Nodes (42): 4. Correctness guardrail, _add_isolated_night_term(), Flat accumulator for one weighted-term family. Replaces the old `Tier` class,…, Batch 2's night-run-shape relaxation (plan section B): runs of 2-6 nights are…, TermGroup, add_night_duration_alternation_terms(), Index set (into `payload.all_dates`) of every position where…, Generalizes the trauma-9h-vs-other-durations mixing rule to ANY pair of night-… (+34 more)

### Community 25 - "parse_payload"
Cohesion: 0.08
Nodes (69): ortools_sat_python, parse_payload(), add_coverage_constraints(), `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, apply_rule_priority(), merged_weights(), Returns a copy of `weights` with the lower-ranked of coverageMin/ postNightRest…, build_variables() (+61 more)

### Community 26 - "TimeOffModal"
Cohesion: 0.17
Nodes (15): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), applyDateRangePaint(), paintActionFor(), toggleDateInList(), containers (+7 more)

### Community 27 - "holidays.js"
Cohesion: 0.24
Nodes (18): formatAY(), buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy() (+10 more)

### Community 28 - "getAcademicYearFor"
Cohesion: 0.09
Nodes (29): getAcademicYearFor(), DATES6, computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), applyStartDate(), DashboardTab(), onStartDateChange() (+21 more)

### Community 29 - "trauma_runs.py"
Cohesion: 0.10
Nodes (36): Assistant, Simplification Review, User, itertools, 2. Per-module size contribution (isolated measurement), 3. The fix, TL;DR, add_second_rest_day_terms() (+28 more)

### Community 30 - "RequestsTab.jsx"
Cohesion: 0.20
Nodes (12): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestPortalCard() (+4 more)

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
Cohesion: 0.10
Nodes (35): Applied, CP-SAT solver service (optional second engine), shiftOverlapsJC(), blockDayIndex(), buildSolverPayload(), compositionSatisfies(), generateSchedule(), candidatePool() (+27 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "validate.py"
Cohesion: 0.21
Nodes (22): _check_circadian_pairs(), _check_consecutive_work(), _check_count_caps(), _check_coverage_max(), _check_eligibility_and_locked(), _check_hours_cap(), _check_night_run_and_cap_and_segments(), _check_post_run6_rest() (+14 more)

### Community 40 - "Summary"
Cohesion: 0.04
Nodes (50): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+42 more)

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "parse.js"
Cohesion: 0.10
Nodes (33): Imports & exports, CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), normalizeToken(), parseDateRangeInAY() (+25 more)

### Community 45 - "getBlockDates"
Cohesion: 0.11
Nodes (31): Assistant, Reuse review findings, User, User, coverageFillStats(), getCoverageFor(), shiftCoverageForDate(), twelveHourStateFor() (+23 more)

### Community 46 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 47 - "load_default_weights"
Cohesion: 0.17
Nodes (12): load_default_weights(), Static config, read once per process rather than per solve. Cached safely…, _anti_fill_sum(), _generous_soft_objective_max(), Generous, finite upper bound on the ENTIRE soft objective's total contribution,…, Each relaxation tier's PER-LITERAL weight is far above the soft objective's own…, Sum every literal in every pass-2 pool at its own weight, plus a generous…, Sum of every per-assignment term that could ever prefer NOT filling a slot… (+4 more)

### Community 52 - "solve.py"
Cohesion: 0.20
Nodes (18): CpSolver, _assert_relaxed_matches_validation(), _build_report(), _build_report_relaxed(), _empty_report(), _extract_schedule(), _num_workers(), Two-pass orchestration. `solve(payload)` runs pass 1 (strict); on INFEASIBLE it… (+10 more)

### Community 53 - "chiefBenchmark.solver.test.js"
Cohesion: 0.08
Nodes (22): ref_node_child_process, ref_node_fs, ref_node_os, ref_node_path, ref_node_url, vite, @vitejs/plugin-react, buildAllResidents() (+14 more)

### Community 54 - "normalizeImportLog"
Cohesion: 0.16
Nodes (19): appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), entry(), buildScheduleFromImport(), AddResidentModal(), ImportHistoryPanel(), deleteEntry() (+11 more)

### Community 58 - "cli.py"
Cohesion: 0.14
Nodes (17): argparse, All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify., User, json, post, solve_endpoint(), main(), CLI entry point for the solver, independent of the FastAPI service. python… (+9 more)

### Community 63 - "blockLookup.js"
Cohesion: 0.18
Nodes (13): blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState(), findBlockForDate(), groupByBlock(), weeksUntil(), RequestForm() (+5 more)

### Community 71 - "migrate_admin_email_allowlist.sql"
Cohesion: 0.47
Nodes (5): admin_email_allowlist, profiles_admin_allowlist_promote, public.apply_admin_allowlist(), public.current_user_is_allowlisted_admin(), public.apply_admin_allowlist

### Community 76 - "useWalkthroughSeen.js"
Cohesion: 0.18
Nodes (16): User, User, User, Decisions, Round 2 (resident walkthrough), UserGuideTab(), mergeWalkthroughSeen(), readLocalMirror() (+8 more)

### Community 77 - "dates.js"
Cohesion: 0.24
Nodes (14): ayWindowFor(), qgendaDate(), getFirstTuesdaysInRange(), isFirstTuesday(), isJcDate(), isJcDateAnyAy(), jcDatesInRange(), resolveJcDates() (+6 more)

### Community 78 - "matchRosterByName"
Cohesion: 0.20
Nodes (15): xlsx, matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), buildQGendaImport(), extractVacationDateCells() (+7 more)

### Community 79 - "exportResidentCalendarPDF"
Cohesion: 0.33
Nodes (12): jspdf, jspdf-autotable, demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), pdfDemoBanner(), pdfPageFooter(), pdfPageHeader() (+4 more)

### Community 80 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

### Community 81 - "package.json"
Cohesion: 0.10
Nodes (18): name, private, type, version, autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono (+10 more)

### Community 82 - "Overall: All addressed"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 83 - "main.py"
Cohesion: 0.13
Nodes (24): BaseModel, fastapi, fastapi_middleware_cors, get, importlib_metadata, os, pydantic, health() (+16 more)

### Community 84 - "Resident walkthrough (`/requests`)"
Cohesion: 0.22
Nodes (10): User, 1. Request a day off, 2. Requesting more than one date, 3. Reason (optional), 4. Submit request, 5. Track your requests, Resident walkthrough (`/requests`), AppGate() (+2 more)

### Community 86 - "Payload"
Cohesion: 0.07
Nodes (63): dataclasses, build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, Payload, Resident, add_circadian_constraints(), _add_eve_day_pairs() (+55 more)

### Community 87 - "test_em_composition.py"
Cohesion: 0.19
Nodes (23): add_em_composition_terms(), add_pgy_fallback_terms(), _area_shift_dates(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, _add_em_composition_round2b_terms() (+15 more)

### Community 88 - "Done — 7 PRs open, all review-clean, nothing touched prod branches"
Cohesion: 0.08
Nodes (25): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+17 more)

### Community 89 - "payload.py"
Cohesion: 0.11
Nodes (24): AyPrior, Block, Config, CoverageEntry, LockedCell, _parse_coverage(), _parse_eligible(), _parse_locked() (+16 more)

### Community 90 - "useSpotlightTarget.js"
Cohesion: 0.24
Nodes (13): ACQUIRE_TIMEOUT_MS, prefersReducedMotion(), rectsEqual(), roundRect(), SETTLE_FRAMES, useSpotlightTarget(), acquire(), acquireLoop() (+5 more)

### Community 91 - "Solver performance investigation (2026-08-22)"
Cohesion: 0.25
Nodes (7): 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Environment, Files touched, Reproduction, Solver performance investigation (2026-08-22)

### Community 92 - "add_soft_sequence_constraint"
Cohesion: 0.29
Nodes (10): add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges(), test_run_at_or_above_soft_min_costs_nothing() (+2 more)

### Community 94 - "Walkthrough.jsx"
Cohesion: 0.25
Nodes (11): User, User, lucide-react, GettingStartedFooter(), CORNER_CLASS, useIsMobile(), useWalkthroughContext(), Walkthrough() (+3 more)

### Community 95 - "Admin walkthrough steps (`/`)"
Cohesion: 0.14
Nodes (13): 1. Dashboard — your command center, 2. EM Residents — the roster, 3. Shift Matrix — who can work what, 4. Schedule — the grid, 5. Scheduling Rules — coverage targets, 6. Violations — the generation report, 7. Jeopardy — backup call, 8. Requests — resident day-off requests (+5 more)

### Community 96 - "Efficiency Review"
Cohesion: 0.05
Nodes (37): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+29 more)

### Community 97 - "RulesTab"
Cohesion: 0.15
Nodes (5): describeDayRules(), describeShiftGates(), eligKey(), RulesTab(), renderCoverageCell()

### Community 98 - "showToast"
Cohesion: 0.14
Nodes (19): FeedbackWidget(), handleSubmit(), reset(), getGeneralPedsTarget(), deleteBlockSnapshot(), deleteDemo(), enterDemoFresh(), showToast() (+11 more)

### Community 99 - "runOptimizationSweep"
Cohesion: 0.33
Nodes (9): buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates(), runOptimizationSweep(), requestSweep() (+1 more)

### Community 100 - "Session Log: 06-09-2026 18:35 - nd-option"
Cohesion: 0.22
Nodes (8): Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Recent Commits, Session Log: 06-09-2026 18:35 - nd-option, Tool Activity, Verification, Working Tree At Close

### Community 101 - "solverClient.js"
Cohesion: 0.43
Nodes (5): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, freshModule()

### Community 102 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 107 - "BlockCalendarRow"
Cohesion: 0.24
Nodes (10): bucketLabel(), BlockCalendarRow(), BlockMonthGrid(), CoverageByAreaView(), CoverageByDateView(), coverageDayStatus(), CoverageTotalsView(), getActiveCoverageShifts() (+2 more)

### Community 109 - "devDependencies"
Cohesion: 0.25
Nodes (8): devDependencies, autoprefixer, jsdom, postcss, tailwindcss, vite, @vitejs/plugin-react, vitest

### Community 110 - "overrideCapture.test.js"
Cohesion: 0.29
Nodes (5): REPORT, diffScheduleCells(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 111 - "SidebarNav"
Cohesion: 0.33
Nodes (7): CollapsibleCard(), reconcileTabOrder(), reorderIds(), SidebarNav(), renderTabButton(), resetDrag(), useUiPrefsContext()

### Community 112 - "nthWeekdayOnOrAfter"
Cohesion: 0.33
Nodes (7): conferenceAwayPgys(), conferenceDefs(), flexWellnessSubstituteAllowed(), isConferenceAwayFor(), nthWeekdayOnOrAfter(), podWellnessSubstituteAllowed(), seniorWellnessSubstituteAllowed()

### Community 113 - "Raw Session Log"
Cohesion: 0.17
Nodes (12): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Raw Session Log (+4 more)

### Community 114 - "Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local"
Cohesion: 0.22
Nodes (8): 3. Verbatim excerpts, Files Modified, New breakage: 1 Minor, Quick Reference (for AI scanning), Quick Resume Context, Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local, Tool Activity, Working Tree At Close

### Community 115 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, preview, test

## Knowledge Gaps
- **507 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+502 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 845 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Efficiency Review` connect `Efficiency Review` to `RulesTab`, `shifts.js`, `generateSchedule`, `Session Log: 06-09-2026 18:35 - nd-option`, `ScheduleGrid`, `parse.js`, `getBlockDates`, `load_default_weights`, `Payload`, `trauma_runs.py`?**
  _High betweenness centrality (0.227) - this node is a cross-community bridge._
- **Why does `VarStore` connect `Payload` to `Efficiency Review`, `objective.py`, `test_em_composition.py`, `test_trauma_runs.py`, `parse_payload`, `trauma_runs.py`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **Why does `Payload` connect `Payload` to `validate.py`, `objective.py`, `builder.py`, `solve.py`, `solve`, `test_em_composition.py`, `test_trauma_runs.py`, `payload.py`, `trauma_runs.py`, `parse_payload`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `validateAll()` (e.g. with `Reuse review findings` and `CP-SAT solver service (optional second engine)`) actually correct?**
  _`validateAll()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _507 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.01658374792703151 - nodes in this community are weakly interconnected._