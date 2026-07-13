# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

EM residency shift scheduler (UH Emergency Medicine) — builds/validates resident schedules across
areas (POD, PED, FLEX, MT, TRAUMA), exports to CSV, with JSON backup/restore in the Settings tab.

## Layout & stack
- Repo root: `C:\Users\amade\projects\resident-scheduler` → GitHub `picklepilk/resident-scheduler`.
- React 19 + Vite 6 + Tailwind CSS · `lucide-react` icons. (`jspdf`/`jspdf-autotable` are declared
  in `package.json` but currently unused — no PDF export is implemented.)
- **Almost all app logic lives in one file: `src/ResidentScheduler.jsx` (~3,000 lines).**
  `src/` contains only that file plus `main.jsx` (10-line wrapper, no `App.jsx`) and `index.css` —
  expect to spend nearly all edits inside `ResidentScheduler.jsx`.
- Shift catalog is defined as data at the top of `ResidentScheduler.jsx`: `SHIFTS` (id, label, area,
  hours, type: day/eve/night, chip color) and `SHIFT_TIMING` (exact start hour + duration per shift
  id, used for rest-period validation across midnight). `SHIFT_MAP`/`SHIFT_AREAS` are derived from
  `SHIFTS` — add new shift types there, not as ad-hoc strings elsewhere.
- Persistence is local-only: a `useLocalStorage` hook (~line 727) backs six state slots under
  `res_*` keys (roster, eligibility overrides, blocks history, current block, academic-year data,
  app settings). The Settings tab exports/imports/resets these as a JSON backup. No backend, no
  fetch/Supabase anywhere.

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
Line numbers drift as the file grows — grep for the names below rather than trusting offsets.
- ~13–305: constants — `SHIFTS`, `SHIFT_TIMING`, `SHIFT_MAP`/`SHIFT_AREAS`, `CATEGORIES`, block
  types (`BLOCK_TYPES_EM`, `TRAUMA_BLOCKS`, `EM_HOME_BLOCK_TYPES_BY_PGY`), `BASE_ELIGIBILITY`.
- ~306–637: date/schedule helpers — `getBlockDates`, `checkRestViolations`, `isSchedulable`,
  `getShiftTarget`, `getEffectiveEligibility`, `getEligibleShifts` (jeopardy-call logic lives here).
- ~638–726: `validateAll()` — the rules/validation engine (also handles jeopardy policy).
- ~727: `useLocalStorage` hook.
- ~737–2793: tab components in order — `DashboardTab`, `AYConferenceEditor`, `HomeTab`, resident
  forms/modals (`ResidentForm` has the jeopardy-date picker), `EMResidentsTab`, `OffServiceTab`,
  `ShiftMatrixTab` (rotation-aware shift matrix), `RulesTab` ("Scheduling Rules" in the UI),
  `ShiftPickerModal` + `ScheduleGrid` (main editing grid), `ValidationTab`, `SettingsTab`
  (backup/restore, jeopardy policy), `UserGuideTab`, and the `TABS` nav array.
- ~2795–end: root `ResidentScheduler` component — all state via `useLocalStorage`,
  `saveBlock`/`loadBlock`/`newBlock`, `exportCSV`, header/sidebar/tab-routing render.

## Data model & conventions
- Shift IDs follow `AREA-TYPE` (e.g. `POD-D`, `MT-N`, `TRAUMA-D` — note TRAUMA has no evening shift).
  Keep this convention when adding areas/shifts so lookups via `SHIFT_MAP` keep working.
- `SHIFT_TIMING` start/duration hours are used to compute rest periods across midnight — if you add
  a shift, add its timing entry too, or rest-period validation will silently skip it.
- This is a sibling project to `em-scheduler` (same author, same domain — EM scheduling). If a bug
  or pattern here looks familiar, check `../em-scheduler/CLAUDE.md` for prior hard-won fixes
  (scheduling rules, export patterns, attending-matching) before re-deriving them.

## When editing
- Since nearly everything is in `ResidentScheduler.jsx`, grep before assuming a helper is unused —
  the file has no module boundaries to enforce dead-code detection.
- No test suite — verify changes by running `npm run dev` and generating/exporting a sample
  schedule.
