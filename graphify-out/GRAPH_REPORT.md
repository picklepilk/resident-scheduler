# Graph Report - resident-scheduler  (2026-08-19)

## Corpus Check
- 92 files · ~199,029 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 922 nodes · 2019 edges · 75 communities (60 shown, 15 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d127a978`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ResidentScheduler.jsx
- generator.harness.test.js
- dependencies
- RequestsTab.jsx
- DashboardTab
- coverage.js
- parseDate
- ScheduleGrid
- Plan: Close the schedule-quality gap blocking cutover
- Resident Day-Off Request Implementation Plan
- prettyDate
- ResidentForm
- getEligibleShifts
- Act 3 — Build (Claude; Codex review never ran)
- User Feedback + Admin Portal Implementation Plan
- ResidentScheduler
- parseVacationWorkbook
- parse.js
- getEligibleShifts
- AppGate.jsx (whole-app login/role gate)
- profiles.role (pending/resident/admin)
- LEGACY_DAY_RULE_DEFAULTS / LEGACY_ELIGIBILITY_DEFAULTS
- overrideCapture.test.js
- generateSchedule
- generateScheduleBest() (20-attempt best-of-N)
- ResidentScheduler.jsx (~8300 line scheduling engine)
- validateAll
- checkCircadianViolations
- JC_MAX_PER_AY (3)
- jspdf-autotable@3.8.4
- SHIFTS (shift catalog)
- scoreWeights.test.js
- getEligibleShifts
- parseHomeResidentMatrix
- supabaseClient.js (AUTH_ENABLED, shared client)
- RulesTab
- em-scheduler (sibling app, same author/domain)
- getEffectiveEligibility
- Field-Ready Design System
- SidebarNav
- sbFetch
- getTraumaCap
- FeedbackAdminTab
- JeopardyTab
- computeCoverageByDate
- migrate_add_pending_approval.sql
- .mcp.json
- UserGuideTab
- vite.config.js
- Caveman Terse-Response Mode (Cline rule)
- Caveman Terse-Response Mode (Copilot rule)
- Caveman Terse-Response Mode (OpenCode rule)
- Caveman Terse-Response Mode (Windsurf rule)
- Caveman Terse-Response Mode (top-level AGENTS.md)
- ayWindowFor(ayString)
- DEMO_MODE_KEY (res_demo_mode)
- migrate_lock_request_identity_columns.sql
- dbReady gate
- getEffectiveEligibility
- uuid
- ShiftMatrixTab
- getBlockProgress
- windowOverlapsShiftHours
- inferGroupPgy

## God Nodes (most connected - your core abstractions)
1. `parseDate()` - 71 edges
2. `validateAll()` - 63 edges
3. `toDateStr()` - 45 edges
4. `addDays()` - 37 edges
5. `formatDisplayDate()` - 34 edges
6. `getBlockDates()` - 31 edges
7. `generateSchedule()` - 30 edges
8. `getEligibleShifts()` - 25 edges
9. `ResidentScheduler()` - 22 edges
10. `ScheduleGrid()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `exportMatrixPDF()` --references--> `jspdf`  [EXTRACTED]
  src/ResidentScheduler.jsx → package.json
- `exportResidentCalendarPDF()` --references--> `jspdf`  [EXTRACTED]
  src/ResidentScheduler.jsx → package.json
- `pdfDemoBanner()` --references--> `jspdf`  [EXTRACTED]
  src/ResidentScheduler.jsx → package.json
- `pdfPageFooter()` --references--> `jspdf`  [EXTRACTED]
  src/ResidentScheduler.jsx → package.json
- `pdfPageHeader()` --references--> `jspdf`  [EXTRACTED]
  src/ResidentScheduler.jsx → package.json

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Cloud sync save/load/suspend coordination flow** — claude_sbfetch, claude_sbloadstate, claude_sbsavestate, claude_sbdeletestate, claude_dbready, claude_syncsuspended, claude_savecloudnow, claude_flushpendingcloudsave, claude_savepromiseref, claude_syncbindings [EXTRACTED 0.90]
- **Demo Sandbox enter/exit/resume/delete lifecycle** — claude_enterdemofresh, claude_enterdemoresume, claude_exitdemo, claude_deletedemo, claude_opendemomodal, claude_physkey, claude_demo_mode_key, claude_res_state_demo_row_id [EXTRACTED 0.90]
- **Generator quality harness: best-of-N + repair pass pipeline** — claude_generateschedule, claude_generateschedulebest, claude_mulberry32, claude_computequalitymetrics, claude_betterquality, claude_repair_pass, claude_narrowforseniority, claude_qualitybaseline_json [EXTRACTED 0.90]
- **Caveman terse-response rule duplicated across every AI tool config in this repo** — _clinerules_caveman_caveman_mode, _github_copilot_instructions_caveman_mode, _opencode_agents_caveman_mode, _windsurf_rules_caveman_caveman_mode, agents_caveman_mode [INFERRED 0.85]
- **End-to-end day-off request flow: resident submission through chief approval into the schedule** — docs_superpowers_plans_2026_07_18_resident_day_off_requests_task7_request_form, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task10_approval_queue, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task11_pending_badge [INFERRED 0.85]
- **Feedback capture-to-triage pipeline: widget/crash capture write, admin function/tab read** — docs_superpowers_plans_2026_07_18_user_feedback_plan_task1_schema_helper, docs_superpowers_plans_2026_07_18_user_feedback_plan_task2_widget, docs_superpowers_plans_2026_07_18_user_feedback_plan_task3_crash_capture, docs_superpowers_plans_2026_07_18_user_feedback_plan_task4_admin_function, docs_superpowers_plans_2026_07_18_user_feedback_plan_task5_admin_tab [INFERRED 0.85]

## Communities (75 total, 15 thin omitted)

### Community 0 - "ResidentScheduler.jsx"
Cohesion: 0.02
Nodes (72): RFC-4180, RFC-5545, BASE_ELIGIBILITY, BLOCK_TARGETS, BLOCK_TYPE_MAP, BLOCK_TYPES_EM, blockTypeFilterPasses(), BUTTON_SIZES (+64 more)

### Community 1 - "generator.harness.test.js"
Cohesion: 0.07
Nodes (35): baselinePath(), captureFor(), captureOnce(), compareWithTolerance(), __dirname, errorCount(), loadBaseline(), makeBaselineSuite() (+27 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (44): autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jsdom, jspdf-autotable, lucide-react, dependencies (+36 more)

### Community 3 - "RequestsTab.jsx"
Cohesion: 0.09
Nodes (32): AppGate(), crashKey(), ErrorBoundary, reportCrash(), AdminManagement(), ApprovalQueue(), RequestsTab(), ViewAsPanel() (+24 more)

### Community 4 - "DashboardTab"
Cohesion: 0.10
Nodes (28): jspdf, jspdf, DATES6, AvailabilityRangesEditor(), dateInRanges(), DateListEditor(), demoFilenameSuffix(), DragConfirmModal() (+20 more)

### Community 5 - "coverage.js"
Cohesion: 0.07
Nodes (47): applyTraumaClampAndDow(), AREA_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, getCoverageFor() (+39 more)

### Community 6 - "parseDate"
Cohesion: 0.07
Nodes (96): resident(), addDays(), ayWindowFor(), formatAY(), getAcademicYearFor(), getBlockDates(), getBlockWeekends(), parseDate() (+88 more)

### Community 7 - "ScheduleGrid"
Cohesion: 0.20
Nodes (15): admin_email_allowlist, day_off_requests, day_off_requests_cancel_guard, day_off_requests_identity_guard, profiles, profiles_admin_allowlist_promote, profiles_resident_id_immutable, profiles_role_change_guard (+7 more)

### Community 8 - "Plan: Close the schedule-quality gap blocking cutover"
Cohesion: 0.15
Nodes (12): Approach, Context, Key decisions & tradeoffs, Out of scope, Phase 0 — `score()` priority audit *(prerequisite, not a peer)*, Phase 1 — Generalized shape scoring *(kills "fixed bad sequences")*, Phase 2 — AY-to-date fairness carryover *(kills "rebalanced who got hammered")*, Phase 3 — Override-capture loop *(attacks the root of "moved shifts off specific residents")* (+4 more)

### Community 9 - "Resident Day-Off Request Implementation Plan"
Cohesion: 0.16
Nodes (22): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+14 more)

### Community 10 - "prettyDate"
Cohesion: 0.18
Nodes (14): bucketLabel(), AYConferenceEditor(), BlockCalendarRow(), BlockCalendarSection(), BlockContextBar(), BlockMonthGrid(), CoverageByAreaView(), CoverageByDateView() (+6 more)

### Community 11 - "ResidentForm"
Cohesion: 0.15
Nodes (12): react, react, DEFAULT_UI_PREFS, normalizeUiPrefs(), containers, mountHook(), VIEWER, NOOP_UI_PREFS (+4 more)

### Community 12 - "getEligibleShifts"
Cohesion: 0.39
Nodes (7): monthDates(), monthsInRange(), paddedCalendarWeeks(), sameMonth(), ScheduleCalendarView(), SHIFT_ORDER_INDEX, useMonthPager()

### Community 13 - "Act 3 — Build (Claude; Codex review never ran)"
Cohesion: 0.18
Nodes (10): Act 1 summary — what the grill settled, Act 3 — Build (Claude; Codex review never ran), Not verified, Phase 0 — score() priority audit — SHIPPED AS AUDIT ONLY, NO BEHAVIOR CHANGE, Phase 1 — Generalized work-shape scoring — SHIPPED, Phase 2 — AY-to-date fairness carryover — SHIPPED, Phase 3 — Override capture — SHIPPED, Plan Review Log: Close the schedule-quality gap blocking cutover (+2 more)

### Community 14 - "User Feedback + Admin Portal Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 15 - "ResidentScheduler"
Cohesion: 0.50
Nodes (4): compositionSatisfies(), flexWellnessSubstituteAllowed(), podWellnessSubstituteAllowed(), seniorWellnessSubstituteAllowed()

### Community 16 - "parseVacationWorkbook"
Cohesion: 0.18
Nodes (13): extractVacationDateCells(), findVacationSections(), matchLectureRosterName(), matchVacationRoster(), parseLectureImportDate(), parseLectureImportText(), parseVacationDateRange(), parseVacationWorkbook() (+5 more)

### Community 17 - "parse.js"
Cohesion: 0.13
Nodes (25): getAcademicYear(), appendImportLog(), normalizeImportLog(), CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, matchCategory(), normalizeToken() (+17 more)

### Community 18 - "getEligibleShifts"
Cohesion: 0.23
Nodes (12): Cloud-op-succeeds-before-local-wipe/write discipline (avoid stale mount overlay reverting), Demo Sandbox feature, enterDemoFresh(), LS_BACKUP_KEYS, physKey() / demoPhysKey(), res_dark_mode (device-local, excluded from backup), RES_STATE_DEMO_ROW_ID, SettingsTab.clearAll() (+4 more)

### Community 19 - "AppGate.jsx (whole-app login/role gate)"
Cohesion: 0.22
Nodes (11): AppGate.jsx (whole-app login/role gate), LoginScreen, main.jsx (route split), migrate_block_pending_account_access.sql, Confirmed hole: pending role checked client-side only, enabled impersonation via /requests, RequestForm, RequestList, ResidentPicker (+3 more)

### Community 20 - "profiles.role (pending/resident/admin)"
Cohesion: 0.06
Nodes (33): admin_email_allowlist table, apply_admin_allowlist trigger, day_off_requests.sql (fresh-install baseline), DAY_RULE_DEFAULTS_CHANGED badge derivation, EM_HOME_2 EM/EMS<->EM/TOX weekday-window swap on 2026-08-01, enforce_cancel_only_status trigger, enforce_profile_role_change_rules trigger, enforce_request_identity_immutable trigger (+25 more)

### Community 21 - "LEGACY_DAY_RULE_DEFAULTS / LEGACY_ELIGIBILITY_DEFAULTS"
Cohesion: 0.20
Nodes (10): checkGenerateReadiness(), DAY_RULE_DEFAULTS_CHANGED, describeDayRules(), describeShiftGates(), eligKey(), getJCPresenterGaps(), getMissingSpecialDayLists(), jcPresentersFor() (+2 more)

### Community 22 - "overrideCapture.test.js"
Cohesion: 0.29
Nodes (5): REPORT, diffScheduleCells(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 23 - "generateSchedule"
Cohesion: 0.40
Nodes (6): Chief roles (chiefRole: academic/admin/scheduling), getEligibleShifts(), Off-service residents availability (isAvailableOnDate), PED-N (Peds Night) eligibility rule, PED-S (Peds Swing) shift, SHIFT_DOW

### Community 24 - "generateScheduleBest() (20-attempt best-of-N)"
Cohesion: 0.22
Nodes (8): computeQualityMetrics() / computeQualityVector(), generateScheduleBest() (20-attempt best-of-N), mulberry32() seeded RNG, narrowForSeniority() / podStillSatisfied(), Empirical testing showed repair could place junior into PGY-3-less POD slot or free a shift's only qualifying PGY-3 without narrowing checks, Bounded repair pass (repair:true option, 3 phases), src/lib/rng.js, src/lib/scheduleQuality.js

### Community 25 - "ResidentScheduler.jsx (~8300 line scheduling engine)"
Cohesion: 0.20
Nodes (10): exportMatrixPDF(), jspdf, jspdf-autotable@3.8.4, jspdf-autotable default-export interop bug under esbuild/Rollup, lucide-react icons, React 19, ResidentScheduler.jsx (~8300 line scheduling engine), Vite 6 (+2 more)

### Community 26 - "validateAll"
Cohesion: 0.29
Nodes (7): BAMC residents schedulable by default (isSchedulable EM fallback), fillDayPass(ds, includeShift, phase), FLEX soft / POD hard seniority rule, Grand Rounds lecture dates rule, isSchedulable(), SENIOR_COMPOSITION (FLEX/POD), validateAll()

### Community 28 - "JC_MAX_PER_AY (3)"
Cohesion: 0.25
Nodes (7): checkGenerateReadiness(), countPublishedJC() / countCurrentBlockJC(), JC_MAX_PER_AY (3), Journal Club rule (first-Tuesday, 3/AY cap, published-only counting), JournalClubPlanner, ReadinessWarningPanel, shiftOverlapsJC(sid)

### Community 29 - "jspdf-autotable@3.8.4"
Cohesion: 0.25
Nodes (7): cellViolations() (shared picker + drag-drop aggregator), Real 8-day-straight scheduling bug from shift-less GR day counting as day off, generateSchedule(), isStreakWorkDay() / grWorkDow / runLengthIfWorked(), MAX_CONSECUTIVE_WORK_DAYS = 6 (ACGME rule), Cached candidate pool went stale mid-day, caused double-booking (fixed by recomputing per slot), Vacation as distinct hard-off concept (vacationDates[])

### Community 30 - "SHIFTS (shift catalog)"
Cohesion: 0.25
Nodes (8): prettyDate() formatter (UI display, 2-digit year), QGenda CSV export (Start/End derived from SHIFT_TIMING), qgendaDate() formatter (src/lib/dates.js), SHIFT_AREAS, SHIFT_MAP, SHIFT_TIMING, SHIFT_TYPES, SHIFTS (shift catalog)

### Community 31 - "scoreWeights.test.js"
Cohesion: 0.40
Nodes (5): bandOf(), groupBand(), preferenceKeys, structuralKeys, SCORE_TIERS

### Community 32 - "getEligibleShifts"
Cohesion: 0.29
Nodes (7): Peds Wednesdays off (advocacy feature removed), RULE_NOTES prose constants, Temporal-dead-zone bug warning for top-level const ordering, TRAUMA_PEDS_SPLIT (trauma:8, peds:11), traumaPedsHalf() / isTraumaPedsSplitResident(), Wellness Wednesdays rule, Prior bug: Schedule grid cell-eligibility call omitted ctx, silently no-op'd Wellness Wednesday/Peds-Trauma split

### Community 33 - "parseHomeResidentMatrix"
Cohesion: 0.52
Nodes (4): computeBuyDownsApplied(), computeJeopardyTotals(), computeLedger(), JeopardySickCallsCard()

### Community 34 - "supabaseClient.js (AUTH_ENABLED, shared client)"
Cohesion: 0.33
Nodes (6): AUTH_ENABLED flag, auth_hook_domain_restriction.sql, Domain restriction dashboard hook left unwired (unenforced) incident, Dev-fallthrough vs production-fails-closed asymmetry for missing auth env vars, restrict_signup_domain(event) function, supabaseClient.js (AUTH_ENABLED, shared client)

### Community 36 - "em-scheduler (sibling app, same author/domain)"
Cohesion: 0.18
Nodes (13): Known accepted gap: residents-never-see-schedule is UI-enforced only, blockLookup.js, Dark mode (index.css override sheet, not Tailwind dark: variants), Physical-key isolation, not mode-check-in-shared-code (discipline enforced per call site), em-scheduler (sibling app, same author/domain), netlify/functions/feedback-admin.js, feedback Supabase table, Last-write-wins / full-document-overwrite conflict handling (accepted tradeoff) (+5 more)

### Community 37 - "getEffectiveEligibility"
Cohesion: 0.29
Nodes (8): betterQuality() lexicographic comparator, checkCircadianViolations(), GR_START_HOUR (08:00), grRestGapH(), isNightOnlyResident() (FM-3 exemption), NIGHT_RULES (minRun/idealRun/maxRun 4-6-6), Lexicographic tuple comparison chosen over weighted scalar (scalar let low-priority rule outrank high-priority at large magnitude), Soft Rule Priority (appSettings.rulePriority)

### Community 38 - "Field-Ready Design System"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 39 - "SidebarNav"
Cohesion: 0.50
Nodes (4): CollapsibleCard(), reconcileTabOrder(), SidebarNav(), useUiPrefsContext()

### Community 40 - "sbFetch"
Cohesion: 0.10
Nodes (18): BLOCK_SCOPED_TABS, buildSnapData(), CHANGELOG, deepEqualNormalized(), EXPORT_BLOCKING_RULE_IDS, LS_BACKUP_KEYS, migratePedNightAssignments(), migratePedsPgy1ToPgy2() (+10 more)

### Community 41 - "getTraumaCap"
Cohesion: 0.60
Nodes (4): profiles, profiles_admin_role_only_update_guard, public.enforce_admin_role_only_update(), public.is_admin()

### Community 42 - "FeedbackAdminTab"
Cohesion: 0.67
Nodes (3): fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 43 - "JeopardyTab"
Cohesion: 0.25
Nodes (6): deleteDemo(), flushPendingCloudSave(), saveCloudNow(), savePromiseRef, sbDeleteState(), sbSaveState()

### Community 44 - "computeCoverageByDate"
Cohesion: 0.25
Nodes (8): BlockCalendarSection (Dashboard year-timeline), computeCoverageByDate(), Dashboard/Home merge (Home tab removed), getCoverageFor(), normalizeCoverageEntry(), reconcileTabOrder(), StatCard component, Treat all backup/cloud/hand-edited localStorage as untrusted shape

### Community 45 - "migrate_add_pending_approval.sql"
Cohesion: 0.67
Nodes (3): profiles, profiles_role_change_guard, public.enforce_profile_role_change_rules()

### Community 48 - "UserGuideTab"
Cohesion: 0.67
Nodes (3): GUIDE_SECTIONS, TABS, UserGuideTab()

### Community 68 - "dbReady gate"
Cohesion: 0.33
Nodes (6): AutosaveIndicator pill, dbReady gate, demoCheckGenRef (probe generation counter), openDemoModal(), sbLoadState(), SidebarNav component

### Community 69 - "getEffectiveEligibility"
Cohesion: 0.50
Nodes (4): eligBaseFor(), eligCategoryList(), getEffectiveEligibility(), stripPedGuardedShifts()

### Community 70 - "uuid"
Cohesion: 0.67
Nodes (3): AddResidentModal(), makeImportLogEntry(), uuid()

### Community 71 - "ShiftMatrixTab"
Cohesion: 0.27
Nodes (16): applyEligibilityDiff(), applyLegacyShiftIdRenames(), backfillLaterAddedShiftIds(), cleanIds(), eligibilityDiff(), isEligibilityDiff(), isEligibilityDiffEmpty(), LEGACY_SHIFT_ID_RENAMES (+8 more)

## Knowledge Gaps
- **175 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+170 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `ResidentForm`, `DashboardTab`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `jspdf` connect `DashboardTab` to `dependencies`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `validateAll()` (e.g. with `resident()` and `isEmIntern()`) actually correct?**
  _`validateAll()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `formatDisplayDate()` (e.g. with `exportMatrixPDF()` and `ImportVacationModal()`) actually correct?**
  _`formatDisplayDate()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _175 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ResidentScheduler.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.01904761904761905 - nodes in this community are weakly interconnected._
- **Should `generator.harness.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._