// src/lib/toastHistory.test.js
import { describe, it, expect } from 'vitest';
import { addToastEntry, clearToastHistory, formatToastAge, TOAST_HISTORY_LIMIT } from './toastHistory.js';

describe('addToastEntry', () => {
  it('prepends the new toast so newest is first', () => {
    const h1 = addToastEntry([], { msg: 'first', tone: 'green', at: 1 });
    const h2 = addToastEntry(h1, { msg: 'second', tone: 'red', at: 2 });
    expect(h2.map(e => e.msg)).toEqual(['second', 'first']);
  });

  it('defaults tone to amber and stamps `at` with now() when not given', () => {
    const before = Date.now();
    const [entry] = addToastEntry([], { msg: 'plain' });
    const after = Date.now();
    expect(entry.tone).toBe('amber');
    expect(entry.at).toBeGreaterThanOrEqual(before);
    expect(entry.at).toBeLessThanOrEqual(after);
  });

  it('caps the list at the given limit, dropping the oldest', () => {
    let h = [];
    for (let i = 0; i < 5; i++) h = addToastEntry(h, { msg: `m${i}`, at: i }, 3);
    expect(h).toHaveLength(3);
    expect(h.map(e => e.msg)).toEqual(['m4', 'm3', 'm2']);
  });

  it('defaults to TOAST_HISTORY_LIMIT when no limit is given', () => {
    let h = [];
    for (let i = 0; i < TOAST_HISTORY_LIMIT + 5; i++) h = addToastEntry(h, { msg: `m${i}`, at: i });
    expect(h).toHaveLength(TOAST_HISTORY_LIMIT);
    expect(h[0].msg).toBe(`m${TOAST_HISTORY_LIMIT + 4}`);
  });

  it('is a no-op for a toast with no message', () => {
    expect(addToastEntry([{ msg: 'a', tone: 'red', at: 1 }], { tone: 'red' })).toEqual([{ msg: 'a', tone: 'red', at: 1 }]);
    expect(addToastEntry([], null)).toEqual([]);
  });

  it('tolerates a malformed history (never crashes on a bad initial value)', () => {
    expect(addToastEntry(undefined, { msg: 'x', at: 1 })).toEqual([{ msg: 'x', tone: 'amber', at: 1 }]);
    expect(addToastEntry('not-an-array', { msg: 'x', at: 1 })).toEqual([{ msg: 'x', tone: 'amber', at: 1 }]);
  });
});

describe('clearToastHistory', () => {
  it('returns an empty list', () => {
    expect(clearToastHistory()).toEqual([]);
  });
});

describe('formatToastAge', () => {
  const now = 1_000_000_000;
  it('reads "just now" for anything under a minute old', () => {
    expect(formatToastAge(now - 30_000, now)).toBe('just now');
    expect(formatToastAge(now, now)).toBe('just now');
  });

  it('reads "Nm ago" between one minute and one hour', () => {
    expect(formatToastAge(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatToastAge(now - 59 * 60_000, now)).toBe('59m ago');
  });

  it('reads "Nh ago" between one hour and one day', () => {
    expect(formatToastAge(now - 2 * 3_600_000, now)).toBe('2h ago');
    expect(formatToastAge(now - 23 * 3_600_000, now)).toBe('23h ago');
  });

  it('falls back to a locale clock time at a day or older', () => {
    const dayAgo = now - 25 * 3_600_000;
    expect(formatToastAge(dayAgo, now)).toBe(new Date(dayAgo).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  });

  it('tolerates a future/invalid timestamp by falling back to a clock time rather than a negative age', () => {
    expect(formatToastAge(now + 10_000, now)).toBe(new Date(now + 10_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  });
});
