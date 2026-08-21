import { describe, it, expect } from 'vitest';
import { shiftGapsFor, formatGapH, gapIsShort, SHIFT_TIMING } from './shifts.js';

describe('shiftGapsFor', () => {
  it('computes the exact gap across a midnight-crossing shift (PED-N 19:00+9h -> 04:00 next day)', () => {
    // PED-N on 08-04 ends 04:00 on 08-05; POD-D on 08-05 starts 07:00 -> 3h gap.
    const rs = { '2026-08-04': 'PED-N', '2026-08-05': 'POD-D' };
    const out = shiftGapsFor(rs, '2026-08-05');
    expect(out.prev).toEqual({ ds: '2026-08-04', sid: 'PED-N', gapH: 3 });
    expect(out.next).toBeNull();

    // Same pair, viewed from the earlier date: next should report the identical 3h gap.
    const outPrevSide = shiftGapsFor(rs, '2026-08-04');
    expect(outPrevSide.next).toEqual({ ds: '2026-08-05', sid: 'POD-D', gapH: 3 });
    expect(outPrevSide.prev).toBeNull();
  });

  it('returns prev: null for the first assignment in the row', () => {
    const rs = { '2026-08-05': 'POD-D', '2026-08-06': 'POD-D' };
    const out = shiftGapsFor(rs, '2026-08-05');
    expect(out.prev).toBeNull();
    expect(out.next).not.toBeNull();
  });

  it('returns next: null for the last assignment in the row', () => {
    const rs = { '2026-08-04': 'POD-D', '2026-08-05': 'POD-D' };
    const out = shiftGapsFor(rs, '2026-08-05');
    expect(out.next).toBeNull();
    expect(out.prev).not.toBeNull();
  });

  it('returns { prev: null, next: null } for an empty row', () => {
    expect(shiftGapsFor({}, '2026-08-05')).toEqual({ prev: null, next: null });
  });

  it('returns { prev: null, next: null } when the target date has no shift', () => {
    const rs = { '2026-08-04': 'POD-D', '2026-08-06': 'POD-D' };
    expect(shiftGapsFor(rs, '2026-08-05')).toEqual({ prev: null, next: null });
  });

  it('returns { prev: null, next: null } when the target date holds an unrecognized shift id', () => {
    const rs = { '2026-08-04': 'POD-D', '2026-08-05': 'NOT-A-SHIFT', '2026-08-06': 'POD-D' };
    expect(shiftGapsFor(rs, '2026-08-05')).toEqual({ prev: null, next: null });
  });

  it('skips null/undefined entries and unrecognized ids elsewhere in the row when finding neighbors', () => {
    const rs = {
      '2026-08-01': 'POD-D',
      '2026-08-02': null,
      '2026-08-03': undefined,
      '2026-08-04': 'NOT-A-SHIFT',
      '2026-08-05': 'POD-D',
    };
    const out = shiftGapsFor(rs, '2026-08-05');
    expect(out.prev.ds).toBe('2026-08-01');
  });

  it('finds non-adjacent neighbors several days away and reports the correct gap', () => {
    // POD-D on 08-01 (07:00-16:00) ... POD-D on 08-10 (07:00-16:00): gap = (10-1)*24 - 9 = 207h.
    const rs = { '2026-08-01': 'POD-D', '2026-08-10': 'POD-D' };
    const out = shiftGapsFor(rs, '2026-08-10');
    expect(out.prev).toEqual({ ds: '2026-08-01', sid: 'POD-D', gapH: 207 });
  });

  it('reports a negative gap, unclamped, when shifts effectively overlap', () => {
    // POD-N on 08-04 (23:00+9h) ends 08:00 on 08-05; PED-D on 08-05 starts 07:00 -> -1h gap.
    // Not a combination checkRestViolations would allow to persist, but shiftGapsFor is pure
    // date-arithmetic and must not clamp or hide it.
    const rs = { '2026-08-04': 'POD-N', '2026-08-05': 'PED-D' };
    const out = shiftGapsFor(rs, '2026-08-05');
    expect(out.prev.gapH).toBe(-1);
  });
});

describe('formatGapH', () => {
  it('formats a whole-hour gap with no decimal', () => {
    expect(formatGapH(34)).toBe('34h');
  });

  it('formats a fractional gap to one decimal', () => {
    expect(formatGapH(10.5)).toBe('10.5h');
  });

  it('returns empty string for non-finite input', () => {
    expect(formatGapH(NaN)).toBe('');
    expect(formatGapH(Infinity)).toBe('');
    expect(formatGapH(-Infinity)).toBe('');
  });

  it('formats a negative gap (not clamped)', () => {
    expect(formatGapH(-2)).toBe('-2h');
  });
});

describe('gapIsShort', () => {
  it('is true when the gap is shorter than the earlier shift\'s own duration', () => {
    // POD-D is a 9h shift (SHIFT_TIMING['POD-D'].durationH === 9).
    expect(SHIFT_TIMING['POD-D'].durationH).toBe(9);
    expect(gapIsShort('POD-D', 8)).toBe(true);
  });

  it('is false when the gap meets or exceeds the earlier shift\'s own duration', () => {
    expect(gapIsShort('POD-D', 9)).toBe(false);
    expect(gapIsShort('POD-D', 10)).toBe(false);
  });

  it('is false for an unrecognized shift id', () => {
    expect(gapIsShort('NOT-A-SHIFT', 1)).toBe(false);
  });

  it('is false for a non-finite gap', () => {
    expect(gapIsShort('POD-D', NaN)).toBe(false);
  });
});
