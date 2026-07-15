# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

EM residency shift scheduler (UH Emergency Medicine) — builds/validates resident schedules across
areas (POD, PED, FLEX, MT, TRAUMA), can **auto-generate** a schedule from coverage rules, exports
to CSV, with JSON backup/restore in the Settings tab.

## Layout & stack
- Repo root: `C:\Users\amade\projects\resident-scheduler` → GitHub `picklepilk/resident-scheduler`
  (public repo — never commit real resident names/PII; see "Data model & conventions" below).
- React 19 + Vite 6 + Tailwind CSS · `lucide-react` icons. (`jspdf`/`jspdf-autotable` are declared
  in `package.json` but currently unused — no PDF export is implemented.)
- `xlsx` (SheetJS) parses the Master Matrix import (below). Installed from SheetJS's own CDN tarball
  (`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` in `package.json`), **not** the npm
  registry package — the registry build is frozen at 0.18.5 with unpatched prototype-pollution/ReDoS
  CVEs that SheetJS only fixes in CDN-published builds. Keep installing/upgrading this dependency via
  a pinned CDN tarball URL, never `npm install xlsx`.
- **Almost all app logic lives in one file: `src/ResidentScheduler.jsx` (~4,200 lines).**
  `src/` contains only that file plus `main.jsx` (10-line wrapper, no `App.jsx`) and `index.css` —
  expect to spend nearly all edits inside `ResidentScheduler.jsx`.
- Shift catalog is defined as data at the top of `ResidentScheduler.jsx`: `SHIFTS` (id, label, area,
  hours, type: day/eve/night, chip color) and `SHIFT_TIMING` (exact start hour + duration per shift
  id, used for rest-period validation across midnight). `SHIFT_MAP`/`SHIFT_AREAS` are derived from
  `SHIFTS` — add new shift types there, not as ad-hoc strings elsewhere.
- Persistence is local-only: a `useLocalStorage` hook (~line 1052) backs nine state slots under
  `res_*` keys (`LS_BACKUP_KEYS`, ~line 3392): EM roster, current block, blocks history, eligibility
  overrides, AY data, app settings, chief-editable day rules, shift coverage, and sidebar tab order.
  The Settings tab exports/imports/resets all of them as one JSON backup. No backend, no
  fetch/Supabase anywhere — **a new `res_*` key must be added to `LS_BACKUP_KEYS` or it silently
  won't round-trip** through backup/restore. Anything read back from a backup (or hand-edited
  localStorage) should be treated as untrusted shape — e.g. `reconcileTabOrder` guards with
  `Array.isArray` before trusting a persisted array.

## Running / building / deploying
```bash
npm run dev
npm run build     # → dist/
npm run preview
```
- No lint or test command exists (no ESLint config, no test runner).
- Netlify deploy (`netlify.toml`: build = `npm run build`, publish = `dist`, SPA redirect
  `/* → /index.html`).

## Map of ResidentScheduler.jsx
Line numbers drift as the file grows — grep for the `// ─── SECTION ───` markers or the function
names below rather than trusting offsets.
- ~13–335 `CONSTANTS` — `SHIFTS`, `SHIFT_TIMING`, `SHIFT_MAP`/`SHIFT_AREAS`, `CATEGORIES`, block
  types (`BLOCK_TYPES_EM`, `TRAUMA_BLOCKS`, `EM_HOME_BLOCK_TYPES_BY_PGY`), `BASE_ELIGIBILITY`,
  `DEFAULT_DAY_RULES`, `SHIFT_TARGETS`/`BLOCK_TARGETS` (rotation-specific target overrides, e.g.
  US/EM = 5 shifts, EM/Res/VAC = 13 — see `getShiftTarget`), `DEFAULT_COVERAGE`/`getCoverageFor`
  (per-shift daily staffing counts used by the generator), `LEGACY_DAY_RULE_DEFAULTS`/
  `LEGACY_ELIGIBILITY_DEFAULTS`/`DAY_RULE_DEFAULTS_CHANGED` (see "Rule-default migration" below).
  `DEFAULT_DAY_RULES` shapes now include `dayTypeRestrictions[].scope: 'generator'` (the shift stays
  manually assignable via the picker; only auto-fill skips it — see `getEligibleShifts`'s `ctx`
  param) and `computedDayRules: [{type:'firstFridayOfMonth'}]` (date-computed rules needing no
  manual list, evaluated the same way as `fullBlockDays`).
- ~336–392 `UTILITIES` — date helpers (`getBlockDates`, `parseDate`/`addDays`/`toDateStr`),
  `getAcademicYearFor`/`getAcademicYear`/`formatAY` (AY derived from a date, July cutoff —
  `getAcademicYear()` reads `Date` fields directly rather than round-tripping through
  `toISOString()`, to avoid an off-by-one-day near the July cutoff in timezones behind UTC),
  `applyStartDate` (shared start-date handler: auto-fills end date to the configured block length,
  recomputes AY only while it still matches auto-derivation so a manually-edited AY sticks — used by
  both Home and Settings tabs).
- ~393–506 `ROSTER IMPORT` — `parseRosterText` (parses pasted/uploaded CSV or TSV roster rows into
  `{firstName,lastName,category,pgy}`; tab-delimited or quote-aware CSV — including a fallback for
  unquoted "Last, First" names that would otherwise misalign columns — optional header row, category
  matched via `CATEGORY_SYNONYMS`, PGY validated against the category's `pgyOptions`; Rotation/date
  columns are read but ignored) plus `splitCsvLine`/`splitName`/`matchCategory`.
- `MATRIX IMPORT` (same section, after `parseRosterText`) — parses the chief's yearly two-sheet
  Master Matrix workbook (`ImportMatrixModal`, Home tab): `parseHomeResidentMatrix` reads the "Home EM
  Residents" sheet's 3 PGY sections into per-block EM rotation assignments (via `matchBlockType`,
  matching rotation labels against `BLOCK_TYPES_EM` the same way `matchCategory` matches categories);
  `parseOffServiceSheet` reads the "Off-Service Residents" sheet's Name/Dept/Dates triples (found by
  scanning for the date-range cell and reading its left neighbors, since the sheet's column offsets
  drift per month-group — don't switch this to fixed column indices). Two separate date-range parsers
  handle each sheet's own year-inference quirk: `parseSequentialDateRange` (sheet 1) walks columns in
  row order bumping a year cursor on backward month jumps, because the sheet has a pre-orientation
  stub column that sits before the AY's first July block; `parseDateRangeInAY` (sheet 2) dates each
  range independently off a July cutoff, except a same-year range straddling Jun→Jul (right at the
  AY's start) uses the *later* month's half so it doesn't get misread as the AY's May/Jun tail. Do not
  merge these two into one function — they solve different problems for structurally different sheets.
  `ImportMatrixModal` only ever writes `emRoster` (merging in new residents, matched by normalized
  name) and `blocksHistory` (one snapshot per parsed block, id `blk_import_${startDate}` so a
  re-upload updates in place instead of duplicating) — it never touches the live/current block and
  never generates a schedule.
- ~507–685 `REST-PERIOD UTILITIES` / eligibility base — `checkRestViolations`, `isSchedulable`,
  `getShiftTarget`, `getEffectiveEligibility`.
- ~686–863 `ELIGIBILITY LOGIC` — `getEligibleShifts(resident, dateStr, ..., ctx)` (jeopardy-call
  logic lives here, plus the Peds/Trauma half-block split via `traumaPedsHalf` and off-service
  availability via `isAvailableOnDate`; `ctx = {blockStart, forGenerator}` — `blockStart` is needed
  for the half-block split, `forGenerator` gates `scope:'generator'` restrictions) and
  `validateAll()`, the rules/validation engine (also handles jeopardy policy, the 7-consecutive-
  work-day rule, and trauma double-booking); shares `isTraumaCapSubject(resident)` (EM_HOME PGY-2
  **and** PGY-3) and `getTraumaCap(appSettings)` with the generator below rather than re-testing in
  both places. `grWorkDow`/`isStreakWorkDay`/`runLengthIfWorked` implement the ≤7-consecutive-
  work-day rule (Grand Rounds counts as a work day even with no assigned shift) shared by both.
- ~864–1051 `SCHEDULE GENERATOR` — `generateSchedule()` (coverage-driven auto-fill: MRV slot
  ordering per day, candidate filtering with named unfilled-reasons, target/type-mix/streak/jeopardy/
  trauma-nights-preferred/peds-mix scoring; recomputes the candidate pool fresh for every slot — a
  cached pool went stale mid-day and caused double-booking once, so don't reintroduce that; never
  overwrites a non-empty cell). Fill happens in **two passes** via `fillDayPass(ds, includeShift)` —
  everything except TRAUMA-D across the whole block, then TRAUMA-D alone — because PGY-1 trauma-day
  shifts are meant to be the final fill step; don't collapse this back into one pass without
  re-deriving why. `summarizeGenerationReport()` turns the generator's report into grouped,
  human-readable recommendations for the Violations tab, including "expected gap" detection for
  day-of-week rules (Trauma windows, GR Wednesday) and for PED-N (FM-3-exclusive — see below).
- ~1052–1061 `HOOKS` — `useLocalStorage`.
- ~1062–3850 tab components in order — `UI PRIMITIVES` (`Modal`, `SectionCard`, `CollapsibleCard`,
  `CollapsibleHeader`), `SPECIAL DAYS LIST`, `DASHBOARD TAB` (special days now live only here, not
  Home), `HOME TAB` (`ImportMatrixModal` lives just above it — see "Matrix Import" above), `RESIDENT
  FORM` (shared by Add/Edit modals, plus `ImportRosterModal` for bulk roster import), `EM RESIDENTS
  TAB`, `OFF-SERVICE TAB` (inline per-tile date-off/jeopardy editors),
  `SHIFT MATRIX TAB` (rotation-aware shift matrix), `RULES TAB` ("Scheduling Rules" in the UI —
  day/rotation rules plus the Daily Shift Coverage editor consumed by the generator), `SHIFT PICKER
  MODAL` + `SCHEDULE GRID` (main editing grid; Generate Schedule / Clear & Regenerate live here),
  `VALIDATION TAB` (violations list plus the Generation Report), `SETTINGS TAB` (backup/restore,
  `LS_BACKUP_KEYS`, jeopardy policy), `USER GUIDE TAB`.
- ~3851–end `MAIN APP` — the `TABS` nav array; `reconcileTabOrder`/`reorderIds` (pure helpers behind
  the sidebar's drag-to-reorder — reconcile guards against a non-array persisted order, reorder
  always lands the dragged tab immediately before the drop target regardless of drag direction);
  `SidebarNav` (own component, not inlined in the root — keeps drag-hover state from re-rendering
  whatever tab content is currently mounted); the root `ResidentScheduler` component: all state via
  `useLocalStorage`, `saveBlock`/`loadBlock`/`newBlock`, `exportCSV`, header/tab-routing render.

## Data model & conventions
- Shift IDs follow `AREA-TYPE` (e.g. `POD-D`, `MT-N`, `TRAUMA-D` — note TRAUMA has no evening shift).
  Keep this convention when adding areas/shifts so lookups via `SHIFT_MAP` keep working.
- `SHIFT_TIMING` start/duration hours are used to compute rest periods across midnight — if you add
  a shift, add its timing entry too, or rest-period validation will silently skip it. (`DEFAULT_COVERAGE`
  needs no manual update — it's derived from `SHIFTS` with a default of 1 per shift; 0 only applies to
  a shift id that isn't in `SHIFTS` at all, which can't happen for one you just added there.)
- **PED-N (Peds Night) is FM-3-exclusive program-wide** — no other category/PGY may ever be
  eligible for it, including via a Shift Matrix rotation override. If you add a new eligibility
  entry, don't add PED-N to it.
- Off-service residents (`block.offServiceResidents[]`) carry `availabilityMode: 'full'|'ranges'|
  'days'` plus `availableRanges: [{start,end}]` / `canWorkDates: []`, checked by
  `isAvailableOnDate()` in `getEligibleShifts`. These fields live inside the block object, so they
  ride along with existing persistence/backup — no new `LS_BACKUP_KEYS` entry needed for
  resident-level fields like this.
- This repo is **public** — never hardcode real resident names/rosters into source (this happened
  once; use the Import Roster feature on the EM Residents / Off-Service tabs, or Import Master Matrix
  on the Home tab, instead — both read pasted/uploaded data into `localStorage` only, never into
  committed code).
- This is a sibling project to `em-scheduler` (same author, same domain — EM scheduling). If a bug
  or pattern here looks familiar, check `../em-scheduler/CLAUDE.md` for prior hard-won fixes
  (scheduling rules, export patterns, attending-matching) before re-deriving them.

## Rule-default migration
`getEffectiveDayRules`/`getEffectiveEligibility` replace a `CATEGORY_PGY` key's default *wholesale*
with any chief-saved override — so when a `DEFAULT_DAY_RULES`/`BASE_ELIGIBILITY` entry is corrected,
an old saved override that happens to equal the *previous* default would silently keep masking the
fix forever. `LEGACY_DAY_RULE_DEFAULTS`/`LEGACY_ELIGIBILITY_DEFAULTS` snapshot the pre-correction
defaults for affected keys; a one-time mount effect in the root component prunes any saved override
that still deep-equals its legacy snapshot (`deepEqualNormalized`), so the corrected default takes
over. Overrides that don't match (genuinely customized) are left alone but flagged with an amber
badge on the Rules tab (`DAY_RULE_DEFAULTS_CHANGED`) so the chief knows to review them. **Whenever
you correct a `DEFAULT_DAY_RULES`/`BASE_ELIGIBILITY` entry, add its old shape to the matching
`LEGACY_*_DEFAULTS` map and its key to `DAY_RULE_DEFAULTS_CHANGED`** (the latter is derived
automatically from the two maps' keys) or existing chief customizations will silently mask the fix.

## When editing
- Since nearly everything is in `ResidentScheduler.jsx`, grep before assuming a helper is unused —
  the file has no module boundaries to enforce dead-code detection.
- No test suite — verify changes by running `npm run dev` and generating/exporting a sample
  schedule (including Generate Schedule on the Schedule tab where relevant).
