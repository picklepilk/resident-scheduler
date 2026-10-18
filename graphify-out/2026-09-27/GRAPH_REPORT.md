# Graph Report - resident-scheduler  (2026-09-27)

## Corpus Check
- 217 files · ~360,732 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 4, .toml 2, .mdc 1)

## Summary
- 2404 nodes · 6321 edges · 128 communities (92 shown, 36 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 507 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a1e5d229`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- dependencies
- make_resident
- coverage.js
- builder.py
- main.py
- ScheduleGrid
- Raw Session Log
- Resident Day-Off Request Implementation Plan
- vitest
- ShiftMatrixTab
- trauma_runs.py
- timing.py
- src/uiPrefs.js
- checkGenerateReadiness
- Walkthrough.jsx
- 4. Real data vs. descriptive text
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- Findings
- payload.py
- UI conventions (full originals)
- schemas.py
- SettingsTab
- build_variables
- useMonthPager
- dateSetPaint.test.js
- updateBlock
- dates.js
- AdminManagement
- Cloud Sync (Supabase)
- parseDate
- test_weight_tiering.py
- Circadian Scheduling Rules
- Field-Ready Design System
- test_circadian.py
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- parse_payload
- Summary
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- parse.js
- variables.py
- getBlockDates
- workday_limits.py
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- RequestsTab.jsx
- getCoverageFor
- prettyDate
- Payload
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
- acgmeHours.js
- exportResidentCalendarPDF
- DayRulesEditor
- optimizerSweep.js
- Overall: All addressed
- What was already aligned (no change needed)
- nthWeekdayOnOrAfter
- qgenda.js
- blockStatus.test.js
- test_em_composition.py
- Done — 7 PRs open, all review-clean, nothing touched prod branches
- session 2026-09-26
- useSpotlightTarget.js
- cellViolations
- add_soft_sequence_constraint
- ApprovalQueue
- Resident walkthrough (`/requests`)
- Efficiency Review
- solve.py
- RulesTab
- qgendaImport.js
- Session Log: 06-09-2026 18:35 - nd-option
- solverClient.js
- handleSubmit
- reviewPanel.js
- a520850a30cde04cc-users-amade-appdata-local 2026-09-18
- devDependencies
- fetchWithTimeout
- SetNewPassword
- shifts.js
- Raw Session Log
- Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local
- Raw Session Log
- JeopardyTab
- package.json
- JeopardySickCallsCard
- Persistence
- LitPool
- scoreWeights.test.js
- RequestPortalCard
- nd-option 2026-09-06
- coverageComposition.js
- normalizeForCompare
- holidays.js

## God Nodes (most connected - your core abstractions)
1. `Payload` - 119 edges
2. `parseDate()` - 115 edges
3. `4. Real data vs. descriptive text` - 94 edges
4. `parse_payload()` - 90 edges
5. `validateAll()` - 88 edges
6. `make_resident()` - 75 edges
7. `ScheduleGrid()` - 75 edges
8. `VarStore` - 74 edges
9. `toDateStr()` - 67 edges
10. `ResidentScheduler()` - 66 edges

## Surprising Connections (you probably didn't know these)
- `Reuse review findings` --references--> `isEm()`  [INFERRED]
  CC-Session-Logs/06-09-2026-18_35-nd-option.md → src/lib/scheduleGrouping.test.js
- `User` --references--> `generateScheduleBest()`  [INFERRED]
  CC-Session-Logs/06-09-2026-18_35-nd-option.md → src/ResidentScheduler.jsx
- `All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify.` --references--> `main()`  [INFERRED]
  CC-Session-Logs/18-09-2026-11_21-a520850a30cde04cc-users-amade-appdata-local.md → solver-service/cli.py
- `User` --references--> `main()`  [INFERRED]
  CC-Session-Logs/18-09-2026-11_21-a520850a30cde04cc-users-amade-appdata-local.md → solver-service/cli.py
- `When editing` --references--> `getEligibleShifts()`  [INFERRED]
  CLAUDE-Archive.md → src/ResidentScheduler.jsx

## Import Cycles
- None detected.

## Communities (128 total, 36 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (96): RFC-4180, RFC-5545, AREA_COLORS, AREA_LAST_SHIFT, AvailabilityRangesEditor(), AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS (+88 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.10
Nodes (30): Imports & exports, getAcademicYear(), buildSnapData(), makeDefaultBlock(), ResidentScheduler(), blockReset(), buildGridCSVRows(), buildQGendaCSVRows() (+22 more)

### Community 2 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, qrcode (+4 more)

### Community 3 - "make_resident"
Cohesion: 0.14
Nodes (45): 4. Correctness guardrail, add_circadian_constraints(), add_night_duration_alternation_terms(), Index set (into `payload.all_dates`) of every position where…, Generalizes the trauma-9h-vs-other-durations mixing rule to ANY pair of night-…, _trauma_possible_indices(), make_resident(), _build() (+37 more)

### Community 4 - "coverage.js"
Cohesion: 0.11
Nodes (26): 12-hour shift windows, Archived: 2026-09-26 (session-end hook, PICKLEBOOK), Archived from CLAUDE.md on 2026-09-26 (compaction), Auth, CLAUDE.md Archive, Layout & stack, When editing, applyTraumaClampAndDow() (+18 more)

### Community 5 - "builder.py"
Cohesion: 0.12
Nodes (24): _apply_cap_edit(), _apply_coverage_min_edit(), _apply_target_edit(), build_feasibility_report(), build_recommendations(), build_violations(), _cap_recommendation(), edit() (+16 more)

### Community 6 - "main.py"
Cohesion: 0.13
Nodes (18): argparse, fastapi, fastapi_middleware_cors, get, importlib_metadata, os, post, health() (+10 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.09
Nodes (32): computeScarceSeniorReservations(), formatDisplayDate(), updateBlockTracked(), ScheduleGrid(), applyAssign(), applyGive(), applySwap(), applySweepCandidate() (+24 more)

### Community 8 - "Raw Session Log"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "vitest"
Cohesion: 0.08
Nodes (30): vitest, SEEDS, acepFixture(), PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService() (+22 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.13
Nodes (33): Rule-default migration, applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty() (+25 more)

### Community 12 - "trauma_runs.py"
Cohesion: 0.10
Nodes (36): Assistant, Simplification Review, User, itertools, 2. Per-module size contribution (isolated measurement), 3. The fix, TL;DR, add_second_rest_day_terms() (+28 more)

### Community 13 - "timing.py"
Cohesion: 0.10
Nodes (30): date, datetime, _parse_shifts(), date_diff_days(), gap_between(), _ordinal_minutes(), overlaps_hour_window(), parse_date() (+22 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.08
Nodes (30): GRID_GROUP_MODE_DEFAULT, GRID_GROUP_MODES, groupResidents(), PGY_GROUPS, pushNonEmpty(), ROTATION_EM_STYLE, BLOCK_TYPES, isEm() (+22 more)

### Community 15 - "checkGenerateReadiness"
Cohesion: 0.11
Nodes (22): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+14 more)

### Community 16 - "Walkthrough.jsx"
Cohesion: 0.19
Nodes (17): 2. Implementation details, CARD_GAP, CARD_H_FALLBACK, CARD_W, cornerBox(), inflate(), overlapArea(), pickCardCorner() (+9 more)

### Community 17 - "4. Real data vs. descriptive text"
Cohesion: 0.02
Nodes (92): 4. Real data vs. descriptive text, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+84 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (22): auth, auth.users, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests, day_off_requests_cancel_guard (+14 more)

### Community 19 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 20 - "Findings"
Cohesion: 0.05
Nodes (67): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+59 more)

### Community 21 - "payload.py"
Cohesion: 0.12
Nodes (26): AyPrior, CoverageEntry, LockedCell, _parse_coverage(), _parse_locked(), _parse_preferences(), _parse_residents(), Preference (+18 more)

### Community 22 - "UI conventions (full originals)"
Cohesion: 0.12
Nodes (18): UI conventions (full originals), AYConferenceEditor(), BlockCalendarSection(), classifyForHandEdit(), CollapsibleCard(), DragConfirmModal(), reconcileTabOrder(), renderChangelogText() (+10 more)

### Community 23 - "schemas.py"
Cohesion: 0.20
Nodes (17): BaseModel, pydantic, AyPriorModel, BlockModel, CapsModel, ConfigModel, CoverageEntryModel, HealthResponse (+9 more)

### Community 24 - "SettingsTab"
Cohesion: 0.18
Nodes (11): buildResidentICS(), demoFilenameSuffix(), getGeneralPedsTarget(), icsEscape(), icsStamp(), downloadICS(), exportResidentICSFiles(), SettingsTab() (+3 more)

### Community 25 - "build_variables"
Cohesion: 0.15
Nodes (30): add_coverage_constraints(), `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, add_rest_constraints(), build_variables(), _locked_triples(), make_payload(), Rule 25's max is no longer a pure hard cap: the app's own "under-target lift"…, TRAUMA is excluded from the +1-overstaff allowance -- its max is separately… (+22 more)

### Community 26 - "useMonthPager"
Cohesion: 0.35
Nodes (9): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), Harness(), mountPager(), Harness(), MonthCalendarView (+1 more)

### Community 27 - "dateSetPaint.test.js"
Cohesion: 0.53
Nodes (4): applyDateRangePaint(), paintActionFor(), toggleDateInList(), startDrag()

### Community 28 - "updateBlock"
Cohesion: 0.18
Nodes (15): DashboardTab(), onStartDateChange(), setBlockField(), updSD(), EMResidentsTab(), removeRes(), setBA(), OffServiceTab() (+7 more)

### Community 29 - "dates.js"
Cohesion: 0.10
Nodes (29): Scheduling rules (full originals), ayWindowFor(), formatAY(), getAcademicYearFor(), getFirstTuesdaysInRange(), isFirstTuesday(), isJcDate(), isJcDateAnyAy() (+21 more)

### Community 30 - "AdminManagement"
Cohesion: 0.40
Nodes (4): AdminManagement(), residentLabel(), setRole(), RequestsTab()

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "parseDate"
Cohesion: 0.10
Nodes (64): addDays(), getBlockWeekends(), parseDate(), toDateStr(), runValidate(), dateRange(), nightRun(), papaBare (+56 more)

### Community 33 - "test_weight_tiering.py"
Cohesion: 0.12
Nodes (23): ortools_sat_python, What changed, apply_rule_priority(), load_default_weights(), merged_weights(), _priority_order(), Static config, read once per process rather than per solve. Cached safely…, Relative order of the two objective-relevant rulePriority entries, ignoring… (+15 more)

### Community 34 - "Circadian Scheduling Rules"
Cohesion: 0.40
Nodes (5): Circadian Scheduling Rules, Grand Rounds Lecture Day-Before Rule, Chief-Editable Journal Club Dates, Journal Club Rules, PED-N Split Into Two Shift IDs

### Community 35 - "Field-Ready Design System"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 36 - "test_circadian.py"
Cohesion: 0.35
Nodes (10): _build(), test_day_then_eve_next_day_forbidden(), test_day_then_night_next_day_is_allowed_by_this_rule(), test_eve_then_day_next_day_forbidden(), test_more_than_two_night_run_segments_forbidden(), test_night_cap_enforced(), test_night_exempt_resident_skips_night_cap(), test_seven_consecutive_nights_forbidden_by_sliding_window() (+2 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "parse_payload"
Cohesion: 0.12
Nodes (39): copy, json, pathlib, Block, Config, _parse_eligible(), _parse_obligations(), parse_payload() (+31 more)

### Community 40 - "Summary"
Cohesion: 0.04
Nodes (50): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+42 more)

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "parse.js"
Cohesion: 0.13
Nodes (22): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), parseDateRangeInAY(), parseRosterText(), NOTE: CATEGORIES/CAT_MAP/normalizeToken/DATE_RANGE_RE are not in the original… (+14 more)

### Community 45 - "variables.py"
Cohesion: 0.11
Nodes (24): dataclasses, build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, Rules 24-25: per-(shift, date) staffing minimum/maximum. Min side depends on…, build_elastic_model(), ElasticBuildResult, Pass-2 relaxation: rebuilds the model FROM SCRATCH (batch 1's pass-1 model,… (+16 more)

### Community 46 - "getBlockDates"
Cohesion: 0.07
Nodes (54): Applied, Generator (full originals), CP-SAT solver service (optional second engine), baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname (+46 more)

### Community 47 - "workday_limits.py"
Cohesion: 0.17
Nodes (19): _add_post_run6_rest(), _add_six_day_window(), get_term(), add_workday_limit_constraints(), _forbid_triple(), _link_work(), Rule 19 (work-day linking + max 6 consecutive work days) and rule 20 (>=24h…, Forbid (run6_end AND shift1 AND shift2) firing together. `run6_val` is a plain… (+11 more)

### Community 52 - "RequestsTab.jsx"
Cohesion: 0.11
Nodes (28): lucide-react, react, ViewAsPanel(), blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState(), fetchRosterForPicker() (+20 more)

### Community 53 - "getCoverageFor"
Cohesion: 0.06
Nodes (38): Assistant, Reuse review findings, User, User, ref_node_child_process, ref_node_fs, ref_node_os, ref_node_path (+30 more)

### Community 54 - "prettyDate"
Cohesion: 0.13
Nodes (26): appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), normalizeToken(), buildScheduleFromImport(), AddResidentModal(), detectHomeAndOffSheetsByContent(), extractVacationDateCells() (+18 more)

### Community 58 - "Payload"
Cohesion: 0.08
Nodes (57): Skipped, functools, Payload, _add_eve_day_pairs(), _add_night_cap(), _add_night_run_segments(), _add_night_run_window(), get_term() (+49 more)

### Community 63 - "overrideCapture.test.js"
Cohesion: 0.29
Nodes (5): REPORT, diffScheduleCells(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 71 - "migrate_admin_email_allowlist.sql"
Cohesion: 0.47
Nodes (5): admin_email_allowlist, profiles_admin_allowlist_promote, public.apply_admin_allowlist(), public.current_user_is_allowlisted_admin(), public.apply_admin_allowlist

### Community 76 - "useWalkthroughSeen.js"
Cohesion: 0.14
Nodes (22): User, User, User, User, User, Decisions, Round 2 (resident walkthrough), GettingStartedFooter() (+14 more)

### Community 77 - "validate.py"
Cohesion: 0.16
Nodes (27): _check_circadian_pairs(), _check_consecutive_work(), _check_count_caps(), _check_coverage_max(), _check_eligibility_and_locked(), _check_hours_cap(), _check_night_run_and_cap_and_segments(), _check_post_run6_rest() (+19 more)

### Community 78 - "acgmeHours.js"
Cohesion: 0.18
Nodes (20): buildDailyContributions(), combinedRow(), ED_WEEKLY_CAP_H, edHoursOn(), effectiveShiftEndMs(), fullDateRange(), GR_DURATION_H, GR_END_H (+12 more)

### Community 79 - "exportResidentCalendarPDF"
Cohesion: 0.38
Nodes (10): jspdf, jspdf-autotable, exportMatrixPDF(), exportResidentCalendarPDF(), offRequestEntryFor(), pdfDemoBanner(), pdfPageFooter(), pdfPageHeader() (+2 more)

### Community 80 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 81 - "optimizerSweep.js"
Cohesion: 0.42
Nodes (7): buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates(), compareVectors()

### Community 82 - "Overall: All addressed"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 83 - "What was already aligned (no change needed)"
Cohesion: 0.25
Nodes (8): User, Policy (2026-09-26, mirrors `fix/under-target-lift`'s JS-side changes), Solver objective weight policy: target vs. soft rules vs. overstaffing, What was already aligned (no change needed), _anti_fill_sum(), Sum of every per-assignment term that could ever prefer NOT filling a slot…, test_coverage_min_dominates_anti_fill_terms(), target()

### Community 84 - "nthWeekdayOnOrAfter"
Cohesion: 0.33
Nodes (7): conferenceAwayPgys(), conferenceDefs(), flexWellnessSubstituteAllowed(), isConferenceAwayFor(), nthWeekdayOnOrAfter(), podWellnessSubstituteAllowed(), seniorWellnessSubstituteAllowed()

### Community 85 - "qgenda.js"
Cohesion: 0.30
Nodes (13): qgendaDate(), normalizeQgendaHeaderOverrides(), QGENDA_COLUMN_DEFAULTS, QGENDA_JEOPARDY_TASK_ID, QGENDA_NAME_FORMATS, QGENDA_VARIANTS, qgendaEndDate(), qgendaName() (+5 more)

### Community 86 - "blockStatus.test.js"
Cohesion: 0.24
Nodes (6): BLOCK_STEP_IDS, deriveBlockSteps(), formatShortDate(), SHORT_MONTHS, BASE, BlockContextBar()

### Community 87 - "test_em_composition.py"
Cohesion: 0.20
Nodes (22): add_em_composition_terms(), add_pgy_fallback_terms(), _area_shift_dates(), Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md,…, podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, _build() (+14 more)

### Community 88 - "Done — 7 PRs open, all review-clean, nothing touched prod branches"
Cohesion: 0.08
Nodes (25): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+17 more)

### Community 90 - "useSpotlightTarget.js"
Cohesion: 0.24
Nodes (13): ACQUIRE_TIMEOUT_MS, prefersReducedMotion(), rectsEqual(), roundRect(), SETTLE_FRAMES, useSpotlightTarget(), acquire(), acquireLoop() (+5 more)

### Community 91 - "cellViolations"
Cohesion: 0.12
Nodes (35): Shift catalog & data model, block, classifyCellIssues(), formatGapH(), blockTypeFilterPasses(), cellViolations(), computeTotalTargetDemand(), effectiveChiefRole() (+27 more)

### Community 92 - "add_soft_sequence_constraint"
Cohesion: 0.29
Nodes (10): add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges(), test_run_at_or_above_soft_min_costs_nothing() (+2 more)

### Community 94 - "ApprovalQueue"
Cohesion: 0.50
Nodes (5): ApprovalQueue(), decide(), loadRequests(), residentName(), WhatIfSweepModal()

### Community 95 - "Resident walkthrough (`/requests`)"
Cohesion: 0.09
Nodes (23): User, 1. Dashboard — your command center, 1. Request a day off, 2. EM Residents — the roster, 2. Requesting more than one date, 3. Reason (optional), 3. Shift Matrix — who can work what, 4. Schedule — the grid (+15 more)

### Community 96 - "Efficiency Review"
Cohesion: 0.05
Nodes (37): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+29 more)

### Community 97 - "solve.py"
Cohesion: 0.12
Nodes (26): CpSolver, Known gap (not fixed here, out of scope), 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Environment, Files touched, Reproduction (+18 more)

### Community 98 - "RulesTab"
Cohesion: 0.15
Nodes (5): describeDayRules(), describeShiftGates(), eligKey(), RulesTab(), renderCoverageCell()

### Community 99 - "qgendaImport.js"
Cohesion: 0.12
Nodes (29): xlsx, matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), QGENDA_TASKS, buildQGendaImport() (+21 more)

### Community 100 - "Session Log: 06-09-2026 18:35 - nd-option"
Cohesion: 0.22
Nodes (8): Files Modified, Quick Reference (for AI scanning), Quick Resume Context, Recent Commits, Session Log: 06-09-2026 18:35 - nd-option, Tool Activity, Verification, Working Tree At Close

### Community 101 - "solverClient.js"
Cohesion: 0.39
Nodes (6): getSolverUrl(), isUnresolvedToken(), readGlobal(), SOLVER_ENABLED, solveRemote(), freshModule()

### Community 102 - "handleSubmit"
Cohesion: 1.00
Nodes (3): FeedbackWidget(), handleSubmit(), reset()

### Community 107 - "reviewPanel.js"
Cohesion: 0.10
Nodes (32): byDeficitThenSoftCount(), clearCell(), findAssignOptions(), findGiveCandidates(), findSwapCandidates(), hasOverrideTierViolation(), ineligibleButOverridable(), RESIDENTS (+24 more)

### Community 109 - "devDependencies"
Cohesion: 0.25
Nodes (8): devDependencies, autoprefixer, jsdom, postcss, tailwindcss, vite, @vitejs/plugin-react, vitest

### Community 110 - "fetchWithTimeout"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 112 - "shifts.js"
Cohesion: 0.19
Nodes (18): hourMs(), JEOPARDY_WINDOW_START_H, jeopardyWindowBounds(), scheduleHitsJeopardyWindow(), shiftOverlapsJeopardyWindow(), gapIsShort(), isLongShiftId(), overlappingAssignments() (+10 more)

### Community 113 - "Raw Session Log"
Cohesion: 0.17
Nodes (12): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Raw Session Log (+4 more)

### Community 114 - "Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local"
Cohesion: 0.20
Nodes (9): 3. Verbatim excerpts, All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify., Files Modified, New breakage: 1 Minor, Quick Reference (for AI scanning), Quick Resume Context, Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local, Tool Activity (+1 more)

### Community 115 - "Raw Session Log"
Cohesion: 0.09
Nodes (22): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+14 more)

### Community 116 - "JeopardyTab"
Cohesion: 0.27
Nodes (7): DATES6, dateInRanges(), fillJeopardy(), jeopardyCandidatesFor(), JeopardyTab(), runFill(), setCell()

### Community 117 - "package.json"
Cohesion: 0.07
Nodes (26): name, private, scripts, build, dev, preview, test, type (+18 more)

### Community 119 - "JeopardySickCallsCard"
Cohesion: 0.36
Nodes (5): computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), JeopardySickCallsCard(), addIncident()

### Community 120 - "Persistence"
Cohesion: 0.22
Nodes (14): Persistence, deleteDemo(), enterDemoFresh(), enterDemoResume(), exitDemo(), flushPendingCloudSave(), openDemoModal(), saveCloudNow() (+6 more)

### Community 121 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

### Community 122 - "scoreWeights.test.js"
Cohesion: 0.40
Nodes (5): bandOf(), groupBand(), preferenceKeys, structuralKeys, SCORE_TIERS

### Community 125 - "coverageComposition.js"
Cohesion: 0.13
Nodes (17): bucketLabel(), composeCoverage(), COVERAGE_GROUPS, groupForCategory(), resident(), CTX, elig(), BlockCalendarRow() (+9 more)

### Community 128 - "holidays.js"
Cohesion: 0.15
Nodes (20): buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy(), holidaysInRange() (+12 more)

## Knowledge Gaps
- **591 isolated node(s):** `AREA_LAST_SHIFT`, `AY_CONF_DATE_FIELDS`, `BASE_ELIGIBILITY`, `BLOCK_SCOPED_TABS`, `BLOCK_TARGETS` (+586 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 957 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Efficiency Review` connect `Efficiency Review` to `parseDate`, `test_weight_tiering.py`, `RulesTab`, `Session Log: 06-09-2026 18:35 - nd-option`, `ScheduleGrid`, `trauma_runs.py`, `getBlockDates`, `getCoverageFor`, `prettyDate`, `Payload`, `coverageComposition.js`?**
  _High betweenness centrality (0.200) - this node is a cross-community bridge._
- **Why does `VarStore` connect `Payload` to `Efficiency Review`, `make_resident`, `trauma_runs.py`, `variables.py`, `workday_limits.py`, `payload.py`, `test_em_composition.py`, `build_variables`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Why does `Payload` connect `Payload` to `test_weight_tiering.py`, `solve.py`, `make_resident`, `builder.py`, `parse_payload`, `trauma_runs.py`, `variables.py`, `timing.py`, `workday_limits.py`, `validate.py`, `payload.py`, `test_em_composition.py`, `build_variables`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Are the 97 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `validateAll()` (e.g. with `Reuse review findings` and `Assistant`) actually correct?**
  _`validateAll()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AREA_LAST_SHIFT`, `AY_CONF_DATE_FIELDS`, `BASE_ELIGIBILITY` to the rest of the system?**
  _591 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.016176805650489862 - nodes in this community are weakly interconnected._