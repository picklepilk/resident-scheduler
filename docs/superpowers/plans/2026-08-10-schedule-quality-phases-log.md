# Plan Review Log: Close schedule-quality gap blocking cutover

Act 1 (grill) done — plan locked w/ user. MAX_ROUNDS=5.

Reviewer: Codex, CLI default model (config unpinned), codex-cli 0.145.0. Read-only every round.

## Act 1 summary — what grill settled
- Deliverable: audit -> ranked menu -> user pick 1-3 -> PLAN.md detail those.
- Usage stage: trial parallel w/ manual process; not cut over.
- All four cutover blockers bite; forced rank put **missing real-world rules** first.
- Hand-fixes after generation: moved shifts off specific residents / rebalanced who hammered / fixed bad sequences. NOT filling coverage gaps.
- Missing-rule reasons **generalizable**, not person-specific -> no per-resident preference UI, no weight sliders.
- Control model chosen: "it just gets better, few knobs."
- Timeline: next block, weeks away -> holidays deferred (November).
- blocksHistory: "few blocks, some published" -> carryover viable but must degrade on thin history.
- User picked all four ideas; sequenced w/ explicit cut line after Phase 1.

## Round 1 — Codex: BLOCKED (not plan finding)

Act 2 couldn't run. Codex CLI authenticated, version-valid (codex-cli 0.145.0, model resolved `gpt-5.6-terra`, sandbox read-only, workdir correct), but every request returns:

    ERROR: You've hit your usage limit. Upgrade to Plus to continue using Codex,
    or try again at Aug 23rd, 2026 5:48 PM.

Three `codex exec` invocations attempted. All started thread, all died on quota error before output; earlier missing `/tmp/codex-verdict.txt` symptom of this, not path bug. No adversarial review obtained. Per skill rules, failure surfaced not retried blind, NO verdict fabricated.

Plan status: **locked by Act 1, UNREVIEWED by Act 2.** Quota resets 2026-08-23.

## Act 3 — Build (Claude; Codex review never ran)

User told Act 2 unavailable, chose "build all four phases now, no review" after risk flagged. Built in planned order. Test count 124 -> 161, `npm run build` clean.

### Phase 0 — score() priority audit — SHIPPED AS AUDIT ONLY, NO BEHAVIOR CHANGE
Plan allowed "no change" as legit outcome — that's what measurement supported.
- Extracted every `score()` weight into exported `SCORE_WEIGHTS` table + STRUCTURAL/PREFERENCE classification. Proved extraction behavior-identical: dumped schedules for 9 (variant, seed) pairs before/after — byte-identical diff.
- Arithmetic inversion REAL and severe: preference bands 22/40/27 vs 5.0-point one-shift-of-deficit threshold (up to 8 shifts of deficit overridable by area nudge), smallest structural weight (15) below largest preference band (40). Pre-existing header comment claiming each weight "comfortably larger than sum below it" was false.
- BUT hypothesis failed under measurement. Rescaling preferences ~6x down (all bands under 5.0) moved `deficitSpread` not at all over 6 seeds x 3 fixtures (.0623->.0640, .1073->.1073, .1008->.1020), slightly worsened coverageMiss. Cause: `candidatePool`'s `allAtTarget` filter already enforces target fairness upstream of `score()`. **Rescale rejected, original weights kept.** Finding recorded in-code so not "re-fixed" on suspicion later.
- Deliverable: weight table, ratchet test (bands can't grow; every weight must classify), recorded numbers. Made Phase 1 safe to add.

### Phase 1 — Generalized work-shape scoring — SHIPPED
- `workShapePenalty` added to `computeQualityMetrics`; `workContinuity`/`areaContinuity`/`offAdjacency` added to `score()` as separately-banded always-on preference bucket (so adding couldn't inflate three ceilings Phase 0 just recorded).
- Deviation from plan, deliberate: plan said mirror night metric's "every run beyond first" fragmentation rule. WRONG for worked days — `MAX_CONSECUTIVE_WORK_DAYS` is 6, so 18-shift target requires >=3 runs; mirroring would penalize legally-required structure. Fragmentation measured against `ceil(worked / maxConsecutiveWorkDays)` instead.
- Measured: workShapePenalty -5.9% / -1.3% / -6.0%; slot 3 improved all three fixtures; 0 errors.

### Phase 2 — AY-to-date fairness carryover — SHIPPED
- Published-snapshot-only, recency-capped 6 blocks, blended by confidence factor.
- Two properties plan called crux implemented+tested: strict no-op on empty history, no-history residents EXCLUDED not zeroed (zeroing would systematically hammer newest resident — opposite of intent).
- Also guards case plan missed: published snapshot sharing LIVE block's id (publish then reopen) must not count as own prior history.

### Phase 3 — Override capture — SHIPPED
- Hooked into `updateBlockTracked` only. Two guards tested: don't log edits to non-generated schedule, don't log generation as override of own output.
- Read-only Validation-tab card. No rule inference, no auto-tuning.

### Test-infrastructure change (not in plan, forced by work)
Committed baseline was SINGLE seed, fired on noise twice for changes neutral or better in aggregate. Every slot carries real seed drift (coverageMiss ±1.5, seniorGaps ±2, slot 3 ±10). Rebuilt as 5-seed average plus residual per-slot tolerance, verified still catches real regression (zeroing `nightCluster` moves slot 0 +1.8, slot 3 ~+85). `FORCE_QUALITY_BASELINE` used exactly twice, both measurement-definition changes w/ slots 0-2 provably unchanged, never to paper over quality regression.

### Not verified
App auth-gated locally (Supabase configured), entering credentials off-limits, so new Validation-tab card NOT visually confirmed in running browser. Module-level safety and render-path imports covered by jsdom harness; card's own rendering isn't. Sign in, open Violations tab to confirm.