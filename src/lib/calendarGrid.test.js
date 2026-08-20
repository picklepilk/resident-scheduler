import { describe, it, expect } from 'vitest';
import { paddedCalendarWeeks, monthDates, monthsInRange, sameMonth } from './calendarGrid.js';

describe('paddedCalendarWeeks', () => {
  it('returns [] for an empty list', () => {
    expect(paddedCalendarWeeks([])).toEqual([]);
    expect(paddedCalendarWeeks(undefined)).toEqual([]);
  });

  it('pads the first week to start on Sunday', () => {
    // 2026-08-01 is a Saturday (day 6) — 6 leading nulls.
    const dates = ['2026-08-01', '2026-08-02', '2026-08-03'];
    const weeks = paddedCalendarWeeks(dates);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-08-01']);
    expect(weeks[1]).toEqual(['2026-08-02', '2026-08-03', null, null, null, null, null]);
  });

  it('every row has exactly 7 cells', () => {
    const dates = monthDates(2026, 8);
    for (const row of paddedCalendarWeeks(dates)) expect(row).toHaveLength(7);
  });

  it('a Sunday-first date list needs no leading padding', () => {
    // 2026-08-02 is a Sunday.
    const weeks = paddedCalendarWeeks(['2026-08-02', '2026-08-03']);
    expect(weeks[0][0]).toBe('2026-08-02');
  });
});

describe('monthDates', () => {
  it('enumerates every day of a 31-day month', () => {
    const dates = monthDates(2026, 8);
    expect(dates).toHaveLength(31);
    expect(dates[0]).toBe('2026-08-01');
    expect(dates[30]).toBe('2026-08-31');
  });

  it('handles February in a leap year', () => {
    expect(monthDates(2028, 2)).toHaveLength(29);
  });

  it('handles February in a non-leap year', () => {
    expect(monthDates(2026, 2)).toHaveLength(28);
  });

  it('handles a December→January month index correctly (1-indexed month)', () => {
    const dates = monthDates(2026, 12);
    expect(dates[0]).toBe('2026-12-01');
    expect(dates[dates.length - 1]).toBe('2026-12-31');
  });
});

describe('monthsInRange', () => {
  it('returns [] for a missing range', () => {
    expect(monthsInRange(null, '2026-08-01')).toEqual([]);
    expect(monthsInRange('2026-08-01', null)).toEqual([]);
  });

  it('returns a single month when the range fits inside one', () => {
    expect(monthsInRange('2026-08-05', '2026-08-20')).toEqual([{ year: 2026, month: 8 }]);
  });

  it('spans a year boundary', () => {
    expect(monthsInRange('2026-12-15', '2027-01-10')).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });

  it('a typical ~28-day block spans exactly two months', () => {
    // Mirrors a real block: starts mid-month, runs 28 days.
    expect(monthsInRange('2026-08-16', '2026-09-12')).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ]);
  });
});

describe('sameMonth', () => {
  it('compares year+month pairs', () => {
    expect(sameMonth({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe(true);
    expect(sameMonth({ year: 2026, month: 8 }, { year: 2026, month: 9 })).toBe(false);
    expect(sameMonth(null, { year: 2026, month: 8 })).toBe(false);
  });
});
