# Graph Report - resident-scheduler  (2026-09-28)

## Corpus Check
- 224 files · ~394,724 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 3, .toml 2, .mdc 1)

## Summary
- 2571 nodes · 6966 edges · 126 communities (92 shown, 34 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 639 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `caef5265`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- dependencies
- test_trauma_runs.py
- getBlockDates
- builder.py
- helpers.py
- ScheduleGrid
- Raw Session Log
- Resident Day-Off Request Implementation Plan
- vitest
- ShiftMatrixTab
- VarStore
- timing.py
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- tourGeometry.js
- 4. Real data vs. descriptive text
- day_off_requests.sql
- feedback Table Schema
- Findings
- validateAll
- generateScheduleBest
- main.py
- validate.py
- make_payload
- useMonthPager
- make_resident
- updateBlock
- add
- formatResidentName
- Cloud Sync (Supabase)
- parseDate
- test_weight_tiering.py
- Circadian Scheduling Rules
- Field-Ready Design System
- matchRosterByName
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- parse_payload
- Summary
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- parse.js
- variables.py
- baselineSuite.js
- workday_limits.py
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- RequestsTab.jsx
- chiefBenchmark.solver.test.js
- prettyDate
- Payload
- Caveman Terse-Response Mode (Cline rule)
- Caveman Terse-Response Mode (Copilot rule)
- Caveman Terse-Response Mode (OpenCode rule)
- Caveman Terse-Response Mode (Windsurf rule)
- payload.py
- Dark Mode
- Dashboard/Home Merge
- PDF Export (jspdf-autotable)
- QGenda CSV Export Rework
- Soft Rule Priority
- What's New Banner
- migrate_admin_email_allowlist.sql
- Walkthrough.jsx
- Persistence
- acgmeHours.js
- formatDisplayDate
- DayRulesEditor
- runOptimizationSweep
- Overall: All addressed
- Imports & exports
- engineHeadToHead.test.js
- qgenda.js
- blockStatus.test.js
- test_em_composition.py
- Done — 7 PRs open, all review-clean, nothing touched prod branches
- session 2026-09-26
- useSpotlightTarget.js
- getEligibleShifts
- add_soft_sequence_constraint
- keptCellViolations.test.js
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
- UI conventions (full originals)
- fetchWithTimeout
- test_workday_limits.py
- scheduleGrouping.test.js
- Raw Session Log
- Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local
- Raw Session Log
- CLAUDE.md Archive
- package.json
- dates.js
- uiPrefsHook.test.js
- LitPool
- scoreWeights.test.js
- Solver objective weight policy: target vs. soft rules vs. overstaffing
- nd-option 2026-09-06
- holidays.js

## God Nodes (most connected - your core abstractions)
1. `Payload` - 138 edges
2. `parse_payload()` - 127 edges
3. `parseDate()` - 118 edges
4. `make_resident()` - 94 edges
5. `4. Real data vs. descriptive text` - 94 edges
6. `validateAll()` - 91 edges
7. `VarStore` - 82 edges
8. `ScheduleGrid()` - 75 edges
9. `generateSchedule()` - 69 edges
10. `toDateStr()` - 68 edges

## Surprising Connections (you probably didn't know these)
- `All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify.` --references--> `main()`  [INFERRED]
  CC-Session-Logs/18-09-2026-11_21-a520850a30cde04cc-users-amade-appdata-local.md → solver-service/cli.py
- `Assistant` --references--> `getShiftTarget()`  [INFERRED]
  CC-Session-Logs/26-09-2026-14_15-session.md → src/ResidentScheduler.jsx
- `Response shape` --references--> `mapSolverResult()`  [INFERRED]
  solver-service/docs/PAYLOAD_SCHEMA.md → src/ResidentScheduler.jsx
- `Changed rule: `restGap` (rule 17) — GR-end adjustment` --references--> `effectiveShiftEndMs()`  [INFERRED]
  solver-service/docs/PAYLOAD_SCHEMA.md → src/lib/acgmeHours.js
- `Reuse review findings` --references--> `isEm()`  [INFERRED]
  CC-Session-Logs/06-09-2026-18_35-nd-option.md → src/lib/scheduleGrouping.test.js

## Import Cycles
- None detected.

## Communities (126 total, 34 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (107): RFC-4180, RFC-5545, bucketLabel(), REPORT, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS (+99 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.09
Nodes (29): buildSnapData(), deepEqualNormalized(), makeDefaultBlock(), normalizeForCompare(), ResidentScheduler(), blockReset(), confirmPublishStep(), deleteBlockSnapshot() (+21 more)

### Community 2 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, qrcode (+4 more)

### Community 3 - "test_trauma_runs.py"
Cohesion: 0.12
Nodes (44): 4. Correctness guardrail, Resident, Flat accumulator for one weighted-term family. Replaces the old `Tier` class,…, TermGroup, Index set (into `payload.all_dates`) of every position where…, _trauma_possible_indices(), _build(), _build_alt() (+36 more)

### Community 4 - "getBlockDates"
Cohesion: 0.05
Nodes (64): Assistant, Reuse review findings, User, User, 12-hour shift windows, coverageFillStats(), nightRunsFor(), applyTraumaClampAndDow() (+56 more)

### Community 5 - "builder.py"
Cohesion: 0.11
Nodes (27): ElasticBuildResult, _apply_cap_edit(), _apply_coverage_min_edit(), _apply_target_edit(), _assigned_count_for_cap(), build_feasibility_report(), build_recommendations(), build_violations() (+19 more)

### Community 6 - "helpers.py"
Cohesion: 0.17
Nodes (14): copy, pathlib, Shared tiny-payload builders for the model-family unit tests. Not a test module…, _build(), R7 (2026-09-27, gap 3): soft preference for a TRUE primary PGY over a Wellness-…, test_no_entry_means_no_constraint_at_all(), test_no_penalty_when_no_true_primary_is_available(), test_prefers_true_primary_over_fallback_when_both_available() (+6 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.10
Nodes (29): diffScheduleCells(), updateBlockTracked(), ScheduleGrid(), applyAssign(), applyGive(), applySwap(), assign(), cancelHover() (+21 more)

### Community 8 - "Raw Session Log"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "vitest"
Cohesion: 0.07
Nodes (34): vitest, acepFixture(), PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService(), pgyGateWarnings() (+26 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.13
Nodes (33): Rule-default migration, applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty() (+25 more)

### Community 12 - "VarStore"
Cohesion: 0.09
Nodes (44): Applied, 2. Per-module size contribution (isolated measurement), 3. The fix, 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Files touched, Reproduction, Solver performance investigation (2026-08-22) (+36 more)

### Community 13 - "timing.py"
Cohesion: 0.09
Nodes (33): datetime, _effective_earlier_end_min(), The timestamp rest should be measured FROM after working `shift1` on `date1` --…, date_diff_days(), gap_between(), hour_mark_min(), _ordinal_minutes(), overlaps_hour_window() (+25 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.19
Nodes (18): GRID_GROUP_MODES, clampGridColExtra(), clampGridZoom(), DEFAULT_UI_PREFS, GRID_COL_EXTRA_MAX, src_lib_uiprefs_grid_group_modes, GRID_ZOOM_DEFAULT, GRID_ZOOM_MAX (+10 more)

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

### Community 19 - "feedback Table Schema"
Cohesion: 0.33
Nodes (6): Crash Auto-Capture (window.onerror/unhandledrejection), User Feedback + Admin Portal Design, Feedback Admin Netlify Function, feedback Table Schema, Floating Feedback Widget (Bug/Crash/Idea), Track A: Shared-Password Admin Gating

### Community 20 - "Findings"
Cohesion: 0.06
Nodes (67): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+59 more)

### Community 21 - "validateAll"
Cohesion: 0.07
Nodes (58): Assistant, Generator (full originals), papaFixture(), runValidate(), runValidate(), buildSolverPayload(), buildStaticGenContext(), checkGenerateReadiness() (+50 more)

### Community 22 - "generateScheduleBest"
Cohesion: 0.28
Nodes (16): User, CP-SAT solver service (optional second engine), Coverage-mapping investigation, part 3 (2026-09-27): no gap found; the loss is `TIER_QUALITY` noise, Head-to-head proof (`engineHeadToHead.test.js`, `SOLVER_PARITY=1`), Known gaps (not fixed here, out of scope), Pinning the polisher to its own hint (2026-09-27 follow-up, "pin to hint"), R9 (2026-09-27): CP-SAT as a reliable POLISHER, not a from-scratch competitor, Staged (lexicographic) objective — JS `betterQuality` tier mapping (+8 more)

### Community 23 - "main.py"
Cohesion: 0.08
Nodes (37): argparse, BaseModel, User, fastapi, fastapi_middleware_cors, get, importlib_metadata, json (+29 more)

### Community 24 - "validate.py"
Cohesion: 0.15
Nodes (30): no_overstaff_shift(), True when `shift` may NEVER use the +1 last-resort overstaff allowance (see…, add_days(), _check_circadian_pairs(), _check_consecutive_work(), _check_count_caps(), _check_coverage_max(), _check_eligibility_and_locked() (+22 more)

### Community 25 - "make_payload"
Cohesion: 0.13
Nodes (35): ortools_sat_python, add_coverage_constraints(), `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, build_variables(), make_payload(), Rule 25's max is no longer a pure hard cap: the app's own "under-target lift"…, TRAUMA is excluded from the +1-overstaff allowance -- its max is separately…, Peds nights (PED-N/PED-N-FM/PED-N12) are excluded from the +1-overstaff… (+27 more)

### Community 26 - "useMonthPager"
Cohesion: 0.29
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), containers, Harness(), mountPager(), Harness() (+2 more)

### Community 27 - "make_resident"
Cohesion: 0.17
Nodes (28): make_resident(), _build(), test_day_then_eve_next_day_allowed(), test_day_then_night_next_day_is_allowed_by_this_rule(), test_eve_then_day_next_day_forbidden(), test_more_than_two_night_run_segments_forbidden(), test_night_cap_enforced(), test_night_exempt_resident_skips_night_cap() (+20 more)

### Community 28 - "updateBlock"
Cohesion: 0.11
Nodes (22): User, DATES6, setBlockField(), updSD(), dateInRanges(), EMResidentsTab(), removeRes(), setBA() (+14 more)

### Community 29 - "add"
Cohesion: 0.15
Nodes (7): DateListEditor(), normalizeRulePriority(), ruleRank(), SpecialDaysList(), WorkRestrictionsEditor(), add(), remove()

### Community 30 - "formatResidentName"
Cohesion: 0.21
Nodes (11): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestsTab() (+3 more)

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "parseDate"
Cohesion: 0.13
Nodes (40): addDays(), parseDate(), toDateStr(), nightRun(), papaBare, sixDayRun(), hourMs(), JEOPARDY_WINDOW_START_H (+32 more)

### Community 33 - "test_weight_tiering.py"
Cohesion: 0.10
Nodes (31): New soft term: `seniorTruePrimary`, What changed, What was already aligned (no change needed), apply_rule_priority(), load_default_weights(), merged_weights(), _priority_order(), Static config, read once per process rather than per solve. Cached safely… (+23 more)

### Community 34 - "Circadian Scheduling Rules"
Cohesion: 0.40
Nodes (5): Circadian Scheduling Rules, Grand Rounds Lecture Day-Before Rule, Chief-Editable Journal Club Dates, Journal Club Rules, PED-N Split Into Two Shift IDs

### Community 35 - "Field-Ready Design System"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 36 - "matchRosterByName"
Cohesion: 0.17
Nodes (17): xlsx, matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), buildQGendaImport(), extractVacationDateCells() (+9 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "parse_payload"
Cohesion: 0.05
Nodes (92): Block, Config, _parse_eligible(), _parse_obligations(), parse_payload(), Settings, solve(), load_fixture() (+84 more)

### Community 40 - "Summary"
Cohesion: 0.04
Nodes (50): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+42 more)

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "parse.js"
Cohesion: 0.24
Nodes (14): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), normalizeToken(), parseDateRangeInAY(), parseRosterText() (+6 more)

### Community 45 - "variables.py"
Cohesion: 0.08
Nodes (44): dataclasses, New rule: `edWeekly60` / `totalWeekly72` (ACGME EM 6.17.a.3, tier `acgme`), Pin-to-hint re-measurement (post circadian fix, 2026-09-27), build_model(), payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, add_circadian_constraints(), _add_eve_day_pairs(), _add_night_cap() (+36 more)

### Community 46 - "baselineSuite.js"
Cohesion: 0.20
Nodes (12): baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname, loadBaseline(), makeBaselineSuite(), SEEDS (+4 more)

### Community 47 - "workday_limits.py"
Cohesion: 0.16
Nodes (18): as_literal(), const_lit(), Normalize a rolling-window/sequence term (python int OR a real BoolVar) into…, A fixed-value CP-SAT literal (usable in add_bool_and/or, OnlyEnforceIf, and…, _add_post_run6_rest(), _add_six_day_window(), get_term(), add_workday_limit_constraints() (+10 more)

### Community 52 - "RequestsTab.jsx"
Cohesion: 0.11
Nodes (26): react, SetNewPassword(), RequestPortalCard(), blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState(), fetchRosterForPicker() (+18 more)

### Community 53 - "chiefBenchmark.solver.test.js"
Cohesion: 0.10
Nodes (20): ref_node_child_process, ref_node_fs, ref_node_os, ref_node_path, ref_node_url, vite, @vitejs/plugin-react, buildAllResidents() (+12 more)

### Community 54 - "prettyDate"
Cohesion: 0.15
Nodes (21): appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), buildScheduleFromImport(), AddResidentModal(), AYConferenceEditor(), ImportHistoryPanel(), deleteEntry() (+13 more)

### Community 58 - "Payload"
Cohesion: 0.09
Nodes (44): Assistant, Simplification Review, Skipped, date, functools, itertools, Payload, add_count_cap_constraints() (+36 more)

### Community 63 - "payload.py"
Cohesion: 0.16
Nodes (15): New request field: `hint`, AyPrior, CoverageEntry, LockedCell, _parse_coverage(), _parse_locked(), _parse_preferences(), _parse_residents() (+7 more)

### Community 71 - "migrate_admin_email_allowlist.sql"
Cohesion: 0.47
Nodes (5): admin_email_allowlist, profiles_admin_allowlist_promote, public.apply_admin_allowlist(), public.current_user_is_allowlisted_admin(), public.apply_admin_allowlist

### Community 76 - "Walkthrough.jsx"
Cohesion: 0.12
Nodes (26): User, User, User, User, Decisions, Round 2 (resident walkthrough), lucide-react, GettingStartedFooter() (+18 more)

### Community 77 - "Persistence"
Cohesion: 0.22
Nodes (14): Persistence, deleteDemo(), enterDemoFresh(), enterDemoResume(), exitDemo(), flushPendingCloudSave(), openDemoModal(), saveCloudNow() (+6 more)

### Community 78 - "acgmeHours.js"
Cohesion: 0.19
Nodes (19): New/changed request fields, buildDailyContributions(), combinedRow(), ED_WEEKLY_CAP_H, edHoursOn(), effectiveShiftEndMs(), fullDateRange(), GR_DURATION_H (+11 more)

### Community 79 - "formatDisplayDate"
Cohesion: 0.08
Nodes (31): jspdf, jspdf-autotable, AvailabilityRangesEditor(), blockDayIndex(), buildResidentICS(), demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF() (+23 more)

### Community 80 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 81 - "runOptimizationSweep"
Cohesion: 0.36
Nodes (9): buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates(), compareVectors(), runOptimizationSweep() (+1 more)

### Community 82 - "Overall: All addressed"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 83 - "Imports & exports"
Cohesion: 0.18
Nodes (13): Imports & exports, detectHomeAndOffSheetsByContent(), findDateHeaderRow(), ImportMatrixModal(), pickFile(), inferGroupPgy(), matchBlockType(), parseAYStartYear() (+5 more)

### Community 84 - "engineHeadToHead.test.js"
Cohesion: 0.20
Nodes (13): __dirname, fmtVec(), issuesBreakdown(), nightRunsFor(), normalizeMessage(), OUT_FILE, PYTHON, renderVariantMarkdown() (+5 more)

### Community 85 - "qgenda.js"
Cohesion: 0.26
Nodes (15): qgendaDate(), normalizeQgendaHeaderOverrides(), QGENDA_COLUMN_DEFAULTS, QGENDA_JEOPARDY_TASK_ID, QGENDA_NAME_FORMATS, QGENDA_TASKS, QGENDA_VARIANTS, qgendaEndDate() (+7 more)

### Community 86 - "blockStatus.test.js"
Cohesion: 0.24
Nodes (6): BLOCK_STEP_IDS, deriveBlockSteps(), formatShortDate(), SHORT_MONTHS, BASE, BlockContextBar()

### Community 87 - "test_em_composition.py"
Cohesion: 0.21
Nodes (22): add_em_composition_terms(), add_pgy_fallback_terms(), _area_shift_dates(), podPgy2Fallback / flexPgy3Fallback: a flat per-assignment cost for every EM…, Yields every (shiftId, date) pair for shifts in the given area, over the whole…, podEmComposition / flexEmComposition: for every (POD|FLEX shift, date) pair,…, _add_em_composition_round2b_terms(), _build() (+14 more)

### Community 88 - "Done — 7 PRs open, all review-clean, nothing touched prod branches"
Cohesion: 0.08
Nodes (25): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+17 more)

### Community 90 - "useSpotlightTarget.js"
Cohesion: 0.24
Nodes (13): ACQUIRE_TIMEOUT_MS, prefersReducedMotion(), rectsEqual(), roundRect(), SETTLE_FRAMES, useSpotlightTarget(), acquire(), acquireLoop() (+5 more)

### Community 91 - "getEligibleShifts"
Cohesion: 0.09
Nodes (46): Archived from CLAUDE.md on 2026-09-26 (compaction), Layout & stack, Scheduling rules (full originals), Shift catalog & data model, When editing, block, CTX, elig() (+38 more)

### Community 92 - "add_soft_sequence_constraint"
Cohesion: 0.29
Nodes (10): add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges(), test_run_at_or_above_soft_min_costs_nothing() (+2 more)

### Community 94 - "keptCellViolations.test.js"
Cohesion: 0.38
Nodes (5): keptCellsForMode(), issues, lockedCells, schedule, violatingCells()

### Community 95 - "Resident walkthrough (`/requests`)"
Cohesion: 0.08
Nodes (25): User, User, 1. Dashboard — your command center, 1. Request a day off, 2. EM Residents — the roster, 2. Requesting more than one date, 3. Reason (optional), 3. Shift Matrix — who can work what (+17 more)

### Community 96 - "Efficiency Review"
Cohesion: 0.05
Nodes (37): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+29 more)

### Community 97 - "solve.py"
Cohesion: 0.08
Nodes (46): CpSolver, Known gap (not fixed here, out of scope), Never fall to pass 2 when the warm-start hint is feasible (2026-09-28), New config fields, Search tuning, 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), Environment, BuildResult (+38 more)

### Community 98 - "RulesTab"
Cohesion: 0.17
Nodes (4): describeDayRules(), describeShiftGates(), RulesTab(), renderCoverageCell()

### Community 99 - "qgendaImport.js"
Cohesion: 0.24
Nodes (15): cell(), countDayNumbers(), countDowCells(), DOW_INDEX, findDayNumberRow(), isoFrom(), MONTHS, normalizeTaskName() (+7 more)

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

### Community 109 - "UI conventions (full originals)"
Cohesion: 0.18
Nodes (12): UI conventions (full originals), BlockCalendarSection(), CollapsibleCard(), reconcileTabOrder(), reorderIds(), ResidentCardsView(), updateAyData(), SidebarNav() (+4 more)

### Community 110 - "fetchWithTimeout"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 111 - "test_workday_limits.py"
Cohesion: 0.32
Nodes (12): R9 follow-up, part 2 (2026-09-27): GR-after-night exemption decided inside the model, _build(), test_exemption_lets_solver_legally_place_a_pattern_js_allows(), test_gr_day_after_a_night_not_counted_as_workday(), test_gr_day_without_a_night_before_still_counted_as_workday(), test_obligation_day_forces_work_var_true_with_no_shift(), test_obligation_without_exempt_flag_counts_even_after_a_night(), test_post_run6_rest_blocks_shift_within_24h_after_completed_run_isolated_from_rule19() (+4 more)

### Community 112 - "scheduleGrouping.test.js"
Cohesion: 0.21
Nodes (9): GRID_GROUP_MODE_DEFAULT, groupResidents(), PGY_GROUPS, pushNonEmpty(), ROTATION_EM_STYLE, BLOCK_TYPES, isEm(), ROSTER (+1 more)

### Community 113 - "Raw Session Log"
Cohesion: 0.17
Nodes (12): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Raw Session Log (+4 more)

### Community 114 - "Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local"
Cohesion: 0.20
Nodes (9): 3. Verbatim excerpts, All 7 PRs merged (2026-09-18 16:13–16:14Z). Six now deploying to prod via Netlify., Files Modified, New breakage: 1 Minor, Quick Reference (for AI scanning), Quick Resume Context, Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local, Tool Activity (+1 more)

### Community 115 - "Raw Session Log"
Cohesion: 0.09
Nodes (22): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+14 more)

### Community 117 - "package.json"
Cohesion: 0.06
Nodes (32): devDependencies, autoprefixer, jsdom, postcss, tailwindcss, vite, @vitejs/plugin-react, vitest (+24 more)

### Community 119 - "dates.js"
Cohesion: 0.09
Nodes (27): ayWindowFor(), formatAY(), getAcademicYear(), getAcademicYearFor(), getBlockWeekends(), applyDateRangePaint(), paintActionFor(), toggleDateInList() (+19 more)

### Community 120 - "uiPrefsHook.test.js"
Cohesion: 0.20
Nodes (6): Auth, react-dom, AUTH_ENABLED(), containers, VIEWER, src_supabaseclient_mock

### Community 121 - "LitPool"
Cohesion: 0.33
Nodes (3): CpModel, LitPool, Lazily creates and memoizes `ok[...]` BoolVars keyed by an arbitrary tuple.…

### Community 122 - "scoreWeights.test.js"
Cohesion: 0.40
Nodes (5): bandOf(), groupBand(), preferenceKeys, structuralKeys, SCORE_TIERS

### Community 123 - "Solver objective weight policy: target vs. soft rules vs. overstaffing"
Cohesion: 0.33
Nodes (5): Changed rule: `restGap` (rule 17) — GR-end adjustment, Policy (2026-09-26, mirrors `fix/under-target-lift`'s JS-side changes), R7 (2026-09-27): rule-severity policy + ACGME EM work-hour rules — solver parity, Response shape, Solver objective weight policy: target vs. soft rules vs. overstaffing

### Community 128 - "holidays.js"
Cohesion: 0.26
Nodes (17): buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy(), holidaysInRange() (+9 more)

## Knowledge Gaps
- **594 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+589 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1015 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parse_payload()` connect `parse_payload` to `test_weight_tiering.py`, `test_trauma_runs.py`, `builder.py`, `helpers.py`, `variables.py`, `test_workday_limits.py`, `generateScheduleBest`, `main.py`, `test_em_composition.py`, `make_payload`, `Payload`, `make_resident`, `payload.py`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Why does `Efficiency Review` connect `Efficiency Review` to `ResidentScheduler.jsx`, `test_weight_tiering.py`, `RulesTab`, `getBlockDates`, `Session Log: 06-09-2026 18:35 - nd-option`, `ScheduleGrid`, `VarStore`, `formatDisplayDate`, `Imports & exports`, `validateAll`, `generateScheduleBest`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Why does `Pin-to-hint re-measurement (post circadian fix, 2026-09-27)` connect `variables.py` to `parseDate`, `solve.py`, `parse_payload`, `validateAll`, `generateScheduleBest`, `validate.py`, `make_resident`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Are the 113 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 113 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `parse_payload()` (e.g. with `Known gaps (not fixed here, out of scope)` and `Pin-to-hint re-measurement (post circadian fix, 2026-09-27)`) actually correct?**
  _`parse_payload()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _594 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.016143660438962454 - nodes in this community are weakly interconnected._