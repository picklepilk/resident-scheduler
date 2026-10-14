// src/lib/offServiceWindow.test.js
import { describe, it, expect } from 'vitest';
import { offServiceStraddle } from './offServiceWindow.js';

const BLOCK_START = '2026-07-06';
const BLOCK_END = '2026-07-19';

describe('offServiceStraddle', () => {
  it('returns null when there are no ranges', () => {
    expect(offServiceStraddle([], BLOCK_START, BLOCK_END)).toBeNull();
    expect(offServiceStraddle(null, BLOCK_START, BLOCK_END)).toBeNull();
  });

  it('returns null when the block has no start/end', () => {
    expect(offServiceStraddle([{ start: '2026-07-01', end: '2026-07-30' }], null, BLOCK_END)).toBeNull();
    expect(offServiceStraddle([{ start: '2026-07-01', end: '2026-07-30' }], BLOCK_START, undefined)).toBeNull();
  });

  it('returns null when the window is fully inside the block', () => {
    const r = offServiceStraddle([{ start: '2026-07-10', end: '2026-07-15' }], BLOCK_START, BLOCK_END);
    expect(r).toBeNull();
  });

  it('returns null when the window exactly matches the block bounds', () => {
    const r = offServiceStraddle([{ start: BLOCK_START, end: BLOCK_END }], BLOCK_START, BLOCK_END);
    expect(r).toBeNull();
  });

  it('skips malformed ranges (missing start/end, or start after end)', () => {
    const r = offServiceStraddle([{ start: null, end: '2026-07-30' }, { start: '2026-07-20', end: '2026-07-10' }], BLOCK_START, BLOCK_END);
    expect(r).toBeNull();
  });

  it('after-only: window continues past the block end', () => {
    // Block ends 07-19; window runs through 07-26 -> 7 days after (07-20..07-26).
    const r = offServiceStraddle([{ start: '2026-07-13', end: '2026-07-26' }], BLOCK_START, BLOCK_END);
    expect(r).toEqual({ daysBefore: 0, daysAfter: 7, label: 'ER window continues → 7 days after this block' });
  });

  it('before-only: window started before the block', () => {
    // Block starts 07-06; window started 07-01 -> 5 days before (07-01..07-05).
    const r = offServiceStraddle([{ start: '2026-07-01', end: '2026-07-12' }], BLOCK_START, BLOCK_END);
    expect(r).toEqual({ daysBefore: 5, daysAfter: 0, label: '← 5 days before this block' });
  });

  it('both directions: window encloses the block entirely (singular "day" wording at n=1)', () => {
    // 1 day before (07-05) and 1 day after (07-20).
    const r = offServiceStraddle([{ start: '2026-07-05', end: '2026-07-20' }], BLOCK_START, BLOCK_END);
    expect(r).toEqual({ daysBefore: 1, daysAfter: 1, label: '← 1 day before · 1 day after →' });
  });

  it('sums across multiple ranges', () => {
    const ranges = [
      { start: '2026-07-01', end: '2026-07-04' }, // 2 days before (07-04, 07-05) -> actually fully before block, clipped to itself
      { start: '2026-07-18', end: '2026-07-22' }, // overlaps block tail, 3 days after (07-20..07-22)
    ];
    const r = offServiceStraddle(ranges, BLOCK_START, BLOCK_END);
    // First range: entirely before block start (07-04 < 07-06), so daysBefore = full range = 4 days.
    expect(r.daysBefore).toBe(4);
    expect(r.daysAfter).toBe(3);
  });
});
