# CLAUDE.md moved detail

Verbatim sections moved out of `CLAUDE.md` to shrink it (trimmed 2026-10-30; original in `CLAUDE.md.bak` until reviewed). Read the matching section before editing that area.

## Persistence: race-safe saves, dbReady, version history, playgrounds
- **Every save path race-safe**: `sbSaveStateVersioned` PATCHes `?version=eq.N`; 0 rows = lost race, `openConflict` shows `cloudConflict` modal. Full-replace actions (first seed, Import Backup, playground start-fresh, Version History Restore) use `sbSaveStateExplicit` (loads real current version, never trust a stale local flag; seeds via `sbSeedState` with `ignore-duplicates`, never `merge-duplicates`). `null` = lost race: root callers `openConflict`; Import/Restore (SettingsTab) abort with "reload and try again" toast.
- **`dbReady` gates all cloud writes and stays false if mount-time load fails** — a device that never read the cloud must not overwrite it. **`row == null` is AMBIGUOUS** (no row vs RLS-filtered caller): mount effect checks `sbIsAdmin()` before trusting empty as safe-to-seed — don't remove. `cloudBaselineRef` is `{values, version}` — destructure. `saveCloudNow` no-ops while `cloudConflict` is up (checked via ref, not state). `flushPendingCloudSave()` awaits pending timer AND in-flight save.
- Version History: `sbFetchHistoryData` fetches ONE row lazily — never all 50. Restore = `flushPendingCloudSave()` + `sbSaveStateExplicit` + cloud-first-then-reload; refused in demo mode.
- `clearAll()`/`importData()`: cloud op FIRST, then local + reload; both set `syncSuspended`; both early-return in demo mode.
- **Playgrounds**: per-admin `res_state` rows `pg_<ownerUid>_<rand>`; logic in `src/lib/playgrounds.js`. `physKey()` rewrites `res_` → `res_demo_`; `assertWriteTargetRowId` guards every write path. Promote: cloud-only, typed-confirm, merges only matched block's `schedule`+`lockedCells` — never roster/settings/rules. (ref: Cloud sync)
- One-shot mount migrations that store a marker (e.g. `migratePedNightAssignments` / `res_pednfm_migrated`) must gate on `dbReady`, not `[]` — else they migrate the pre-overlay copy, burn the marker, and get overwritten by the still-unmigrated cloud row. Markerless prune effects (LEGACY defaults) don't need the gate.

## Shift targets, off-service windows, availableRanges
- `getShiftTarget` resolution ends in a **single tail return** applying `targetDelta` — never add early returns. A delta that zeroes the target returns **`null`, not `0`**. `computeQualityMetrics`' second `baselineTargets` map must keep its per-resident `?? target` fallback. Buy-downs are DELTAs; `ImportMatrixModal` MERGES assignment records (replace would wipe deltas/isChief). (ref: Data model detail)
- `offServiceWindowTargetDelta` wraps `offServiceWindowStatus` — non-display consumers must call the wrapper, which collapses zero delta to `null` via `status && status.delta !== 0 ? status.delta : null` (NOT `status?.delta ?? null`).
- **`availableRanges` is UNCLAMPED**: `buildOffServiceResidentsForBlock` stores the REAL ER rotation window — don't clamp to the imported block (it defeats `offServiceWindowStatus` straddle math). `OffServiceStraddleBadge` (+ `src/lib/offServiceWindow.js`) at all 3 `offServiceWindowStatus` call sites; detail in `imports-exports` skill.

## Rules: consecutive days, rest, computed dates, Journal Club
- **Max 6 consecutive work days** (`MAX_CONSECUTIVE_WORK_DAYS`): CLINICAL SHIFTS ONLY (chief decision 2026-10-15). `isStreakWorkDay` shared by validator, generator, picker; solver's `workday_limits.py` mirrors it. (ref: Scheduling rule detail)
- **Rest between shifts** (ACGME 6.17.a.2, always hard): measured strictly from the earlier shift's own end — GR never pushes it (chief decision 2026-10-15). GR hours toward 60h/72h weekly caps via `lib/acgmeHours.js` `grWindowFor`/`grHoursOn`.
- **Computed-date rules are chief-LOGGED, never derived** (`src/lib/ruleDates.js`): First Friday, Wellness Wednesday (per PGY), Journal Club (`ayData[AY].jcDates`). Absent list = NO dates (like holidays); calendar math is a SUGGESTER only. `ctx.ayConf` must reach EVERY `getEligibleShifts` call or First Friday/Wellness silently no-op. (ref: Scheduling rule detail)
- **Journal Club** (`src/lib/journalClub.js`): consumers use `resolveJcDates`/`jcDatesInRange`/`isJcDate`/`isJcDateAnyAy` — never re-derive. Absent config = NO dates; explicit `[]` honored.

## Rules: seniority, Wellness Wednesday, hand overrides
- **Seniority**: POD hard (PGY-3 required, `'pgy3Required'`), FLEX hard too (EM Home PGY-2 OR PGY-3 since 2026-10-30 via `SENIOR_COMPOSITION.FLEX.primaries`, no FLEX Wellness substitute/gating; `'pgy2Required'`; unmet leaves slot unfilled, no junior fallback). Trauma-night position-in-run rule and the final-Sunday-overnight rule were REMOVED 2026-10-30 (hard ≤2 TRAUMA-N per run kept). **Wednesday DAY shifts exempt** (`seniorCompositionExempt`) — FOUR call sites in lockstep: `validateAll` senior loop, `fillDayPass` POD branch, `fillDayPass` FLEX branch, `narrowForSeniority`/`podStillSatisfied`.
- **Wellness Wednesdays**: `ctx.blockStart` must reach EVERY `getEligibleShifts` call site (a grid caller once omitted `ctx` and silently no-op'd this).
- **Hand overrides** (`src/lib/handOverrides.js`, `isHandOverridable`): every `program` rule + `rotationEligibility` may be broken by HAND (confirm + note); generator/solver/validator hardness unchanged. Record written in the SAME `updateBlockTracked` (via `syncHandOverrides`). Covered errors downgrade to `warn` + `overridden:true` (program ids are not in `EXPORT_BLOCKING_RULE_IDS` - keep it so). ACGME hours/rest/vacation never overridable. `buildSolverPayload` THROWS (`code: 'HAND_OVERRIDES'`) for live overrides (except `traumaDayRotationGuard` on non-trauma-cap subjects) -> `engineUsed: 'skipped-overrides'`. (ref: Scheduling rule detail)

## Generator: ranking, LNS, repair, SCORE_WEIGHTS
- **Ranking follows Soft Rule Priority**: `blockingWarnCount` = `countBlockingWarns(issues, rulePriority)`; when `rankedBelowCoverage` (`lib/rulePriorityRanking.js`) holds, `postNightRest`/`seniorComposition` warnings are NOT counted there, only in their own priority-ordered vector slot (`report.seniorGaps` is dormant, don't use it). Export gate (`issueCounts.restWarns`, `EXPORT_BLOCKING_RULE_IDS`) UNCHANGED - rest and composition warnings still need ack. (ref: Generator detail)
- **LNS (B1)**: absent `timeBudgetMs` = exactly `attempts` (baselines pin `attempts:20` + `lnsIters: BASELINE_LNS_ITERS`=40, never a time cap — non-deterministic). LNS clears only generator-placed cells (never original non-empty/locked), adopts only on strict `betterQuality`; don't reuse it for moves that bypass `betterQuality`. (ref: Generator detail)
- **Night consolidation (2026-10-28)**: `nightShapePenalty` charges every run past a resident's first (edge included; only the singleton charge is interior-only) via `nightFragmentationCost`; `nightMergePass` + LNS night-focus windows + stronger fill-time `nightCluster` push it. Replay needs `replayNightMerge` (see `generateScheduleBest` header). Detail: archive.
- Repair pass: every move transactional and narrowed by `narrowForSeniority`/`podStillSatisfied` (without them repair manufactured hard errors). Budgets 300 + 200 deliberately not shared.
- `SCORE_WEIGHTS` test is a RATCHET. New score terms join the existing last vector slot — never a 5th slot. Area-spread `areaContinuity > 0` gate is load-bearing (see archive).

## Generator: candidatePool stages, conference tolerance, AY carryover
- `candidatePool` is an ordered `CANDIDATE_POOL_STAGES` list shared with `firstBlockingReason`. A new hard filter = a new stage there, never an inline `pool.filter` — else explanations silently drift from decisions.
- Conference tolerance (1-short → warn, `conferenceTolerated`): absent from `EXPORT_BLOCKING_RULE_IDS` but counted in `blockingWarnCount`. Don't let a downgrade-to-warn also fall out of the scoring count.
- AY carryover: a resident with no history is EXCLUDED from the AY population, never zeroed. Override log via `updateBlockTracked` ONLY.

## UI conventions: markers, grid, locking, block peek, clear schedule
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

## Eligibility overrides are a DIFF

### Eligibility overrides are a DIFF, not a snapshot
`res_eligibility_overrides` stores `{added, removed}` per key (`src/lib/eligibilityOverrides.js`). **Don't "simplify" back to a list** (history: ref: Eligibility overrides history).
- Both shapes read forever through `normalizeEligibilityOverride`; legacy arrays get `backfillLaterAddedShiftIds` FIRST.
- One-time mount migration order is load-bearing: prune legacy-equal overrides FIRST, then convert category keys before rotation keys (rotation base = parent's effective list). Empty diff deletes the key.
