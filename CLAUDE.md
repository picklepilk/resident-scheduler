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
- **Almost all app logic lives in one file: `src/ResidentScheduler.jsx` (~5,300 lines).**
  `src/` contains only that file plus `main.jsx` (10-line wrapper, no `App.jsx`) and `index.css` —
  expect to spend nearly all edits inside `ResidentScheduler.jsx`.
- Shift catalog is defined as data at the top of `ResidentScheduler.jsx`: `SHIFTS` (id, label, area,
  hours, type: day/eve/night/**swing**, chip color) and `SHIFT_TIMING` (exact start hour + duration
  per shift id, used for rest-period validation across midnight). `SHIFT_MAP`/`SHIFT_AREAS`/
  `SHIFT_TYPES` are derived from/alongside `SHIFTS` — add new shift types there, not as ad-hoc
  strings elsewhere. `PED-S` (Peds Swing, 11:00–20:00, type `'swing'`) is EM-Home-PGY-2-only and
  only exists Mon/Tue/Thu/Fri (`SHIFT_DOW`) — see "Journal Club / Grand Rounds / circadian rules"
  below for why `'swing'` is its own type rather than reusing `'eve'`.
- Persistence is local-only: a `useLocalStorage` hook (~line 2047) backs nine state slots under
  `res_*` keys (`LS_BACKUP_KEYS`, ~line 4420): EM roster, current block, blocks history, eligibility
  overrides, AY data, app settings, chief-editable day rules, shift coverage, and sidebar tab order.
  The Settings tab exports/imports/resets all of them as one JSON backup. No backend, no
  fetch/Supabase anywhere — **a new `res_*` key must be added to `LS_BACKUP_KEYS` or it silently
  won't round-trip** through backup/restore. Anything read back from a backup (or hand-edited
  localStorage) should be treated as untrusted shape — e.g. `reconcileTabOrder` guards with
  `Array.isArray` before trusting a persisted array, and `getCoverageFor`/`normalizeCoverageEntry`
  accepts either the old single-number coverage shape or the current `{min,max}` shape so an old
  backup restores without a migration step.

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
- ~13–420 `CONSTANTS` — `SHIFTS`, `SHIFT_TIMING`, `SHIFT_MAP`/`SHIFT_AREAS`/`SHIFT_TYPES`,
  `SHIFT_DOW` (weekdays a shift exists at all — currently just `PED-S`; coverage min/max is
  otherwise deliberately NOT day-of-week-dependent), `CATEGORIES`, block types (`BLOCK_TYPES_EM`,
  `TRAUMA_BLOCKS`, `EM_HOME_BLOCK_TYPES_BY_PGY`), `BASE_ELIGIBILITY`, `DEFAULT_DAY_RULES`,
  `SHIFT_TARGETS`/`BLOCK_TARGETS` (rotation-specific target overrides, e.g. US/EM = 5 shifts,
  EM/Res/VAC = 13 — see `getShiftTarget`), `DEFAULT_COVERAGE_MINMAX`/`DEFAULT_COVERAGE`/
  `getCoverageFor`/`normalizeCoverageEntry` (per-shift daily `{min,max}` staffing used by the
  generator — see "Coverage is min/max, not a single number" below), `LEGACY_DAY_RULE_DEFAULTS`/
  `LEGACY_ELIGIBILITY_DEFAULTS`/`DAY_RULE_DEFAULTS_CHANGED` (see "Rule-default migration" below).
  `DEFAULT_DAY_RULES` shapes include `dayTypeRestrictions[].scope: 'generator'` (the shift stays
  manually assignable via the picker; only auto-fill skips it — see `getEligibleShifts`'s `ctx`
  param), `computedDayRules: [{type:'firstFridayOfMonth'}]` (date-computed rules needing no manual
  list, evaluated the same way as `fullBlockDays`), and `shiftGates[].activeWhen:
  {blockStartBefore?, blockStartOnOrAfter?}` (an optional effective-date gate compared against the
  block's own start date — e.g. EM_HOME_2's EM/EMS↔EM/TOX weekday-window swap on 2026-08-01 —
  evaluated by `gateActiveForBlock()`; a gate with no `activeWhen` is always active).
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
- ~500–1060 `REST-PERIOD UTILITIES` / circadian engine — `checkRestViolations` (legal-rest-hour
  check only), then **`CIRCADIAN SCHEDULING RULES`**: `NIGHT_RULES` (`minRun`/`idealRun`/`maxRun`
  4-6-6, `postNightDayRestH` 24, `maxPerBlock` 6), `isNightShiftId`, `isNightOnlyResident` (FM-3 —
  exempt from the block-wide night cap and the short-run warning), `nightRunBefore`/`nightRunAfter`,
  `checkCircadianViolations(resident, dateStr, newShiftId, rs, {nightOnly})` → `[{message,level}]`
  (max-run, <24h post-nights-before-a-day-shift, and eve→day-next-day/reverse are all `'error'`;
  see "Circadian rules" below), then `isTraumaCapSubject`/`getTraumaCap`, `isSchedulable` (EM_HOME/
  EM_BAMC default to the `'EM'` rotation when `blockType` is missing — this is also what fixes
  BAMC residents added via the Off-Service tab, which never assigns one), `isNightOnlyResident`.
- `traumaPedsHalf`/`isTraumaPedsSplitResident`/`TRAUMA_PEDS_SPLIT` ({trauma:8, peds:11}) — the
  combined 19-shift target for TRAUMA_PEDS/PEDS_TRAUMA is enforced as two separate protected
  sub-targets (see "Trauma/Peds split" below), not just a documentation note.
- `isPedsEmMix`/`PEDS_EM_MIX`, then **`SENIOR_COMPOSITION`** ({FLEX:{primary:2,fallback:3},
  POD:{primary:3,fallback:2}}) + `isSeniorFor` — every staffed FLEX/POD shift needs its senior PGY
  (fallback the other), enforced by the generator restricting the candidate pool to the senior
  sub-pool while none is present (falls back to the full pool + a `report.seniorGaps` entry rather
  than leaving a min-coverage slot empty), and warned on in `validateAll` if a staffed group ends
  up without one.
- **`JOURNAL CLUB`** section — `JC_MAX_PER_AY` (3), `isFirstTuesday`/`getFirstTuesdaysInRange`,
  `shiftOverlapsJC(sid)` (timing-derived: any shift whose interval overlaps 18:00-21:00 — covers
  PED-S and Trauma Night automatically, no hand-maintained shift-id list), `ayWindowFor(ayString)`
  (July 1–July 1 from an `"AY26/27"`-style string), `countPublishedJC`/`countCurrentBlockJC` (cross-
  block counting reads `published` saved-block snapshots — see "Published blocks" below).
- `getEligibleShifts(resident, dateStr, ..., ctx)` (jeopardy-call logic lives here, plus the
  Peds/Trauma half-block split via `traumaPedsHalf`, off-service availability via
  `isAvailableOnDate`, JC-presenter shift stripping, and Grand-Rounds-lecture day-before stripping;
  `ctx = {blockStart, forGenerator}` — `blockStart` is needed for the half-block split AND for
  `activeWhen` gate evaluation, `forGenerator` gates `scope:'generator'` restrictions and the
  generator-only late-night-after-JC-presenting avoidance) and `validateAll()`, the rules/validation
  engine (jeopardy policy, 7-consecutive-work-day rule, trauma double-booking, min/max coverage,
  circadian night-run/turnaround checks, FLEX/POD seniority, Journal Club cap/presenter checks,
  Grand Rounds lecture day-before check — see each feature's section below for specifics).
  `grWorkDow`/`isStreakWorkDay`/`runLengthIfWorked` implement the ≤7-consecutive-work-day rule
  (Grand Rounds counts as a work day even with no assigned shift) shared by both; `grWorkDow` is
  also reused to validate a resident's `grLectureDates` fall on their own GR weekday.
- `SCHEDULE GENERATOR` — `generateSchedule()` (coverage-driven auto-fill: MRV slot ordering per
  day, candidate filtering with named unfilled-reasons — including `halfTargetMet`,
  `circadianBlocked`, `nightCapped`, `jcCapped` — target/type-mix/streak/jeopardy/trauma-nights-
  preferred/peds-mix/night-clustering/seniority/JC-avoidance scoring; recomputes the candidate pool
  fresh for every slot — a cached pool went stale mid-day and caused double-booking once, so don't
  reintroduce that; never overwrites a non-empty cell). Fill happens in **three passes** via
  `fillDayPass(ds, includeShift, phase)` — `phase:'min'` fills every shift to its configured
  minimum (everything except TRAUMA-D across the whole block, then TRAUMA-D alone, because PGY-1
  trauma-day shifts are meant to be the final fill step — don't collapse the first two passes back
  into one without re-deriving why), then `phase:'optional'` tops up toward each shift's maximum
  only for residents still under their own target (an empty pool in this phase is silently
  skipped — max is a cap, not a requirement, so it's neither `unfilled` nor counted in
  `totalSlots`). `summarizeGenerationReport()` turns the generator's report into grouped,
  human-readable recommendations for the Violations tab, including "expected gap" detection for
  day-of-week rules (Trauma windows, GR Wednesday) and for PED-N (FM-3-exclusive — see below).
- `HOOKS` — `useLocalStorage`.
- tab components in order — `UI PRIMITIVES` (`Modal`, `SectionCard`, `CollapsibleCard`,
  `CollapsibleHeader`), `SPECIAL DAYS LIST`, `DASHBOARD TAB` (special days now live only here, not
  Home), `HOME TAB` (`ImportMatrixModal` lives just above it — see "Matrix Import" above; the Saved
  Blocks list also has a **Publish/Published** toggle per snapshot — see "Published blocks" below),
  `RESIDENT FORM` (shared by Add/Edit modals, plus `ImportRosterModal` for bulk roster import —
  `jcPresentDates`/`grLectureDates` date-chip editors live here alongside `approvedDatesOff`/
  `jeopardyDates`), `EM RESIDENTS TAB`, `OFF-SERVICE TAB` (inline per-tile date-off/jeopardy
  editors), `SHIFT MATRIX TAB` (rotation-aware shift matrix), `RULES TAB` ("Scheduling Rules" in
  the UI — day/rotation rules plus the Daily Shift Coverage editor, now paired min/max inputs per
  shift, consumed by the generator), `SHIFT PICKER MODAL` + `SCHEDULE GRID` (main editing grid;
  Generate Schedule / Clear & Regenerate live here), `VALIDATION TAB` (violations list plus the
  Generation Report — now also shows `report.seniorGaps`), `SETTINGS TAB` (backup/restore,
  `LS_BACKUP_KEYS`, jeopardy policy), `USER GUIDE TAB`.
- `MAIN APP` — the `TABS` nav array; `reconcileTabOrder`/`reorderIds` (pure helpers behind
  the sidebar's drag-to-reorder — reconcile guards against a non-array persisted order, reorder
  always lands the dragged tab immediately before the drop target regardless of drag direction);
  `SidebarNav` (own component, not inlined in the root — keeps drag-hover state from re-rendering
  whatever tab content is currently mounted); the root `ResidentScheduler` component: all state via
  `useLocalStorage`, `saveBlock`/`loadBlock`/`newBlock`/`toggleBlockPublished`, `exportCSV`,
  header/tab-routing render. `saveBlock` explicitly preserves an existing snapshot's `published`
  flag when re-saving the same block id (a snapshot is replaced wholesale, so this is easy to lose).

## Data model & conventions
- Shift IDs follow `AREA-TYPE` (e.g. `POD-D`, `MT-N`, `TRAUMA-D` — note TRAUMA has no evening shift;
  `PED-S` is the one exception to the `AREA-TYPE` = `AREA-first-letter-of-type` convention reading
  cleanly, since its type is `'swing'`). Keep this convention when adding areas/shifts so lookups
  via `SHIFT_MAP` keep working.
- `SHIFT_TIMING` start/duration hours are used to compute rest periods across midnight — if you add
  a shift, add its timing entry too, or rest-period validation will silently skip it. `DEFAULT_COVERAGE`
  needs no manual update for a shift already in `DEFAULT_COVERAGE_MINMAX` — a shift missing from that
  map falls back to `{min:1,max:1}` in `DEFAULT_COVERAGE`, and `{min:0,max:0}` only if it isn't in
  `SHIFTS` at all (can't happen for one you just added there).
- **Coverage is min/max, not a single number.** `getCoverageFor(shiftId, coverage)` returns
  `{min,max}` — the generator fills every shift to `min` first (hard: below-min is an `unfilled`
  slot and a Validation warning), then optionally tops up toward `max` only for residents still
  under their own shift-count target (soft: `max` is a cap on how many CAN work a shift, never a
  requirement that they do). `normalizeCoverageEntry` accepts the legacy single-number shape from
  an old backup and converts it to `{min:n,max:n}` at read time — no migration effect needed.
  PED-N defaults to `{min:0,max:1}` since it depends entirely on an FM-3 being on the block; TRAUMA-D/
  TRAUMA-N are always clamped to max 1 in the editor (see the trauma double-booking rule below).
  Coverage is intentionally NOT day-of-week-dependent (the chief's call) — `PED-S` is the one
  shift that only exists on certain weekdays at all, handled via the separate `SHIFT_DOW` map, not
  a general per-day coverage feature.
- **PED-N (Peds Night) is FM-3-exclusive program-wide**, and **PED-S (Peds Swing) is EM-Home-PGY-2-
  on-EM/TOX-or-EM/EMS-only program-wide** — no other category/PGY may ever be eligible for either,
  including via a Shift Matrix rotation override (`overrideImmune: true` gates enforce this for
  PED-S; PED-N is enforced by never appearing in any other category's `BASE_ELIGIBILITY`). If you
  add a new eligibility entry, don't add PED-N or PED-S to it.
- **EM_HOME_2's EM/EMS ↔ EM/TOX weekday windows swap on 2026-08-01** (chief-directed change, not a
  bug): before that date EM/EMS covers Mon/Tue and EM/TOX covers Thu/Fri; from that date on it's
  reversed. Both variants live in `DEFAULT_DAY_RULES.EM_HOME_2.shiftGates` simultaneously,
  distinguished by `activeWhen`, so a saved block's own `startDate` always resolves to the correct
  rule — don't try to "clean up" this into a single gate.
- **Circadian rules** (see `NIGHT_RULES`): nights should cluster into one run of 4-6 (max 6, hard);
  ≥24h off is required before resuming a day shift after a night run (Grand Rounds the next morning
  is fine — GR isn't a shift, so it never appears in the schedule map and never trips this check);
  an evening shift can never be immediately followed by a day shift the next day, or vice versa
  (hard, even when the plain rest-hour math would otherwise clear it); max 6 total night shifts per
  block, except residents whose entire eligibility is night-only (today: FM-3) — `isNightOnlyResident`
  exempts them from both the per-block cap and the short-run warning, since FM-3's Mon/Tue/Wed-only
  day rule makes a 4+-night run structurally impossible anyway.
- **Journal Club**: first Tuesday of each month, 18:00-21:00; "worked" is derived from
  `SHIFT_TIMING` overlap (`shiftOverlapsJC`), not a hand-maintained shift-id list, so it
  automatically covers PED-S and Trauma Night. Max 3 worked per academic year (July 1–July 1),
  counted across **Published** saved blocks plus the live block (`countPublishedJC`/
  `countCurrentBlockJC`) — an unpublished saved block does NOT count, so the chief must mark a
  block Published once it's final for the cap to track it correctly. Presenting dates
  (`resident.jcPresentDates`) are chief-set per resident on the profile, validated to fall on a
  first Tuesday; a presenter's own overlapping shifts are hard-stripped from their eligibility that
  day, and the generator additionally avoids placing a late night shift that evening (manually
  placeable, with a Validation warning).
- **Grand Rounds lecture dates** (`resident.grLectureDates`, EM_HOME + EM_BAMC): no evening/night
  shift the day before a lecture date — hard-stripped from eligibility (generator and manual
  picker both), `validateAll` errors if a stale/imported schedule violates it. Validated to fall on
  the resident's own GR weekday via `grWorkDow` (Wednesday for EM_HOME, Thursday for EM_BAMC).
- **FLEX/POD seniority** (`SENIOR_COMPOSITION`): every staffed FLEX shift needs an EM PGY-2 (fallback
  PGY-3); every staffed POD shift needs an EM PGY-3 (fallback PGY-2). The generator restricts the
  candidate pool to the senior sub-pool while none is present for that shift/day, falling back to
  the full pool (recording a `report.seniorGaps` entry) only if no senior is available at all —
  staffing junior beats leaving a min-coverage slot empty.
- **Trauma/Peds rotation 8/11 split** (`TRAUMA_PEDS_SPLIT`): the combined 19-shift target for
  TRAUMA_PEDS/PEDS_TRAUMA is enforced as two separate protected sub-targets (8 trauma-half shifts,
  11 peds-half shifts) via per-resident sub-caps in the generator's `candidatePool`, not just the
  single combined number — the peds half (filled first, since Trauma Day is generated last) can no
  longer silently consume the trauma half's budget.
- **BAMC residents are schedulable by default.** `isSchedulable` falls back to the `'EM'` rotation
  for EM_HOME/EM_BAMC residents with no `blockType` set — this is what makes BAMC residents added
  via the Off-Service tab (which never assigns a `blockType`) actually appear in generated
  schedules; it's a read-time fallback, so it also fixes any already-saved BAMC resident with no
  code change needed on their record.
- Off-service residents (`block.offServiceResidents[]`) carry `availabilityMode: 'full'|'ranges'|
  'days'` plus `availableRanges: [{start,end}]` / `canWorkDates: []`, checked by
  `isAvailableOnDate()` in `getEligibleShifts`. These fields live inside the block object, so they
  ride along with existing persistence/backup — no new `LS_BACKUP_KEYS` entry needed for
  resident-level fields like this. The same is true of `jcPresentDates`/`grLectureDates` on
  `emRoster` entries — they ride inside `res_em_roster`, no new key needed.
- `blocksHistory` snapshots now carry a `published: boolean` field (default falsy for old/absent
  snapshots — no migration needed) — see "Published blocks" above. `saveBlock` must read any
  existing snapshot's `published` value before building the replacement snapshot, or re-saving a
  published block silently un-publishes it.
- This repo is **public** — never hardcode real resident names/rosters into source (this happened
  once; use the Import Roster feature on the EM Residents / Off-Service tabs, or Import Master Matrix
  on the Home tab, instead — both read pasted/uploaded data into `localStorage` only, never into
  committed code).
- This is a sibling project to `em-scheduler` (same author, same domain — EM scheduling). If a bug
  or pattern here looks familiar, check `../em-scheduler/CLAUDE.md` for prior hard-won fixes
  (scheduling rules, export patterns, attending-matching) before re-deriving them.
- **Watch for temporal-dead-zone bugs with top-level `const`s.** Module-level `const` declarations
  execute top-to-bottom; a `const` whose initializer references another `const` declared *later* in
  the file throws "Cannot access '...' before initialization" at load time even though `npm run
  build` succeeds (Vite/esbuild bundle without executing the code, so this class of bug is silent
  until the browser actually loads the page). `RULE_NOTES`'s prose constants hardcode numbers that
  duplicate `NIGHT_RULES`/`JC_MAX_PER_AY`/`TRAUMA_PEDS_SPLIT` rather than referencing those objects,
  specifically to avoid this — if you change one of those numbers, update the matching prose too.

## Rule-default migration
`getEffectiveDayRules`/`getEffectiveEligibility` replace a `CATEGORY_PGY` key's default *wholesale*
with any chief-saved override — so when a `DEFAULT_DAY_RULES`/`BASE_ELIGIBILITY` entry is corrected,
an old saved override that happens to equal a *previous* default would silently keep masking the
fix forever. `LEGACY_DAY_RULE_DEFAULTS`/`LEGACY_ELIGIBILITY_DEFAULTS` map each key to an **array**
of pre-correction snapshots (one entry per correction pass over time — a key can accumulate more
than one as the rules evolve across multiple sessions, e.g. `EM_HOME_2` now holds both its
original legacy shape and its pre-PED-S/pre-Aug-2026-swap shape); a one-time mount effect in the
root component prunes any saved override that still deep-equals *any* snapshot in that key's array
(`legacyList.some(shape => deepEqualNormalized(...))`), so the corrected default takes over.
Overrides that don't match (genuinely customized) are left alone but flagged with an amber badge on
the Rules tab (`DAY_RULE_DEFAULTS_CHANGED`) so the chief knows to review them. **Whenever you
correct a `DEFAULT_DAY_RULES`/`BASE_ELIGIBILITY` entry, push its old shape onto the matching key's
array in `LEGACY_*_DEFAULTS`** (creating the array if the key is new to it) **and add its key to
`DAY_RULE_DEFAULTS_CHANGED`** (the latter is derived automatically from the two maps' keys) or
existing chief customizations will silently mask the fix.

## When editing
- Since nearly everything is in `ResidentScheduler.jsx`, grep before assuming a helper is unused —
  the file has no module boundaries to enforce dead-code detection.
- No test suite — verify changes by running `npm run dev` and generating/exporting a sample
  schedule (including Generate Schedule on the Schedule tab where relevant).
