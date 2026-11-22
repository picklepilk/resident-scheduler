import { describe, it, expect } from 'vitest';
import { varietyStats, normalizeVarietyRule, DEFAULT_VARIETY_RULE } from './variety.js';
import { computeQualityMetrics, FAIRNESS_AXIS_WEIGHTS } from './scheduleQuality.js';

const dates = Array.from({ length: 8 }, (_, i) => `2026-01-${String(5 + i).padStart(2, '0')}`);
const rule = { ...DEFAULT_VARIETY_RULE };
const res = id => ({ id });

describe('normalizeVarietyRule', () => {
  it('defaults and clamps untrusted input', () => {
    expect(normalizeVarietyRule({})).toEqual(DEFAULT_VARIETY_RULE);
    expect(normalizeVarietyRule({ varietyRule: { maxSameShiftRun: 'x', pairStackDays: -2, enabled: false } }))
      .toEqual({ enabled: false, maxSameShiftRun: 3, pairStackDays: 4 });
    expect(normalizeVarietyRule({ varietyRule: { maxSameShiftRun: 99 } }).maxSameShiftRun).toBe(28);
  });
});

describe('varietyStats', () => {
  it('counts days beyond the run limit per non-night shift id', () => {
    const schedule = { a: Object.fromEntries(dates.slice(0, 5).map(d => [d, 'POD-D'])) };
    const s = varietyStats({ schedule, dates, residents: [res('a')], rule });
    expect(s.runExcess).toBe(2);
    expect(s.runs[0].dates).toHaveLength(5);
  });
  it('a different shift id resets the run, nights are exempt', () => {
    const schedule = { a: { [dates[0]]: 'POD-D', [dates[1]]: 'POD-D', [dates[2]]: 'POD-D', [dates[3]]: 'POD-E', [dates[4]]: 'POD-D' } };
    expect(varietyStats({ schedule, dates, residents: [res('a')], rule }).runExcess).toBe(0);
    const nights = { a: Object.fromEntries(dates.slice(0, 6).map(d => [d, 'POD-N'])) };
    expect(varietyStats({ schedule: nights, dates, residents: [res('a')], rule }).runExcess).toBe(0);
  });
  it('counts pair co-occurrence in one area beyond the limit, EM only', () => {
    const days = [0, 1, 3, 4, 6, 7];
    const sch = Object.fromEntries(days.map(i => [dates[i], 'POD-D']));
    const schedule = { a: sch, b: sch };
    const s = varietyStats({ schedule, dates, residents: [res('a'), res('b')], pairResidentIds: ['a', 'b'], rule });
    expect(s.pairExcess).toBe(2);
    expect(varietyStats({ schedule, dates, residents: [res('a'), res('b')], pairResidentIds: ['a'], rule }).pairExcess).toBe(0);
  });
  it('disabled rule is all zero', () => {
    const schedule = { a: Object.fromEntries(dates.map(d => [d, 'POD-D'])) };
    expect(varietyStats({ schedule, dates, residents: [res('a')], rule: { ...rule, enabled: false } }).runExcess).toBe(0);
  });
});

describe('quality integration', () => {
  it('feeds the existing fairness axes (no new slot)', () => {
    expect(FAIRNESS_AXIS_WEIGHTS.varietyRunExcess).toBeGreaterThan(0);
    expect(FAIRNESS_AXIS_WEIGHTS.pairStackExcess).toBeGreaterThan(0);
  });
  it('metrics carry the counts when a variety rule is passed', () => {
    const schedule = { a: Object.fromEntries(dates.slice(0, 5).map(d => [d, 'POD-D'])) };
    const m = computeQualityMetrics({ schedule, coverage: {}, dates, residents: [res('a')], targets: { a: 5 }, nightOnlyIds: new Set(), nightRules: { targetPerBlock: 6, maxRun: 6, maxPerBlock: 12 }, weekendPairs: [], seniorGapCount: 0, restCompromiseCount: 0, variety: rule });
    expect(m.varietyRunExcess).toBe(2);
  });
});
