# Graph Report - resident-scheduler  (2026-08-10)

## Corpus Check
- 59 files · ~130,198 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 735 nodes · 1453 edges · 65 communities (55 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `77aa2d5d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Core Scheduler Constants & UI
- Synthetic Test Fixture Roster
- Package Dependencies
- App Gate & Auth Screens
- Demo Sandbox & Persistence Rationale
- Date Utilities
- Schedule Generator Core
- Rules Tab & Cell Violations
- Dashboard Block Calendar
- Day-Off Request Feature Plan
- Block Calendar Editor Components
- Day-Off Request Schema & RLS
- Generation Report & Rest Checks
- Circadian & Streak Rule Helpers
- Feedback Widget Implementation Plan
- PDF/ICS Export
- Vacation/Lecture Import Parsing
- Roster/CSV Parsing
- Root Scheduler State & Sync
- Resident Request Portal Components
- Auth RLS Policies & Triggers
- Coverage Min/Max Config
- Crash Reporting & Error Boundary
- ACGME Streak Rule & Generator Bugs
- Quality Harness Best-of-N & Repair
- Tech Stack & Dependency Rationale
- Seniority & Eligibility Rules
- Soft Rule Priority & Circadian Comparator
- Journal Club Rules
- Test Suite & Baseline Fixtures
- Shift Catalog & QGenda Export
- Requests Tab Admin UI
- Wellness Wednesdays & Trauma/Peds Split
- Auth Domain Restriction
- PED-N/PED-S Eligibility Rules
- Roster Modal Tabs
- Admin Email Allowlist
- OMD Response App Design System
- Chief-to-Admin Migration
- PDF Export Library Quirk
- Pending-Approval Role Migration
- Feedback Admin Fetch Helpers
- User Guide Tab
- Sidebar Tab Ordering
- Request Identity Lock Migration
- MCP Config
- Vite Config
- Caveman Mode Rule (Cline)
- Caveman Mode Rule (Copilot)
- Caveman Mode Rule (OpenCode)
- Caveman Mode Rule (Windsurf)
- Caveman Mode Rule (AGENTS.md)
- AY Window Helper
- Demo Mode Key Constant

## God Nodes (most connected - your core abstractions)
1. `parseDate()` - 57 edges
2. `validateAll()` - 48 edges
3. `toDateStr()` - 30 edges
4. `addDays()` - 28 edges
5. `formatDisplayDate()` - 24 edges
6. `getBlockDates()` - 24 edges
7. `getEligibleShifts()` - 21 edges
8. `generateSchedule()` - 20 edges
9. `computeQualityMetrics()` - 15 edges
10. `exportResidentCalendarPDF()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `ResidentScheduler.jsx (~8300 line scheduling engine)` --references--> `tailwindcss`  [EXTRACTED]
  CLAUDE.md → package.json
- `exportMatrixPDF()` --references--> `jspdf`  [EXTRACTED]
  src/ResidentScheduler.jsx → package.json
- `exportResidentCalendarPDF()` --references--> `jspdf`  [EXTRACTED]
  src/ResidentScheduler.jsx → package.json
- `pdfDemoBanner()` --references--> `jspdf`  [EXTRACTED]
  src/ResidentScheduler.jsx → package.json
- `pdfPageFooter()` --references--> `jspdf`  [EXTRACTED]
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

## Communities (65 total, 10 thin omitted)

### Community 0 - "Core Scheduler Constants & UI"
Cohesion: 0.02
Nodes (56): RFC-5545, BASE_ELIGIBILITY, BLOCK_TARGETS, BLOCK_TYPE_MAP, BLOCK_TYPES_EM, BUTTON_SIZES, BUTTON_VARIANTS, CALENDAR_TIME_OF_DAY_LABEL (+48 more)

### Community 1 - "Synthetic Test Fixture Roster"
Cohesion: 0.06
Nodes (46): CONF_AUTO_SWAP_12H_IDS, CONF_SUPPRESSED_NORMAL_IDS, DEFAULT_COVERAGE, DEFAULT_COVERAGE_MINMAX, DOW_COVERAGE_MAX_OVERRIDE, getCoverageFor(), normalizeCoverageEntry(), TRAUMA_SOLO_IDS (+38 more)

### Community 2 - "Package Dependencies"
Cohesion: 0.09
Nodes (22): autoprefixer, jsdom, devDependencies, autoprefixer, jsdom, postcss, vite, @vitejs/plugin-react (+14 more)

### Community 3 - "App Gate & Auth Screens"
Cohesion: 0.09
Nodes (32): AppGate(), crashKey(), ErrorBoundary, reportCrash(), AdminManagement(), ApprovalQueue(), blockLabelFor(), groupByBlock() (+24 more)

### Community 4 - "Demo Sandbox & Persistence Rationale"
Cohesion: 0.05
Nodes (45): AutosaveIndicator pill, BlockCalendarSection (Dashboard year-timeline), Known accepted gap: residents-never-see-schedule is UI-enforced only, blockLookup.js, Cloud-op-succeeds-before-local-wipe/write discipline (avoid stale mount overlay reverting), computeCoverageByDate(), Dark mode (index.css override sheet, not Tailwind dark: variants), Dashboard/Home merge (Home tab removed) (+37 more)

### Community 5 - "Date Utilities"
Cohesion: 0.15
Nodes (12): Approach, Context, Key decisions & tradeoffs, Out of scope, Phase 0 — `score()` priority audit *(prerequisite, not a peer)*, Phase 1 — Generalized shape scoring *(kills "fixed bad sequences")*, Phase 2 — AY-to-date fairness carryover *(kills "rebalanced who got hammered")*, Phase 3 — Override-capture loop *(attacks the root of "moved shifts off specific residents")* (+4 more)

### Community 6 - "Schedule Generator Core"
Cohesion: 0.08
Nodes (76): addDays(), ayWindowFor(), formatAY(), getAcademicYearFor(), getBlockDates(), getBlockWeekends(), parseDate(), qgendaDate() (+68 more)

### Community 7 - "Rules Tab & Cell Violations"
Cohesion: 0.20
Nodes (10): checkGenerateReadiness(), DAY_RULE_DEFAULTS_CHANGED, describeDayRules(), describeShiftGates(), eligKey(), getJCPresenterGaps(), getMissingSpecialDayLists(), jcPresentersFor() (+2 more)

### Community 8 - "Dashboard Block Calendar"
Cohesion: 0.25
Nodes (9): day_off_requests.sql (fresh-install baseline), DAY_RULE_DEFAULTS_CHANGED badge derivation, EM_HOME_2 EM/EMS<->EM/TOX weekday-window swap on 2026-08-01, getEffectiveDayRules() / getEffectiveEligibility(), IM/TOX weekday tightening, LEGACY_DAY_RULE_DEFAULTS / LEGACY_ELIGIBILITY_DEFAULTS, migrate_chief_to_admin.sql, Rule-default migration: prune saved overrides that deep-equal legacy pre-correction snapshots so fixes aren't masked (+1 more)

### Community 9 - "Day-Off Request Feature Plan"
Cohesion: 0.16
Nodes (22): Resident Day-Off Request Implementation Plan, Task 10: Chief Approve/Deny Actions (ApprovalQueue), Task 11: Pending-Request Grid Marker + Sidebar Badge, Task 12: Email Notifications (Resend Edge Function), Task 13: End-to-End Verification Pass, Task 1: Supabase Auth Client + Config Plumbing, Task 2: profiles + day_off_requests Schema & RLS, Task 3: Server-Side Email-Domain Signup Restriction (+14 more)

### Community 10 - "Block Calendar Editor Components"
Cohesion: 0.20
Nodes (11): AYConferenceEditor(), BlockCalendarRow(), BlockCalendarSection(), BlockContextBar(), BlockMonthGrid(), computeCoverageByDate(), coverageDayStatus(), getActiveCoverageShifts() (+3 more)

### Community 11 - "Day-Off Request Schema & RLS"
Cohesion: 0.20
Nodes (15): admin_email_allowlist, day_off_requests, day_off_requests_cancel_guard, day_off_requests_identity_guard, profiles, profiles_admin_allowlist_promote, profiles_resident_id_immutable, profiles_role_change_guard (+7 more)

### Community 12 - "Generation Report & Rest Checks"
Cohesion: 0.15
Nodes (15): getAcademicYear(), AvailabilityRangesEditor(), BlockProgressBar(), DashboardTab(), DragConfirmModal(), formatDisplayDate(), GenerationReportCard(), getBlockProgress() (+7 more)

### Community 13 - "Circadian & Streak Rule Helpers"
Cohesion: 0.33
Nodes (6): buildWeekRows(), isFirstTuesday(), parseLectureImportDate(), parseLectureImportText(), ScheduleCalendarView(), validateLectureImportDate()

### Community 14 - "Feedback Widget Implementation Plan"
Cohesion: 0.22
Nodes (13): User Feedback + Admin Portal Implementation Plan, Task 1: feedback Schema, submitFeedback, app_version, Task 2: Floating Feedback Widget (Button + Modal), Task 3: Crash Auto-Capture in main.jsx, Task 4: feedback-admin Netlify Function + netlify.toml, Task 5: Feedback Admin Tab (Password-Gated Triage UI), Task 6: Document Server-Only Feedback Env Vars, Crash Auto-Capture (window.onerror/unhandledrejection) (+5 more)

### Community 15 - "PDF/ICS Export"
Cohesion: 0.09
Nodes (32): @fontsource/barlow, @fontsource/barlow-condensed, @fontsource/jetbrains-mono, jspdf, jspdf-autotable, lucide-react, dependencies, @fontsource/barlow (+24 more)

### Community 16 - "Vacation/Lecture Import Parsing"
Cohesion: 0.24
Nodes (10): extractVacationDateCells(), findVacationSections(), matchLectureRosterName(), matchVacationRoster(), parseVacationDateRange(), parseVacationWorkbook(), stripVacationNameSuffix(), vacationGroupDatesColIdx() (+2 more)

### Community 17 - "Roster/CSV Parsing"
Cohesion: 0.17
Nodes (20): CAT_MAP, CATEGORIES, CATEGORY_SYNONYMS, matchCategory(), normalizeToken(), parseDateRangeInAY(), parseRosterText(), NOTE: CATEGORIES/CAT_MAP/normalizeToken/DATE_RANGE_RE are not in the original ex (+12 more)

### Community 18 - "Root Scheduler State & Sync"
Cohesion: 0.17
Nodes (12): BLOCK_SCOPED_TABS, buildSnapData(), deepEqualNormalized(), EXPORT_BLOCKING_RULE_IDS, LS_BACKUP_KEYS, normalizeForCompare(), ResidentScheduler(), sbDeleteState() (+4 more)

### Community 19 - "Resident Request Portal Components"
Cohesion: 0.22
Nodes (11): AppGate.jsx (whole-app login/role gate), LoginScreen, main.jsx (route split), migrate_block_pending_account_access.sql, Confirmed hole: pending role checked client-side only, enabled impersonation via /requests, RequestForm, RequestList, ResidentPicker (+3 more)

### Community 20 - "Auth RLS Policies & Triggers"
Cohesion: 0.20
Nodes (11): enforce_cancel_only_status trigger, enforce_profile_role_change_rules trigger, enforce_request_identity_immutable trigger, enforce_resident_id_immutable trigger, is_admin() SECURITY DEFINER helper, profiles_insert_own policy, profiles.role (pending/resident/admin), RequestsTab.jsx (admin approval queue + admin management) (+3 more)

### Community 21 - "Coverage Min/Max Config"
Cohesion: 0.18
Nodes (10): Act 1 summary — what the grill settled, Act 3 — Build (Claude; Codex review never ran), Not verified, Phase 0 — score() priority audit — SHIPPED AS AUDIT ONLY, NO BEHAVIOR CHANGE, Phase 1 — Generalized work-shape scoring — SHIPPED, Phase 2 — AY-to-date fairness carryover — SHIPPED, Phase 3 — Override capture — SHIPPED, Plan Review Log: Close the schedule-quality gap blocking cutover (+2 more)

### Community 22 - "Crash Reporting & Error Boundary"
Cohesion: 0.29
Nodes (5): REPORT, diffScheduleCells(), OverrideInsightsCard(), summarizeOverrides(), withOverrideEvents()

### Community 23 - "ACGME Streak Rule & Generator Bugs"
Cohesion: 0.25
Nodes (7): cellViolations() (shared picker + drag-drop aggregator), Real 8-day-straight scheduling bug from shift-less GR day counting as day off, generateSchedule(), isStreakWorkDay() / grWorkDow / runLengthIfWorked(), MAX_CONSECUTIVE_WORK_DAYS = 6 (ACGME rule), Cached candidate pool went stale mid-day, caused double-booking (fixed by recomputing per slot), Vacation as distinct hard-off concept (vacationDates[])

### Community 24 - "Quality Harness Best-of-N & Repair"
Cohesion: 0.22
Nodes (8): computeQualityMetrics() / computeQualityVector(), generateScheduleBest() (20-attempt best-of-N), mulberry32() seeded RNG, narrowForSeniority() / podStillSatisfied(), Empirical testing showed repair could place junior into PGY-3-less POD slot or free a shift's only qualifying PGY-3 without narrowing checks, Bounded repair pass (repair:true option, 3 phases), src/lib/rng.js, src/lib/scheduleQuality.js

### Community 25 - "Tech Stack & Dependency Rationale"
Cohesion: 0.22
Nodes (9): jspdf, lucide-react icons, React 19, ResidentScheduler.jsx (~8300 line scheduling engine), Vite 6, CDN-tarball-not-npm-registry rationale for xlsx (CVE fixes only in CDN builds), xlsx (SheetJS, pinned CDN tarball), tailwindcss (+1 more)

### Community 26 - "Seniority & Eligibility Rules"
Cohesion: 0.29
Nodes (7): BAMC residents schedulable by default (isSchedulable EM fallback), fillDayPass(ds, includeShift, phase), FLEX soft / POD hard seniority rule, Grand Rounds lecture dates rule, isSchedulable(), SENIOR_COMPOSITION (FLEX/POD), validateAll()

### Community 27 - "Soft Rule Priority & Circadian Comparator"
Cohesion: 0.29
Nodes (8): betterQuality() lexicographic comparator, checkCircadianViolations(), GR_START_HOUR (08:00), grRestGapH(), isNightOnlyResident() (FM-3 exemption), NIGHT_RULES (minRun/idealRun/maxRun 4-6-6), Lexicographic tuple comparison chosen over weighted scalar (scalar let low-priority rule outrank high-priority at large magnitude), Soft Rule Priority (appSettings.rulePriority)

### Community 28 - "Journal Club Rules"
Cohesion: 0.25
Nodes (7): checkGenerateReadiness(), countPublishedJC() / countCurrentBlockJC(), JC_MAX_PER_AY (3), Journal Club rule (first-Tuesday, 3/AY cap, published-only counting), JournalClubPlanner, ReadinessWarningPanel, shiftOverlapsJC(sid)

### Community 29 - "Test Suite & Baseline Fixtures"
Cohesion: 0.29
Nodes (7): generator.baseline.test.js, generator.harness.test.js, netlify.toml, npm run dev/build/preview/test, __fixtures__/qualityBaseline.json (committed regression floor), UPDATE_QUALITY_BASELINE / FORCE_QUALITY_BASELINE env flags, vitest test runner

### Community 30 - "Shift Catalog & QGenda Export"
Cohesion: 0.25
Nodes (8): prettyDate() formatter (UI display, 2-digit year), QGenda CSV export (Start/End derived from SHIFT_TIMING), qgendaDate() formatter (src/lib/dates.js), SHIFT_AREAS, SHIFT_MAP, SHIFT_TIMING, SHIFT_TYPES, SHIFTS (shift catalog)

### Community 31 - "Requests Tab Admin UI"
Cohesion: 0.40
Nodes (5): bandOf(), groupBand(), preferenceKeys, structuralKeys, SCORE_TIERS

### Community 32 - "Wellness Wednesdays & Trauma/Peds Split"
Cohesion: 0.29
Nodes (7): Peds Wednesdays off (advocacy feature removed), RULE_NOTES prose constants, Temporal-dead-zone bug warning for top-level const ordering, TRAUMA_PEDS_SPLIT (trauma:8, peds:11), traumaPedsHalf() / isTraumaPedsSplitResident(), Wellness Wednesdays rule, Prior bug: Schedule grid cell-eligibility call omitted ctx, silently no-op'd Wellness Wednesday/Peds-Trauma split

### Community 34 - "Auth Domain Restriction"
Cohesion: 0.33
Nodes (6): AUTH_ENABLED flag, auth_hook_domain_restriction.sql, Domain restriction dashboard hook left unwired (unenforced) incident, Dev-fallthrough vs production-fails-closed asymmetry for missing auth env vars, restrict_signup_domain(event) function, supabaseClient.js (AUTH_ENABLED, shared client)

### Community 35 - "PED-N/PED-S Eligibility Rules"
Cohesion: 0.40
Nodes (6): Chief roles (chiefRole: academic/admin/scheduling), getEligibleShifts(), Off-service residents availability (isAvailableOnDate), PED-N (Peds Night) eligibility rule, PED-S (Peds Swing) shift, SHIFT_DOW

### Community 36 - "Roster Modal Tabs"
Cohesion: 0.50
Nodes (4): AddResidentModal(), EMResidentsTab(), OffServiceTab(), uuid()

### Community 37 - "Admin Email Allowlist"
Cohesion: 0.33
Nodes (6): admin_email_allowlist table, apply_admin_allowlist trigger, migrate_admin_email_allowlist.sql, Public repo: never hardcode real resident names/PII/emails, resident-scheduler (EM residency shift scheduler), __fixtures__/syntheticRoster.json (synthetic, public-repo-safe)

### Community 38 - "OMD Response App Design System"
Cohesion: 0.40
Nodes (5): Accessibility Floor, Field-Ready Design System, OMD Response App, Semantic Palette Tokens & Dark-Mode Constraint, Typography System (Barlow / Barlow Condensed / JetBrains Mono)

### Community 39 - "Chief-to-Admin Migration"
Cohesion: 0.60
Nodes (4): profiles, profiles_admin_role_only_update_guard, public.enforce_admin_role_only_update(), public.is_admin()

### Community 40 - "PDF Export Library Quirk"
Cohesion: 0.67
Nodes (3): exportMatrixPDF(), jspdf-autotable@3.8.4, jspdf-autotable default-export interop bug under esbuild/Rollup

### Community 41 - "Pending-Approval Role Migration"
Cohesion: 0.67
Nodes (3): profiles, profiles_role_change_guard, public.enforce_profile_role_change_rules()

### Community 42 - "Feedback Admin Fetch Helpers"
Cohesion: 0.67
Nodes (3): fetchFeedbackAdmin(), fetchWithTimeout(), updateFeedbackStatus()

### Community 43 - "User Guide Tab"
Cohesion: 0.67
Nodes (3): GUIDE_SECTIONS, TABS, UserGuideTab()

### Community 44 - "Sidebar Tab Ordering"
Cohesion: 0.67
Nodes (3): reconcileTabOrder(), reorderIds(), SidebarNav()

## Knowledge Gaps
- **149 isolated node(s):** `supabase`, `name`, `version`, `private`, `type` (+144 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `PDF/ICS Export` to `Package Dependencies`?**
  _High betweenness centrality (0.334) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Package Dependencies` to `Tech Stack & Dependency Rationale`?**
  _High betweenness centrality (0.305) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `formatDisplayDate()` (e.g. with `exportMatrixPDF()` and `ImportVacationModal()`) actually correct?**
  _`formatDisplayDate()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `supabase`, `name`, `version` to the rest of the system?**
  _149 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Scheduler Constants & UI` be split into smaller, more focused modules?**
  _Cohesion score 0.023529411764705882 - nodes in this community are weakly interconnected._
- **Should `Synthetic Test Fixture Roster` be split into smaller, more focused modules?**
  _Cohesion score 0.06327683615819209 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._