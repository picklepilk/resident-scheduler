// src/lib/scheduleQuality.test.js
// Pure unit tests for the quality scorer — no ResidentScheduler.jsx import, no DOM.
import { describe, it, expect } from 'vitest';
import { addDays, parseDate, toDateStr, getBlockDates } from './dates.js';
import { SHIFTS, SHIFT_DOW } from './shifts.js';
import { getCoverageFor, twelveHourStateFor } from './coverage.js';
import {
  computeQualityMetrics,
  computeQualityVector,
  compareVectors,
  betterQuality,
  traumaRunPenaltyFor,
  secondRestDayPenaltyFor,
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
    holidaySpread: 0,
    nightShapePenalty: 0,
    // Was missing, which made computeQualityVector's `0.5 * metrics.workShapePenalty` term NaN for
    // every hand-built metrics object in this file. The existing assertions never noticed because
    // they all resolve at tuple index 0-2, before slot 3 is ever compared; any test that reads slot
    // 3 directly (see the holidaySpread weighting block) needs it finite.
    workShapePenalty: 0,
    traumaRunPenalty: 0,
    secondRestDayPenalty: 0,
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
    // fragmented: 3 runs × (+(minRun-1) for len1, minRun=4 here) + 2 fragmentation bonuses
    // (beyond-first) × +2 = 9 + 4 = 13
    expect(fragmented.nightShapePenalty).toBeCloseTo(13, 5);
    // clustered: single len-5 run — inside the relaxed 2-6 no-shortness-penalty band (see the
    // dedicated relaxation test below) -> 0.
    expect(clustered.nightShapePenalty).toBeCloseTo(0, 5);
  });

  it('night-run SHAPE relaxation: runs of 2-6 score zero shortness penalty; only an isolated single night is still penalized', () => {
    // Chief-directed relaxation (mirrors ResidentScheduler.jsx's score() nightCluster relaxation):
    // his own real hand-built schedules run mostly 1-3 nights (61% of real runs), not the
    // aspirational 5-6 NIGHT_RULES ideal. This is the regression guard for that change — it used
    // to be that every length below minRun(5) scored (minRun-len), so a length-4 run scored 1 and
    // a length-2 run scored 3. Now only length-1 (a genuinely isolated night) is penalized at all.
    const rules = { minRun: 5, idealRun: 6, maxRun: 6, postNightDayRestH: 24, maxPerBlock: 6 };
    const dates = mkDates('2026-01-01', 12); // indices 0..11, well clear of the block edges

    const runOf = (startIdx, len) => ({
      r1: Object.fromEntries(Array.from({ length: len }, (_, k) => startIdx + k).map(i => [dates[i], 'POD-N'])),
    });

    const penaltyForLen = len =>
      computeQualityMetrics({ ...baseInput, nightRules: rules, schedule: runOf(2, len), dates }).nightShapePenalty;

    // Isolated single night (len 1) — still penalized, same minRun-1 magnitude as before.
    expect(penaltyForLen(1)).toBeCloseTo(rules.minRun - 1, 5);
    // Runs of length 2 through 6 (the maxRun cap) — NO shortness penalty at all under the
    // relaxation, including the two lengths (2, 4) that used to be penalized (3 and 1 respectively).
    for (let len = 2; len <= 6; len++) {
      expect(penaltyForLen(len), `length-${len} run should score 0`).toBeCloseTo(0, 5);
    }
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

describe('traumaRunPenaltyFor — pure helper', () => {
  // dates only need enough entries to index into; the helper reads rs[dates[i]] for i in
  // [run.start, run.end].
  const dates = mkDates('2026-01-01', 6); // indices 0..5

  it('a pure-trauma run of length 2 is not "mid-run" (no interior position) but still counts the 2nd trauma night', () => {
    const rs = { [dates[0]]: 'TRAUMA-N', [dates[1]]: 'TRAUMA-N' };
    const run = { start: 0, end: 1, len: 2 };
    // traumaCount=2, midRunCount=0 (idx 0 and 1 are both an end of a 2-long run) -> 0 + max(0,2-1) = 1
    expect(traumaRunPenaltyFor(rs, run, dates)).toBe(1);
  });

  it('a TRAUMA-N sitting strictly mid-run of a mixed 3-night run is penalized', () => {
    const rs = { [dates[0]]: 'POD-N', [dates[1]]: 'TRAUMA-N', [dates[2]]: 'POD-N' };
    const run = { start: 0, end: 2, len: 3 };
    // traumaCount=1, midRunCount=1 (idx 1 is strictly interior) -> 1 + max(0,1-1) = 1
    expect(traumaRunPenaltyFor(rs, run, dates)).toBe(1);
  });

  it('a TRAUMA-N at the START or END of a mixed run is free (not mid-run)', () => {
    const startRs = { [dates[0]]: 'TRAUMA-N', [dates[1]]: 'POD-N', [dates[2]]: 'POD-N' };
    const endRs = { [dates[0]]: 'POD-N', [dates[1]]: 'POD-N', [dates[2]]: 'TRAUMA-N' };
    const run = { start: 0, end: 2, len: 3 };
    expect(traumaRunPenaltyFor(startRs, run, dates)).toBe(0);
    expect(traumaRunPenaltyFor(endRs, run, dates)).toBe(0);
  });

  it('a 1-night run is always free, trauma or not', () => {
    const rs = { [dates[0]]: 'TRAUMA-N' };
    const run = { start: 0, end: 0, len: 1 };
    expect(traumaRunPenaltyFor(rs, run, dates)).toBe(0);
  });

  it('a run with no trauma nights at all scores 0', () => {
    const rs = { [dates[0]]: 'POD-N', [dates[1]]: 'MT-N', [dates[2]]: 'FLEX-N' };
    const run = { start: 0, end: 2, len: 3 };
    expect(traumaRunPenaltyFor(rs, run, dates)).toBe(0);
  });
});

describe('secondRestDayPenaltyFor — pure helper', () => {
  const dates = mkDates('2026-01-01', 8); // indices 0..7

  it('a run of >=3 followed by exactly 1 rest day then a worked day is penalized', () => {
    // Run ends at idx 2 (len 3, idx 0..2); idx 3 empty (1st rest day); idx 4 worked (breaks the
    // would-be 2nd rest day).
    const rs = { [dates[0]]: 'POD-N', [dates[1]]: 'POD-N', [dates[2]]: 'POD-N', [dates[4]]: 'POD-D' };
    const run = { start: 0, end: 2, len: 3 };
    expect(secondRestDayPenaltyFor(rs, run, dates, dates.length - 1)).toBe(1);
  });

  it('a run of >=3 followed by 2 genuine rest days is not penalized', () => {
    const rs = { [dates[0]]: 'POD-N', [dates[1]]: 'POD-N', [dates[2]]: 'POD-N' };
    const run = { start: 0, end: 2, len: 3 };
    expect(secondRestDayPenaltyFor(rs, run, dates, dates.length - 1)).toBe(0);
  });

  it('a run shorter than 3 is never penalized, even with the same 1-rest-day-then-work shape', () => {
    const rs = { [dates[0]]: 'POD-N', [dates[1]]: 'POD-N', [dates[3]]: 'POD-D' };
    const run = { start: 0, end: 1, len: 2 };
    expect(secondRestDayPenaltyFor(rs, run, dates, dates.length - 1)).toBe(0);
  });

  it('block-edge exempt: a run whose 2nd following date falls outside the block is not penalized', () => {
    // dates.length is 8 (idx 0..7); a run ending at idx 6 has its "2nd day after" at idx 8, out
    // of range — nothing to observe, so this must not count as a violation.
    const rs = { [dates[4]]: 'POD-N', [dates[5]]: 'POD-N', [dates[6]]: 'POD-N' };
    const run = { start: 4, end: 6, len: 3 };
    expect(secondRestDayPenaltyFor(rs, run, dates, dates.length - 1)).toBe(0);
  });

  it('day 1 also worked is a different shape (not "exactly 1 rest day") and is not penalized', () => {
    const rs = { [dates[0]]: 'POD-N', [dates[1]]: 'POD-N', [dates[2]]: 'POD-N', [dates[3]]: 'POD-D', [dates[4]]: 'POD-D' };
    const run = { start: 0, end: 2, len: 3 };
    expect(secondRestDayPenaltyFor(rs, run, dates, dates.length - 1)).toBe(0);
  });
});

describe('computeQualityMetrics — trauma-run / second-rest-day integration', () => {
  const residents = [{ id: 'r1', category: 'EM_HOME', pgy: 2 }];
  const baseInput = {
    coverage: {},
    residents,
    targets: { r1: null },
    nightOnlyIds: new Set(),
    nightRules: NIGHT_RULES,
    weekendPairs: [],
    seniorGapCount: 0,
    restCompromiseCount: 0,
  };

  it('a mid-run TRAUMA-N placement surfaces as a nonzero traumaRunPenalty', () => {
    const dates = mkDates('2026-01-01', 9);
    const schedule = { r1: { [dates[2]]: 'POD-N', [dates[3]]: 'TRAUMA-N', [dates[4]]: 'POD-N' } };
    const metrics = computeQualityMetrics({ ...baseInput, schedule, dates });
    expect(metrics.traumaRunPenalty).toBeGreaterThan(0);
  });

  it('a clean 1-trauma-night run (at a run end) scores zero traumaRunPenalty', () => {
    const dates = mkDates('2026-01-01', 9);
    const schedule = { r1: { [dates[2]]: 'TRAUMA-N', [dates[3]]: 'POD-N', [dates[4]]: 'POD-N' } };
    const metrics = computeQualityMetrics({ ...baseInput, schedule, dates });
    expect(metrics.traumaRunPenalty).toBe(0);
  });

  it('breaking the 2nd rest day after a >=3-night run surfaces as a nonzero secondRestDayPenalty', () => {
    const dates = mkDates('2026-01-01', 10);
    const schedule = { r1: {
      [dates[2]]: 'POD-N', [dates[3]]: 'POD-N', [dates[4]]: 'POD-N',
      [dates[6]]: 'POD-D',
    } };
    const metrics = computeQualityMetrics({ ...baseInput, schedule, dates });
    expect(metrics.secondRestDayPenalty).toBeGreaterThan(0);
  });

  it('traumaRunPenalty and secondRestDayPenalty both fold into the EXISTING last vector slot, not a new one', () => {
    const priority = ['coverageMin', 'seniorComposition', 'postNightRest'];
    const withPenalty = makeMetrics({ traumaRunPenalty: 3, secondRestDayPenalty: 2 });
    const withoutPenalty = makeMetrics({});
    const vecWith = computeQualityVector(withPenalty, priority);
    const vecWithout = computeQualityVector(withoutPenalty, priority);
    expect(vecWith).toHaveLength(4);
    // 2 * traumaRunPenalty(3) + 1 * secondRestDayPenalty(2) = 6 + 2 = 8
    expect(vecWith[3] - vecWithout[3]).toBeCloseTo(8, 10);
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

  it('a shift with min>=1 that does not exist on this weekday (SHIFT_DOW) charges zero coverage miss — same guard as the other five SHIFT_DOW consumers (coverageComposition.js, generator.harness.test.js, etc.)', () => {
    // 2026-01-05 is a Monday (getDay() === 1). SHIFT_DOW['TRAUMA-D'] is [0,2,4,6]
    // (Sun/Tue/Thu/Sat) — TRAUMA-D simply doesn't exist on Mondays. Empty schedule (nothing
    // filled anywhere) isolates the assertion to "does this date/shift combo get skipped
    // entirely", not "is filled >= min".
    const dates = ['2026-01-05'];
    expect(parseDate(dates[0]).getDay()).toBe(1);
    expect(SHIFT_DOW['TRAUMA-D']).not.toContain(1);

    const coverage = Object.fromEntries(SHIFTS.map(s => [s.id, { min: 0, max: 0 }]));
    coverage['TRAUMA-D'] = { min: 1, max: 1 };

    const metrics = computeQualityMetrics({
      schedule: {},
      coverage,
      dates,
      residents: [],
      targets: {},
      nightOnlyIds: new Set(),
      nightRules: NIGHT_RULES,
      weekendPairs: [],
      seniorGapCount: 0,
      restCompromiseCount: 0,
    });
    // Before the fix: TRAUMA-D's min of 1 would count as a phantom miss on every non-existent
    // weekday (3x/week) even though the generator never had a slot to fill. After the fix: 0.
    expect(metrics.coverageMiss).toBe(0);
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
    for (const k of ['deficitSpread', 'nightSpread', 'weekendSpread', 'holidaySpread']) {
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

  // C5 fix: AY scaling must use the UNDELTA'D baseline target, not the effective (possibly
  // buy-down'd) target — see ResidentScheduler.jsx's buildQualityInput / CLAUDE.md "buy-down".
  it('AY scaling uses baselineTargets, not the effective target, when they differ (the delta-path)', () => {
    // `a` has a one-block buy-down this block: base 19 -> effective 17 (delta -2). `b` has no
    // delta at all, base === effective === 19 for both targets and baselineTargets.
    const targets = { a: 17, b: 19 };
    const baselineTargets = { a: 19, b: 19 };
    const ayPriorTotals = {
      a: { nights: 0, weekendDates: 0, assigned: 55, blocks: 3 },
      b: { nights: 0, weekendDates: 0, assigned: 55, blocks: 3 },
    };
    const withCorrectBaseline = computeQualityMetrics({ ...base, targets, baselineTargets, schedule, ayPriorTotals, ayCarryoverFullAt: 3 });
    // Omitting baselineTargets makes the `?? target` fallback use the EFFECTIVE (delta'd) target
    // as the scaling base for `a` — reproducing the exact pre-fix bug for contrast.
    const withoutBaseline = computeQualityMetrics({ ...base, targets, schedule, ayPriorTotals, ayCarryoverFullAt: 3 });

    expect(withCorrectBaseline.ayCarryoverConfidence).toBeCloseTo(1, 5);
    // The two must diverge: passing the real baseline changes `a`'s scaled AY target from
    // 17*3+17=68 (buggy) to 19*3+17=74 (correct), which measurably moves the group's spread.
    expect(withCorrectBaseline.deficitSpread).not.toBeCloseTo(withoutBaseline.deficitSpread, 5);
  });

  it('omitting baselineTargets is a safe no-op when no resident has a delta (the omitted-map path)', () => {
    // Neither resident has a buy-down here, so an explicit baselineTargets map equal to `targets`
    // must produce IDENTICAL output to omitting the param entirely — proving the mandatory
    // per-resident `?? target` fallback works, and does not NaN/collapse scaledTarget to 0 (the
    // regression this test guards: without the fallback, an omitted map makes `bt` undefined,
    // `bt * prior.blocks + target` is NaN, `NaN > 0` is false, scaledTarget silently becomes 0,
    // and ayDeficitSpread reads exactly 0 — indistinguishable from "no imbalance" — with no test
    // failing loudly anywhere else).
    const targets = { a: 19, b: 19 };
    const ayPriorTotals = {
      a: { nights: 0, weekendDates: 0, assigned: 55, blocks: 3 },
      b: { nights: 0, weekendDates: 0, assigned: 55, blocks: 3 },
    };
    const withExplicitEqual = computeQualityMetrics({ ...base, targets, baselineTargets: { a: 19, b: 19 }, schedule, ayPriorTotals, ayCarryoverFullAt: 3 });
    const withOmitted = computeQualityMetrics({ ...base, targets, schedule, ayPriorTotals, ayCarryoverFullAt: 3 });

    expect(withOmitted.ayCarryoverConfidence).toBeCloseTo(1, 5);
    expect(Number.isFinite(withOmitted.deficitSpread)).toBe(true);
    expect(withOmitted.deficitSpread).toBeCloseTo(withExplicitEqual.deficitSpread, 10);
  });
});

describe('computeQualityMetrics — holiday equity', () => {
  const dates = mkDates('2026-12-20', 14); // 2026-12-20 .. 2027-01-02
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
  // Two NON-ADJACENT holiday dates, on purpose. Adjacent ones (a real Dec 24-25) would make the
  // two fixtures below differ in WORK SHAPE as well — one resident with a 2-day run vs two with
  // isolated singles — and workShapePenalty would swamp the holiday term, testing the wrong thing.
  const HOLIDAYS = ['2026-12-25', '2027-01-01'];

  // The two fixtures are deliberately IDENTICAL in every respect the scorer measures except who
  // gets the holidays: same four worked dates in aggregate (so coverageMiss is identical), two
  // shifts each (so deficitSpread and underTargetTotal are identical), all isolated day shifts
  // (so nightShapePenalty is 0 and workShapePenalty is identical), no weekend pairs configured,
  // no time off. The ONLY difference is which resident holds each holiday date.
  const lopsided = { // `a` works both holidays
    a: { '2026-12-25': 'POD-D', '2027-01-01': 'POD-D' },
    b: { '2026-12-27': 'POD-D', '2026-12-29': 'POD-D' },
  };
  const even = { // one holiday each
    a: { '2026-12-25': 'POD-D', '2026-12-27': 'POD-D' },
    b: { '2027-01-01': 'POD-D', '2026-12-29': 'POD-D' },
  };

  it('is a STRICT no-op when no holidays are configured — the baseline-preserving property', () => {
    // Three ways of saying "no holidays", all of which must be numerically identical to a scorer
    // with no holiday concept at all. This is what keeps the committed quality baselines valid
    // without regeneration: the fixtures carry no holiday config, so the new term contributes 0.
    const omitted = computeQualityMetrics({ ...base, schedule: lopsided });
    const emptyArray = computeQualityMetrics({ ...base, schedule: lopsided, holidayDates: [] });
    const emptySet = computeQualityMetrics({ ...base, schedule: lopsided, holidayDates: new Set() });

    for (const m of [omitted, emptyArray, emptySet]) {
      expect(m.holidaySpread).toBe(0);
      expect(m.blockHolidaySpread).toBe(0);
    }
    const priority = ['coverageMin', 'seniorComposition', 'postNightRest'];
    expect(computeQualityVector(omitted, priority)).toEqual(computeQualityVector(emptyArray, priority));
    expect(computeQualityVector(omitted, priority)).toEqual(computeQualityVector(emptySet, priority));
  });

  it('penalizes a lopsided holiday split and scores an even one at zero', () => {
    const bad = computeQualityMetrics({ ...base, schedule: lopsided, holidayDates: HOLIDAYS });
    const good = computeQualityMetrics({ ...base, schedule: even, holidayDates: HOLIDAYS });

    expect(good.holidaySpread).toBe(0);
    expect(bad.holidaySpread).toBeGreaterThan(0);
  });

  it('makes the even split win the quality vector, all else equal', () => {
    const priority = ['coverageMin', 'seniorComposition', 'postNightRest'];
    const bad = computeQualityVector(computeQualityMetrics({ ...base, schedule: lopsided, holidayDates: HOLIDAYS }), priority);
    const good = computeQualityVector(computeQualityMetrics({ ...base, schedule: even, holidayDates: HOLIDAYS }), priority);

    expect(compareVectors(good, bad)).toBeLessThan(0);
    expect(betterQuality(wrap(good), wrap(bad))).toBe(true);
    // ...and with holidays switched off, the two are INDISTINGUISHABLE — which is what proves the
    // difference above comes from the holiday term and not from some incidental asymmetry in the
    // fixtures (an earlier draft of this test failed exactly that way: adjacent holiday dates made
    // the two schedules differ in workShapePenalty, and that, not holidays, decided the winner).
    const badOff = computeQualityVector(computeQualityMetrics({ ...base, schedule: lopsided }), priority);
    const goodOff = computeQualityVector(computeQualityMetrics({ ...base, schedule: even }), priority);
    expect(compareVectors(goodOff, badOff)).toBe(0);
  });

  it('accepts holidayDates as an array or a Set interchangeably', () => {
    const asArray = computeQualityMetrics({ ...base, schedule: lopsided, holidayDates: HOLIDAYS });
    const asSet = computeQualityMetrics({ ...base, schedule: lopsided, holidayDates: new Set(HOLIDAYS) });
    expect(asSet.holidaySpread).toBe(asArray.holidaySpread);
  });

  it('a night shift STARTING on the holiday counts; one starting the next day does not', () => {
    const startsOnXmas = { a: { '2026-12-25': 'POD-N' }, b: {} };
    const startsAfter = { a: { '2026-12-26': 'POD-N' }, b: {} };
    expect(computeQualityMetrics({ ...base, schedule: startsOnXmas, holidayDates: HOLIDAYS }).holidaySpread)
      .toBeGreaterThan(0);
    expect(computeQualityMetrics({ ...base, schedule: startsAfter, holidayDates: HOLIDAYS }).holidaySpread)
      .toBe(0);
  });

  it('counts a resident who is off over the holidays as zero — unavailable, not spared', () => {
    // `b` has approved time off across both holidays, so they cannot be assigned. They are NOT
    // excluded from the population and NOT credited: their 0 is real, and it is exactly what
    // registers as the imbalance the next holiday should correct.
    const residentsWithOff = [mk('a'), { ...mk('b'), approvedDatesOff: HOLIDAYS }];
    const m = computeQualityMetrics({
      ...base, residents: residentsWithOff, schedule: lopsided, holidayDates: HOLIDAYS,
    });
    expect(m.holidaySpread).toBeGreaterThan(0);
  });

  it('surfaces year-to-date holiday imbalance the block alone cannot see (AY carryover)', () => {
    // This is the case holidays exist for, and the reason carryover is essential rather than nice
    // to have. Both residents work exactly one holiday THIS block, so block-only holidaySpread is
    // 0 and the block looks perfectly fair on its own evidence. But `a` already worked two
    // holidays in published earlier blocks. Only the carryover can see that.
    const ayPriorTotals = {
      a: { nights: 5, weekendDates: 8, holidays: 2, assigned: 30, blocks: 3 },
      b: { nights: 5, weekendDates: 8, holidays: 0, assigned: 30, blocks: 3 },
    };
    const blockOnly = computeQualityMetrics({ ...base, schedule: even, holidayDates: HOLIDAYS });
    const withAy = computeQualityMetrics({ ...base, schedule: even, holidayDates: HOLIDAYS, ayPriorTotals, ayCarryoverFullAt: 3 });

    expect(blockOnly.holidaySpread).toBe(0);
    expect(withAy.ayCarryoverConfidence).toBeCloseTo(1, 5);
    expect(withAy.holidaySpread).toBeGreaterThan(0);
    // The block-only figure is reported untouched alongside the blended one.
    expect(withAy.blockHolidaySpread).toBe(0);
  });

  it('EXCLUDES a no-history resident from the AY holiday population rather than zeroing them', () => {
    // `b` is new to the roster. Reading them as "0 holidays worked" would mark them maximally
    // holiday-deprived and aim every holiday at them. With only one resident carrying history,
    // confidence is 0 and nothing is blended — the same guarantee the night/weekend carryover
    // already makes.
    const onlyA = { a: { nights: 5, weekendDates: 8, holidays: 2, assigned: 30, blocks: 3 } };
    const m = computeQualityMetrics({ ...base, schedule: even, holidayDates: HOLIDAYS, ayPriorTotals: onlyA, ayCarryoverFullAt: 3 });
    expect(m.ayCarryoverConfidence).toBe(0);
    expect(m.holidaySpread).toBe(m.blockHolidaySpread);
  });

  it('tolerates prior totals from before this metric existed (missing `holidays` key)', () => {
    // A map built by an older code path has no `holidays` field. That must read as 0 rather than
    // NaN-poisoning the spread into a silently-always-false comparison.
    const legacy = {
      a: { nights: 5, weekendDates: 8, assigned: 30, blocks: 3 },
      b: { nights: 5, weekendDates: 8, assigned: 30, blocks: 3 },
    };
    const m = computeQualityMetrics({ ...base, schedule: even, holidayDates: HOLIDAYS, ayPriorTotals: legacy, ayCarryoverFullAt: 3 });
    expect(Number.isFinite(m.holidaySpread)).toBe(true);
  });
});

describe('computeQualityVector — holidaySpread weighting', () => {
  const priority = ['coverageMin', 'seniorComposition', 'postNightRest'];
  const slot3 = m => computeQualityVector(m, priority)[3];

  it('is weighted at 8 — between deficitSpread (10) and nightSpread (6)', () => {
    const unit = slot3(makeMetrics({ holidaySpread: 1 })) - slot3(makeMetrics({}));
    expect(unit).toBeCloseTo(8, 10);
    expect(unit).toBeLessThan(slot3(makeMetrics({ deficitSpread: 1 })) - slot3(makeMetrics({})));
    expect(unit).toBeGreaterThan(slot3(makeMetrics({ nightSpread: 1 })) - slot3(makeMetrics({})));
  });

  it('joins the EXISTING fairness slot rather than adding a 5th tuple element', () => {
    // A new slot would rank holiday equity above coverage/seniority/rest, which it must never do:
    // a schedule nobody can staff is not redeemed by being fair about Christmas.
    expect(computeQualityVector(makeMetrics({ holidaySpread: 3 }), priority)).toHaveLength(4);
  });

  it('never outranks a higher-priority tier no matter how large', () => {
    const hugeHoliday = makeMetrics({ holidaySpread: 5000 });
    const oneCoverageMiss = makeMetrics({ coverageMiss: 1 });
    expect(compareVectors(
      computeQualityVector(hugeHoliday, priority),
      computeQualityVector(oneCoverageMiss, priority),
    )).toBeLessThan(0);
  });

  it('reads a metrics object built before this field existed as 0, not NaN', () => {
    const legacy = { coverageMiss: 0, seniorGaps: 0, restCompromises: 0, underTargetTotal: 0,
      deficitSpread: 0, nightSpread: 0, weekendSpread: 0, nightShapePenalty: 0, workShapePenalty: 0 };
    const v = computeQualityVector(legacy, priority);
    expect(Number.isNaN(v[3])).toBe(false);
    expect(v[3]).toBe(0);
  });
});
