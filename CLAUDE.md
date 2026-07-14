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
- **Almost all app logic lives in one file: `src/ResidentScheduler.jsx` (~4,100 lines).**
  `src/` contains only that file plus `main.jsx` (10-line wrapper, no `App.jsx`) and `index.css` —
  expect to spend nearly all edits inside `ResidentScheduler.jsx`.
- Shift catalog is defined as data at the top of `ResidentScheduler.jsx`: `SHIFTS` (id, label, area,
  hours, type: day/eve/night, chip color) and `SHIFT_TIMING` (exact start hour + duration per shift
  id, used for rest-period validation across midnight). `SHIFT_MAP`/`SHIFT_AREAS` are derived from
  `SHIFTS` — add new shift types there, not as ad-hoc strings elsewhere.
- Persistence is local-only: a `useLocalStorage` hook (~line 1028) backs eight state slots under
  `res_*` keys (`LS_BACKUP_KEYS`, ~line 3364): EM roster, current block, blocks history, eligibility
  overrides, AY data, app settings, chief-editable day rules, and shift coverage. The Settings tab
  exports/imports/resets all of them as one JSON backup. No backend, no fetch/Supabase anywhere —
  **a new `res_*` key must be added to `LS_BACKUP_KEYS` or it silently won't round-trip** through
  backup/restore.

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
  `DEFAULT_DAY_RULES`, `DEFAULT_COVERAGE`/`getCoverageFor` (per-shift daily staffing counts used by
  the generator).
- ~336–380 `UTILITIES` — date helpers (`getBlockDates`, `parseDate`/`addDays`/`toDateStr`),
  `getAcademicYearFor`/`getAcademicYear` (AY derived from a date, July cutoff), `applyStartDate`
  (shared start-date handler: auto-fills end date to the configured block length and recomputes AY —
  used by both Home and Settings tabs).
- ~381–494 `ROSTER IMPORT` — `parseRosterText` (parses pasted/uploaded CSV or TSV roster rows into
  `{firstName,lastName,category,pgy}`; tab-delimited or quote-aware CSV, optional header row,
  category matched via `CATEGORY_SYNONYMS`, PGY validated against the category's `pgyOptions`;
  Rotation/date columns are read but ignored) plus `splitCsvLine`/`splitName`/`matchCategory`.
- ~495–670 `REST-PERIOD UTILITIES` / eligibility base — `checkRestViolations`, `isSchedulable`,
  `getShiftTarget`, `getEffectiveEligibility`.
- ~671–848 `ELIGIBILITY LOGIC` — `getEligibleShifts` (jeopardy-call logic lives here) and
  `validateAll()`, the rules/validation engine (also handles jeopardy policy).
- ~849–1025 `SCHEDULE GENERATOR` — `generateSchedule()` (coverage-driven auto-fill: MRV slot
  ordering per day, candidate filtering with named unfilled-reasons, target/type-mix/streak/jeopardy
  scoring; never overwrites a non-empty cell) and `summarizeGenerationReport()` (turns the generator's
  report into grouped, human-readable recommendations for the Violations tab, including "expected
  gap" detection for day-of-week rules like Trauma windows or GR Wednesday).
- ~1026–1035 `HOOKS` — `useLocalStorage`.
- ~1036–3822 tab components in order — `UI PRIMITIVES` (`Modal`, `SectionCard`, `CollapsibleCard`),
  `SPECIAL DAYS LIST`, `DASHBOARD TAB` (special days now live only here, not Home), `HOME TAB`,
  `RESIDENT FORM` (shared by Add/Edit modals, plus `ImportRosterModal` for bulk roster import),
  `EM RESIDENTS TAB`, `OFF-SERVICE TAB` (inline per-tile date-off/jeopardy editors), `SHIFT MATRIX
  TAB` (rotation-aware shift matrix), `RULES TAB` ("Scheduling Rules" in the UI — day/rotation rules
  plus the Daily Shift Coverage editor consumed by the generator), `SHIFT PICKER MODAL` +
  `SCHEDULE GRID` (main editing grid; Generate Schedule / Clear & Regenerate live here),
  `VALIDATION TAB` (violations list plus the Generation Report), `SETTINGS TAB` (backup/restore,
  `LS_BACKUP_KEYS`, jeopardy policy), `USER GUIDE TAB`.
- ~3823–end `MAIN APP` — the `TABS` nav array and root `ResidentScheduler` component: all state via
  `useLocalStorage`, `saveBlock`/`loadBlock`/`newBlock`, `exportCSV`, header/sidebar/tab-routing render.

## Data model & conventions
- Shift IDs follow `AREA-TYPE` (e.g. `POD-D`, `MT-N`, `TRAUMA-D` — note TRAUMA has no evening shift).
  Keep this convention when adding areas/shifts so lookups via `SHIFT_MAP` keep working.
- `SHIFT_TIMING` start/duration hours are used to compute rest periods across midnight — if you add
  a shift, add its timing entry too, or rest-period validation will silently skip it. (`DEFAULT_COVERAGE`
  needs no manual update — it's derived from `SHIFTS` with a default of 1 per shift; 0 only applies to
  a shift id that isn't in `SHIFTS` at all, which can't happen for one you just added there.)
- This repo is **public** — never hardcode real resident names/rosters into source (this happened
  once; use the Import Roster feature on the EM Residents / Off-Service tabs instead, which reads
  pasted/uploaded data into `localStorage` only, never into committed code).
- This is a sibling project to `em-scheduler` (same author, same domain — EM scheduling). If a bug
  or pattern here looks familiar, check `../em-scheduler/CLAUDE.md` for prior hard-won fixes
  (scheduling rules, export patterns, attending-matching) before re-deriving them.

## When editing
- Since nearly everything is in `ResidentScheduler.jsx`, grep before assuming a helper is unused —
  the file has no module boundaries to enforce dead-code detection.
- No test suite — verify changes by running `npm run dev` and generating/exporting a sample
  schedule (including Generate Schedule on the Schedule tab where relevant).
