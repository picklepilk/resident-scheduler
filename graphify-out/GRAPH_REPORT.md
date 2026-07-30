# Graph Report - .  (2026-07-29)

## Corpus Check
- 1 files · ~104,421 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 515 nodes · 898 edges · 49 communities (36 shown, 13 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Root App Shell & Constants
- Auth Gate & Role Routing
- Rule Engine & Validation
- Resident Tab & Day Rules Editor
- Day-Off Request RLS & Admin Allowlist
- Date & Shift Catalog Helpers
- Cloud Sync & Backup Keys
- NPM UI/Font Dependencies
- NPM Build Tooling Dependencies
- Day-Off Request Feature Plan
- User Feedback Widget & Admin Portal
- Master Matrix Import Parsing
- Roster & Category Parsing
- Block Calendar & Week Views
- Coverage Min/Max Rules
- Dashboard Block Calendar Section
- Shift Catalog & Journal Club Overlap
- Vacation Import Parsing
- Lecture/Vacation Name Matching
- Design System Tokens
- Dashboard Block Progress
- Profile Role-Change Guard
- Peds Shift Eligibility
- Signup Domain Restriction
- Settings Tab Misc Helpers
- ICS Calendar Export
- Feedback Admin Fetch Helpers
- User Guide Tab
- Consecutive-Workday Streak Rule
- Night-Run Length Helpers
- Sidebar Tab Reordering
- Request Identity Immutability
- MCP Supabase Config
- Vite Config
- Caveman Rule (Cline)
- Caveman Rule (Copilot)
- Caveman Rule (OpenCode)
- Caveman Rule (Windsurf)
- Caveman Rule (AGENTS.md)
- Cancel-Only Status Guard
- Request Identity Guard
- Resident ID Immutability Guard
- POD Mon/Tue Coverage Override

## God Nodes (most connected - your core abstractions)
1. `validateAll()` - 33 edges
2. `formatDisplayDate()` - 22 edges
3. `getEligibleShifts()` - 17 edges
4. `generateSchedule()` - 17 edges
5. `Resident Day-Off Request Implementation Plan` - 14 edges
6. `ResidentScheduler()` - 14 edges
7. `checkCircadianViolations()` - 12 edges
8. `isSchedulable()` - 12 edges
9. `prettyDate()` - 9 edges
10. `Task 5: Resident App Shell, Routing & Magic-Link Login` - 8 edges

## Surprising Connections (you probably didn't know these)
- `ImportVacationModal()` --semantically_similar_to--> `parseRosterText`  [INFERRED] [semantically similar]
  src/ResidentScheduler.jsx → CLAUDE.md
- `parseSequentialDateRange()` --semantically_similar_to--> `parseDateRangeInAY`  [INFERRED] [semantically similar]
  src/ResidentScheduler.jsx → CLAUDE.md
- `generateSchedule()` --calls--> `fillDayPass`  [EXTRACTED]
  src/ResidentScheduler.jsx → CLAUDE.md
- `Public repo: no real names/PII/emails rule` --rationale_for--> `ImportMatrixModal()`  [EXTRACTED]
  CLAUDE.md → src/ResidentScheduler.jsx
- `xlsx (SheetJS CDN tarball dependency)` --conceptually_related_to--> `ImportMatrixModal()`  [INFERRED]
  CLAUDE.md → src/ResidentScheduler.jsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Caveman terse-response rule duplicated across every AI tool config in this repo** — _clinerules_caveman_caveman_mode, _github_copilot_instructions_caveman_mode, _opencode_agents_caveman_mode, _windsurf_rules_caveman_caveman_mode, agents_caveman_mode [INFERRED 0.85]
- **Cloud Sync Flow** — src_residentscheduler_sbfetch, src_residentscheduler_syncbindings, src_residentscheduler_dbready, src_residentscheduler_res_state_table, src_residentscheduler_ls_backup_keys [INFERRED 0.85]
- **RLS Column-Level Scoping Triggers** — enforce_profile_role_change_rules_trigger, enforce_cancel_only_status_trigger, enforce_request_identity_immutable_trigger, enforce_resident_id_immutable_trigger, apply_admin_allowlist_trigger [EXTRACTED 1.00]
- **Soft Rule Priority System** — src_residentscheduler_rulepriority, src_residentscheduler_soft_rules, concept_coverage_min_max, src_residentscheduler_senior_composition, src_residentscheduler_checkcircadianviolations [INFERRED 0.80]
- **End-to-end day-off request flow: resident submission through chief approval into the schedule** — docs_superpowers_plans_2026_07_18_resident_day_off_requests_task7_request_form, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task10_approval_queue, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task11_pending_badge [INFERRED 0.85]
- **Feedback capture-to-triage pipeline: widget/crash capture write, admin function/tab read** — docs_superpowers_plans_2026_07_18_user_feedback_plan_task1_schema_helper, docs_superpowers_plans_2026_07_18_user_feedback_plan_task2_widget, docs_superpowers_plans_2026_07_18_user_feedback_plan_task3_crash_capture, docs_superpowers_plans_2026_07_18_user_feedback_plan_task4_admin_function, docs_superpowers_plans_2026_07_18_user_feedback_plan_task5_admin_tab [INFERRED 0.85]

## Communities (49 total, 13 thin omitted)

### Community 0 - "Root App Shell & Constants"
Cohesion: 0.03
Nodes (37): RFC-5545, netlify.toml, BASE_ELIGIBILITY, BLOCK_TARGETS, BLOCK_TYPE_MAP, BLOCK_TYPES_EM, BUTTON_SIZES, BUTTON_VARIANTS (+29 more)

### Community 1 - "Auth Gate & Role Routing"
Cohesion: 0.08
Nodes (34): Resident Request Portal card (QR code), User Feedback Design Spec (2026-07-18), feedback table (Supabase), AppGate(), crashKey(), ErrorBoundary, reportCrash(), AdminManagement() (+26 more)

### Community 2 - "Rule Engine & Validation"
Cohesion: 0.06
Nodes (55): Chief roles (academic/admin/scheduling), EM_HOME_2 EM/EMS <-> EM/TOX weekday window swap (2026-08-01), Temporal-dead-zone bug with top-level consts, Trauma/Peds 8/11 split rationale, Wellness Wednesdays, blockDayIndex(), blockTypeFilterPasses(), cellViolations() (+47 more)

### Community 3 - "Resident Tab & Day Rules Editor"
Cohesion: 0.07
Nodes (40): BAMC residents schedulable by default, jspdf-autotable v3.8.4 interop fix, AddResidentModal(), AvailabilityRangesEditor(), checkGenerateReadiness(), DAY_RULE_DEFAULTS_CHANGED, describeDayRules(), describeShiftGates() (+32 more)

### Community 4 - "Day-Off Request RLS & Admin Allowlist"
Cohesion: 0.10
Nodes (25): admin_email_allowlist table, apply_admin_allowlist, Public repo: no real names/PII/emails rule, enforce_profile_role_change_rules, profiles.role, is_admin() SECURITY DEFINER helper, admin_email_allowlist, day_off_requests (+17 more)

### Community 5 - "Date & Shift Catalog Helpers"
Cohesion: 0.18
Nodes (21): addDays(), ayWindowFor(), formatAY(), getAcademicYear(), getAcademicYearFor(), getBlockDates(), getBlockWeekends(), parseDate() (+13 more)

### Community 6 - "Cloud Sync & Backup Keys"
Cohesion: 0.10
Nodes (24): Dark mode, em-scheduler sibling project, BLOCK_SCOPED_TABS, buildSnapData(), cloudBaselineRef, dbReady, deepEqualNormalized(), EXPORT_BLOCKING_RULE_IDS (+16 more)

### Community 7 - "NPM UI/Font Dependencies"
Cohesion: 0.08
Nodes (24): @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, dependencies, @fontsource/barlow (+16 more)

### Community 8 - "NPM Build Tooling Dependencies"
Cohesion: 0.09
Nodes (22): autoprefixer, devDependencies, autoprefixer, postcss, tailwindcss, vite, @vitejs/plugin-react, vitest (+14 more)

### Community 9 - "Day-Off Request Feature Plan"
Cohesion: 0.16
Nodes (22): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+14 more)

### Community 10 - "User Feedback Widget & Admin Portal"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 11 - "Master Matrix Import Parsing"
Cohesion: 0.21
Nodes (13): package.json, detectHomeAndOffSheetsByContent(), findDateHeaderRow(), ImportMatrixModal(), inferGroupPgy(), matchBlockType(), parseDateRangeInAY, parseHomeResidentMatrix() (+5 more)

### Community 12 - "Roster & Category Parsing"
Cohesion: 0.35
Nodes (10): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, matchCategory(), normalizeToken(), parseDateRangeInAY(), parseRosterText(), NOTE: CATEGORIES/CAT_MAP/normalizeToken/DATE_RANGE_RE are not in the original ex (+2 more)

### Community 13 - "Block Calendar & Week Views"
Cohesion: 0.22
Nodes (10): AYConferenceEditor(), BlockCalendarRow(), BlockContextBar(), BlockMonthGrid(), buildWeekRows(), coverageDayStatus(), getActiveCoverageShifts(), prettyDate() (+2 more)

### Community 14 - "Coverage Min/Max Rules"
Cohesion: 0.47
Nodes (7): CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, getCoverageFor(), normalizeCoverageEntry()

### Community 15 - "Dashboard Block Calendar Section"
Cohesion: 0.25
Nodes (8): Coverage is min/max, not single number, Dashboard/Home tab merge, BlockCalendarSection(), computeCoverageByDate(), getCoverageFor, isConferenceCoverageDate(), loadBlock, normalizeCoverageEntry

### Community 16 - "Shift Catalog & Journal Club Overlap"
Cohesion: 0.25
Nodes (8): Peds Wednesdays off / advocacy days removed, QGenda CSV Start/End derivation, SHIFT_AREAS, SHIFT_MAP, SHIFT_TIMING, SHIFT_TYPES, shiftOverlapsJC, SHIFTS

### Community 17 - "Vacation Import Parsing"
Cohesion: 0.29
Nodes (7): expandDateRangeInclusive(), extractVacationDateCells(), findVacationSections(), parseVacationDateRange(), parseVacationWorkbook(), stripVacationNameSuffix(), vacationGroupDatesColIdx()

### Community 18 - "Lecture/Vacation Name Matching"
Cohesion: 0.47
Nodes (6): matchLectureRosterName(), matchVacationRoster(), parseLectureImportDate(), parseLectureImportText(), vacTokenSet(), vacTokensIntersect()

### Community 19 - "Design System Tokens"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 20 - "Dashboard Block Progress"
Cohesion: 0.40
Nodes (5): BlockProgressBar(), DashboardTab(), getBlockProgress(), getConferencesInBlock(), getFirstFridaysInBlock()

### Community 21 - "Profile Role-Change Guard"
Cohesion: 0.67
Nodes (3): profiles, profiles_role_change_guard, public.enforce_profile_role_change_rules()

### Community 22 - "Peds Shift Eligibility"
Cohesion: 0.67
Nodes (3): PED-N multi-owner eligibility (FM-3 + EM_HOME Thu-Sun), PED-S (Peds Swing) shift, SHIFT_DOW

### Community 24 - "Settings Tab Misc Helpers"
Cohesion: 0.67
Nodes (3): applyStartDate(), getGeneralPedsTarget(), SettingsTab()

### Community 25 - "ICS Calendar Export"
Cohesion: 0.67
Nodes (3): buildResidentICS(), icsEscape(), icsStamp()

### Community 26 - "Feedback Admin Fetch Helpers"
Cohesion: 0.67
Nodes (3): fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 27 - "User Guide Tab"
Cohesion: 0.67
Nodes (3): GUIDE_SECTIONS, TABS, UserGuideTab()

### Community 28 - "Consecutive-Workday Streak Rule"
Cohesion: 0.67
Nodes (3): isStreakWorkDay(), MAX_CONSECUTIVE_WORK_DAYS, runLengthIfWorked()

### Community 29 - "Night-Run Length Helpers"
Cohesion: 0.67
Nodes (3): nightRun(), nightRunAfter(), nightRunBefore()

### Community 30 - "Sidebar Tab Reordering"
Cohesion: 0.67
Nodes (3): reconcileTabOrder(), reorderIds(), SidebarNav()

## Knowledge Gaps
- **97 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+92 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RequestPortalCard()` connect `NPM UI/Font Dependencies` to `Auth Gate & Role Routing`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `dependencies` connect `NPM UI/Font Dependencies` to `NPM Build Tooling Dependencies`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `formatDisplayDate()` (e.g. with `exportMatrixPDF()` and `ImportVacationModal()`) actually correct?**
  _`formatDisplayDate()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `getEligibleShifts()` (e.g. with `cellViolations()` and `checkCircadianViolations()`) actually correct?**
  _`getEligibleShifts()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _97 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Root App Shell & Constants` be split into smaller, more focused modules?**
  _Cohesion score 0.030303030303030304 - nodes in this community are weakly interconnected._
- **Should `Auth Gate & Role Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.07644110275689223 - nodes in this community are weakly interconnected._