// src/lib/jeopardyWindow.test.js
// R4 (rule-policy plan, 2026-09-26, memory rule-override-policy): a jeopardy call on date D blocks
// the whole window [D 07:00, D+1 07:00) — an overnight starting D-1 that runs past 07:00 D, or any
// shift starting on D itself.
import { describe, it, expect } from 'vitest';
import { shiftOverlapsJeopardyWindow, scheduleHitsJeopardyWindow, jeopardyWindowBounds } from './jeopardyWindow.js';

describe('shiftOverlapsJeopardyWindow', () => {
  it('POD-N (23:00-08:00) worked D-1 runs past 07:00 D — blocked', () => {
    expect(shiftOverlapsJeopardyWindow('POD-N', '2026-07-07', '2026-07-08')).toBe(true);
  });

  it('PED-N (19:00-04:00) worked D-1 ends 04:00 D, clear of the 07:00 window — NOT blocked', () => {
    expect(shiftOverlapsJeopardyWindow('PED-N', '2026-07-07', '2026-07-08')).toBe(false);
  });

  it('TRAUMA-N (18:00-06:00) worked D-1 ends 06:00 D, clear of the 07:00 window — NOT blocked', () => {
    expect(shiftOverlapsJeopardyWindow('TRAUMA-N', '2026-07-07', '2026-07-08')).toBe(false);
  });

  it('any shift starting ON D itself is blocked, regardless of type', () => {
    expect(shiftOverlapsJeopardyWindow('POD-D', '2026-07-08', '2026-07-08')).toBe(true);
    expect(shiftOverlapsJeopardyWindow('FLEX-E', '2026-07-08', '2026-07-08')).toBe(true);
    expect(shiftOverlapsJeopardyWindow('POD-N', '2026-07-08', '2026-07-08')).toBe(true);
  });

  it('a shift on a date far from D never overlaps', () => {
    expect(shiftOverlapsJeopardyWindow('POD-D', '2026-07-01', '2026-07-08')).toBe(false);
  });

  it('an unrecognized shift id never overlaps', () => {
    expect(shiftOverlapsJeopardyWindow('NOT-A-SHIFT', '2026-07-07', '2026-07-08')).toBe(false);
  });
});

describe('jeopardyWindowBounds', () => {
  it('spans exactly 24h starting 07:00 the jeopardy date', () => {
    const { startMs, endMs } = jeopardyWindowBounds('2026-07-08');
    expect(endMs - startMs).toBe(24 * 60 * 60 * 1000);
    expect(new Date(startMs).getHours()).toBe(7);
  });
});

describe('scheduleHitsJeopardyWindow', () => {
  it('true when the resident has a same-day shift on the jeopardy date', () => {
    const rs = { '2026-07-08': 'POD-D' };
    expect(scheduleHitsJeopardyWindow(rs, '2026-07-08')).toBe(true);
  });

  it('true when the resident has a D-1 overnight running past 07:00 D', () => {
    const rs = { '2026-07-07': 'POD-N' };
    expect(scheduleHitsJeopardyWindow(rs, '2026-07-08')).toBe(true);
  });

  it('false when the D-1 shift is a PED-N that clears the window', () => {
    const rs = { '2026-07-07': 'PED-N' };
    expect(scheduleHitsJeopardyWindow(rs, '2026-07-08')).toBe(false);
  });

  it('false for an empty/unrelated schedule', () => {
    expect(scheduleHitsJeopardyWindow({}, '2026-07-08')).toBe(false);
    expect(scheduleHitsJeopardyWindow({ '2026-07-01': 'POD-D' }, '2026-07-08')).toBe(false);
  });
});
