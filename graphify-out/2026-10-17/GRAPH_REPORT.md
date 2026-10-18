# Graph Report - resident-scheduler  (2026-10-17)

## Corpus Check
- 312 files · ~917,768 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 3, .toml 2, .mdc 1)

## Summary
- 7075 nodes · 14453 edges · 196 communities (154 shown, 42 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 813 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7a45710f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- playgrounds.js
- 6. Current branch (`fix/rule-policy`) — in-progress work
- Raw Session Log
- shifts.js
- builder.py
- CUsersamadeAppDataLocalTempclaudeC--Users-amade-projects-resident-schedulerd2320667-24c3-4c97-ba36-1af708a9f28fscratchpadold_RS.jsx
- ScheduleGrid
- Raw Session Log
- Resident Day-Off Request Implementation Plan
- vitest
- ShiftMatrixTab
- CUsersamadeAppDataLocalTempclaudeC--Users-amade-projects-resident-schedulerd2320667-24c3-4c97-ba36-1af708a9f28fscratchpadnew_RS.jsx
- generateSchedule
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- Walkthrough.jsx
- 4. Real data vs. descriptive text
- day_off_requests.sql
- feedback Table Schema
- Findings
- parseDate
- generateSchedule
- schemas.py
- Payload
- formatDisplayDate
- useMonthPager
- parse_payload
- getEligibleShifts
- parse.js
- Raw Session Log
- Cloud Sync (Supabase)
- qgenda.js
- ResidentScheduler
- Circadian Scheduling Rules
- Field-Ready Design System
- SettingsTab
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- solve
- Summary
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- test_trauma_runs.py
- VarStore
- ResidentScheduler
- shiftActiveOnDow
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- supabaseClient.js
- getBlockDates
- prettyDate
- repairPass
- Caveman Terse-Response Mode (Cline rule)
- Caveman Terse-Response Mode (Copilot rule)
- Caveman Terse-Response Mode (OpenCode rule)
- Caveman Terse-Response Mode (Windsurf rule)
- updateBlock
- Dark Mode
- Dashboard/Home Merge
- PDF Export (jspdf-autotable)
- QGenda CSV Export Rework
- Soft Rule Priority
- What's New Banner
- migrate_admin_email_allowlist.sql
- test_modal_jobs.py
- User
- acgmeHours.js
- 6. Current branch (`fix/rule-policy`) — in-progress work
- jobs.py
- ScheduleGrid
- Overall: All addressed
- Deploying the solver on Modal
- ScheduleGrid
- Weaknesses and gaps observed
- blockStatus.test.js
- formatDisplayDate
- Done — 7 PRs open, all review-clean, nothing touched prod branches
- session 2026-09-26
- useSpotlightTarget.js
- formatDisplayDate
- TermGroup
- updateBlock
- test_weight_tiering.py
- useWalkthroughSeen.js
- Efficiency Review
- solve.py
- bound_probe.py
- qgendaImport.js
- Session Log: 06-09-2026 18:35 - nd-option
- Session Log: 16-10-2026 23:56 - review-scheduling-algorithm-assess-further
- schedule
- test_api_jobs.py
- reviewPanel.js
- a520850a30cde04cc-users-amade-appdata-local 2026-09-18
- prettyDate
- Persistence / cloud sync (original wording)
- repairPass
- RulesTab
- Raw Session Log
- Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local
- Raw Session Log
- Security history and posture — resident-scheduler
- package.json
- offServiceAlignment.js
- dates.js
- Session Log: 26-09-2026 14:15 - session
- LitPool
- scoreWeights.test.js
- prettyDate
- nd-option 2026-09-06
- getEligibleShifts
- Session Log: 16-10-2026 21:22 - review-scheduling-algorithm-assess-further
- ResidentScheduler
- ayLedger.js
- TokenBucketLimiter
- TimeOffModal
- resume 2026-09-28
- RulesTab
- test_api_auth.py
- updateBlock
- whatIf.js
- Auth, rate limiting, body size cap (`/solve`)
- uuid
- limits.py
- timing.py
- ShiftMatrixTab
- ShiftMatrixTab
- User
- test_workday_limits.py
- generateViaSolverOrLocal
- holidays.js
- DayRulesEditor
- DayRulesEditor
- add_circadian_constraints
- expectedFiller.js
- substituteReasonFor
- reset_rate_limiter
- test_weekly_hours.py
- migrate_res_state_history.sql
- Session Log: 16-10-2026 09:45 - session
- RulesTab
- FeedbackAdminTab
- FeedbackAdminTab
- Archived from CLAUDE.md on 2026-09-26 (compaction)
- run-local.sh
- DayRulesEditor
- Session Log: 17-10-2026 14:22 - also-nice-indication-when-someone
- Security headers rollout
- Coverage board (Coverage tab upgrade) — plan
- workday_limits.py
- ImportHistoryPanel
- migrate_res_state_admin_only.sql
- public.res_state
- ImportHistoryPanel
- Generator (full originals)
- session 2026-10-16
- scheduleGrouping.test.js
- cellAlternatives.js
- payload.py
- blockRail.js
- Done: 24 commits on `feat/dashboard-rail-activity`, branched from `feat/quality-gap`
- Resident walkthrough (`/requests`)
- normalizeImportLog
- add_soft_sequence_constraint
- Raw Session Log
- dependencies
- ayLedger.test.js
- Admin walkthrough steps (`/`)
- QGenda Export Path Mapping
- JeopardyTab
- ProgressReporter
- matchRosterByName
- labelForIssue
- toastHistory.js
- useUiPrefsContext
- TimeOffModal
- flagLedgerRows

## God Nodes (most connected - your core abstractions)
1. `6. Current branch (`fix/rule-policy`) — in-progress work` - 999 edges
2. `6. Current branch (`fix/rule-policy`) — in-progress work` - 929 edges
3. `Weaknesses and gaps observed` - 244 edges
4. `parse_payload()` - 168 edges
5. `Payload` - 150 edges
6. `parseDate()` - 130 edges
7. `make_payload()` - 109 edges
8. `make_resident()` - 103 edges
9. `vitest` - 96 edges
10. `4. Real data vs. descriptive text` - 94 edges

## Surprising Connections (you probably didn't know these)
- `All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify.` --references--> `main()`  [INFERRED]
  CC-Session-Logs/18-09-2026-11_21-a520850a30cde04cc-users-amade-appdata-local.md → solver-service/cli.py
- `User` --references--> `main()`  [INFERRED]
  CC-Session-Logs/18-09-2026-11_21-a520850a30cde04cc-users-amade-appdata-local.md → solver-service/cli.py
- `4. ACGME rules — memory vs. code` --references--> `_add_eve_day_pairs()`  [INFERRED]
  CC-Session-Logs/16-10-2026-21_22-review-scheduling-algorithm-assess-further.md → solver-service/solver/model/circadian.py
- `4. Schedule — the grid` --references--> `schedule()`  [INFERRED]
  docs/WALKTHROUGH.md → src/lib/idleTimer.js
- `Assistant` --references--> `offServiceStraddle()`  [INFERRED]
  CC-Session-Logs/17-10-2026-14_22-also-nice-indication-when-someone.md → src/lib/offServiceWindow.js

## Import Cycles
- None detected.

## Communities (196 total, 42 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.01
Nodes (141): buildHeatmapRows(), coverageCellStatus(), heatmapCell(), TYPE_ORDER, bucketLabel(), REPORT, ACTIVITY_FMT, AREA_LAST_SHIFT (+133 more)

### Community 1 - "playgrounds.js"
Cohesion: 0.11
Nodes (40): Persistence, assertWriteTargetRowId(), filterOwnPlaygrounds(), findMatchingRealBlock(), isLegacyDemoRowId(), isPlaygroundId(), isPlaygroundModeValue(), isSandboxRowId() (+32 more)

### Community 2 - "6. Current branch (`fix/rule-policy`) — in-progress work"
Cohesion: 0.00
Nodes (993): 6. Current branch (`fix/rule-policy`) — in-progress work, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+985 more)

### Community 3 - "Raw Session Log"
Cohesion: 0.05
Nodes (42): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+34 more)

### Community 4 - "shifts.js"
Cohesion: 0.08
Nodes (41): User, Reuse (no new rule logic), coverageFillStats(), nightRunsFor(), applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS (+33 more)

### Community 5 - "builder.py"
Cohesion: 0.10
Nodes (26): _apply_cap_edit(), _apply_coverage_min_edit(), _apply_target_edit(), _assigned_count_for_cap(), build_feasibility_report(), build_recommendations(), build_violations(), _cap_recommendation() (+18 more)

### Community 6 - "CUsersamadeAppDataLocalTempclaudeC--Users-amade-projects-resident-schedulerd2320667-24c3-4c97-ba36-1af708a9f28fscratchpadold_RS.jsx"
Cohesion: 0.01
Nodes (143): AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS, BLOCK_TYPE_MAP, BLOCK_TYPES_EM, BlockProgressBar() (+135 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.07
Nodes (33): keptCellsForMode(), issues, lockedCells, schedule, violatingCells(), checkGenerateReadiness(), diffScheduleCells(), updateBlockTracked() (+25 more)

### Community 8 - "Raw Session Log"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "vitest"
Cohesion: 0.05
Nodes (45): vitest, SEEDS, block, acepFixture(), PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor() (+37 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.13
Nodes (32): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+24 more)

### Community 12 - "CUsersamadeAppDataLocalTempclaudeC--Users-amade-projects-resident-schedulerd2320667-24c3-4c97-ba36-1af708a9f28fscratchpadnew_RS.jsx"
Cohesion: 0.01
Nodes (136): AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS, BLOCK_TYPE_MAP, BLOCK_TYPES_EM, BlockProgressBar() (+128 more)

### Community 13 - "generateSchedule"
Cohesion: 0.07
Nodes (65): blockDayIndex(), buildSolverPayload(), buildStaticGenContext(), cellViolations(), checkCircadianViolations(), checkRestViolations(), compositionSatisfies(), computeTotalCoverageSupply() (+57 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.12
Nodes (22): UI conventions (full originals), react-dom, clampGridColExtra(), clampGridZoom(), DEFAULT_UI_PREFS, GRID_COL_EXTRA_MAX, src_lib_uiprefs_grid_group_modes, GRID_ZOOM_DEFAULT (+14 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.16
Nodes (16): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+8 more)

### Community 16 - "Walkthrough.jsx"
Cohesion: 0.16
Nodes (20): 2. Implementation details, GettingStartedFooter(), UserGuideTab(), CARD_GAP, CARD_H_FALLBACK, CARD_W, cornerBox(), inflate() (+12 more)

### Community 17 - "4. Real data vs. descriptive text"
Cohesion: 0.02
Nodes (93): 4. Real data vs. descriptive text, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+85 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (22): auth, auth.users, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests, day_off_requests_cancel_guard (+14 more)

### Community 19 - "feedback Table Schema"
Cohesion: 0.33
Nodes (6): Crash Auto-Capture (window.onerror/unhandledrejection), User Feedback + Admin Portal Design, Feedback Admin Netlify Function, feedback Table Schema, Floating Feedback Widget (Bug/Crash/Idea), Track A: Shared-Password Admin Gating

### Community 20 - "Findings"
Cohesion: 0.04
Nodes (45): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+37 more)

### Community 21 - "parseDate"
Cohesion: 0.07
Nodes (92): addDays(), getBlockWeekends(), parseDate(), toDateStr(), dateRange(), nightRun(), papaBare, restIssues() (+84 more)

### Community 22 - "generateSchedule"
Cohesion: 0.07
Nodes (68): blockDayIndex(), buildSolverPayload(), buildStaticGenContext(), cellViolations(), checkCircadianViolations(), checkRestViolations(), compositionSatisfies(), computeTotalCoverageSupply() (+60 more)

### Community 23 - "schemas.py"
Cohesion: 0.13
Nodes (23): BaseModel, User, pydantic, AyPriorModel, BlockModel, CapsModel, ConfigModel, CoverageEntryModel (+15 more)

### Community 24 - "Payload"
Cohesion: 0.11
Nodes (39): date, Pin-to-hint re-measurement (post circadian fix, 2026-09-27), Payload, _add_night_cap(), Rule 22: total nights THIS block <= caps.nights, unless night-exempt (e.g. a…, no_overstaff_shift(), True when `shift` may NEVER use the +1 last-resort overstaff allowance (see…, _weekend_dates() (+31 more)

### Community 25 - "formatDisplayDate"
Cohesion: 0.10
Nodes (33): AvailabilityRangesEditor(), downloadBackupBlob(), FeasibilityReportCard(), FeedbackWidget(), handleSubmit(), reset(), formatDisplayDate(), setCell() (+25 more)

### Community 26 - "useMonthPager"
Cohesion: 0.29
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), containers, Harness(), mountPager(), Harness() (+2 more)

### Community 27 - "parse_payload"
Cohesion: 0.06
Nodes (94): What changed, parse_payload(), add_coverage_constraints(), `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, load_default_weights(), merged_weights(), Static config, read once per process rather than per solve. Cached safely…, build_variables() (+86 more)

### Community 28 - "getEligibleShifts"
Cohesion: 0.09
Nodes (43): Imports & exports, CTX, elig(), classifyCellIssues(), formatGapH(), gapIsShort(), shiftGapsFor(), blockTypeFilterPasses() (+35 more)

### Community 29 - "parse.js"
Cohesion: 0.12
Nodes (28): 1. How off-service residents are modeled, CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), normalizeToken(), parseDateRangeInAY() (+20 more)

### Community 30 - "Raw Session Log"
Cohesion: 0.03
Nodes (66): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+58 more)

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "qgenda.js"
Cohesion: 0.28
Nodes (14): qgendaDate(), normalizeQgendaHeaderOverrides(), QGENDA_COLUMN_DEFAULTS, QGENDA_JEOPARDY_TASK_ID, QGENDA_NAME_FORMATS, QGENDA_VARIANTS, qgendaEndDate(), qgendaName() (+6 more)

### Community 33 - "ResidentScheduler"
Cohesion: 0.06
Nodes (45): buildSnapData(), deepEqualNormalized(), FeedbackWidget(), handleSubmit(), reset(), makeDefaultBlock(), migratePedNightAssignments(), migratePedsPgy1ToPgy2() (+37 more)

### Community 34 - "Circadian Scheduling Rules"
Cohesion: 0.40
Nodes (5): Circadian Scheduling Rules, Grand Rounds Lecture Day-Before Rule, Chief-Editable Journal Club Dates, Journal Club Rules, PED-N Split Into Two Shift IDs

### Community 35 - "Field-Ready Design System"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 36 - "SettingsTab"
Cohesion: 0.18
Nodes (13): blockChanged(), blocksById(), deepEqual(), diffState(), scheduleCellsChanged(), roster(), getGeneralPedsTarget(), sbFetchHistoryData() (+5 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "solve"
Cohesion: 0.03
Nodes (113): argparse, Assistant, Assistant, Assistant, copy, json, Parse a /solve-shaped dict, solve, return the response dict. Entry point for…, solve_raw() (+105 more)

### Community 40 - "Summary"
Cohesion: 0.04
Nodes (50): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+42 more)

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "test_trauma_runs.py"
Cohesion: 0.05
Nodes (87): Applied, itertools, 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), 2. Per-module size contribution (isolated measurement), 3. The fix, 4. Correctness guardrail, 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped) (+79 more)

### Community 45 - "VarStore"
Cohesion: 0.07
Nodes (63): Assistant, Simplification Review, Skipped, User, dataclasses, functools, build_model(), payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving… (+55 more)

### Community 46 - "ResidentScheduler"
Cohesion: 0.04
Nodes (70): buildResidentICS(), buildSnapData(), demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), FeedbackWidget(), handleSubmit(), reset() (+62 more)

### Community 47 - "shiftActiveOnDow"
Cohesion: 0.19
Nodes (31): shiftActiveOnDow(), compositionSatisfies(), fallbackCompositionAt(), assignCell(), candidatePool(), fillDayPass(), hasSenior(), movable() (+23 more)

### Community 52 - "supabaseClient.js"
Cohesion: 0.09
Nodes (32): lucide-react, react, SetNewPassword(), holidayNameForDateAnyAy(), RequestPortalCard(), blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup() (+24 more)

### Community 53 - "getBlockDates"
Cohesion: 0.03
Nodes (104): 5. Concrete algorithmic weaknesses observed, ref_node_child_process, ref_node_fs, ref_node_os, ref_node_path, ref_node_url, 5. Concrete algorithmic weaknesses observed, baselinePath() (+96 more)

### Community 54 - "prettyDate"
Cohesion: 0.19
Nodes (19): dayNum(), FAMILY_TONE, hasSeparateStints(), laneBar(), laneBoundaries(), NEUTRAL_TONE, servicesPresent(), serviceTone() (+11 more)

### Community 58 - "repairPass"
Cohesion: 0.31
Nodes (23): assignCell(), hasSenior(), movable(), pickBestScore(), poolFor(), preferTruePrimaryPass(), repairPass(), backfillVacated() (+15 more)

### Community 63 - "updateBlock"
Cohesion: 0.08
Nodes (37): AddResidentModal(), applyStartDate(), DashboardTab(), onStartDateChange(), setBlockField(), updSD(), dateInRanges(), effectiveChiefRole() (+29 more)

### Community 71 - "migrate_admin_email_allowlist.sql"
Cohesion: 0.47
Nodes (5): admin_email_allowlist, profiles_admin_allowlist_promote, public.apply_admin_allowlist(), public.current_user_is_allowlisted_admin(), public.apply_admin_allowlist

### Community 76 - "test_modal_jobs.py"
Cohesion: 0.04
Nodes (44): BaseException, dict, InMemoryJobs, _Job, JobBackendError, JobConflict, JobNotFound, ModalJobs (+36 more)

### Community 77 - "User"
Cohesion: 0.18
Nodes (22): User, ACTIVITY_KINDS, actorLabel(), appendActivity(), EDIT_KINDS, lastActivity(), MONTHS, nonNegInt() (+14 more)

### Community 78 - "acgmeHours.js"
Cohesion: 0.13
Nodes (26): Scheduling/data-model (original wording), buildDailyContributions(), combinedRow(), ED_WEEKLY_CAP_H, edHoursOn(), fullDateRange(), GR_DURATION_H, GR_END_H (+18 more)

### Community 79 - "6. Current branch (`fix/rule-policy`) — in-progress work"
Cohesion: 0.00
Nodes (924): 6. Current branch (`fix/rule-policy`) — in-progress work, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+916 more)

### Community 80 - "jobs.py"
Cohesion: 0.05
Nodes (68): delete, fastapi, fastapi_middleware_cors, fastapi_responses, httpx, importlib_metadata, logging, os (+60 more)

### Community 81 - "ScheduleGrid"
Cohesion: 0.06
Nodes (59): blockTypeFilterPasses(), checkGenerateReadiness(), computeTotalTargetDemand(), diffScheduleCells(), effectiveChiefRole(), effectiveWellnessWednesdayDate(), eligibilityBlockReasons(), EquityPanel() (+51 more)

### Community 82 - "Overall: All addressed"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 83 - "Deploying the solver on Modal"
Cohesion: 0.11
Nodes (20): asgi_app, concurrent, function, Image, modal, pathlib, Alternative considered: Google Cloud Run, Cost (checked 2026-10-17, re-check on modal.com/pricing) (+12 more)

### Community 84 - "ScheduleGrid"
Cohesion: 0.10
Nodes (36): checkGenerateReadiness(), diffScheduleCells(), showToast(), updateBlockTracked(), ScheduleGrid(), applyAssign(), applyGive(), applySwap() (+28 more)

### Community 85 - "Weaknesses and gaps observed"
Cohesion: 0.01
Nodes (241): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+233 more)

### Community 86 - "blockStatus.test.js"
Cohesion: 0.21
Nodes (7): 3. Block model, BLOCK_STEP_IDS, deriveBlockSteps(), formatShortDate(), SHORT_MONTHS, BASE, BlockStepsRow()

### Community 87 - "formatDisplayDate"
Cohesion: 0.06
Nodes (24): AvailabilityRangesEditor(), CellInspector(), classifyForHandEdit(), countPublishedHolidayShifts(), DateListEditor(), DragConfirmModal(), FeasibilityReportCard(), formatDisplayDate() (+16 more)

### Community 88 - "Done — 7 PRs open, all review-clean, nothing touched prod branches"
Cohesion: 0.08
Nodes (25): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+17 more)

### Community 90 - "useSpotlightTarget.js"
Cohesion: 0.24
Nodes (13): ACQUIRE_TIMEOUT_MS, prefersReducedMotion(), rectsEqual(), roundRect(), SETTLE_FRAMES, useSpotlightTarget(), acquire(), acquireLoop() (+5 more)

### Community 91 - "formatDisplayDate"
Cohesion: 0.05
Nodes (37): AvailabilityRangesEditor(), BlockCalendarRow(), BlockMonthGrid(), CellInspector(), classifyForHandEdit(), computeCoverageByDate(), countPublishedHolidayShifts(), CoverageByAreaView() (+29 more)

### Community 92 - "TermGroup"
Cohesion: 0.18
Nodes (25): add_em_composition_terms(), add_pgy_fallback_terms(), _area_shift_dates(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, _add_em_composition_round2b_terms() (+17 more)

### Community 93 - "updateBlock"
Cohesion: 0.12
Nodes (24): applyStartDate(), DashboardTab(), onStartDateChange(), setBlockField(), updSD(), dateInRanges(), EMResidentsTab(), removeRes() (+16 more)

### Community 94 - "test_weight_tiering.py"
Cohesion: 0.08
Nodes (29): Changed rule: `restGap` (rule 17) — GR-end adjustment, New rule: `edWeekly60` / `totalWeekly72` (ACGME EM 6.17.a.3, tier `acgme`), New soft term: `seniorTruePrimary`, R7 (2026-09-27): rule-severity policy + ACGME EM work-hour rules — solver parity, Response shape, What was already aligned (no change needed), cap_enforcement(), duty_enforcement() (+21 more)

### Community 95 - "useWalkthroughSeen.js"
Cohesion: 0.17
Nodes (18): User, User, User, User, Decisions, Round 2 (resident walkthrough), mergeWalkthroughSeen(), readLocalMirror() (+10 more)

### Community 96 - "Efficiency Review"
Cohesion: 0.05
Nodes (37): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+29 more)

### Community 97 - "solve.py"
Cohesion: 0.05
Nodes (82): 3. Known gaps from docs (solver-service/docs/PAYLOAD_SCHEMA.md R9 section + tier table), 2. Local generator, CpSolver, ortools_sat_python, 3. Known gaps from docs (solver-service/docs/PAYLOAD_SCHEMA.md R9 section + tier table), CP-SAT solver service (optional second engine), Coverage-mapping investigation, part 3 (2026-09-27): no gap found; the loss is `TIER_QUALITY` noise, Default `maxTimeSeconds` raised 30s -> 60s; Deep Solve stays 120s; stage split unchanged (2026-10-16) (+74 more)

### Community 98 - "bound_probe.py"
Cohesion: 0.23
Nodes (16): math, _core_deficit_units_expr(), _coverage_miss_expr(), _probe_coverage_miss(), _probe_deficit_core_units(), _probe_under_target_core(), Bound probe: for a given payload, measures the CP-SAT-PROVEN best achievable…, Adds one new bool `b_r` per EM-core resident with a non-null target and the… (+8 more)

### Community 99 - "qgendaImport.js"
Cohesion: 0.17
Nodes (21): QGENDA_TASKS, buildQGendaImport(), buildScheduleFromImport(), cell(), countDayNumbers(), countDowCells(), DOW_INDEX, findDayNumberRow() (+13 more)

### Community 100 - "Session Log: 06-09-2026 18:35 - nd-option"
Cohesion: 0.22
Nodes (8): Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Recent Commits, Session Log: 06-09-2026 18:35 - nd-option, Tool Activity, Verification, Working Tree At Close

### Community 101 - "Session Log: 16-10-2026 23:56 - review-scheduling-algorithm-assess-further"
Cohesion: 0.08
Nodes (23): 1. Pipeline summary, 2. Current quality baselines (5-seed averages, `src/lib/__fixtures__/qualityBaseline.*.json`), 4. ACGME rules — memory vs. code, **(a) Existing Tabs/Navigation**, App Feature Inventory, Assistant, Assistant, Assistant (+15 more)

### Community 102 - "schedule"
Cohesion: 0.16
Nodes (13): MFA — not yet implemented, Security hygiene notes, Shared-workstation admin sessions (2026-10-15), createIdleTimer(), clearTimers(), schedule(), DEFAULT_IDLE_TIMEOUT_MINUTES, DEFAULT_IDLE_WARNING_SECONDS (+5 more)

### Community 103 - "test_api_jobs.py"
Cohesion: 0.06
Nodes (36): cryptography_hazmat_primitives_asymmetric, fastapi_testclient, jwt, pytest, _fast_solve(), _hs256_token(), _poll_until(), Tests for api.jobs: POST /jobs, GET /jobs/{id}, DELETE /jobs/{id}.… (+28 more)

### Community 107 - "reviewPanel.js"
Cohesion: 0.28
Nodes (13): coverageDirection(), GROUP_MESSAGE_LABELS, groupIssuesByKind(), groupKeyForIssue(), groupPanelIssues(), isJumpableIssue(), ISSUE_RULE_LABELS, issueJumpTarget() (+5 more)

### Community 109 - "prettyDate"
Cohesion: 0.10
Nodes (22): AYConferenceEditor(), BlockCalendarSection(), BlockContextBar(), detectHomeAndOffSheetsByContent(), ImportLecturesModal(), commit(), parse(), ImportMatrixModal() (+14 more)

### Community 110 - "Persistence / cloud sync (original wording)"
Cohesion: 0.17
Nodes (18): Persistence / cloud sync (original wording), FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), getAccessTokenBounded() (+10 more)

### Community 111 - "repairPass"
Cohesion: 0.33
Nodes (22): assignCell(), candidatePool(), movable(), pickBestScore(), poolFor(), preferTruePrimaryPass(), repairPass(), backfillVacated() (+14 more)

### Community 112 - "RulesTab"
Cohesion: 0.06
Nodes (29): BlockCalendarSection(), buildQualityInput(), computeAyPriorTotals(), computeScarceSeniorReservations(), describeDayRules(), describeShiftGates(), eligKey(), fallbackCompositionAt() (+21 more)

### Community 113 - "Raw Session Log"
Cohesion: 0.17
Nodes (12): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Raw Session Log (+4 more)

### Community 114 - "Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local"
Cohesion: 0.20
Nodes (9): 3. Verbatim excerpts, All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify., Files Modified, New breakage: 1 Minor, Quick Reference (for AI scanning), Quick Resume Context, Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local, Tool Activity (+1 more)

### Community 115 - "Raw Session Log"
Cohesion: 0.12
Nodes (16): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+8 more)

### Community 116 - "Security history and posture — resident-scheduler"
Cohesion: 0.11
Nodes (22): 1. Timeline of security decisions/incidents, 2. Current controls, 3. Open/unresolved concerns explicitly documented, 4. Does `res_state` RLS restrict writes to admin? — **No.**, Assistant, Assistant, Assistant, Security history and posture — resident-scheduler (+14 more)

### Community 117 - "package.json"
Cohesion: 0.05
Nodes (35): devDependencies, autoprefixer, jsdom, postcss, tailwindcss, vite, @vitejs/plugin-react, vitest (+27 more)

### Community 118 - "offServiceAlignment.js"
Cohesion: 0.19
Nodes (16): buildOffServiceAlignment(), cmp(), collectBlocks(), dayCount(), fmt(), fmtRange(), isIso(), mergeWindows() (+8 more)

### Community 119 - "dates.js"
Cohesion: 0.09
Nodes (32): Scheduling rules (full originals), ayWindowFor(), formatAY(), getAcademicYearFor(), applyDateRangePaint(), paintActionFor(), toggleDateInList(), computeBuyDownsApplied() (+24 more)

### Community 120 - "Session Log: 26-09-2026 14:15 - session"
Cohesion: 0.29
Nodes (6): Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Session Log: 26-09-2026 14:15 - session, Tool Activity, Working Tree At Close

### Community 121 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

### Community 122 - "scoreWeights.test.js"
Cohesion: 0.40
Nodes (5): bandOf(), groupBand(), preferenceKeys, structuralKeys, SCORE_TIERS

### Community 123 - "prettyDate"
Cohesion: 0.07
Nodes (34): AddResidentModal(), AYConferenceEditor(), BlockCalendarRow(), BlockContextBar(), BlockMonthGrid(), computeCoverageByDate(), CoverageByAreaView(), CoverageByDateView() (+26 more)

### Community 125 - "getEligibleShifts"
Cohesion: 0.09
Nodes (38): blockTypeFilterPasses(), buildResidentICS(), demoFilenameSuffix(), effectiveWellnessWednesdayDate(), eligBaseFor(), eligCategoryList(), eligibilityBlockReasons(), exportMatrixPDF() (+30 more)

### Community 126 - "Session Log: 16-10-2026 21:22 - review-scheduling-algorithm-assess-further"
Cohesion: 0.08
Nodes (25): 1. Pipeline summary, 2. Current quality baselines (5-seed averages, `src/lib/__fixtures__/qualityBaseline.*.json`), 4. ACGME rules — memory vs. code, **(a) Existing Tabs/Navigation**, App Feature Inventory, Assistant, Assistant, Assistant (+17 more)

### Community 127 - "ResidentScheduler"
Cohesion: 0.08
Nodes (35): getAcademicYear(), buildSnapData(), DashboardTab(), onStartDateChange(), setBlockField(), updSD(), deepEqualNormalized(), makeDefaultBlock() (+27 more)

### Community 128 - "ayLedger.js"
Cohesion: 0.18
Nodes (17): buildAyLedger(), buildCategory(), buildPgyGroups(), CATEGORY_LABELS, computeColumnVisibility(), DEFAULT_FLAG_RAW_DELTA, DEFAULT_HEAVY_RATE_MULTIPLIER, DEFAULT_LIGHT_RATE_MULTIPLIER (+9 more)

### Community 129 - "TokenBucketLimiter"
Cohesion: 0.13
Nodes (9): _Bucket, _ConfiguredLimiter, Caller must hold `self._lock`. Cheap no-op most calls -- only actually walks…, Test-only: current table size, for asserting the sweep worked., Lazily (re)builds a `TokenBucketLimiter` whenever its configured (rate, burst)…, Returns None if the call is allowed (and consumes one token), else the number…, TokenBucketLimiter, LOW finding fix: a bucket untouched for longer than the idle TTL gets swept out… (+1 more)

### Community 130 - "TimeOffModal"
Cohesion: 0.40
Nodes (3): MonthCalendarView, TimeOffModal(), useMonthPager()

### Community 132 - "RulesTab"
Cohesion: 0.09
Nodes (20): buildQualityInput(), computeAyPriorTotals(), computeScarceSeniorReservations(), describeDayRules(), describeShiftGates(), eligKey(), fallbackCompositionAt(), generateScheduleBest() (+12 more)

### Community 133 - "test_api_auth.py"
Cohesion: 0.10
Nodes (30): jwt_algorithms, _allowlist_env(), _hs256_token(), _patch_jwks(), _post(), Tests for api.auth's SOLVER_AUTH_MODE gate on POST /solve. `solve()` itself is…, A key rotation, with enough real time between the two requests to clear the 60s…, HIGH finding fix: a token with alg RS256 and a never-valid `kid` must not force… (+22 more)

### Community 134 - "updateBlock"
Cohesion: 0.19
Nodes (14): EMResidentsTab(), removeRes(), setBA(), setTargetDelta(), setTargetFlag(), target(), OffServiceTab(), addRes() (+6 more)

### Community 135 - "whatIf.js"
Cohesion: 0.19
Nodes (14): applyCloneResident(), applyCoverageMin(), applyRemoveResident(), applyScenario(), cloneOneResident(), compareResults(), compareResultSets(), countByShift() (+6 more)

### Community 136 - "Auth, rate limiting, body size cap (`/solve`)"
Cohesion: 0.33
Nodes (5): Auth, rate limiting, body size cap (`/solve`), Client contract, Env vars, Fly secrets (set by hand, not run here), solver-service

### Community 137 - "uuid"
Cohesion: 0.15
Nodes (11): pickTopBlocker(), summarizeSlotBlockers(), TRIVIAL_BLOCKERS, AddResidentModal(), describeWhatIfChange(), requestSickCallCover(), uuid(), WhatIfCard() (+3 more)

### Community 138 - "limits.py"
Cohesion: 0.09
Nodes (21): _BodyTooLarge, _max_body_bytes(), MaxBodySizeMiddleware, limited_receive(), _noop_receive(), ASGIApp, Exception, Receive (+13 more)

### Community 139 - "timing.py"
Cohesion: 0.11
Nodes (30): datetime, Grand Rounds rest/streak semantics rewrite (2026-10-15, chief decision), date_diff_days(), gap_between(), hour_mark_min(), _ordinal_minutes(), overlaps_hour_window(), The ONLY cross-midnight math in the solver. Every constraint family that needs… (+22 more)

### Community 140 - "ShiftMatrixTab"
Cohesion: 0.25
Nodes (15): areaDividerClass(), ShiftMatrixTab(), baseFor(), CellButton(), effective(), isElig(), isModified(), resetRow() (+7 more)

### Community 141 - "ShiftMatrixTab"
Cohesion: 0.25
Nodes (15): areaDividerClass(), ShiftMatrixTab(), baseFor(), CellButton(), effective(), isElig(), isModified(), resetRow() (+7 more)

### Community 142 - "User"
Cohesion: 0.08
Nodes (29): User, OVERRIDE_TIER_RULE_IDS, RULE_POLICY, TIERS, classifyResidentForSlot(), findSlotCandidates(), hasOverrideTierViolation(), rankCandidates() (+21 more)

### Community 143 - "test_workday_limits.py"
Cohesion: 0.32
Nodes (12): R9 follow-up, part 2 (2026-09-27): GR-after-night exemption decided inside the model, _build(), test_exemption_lets_solver_legally_place_a_pattern_js_allows(), test_gr_day_after_a_night_not_counted_as_workday(), test_gr_day_without_a_night_before_still_counted_as_workday(), test_obligation_day_forces_work_var_true_with_no_shift(), test_obligation_without_exempt_flag_counts_even_after_a_night(), test_post_run6_rest_blocks_shift_within_24h_after_completed_run_isolated_from_rule19() (+4 more)

### Community 144 - "generateViaSolverOrLocal"
Cohesion: 0.12
Nodes (27): Assistant, 3. Solver service, Assistant, Assistant, checkLocalSolverHealth(), getSolverJobsMode(), getSolverUrl(), isUnresolvedToken() (+19 more)

### Community 145 - "holidays.js"
Cohesion: 0.26
Nodes (16): buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidaysInRange(), isHolidayDate() (+8 more)

### Community 146 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 147 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 148 - "add_circadian_constraints"
Cohesion: 0.12
Nodes (30): Night-stint contiguity gap closed (2026-10-16), add_circadian_constraints(), _add_eve_day_pairs(), _add_night_run_segments(), _add_night_run_window(), get_term(), _link_night(), Rule 18 (eve<->day adjacency + night-run<=6 sliding window), rule 22 (max… (+22 more)

### Community 149 - "expectedFiller.js"
Cohesion: 0.27
Nodes (8): bucketKeyFor(), bucketLabel(), categoryChipLabel(), expectedFillerFor(), requirementFor(), baseSeniorityRules, CATEGORIES, COMPOSITION

### Community 150 - "substituteReasonFor"
Cohesion: 0.31
Nodes (9): conferenceAwayPgys(), conferenceDefs(), flexWellnessSubstituteAllowed(), getConferencesInBlock(), isConferenceAwayFor(), nthWeekdayOnOrAfter(), podWellnessSubstituteAllowed(), seniorWellnessSubstituteAllowed() (+1 more)

### Community 151 - "reset_rate_limiter"
Cohesion: 0.14
Nodes (18): Test-only: drop all cached JWKS state so a monkeypatched fetch starts clean…, reset_jwks_cache(), Test-only: drop all job state (and the cached backend) between test cases., reset_jobs_store(), Test-only: drop all bucket state (both layers) so each test starts with full…, reset_rate_limiter(), _isolated_state(), fixture (+10 more)

### Community 152 - "test_weekly_hours.py"
Cohesion: 0.44
Nodes (10): _build(), _force_all(), R7 (2026-09-27): ACGME EM 6.17.a.3 rolling-7-day 60 ED / 72 total hour caps…, test_ed_cap_allows_five_twelve_hour_shifts_in_one_week(), test_ed_cap_forbids_seven_twelve_hour_shifts_in_one_week(), test_off_rotation_resident_not_subject_to_weekly_caps(), test_off_service_resident_not_subject_to_weekly_caps(), test_schedulable_defaults_true_for_back_compat() (+2 more)

### Community 153 - "migrate_res_state_history.sql"
Cohesion: 0.28
Nodes (7): public.res_state_archive_history, public.res_state_set_audit_fields, public.res_state_archive_history(), public.res_state_history, res_state_archive_history, res_state_audit_fields, res_state_history_row_id_id_idx

### Community 154 - "Session Log: 16-10-2026 09:45 - session"
Cohesion: 0.25
Nodes (7): Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Recent Commits, Session Log: 16-10-2026 09:45 - session, Tool Activity, Working Tree At Close

### Community 155 - "RulesTab"
Cohesion: 0.08
Nodes (12): computeScarceSeniorReservations(), DateListEditor(), describeDayRules(), describeShiftGates(), eligKey(), RulesTab(), renderCoverageCell(), SpecialDaysList() (+4 more)

### Community 156 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 157 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 158 - "Archived from CLAUDE.md on 2026-09-26 (compaction)"
Cohesion: 0.09
Nodes (23): 12-hour shift windows, Archived: 2026-09-26 (session-end hook, PICKLEBOOK), Archived: 2026-10-15 (Grand Rounds rest/streak rewrite), Archived: 2026-10-16 (session-end hook, PICKLEBOOK), Archived 2026-10-16: verbose originals of tightened CLAUDE.md bullets (resident-scheduler), Archived from CLAUDE.md on 2026-09-26 (compaction), CLAUDE.md Archive, Layout & stack (+15 more)

### Community 159 - "run-local.sh"
Cohesion: 0.50
Nodes (3): run-local.sh script, SOLVER_AUTH_MODE, SOLVER_CORS_ORIGINS

### Community 160 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 161 - "Session Log: 17-10-2026 14:22 - also-nice-indication-when-someone"
Cohesion: 0.09
Nodes (22): 1. Dashboard tab, 1. Recent commits, 2. App shell, 2. Window status, straddle badge and call sites, 3. Computing block overlap and alignment for a year, 4. Design tokens, 4. Quality baselines, 5. Other UX pain points visible in code (+14 more)

### Community 162 - "Security headers rollout"
Cohesion: 0.29
Nodes (6): 1. Check the Report-Only CSP on a deploy preview, 2. Resolve the open decisions before enforcing, 3. Flip to enforcing, "Run the optimizer on this computer" (2026-10-16), Security headers rollout, Status (2026-10-15): enforcing

### Community 163 - "Coverage board (Coverage tab upgrade) — plan"
Cohesion: 0.33
Nodes (5): Build steps, Coverage board (Coverage tab upgrade) — plan, Decisions (user, 2026-10-15), Goal, Verification

### Community 164 - "workday_limits.py"
Cohesion: 0.15
Nodes (19): New/changed request fields, as_literal(), const_lit(), Normalize a rolling-window/sequence term (python int OR a real BoolVar) into…, A fixed-value CP-SAT literal (usable in add_bool_and/or, OnlyEnforceIf, and…, _add_post_run6_rest(), _add_six_day_window(), get_term() (+11 more)

### Community 175 - "scheduleGrouping.test.js"
Cohesion: 0.16
Nodes (14): Assistant, Reuse review findings, User, GRID_GROUP_MODE_DEFAULT, GRID_GROUP_MODES, groupResidents(), PGY_GROUPS, pushNonEmpty() (+6 more)

### Community 176 - "cellAlternatives.js"
Cohesion: 0.22
Nodes (12): byDeficitThenSoftCount(), clearCell(), findAssignOptions(), findGiveCandidates(), findSwapCandidates(), hasOverrideTierViolation(), ineligibleButOverridable(), RESIDENTS (+4 more)

### Community 177 - "payload.py"
Cohesion: 0.16
Nodes (16): AyPrior, Block, CoverageEntry, LockedCell, _parse_coverage(), _parse_eligible(), _parse_locked(), _parse_obligations() (+8 more)

### Community 178 - "blockRail.js"
Cohesion: 0.20
Nodes (14): ayOptionsFor(), buildRailBlocks(), dayNumber(), MONTHS, railNumeral(), shortDate(), shortDateRange(), todayMarker() (+6 more)

### Community 179 - "Done: 24 commits on `feat/dashboard-rail-activity`, branched from `feat/quality-gap`"
Cohesion: 0.12
Nodes (16): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+8 more)

### Community 180 - "Resident walkthrough (`/requests`)"
Cohesion: 0.15
Nodes (14): User, User, 1. Request a day off, 2. Requesting more than one date, 3. Reason (optional), 4. Submit request, 5. Track your requests, First-login walkthrough (+6 more)

### Community 181 - "normalizeImportLog"
Cohesion: 0.23
Nodes (12): appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), ImportHistoryPanel(), deleteEntry(), ImportLecturesModal(), commit(), commit() (+4 more)

### Community 182 - "add_soft_sequence_constraint"
Cohesion: 0.22
Nodes (13): Night-stint contiguity preference + avoidable/forced fragmentation split (2026-10-14), _add_work_shape_term(), _prev_work_term_before_block(), add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so… (+5 more)

### Community 183 - "Raw Session Log"
Cohesion: 0.15
Nodes (13): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+5 more)

### Community 184 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, qrcode (+4 more)

### Community 185 - "ayLedger.test.js"
Cohesion: 0.18
Nodes (3): DEFAULT_BEHIND_TARGET_THRESHOLD, defaultIsEm(), GROUP_LABELS

### Community 186 - "Admin walkthrough steps (`/`)"
Cohesion: 0.20
Nodes (10): 1. Dashboard — your command center, 2. EM Residents — the roster, 3. Shift Matrix — who can work what, 4. Schedule — the grid, 5. Scheduling Rules — coverage targets, 6. Violations — the generation report, 7. Jeopardy — backup call, 8. Requests — resident day-off requests (+2 more)

### Community 187 - "QGenda Export Path Mapping"
Cohesion: 0.22
Nodes (9): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+1 more)

### Community 188 - "JeopardyTab"
Cohesion: 0.31
Nodes (6): DATES6, dateInRanges(), fillJeopardy(), jeopardyCandidatesFor(), JeopardyTab(), runFill()

### Community 190 - "matchRosterByName"
Cohesion: 0.54
Nodes (6): matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), matchLectureRosterName()

### Community 191 - "labelForIssue"
Cohesion: 0.29
Nodes (8): issueKey(), labelForIssue(), AssignRow(), CandidateRow(), CellInspector(), IssueGroupRow(), renderIssueOrGroup(), ReviewPanel()

### Community 192 - "toastHistory.js"
Cohesion: 0.48
Nodes (5): addToastEntry(), clearToastHistory(), formatToastAge(), TOAST_HISTORY_LIMIT, ToastHistoryPanel()

### Community 193 - "useUiPrefsContext"
Cohesion: 0.33
Nodes (7): CollapsibleCard(), reconcileTabOrder(), reorderIds(), SidebarNav(), renderTabButton(), resetDrag(), useUiPrefsContext()

### Community 194 - "TimeOffModal"
Cohesion: 0.40
Nodes (3): MonthCalendarView, TimeOffModal(), useMonthPager()

### Community 195 - "flagLedgerRows"
Cohesion: 0.40
Nodes (4): 4. Existing cross-year views and where to add one, flagLedgerRows(), AyFairnessLedgerCard(), AyLedgerOffServiceSection()

## Knowledge Gaps
- **3202 isolated node(s):** `supabase`, `SHIFT_ORDER_INDEX`, `SHIFT_LABEL_BY_ID`, `QGENDA_NAME_FORMAT_LABEL`, `BLOCK_TYPES_EM` (+3197 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 4011 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **42 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `6. Current branch (`fix/rule-policy`) — in-progress work` connect `6. Current branch (`fix/rule-policy`) — in-progress work` to `Session Log: 16-10-2026 23:56 - review-scheduling-algorithm-assess-further`, `solve`, `User`, `generateViaSolverOrLocal`, `schemas.py`?**
  _High betweenness centrality (0.249) - this node is a cross-community bridge._
- **Why does `6. Current branch (`fix/rule-policy`) — in-progress work` connect `6. Current branch (`fix/rule-policy`) — in-progress work` to `generateViaSolverOrLocal`, `schemas.py`, `Session Log: 16-10-2026 21:22 - review-scheduling-algorithm-assess-further`, `solve`?**
  _High betweenness centrality (0.223) - this node is a cross-community bridge._
- **Why does `User` connect `User` to `ayLedger.js`, `playgrounds.js`, `6. Current branch (`fix/rule-policy`) — in-progress work`, `flagLedgerRows`, `solve.py`, `ResidentScheduler.jsx`, `schedule`, `solve`, `vitest`, `acgmeHours.js`, `jobs.py`, `generateViaSolverOrLocal`, `add_circadian_constraints`, `parseDate`, `formatDisplayDate`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Weaknesses and gaps observed` (e.g. with `evaluate_hint()` and `computeQualityMetrics()`) actually correct?**
  _`Weaknesses and gaps observed` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `parse_payload()` (e.g. with `Gap 1: `conferenceTolerated` now has a solver-side signal` and `Known gaps (not fixed here, out of scope)`) actually correct?**
  _`parse_payload()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 124 inferred relationships involving `Payload` (e.g. with `Gap 1: `conferenceTolerated` now has a solver-side signal` and `New/changed request fields`) actually correct?**
  _`Payload` has 124 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `SHIFT_ORDER_INDEX`, `SHIFT_LABEL_BY_ID` to the rest of the system?**
  _3202 weakly-connected nodes found - possible documentation gaps or missing edges._