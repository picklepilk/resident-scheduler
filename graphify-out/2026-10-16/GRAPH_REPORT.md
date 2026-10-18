# Graph Report - resident-scheduler  (2026-10-16)

## Corpus Check
- 285 files · ~795,257 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 3, .toml 2, .mdc 1)

## Summary
- 4456 nodes · 11200 edges · 171 communities (132 shown, 39 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 641 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fe3b3952`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- dependencies
- Raw Session Log
- coverage.js
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
- validateAll
- schemas.py
- validate.py
- formatDisplayDate
- useMonthPager
- make_payload
- updateBlock
- normalizeImportLog
- Raw Session Log
- Cloud Sync (Supabase)
- shifts.js
- ResidentScheduler
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
- make_resident
- Payload
- ResidentScheduler
- repairPass
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- supabaseClient.js
- getBlockDates
- parse.js
- generateSchedule
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
- useWalkthroughSeen.js
- assertWriteTargetRowId
- acgmeHours.js
- exportResidentCalendarPDF
- payload.py
- ScheduleGrid
- Overall: All addressed
- matchRosterByName
- ScheduleGrid
- qgenda.js
- blockStatus.test.js
- formatDisplayDate
- Done — 7 PRs open, all review-clean, nothing touched prod branches
- session 2026-09-26
- useSpotlightTarget.js
- formatDisplayDate
- add_soft_sequence_constraint
- updateBlock
- checkGenerateReadiness
- Resident walkthrough (`/requests`)
- Efficiency Review
- solve.py
- test_weekly_hours.py
- qgendaImport.js
- Session Log: 06-09-2026 18:35 - nd-option
- solverClient.js
- Admin walkthrough steps (`/`)
- test_api_ratelimit.py
- slotFixes.js
- a520850a30cde04cc-users-amade-appdata-local 2026-09-18
- prettyDate
- fetchWithTimeout
- repairPass
- RulesTab
- Raw Session Log
- Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local
- Raw Session Log
- Archived from CLAUDE.md on 2026-09-26 (compaction)
- package.json
- Auth, rate limiting, body size cap (`/solve`)
- dates.js
- Session Log: 26-09-2026 14:15 - session
- LitPool
- scoreWeights.test.js
- prettyDate
- nd-option 2026-09-06
- exportResidentCalendarPDF
- devDependencies
- Solver performance investigation (2026-08-22)
- ayLedger.js
- ratelimit.py
- exportResidentCalendarPDF
- resume 2026-09-28
- RulesTab
- test_api_auth.py
- playgrounds.js
- whatIf.js
- auth.py
- uuid
- limits.py
- test_night_fragment.py
- ShiftMatrixTab
- ShiftMatrixTab
- RulesTab
- test_workday_limits.py
- test_jwks_throttles_rapid_unknown_kid_requests
- test_circadian.py
- DayRulesEditor
- DayRulesEditor
- keysToClearOnSignOut
- expectedFiller.js
- DayRulesEditor
- reset_jwks_cache
- QGenda Export Path Mapping
- migrate_res_state_history.sql
- Session Log: 16-10-2026 09:45 - session
- underTargetExplainer.test.js
- FeedbackAdminTab
- FeedbackAdminTab
- CLAUDE.md Archive
- test_count_caps.py
- toastHistory.js
- parseHomeResidentMatrix
- Security headers rollout
- Coverage board (Coverage tab upgrade) — plan
- _ConfiguredLimiter
- ImportHistoryPanel
- migrate_res_state_admin_only.sql
- public.res_state

## God Nodes (most connected - your core abstractions)
1. `Payload` - 150 edges
2. `parse_payload()` - 149 edges
3. `parseDate()` - 128 edges
4. `make_resident()` - 103 edges
5. `4. Real data vs. descriptive text` - 94 edges
6. `ResidentScheduler()` - 90 edges
7. `vitest` - 88 edges
8. `validateAll()` - 87 edges
9. `make_payload()` - 84 edges
10. `VarStore` - 83 edges

## Surprising Connections (you probably didn't know these)
- `All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify.` --references--> `main()`  [INFERRED]
  CC-Session-Logs/18-09-2026-11_21-a520850a30cde04cc-users-amade-appdata-local.md → solver-service/cli.py
- `Assistant` --references--> `betterQuality()`  [INFERRED]
  CC-Session-Logs/28-09-2026-09_25-resume.md → src/lib/scheduleQuality.js
- `Solver R9 (original wording)` --references--> `betterQuality()`  [INFERRED]
  CLAUDE-Archive.md → src/lib/scheduleQuality.js
- `User` --references--> `main()`  [INFERRED]
  CC-Session-Logs/18-09-2026-11_21-a520850a30cde04cc-users-amade-appdata-local.md → solver-service/cli.py
- `Efficiency Review` --references--> `load_default_weights()`  [INFERRED]
  CC-Session-Logs/06-09-2026-18_35-nd-option.md → solver-service/solver/model/objective.py

## Import Cycles
- None detected.

## Communities (171 total, 39 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.01
Nodes (131): REPORT, issueKey(), AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, AyLedgerPgyGroupTable(), BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS (+123 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.07
Nodes (38): getAcademicYear(), AYConferenceEditor(), BlockCalendarSection(), buildSnapData(), deepEqualNormalized(), downloadBackupBlob(), commit(), makeDefaultBlock() (+30 more)

### Community 2 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, qrcode (+4 more)

### Community 3 - "Raw Session Log"
Cohesion: 0.05
Nodes (42): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+34 more)

### Community 4 - "coverage.js"
Cohesion: 0.06
Nodes (48): Reuse (no new rule logic), buildAllResidents(), buildAllResidents(), coverageFillStats(), nightRunsFor(), applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS (+40 more)

### Community 5 - "builder.py"
Cohesion: 0.11
Nodes (27): ElasticBuildResult, _apply_cap_edit(), _apply_coverage_min_edit(), _apply_target_edit(), _assigned_count_for_cap(), build_feasibility_report(), build_recommendations(), build_violations() (+19 more)

### Community 6 - "CUsersamadeAppDataLocalTempclaudeC--Users-amade-projects-resident-schedulerd2320667-24c3-4c97-ba36-1af708a9f28fscratchpadold_RS.jsx"
Cohesion: 0.01
Nodes (152): AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS, BLOCK_TYPE_MAP, BLOCK_TYPES_EM, BlockProgressBar() (+144 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.10
Nodes (29): diffScheduleCells(), updateBlockTracked(), ScheduleGrid(), applyAssign(), applyGive(), applySickCallCover(), applySwap(), applySweepCandidate() (+21 more)

### Community 8 - "Raw Session Log"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "vitest"
Cohesion: 0.05
Nodes (43): vitest, SEEDS, block, PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService() (+35 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.13
Nodes (32): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+24 more)

### Community 12 - "CUsersamadeAppDataLocalTempclaudeC--Users-amade-projects-resident-schedulerd2320667-24c3-4c97-ba36-1af708a9f28fscratchpadnew_RS.jsx"
Cohesion: 0.01
Nodes (127): AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS, BLOCK_TYPE_MAP, BLOCK_TYPES_EM, BlockProgressBar() (+119 more)

### Community 13 - "generateSchedule"
Cohesion: 0.06
Nodes (75): blockDayIndex(), blockTypeFilterPasses(), buildSolverPayload(), buildStaticGenContext(), cellViolations(), checkCircadianViolations(), computeTotalCoverageSupply(), computeTotalTargetDemand() (+67 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.07
Nodes (39): Assistant, Reuse review findings, User, UI conventions (full originals), GRID_GROUP_MODE_DEFAULT, GRID_GROUP_MODES, groupResidents(), PGY_GROUPS (+31 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.16
Nodes (16): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+8 more)

### Community 16 - "Walkthrough.jsx"
Cohesion: 0.16
Nodes (20): 2. Implementation details, GettingStartedFooter(), UserGuideTab(), CARD_GAP, CARD_H_FALLBACK, CARD_W, cornerBox(), inflate() (+12 more)

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
Cohesion: 0.04
Nodes (45): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+37 more)

### Community 21 - "parseDate"
Cohesion: 0.06
Nodes (113): addDays(), parseDate(), toDateStr(), dateRange(), nightRun(), papaBare, restIssues(), runValidate() (+105 more)

### Community 22 - "validateAll"
Cohesion: 0.06
Nodes (69): blockDayIndex(), blockTypeFilterPasses(), buildSolverPayload(), buildStaticGenContext(), cellViolations(), checkCircadianViolations(), countCurrentBlockJC(), countNightsInSchedule() (+61 more)

### Community 23 - "schemas.py"
Cohesion: 0.14
Nodes (22): BaseModel, pydantic, AyPriorModel, BlockModel, CapsModel, ConfigModel, CoverageEntryModel, HealthResponse (+14 more)

### Community 24 - "validate.py"
Cohesion: 0.06
Nodes (68): date, datetime, Grand Rounds rest/streak semantics rewrite (2026-10-15, chief decision), no_overstaff_shift(), True when `shift` may NEVER use the +1 last-resort overstaff allowance (see…, add_days(), date_diff_days(), gap_between() (+60 more)

### Community 25 - "formatDisplayDate"
Cohesion: 0.06
Nodes (34): User, DATES6, shiftActiveOnDow(), isFixableBlocked(), scanUnderTargetSlots(), topBlockerReasons(), AvailabilityRangesEditor(), dateInRanges() (+26 more)

### Community 26 - "useMonthPager"
Cohesion: 0.29
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), containers, Harness(), mountPager(), Harness() (+2 more)

### Community 27 - "make_payload"
Cohesion: 0.05
Nodes (78): New soft term: `seniorTruePrimary`, What changed, What was already aligned (no change needed), add_coverage_constraints(), `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, apply_rule_priority(), load_default_weights(), merged_weights() (+70 more)

### Community 28 - "updateBlock"
Cohesion: 0.16
Nodes (16): setBlockField(), updSD(), EMResidentsTab(), removeRes(), setBA(), setTargetDelta(), setTargetFlag(), target() (+8 more)

### Community 29 - "normalizeImportLog"
Cohesion: 0.17
Nodes (17): appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), buildScheduleFromImport(), ImportHistoryPanel(), deleteEntry(), ImportLecturesModal(), commit() (+9 more)

### Community 30 - "Raw Session Log"
Cohesion: 0.03
Nodes (66): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+58 more)

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "shifts.js"
Cohesion: 0.14
Nodes (25): buildHeatmapRows(), coverageCellStatus(), heatmapCell(), TYPE_ORDER, hourMs(), JEOPARDY_WINDOW_START_H, jeopardyWindowBounds(), scheduleHitsJeopardyWindow() (+17 more)

### Community 33 - "ResidentScheduler"
Cohesion: 0.06
Nodes (44): buildSnapData(), deepEqualNormalized(), FeedbackWidget(), handleSubmit(), reset(), makeDefaultBlock(), migratePedNightAssignments(), migratePedsPgy1ToPgy2() (+36 more)

### Community 34 - "Circadian Scheduling Rules"
Cohesion: 0.40
Nodes (5): Circadian Scheduling Rules, Grand Rounds Lecture Day-Before Rule, Chief-Editable Journal Club Dates, Journal Club Rules, PED-N Split Into Two Shift IDs

### Community 35 - "Field-Ready Design System"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 36 - "SettingsTab"
Cohesion: 0.18
Nodes (12): blockChanged(), blocksById(), deepEqual(), diffState(), scheduleCellsChanged(), roster(), getGeneralPedsTarget(), SettingsTab() (+4 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "parse_payload"
Cohesion: 0.03
Nodes (134): argparse, User, copy, fastapi_middleware_cors, get, importlib_metadata, json, os (+126 more)

### Community 40 - "Summary"
Cohesion: 0.04
Nodes (50): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+42 more)

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "make_resident"
Cohesion: 0.07
Nodes (91): 2. Per-module size contribution (isolated measurement), 3. The fix, 4. Correctness guardrail, TL;DR, Resident, add_circadian_constraints(), add_em_composition_terms(), add_pgy_fallback_terms() (+83 more)

### Community 45 - "Payload"
Cohesion: 0.04
Nodes (105): Applied, Assistant, Simplification Review, Skipped, User, functools, itertools, pathlib (+97 more)

### Community 46 - "ResidentScheduler"
Cohesion: 0.06
Nodes (43): buildSnapData(), deepEqualNormalized(), FeedbackWidget(), handleSubmit(), reset(), makeDefaultBlock(), migratePedNightAssignments(), migratePedsPgy1ToPgy2() (+35 more)

### Community 47 - "repairPass"
Cohesion: 0.27
Nodes (25): assignCell(), candidatePool(), hasSenior(), movable(), pickBestScore(), poolFor(), poolForTruePrimary(), preferTruePrimaryPass() (+17 more)

### Community 52 - "supabaseClient.js"
Cohesion: 0.07
Nodes (44): Shift catalog & data model, lucide-react, react, @supabase/supabase-js, SetNewPassword(), AdminManagement(), residentLabel(), setRole() (+36 more)

### Community 53 - "getBlockDates"
Cohesion: 0.04
Nodes (93): ref_node_child_process, ref_node_fs, ref_node_os, ref_node_path, ref_node_url, Coverage-mapping investigation, part 3 (2026-09-27): no gap found; the loss is `TIER_QUALITY` noise, baselinePath(), captureFor() (+85 more)

### Community 54 - "parse.js"
Cohesion: 0.19
Nodes (18): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), normalizeToken(), parseDateRangeInAY(), parseRosterText() (+10 more)

### Community 58 - "generateSchedule"
Cohesion: 0.13
Nodes (42): compositionSatisfies(), computeTotalCoverageSupply(), conferenceAwayPgys(), countPublishedTraumaNights(), fallbackCompositionAt(), generateSchedule(), assignCell(), fillDayPass() (+34 more)

### Community 63 - "updateBlock"
Cohesion: 0.07
Nodes (38): applyStartDate(), computeTotalTargetDemand(), conferenceDefs(), DashboardTab(), onStartDateChange(), setBlockField(), updSD(), dateInRanges() (+30 more)

### Community 71 - "migrate_admin_email_allowlist.sql"
Cohesion: 0.47
Nodes (5): admin_email_allowlist, profiles_admin_allowlist_promote, public.apply_admin_allowlist(), public.current_user_is_allowlisted_admin(), public.apply_admin_allowlist

### Community 76 - "useWalkthroughSeen.js"
Cohesion: 0.17
Nodes (18): User, User, User, User, Decisions, Round 2 (resident walkthrough), mergeWalkthroughSeen(), readLocalMirror() (+10 more)

### Community 77 - "assertWriteTargetRowId"
Cohesion: 0.14
Nodes (31): Persistence, Persistence / cloud sync (original wording), assertWriteTargetRowId(), getAccessTokenBounded(), confirmPromote(), conflictOverwriteMine(), createPlayground(), deleteLegacyDemo() (+23 more)

### Community 78 - "acgmeHours.js"
Cohesion: 0.12
Nodes (28): Scheduling/data-model (original wording), buildDailyContributions(), combinedRow(), ED_WEEKLY_CAP_H, edHoursOn(), fullDateRange(), GR_DURATION_H, GR_END_H (+20 more)

### Community 79 - "exportResidentCalendarPDF"
Cohesion: 0.25
Nodes (14): demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), offRequestEntryFor(), pdfDemoBanner(), pdfPageFooter(), pdfPageHeader(), pdfSafeText() (+6 more)

### Community 80 - "payload.py"
Cohesion: 0.12
Nodes (22): AyPrior, Block, CoverageEntry, LockedCell, _parse_coverage(), _parse_eligible(), _parse_locked(), _parse_obligations() (+14 more)

### Community 81 - "ScheduleGrid"
Cohesion: 0.10
Nodes (36): checkGenerateReadiness(), diffScheduleCells(), showToast(), updateBlockTracked(), ScheduleGrid(), applyAssign(), applyGive(), applySwap() (+28 more)

### Community 82 - "Overall: All addressed"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 83 - "matchRosterByName"
Cohesion: 0.47
Nodes (7): matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), buildQGendaImport(), matchLectureRosterName()

### Community 84 - "ScheduleGrid"
Cohesion: 0.10
Nodes (36): checkGenerateReadiness(), diffScheduleCells(), showToast(), updateBlockTracked(), ScheduleGrid(), applyAssign(), applyGive(), applySwap() (+28 more)

### Community 85 - "qgenda.js"
Cohesion: 0.30
Nodes (13): normalizeQgendaHeaderOverrides(), QGENDA_COLUMN_DEFAULTS, QGENDA_JEOPARDY_TASK_ID, QGENDA_NAME_FORMATS, QGENDA_TASKS, QGENDA_VARIANTS, qgendaEndDate(), qgendaName() (+5 more)

### Community 86 - "blockStatus.test.js"
Cohesion: 0.24
Nodes (6): BLOCK_STEP_IDS, deriveBlockSteps(), formatShortDate(), SHORT_MONTHS, BASE, BlockContextBar()

### Community 87 - "formatDisplayDate"
Cohesion: 0.06
Nodes (34): AvailabilityRangesEditor(), BlockCalendarRow(), BlockMonthGrid(), CellInspector(), checkRestViolations(), classifyForHandEdit(), computeCoverageByDate(), CoverageByAreaView() (+26 more)

### Community 88 - "Done — 7 PRs open, all review-clean, nothing touched prod branches"
Cohesion: 0.08
Nodes (25): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+17 more)

### Community 90 - "useSpotlightTarget.js"
Cohesion: 0.24
Nodes (13): ACQUIRE_TIMEOUT_MS, prefersReducedMotion(), rectsEqual(), roundRect(), SETTLE_FRAMES, useSpotlightTarget(), acquire(), acquireLoop() (+5 more)

### Community 91 - "formatDisplayDate"
Cohesion: 0.06
Nodes (28): AvailabilityRangesEditor(), CellInspector(), classifyForHandEdit(), countPublishedHolidayShifts(), DateListEditor(), DragConfirmModal(), FeasibilityReportCard(), formatDisplayDate() (+20 more)

### Community 92 - "add_soft_sequence_constraint"
Cohesion: 0.26
Nodes (11): Night-stint contiguity preference + avoidable/forced fragmentation split (2026-10-14), add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges() (+3 more)

### Community 93 - "updateBlock"
Cohesion: 0.08
Nodes (33): applyStartDate(), DashboardTab(), onStartDateChange(), setBlockField(), updSD(), dateInRanges(), effectiveChiefRole(), EMResidentsTab() (+25 more)

### Community 94 - "checkGenerateReadiness"
Cohesion: 0.36
Nodes (6): keptCellsForMode(), issues, lockedCells, schedule, violatingCells(), checkGenerateReadiness()

### Community 95 - "Resident walkthrough (`/requests`)"
Cohesion: 0.14
Nodes (15): User, User, 1. Request a day off, 2. Requesting more than one date, 3. Reason (optional), 4. Submit request, 5. Track your requests, First-login walkthrough (+7 more)

### Community 96 - "Efficiency Review"
Cohesion: 0.05
Nodes (37): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+29 more)

### Community 97 - "solve.py"
Cohesion: 0.05
Nodes (92): CpSolver, dataclasses, math, ortools_sat_python, CP-SAT solver service (optional second engine), Changed rule: `restGap` (rule 17) — GR-end adjustment, Gap 2: solver over-max ("+1 overstaff") placements are now visible in the report, Head-to-head proof (`engineHeadToHead.test.js`, `SOLVER_PARITY=1`) (+84 more)

### Community 98 - "test_weekly_hours.py"
Cohesion: 0.44
Nodes (10): _build(), _force_all(), R7 (2026-09-27): ACGME EM 6.17.a.3 rolling-7-day 60 ED / 72 total hour caps…, test_ed_cap_allows_five_twelve_hour_shifts_in_one_week(), test_ed_cap_forbids_seven_twelve_hour_shifts_in_one_week(), test_off_rotation_resident_not_subject_to_weekly_caps(), test_off_service_resident_not_subject_to_weekly_caps(), test_schedulable_defaults_true_for_back_compat() (+2 more)

### Community 99 - "qgendaImport.js"
Cohesion: 0.22
Nodes (16): cell(), countDayNumbers(), countDowCells(), DOW_INDEX, findDayNumberRow(), isoFrom(), MONTHS, normalizeTaskName() (+8 more)

### Community 100 - "Session Log: 06-09-2026 18:35 - nd-option"
Cohesion: 0.22
Nodes (8): Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Recent Commits, Session Log: 06-09-2026 18:35 - nd-option, Tool Activity, Verification, Working Tree At Close

### Community 101 - "solverClient.js"
Cohesion: 0.39
Nodes (6): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, solveRemote(), freshModule()

### Community 102 - "Admin walkthrough steps (`/`)"
Cohesion: 0.15
Nodes (15): 1. Dashboard — your command center, 2. EM Residents — the roster, 3. Shift Matrix — who can work what, 4. Schedule — the grid, 5. Scheduling Rules — coverage targets, 6. Violations — the generation report, 7. Jeopardy — backup call, 8. Requests — resident day-off requests (+7 more)

### Community 103 - "test_api_ratelimit.py"
Cohesion: 0.10
Nodes (21): cryptography_hazmat_primitives_asymmetric, fastapi_testclient, pytest, Tests for api.limits' request body size cap., LOW finding fix: CORS must be the OUTERMOST middleware so a browser caller can…, test_ordinary_payload_is_well_under_default_cap(), test_oversized_body_is_rejected(), test_oversized_body_rejection_still_carries_cors_headers() (+13 more)

### Community 107 - "slotFixes.js"
Cohesion: 0.05
Nodes (51): byDeficitThenSoftCount(), clearCell(), findAssignOptions(), findGiveCandidates(), findSwapCandidates(), hasOverrideTierViolation(), ineligibleButOverridable(), RESIDENTS (+43 more)

### Community 109 - "prettyDate"
Cohesion: 0.06
Nodes (35): AddResidentModal(), AYConferenceEditor(), BlockCalendarRow(), BlockCalendarSection(), BlockContextBar(), BlockMonthGrid(), computeCoverageByDate(), CoverageByAreaView() (+27 more)

### Community 110 - "fetchWithTimeout"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 111 - "repairPass"
Cohesion: 0.19
Nodes (31): compositionSatisfies(), fallbackCompositionAt(), assignCell(), candidatePool(), fillDayPass(), hasSenior(), movable(), pickBestScore() (+23 more)

### Community 112 - "RulesTab"
Cohesion: 0.08
Nodes (23): buildQualityInput(), computeAyPriorTotals(), computeScarceSeniorReservations(), describeDayRules(), describeShiftGates(), eligKey(), computeUnderTargetDiagnostics(), computeUnfilledDiagnostics() (+15 more)

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
Cohesion: 0.22
Nodes (9): 12-hour shift windows, Archived from CLAUDE.md on 2026-09-26 (compaction), Auth, Generator (full originals), Layout & stack, Rule-default migration, When editing, warn() (+1 more)

### Community 117 - "package.json"
Cohesion: 0.05
Nodes (33): name, private, scripts, build, dev, preview, test, type (+25 more)

### Community 118 - "Auth, rate limiting, body size cap (`/solve`)"
Cohesion: 0.29
Nodes (6): Auth, rate limiting, body size cap (`/solve`), Client contract, Env vars, Fly secrets (set by hand, not run here), solver-service, Tests

### Community 119 - "dates.js"
Cohesion: 0.09
Nodes (29): Scheduling rules (full originals), Imports & exports, ayWindowFor(), getAcademicYearFor(), getBlockWeekends(), qgendaDate(), applyDateRangePaint(), paintActionFor() (+21 more)

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
Cohesion: 0.06
Nodes (35): AddResidentModal(), AYConferenceEditor(), BlockCalendarSection(), BlockContextBar(), DateListEditor(), detectHomeAndOffSheetsByContent(), HolidayDatesEditor(), ImportLecturesModal() (+27 more)

### Community 125 - "exportResidentCalendarPDF"
Cohesion: 0.11
Nodes (27): buildResidentICS(), checkRestViolations(), demoFilenameSuffix(), effectiveWellnessWednesdayDate(), exportMatrixPDF(), exportResidentCalendarPDF(), flexWellnessSubstituteAllowed(), grWorkDow() (+19 more)

### Community 126 - "devDependencies"
Cohesion: 0.25
Nodes (8): devDependencies, autoprefixer, jsdom, postcss, tailwindcss, vite, @vitejs/plugin-react, vitest

### Community 127 - "Solver performance investigation (2026-08-22)"
Cohesion: 0.20
Nodes (10): New config fields, 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Environment, Files touched, Reproduction, Solver performance investigation (2026-08-22) (+2 more)

### Community 128 - "ayLedger.js"
Cohesion: 0.07
Nodes (40): buildAyLedger(), buildCategory(), buildPgyGroups(), CATEGORY_LABELS, computeColumnVisibility(), DEFAULT_BEHIND_TARGET_THRESHOLD, DEFAULT_FLAG_RAW_DELTA, DEFAULT_HEAVY_RATE_MULTIPLIER (+32 more)

### Community 129 - "ratelimit.py"
Cohesion: 0.12
Nodes (22): Request, AuthResult, What a dependency chained after `require_auth` gets to key on. `enabled=False`…, _Bucket, _client_ip(), enforce_preauth_ip_limit(), enforce_rate_limit(), _get_limiter() (+14 more)

### Community 130 - "exportResidentCalendarPDF"
Cohesion: 0.12
Nodes (24): buildResidentICS(), demoFilenameSuffix(), effectiveWellnessWednesdayDate(), exportMatrixPDF(), exportResidentCalendarPDF(), icsEscape(), icsStamp(), MonthCalendarView (+16 more)

### Community 132 - "RulesTab"
Cohesion: 0.10
Nodes (16): buildQualityInput(), computeAyPriorTotals(), computeScarceSeniorReservations(), describeDayRules(), describeShiftGates(), computeUnderTargetDiagnostics(), generateScheduleBest(), normalizeRulePriority() (+8 more)

### Community 133 - "test_api_auth.py"
Cohesion: 0.18
Nodes (20): jwt_algorithms, _hs256_token(), _patch_jwks(), _post(), Tests for api.auth's SOLVER_AUTH_MODE gate on POST /solve. `solve()` itself is…, Legacy HS256-only deployments with no SUPABASE_URL configured have no expected…, test_off_mode_ignores_a_garbage_header(), test_off_mode_requires_no_token() (+12 more)

### Community 134 - "playgrounds.js"
Cohesion: 0.20
Nodes (20): filterOwnPlaygrounds(), findMatchingRealBlock(), isLegacyDemoRowId(), isPlaygroundId(), isPlaygroundModeValue(), isSandboxRowId(), LEGACY_DEMO_ROW_ID, makePlaygroundId() (+12 more)

### Community 135 - "whatIf.js"
Cohesion: 0.17
Nodes (16): applyCloneResident(), applyCoverageMin(), applyRemoveResident(), applyScenario(), cloneOneResident(), compareResults(), compareResultSets(), countByShift() (+8 more)

### Community 136 - "auth.py"
Cohesion: 0.14
Nodes (16): fastapi, httpx, jwt, PyJWK, _auth_mode(), _decode(), _get_jwks_cache(), _JwksCache (+8 more)

### Community 137 - "uuid"
Cohesion: 0.13
Nodes (13): pickTopBlocker(), summarizeSlotBlockers(), TRIVIAL_BLOCKERS, AddResidentModal(), describeWhatIfChange(), requestSickCallCover(), uuid(), WhatIfCard() (+5 more)

### Community 138 - "limits.py"
Cohesion: 0.15
Nodes (15): ASGIApp, Exception, Receive, Scope, Send, _BodyTooLarge, _max_body_bytes(), MaxBodySizeMiddleware (+7 more)

### Community 139 - "test_night_fragment.py"
Cohesion: 0.25
Nodes (17): _add_night_fragment_term(), _build(), _cost_of(), _dates(), Night-run fragmentation (avoidable vs forced), objective.py's…, A run touching the block's FIRST date is exempt (may continue from the adjacent…, Solves for the MINIMUM of the given weighted terms (every derived var here is…, Fully-linked tiny model: `night[r,d]` is real (circadian's own link), and `r1`… (+9 more)

### Community 140 - "ShiftMatrixTab"
Cohesion: 0.25
Nodes (15): areaDividerClass(), ShiftMatrixTab(), baseFor(), CellButton(), effective(), isElig(), isModified(), resetRow() (+7 more)

### Community 141 - "ShiftMatrixTab"
Cohesion: 0.25
Nodes (15): areaDividerClass(), ShiftMatrixTab(), baseFor(), CellButton(), effective(), isElig(), isModified(), resetRow() (+7 more)

### Community 142 - "RulesTab"
Cohesion: 0.14
Nodes (6): describeDayRules(), describeShiftGates(), eligKey(), getMissingSpecialDayLists(), RulesTab(), renderCoverageCell()

### Community 143 - "test_workday_limits.py"
Cohesion: 0.32
Nodes (12): R9 follow-up, part 2 (2026-09-27): GR-after-night exemption decided inside the model, _build(), test_exemption_lets_solver_legally_place_a_pattern_js_allows(), test_gr_day_after_a_night_not_counted_as_workday(), test_gr_day_without_a_night_before_still_counted_as_workday(), test_obligation_day_forces_work_var_true_with_no_shift(), test_obligation_without_exempt_flag_counts_even_after_a_night(), test_post_run6_rest_blocks_shift_within_24h_after_completed_run_isolated_from_rule19() (+4 more)

### Community 144 - "test_jwks_throttles_rapid_unknown_kid_requests"
Cohesion: 0.15
Nodes (5): A key rotation, with enough real time between the two requests to clear the 60s…, HIGH finding fix: a token with alg RS256 and a never-valid `kid` must not force…, test_jwks_throttles_rapid_unknown_kid_requests(), test_supabase_mode_refetches_jwks_on_unknown_kid(), _fake_get()

### Community 145 - "test_circadian.py"
Cohesion: 0.32
Nodes (11): _build(), test_day_then_eve_next_day_allowed(), test_day_then_night_next_day_is_allowed_by_this_rule(), test_eve_then_day_next_day_forbidden(), test_more_than_two_night_run_segments_forbidden(), test_night_cap_enforced(), test_night_exempt_resident_skips_night_cap(), test_night_exempt_resident_skips_night_run_segments_cap() (+3 more)

### Community 146 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 147 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 148 - "keysToClearOnSignOut"
Cohesion: 0.24
Nodes (8): MFA — not yet implemented, Security hygiene notes, Shared-workstation admin sessions (2026-10-15), keysToClearOnSignOut(), SIGN_OUT_PRESERVE_KEYS, clearLocalDataForSignOut(), performSignOut(), requestSignOut()

### Community 149 - "expectedFiller.js"
Cohesion: 0.27
Nodes (8): bucketKeyFor(), bucketLabel(), categoryChipLabel(), expectedFillerFor(), requirementFor(), baseSeniorityRules, CATEGORIES, COMPOSITION

### Community 150 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 151 - "reset_jwks_cache"
Cohesion: 0.24
Nodes (10): Test-only: drop all cached JWKS state so a monkeypatched fetch starts clean…, reset_jwks_cache(), Test-only: drop all bucket state (both layers) so each test starts with full…, reset_rate_limiter(), _isolated_state(), fixture, _isolated_state(), fixture (+2 more)

### Community 152 - "QGenda Export Path Mapping"
Cohesion: 0.22
Nodes (9): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+1 more)

### Community 153 - "migrate_res_state_history.sql"
Cohesion: 0.28
Nodes (7): public.res_state_archive_history, public.res_state_set_audit_fields, public.res_state_archive_history(), public.res_state_history, res_state_archive_history, res_state_audit_fields, res_state_history_row_id_id_idx

### Community 154 - "Session Log: 16-10-2026 09:45 - session"
Cohesion: 0.25
Nodes (7): Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Recent Commits, Session Log: 16-10-2026 09:45 - session, Tool Activity, Working Tree At Close

### Community 156 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 157 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 158 - "CLAUDE.md Archive"
Cohesion: 0.29
Nodes (6): Archived: 2026-09-26 (session-end hook, PICKLEBOOK), Archived: 2026-10-15 (Grand Rounds rest/streak rewrite), Archived: 2026-10-16 (session-end hook, PICKLEBOOK), Archived 2026-10-16: verbose originals of tightened CLAUDE.md bullets (resident-scheduler), CLAUDE.md Archive, Solver R9 (original wording)

### Community 159 - "test_count_caps.py"
Cohesion: 0.52
Nodes (6): _build(), test_target_ceiling_enforced(), test_target_none_means_no_ceiling(), test_trauma_cap_enforced(), test_trauma_peds_split_peds_half_ok_when_trauma_half_ok(), test_trauma_peds_split_sub_caps_are_independent()

### Community 160 - "toastHistory.js"
Cohesion: 0.48
Nodes (5): addToastEntry(), clearToastHistory(), formatToastAge(), TOAST_HISTORY_LIMIT, ToastHistoryPanel()

### Community 161 - "parseHomeResidentMatrix"
Cohesion: 0.38
Nodes (7): findDateHeaderRow(), inferGroupPgy(), matchBlockType(), parseHomeResidentMatrix(), parseHomeResidentMatrixGrouped(), parseSequentialDateRange(), pgyExclusiveRotationIds()

### Community 162 - "Security headers rollout"
Cohesion: 0.33
Nodes (5): 1. Check the Report-Only CSP on a deploy preview, 2. Resolve the open decisions before enforcing, 3. Flip to enforcing, Security headers rollout, Status (2026-10-15): enforcing

### Community 163 - "Coverage board (Coverage tab upgrade) — plan"
Cohesion: 0.33
Nodes (5): Build steps, Coverage board (Coverage tab upgrade) — plan, Decisions (user, 2026-10-15), Goal, Verification

## Knowledge Gaps
- **932 isolated node(s):** `supabase`, `SHIFT_ORDER_INDEX`, `SHIFT_LABEL_BY_ID`, `QGENDA_NAME_FORMAT_LABEL`, `BLOCK_TYPES_EM` (+927 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1666 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `betterQuality()` connect `solve.py` to `ResidentScheduler.jsx`, `Raw Session Log`, `Payload`, `Archived from CLAUDE.md on 2026-09-26 (compaction)`, `getBlockDates`, `CLAUDE.md Archive`?**
  _High betweenness centrality (0.236) - this node is a cross-community bridge._
- **Why does `parse_payload()` connect `parse_payload` to `solve.py`, `test_weekly_hours.py`, `builder.py`, `test_night_fragment.py`, `make_resident`, `Payload`, `test_workday_limits.py`, `payload.py`, `test_circadian.py`, `validate.py`, `make_payload`, `test_count_caps.py`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `react` connect `supabaseClient.js` to `ResidentScheduler.jsx`, `useSpotlightTarget.js`, `CUsersamadeAppDataLocalTempclaudeC--Users-amade-projects-resident-schedulerd2320667-24c3-4c97-ba36-1af708a9f28fscratchpadold_RS.jsx`, `CUsersamadeAppDataLocalTempclaudeC--Users-amade-projects-resident-schedulerd2320667-24c3-4c97-ba36-1af708a9f28fscratchpadnew_RS.jsx`, `useWalkthroughSeen.js`, `src/uiPrefs.js`, `Walkthrough.jsx`, `package.json`, `useMonthPager`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Are the 124 inferred relationships involving `Payload` (e.g. with `Gap 1: `conferenceTolerated` now has a solver-side signal` and `New/changed request fields`) actually correct?**
  _`Payload` has 124 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `parse_payload()` (e.g. with `Gap 1: `conferenceTolerated` now has a solver-side signal` and `Known gaps (not fixed here, out of scope)`) actually correct?**
  _`parse_payload()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `SHIFT_ORDER_INDEX`, `SHIFT_LABEL_BY_ID` to the rest of the system?**
  _932 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.013521234050657019 - nodes in this community are weakly interconnected._