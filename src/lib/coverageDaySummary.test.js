import { describe, it, expect } from 'vitest';
import { dayIsUngenerated, dayOpenSlots, summarizeBlockCoverage, shiftChipLabel } from './coverageDaySummary.js';
import { SHIFT_MAP } from './shifts.js';

const cov = (o) => ({ perShift: Object.fromEntries(Object.entries(o).map(([k, [count, min, max]]) => [k, { count, min, max }])) });

describe('dayOpenSlots', () => {
  it('sums shortfalls only', () => {
    expect(dayOpenSlots(cov({ 'POD-D': [3, 3, 3], 'FLEX-D': [0, 1, 1], 'POD-N': [0, 2, 2], 'MT-D': [4, 1, 2] }))).toBe(3);
  });
  it('0 for missing/empty', () => {
    expect(dayOpenSlots(undefined)).toBe(0);
    expect(dayOpenSlots({ perShift: {} })).toBe(0);
  });
});

describe('summarizeBlockCoverage', () => {
  it('totals, days, worst (earliest on tie)', () => {
    const c = { a: cov({ x: [0, 2, 2] }), b: cov({ x: [1, 1, 1] }), c: cov({ x: [0, 2, 2] }), d: cov({ x: [0, 1, 1] }) };
    expect(summarizeBlockCoverage(['a', 'b', 'c', 'd'], c)).toEqual({ totalOpen: 5, daysWithOpen: 3, worst: { ds: 'a', open: 2 }, notGenerated: false });
  });
  it('clean block', () => {
    expect(summarizeBlockCoverage(['a'], { a: cov({ x: [1, 1, 1] }) })).toEqual({ totalOpen: 0, daysWithOpen: 0, worst: null, notGenerated: false });
  });
});

describe('ungenerated', () => {
  const u = (m) => ({ ...cov({ x: [0, m, m] }), filled: 0, minTotal: m });
  it('flags block with zero assignments', () => {
    expect(summarizeBlockCoverage(['a', 'b'], { a: u(2), b: u(1) }).notGenerated).toBe(true);
  });
  it('not flagged once anything is filled', () => {
    const c = { a: u(2), b: { ...cov({ x: [1, 1, 1] }), filled: 1, minTotal: 1 } };
    expect(summarizeBlockCoverage(['a', 'b'], c).notGenerated).toBe(false);
  });
  it('dayIsUngenerated', () => {
    expect(dayIsUngenerated(u(2))).toBe(true);
    expect(dayIsUngenerated({ filled: 1, minTotal: 2 })).toBe(false);
    expect(dayIsUngenerated(undefined)).toBe(false);
  });
});

describe('shiftChipLabel', () => {
  it('uses catalog area + short', () => {
    expect(shiftChipLabel(SHIFT_MAP['POD-D'])).toBe('POD D');
    expect(shiftChipLabel(SHIFT_MAP['PED-N-FM'])).toBe('PED NF');
  });
});
