// src/lib/optimizerSweep.test.js
// Pure unit tests for the What-If Optimization Sweep's non-UI parts — no ResidentScheduler.jsx
// import, no generator/validator run, no DOM.
import { describe, it, expect } from 'vitest';
import {
  diffSchedules,
  permutations,
  buildRulePriorityVariants,
  compareSweepCandidates,
  rankSweepCandidates,
  isBetterThanBaseline,
} from './optimizerSweep.js';

describe('diffSchedules', () => {
  it('reports no differences for identical schedules', () => {
    const sched = { r1: { '2026-01-01': 'POD-D' }, r2: { '2026-01-01': 'FLEX-D' } };
    const diff = diffSchedules(sched, sched);
    expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 0, total: 0 });
    expect(diff.byResident).toEqual({});
  });

  it('classifies added, removed, and changed cells per resident', () => {
    const current = {
      r1: { '2026-01-01': 'POD-D', '2026-01-02': 'FLEX-D' },
      r2: { '2026-01-01': 'TRAUMA-N' },
    };
    const alt = {
      r1: { '2026-01-01': 'POD-D', '2026-01-02': null, '2026-01-03': 'PED-D' }, // removed 01-02, added 01-03
      r2: { '2026-01-01': 'TRAUMA-D' }, // changed
    };
    const diff = diffSchedules(current, alt);
    expect(diff.counts).toEqual({ added: 1, removed: 1, changed: 1, total: 3 });
    expect(diff.byResident.r1).toEqual([
      { date: '2026-01-02', type: 'removed', from: 'FLEX-D' },
      { date: '2026-01-03', type: 'added', to: 'PED-D' },
    ]);
    expect(diff.byResident.r2).toEqual([
      { date: '2026-01-01', type: 'changed', from: 'TRAUMA-N', to: 'TRAUMA-D' },
    ]);
  });

  it('handles a resident present only in one side', () => {
    const current = {};
    const alt = { r1: { '2026-01-01': 'POD-D' } };
    const diff = diffSchedules(current, alt);
    expect(diff.counts.added).toBe(1);
    expect(diff.byResident.r1[0]).toEqual({ date: '2026-01-01', type: 'added', to: 'POD-D' });
  });

  it('defaults missing arguments to empty schedules', () => {
    expect(diffSchedules().counts.total).toBe(0);
  });
});

describe('permutations', () => {
  it('returns all n! orderings', () => {
    const perms = permutations(['a', 'b', 'c']);
    expect(perms).toHaveLength(6);
    const keys = new Set(perms.map(p => p.join('>')));
    expect(keys.size).toBe(6);
    expect(keys.has('a>b>c')).toBe(true);
    expect(keys.has('c>b>a')).toBe(true);
  });

  it('returns the single array itself for a 1-element input', () => {
    expect(permutations(['x'])).toEqual([['x']]);
  });
});

describe('buildRulePriorityVariants', () => {
  const DEFAULT_ORDER = ['coverageMin', 'seniorComposition', 'postNightRest'];

  it('produces 5 variants for the 3-rule default order, never re-testing the current order', () => {
    const variants = buildRulePriorityVariants(DEFAULT_ORDER);
    expect(variants).toHaveLength(5);
    for (const v of variants) {
      expect(v.rulePriority.join('>')).not.toBe(DEFAULT_ORDER.join('>'));
      // every variant is a genuine reordering of the same 3 ids, not a mutation
      expect([...v.rulePriority].sort()).toEqual([...DEFAULT_ORDER].sort());
    }
  });

  it('produces no duplicate orderings', () => {
    const variants = buildRulePriorityVariants(DEFAULT_ORDER);
    const keys = variants.map(v => v.rulePriority.join('>'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('handles a non-default starting order the same way (still excludes only itself)', () => {
    const order = ['postNightRest', 'coverageMin', 'seniorComposition'];
    const variants = buildRulePriorityVariants(order);
    expect(variants).toHaveLength(5);
    expect(variants.some(v => v.rulePriority.join('>') === order.join('>'))).toBe(false);
  });

  it('returns an empty list for an empty/invalid input', () => {
    expect(buildRulePriorityVariants([])).toEqual([]);
    expect(buildRulePriorityVariants(null)).toEqual([]);
  });
});

function candidate({ errorCount = 0, blockingWarnCount = 0, qualityVector = [0, 0, 0, 0], diffTotal = 0 }) {
  return { errorCount, blockingWarnCount, qualityVector, diffTotal };
}

describe('compareSweepCandidates / rankSweepCandidates', () => {
  it('ranks fewer errors first regardless of quality vector', () => {
    const worse = candidate({ errorCount: 1, qualityVector: [0, 0, 0, 0] });
    const better = candidate({ errorCount: 0, qualityVector: [100, 100, 100, 100] });
    expect(compareSweepCandidates(better, worse)).toBeLessThan(0);
    expect(rankSweepCandidates([worse, better])).toEqual([better, worse]);
  });

  it('breaks error ties on blockingWarnCount', () => {
    const worse = candidate({ blockingWarnCount: 2 });
    const better = candidate({ blockingWarnCount: 0 });
    expect(compareSweepCandidates(better, worse)).toBeLessThan(0);
  });

  it('breaks remaining ties lexicographically on the quality vector', () => {
    const worse = candidate({ qualityVector: [1, 0, 0, 0] });
    const better = candidate({ qualityVector: [0, 5, 5, 5] }); // slot 0 dominates despite higher slots 1-3
    expect(compareSweepCandidates(better, worse)).toBeLessThan(0);
  });

  it('falls back to smaller schedule diff when every score dimension ties', () => {
    const smallerDiff = candidate({ diffTotal: 2 });
    const largerDiff = candidate({ diffTotal: 10 });
    expect(compareSweepCandidates(smallerDiff, largerDiff)).toBeLessThan(0);
    expect(rankSweepCandidates([largerDiff, smallerDiff])).toEqual([smallerDiff, largerDiff]);
  });

  it('is a stable total order (rankSweepCandidates does not mutate input)', () => {
    const list = [candidate({ errorCount: 2 }), candidate({ errorCount: 0 }), candidate({ errorCount: 1 })];
    const copy = [...list];
    const ranked = rankSweepCandidates(list);
    expect(list).toEqual(copy); // original untouched
    expect(ranked.map(c => c.errorCount)).toEqual([0, 1, 2]);
  });
});

describe('isBetterThanBaseline', () => {
  it('is true when the candidate has fewer errors than baseline', () => {
    const baseline = candidate({ errorCount: 1 });
    const cand = candidate({ errorCount: 0 });
    expect(isBetterThanBaseline(cand, baseline)).toBe(true);
  });

  it('is false when the candidate is equal to baseline (strict improvement only)', () => {
    const baseline = candidate({ qualityVector: [1, 2, 3, 4] });
    const same = candidate({ qualityVector: [1, 2, 3, 4] });
    expect(isBetterThanBaseline(same, baseline)).toBe(false);
  });

  it('is false when the candidate is strictly worse', () => {
    const baseline = candidate({ errorCount: 0 });
    const worse = candidate({ errorCount: 1 });
    expect(isBetterThanBaseline(worse, baseline)).toBe(false);
  });

  it('ignores diffTotal — a candidate is not "better" merely for having a smaller diff than itself', () => {
    const baseline = candidate({ qualityVector: [0, 0, 0, 0], diffTotal: 0 });
    const cand = candidate({ qualityVector: [0, 0, 0, 0], diffTotal: 999 });
    expect(isBetterThanBaseline(cand, baseline)).toBe(false);
  });
});
