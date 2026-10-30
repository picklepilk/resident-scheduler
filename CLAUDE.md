# CLAUDE.md

EM residency shift scheduler (UH Emergency Medicine). Builds/validates resident schedules across areas (POD, PED, FLEX, MT, TRAUMA), auto-generates from coverage rules, exports CSV/PDF/QGenda, JSON backup/restore in Settings.

**Evicted detail (war stories, measurements, rationale): `CLAUDE-Archive.md`. Supporting mechanics moved out of this file: `docs/claude-reference.md` (sections cited below as "ref: <section>"). Every rule here is load-bearing — consult both before relaxing one.**

## Commands
```bash
npm test          # vitest, ~950 tests. 2 skips = SOLVER_PARITY-gated files (need Python)
npx vitest run src/lib/qgenda.test.js        # single file
```
- No ESLint. `ResidentScheduler.jsx` UI/tabs untested — verify via `npm run dev` + generate/export a sample. Generator core tested via named exports (`generateSchedule`, `generateScheduleBest`, `validateAll`, `getEligibleShifts`, `buildQualityInput`, `useMonthPager`).
- Quality baselines: `UPDATE_QUALITY_BASELINE=1 npm test` regenerates `qualityBaseline.<variant>.json` (refuses worse unless `FORCE_QUALITY_BASELINE=1`). One file per variant — **don't recombine** (shared file clobbers under parallel update). Run baseline files ONE AT A TIME when investigating timing. Heavy multi-seed tests must be `async` and `await new Promise(r => setImmediate(r))` per seed (`Timeout calling "onTaskUpdate"` = worker >60s without a macrotask, NOT CPU contention). `vitest.config.js` sets 120s timeouts (work in `beforeAll`). (ref: Test and quality baselines)
- Solver parity: `SOLVER_PARITY=1 npx vitest run src/lib/solverParity.test.js` (bash) or `$env:SOLVER_PARITY=1; ...` (PowerShell). No npm script — no `cross-env`, `VAR=1` scripts no-op under Windows cmd.
- Netlify deploys master. Site: residentscheduling.netlify.app.
- Supabase SQL: `npx supabase db query --linked -f <file>` (CLI not on PATH). `--linked` follows `supabase/.temp/`, NOT the dashboard's selected project — a migration once hit the wrong sibling project that way.

## Layout & stack
- Public GitHub repo `picklepilk/resident-scheduler`. **Never commit real resident names, rosters, or email addresses** — all real data enters via the import features into localStorage only. Allowlist emails/bootstrap SQL are typed into the SQL editor as data; committed `supabase/*.sql` carry placeholders only. `.gitignore` covers `*-resume.txt` transcripts — keep those entries.
- `xlsx` installed from SheetJS CDN tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` in package.json), **never `npm install xlsx`** — registry build frozen at 0.18.5 with unpatched CVEs.
- `jspdf-autotable@3.8.4`: use `import 'jspdf-autotable'` + `doc.autoTable({...})`, never `autoTable(doc, {...})` (default-export interop broken; `npm run build` doesn't catch it). See archive.
- **Almost all scheduling logic lives in `src/ResidentScheduler.jsx` (~8,300+ lines).** Grep for `// ─── SECTION ───` markers or function names, not line numbers. Grep before assuming any helper unused — no module boundaries.
- `src/lib/*` modules are pure and **may never import `ResidentScheduler.jsx`**.
- Auth/day-off-request surface outside big file: `main.jsx` (`/requests` → `ResidentRequestsApp`, else `AppGate`), `AppGate.jsx`, `supabaseClient.js`, `RequestsTab.jsx`, `residentRequests/*`. **Nothing under `residentRequests/` imports `ResidentScheduler.jsx`** — fetches own minimal slice via the `resident_block_lookup()` RPC (never `res_state` directly).
- Sibling `../em-scheduler`: check its CLAUDE.md for prior fixes before re-deriving scheduling/export/matching patterns.
- **TDZ hazard**: module-level `const` referencing a later `const` throws at page load; `npm run build` won't catch it. `RULE_NOTES` prose deliberately hardcodes numbers duplicating `NIGHT_RULES`/`JC_MAX_PER_AY`/`TRAUMA_PEDS_SPLIT` for this reason — change one, update matching prose.

## Persistence, cloud sync, playgrounds
- New optional per-block snapshot field → add it to `OPTIONAL_SNAPSHOT_FIELDS` in `src/lib/snapshotCompare.js`, else old snapshots read dirty.
- `useLocalStorage` backs `res_*` keys. Nine ride `LS_BACKUP_KEYS`; Settings backup/restore AND cloud sync derive from it. **A new `res_*` key must be added to `LS_BACKUP_KEYS` + `syncBindings`** or it silently won't round-trip (forgetting `syncBindings` throws; forgetting the list is silent loss).
- Device-local, deliberately excluded: `res_dark_mode`, `res_demo_mode`, `res_whats_new_seen`, `res_ui_prefs` (fields `gridZoom`/`gridColExtra`/`gridGroupBy` need no own key).
- Everything read from backup/cloud/localStorage is untrusted shape — guard like `reconcileTabOrder` (`Array.isArray`), `normalizeCoverageEntry` (legacy single-number → `{min,max}`), `offRequestEntryFor`.
- Cloud sync (`// ─── SUPABASE SYNC ───`): hand-rolled PostgREST `sbFetch`; supabase-js only for `getAccessToken()`. Real doc = `res_state` row `id:'main'`, whole doc as jsonb. (ref: Cloud sync)
- **`res_state` RLS is admin-only** (`migrate_res_state_admin_only.sql` — DEPLOY ORDER: client ships before migration, else admins lock themselves out). `sbFetch` `Authorization` = caller's session JWT via `getAccessTokenBounded()`; anon key only when genuinely no session or `AUTH_ENABLED` false — a timeout must NOT fall back to anon while `AUTH_ENABLED`. **Never send the anon key as `Authorization` for this table again** (confirmed data-exposure gap). Residents read via `resident_block_lookup()` (`src/residentRequests/blockLookup.js`).
- **Versioning + audit history, NOT last-write-wins** (`migrate_res_state_history.sql` — DEPLOY ORDER is the OPPOSITE: migration FIRST, client second). `version`/`updated_by`/`updated_at` set ONLY by triggers — never client-supplied. `res_state_history` is trigger-written, admin-select-only.
- **Every save path race-safe**: `sbSaveStateVersioned` PATCHes `?version=eq.N`; 0 rows = lost race, `openConflict` shows `cloudConflict` modal. Full-replace actions (first seed, Import Backup, playground start-fresh, Version History Restore) use `sbSaveStateExplicit` (loads real current version, never trust a stale local flag; seeds via `sbSeedState` with `ignore-duplicates`, never `merge-duplicates`). `null` = lost race: root callers `openConflict`; Import/Restore (SettingsTab) abort with "reload and try again" toast.
- **`dbReady` gates all cloud writes and stays false if mount-time load fails** — a device that never read the cloud must not overwrite it. **`row == null` is AMBIGUOUS** (no row vs RLS-filtered caller): mount effect checks `sbIsAdmin()` before trusting empty as safe-to-seed — don't remove. `cloudBaselineRef` is `{values, version}` — destructure. `saveCloudNow` no-ops while `cloudConflict` is up (checked via ref, not state). `flushPendingCloudSave()` awaits pending timer AND in-flight save.
- Version History: `sbFetchHistoryData` fetches ONE row lazily — never all 50. Restore = `flushPendingCloudSave()` + `sbSaveStateExplicit` + cloud-first-then-reload; refused in demo mode.
- `clearAll()`/`importData()`: cloud op FIRST, then local + reload; both set `syncSuspended`; both early-return in demo mode.
- **Playgrounds**: per-admin `res_state` rows `pg_<ownerUid>_<rand>`; logic in `src/lib/playgrounds.js`. `physKey()` rewrites `res_` → `res_demo_`; `assertWriteTargetRowId` guards every write path. Promote: cloud-only, typed-confirm, merges only matched block's `schedule`+`lockedCells` — never roster/settings/rules. (ref: Cloud sync)
- One-shot mount migrations that store a marker (e.g. `migratePedNightAssignments` / `res_pednfm_migrated`) must gate on `dbReady`, not `[]` — else they migrate the pre-overlay copy, burn the marker, and get overwritten by the still-unmigrated cloud row. Markerless prune effects (LEGACY defaults) don't need the gate.
- Jeopardy/sick-call ledger lives in `appSettings.jeopardyLog`, **NOT its own `res_*` key — load-bearing**. Don't "clean up" by promoting it.

## Auth, roles, RLS
- `AUTH_ENABLED` (`src/supabaseClient.js`): missing env → dev falls through unauthenticated; **production build fails closed** (`AuthMisconfigured`). Keep the asymmetry.
- Roles `pending` → `resident` → `admin` (no 'chief'; stray `'chief'` should be `'admin'`).
- **RLS is the security boundary; UI gates are convenience.** `is_admin()` SECURITY DEFINER helper exists because an inline profiles subquery inside a profiles policy recurses — don't inline it. Column-level rules live in four BEFORE triggers; self-promotion impossible by construction. Every resident-facing policy must fold `role <> 'pending'` in. (ref: Auth detail)
- Admin email allowlist: promotion keys off `auth.jwt()->>'email'`, **never `new.email`** (client-controlled); zero-argument membership check (no enumeration oracle). (ref: Auth detail)
- `resident_block_lookup()` (SECURITY DEFINER, `set search_path = ''`, every reference schema-qualified): the one sanctioned non-admin read of `res_state`. Gated on `role <> 'pending'`; hand-picked jsonb only. Don't widen its return shape without re-checking it excludes per-block `schedule` payloads.
- `supabase/*.sql` run by hand: `day_off_requests.sql` = fresh-install baseline; `migrate_*.sql` = deltas. Schema change = update baseline AND add migrate file.

## Shift catalog & data model
- `SHIFTS`/`SHIFT_TIMING`/`SHIFT_MAP`/`SHIFT_AREAS`/`SHIFT_TYPES`/`SHIFT_DOW` at top of big file. Ids `AREA-TYPE` (exceptions `PED-S`, `PED-N-FM`); **nothing parses ids by splitting on `-` — don't introduce that.**
- **`shiftActiveOnDow(shiftId, dow)`** (`lib/shifts.js`) is the single answer to "does this shift exist on this weekday". Don't re-inline the `SHIFT_DOW[shiftId] && !SHIFT_DOW[shiftId].includes(dow)` guard.
- Adding a shift: add `SHIFT_TIMING` entry (else rest validation silently skips it) AND `DEFAULT_COVERAGE_MINMAX` entry (`coverage.test.js` enforces catalog-wide; a missing entry silently demands 1 body/day ≈ 28 phantom unfilled slots).
- **Coverage is `{min,max}`**: fill to min (hard), top up toward max only for under-target residents. Not DOW-dependent except `DOW_COVERAGE_MAX_OVERRIDE` (POD max 3 Mon/Tue via `getCoverageFor`'s `dow`).
- `getShiftTarget` resolution ends in a **single tail return** applying `targetDelta` — never add early returns. A delta that zeroes the target returns **`null`, not `0`**. `computeQualityMetrics`' second `baselineTargets` map must keep its per-resident `?? target` fallback. Buy-downs are DELTAs; `ImportMatrixModal` MERGES assignment records (replace would wipe deltas/isChief). (ref: Data model detail)
- `offServiceWindowTargetDelta` wraps `offServiceWindowStatus` — non-display consumers must call the wrapper, which collapses zero delta to `null` via `status && status.delta !== 0 ? status.delta : null` (NOT `status?.delta ?? null`).
- **`availableRanges` is UNCLAMPED**: `buildOffServiceResidentsForBlock` stores the REAL ER rotation window — don't clamp to the imported block (it defeats `offServiceWindowStatus` straddle math). `OffServiceStraddleBadge` (+ `src/lib/offServiceWindow.js`) at all 3 `offServiceWindowStatus` call sites; detail in `imports-exports` skill.
- `blocksHistory` snapshots carry `published` — `saveBlock` must preserve an existing snapshot's flag or re-saving un-publishes.
- Per-resident counts from real historical schedules never derive/validate targets.

## Scheduling rules (getEligibleShifts / validateAll / generator)
- **Circadian** (`NIGHT_RULES` 4-6-6): eve→day next day hard (either placement order); day→next-day eve allowed (user decision 2026-09-27); max 6 nights/block; ≥24h post-night rest before day/eve/GR soft `postNightRest`, both directions. Hard circadian + GR-gap checks run regardless of `appSettings.enforceRest`. Rolling 80h/wk cap → `'hoursCapped'`.
- **Trauma**: TRAUMA-D/N clamped max 1; hard ≤2 TRAUMA-N per contiguous night run (`traumaRunCapped`, solver rule 43, never relaxed). **TRAUMA-D only for residents on a `TRAUMA_BLOCKS` rotation** (`dayRules.TRAUMA_BLOCKS ?? TRAUMA_BLOCKS`): `stripTraumaDayForNonTraumaBlock` inside `getEffectiveEligibility` (post-resolution) — NOT a shiftGate. Rule id `traumaDayRotationGuard` (tier `program`; chief may override BY HAND only). Pass `dayRules` to any new `getEffectiveEligibility` call.
- **Max 6 consecutive work days** (`MAX_CONSECUTIVE_WORK_DAYS`): CLINICAL SHIFTS ONLY (chief decision 2026-10-15). `isStreakWorkDay` shared by validator, generator, picker; solver's `workday_limits.py` mirrors it. (ref: Scheduling rule detail)
- **Rest between shifts** (ACGME 6.17.a.2, always hard): measured strictly from the earlier shift's own end — GR never pushes it (chief decision 2026-10-15). GR hours toward 60h/72h weekly caps via `lib/acgmeHours.js` `grWindowFor`/`grHoursOn`.
- **Computed-date rules are chief-LOGGED, never derived** (`src/lib/ruleDates.js`): First Friday, Wellness Wednesday (per PGY), Journal Club (`ayData[AY].jcDates`). Absent list = NO dates (like holidays); calendar math is a SUGGESTER only. `ctx.ayConf` must reach EVERY `getEligibleShifts` call or First Friday/Wellness silently no-op. (ref: Scheduling rule detail)
- **Journal Club** (`src/lib/journalClub.js`): consumers use `resolveJcDates`/`jcDatesInRange`/`isJcDate`/`isJcDateAnyAy` — never re-derive. Absent config = NO dates; explicit `[]` honored.
- **Holidays**: **absent config derives NOTHING** (same as every computed-date rule now).
- **Seniority**: POD hard (PGY-3 required, `'pgy3Required'`), FLEX hard too (PGY-2, `'pgy2Required'`; unmet leaves slot unfilled, no junior fallback). **Wednesday DAY shifts exempt** (`seniorCompositionExempt`) — FOUR call sites in lockstep: `validateAll` senior loop, `fillDayPass` POD branch, `fillDayPass` FLEX branch, `narrowForSeniority`/`podStillSatisfied`.
- **Wellness Wednesdays**: `ctx.blockStart` must reach EVERY `getEligibleShifts` call site (a grid caller once omitted `ctx` and silently no-op'd this).
- **Hand overrides** (`src/lib/handOverrides.js`, `isHandOverridable`): every `program` rule + `rotationEligibility` may be broken by HAND (confirm + note); generator/solver/validator hardness unchanged. Record written in the SAME `updateBlockTracked` (via `syncHandOverrides`). Covered errors downgrade to `warn` + `overridden:true` (program ids are not in `EXPORT_BLOCKING_RULE_IDS` - keep it so). ACGME hours/rest/vacation never overridable. `buildSolverPayload` THROWS (`code: 'HAND_OVERRIDES'`) for live overrides (except `traumaDayRotationGuard` on non-trauma-cap subjects) -> `engineUsed: 'skipped-overrides'`. (ref: Scheduling rule detail)
- **Jeopardy never collides with a clinical shift** (hard under `'warn'` and `'block'`; `'off'` silent). **Off-service residents have no jeopardy** (`isJeopardyDate` gates on `EM_HOME`/`EM_BAMC`).
- `PED_GUARD_LEGITIMATE_OWNER` DERIVED from `BASE_ELIGIBILITY` — grant eligibility there, never hand-edit the guard.
- **EM/EMS ↔ EM/TOX weekday windows swap on 2026-08-01**: both variants live in `DEFAULT_DAY_RULES.EM_HOME_2.shiftGates` distinguished by `activeWhen` — don't "clean up" into one gate.
- Advocacy-days feature REMOVED — don't migrate, don't resurrect.
- Trauma/Peds split, PED-N split, night-run shape, soft rule priority, holidays detail: archive.

## 12-hour shift windows
`src/lib/coverage.js`, `ayData[AY].twelveHourWindows`. 12h ids (`POD/MT/FLEX/PED × -D12/-N12`) staff only inside chief windows. `resolveTwelveHourWindows`: explicit array wins (`[]` = none); absent → `implicitConferenceWindows`. Don't reintroduce a second answer to "does this date run 12h".
- **`twelveHourStateFor` NEVER returns null** — always `{replaceAreas, addAreas, covOverride}` with empty sets. `getCoverageFor`'s 4th param is that state object; `undefined` = "no date context" → base numbers. (ref: 12-hour window detail)
- Generator resolves per-date via memoizing `conf12For` — never a prebuilt map (a miss = phantom minimums). Resolution order: archive.

## Generator
- `generateSchedule()`: three `fillDayPass` passes — `'min'` except TRAUMA-D, then TRAUMA-D alone (don't collapse), then `'optional'`. Candidate pool recomputed fresh per slot — a cached pool once caused double-booking; the decision path must never go through a cache. Never overwrites non-empty cells (`keptCells`).
- `generateScheduleBest()`: 20 seeded attempts, `betterQuality` **lexicographic** `(validateAll errors, export-blocking warnings, quality vector)`, never a weighted scalar. Replay recipe incl. `repair` flag and `replayLns`: ref: Generator detail. Solver `FEASIBLE` results NOT replayable.
- **Ranking follows Soft Rule Priority**: `blockingWarnCount` = `countBlockingWarns(issues, rulePriority)`; when `rankedBelowCoverage` (`lib/rulePriorityRanking.js`) holds, `postNightRest`/`seniorComposition` warnings are NOT counted there, only in their own priority-ordered vector slot (`report.seniorGaps` is dormant, don't use it). Export gate (`issueCounts.restWarns`, `EXPORT_BLOCKING_RULE_IDS`) UNCHANGED - rest and composition warnings still need ack. (ref: Generator detail)
- **LNS (B1)**: absent `timeBudgetMs` = exactly `attempts` (baselines pin `attempts:20` + `lnsIters: BASELINE_LNS_ITERS`=40, never a time cap — non-deterministic). LNS clears only generator-placed cells (never original non-empty/locked), adopts only on strict `betterQuality`; don't reuse it for moves that bypass `betterQuality`. (ref: Generator detail)
- Repair pass: every move transactional and narrowed by `narrowForSeniority`/`podStillSatisfied` (without them repair manufactured hard errors). Budgets 300 + 200 deliberately not shared.
- `SCORE_WEIGHTS` test is a RATCHET. New score terms join the existing last vector slot — never a 5th slot. Area-spread `areaContinuity > 0` gate is load-bearing (see archive).
- **Under-target issues carry `rule: 'underTarget'`** — classify by that id, never `message.startsWith('Under target')`. `generateScheduleBest`'s deferred `computeUnderTargetDiagnostics` + `computeUnfilledDiagnostics` closures must be **deleted** after running on the winner (persisted report can't carry a function).
- `candidatePool` is an ordered `CANDIDATE_POOL_STAGES` list shared with `firstBlockingReason`. A new hard filter = a new stage there, never an inline `pool.filter` — else explanations silently drift from decisions.
- Conference tolerance (1-short → warn, `conferenceTolerated`): absent from `EXPORT_BLOCKING_RULE_IDS` but counted in `blockingWarnCount`. Don't let a downgrade-to-warn also fall out of the scoring count.
- AY carryover: a resident with no history is EXCLUDED from the AY population, never zeroed. Override log via `updateBlockTracked` ONLY.

## CP-SAT solver service (optional second engine)
`solver-service/` — Python/FastAPI OR-Tools; contract in `solver-service/CLAUDE.md` + `solver-service/docs/PAYLOAD_SCHEMA.md`. Seams: `buildSolverPayload()` / `mapSolverResult()` / `generateViaSolverOrLocal()` (ONLY solver-vs-local decision point).
- **R9: local FIRST always, solver POLISHES (warm-started), `pickEngineResult` arbitrates.** Local result goes as `hint` (soft `AddHint`, never a hard pin); solver ships only if STRICTLY better. (ref: Solver detail)
- **Payload gotcha (recurred once)**: an eligibility carve-out enforced only in the generator's `candidatePool` (not `getEligibleShifts`) must ALSO be filtered in `buildSolverPayload`.
- **Modal hosting**: `POST /solve` returns 400 `use_jobs` on Modal (150 s cap); client uses `solveViaJob` when `/health` reports `jobs: durable`; Fly/local keep `solveRemote`. See `solver-service/DEPLOY-MODAL.md`; ref: Solver detail.

## Imports & exports
Contracts in `imports-exports` skill (`.claude/skills/imports-exports/SKILL.md`) — invoke before editing any import/export path. All three exports route through `requestExport`/`exportConfirm`.

## UI conventions
- **Dark mode**: `.dark` override sheet in `index.css`, NOT Tailwind `dark:`; wrapped in `@media screen` (print stays light). Exemptions listed in ref: UI detail. Auth/requests surfaces need same treatment.
- **`DAY_MARKERS`**: single style table for GR/JC/WW/OFF/VAC/J + pending-R badge. `onShift` variant is solid `bg-white` + colored ring + `-700` text — **never an alpha tint**. New marker = edit table, never inline classes.
- **Schedule grid**: sticky header/footer/name-column need `overflow-auto` + bounded `maxHeight` — don't remove the height bound. Z-ladder (cells 10 … toast 200) in ref: UI detail; header/corner use INLINE `zIndex`. Fullscreen = `fixed inset-0`, not `requestFullscreen()`.
- Zoom 50–150% via CSS `zoom`, **never `transform: scale`** (breaks every sticky axis); one clamp in `setGridZoom`. `clampGridZoom` typeof-checks, no `Number()` coercion. Week bands MONDAY-started.
- **Cell locking**: `block.lockedCells`; generator knows nothing about locks; every bulk lock action = ONE functional `updateBlockTracked` (looping floods undo).
- `computeCoverageByDate` shared by grid footer/Dashboard/Calendar — never fork. `cellViolations` shared by picker + drag-drop. Root `issues` memo = ONE `validateAll` pass.
- Dashboard is landing tab (Home tab GONE).
- **Block peek is read-only**: `peekSnapId` state, `snapToBlock` DERIVED from the snapshot, never stored. NEW edit controls in block-scoped views MUST be gated on `readOnly` / the live panel only. Export and undo are disabled while peeking.
- **Clear Schedule**: `lib/clearSchedule.js` `clearScheduleFields` is the single implementation; `ClearScheduleConfirm` + `applyClearSchedule` run it in ONE `updateBlockTracked`. Don't fork per surface.
- What's New: change `CHANGELOG` `id` only for interruption-worthy releases; `markChangelogSeen()` single writer.
- Schedule-tab grouping: `lib/scheduleGrouping.js` `groupResidents` takes `CATEGORIES`/`BLOCK_TYPES_EM`/`isEmResident` as PARAMETERS (lib may not import big file); returns `[{cat, members}]`.

## Rule-default migration (required whenever defaults change)
`getEffectiveDayRules`/`getEffectiveEligibility` replace defaults WHOLESALE with chief overrides — an override equal to a superseded default masks the fix forever. **When correcting `DEFAULT_DAY_RULES`/`BASE_ELIGIBILITY`: push the old shape onto that key's array in `LEGACY_DAY_RULE_DEFAULTS`/`LEGACY_ELIGIBILITY_DEFAULTS`** (arrays accumulate one snapshot per correction) — the mount prune drops overrides deep-equal to ANY snapshot; genuinely customized overrides get an amber review badge (`DAY_RULE_DEFAULTS_CHANGED`, derived from the maps' keys).

### Eligibility overrides are a DIFF, not a snapshot
`res_eligibility_overrides` stores `{added, removed}` per key (`src/lib/eligibilityOverrides.js`). **Don't "simplify" back to a list** (history: ref: Eligibility overrides history).
- Both shapes read forever through `normalizeEligibilityOverride`; legacy arrays get `backfillLaterAddedShiftIds` FIRST.
- One-time mount migration order is load-bearing: prune legacy-equal overrides FIRST, then convert category keys before rotation keys (rotation base = parent's effective list). Empty diff deletes the key.
- `stripPedGuardedShifts` runs AFTER resolution — PED guards beat any override.

## When editing
- `npm test` for lib/generator changes; `npm run dev` + sample generation for UI. Checklist of per-addition touchpoints (each rule stated above): new shift, new marker, new `res_*` key, rule-default correction, candidatePool-only exclusion, new `getEligibleShifts` call site (`ctx = {blockStart: block.startDate, ...}`).
