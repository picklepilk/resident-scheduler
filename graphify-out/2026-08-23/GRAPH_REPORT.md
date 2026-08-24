# Graph Report - resident-scheduler  (2026-08-21)

## Corpus Check
- 106 files · ~233,616 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1059 nodes · 2624 edges · 80 communities (59 shown, 21 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ffaafac9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- ResidentScheduler
- dependencies
- RequestsTab.jsx
- shifts.js
- formatDisplayDate
- parseDate
- ScheduleGrid
- renderResidentRow
- Resident Day-Off Request Implementation Plan
- getEligibleShifts
- ShiftMatrixTab
- parse.js
- RulesTab
- src/uiPrefs.js
- Generator Quality Harness (best-of-N + repair)
- getAcademicYearFor
- day_off_requests.sql
- User Feedback + Admin Portal Implementation Plan
- repairPass
- parseVacationWorkbook
- holidays.js
- prettyDate
- getBlockDates
- handleSubmit
- useMonthPager
- nthWeekdayOnOrAfter
- updateBlock
- exportResidentCalendarPDF
- overrideCapture.test.js
- Cloud Sync (Supabase)
- baselineSuite.js
- scoreWeights.test.js
- Circadian Scheduling Rules
- Field-Ready Design System
- validateAll
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
- migrate_lock_request_identity_columns.sql
- Eligibility Overrides as Diff
- .mcp.json
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
- SettingsTab
- windowOverlapsShiftHours
- parseHomeResidentMatrix

## God Nodes (most connected - your core abstractions)
1. `parseDate()` - 92 edges
2. `validateAll()` - 64 edges
3. `ResidentScheduler()` - 53 edges
4. `toDateStr()` - 51 edges
5. `generateSchedule()` - 48 edges
6. `addDays()` - 44 edges
7. `ScheduleGrid()` - 43 edges
8. `formatDisplayDate()` - 40 edges
9. `getBlockDates()` - 37 edges
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
- **Caveman terse-response rule duplicated across every AI tool config in this repo** — _clinerules_caveman_caveman_mode, _github_copilot_instructions_caveman_mode, _opencode_agents_caveman_mode, _windsurf_rules_caveman_caveman_mode, agents_caveman_mode [INFERRED 0.85]
- **End-to-end day-off request flow: resident submission through chief approval into the schedule** — docs_superpowers_plans_2026_07_18_resident_day_off_requests_task7_request_form, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task10_approval_queue, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task11_pending_badge [INFERRED 0.85]
- **Feedback capture-to-triage pipeline: widget/crash capture write, admin function/tab read** — docs_superpowers_plans_2026_07_18_user_feedback_plan_task1_schema_helper, docs_superpowers_plans_2026_07_18_user_feedback_plan_task2_widget, docs_superpowers_plans_2026_07_18_user_feedback_plan_task3_crash_capture, docs_superpowers_plans_2026_07_18_user_feedback_plan_task4_admin_function, docs_superpowers_plans_2026_07_18_user_feedback_plan_task5_admin_tab [INFERRED 0.85]
- **Generator Quality Improvement Program** — claude_md_score_weights_audit, claude_md_work_shape_scoring, claude_md_ay_carryover, claude_md_override_capture [INFERRED 0.85]

## Communities (80 total, 21 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (90): RFC-4180, RFC-5545, AREA_LAST_SHIFT, AY_CONF_DATE_FIELDS, BASE_ELIGIBILITY, BLOCK_SCOPED_TABS, BLOCK_TARGETS, BLOCK_TYPE_MAP (+82 more)

### Community 1 - "ResidentScheduler"
Cohesion: 0.13
Nodes (22): getAcademicYear(), buildSnapData(), makeDefaultBlock(), ResidentScheduler(), blockReset(), deleteCurrentBlock(), doLoadBlock(), doNewBlock() (+14 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (47): autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jsdom, lucide-react, dependencies, @fontsource/barlow (+39 more)

### Community 3 - "RequestsTab.jsx"
Cohesion: 0.06
Nodes (44): AppGate(), SetNewPassword(), crashKey(), ErrorBoundary, reportCrash(), AdminManagement(), residentLabel(), setRole() (+36 more)

### Community 4 - "shifts.js"
Cohesion: 0.07
Nodes (48): applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, DOW_COVERAGE_OVERRIDE (+40 more)

### Community 5 - "formatDisplayDate"
Cohesion: 0.05
Nodes (41): formatAY(), appendImportLog(), IMPORT_LOG_CAP_BYTES, normalizeImportLog(), computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), AddResidentModal() (+33 more)

### Community 6 - "parseDate"
Cohesion: 0.18
Nodes (33): addDays(), parseDate(), toDateStr(), nightRun(), papaBare, sixDayRun(), isNightShiftId(), overlappingAssignments() (+25 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.16
Nodes (23): checkGenerateReadiness(), generateScheduleBest(), deleteBlockSnapshot(), showToast(), updateBlockTracked(), ScheduleGrid(), applySweepCandidate(), assign() (+15 more)

### Community 8 - "renderResidentRow"
Cohesion: 0.12
Nodes (29): formatGapH(), gapIsShort(), shiftGapsFor(), buildResidentICS(), computeTotalTargetDemand(), effectiveChiefRole(), effectiveWellnessWednesdayDate(), eligKey() (+21 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.18
Nodes (21): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+13 more)

### Community 10 - "getEligibleShifts"
Cohesion: 0.08
Nodes (28): acepFixture(), PRE_12H_EM_HOME_2, papaFixture(), buildStandardRoster(), dateRange(), makeBlock(), makeDefaultAppSettings(), makeFixture() (+20 more)

### Community 11 - "ShiftMatrixTab"
Cohesion: 0.12
Nodes (34): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+26 more)

### Community 12 - "parse.js"
Cohesion: 0.24
Nodes (14): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, DATE_RANGE_RE, matchCategory(), normalizeToken(), parseDateRangeInAY(), parseRosterText() (+6 more)

### Community 13 - "RulesTab"
Cohesion: 0.12
Nodes (15): DayRulesEditor(), addGate(), addRestriction(), addSpecialRule(), rmGate(), rmRestriction(), rmSpecialRule(), updGate() (+7 more)

### Community 14 - "src/uiPrefs.js"
Cohesion: 0.15
Nodes (12): DEFAULT_UI_PREFS, normalizeUiPrefs(), containers, mountHook(), Harness(), VIEWER, NOOP_UI_PREFS, readDeviceLocal() (+4 more)

### Community 15 - "Generator Quality Harness (best-of-N + repair)"
Cohesion: 0.16
Nodes (16): AY-to-Date Fairness Carryover, Generator Quality Harness (best-of-N + repair), Override Capture Loop, Pre-Generation Readiness Gate, SCORE_WEIGHTS Tier Audit, Work-Shape Scoring, Quality Baseline Averaging Rework, Codex Review Blocked (Usage Quota) (+8 more)

### Community 16 - "getAcademicYearFor"
Cohesion: 0.44
Nodes (9): getAcademicYearFor(), getFirstTuesdaysInRange(), isFirstTuesday(), isJcDate(), isJcDateAnyAy(), jcDatesInRange(), resolveJcDates(), sortedDedupedDates() (+1 more)

### Community 18 - "day_off_requests.sql"
Cohesion: 0.08
Nodes (21): auth, auth.users, public.apply_admin_allowlist, public.enforce_admin_role_only_update, public.enforce_cancel_only_status, public.enforce_resident_id_immutable, admin_email_allowlist, day_off_requests (+13 more)

### Community 19 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 20 - "repairPass"
Cohesion: 0.33
Nodes (18): compositionSatisfies(), hasSenior(), repairPass(), assignCell(), backfillVacated(), chainUnfilledSlot(), compositionStillSatisfied(), filledCount() (+10 more)

### Community 21 - "parseVacationWorkbook"
Cohesion: 0.16
Nodes (14): extractVacationDateCells(), findVacationSections(), parse(), matchLectureRosterName(), matchVacationRoster(), parseLectureImportDate(), parseLectureImportText(), parseVacationDateRange() (+6 more)

### Community 22 - "holidays.js"
Cohesion: 0.26
Nodes (17): buildHolidayRoster(), countHolidayShifts(), defaultUsHolidays(), expandHolidayDates(), holidayDateSet(), holidayDatesInRange(), holidayNameForDateAnyAy(), holidaysInRange() (+9 more)

### Community 23 - "prettyDate"
Cohesion: 0.13
Nodes (18): bucketLabel(), AYConferenceEditor(), BlockCalendarRow(), BlockCalendarSection(), BlockContextBar(), BlockMonthGrid(), CoverageByAreaView(), CoverageByDateView() (+10 more)

### Community 24 - "getBlockDates"
Cohesion: 0.19
Nodes (15): ayWindowFor(), getBlockDates(), getBlockWeekends(), qgendaDate(), applyDateRangePaint(), paintActionFor(), toggleDateInList(), nightSpreadFor() (+7 more)

### Community 25 - "handleSubmit"
Cohesion: 1.00
Nodes (3): FeedbackWidget(), handleSubmit(), reset()

### Community 26 - "useMonthPager"
Cohesion: 0.28
Nodes (10): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), containers, Harness(), mountPager(), Harness() (+2 more)

### Community 27 - "nthWeekdayOnOrAfter"
Cohesion: 0.29
Nodes (8): conferenceAwayPgys(), conferenceDefs(), flexWellnessSubstituteAllowed(), getConferencesInBlock(), isConferenceAwayFor(), nthWeekdayOnOrAfter(), podWellnessSubstituteAllowed(), seniorWellnessSubstituteAllowed()

### Community 28 - "updateBlock"
Cohesion: 0.11
Nodes (22): DATES6, DashboardTab(), onStartDateChange(), setBlockField(), updSD(), dateInRanges(), EMResidentsTab(), removeRes() (+14 more)

### Community 29 - "exportResidentCalendarPDF"
Cohesion: 0.35
Nodes (11): demoFilenameSuffix(), exportMatrixPDF(), exportResidentCalendarPDF(), offRequestEntryFor(), pdfDemoBanner(), pdfPageFooter(), pdfPageHeader(), pdfSafeText() (+3 more)

### Community 30 - "overrideCapture.test.js"
Cohesion: 0.40
Nodes (3): REPORT, diffScheduleCells(), withOverrideEvents()

### Community 31 - "Cloud Sync (Supabase)"
Cohesion: 0.33
Nodes (6): Cloud Sync (Supabase), Demo Sandbox, PWA HTML Shell, Apple Touch Icon, 192px App Icon, 512px App Icon

### Community 32 - "baselineSuite.js"
Cohesion: 0.12
Nodes (24): baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname, errorCount(), loadBaseline(), makeBaselineSuite() (+16 more)

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
Cohesion: 0.12
Nodes (30): runValidate(), runValidate(), shiftOverlapsJC(), blockDayIndex(), countCurrentBlockJC(), countPublishedJC(), finalSundayOf(), findNextBlockSnapshot() (+22 more)

### Community 37 - "Auth, Roles & Day-Off Requests"
Cohesion: 0.50
Nodes (4): Pre-authorization Email Allowlist, Auth, Roles & Day-Off Requests, Server-side Domain Restriction, RLS as Security Boundary

### Community 38 - "Coverage Min/Max Model"
Cohesion: 0.50
Nodes (4): Coverage Min/Max Model, FLEX/POD Seniority Composition, 12-Hour Shift Windows, Wellness Wednesdays

### Community 40 - "SidebarNav"
Cohesion: 0.33
Nodes (7): CollapsibleCard(), reconcileTabOrder(), reorderIds(), SidebarNav(), renderTabButton(), resetDrag(), useUiPrefsContext()

### Community 42 - "Per-Block Target Overrides (Buy-Downs)"
Cohesion: 0.67
Nodes (3): Chief Roles, Jeopardy & Sick-Call Ledger, Per-Block Target Overrides (Buy-Downs)

### Community 46 - "FeedbackAdminTab"
Cohesion: 0.38
Nodes (7): FeedbackAdminTab(), handleStatusChange(), handleUnlock(), load(), fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 81 - "SettingsTab"
Cohesion: 0.13
Nodes (18): getGeneralPedsTarget(), deleteDemo(), enterDemoFresh(), enterDemoResume(), exitDemo(), flushPendingCloudSave(), openDemoModal(), saveCloudNow() (+10 more)

### Community 89 - "parseHomeResidentMatrix"
Cohesion: 0.38
Nodes (7): findDateHeaderRow(), inferGroupPgy(), matchBlockType(), parseHomeResidentMatrix(), parseHomeResidentMatrixGrouped(), parseSequentialDateRange(), pgyExclusiveRotationIds()

## Knowledge Gaps
- **141 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+136 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ScheduleGrid()` connect `ScheduleGrid` to `ResidentScheduler.jsx`, `shifts.js`, `validateAll`, `parseDate`, `formatDisplayDate`, `renderResidentRow`, `SidebarNav`, `getAcademicYearFor`, `prettyDate`, `getBlockDates`, `updateBlock`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `ResidentScheduler()` connect `ResidentScheduler` to `ResidentScheduler.jsx`, `RequestsTab.jsx`, `shifts.js`, `formatDisplayDate`, `validateAll`, `ScheduleGrid`, `renderResidentRow`, `getEligibleShifts`, `ShiftMatrixTab`, `pedNightMigration.test.js`, `SettingsTab`, `prettyDate`, `getBlockDates`, `updateBlock`, `exportResidentCalendarPDF`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `parseDate()` connect `parseDate` to `ResidentScheduler.jsx`, `shifts.js`, `validateAll`, `formatDisplayDate`, `ScheduleGrid`, `renderResidentRow`, `getEligibleShifts`, `getAcademicYearFor`, `repairPass`, `parseVacationWorkbook`, `holidays.js`, `prettyDate`, `getBlockDates`, `useMonthPager`, `nthWeekdayOnOrAfter`, `updateBlock`, `exportResidentCalendarPDF`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `ResidentScheduler()` (e.g. with `isSchedulable()` and `onKeyDown()`) actually correct?**
  _`ResidentScheduler()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _141 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.017991004497751123 - nodes in this community are weakly interconnected._
- **Should `ResidentScheduler` be split into smaller, more focused modules?**
  _Cohesion score 0.13405797101449277 - nodes in this community are weakly interconnected._