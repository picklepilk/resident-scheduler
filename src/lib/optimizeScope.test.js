import { describe, it, expect } from 'vitest';
import { normalizeScope, scopeBudgetSeconds, scopeLabel, scopeOutcome } from './optimizeScope.js';

const block = { startDate: '2026-11-02', endDate: '2026-11-29', schedule: { r1: {}, r2: {}, r3: {}, r4: {} } };

describe('normalizeScope', () => {
  it('keeps an inner date range and resident subset', () => {
    expect(normalizeScope({ from: '2026-11-03', to: '2026-11-09', residentIds: ['r1', 'r2'] }, block))
      .toEqual({ dates: ['2026-11-03', '2026-11-09'], residentIds: ['r1', 'r2'] });
  });
  it('clamps to the block and swaps reversed dates', () => {
    expect(normalizeScope({ from: '2026-11-10', to: '2026-10-01' }, block)).toEqual({ dates: ['2026-11-02', '2026-11-10'] });
    expect(normalizeScope({ from: '2026-11-20', to: '2026-12-31' }, block)).toEqual({ dates: ['2026-11-20', '2026-11-29'] });
  });
  it('whole block or nothing selected is null', () => {
    expect(normalizeScope({ from: '2026-10-01', to: '2027-01-01' }, block)).toBeNull();
    expect(normalizeScope({ residentIds: ['r1', 'r2', 'r3', 'r4'] }, block)).toBeNull();
    expect(normalizeScope({}, block)).toBeNull();
    expect(normalizeScope({ residentIds: [] }, block)).toBeNull();
  });
  it('drops unknown and duplicate ids', () => {
    expect(normalizeScope({ residentIds: ['r1', 'r1', 'zz', 7] }, block)).toEqual({ residentIds: ['r1'] });
    expect(normalizeScope({ residentIds: ['zz'] }, block)).toBeNull();
  });
  it('uses knownResidentIds when given', () => {
    expect(normalizeScope({ residentIds: ['r9'] }, block, ['r9', 'r8'])).toEqual({ residentIds: ['r9'] });
  });
  it('selection fully outside the block is null', () => {
    expect(normalizeScope({ from: '2027-01-01', to: '2027-01-05' }, block)).toBeNull();
  });
  it('does not throw on odd input', () => {
    for (const bad of [undefined, null, 5, 'x', [], { from: 3, to: {} }, { residentIds: 'r1' }]) expect(() => normalizeScope(bad, block)).not.toThrow();
    expect(normalizeScope({ from: '2026-11-03' }, null)).toBeNull();
    expect(normalizeScope({ residentIds: ['r1'] }, {})).toBeNull();
  });
  it('single date given uses it for both ends', () => {
    expect(normalizeScope({ from: '2026-11-05' }, block)).toEqual({ dates: ['2026-11-05', '2026-11-05'] });
  });
});

describe('scopeBudgetSeconds', () => {
  it('caps at 120 s, keeps shorter budgets', () => {
    expect(scopeBudgetSeconds({}, 600)).toBe(120);
    expect(scopeBudgetSeconds({}, 60)).toBe(60);
    expect(scopeBudgetSeconds({}, 120)).toBe(120);
  });
  it('odd budgets fall back to 120', () => {
    for (const v of [undefined, null, NaN, 'abc', 0, -5]) expect(scopeBudgetSeconds(null, v)).toBe(120);
  });
});

describe('scopeLabel', () => {
  it('dates and residents', () => {
    expect(scopeLabel({ dates: ['2026-11-03', '2026-11-09'], residentIds: ['a', 'b', 'c', 'd'] })).toBe('3 Nov to 9 Nov, 4 residents');
  });
  it('single day, single resident, only one part', () => {
    expect(scopeLabel({ dates: ['2026-11-03', '2026-11-03'] })).toBe('3 Nov');
    expect(scopeLabel({ residentIds: ['a'] })).toBe('1 resident');
  });
  it('explicit count wins; odd input is whole block', () => {
    expect(scopeLabel({ residentIds: ['a', 'b'] }, 5)).toBe('5 residents');
    expect(scopeLabel(null)).toBe('whole block');
    expect(scopeLabel({})).toBe('whole block');
  });
});

describe('scopeOutcome', () => {
  const scope = { dates: ['2026-11-03', '2026-11-05'], residentIds: ['r1'] };
  const start = { r1: { '2026-11-03': 'POD-D', '2026-11-08': 'POD-D' }, r2: { '2026-11-03': 'PED-D' } };
  it('applied with no leaks', () => {
    const result = { r1: { '2026-11-03': 'FLEX-D', '2026-11-08': 'POD-D' }, r2: { '2026-11-03': 'PED-D' } };
    expect(scopeOutcome({ scope: { applied: true } }, start, result, scope)).toEqual({ applied: true, leaked: 0 });
  });
  it('counts leaks outside date or resident and demotes to not applied', () => {
    const result = { r1: { '2026-11-03': 'POD-D', '2026-11-08': null }, r2: { '2026-11-03': 'FLEX-D' } };
    const o = scopeOutcome({ scope: { applied: true } }, start, result, scope);
    expect(o.leaked).toBe(2);
    expect(o.applied).toBe(false);
    expect(o.reason).toBeTruthy();
  });
  it('old host: no report.scope', () => {
    const o = scopeOutcome({}, start, start, scope);
    expect(o.applied).toBe(false);
    expect(o.leaked).toBe(0);
  });
  it('host ignored the scope', () => {
    const o = scopeOutcome({ scope: { applied: false, ignored: 'hint infeasible' } }, start, start, scope);
    expect(o).toEqual({ applied: false, reason: 'hint infeasible', leaked: 0 });
  });
  it('odd inputs do not throw', () => {
    expect(() => scopeOutcome(null, null, undefined, null)).not.toThrow();
    expect(scopeOutcome(null, 5, 'x', {}).applied).toBe(false);
  });
});
