# CLAUDE.md

File guide Claude Code (claude.ai/code) when work code in this repo.

EM residency shift scheduler (UH Emergency Medicine) — build/validate resident schedules across
areas (POD, PED, FLEX, MT, TRAUMA), can **auto-generate** schedule from coverage rules, export
to CSV, JSON backup/restore in Settings tab.

## Layout & stack
- Repo root: `C:\Users\amade\projects\resident-scheduler` → GitHub `picklepilk/resident-scheduler`
  (public repo — never commit real resident names/PII; see "Data model & conventions" below).
- React 19 + Vite 6 + Tailwind CSS · `lucide-react` icons. `jspdf`/`jspdf-autotable` power PDF
  export (matrix + per-resident pages) — see "PDF export" below, version-specific import
  gotcha with installed `jspdf-autotable@3.8.4`.
- `xlsx` (SheetJS) parses Master Matrix import (below). Installed from SheetJS's own CDN tarball
  (`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` in `package.json`), **not** npm
  registry package — registry build frozen at 0.18.5, unpatched prototype-pollution/ReDoS
  CVEs SheetJS only fixes in CDN-published builds. Keep installing/upgrading this dependency via
  pinned CDN tarball URL, never `npm install xlsx`.
- **Almost all *scheduling* logic lives in one file: `src/ResidentScheduler.jsx` (~8,300+ lines)** —
  expect nearly all scheduling edits there. Rest of `src/` is auth + day-off-request
  surface, deliberately kept out of that file (see "Auth, roles & the day-off request
  feature" below): `main.jsx` (route split — `/requests` → `ResidentRequestsApp`, everything else →
  `AppGate`), `AppGate.jsx` (whole-app login/role gate), `supabaseClient.js` (`AUTH_ENABLED`, the
  shared client), `RequestsTab.jsx` (admin-facing approval queue + admin management), and
  `residentRequests/` (`LoginScreen`, `ResidentPicker`, `RequestForm`, `RequestList`,
  `ResidentRequestsApp`, `blockLookup.js`). **Nothing under `residentRequests/` imports from
  `ResidentScheduler.jsx`** — separate surface, fetches own data from shared
  `res_state` row; keep it that way.
- Shift catalog defined as data at top of `ResidentScheduler.jsx`: `SHIFTS` (id, label, area,
  hours, type: day/eve/night/**swing**, chip color) and `SHIFT_TIMING` (exact start hour + duration
  per shift id, used for rest-period validation across midnight). `SHIFT_MAP`/`SHIFT_AREAS`/
  `SHIFT_TYPES` derived from/alongside `SHIFTS` — add new shift types there, not ad-hoc
  strings elsewhere. `PED-S` (Peds Swing, 11:00–20:00, type `'swing'`) EM-Home-PGY-2-only,
  only exists Mon/Tue/Thu/Fri (`SHIFT_DOW`) — see "Journal Club / Grand Rounds / circadian rules"
  below why `'swing'` own type rather than reusing `'eve'`. `SHIFT_DOW` is now also enforced
  inside `getEligibleShifts` (both generator and manual-picker paths) — previously only checked
  by the generator's own fill loop and the coverage-warning pass, so the manual picker would
  offer PED-S on an invalid weekday with no warning anywhere.
- Persistence local-first, optional cloud sync layered on top: `useLocalStorage` hook
  backs ten state slots under `res_*` keys, synchronously written to `localStorage` on every
  change regardless whether cloud sync configured. Nine round-trip through
  `LS_BACKUP_KEYS`: EM roster, current block, blocks history, eligibility overrides, AY data, app
  settings, chief-editable day rules, shift coverage, sidebar tab order. Settings tab
  exports/imports/resets all nine as one JSON backup (manual, offline safety net — see
  "Cloud sync" below for automatic path) — **new `res_*` key must add to
  `LS_BACKUP_KEYS` or silently won't round-trip** through backup/restore **or cloud sync**
  (sync payload built directly from that same list). Tenth slot, `res_dark_mode`, **deliberately
  excluded** from `LS_BACKUP_KEYS` — device/viewer display preference, not
  chief scheduling data, so restoring colleague's backup (or syncing from another device)
  shouldn't flip own theme (see "Dark mode" below). Anything read back from backup, cloud
  row, hand-edited localStorage treated as untrusted shape — e.g. `reconcileTabOrder`
  guards with `Array.isArray` before trusting persisted array, and
  `getCoverageFor`/`normalizeCoverageEntry` accepts either old single-number coverage shape or
  current `{min,max}` shape so old backup restores without migration step.
- **Cloud sync** (`// ─── SUPABASE SYNC ───` section, before `LS_BACKUP_KEYS`): optional
  cross-device sync via hand-rolled `fetch`-based PostgREST client (`sbFetch`, no
  `@supabase/supabase-js` dependency — ported from sibling em-scheduler app's proven pattern),
  gated by module-level `SUPABASE_ENABLED` flag computed from `VITE_SUPABASE_URL`/
  `VITE_SUPABASE_ANON_KEY` (see `.env.example`) — absent, app behaves exactly as before this
  feature existed. Env vars injected via Vite's `%VITE_*%` HTML token substitution into
  `window.__SUPABASE_URL__`/`__SUPABASE_ANON__` (not `import.meta.env` directly); an
  `isUnresolvedToken` guard treats literal unresolved `%VITE_...%` string (what Vite leaves in
  place, not empty string, when var isn't defined for that build — verified: build with
  no `.env` leaves literal token in `dist/index.html`) same as "not configured," so
  fork/preview build without vars set falls back to clean local-only mode instead of
  permanent "Sync error." One Supabase table, `res_state`, one fixed row (`id: 'main'`, the real
  row — see "Demo Sandbox" below for the second, disposable row this table also holds) holding
  whole `LS_BACKUP_KEYS`-shaped document as single `jsonb` blob — unlike per-record table,
  nothing here needs independent archiving at row level, so one row right shape (see
  section's own comment for exact schema/RLS policy, note policy intentionally wide-open,
  same posture em-scheduler already accepts). Payload, overlay,
  baseline snapshot all derived from `LS_BACKUP_KEYS` via single `syncBindings`
  map (`key → [value, setter]`) in root — new `res_*` key added to `LS_BACKUP_KEYS` flows
  through sync automatically; wiring into `syncBindings` only extra step, forgetting
  throws rather than silently not syncing. Debounced (1.5s) `useEffect` upserts, only when
  current values differ (by reference) from `cloudBaselineRef` (what cloud known to
  hold) — so mount `dbReady` flip doesn't re-upload just-loaded document, load that
  returned nothing (empty cloud) seeds row on first write. **`dbReady` gates all cloud writes,
  stays FALSE if mount-time `sbLoadState` fails** — critical: device that never
  successfully read cloud must not later overwrite with un-merged local state (would
  silently destroy another device's newer data); pill shows "Sync error," local editing still
  works, reload retries cleanly. Mount overlay applies each key individually with
  `!= null` guard (missing OR explicitly-null cloud key never wipes/nulls local field).
  Conflict handling last-write-wins/full-document-overwrite — no merge, no version check, same
  accepted tradeoff as em-scheduler (one coordinator, multiple devices, used sequentially not
  concurrently). `sbFetch` bounds every request with 15s `AbortController` timeout so hung
  network surfaces as error rather than freezing UI (notably import/clear awaits).
  `SettingsTab`'s `clearAll()`/`importData()` **gate local wipe/write + reload on cloud
  op (`sbDeleteState`/`sbSaveState`) succeeding first** — if cloud op fails, nothing changes
  locally, error toast asks user retry, because committing locally then reloading
  would let mount overlay revert it from still-stale/still-intact row; both also set
  module-level `syncSuspended` flag so root's debounced auto-save can't race stale write
  onto row mid-operation, `importData` pushes only `LS_BACKUP_KEYS` keys (never
  `res_dark_mode`) into shared document. `clearAll` also deletes the `'demo'` cloud row (Clear
  All wipes the whole shared workspace, sandbox included) — **main row deleted first, demo row
  second and best-effort** (its own try/catch, failure doesn't block or get reported), so the
  "nothing changed" error toast stays literally true if only the real-row delete fails.
  The debounced save's body (baseline check, payload build, upload, baseline update) lives in
  one shared `saveCloudNow()`, called by both the timer and `flushPendingCloudSave()` (see Demo
  Sandbox below) — a `savePromiseRef` tracks the in-flight `sbSaveState` call once the debounce
  timer fires, so a save mid-flight (not just one still waiting on the timer) can be awaited
  rather than abandoned when something needs to flush before reloading.

- **Demo Sandbox** (`// ─── DEMO SANDBOX ───` section, just above the nine `useLocalStorage` calls
  in root `ResidentScheduler`; `RES_STATE_DEMO_ROW_ID`/`DEMO_MODE_KEY` declared near
  `RES_STATE_ROW_ID` in the Cloud sync section above): lets an admin practice/break things on a
  disposable copy of the whole workspace without risking real data (mirrors sibling em-scheduler's
  own Demo Sandbox). **Isolation is by PHYSICAL localStorage key, not a mode check inside
  shared save/load code** — `physKey(k)` rewrites only the `res_` prefix (`res_em_roster` →
  `res_demo_em_roster`) when `demoMode` is true, and every one of the nine `LS_BACKUP_KEYS`-backed
  `useLocalStorage` calls is wrapped in it; a second Supabase `res_state` row (`id: 'demo'` =
  `RES_STATE_DEMO_ROW_ID`) mirrors this cloud-side via `sbSaveState`/`sbLoadState`/`sbDeleteState`'s
  new optional `rowId` param (defaults to `RES_STATE_ROW_ID`, the real row). The real `res_*` keys
  and the `'main'` cloud row are reachable only through `rowId`'s default parameter and the
  mount-load/debounced-save effects' own `demoMode` ternary — every demo code path explicitly
  passes `RES_STATE_DEMO_ROW_ID`, and every real-data code path (including
  `SettingsTab.importData`/`clearAll`) relies on the default, so the two never collide by
  construction, but it is a discipline enforced by each call site, not a structural
  impossibility — same "can't accidentally write the wrong place" intent as the
  `dbReady`/`syncSuspended` gates above.
  `demoMode` is a device-local flag under `DEMO_MODE_KEY = 'res_demo_mode'` (same posture as
  `res_dark_mode` — deliberately excluded from `LS_BACKUP_KEYS`, never synced/backed-up), read
  ONCE per mount via a `useMemo` reading `localStorage` directly. It is **not** live React state
  you can just flip — `useLocalStorage`'s lazy initializer only reads localStorage on first mount,
  so every enter/exit/resume/delete action (`enterDemoFresh`/`enterDemoResume`/`exitDemo`/
  `deleteDemo`) sets `DEMO_MODE_KEY` then calls `window.location.reload()`; only a genuine remount
  makes the nine hooks resolve to `res_demo_*` keys (or back to `res_*`). Fresh demo is a full
  copy of live data, not a blank slate: `enterDemoFresh` reads the current value of all nine
  `LS_BACKUP_KEYS` vars off `syncBindings` (the same map Cloud sync builds), pushes that copy to
  the cloud demo row FIRST when `SUPABASE_ENABLED` (`sbSaveState(doc, RES_STATE_DEMO_ROW_ID)`),
  and only writes the `res_demo_*` localStorage keys / reloads once that succeeds — identical
  cloud-first-then-commit-locally discipline to `SettingsTab.importData`/`clearAll`, so a failed
  cloud push can't strand local demo state a second device could never resume. `openDemoModal`
  decides whether "Resume existing demo" is offered (`demoExisting`) by checking local
  `res_demo_*` keys first, only probing `sbLoadState(RES_STATE_DEMO_ROW_ID)` if none exist
  locally — guarded by a `demoCheckGenRef` counter bumped on every call, so a slow probe from a
  closed-then-reopened modal can't land late and clobber a fresher probe's result. One shared
  demo slot across every admin/device — resumable cross-device via the cloud
  row, but two admins in the sandbox at once will race each other overwriting it (accepted
  tradeoff, not solved, same posture as main sync's last-write-wins). `deleteDemo` only ever
  touches `demoPhysKey()`'d keys and `RES_STATE_DEMO_ROW_ID` — never the real row or keys.
  Header flask icon (`FlaskConical`, hidden once already in demo) opens the entry `Modal`
  (`demoModalOpen`); while `demoMode` is true a diagonal-striped purple banner replaces normal
  header chrome with "Exit demo" (flips the flag back and reloads — demo data stays on disk,
  resumable later) and "Delete demo & exit" (`deleteDemo`). `SettingsTab.importData`/`clearAll`
  both early-return with a toast — "Exit the demo sandbox first." — when the new `demoMode` prop
  is true, since both act on `LS_BACKUP_KEYS`/the real `'main'` row directly and would otherwise
  stay reachable-but-wrong from inside the sandbox. No new `LS_BACKUP_KEYS` entry, no
  `syncBindings` change, no SQL/schema change needed — `'demo'` is just another row in the same
  wide-open-RLS `res_state` table. `SettingsTab.exportData` also takes a `dbReady` prop: in demo
  mode with cloud sync configured, exporting before the mount-time cloud overlay has resolved
  would read still-empty `res_demo_*` keys (a resumed cloud-only demo hasn't copied its data
  into local keys yet) and silently download an all-null backup — guarded with a toast instead.
  Every enter/exit/resume/delete action first calls `flushPendingCloudSave()` (defined next to
  them) to upload an edit made shortly before the click; it rescues a save whose debounce timer
  hasn't fired yet AND one already mid-flight (via `savePromiseRef`, see Cloud sync above), and
  never throws, so `exitDemo`/`enterDemoResume` — which do nothing else that can fail — call it
  unconditionally with no try/catch: entering/exiting the sandbox can't get stuck behind an error
  toast. `enterDemoFresh`/`deleteDemo` keep their own try/catch since they have further cloud ops
  (`sbSaveState`/`sbDeleteState`) that can genuinely fail. `deleteDemo` deletes the demo row
  **twice** before touching local state — the second delete is defense-in-depth against a
  debounced upsert that raced past the flush and `syncSuspended` flag — and only removes the
  local `res_demo_*` keys after BOTH deletes succeed, so a failure leaves local demo data intact
  rather than gone with no cloud confirmation.

- **User feedback** (`// ─── FEEDBACK ───` section, after Supabase sync helpers; `// ─── FEEDBACK WIDGET ───`/`// ─── FEEDBACK ADMIN TAB ───` sections near `MAIN APP`): floating bug/crash/idea widget (hidden when `SUPABASE_ENABLED` false) posts to separate `feedback` table in same shared Supabase project via `submitFeedback()` — insert-only for anon key (no `SELECT`/`UPDATE`/`DELETE` RLS policy for anon, unlike `res_state`'s wide-open posture). Every row carries `app_name: 'resident-scheduler'` since table shared with `em-scheduler`. `main.jsx` installs `window.onerror`/`unhandledrejection` listener that auto-submits `type: 'crash'` reports through same helper, deduped per session via `sessionStorage`, capped at 5/session. Only way to *read* feedback: password-gated "Feedback" sidebar tab (also hidden when `SUPABASE_ENABLED` false), calls `netlify/functions/feedback-admin.js` — server-only Netlify Function using `SUPABASE_SERVICE_ROLE_KEY` env var to bypass RLS, gated by `x-feedback-password` header checked against `FEEDBACK_ADMIN_PASSWORD`. Both server-only Netlify environment variables (set in Netlify dashboard for this site) — never `VITE_`-prefixed, never routed through `%VITE_*%` HTML-token mechanism `index.html` uses for client-exposed Supabase URL/anon key. See `.env.example` for full list, `docs/superpowers/specs/2026-07-18-user-feedback-design.md` for original design.

## Auth, roles & day-off request feature
Everything below gated on `AUTH_ENABLED` (`src/supabaseClient.js`) — `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` + `VITE_ALLOWED_EMAIL_DOMAIN` all set. Any missing, behavior **depends on build mode**: dev build (`import.meta.env.DEV`) falls through to
scheduler unauthenticated, local work needs no Supabase project; **production build fails
closed**, renders `AuthMisconfigured` instead. Keep asymmetry — dev fallthrough
deliberate convenience, letting it apply to production build means one missing env var
silently ships fully open app to internet.

- **Whole app behind login** (`src/AppGate.jsx`, rendered by `main.jsx` for every route
  except `/requests`). Resolves session → `profiles.role` → one of three branches: `admin`
  gets full `ResidentScheduler`; `resident` gets only `RequestForm` + `RequestList` (same
  components standalone `/requests` route uses, why they carry no `min-h-screen`
  assumptions); `pending` gets waiting screen, nothing else. `ResidentScheduler.jsx` itself
  has **no** auth logic beyond header sign-out button and `refreshPendingRequests`'s
  `role !== 'admin'` badge gate — gate lives entirely outside it, so that file's ~37 top-level
  hooks untouched by auth state.
- **Three roles, not two** (`profiles.role`, CHECK-constrained): `pending` → `resident` → `admin`.
  `pending` default for every new signup, means *zero* access. No separate
  "chief" role — chief resident just admin (renamed wholesale in
  `migrate_chief_to_admin.sql`; stray `'chief'` string in SQL or JSX leftover,
  should be `'admin'`).
- **Self-promotion impossible by construction.** `profiles_insert_own` pins new rows to
  `pending`; `enforce_profile_role_change_rules` (BEFORE UPDATE) blocks *any* self-role-change,
  restricts cross-account updates to `role` column only. Admins approve/promote others from
  `AdminManagement` section of `src/RequestsTab.jsx`. Bootstrapping very first admin still
  needs one manual `update profiles set role='admin'` — unavoidable, nothing exists yet to grant it.
- **Pre-authorization allowlist** (`migrate_admin_email_allowlist.sql`): address in
  `admin_email_allowlist` lands in `admin` on first login instead of `pending`, so known
  incoming admin doesn't need someone else present to approve them. **Addresses are DATA,
  live only in database — never in this repo, which is public.** Committed migration
  carries mechanism + placeholder example; need to know who's on list, query
  the table. Two non-obvious constraints, both load-bearing: promotion keys off
  `auth.jwt()->>'email'`, **never** `new.email` (AppGate's upsert sends `email` in its payload,
  client-controlled — keying off it would let anyone claim allowlisted address), and
  membership check is *zero-argument* function so can't be used as email-enumeration
  oracle. Table has RLS on with **no policies at all**, deliberately: makes it
  unreachable from any signed-in session. Also note allowlist only affects row's **first**
  creation — removing address never demotes existing admin.
- **Domain restriction enforced server-side**, not just `LoginScreen`'s client check:
  `auth_hook_domain_restriction.sql` defines `restrict_signup_domain(event jsonb)`, wired in
  dashboard under Authentication → Hooks → "Before User Created". SQL alone does nothing until
  that dashboard wiring exists — was unwired (therefore unenforced) for a while, verify
  rather than assume. Domain hardcoded in that function, must match
  `VITE_ALLOWED_EMAIL_DOMAIN` exactly. Test with real API call, not just reading code:
  `POST {url}/auth/v1/otp` with out-of-domain address should return 403.
- **RLS actual security boundary; UI gates convenience.** Residents scoped by
  `resident_id` matched against own profile row; admins get blanket access via
  `is_admin()` SECURITY DEFINER helper (plain subquery on `profiles` inside `profiles` policy
  causes "infinite recursion detected in policy" — why helper exists, don't inline it).
  Column-level scoping not expressible in `WITH CHECK`, so four BEFORE triggers do that work:
  `enforce_cancel_only_status`, `enforce_request_identity_immutable`,
  `enforce_resident_id_immutable`, `enforce_profile_role_change_rules`. Fifth,
  `apply_admin_allowlist`, promotes rather than guards (see allowlist bullet above).
- **`role = 'pending'` must be enforced in RLS, never only in client.** Every resident-facing
  policy folds `role <> 'pending'` into its `profiles` subquery, `profiles_update_own` requires
  it in `USING`. Real, confirmed hole: for a while `pending` checked only by
  `AppGate`'s client branch, only on `/`, so unapproved account could open `/requests`,
  claim any roster resident who hadn't registered yet, submit requests as them — impersonation, not
  just self-service. Add table residents touch, gate same way
  (`migrate_block_pending_account_access.sql` is reference).
- **`supabase/*.sql` run-by-hand, in order, not migration-tool-managed.**
  `day_off_requests.sql` fresh-install baseline (kept current, new project needs only
  it); `migrate_*.sql` files one-time deltas for already-provisioned production DB,
  re-running baseline does **not** apply them. Change schema, update baseline
  *and* add companion `migrate_*.sql` — same pattern as `LEGACY_DAY_RULE_DEFAULTS` elsewhere in
  this file. Apply with `npx supabase db query --linked -f <file>` (CLI not on PATH; `npx`
  it). **`--linked` follows `supabase/.temp/`, independent of whatever project
  dashboard has selected** — migration already run against wrong sibling project
  once by having dashboard on `EMS Inventory`.
- One known gap, accepted: `blockLookup.js` reads whole shared `res_state` blob (including
  full schedule) to resident's browser before narrowing it. "Residents never see schedule"
  UI-enforced only. See that file's own header comment.

## Running / building / deploying
```bash
npm run dev
npm run build     # → dist/
npm run preview
npm test          # vitest — src/lib/*.js (dates/shifts/coverage/parse/rng/scheduleQuality/
                   # journalClub/eligibilityOverrides/qgenda/jeopardyLedger/coverageComposition) plus
                   # generator.harness.test.js + generator.baseline.<variant>.test.js, which import
                   # the generator/validateAll
                   # named exports straight out of ResidentScheduler.jsx (jsdom env, verified
                   # import-safe — see "Generator quality harness" above). Everything else in that
                   # file (UI, tabs, most business logic) still has no test suite.
```
- No lint config exists (no ESLint config). `src/lib/` has vitest coverage, now including the
  schedule-generator core inside `ResidentScheduler.jsx` via its named exports (see "Generator
  quality harness" above) — the rest of that file (UI, tabs) does not; verify changes there by
  running `npm run dev` and generating/exporting a sample schedule.
- Netlify deploy (`netlify.toml`: build = `npm run build`, publish = `dist`, SPA redirect
  `/* → /index.html`).

## Map of ResidentScheduler.jsx
Line numbers drift as file grows — grep for `// ─── SECTION ───` markers or function
names below rather than trusting offsets.
- ~13–420 `CONSTANTS` — `SHIFTS`, `SHIFT_TIMING`, `SHIFT_MAP`/`SHIFT_AREAS`/`SHIFT_TYPES`,
  `SHIFT_DOW` (weekdays shift exists at all — currently just `PED-S`; coverage min/max
  otherwise deliberately NOT day-of-week-dependent), `CATEGORIES`, block types (`BLOCK_TYPES_EM`,
  `TRAUMA_BLOCKS`, `EM_HOME_BLOCK_TYPES_BY_PGY`), `BASE_ELIGIBILITY`, `DEFAULT_DAY_RULES`,
  `SHIFT_TARGETS`/`BLOCK_TARGETS` (rotation-specific target overrides, e.g. US/EM = 5 shifts,
  EM/Res/VAC = 13 — see `getShiftTarget`, and "Per-block target overrides" below for the
  `targetDelta` step that now runs AFTER all four of its resolution branches),
  `DEFAULT_COVERAGE_MINMAX`/`DEFAULT_COVERAGE`/
  `getCoverageFor`/`normalizeCoverageEntry` (per-shift daily `{min,max}` staffing used by
  generator — see "Coverage is min/max, not single number" below), `LEGACY_DAY_RULE_DEFAULTS`/
  `LEGACY_ELIGIBILITY_DEFAULTS`/`DAY_RULE_DEFAULTS_CHANGED` (see "Rule-default migration" below).
  `DEFAULT_DAY_RULES` shapes include `dayTypeRestrictions[].scope: 'generator'` (shift stays
  manually assignable via picker; only auto-fill skips it — see `getEligibleShifts`'s `ctx`
  param), `computedDayRules: [{type:'firstFridayOfMonth'}]` (date-computed rules needing no manual
  list, evaluated same way as `fullBlockDays`), `shiftGates[].activeWhen:
  {blockStartBefore?, blockStartOnOrAfter?}` (optional effective-date gate compared against
  block's own start date — e.g. EM_HOME_2's EM/EMS↔EM/TOX weekday-window swap on 2026-08-01 —
  evaluated by `gateActiveForBlock()`; gate with no `activeWhen` always active).
- ~336–392 `UTILITIES` — date helpers (`getBlockDates`, `parseDate`/`addDays`/`toDateStr`),
  `getAcademicYearFor`/`getAcademicYear`/`formatAY` (AY derived from date, July cutoff —
  `getAcademicYear()` reads `Date` fields directly rather than round-tripping through
  `toISOString()`, to avoid off-by-one-day near July cutoff in timezones behind UTC),
  `applyStartDate` (shared start-date handler: auto-fills end date to configured block length,
  recomputes AY only while it still matches auto-derivation so manually-edited AY sticks — used by
  both Home and Settings tabs).
- ~393–506 `ROSTER IMPORT` — `parseRosterText` (parses pasted/uploaded CSV or TSV roster rows into
  `{firstName,lastName,category,pgy}`; tab-delimited or quote-aware CSV — including fallback for
  unquoted "Last, First" names that would otherwise misalign columns — optional header row, category
  matched via `CATEGORY_SYNONYMS`, PGY validated against category's `pgyOptions`; Rotation/date
  columns read but ignored) plus `splitCsvLine`/`splitName`/`matchCategory`.
- `MATRIX IMPORT` (same section, after `parseRosterText`) — parses chief's yearly two-sheet
  Master Matrix workbook (`ImportMatrixModal`, now on the Dashboard tab — see "Dashboard/Home
  merge" below): `parseHomeResidentMatrix` reads the Home-EM sheet, detected by sheet CONTENT not
  tab name (`detectHomeAndOffSheetsByContent` — a header row starting "Resident" = home sheet, a
  literal "Dept" header cell = off-service sheet; real chief exports use generic "Sheet1"/"Sheet2"
  tab names, so name-regex matching alone silently mis-assigns). Two supported HOME-sheet shapes:
  (a) legacy `"Resident (EM-Home PGY-N)"` section markers (original format), or (b) — real AY26/27
  export shape, no PGY markers at all — `parseHomeResidentMatrixGrouped` treats blank-row-separated
  resident tracks as PGY cohorts, **inferring each track's PGY from which `EM_HOME_BLOCK_TYPES_BY_PGY`
  tier its rotation ids are exclusive to** (e.g. a track using TRAUMA_PEDS/US_EM/ANES_VAC = PGY-1).
  `parseOffServiceSheet` reads the off-service sheet's Name/Dept/Dates triples (found by
  scanning for date-range cell, reading its left neighbors, since sheet's column offsets
  drift per month-group — don't switch this to fixed column indices). Two separate date-range parsers
  handle each sheet's own year-inference quirk: `parseSequentialDateRange` (home sheet) walks columns in
  row order bumping year cursor on backward month jumps, because sheet has pre-orientation
  stub column that sits before AY's first July block; `parseDateRangeInAY` (off-service sheet) dates each
  range independently off July cutoff, except same-year range straddling Jun→Jul (right at
  AY's start) uses *later* month's half so it doesn't get misread as AY's May/Jun tail. Don't
  merge these two into one function — solve different problems for structurally different sheets.
  `ImportMatrixModal` only ever writes `emRoster` (merging in new residents, matched by normalized
  name) and `blocksHistory` (one snapshot per parsed block, id `blk_import_${startDate}` so
  re-upload updates in place instead of duplicating) — never touches live/current block, never
  generates schedule.
- **Two more paste/upload importers live on the EM Residents tab** (not Dashboard): `ImportVacationModal`
  parses the chief's yearly vacation-dates xlsx (three PGY sections, three repeating 13-column
  Requested/Dates/BLK/Rotation/… groups per resident row) into each matched resident's
  `vacationDates[]` — tolerant name matching (strips parenthetical suffixes like "(ECFMG)", matches
  on last/first NAME-TOKEN-SET intersection, not exact string, so "Avila, Anthony Joseph" matches
  roster's "Avila, Anthony") and never auto-commits an ambiguous multi-match. `ImportLecturesModal`
  parses pasted Name/Lecture/[M&M/]JournalClub rows into `grLectureDates` (Lecture **and** M&M dates
  both merge into this one field — M&M counts as a lecture for rule purposes, no rule-engine
  change needed since the lecture-day-before strip already keys off `grLectureDates` generically)
  and `jcPresentDates`; validates Lecture/M&M fall on the resident's `grWorkDow` and JC falls on a
  Journal Club date for that date's own AY (`isJcDateAnyAy` — NOT the block's AY, since imported
  dates can span years), but doesn't hard-block a mismatched date — flags it in the preview instead.
- ~500–1060 `REST-PERIOD UTILITIES` / circadian engine — `checkRestViolations` (legal-rest-hour
  check only), then **`CIRCADIAN SCHEDULING RULES`**: `NIGHT_RULES` (`minRun`/`idealRun`/`maxRun`
  4-6-6, `postNightDayRestH` 24, `maxPerBlock` 6), `GR_START_HOUR` (08:00, Grand Rounds start used
  by postNightRest soft rule), `isNightShiftId`, `isNightOnlyResident` (FM-3 — exempt from
  block-wide night cap, short-run warning), `nightRunBefore`/`nightRunAfter`, `grRestGapH`
  (hours between night shift's end and Grand Rounds on resident's next GR weekday — GR never
  schedule entry, only way postNightRest rule can see it), then
  `checkCircadianViolations(resident, dateStr, newShiftId, rs, {nightOnly})` →
  `[{message,level,rule?}]` (max-run and eve→day-next-day/reverse are hard `'error'`; ≥24h
  post-night rest preference — including Grand Rounds next morning — `'warn'` tagged
  `rule:'postNightRest'`, ranked **soft rule** generator only breaks per `appSettings.
  rulePriority` — see "Soft Rule Priority" below; check runs in **both directions** — backward
  from incoming day shift AND forward from incoming night shift to day shift already
  sitting 1-2 days later, since generator's optional fill pass can place night shift after
  day shift already scheduled), then `isTraumaCapSubject`/`getTraumaCap`, `isSchedulable` (EM_HOME/
  EM_BAMC default to `'EM'` rotation when `blockType` missing — this also fixes
  BAMC residents added via Off-Service tab, which never assigns one), `isNightOnlyResident`.
- `traumaPedsHalf`/`isTraumaPedsSplitResident`/`TRAUMA_PEDS_SPLIT` ({trauma:8, peds:11}) —
  combined 19-shift target for TRAUMA_PEDS/PEDS_TRAUMA enforced as two separate protected
  sub-targets (see "Trauma/Peds split" below), not just documentation note.
- `isPedsEmMix`/`PEDS_EM_MIX`, then **`SENIOR_COMPOSITION`** ({FLEX:{primary:2,fallback:3},
  POD:{primary:3,fallback:2}}) + `isSeniorFor` — every staffed FLEX/POD shift needs senior PGY
  (fallback other), enforced by generator restricting candidate pool to senior sub-pool while
  none present (falls back to full pool + `report.seniorGaps` entry rather than leaving
  min-coverage slot empty), warned on in `validateAll` if staffed group ends up without one.
- **`JOURNAL CLUB`** section — `JC_MAX_PER_AY` (3), `isFirstTuesday`/`getFirstTuesdaysInRange`,
  `shiftOverlapsJC(sid)` (timing-derived: any shift whose interval overlaps 18:00-21:00 — covers
  PED-S, Trauma Night automatically, no hand-maintained shift-id list), `ayWindowFor(ayString)`
  (July 1–July 1 from `"AY26/27"`-style string), `countPublishedJC`/`countCurrentBlockJC` (cross-
  block counting reads `published` saved-block snapshots — see "Published blocks" below).
- `getEligibleShifts(resident, dateStr, ..., ctx)` (jeopardy-call logic lives here, plus
  Peds/Trauma half-block split via `traumaPedsHalf`, off-service availability via
  `isAvailableOnDate`, JC-presenter shift stripping, Grand-Rounds-lecture day-before stripping;
  `ctx = {blockStart, forGenerator}` — `blockStart` needed for half-block split AND for
  `activeWhen` gate evaluation, `forGenerator` gates `scope:'generator'` restrictions and
  generator-only late-night-after-JC-presenting avoidance) and `validateAll()`, rules/validation
  engine (jeopardy policy, 7-consecutive-work-day rule, trauma double-booking, min/max coverage,
  circadian night-run/turnaround checks, FLEX/POD seniority, Journal Club cap/presenter checks,
  Grand Rounds lecture day-before check — see each feature's section below for specifics).
  `grWorkDow`/`isStreakWorkDay`/`runLengthIfWorked`/`prevBlockTailSchedules` implement the
  **strict ACGME max-6-consecutive-work-day rule** (`MAX_CONSECUTIVE_WORK_DAYS = 6`), shared by
  `validateAll`, `generateSchedule`, and the manual picker/drag-drop (`cellViolations`) — this
  flipped from an earlier version of the rule where a shift-less GR day counted as a day off
  (that version caused a real 8-day-straight scheduling bug: two legal ≤6 runs straddling a
  shift-less GR Wednesday). Current, chief-confirmed semantics (`isStreakWorkDay`): a day counts
  as worked if a shift is assigned that date (current block OR the previous block's tail, via
  `prevBlockTailSchedules`), OR it's the resident's own Grand Rounds weekday (`grWorkDow`:
  EM_HOME→Wed, EM_BAMC→Thu), OR it's a Journal Club presenting date (`jcPresentDates`) — UNLESS
  that date is in the resident's `vacationDates`/`approvedDatesOff` (they're not there, so it
  doesn't count). A resident CAN work the same day as GR — it's one obligation day, not two,
  since this is a boolean per date, not a sum. `prevBlockTailSchedules(block, blocksHistory)`
  picks the immediately-preceding saved snapshot whose date range abuts `block.startDate`
  (published preferred, else most recent `savedAt`) and returns each resident's last ~14 days of
  that block's shifts, so a run straddling a block boundary is still caught by both the generator
  and Validation (and the picker, via a `prevTail` map threaded down from `ScheduleGrid`).
  `validateAll`'s walk revived a previously-dead `runHasShift` flag: a run built entirely from
  GR/JC obligation days (zero actual shifts in the current block) does not raise an error.
- `SCHEDULE GENERATOR` — `generateSchedule()` (coverage-driven auto-fill: **greedy fresh MRV slot
  ordering per day** — see "Fresh MRV" below,
  candidate filtering with named unfilled-reasons — including `halfTargetMet`,
  `circadianBlocked`, `nightCapped`, `jcCapped` — target/type-mix/streak/jeopardy/trauma-nights-
  preferred/peds-mix/night-clustering/seniority/JC-avoidance scoring; recomputes candidate pool
  fresh for every slot — cached pool went stale mid-day, caused double-booking once, don't
  reintroduce that; never overwrites non-empty cell). Fill happens in **three passes** via
  `fillDayPass(ds, includeShift, phase)` — `phase:'min'` fills every shift to its configured
  minimum (everything except TRAUMA-D across whole block, then TRAUMA-D alone, because PGY-1
  trauma-day shifts meant to be final fill step — don't collapse first two passes back
  into one without re-deriving why), then `phase:'optional'` tops up toward each shift's maximum
  only for residents still under their own target (empty pool in this phase silently
  skipped — max is cap, not requirement, so neither `unfilled` nor counted in
  `totalSlots`). `summarizeGenerationReport()` turns generator's report into grouped,
  human-readable recommendations for Violations tab, including "expected gap" detection for
  day-of-week rules (Trauma windows, GR Wednesday) and for PED-N (FM-3-exclusive — see below).
- **Fresh MRV (greedy slot ordering inside `fillDayPass`)** — the day's slots used to be sorted
  ONCE by `candidatePool(...).candidates.length` measured against start-of-day state. That key went
  stale the instant the first slot was filled (an assignment removes that resident from every other
  shift's pool today, via `candidatePool`'s `!schedule[r.id][ds]` filter), so a shift that started
  with 6 candidates could be down to 1 by the time the frozen order reached it. The loop is greedy
  now: re-pick the most-constrained REMAINING slot after every placement. Three things make this
  work and must stay true together:
  1. **Counts are maintained incrementally, not recomputed.** Re-running `candidatePool` for every
     remaining shift after every placement is ~O(shifts²) pool calls/day — far too slow for the
     300-generation baseline suite. Deleting only the winner's id from each cached set is EXACT,
     not an approximation, because every filter in `candidatePool` reads **per-resident** state
     only (the candidate's own `schedule` row — `checkRestViolations`/`checkCircadianViolations`/
     `runLengthIfWorked`/`sixDayRunRest*` all index by the candidate's own id — plus their own
     assigned/night/peds/trauma/jc/bamc counters). A placement can therefore only ever REMOVE the
     assigned resident from another pool; nobody else's membership changes and nobody is ever
     added. **A new cross-resident filter in `candidatePool` would break that reasoning** — the
     per-slot fresh pool re-seeds the cache entry each pick, so the key self-corrects, but the
     ordering would silently degrade.
  2. **The cache is a SORT KEY ONLY.** The actual fill decision still calls `candidatePool` fresh
     for the slot being filled — the pre-existing "cached pool went stale mid-day and double-booked
     once" rule is unchanged, don't route the decision through the cache.
  3. **The count is COMPOSITION-AWARE, and that is where the win actually comes from.** A FLEX/POD
     shift with no qualifying primary PGY on it yet can only be filled from the primary sub-pool,
     so its raw pool size wildly overstates its real freedom. Measured on the fixtures,
     `pgy2Required`/`pgy3Required` are ~60% of all unfilled min-slots, by exactly this mechanism:
     a roomy-looking POD-D (12 raw candidates, one of them the day's only free PGY-3) sorted after
     some unconstrained shift with 5, that shift took the PGY-3, and POD-D became unfillable.
     Scoring by the EFFECTIVE pool fills it first instead. Plain fresh MRV *without* this was
     measurably NEUTRAL (slot 0 ±0.4, slot 3 mixed, one variant marginally outside tolerance); with
     it, slot 3 improved 7–21% on all three variants. Don't drop it back to `poolIds[sid].size`.
  Determinism is preserved by construction: `remaining` keeps the original slot order and the pick
  uses a strict `<`, so ties resolve to the earliest original slot — exactly the stable-sort
  tiebreak the old `slots.sort` relied on, so seeds still replay.
- **Generator quality harness + best-of-N + repair pass** (`src/lib/rng.js`, `src/lib/
  scheduleQuality.js`, `src/lib/generator.harness.test.js`, `src/lib/baselineSuite.js` +
  `src/lib/generator.baseline.<variant>.test.js`,
  `src/lib/__fixtures__/{syntheticRoster,qualityBaseline}.json`): `generateSchedule()` is greedy
  and nondeterministic (`score()`'s trailing tie-break addend, now `rng()` not bare `Math.random()`
  — an injectable `rng = Math.random` option, seeded via `src/lib/rng.js`'s `mulberry32`, threads
  through unchanged since `score` is a closure inside `generateSchedule`). `generateScheduleBest()`
  (exported alongside `generateSchedule`/`validateAll`/`buildQualityInput`, all now named exports
  — the file was previously module-private beyond the default component) runs 20 attempts with
  distinct derived seeds (`baseSeed + i*0x9E3779B9`), scores each via `src/lib/scheduleQuality.js`'s
  `computeQualityMetrics`/`computeQualityVector` (schedule-derived: coverage misses, normalized
  target-deficit/night/weekend spread across (category,pgy) groups, night-run-shape penalty with a
  block-edge exemption matching the validator) and picks the strict best via `betterQuality` — a
  **lexicographic** tuple `(validateAll error count, export-blocking warning count, quality
  vector)`, never a weighted scalar (a scalar let a low-priority soft-rule count outrank a
  high-priority one at large magnitudes — caught in review). The quality vector's own first three
  slots are ordered by the chief's `rulePriority` (coverageMin/seniorComposition/postNightRest);
  blocking-warning count is ranked *above* the whole vector on purpose — a schedule that can't be
  exported is worse than one with marginally more unfilled slots. `runGenerate`/
  `runPartialRegenerate` call `generateScheduleBest` now, not bare `generateSchedule` — no new UI,
  the button is just doing 20 attempts internally. Report gains `attempts`/`baseSeed`/`seed`/
  `qualityVector` fields (any result is replayable via `generateSchedule({...args, rng:
  mulberry32(report.seed)})`).
  A bounded **repair pass** (`repair:true` option, only ever invoked once — `generateScheduleBest`
  re-runs the winning seed with it after selection, keeps the repaired result only on *strict*
  `betterQuality` improvement) runs as a closure inside `generateSchedule`, after the three fill
  passes: Phase 1 tries to fill remaining `unfilled` min-slots via same-day reassignment or a
  cross-day swap that frees a genuinely-surplus cell; Phase 2 swaps a `restCompromises` violator
  for a clean candidate if one now exists; Phase 3 swaps a `seniorGaps` junior for a senior;
  **Phase 4 runs bounded depth-2 ejection chains** over whatever min-slots Phase 1 left. Phase 1's
  moves are both depth-1 where it matters — Move A backfills the shift it vacates only from
  residents FREE that day, Move B requires the donor cell to already have headcount SURPLUS. The
  common leftover shape is neither: the only resident who can legally take unfilled slot S is X,
  X's own cell A sits exactly AT its min, and nobody free can backfill A. Phase 4 does the two
  moves — `X: A → S`, then `Y → A`, where Y is either free that day or is ejected from a genuinely
  surplus cell (strictly above its own min AND not that shift's only qualifying primary PGY).
  Donors are pre-narrowed by the destination's hard composition when it is still unsatisfied (same
  reason as the MRV key above — otherwise the donor cap is spent on juniors `narrowForSeniority`
  will reject anyway), and a cross-day donor's cells are tried NEAREST-DATE-FIRST, since a
  rest/circadian/streak blocker is nearly always a neighbouring shift, never one three weeks away.
  Measured reality on the fixtures: chains fire ~1×/run and are worth ~0.2–0.4 coverage slots —
  the blocks are capacity-saturated (every resident at target, essentially no surplus anywhere to
  eject), so this phase is a correctness-preserving mop-up, not a large lever. Don't expect more
  from it without adding real capacity.
  Every move is transactional (unassign source/destination, run the same `candidatePool` closure
  the fill passes used against that intermediate state, commit only if every touched shift/date
  stays at/above its coverage min, else exact revert) and is additionally narrowed by
  `narrowForSeniority`/`podStillSatisfied` — **not present in the original fill-pass filters**,
  added after empirical testing showed repair could otherwise place a junior into a PGY-3-less POD
  slot (destination side) or free a cell that was a shift's *only* qualifying PGY-3 even though its
  headcount looked "surplus" (donor side) — both introduced a real hard `validateAll` error that
  `generateScheduleBest`'s outer gate would have discarded anyway, but silently wasted the repair
  attempt; the two narrowing checks let repair succeed instead of self-destructing. `keptCells`
  (every non-empty cell in the incoming `block.schedule` at seed time — covers manual entries and
  partial-regenerate's locked/out-of-range cells identically, since both arrive that way) are never
  touched. The `poolFor`-call budget is **300 for Phases 1-3, then +200 for Phase 4** (500 worst
  case), deliberately NOT one shared 500: Phase 1's per-slot donor scan will happily swallow the
  whole allowance on a hard block (measured: it exhausts all 300 on every fixture variant) and
  would starve Phase 4 to a no-op, and a single pool would also perturb Phases 1-3, whose
  behaviour is intentionally left bit-for-bit unchanged. Phase 4 additionally carries structural
  caps (8 donors/slot, 4 donor cells/donor, 3 backfill donors/cell). After all phases, `unfilled`/
  `restCompromises`/`seniorGaps`/`filled`/`optionalFilled` are rebuilt from the final schedule —
  report arrays are never trusted as still-accurate post-mutation — but **scoped to generated
  (non-kept) cells only**, preserving the report's "generator choices" semantics (a manual cell's
  pre-existing violation is `validateAll`'s domain, never toast-blamed on generation). The quality
  *scorer*, by contrast, reads the **whole final schedule including kept cells** — those shift
  every resident's baseline counts, so excluding them would distort spread/night-shape ordering
  across attempts (kept cells are identical across every attempt regardless, so this never changes
  *which* attempt wins, only the reported magnitude).
  Test fixtures are synthetic only (`src/lib/__fixtures__/syntheticRoster.js`, fake names — public
  repo) — `standard`/`understaffed`/`vacationHeavy` variants, real category/blockType ids read from
  the actual constants, never invented. `qualityBaseline.<variant>.json` is a committed regression floor
  (`errors`/`quality` vector per variant) — **now AVERAGED over 5 baseSeeds, not a single seed**.
  Every vector slot carries real seed-to-seed noise (measured: coverageMiss ±1.5, seniorGaps ±2,
  restCompromises ±1, slot 3 ±10), and a single-seed baseline could not distinguish a genuine
  regression from that drift — it fired on noise twice for changes that were measurably
  neutral-or-better in aggregate. `compareWithTolerance` in that file adds a residual per-slot
  margin (0.5 on the count slots, 1% on slot 3) on top of the averaging. **Verified to still catch
  a real regression** — zeroing `SCORE_WEIGHTS.nightCluster` moves slot 0 by +1.8 and slot 3 by
  ~85, far outside the margins, and all three variants now fail independently rather than the run
  bailing on the first. `vitest.config.js` sets `testTimeout`/`hookTimeout` to 120s — the work
  happens in a `beforeAll`, and vitest's 10s hook default fails as a confusing "1 skipped" rather
  than a timeout. **The gate is SPLIT ONE-FILE-PER-VARIANT** (`baselineSuite.js` holds the whole
  body; each `generator.baseline.<variant>.test.js` is three lines calling `makeBaselineSuite`)
  because vitest parallelizes across FILES, not within them — one combined file pinned 300
  generations to a single worker while 15 cores idled (~40s suite; now ~15s). Each variant owns its
  OWN baseline JSON for the same reason: three workers read-modify-writing one shared file under
  `UPDATE_QUALITY_BASELINE=1` would silently clobber each other's variant. Don't recombine them.
  `UPDATE_QUALITY_BASELINE=1` (writes
  fresh numbers; refuses to write anything worse than what's committed unless
  `FORCE_QUALITY_BASELINE=1` is also set — so `npm test` can never silently launder a quality
  regression into the baseline) vs. plain `npm test` (asserts non-regression). Baseline measures
  `generateScheduleBest` itself (the production path), not bare `generateSchedule`, so a regression
  anywhere in best-of-N/repair is caught, not just in the underlying greedy fill.
- `HOOKS` — `useLocalStorage`.
- tab components in order — `UI PRIMITIVES` (`Modal`, `SectionCard`, `CollapsibleCard`,
  `CollapsibleHeader`, `SubTabs` — segmented-control sub-view switcher, ported from sibling
  `em-scheduler` app; `StatCard` — Dashboard summary tile, also ported from em-scheduler;
  `AutosaveIndicator` — "Saving…"/"Saved locally" pill, now also cloud-aware
  ("Synced"/"Sync error") when cloud sync configured — see "Cloud sync" above), `SPECIAL DAYS
  LIST`, `DASHBOARD TAB` — now the **landing tab** (default `tab` state, Home tab removed
  entirely, see "Dashboard/Home merge" below). Opens with `BlockCalendarSection` — a July→July
  year-timeline (`ayWindowFor`) of every `blocksHistory` snapshot for a selectable AY, each row a
  28ish-cell coverage strip (green/amber/red/gray per day, via `computeCoverageByDate` reusing the
  same `getActiveCoverageShifts` helper the Schedule grid's coverage footer uses) with a
  click-to-expand per-shift×per-date heatmap drill-down; a snapshot's coverage math is built from
  its OWN `id`-only stub resident list (`computeCoverageByDate` only ever reads `r.id`, never
  name/category/PGY, so this works correctly even for a since-changed roster), the live block's
  row always computed from the live `schedule` not a stale snapshot. Clicking "Open Block" calls
  the existing `loadBlock(snap)` — already handles the unsaved-work guard, hydrate, and
  `setTab('schedule')`, no new lifecycle logic needed. Below that: the relocated **Current Block**
  editor (name/AY/start/end via `applyStartDate`, Save/New Block, Import Master Matrix,
  `AYConferenceEditor` for the calendar's selected AY), then the `StatCard` row — schedulable
  residents, shifts filled vs minimum coverage, error/warning counts, days remaining — computed via
  `computeCoverageByDate` and root's consolidated `issues`/`issueCounts` memo, never a second
  `validateAll` pass; also hosts `JournalClubPlanner` — card listing every Journal Club date of the
  AY (`resolveJcDates`, see "Journal Club" below) with a per-PGY presenter **dropdown**, plus
  per-resident worked-JC counts vs `JC_MAX_PER_AY`. Presenter assignment writes the same
  `resident.jcPresentDates` the profile chip editor does, via a functional `setEmRoster(prev => …)`
  matched by id (the card renders from the derived `allResidents` memo, so rebuilding the roster
  from that would drop concurrent edits) — one source of truth, no new state. Then Special
  Days (Code Blue/Procedure/Anesthesia only now — **Peds Advocacy Days removed**, see "Data model"
  below). `RESIDENT FORM` (shared by Add/Edit modals, plus
  `ImportRosterModal` for bulk roster import — `jcPresentDates`/`grLectureDates`/`vacationDates`
  date-chip editors live here alongside `approvedDatesOff`/`jeopardyDates`), `EM RESIDENTS TAB`
  (also hosts the `ImportVacationModal`/`ImportLecturesModal` trigger buttons — see "Matrix
  Import" above — and each PGY-3 EM_HOME resident's chief-role select, see "Chief roles" below),
  `OFF-SERVICE TAB`
  (inline per-tile date-off/jeopardy editors), `SHIFT MATRIX TAB` (rotation-aware shift matrix),
  `RULES TAB` ("Scheduling Rules" in UI — day/rotation rules plus Daily Shift Coverage
  editor, now paired min/max inputs per shift, consumed by generator), `SHIFT PICKER MODAL`
  (its violation aggregator is module-level `cellViolations(resident, dateStr, sid, block,
  eligOverrides, appSettings, dayRules)`, shared with grid's drag-and-drop below so both
  surfaces can't drift apart on what counts as violation) + `SCHEDULE GRID` (main editing grid;
  Generate Schedule / Clear & Regenerate live here, gated by `checkGenerateReadiness` — see
  "Pre-generation readiness gate" below; Grid/By Resident/Calendar `SubTabs` toggle switches to
  `ResidentCardsView` — one card per resident, shifts grouped by week, reusing grid's own
  `violMap` memo rather than second `validateAll` run — or `ScheduleCalendarView` — continuous
  Sunday-start week rows for whole block via `buildWeekRows` (no month-pagination; block
  routinely spans two calendar months), with per-shift-area filter, chip clicks opening
  same `ShiftPickerModal` grid uses; grid also renders **daily coverage footer** — one
  summary row of `filled/minTotal` per date via module-level `computeCoverageByDate` (shared
  with Dashboard stat tiles and Calendar view so none of three can drift), computed
  directly from full schedule, never category-filtered rows, plus click-to-expand
  per-shift rows — supports **drag-and-drop**: dragging shift chip onto empty cell moves
  it, onto occupied cell swaps two, via `handleDrop`/`commitDrop`; both sides validated
  with `cellViolations` against schedule with *other* side's stale date cleared first
  (`scheduleClearing`) so same-resident move can't false-positive against its own old cell;
  violations open `DragConfirmModal` for explicit override, matching picker's "Assign
  Anyway" philosophy. **STICKY AXES**: the date header row and the coverage footer are
  `sticky top-0`/`sticky bottom-0`, the name column is `.grid-sticky` — but that only works because
  the scroll container is now `overflow-auto` with a bounded `maxHeight: calc(100vh - …)`. It used
  to be `overflow-x-auto` with no height, so it never scrolled vertically and `top-0` never engaged
  (vertical scroll happened on `<main>`, outside the sticky ancestor chain) — **don't remove that
  height bound**. Z-ladder inside the grid: cells/badges 10 → header row + footer 20 → the two
  corner cells 30, all below the app header (50) and toast (200). The corner cells set z via an
  INLINE `zIndex`, not a Tailwind class: `.grid-sticky` is UNLAYERED css and beats `@layer
  utilities` regardless of specificity, so a `z-30` class silently loses to its `z-index:10`.
  A `fullscreen` state promotes the grid to `fixed inset-0 z-[60]` (Esc exits) — in-app overlay,
  NOT `requestFullscreen()`. **CELL LOCKING**: `block.lockedCells[residentId][dateStr] = true`,
  inside the block object, so it rides `res_current_block`/backup/cloud sync with no new key; undo
  pairs `{schedule, lockedCells}` because a lock toggle changes only the latter. The generator knows
  NOTHING about locks — `runPartialRegenerate` clears only unlocked cells and calls
  `generateSchedule({clearFirst:false})`, whose `keptCells` protects whatever is already in
  `block.schedule`. Beyond the per-cell toggle there are row/column/all bulk actions, a lock-paint
  mode (click-drag; chip `draggable` is disabled while it's on, or HTML5 chip-drag fights it), and a
  locked counter + Unlock all. **Every bulk action must be ONE functional `updateBlockTracked`** —
  looping the per-cell `toggleLock` would push N undo entries), `VALIDATION TAB` (violations list plus Generation Report — now also
  shows `report.seniorGaps`/`report.restCompromises`; its post-night-day/eve-day pairwise check
  also delegates to `checkCircadianViolations` rather than re-deriving same rule),
  `COVERAGE TAB` (`CoverageTab` — birds-eye staffing COMPOSITION, the thing `computeCoverageByDate`
  throws away: three `SubTabs` views — By Area (shift × date grid, category-colored dots), By Date
  (one date's roster grouped by category+PGY bucket), Totals (per-bucket counts by shift type). All
  arithmetic lives in the pure `src/lib/coverageComposition.js` (`composeCoverage`/`bucketLabel`/
  `COVERAGE_GROUPS`) — a lib module may never import `ResidentScheduler.jsx`, which is exactly why
  the math is there and only the markup is here. It reproduces `computeCoverageByDate`'s two
  non-obvious guards: skip `SHIFT_DOW`-inactive shifts, and resolve `twelveHourStateFor` once per
  date as `getCoverageFor`'s 4th arg. Buckets by `category`/`pgy`; there is NO `isOffService` flag —
  `EM_HOME`→home, `EM_BAMC`→bamc, everything else→offservice),
  `SETTINGS TAB` (backup/restore, `LS_BACKUP_KEYS`, jeopardy policy), `WHAT'S NEW TAB`
  (`WhatsNewTab` — release-notes archive, see "What's New banner" below), `USER GUIDE TAB`. **Requests**
  tab only tab whose component lives outside this file (`src/RequestsTab.jsx`) —
  does own session/role check rather than trusting caller, stays correct even
  though `AppGate` already established viewer is admin. Unlike `feedback`, not
  filtered out of `TABS` when unconfigured; renders own "not configured" message instead.
- **Generator score() weight table + tier audit** (`SCORE_WEIGHTS`/`PREFERENCE_GROUPS`/
  `PREFERENCE_ALWAYS`/`PREFERENCE_BAND_CEILING`/`SCORE_TIERS` near `SOFT_RULES`;
  `src/lib/scoreWeights.test.js`): every weight `score()` uses lives in one exported table instead
  of as inline literals, classified **STRUCTURAL** (changes whether a schedule is acceptable) or
  **PREFERENCE** (pure tie-break). `score()` is a closure over generator state and can't be called
  from a test, which is the whole reason the table is exported — the tests assert against it.
  **Measured finding, recorded rather than "fixed":** the preference bands (22/40/27 per
  mutually-exclusive shift group) EXCEED one shift's worth of `deficit` (5.0 points at the largest
  target, 20), and the smallest structural weight (15) sits below the largest preference band (40).
  On paper a day-of-week/area preference can outrank being 4-8 shifts further from target. It is
  nonetheless **inert**, because `candidatePool`'s `allAtTarget` filter already restricts the
  optional fill phase to residents under their own target — target fairness is enforced UPSTREAM of
  `score()`, not by its weights. Rescaling all preference weights ~6x down was A/B'd over 6 seeds x
  3 fixtures: `deficitSpread` did not move (.0623->.0640, .1073->.1073, .1008->.1020) and
  coverageMiss got slightly worse, so **the rescale was rejected and the original weights kept**.
  If that `allAtTarget` filter is ever loosened the inversion goes live — revisit then. What the
  test file enforces is a **RATCHET**, not the ideal: bands may not grow past recorded ceilings, and
  every weight must be classified into exactly one tier, so a new scoring term forces a deliberate
  decision instead of silently widening a 20-term sum nobody is watching.
- **Work-shape scoring** (`workShapePenalty` in `src/lib/scheduleQuality.js`;
  `workContinuity`/`areaContinuity`/`offAdjacency` in `SCORE_WEIGHTS`): the general-purpose
  complement to `nightShapePenalty`, which only ever saw night runs. Penalizes scattered single
  shifts, day-to-day shift-AREA churn within a run, and a shift butted against vacation/approved
  time off (symmetric — no evidence yet that one side matters more). **Fragmentation is
  deliberately NOT scored the way nights are:** `MAX_CONSECUTIVE_WORK_DAYS` is 6, so an 18-shift
  target REQUIRES >=3 runs — penalizing "every run beyond the first" (the night convention) would
  punish legally-mandated structure. Runs are compared against `ceil(worked / maxConsecutiveWorkDays)`
  and only the excess is charged. Same block-edge exemption as the night metric. Joins the EXISTING
  last vector slot at coefficient 0.5, never a 5th slot — a new slot would rank sequence aesthetics
  above coverage/seniority/rest. Measured effect (6 seeds x 3 fixtures): workShapePenalty
  -5.9%/-1.3%/-6.0%, slot 3 better on all three, errors still 0.
- **AY-to-date fairness carryover** (`computeAyPriorTotals`/`AY_CARRYOVER_MAX_BLOCKS`/
  `AY_CARRYOVER_FULL_AT` above the readiness gate; blend inside `computeQualityMetrics`):
  `deficitSpread`/`nightSpread`/`weekendSpread` are re-measured over (prior AY total + this block)
  so a resident hammered last block doesn't start even again. Reads **published snapshots only**,
  same convention as `countPublishedJC`, capped to the most recent `AY_CARRYOVER_MAX_BLOCKS` (6) —
  that cap is the recency clamp, for the same reason `traumaNightBalance` is clamped (an uncapped
  accumulating term eventually swamps the tiers it was meant to tie-break). Two load-bearing
  properties, both tested: (1) **strict no-op on empty history** — no published prior blocks means
  `confidence` 0 and every blended value is exactly the block-only value, which is why the
  history-free baseline fixtures were unaffected; (2) **a resident with NO history is EXCLUDED from
  the AY population, never zeroed** — zero would read as maximally under-worked and would
  systematically hammer whoever is newest on the roster. Confidence ramps
  `meanPriorBlocks / AY_CARRYOVER_FULL_AT` and needs >=2 residents with history. Metrics also
  report `blockDeficitSpread`/`blockNightSpread`/`blockWeekendSpread`/`ayCarryoverConfidence` for
  diagnostics. `buildQualityInput` takes an optional `blocksHistory` (defaults `[]`).
- **Override capture** (`withOverrideEvents`/`diffScheduleCells`/`summarizeOverrides`/
  `OVERRIDE_LOG_CAP` near `buildSnapData`; `OverrideInsightsCard` on the Validation tab;
  `src/lib/overrideCapture.test.js`): records every hand-edit made to a GENERATED schedule
  (`{residentId, date, from, to, at}`) into `block.overrideLog`, so "the generator keeps doing
  something I can't articulate" becomes a countable list. Hooked into **`updateBlockTracked` only**
  — the single choke point every schedule mutation already routes through, so a future mutator is
  logged automatically rather than silently missed. Two guards, both tested, both easy to get
  wrong: nothing is logged unless the PREVIOUS schedule came from a generation
  (`prev.generationReport`), and a **generation itself is skipped** (detected by
  `generationReport` identity changing) or the act of generating would log hundreds of "overrides"
  against its own output. Rides inside the block object like `offServiceResidents` — **no new
  `LS_BACKUP_KEYS` entry, no `syncBindings` change**; `doLoadBlock` guards the persisted value with
  `Array.isArray` (untrusted shape). Capped at 500 events. The card **reports only** — it never
  infers a rule, never tunes a weight, and nothing in the generator reads it; auto-fitting weights
  to a few dozen events would overfit and destroy the auditability that makes output trustworthy.
- **Pre-generation readiness gate** (`checkGenerateReadiness`, near Journal Club helpers):
  before Generate Schedule runs, warns — with "Generate Anyway" override — if block's manual
  dates look incomplete: `getMissingSpecialDayLists` flags any special-day list
  (`SPECIAL_DAY_META`: Code Blue/Advocacy/Procedure/Anesthesia) that's *relevant* to schedulable
  resident on this block (derived from each resident's effective `specialDayRules`, not
  hardcoded) and still empty, `getJCPresenterGaps` flags any Journal Club date inside block's
  own date range with no PGY-1/2/3 Journal Club presenter (`jcPresentersFor` — extracted from
  `JournalClubPlanner`'s inline filter so gate and planner card can't drift). Clear &
  Regenerate surfaces same `ReadinessWarningPanel` inside own confirm modal rather than
  stacking second one.
- **PDF export** (`// ─── PDF EXPORT ───` section, before `HOOKS`): `exportMatrixPDF` (residents ×
  dates on landscape A3 — ~28-day block's date columns don't fit legibly on letter/A4) and
  `exportResidentCalendarPDF` (one page per schedulable resident, Date/Shift/Time/Notes rows,
  Notes carrying same OFF/jeopardy/JC-presenting/GR-lecture markers `ResidentCardsView` shows
  on screen), both via header "PDF" button → format-picker `Modal` → existing
  `requestExport`/`exportConfirm` error gate. In demo mode both draw a red `pdfDemoBanner` via
  `didDrawPage` so it repeats on every page, not just the first — the table's `margin.top` is
  set to clear the banner's height (`PDF_DEMO_BANNER_H`) whenever `demoMode`, not just its
  `startY` (which only affects page 1); without `margin.top`, autoTable's own default top margin
  on continuation pages sits above the banner and the banner paints over the first couple of
  rows. **`jspdf-autotable@3.8.4`'s default-export interop
  broken under esbuild/Rollup bundling** — `import autoTable from 'jspdf-autotable'` resolves
  to CJS namespace object, not callable function, throws `"...is not a function"` at
  call time (verified against actual installed version via standalone esbuild bundle, same
  engine Vite uses for dep pre-bundling — `npm run build` success alone does NOT catch this,
  since bundling only resolves imports statically without executing them). Fix in this file:
  `import 'jspdf-autotable'` for its side effect only (internally calls its own
  `applyPlugin(jsPDF)`, patching `doc.autoTable(...)` on as instance method), then always call
  `doc.autoTable({...})` — never bare `autoTable(doc, {...})` function form. If `jspdf-autotable`
  ever upgraded to v4/v5 release with proper ESM build (like sibling `em-scheduler` app,
  which pins `^5.0.7` and uses plain `import autoTable from 'jspdf-autotable'` + `autoTable(doc,
  opts)` form successfully), re-verify with same esbuild-bundle technique before switching
  call sites back.
- **What's New banner** (`CHANGELOG`/`WHATS_NEW_KEY`/`unseenChangelog`/`WhatsNewModal`): release
  notes shown once, automatically, the first time someone opens the app after it updates —
  deploys are invisible to the chief, and the 12h-conference swap already shipped once and went
  unnoticed for exactly that reason. Newest entry FIRST; everything above the stored `id` is shown,
  so skipping two releases shows both, and dismissing stores only `CHANGELOG[0].id`. `id` must
  change ONLY when there's something worth interrupting someone for. No stored id (new install, or
  predates the feature) shows the full list once. `res_whats_new_seen` is device-local and
  **deliberately excluded from `LS_BACKUP_KEYS`** — same posture as `res_dark_mode`/`res_demo_mode`:
  restoring a colleague's backup must not mark it read for you. Entry text supports `**bold**` and
  nothing else, on purpose (entries stay plain strings that can't inject markup) — the splitter is
  the module-level `renderChangelogText`, shared by the banner and the archive tab so the two can't
  drift. **The archive is the `whatsnew` TAB** (`WhatsNewTab`): every entry, permanently, newest
  first, unread ones badged **New** and counted on the sidebar. `unseenChangelogFor(seenId)` is the
  pure slice both surfaces use; `unseenChangelog()` is just that plus the localStorage read. Root
  holds `seenChangelogId` as STATE (not a per-render storage read) so the sidebar badge clears
  reactively, and **`markChangelogSeen()` is the single writer** — banner dismiss and opening the
  tab both go through it. `WhatsNewTab` FREEZES its unseen set at mount before calling
  `onMarkSeen()`, so the **New** pills are still visible on the very visit that clears them.
  Settings → What's New now navigates to that tab rather than re-opening the modal.
- **Dark mode** (`darkMode` state → `res_dark_mode`, Sun/Moon header toggle, `.dark` class on
  root div): override stylesheet in `index.css`, not Tailwind `dark:` variants — this file
  has thousands of class strings, variant-based approach would mean touching all of them.
  Ported from sibling `em-scheduler` app's `.em-dark` sheet, extended, since this app uses
  BOTH `gray-*` and `slate-*` neutrals (em uses only `slate-*`) plus wider set of category-tint
  hues (`indigo`/`sky`/`emerald`/`yellow`/`orange`/`pink`/`violet`/`teal`/`stone` — see
  `CATEGORIES`). Wrapped in `@media screen` so print/PDF output always stays light regardless of
  viewer's theme. `res_dark_mode` excluded from `LS_BACKUP_KEYS` — see "Persistence" above.
- **Dashboard/Home merge**: the Home tab is GONE — `TABS` no longer has a `'home'` entry, default
  landing `tab` is now `'dashboard'` (a one-line `useEffect` redirects any stale persisted
  `tab==='home'` to `'dashboard'`; `reconcileTabOrder`'s existing unknown-id guard already
  tolerates a leftover `'home'` in a persisted `res_tab_order` array). Home's old Saved Blocks
  list was removed outright (no delete-snapshot capability existed on it to preserve — verified
  by grep before removing, Publish/Load were its only actions, both already on `BlockCalendarSection`)
  since `BlockCalendarSection` fully replaces it; Home's Current Block editor, Import Master
  Matrix trigger, and `AYConferenceEditor` all moved onto the Dashboard tab (see the `DASHBOARD
  TAB` bullet above). If you're looking for "Home tab" in an old comment/doc/design-spec file,
  read it as "Dashboard tab" now.
- `MAIN APP` — `TABS` nav array; `reconcileTabOrder`/`reorderIds` (pure helpers behind
  sidebar's drag-to-reorder — reconcile guards against non-array persisted order, reorder
  always lands dragged tab immediately before drop target regardless of drag direction);
  `SidebarNav` (own component, not inlined in root — keeps drag-hover state from re-rendering
  whatever tab content currently mounted; now also renders shift-area/GR/OFF/J **legend**
  panel below nav, splits Validation tab's badge into separate rose-error/amber-warn
  counts plus green check when non-empty schedule has neither); root `ResidentScheduler`
  component: all state via `useLocalStorage`, `saveBlock`/`loadBlock`/`newBlock`/
  `toggleBlockPublished`, `exportCSV`, header/tab-routing render, single `issues`/`issueCounts`
  memo (one `validateAll` pass shared by sidebar badges, `pendingErrorCount`, and
  Dashboard stat tiles, instead of one pass per consumer). `saveBlock` explicitly preserves
  existing snapshot's `published` flag when re-saving same block id (snapshot replaced
  wholesale, easy to lose this). Header light shell (white bar, gradient indigo
  logo tile) mirroring `em-scheduler`'s layout language with this app's own indigo accent (em uses
  rose), plus `AutosaveIndicator` pill next to CSV/PDF export buttons.

## Data model & conventions
- Shift IDs follow `AREA-TYPE` (e.g. `POD-D`, `MT-N`, `TRAUMA-D` — note TRAUMA has no evening shift;
  `PED-S` and `PED-N-FM` are the TWO exceptions — `PED-S` is `AREA-first-letter-of-type`, reading
  cleanly since its type is `'swing'`; `PED-N-FM` is `AREA-TYPE-QUALIFIER`). Nothing parses a shift
  id by splitting on `-` (the only two regexes match `D12|N12`) — don't introduce one. Keep this
  convention adding areas/shifts so lookups via `SHIFT_MAP` keep working.
- `SHIFT_TIMING` start/duration hours used to compute rest periods across midnight — add
  shift, add its timing entry too, or rest-period validation silently skips it. `DEFAULT_COVERAGE`
  needs no manual update for shift already in `DEFAULT_COVERAGE_MINMAX` — shift missing from that
  map falls back to `{min:1,max:1}` in `DEFAULT_COVERAGE`, `{min:0,max:0}` only if isn't in
  `SHIFTS` at all (can't happen for one just added there). **A `SHIFTS` entry with no explicit
  `DEFAULT_COVERAGE_MINMAX` entry therefore silently demands 1 body EVERY day (~28 phantom
  unfilled slots/block) — `coverage.test.js` now enforces the catalog-wide invariant that every
  `SHIFTS` id has one, so this can't recur.**
- **Coverage is min/max, not single number.** `getCoverageFor(shiftId, coverage)` returns
  `{min,max}` — generator fills every shift to `min` first (hard: below-min is `unfilled`
  slot, Validation warning), then optionally tops up toward `max` only for residents still
  under own shift-count target (soft: `max` cap on how many CAN work shift, never
  requirement they do). `normalizeCoverageEntry` accepts legacy single-number shape from
  old backup, converts to `{min:n,max:n}` at read time — no migration effect needed.
  PED-N defaults to `{min:0,max:1}` since depends entirely on FM-3 being on block; TRAUMA-D/
  TRAUMA-N always clamped to max 1 in editor (see trauma double-booking rule below).
  Coverage intentionally NOT day-of-week-dependent (chief's call) — `PED-S` one
  shift that only exists on certain weekdays at all, handled via separate `SHIFT_DOW` map, not
  general per-day coverage feature.
- **12-HOUR SHIFT WINDOWS** (`src/lib/coverage.js`, `ayData[AY].twelveHourWindows`): the 8 twelve-hour
  shift ids (`POD/MT/FLEX/PED` × `-D12`/`-N12`) are only staffed inside a chief-defined WINDOW:
  `{id, label, start, end, areas:['POD'|'MT'|'FLEX'|'PED'], mode:'replace'|'add', coverage?:{[sid]:{min,max}}}`.
  Edited on the Dashboard AY band (`TwelveHourWindowsEditor`). **Backward compat is the whole
  design**: `resolveTwelveHourWindows(ayConf)` returns the explicit list when
  `Array.isArray(ayConf.twelveHourWindows)` (an explicit `[]` = no windows, no fallback), else
  `implicitConferenceWindows(ayConf)` — one `mode:'replace'` POD/MT/FLEX window per ACEP/AAEM/SAEM
  range, i.e. exactly what the old hardcoded `isConferenceCoverageDate` swap did. **ITE is excluded**
  (single exam day, not a coverage scenario). An AY nobody has opened behaves identically to before
  the feature; touching anything in the editor materializes the implicit windows as real rows.
  `isConferenceCoverageDate` and the `CONF_*_IDS` swap arrays are GONE as a mechanism — don't
  reintroduce a second answer to "does this date run 12h".
  **`twelveHourStateFor(dateStr, ayConf)` NEVER returns null** — always
  `{replaceAreas:Set, addAreas:Set, covOverride:{}}`, empty sets on an ordinary date. This is
  load-bearing: `getCoverageFor`'s 4th param is now that state object (never a boolean), and it
  reads `undefined` as "caller has no date context" → base numbers. A null return would therefore
  fall through and make every 12h DEFAULT_COVERAGE minimum live on EVERY date of every block.
  (That was a real latent bug: the old guard was `if (confActive != null)` and
  `isConferenceCoverageDate` returned `undefined` for an `ayConf` of `{}`. Production escaped it
  only because root passes `DEFAULT_AY_CONF`'s empty STRINGS; the test fixtures pass `{}`, so every
  committed quality baseline had ~10 phantom minimums/day — fixing it dropped `coverageMiss` by
  exactly 280 (10 × 28 days) in all three variants, every other vector slot unchanged.)
  Resolution chain inside `getCoverageFor`, scoped to `TWELVE_HOUR_IDS` + normal ids of
  `replaceAreas` (everything else keeps the untouched base path):
  (1) normal id, area ∈ `replaceAreas` → `{0,0}` **returned immediately** (no TRAUMA clamp, no dow
  max-raise — otherwise a suppressed POD-D on a conference Monday reports max 3 via
  `DOW_COVERAGE_MAX_OVERRIDE`); (2) 12h id in neither set → `{0,0}`, **EXCEPT PED-D12/PED-N12**,
  which fall through to the base path so PED's documented year-round coverage opt-in still works;
  (3) 12h id in a window → `covOverride[sid]` → global `coverage[sid]` **if explicitly present**
  (`normalizeCoverageEntry` returns null for absent but `{0,0}` for an explicit zero, and the
  Rules-tab editor is sparse — it DELETES keys equal to the default — so this branch is live) →
  `replace ? DEFAULT_COVERAGE[sid] : {0,0}`. The add-mode `{0,0}` default prevents POD+`add` from
  demanding 2+2+2 nine-hour PLUS 2+2 twelve-hour = 10 bodies/day; putting it AFTER the explicit
  global check prevents zeroing a chief's existing `PED-D12 {1,1}` on the very dates they enabled.
  `twelveHourAllows(sid, state)` is shared by `getCoverageFor` and `getEligibleShifts` step 8 so
  coverage and eligibility can't drift — but **each caller owns its own `state === undefined`
  behavior**, and they are legitimately opposite (eligibility strips the swap ids with no state;
  coverage shows base numbers, which is what the Rules-tab editor renders). The generator resolves
  state once per date through a memoizing CLOSURE (`conf12For`), never a prebuilt map — a map miss
  yields `undefined` and would silently restore the phantom minimums. Rules-tab totals EXCLUDE
  `TWELVE_HOUR_IDS` (they inflated the headline by 10 min / 18 max on every ordinary day), and
  those cells are labelled the **in-window** default, not an outside-window one.
- **PED-N SPLIT INTO TWO SHIFT IDS (2026-08-18).** One `PED-N` used to model two different
  real-world shifts, at the wrong hours for one of them. They are now separate:
  - **`PED-N` "Peds Night", 19:00–04:00, EM_HOME_1/2/3 only, Thu–Sun.** Confined by the
    `overrideImmune` `ped_n_em_window` shiftGate (`allowedDays: [0,4,5,6]` — Sun/Thu/Fri/Sat, i.e.
    Thu-through-Sun; the gate ALSO stops an EM resident being placed on it Mon/Tue/Wed, when the
    19:00 shift does not exist at all, which is why the gate is still needed post-split). PGY-1 is
    soft-deprioritized via `score()`'s `pedNPgy1Deprioritize` unless `hasPriorPedsTrauma`.
  - **`PED-N-FM` "Peds Night (FM Only)", 23:00–08:00, FM_3 only, Mon/Tue/Wed.** `BASE_ELIGIBILITY.FM_3`
    is now `['PED-N-FM']` — `PED-N12` was dropped (19:00–07:00, the 12h variant of the *EM* timing,
    never FM's). Accepted tradeoff: under a `mode:'replace'` PED 12h window, `twelveHourAllows`
    strips `PED-N-FM` and FM-3 has zero eligibility those dates.
  Both stay `{min:0,max:1}` (best-effort, not required — chief: "does not HAVE to be someone
  scheduled"), both stay `type:'night'` (FM-3's `isNightOnlyResident` exemption depends on it), and
  `PED_GUARD_LEGITIMATE_OWNER` is now `{'PED-N': ['EM_HOME_1','EM_HOME_2','EM_HOME_3'],
  'PED-N-FM': 'FM_3', 'PED-S': 'EM_HOME_2'}` — back to single-owner for the FM shift.
  **Three non-obvious consequences of the split, all load-bearing:**
  1. **`shiftOverlapsJC('PED-N')` flipped false→true** (it is `startH < 21 && startH+durationH > 18`;
     false at 23:00, true at 19:00). Currently **LATENT** — `ped_n_em_window` confines PED-N to
     Thu–Sun and Journal Club defaults to first Tuesdays, so an EM resident can't be on it on a
     default JC date. It goes live the moment the chief moves a JC date onto a Thu–Sun. Don't
     promise changed JC counts.
  2. **Ending at 04:00 made night→evening-next-day legal for the first time** — `checkRestViolations`
     passes (10–11h ≥ the 9h `durationH`) and the circadian hard rules only covered eve→day/day→eve.
     `checkCircadianViolations`' backward `postNightRest` scan was widened from `newType === 'day'`
     to `'day' || 'eve'` to close it. Keep it a soft `rule:'postNightRest'` warn, under `rulePriority`.
  3. **Legacy eligibility overrides need a RENAME, not just a backfill** — see
     `LEGACY_SHIFT_ID_RENAMES`/`applyLegacyShiftIdRenames`/`renameDiffShiftIds` in
     `src/lib/eligibilityOverrides.js`, and the one-shot `migratePedNightAssignments` mount effect
     in `ResidentScheduler.jsx` that rewrites existing FM `PED-N` cells in `block.schedule` AND
     every `blocksHistory` snapshot (skipping resident ids it can't resolve rather than guessing).
     Without the latter, every FM-3 peds-night cell already on disk becomes a hard `validateAll`
     "not eligible" error and poisons `generateScheduleBest`'s error-count ranking. That effect is
     gated on **`dbReady`, not `[]`** — it writes a one-shot device-local marker
     (`res_pednfm_migrated`), so running before the mount-time cloud overlay resolves would migrate
     the pre-overlay localStorage copy, burn the marker, and then be silently overwritten by the
     cloud row's still-unmigrated `res_current_block`/`res_blocks_history` with no second chance.
     Any future one-shot-marker migration needs the same gate; the `LEGACY_*_DEFAULTS` prune effect
     above it does NOT, because it stores no marker and simply re-runs on the next mount.
  **PED-S (Peds Swing) is still
  EM-Home-PGY-2-on-EM/TOX-or-EM/EMS-only program-wide** — no other category/PGY ever eligible,
  including via Shift Matrix rotation override (`overrideImmune: true`); PED-S coverage is now
  `{min:0,max:1}` too (chief: "no priority for peds swing shift to be filled"). Add a new
  eligibility entry, don't add PED-S to it (PED-N's guard is now intentionally multi-owner).
- **EM_HOME_2's EM/EMS ↔ EM/TOX weekday windows swap on 2026-08-01** (chief-directed change, not
  bug): before that date EM/EMS covers Mon/Tue, EM/TOX covers Thu/Fri; from that date on it's
  reversed. Both variants live in `DEFAULT_DAY_RULES.EM_HOME_2.shiftGates` simultaneously,
  distinguished by `activeWhen`, so saved block's own `startDate` always resolves to correct
  rule — don't try to "clean up" this into single gate.
- **Circadian rules** (see `NIGHT_RULES`): nights should cluster into one run of 4-6 (max 6, hard);
  evening shift can never be immediately followed by day shift next day, or vice versa
  (hard, even when plain rest-hour math would otherwise clear it); **the backward `postNightRest`
  scan covers a following DAY *or EVENING* shift** — widened from day-only when `PED-N` was retimed
  to end at 04:00, which made night→eve-next-day pass `checkRestViolations` (10-11h ≥ the 9h
  `durationH`) while no circadian arm looked at it at all; max 6 total night shifts per
  block, except residents whose entire eligibility is night-only (today: FM-3) — `isNightOnlyResident`
  exempts them from both per-block cap and short-run warning, since FM-3's Mon/Tue/Wed-only
  day rule makes 4+-night run structurally impossible anyway. **≥24h off after night run before
  resuming day shift — or before Grand Rounds — is ranked *soft* rule** (`rule:'postNightRest'`
  in `checkCircadianViolations`, `grRestGapH` covers GR case since GR never schedule
  entry), checked in both directions (backward when placing day shift, forward when placing
  night shift ahead of already-placed day shift — generator's optional fill pass runs after
  TRAUMA-D filled, so one-directional check let violations slip through generation). See
  "Soft Rule Priority" below how generator decides whether to break it. **The hard circadian
  checks (`checkCircadianViolations`) and the Grand-Rounds rest-gap check now run in
  `validateAll` regardless of `appSettings.enforceRest`** — that toggle now only gates the
  pairwise legal-rest-hours check, matching the generator, which already enforced circadian
  rules unconditionally; previously a chief who disabled the rest-hours toggle also silently lost
  hard eve→day/day→eve validation. TRAUMA-D/TRAUMA-N are hard-clamped to at most 1 resident in
  the generator's own coverage handling regardless of the chief's coverage-editor max (manual
  double-booking via the picker is still caught separately by `validateAll`, unconditionally).
  The generator also tracks a rolling per-resident hours total against a pro-rated ACGME 80h/week
  average and hard-excludes candidates who'd exceed it (`reason: 'hoursCapped'`) — `validateAll`'s
  `weeklyHourStats` warn remains the authoritative retrospective check for edge cases the
  pro-ration approximates.
- **Soft Rule Priority** (`appSettings.rulePriority`, `SOFT_RULES`, `DEFAULT_RULE_PRIORITY`,
  `normalizeRulePriority`, `ruleRank` — all near `NIGHT_RULES`): chief-orderable ranking of three
  soft rules — `coverageMin`, `seniorComposition`, `postNightRest` — edited on Rules tab
  ("Soft Rule Priority" card, up/down reorder). Default order ranks `coverageMin` highest, so
  generator's min-fill pass reaches for rest-violating or junior candidate before leaving slot
  unfilled (recorded in `report.restCompromises`/`report.seniorGaps`); reordering `postNightRest`
  or `seniorComposition` above `coverageMin` instead leaves slot unfilled to protect that rule
  (`report.unfilled` reasons `'restProtected'`/`'seniorProtected'`) — see `candidatePool`'s
  `{candidates, restFallback}` split and `fillDayPass`'s min-phase fallback logic in
  `generateSchedule`. `rulePriority` lives in `res_app_settings`, already covered by
  `LS_BACKUP_KEYS` — no new backup key or LEGACY migration needed (`normalizeRulePriority` handles
  old backup with no `rulePriority` field by falling back to default order).
- **Journal Club**: 18:00-21:00; "worked" derived from `SHIFT_TIMING` overlap (`shiftOverlapsJC`),
  not hand-maintained shift-id list, so automatically covers PED-S and Trauma Night. Max 3 worked
  per academic year (July 1–July 1), counted across **Published** saved blocks plus live block
  (`countPublishedJC`/`countCurrentBlockJC`) — unpublished saved block does NOT count, so chief
  must mark block Published once final for cap to track it correctly. Presenting dates
  (`resident.jcPresentDates`) chief-set per resident on profile OR from the Journal Club card;
  presenter's own overlapping shifts hard-stripped from their eligibility that day, generator
  additionally avoids placing late night shift that evening (manually placeable, with Validation
  warning).
- **JC DATES ARE CHIEF-EDITABLE PER AY** (`src/lib/journalClub.js`, `ayData[AY].jcDates`):
  Journal Club defaults to the first Tuesday of each month but isn't always — the chief moves one
  occasionally, so the date list is now data. **Absent `jcDates` = derive first Tuesdays**, exactly
  as before (zero migration; an explicitly-stored `[]` is honored as "no JC this year" and does NOT
  re-derive). The Dashboard AY band's `JournalClubDatesEditor` materializes the whole derived list
  on the FIRST edit before applying it, so removing one date can't silently drop the other eleven;
  "Reset to first Tuesdays" **deletes the key** rather than storing the derived list.
  `isFirstTuesday`/`getFirstTuesdaysInRange` **moved out of `ResidentScheduler.jsx` into
  `lib/journalClub.js`** — mandatory, since a `lib` module may never import that file and the
  resolvers need them. Every consumer goes through one of four helpers, never re-deriving:
  `resolveJcDates(ay, ayConf, {fallbackDateStr})` / `jcDatesInRange(...)` /
  `isJcDate(dateStr, ay, ayConf, opts)` (AY-scoped, hot paths) /
  `isJcDateAnyAy(dateStr, ayData)` (profile + import validators, which legitimately see other AYs;
  a missing `ayData[thatAy]` falls through to DERIVED dates, never to `[]`). Two non-obvious
  requirements, both load-bearing: `ayWindowFor().end` is EXCLUSIVE (subtract a day before handing
  it to the inclusive `getFirstTuesdaysInRange`), and a block with a blank/malformed
  `academicYear` must fall back to `getAcademicYearFor(block.startDate)` — JC worked with no AY
  before this change, and silently losing the cap/presenter-gap warnings would be a regression.
  In `validateAll` the `jcPresentDates` loop is **scoped to this AY's window** before applying
  `isJcDate`: those dates accumulate across years, and the old AY-agnostic `isFirstTuesday` let
  prior-year entries pass. Note moving a date **retroactively** changes worked-JC counts for
  already-published blocks (`countPublishedJC` recomputes against the current list) — accepted.
  The generator hoists a JC-date `Set` once per run (`isJcDay`), since `isJcDate` otherwise lands
  in `score()`, which runs per candidate per slot.
- **Grand Rounds lecture dates** (`resident.grLectureDates`, EM_HOME + EM_BAMC): no evening/night
  shift day before lecture date — hard-stripped from eligibility (generator, manual
  picker both), `validateAll` errors if stale/imported schedule violates it. Validated to fall on
  resident's own GR weekday via `grWorkDow` (Wednesday for EM_HOME, Thursday for EM_BAMC).
- **FLEX seniority stays soft** (`SENIOR_COMPOSITION.FLEX = {primary:2,fallback:3}`, chief's own
  call: "keep eligibility, composition only" — no change): every staffed FLEX shift needs EM
  PGY-2 (fallback PGY-3); generator restricts to the senior sub-pool while none present, falls
  back to full pool (recording `report.seniorGaps`) only if no senior at all — staffing junior
  beats leaving min-coverage slot empty. **POD seniority is now HARD** — `SENIOR_COMPOSITION.POD
  = {primary:3,fallback:2}` still names a fallback, but `validateAll` raises a hard ERROR
  (not a soft `seniorGaps` warning) for a staffed POD shift with no PGY-3, UNLESS
  `podWellnessSubstituteAllowed(ds, blockStart)` is true — i.e. UNLESS `ds` is that resident's
  own "3rd Wellness Wednesday" (see below), the ONE day a PGY-2 may substitute. **The generator
  now enforces this too**, in its own POD branch inside `fillDayPass` (previously it fell through
  to the generic `isSeniorFor`/`seniorPool` path shared with FLEX, which accepts the PGY-2
  fallback on any day and would routinely build PGY-2-only POD groups `validateAll` then
  errored on) — while no PGY-3 (or WW-substitute PGY-2) is assigned, the candidate pool is
  restricted to residents satisfying the real requirement; if none are available even via the
  min-phase rest-priority fallback, the slot is left unfilled and reported with reason
  `'pgy3Required'` rather than staffed with the wrong PGY. **WEDNESDAY DAY SHIFTS ARE EXEMPT FROM
  BOTH RULES** (`seniorCompositionExempt(shift, ds)` = `shift.type==='day' && dow===3`, declared
  right after `podWellnessSubstituteAllowed`): every EM Home PGY carries
  `dayTypeRestrictions:[{days:[3],mode:'noDay'}]` for Grand Rounds, so a POD/FLEX DAY shift
  structurally CANNOT have an EM senior on a Wednesday — the requirement was unsatisfiable, and the
  generator responded by refusing to fill Wednesday POD-D at all. Chief-confirmed: Wednesday days
  are covered by off-service residents and APPs while the seniors are at Grand Rounds, so no senior
  is required. Wednesday EVE/NIGHT shifts keep the full rule, and coverage minimums are unchanged.
  This is a DIFFERENT exception from the Wellness-Wednesday PGY-2 substitution — don't conflate
  them. The helper is applied at FOUR call sites that must stay in lockstep (`validateAll`'s senior
  loop, `fillDayPass`'s POD branch *and* its generic FLEX branch, `narrowForSeniority`,
  `podStillSatisfied`); changing one alone makes the validator and the generator disagree. POD coverage is
  `{min:2,max:2}` all week, except Mon/Tue where max rises to 3 (`DOW_COVERAGE_MAX_OVERRIDE`,
  `getCoverageFor(shiftId, coverage, dow)`'s third `dow` param — the ONLY day-of-week-dependent
  coverage exception in the app; the Rules-tab coverage EDITOR stays simple/non-dow-aware, just
  has a caption noting the Mon/Tue bump). `score()` gives a soft +15 bonus to an EM Home/BAMC
  PGY-1 filling POD's 2nd/3rd slot once a PGY-3 is already present (`podPgy1SecondSlot`).
- **Wellness Wednesdays** (`computedDayRules: [{type:'wellnessWednesday', ordinal:N}]`,
  `nthWeekdayOnOrAfter` helper): EM_HOME_1 gets the block's 1st Wednesday off day/eve, EM_HOME_2
  the 2nd, EM_HOME_3 the 3rd (night shift starting that Wednesday still allowed — only day/eve
  types stripped). Block-relative (Nth Wednesday on/after `block.startDate`, NOT the calendar
  month), so `getEligibleShifts`'s `ctx.blockStart` must actually reach every call site — a prior
  bug had the Schedule grid's own cell-eligibility call omitting `ctx` entirely, silently
  no-op'ing this and the Peds/Trauma half-split for that one caller; fixed, but if you add a new
  `getEligibleShifts(...)` call site, always pass `{blockStart: block.startDate, ...}`. Grid marker
  "WW" (violet) takes visual priority over the "GR" (yellow) marker on a resident's own wellness
  Wednesday (both would otherwise apply to every EM_HOME Wednesday).
- **Chief roles** (`resident.chiefRole: null|'academic'|'admin'|'scheduling'`, global roster field
  on `emRoster`, NOT per-block — replaced the old per-block `emBlockAssignments[id].isChief`
  checkbox): any of the three roles gives the 16-shift target via `getShiftTarget`
  (`effectiveChiefRole(resident)` = `chiefRole || (legacy isChief ? 'scheduling' : null)`, a
  READ-TIME-ONLY backward-compat fallback for old saved blocks — never migrates/writes). Only the
  `academic` role carries a hard rule: no Tuesday evening/night shifts (`getEligibleShifts`
  inline check on `resident.chiefRole==='academic'`, deliberately NOT the legacy-fallback version
  — old saved-block chiefs aren't retroactively Tuesday-restricted). Badge: `★A`/`★Ad`/`★S`.
- **Peds Wednesdays off, advocacy feature removed**: `PEDS_1`/`PEDS_3` now `fullBlockDays:[3]` —
  Peds residents simply don't work Wednesdays, full stop. The old mechanic this replaced
  (`specialDayRules:[{listKey:'advocacyDays',offset:'dayBefore'}]`, a chief-edited date list) is
  gone from `SPECIAL_DAY_META`/the Dashboard Special Days editor/the readiness gate — **old saved
  snapshots may still carry a stale `data.specialDays.advocacyDays` array; it's simply never read
  anymore, don't migrate it, don't resurrect it.** Peds coverage on Wednesdays now comes entirely
  from EM Home/BAMC — automatic once Peds is excluded via `fullBlockDays`, no extra code needed.
- **IM/TOX weekday tightening**: `IM_2.dayTypeRestrictions` is now
  `[{days:[2],mode:'onlyDay'},{days:[3],mode:'onlyNight'}]` — no Tue eve/night, no Wed day/eve
  (Wed night OK). EM_TOX residents (EM_HOME_2 on the `EM_TOX` rotation, already Mon/Tue-gated
  post-2026-08-01 via the existing `em_tox_window*` shiftGates) get a soft `+8` score bonus for
  `PED-E` specifically (chief: "ideally only evening peds") — a preference, not a gate change.
- **Vacation is now a distinct hard-off concept** (`resident.vacationDates[]`, global roster
  field) — separate from `approvedDatesOff` (day-off-request-approved) even though both behave
  identically in `getEligibleShifts`/`validateAll` (early-return empty pool / hard conflict
  error). Kept distinct so imports/exports/UI can label vacation vs. approved-off differently
  ("VAC" teal marker vs. "OFF" orange marker, same grid/cards/PDF/legend sites as OFF).
- **Per-block target overrides ("buy-downs")** — `block.emBlockAssignments[id]` gained
  `{targetDelta, targetNote, targetIsBuyDown}` alongside `{blockType, isChief}`. A **DELTA**, never
  an absolute number, so it survives a `SHIFT_TARGETS` change and is self-documenting. It reaches
  the generator/validator/quality scorer through the EXISTING `allResidents` denormalization seam
  (same line that already carries `blockType`/`isChief`), so **`getShiftTarget`'s signature never
  changed** and `buildSnapData` needs no edit. Three things that are easy to get wrong:
  1. **`getShiftTarget` had FOUR early returns and is now a single tail return.** Appending the
     delta step after the branches would be dead code for chief residents and for any category with
     a Settings `targetOverrides` entry — the buy-down would be silently ignored for them.
  2. **A delta that zeroes the target returns `null`, NOT `0`.** `targetBearing` in
     `scheduleQuality.js` is `targets[r.id] != null`, and `0 != null` is TRUE — a target-0 resident
     would stay in the fairness population scoring `assigned/target` = 0, the maximal outlier,
     weighted ×10 in vector slot 3, swamping their whole cohort's spread. `null` = fairness
     non-participant, exactly like a self-cover resident, and every consumer already handles it.
  3. **`computeQualityMetrics` takes a second `baselineTargets` map** because
     `scaledTarget = target * (prior.blocks + 1)` would otherwise multiply a ONE-BLOCK delta across
     the whole AY carryover. It is `(baselineTargets?.[r.id] ?? target) * prior.blocks + target` —
     **the per-resident `?? target` fallback is mandatory**, since the baseline suite and ~34 test
     calls never pass the map and `undefined * n` would silently collapse `ayDeficitSpread` to 0
     with no test failing loudly.
  `ImportMatrixModal` now MERGES per-resident assignment records instead of replacing them, or a
  Master Matrix re-upload would wipe the deltas (and `isChief`, which it already did).
  Off-service residents carry `targetDelta` directly on the resident object inside the block —
  they're per-block by construction, so they need no seam.
- **Jeopardy & sick-call ledger** (`appSettings.jeopardyLog`, `src/lib/jeopardyLedger.js`,
  `JeopardySickCallsCard` on the Dashboard): ONE incident record per real event —
  `{id, date, shiftId, sickResidentId, activatedResidentId, note, at}` — with both the sick-call
  count and the activation count DERIVED from it, so they can never disagree. `activatedResidentId`
  is nullable (shift ran short / self-covered → nobody earns a credit). Activations earn buy-down
  credits; `targetIsBuyDown` deltas spend them; the card shows earned/spent/remaining and
  **nothing auto-applies to any target** (same restraint as override capture — auto-applying would
  move generator output without an explicit decision). `remaining` is NOT clamped: negative means
  the chief over-spent and needs to see it.
  **It lives in `appSettings`, NOT its own `res_*` key, and that is load-bearing.** The cloud write
  is a whole-column replace (`sbSaveState` posts a `data` document built fresh from *that build's
  own* `LS_BACKUP_KEYS`), so a device on an older bundle would write a document lacking a 10th key
  and **silently drop the ledger from the shared row** — permanent loss of the record the buy-downs
  are audited against. `setAppSettings(p => ({...p, …}))` spreads, so an old bundle round-trips
  `res_app_settings` opaquely and preserves a sub-key it has never heard of. **A future "cleanup"
  promoting this to its own key would reintroduce that bug.**
  `computeBuyDownsApplied` deliberately counts **published AND unpublished** snapshots — unlike
  `countPublishedJC`/`computeAyPriorTotals`, which are published-only because they feed generator
  scoring. This is an advisory count of an administrative promise: a buy-down entered on a draft
  block is genuinely spent, and published-only would show phantom credits and invite double-spending.
  It `continue`s on `snap.id === block.id` and adds the live block separately — that guard is what
  stops a block being counted against its own snapshot.
- **QGenda CSV REWORKED (2026-08-18) — two lean variants, chief-editable task names.** The chief
  reported "nothing imports, unreadable" and has **no QGenda admin rights, so he cannot trial-run**.
  Every choice here is therefore biased toward *he can fix it himself without a redeploy*:
  - `src/lib/qgenda.js` (pure, must never import `ResidentScheduler.jsx`) owns `QGENDA_TASKS`
    (our shift id → his REAL QGenda task name: `POD-*` → "MC Team …", `FLEX-*` → "Flex Team …",
    `MT-*` → "Midtrack …", `PED-N-FM` → "Peds Night (FM Only)", `TRAUMA-N` → "Trauma Night-PGY2+3";
    **`TRAUMA-D` is a FUNCTION** — "Trauma Day-Intern" for PGY-1 else "Trauma Day"), plus
    `qgendaTaskFor()`, `qgendaName()`, and `QGENDA_VARIANTS`.
  - **The eight 12h ids are deliberately absent** from `QGENDA_TASKS` and fall back to our own
    label with `source:'fallback'`, which raises a pre-export warning through the EXISTING
    `exportConfirm` dialog. Never blank (most likely to fail the whole import), never a silent
    skip (a skipped row is a resident who doesn't exist in QGenda — nobody notices until someone
    doesn't show up). `source` makes flipping to skip-with-warning a one-line change.
  - **Column NAMES live in `QGENDA_VARIANTS[*].columns` as DATA** (`minimal`: `Staff,Date,Task`;
    `withTimes`: `+EndDate,StartTime,EndTime`) precisely because we can't verify what QGenda
    expects — a wrong header must stay a one-line fix.
  - Chief overrides: `appSettings.qgendaTaskOverrides` (sparse — the Settings editor DELETES a key
    that is blank or equals the default), `qgendaNameFormat`, `qgendaBom`, plus a per-resident
    `resident.qgendaStaffId` escape hatch that `qgendaName()` honours ahead of every format.
    **No new storage key** — `res_app_settings` already rides `LS_BACKUP_KEYS`/`syncBindings`.
  - `downloadCSV(filename, rows, {bom, quoteMode})`: **CRLF + trailing terminator for ALL CSV
    exports** (RFC 4180). BOM defaults ON for the human-facing Grid CSV, OFF for QGenda (a BOM
    makes the first header cell literally `﻿Staff`). `quoteMode:'minimal'` for QGenda —
    `"Smith, J"` contains a comma, so quoting is a live variable worth being able to change.
  - **The demo guards test `kind === 'qgenda'` by EQUALITY**, so the variant is threaded as a
    SECOND argument (`requestExport(kind, variant)`) and never folded into the kind string —
    folding it in would silently stop guarding and let the sandbox emit real resident names.
- **QGenda CSV `Start`/`End` are derived from `SHIFT_TIMING[sid].startH/durationH`**
  (numeric source of truth), not by splitting the shift's DISPLAY label string on an en-dash —
  the old approach broke silently if a label's formatting ever changed and had no
  midnight-rollover handling. New `EndDate` column added (`= Date` unless
  `startH + durationH >= 24`, then `Date + 1`) so an overnight shift's end is unambiguous.
  **`Date`/`EndDate` use a dedicated `qgendaDate()` formatter (`src/lib/dates.js`) that
  renders `M/d/yyyy` (4-digit year)** — QGenda's own importer rejects `M/d/yy`, which is what
  the UI-display formatter `prettyDate()` produces (correct for on-screen labels, wrong for this
  export); do not swap this export back to `prettyDate` and do not change `prettyDate` itself,
  which has ~25 other on-screen call sites that want the 2-digit year.
- **Resident Request Portal card** (`src/RequestsTab.jsx`, admin-facing): shows the absolute
  `/requests` URL, a copy-link button, and a client-side QR code (`qrcode` npm package — small,
  no network calls, canvas render) sized for a phone camera or a printed page. Print view follows
  the existing `no-print`/`print-only` convention (index.css) rather than inventing a new one —
  hitting Print here shows just the QR/URL/instruction, not the approval queue.
- **Trauma/Peds rotation 8/11 split** (`TRAUMA_PEDS_SPLIT`): combined 19-shift target for
  TRAUMA_PEDS/PEDS_TRAUMA enforced as two separate protected sub-targets (8 trauma-half shifts,
  11 peds-half shifts) via per-resident sub-caps in generator's `candidatePool`, not just
  single combined number — peds half (filled first, since Trauma Day generated last) can no
  longer silently consume trauma half's budget.
- **BAMC residents schedulable by default.** `isSchedulable` falls back to `'EM'` rotation
  for EM_HOME/EM_BAMC residents with no `blockType` set — this makes BAMC residents added
  via Off-Service tab (never assigns `blockType`) actually appear in generated
  schedules; read-time fallback, also fixes already-saved BAMC resident with no
  code change needed on their record.
- Off-service residents (`block.offServiceResidents[]`) carry `availabilityMode: 'full'|'ranges'|
  'days'` plus `availableRanges: [{start,end}]` / `canWorkDates: []`, checked by
  `isAvailableOnDate()` in `getEligibleShifts`. Fields live inside block object, ride along
  with existing persistence/backup — no new `LS_BACKUP_KEYS` entry needed for
  resident-level fields like this. Same true of `jcPresentDates`/`grLectureDates` on
  `emRoster` entries — ride inside `res_em_roster`, no new key needed.
- `blocksHistory` snapshots now carry `published: boolean` field (default falsy for old/absent
  snapshots — no migration needed) — see "Published blocks" above. `saveBlock` must read any
  existing snapshot's `published` value before building replacement snapshot, or re-saving
  published block silently un-publishes it.
- This repo is **public** — never hardcode real resident names/rosters into source (happened
  once; use Import Roster feature on EM Residents / Off-Service tabs, or Import Master Matrix /
  Import Vacation Dates / Import Lecture-JC Dates on the Dashboard/EM Residents tabs, instead —
  all read pasted/uploaded data into `localStorage` only, never into committed code). Same rule
  covers **email addresses**: `admin_email_allowlist` rows and
  chief-bootstrap `update profiles ...` typed straight into SQL editor as data, committed
  `supabase/*.sql` files carry only placeholders (`someone@example.edu`,
  `YOUR_EMAIL@uthscsa.edu`). Institutional *domain* in `auth_hook_domain_restriction.sql` is
  one exception — necessarily in function body, already public in app's own
  sign-in copy. `.gitignore` also covers `*-resume.txt` session transcripts, which contain
  addresses; don't remove those entries.
- This sibling project to `em-scheduler` (same author, same domain — EM scheduling). Bug
  or pattern here looks familiar, check `../em-scheduler/CLAUDE.md` for prior hard-won fixes
  (scheduling rules, export patterns, attending-matching) before re-deriving them.
- **Watch for temporal-dead-zone bugs with top-level `const`s.** Module-level `const` declarations
  execute top-to-bottom; `const` whose initializer references another `const` declared *later* in
  file throws "Cannot access '...' before initialization" at load time even though `npm run
  build` succeeds (Vite/esbuild bundle without executing code, so this class of bug silent
  until browser actually loads page). `RULE_NOTES`'s prose constants hardcode numbers that
  duplicate `NIGHT_RULES`/`JC_MAX_PER_AY`/`TRAUMA_PEDS_SPLIT` rather than referencing those objects,
  specifically to avoid this — change one of those numbers, update matching prose too.

## Rule-default migration
`getEffectiveDayRules`/`getEffectiveEligibility` replace `CATEGORY_PGY` key's default *wholesale*
with any chief-saved override — so when `DEFAULT_DAY_RULES`/`BASE_ELIGIBILITY` entry corrected,
old saved override that happens to equal *previous* default would silently keep masking fix
forever. `LEGACY_DAY_RULE_DEFAULTS`/`LEGACY_ELIGIBILITY_DEFAULTS` map each key to **array**
of pre-correction snapshots (one entry per correction pass over time — key can accumulate more
than one as rules evolve across multiple sessions, e.g. `EM_HOME_2` now holds both its
original legacy shape and pre-PED-S/pre-Aug-2026-swap shape); one-time mount effect in
root component prunes any saved override that still deep-equals *any* snapshot in that key's array
(`legacyList.some(shape => deepEqualNormalized(...))`), so corrected default takes over.
Overrides that don't match (genuinely customized) left alone but flagged with amber badge on
Rules tab (`DAY_RULE_DEFAULTS_CHANGED`) so chief knows to review them. **Whenever you
correct `DEFAULT_DAY_RULES`/`BASE_ELIGIBILITY` entry, push its old shape onto matching key's
array in `LEGACY_*_DEFAULTS`** (creating array if key new to it) **add its key to
`DAY_RULE_DEFAULTS_CHANGED`** (latter derived automatically from two maps' keys) or
existing chief customizations will silently mask the fix.

### Eligibility overrides are a DIFF, not a snapshot
`res_eligibility_overrides` stores `{ added: string[], removed: string[] }` per key, against the
current defaults — see `src/lib/eligibilityOverrides.js`. It used to store a wholesale snapshot of
the shift LIST, which meant **a shift id added to the app later was invisible to that override
forever**, and `LEGACY_*_DEFAULTS` could not save it: (1) an override the chief genuinely customized
deep-equals no recorded snapshot, so the pruner keeps it (amber badge only); (2)
`LEGACY_ELIGIBILITY_DEFAULTS` is keyed by `CATEGORY_PGY`, so **per-ROTATION overrides
(`CATEGORY_PGY__ROTATION`, written by the Shift Matrix's expandable sub-rows) are unreachable by it
entirely.** That shipped as a real, silent, chief-reported outage: ACEP dates were set correctly and
the 9h POD/MT/FLEX shifts were suppressed for those dates as designed, but the 12h replacements
could never be assigned because his saved rotation overrides predated those ids — residents went
unscheduled during ACEP with no error anywhere. A diff has no blind spot: a new id isn't in
`removed`, so it flows through automatically. **This is the reason the format exists — don't
"simplify" it back to a list.**

- **Both shapes are read forever.** `normalizeEligibilityOverride(value, base)` is the single door;
  a legacy array (old JSON backup, cloud row from an older build, another device mid-upgrade) is
  converted on read. Conversion applies `backfillLaterAddedShiftIds` FIRST — otherwise every pre-12h
  snapshot would convert to "the chief deliberately removed all eight 12h shifts" and the outage
  would be permanently baked in. The backfill restores a 12h id only when the CURRENT base grants it
  AND the snapshot still lists that area's matching 9h shift (`POD-D`→`POD-D12`, `POD-N`→`POD-N12`),
  so an area genuinely dropped stays dropped and eligibility the app never intended is never
  invented (NEURO_1 really does have `FLEX-D` but no `FLEX-D12`).
- **One-time mount migration** rewrites stored arrays into diffs, in the same effect as the legacy
  prune. **Order is load-bearing: prune FIRST** (only an array can deep-equal a recorded snapshot;
  converting first would turn "equals the old default" into a diff that pins the old behavior), then
  convert **category keys before rotation keys** (a rotation key's base is its parent's *effective*
  list). A diff that comes out empty deletes the key.
- **`eligBaseFor(key, eligOverrides)`** is what a key's diff applies on top of: `BASE_ELIGIBILITY`
  for a category key, the parent's effective list for a rotation key. That inheritance is a
  deliberate improvement — a category-level edit now reaches every rotation row that hasn't
  overridden that specific shift, which a frozen snapshot could never do. Migration round-trips, so
  existing rotation overrides don't visibly change at upgrade time.
- **`ShiftMatrixTab` uses the same helpers** (`baseFor`/`effective`/`writeList`), so the grid can't
  disagree with the scheduler. A toggle recomputes the whole diff from the resulting list, and an
  empty diff DELETES the key — putting a row back to default clears the override rather than leaving
  a no-op behind (same convention as the Rules-tab coverage editor).
- Coverage: `src/lib/eligibilityOverrides.test.js` (unit) and `src/lib/eligibilityLegacy.test.js`
  (through the real generator/eligibility path — this is why `getEligibleShifts` is a named export).
- Still true: `stripPedGuardedShifts` runs AFTER resolution, so PED-N/PED-S guards win over any
  override.

## When editing
- Since nearly everything is in `ResidentScheduler.jsx`, grep before assuming helper unused —
  file has no module boundaries to enforce dead-code detection.
- `ResidentScheduler.jsx`'s generator core (`generateSchedule`/`generateScheduleBest`/`validateAll`
  and friends) has vitest coverage via its named exports (see "Generator quality harness" above) —
  the rest of the file (UI, tabs) does not; verify changes there by running `npm run dev` and
  generating/exporting a sample schedule (including Generate Schedule on Schedule tab where
  relevant).