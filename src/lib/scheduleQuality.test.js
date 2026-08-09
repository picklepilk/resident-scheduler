// src/lib/scheduleQuality.test.js
// Pure unit tests for the quality scorer — no ResidentScheduler.jsx import, no DOM.
import { describe, it, expect } from 'vitest';
import { addDays, parseDate, toDateStr, getBlockDates } from './dates.js';
import { SHIFTS } from './shifts.js';
import { getCoverageFor } from './coverage.js';
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
