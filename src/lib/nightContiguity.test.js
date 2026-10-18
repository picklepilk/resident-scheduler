/** @vitest-environment jsdom */
// src/lib/nightContiguity.test.js
// Measurement harness for the chief's 2026-10-14 night-contiguity preference ("bigger preference
// is for the night shifts to be contiguously scheduled if able" — NIGHT_RULES.maxRun stays a hard
// 6-nights-per-run program cap either way, never relaxed).
//
// PRE-FIX baseline (unmodified code, generateScheduleBest, seed 42, 20 attempts, as quoted in the
// task): residents with exactly 2 night-run segments — standard 15/23, understaffed 7/17,
// vacationHeavy 15/23, conferenceBlock 13/24 — and in EVERY one of those cases the two segments'
// combined length was already <= NIGHT_RULES.maxRun (100% "mergeable" by that measure).
//
// POST-FIX measured here (same recipe, after scheduleQuality.js's avoidable/forced fragmentation
// split):
//   standard 13/25, understaffed 7/19, vacationHeavy 13/25, conferenceBlock 11/25 — ALL still
//   100% "mergeable" by raw combined-length, but the COUNT itself dropped in 3 of 4 variants.
// (Denominators differ slightly from the task's quoted ones — this file counts every
// non-night-only resident, not just those who worked at least one night; the methodology is
// self-consistent run-to-run, which is what the regression guard below actually needs.)
//
// ROOT-CAUSE FINDING: the reduction comes from scheduleQuality.js's reweighting feeding
// generateScheduleBest's best-of-20 attempt SELECTION (betterQuality scores EVERY attempt) — a
// schedule with fewer avoidable 2nd-stint splits now wins the race more often.
//
// Tried and DROPPED: a repairPass "night-stint merge" phase (slide the shorter of two mergeable
// stints toward the longer, via swap-with-occupant or add+backfill, transactional, own budget).
// Instrumented, it fixed close to ZERO splits on these fixtures, because by the time it ran:
// (1) phases 1-5 had consumed essentially all coverage/target slack, so the same-date backfill
// rarely found a legal body; (2) many gap days are ineligible for ANY night that date (EM_EMS/
// EM_TOX `blockEntireDay` rotation windows, GR/Wellness-adjacent restrictions) or hard-blocked by
// ACGME rest/streak caps. That matches the chief's own hand schedule (65%, not 100%, of splits
// mergeable). Not worth ~230 lines at that hit rate. A future attempt should reuse phases 1-4's
// cross-date donor-cell search instead of same-date free/surplus donors, and re-measure here.
//
// Also tried and REVERTED (not committed): bumping SCORE_WEIGHTS.nightCluster's "-0.8" (starting a
// 2nd separate night run) to "-4" — re-running this same measurement showed a mixed, noisy result
// (standard 13->11 better, understaffed unchanged, vacationHeavy unchanged, conferenceBlock 11->14
// WORSE, because a stronger nightCluster term changes which of the 20 seeded attempts wins the
// best-of-20 race for reasons unrelated to night-shape, re-ordering who gets picked for OTHER
// slots too). No reliable win, real risk of regressing the SCORE_WEIGHTS ratchet's other carefully
// -tuned margins (secondIntern, podPgy1SecondSlot, etc. are all sized relative to nightCluster's
// current magnitude) — left at -0.8.
//
// scheduleQuality.js's own avoidable-split cost is committed at 2.3 (not the task's originally
// -floated 6) specifically so the quality-baseline suite doesn't need FORCE_QUALITY_BASELINE — see
// that file's own comment for the full measurement trail. The numbers in this file were
// re-confirmed at 2.3 and are IDENTICAL to what 3 and 6 produced: the 15->13/15->13/13->11 wins
// come entirely from the best-of-20 SELECTION effect (which direction to rank in, not how far),
// so the smaller, baseline-safe multiplier buys the same measured improvement here at no cost.
//
// 2026-10-16 follow-up (clinical-shift-only streak, see ResidentScheduler.jsx CLAUDE-Archive.md
// "Grand Rounds rest/streak rewrite"): the understaffed 7->11 regression this file recorded above
// was investigated and partially won back. ROOT CAUSE (debugged via one-off instrumentation on
// candidatePool/score(), not committed): relaxing isStreakWorkDay to clinical-shifts-only widens
// candidatePool's streakBlocked/sixDayRunRestBlocked filters around every GR/JC date, so MORE
// residents now reach a fresh-night-run scoring decision on a date immediately before one of their
// OWN already-known, resident-level restrictions — specifically getEligibleShifts' JC-presenter
// night-strip (item 6) and its GR-lecture-eve night/eve-strip (item 7). Starting a resident fresh
// into a run that's guaranteed to end after one night (because tomorrow is already known to be
// night/eve-ineligible for THEM specifically) produces exactly the isolated-short-run pattern this
// file measures, and score()'s nightCluster term had no way to see that in advance — it only
// penalized a run that couldn't reach 2 nights via the resident's own remaining SHIFT-COUNT target,
// not via a known future eligibility strip. FIX: nightCluster's runBefore===0 branch now also
// treats "tomorrow is this resident's own jcPresentDates date, or the day before their own
// grLectureDates date" as the same -1.5 isolated-start discourage as the existing
// "(t - assigned[r.id]) < 2" case (both are resident-level STATIC data, safe to check directly —
// unlike the ACGME rolling-hours cap, which depends on other not-yet-made scheduling decisions and
// was confirmed, via the same instrumentation, to be the unrelated and NOT fixable-this-way cause
// behind several of this file's OTHER newly-fragmented residents: a hard edHoursCapped/
// totalHoursCapped candidatePool exclusion mid-run, not a lost score() tie-break).
//
// Tried and REJECTED alongside this (same instrumentation session): bumping nightCluster's
// runBefore>0 continuation bonus from 1 to 1.3 — re-confirmed the archive's own warning just above
// about nightCluster-adjacent changes perturbing the shared rng() draw sequence across all 20
// attempts: chiefBenchmark's isolated-run count got WORSE (28->31, errors 8->9) from that one
// change alone. Reverted; not committed.
//
// MEASURED RESULT of the jcPresentDates/grLectureDates look-ahead (generateScheduleBest, seed 42,
// 20 attempts + repair, same recipe as this file's own measurement): standard 13->10, understaffed
// 11->8 (target was <=7 — nearly fully recovered), vacationHeavy 12->11, conferenceBlock 11->13
// (a real regression on this ONE fixture/metric — a different best-of-20 attempt now wins there,
// via the same rng-cascade mechanism the archive warns about, and it happens to score worse on
// THIS specific sub-metric while still passing generator.baseline.conferenceBlock.test.js's own
// quality-vector gate unchanged/within tolerance — i.e. the actual betterQuality ladder this
// generator is scored on did not regress, only this one auxiliary measurement did). Net: 3 of 4
// variants improved, chiefBenchmark.test.js's isolated-run ceiling unaffected (that fixture's
// roster doesn't exercise this particular jcPresentDates/grLectureDates path the same way), 1
// variant regressed on this specific metric only. Ceilings below updated to the new exact measured
// values (deterministic under this fixed seed, same convention as chiefBenchmark.test.js).
// 2026-10-16, SECOND attempt (not shipped) — "nightPlanningPass" pre-pass. Rebuild of the task's
// documented FIRST attempt (which only laid runs to coverage MIN, see that attempt's own numbers
// below this note's sibling in git history / the task description), adding the one lever that
// attempt was missing: letting a run claim OPTIONAL night headroom (cov.max - cov.min) too, for
// under-target residents only, so the later day-by-day 'optional' fillDayPass pass can't scatter
// that headroom onto unrelated residents once the run's own starter is pushed to target by OTHER
// (day/eve) shifts elsewhere in the block.
//
// DESIGN: gated behind args.nightPlanning (default off, never shipped). Two passes, not one —
// the first naive version (headroom claimed in the SAME walk as the min fill, before every OTHER
// shift's own min phase had run) measurably violated "minimums across the whole block are
// satisfied before any optional slot can consume a resident's target headroom" (fillDayPass's own
// documented invariant) and was rejected after a quick A/B specifically for that reason. The
// SECOND, corrected version split it in two: nightPlanningMinPass (night runs, min-only, inserted
// BEFORE fillDayPass's two min phases) and nightHeadroomPass (claims cov.max headroom by
// extending a resident who already worked the immediately preceding date on the same shift one
// more night — never starts a fresh run — inserted AFTER both min phases, BEFORE the optional
// phase, so the min-first invariant holds). Neither version touched score()'s nightCluster terms.
//
// A/B measurement (generateScheduleBest, 5 seeds [1,2,42,7,99], attempts 1 AND 20, repair:true,
// corrected two-pass version, standard/understaffed/vacationHeavy/conferenceBlock +
// src/lib/__fixtures__/chiefBenchmark.json as the "real schedule shape" proxy — this session had
// no access to an actual non-committed real-block export, a prior session's own local-only
// scratchpad harness):
//   - twoSeg/singles: the thing this pass exists to fix, and it DID: standard twoSeg 10-14 -> 2-7,
//     singles 6-12 -> 2-9; understaffed/vacationHeavy/conferenceBlock similarly improved on most
//     seeds. The run-shaping half of the idea works.
//   - BUT betterQuality-ladder regressions on 2 of 4 synthetic variants: understaffed's
//     blockingWarnCount (rung 2 of the ladder) went from 0-1 to 4-6 on EVERY seed, both attempts=1
//     and attempts=20 — a real, consistent regression, not noise. standard/vacationHeavy's
//     coverageMiss (qualityVector slot 0, the HIGHEST-priority slot) also crept up a few points on
//     most seeds.
//   - WORSE, on chiefBenchmark (the closest available proxy for "real block"): errorCount — ALL of
//     it classified `rule: 'underTarget'` (the hard, export-blocking shift-count floor) —
//     ballooned from 3-9 (OFF, attempts=20, 5 seeds) to 13-16 (ON, same recipe). Isolated with a
//     debug harness (pre-repair, single seed 42): OFF errors=13 unfilled=2; ON errors=17
//     unfilled=36. All `underTarget`.
//   - ROOT CAUSE: nightPlanningMinPass walks night shift ids in fixed catalog order x date order,
//     not the MRV ("most constrained slot first") order fillDayPass's real min-phase uses — and
//     fillDayPass's own header already documents exactly why that ordering matters ("a shift that
//     started with 6 candidates can be down to 1 by the time a STATIC order reaches it"). On the
//     synthetic fixtures there's enough slack that this rarely bites. On chiefBenchmark's tighter,
//     realistically-sized roster, greedily filling night shifts in a fixed order spends a scarce
//     composition-qualifying candidate (or a resident who's one of very few left under target) on
//     an earlier-processed night shift/date, leaving a later, harder slot with nobody legal — and,
//     separately, nightHeadroomPass's "extend whoever already has an adjacent run" rule hands
//     scarce optional slots to residents by CONTIGUITY rather than by who most needs the shift
//     count — a real tradeoff once slots are scarce, since every shift's headroom is the same
//     zero-sum budget the chief's hard EM/BAMC under-target floor is measured against.
//   - Fixing the ordering defect would need night shifts folded into fillDayPass's own
//     MRV-across-all-shifts loop (not a separate pre-pass with its own fixed order) — a third,
//     larger redesign than either attempt so far. Not attempted this session; flagging for whoever
//     picks this up next so they don't re-derive the same two failed shapes first.
//   - DECISION: not shipped. Reverted in full (ResidentScheduler.jsx has no nightPlanning code —
//     check git history/PR for the exact diff if resuming this). This note is the only surviving
//     trace, committed per this task's own "didn't win" convention.
import { describe, it, expect } from 'vitest';
import { generateScheduleBest, NIGHT_RULES, isNightOnlyResident } from '../ResidentScheduler.jsx';
import { isNightShiftId } from './shifts.js';
import { getBlockDates } from './dates.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const SEED = 42;

// Current measured ceiling per variant (see header) — a regression guard, not an aspirational
// target: this file's job is to make sure a future change can't silently push these back up
// toward the pre-fix 100%-of-23/17/23/24 numbers, not to re-chase a perfect merge rate this
// fixture's own structural tightness (ACGME caps + narrow rotation windows + near-zero coverage
// slack once Phase 5 has run) makes largely unreachable.
const CEILINGS = {
  // 2026-10-16: 13 -> 10 (nightCluster jcPresentDates/grLectureDates look-ahead, see header).
  standard: { twoSegment: 10, mergeable: 10 },
  // 7 -> 11 (2026-10-16): rest and the 6-day streak now count clinical shifts only (no GR/JC
  // days), which spreads nights wider on this fixture.
  // 11 -> 8 (2026-10-16 follow-up, same day): nightCluster jcPresentDates/grLectureDates
  // look-ahead — see header. Target was <=7 (the pre-regression number); 8 is the measured floor
  // after this fix, the remaining 2-segment residents on this fixture all traced to the hard,
  // unrelated ACGME edHoursCapped/totalHoursCapped candidatePool exclusion mid-run (see header),
  // which a score()/ordering change cannot route around.
  understaffed: { twoSegment: 8, mergeable: 8 },
  // 2026-10-16: 13 -> 11 (same look-ahead fix).
  // 2026-10-18: 11 -> 13 (ranking follows Soft Rule Priority: postNightRest no longer counts in
  // blockingWarnCount, so best-of-N picks a different winner; trades hole count for night shape).
  vacationHeavy: { twoSegment: 13, mergeable: 13 },
  // 2026-10-16: 11 -> 13 — a REGRESSION on this one fixture/metric from the same look-ahead fix
  // (see header's "Tried and REJECTED" / "MEASURED RESULT" notes for why this trades off against
  // the other 3 variants' wins, and why generator.baseline.conferenceBlock.test.js's own
  // quality-vector gate still passes unchanged despite it).
  // 2026-10-18: 13 -> 15 (same ranking change as vacationHeavy above).
  conferenceBlock: { twoSegment: 15, mergeable: 15 },
};

// Index-space run detection, mirroring ResidentScheduler.jsx's own nightRunSegmentsIdx exactly
// (not imported — that helper is module-private, and re-deriving it here from the schedule object
// + dates array, rather than trusting any report field, is the same "measure off the schedule
// itself" discipline scheduleQuality.js's own header documents).
function nightRunSegmentsIdx(rs, dates) {
  const segs = [];
  let i = 0;
  while (i < dates.length) {
    if (!isNightShiftId(rs[dates[i]])) { i++; continue; }
    let j = i;
    while (j + 1 < dates.length && isNightShiftId(rs[dates[j + 1]])) j++;
    segs.push({ start: i, end: j, len: j - i + 1 });
    i = j + 1;
  }
  return segs;
}

// Measures one generated schedule: how many non-night-only residents have exactly 2 night-run
// segments, and of those, how many are MERGEABLE (combined length <= NIGHT_RULES.maxRun, i.e. one
// clean run was always structurally possible).
function measureNightContiguity(schedule, allResidents, eligOverrides, dates) {
  let twoSegmentCount = 0;
  let mergeableCount = 0;
  for (const r of allResidents) {
    if (isNightOnlyResident(r, eligOverrides)) continue;
    const segs = nightRunSegmentsIdx(schedule[r.id] || {}, dates);
    if (segs.length !== 2) continue;
    twoSegmentCount++;
    const totalLen = segs[0].len + segs[1].len;
    if (totalLen <= NIGHT_RULES.maxRun) mergeableCount++;
  }
  return { twoSegmentCount, mergeableCount, totalResidents: allResidents.length };
}

describe('night-stint contiguity measurement (chief preference, 2026-10-14)', () => {
  it.each(Object.keys(CEILINGS))('%s: mergeable 2-segment splits do not regress past the measured post-fix ceiling', (variant) => {
    const fixture = makeFixture(variant);
    const { schedule, report } = generateScheduleBest({ ...fixture }, { attempts: 20, baseSeed: SEED });
    const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);
    const { twoSegmentCount, mergeableCount, totalResidents } =
      measureNightContiguity(schedule, fixture.allResidents, fixture.eligOverrides, dates);

    // eslint-disable-next-line no-console
    console.log(
      `[nightContiguity] ${variant}: ${twoSegmentCount}/${totalResidents} residents with 2 night ` +
      `segments, ${mergeableCount} of those mergeable (seed ${SEED}, repair:true, ` +
      `replay.seed=${report.replay?.seed})`
    );

    const ceiling = CEILINGS[variant];
    expect(twoSegmentCount, `${variant}: 2-segment residents`).toBeLessThanOrEqual(ceiling.twoSegment);
    expect(mergeableCount, `${variant}: mergeable 2-segment splits`).toBeLessThanOrEqual(ceiling.mergeable);
  }, 30000);
});
