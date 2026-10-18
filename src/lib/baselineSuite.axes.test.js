// Pure unit tests for the per-axis fairness gate (no generator run).
import { describe, it, expect } from 'vitest';
import { evaluateAxes, worsenedAxes, topSlotsImproved, axisTolerance, seedsFor, SEEDS } from './baselineSuite.js';
import { FAIRNESS_AXIS_WEIGHTS } from './scheduleQuality.js';

const zero = () => Object.fromEntries(Object.keys(FAIRNESS_AXIS_WEIGHTS).map(k => [k, 0]));

describe('fairness axis gate', () => {
  it('tolerance is applied to the weighted contribution', () => {
    // deficitSpread weight 10: raw +0.04 -> weighted +0.4 (< 0.5 abs) is within tolerance;
    // raw +0.08 -> weighted +0.8 is not.
    const before = { ...zero(), deficitSpread: 1 };
    expect(worsenedAxes({ ...before, deficitSpread: 1.04 }, before)).toEqual([]);
    expect(worsenedAxes({ ...before, deficitSpread: 1.08 }, before)).toEqual(['deficitSpread']);
    expect(axisTolerance(100)).toBe(2);
  });

  it('hard-fails when axes worsen and slots 0-2 did not strictly improve', () => {
    const before = { ...zero(), nightSpread: 1 };
    const after = { ...before, nightSpread: 3 };
    const r = evaluateAxes(after, before, [10, 0, 0, 50], [10, 0, 0, 50]);
    expect(r.worsened).toEqual(['nightSpread']);
    expect(r.hardFail).toBe(true);
  });

  it('only warns when slots 0-2 strictly improved', () => {
    const before = { ...zero(), nightSpread: 1 };
    const after = { ...before, nightSpread: 3 };
    const r = evaluateAxes(after, before, [8, 0, 0, 50], [10, 0, 0, 50]);
    expect(r.worsened).toEqual(['nightSpread']);
    expect(r.hardFail).toBe(false);
  });

  it('no worsened axes means no failure; worse slots 0-2 is not an improvement', () => {
    const a = { ...zero(), nightSpread: 1 };
    expect(evaluateAxes(a, a, [10, 0, 0, 1], [10, 0, 0, 1]).hardFail).toBe(false);
    expect(topSlotsImproved([12, 0, 0, 0], [10, 0, 0, 0])).toBe(false);
    expect(topSlotsImproved([10.2, 0, 0, 0], [10, 0, 0, 0])).toBe(false);
  });

  it('realScale uses the first 3 standard seeds', () => {
    expect(seedsFor('realScale')).toEqual(SEEDS.slice(0, 3));
    expect(seedsFor('standard')).toEqual(SEEDS);
  });
});
