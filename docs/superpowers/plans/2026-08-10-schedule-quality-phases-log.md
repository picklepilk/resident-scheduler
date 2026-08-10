# Plan Review Log: Close the schedule-quality gap blocking cutover

Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.

Reviewer: Codex, CLI default model (config unpinned), codex-cli 0.145.0. Read-only every round.

## Act 1 summary — what the grill settled
- Deliverable: audit -> ranked menu -> user picks 1-3 -> PLAN.md details those.
- Usage stage: trialing in parallel with the manual process; not cut over.
- All four cutover blockers bite; forced rank put **missing real-world rules** first.
- Hand-fixes after generation: moved shifts off specific residents / rebalanced who got
  hammered / fixed bad sequences. NOT filling coverage gaps.
- Missing-rule reasons are **generalizable**, not person-specific -> no per-resident
  preference UI, no weight sliders.
- Control model chosen: "it just gets better, few knobs."
- Timeline: next block, weeks away -> holidays deferred (November).
- blocksHistory: "few blocks, some published" -> carryover viable but must degrade on thin history.
- User picked all four ideas; sequenced with an explicit cut line after Phase 1.

## Round 1 — Codex: BLOCKED (not a plan finding)

Act 2 could not run. Codex CLI is authenticated and version-valid (codex-cli 0.145.0, model
resolved to `gpt-5.6-terra`, sandbox read-only, workdir correct), but every request returns:

    ERROR: You've hit your usage limit. Upgrade to Plus to continue using Codex,
    or try again at Aug 23rd, 2026 5:48 PM.

Three `codex exec` invocations were attempted. All started a thread and all died on the quota
error before producing output; the earlier missing `/tmp/codex-verdict.txt` was a symptom of this,
not a path bug. No adversarial review was obtained. Per skill rules the failure is surfaced rather
than retried blind, and NO verdict is fabricated.

Plan status: **locked by Act 1, UNREVIEWED by Act 2.** Quota resets 2026-08-23.

## Act 3 — Build (Claude; Codex review never ran)

User was told Act 2 was unavailable and chose "build all four phases now, no review" after the
risk was flagged. Built in the planned order. Test count 124 -> 161, `npm run build` clean.

### Phase 0 — score() priority audit — SHIPPED AS AUDIT ONLY, NO BEHAVIOR CHANGE
The plan allowed "no change" as a legitimate outcome, and that is what the measurement supported.
- Extracted every `score()` weight into an exported `SCORE_WEIGHTS` table + STRUCTURAL/PREFERENCE
  classification. Proved the extraction behavior-identical by dumping schedules for 9
  (variant, seed) pairs before and after — byte-identical diff.
- The arithmetic inversion is REAL and severe: preference bands 22/40/27 vs a 5.0-point
  one-shift-of-deficit threshold (i.e. up to 8 shifts of deficit overridable by an area nudge), and
  the smallest structural weight (15) below the largest preference band (40). The pre-existing
  header comment claiming each weight was "comfortably larger than the sum below it" was false.
- BUT the hypothesis failed under measurement. Rescaling preferences ~6x down (all bands under 5.0)
  moved `deficitSpread` not at all over 6 seeds x 3 fixtures (.0623->.0640, .1073->.1073,
  .1008->.1020) and slightly worsened coverageMiss. Cause: `candidatePool`'s `allAtTarget` filter
  already enforces target fairness upstream of `score()`. **Rescale rejected, original weights
  kept.** Finding recorded in-code so it is not "re-fixed" on suspicion later.
- Deliverable: the weight table, a ratchet test (bands cannot grow; every weight must be
  classified), and the recorded numbers. This is what made Phase 1 safe to add.

### Phase 1 — Generalized work-shape scoring — SHIPPED
- `workShapePenalty` added to `computeQualityMetrics`; `workContinuity`/`areaContinuity`/
  `offAdjacency` added to `score()` as a separately-banded always-on preference bucket (so adding
  them could not inflate the three ceilings Phase 0 had just recorded).
- Deviation from the plan, deliberate: the plan said to mirror the night metric's "every run beyond
  the first" fragmentation rule. That is WRONG for worked days — `MAX_CONSECUTIVE_WORK_DAYS` is 6,
  so an 18-shift target requires >=3 runs, and mirroring it would penalize legally-required
  structure. Fragmentation is measured against `ceil(worked / maxConsecutiveWorkDays)` instead.
- Measured: workShapePenalty -5.9% / -1.3% / -6.0%; slot 3 improved on all three fixtures; 0 errors.

### Phase 2 — AY-to-date fairness carryover — SHIPPED
- Published-snapshot-only, recency-capped at 6 blocks, blended by a confidence factor.
- The two properties the plan called the crux are implemented and tested: strict no-op on empty
  history, and no-history residents EXCLUDED rather than zeroed (zeroing would systematically
  hammer the newest resident — the exact opposite of the intent).
- Also guards a case the plan missed: a published snapshot sharing the LIVE block's id (publish,
  then reopen) must not count as its own prior history.

### Phase 3 — Override capture — SHIPPED
- Hooked into `updateBlockTracked` only. Two guards tested: don't log edits to a non-generated
  schedule, and don't log a generation as an override of its own output.
- Read-only Validation-tab card. No rule inference, no auto-tuning.

### Test-infrastructure change (not in the plan, forced by the work)
The committed baseline was a SINGLE seed and fired on noise twice for changes that were neutral or
better in aggregate. Every slot carries real seed drift (coverageMiss ±1.5, seniorGaps ±2, slot 3
±10). Rebuilt as a 5-seed average plus a residual per-slot tolerance, and verified it still catches
a real regression (zeroing `nightCluster` moves slot 0 +1.8, slot 3 ~+85). `FORCE_QUALITY_BASELINE`
was used exactly twice, both for measurement-definition changes with slots 0-2 provably unchanged,
never to paper over a quality regression.

### Not verified
The app is auth-gated locally (Supabase configured), and entering credentials is off-limits, so the
new Validation-tab card was NOT visually confirmed in a running browser. Module-level safety and
render-path imports are covered by the jsdom harness; the card's own rendering is not. Sign in and
open the Violations tab to confirm.
