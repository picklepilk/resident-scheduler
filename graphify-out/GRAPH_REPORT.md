# Graph Report - resident-scheduler  (2026-10-18)

## Corpus Check
- 310 files · ~607,736 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .toml 2, .mdc 1)

## Summary
- 5915 nodes · 11978 edges · 196 communities (121 shown, 75 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 1133 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `baeaec5e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- playgrounds.js
- 6. Current branch (`fix/rule-policy`) — in-progress work
- Raw Session Log
- generateSchedule
- builder.py
- ref_lib_blockstatus_js
- ScheduleGrid
- Raw Session Log
- Resident Day-Off Request Implementation Plan
- vitest
- ShiftMatrixTab
- ref_lib_acgmehours_js
- optimalityGap.test.js
- UI conventions (full originals)
- Generator Quality Harness (best-of-N + repair)
- Walkthrough.jsx
- 4. Real data vs. descriptive text
- day_off_requests.sql
- feedback Table Schema
- Findings
- parseDate
- variables.py
- schemas.py
- timing.py
- _JwksCache
- TimeOffModal
- Payload
- exportResidentCalendarPDF
- parse.js
- Raw Session Log
- Cloud Sync (Supabase)
- qgenda.js
- bound_probe.py
- Circadian Scheduling Rules
- Field-Ready Design System
- SettingsTab
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- parse_payload
- Summary
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- test_trauma_runs.py
- VarStore
- InMemoryJobs
- repairPass
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- supabaseClient.js
- buildSolverPayload
- workday_limits.py
- acgmeHours.js
- Caveman Terse-Response Mode (Cline rule)
- Caveman Terse-Response Mode (Copilot rule)
- Caveman Terse-Response Mode (OpenCode rule)
- Caveman Terse-Response Mode (Windsurf rule)
- Solver performance investigation (2026-08-22)
- Dark Mode
- Dashboard/Home Merge
- PDF Export (jspdf-autotable)
- QGenda CSV Export Rework
- Soft Rule Priority
- What's New Banner
- migrate_admin_email_allowlist.sql
- make_payload
- User
- shifts.js
- 6. Current branch (`fix/rule-policy`) — in-progress work
- jobs.py
- RulesTab
- Overall: All addressed
- ModalJobs
- DayRulesEditor
- Weaknesses and gaps observed
- blockStatus.test.js
- checkGenerateReadiness
- Done — 7 PRs open, all review-clean, nothing touched prod branches
- session 2026-09-26
- useSpotlightTarget.js
- DateListEditor
- TermGroup
- slotFixes.js
- test_weight_tiering.py
- useWalkthroughSeen.js
- Efficiency Review
- solve.py
- hasSenior
- qgendaImport.js
- Session Log: 06-09-2026 18:35 - nd-option
- Session Log: 16-10-2026 23:56 - review-scheduling-algorithm-assess-further
- schedule
- test_api_ratelimit.py
- ref_lib_calendargrid_js
- a520850a30cde04cc-users-amade-appdata-local 2026-09-18
- ref_lib_cellalternatives_js
- fetchWithTimeout
- ref_lib_coverage_js
- ref_lib_coveragecomposition_js
- Raw Session Log
- Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local
- Raw Session Log
- Archived from CLAUDE.md on 2026-09-26 (compaction)
- package.json
- offServiceAlignment.js
- dates.js
- Session Log: 26-09-2026 14:15 - session
- ref_lib_dates_js
- scoreWeights.test.js
- ref_lib_datesetpaint_js
- nd-option 2026-09-06
- ref_lib_eligibilityoverrides_js
- Session Log: 16-10-2026 21:22 - review-scheduling-algorithm-assess-further
- ResidentScheduler
- ayLedger.js
- LitPool
- ref_lib_holidays_js
- resume 2026-09-28
- ref_lib_importlog_js
- test_api_auth.py
- DashboardTab
- whatIf.js
- Auth, rate limiting, body size cap (`/solve`)
- uuid
- limits.py
- ref_lib_jeopardyledger_js
- ref_lib_jeopardywindow_js
- ref_lib_journalclub_js
- reviewPanel.js
- test_workday_limits.py
- solverClient.js
- holidays.js
- ref_lib_keptcellviolations_js
- ref_lib_namematch_js
- test_night_fragment.py
- expectedFiller.js
- ref_lib_optimizersweep_js
- ref_lib_parse_js
- make_resident
- migrate_res_state_history.sql
- Session Log: 16-10-2026 09:45 - session
- ref_lib_qgenda_js
- ref_lib_qgendaimport_js
- ref_lib_reviewpanel_js
- formatResidentName
- run-local.sh
- ref_lib_rng_js
- Session Log: 17-10-2026 14:22 - also-nice-indication-when-someone
- Security headers rollout
- Coverage board (Coverage tab upgrade) — plan
- ref_lib_rulepolicy_js
- ref_lib_schedulegrouping_js
- migrate_res_state_admin_only.sql
- public.res_state
- ref_lib_schedulequality_js
- ref_lib_shifts_js
- session 2026-10-16
- ref_lib_solverclient_js
- ref_lib_uiprefs_js
- payload.py
- ref_lib_unfilledexplainer_js
- Done: 24 commits on `feat/dashboard-rail-activity`, branched from `feat/quality-gap`
- Resident walkthrough (`/requests`)
- normalizeImportLog
- add_soft_sequence_constraint
- Raw Session Log
- dependencies
- ref_requeststab
- Admin walkthrough steps (`/`)
- ref_supabaseclient
- approxMinutes
- ProgressReporter
- matchRosterByName
- ref_uiprefs_js
- toastHistory.js
- SidebarNav
- ref_walkthrough_walkthrough
- ref_walkthrough_walkthroughroot

## God Nodes (most connected - your core abstractions)
1. `6. Current branch (`fix/rule-policy`) — in-progress work` - 999 edges
2. `6. Current branch (`fix/rule-policy`) — in-progress work` - 929 edges
3. `Weaknesses and gaps observed` - 251 edges
4. `parse_payload()` - 168 edges
5. `Payload` - 150 edges
6. `parseDate()` - 130 edges
7. `make_payload()` - 109 edges
8. `make_resident()` - 103 edges
9. `validateAll()` - 102 edges
10. `ResidentScheduler()` - 97 edges

## Surprising Connections (you probably didn't know these)
- `When editing` --references--> `getEligibleShifts()`  [INFERRED]
  CLAUDE-Archive.md → src/ResidentScheduler.jsx
- `Assistant` --references--> `sbFetch()`  [INFERRED]
  CC-Session-Logs/16-10-2026-21_22-review-scheduling-algorithm-assess-further.md → src/ResidentScheduler.jsx
- `Assistant` --references--> `sbFetch()`  [INFERRED]
  solver-service/CC-Session-Logs/16-10-2026-23_56-review-scheduling-algorithm-assess-further.md → src/ResidentScheduler.jsx
- `MFA — not yet implemented` --references--> `ResidentScheduler()`  [INFERRED]
  docs/security-hygiene.md → src/ResidentScheduler.jsx
- `User` --references--> `onActivity()`  [INFERRED]
  solver-service/CC-Session-Logs/16-10-2026-23_56-review-scheduling-algorithm-assess-further.md → src/ResidentScheduler.jsx

## Import Cycles
- None detected.

## Communities (196 total, 75 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.01
Nodes (141): RFC-4180, RFC-5545, buildHeatmapRows(), coverageCellStatus(), heatmapCell(), TYPE_ORDER, bucketLabel(), DATES6 (+133 more)

### Community 1 - "playgrounds.js"
Cohesion: 0.23
Nodes (18): filterOwnPlaygrounds(), findMatchingRealBlock(), isLegacyDemoRowId(), isPlaygroundId(), isPlaygroundModeValue(), isSandboxRowId(), LEGACY_DEMO_ROW_ID, makePlaygroundId() (+10 more)

### Community 2 - "6. Current branch (`fix/rule-policy`) — in-progress work"
Cohesion: 0.00
Nodes (995): 6. Current branch (`fix/rule-policy`) — in-progress work, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+987 more)

### Community 3 - "Raw Session Log"
Cohesion: 0.05
Nodes (42): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+34 more)

### Community 4 - "generateSchedule"
Cohesion: 0.06
Nodes (66): Assistant, Reuse review findings, User, User, 1. Recent commits, 12-hour shift windows, Shift catalog & data model, Reuse (no new rule logic) (+58 more)

### Community 5 - "builder.py"
Cohesion: 0.11
Nodes (26): ElasticBuildResult, _apply_cap_edit(), _apply_coverage_min_edit(), _apply_target_edit(), _assigned_count_for_cap(), build_feasibility_report(), build_recommendations(), build_violations() (+18 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.05
Nodes (67): viewer, AvailabilityRangesEditor(), diffScheduleCells(), downloadBackupBlob(), FeasibilityReportCard(), FeedbackWidget(), handleSubmit(), reset() (+59 more)

### Community 8 - "Raw Session Log"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "vitest"
Cohesion: 0.05
Nodes (50): vitest, SEEDS, acepFixture(), PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService() (+42 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.13
Nodes (33): Rule-default migration, applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty() (+25 more)

### Community 13 - "optimalityGap.test.js"
Cohesion: 0.08
Nodes (27): ref_node_child_process, ref_node_fs, ref_node_os, ref_node_path, ref_node_url, buildAllResidents(), __dirname, nightRunsFor() (+19 more)

### Community 14 - "UI conventions (full originals)"
Cohesion: 0.08
Nodes (36): UI conventions (full originals), GRID_GROUP_MODE_DEFAULT, GRID_GROUP_MODES, groupResidents(), PGY_GROUPS, pushNonEmpty(), ROTATION_EM_STYLE, shortRotationLabel() (+28 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.16
Nodes (16): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+8 more)

### Community 16 - "Walkthrough.jsx"
Cohesion: 0.19
Nodes (17): 2. Implementation details, CARD_GAP, CARD_H_FALLBACK, CARD_W, cornerBox(), inflate(), overlapArea(), pickCardCorner() (+9 more)

### Community 17 - "4. Real data vs. descriptive text"
Cohesion: 0.02
Nodes (92): 4. Real data vs. descriptive text, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+84 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (22): auth, auth.users, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests, day_off_requests_cancel_guard (+14 more)

### Community 19 - "feedback Table Schema"
Cohesion: 0.33
Nodes (6): Crash Auto-Capture (window.onerror/unhandledrejection), User Feedback + Admin Portal Design, Feedback Admin Netlify Function, feedback Table Schema, Floating Feedback Widget (Bug/Crash/Idea), Track A: Shared-Password Admin Gating

### Community 20 - "Findings"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 21 - "parseDate"
Cohesion: 0.07
Nodes (77): 4. ACGME rules — memory vs. code, Assistant, 4. ACGME rules — memory vs. code, Grand Rounds rest/streak semantics rewrite (2026-10-15, chief decision), block, addDays(), getBlockWeekends(), parseDate() (+69 more)

### Community 22 - "variables.py"
Cohesion: 0.07
Nodes (47): dataclasses, build_model(), payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, Resident, add_circadian_constraints(), _add_eve_day_pairs(), _add_night_cap(), _add_night_run_segments() (+39 more)

### Community 23 - "schemas.py"
Cohesion: 0.13
Nodes (23): BaseModel, User, pydantic, AyPriorModel, BlockModel, CapsModel, ConfigModel, CoverageEntryModel (+15 more)

### Community 24 - "timing.py"
Cohesion: 0.10
Nodes (32): date, datetime, _build_simple_specs(), date_diff_days(), gap_between(), hour_mark_min(), _ordinal_minutes(), overlaps_hour_window() (+24 more)

### Community 25 - "_JwksCache"
Cohesion: 0.40
Nodes (3): PyJWK, _JwksCache, Per-process cache of one project's JWKS, keyed by `kid`. Refetches on an…

### Community 26 - "TimeOffModal"
Cohesion: 0.17
Nodes (15): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), applyDateRangePaint(), paintActionFor(), toggleDateInList(), containers (+7 more)

### Community 27 - "Payload"
Cohesion: 0.14
Nodes (32): Payload, no_overstaff_shift(), True when `shift` may NEVER use the +1 last-resort overstaff allowance (see…, add_days(), _check_circadian_pairs(), _check_consecutive_work(), _check_count_caps(), _check_coverage_max() (+24 more)

### Community 28 - "exportResidentCalendarPDF"
Cohesion: 0.23
Nodes (16): jspdf, jspdf-autotable, demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), offRequestEntryFor(), pdfDemoBanner(), pdfPageFooter() (+8 more)

### Community 29 - "parse.js"
Cohesion: 0.14
Nodes (25): 1. How off-service residents are modeled, CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), normalizeToken(), parseDateRangeInAY() (+17 more)

### Community 30 - "Raw Session Log"
Cohesion: 0.03
Nodes (66): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+58 more)

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "qgenda.js"
Cohesion: 0.16
Nodes (22): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+14 more)

### Community 33 - "bound_probe.py"
Cohesion: 0.11
Nodes (31): math, _core_deficit_units_expr(), _coverage_miss_expr(), probe_bounds(), _probe_coverage_miss(), _probe_deficit_core_units(), _probe_under_target_core(), Bound probe: for a given payload, measures the CP-SAT-PROVEN best achievable… (+23 more)

### Community 34 - "Circadian Scheduling Rules"
Cohesion: 0.40
Nodes (5): Circadian Scheduling Rules, Grand Rounds Lecture Day-Before Rule, Chief-Editable Journal Club Dates, Journal Club Rules, PED-N Split Into Two Shift IDs

### Community 35 - "Field-Ready Design System"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 36 - "SettingsTab"
Cohesion: 0.20
Nodes (12): blockChanged(), blocksById(), deepEqual(), diffState(), scheduleCellsChanged(), roster(), getGeneralPedsTarget(), SettingsTab() (+4 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "parse_payload"
Cohesion: 0.04
Nodes (106): copy, Parse a /solve-shaped dict, solve, return the response dict. Entry point for…, solve_raw(), parse_payload(), Splits `config.max_time_seconds` across the 4 staged-solve stages…, `cancel_event` (optional, used only by api/jobs.py's background runner): when a…, solve(), _stage_time_budgets() (+98 more)

### Community 40 - "Summary"
Cohesion: 0.04
Nodes (53): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+45 more)

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "test_trauma_runs.py"
Cohesion: 0.07
Nodes (71): 2. Per-module size contribution (isolated measurement), 3. The fix, 4. Correctness guardrail, TL;DR, add_night_duration_alternation_terms(), add_second_rest_day_terms(), add_trauma_mid_run_terms(), add_trauma_run_hard_cap() (+63 more)

### Community 45 - "VarStore"
Cohesion: 0.09
Nodes (41): Assistant, Simplification Review, User, functools, itertools, Night-stint contiguity gap closed (2026-10-16), terms_for(), CoverageResult (+33 more)

### Community 46 - "InMemoryJobs"
Cohesion: 0.15
Nodes (9): InMemoryJobs, _Job, Today's behavior (Fly / local): jobs in process memory, one at a time., begin_stoppable_run(), end_stoppable_run(), Call once, on the thread that is about to call `solve(payload)`, before doing…, Call when the stoppable run is done (success or failure) so a later, unrelated…, Unit-level proof that solve.py's cancellation plumbing actually wires a real… (+1 more)

### Community 47 - "repairPass"
Cohesion: 0.35
Nodes (21): assignCell(), movable(), pickBestScore(), poolFor(), preferTruePrimaryPass(), repairPass(), backfillVacated(), chainFor() (+13 more)

### Community 52 - "supabaseClient.js"
Cohesion: 0.09
Nodes (31): lucide-react, react, SetNewPassword(), RequestPortalCard(), blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchLookup() (+23 more)

### Community 53 - "buildSolverPayload"
Cohesion: 0.05
Nodes (91): Applied, 1. Pipeline summary, 3. Known gaps from docs (solver-service/docs/PAYLOAD_SCHEMA.md R9 section + tier table), 5. Concrete algorithmic weaknesses observed, 2. Local generator, Generator (full originals), Solver R9 (original wording), 1. Pipeline summary (+83 more)

### Community 54 - "workday_limits.py"
Cohesion: 0.11
Nodes (25): Changed rule: `restGap` (rule 17) — GR-end adjustment, New/changed request fields, New rule: `edWeekly60` / `totalWeekly72` (ACGME EM 6.17.a.3, tier `acgme`), R7 (2026-09-27): rule-severity policy + ACGME EM work-hour rules — solver parity, Response shape, cap_enforcement(), duty_enforcement(), as_literal() (+17 more)

### Community 58 - "acgmeHours.js"
Cohesion: 0.16
Nodes (22): buildDailyContributions(), combinedRow(), ED_WEEKLY_CAP_H, edHoursOn(), fullDateRange(), GR_DURATION_H, GR_END_H, GR_START_H (+14 more)

### Community 63 - "Solver performance investigation (2026-08-22)"
Cohesion: 0.25
Nodes (7): 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Environment, Files touched, Reproduction, Solver performance investigation (2026-08-22)

### Community 71 - "migrate_admin_email_allowlist.sql"
Cohesion: 0.47
Nodes (5): admin_email_allowlist, profiles_admin_allowlist_promote, public.apply_admin_allowlist(), public.current_user_is_allowlisted_admin(), public.apply_admin_allowlist

### Community 76 - "make_payload"
Cohesion: 0.05
Nodes (59): dict, pytest, JobConflict, JobNotFound, Exception, Test-only: install a specific backend instance (until reset_jobs_store())., Unknown job id, or the caller does not own it (same outcome on purpose)., A job is already running and this backend only allows one (InMemoryJobs). (+51 more)

### Community 77 - "User"
Cohesion: 0.07
Nodes (51): User, ACTIVITY_KINDS, actorLabel(), appendActivity(), EDIT_KINDS, lastActivity(), MONTHS, nonNegInt() (+43 more)

### Community 78 - "shifts.js"
Cohesion: 0.06
Nodes (49): Skipped, 2. Window status, straddle badge and call sites, 5. Tests and fixtures, Assistant, Archived: 2026-10-15 (Grand Rounds rest/streak rewrite), Archived 2026-10-16: verbose originals of tightened CLAUDE.md bullets (resident-scheduler), Scheduling/data-model (original wording), Imports & exports (+41 more)

### Community 79 - "6. Current branch (`fix/rule-policy`) — in-progress work"
Cohesion: 0.00
Nodes (926): 6. Current branch (`fix/rule-policy`) — in-progress work, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+918 more)

### Community 80 - "jobs.py"
Cohesion: 0.04
Nodes (78): argparse, delete, fastapi, fastapi_middleware_cors, fastapi_responses, fastapi_testclient, httpx, importlib_metadata (+70 more)

### Community 81 - "RulesTab"
Cohesion: 0.17
Nodes (4): describeDayRules(), describeShiftGates(), RulesTab(), renderCoverageCell()

### Community 82 - "Overall: All addressed"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 83 - "ModalJobs"
Cohesion: 0.07
Nodes (26): asgi_app, BaseException, concurrent, function, Image, modal, pathlib, JobBackendError (+18 more)

### Community 84 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 85 - "Weaknesses and gaps observed"
Cohesion: 0.01
Nodes (240): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+232 more)

### Community 86 - "blockStatus.test.js"
Cohesion: 0.24
Nodes (6): BLOCK_STEP_IDS, deriveBlockSteps(), formatShortDate(), SHORT_MONTHS, BASE, BlockStepsRow()

### Community 87 - "checkGenerateReadiness"
Cohesion: 0.27
Nodes (8): keptCellsForMode(), issues, lockedCells, schedule, violatingCells(), checkGenerateReadiness(), eligKey(), getMissingSpecialDayLists()

### Community 88 - "Done — 7 PRs open, all review-clean, nothing touched prod branches"
Cohesion: 0.08
Nodes (25): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+17 more)

### Community 90 - "useSpotlightTarget.js"
Cohesion: 0.24
Nodes (13): ACQUIRE_TIMEOUT_MS, prefersReducedMotion(), rectsEqual(), roundRect(), SETTLE_FRAMES, useSpotlightTarget(), acquire(), acquireLoop() (+5 more)

### Community 91 - "DateListEditor"
Cohesion: 0.25
Nodes (3): DateListEditor(), WorkRestrictionsEditor(), remove()

### Community 92 - "TermGroup"
Cohesion: 0.18
Nodes (25): add_em_composition_terms(), add_pgy_fallback_terms(), _area_shift_dates(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, _add_em_composition_round2b_terms() (+17 more)

### Community 93 - "slotFixes.js"
Cohesion: 0.13
Nodes (15): datesByDistance(), findFixablePlans(), FIXABLE_HARD_RULE_IDS, hasOverrideTierViolation(), isFixableBlocked(), ownEditableDates(), replaceTouch(), revalidateTouched() (+7 more)

### Community 94 - "test_weight_tiering.py"
Cohesion: 0.07
Nodes (40): User, New soft term: `seniorTruePrimary`, What changed, What was already aligned (no change needed), apply_rule_priority(), load_default_weights(), merged_weights(), Static config, read once per process rather than per solve. Cached safely… (+32 more)

### Community 95 - "useWalkthroughSeen.js"
Cohesion: 0.17
Nodes (18): User, User, Decisions, Round 2 (resident walkthrough), GettingStartedFooter(), UserGuideTab(), mergeWalkthroughSeen(), readLocalMirror() (+10 more)

### Community 96 - "Efficiency Review"
Cohesion: 0.05
Nodes (37): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+29 more)

### Community 97 - "solve.py"
Cohesion: 0.08
Nodes (47): CpSolver, Gap 2: solver over-max ("+1 overstaff") placements are now visible in the report, Known gap (not fixed here, out of scope), Never fall to pass 2 when the warm-start hint is feasible (2026-09-28), Night-stint contiguity preference + avoidable/forced fragmentation split (2026-10-14), Policy (2026-09-26, mirrors `fix/under-target-lift`'s JS-side changes), Search tuning, Solver objective weight policy: target vs. soft rules vs. overstaffing (+39 more)

### Community 99 - "qgendaImport.js"
Cohesion: 0.18
Nodes (19): xlsx, buildQGendaImport(), cell(), countDayNumbers(), countDowCells(), DOW_INDEX, findDayNumberRow(), isoFrom() (+11 more)

### Community 100 - "Session Log: 06-09-2026 18:35 - nd-option"
Cohesion: 0.22
Nodes (8): Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Recent Commits, Session Log: 06-09-2026 18:35 - nd-option, Tool Activity, Verification, Working Tree At Close

### Community 101 - "Session Log: 16-10-2026 23:56 - review-scheduling-algorithm-assess-further"
Cohesion: 0.09
Nodes (21): 2. Current quality baselines (5-seed averages, `src/lib/__fixtures__/qualityBaseline.*.json`), **(a) Existing Tabs/Navigation**, App Feature Inventory, Assistant, Assistant, Assistant, Assistant, Assistant (+13 more)

### Community 102 - "schedule"
Cohesion: 0.15
Nodes (14): MFA — not yet implemented, Security hygiene notes, Shared-workstation admin sessions (2026-10-15), 4. Schedule — the grid, createIdleTimer(), clearTimers(), schedule(), DEFAULT_IDLE_TIMEOUT_MINUTES (+6 more)

### Community 103 - "test_api_ratelimit.py"
Cohesion: 0.12
Nodes (17): cryptography_hazmat_primitives_asymmetric, _post(), Tests for api.ratelimit's token-bucket limiter on POST /solve. `solve()` is…, MEDIUM finding fix: on Fly, request.client.host is the edge proxy, not the real…, A caller cannot evade (or frame another caller into) the rate limit by setting…, HIGH finding fix: the cheap per-IP preauth bucket must reject a flood BEFORE…, LOW finding fix: a bucket untouched for longer than the idle TTL gets swept out…, Two different JWT subjects must not share a bucket -- simulated here by driving… (+9 more)

### Community 110 - "fetchWithTimeout"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 113 - "Raw Session Log"
Cohesion: 0.17
Nodes (12): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Raw Session Log (+4 more)

### Community 114 - "Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local"
Cohesion: 0.20
Nodes (9): 3. Verbatim excerpts, All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify., Files Modified, New breakage: 1 Minor, Quick Reference (for AI scanning), Quick Resume Context, Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local, Tool Activity (+1 more)

### Community 115 - "Raw Session Log"
Cohesion: 0.12
Nodes (16): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+8 more)

### Community 116 - "Archived from CLAUDE.md on 2026-09-26 (compaction)"
Cohesion: 0.08
Nodes (25): 2. Current controls, 3. Open/unresolved concerns explicitly documented, 4. Does `res_state` RLS restrict writes to admin? — **No.**, Assistant, Assistant, Assistant, Security history and posture — resident-scheduler, User (+17 more)

### Community 117 - "package.json"
Cohesion: 0.06
Nodes (31): name, private, scripts, build, dev, preview, test, type (+23 more)

### Community 118 - "offServiceAlignment.js"
Cohesion: 0.19
Nodes (16): buildOffServiceAlignment(), cmp(), collectBlocks(), dayCount(), fmt(), fmtRange(), isIso(), mergeWindows() (+8 more)

### Community 119 - "dates.js"
Cohesion: 0.08
Nodes (36): Scheduling rules (full originals), ayWindowFor(), getAcademicYearFor(), qgendaDate(), computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), computePaybacksApplied() (+28 more)

### Community 120 - "Session Log: 26-09-2026 14:15 - session"
Cohesion: 0.29
Nodes (6): Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Session Log: 26-09-2026 14:15 - session, Tool Activity, Working Tree At Close

### Community 122 - "scoreWeights.test.js"
Cohesion: 0.40
Nodes (5): bandOf(), groupBand(), preferenceKeys, structuralKeys, SCORE_TIERS

### Community 126 - "Session Log: 16-10-2026 21:22 - review-scheduling-algorithm-assess-further"
Cohesion: 0.08
Nodes (23): 2. Current quality baselines (5-seed averages, `src/lib/__fixtures__/qualityBaseline.*.json`), **(a) Existing Tabs/Navigation**, App Feature Inventory, Assistant, Assistant, Assistant, Assistant, Assistant (+15 more)

### Community 127 - "ResidentScheduler"
Cohesion: 0.11
Nodes (38): Persistence, Persistence / cloud sync (original wording), assertWriteTargetRowId(), makePlaygroundMeta(), ResidentScheduler(), conflictOverwriteMine(), createPlayground(), createPlaygroundFromSolve() (+30 more)

### Community 128 - "ayLedger.js"
Cohesion: 0.10
Nodes (22): buildAyLedger(), buildCategory(), buildPgyGroups(), CATEGORY_LABELS, computeColumnVisibility(), DEFAULT_BEHIND_TARGET_THRESHOLD, DEFAULT_FLAG_RAW_DELTA, DEFAULT_HEAVY_RATE_MULTIPLIER (+14 more)

### Community 129 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

### Community 133 - "test_api_auth.py"
Cohesion: 0.06
Nodes (48): jwt_algorithms, Test-only: drop all cached JWKS state so a monkeypatched fetch starts clean…, reset_jwks_cache(), Test-only: drop all job state (and the cached backend) between test cases., reset_jobs_store(), Test-only: drop all bucket state (both layers) so each test starts with full…, reset_rate_limiter(), _allowlist_env() (+40 more)

### Community 134 - "DashboardTab"
Cohesion: 0.12
Nodes (23): 4. Existing cross-year views and where to add one, AyLedgerOffServiceSection(), DashboardTab(), onStartDateChange(), setBlockField(), updSD(), EMResidentsTab(), removeRes() (+15 more)

### Community 135 - "whatIf.js"
Cohesion: 0.19
Nodes (14): applyCloneResident(), applyCoverageMin(), applyRemoveResident(), applyScenario(), cloneOneResident(), compareResults(), compareResultSets(), countByShift() (+6 more)

### Community 136 - "Auth, rate limiting, body size cap (`/solve`)"
Cohesion: 0.25
Nodes (7): Auth, rate limiting, body size cap (`/solve`), Client contract, Env vars, Fly secrets (set by hand, not run here), Run on your own computer, solver-service, Tests

### Community 137 - "uuid"
Cohesion: 0.13
Nodes (13): pickTopBlocker(), summarizeSlotBlockers(), TRIVIAL_BLOCKERS, AddResidentModal(), describeWhatIfChange(), requestSickCallCover(), uuid(), WhatIfCard() (+5 more)

### Community 138 - "limits.py"
Cohesion: 0.09
Nodes (21): _BodyTooLarge, _max_body_bytes(), MaxBodySizeMiddleware, limited_receive(), _noop_receive(), ASGIApp, Exception, Receive (+13 more)

### Community 142 - "reviewPanel.js"
Cohesion: 0.06
Nodes (47): byDeficitThenSoftCount(), clearCell(), findAssignOptions(), findGiveCandidates(), findSwapCandidates(), hasOverrideTierViolation(), ineligibleButOverridable(), RESIDENTS (+39 more)

### Community 143 - "test_workday_limits.py"
Cohesion: 0.32
Nodes (12): R9 follow-up, part 2 (2026-09-27): GR-after-night exemption decided inside the model, _build(), test_exemption_lets_solver_legally_place_a_pattern_js_allows(), test_gr_day_after_a_night_not_counted_as_workday(), test_gr_day_without_a_night_before_still_counted_as_workday(), test_obligation_day_forces_work_var_true_with_no_shift(), test_obligation_without_exempt_flag_counts_even_after_a_night(), test_post_run6_rest_blocks_shift_within_24h_after_completed_run_isolated_from_rule19() (+4 more)

### Community 144 - "solverClient.js"
Cohesion: 0.12
Nodes (26): Assistant, 3. Solver service, Assistant, checkLocalSolverHealth(), getSolverJobsMode(), getSolverUrl(), isUnresolvedToken(), jobsModeCache (+18 more)

### Community 145 - "holidays.js"
Cohesion: 0.26
Nodes (17): buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy(), holidaysInRange() (+9 more)

### Community 148 - "test_night_fragment.py"
Cohesion: 0.25
Nodes (17): _add_night_fragment_term(), _build(), _cost_of(), _dates(), Night-run fragmentation (avoidable vs forced), objective.py's…, A run touching the block's FIRST date is exempt (may continue from the adjacent…, Solves for the MINIMUM of the given weighted terms (every derived var here is…, Fully-linked tiny model: `night[r,d]` is real (circadian's own link), and `r1`… (+9 more)

### Community 149 - "expectedFiller.js"
Cohesion: 0.27
Nodes (8): bucketKeyFor(), bucketLabel(), categoryChipLabel(), expectedFillerFor(), requirementFor(), baseSeniorityRules, CATEGORIES, COMPOSITION

### Community 152 - "make_resident"
Cohesion: 0.07
Nodes (72): ortools_sat_python, add_coverage_constraints(), `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, build_variables(), make_resident(), _build(), test_day_then_eve_next_day_allowed(), test_day_then_night_next_day_is_allowed_by_this_rule() (+64 more)

### Community 153 - "migrate_res_state_history.sql"
Cohesion: 0.28
Nodes (7): public.res_state_archive_history, public.res_state_set_audit_fields, public.res_state_archive_history(), public.res_state_history, res_state_archive_history, res_state_audit_fields, res_state_history_row_id_id_idx

### Community 154 - "Session Log: 16-10-2026 09:45 - session"
Cohesion: 0.25
Nodes (7): Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Recent Commits, Session Log: 16-10-2026 09:45 - session, Tool Activity, Working Tree At Close

### Community 158 - "formatResidentName"
Cohesion: 0.21
Nodes (11): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestsTab() (+3 more)

### Community 159 - "run-local.sh"
Cohesion: 0.50
Nodes (3): run-local.sh script, SOLVER_AUTH_MODE, SOLVER_CORS_ORIGINS

### Community 161 - "Session Log: 17-10-2026 14:22 - also-nice-indication-when-someone"
Cohesion: 0.06
Nodes (43): Assistant, 1. Dashboard tab, 2. App shell, 3. Block model, 3. Computing block overlap and alignment for a year, 4. Design tokens, 4. Quality baselines, 5. Other UX pain points visible in code (+35 more)

### Community 162 - "Security headers rollout"
Cohesion: 0.29
Nodes (6): 1. Check the Report-Only CSP on a deploy preview, 2. Resolve the open decisions before enforcing, 3. Flip to enforcing, "Run the optimizer on this computer" (2026-10-16), Security headers rollout, Status (2026-10-15): enforcing

### Community 163 - "Coverage board (Coverage tab upgrade) — plan"
Cohesion: 0.33
Nodes (5): Build steps, Coverage board (Coverage tab upgrade) — plan, Decisions (user, 2026-10-15), Goal, Verification

### Community 177 - "payload.py"
Cohesion: 0.11
Nodes (23): New request field: `hint`, AyPrior, Block, Config, CoverageEntry, LockedCell, _parse_coverage(), _parse_eligible() (+15 more)

### Community 179 - "Done: 24 commits on `feat/dashboard-rail-activity`, branched from `feat/quality-gap`"
Cohesion: 0.12
Nodes (16): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+8 more)

### Community 180 - "Resident walkthrough (`/requests`)"
Cohesion: 0.13
Nodes (17): 1. Timeline of security decisions/incidents, User, User, 1. Request a day off, 2. Requesting more than one date, 3. Reason (optional), 4. Submit request, 5. Track your requests (+9 more)

### Community 181 - "normalizeImportLog"
Cohesion: 0.16
Nodes (20): formatAY(), getAcademicYear(), appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), buildScheduleFromImport(), buildSnapData(), ImportHistoryPanel() (+12 more)

### Community 182 - "add_soft_sequence_constraint"
Cohesion: 0.29
Nodes (10): add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges(), test_run_at_or_above_soft_min_costs_nothing() (+2 more)

### Community 183 - "Raw Session Log"
Cohesion: 0.15
Nodes (13): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+5 more)

### Community 184 - "dependencies"
Cohesion: 0.09
Nodes (20): dependencies, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, qrcode (+12 more)

### Community 186 - "Admin walkthrough steps (`/`)"
Cohesion: 0.22
Nodes (9): 1. Dashboard — your command center, 2. EM Residents — the roster, 3. Shift Matrix — who can work what, 5. Scheduling Rules — coverage targets, 6. Violations — the generation report, 7. Jeopardy — backup call, 8. Requests — resident day-off requests, 9. Settings — backup and export config (+1 more)

### Community 190 - "matchRosterByName"
Cohesion: 0.33
Nodes (9): matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), parse(), matchLectureRosterName(), parseLectureImportDate() (+1 more)

### Community 192 - "toastHistory.js"
Cohesion: 0.48
Nodes (5): addToastEntry(), clearToastHistory(), formatToastAge(), TOAST_HISTORY_LIMIT, ToastHistoryPanel()

### Community 193 - "SidebarNav"
Cohesion: 0.50
Nodes (5): reconcileTabOrder(), reorderIds(), SidebarNav(), renderTabButton(), resetDrag()

## Knowledge Gaps
- **3012 isolated node(s):** `Archived: 2026-09-26 (session-end hook, PICKLEBOOK)`, `Layout & stack`, `Archived: 2026-10-16 (session-end hook, PICKLEBOOK)`, `MONTHS`, `TYPE_ORDER` (+3007 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 3665 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **75 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `6. Current branch (`fix/rule-policy`) — in-progress work` connect `6. Current branch (`fix/rule-policy`) — in-progress work` to `solverClient.js`, `Session Log: 17-10-2026 14:22 - also-nice-indication-when-someone`, `Session Log: 16-10-2026 21:22 - review-scheduling-algorithm-assess-further`, `schemas.py`?**
  _High betweenness centrality (0.292) - this node is a cross-community bridge._
- **Why does `6. Current branch (`fix/rule-policy`) — in-progress work` connect `6. Current branch (`fix/rule-policy`) — in-progress work` to `Session Log: 17-10-2026 14:22 - also-nice-indication-when-someone`, `generateSchedule`, `Session Log: 16-10-2026 23:56 - review-scheduling-algorithm-assess-further`, `solverClient.js`, `schemas.py`?**
  _High betweenness centrality (0.285) - this node is a cross-community bridge._
- **Why does `User` connect `generateSchedule` to `ayLedger.js`, `ResidentScheduler.jsx`, `6. Current branch (`fix/rule-policy`) — in-progress work`, `schedule`, `ScheduleGrid`, `vitest`, `reviewPanel.js`, `jobs.py`, `solverClient.js`, `test_night_fragment.py`, `buildSolverPayload`, `parseDate`, `acgmeHours.js`, `slotFixes.js`, `ResidentScheduler`?**
  _High betweenness centrality (0.171) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `Weaknesses and gaps observed` (e.g. with `evaluate_hint()` and `computeQualityMetrics()`) actually correct?**
  _`Weaknesses and gaps observed` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `parse_payload()` (e.g. with `Gap 1: `conferenceTolerated` now has a solver-side signal` and `Known gaps (not fixed here, out of scope)`) actually correct?**
  _`parse_payload()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 124 inferred relationships involving `Payload` (e.g. with `Gap 1: `conferenceTolerated` now has a solver-side signal` and `New/changed request fields`) actually correct?**
  _`Payload` has 124 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Archived: 2026-09-26 (session-end hook, PICKLEBOOK)`, `Layout & stack`, `Archived: 2026-10-16 (session-end hook, PICKLEBOOK)` to the rest of the system?**
  _3012 weakly-connected nodes found - possible documentation gaps or missing edges._