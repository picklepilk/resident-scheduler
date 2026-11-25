import { describe, it, expect } from 'vitest';
import { changedResidentDays, mergeEditsIntoResult, editsPreserved, repolishScope, editsNoticeText, repolishLabel } from './optimizeRepolish.js';

const start = { r1: { '2026-01-01': 'POD-D', '2026-01-02': 'POD-D' }, r2: { '2026-01-01': 'PED-D' } };
const current = { r1: { '2026-01-01': 'POD-D', '2026-01-02': '', '2026-01-03': 'POD-E' }, r2: { '2026-01-01': 'FLEX-D' } };
const result = { r1: { '2026-01-01': 'PED-D', '2026-01-02': 'POD-D', '2026-01-04': 'POD-D' }, r2: { '2026-01-01': 'PED-D' } };

describe('optimizeRepolish', () => {
  it('finds changed, cleared and added resident-days', () => {
    expect(changedResidentDays(start, current)).toEqual([['r1', '2026-01-02'], ['r1', '2026-01-03'], ['r2', '2026-01-01']]);
  });
  it('treats empty and missing as equal; odd inputs give []', () => {
    expect(changedResidentDays({ r1: { a: '' } }, { r1: {} })).toEqual([]);
    expect(changedResidentDays(undefined, null)).toEqual([]);
    expect(changedResidentDays('x', [1])).toEqual([]);
  });
  it('merge: cleared stays empty, added restored, changed restored, rest from solver, no mutation', () => {
    const snap = JSON.stringify([start, current, result]);
    const changed = changedResidentDays(start, current);
    const m = mergeEditsIntoResult(result, current, changed);
    expect(m.r1['2026-01-02']).toBeUndefined();
    expect(m.r1['2026-01-03']).toBe('POD-E');
    expect(m.r2['2026-01-01']).toBe('FLEX-D');
    expect(m.r1['2026-01-01']).toBe('PED-D');
    expect(m.r1['2026-01-04']).toBe('POD-D');
    expect(JSON.stringify([start, current, result])).toBe(snap);
  });
  it('merge creates a row for a resident missing from the result', () => {
    expect(mergeEditsIntoResult({}, { r9: { d: 'X' } }, [['r9', 'd']])).toEqual({ r9: { d: 'X' } });
    expect(mergeEditsIntoResult(undefined, undefined, undefined)).toEqual({});
  });
  it('editsPreserved', () => {
    const changed = changedResidentDays(start, current);
    const m = mergeEditsIntoResult(result, current, changed);
    expect(editsPreserved(m, current, changed)).toBe(true);
    expect(editsPreserved(result, current, changed)).toBe(false);
    m.r2['2026-01-01'] = 'PED-D';
    expect(editsPreserved(m, current, changed)).toBe(false);
    expect(editsPreserved(undefined, undefined, [])).toBe(true);
    expect(editsPreserved(undefined, undefined, undefined)).toBe(true);
  });
  it('repolishScope and strings', () => {
    expect(repolishScope([['r1', 'd']])).toEqual({ keepCells: [['r1', 'd']] });
    expect(repolishScope(undefined)).toEqual({ keepCells: [] });
    expect(editsNoticeText(0)).toBeNull();
    expect(editsNoticeText(1)).toContain('1 cell.');
    expect(editsNoticeText(3)).toContain('3 cells');
    expect(repolishLabel(2)).toBe('Re-polishing around your 2 edits, about 1 minute.');
  });
});
