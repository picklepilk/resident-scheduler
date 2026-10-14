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
  standard: { twoSegment: 13, mergeable: 13 },
  understaffed: { twoSegment: 7, mergeable: 7 },
  vacationHeavy: { twoSegment: 13, mergeable: 13 },
  conferenceBlock: { twoSegment: 11, mergeable: 11 },
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
