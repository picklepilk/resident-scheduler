import { describe, it, expect } from 'vitest';
import { normalizeUiPrefs } from './uiPrefs.js';

describe('normalizeUiPrefs', () => {
  it('defaults on null/undefined', () => {
    expect(normalizeUiPrefs(null)).toEqual({ tabOverflow: [], cardOpen: {}, showUnscheduled: false });
    expect(normalizeUiPrefs(undefined)).toEqual({ tabOverflow: [], cardOpen: {}, showUnscheduled: false });
  });

  it('passes through a well-formed shape', () => {
    const raw = { tabOverflow: ['guide', 'whatsnew'], cardOpen: { 'dash-equity': false, 'settings-qgenda': true }, showUnscheduled: true };
    expect(normalizeUiPrefs(raw)).toEqual(raw);
  });

  it('drops non-string entries from tabOverflow', () => {
    expect(normalizeUiPrefs({ tabOverflow: ['guide', 5, null, { x: 1 }] }).tabOverflow).toEqual(['guide']);
  });

  it('ignores a non-array tabOverflow', () => {
    expect(normalizeUiPrefs({ tabOverflow: 'guide' }).tabOverflow).toEqual([]);
  });

  it('drops non-boolean values from cardOpen', () => {
    const out = normalizeUiPrefs({ cardOpen: { a: true, b: 'yes', c: 1, d: false } });
    expect(out.cardOpen).toEqual({ a: true, d: false });
  });

  it('ignores a non-object cardOpen (including arrays)', () => {
    expect(normalizeUiPrefs({ cardOpen: ['a', 'b'] }).cardOpen).toEqual({});
    expect(normalizeUiPrefs({ cardOpen: 'nope' }).cardOpen).toEqual({});
  });

  it('defaults showUnscheduled to false when absent or non-boolean', () => {
    expect(normalizeUiPrefs({}).showUnscheduled).toBe(false);
    expect(normalizeUiPrefs({ showUnscheduled: 'yes' }).showUnscheduled).toBe(false);
    expect(normalizeUiPrefs({ showUnscheduled: 1 }).showUnscheduled).toBe(false);
  });

  it('passes through showUnscheduled: true', () => {
    expect(normalizeUiPrefs({ showUnscheduled: true }).showUnscheduled).toBe(true);
  });
});
