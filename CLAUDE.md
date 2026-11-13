# CLAUDE.md

EM residency shift scheduler (UH Emergency Medicine). Builds/validates resident schedules across areas (POD, PED, FLEX, MT, TRAUMA), auto-generates from coverage rules, exports CSV/PDF/QGenda, JSON backup/restore in Settings.

**Evicted detail: `CLAUDE-Archive.md`. Mechanics: `docs/claude-reference.md` ("ref") and `docs/claude-detail.md` ("det"). The full pre-trim text of each section below (2026-11-13) is under `### <section> (moved from CLAUDE.md 2026-11-13)` in the file named on its heading. Every rule here is load-bearing — consult before relaxing one.**

## Commands (full text: ref "Commands, layout, stack")
- `npm test` (vitest, ~1900 tests; 5 skipped files = solver/env-gated, need Python); one file: `npx vitest run src/lib/qgenda.test.js`. Slow host (Pi): `TEST_TIME_SCALE=3 npm test`.
- No ESLint; `ResidentScheduler.jsx` UI/tabs untested — verify via `npm run dev` + generate/export a sample.
- Baselines: `UPDATE_QUALITY_BASELINE=1 npm test` (refuses worse unless `FORCE_QUALITY_BASELINE=1`); one `qualityBaseline.<variant>.json` per variant — **don't recombine**; run them ONE AT A TIME for timing; heavy multi-seed tests must be `async` and yield per seed.
- Solver parity: `SOLVER_PARITY=1 npx vitest run src/lib/solverParity.test.js` (bash) or `$env:SOLVER_PARITY=1; ...` (PowerShell); no npm script.
- Netlify deploys master (residentscheduling.netlify.app). Supabase SQL: `npx supabase db query --linked -f <file>` (CLI not on PATH); `--linked` follows `supabase/.temp/`, NOT the dashboard's selected project.

## Layout & stack (full text: ref "Commands, layout, stack")
- Public repo: **never commit real resident names, rosters, or emails** — real data enters via imports into localStorage only; committed `supabase/*.sql` carry placeholders; keep `*-resume.txt` in `.gitignore`.
- `xlsx` comes from the SheetJS CDN tarball in package.json, **never `npm install xlsx`**. `jspdf-autotable@3.8.4`: `import 'jspdf-autotable'` + `doc.autoTable({...})`, never `autoTable(doc, {...})`.
- **Almost all scheduling logic lives in `src/ResidentScheduler.jsx`**; grep `// ─── SECTION ───` markers or names, never line numbers. `src/lib/*` is pure and **may never import `ResidentScheduler.jsx`**; nor may anything under `residentRequests/` (it uses the `resident_block_lookup()` RPC, never `res_state`).
- Sibling `../em-scheduler`: check its CLAUDE.md for prior fixes first.
- **TDZ hazard**: module-level `const` referencing a later `const` throws at load; build won't catch it. `RULE_NOTES` prose hardcodes numbers duplicating `NIGHT_RULES`/`JC_MAX_PER_AY`/`TRAUMA_PEDS_SPLIT`: change one, update the prose.

## Persistence, cloud sync, auth, RLS (full text: ref "Persistence, cloud sync, auth, RLS")
- New per-block snapshot field → `OPTIONAL_SNAPSHOT_FIELDS` (`src/lib/snapshotCompare.js`). **A new `res_*` key must be added to `LS_BACKUP_KEYS` + `syncBindings`.** Device-local, excluded: `res_dark_mode`, `res_demo_mode`, `res_whats_new_seen`, `res_ui_prefs`. Backup/cloud/localStorage data is untrusted shape: guard it.
- Cloud doc = `res_state` row `id:'main'`; RLS admin-only; versioned + audit history, NOT last-write-wins. **Never send the anon key as `Authorization` for it** (a timeout must NOT fall back to anon while `AUTH_ENABLED`). DEPLOY ORDER: admin-only migration after client; history migration BEFORE client. `version`/`updated_by`/`updated_at` trigger-only. `dbReady` gates cloud writes; playgrounds use `physKey()` (det "Persistence: race-safe saves, dbReady, version history, playgrounds").
- Jeopardy ledger lives in `appSettings.jeopardyLog`, **NOT its own `res_*` key**; don't promote it.
- `AUTH_ENABLED` missing env: dev unauthenticated, **production build fails closed**. Roles `pending` → `resident` → `admin` (no 'chief').
- **RLS is the security boundary.** `is_admin()` SECURITY DEFINER, never inlined; resident policies fold in `role <> 'pending'`; allowlist keys off `auth.jwt()->>'email'`, **never `new.email`**; don't widen `resident_block_lookup()`'s return shape (must exclude per-block `schedule`).
- `supabase/*.sql` run by hand: `day_off_requests.sql` = baseline, `migrate_*.sql` = deltas; schema change = update baseline AND add migrate file.

## Shift catalog, scheduling rules, generator (full text: det "Shift catalog, scheduling rules, generator")
- Shift ids `AREA-TYPE` (exceptions `PED-S`, `PED-N-FM`); **nothing parses ids by splitting on `-`.** `shiftActiveOnDow` (`lib/shifts.js`) answers "shift exists on weekday". New shift: `SHIFT_TIMING` AND `DEFAULT_COVERAGE_MINMAX` entries.
- **Coverage is `{min,max}`**: fill to min (hard), top up toward max only for under-target residents; Wednesday overrides via `DOW_COVERAGE_OVERRIDE`.
- `getShiftTarget` single tail return; `availableRanges` UNCLAMPED (use `offServiceWindowTargetDelta`; det "Shift targets, off-service windows, availableRanges"). `saveBlock` must preserve snapshot `published`. Historical counts never derive/validate targets.
- **Circadian** `NIGHT_RULES` 4-6-6: eve→day next day hard; nights soft 6, 7-12 only AS NEEDED (12 hard); hard circadian + GR-gap checks ignore `enforceRest`. **Trauma**: max 1; ≤2 TRAUMA-N per night run (never relaxed); TRAUMA-D only on `TRAUMA_BLOCKS` rotation (post-resolution strip, NOT a shiftGate; pass `dayRules` to `getEffectiveEligibility`). Max 6 consecutive CLINICAL days, GR never pushes rest; computed-date rules chief-LOGGED (absent = nothing derived); `ctx.ayConf` and `ctx.blockStart` must reach every `getEligibleShifts` call.
- **As-needed rules** (program decision 2026-10-30): a `DEFAULT_DAY_RULES` shiftGate may carry `asNeeded: true` + `asNeededLabel`; broken only to fill a coverage MINIMUM (ACGME rest/hours/streak/vacation, true PGY/rotation eligibility stay hard); `getEligibleShifts` unchanged, use `getAsNeededShifts`; **BAMC Thursday DAY NEVER allowed**; marking another gate: flag + label, old shape to `LEGACY_DAY_RULE_DEFAULTS`, update `RULE_NOTES`.
- POD hard (PGY-3) / FLEX hard (PGY-2 or PGY-3, PGY-2 PREFERRED) seniority, Wednesday DAY exempt at FOUR lockstep sites; program rules breakable by HAND only. 2026-11-06 chief rules: JC 3/AY counts ALL saved same-AY blocks; `pedsMixMax` `override`-tier; `paybackAllowance` lifts only the CEILING; call `withCustomSeniorWellness` at roster-aware entries reaching `compositionSatisfies`.
- Jeopardy never collides with a clinical shift; off-service residents have no jeopardy. `PED_GUARD_LEGITIMATE_OWNER` is DERIVED — grant eligibility in `BASE_ELIGIBILITY`. EM/EMS ↔ EM/TOX windows swap 2026-08-01 (both in `EM_HOME_2.shiftGates` via `activeWhen`) — don't merge. Advocacy-days REMOVED — don't resurrect.
- 12h ids staff only inside chief windows (`src/lib/coverage.js`, `ayData[AY].twelveHourWindows`); one answer via `resolveTwelveHourWindows`. **`twelveHourStateFor` NEVER returns null**; generator uses memoizing `conf12For`, never a prebuilt map.
- `generateSchedule()`: three `fillDayPass` passes — `'min'` except TRAUMA-D, TRAUMA-D alone (don't collapse), then `'optional'`. Candidate pool recomputed fresh per slot (a cache once double-booked). Never overwrites non-empty cells.
- `generateScheduleBest()`: 20 seeded attempts, `betterQuality` **lexicographic**, never a weighted scalar; `SCORE_WEIGHTS` is a ratchet (no 5th slot); solver `FEASIBLE` results NOT replayable (ref "Generator detail"; det "Generator: ranking, LNS, repair, SCORE_WEIGHTS").
- Under-target issues: classify by `rule: 'underTarget'`, never message text; delete deferred `compute*Diagnostics` closures after running on the winner. New hard filter = new `CANDIDATE_POOL_STAGES` stage, never inline `pool.filter`.

## CP-SAT solver service (full text: det "CP-SAT solver service"; ref "Solver detail")
- `solver-service/` (contract: its `CLAUDE.md` + `docs/PAYLOAD_SCHEMA.md`). `generateViaSolverOrLocal()` is the ONLY solver-vs-local decision point. **R9: local FIRST, solver POLISHES (warm-started, hint = soft `AddHint`), `pickEngineResult` arbitrates**; solver ships only if STRICTLY better.
- Outer LNS default-ON; disable per request `config.outerLns {enabled:false}`; tests asserting 5 progress stages must disable it. Eligibility carve-out only in `candidatePool` must ALSO be filtered in `buildSolverPayload`.
- Pool: `src/lib/solverPool.js`, build-time `VITE_SOLVER_POOL` (each host needs a `netlify.toml` CSP entry); `res_solver_target` = `'builtin'`|`'cloud'`(Auto)|`'local'`|`'pool:<name>'`; server-side `SOLVER_ALLOWED_EMAILS` is the boundary. Knobs/Modal/Fly: `solver-service/CLAUDE.md`, `PERF_NOTES.md`, `DEPLOY-MODAL.md` (`/solve` 400 `use_jobs` on Modal → `solveViaJob`).

## Imports, UI, rule defaults, editing (full text: ref "Imports, UI, rule defaults, editing")
- Imports/exports: invoke `imports-exports` skill (`.claude/skills/imports-exports/SKILL.md`) first; all exports route through `requestExport`/`exportConfirm`.
- Dark mode: `.dark` sheet in `index.css`, NOT Tailwind `dark:`, inside `@media screen`. `DAY_MARKERS` only (no alpha tints); zoom via CSS `zoom` never `transform: scale`; block peek read-only; one `clearScheduleFields` (det "UI conventions: markers, grid, locking, block peek, clear schedule").
- **Correcting `DEFAULT_DAY_RULES`/`BASE_ELIGIBILITY`: push the old shape onto that key's array in `LEGACY_DAY_RULE_DEFAULTS`/`LEGACY_ELIGIBILITY_DEFAULTS`** (overrides replace defaults WHOLESALE; an override equal to a superseded default masks the fix). `res_eligibility_overrides` is `{added, removed}` (det "Eligibility overrides are a DIFF"); `stripPedGuardedShifts` runs AFTER resolution.
- `npm test` for lib/generator changes; `npm run dev` + sample generation for UI. Per-addition touchpoints: new shift, marker, `res_*` key, rule-default correction, candidatePool-only exclusion, new `getEligibleShifts` call site (`ctx = {blockStart: block.startDate, ...}`).
