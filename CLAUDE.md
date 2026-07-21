# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

EM residency shift scheduler (UH Emergency Medicine) — builds/validates resident schedules across
areas (POD, PED, FLEX, MT, TRAUMA), can **auto-generate** a schedule from coverage rules, exports
to CSV, with JSON backup/restore in the Settings tab.

## Layout & stack
- Repo root: `C:\Users\amade\projects\resident-scheduler` → GitHub `picklepilk/resident-scheduler`
  (public repo — never commit real resident names/PII; see "Data model & conventions" below).
- React 19 + Vite 6 + Tailwind CSS · `lucide-react` icons. `jspdf`/`jspdf-autotable` power the PDF
  export (matrix + per-resident pages) — see "PDF export" below for a version-specific import
  gotcha with the installed `jspdf-autotable@3.8.4`.
- `xlsx` (SheetJS) parses the Master Matrix import (below). Installed from SheetJS's own CDN tarball
  (`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` in `package.json`), **not** the npm
  registry package — the registry build is frozen at 0.18.5 with unpatched prototype-pollution/ReDoS
  CVEs that SheetJS only fixes in CDN-published builds. Keep installing/upgrading this dependency via
  a pinned CDN tarball URL, never `npm install xlsx`.
- **Almost all *scheduling* logic lives in one file: `src/ResidentScheduler.jsx` (~7,860 lines)** —
  expect to spend nearly all scheduling edits there. The rest of `src/` is the auth + day-off-request
  surface, which is deliberately kept out of that file (see "Auth, roles & the day-off request
  feature" below): `main.jsx` (route split — `/requests` → `ResidentRequestsApp`, everything else →
  `AppGate`), `AppGate.jsx` (whole-app login/role gate), `supabaseClient.js` (`AUTH_ENABLED`, the
  shared client), `RequestsTab.jsx` (admin-facing approval queue + admin management), and
  `residentRequests/` (`LoginScreen`, `ResidentPicker`, `RequestForm`, `RequestList`,
  `ResidentRequestsApp`, `blockLookup.js`). **Nothing under `residentRequests/` imports from
  `ResidentScheduler.jsx`** — it's a separate surface that fetches its own data from the shared
  `res_state` row; keep it that way.
- Shift catalog is defined as data at the top of `ResidentScheduler.jsx`: `SHIFTS` (id, label, area,
  hours, type: day/eve/night/**swing**, chip color) and `SHIFT_TIMING` (exact start hour + duration
  per shift id, used for rest-period validation across midnight). `SHIFT_MAP`/`SHIFT_AREAS`/
  `SHIFT_TYPES` are derived from/alongside `SHIFTS` — add new shift types there, not as ad-hoc
  strings elsewhere. `PED-S` (Peds Swing, 11:00–20:00, type `'swing'`) is EM-Home-PGY-2-only and
  only exists Mon/Tue/Thu/Fri (`SHIFT_DOW`) — see "Journal Club / Grand Rounds / circadian rules"
  below for why `'swing'` is its own type rather than reusing `'eve'`.
- Persistence is local-first, with optional cloud sync layered on top: a `useLocalStorage` hook
  backs ten state slots under `res_*` keys, synchronously written to `localStorage` on every
  change regardless of whether cloud sync is configured. Nine round-trip through
  `LS_BACKUP_KEYS`: EM roster, current block, blocks history, eligibility overrides, AY data, app
  settings, chief-editable day rules, shift coverage, and sidebar tab order. The Settings tab
  exports/imports/resets all nine as one JSON backup (kept as a manual, offline safety net — see
  "Cloud sync" below for the automatic path) — **a new `res_*` key must be added to
  `LS_BACKUP_KEYS` or it silently won't round-trip** through backup/restore **or cloud sync**
  (the sync payload is built directly from that same list). The tenth slot, `res_dark_mode`, is
  **deliberately excluded** from `LS_BACKUP_KEYS` — it's a device/viewer display preference, not
  chief scheduling data, so restoring a colleague's backup (or syncing from another device)
  shouldn't flip your own theme (see "Dark mode" below). Anything read back from a backup, cloud
  row, or hand-edited localStorage should be treated as untrusted shape — e.g. `reconcileTabOrder`
  guards with `Array.isArray` before trusting a persisted array, and
  `getCoverageFor`/`normalizeCoverageEntry` accepts either the old single-number coverage shape or
  the current `{min,max}` shape so an old backup restores without a migration step.
- **Cloud sync** (`// ─── SUPABASE SYNC ───` section, before `LS_BACKUP_KEYS`): optional
  cross-device sync via a hand-rolled `fetch`-based PostgREST client (`sbFetch`, no
  `@supabase/supabase-js` dependency — ported from the sibling em-scheduler app's proven pattern),
  gated by a module-level `SUPABASE_ENABLED` flag computed from `VITE_SUPABASE_URL`/
  `VITE_SUPABASE_ANON_KEY` (see `.env.example`) — absent, the app behaves exactly as before this
  feature existed. Env vars are injected via Vite's `%VITE_*%` HTML token substitution into
  `window.__SUPABASE_URL__`/`__SUPABASE_ANON__` (not `import.meta.env` directly); an
  `isUnresolvedToken` guard treats a literal unresolved `%VITE_...%` string (what Vite leaves in
  place, not an empty string, when the var isn't defined for that build — verified: a build with
  no `.env` leaves the literal token in `dist/index.html`) the same as "not configured," so a
  fork/preview build without the vars set falls back to clean local-only mode instead of a
  permanent "Sync error." One Supabase table, `res_state`, one fixed row (`id: 'main'`) holding
  the whole `LS_BACKUP_KEYS`-shaped document as a single `jsonb` blob — unlike a per-record table,
  nothing here needs independent archiving at the row level, so one row is the right shape (see
  the section's own comment for the exact schema/RLS policy, and for the note that this policy is
  intentionally wide-open, same posture em-scheduler already accepts). The payload, the overlay,
  and the baseline snapshot are all derived from `LS_BACKUP_KEYS` via a single `syncBindings`
  map (`key → [value, setter]`) in the root — a new `res_*` key added to `LS_BACKUP_KEYS` flows
  through sync automatically; wiring it into `syncBindings` is the only extra step, and forgetting
  throws rather than silently not syncing. A debounced (1.5s) `useEffect` upserts, but only when
  the current values differ (by reference) from `cloudBaselineRef` (what the cloud is known to
  hold) — so the mount `dbReady` flip doesn't re-upload the just-loaded document, and a load that
  returned nothing (empty cloud) seeds the row on first write. **`dbReady` gates all cloud writes
  and stays FALSE if the mount-time `sbLoadState` fails** — critical: a device that never
  successfully read the cloud must not later overwrite it with un-merged local state (that would
  silently destroy another device's newer data); the pill shows "Sync error," local editing still
  works, and a reload retries cleanly. The mount overlay applies each key individually with a
  `!= null` guard (so a missing OR explicitly-null cloud key never wipes/nulls a local field).
  Conflict handling is last-write-wins/full-document-overwrite — no merge, no version check, same
  accepted tradeoff as em-scheduler (one coordinator, multiple devices, used sequentially not
  concurrently). `sbFetch` bounds every request with a 15s `AbortController` timeout so a hung
  network surfaces as an error rather than freezing the UI (notably the import/clear awaits).
  `SettingsTab`'s `clearAll()`/`importData()` **gate the local wipe/write + reload on the cloud
  op (`sbDeleteState`/`sbSaveState`) succeeding first** — if the cloud op fails, nothing changes
  locally and an error toast asks the user to retry, because committing locally then reloading
  would let the mount overlay revert it from the still-stale/still-intact row; both also set the
  module-level `syncSuspended` flag so the root's debounced auto-save can't race a stale write
  onto the row mid-operation, and `importData` pushes only `LS_BACKUP_KEYS` keys (never
  `res_dark_mode`) into the shared document.

- **User feedback** (`// ─── FEEDBACK ───` section, after the Supabase sync helpers; `// ─── FEEDBACK WIDGET ───`/`// ─── FEEDBACK ADMIN TAB ───` sections near `MAIN APP`): a floating bug/crash/idea widget (hidden when `SUPABASE_ENABLED` is false) posts to a separate `feedback` table in the same shared Supabase project via `submitFeedback()` — insert-only for the anon key (no `SELECT`/`UPDATE`/`DELETE` RLS policy for anon, unlike `res_state`'s wide-open posture). Every row carries `app_name: 'resident-scheduler'` since the table is shared with `em-scheduler`. `main.jsx` installs a `window.onerror`/`unhandledrejection` listener that auto-submits `type: 'crash'` reports through the same helper, deduped per session via `sessionStorage` and capped at 5/session. The only way to *read* feedback is the password-gated "Feedback" sidebar tab (also hidden when `SUPABASE_ENABLED` is false), which calls `netlify/functions/feedback-admin.js` — a server-only Netlify Function using the `SUPABASE_SERVICE_ROLE_KEY` env var to bypass RLS, gated by an `x-feedback-password` header checked against `FEEDBACK_ADMIN_PASSWORD`. Both of those are server-only Netlify environment variables (set in the Netlify dashboard for this site) — never `VITE_`-prefixed, never routed through the `%VITE_*%` HTML-token mechanism `index.html` uses for the client-exposed Supabase URL/anon key. See `.env.example` for the full list and `docs/superpowers/specs/2026-07-18-user-feedback-design.md` for the original design.

## Auth, roles & the day-off request feature
Everything below is gated on `AUTH_ENABLED` (`src/supabaseClient.js`) — `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` + `VITE_ALLOWED_EMAIL_DOMAIN` all set. With any of them missing the
behavior **depends on build mode**: a dev build (`import.meta.env.DEV`) falls through to the
scheduler unauthenticated, so local work needs no Supabase project; a **production build fails
closed** and renders `AuthMisconfigured` instead. Keep that asymmetry — the dev fallthrough is
deliberate convenience, but letting it apply to a production build means one missing env var
silently ships a fully open app to the internet.

- **The whole app is behind login** (`src/AppGate.jsx`, rendered by `main.jsx` for every route
  except `/requests`). It resolves session → `profiles.role` → one of three branches: `admin`
  gets the full `ResidentScheduler`; `resident` gets only `RequestForm` + `RequestList` (the same
  components the standalone `/requests` route uses, which is why they carry no `min-h-screen`
  assumptions); `pending` gets a waiting screen and nothing else. `ResidentScheduler.jsx` itself
  has **no** auth logic beyond the header sign-out button and `refreshPendingRequests`'s
  `role !== 'admin'` badge gate — the gate lives entirely outside it, so that file's ~37 top-level
  hooks are untouched by auth state.
- **Three roles, not two** (`profiles.role`, CHECK-constrained): `pending` → `resident` → `admin`.
  `pending` is the default for every new signup and means *zero* access. There is no separate
  "chief" role — the chief resident is just an admin (renamed wholesale in
  `migrate_chief_to_admin.sql`; if you find a stray `'chief'` string in SQL or JSX it's a leftover
  and should be `'admin'`).
- **Self-promotion is impossible by construction.** `profiles_insert_own` pins new rows to
  `pending`; `enforce_profile_role_change_rules` (BEFORE UPDATE) blocks *any* self-role-change and
  restricts cross-account updates to the `role` column only. Admins approve/promote others from
  the `AdminManagement` section of `src/RequestsTab.jsx`. Bootstrapping the very first admin still
  needs one manual `update profiles set role='admin'` — unavoidable, nothing exists yet to grant it.
- **Pre-authorization allowlist** (`migrate_admin_email_allowlist.sql`): an address in
  `admin_email_allowlist` lands in `admin` on first login instead of `pending`, so a known
  incoming admin doesn't need someone else present to approve them. **The addresses are DATA and
  live only in the database — never in this repo, which is public.** The committed migration
  carries the mechanism and a placeholder example; if you need to know who's on the list, query
  the table. Two non-obvious constraints, both load-bearing: the promotion keys off
  `auth.jwt()->>'email'` and **never** `new.email` (AppGate's upsert sends `email` in its payload,
  so it's client-controlled — keying off it would let anyone claim an allowlisted address), and
  the membership check is a *zero-argument* function so it can't be used as an email-enumeration
  oracle. The table has RLS on with **no policies at all**, deliberately: that makes it
  unreachable from any signed-in session. Also note the allowlist only affects a row's **first**
  creation — removing an address never demotes an existing admin.
- **Domain restriction is enforced server-side**, not just in `LoginScreen`'s client check:
  `auth_hook_domain_restriction.sql` defines `restrict_signup_domain(event jsonb)`, wired in the
  dashboard under Authentication → Hooks → "Before User Created". The SQL alone does nothing until
  that dashboard wiring exists — it was unwired (and therefore unenforced) for a while, so verify
  rather than assume. The domain is hardcoded in that function and must match
  `VITE_ALLOWED_EMAIL_DOMAIN` exactly. Test it with a real API call, not just by reading the code:
  `POST {url}/auth/v1/otp` with an out-of-domain address should return 403.
- **RLS is the actual security boundary; the UI gates are convenience.** Residents are scoped by
  `resident_id` matched against their own profile row; admins get blanket access via the
  `is_admin()` SECURITY DEFINER helper (a plain subquery on `profiles` inside a `profiles` policy
  causes "infinite recursion detected in policy" — that's why the helper exists, don't inline it).
  Column-level scoping isn't expressible in `WITH CHECK`, so four BEFORE triggers do that work:
  `enforce_cancel_only_status`, `enforce_request_identity_immutable`,
  `enforce_resident_id_immutable`, `enforce_profile_role_change_rules`. A fifth,
  `apply_admin_allowlist`, promotes rather than guards (see the allowlist bullet above).
- **`role = 'pending'` must be enforced in RLS, never only in the client.** Every resident-facing
  policy folds `role <> 'pending'` into its `profiles` subquery, and `profiles_update_own` requires
  it in `USING`. This was a real, confirmed hole: for a while `pending` was checked only by
  `AppGate`'s client branch and only on `/`, so an unapproved account could open `/requests`, claim
  any roster resident who hadn't registered yet, and submit requests as them — impersonation, not
  just self-service. If you add a table residents touch, gate it the same way
  (`migrate_block_pending_account_access.sql` is the reference).
- **`supabase/*.sql` are run-by-hand, in order, and are not migration-tool-managed.**
  `day_off_requests.sql` is the fresh-install baseline (kept current, so a new project needs only
  it); the `migrate_*.sql` files are one-time deltas for the already-provisioned production DB, and
  re-running the baseline does **not** apply them. When you change the schema, update the baseline
  *and* add a companion `migrate_*.sql` — same pattern as `LEGACY_DAY_RULE_DEFAULTS` elsewhere in
  this file. Apply with `npx supabase db query --linked -f <file>` (the CLI isn't on PATH; `npx`
  it). **`--linked` follows `supabase/.temp/`, which is independent of whatever project the
  dashboard has selected** — a migration has already been run against the wrong sibling project
  once by having the dashboard on `EMS Inventory`.
- One known gap, accepted: `blockLookup.js` reads the whole shared `res_state` blob (including the
  full schedule) to the resident's browser before narrowing it. "Residents never see the schedule"
  is UI-enforced only. See that file's own header comment.

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
  4-6-6, `postNightDayRestH` 24, `maxPerBlock` 6), `GR_START_HOUR` (08:00, Grand Rounds start used
  by the postNightRest soft rule), `isNightShiftId`, `isNightOnlyResident` (FM-3 — exempt from the
  block-wide night cap and the short-run warning), `nightRunBefore`/`nightRunAfter`, `grRestGapH`
  (hours between a night shift's end and Grand Rounds on the resident's next GR weekday — GR is
  never a schedule entry, so this is the only way the postNightRest rule can see it), then
  `checkCircadianViolations(resident, dateStr, newShiftId, rs, {nightOnly})` →
  `[{message,level,rule?}]` (max-run and eve→day-next-day/reverse are hard `'error'`; the ≥24h
  post-night rest preference — including Grand Rounds the next morning — is `'warn'` tagged
  `rule:'postNightRest'`, a ranked **soft rule** the generator only breaks per `appSettings.
  rulePriority` — see "Soft Rule Priority" below; the check runs in **both directions** — backward
  from an incoming day shift AND forward from an incoming night shift to a day shift already
  sitting 1-2 days later, since the generator's optional fill pass can place a night shift after a
  day shift is already scheduled), then `isTraumaCapSubject`/`getTraumaCap`, `isSchedulable` (EM_HOME/
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
  `CollapsibleHeader`, `SubTabs` — segmented-control sub-view switcher, ported from the sibling
  `em-scheduler` app; `StatCard` — Dashboard summary tile, also ported from em-scheduler;
  `AutosaveIndicator` — "Saving…"/"Saved locally" pill, now also cloud-aware
  ("Synced"/"Sync error") when cloud sync is configured — see "Cloud sync" above), `SPECIAL DAYS
  LIST`, `DASHBOARD TAB` (special days now live only here, not
  Home; opens with a `StatCard` row — schedulable residents, shifts filled vs minimum coverage,
  error/warning counts, days remaining — computed via `computeCoverageByDate` (shared with the
  Schedule tab, see below) and the root's consolidated `issues`/`issueCounts` memo, never a second
  `validateAll` pass; also hosts `JournalClubPlanner` — read-only card listing every first Tuesday
  of the AY with each PGY-1/2/3 presenter slot from `jcPresentDates`, plus per-resident worked-JC
  counts vs `JC_MAX_PER_AY`; presenter editing itself stays on the resident profile), `HOME TAB`
  (`ImportMatrixModal` lives just above it — see "Matrix Import" above; the Saved Blocks list also
  has a **Publish/Published** toggle per snapshot, wired through the root's `toggleBlockPublished`
  — see "Published blocks" below), `RESIDENT FORM` (shared by Add/Edit modals, plus
  `ImportRosterModal` for bulk roster import — `jcPresentDates`/`grLectureDates` date-chip editors
  live here alongside `approvedDatesOff`/`jeopardyDates`), `EM RESIDENTS TAB`, `OFF-SERVICE TAB`
  (inline per-tile date-off/jeopardy editors), `SHIFT MATRIX TAB` (rotation-aware shift matrix),
  `RULES TAB` ("Scheduling Rules" in the UI — day/rotation rules plus the Daily Shift Coverage
  editor, now paired min/max inputs per shift, consumed by the generator), `SHIFT PICKER MODAL`
  (its violation aggregator is the module-level `cellViolations(resident, dateStr, sid, block,
  eligOverrides, appSettings, dayRules)`, shared with the grid's drag-and-drop below so both
  surfaces can't drift apart on what counts as a violation) + `SCHEDULE GRID` (main editing grid;
  Generate Schedule / Clear & Regenerate live here, gated by `checkGenerateReadiness` — see
  "Pre-generation readiness gate" below; a Grid/By Resident/Calendar `SubTabs` toggle switches to
  `ResidentCardsView` — one card per resident, shifts grouped by week, reusing the grid's own
  `violMap` memo rather than a second `validateAll` run — or `ScheduleCalendarView` — continuous
  Sunday-start week rows for the whole block via `buildWeekRows` (no month-pagination; a block
  routinely spans two calendar months), with a per-shift-area filter and chip clicks opening the
  same `ShiftPickerModal` the grid uses; the grid also renders a **daily coverage footer** — one
  summary row of `filled/minTotal` per date via the module-level `computeCoverageByDate` (shared
  with the Dashboard stat tiles and the Calendar view so none of the three can drift), computed
  directly from the full schedule, never the category-filtered rows, plus click-to-expand
  per-shift rows — and supports **drag-and-drop**: dragging a shift chip onto an empty cell moves
  it, onto an occupied cell swaps the two, via `handleDrop`/`commitDrop`; both sides are validated
  with `cellViolations` against a schedule with the *other* side's stale date cleared first
  (`scheduleClearing`) so a same-resident move can't false-positive against its own old cell;
  violations open `DragConfirmModal` for an explicit override, matching the picker's "Assign
  Anyway" philosophy), `VALIDATION TAB` (violations list plus the Generation Report — now also
  shows `report.seniorGaps`/`report.restCompromises`; its post-night-day/eve-day pairwise check
  also delegates to `checkCircadianViolations` rather than re-deriving the same rule),
  `SETTINGS TAB` (backup/restore, `LS_BACKUP_KEYS`, jeopardy policy), `USER GUIDE TAB`. The
  **Requests** tab is the one tab whose component lives outside this file (`src/RequestsTab.jsx`) —
  it does its own session/role check rather than trusting the caller, so it stays correct even
  though `AppGate` has already established the viewer is an admin. Unlike `feedback`, it is *not*
  filtered out of `TABS` when unconfigured; it renders its own "not configured" message instead.
- **Pre-generation readiness gate** (`checkGenerateReadiness`, near the Journal Club helpers):
  before Generate Schedule runs, warns — with a "Generate Anyway" override — if the block's manual
  dates look incomplete: `getMissingSpecialDayLists` flags any special-day list
  (`SPECIAL_DAY_META`: Code Blue/Advocacy/Procedure/Anesthesia) that's *relevant* to a schedulable
  resident on this block (derived from each resident's effective `specialDayRules`, not
  hardcoded) and still empty, and `getJCPresenterGaps` flags any first Tuesday inside the block's
  own date range with no PGY-1/2/3 Journal Club presenter (`jcPresentersFor` — extracted from
  `JournalClubPlanner`'s inline filter so the gate and the planner card can't drift). Clear &
  Regenerate surfaces the same `ReadinessWarningPanel` inside its own confirm modal rather than
  stacking a second one.
- **PDF export** (`// ─── PDF EXPORT ───` section, before `HOOKS`): `exportMatrixPDF` (residents ×
  dates on landscape A3 — a ~28-day block's date columns don't fit legibly on letter/A4) and
  `exportResidentCalendarPDF` (one page per schedulable resident, Date/Shift/Time/Notes rows,
  Notes carrying the same OFF/jeopardy/JC-presenting/GR-lecture markers `ResidentCardsView` shows
  on screen), both via a header "PDF" button → format-picker `Modal` → the existing
  `requestExport`/`exportConfirm` error gate. **`jspdf-autotable@3.8.4`'s default-export interop
  is broken under esbuild/Rollup bundling** — `import autoTable from 'jspdf-autotable'` resolves
  to the CJS namespace object, not the callable function, and throws `"...is not a function"` at
  call time (verified against the actual installed version via a standalone esbuild bundle, the
  same engine Vite uses for dep pre-bundling — a `npm run build` success alone does NOT catch this,
  since bundling only resolves imports statically without executing them). The fix in this file:
  `import 'jspdf-autotable'` for its side effect only (it internally calls its own
  `applyPlugin(jsPDF)`, patching `doc.autoTable(...)` on as an instance method), then always call
  `doc.autoTable({...})` — never the bare `autoTable(doc, {...})` function form. If `jspdf-autotable`
  is ever upgraded to a v4/v5 release with a proper ESM build (like the sibling `em-scheduler` app,
  which pins `^5.0.7` and uses the plain `import autoTable from 'jspdf-autotable'` + `autoTable(doc,
  opts)` form successfully), re-verify with the same esbuild-bundle technique before switching the
  call sites back.
- **Dark mode** (`darkMode` state → `res_dark_mode`, Sun/Moon header toggle, `.res-dark` class on
  the root div): an override stylesheet in `index.css`, not Tailwind `dark:` variants — this file
  has thousands of class strings, so a variant-based approach would mean touching all of them.
  Ported from the sibling `em-scheduler` app's `.em-dark` sheet and extended, since this app uses
  BOTH `gray-*` and `slate-*` neutrals (em uses only `slate-*`) plus a wider set of category-tint
  hues (`indigo`/`sky`/`emerald`/`yellow`/`orange`/`pink`/`violet`/`teal`/`stone` — see
  `CATEGORIES`). Wrapped in `@media screen` so print/PDF output always stays light regardless of
  the viewer's theme. `res_dark_mode` is excluded from `LS_BACKUP_KEYS` — see "Persistence" above.
- `MAIN APP` — the `TABS` nav array; `reconcileTabOrder`/`reorderIds` (pure helpers behind
  the sidebar's drag-to-reorder — reconcile guards against a non-array persisted order, reorder
  always lands the dragged tab immediately before the drop target regardless of drag direction);
  `SidebarNav` (own component, not inlined in the root — keeps drag-hover state from re-rendering
  whatever tab content is currently mounted; now also renders a shift-area/GR/OFF/J **legend**
  panel below the nav, and splits the Validation tab's badge into separate rose-error/amber-warn
  counts plus a green check when a non-empty schedule has neither); the root `ResidentScheduler`
  component: all state via `useLocalStorage`, `saveBlock`/`loadBlock`/`newBlock`/
  `toggleBlockPublished`, `exportCSV`, header/tab-routing render, a single `issues`/`issueCounts`
  memo (one `validateAll` pass shared by the sidebar badges, `pendingErrorCount`, and the
  Dashboard stat tiles, instead of one pass per consumer). `saveBlock` explicitly preserves an
  existing snapshot's `published` flag when re-saving the same block id (a snapshot is replaced
  wholesale, so this is easy to lose). The header is a light shell (white bar, gradient indigo
  logo tile) mirroring `em-scheduler`'s layout language with this app's own indigo accent (em uses
  rose), plus an `AutosaveIndicator` pill next to the CSV/PDF export buttons.

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
  an evening shift can never be immediately followed by a day shift the next day, or vice versa
  (hard, even when the plain rest-hour math would otherwise clear it); max 6 total night shifts per
  block, except residents whose entire eligibility is night-only (today: FM-3) — `isNightOnlyResident`
  exempts them from both the per-block cap and the short-run warning, since FM-3's Mon/Tue/Wed-only
  day rule makes a 4+-night run structurally impossible anyway. **≥24h off after a night run before
  resuming a day shift — or before Grand Rounds — is a ranked *soft* rule** (`rule:'postNightRest'`
  in `checkCircadianViolations`, `grRestGapH` covers the GR case since GR is never a schedule
  entry), checked in both directions (backward when placing a day shift, forward when placing a
  night shift ahead of an already-placed day shift — the generator's optional fill pass runs after
  TRAUMA-D is filled, so a one-directional check let violations slip through generation). See
  "Soft Rule Priority" below for how the generator decides whether to break it.
- **Soft Rule Priority** (`appSettings.rulePriority`, `SOFT_RULES`, `DEFAULT_RULE_PRIORITY`,
  `normalizeRulePriority`, `ruleRank` — all near `NIGHT_RULES`): a chief-orderable ranking of three
  soft rules — `coverageMin`, `seniorComposition`, `postNightRest` — edited on the Rules tab
  ("Soft Rule Priority" card, up/down reorder). Default order ranks `coverageMin` highest, so the
  generator's min-fill pass reaches for a rest-violating or junior candidate before leaving a slot
  unfilled (recorded in `report.restCompromises`/`report.seniorGaps`); reordering `postNightRest`
  or `seniorComposition` above `coverageMin` instead leaves the slot unfilled to protect that rule
  (`report.unfilled` reasons `'restProtected'`/`'seniorProtected'`) — see `candidatePool`'s
  `{candidates, restFallback}` split and `fillDayPass`'s min-phase fallback logic in
  `generateSchedule`. `rulePriority` lives in `res_app_settings`, already covered by
  `LS_BACKUP_KEYS` — no new backup key or LEGACY migration needed (`normalizeRulePriority` handles
  an old backup with no `rulePriority` field by falling back to the default order).
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
  committed code). The same rule covers **email addresses**: `admin_email_allowlist` rows and the
  chief-bootstrap `update profiles ...` are typed straight into the SQL editor as data, and the
  committed `supabase/*.sql` files carry only placeholders (`someone@example.edu`,
  `YOUR_EMAIL@uthscsa.edu`). The institutional *domain* in `auth_hook_domain_restriction.sql` is
  the one exception — it's necessarily in the function body and is already public in the app's own
  sign-in copy. `.gitignore` also covers the `*-resume.txt` session transcripts, which contain
  addresses; don't remove those entries.
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
