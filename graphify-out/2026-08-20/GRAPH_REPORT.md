# Graph Report - resident-scheduler  (2026-08-20)

## Corpus Check
- 99 files · ~213,771 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1012 nodes · 2445 edges · 80 communities (57 shown, 23 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0f112f0f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- generator.harness.test.js
- dependencies
- AppGate.jsx
- coverage.js
- add
- parseDate
- ResidentScheduler
- getEligibleShifts
- Resident Day-Off Request Implementation Plan
- syntheticRoster.js
- ShiftMatrixTab
- shifts.js
- RulesTab
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- JeopardySickCallsCard
- getJCPresenterGaps
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- repairPass
- parseVacationWorkbook
- ScheduleGrid
- formatDisplayDate
- scheduleQuality.js
- sbFetch
- calendarGrid.js
- isConferenceAwayFor
- updateBlock
- exportResidentCalendarPDF
- overrideCapture.test.js
- Cloud Sync (Supabase)
- baselineSuite.js
- scoreWeights.test.js
- Circadian Scheduling Rules
- Field-Ready Design System
- coverageComposition.js
- Auth, Roles & Day-Off Requests
- Coverage Min/Max Model
- rollingWindowHours.test.js
- SidebarNav
- migrate_add_pending_approval.sql
- Per-Block Target Overrides (Buy-Downs)
- sw.js
- nightAreaDiversity.test.js
- pedNightMigration.test.js
- FeedbackAdminTab
- migratePedsPgy1ToPgy2
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
- getBlockProgress
- deepEqualNormalized
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

## God Nodes (most connected - your core abstractions)
1. `parseDate()` - 89 edges
2. `validateAll()` - 64 edges
3. `ResidentScheduler()` - 53 edges
4. `toDateStr()` - 50 edges
5. `generateSchedule()` - 45 edges
6. `ScheduleGrid()` - 42 edges
7. `addDays()` - 41 edges
8. `formatDisplayDate()` - 38 edges
9. `getBlockDates()` - 35 edges
10. `showToast()` - 30 edges

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
- **Generator Quality Improvement Program** — claude_md_score_weights_audit, claude_md_work_shape_scoring, claude_md_ay_carryover, claude_md_override_capture [INFERRED 0.85]
- **Caveman terse-response rule duplicated across every AI tool config in this repo** — _clinerules_caveman_caveman_mode, _github_copilot_instructions_caveman_mode, _opencode_agents_caveman_mode, _windsurf_rules_caveman_caveman_mode, agents_caveman_mode [INFERRED 0.85]
- **End-to-end day-off request flow: resident submission through chief approval into the schedule** — docs_superpowers_plans_2026_07_18_resident_day_off_requests_task7_request_form, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task10_approval_queue, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task11_pending_badge [INFERRED 0.85]
- **Feedback capture-to-triage pipeline: widget/crash capture write, admin function/tab read** — docs_superpowers_plans_2026_07_18_user_feedback_plan_task1_schema_helper, docs_superpowers_plans_2026_07_18_user_feedback_plan_task2_widget, docs_superpowers_plans_2026_07_18_user_feedback_plan_task3_crash_capture, docs_superpowers_plans_2026_07_18_user_feedback_plan_task4_admin_function, docs_superpowers_plans_2026_07_18_user_feedback_plan_task5_admin_tab [INFERRED 0.85]

## Communities (80 total, 23 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (79): RFC-4180, RFC-5545, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS, BLOCK_TYPE_MAP (+71 more)

### Community 1 - "generator.harness.test.js"
Cohesion: 0.17
Nodes (15): makeSnapshot(), VARIANTS, buildRulePriorityVariants(), compareSweepCandidates(), diffSchedules(), isBetterThanBaseline(), permutations(), rankSweepCandidates() (+7 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (47): autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jsdom, lucide-react, dependencies, @fontsource/barlow (+39 more)

### Community 3 - "AppGate.jsx"
Cohesion: 0.06
Nodes (42): AppGate(), SetNewPassword(), crashKey(), ErrorBoundary, reportCrash(), AdminManagement(), residentLabel(), setRole() (+34 more)

### Community 4 - "coverage.js"
Cohesion: 0.22
Nodes (16): AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, DOW_COVERAGE_OVERRIDE, implicitConferenceWindows() (+8 more)

### Community 5 - "add"
Cohesion: 0.07
Nodes (45): appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory() (+37 more)

### Community 6 - "parseDate"
Cohesion: 0.06
Nodes (94): addDays(), ayWindowFor(), formatAY(), getAcademicYear(), getAcademicYearFor(), getBlockDates(), getBlockWeekends(), parseDate() (+86 more)

### Community 7 - "ResidentScheduler"
Cohesion: 0.10
Nodes (33): buildSnapData(), makeDefaultBlock(), ResidentScheduler(), blockReset(), deleteBlockSnapshot(), deleteCurrentBlock(), deleteDemo(), doLoadBlock() (+25 more)

### Community 8 - "getEligibleShifts"
Cohesion: 0.18
Nodes (20): blockTypeFilterPasses(), buildResidentICS(), effectiveWellnessWednesdayDate(), gateActiveForBlock(), getEffectiveDayRules(), getEligibleShifts(), getMissingSpecialDayLists(), grWorkDow() (+12 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "syntheticRoster.js"
Cohesion: 0.10
Nodes (19): acepFixture(), PRE_12H_EM_HOME_2, papaFixture(), runValidate(), buildStandardRoster(), makeBlock(), makeDefaultAppSettings(), makeFixture() (+11 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.12
Nodes (34): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+26 more)

### Community 12 - "shifts.js"
Cohesion: 0.22
Nodes (13): QGENDA_NAME_FORMATS, QGENDA_TASKS, QGENDA_VARIANTS, qgendaName(), qgendaTaskFor(), AREA_COLORS, NOTE: AREA_COLORS is not in the original extraction spec's const list, but…, SHIFT_AREAS (+5 more)

### Community 13 - "RulesTab"
Cohesion: 0.12
Nodes (16): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+8 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.15
Nodes (12): DEFAULT_UI_PREFS, normalizeUiPrefs(), containers, mountHook(), Harness(), VIEWER, NOOP_UI_PREFS, readDeviceLocal() (+4 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.16
Nodes (16): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+8 more)

### Community 16 - "JeopardySickCallsCard"
Cohesion: 0.36
Nodes (5): computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), JeopardySickCallsCard(), addIncident()

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (21): auth, auth.users, public.apply_admin_allowlist, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests (+13 more)

### Community 19 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 20 - "repairPass"
Cohesion: 0.24
Nodes (20): compositionSatisfies(), fillDayPass(), hasSenior(), repairPass(), assignCell(), backfillVacated(), chainUnfilledSlot(), compositionStillSatisfied() (+12 more)

### Community 21 - "parseVacationWorkbook"
Cohesion: 0.16
Nodes (14): extractVacationDateCells(), findVacationSections(), pickFile(), matchLectureRosterName(), matchVacationRoster(), parseLectureImportDate(), parseLectureImportText(), parseVacationDateRange() (+6 more)

### Community 22 - "ScheduleGrid"
Cohesion: 0.18
Nodes (18): checkGenerateReadiness(), updateBlockTracked(), ScheduleGrid(), applySweepCandidate(), assign(), commitDrop(), handleDrop(), lockAllAssigned() (+10 more)

### Community 23 - "formatDisplayDate"
Cohesion: 0.10
Nodes (22): AvailabilityRangesEditor(), AYConferenceEditor(), BlockCalendarRow(), BlockCalendarSection(), BlockContextBar(), BlockMonthGrid(), CoverageByAreaView(), CoverageByDateView() (+14 more)

### Community 24 - "scheduleQuality.js"
Cohesion: 0.19
Nodes (13): applyTraumaClampAndDow(), getCoverageFor(), twelveHourStateFor(), assignedCount(), betterQuality(), computeQualityMetrics(), groupedSpread(), groupKey() (+5 more)

### Community 25 - "sbFetch"
Cohesion: 0.25
Nodes (9): FeedbackWidget(), handleSubmit(), reset(), openDemoModal(), sbDeleteState(), sbFetch(), sbLoadState(), clearAll() (+1 more)

### Community 26 - "calendarGrid.js"
Cohesion: 0.39
Nodes (7): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), MonthCalendarView, ScheduleCalendarView(), useMonthPager()

### Community 27 - "isConferenceAwayFor"
Cohesion: 0.29
Nodes (7): conferenceAwayPgys(), conferenceDefs(), flexWellnessSubstituteAllowed(), getConferencesInBlock(), isConferenceAwayFor(), podWellnessSubstituteAllowed(), seniorWellnessSubstituteAllowed()

### Community 28 - "updateBlock"
Cohesion: 0.10
Nodes (26): DATES6, computeTotalTargetDemand(), DashboardTab(), onStartDateChange(), setBlockField(), updSD(), dateInRanges(), effectiveChiefRole() (+18 more)

### Community 29 - "exportResidentCalendarPDF"
Cohesion: 0.28
Nodes (13): demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), pdfDemoBanner(), pdfPageFooter(), pdfPageHeader(), pdfSafeText(), pdfSave() (+5 more)

### Community 30 - "overrideCapture.test.js"
Cohesion: 0.29
Nodes (5): REPORT, diffScheduleCells(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "baselineSuite.js"
Cohesion: 0.23
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

### Community 36 - "coverageComposition.js"
Cohesion: 0.33
Nodes (6): bucketLabel(), composeCoverage(), COVERAGE_GROUPS, groupForCategory(), CoverageTab(), CoverageTotalsView()

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 39 - "rollingWindowHours.test.js"
Cohesion: 0.40
Nodes (4): maxRollingWindowHoursFor(), ROLLING_WINDOW_CAP_H, ROLLING_WINDOW_MS, weeklyHourStats()

### Community 40 - "SidebarNav"
Cohesion: 0.33
Nodes (7): CollapsibleCard(), reconcileTabOrder(), reorderIds(), SidebarNav(), renderTabButton(), resetDrag(), useUiPrefsContext()

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 46 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

## Knowledge Gaps
- **138 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+133 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ResidentScheduler()` connect `ResidentScheduler` to `ResidentScheduler.jsx`, `AppGate.jsx`, `add`, `parseDate`, `getEligibleShifts`, `syntheticRoster.js`, `ShiftMatrixTab`, `shifts.js`, `pedNightMigration.test.js`, `migratePedsPgy1ToPgy2`, `deepEqualNormalized`, `ScheduleGrid`, `formatDisplayDate`, `sbFetch`, `updateBlock`, `exportResidentCalendarPDF`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `ScheduleGrid()` connect `ScheduleGrid` to `ResidentScheduler.jsx`, `add`, `parseDate`, `ResidentScheduler`, `getEligibleShifts`, `SidebarNav`, `formatDisplayDate`, `scheduleQuality.js`, `updateBlock`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `computeQualityMetrics()` connect `scheduleQuality.js` to `baselineSuite.js`, `generator.harness.test.js`, `ResidentScheduler.jsx`, `parseDate`, `Generator Quality Harness (best-of-N + repair)`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `ResidentScheduler()` (e.g. with `isSchedulable()` and `onKeyDown()`) actually correct?**
  _`ResidentScheduler()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _138 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.019604182225541448 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._