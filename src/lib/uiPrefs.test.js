import { describe, it, expect } from 'vitest';
import { normalizeUiPrefs, DEFAULT_UI_PREFS, clampGridZoom, clampGridColExtra, GRID_ZOOM_MIN, GRID_ZOOM_MAX, GRID_COL_EXTRA_MAX } from './uiPrefs.js';

describe('normalizeUiPrefs', () => {
  it('defaults on null/undefined', () => {
    expect(normalizeUiPrefs(null)).toEqual({ tabOverflow: [], cardOpen: {}, showUnscheduled: false, gridZoom: 100, gridColExtra: 0 });
    expect(normalizeUiPrefs(undefined)).toEqual({ tabOverflow: [], cardOpen: {}, showUnscheduled: false, gridZoom: 100, gridColExtra: 0 });
  });

  it('passes through a well-formed shape', () => {
    const raw = { tabOverflow: ['guide', 'whatsnew'], cardOpen: { 'dash-equity': false, 'settings-qgenda': true }, showUnscheduled: true };
    expect(normalizeUiPrefs(raw)).toEqual({ ...raw, gridZoom: 100, gridColExtra: 0 });
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

// Grid readability prefs. These are device-local display state (same posture as res_dark_mode),
// so the only contract that matters is: a persisted value of ANY shape reads back as something
// the grid can render at.
describe('grid zoom / column width prefs', () => {
  it('defaults to 100% zoom and no extra column width', () => {
    expect(DEFAULT_UI_PREFS.gridZoom).toBe(100);
    expect(DEFAULT_UI_PREFS.gridColExtra).toBe(0);
    expect(normalizeUiPrefs({})).toMatchObject({ gridZoom: 100, gridColExtra: 0 });
  });

  it('clamps an out-of-range persisted value back into range rather than dropping it', () => {
    expect(normalizeUiPrefs({ gridZoom: 5 }).gridZoom).toBe(GRID_ZOOM_MIN);
    expect(normalizeUiPrefs({ gridZoom: 9000 }).gridZoom).toBe(GRID_ZOOM_MAX);
    expect(normalizeUiPrefs({ gridColExtra: -40 }).gridColExtra).toBe(0);
    expect(normalizeUiPrefs({ gridColExtra: 9000 }).gridColExtra).toBe(GRID_COL_EXTRA_MAX);
  });

  it('falls back to the default for a non-numeric value', () => {
    for (const junk of ['big', null, {}, [], NaN, true]) {
      expect(normalizeUiPrefs({ gridZoom: junk }).gridZoom).toBe(100);
      expect(normalizeUiPrefs({ gridColExtra: junk }).gridColExtra).toBe(0);
    }
  });

  it('rounds a fractional value (CSS zoom of 87.3333% serves no one)', () => {
    expect(clampGridZoom(87.4)).toBe(87);
    expect(clampGridColExtra(11.6)).toBe(12);
  });

  it('preserves a valid stored value', () => {
    expect(normalizeUiPrefs({ gridZoom: 130, gridColExtra: 36 }))
      .toMatchObject({ gridZoom: 130, gridColExtra: 36 });
  });
});
