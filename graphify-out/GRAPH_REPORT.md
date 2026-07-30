# Graph Report - .  (2026-07-29)

## Corpus Check
- 48 files · ~104,298 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 515 nodes · 1068 edges · 42 communities (29 shown, 13 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Root App Shell & Constants
- Auth Gate & Role Routing
- Date & Academic-Year Helpers
- NPM Dependencies
- Coverage Rules & Day Restrictions
- Shift Catalog & Circadian Checks
- Schedule Generator & Journal Club
- Day-Off Request RLS & Admin Allowlist
- Day-Off Request Feature Plan
- Cloud Sync & Backup Keys
- User Feedback Widget & Admin Portal
- Master Matrix Import Parsing
- Roster & Category Parsing
- PDF Export & Dark Mode
- Resident Add & Off-Service Tab
- Vacation Import Parsing
- Lecture/Vacation Name Matching
- Design System Tokens
- Profile Role-Change Guard
- Peds Shift Eligibility
- Signup Domain Restriction
- Feedback Admin Fetch Helpers
- User Guide Tab
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
1. `validateAll()` - 43 edges
2. `parseDate()` - 43 edges
3. `generateSchedule()` - 24 edges
4. `formatDisplayDate()` - 23 edges
5. `getEligibleShifts()` - 23 edges
6. `toDateStr()` - 22 edges
7. `addDays()` - 20 edges
8. `checkCircadianViolations()` - 18 edges
9. `ResidentScheduler()` - 14 edges
10. `getBlockDates()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `parseSequentialDateRange()` --semantically_similar_to--> `parseDateRangeInAY`  [INFERRED] [semantically similar]
  src/ResidentScheduler.jsx → CLAUDE.md
- `ImportVacationModal()` --semantically_similar_to--> `parseRosterText`  [INFERRED] [semantically similar]
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

## Communities (42 total, 13 thin omitted)

### Community 0 - "Root App Shell & Constants"
Cohesion: 0.03
Nodes (37): RFC-5545, netlify.toml, BASE_ELIGIBILITY, BLOCK_TARGETS, BLOCK_TYPE_MAP, BLOCK_TYPES_EM, BUTTON_SIZES, BUTTON_VARIANTS (+29 more)

### Community 1 - "Auth Gate & Role Routing"
Cohesion: 0.07
Nodes (37): Resident Request Portal card (QR code), User Feedback Design Spec (2026-07-18), enforce_profile_role_change_rules, feedback table (Supabase), profiles.role, AppGate(), crashKey(), ErrorBoundary (+29 more)

### Community 2 - "Date & Academic-Year Helpers"
Cohesion: 0.08
Nodes (52): Coverage is min/max, not single number, Dashboard/Home tab merge, addDays(), ayWindowFor(), formatAY(), getAcademicYear(), getAcademicYearFor(), getBlockDates() (+44 more)

### Community 3 - "NPM Dependencies"
Cohesion: 0.04
Nodes (44): autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf-autotable, lucide-react, dependencies, @fontsource/barlow (+36 more)

### Community 4 - "Coverage Rules & Day Restrictions"
Cohesion: 0.07
Nodes (39): BAMC residents schedulable by default, Chief roles (academic/admin/scheduling), EM_HOME_2 EM/EMS <-> EM/TOX weekday window swap (2026-08-01), Wellness Wednesdays, CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX (+31 more)

### Community 5 - "Shift Catalog & Circadian Checks"
Cohesion: 0.10
Nodes (35): AREA_COLORS, isNightShiftId(), NOTE: AREA_COLORS is not in the original extraction spec's const list, but SHIFT, SHIFT_AREAS, SHIFT_DOW, SHIFT_MAP, SHIFT_TIMING, SHIFT_TYPES (+27 more)

### Community 6 - "Schedule Generator & Journal Club"
Cohesion: 0.10
Nodes (28): Peds Wednesdays off / advocacy days removed, QGenda CSV Start/End derivation, Temporal-dead-zone bug with top-level consts, Trauma/Peds 8/11 split rationale, shiftOverlapsJC(), countCurrentBlockJC(), countPublishedJC(), countPublishedTraumaNights() (+20 more)

### Community 7 - "Day-Off Request RLS & Admin Allowlist"
Cohesion: 0.11
Nodes (23): admin_email_allowlist table, apply_admin_allowlist, Public repo: no real names/PII/emails rule, is_admin() SECURITY DEFINER helper, admin_email_allowlist, day_off_requests, day_off_requests_cancel_guard, day_off_requests_identity_guard (+15 more)

### Community 8 - "Day-Off Request Feature Plan"
Cohesion: 0.16
Nodes (22): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+14 more)

### Community 9 - "Cloud Sync & Backup Keys"
Cohesion: 0.11
Nodes (21): BLOCK_SCOPED_TABS, buildSnapData(), cloudBaselineRef, dbReady, deepEqualNormalized(), EXPORT_BLOCKING_RULE_IDS, LS_BACKUP_KEYS, makeDefaultBlock() (+13 more)

### Community 10 - "User Feedback Widget & Admin Portal"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 11 - "Master Matrix Import Parsing"
Cohesion: 0.21
Nodes (13): package.json, detectHomeAndOffSheetsByContent(), findDateHeaderRow(), ImportMatrixModal(), inferGroupPgy(), matchBlockType(), parseDateRangeInAY, parseHomeResidentMatrix() (+5 more)

### Community 12 - "Roster & Category Parsing"
Cohesion: 0.32
Nodes (11): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, matchCategory(), normalizeToken(), parseDateRangeInAY(), parseRosterText(), NOTE: CATEGORIES/CAT_MAP/normalizeToken/DATE_RANGE_RE are not in the original ex (+3 more)

### Community 13 - "PDF Export & Dark Mode"
Cohesion: 0.30
Nodes (12): Dark mode, em-scheduler sibling project, jspdf, jspdf-autotable v3.8.4 interop fix, jspdf, exportMatrixPDF(), exportResidentCalendarPDF(), pdfPageFooter() (+4 more)

### Community 14 - "Resident Add & Off-Service Tab"
Cohesion: 0.40
Nodes (6): AddResidentModal(), effectiveChiefRole(), EMResidentsTab(), getShiftTarget(), OffServiceTab(), uuid()

### Community 15 - "Vacation Import Parsing"
Cohesion: 0.33
Nodes (6): extractVacationDateCells(), findVacationSections(), parseVacationDateRange(), parseVacationWorkbook(), stripVacationNameSuffix(), vacationGroupDatesColIdx()

### Community 16 - "Lecture/Vacation Name Matching"
Cohesion: 0.47
Nodes (6): matchLectureRosterName(), matchVacationRoster(), parseLectureImportDate(), parseLectureImportText(), vacTokenSet(), vacTokensIntersect()

### Community 17 - "Design System Tokens"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 18 - "Profile Role-Change Guard"
Cohesion: 0.67
Nodes (3): profiles, profiles_role_change_guard, public.enforce_profile_role_change_rules()

### Community 19 - "Peds Shift Eligibility"
Cohesion: 0.67
Nodes (3): PED-N multi-owner eligibility (FM-3 + EM_HOME Thu-Sun), PED-S (Peds Swing) shift, SHIFT_DOW

### Community 21 - "Feedback Admin Fetch Helpers"
Cohesion: 0.67
Nodes (3): fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 22 - "User Guide Tab"
Cohesion: 0.67
Nodes (3): GUIDE_SECTIONS, TABS, UserGuideTab()

### Community 23 - "Sidebar Tab Reordering"
Cohesion: 0.67
Nodes (3): reconcileTabOrder(), reorderIds(), SidebarNav()

## Knowledge Gaps
- **96 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+91 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `NPM Dependencies` to `PDF Export & Dark Mode`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Why does `jspdf` connect `PDF Export & Dark Mode` to `NPM Dependencies`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `profiles.role` connect `Auth Gate & Role Routing` to `Day-Off Request RLS & Admin Allowlist`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `formatDisplayDate()` (e.g. with `exportMatrixPDF()` and `ImportVacationModal()`) actually correct?**
  _`formatDisplayDate()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `getEligibleShifts()` (e.g. with `cellViolations()` and `checkCircadianViolations()`) actually correct?**
  _`getEligibleShifts()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _96 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Root App Shell & Constants` be split into smaller, more focused modules?**
  _Cohesion score 0.03076923076923077 - nodes in this community are weakly interconnected._