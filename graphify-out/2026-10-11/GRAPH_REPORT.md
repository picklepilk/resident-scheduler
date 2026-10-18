# Graph Report - resident-scheduler  (2026-09-28)

## Corpus Check
- 225 files · ~396,633 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 3, .toml 2, .mdc 1)

## Summary
- 2614 nodes · 7009 edges · 134 communities (99 shown, 35 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 640 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `caef5265`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- dependencies
- Raw Session Log
- getBlockDates
- builder.py
- test_true_primary_preference.py
- ScheduleGrid
- Raw Session Log
- Resident Day-Off Request Implementation Plan
- vitest
- ShiftMatrixTab
- test_trauma_runs.py
- timing.py
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- Walkthrough.jsx
- 4. Real data vs. descriptive text
- day_off_requests.sql
- feedback Table Schema
- Findings
- generateSchedule
- generateScheduleBest
- main.py
- validate.py
- formatDisplayDate
- useMonthPager
- make_resident
- updateBlock
- DateListEditor
- formatResidentName
- Cloud Sync (Supabase)
- shifts.js
- test_weight_tiering.py
- Circadian Scheduling Rules
- Field-Ready Design System
- solve
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- parse_payload
- Summary
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- add_circadian_constraints
- payload.py
- baselineSuite.js
- test_workday_limits.py
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- RequestsTab.jsx
- chiefBenchmark.solver.test.js
- parse.js
- Payload
- Caveman Terse-Response Mode (Cline rule)
- Caveman Terse-Response Mode (Copilot rule)
- Caveman Terse-Response Mode (OpenCode rule)
- Caveman Terse-Response Mode (Windsurf rule)
- chiefBenchmark.test.js
- Dark Mode
- Dashboard/Home Merge
- PDF Export (jspdf-autotable)
- QGenda CSV Export Rework
- Soft Rule Priority
- What's New Banner
- migrate_admin_email_allowlist.sql
- useWalkthroughSeen.js
- Persistence
- acgmeHours.js
- exportResidentCalendarPDF
- DayRulesEditor
- runOptimizationSweep
- Overall: All addressed
- cli.py
- engineHeadToHead.test.js
- qgenda.js
- blockStatus.test.js
- test_em_composition.py
- Done — 7 PRs open, all review-clean, nothing touched prod branches
- session 2026-09-26
- useSpotlightTarget.js
- validateAll
- add_soft_sequence_constraint
- checkGenerateReadiness
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
- SidebarNav
- fetchWithTimeout
- test_hint_pin.py
- cellAlternatives.js
- Raw Session Log
- Session Log: 18-09-2026 11:21 - a520850a30cde04cc-users-amade-appdata-local
- Raw Session Log
- CLAUDE.md Archive
- package.json
- parseDate
- uiPrefsHook.test.js
- LitPool
- scoreWeights.test.js
- Solver objective weight policy: target vs. soft rules vs. overstaffing
- nd-option 2026-09-06
- JeopardyTab
- devDependencies
- Solver performance investigation (2026-08-22)
- holidays.js
- TimeOffModal
- overrideCapture.test.js
- What was already aligned (no change needed)
- jeopardyLedger.js
- RequestPortalCard

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
- `User` --references--> `main()`  [INFERRED]
  CC-Session-Logs/18-09-2026-11_21-a520850a30cde04cc-users-amade-appdata-local.md → solver-service/cli.py
- `Assistant` --references--> `getShiftTarget()`  [INFERRED]
  CC-Session-Logs/26-09-2026-14_15-session.md → src/ResidentScheduler.jsx
- `When editing` --references--> `getEligibleShifts()`  [INFERRED]
  CLAUDE-Archive.md → src/ResidentScheduler.jsx
- `Response shape` --references--> `mapSolverResult()`  [INFERRED]
  solver-service/docs/PAYLOAD_SCHEMA.md → src/ResidentScheduler.jsx

## Import Cycles
- None detected.

## Communities (134 total, 35 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (107): RFC-4180, RFC-5545, AREA_COLORS, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS (+99 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.10
Nodes (28): getAcademicYear(), buildSnapData(), makeDefaultBlock(), ResidentScheduler(), blockReset(), confirmPublishStep(), deleteBlockSnapshot(), deleteCurrentBlock() (+20 more)

### Community 2 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, qrcode (+4 more)

### Community 3 - "Raw Session Log"
Cohesion: 0.05
Nodes (42): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+34 more)

### Community 4 - "getBlockDates"
Cohesion: 0.07
Nodes (51): 12-hour shift windows, Archived from CLAUDE.md on 2026-09-26 (compaction), Generator (full originals), Layout & stack, When editing, coverageFillStats(), applyTraumaClampAndDow(), AREA_NORMAL_IDS (+43 more)

### Community 5 - "builder.py"
Cohesion: 0.11
Nodes (24): copy, _apply_cap_edit(), _apply_coverage_min_edit(), _apply_target_edit(), build_feasibility_report(), build_recommendations(), build_violations(), edit() (+16 more)

### Community 6 - "test_true_primary_preference.py"
Cohesion: 0.19
Nodes (15): add_senior_composition_constraints(), add_true_primary_preference_terms(), Rule 16: senior composition, hard and never-relaxable.…, Charges `coef` exactly when a (shift, date) with a true primary AVAILABLE…, _build(), test_no_entry_means_no_constraint_at_all(), test_staffed_shift_requires_a_primary_resident(), test_staffed_shift_with_primary_present_is_allowed() (+7 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.11
Nodes (28): updateBlockTracked(), ScheduleGrid(), applyAssign(), applyGive(), applySwap(), applySweepCandidate(), assign(), cancelHover() (+20 more)

### Community 8 - "Raw Session Log"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "vitest"
Cohesion: 0.06
Nodes (36): vitest, PRE_12H_EM_HOME_2, block, emCountWarnings(), issuesFor(), offService(), pgyGateWarnings(), res() (+28 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.13
Nodes (33): Rule-default migration, applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty() (+25 more)

### Community 12 - "test_trauma_runs.py"
Cohesion: 0.07
Nodes (74): Applied, 2. Per-module size contribution (isolated measurement), 3. The fix, 4. Correctness guardrail, TL;DR, _add_trauma_run_batch2_terms(), add_night_duration_alternation_terms(), add_peds_intern_night_deficit_term() (+66 more)

### Community 13 - "timing.py"
Cohesion: 0.07
Nodes (40): date, datetime, _effective_earlier_end_min(), Rule 17: pairwise rest -- gap between consecutive shifts (same resident) must…, The timestamp rest should be measured FROM after working `shift1` on `date1` --…, date_diff_days(), gap_between(), hour_mark_min() (+32 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.11
Nodes (27): GRID_GROUP_MODE_DEFAULT, GRID_GROUP_MODES, groupResidents(), PGY_GROUPS, pushNonEmpty(), ROTATION_EM_STYLE, BLOCK_TYPES, isEm() (+19 more)

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
Cohesion: 0.06
Nodes (71): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+63 more)

### Community 21 - "generateSchedule"
Cohesion: 0.11
Nodes (31): shiftOverlapsJC(), blockDayIndex(), buildSolverPayload(), countCurrentBlockJC(), countPublishedJC(), eligKey(), emCompositionRequired(), generateSchedule() (+23 more)

### Community 22 - "generateScheduleBest"
Cohesion: 0.19
Nodes (22): User, CP-SAT solver service (optional second engine), Head-to-head proof (`engineHeadToHead.test.js`, `SOLVER_PARITY=1`), Known gaps (not fixed here, out of scope), Pinning the polisher to its own hint (2026-09-27 follow-up, "pin to hint"), R9 (2026-09-27): CP-SAT as a reliable POLISHER, not a from-scratch competitor, Search tuning, Staged (lexicographic) objective — JS `betterQuality` tier mapping (+14 more)

### Community 23 - "main.py"
Cohesion: 0.13
Nodes (24): BaseModel, fastapi, fastapi_middleware_cors, get, importlib_metadata, os, pydantic, health() (+16 more)

### Community 24 - "validate.py"
Cohesion: 0.12
Nodes (36): New rule: `edWeekly60` / `totalWeekly72` (ACGME EM 6.17.a.3, tier `acgme`), no_overstaff_shift(), True when `shift` may NEVER use the +1 last-resort overstaff allowance (see…, cap_enforcement(), duty_enforcement(), _check_circadian_pairs(), _check_consecutive_work(), _check_coverage_max() (+28 more)

### Community 25 - "formatDisplayDate"
Cohesion: 0.07
Nodes (31): UI conventions (full originals), bucketLabel(), AvailabilityRangesEditor(), AYConferenceEditor(), BlockCalendarRow(), BlockCalendarSection(), BlockMonthGrid(), classifyForHandEdit() (+23 more)

### Community 26 - "useMonthPager"
Cohesion: 0.29
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), containers, Harness(), mountPager(), Harness() (+2 more)

### Community 27 - "make_resident"
Cohesion: 0.09
Nodes (63): ortools_sat_python, pathlib, add_coverage_constraints(), `min_enforcement`, when given, is `(shift_id, date_str) -> BoolVar` -- used…, add_rest_constraints(), build_variables(), make_payload(), make_resident() (+55 more)

### Community 28 - "updateBlock"
Cohesion: 0.18
Nodes (15): DashboardTab(), onStartDateChange(), setBlockField(), updSD(), EMResidentsTab(), removeRes(), setBA(), OffServiceTab() (+7 more)

### Community 29 - "DateListEditor"
Cohesion: 0.25
Nodes (3): DateListEditor(), WorkRestrictionsEditor(), remove()

### Community 30 - "formatResidentName"
Cohesion: 0.21
Nodes (11): AdminManagement(), residentLabel(), setRole(), ApprovalQueue(), decide(), loadRequests(), residentName(), RequestsTab() (+3 more)

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "shifts.js"
Cohesion: 0.19
Nodes (20): hourMs(), JEOPARDY_WINDOW_START_H, jeopardyWindowBounds(), scheduleHitsJeopardyWindow(), shiftOverlapsJeopardyWindow(), formatGapH(), gapIsShort(), isLongShiftId() (+12 more)

### Community 33 - "test_weight_tiering.py"
Cohesion: 0.11
Nodes (27): New soft term: `seniorTruePrimary`, What changed, apply_rule_priority(), load_default_weights(), merged_weights(), _priority_order(), Static config, read once per process rather than per solve. Cached safely…, Relative order of the two objective-relevant rulePriority entries, ignoring… (+19 more)

### Community 34 - "Circadian Scheduling Rules"
Cohesion: 0.40
Nodes (5): Circadian Scheduling Rules, Grand Rounds Lecture Day-Before Rule, Chief-Editable Journal Club Dates, Journal Club Rules, PED-N Split Into Two Shift IDs

### Community 35 - "Field-Ready Design System"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 36 - "solve"
Cohesion: 0.09
Nodes (33): solve(), _bamc_wed_night_relaxation_payload(), _jc_cap_relaxation_payload(), _night_cap_relaxation_payload(), Batch 2: pass-2 elastic relaxation, conflict naming, feasibility report., With restGap no longer wrapped by an `ok[...]` literal at all, the…, A resident LOCKED into 2 nights while `caps.nights == 1` -- unlike restGap,…, Default mode: coverage-min is already elastic in pass 1, so a plain staffing… (+25 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "parse_payload"
Cohesion: 0.09
Nodes (43): New config fields, Block, Config, _parse_eligible(), _parse_obligations(), parse_payload(), Settings, _num_workers() (+35 more)

### Community 40 - "Summary"
Cohesion: 0.04
Nodes (50): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+42 more)

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 44 - "add_circadian_constraints"
Cohesion: 0.14
Nodes (21): Pin-to-hint re-measurement (post circadian fix, 2026-09-27), add_circadian_constraints(), _add_eve_day_pairs(), _add_night_cap(), _add_night_run_segments(), _add_night_run_window(), get_term(), _link_night() (+13 more)

### Community 45 - "payload.py"
Cohesion: 0.09
Nodes (40): dataclasses, build_model(), BuildResult, payload -> (CpModel, VarStore, ObjectiveInfo). Pure model assembly, no solving…, AyPrior, CoverageEntry, _parse_coverage(), _parse_preferences() (+32 more)

### Community 46 - "baselineSuite.js"
Cohesion: 0.20
Nodes (12): baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname, loadBaseline(), makeBaselineSuite(), SEEDS (+4 more)

### Community 47 - "test_workday_limits.py"
Cohesion: 0.12
Nodes (27): R9 follow-up, part 2 (2026-09-27): GR-after-night exemption decided inside the model, add_days(), _add_post_run6_rest(), _add_six_day_window(), get_term(), add_workday_limit_constraints(), _forbid_triple(), _link_work() (+19 more)

### Community 52 - "RequestsTab.jsx"
Cohesion: 0.11
Nodes (26): lucide-react, react, SetNewPassword(), blockLabelFor(), fetchAyDataForLookup(), fetchBlocksForLookup(), fetchResState(), fetchRosterForPicker() (+18 more)

### Community 53 - "chiefBenchmark.solver.test.js"
Cohesion: 0.10
Nodes (19): ref_node_child_process, ref_node_fs, ref_node_os, ref_node_path, ref_node_url, vite, @vitejs/plugin-react, buildAllResidents() (+11 more)

### Community 54 - "parse.js"
Cohesion: 0.07
Nodes (49): Imports & exports, appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE (+41 more)

### Community 58 - "Payload"
Cohesion: 0.12
Nodes (40): Assistant, Simplification Review, functools, itertools, Payload, terms_for(), CoverageResult, Rules 24-25: per-(shift, date) staffing minimum/maximum. Min side depends on… (+32 more)

### Community 63 - "chiefBenchmark.test.js"
Cohesion: 0.12
Nodes (16): Assistant, Reuse review findings, Skipped, User, User, buildAllResidents(), nightRunsFor(), shiftActiveOnDow() (+8 more)

### Community 71 - "migrate_admin_email_allowlist.sql"
Cohesion: 0.47
Nodes (5): admin_email_allowlist, profiles_admin_allowlist_promote, public.apply_admin_allowlist(), public.current_user_is_allowlisted_admin(), public.apply_admin_allowlist

### Community 76 - "useWalkthroughSeen.js"
Cohesion: 0.15
Nodes (21): User, User, User, User, Decisions, Round 2 (resident walkthrough), GettingStartedFooter(), UserGuideTab() (+13 more)

### Community 77 - "Persistence"
Cohesion: 0.22
Nodes (14): Persistence, deleteDemo(), enterDemoFresh(), enterDemoResume(), exitDemo(), flushPendingCloudSave(), openDemoModal(), saveCloudNow() (+6 more)

### Community 78 - "acgmeHours.js"
Cohesion: 0.17
Nodes (21): New/changed request fields, buildDailyContributions(), combinedRow(), ED_WEEKLY_CAP_H, edHoursOn(), effectiveShiftEndMs(), fullDateRange(), GR_DURATION_H (+13 more)

### Community 79 - "exportResidentCalendarPDF"
Cohesion: 0.24
Nodes (15): jspdf, jspdf-autotable, demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), offRequestEntryFor(), pdfDemoBanner(), pdfPageFooter() (+7 more)

### Community 80 - "DayRulesEditor"
Cohesion: 0.35
Nodes (11): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+3 more)

### Community 81 - "runOptimizationSweep"
Cohesion: 0.36
Nodes (9): buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates(), compareVectors(), runOptimizationSweep() (+1 more)

### Community 82 - "Overall: All addressed"
Cohesion: 0.05
Nodes (44): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+36 more)

### Community 83 - "cli.py"
Cohesion: 0.15
Nodes (16): argparse, json, post, solve_endpoint(), main(), CLI entry point for the solver, independent of the FastAPI service. python…, PayloadError, Raised for structurally invalid request JSON (maps to HTTP 400/422). (+8 more)

### Community 84 - "engineHeadToHead.test.js"
Cohesion: 0.22
Nodes (12): __dirname, fmtVec(), issuesBreakdown(), normalizeMessage(), OUT_FILE, PYTHON, renderVariantMarkdown(), REPO_ROOT (+4 more)

### Community 85 - "qgenda.js"
Cohesion: 0.18
Nodes (18): qgendaDate(), normalizeQgendaHeaderOverrides(), QGENDA_COLUMN_DEFAULTS, QGENDA_JEOPARDY_TASK_ID, QGENDA_NAME_FORMATS, QGENDA_TASKS, QGENDA_VARIANTS, qgendaEndDate() (+10 more)

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

### Community 91 - "validateAll"
Cohesion: 0.10
Nodes (48): Assistant, Shift catalog & data model, block, addDays(), CTX, elig(), severityFor(), isNightShiftId() (+40 more)

### Community 92 - "add_soft_sequence_constraint"
Cohesion: 0.29
Nodes (10): add_soft_sequence_constraint(), negated_bounded_span(), Soft run-length shaping (rules 36-37: night clustering, work shape).…, Literals that must NOT all be true for the run of `length` starting at `start`…, Constrains the sequence of variables in `works` (booleans, one per day) so…, test_hard_corridor_between_soft_max_and_hard_max_forbids_that_length(), test_negated_bounded_span_includes_neighbors_at_edges(), test_run_at_or_above_soft_min_costs_nothing() (+2 more)

### Community 94 - "checkGenerateReadiness"
Cohesion: 0.27
Nodes (8): keptCellsForMode(), issues, lockedCells, schedule, violatingCells(), checkGenerateReadiness(), getJCPresenterGaps(), jcPresentersFor()

### Community 95 - "Resident walkthrough (`/requests`)"
Cohesion: 0.08
Nodes (25): User, User, 1. Dashboard — your command center, 1. Request a day off, 2. EM Residents — the roster, 2. Requesting more than one date, 3. Reason (optional), 3. Shift Matrix — who can work what (+17 more)

### Community 96 - "Efficiency Review"
Cohesion: 0.05
Nodes (37): Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant, Assistant (+29 more)

### Community 97 - "solve.py"
Cohesion: 0.09
Nodes (39): CpSolver, Known gap (not fixed here, out of scope), Never fall to pass 2 when the warm-start hint is feasible (2026-09-28), New request field: `hint`, LockedCell, _parse_locked(), apply_hint_pins(), evaluate_hint() (+31 more)

### Community 98 - "RulesTab"
Cohesion: 0.17
Nodes (4): describeDayRules(), describeShiftGates(), RulesTab(), renderCoverageCell()

### Community 99 - "qgendaImport.js"
Cohesion: 0.12
Nodes (30): xlsx, matchRosterByName(), nameTokenSet(), stripNameSuffix(), ROSTER, tokensIntersect(), buildQGendaImport(), cell() (+22 more)

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
Cohesion: 0.13
Nodes (24): classifyCellIssues(), coverageDirection(), GROUP_MESSAGE_LABELS, groupIssuesByKind(), groupKeyForIssue(), groupPanelIssues(), isJumpableIssue(), ISSUE_RULE_LABELS (+16 more)

### Community 109 - "SidebarNav"
Cohesion: 0.33
Nodes (7): CollapsibleCard(), reconcileTabOrder(), reorderIds(), SidebarNav(), renderTabButton(), resetDrag(), useUiPrefsContext()

### Community 110 - "fetchWithTimeout"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 111 - "test_hint_pin.py"
Cohesion: 0.17
Nodes (14): _full_coverage_hint(), R9 follow-up (2026-09-27, "pin the polisher to its own hint") --…, r1 is EM-core (target 3), r2/r3 are not -- a hint that leaves r2/r3 under…, 2026-09-28 fix ("never fall to pass 2 when the warm-start hint is feasible"):…, Direct check that pinning actually changes the model handed to the staged solve…, A hint that's fully LEGAL under EVERY hard constraint in small_feasible.json --…, Same illegal night->day hint shape as test_hint_and_staged.py's own crash-…, test_apply_hint_pins_adds_hard_constraints_to_the_real_model() (+6 more)

### Community 112 - "cellAlternatives.js"
Cohesion: 0.36
Nodes (9): byDeficitThenSoftCount(), clearCell(), findAssignOptions(), findGiveCandidates(), findSwapCandidates(), hasOverrideTierViolation(), ineligibleButOverridable(), RESIDENTS (+1 more)

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
Cohesion: 0.08
Nodes (24): name, private, scripts, build, dev, preview, test, type (+16 more)

### Community 119 - "parseDate"
Cohesion: 0.11
Nodes (37): Scheduling rules (full originals), ayWindowFor(), formatAY(), getAcademicYearFor(), getBlockWeekends(), parseDate(), toDateStr(), nightRun() (+29 more)

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
Cohesion: 0.29
Nodes (6): Changed rule: `restGap` (rule 17) — GR-end adjustment, Coverage-mapping investigation, part 3 (2026-09-27): no gap found; the loss is `TIER_QUALITY` noise, Policy (2026-09-26, mirrors `fix/under-target-lift`'s JS-side changes), R7 (2026-09-27): rule-severity policy + ACGME EM work-hour rules — solver parity, Response shape, Solver objective weight policy: target vs. soft rules vs. overstaffing

### Community 125 - "JeopardyTab"
Cohesion: 0.27
Nodes (7): DATES6, dateInRanges(), fillJeopardy(), jeopardyCandidatesFor(), JeopardyTab(), runFill(), setCell()

### Community 126 - "devDependencies"
Cohesion: 0.25
Nodes (8): devDependencies, autoprefixer, jsdom, postcss, tailwindcss, vite, @vitejs/plugin-react, vitest

### Community 127 - "Solver performance investigation (2026-08-22)"
Cohesion: 0.25
Nodes (7): 1. Baseline (58-resident production payload, 3 runs each, 8 workers, 30s budget), 5. Solve-time impact (honest result), 6. Parameter tuning (measured, not shipped), Environment, Files touched, Reproduction, Solver performance investigation (2026-08-22)

### Community 128 - "holidays.js"
Cohesion: 0.26
Nodes (17): buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy(), holidaysInRange() (+9 more)

### Community 129 - "TimeOffModal"
Cohesion: 0.43
Nodes (5): applyDateRangePaint(), paintActionFor(), toggleDateInList(), TimeOffModal(), startDrag()

### Community 130 - "overrideCapture.test.js"
Cohesion: 0.29
Nodes (5): REPORT, diffScheduleCells(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 131 - "What was already aligned (no change needed)"
Cohesion: 0.40
Nodes (6): User, What was already aligned (no change needed), _anti_fill_sum(), Sum of every per-assignment term that could ever prefer NOT filling a slot…, test_coverage_min_dominates_anti_fill_terms(), target()

### Community 132 - "jeopardyLedger.js"
Cohesion: 0.67
Nodes (3): computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger()

## Knowledge Gaps
- **633 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+628 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1055 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parse_payload()` connect `parse_payload` to `solve.py`, `test_weight_tiering.py`, `solve`, `builder.py`, `test_true_primary_preference.py`, `add_circadian_constraints`, `payload.py`, `test_trauma_runs.py`, `test_hint_pin.py`, `test_workday_limits.py`, `cli.py`, `generateScheduleBest`, `main.py`, `test_em_composition.py`, `validate.py`, `Payload`, `make_resident`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Why does `Pin-to-hint re-measurement (post circadian fix, 2026-09-27)` connect `add_circadian_constraints` to `solve.py`, `parse_payload`, `validateAll`, `payload.py`, `generateSchedule`, `generateScheduleBest`, `parseDate`, `validate.py`, `make_resident`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Why does `Efficiency Review` connect `Efficiency Review` to `test_weight_tiering.py`, `RulesTab`, `getBlockDates`, `Session Log: 06-09-2026 18:35 - nd-option`, `ScheduleGrid`, `test_trauma_runs.py`, `generateSchedule`, `generateScheduleBest`, `parse.js`, `formatDisplayDate`, `Payload`, `chiefBenchmark.test.js`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Are the 113 inferred relationships involving `Payload` (e.g. with `build_model()` and `add_circadian_constraints()`) actually correct?**
  _`Payload` has 113 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `parse_payload()` (e.g. with `Known gaps (not fixed here, out of scope)` and `Pin-to-hint re-measurement (post circadian fix, 2026-09-27)`) actually correct?**
  _`parse_payload()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _633 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.015682569674067077 - nodes in this community are weakly interconnected._