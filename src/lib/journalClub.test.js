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

describe('resolveJcDates (derivation, no stored list)', () => {
  it('derives all 12 first-Tuesdays for AY26/27 (July 2026 - June 2027)', () => {
    const dates = resolveJcDates('AY26/27', undefined);
    expect(dates).toEqual([
      '2026-07-07', '2026-08-04', '2026-09-01', '2026-10-06', '2026-11-03', '2026-12-01',
      '2027-01-05', '2027-02-02', '2027-03-02', '2027-04-06', '2027-05-04', '2027-06-01',
    ]);
    expect(dates).toHaveLength(12);
  });

  it('respects the exclusive-end boundary: the AY start window end (next July 1) never appears', () => {
    const dates = resolveJcDates('AY26/27', undefined);
    expect(dates).not.toContain('2027-07-01');
    expect(dates[dates.length - 1]).toBe('2027-06-01'); // June's first Tuesday, the AY's true last month
  });

  it('returns [] for a malformed AY string with no fallback', () => {
    expect(resolveJcDates('not-an-ay', undefined)).toEqual([]);
    expect(resolveJcDates('', undefined)).toEqual([]);
    expect(resolveJcDates(undefined, undefined)).toEqual([]);
  });

  it('resolves via fallbackDateStr when the AY string is malformed/blank', () => {
    const viaFallback = resolveJcDates('', undefined, { fallbackDateStr: '2026-09-15' });
    expect(viaFallback).toEqual(resolveJcDates('AY26/27', undefined));
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

  it('non-array jcDates (untrusted shape) falls back to derivation', () => {
    expect(resolveJcDates('AY26/27', { jcDates: 'nope' })).toEqual(resolveJcDates('AY26/27', undefined));
    expect(resolveJcDates('AY26/27', { jcDates: { a: 1 } })).toEqual(resolveJcDates('AY26/27', undefined));
    expect(resolveJcDates('AY26/27', undefined)).toEqual(resolveJcDates('AY26/27', {}));
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
  it('clips derived dates to the given range, inclusive', () => {
    expect(jcDatesInRange('2026-07-01', '2026-09-30', 'AY26/27', undefined)).toEqual([
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
  it('is true for a derived first Tuesday', () => {
    expect(isJcDate('2026-08-04', 'AY26/27', undefined)).toBe(true);
  });

  it('is false for a non-JC date', () => {
    expect(isJcDate('2026-08-05', 'AY26/27', undefined)).toBe(false);
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

  it('derives for an AY absent from ayData rather than returning false', () => {
    // 2026-08-04 is a genuine first Tuesday; ayData has no AY26/27 entry at all
    expect(isJcDateAnyAy('2026-08-04', {})).toBe(true);
    expect(isJcDateAnyAy('2026-08-04', undefined)).toBe(true);
    expect(isJcDateAnyAy('2026-08-05', {})).toBe(false);
  });

  it('resolves the correct AY for a date near the July 1 cutoff', () => {
    // 2026-06-30 belongs to AY25/26, not AY26/27
    const ayData = { 'AY25/26': { jcDates: ['2026-06-30'] } };
    expect(isJcDateAnyAy('2026-06-30', ayData)).toBe(true);
  });
});
