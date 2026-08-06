import { describe, it, expect } from 'vitest';
import {
  toDateStr, parseDate, addDays, formatAY, getAcademicYearFor,
  getBlockDates, getBlockWeekends, ayWindowFor, qgendaDate,
} from './dates.js';

describe('parseDate / toDateStr round-trip', () => {
  it('parses YYYY-MM-DD as a local-midnight Date', () => {
    const d = parseDate('2026-07-01');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // 0-indexed July
    expect(d.getDate()).toBe(1);
  });

  it('round-trips through toDateStr for a plain date', () => {
    expect(toDateStr(parseDate('2026-03-15'))).toBe('2026-03-15');
  });

  it('returns null for an Invalid Date instead of throwing', () => {
    expect(toDateStr(new Date(NaN))).toBeNull();
  });
});

describe('addDays', () => {
  it('advances across a month boundary', () => {
    expect(toDateStr(addDays(parseDate('2026-01-31'), 1))).toBe('2026-02-01');
  });

  it('advances across a leap-day boundary (2028 is a leap year)', () => {
    expect(toDateStr(addDays(parseDate('2028-02-28'), 1))).toBe('2028-02-29');
    expect(toDateStr(addDays(parseDate('2028-02-29'), 1))).toBe('2028-03-01');
  });

  it('does not roll over on Feb 28 in a non-leap year', () => {
    expect(toDateStr(addDays(parseDate('2027-02-28'), 1))).toBe('2027-03-01');
  });

  it('supports negative deltas', () => {
    expect(toDateStr(addDays(parseDate('2026-07-01'), -1))).toBe('2026-06-30');
  });
});

describe('formatAY / getAcademicYearFor (July 1 cutoff)', () => {
  it('formats a start year as AYyy/yy', () => {
    expect(formatAY(2026)).toBe('AY26/27');
  });

  it('a date on or after July 1 belongs to the AY starting that year', () => {
    expect(getAcademicYearFor('2026-07-01')).toBe('AY26/27');
    expect(getAcademicYearFor('2027-06-30')).toBe('AY26/27');
  });

  it('a date before July 1 belongs to the prior AY', () => {
    expect(getAcademicYearFor('2026-06-30')).toBe('AY25/26');
  });
});

describe('getBlockDates', () => {
  it('returns an inclusive list of YYYY-MM-DD strings', () => {
    const dates = getBlockDates('2026-07-01', '2026-07-03');
    expect(dates).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });

  it('returns a single-element array when start === end', () => {
    expect(getBlockDates('2026-07-01', '2026-07-01')).toEqual(['2026-07-01']);
  });

  it('returns [] when either boundary is missing', () => {
    expect(getBlockDates(null, '2026-07-01')).toEqual([]);
    expect(getBlockDates('2026-07-01', undefined)).toEqual([]);
    expect(getBlockDates('', '')).toEqual([]);
  });

  it('returns [] when a boundary fails to parse (garbage date), not an array of nulls', () => {
    expect(getBlockDates('not-a-date', '2026-07-01')).toEqual([]);
    expect(getBlockDates('2026-07-01', 'also-garbage')).toEqual([]);
  });

  it('spans a month/year boundary correctly', () => {
    const dates = getBlockDates('2026-12-30', '2027-01-02');
    expect(dates).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
});

describe('getBlockWeekends', () => {
  it('pairs a Saturday with the following Sunday when both are in range', () => {
    // 2026-07-04 is a Saturday, 2026-07-05 is a Sunday
    const dates = getBlockDates('2026-07-01', '2026-07-07');
    expect(getBlockWeekends(dates)).toEqual([['2026-07-04', '2026-07-05']]);
  });

  it('excludes a weekend that straddles the block edge (only Saturday in range)', () => {
    const dates = getBlockDates('2026-07-01', '2026-07-04'); // ends on the Saturday, no Sunday
    expect(getBlockWeekends(dates)).toEqual([]);
  });

  it('returns [] for a block with no full weekend', () => {
    const dates = getBlockDates('2026-07-01', '2026-07-02'); // Wed/Thu
    expect(getBlockWeekends(dates)).toEqual([]);
  });
});

describe('qgendaDate', () => {
  it('formats a single-digit day/month with a 4-digit year, no zero-padding', () => {
    expect(qgendaDate('2026-09-21')).toBe('9/21/2026');
  });

  it('does not zero-pad a double-digit month/day', () => {
    expect(qgendaDate('2026-12-25')).toBe('12/25/2026');
  });

  it('returns "" for a falsy input', () => {
    expect(qgendaDate('')).toBe('');
    expect(qgendaDate(null)).toBe('');
    expect(qgendaDate(undefined)).toBe('');
  });
});

describe('ayWindowFor', () => {
  it('returns an exclusive-end July-to-July window for a valid AY string', () => {
    expect(ayWindowFor('AY26/27')).toEqual({ start: '2026-07-01', end: '2027-07-01' });
  });

  it('returns null for a malformed AY string', () => {
    expect(ayWindowFor('2026/27')).toBeNull();
    expect(ayWindowFor('AY2026/27')).toBeNull();
    expect(ayWindowFor('')).toBeNull();
    expect(ayWindowFor(undefined)).toBeNull();
  });
});
