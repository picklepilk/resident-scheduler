import { describe, it, expect } from 'vitest';
import { diffSchedules, compareQuality, isStrictImprovement, pickFewestChanges, optimizeBudgetOptions, budgetSeconds, lockedCellsForOptimize } from './optimizeFlow.js';

const S = (e, w, lo, hi, q = []) => ({ errors: e, blockingWarnings: w, belowMin: lo, aboveMax: hi, quality: q });

describe('diffSchedules', () => {
  it('classifies added/removed/changed/kept', () => {
    const before = { r1: { '2026-07-01': 'POD-D', '2026-07-02': 'POD-D' }, r2: { '2026-07-01': 'FLEX-D' } };
    const after = { r1: { '2026-07-01': 'POD-D', '2026-07-02': 'POD-N' }, r2: {}, r3: { '2026-07-03': 'PED-D' } };
    const d = diffSchedules(before, after);
    expect(d.total).toBe(3);
    expect(d.kept).toBe(1);
    expect(d.changed).toEqual([{ residentId: 'r1', date: '2026-07-02', from: 'POD-D', to: 'POD-N' }]);
    expect(d.removed).toEqual([{ residentId: 'r2', date: '2026-07-01', shiftId: 'FLEX-D' }]);
    expect(d.added).toEqual([{ residentId: 'r3', date: '2026-07-03', shiftId: 'PED-D' }]);
  });
  it('ignores empty cells and bad input', () => {
    expect(diffSchedules(null, undefined)).toEqual({ added: [], removed: [], changed: [], kept: 0, total: 0 });
    const d = diffSchedules({ a: { x: '', y: null } }, { a: { x: 'S' } });
    expect(d.total).toBe(0);
    expect(d.added).toHaveLength(1);
  });
  it('identical schedules keep all', () => {
    const s = { a: { '2026-07-01': 'X', '2026-07-02': 'Y' } };
    const d = diffSchedules(s, JSON.parse(JSON.stringify(s)));
    expect(d.kept).toBe(2);
    expect(d.total).toBe(2);
    expect(d.added.length + d.removed.length + d.changed.length).toBe(0);
  });
});

describe('compareQuality', () => {
  it('builds rows with better flags and labels', () => {
    const rows = compareQuality(S(3, 1, 4, 0, [5, 2, 7, 10]), S(1, 1, 2, 3, [5, 3, 7, 9]));
    expect(rows.map(r => r.label)).toEqual(['Errors', 'Blocking warnings', 'Coverage below min', 'Coverage above max',
      'Coverage misses', 'Senior gaps', 'Rest compromises', 'Fairness + shape']);
    expect(rows.map(r => r.better)).toEqual([true, null, true, false, null, false, null, true]);
    expect(rows[0]).toMatchObject({ key: 'errors', before: 3, after: 1 });
  });
  it('tolerates missing data and extra quality entries', () => {
    const rows = compareQuality({}, { quality: [0, 0, 0, 0, 1] });
    expect(rows).toHaveLength(9);
    expect(rows[8].label).toBe('Quality 5');
    expect(rows[8].better).toBe(false);
    expect(compareQuality(null, null)).toHaveLength(4);
  });
});

describe('isStrictImprovement', () => {
  it('requires strict win', () => {
    expect(isStrictImprovement(S(1, 0, 0, 0), S(1, 0, 0, 0))).toBe(false);
    expect(isStrictImprovement(S(1, 0, 0, 0, [1]), S(1, 0, 0, 0, [0]))).toBe(true);
  });
  it('is lexicographic, not a sum', () => {
    expect(isStrictImprovement(S(1, 0, 0, 0, [0]), S(2, 0, 0, 0, [0]))).toBe(false);
    expect(isStrictImprovement(S(2, 0, 0, 0, [0]), S(1, 9, 9, 9, [99]))).toBe(true);
  });
  it('merges belowMin+aboveMax', () => {
    expect(isStrictImprovement(S(0, 0, 3, 0), S(0, 0, 1, 1))).toBe(true);
    expect(isStrictImprovement(S(0, 0, 3, 0), S(0, 0, 0, 3))).toBe(false);
  });
  it('pads short vectors', () => {
    expect(isStrictImprovement(S(0, 0, 0, 0, [1]), S(0, 0, 0, 0))).toBe(true);
  });
});

describe('pickFewestChanges', () => {
  const cur = { a: { '2026-07-01': 'X', '2026-07-02': 'X' } };
  it('breaks quality ties by fewest changed cells', () => {
    const c1 = { schedule: { a: { '2026-07-01': 'Y', '2026-07-02': 'Y' } }, summary: S(0, 0, 0, 0, [1]) };
    const c2 = { schedule: { a: { '2026-07-01': 'Y', '2026-07-02': 'X' } }, summary: S(0, 0, 0, 0, [1]) };
    expect(pickFewestChanges([c1, c2], cur)).toBe(c2);
  });
  it('prefers better quality over fewer changes', () => {
    const same = { schedule: cur, summary: S(1, 0, 0, 0) };
    const better = { schedule: { a: {} }, summary: S(0, 0, 0, 0) };
    expect(pickFewestChanges([same, better], cur)).toBe(better);
  });
  it('handles empty', () => {
    expect(pickFewestChanges([], cur)).toBeNull();
    expect(pickFewestChanges(null, cur)).toBeNull();
  });
});

describe('budget', () => {
  it('options', () => {
    expect(optimizeBudgetOptions().map(o => o.value)).toEqual(['auto', 5, 10, 15, 30]);
    expect(optimizeBudgetOptions()[0].label).toBe('Auto');
    expect(optimizeBudgetOptions()[1].label).toBe('5 minutes');
  });
  it('budgetSeconds', () => {
    expect(budgetSeconds('auto', 120)).toBe(120);
    expect(budgetSeconds('auto')).toBe(300);
    expect(budgetSeconds('auto', 0)).toBe(300);
    expect(budgetSeconds(10, 120)).toBe(600);
    expect(budgetSeconds('15')).toBe(900);
  });
});

describe('lockedCellsForOptimize', () => {
  it('returns only truthy locks with a shift in schedule', () => {
    const block = {
      schedule: { r1: { '2026-07-01': 'POD-D', '2026-07-02': 'POD-N' }, r2: { '2026-07-01': 'FLEX-D' } },
      lockedCells: { r1: { '2026-07-01': true, '2026-07-02': false, '2026-07-05': true }, r2: { '2026-07-01': true }, r9: null },
    };
    expect(lockedCellsForOptimize(block)).toEqual([
      { residentId: 'r1', date: '2026-07-01', shiftId: 'POD-D' },
      { residentId: 'r2', date: '2026-07-01', shiftId: 'FLEX-D' },
    ]);
  });
  it('handles missing', () => {
    expect(lockedCellsForOptimize({})).toEqual([]);
    expect(lockedCellsForOptimize(null)).toEqual([]);
  });
});
