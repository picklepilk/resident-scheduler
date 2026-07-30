# Graph Report - resident-scheduler  (2026-07-27)

## Corpus Check
- 38 files · ~93,339 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 423 nodes · 831 edges · 37 communities (29 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b9e023c7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Scheduler Constants & UI Primitives
- Schedule Generation & Validation Logic
- Auth Gate & Resident Requests App
- Package Dependencies & Build Tooling
- Day-Off Request Feature Plan
- Architecture Notes & Feedback Feature
- Local Storage Persistence & Cloud Sync
- Day-Off Requests DB Schema & RLS
- PDF Export
- Roster & Matrix Import Parsing
- Coverage Rules & Calendar View
- Pre-Generation Readiness Gate
- Design System Documentation
- Resident Management Tabs
- Chief-to-Admin Role Migration
- Circadian & Journal Club Rules (Docs)
- Pending Approval Migration
- Feedback Admin Fetch Helpers
- User Guide Tab
- Sidebar Tab Reordering
- Request Identity Lock Migration
- Supabase MCP Server Config
- Vite Build Config
- Caveman AI Instructions (Cline)
- Caveman AI Instructions (Copilot)
- Caveman AI Instructions (OpenCode)
- Caveman AI Instructions (Windsurf)
- Caveman AI Instructions (Agents.md)

## God Nodes (most connected - your core abstractions)
1. `validateAll()` - 39 edges
2. `parseDate()` - 33 edges
3. `formatDisplayDate()` - 21 edges
4. `getEligibleShifts()` - 19 edges
5. `toDateStr()` - 16 edges
6. `addDays()` - 15 edges
7. `generateSchedule()` - 15 edges
8. `Resident Day-Off Request Implementation Plan` - 14 edges
9. `checkCircadianViolations()` - 13 edges
10. `getBlockDates()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Known Limitation: 'Residents Never See Schedule' is UI-only` --cites--> `Supabase Cloud Sync (res_state, wide-open RLS)`  [EXTRACTED]
  docs/superpowers/specs/2026-07-18-resident-day-off-requests-design.md → CLAUDE.md
- `Vite %VITE_*% HTML Token Injection into window globals` --shares_data_with--> `Supabase Cloud Sync (res_state, wide-open RLS)`  [EXTRACTED]
  index.html → CLAUDE.md
- `Task 10: Chief Approve/Deny Actions (ApprovalQueue)` --references--> `Auth, Roles & RLS Security Model`  [EXTRACTED]
  docs/superpowers/plans/2026-07-18-resident-day-off-requests.md → CLAUDE.md
- `exportMatrixPDF()` --references--> `jspdf`  [EXTRACTED]
  src/ResidentScheduler.jsx → package.json
- `exportResidentCalendarPDF()` --references--> `jspdf`  [EXTRACTED]
  src/ResidentScheduler.jsx → package.json

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Caveman terse-response rule duplicated across every AI tool config in this repo** — _clinerules_caveman_caveman_mode, _github_copilot_instructions_caveman_mode, _opencode_agents_caveman_mode, _windsurf_rules_caveman_caveman_mode, agents_caveman_mode [INFERRED 0.85]
- **End-to-end day-off request flow: resident submission through chief approval into the schedule** — docs_superpowers_plans_2026_07_18_resident_day_off_requests_task7_request_form, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task10_approval_queue, claude_auth_roles, docs_superpowers_plans_2026_07_18_resident_day_off_requests_task11_pending_badge [INFERRED 0.85]
- **Feedback capture-to-triage pipeline: widget/crash capture write, admin function/tab read** — docs_superpowers_plans_2026_07_18_user_feedback_plan_task1_schema_helper, docs_superpowers_plans_2026_07_18_user_feedback_plan_task2_widget, docs_superpowers_plans_2026_07_18_user_feedback_plan_task3_crash_capture, docs_superpowers_plans_2026_07_18_user_feedback_plan_task4_admin_function, docs_superpowers_plans_2026_07_18_user_feedback_plan_task5_admin_tab [INFERRED 0.85]

## Communities (37 total, 8 thin omitted)

### Community 0 - "Scheduler Constants & UI Primitives"
Cohesion: 0.03
Nodes (47): AREA_COLORS, BASE_ELIGIBILITY, BLOCK_TARGETS, BLOCK_TYPE_MAP, BLOCK_TYPES_EM, BUTTON_SIZES, BUTTON_VARIANTS, CAT_MAP (+39 more)

### Community 1 - "Schedule Generation & Validation Logic"
Cohesion: 0.06
Nodes (76): addDays(), applyStartDate(), ayWindowFor(), blockDayIndex(), BlockProgressBar(), blockTypeFilterPasses(), buildWeekRows(), cellViolations() (+68 more)

### Community 2 - "Auth Gate & Resident Requests App"
Cohesion: 0.10
Nodes (31): AppGate(), crashKey(), reportCrash(), AdminManagement(), ApprovalQueue(), blockLabelFor(), groupByBlock(), RequestsTab() (+23 more)

### Community 3 - "Package Dependencies & Build Tooling"
Cohesion: 0.05
Nodes (38): autoprefixer, @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf-autotable, lucide-react, dependencies, @fontsource/barlow (+30 more)

### Community 4 - "Day-Off Request Feature Plan"
Cohesion: 0.14
Nodes (24): Auth, Roles & RLS Security Model, Resident Day-Off Request Feature (residentRequests/ + RequestsTab), Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing (+16 more)

### Community 5 - "Architecture Notes & Feedback Feature"
Cohesion: 0.15
Nodes (19): Supabase Cloud Sync (res_state, wide-open RLS), em-scheduler Sibling Project, jspdf-autotable Import Interop Bug, Rule-Default Migration (LEGACY_*_DEFAULTS), EM Residency Scheduling Engine (ResidentScheduler.jsx), User Feedback Widget & Admin Tab, User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version (+11 more)

### Community 6 - "Local Storage Persistence & Cloud Sync"
Cohesion: 0.22
Nodes (10): deepEqualNormalized(), EXPORT_BLOCKING_RULE_IDS, LS_BACKUP_KEYS, normalizeForCompare(), ResidentScheduler(), sbDeleteState(), sbFetch(), sbLoadState() (+2 more)

### Community 7 - "Day-Off Requests DB Schema & RLS"
Cohesion: 0.20
Nodes (15): admin_email_allowlist, day_off_requests, day_off_requests_cancel_guard, day_off_requests_identity_guard, profiles, profiles_admin_allowlist_promote, profiles_resident_id_immutable, profiles_role_change_guard (+7 more)

### Community 8 - "PDF Export"
Cohesion: 0.09
Nodes (32): jspdf, jspdf, AddResidentModal(), AvailabilityRangesEditor(), AYConferenceEditor(), DragConfirmModal(), EMResidentsTab(), exportMatrixPDF() (+24 more)

### Community 9 - "Roster & Matrix Import Parsing"
Cohesion: 0.18
Nodes (14): ImportMatrixModal(), ImportRosterModal(), matchCategory(), matchLectureRosterName(), matchVacationRoster(), normalizeToken(), parseDateRangeInAY(), parseLectureImportDate() (+6 more)

### Community 10 - "Coverage Rules & Calendar View"
Cohesion: 0.29
Nodes (7): DAY_RULE_DEFAULTS_CHANGED, describeDayRules(), describeShiftGates(), normalizeRulePriority(), ruleRank(), RulesTab(), SOFT_RULES

### Community 11 - "Pre-Generation Readiness Gate"
Cohesion: 0.36
Nodes (8): findDateHeaderRow(), inferGroupPgy(), matchBlockType(), parseHomeResidentMatrix(), parseHomeResidentMatrixGrouped(), parseSequentialDateRange(), pgyExclusiveRotationIds(), splitName()

### Community 12 - "Design System Documentation"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 13 - "Resident Management Tabs"
Cohesion: 0.29
Nodes (7): expandDateRangeInclusive(), extractVacationDateCells(), findVacationSections(), parseVacationDateRange(), parseVacationWorkbook(), stripVacationNameSuffix(), vacationGroupDatesColIdx()

### Community 14 - "Chief-to-Admin Role Migration"
Cohesion: 0.60
Nodes (4): profiles, profiles_admin_role_only_update_guard, public.enforce_admin_role_only_update(), public.is_admin()

### Community 15 - "Circadian & Journal Club Rules (Docs)"
Cohesion: 0.67
Nodes (4): Circadian Scheduling Rules (NIGHT_RULES), Journal Club Rules (JC_MAX_PER_AY), Schedule Generator (generateSchedule / fillDayPass), Soft Rule Priority System (appSettings.rulePriority)

### Community 16 - "Pending Approval Migration"
Cohesion: 0.67
Nodes (3): profiles, profiles_role_change_guard, public.enforce_profile_role_change_rules()

### Community 17 - "Feedback Admin Fetch Helpers"
Cohesion: 0.67
Nodes (3): fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 18 - "User Guide Tab"
Cohesion: 0.67
Nodes (3): GUIDE_SECTIONS, TABS, UserGuideTab()

### Community 19 - "Sidebar Tab Reordering"
Cohesion: 0.67
Nodes (3): reconcileTabOrder(), reorderIds(), SidebarNav()

## Knowledge Gaps
- **77 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+72 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `jspdf` connect `PDF Export` to `Package Dependencies & Build Tooling`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Package Dependencies & Build Tooling` to `PDF Export`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `formatDisplayDate()` (e.g. with `exportMatrixPDF()` and `ImportVacationModal()`) actually correct?**
  _`formatDisplayDate()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _77 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Scheduler Constants & UI Primitives` be split into smaller, more focused modules?**
  _Cohesion score 0.0273972602739726 - nodes in this community are weakly interconnected._
- **Should `Schedule Generation & Validation Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.06210526315789474 - nodes in this community are weakly interconnected._
- **Should `Auth Gate & Resident Requests App` be split into smaller, more focused modules?**
  _Cohesion score 0.10175763182238667 - nodes in this community are weakly interconnected._