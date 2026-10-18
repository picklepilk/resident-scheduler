import { describe, it, expect } from 'vitest';
import {
  isFirstTuesday, getFirstTuesdaysInRange,
  resolveJcDates, jcDatesInRange, isJcDate, isJcDateAnyAy,
} from './journalClub.js';

describe('isFirstTuesday', () => {
  it('is true for a Tuesday on or before the 7th', () => {
    expect(isFirstTuesday('2026-07-07')).toBe(true); // first Tuesday of July 2026
  });

  it('is false for a later Tuesday in the same month', () => {
    expect(isFirstTuesday('2026-07-14')).toBe(false);
  });

  it('is false for a non-Tuesday in the first week', () => {
    expect(isFirstTuesday('2026-07-01')).toBe(false); // Wednesday
  });
});

describe('getFirstTuesdaysInRange', () => {
  it('returns [] when either bound is missing', () => {
    expect(getFirstTuesdaysInRange(null, '2026-07-31')).toEqual([]);
    expect(getFirstTuesdaysInRange('2026-07-01', undefined)).toEqual([]);
  });

  it('finds the single first Tuesday within one month', () => {
    expect(getFirstTuesdaysInRange('2026-07-01', '2026-07-31')).toEqual(['2026-07-07']);
  });

  it('is inclusive of both bounds', () => {
    // 2026-07-07 is itself the first Tuesday; a range starting/ending exactly on it still finds it
    expect(getFirstTuesdaysInRange('2026-07-07', '2026-07-07')).toEqual(['2026-07-07']);
  });

  it('walks month by month across a multi-month range', () => {
    expect(getFirstTuesdaysInRange('2026-07-01', '2026-09-30')).toEqual([
      '2026-07-07', '2026-08-04', '2026-09-01',
    ]);
  });

  it('excludes a first Tuesday that falls outside the exact bounds', () => {
    // First Tuesday of August 2026 is 2026-08-04; a range ending 2026-08-03 must not include it
    expect(getFirstTuesdaysInRange('2026-07-08', '2026-08-03')).toEqual([]);
  });
});

describe('resolveJcDates (no stored list)', () => {
  it('absent config yields NO dates (logged-only model, 2026-10-18)', () => {
    expect(resolveJcDates('AY26/27', undefined)).toEqual([]);
    expect(resolveJcDates('AY26/27', {})).toEqual([]);
    expect(resolveJcDates('', undefined, { fallbackDateStr: '2026-09-15' })).toEqual([]);
  });
});

describe('resolveJcDates (stored override)', () => {
  it('a valid stored list wins over derivation', () => {
    const ayConf = { jcDates: ['2026-09-01', '2026-07-07'] };
    expect(resolveJcDates('AY26/27', ayConf)).toEqual(['2026-07-07', '2026-09-01']); // sorted
  });

  it('an explicitly empty stored list is honored as "no JC dates this AY", not derived', () => {
    expect(resolveJcDates('AY26/27', { jcDates: [] })).toEqual([]);
  });

  it('sorts and dedupes the stored list', () => {
    const ayConf = { jcDates: ['2026-09-01', '2026-07-07', '2026-07-07', '2026-08-04'] };
    expect(resolveJcDates('AY26/27', ayConf)).toEqual(['2026-07-07', '2026-08-04', '2026-09-01']);
  });

  it('non-array jcDates (untrusted shape) yields no dates', () => {
    expect(resolveJcDates('AY26/27', { jcDates: 'nope' })).toEqual([]);
    expect(resolveJcDates('AY26/27', { jcDates: { a: 1 } })).toEqual([]);
  });

  it('an array with garbage entries filters down to only valid date strings', () => {
    const ayConf = { jcDates: ['garbage', '2026-10-06', 42, null, '2026-07-07'] };
    expect(resolveJcDates('AY26/27', ayConf)).toEqual(['2026-07-07', '2026-10-06']);
  });

  it('an array whose entries are ALL garbage still counts as a present (if empty-after-filter) stored list', () => {
    // Filtering down to zero valid entries from a real array is still "the chief's stored list",
    // distinct from an absent/non-array value — it must not silently derive instead.
    expect(resolveJcDates('AY26/27', { jcDates: ['garbage', 42, null] })).toEqual([]);
  });
});

describe('jcDatesInRange', () => {
  it('clips logged dates to the given range, inclusive', () => {
    const logged = { jcDates: ['2026-07-07', '2026-08-04', '2026-09-01', '2026-10-06'] };
    expect(jcDatesInRange('2026-07-01', '2026-09-30', 'AY26/27', logged)).toEqual([
      '2026-07-07', '2026-08-04', '2026-09-01',
    ]);
  });

  it('returns [] when either bound is falsy', () => {
    expect(jcDatesInRange(null, '2026-09-30', 'AY26/27', undefined)).toEqual([]);
    expect(jcDatesInRange('2026-07-01', '', 'AY26/27', undefined)).toEqual([]);
  });

  it('clips a stored override list the same way', () => {
    const ayConf = { jcDates: ['2026-07-07', '2026-08-04', '2026-09-01'] };
    expect(jcDatesInRange('2026-07-08', '2026-08-31', 'AY26/27', ayConf)).toEqual(['2026-08-04']);
  });
});

describe('isJcDate', () => {
  it('is true for a logged date', () => {
    expect(isJcDate('2026-08-04', 'AY26/27', { jcDates: ['2026-08-04'] })).toBe(true);
  });

  it('is false for a non-JC date and when nothing is logged', () => {
    expect(isJcDate('2026-08-05', 'AY26/27', { jcDates: ['2026-08-04'] })).toBe(false);
    expect(isJcDate('2026-08-04', 'AY26/27', undefined)).toBe(false);
  });

  it('reflects a stored override (a date not a first-Tuesday can be added; one can be removed)', () => {
    const ayConf = { jcDates: ['2026-08-05'] }; // not the natural first Tuesday
    expect(isJcDate('2026-08-05', 'AY26/27', ayConf)).toBe(true);
    expect(isJcDate('2026-08-04', 'AY26/27', ayConf)).toBe(false); // no longer in the (overridden) list
  });
});

describe('isJcDateAnyAy', () => {
  it('uses the stored list for an AY present in ayData', () => {
    const ayData = { 'AY26/27': { jcDates: ['2026-08-05'] } };
    expect(isJcDateAnyAy('2026-08-05', ayData)).toBe(true);
    expect(isJcDateAnyAy('2026-08-04', ayData)).toBe(false);
  });

  it('an AY absent from ayData has no JC dates', () => {
    expect(isJcDateAnyAy('2026-08-04', {})).toBe(false);
    expect(isJcDateAnyAy('2026-08-04', undefined)).toBe(false);
  });

  it('resolves the correct AY for a date near the July 1 cutoff', () => {
    // 2026-06-30 belongs to AY25/26, not AY26/27
    const ayData = { 'AY25/26': { jcDates: ['2026-06-30'] } };
    expect(isJcDateAnyAy('2026-06-30', ayData)).toBe(true);
  });
});
