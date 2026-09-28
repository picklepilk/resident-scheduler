# CLAUDE.md

EM residency shift scheduler (UH Emergency Medicine). Builds/validates resident schedules across areas (POD, PED, FLEX, MT, TRAUMA), auto-generates from coverage rules, exports CSV/PDF/QGenda, JSON backup/restore in Settings.

**Full-detail doc (war stories, measurements, rationale): `docs/CLAUDE-full.md`; evicted detail: `CLAUDE-Archive.md`. Every rule here is load-bearing — consult the full doc before relaxing one.**

## Commands
```bash
npm test          # vitest, ~950 tests. 2 skips = SOLVER_PARITY-gated files (need Python)
npx vitest run src/lib/qgenda.test.js        # single file
```
- No ESLint. `ResidentScheduler.jsx` UI/tabs untested — verify via `npm run dev` + generate/export a sample. Generator core tested via named exports (`generateSchedule`, `generateScheduleBest`, `validateAll`, `getEligibleShifts`, `buildQualityInput`, `useMonthPager`).
- Quality baselines: `UPDATE_QUALITY_BASELINE=1 npm test` regenerates `qualityBaseline.<variant>.json` (refuses worse numbers unless `FORCE_QUALITY_BASELINE=1` also set). 5-seed averages + tolerance; one file per variant (`generator.baseline.<variant>.test.js`, own JSON) — **don't recombine** (shared file clobbers under parallel update). Variants `standard`/`understaffed`/`vacationHeavy`/`conferenceBlock`; only `conferenceBlock` has non-empty `ayConf`, so only it exercises 12h conference machinery. Run baseline files ONE AT A TIME when investigating timing — concurrent runs produce worker RPC timeouts/stalls that are contention artifacts, not regressions. `vitest.config.js` sets 120s test/hook timeouts (work in `beforeAll`).
- Solver parity: `SOLVER_PARITY=1 npx vitest run src/lib/solverParity.test.js` (bash) or `$env:SOLVER_PARITY=1; npx vitest run ...` (PowerShell). No npm script — repo has no `cross-env`, and `VAR=1` scripts no-op under Windows cmd.
- Netlify deploys master. Site: residentscheduling.netlify.app.
- Supabase SQL: `npx supabase db query --linked -f <file>` (CLI not on PATH). `--linked` follows `supabase/.temp/`, NOT the dashboard's selected project — a migration once hit the wrong sibling project that way.

## Layout & stack
- Public GitHub repo `picklepilk/resident-scheduler`. **Never commit real resident names, rosters, or email addresses** — all real data enters via the import features into localStorage only. Allowlist emails/bootstrap SQL are typed into the SQL editor as data; committed `supabase/*.sql` carry placeholders only. `.gitignore` covers `*-resume.txt` transcripts — keep those entries.
- `xlsx` installed from SheetJS CDN tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` in package.json), **never `npm install xlsx`** — registry build frozen at 0.18.5 with unpatched CVEs.
- `jspdf-autotable@3.8.4`: use `import 'jspdf-autotable'` + `doc.autoTable({...})`, never `autoTable(doc, {...})` (default-export interop broken; `npm run build` doesn't catch it). See archive.
- **Almost all scheduling logic lives in `src/ResidentScheduler.jsx` (~8,300+ lines).** Grep for `// ─── SECTION ───` markers or function names, not line numbers. Grep before assuming any helper unused — no module boundaries.
- `src/lib/*` modules are pure and **may never import `ResidentScheduler.jsx`**.
- Auth/day-off-request surface outside big file: `main.jsx` (`/requests` → `ResidentRequestsApp`, else `AppGate`), `AppGate.jsx`, `supabaseClient.js`, `RequestsTab.jsx`, `residentRequests/*`. **Nothing under `residentRequests/` imports `ResidentScheduler.jsx`** — fetches own data from shared `res_state` row.
- Sibling `../em-scheduler`: check its CLAUDE.md for prior fixes before re-deriving scheduling/export/matching patterns.
- **TDZ hazard**: module-level `const` referencing a later `const` throws at page load; `npm run build` won't catch it. `RULE_NOTES` prose deliberately hardcodes numbers duplicating `NIGHT_RULES`/`JC_MAX_PER_AY`/`TRAUMA_PEDS_SPLIT` for this reason — change one, update matching prose.

## Persistence, cloud sync, demo sandbox
- `useLocalStorage` backs `res_*` keys. Nine ride `LS_BACKUP_KEYS`; Settings backup/restore AND cloud sync derive from it. **A new `res_*` key must be added to `LS_BACKUP_KEYS` + `syncBindings`** or it silently won't round-trip (forgetting `syncBindings` throws; forgetting the list is silent loss).
- Device-local, deliberately excluded: `res_dark_mode`, `res_demo_mode`, `res_whats_new_seen`, `res_ui_prefs` (fields `gridZoom`/`gridColExtra`/`gridGroupBy` need no own key).
- Everything read from backup/cloud/localStorage is untrusted shape — guard like `reconcileTabOrder` (`Array.isArray`), `normalizeCoverageEntry` (legacy single-number → `{min,max}`), `offRequestEntryFor`.
- Cloud sync (`// ─── SUPABASE SYNC ───`): hand-rolled PostgREST `sbFetch` (15s timeout), no supabase-js. `SUPABASE_ENABLED` from `%VITE_*%` token injection; `isUnresolvedToken` = unconfigured. One `res_state` row `id:'main'`, whole doc as jsonb; last-write-wins, accepted.
- **`dbReady` gates all cloud writes and stays false if mount-time load fails** — a device that never read the cloud must not overwrite it. Debounced (1.5s) save vs `cloudBaselineRef`; `flushPendingCloudSave()` awaits pending timer AND in-flight save.
- `clearAll()`/`importData()`: cloud op FIRST, then local + reload; both set `syncSuspended`; both early-return in demo mode.
- Demo sandbox: `physKey()` rewrites `res_` → `res_demo_`; cloud row `id:'demo'` via optional `rowId`. Every enter/exit/delete flushes first, sets flag, reloads. Detail in archive.
- One-shot mount migrations that store a marker (e.g. `migratePedNightAssignments` / `res_pednfm_migrated`) must gate on `dbReady`, not `[]` — else they migrate the pre-overlay copy, burn the marker, and get overwritten by the still-unmigrated cloud row. Markerless prune effects (LEGACY defaults) don't need the gate.
- Jeopardy/sick-call ledger lives in `appSettings.jeopardyLog`, **NOT its own `res_*` key — load-bearing**: an older bundle's whole-document cloud write would silently drop a 10th key, but round-trips unknown `appSettings` sub-keys. Don't "clean up" by promoting it.

## Auth, roles, RLS
- `AUTH_ENABLED` (`src/supabaseClient.js`): missing env → dev falls through unauthenticated; **production build fails closed** (`AuthMisconfigured`). Keep the asymmetry.
- Roles `pending` → `resident` → `admin` (no 'chief'; stray `'chief'` should be `'admin'`).
- **RLS is the security boundary; UI gates are convenience.** `is_admin()` SECURITY DEFINER helper exists because an inline profiles subquery inside a profiles policy recurses — don't inline it. Column-level rules live in four BEFORE triggers (`enforce_cancel_only_status`, `enforce_request_identity_immutable`, `enforce_resident_id_immutable`, `enforce_profile_role_change_rules`); self-promotion impossible by construction. Every resident-facing policy must fold `role <> 'pending'` in — a client-only pending check once allowed impersonation via `/requests` (`migrate_block_pending_account_access.sql` is the reference pattern).
- Admin email allowlist: promotion keys off `auth.jwt()->>'email'`, **never `new.email`** (client-controlled); membership check is zero-argument (no enumeration oracle); table has RLS on with no policies (unreachable from sessions); affects first row creation only.
- `supabase/*.sql` run by hand: `day_off_requests.sql` = fresh-install baseline; `migrate_*.sql` = deltas. Schema change = update baseline AND add migrate file.

## Shift catalog & data model
- `SHIFTS`/`SHIFT_TIMING`/`SHIFT_MAP`/`SHIFT_AREAS`/`SHIFT_TYPES`/`SHIFT_DOW` at top of big file. Ids `AREA-TYPE` (exceptions `PED-S`, `PED-N-FM`); **nothing parses ids by splitting on `-` — don't introduce that.**
- **`shiftActiveOnDow(shiftId, dow)`** (`lib/shifts.js`) is the single answer to "does this shift exist on this weekday". Don't re-inline the `SHIFT_DOW[shiftId] && !SHIFT_DOW[shiftId].includes(dow)` guard; a divergent copy silently double-counts or drops a shift that doesn't run every day.
- Adding a shift: add `SHIFT_TIMING` entry (else rest validation silently skips it) AND `DEFAULT_COVERAGE_MINMAX` entry (`coverage.test.js` enforces catalog-wide; a missing entry silently demands 1 body/day ≈ 28 phantom unfilled slots).
- **Coverage is `{min,max}`**: fill to min (hard), top up toward max only for under-target residents. Not DOW-dependent except `DOW_COVERAGE_MAX_OVERRIDE` (POD max 3 Mon/Tue via `getCoverageFor`'s `dow`).
- `getShiftTarget` resolution ends in a **single tail return** applying `targetDelta` — never add early returns (buy-downs would be silently ignored). A delta that zeroes the target returns **`null`, not `0`** (`0 != null` would keep the resident in fairness spread as a maximal outlier). `computeQualityMetrics`' second `baselineTargets` map must keep its per-resident `?? target` fallback. Buy-downs are DELTAs (survive `SHIFT_TARGETS` changes); `ImportMatrixModal` MERGES assignment records (replace would wipe deltas/isChief).
- `offServiceWindowTargetDelta` is a thin wrapper over `offServiceWindowStatus` — non-display consumers must call the wrapper, which collapses zero delta to `null` via `status && status.delta !== 0 ? status.delta : null` (NOT `status?.delta ?? null` — `0 ?? null` is `0`, a bogus target adjustment).
- `blocksHistory` snapshots carry `published` — `saveBlock` must preserve an existing snapshot's flag or re-saving un-publishes.
- Per-resident counts from real historical schedules never derive/validate targets (chief call-in/payback noise).

## Scheduling rules (getEligibleShifts / validateAll / generator)
- **Circadian** (`NIGHT_RULES` 4-6-6): eve→day next day hard (either placement order); day→next-day eve allowed (user decision 2026-09-27); max 6 nights/block; ≥24h post-night rest before day/eve/GR soft `postNightRest`, both directions. Hard circadian + GR-gap checks run regardless of `appSettings.enforceRest`. Rolling 80h/wk cap → `'hoursCapped'`.
- **Trauma**: TRAUMA-D/N clamped max 1; hard ≤2 TRAUMA-N per contiguous night run (`traumaRunCapped`, solver rule 43, never relaxed).
- **Max 6 consecutive work days** (`MAX_CONSECUTIVE_WORK_DAYS`): counts assigned shift (incl. `prevBlockTailSchedules`), GR weekday (`grWorkDow`), JC presenting date — unless vacation/approved-off. Shared by validator, generator, picker.
- **Journal Club** (`src/lib/journalClub.js`): consumers use `resolveJcDates`/`jcDatesInRange`/`isJcDate`/`isJcDateAnyAy` — never re-derive. Absent config = first Tuesdays; explicit `[]` honored. `ayWindowFor().end` EXCLUSIVE.
- **Holidays**: **absent config derives NOTHING** (opposite of jcDates).
- **Seniority**: POD hard (PGY-3 required, `'pgy3Required'`), FLEX soft. **Wednesday DAY shifts exempt** (`seniorCompositionExempt`) — FOUR call sites in lockstep: `validateAll` senior loop, `fillDayPass` POD branch, `fillDayPass` FLEX branch, `narrowForSeniority`/`podStillSatisfied`.
- **Wellness Wednesdays**: `ctx.blockStart` must reach EVERY `getEligibleShifts` call site (a grid caller once omitted `ctx` and silently no-op'd this).
- **Jeopardy never collides with a clinical shift** (hard under `'warn'` and `'block'`; `'off'` silent). **Off-service residents have no jeopardy** (`isJeopardyDate` gates on `EM_HOME`/`EM_BAMC`).
- `PED_GUARD_LEGITIMATE_OWNER` DERIVED from `BASE_ELIGIBILITY` — grant eligibility there, never hand-edit the guard.
- **EM/EMS ↔ EM/TOX weekday windows swap on 2026-08-01**: both variants live in `DEFAULT_DAY_RULES.EM_HOME_2.shiftGates` distinguished by `activeWhen` — don't "clean up" into one gate.
- Advocacy-days feature REMOVED — don't migrate, don't resurrect.
- Trauma/Peds split, PED-N split, night-run shape, soft rule priority, holidays detail: archive.

## 12-hour shift windows
`src/lib/coverage.js`, `ayData[AY].twelveHourWindows`. 12h ids (`POD/MT/FLEX/PED × -D12/-N12`) staff only inside chief windows. `resolveTwelveHourWindows`: explicit array wins (`[]` = none); absent → `implicitConferenceWindows`. Don't reintroduce a second answer to "does this date run 12h".
- **`twelveHourStateFor` NEVER returns null** — always `{replaceAreas, addAreas, covOverride}` with empty sets. `getCoverageFor`'s 4th param is that state object; `undefined` = "no date context" → base numbers. A null would make every 12h minimum live on every date (was a real latent bug worth 280 phantom coverage misses in fixtures).
- Generator resolves per-date via memoizing `conf12For` — never a prebuilt map (a miss = phantom minimums). Resolution order: archive.

## Generator
- `generateSchedule()`: three `fillDayPass` passes — `'min'` except TRAUMA-D, then TRAUMA-D alone (don't collapse), then `'optional'`. Candidate pool recomputed fresh per slot — a cached pool once caused double-booking; the decision path must never go through a cache. Never overwrites non-empty cells (`keptCells`).
- `generateScheduleBest()`: 20 seeded attempts, `betterQuality` **lexicographic** `(validateAll errors, export-blocking warnings, quality vector)`, never a weighted scalar. Replay: `report.replay.truePrimaryOnly` false → `generateSchedule({...args, rng: mulberry32(report.replay.seed), repair: true})`; true → that call only gets the pre-fix schedule, then replay the true-primary-only second step too (see `generateScheduleBest`'s own header). Solver `FEASIBLE` results NOT replayable.
- Repair pass: every move transactional and narrowed by `narrowForSeniority`/`podStillSatisfied` (without them repair manufactured hard errors). Budgets 300 + 200 deliberately not shared.
- `SCORE_WEIGHTS` test is a RATCHET. New score terms join the existing last vector slot — never a 5th slot. Area-spread `areaContinuity > 0` gate is load-bearing (see archive).
- **Under-target issues carry `rule: 'underTarget'`** — classify by that id, never `message.startsWith('Under target')`. `generateScheduleBest`'s `deferUnderTargetDiagnostics` closure must be **deleted** after running on the winner (persisted report can't carry a function).
- Conference tolerance (1-short → warn, `conferenceTolerated`): absent from `EXPORT_BLOCKING_RULE_IDS` but counted in `blockingWarnCount`. Don't let a downgrade-to-warn also fall out of the scoring count, or the generator loses all incentive to hit target on conference blocks.
- AY carryover: a resident with no history is EXCLUDED from the AY population, never zeroed. Override log via `updateBlockTracked` ONLY.

## CP-SAT solver service (optional second engine)
`solver-service/` — Python/FastAPI OR-Tools; contract in `solver-service/CLAUDE.md` + `solver-service/docs/PAYLOAD_SCHEMA.md`. Seams: `buildSolverPayload()` / `mapSolverResult()` / `generateViaSolverOrLocal()` (ONLY solver-vs-local decision point).
- **R9 (2026-09-27) pipeline: local FIRST, always → solver POLISHES (warm-started) → `pickEngineResult` arbitrates.** `generateViaSolverOrLocal` runs `generateScheduleBest` before ever calling the solver, sends that schedule to the solver as `buildSolverPayload`'s optional `hint` (soft `AddHint`, never a hard pin like `locked[]`), and only ships the solver's result if it STRICTLY beats the already-computed local result — a tie or any solver failure keeps local, with no second wasted local run. Solver-side: staged (lexicographic) objective mirroring `betterQuality`'s own (errorCount, blockingWarnCount, qualityVector) ladder is now the default (`config.objectiveMode: 'staged'`); the old single weighted-sum solve is still available (`'weighted'`) for comparison. Full tier-mapping table, gaps, and search-tuning notes: `solver-service/docs/PAYLOAD_SCHEMA.md`'s dated R9 section.
- **Payload gotcha (recurred once)**: an eligibility carve-out enforced only in the generator's `candidatePool` (not `getEligibleShifts`) must ALSO be filtered in `buildSolverPayload`.

## Imports & exports
Contracts in `imports-exports` skill (`.claude/skills/imports-exports/SKILL.md`) — invoke before editing any import/export path. All three exports route through `requestExport`/`exportConfirm`.

## UI conventions
- **Dark mode**: `.dark` override sheet in `index.css`, NOT Tailwind `dark:`; wrapped in `@media screen` (print stays light). Exempt: solid `-500/600/700` buttons with `text-white`, vivid rings, scrims, `SidebarNav`/`DAY_MARKERS.dark`. Auth/requests surfaces need same treatment.
- **`DAY_MARKERS`**: single style table for GR/JC/WW/OFF/VAC/J + pending-R badge. `onShift` variant is solid `bg-white` + colored ring + `-700` text — **never an alpha tint**. New marker = edit table, never inline classes.
- **Schedule grid**: sticky header/footer/name-column need `overflow-auto` + bounded `maxHeight` — don't remove the height bound. Z-ladder: cells 10 → header/footer 20 → corner 30 (INLINE `zIndex`) → app header 50 → fullscreen 60 → progress overlay 100 → toast 200. Fullscreen = `fixed inset-0`, not `requestFullscreen()`.
- Zoom 50–150% via CSS `zoom`, **never `transform: scale`** (breaks every sticky axis); one clamp in `setGridZoom`. `clampGridZoom` typeof-checks, no `Number()` coercion. Week bands MONDAY-started.
- **Cell locking**: `block.lockedCells`; generator knows nothing about locks; every bulk lock action = ONE functional `updateBlockTracked` (looping floods undo).
- `computeCoverageByDate` shared by grid footer/Dashboard/Calendar — never fork. `cellViolations` shared by picker + drag-drop. Root `issues` memo = ONE `validateAll` pass.
- Dashboard is landing tab (Home tab GONE).
- What's New: change `CHANGELOG` `id` only for interruption-worthy releases; `markChangelogSeen()` single writer.
- Schedule-tab grouping: `lib/scheduleGrouping.js` `groupResidents` takes `CATEGORIES`/`BLOCK_TYPES_EM`/`isEmResident` as PARAMETERS (lib may not import big file); returns `[{cat, members}]`.

## Rule-default migration (required whenever defaults change)
`getEffectiveDayRules`/`getEffectiveEligibility` replace defaults WHOLESALE with chief overrides — an override equal to a superseded default masks the fix forever. **When correcting `DEFAULT_DAY_RULES`/`BASE_ELIGIBILITY`: push the old shape onto that key's array in `LEGACY_DAY_RULE_DEFAULTS`/`LEGACY_ELIGIBILITY_DEFAULTS`** (arrays accumulate one snapshot per correction) — the mount prune drops overrides deep-equal to ANY snapshot; genuinely customized overrides get an amber review badge (`DAY_RULE_DEFAULTS_CHANGED`, derived from the maps' keys).

### Eligibility overrides are a DIFF, not a snapshot
`res_eligibility_overrides` stores `{added, removed}` per key (`src/lib/eligibilityOverrides.js`). The old wholesale-list format made later-added shift ids invisible forever (shipped as a real silent ACEP outage — 12h shifts unassignable under old rotation overrides, which `LEGACY_*` can't reach since it's keyed `CATEGORY_PGY` and rotation keys are `CATEGORY_PGY__ROTATION`). **Don't "simplify" back to a list.**
- Both shapes read forever through `normalizeEligibilityOverride`; legacy arrays get `backfillLaterAddedShiftIds` FIRST.
- One-time mount migration order is load-bearing: prune legacy-equal overrides FIRST, then convert category keys before rotation keys (rotation base = parent's effective list). Empty diff deletes the key.
- `stripPedGuardedShifts` runs AFTER resolution — PED guards beat any override.

## When editing
- Grep before assuming a helper unused. `npm test` for lib/generator changes; `npm run dev` + sample generation for UI.
- New `getEligibleShifts` call site: always pass `ctx = {blockStart: block.startDate, ...}`.
- New shift: `SHIFTS` + `SHIFT_TIMING` + `DEFAULT_COVERAGE_MINMAX`. New marker: `DAY_MARKERS`. New `res_*` key: `LS_BACKUP_KEYS` + `syncBindings`. Rule default correction: `LEGACY_*_DEFAULTS`. candidatePool-only exclusion: mirror in `buildSolverPayload`.
