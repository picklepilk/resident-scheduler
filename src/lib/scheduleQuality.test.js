// src/lib/scheduleQuality.test.js
// Pure unit tests for the quality scorer — no ResidentScheduler.jsx import, no DOM.
import { describe, it, expect } from 'vitest';
import { addDays, parseDate, toDateStr, getBlockDates } from './dates.js';
import { SHIFTS } from './shifts.js';
import { getCoverageFor, twelveHourStateFor } from './coverage.js';
import {
  computeQualityMetrics,
  computeQualityVector,
  compareVectors,
  betterQuality,
} from './scheduleQuality.js';

const NIGHT_RULES = { minRun: 4, idealRun: 6, maxRun: 6, postNightDayRestH: 24, maxPerBlock: 6 };

function mkDates(start, count) {
  return getBlockDates(start, toDateStr(addDays(parseDate(start), count - 1)));
}

function makeMetrics(overrides) {
  return {
    coverageMiss: 0,
    seniorGaps: 0,
    restCompromises: 0,
    underTargetTotal: 0,
    deficitSpread: 0,
    nightSpread: 0,
    weekendSpread: 0,
    nightShapePenalty: 0,
    ...overrides,
  };
}

function wrap(qualityVector, errorCount = 0, blockingWarnCount = 0) {
  return { errorCount, blockingWarnCount, qualityVector };
}

describe('computeQualityVector / betterQuality — rule priority ordering', () => {
  it('reordering rulePriority flips which of two metrics-sets wins', () => {
    const mA = makeMetrics({ coverageMiss: 0, seniorGaps: 5 });
    const mB = makeMetrics({ coverageMiss: 5, seniorGaps: 0 });

    const coverageFirst = ['coverageMin', 'seniorComposition', 'postNightRest'];
    const seniorFirst = ['seniorComposition', 'coverageMin', 'postNightRest'];

    // Under coverageMin-first priority, A (coverageMiss 0) beats B (coverageMiss 5).
    expect(betterQuality(
      wrap(computeQualityVector(mA, coverageFirst)),
      wrap(computeQualityVector(mB, coverageFirst)),
    )).toBe(true);
    expect(betterQuality(
      wrap(computeQualityVector(mB, coverageFirst)),
      wrap(computeQualityVector(mA, coverageFirst)),
    )).toBe(false);

    // Flip the priority order: now B (seniorGaps 0) beats A (seniorGaps 5) — same two metrics
    // objects, opposite winner, purely from reordering rulePriority.
    expect(betterQuality(
      wrap(computeQualityVector(mB, seniorFirst)),
      wrap(computeQualityVector(mA, seniorFirst)),
    )).toBe(true);
    expect(betterQuality(
      wrap(computeQualityVector(mA, seniorFirst)),
      wrap(computeQualityVector(mB, seniorFirst)),
    )).toBe(false);
  });

  it('regression: a huge low-priority-tier count never outranks a 1-count difference in a higher tier', () => {
    // This is the exact bug the lexicographic tuple design fixes vs a scalar-weighted score: a
    // scalar sum (coverageMiss*W1 + seniorGaps*W2) could let 5000 seniorGaps outweigh a mere +1
    // coverageMiss unless W2 is tuned vanishingly small relative to W1. The tuple never does
    // this — index 0 (the higher-priority tier) alone decides when it differs.
    const priority = ['coverageMin', 'seniorComposition', 'postNightRest'];
    const higherTierBad = makeMetrics({ coverageMiss: 1, seniorGaps: 0 });
    const lowerTierHuge = makeMetrics({ coverageMiss: 0, seniorGaps: 5000 });

    const vecHigherBad = computeQualityVector(higherTierBad, priority);
    const vecLowerHuge = computeQualityVector(lowerTierHuge, priority);

    expect(compareVectors(vecLowerHuge, vecHigherBad)).toBeLessThan(0);
    expect(betterQuality(wrap(vecLowerHuge), wrap(vecHigherBad))).toBe(true);
    expect(betterQuality(wrap(vecHigherBad), wrap(vecLowerHuge))).toBe(false);
  });

  it('betterQuality treats equal-on-all-three as NOT better (strict improvement only)', () => {
    const m = makeMetrics({ coverageMiss: 3, seniorGaps: 1, restCompromises: 2 });
    const priority = ['coverageMin', 'seniorComposition', 'postNightRest'];
    const vec = computeQualityVector(m, priority);
    expect(betterQuality(wrap(vec), wrap([...vec]))).toBe(false);
  });
});

describe('computeQualityMetrics — night-run shape', () => {
  const residents = [{ id: 'r1', category: 'EM_HOME', pgy: 1 }];
  const nightOnlyIds = new Set();
  const baseInput = {
    coverage: {},
    residents,
    targets: { r1: null },
    nightOnlyIds,
    nightRules: NIGHT_RULES,
    weekendPairs: [],
    seniorGapCount: 0,
    restCompromiseCount: 0,
  };

  it('fragmented 1-night runs score a higher penalty than one clustered run, even with fewer total nights', () => {
    const dates = mkDates('2026-01-01', 9); // indices 0..8

    // Three separate interior 1-night runs (idx 2, 4, 6) — 3 total nights.
    const fragmentedSchedule = {
      r1: { [dates[2]]: 'POD-N', [dates[4]]: 'POD-N', [dates[6]]: 'POD-N' },
    };
    // One interior 5-night run (idx 2..6) — 5 total nights, close to idealRun(6).
    const clusteredSchedule = {
      r1: Object.fromEntries([2, 3, 4, 5, 6].map(i => [dates[i], 'POD-N'])),
    };

    const fragmented = computeQualityMetrics({ ...baseInput, schedule: fragmentedSchedule, dates });
    const clustered = computeQualityMetrics({ ...baseInput, schedule: clusteredSchedule, dates });

    expect(fragmented.nightShapePenalty).toBeGreaterThan(clustered.nightShapePenalty);
    // Sanity-check the exact numbers per the documented formula:
    // fragmented: 3 runs × (+3 for len1) + 2 fragmentation bonuses (beyond-first) × +2 = 9 + 4 = 13
    expect(fragmented.nightShapePenalty).toBeCloseTo(13, 5);
    // clustered: single len-5 run in [minRun,maxRun] -> 0.25*(6-5) = 0.25
    expect(clustered.nightShapePenalty).toBeCloseTo(0.25, 5);
  });

  it('a night run touching the block start or end is exempt, even at length 1', () => {
    const dates = mkDates('2026-01-01', 5); // indices 0..4

    const touchesStart = { r1: { [dates[0]]: 'POD-N' } };
    const touchesEnd = { r1: { [dates[4]]: 'POD-N' } };
    const touchesBoth = { r1: { [dates[0]]: 'POD-N', [dates[4]]: 'POD-N' } };

    for (const schedule of [touchesStart, touchesEnd, touchesBoth]) {
      const metrics = computeQualityMetrics({ ...baseInput, schedule, dates });
      expect(metrics.nightShapePenalty).toBe(0);
    }

    // Contrast: the same single night shifted one day inward (interior) IS penalized.
    const interiorSingle = { r1: { [dates[1]]: 'POD-N' } };
    const interiorMetrics = computeQualityMetrics({ ...baseInput, schedule: interiorSingle, dates });
    expect(interiorMetrics.nightShapePenalty).toBeGreaterThan(0);
  });
});

describe('computeQualityMetrics — fairness spreads', () => {
  it('deficitSpread uses normalized assigned/target ratios: different targets, equal ratio -> 0 spread', () => {
    const dates = mkDates('2026-01-01', 20);
    const residents = [
      { id: 'r1', category: 'EM_HOME', pgy: 1 },
      { id: 'r2', category: 'EM_HOME', pgy: 1 },
    ];
    // r1: target 10, assigned 5 of the first 20 dates -> ratio 0.5
    // r2: target 20, assigned 10 of the first 20 dates -> ratio 0.5 (same ratio, different raw counts)
    const schedule = {
      r1: Object.fromEntries(dates.slice(0, 5).map(ds => [ds, 'MT-D'])),
      r2: Object.fromEntries(dates.slice(0, 10).map(ds => [ds, 'MT-D'])),
    };
    const metrics = computeQualityMetrics({
      schedule,
      coverage: {},
      dates,
      residents,
      targets: { r1: 10, r2: 20 },
      nightOnlyIds: new Set(),
      nightRules: NIGHT_RULES,
      weekendPairs: [],
      seniorGapCount: 0,
      restCompromiseCount: 0,
    });
    expect(metrics.deficitSpread).toBeCloseTo(0, 10);
    // Raw-count unfairness would NOT be 0 (5 vs 10) — confirms normalization is actually applied.
    expect(metrics.underTargetTotal).toBe((10 - 5) + (20 - 10));
  });
});

describe('computeQualityMetrics — coverageMiss', () => {
  it('computes coverage shortfall correctly from a small hand-built schedule+coverage+dates fixture', () => {
    const dates = ['2026-01-05', '2026-01-06'];
    // Zero out every shift's min/max except TRAUMA-D (min 1) and MT-D (min 2), so only those
    // two shift/date combinations can contribute a nonzero miss.
    const coverage = Object.fromEntries(SHIFTS.map(s => [s.id, { min: 0, max: 0 }]));
    coverage['TRAUMA-D'] = { min: 1, max: 1 };
    coverage['MT-D'] = { min: 2, max: 2 };

    // Sanity-check the fixture reads back through getCoverageFor as intended before asserting.
    expect(getCoverageFor('TRAUMA-D', coverage, parseDate(dates[0]).getDay()).min).toBe(1);
    expect(getCoverageFor('MT-D', coverage, parseDate(dates[0]).getDay()).min).toBe(2);
    expect(getCoverageFor('POD-D', coverage, parseDate(dates[0]).getDay()).min).toBe(0);

    const schedule = {
      rA: { [dates[0]]: 'TRAUMA-D', [dates[1]]: 'MT-D' },
      rB: { [dates[0]]: 'MT-D', [dates[1]]: 'MT-D' },
    };
    // Day 1 (dates[0]): TRAUMA-D filled=1 (meets min 1 -> 0 miss); MT-D filled=1 (min 2 -> miss 1).
    // Day 2 (dates[1]): TRAUMA-D filled=0 (min 1 -> miss 1); MT-D filled=2 (meets min 2 -> 0 miss).
    // Total expected coverageMiss = 1 + 1 = 2.
    const residents = [
      { id: 'rA', category: 'EM_HOME', pgy: 1 },
      { id: 'rB', category: 'EM_HOME', pgy: 1 },
    ];
    const metrics = computeQualityMetrics({
      schedule,
      coverage,
      dates,
      residents,
      targets: { rA: null, rB: null },
      nightOnlyIds: new Set(),
      nightRules: NIGHT_RULES,
      weekendPairs: [],
      seniorGapCount: 0,
      restCompromiseCount: 0,
    });
    expect(metrics.coverageMiss).toBe(2);
  });
});

describe('computeQualityMetrics — coverageMiss and 12h windows (ayConf)', () => {
  // Both tests zero out every catalog shift explicitly, then poke individual entries, so the
  // only possible source of a nonzero coverageMiss is the shift(s) under test — no reliance on
  // DEFAULT_COVERAGE_MINMAX's other baseline numbers.
  function zeroedCoverage() {
    return Object.fromEntries(SHIFTS.map(s => [s.id, { min: 0, max: 0 }]));
  }
  const dates = ['2026-01-05'];
  const dow = parseDate(dates[0]).getDay();
  const baseInput = {
    schedule: {},
    dates,
    residents: [],
    targets: {},
    nightOnlyIds: new Set(),
    nightRules: NIGHT_RULES,
    weekendPairs: [],
    seniorGapCount: 0,
    restCompromiseCount: 0,
  };

  it('with ayConf: {} (no windows active), a 12h id contributes ZERO to coverageMiss even when explicitly given a nonzero min', () => {
    const coverage = zeroedCoverage();
    // Explicit chief-set POD-D12 minimum — with no active 12h window this must be ignored (hard
    // zero), not read as a phantom unfilled minimum. This is exactly the bug being fixed: the old
    // 3-arg getCoverageFor(shiftId, coverage, dow) call had no way to see "no window is active"
    // and would have returned this {min:2,max:4} verbatim.
    coverage['POD-D12'] = { min: 2, max: 4 };

    // Sanity: getCoverageFor itself confirms POD-D12 hard-zeroes with a resolved-but-empty state.
    const state = twelveHourStateFor(dates[0], {});
    expect(getCoverageFor('POD-D12', coverage, dow, state)).toEqual({ min: 0, max: 0 });

    const metrics = computeQualityMetrics({ ...baseInput, coverage, ayConf: {} });
    expect(metrics.coverageMiss).toBe(0);
  });

  it('inside an ACEP window, the 12h id DOES contribute while its suppressed 9h sibling does not', () => {
    const coverage = zeroedCoverage();
    coverage['POD-D12'] = { min: 2, max: 4 }; // active (POD is in the ACEP window's areas)
    coverage['POD-D'] = { min: 1, max: 1 };   // suppressed by the same window — must not count

    const ayConf = { acepStart: dates[0], acepEnd: dates[0] };

    // Sanity via getCoverageFor directly: POD-D12 active, POD-D hard-suppressed.
    const state = twelveHourStateFor(dates[0], ayConf);
    expect(getCoverageFor('POD-D12', coverage, dow, state)).toEqual({ min: 2, max: 4 });
    expect(getCoverageFor('POD-D', coverage, dow, state)).toEqual({ min: 0, max: 0 });

    const metrics = computeQualityMetrics({ ...baseInput, coverage, ayConf });
    // Empty schedule: only POD-D12's min (2) is unmet; POD-D contributes 0 despite its own min.
    expect(metrics.coverageMiss).toBe(2);
  });
});

describe('computeQualityMetrics — work shape (Phase 1)', () => {
  const nightOnlyIds = new Set();
  const baseInput = {
    coverage: {},
    nightOnlyIds,
    nightRules: NIGHT_RULES,
    weekendPairs: [],
    seniorGapCount: 0,
    restCompromiseCount: 0,
    maxConsecutiveWorkDays: 6,
  };
  const r1 = { id: 'r1', category: 'EM_HOME', pgy: 1, vacationDates: [], approvedDatesOff: [] };
  const residents = [r1];
  const targets = { r1: null };

  it('scattered single shifts score worse than the same shifts in one contiguous run', () => {
    const dates = mkDates('2026-01-05', 12);
    // Three isolated interior singles (idx 2, 5, 8), all POD-D so area churn is not a factor.
    const scattered = { r1: Object.fromEntries([2, 5, 8].map(i => [dates[i], 'POD-D'])) };
    // The same three shifts contiguous (idx 2..4).
    const contiguous = { r1: Object.fromEntries([2, 3, 4].map(i => [dates[i], 'POD-D'])) };

    const a = computeQualityMetrics({ ...baseInput, residents, targets, schedule: scattered, dates });
    const b = computeQualityMetrics({ ...baseInput, residents, targets, schedule: contiguous, dates });

    expect(a.workShapePenalty).toBeGreaterThan(b.workShapePenalty);
    // scattered: 3 interior len-1 runs x3 = 9, plus excess fragmentation: worked=3 -> minRuns=1,
    // runs=3 -> 2 excess x2 = 4. No area churn (all POD-D, and churn is only counted within a run).
    expect(a.workShapePenalty).toBeCloseTo(13, 5);
    // contiguous: one len-3 run -> no single/pair penalty; worked=3 -> minRuns=1, runs=1 -> 0 excess.
    expect(b.workShapePenalty).toBeCloseTo(0, 5);
  });

  it('does NOT penalize the extra runs the consecutive-work-day cap makes unavoidable', () => {
    // 12 worked days with maxConsecutiveWorkDays=6 REQUIRES at least 2 runs. Two clean 6-day runs
    // must therefore score zero fragmentation — this is the case where mirroring the night-run
    // rule ("every run beyond the first is a penalty") would have been actively wrong.
    const dates = mkDates('2026-01-05', 16);
    const idx = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13];
    const schedule = { r1: Object.fromEntries(idx.map(i => [dates[i], 'POD-D'])) };
    const m = computeQualityMetrics({ ...baseInput, residents, targets, schedule, dates });
    expect(m.workShapePenalty).toBeCloseTo(0, 5);
  });

  it('penalizes area churn within a run but not across a day off', () => {
    const dates = mkDates('2026-01-05', 10);
    // Contiguous 3-day run churning POD -> PED -> POD = 2 churn points.
    const churn = {
      r1: { [dates[2]]: 'POD-D', [dates[3]]: 'PED-D', [dates[4]]: 'POD-D' },
    };
    // Same three areas but separated by days off — no churn counted, though the singles are.
    const separated = {
      r1: { [dates[2]]: 'POD-D', [dates[5]]: 'PED-D', [dates[8]]: 'POD-D' },
    };
    const a = computeQualityMetrics({ ...baseInput, residents, targets, schedule: churn, dates });
    const b = computeQualityMetrics({ ...baseInput, residents, targets, schedule: separated, dates });

    // churn: one len-3 run (no single/pair penalty, 0 excess runs) + 2 area transitions = 2.
    expect(a.workShapePenalty).toBeCloseTo(2, 5);
    // separated: 3 interior singles (9) + 2 excess runs (4) = 13, and zero churn.
    expect(b.workShapePenalty).toBeCloseTo(13, 5);
  });

  it('a worked run touching the block start or end is exempt from the shape penalties', () => {
    const dates = mkDates('2026-01-05', 8);
    // Single shift on the very first date — would be a +3 isolated single if interior.
    const edge = { r1: { [dates[0]]: 'POD-D' } };
    const interior = { r1: { [dates[3]]: 'POD-D' } };

    const a = computeQualityMetrics({ ...baseInput, residents, targets, schedule: edge, dates });
    const b = computeQualityMetrics({ ...baseInput, residents, targets, schedule: interior, dates });

    // Edge run is exempt from the single/pair penalty. worked=1 -> minRuns=1, runs=1 -> no excess.
    expect(a.workShapePenalty).toBeCloseTo(0, 5);
    expect(b.workShapePenalty).toBeCloseTo(3, 5);
  });

  it('penalizes a shift butted against vacation, symmetrically on both sides', () => {
    const dates = mkDates('2026-01-05', 10);
    const vacationDay = dates[5];
    const withVac = [{ ...r1, vacationDates: [vacationDay] }];

    // dates[4] is immediately BEFORE the vacation day; dates[6] immediately after.
    const before = { r1: { [dates[3]]: 'POD-D', [dates[4]]: 'POD-D' } };
    const after = { r1: { [dates[6]]: 'POD-D', [dates[7]]: 'POD-D' } };
    const away = { r1: { [dates[1]]: 'POD-D', [dates[2]]: 'POD-D' } };

    const mBefore = computeQualityMetrics({ ...baseInput, residents: withVac, targets, schedule: before, dates });
    const mAfter = computeQualityMetrics({ ...baseInput, residents: withVac, targets, schedule: after, dates });
    const mAway = computeQualityMetrics({ ...baseInput, residents: withVac, targets, schedule: away, dates });

    expect(mBefore.workShapePenalty).toBeGreaterThan(mAway.workShapePenalty);
    // Symmetric: touching either side of the vacation costs the same.
    expect(mBefore.workShapePenalty).toBeCloseTo(mAfter.workShapePenalty, 5);
  });

  it('approvedDatesOff counts the same as vacationDates for adjacency', () => {
    const dates = mkDates('2026-01-05', 10);
    const offDay = dates[5];
    const viaVacation = [{ ...r1, vacationDates: [offDay] }];
    const viaApproved = [{ ...r1, approvedDatesOff: [offDay] }];
    const schedule = { r1: { [dates[3]]: 'POD-D', [dates[4]]: 'POD-D' } };

    const a = computeQualityMetrics({ ...baseInput, residents: viaVacation, targets, schedule, dates });
    const b = computeQualityMetrics({ ...baseInput, residents: viaApproved, targets, schedule, dates });
    expect(a.workShapePenalty).toBeCloseTo(b.workShapePenalty, 5);
  });
});

describe('computeQualityMetrics — AY-to-date carryover (Phase 2)', () => {
  const dates = mkDates('2026-01-05', 14);
  const mk = (id) => ({ id, category: 'EM_HOME', pgy: 2, vacationDates: [], approvedDatesOff: [] });
  const residents = [mk('a'), mk('b')];
  const targets = { a: 10, b: 10 };
  const base = {
    coverage: {},
    residents,
    targets,
    nightOnlyIds: new Set(),
    nightRules: NIGHT_RULES,
    weekendPairs: [],
    seniorGapCount: 0,
    restCompromiseCount: 0,
    dates,
  };
  // Identical current block for both residents: 2 nights each, so block-only night spread is 0.
  const schedule = {
    a: { [dates[2]]: 'POD-N', [dates[3]]: 'POD-N' },
    b: { [dates[2]]: 'MT-N', [dates[3]]: 'MT-N' },
  };

  it('is a STRICT no-op when there is no published history', () => {
    const withoutArg = computeQualityMetrics({ ...base, schedule });
    const withEmpty = computeQualityMetrics({ ...base, schedule, ayPriorTotals: {} });

    expect(withEmpty.ayCarryoverConfidence).toBe(0);
    for (const k of ['deficitSpread', 'nightSpread', 'weekendSpread']) {
      expect(withEmpty[k]).toBe(withoutArg[k]);
      // ...and the blended value equals the block-only value it was derived from.
      const blockKey = `block${k[0].toUpperCase()}${k.slice(1)}`;
      expect(withEmpty[k]).toBe(withEmpty[blockKey]);
    }
  });

  it('surfaces year-to-date night imbalance that the block alone cannot see', () => {
    // Both residents worked exactly 2 nights THIS block, so block-only nightSpread is 0 — the
    // block is, on its own evidence, perfectly fair. Across the AY it is not: `a` has been carrying
    // the nights. The carryover is what makes that visible.
    const ayPriorTotals = {
      a: { nights: 18, weekendDates: 8, assigned: 30, blocks: 3 },
      b: { nights: 2, weekendDates: 8, assigned: 30, blocks: 3 },
    };
    const blockOnly = computeQualityMetrics({ ...base, schedule });
    const withAy = computeQualityMetrics({ ...base, schedule, ayPriorTotals, ayCarryoverFullAt: 3 });

    expect(blockOnly.nightSpread).toBeCloseTo(0, 5);
    expect(withAy.ayCarryoverConfidence).toBeCloseTo(1, 5);
    expect(withAy.nightSpread).toBeGreaterThan(blockOnly.nightSpread);
    // The block-only figure is still reported untouched alongside the blended one.
    expect(withAy.blockNightSpread).toBeCloseTo(0, 5);
  });

  it('EXCLUDES a resident with no history rather than treating them as zero', () => {
    // The trap: `b` is new to the roster. Scoring them as 0 prior nights would make them look
    // maximally under-worked next to `a`, and the generator would load them up. Excluding them
    // leaves fewer than 2 residents with history, so confidence falls to 0 and nothing is blended.
    const onlyA = { a: { nights: 18, weekendDates: 8, assigned: 30, blocks: 3 } };
    const m = computeQualityMetrics({ ...base, schedule, ayPriorTotals: onlyA, ayCarryoverFullAt: 3 });

    expect(m.ayCarryoverConfidence).toBe(0);
    expect(m.nightSpread).toBe(m.blockNightSpread);
  });

  it('tapers with thin history instead of trusting one block fully', () => {
    const thin = {
      a: { nights: 6, weekendDates: 4, assigned: 10, blocks: 1 },
      b: { nights: 0, weekendDates: 4, assigned: 10, blocks: 1 },
    };
    const thick = {
      a: { nights: 18, weekendDates: 12, assigned: 30, blocks: 3 },
      b: { nights: 0, weekendDates: 12, assigned: 30, blocks: 3 },
    };
    const mThin = computeQualityMetrics({ ...base, schedule, ayPriorTotals: thin, ayCarryoverFullAt: 3 });
    const mThick = computeQualityMetrics({ ...base, schedule, ayPriorTotals: thick, ayCarryoverFullAt: 3 });

    // One block of history => 1/3 weight; three blocks => full weight.
    expect(mThin.ayCarryoverConfidence).toBeCloseTo(1 / 3, 5);
    expect(mThick.ayCarryoverConfidence).toBeCloseTo(1, 5);
    // Same direction of imbalance, but the thin-history read is pulled back toward block-only.
    expect(mThin.nightSpread).toBeGreaterThan(mThin.blockNightSpread);
    expect(mThin.nightSpread).toBeLessThan(mThick.nightSpread);
  });
});
