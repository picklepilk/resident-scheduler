# Coverage board (Coverage tab upgrade) — plan

## Goal
An admin-facing visual board for a block being built or finalized: see at a glance which ER areas/time slots are adequately staffed, what kind of resident is expected to fill a short slot, and fill it by hand without breaking scheduling rules.

## Decisions (user, 2026-10-15)
- Lives in the existing **Coverage** tab (upgrade, not a new tab).
- **Block heatmap + day floor**: heatmap of areas × dates; click a date → day floor (areas as columns, Day/Eve/Night rows, seats per slot).
- Empty-slot panel lists: **legal** residents (ranked), then **override-needed** (flagged, confirm flow), then **"legal after 1–2 changes to their own schedule"** (with the exact changes), then a collapsed **why-not** list.
- Expected filler: **chips per eligible resident type** (e.g. "EM PGY-3", "BAMC PGY-2", "Off-svc FM PGY-1") + the **hard requirement** highlighted (e.g. "POD needs a PGY-3").

## Reuse (no new rule logic)
- Legality: the `cellHelpers` closures in `ScheduleGrid` (`isEligible`, `eligibilityReasonFor`, `hardViolations`/`softViolations` via `cellViolations`, `targetInfo`, `lockedCells`) — hoist into a shared `useCellHelpers(...)` hook used by both ScheduleGrid and CoverageTab.
- Candidate pattern: `src/lib/cellAlternatives.js` (`findGiveCandidates` style, injected predicates); `src/lib/sickCallCover.js` ranking.
- Writes: one `updateBlockTracked` per user action; `runOrConfirmOverride` / `OverrideConfirmPanel` for override-tier rules; locked cells respected.
- Coverage numbers: `composeCoverage` (`lib/coverageComposition.js`) / `computeCoverageByDate` — never fork; 12h via `twelveHourStateFor`/`getCoverageFor`; weekday existence via `shiftActiveOnDow`.
- Why-short text: `report.unfilled[].blockers/nearMiss` when a generation report exists; otherwise live `eligibilityReasonFor` + violation reasons.

## Build steps
1. **`src/lib/slotCandidates.js`** (pure): `findSlotCandidates({dateStr, shiftId, residents, schedule, lockedCells, isEligible, eligibilityReason, hardViolations, softViolations, targetInfo})` → `{legal[], override[], blocked[{resident, reasons}]}`; resident must be free that date; ranking = under target, fewest shifts, night/weekend balance for night/weekend shifts. Unit tests.
2. **`src/lib/slotFixes.js`** (pure): for `blocked` residents whose only blockers are fixable by their *own* schedule (rest gap, circadian, 6-day streak, weekly/80h hour caps, night cap/stints, already working that day), search ≤2 edits to their own shifts: drop a surplus shift (shift stays ≥ min), move one of their shifts to another date where they're legal and it has headroom, or hand it to another legal resident. Each plan re-validated step by step with `hardViolations`; only plans that end fully legal (and create no new hard error for anyone touched) are offered. Bounded search (top N residents, nearest dates). Unit tests incl. "never offers a plan that breaks coverage min elsewhere".
3. **`src/lib/expectedFiller.js`** (pure): invert effective eligibility for (shift, date) over the roster → buckets present & available that date (category, PGY, rotation) + requirement text from `SENIOR_COMPOSITION`/`seniorCompositionExempt` (Wed day), PED owners (`PED_GUARD_LEGITIMATE_OWNER`), Trauma PGY rules, 12h windows. Takes those tables as parameters (lib can't import the big file). Unit tests.
4. **Heatmap view** (Coverage tab, new default sub-view): rows = area × time (D/E/N, 12h, swing where active), columns = dates; cell colour = below min / at min / between min–max / over max; text `n/min`; click a date header or cell → day floor for that date. Colours from `AREA_COLORS`; dark mode via `.dark` overrides in `index.css`.
5. **Day floor view**: columns = areas, rows = time bands; seats = max (min seats solid, optional seats dashed); filled seat = resident chip (category colour + PGY); empty seat → side panel (expected chips + requirement, Legal / Override / Fixable / Why-not). Prev/next date. "Assign" and "Apply changes" go through `updateBlockTracked` (+ override confirm). Keyboard reachable, labelled.
6. Concise UI copy (user preference). CHANGELOG entry without changing `CHANGELOG[0].id` semantics unless interruption-worthy.

## Verification
- Unit tests for the three libs; `npm test`; `npm run build`.
- Local demo smoke (`npm run dev`, Supabase blanked, anonymized benchmark fixture): heatmap matches grid footer counts; fill a short slot via Legal, via Override (note recorded), via Fixable plan (all changes applied in one undo step); undo restores; locked cells untouched.
