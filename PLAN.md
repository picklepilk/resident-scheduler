# Plan: Close the schedule-quality gap blocking cutover
_Locked via grill — Claude + user (Act 1 of /grill-me-codex)_

## Context

The scheduler is being trialed **in parallel** with the existing manual process and has not been
cut over. The grill isolated why: the generator produces **legal but not acceptable** schedules.
Coverage gaps are *not* the problem — the chief confirmed they are not hand-filling unfilled slots.
The three real post-generation hand-fixes are:

1. Moved shifts off specific residents
2. Rebalanced who got hammered
3. Fixed bad sequences

All three are **schedule-quality** problems, not hard-constraint problems. Crucially, the chief
confirmed the "wrong resident" fixes are **generalizable** — derivable from data the app already
holds (rotation, PGY, surrounding days, lecture/JC load) — not person-specific. So this needs **no
per-resident preference UI and no new knobs**; it is an expressiveness gap in the existing scorer.

Target: cut over on the next block, **weeks away**. Holidays are deliberately deferred (zero
"holiday" hits anywhere in the codebase today; Thanksgiving is November — not this block's problem).

### What already exists (reuse, do not rebuild)
- `src/lib/scheduleQuality.js` — `computeQualityMetrics` / `computeQualityVector` /
  `betterQuality`. Lexicographic 4-slot tuple, **not** a weighted scalar (deliberate).
- `generateScheduleBest` (`ResidentScheduler.jsx` ~3245) — best-of-20 seeded restarts + one
  bounded repair pass, gated on strict `betterQuality`.
- `buildQualityInput` (~3191) and `scoreGenerationResult` (~3211) — the seam every new metric
  must enter through.
- `score()` inside `generateSchedule` (~2680-2740) — ~20-term **weighted scalar** sum.
- `src/lib/generator.harness.test.js` + `generator.baseline.test.js` +
  `__fixtures__/qualityBaseline.json` — committed regression floor, `UPDATE_QUALITY_BASELINE=1`
  refuses to write a worse number without `FORCE_QUALITY_BASELINE=1`.
- `updateBlockTracked` (~10072) — **the single choke point every schedule mutation already routes
  through** (assign, drag-drop, generate, lock toggle). Phase 3 hooks here, nowhere else.
- `block.lockedCells` — cell pinning already shipped; do not rebuild it.
- `traumaNightYearly` in `score()` — the **only** existing AY-level carryover, clamped at 5. It is
  the precedent Phase 2 generalizes, and its clamp comment is documented evidence that an
  unclamped carryover term already swamped a structural tier once.

## Approach

Four phases, strictly sequenced, with an explicit **cut line**. Everything above the cut line
ships before the block and is independently worth cutting over on.

### Phase 0 — `score()` priority audit *(prerequisite, not a peer)*
`computeQualityVector` was deliberately made lexicographic because a weighted scalar let a
low-priority soft rule outrank a high-priority one at large magnitudes. **`score()` still has
exactly that shape** — 20 weighted terms in one sum. Adding Phase 1 and Phase 2 terms to it
without fixing this risks making the generator *worse* in ways best-of-20 hides (the outer gate
discards bad attempts silently).

1. Enumerate every term in `score()`; classify each as **structural** (changes whether the
   schedule is valid/acceptable: `deficit`, `seniorAdj`, `jeo`, `secondIntern`, `traumaDaySenior`,
   `pedsMixNeedsMore`) vs **preference** (tie-breaks: `traumaNightDowPref`, `toxPedsEvePref`,
   `podPgy1SecondSlot`, `generalPedsNudge`, `pedsClassRepeat`, `traumaNightBalance`).
2. Determine empirically whether any preference term can currently overcome any structural term at
   realistic magnitudes. Write a test that asserts the boundary.
3. Only if a real inversion exists: split `score()` into a comparable tuple
   (structural tier, preference tier, `rng()` tie-break), mirroring `compareVectors`.
   **If no inversion is demonstrable, stop and document that** — do not refactor on suspicion.
4. Re-run the baseline. Phase 0 must be quality-neutral or better.

### Phase 1 — Generalized shape scoring *(kills "fixed bad sequences")*
`nightShapePenalty` is the only shape metric and it only sees night runs. Nothing penalizes
scattered day shifts, area churn, or shifts butted against vacation.

1. In `computeQualityMetrics`, add a `workShapePenalty` alongside `nightShapePenalty`, computed
   the same way (walk `dates` per resident, build maximal runs) over **all** assigned shifts:
   - isolated single shift surrounded by off-days
   - run fragmentation (every run beyond the first, matching the existing `idx > 0` convention)
   - day-to-day **area churn** (`SHIFT_MAP[sid].area` changing across consecutive worked days)
   - shift **adjacent to `vacationDates` / `approvedDatesOff`** boundaries
2. Apply the **same block-edge exemption** the night metric uses (runs touching `dates[0]` or the
   last date are exempt) — a run may legitimately continue into the adjacent block, and the
   validator already tolerates this.
3. Add to `fairnessPlusShape` in `computeQualityVector` — **inside the existing last slot**, not as
   a new tuple slot, so it cannot outrank the three soft-rule tiers.
4. Add a matching low-weight `score()` term so the greedy fill steers toward good shape rather than
   relying on best-of-20 to stumble into it.
5. Extend `scheduleQuality.test.js`; refresh `qualityBaseline.json` via `UPDATE_QUALITY_BASELINE=1`.

**── CUT LINE — everything above ships before the block. ──**

### Phase 2 — AY-to-date fairness carryover *(kills "rebalanced who got hammered")*
`nightSpread` / `weekendSpread` / `deficitSpread` are current-block-only, so a resident hammered
last block starts even again this block.

1. Thread `blocksHistory` into `buildQualityInput` (it is already a `scoreGenerationResult` arg —
   passed to `validateAll` — so no new plumbing to `generateScheduleBest`).
2. Count each resident's **published**-snapshot nights/weekend-dates/assigned-shifts to date within
   the current AY (`ayWindowFor`), reusing the same published-only convention `countPublishedJC`
   already establishes.
3. Compute spreads over `priorTotal + thisBlockTotal`.
4. **Thin-history taper is the crux** (chief has "few blocks, some published"): blend the AY spread
   toward the block-only spread by a confidence factor derived from prior-block coverage, and
   **exclude residents with no prior history from the AY-spread population entirely** rather than
   treating them as zero — a zero would read as maximally under-worked and systematically hammer
   the newest resident.
5. Clamp the carryover contribution the way `traumaNightBalance` is clamped, for the documented reason.
6. Baseline fixtures need a prior-block variant; assert a no-history roster scores identically to
   today (carryover must be a strict no-op on empty history).

### Phase 3 — Override-capture loop *(attacks the root of "moved shifts off specific residents")*
The chief cannot articulate the remaining rules. Their hand-fixes are the ground truth and are
currently discarded. This phase produces **data, not better schedules** — it pays off the block
*after* cutover.

1. In `updateBlockTracked` (the one choke point), append an override event when the pre-edit
   schedule came from a generation: `{resident, date, fromShift, toShift, at}`.
2. Store on the block object (rides existing persistence/backup like
   `offServiceResidents` — **no new `LS_BACKUP_KEYS` entry, no `syncBindings` change**).
3. Read-only Validation-tab card aggregating the pattern: *"you undid this generator choice N
   times."* No rule inference, no auto-tuning — a backlog for a human to read.

## Key decisions & tradeoffs
- **No per-resident preference UI, no weight sliders.** Chief explicitly chose "it just gets
  better, few knobs," and separately confirmed the missing rules are generalizable. Per-resident
  fields would be dead weight in a 10.5k-line file.
- **Phase 0 before Phases 1-2, on purpose.** Adding terms to a possibly-invertible weighted sum is
  how you ship a regression that best-of-20 conceals.
- **Phase 0 may correctly end in "no change."** It is an audit with a documented negative result as
  a legitimate outcome, not a mandatory refactor.
- **Shape goes inside `fairnessPlusShape`, not a new tuple slot.** A 5th slot would let sequence
  aesthetics outrank coverage/seniority/rest. Aesthetics must never do that.
- **Holidays deferred**, despite being a genuine total gap — wrong side of the deadline.
- **Phase 3 aggregates, never auto-tunes.** Auto-fitting weights to ~20 override events overfits
  and destroys the auditability the chief needs to trust the output.
- **Published-only counting for carryover**, consistent with `countPublishedJC` — an unpublished
  draft must not move fairness math.

## Risks / open questions
- Phase 2's taper is the single riskiest design in this plan and has no obviously-correct answer at
  low history counts. Primary target for adversarial review.
- Phase 1's area-churn term may fight the existing `pedsClassRepeat` and `generalPedsNudge` terms,
  which deliberately *spread* residents across peds days. Interaction must be tested, not assumed.
- Vacation-adjacency: unclear whether the chief wants a buffer on both sides or only pre-vacation.
  Implement symmetric, make it observable in the baseline, revisit with real output.
- `qualityBaseline.json` will legitimately move in Phases 1 and 2. Must confirm each move is an
  intended improvement, not launder a regression through `FORCE_QUALITY_BASELINE=1`.
- Best-of-20 × repair with more metrics per attempt — watch generation wall-clock.

## Out of scope
Holiday calendar/coverage/equity · per-resident preference fields · global weight sliders ·
resident-facing preference collection · regeneration diff view · "why this resident" score
breakdown in the picker · data-entry/import hardening · cell pinning (`lockedCells` already
exists) · any change to hard constraints, `validateAll` semantics, or coverage min/max.

## Verification
- `npm test` — `scheduleQuality.test.js`, `generator.harness.test.js`, `generator.baseline.test.js`
  must pass; baseline non-regression is the primary gate.
- Per phase: run against all three synthetic fixtures (`standard`, `understaffed`,
  `vacationHeavy`); record the quality vector before/after.
- Phase 2 specifically: assert a roster with **no** prior published blocks produces a vector
  **identical** to pre-Phase-2 (strict no-op on empty history).
- `npm run dev` → Generate Schedule on a real block → confirm by eye that the three named
  hand-fixes shrink; CSV + PDF export still clean.
- Phase 3: make a manual edit, confirm the event is captured, survives save/reload, and round-trips
  through Settings backup/restore.

---

