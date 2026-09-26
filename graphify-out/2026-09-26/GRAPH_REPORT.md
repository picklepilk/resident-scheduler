# Graph Report - resident-scheduler  (2026-09-26)

## Corpus Check
- 196 files · ~319,875 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .toml 2, .mdc 1)

## Summary
- 2153 nodes · 5236 edges · 112 communities (77 shown, 35 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 228 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7c1a210e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- dependencies
- supabaseClient.js
- coverage.js
- formatDisplayDate
- getEligibleShifts
- ScheduleGrid
- Raw Session Log
- Resident Day-Off Request Implementation Plan
- syntheticRoster.js
- RulesTab
- timing.py
- builder.py
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- Walkthrough.jsx
- 4. Real data vs. descriptive text
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- repairPass
- workday_limits.py
- parseDate
- parse_payload
- make_resident
- build_variables
- useMonthPager
- holidays.js
- updateBlock
- trauma_runs.py
- RequestsTab.jsx
- Cloud Sync (Supabase)
- baselineSuite.js
- scoreWeights.test.js
- Circadian Scheduling Rules
- Field-Ready Design System
- validateAll
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- validate.py
- Summary
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- qgendaImport.js
- getBlockDates
- FeedbackAdminTab
- test_weight_tiering.py
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- solve.py
- getCoverageFor
- SKILL.md
- vite.config.js
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
- ResidentRequestsApp.jsx
- CLAUDE.md
- shifts.js
- exportResidentCalendarPDF
- LitPool
- main.jsx
- Overall: All addressed
- schemas.py
- Resident walkthrough (`/requests`)
- solver-service
- Payload
- TermGroup
- Done — 7 PRs open, all review-clean, nothing touched prod branches
- payload.py
- useSpotlightTarget.js
- Solver performance investigation (2026-08-22)
- add_soft_sequence_constraint
- CLAUDE.md
- test_circadian.py
- Admin walkthrough steps (`/`)
- Efficiency Review
- JeopardyTab
- showToast
- dateSetPaint.test.js
- Session Log: 06-09-2026 18:35 - nd-option
- solverClient.js
- count_caps.py
- pedNightMigration.test.js
- a520850a30cde04cc-users-amade-appdata-local 2026-09-18
- Raw Session Log
- Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local
- nd-option 2026-09-06

## God Nodes (most connected - your core abstractions)
1. `Payload` - 119 edges
2. `parseDate()` - 98 edges
3. `4. Real data vs. descriptive text` - 94 edges
4. `parse_payload()` - 85 edges
5. `validateAll()` - 74 edges
6. `VarStore` - 73 edges
7. `make_resident()` - 71 edges
8. `ResidentScheduler()` - 55 edges
9. `toDateStr()` - 55 edges
10. `Summary` - 54 edges

## Surprising Connections (you probably didn't know these)
- `Welcome modal` --references--> `ResidentScheduler()`  [INFERRED]
  docs/WALKTHROUGH.md → src/ResidentScheduler.jsx
- `Welcome modal` --references--> `useWalkthroughSeen()`  [INFERRED]
  docs/WALKTHROUGH.md → src/walkthrough/useWalkthroughSeen.js
- `Admin walkthrough steps (`/`)` --references--> `filterStepsForRole()`  [INFERRED]
  docs/WALKTHROUGH.md → src/walkthrough/walkthroughSteps.js
- `Resident walkthrough (`/requests`)` --references--> `PendingApproval()`  [INFERRED]
  docs/WALKTHROUGH.md → src/AppGate.jsx
- `Resident walkthrough (`/requests`)` --references--> `RequestForm()`  [INFERRED]
  docs/WALKTHROUGH.md → src/residentRequests/RequestForm.jsx

## Import Cycles
- None detected.

## Communities (112 total, 35 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (113): RFC-4180, RFC-5545, bucketLabel(), AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS (+105 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.10
Nodes (27): getAcademicYear(), buildSnapData(), deepEqualNormalized(), makeDefaultBlock(), migratePedsPgy1ToPgy2(), normalizeForCompare(), ResidentScheduler(), blockReset() (+19 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (47): autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jsdom, lucide-react, dependencies, @fontsource/barlow (+39 more)

### Community 3 - "supabaseClient.js"
Cohesion: 0.14
Nodes (12): SetNewPassword(), fetchRosterForPicker(), MODES, ResidentPicker(), ALLOWED_EMAIL_DOMAIN, AUTH_ENABLED, isUnresolvedToken(), readGlobal() (+4 more)

### Community 4 - "coverage.js"
Cohesion: 0.17
Nodes (18): applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, DOW_COVERAGE_OVERRIDE (+10 more)

### Community 5 - "formatDisplayDate"
Cohesion: 0.08
Nodes (20): AvailabilityRangesEditor(), BlockCalendarSection(), computeScarceSeniorReservations(), DragConfirmModal(), FeasibilityReportCard(), formatDisplayDate(), GenerationReportCard(), getTraumaCap() (+12 more)

### Community 6 - "getEligibleShifts"
Cohesion: 0.10
Nodes (37): CTX, elig(), formatGapH(), gapIsShort(), shiftGapsFor(), blockTypeFilterPasses(), buildResidentICS(), cellViolations() (+29 more)

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
Cohesion: 0.07
Nodes (28): block, emCountWarnings(), issuesFor(), offService(), pgyGateWarnings(), res(), papaFixture(), buildStandardRoster() (+20 more)

### Community 11 - "RulesTab"
Cohesion: 0.06
Nodes (48): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+40 more)

### Community 12 - "timing.py"
Cohesion: 0.13
Nodes (25): _parse_shifts(), date_diff_days(), gap_between(), _ordinal_minutes(), overlaps_hour_window(), The ONLY cross-midnight math in the solver. Every constraint family that needs…, later - earlier, in days (can be negative)., Absolute minute offset (arbitrary but consistent epoch) a shift begins on… (+17 more)

### Community 13 - "builder.py"
Cohesion: 0.11
Nodes (20): _assigned_count_for_cap(), build_recommendations(), build_violations(), _cap_recommendation(), _coverage_recommendation(), _coverage_violations(), _duty_recommendation(), _generic_recommendation() (+12 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.07
Nodes (34): GRID_GROUP_MODE_DEFAULT, GRID_GROUP_MODES, groupResidents(), PGY_GROUPS, pushNonEmpty(), ROTATION_EM_STYLE, BLOCK_TYPES, ROSTER (+26 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.10
Nodes (21): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+13 more)

### Community 16 - "Walkthrough.jsx"
Cohesion: 0.18
Nodes (17): ref_react_dom, CARD_GAP, CARD_H_FALLBACK, CARD_W, cornerBox(), inflate(), overlapArea(), pickCardCorner() (+9 more)

### Community 17 - "4. Real data vs. descriptive text"
Cohesion: 0.02
Nodes (94): 4. Real data vs. descriptive text, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+86 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (21): auth, auth.users, public.apply_admin_allowlist, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests (+13 more)

### Community 19 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 20 - "repairPass"
Cohesion: 0.37
Nodes (16): hasSenior(), repairPass(), assignCell(), backfillVacated(), chainUnfilledSlot(), compositionStillSatisfied(), filledCount(), minFor() (+8 more)

### Community 21 - "workday_limits.py"
Cohesion: 0.14
Nodes (22): as_literal(), const_lit(), Normalize a rolling-window/sequence term (python int OR a real BoolVar) into…, A fixed-value CP-SAT literal (usable in add_bool_and/or, OnlyEnforceIf, and…, _add_post_run6_rest(), _add_six_day_window(), add_workday_limit_constraints(), _forbid_triple() (+14 more)

### Community 22 - "parseDate"
Cohesion: 0.13
Nodes (40): addDays(), ayWindowFor(), getAcademicYearFor(), getBlockWeekends(), parseDate(), qgendaDate(), toDateStr(), nightRun() (+32 more)

### Community 23 - "parse_payload"
Cohesion: 0.16
Nodes (30): parse_payload(), build_response(), Map a `solver.solve.SolveResult` into the response JSON shape from…, solve(), load_fixture(), schedule_has(), test_build_response_shape_matches_schema(), test_cross_midnight_rest_forces_reassignment() (+22 more)

### Community 24 - "make_resident"
Cohesion: 0.13
Nodes (46): Resident, add_circadian_constraints(), add_night_duration_alternation_terms(), Index set (into `payload.all_dates`) of every position where…, Generalizes the trauma-9h-vs-other-durations mixing rule to ANY pair of night-…, Generalizes the trauma-9h-vs-other-durations mixing rule to ANY pair of night-…, _trauma_possible_indices(), make_resident() (+38 more)

### Community 25 - "build_variables"
Cohesion: 0.11
Nodes (41): build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, add_coverage_constraints(), Rules 24-25: per-(shift, date) staffing minimum/maximum. Max side is always a…, `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, build_elastic_model(), ElasticBuildResult (+33 more)

### Community 26 - "useMonthPager"
Cohesion: 0.28
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), containers, Harness(), mountPager(), Harness() (+2 more)

### Community 27 - "holidays.js"
Cohesion: 0.07
Nodes (44): formatAY(), buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy() (+36 more)

### Community 28 - "updateBlock"
Cohesion: 0.18
Nodes (15): DashboardTab(), onStartDateChange(), setBlockField(), updSD(), EMResidentsTab(), removeRes(), setBA(), target() (+7 more)

### Community 29 - "trauma_runs.py"
Cohesion: 0.09
Nodes (35): add_second_rest_day_terms(), add_trauma_mid_run_terms(), add_trauma_run_hard_cap(), add_trauma_second_in_run_terms(), _and_cost_var(), _cached_indices(), _link_trauma(), _night_duration_classes() (+27 more)

### Community 30 - "RequestsTab.jsx"
Cohesion: 0.16
Nodes (13): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestPortalCard() (+5 more)

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "baselineSuite.js"
Cohesion: 0.11
Nodes (15): baselinePath(), captureFor(), compareWithTolerance(), __dirname, errorCount(), loadBaseline(), makeBaselineSuite(), SEEDS (+7 more)

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
Nodes (44): runValidate(), isNightShiftId(), shiftOverlapsJC(), blockDayIndex(), buildSolverPayload(), checkCircadianViolations(), compositionSatisfies(), countCurrentBlockJC() (+36 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "validate.py"
Cohesion: 0.17
Nodes (27): _check_circadian_pairs(), _check_consecutive_work(), _check_count_caps(), _check_coverage_max(), _check_eligibility_and_locked(), _check_hours_cap(), _check_night_run_and_cap_and_segments(), _check_post_run6_rest() (+19 more)

### Community 40 - "Summary"
Cohesion: 0.04
Nodes (54): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+46 more)

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "qgendaImport.js"
Cohesion: 0.06
Nodes (59): ref_xlsx, matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), CAT_MAP, CATEGORIES (+51 more)

### Community 45 - "getBlockDates"
Cohesion: 0.09
Nodes (36): captureOnce(), getBlockDates(), acepFixture(), PRE_12H_EM_HOME_2, makeSnapshot(), nightSpreadFor(), VARIANTS, buildRulePriorityVariants() (+28 more)

### Community 46 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 47 - "test_weight_tiering.py"
Cohesion: 0.11
Nodes (26): apply_rule_priority(), load_default_weights(), merged_weights(), _priority_order(), Static config, read once per process rather than per solve. Cached safely…, Relative order of the two objective-relevant rulePriority entries, ignoring…, Returns a copy of `weights` with the lower-ranked of coverageMin/ postNightRest…, _anti_fill_sum() (+18 more)

### Community 52 - "solve.py"
Cohesion: 0.20
Nodes (18): CpSolver, build_feasibility_report(), _assert_relaxed_matches_validation(), _build_report(), _build_report_relaxed(), _empty_report(), _extract_schedule(), _num_workers() (+10 more)

### Community 53 - "getCoverageFor"
Cohesion: 0.11
Nodes (17): buildAllResidents(), __dirname, nightRunsFor(), PYTHON, REPO_ROOT, SOLVER_DIR, buildAllResidents(), coverageFillStats() (+9 more)

### Community 63 - "blockLookup.js"
Cohesion: 0.18
Nodes (14): ref_lucide_react, ref_react, blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState(), findBlockForDate(), groupByBlock() (+6 more)

### Community 76 - "ResidentRequestsApp.jsx"
Cohesion: 0.17
Nodes (18): Decisions, Round 2 (resident walkthrough), ref_vitest, GettingStartedFooter(), UserGuideTab(), mergeWalkthroughSeen(), readLocalMirror(), useWalkthroughSeen() (+10 more)

### Community 78 - "shifts.js"
Cohesion: 0.21
Nodes (14): AREA_COLORS, JC_WINDOW_END_H, JC_WINDOW_START_H, overlappingAssignments(), NOTE: AREA_COLORS is not in the original extraction spec's const list, but…, SHIFT_AREAS, SHIFT_DOW, SHIFT_MAP (+6 more)

### Community 79 - "exportResidentCalendarPDF"
Cohesion: 0.33
Nodes (12): ref_jspdf, ref_jspdf_autotable, demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), offRequestEntryFor(), pdfDemoBanner(), pdfPageFooter() (+4 more)

### Community 80 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

### Community 81 - "main.jsx"
Cohesion: 0.19
Nodes (9): AppGate(), crashKey(), ErrorBoundary, reportCrash(), FeedbackWidget(), handleSubmit(), reset(), submitFeedback() (+1 more)

### Community 82 - "Overall: All addressed"
Cohesion: 0.04
Nodes (45): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+37 more)

### Community 83 - "schemas.py"
Cohesion: 0.15
Nodes (21): BaseModel, get, post, health(), FastAPI app: POST /solve, GET /health. Kept deliberately thin -- request…, solve_endpoint(), AyPriorModel, BlockModel (+13 more)

### Community 84 - "Resident walkthrough (`/requests`)"
Cohesion: 0.18
Nodes (11): 1. Request a day off, 2. Requesting more than one date, 3. Reason (optional), 4. Submit request, 5. Track your requests, First-login walkthrough, Replay, Resident walkthrough (`/requests`) (+3 more)

### Community 85 - "solver-service"
Cohesion: 0.10
Nodes (18): Notes, Objective tiers (high → low; integer weights derived at build time with ratchet separation), Request — `POST /solve`, Response, Rule registry ids (report/`rule` field values), Solver Payload Schema v1, Alternates, Contract (+10 more)

### Community 86 - "Payload"
Cohesion: 0.08
Nodes (52): date, Payload, _add_eve_day_pairs(), _add_night_cap(), _add_night_run_segments(), _add_night_run_window(), _link_night(), Rule 18 (eve<->day adjacency + night-run<=6 sliding window), rule 22 (max… (+44 more)

### Community 87 - "TermGroup"
Cohesion: 0.19
Nodes (24): add_em_composition_terms(), add_pgy_fallback_terms(), _area_shift_dates(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, Flat accumulator for one weighted-term family. Replaces the old `Tier` class,… (+16 more)

### Community 88 - "Done — 7 PRs open, all review-clean, nothing touched prod branches"
Cohesion: 0.08
Nodes (25): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+17 more)

### Community 89 - "payload.py"
Cohesion: 0.12
Nodes (21): main(), CLI entry point for the solver, independent of the FastAPI service. python…, AyPrior, Block, Config, CoverageEntry, LockedCell, _parse_coverage() (+13 more)

### Community 90 - "useSpotlightTarget.js"
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

### Community 95 - "Admin walkthrough steps (`/`)"
Cohesion: 0.20
Nodes (10): 1. Dashboard — your command center, 2. EM Residents — the roster, 3. Shift Matrix — who can work what, 4. Schedule — the grid, 5. Scheduling Rules — coverage targets, 6. Violations — the generation report, 7. Jeopardy — backup call, 8. Requests — resident day-off requests (+2 more)

### Community 96 - "Efficiency Review"
Cohesion: 0.05
Nodes (37): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+29 more)

### Community 97 - "JeopardyTab"
Cohesion: 0.27
Nodes (7): DATES6, dateInRanges(), fillJeopardy(), jeopardyCandidatesFor(), JeopardyTab(), runFill(), setCell()

### Community 98 - "showToast"
Cohesion: 0.11
Nodes (23): getGeneralPedsTarget(), deleteBlockSnapshot(), deleteDemo(), enterDemoFresh(), enterDemoResume(), exitDemo(), flushPendingCloudSave(), openDemoModal() (+15 more)

### Community 99 - "dateSetPaint.test.js"
Cohesion: 0.53
Nodes (4): applyDateRangePaint(), paintActionFor(), toggleDateInList(), startDrag()

### Community 100 - "Session Log: 06-09-2026 18:35 - nd-option"
Cohesion: 0.12
Nodes (16): Applied, Assistant, Assistant, Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Recent Commits, Reuse review findings (+8 more)

### Community 101 - "solverClient.js"
Cohesion: 0.39
Nodes (6): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, solveRemote(), freshModule()

### Community 102 - "count_caps.py"
Cohesion: 0.25
Nodes (13): add_count_cap_constraints(), _add_trauma_peds_split(), _build_simple_specs(), CapSpec, Rules 26, 28, 27, 29, 30, 31: every "count of shifts matching some predicate,…, Rule 30: BOTH halves share ONE `ok[resident,"traumaPedsSplit"]` literal in pass…, terms_for(), _build() (+5 more)

### Community 113 - "Raw Session Log"
Cohesion: 0.17
Nodes (12): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Raw Session Log (+4 more)

### Community 114 - "Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local"
Cohesion: 0.18
Nodes (10): 2. Implementation details, 3. Verbatim excerpts, All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify., Files Modified, New breakage: 1 Minor, Quick Reference (for AI scanning), Quick Resume Context, Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local (+2 more)

## Knowledge Gaps
- **547 isolated node(s):** `1. Dashboard — your command center`, `2. EM Residents — the roster`, `3. Shift Matrix — who can work what`, `4. Schedule — the grid`, `5. Scheduling Rules — coverage targets` (+542 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 882 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Payload` connect `Payload` to `count_caps.py`, `validate.py`, `builder.py`, `test_weight_tiering.py`, `solve.py`, `workday_limits.py`, `TermGroup`, `parse_payload`, `make_resident`, `payload.py`, `trauma_runs.py`, `build_variables`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `ScheduleGrid()` connect `ScheduleGrid` to `ResidentScheduler.jsx`, `showToast`, `validateAll`, `formatDisplayDate`, `getEligibleShifts`, `getBlockDates`, `src/uiPrefs.js`, `shifts.js`, `getCoverageFor`, `parseDate`, `updateBlock`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `parse_payload()` connect `parse_payload` to `count_caps.py`, `validate.py`, `timing.py`, `builder.py`, `test_weight_tiering.py`, `schemas.py`, `workday_limits.py`, `TermGroup`, `build_variables`, `make_resident`, `payload.py`, `Payload`, `test_circadian.py`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 97 INFERRED edges - model-reasoned connections that need verification._
- **What connects `1. Dashboard — your command center`, `2. EM Residents — the roster`, `3. Shift Matrix — who can work what` to the rest of the system?**
  _547 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.017385392385392384 - nodes in this community are weakly interconnected._
- **Should `ResidentScheduler` be split into smaller, more focused modules?**
  _Cohesion score 0.09885057471264368 - nodes in this community are weakly interconnected._