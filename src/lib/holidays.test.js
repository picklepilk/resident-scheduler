// src/lib/holidays.test.js
// Pure unit tests for the holiday model — no ResidentScheduler.jsx import, no DOM.
//
// The most load-bearing group here is "strict no-op on empty config": holiday support has to be
// completely inert until a chief turns it on, or every already-saved academic year silently gains
// holiday obligations and every committed quality baseline becomes wrong. That property is asserted
// directly rather than left to be inferred from the arithmetic.
import { describe, it, expect } from 'vitest';
import {
  defaultUsHolidays,
  normalizeHoliday,
  resolveHolidays,
  expandHolidayDates,
  holidayDateSet,
  isHolidayDate,
  holidaysInRange,
  holidayDatesInRange,
  countHolidayShifts,
  holidayNameForDateAnyAy,
  buildHolidayRoster,
} from './holidays.js';

const AY = 'AY26/27';

function confWith(holidays) { return { holidays }; }

describe('strict no-op on empty config', () => {
  // Every one of these is a path the generator or scorer takes on a block whose AY has no
  // configured holidays — i.e. every block that exists today.
  const emptyConfigs = [
    ['undefined ayConf', undefined],
    ['empty ayConf', {}],
    ['ayConf with unrelated keys', { jcDates: ['2026-09-01'], acepStart: '2026-10-05' }],
    ['holidays: null', { holidays: null }],
    ['holidays: not an array', { holidays: { thanksgiving: '2026-11-26' } }],
    ['holidays: []', { holidays: [] }],
  ];

  for (const [label, conf] of emptyConfigs) {
    it(`${label} → no holidays, no dates, nothing is a holiday`, () => {
      expect(resolveHolidays(conf)).toEqual([]);
      expect(holidayDateSet(conf).size).toBe(0);
      expect(holidayDatesInRange('2026-11-01', '2027-01-31', conf)).toEqual([]);
      expect(holidaysInRange('2026-11-01', '2027-01-31', conf)).toEqual([]);
      expect(isHolidayDate('2026-12-25', conf)).toBe(false);
    });
  }

  it('an absent list does NOT derive US defaults (deliberately unlike jcDates)', () => {
    // The whole point of the departure from journalClub.js's derive-on-absent convention. If this
    // ever flips, every saved AY retroactively gains six holidays and the baselines are invalid.
    expect(resolveHolidays({})).toEqual([]);
    expect(defaultUsHolidays(AY).length).toBeGreaterThan(0);
  });

  it('countHolidayShifts is 0 against an empty holiday-date set even for a fully-worked schedule', () => {
    const rs = { '2026-12-24': 'POD-D', '2026-12-25': 'POD-N', '2027-01-01': 'FLEX-D' };
    expect(countHolidayShifts(rs, holidayDateSet({}))).toBe(0);
    expect(countHolidayShifts(rs, new Set())).toBe(0);
  });
});

describe('defaultUsHolidays', () => {
  const list = defaultUsHolidays(AY);
  const byName = Object.fromEntries(list.map(h => [h.name, h]));

  it('returns [] for an unparseable AY string rather than guessing a year', () => {
    expect(defaultUsHolidays('')).toEqual([]);
    expect(defaultUsHolidays('2026')).toEqual([]);
    expect(defaultUsHolidays(undefined)).toEqual([]);
  });

  it('covers the six the chief asked for', () => {
    expect(list).toHaveLength(6);
    expect(Object.keys(byName).sort()).toEqual([
      'Christmas Eve & Day', 'Independence Day', 'Labor Day', 'Memorial Day',
      "New Year's Eve & Day", 'Thanksgiving',
    ]);
  });

  it('places every date inside the AY\'s own July→July window', () => {
    // AY26/27 = 2026-07-01 .. 2027-07-01. A holiday landing outside it would mean the year
    // arithmetic straddled the wrong calendar year.
    for (const h of list) {
      for (const d of expandHolidayDates(h)) {
        expect(d >= '2026-07-01').toBe(true);
        expect(d < '2027-07-01').toBe(true);
      }
    }
  });

  it('computes the floating holidays correctly for AY26/27', () => {
    // 2026: Labor Day = Mon Sep 7; Thanksgiving = 4th Thu Nov = Nov 26.
    // 2027: Memorial Day = last Mon May = May 31.
    expect(byName['Labor Day'].start).toBe('2026-09-07');
    expect(byName['Thanksgiving'].start).toBe('2026-11-26');
    expect(byName['Memorial Day'].start).toBe('2027-05-31');
    expect(byName['Independence Day'].start).toBe('2026-07-04');
  });

  it('models Christmas and New Year as multi-day, New Year spanning the calendar-year boundary', () => {
    expect(byName['Christmas Eve & Day']).toMatchObject({ start: '2026-12-24', end: '2026-12-25' });
    expect(byName["New Year's Eve & Day"]).toMatchObject({ start: '2026-12-31', end: '2027-01-01' });
    expect(expandHolidayDates(byName["New Year's Eve & Day"])).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('produces a list that survives its own normalizer unchanged (round-trip)', () => {
    expect(resolveHolidays(confWith(list))).toEqual([...list].sort((a, b) => a.start.localeCompare(b.start)));
  });

  it('checks a different AY too, so the year arithmetic isn\'t fitted to one case', () => {
    const l = defaultUsHolidays('AY27/28');
    const b = Object.fromEntries(l.map(h => [h.name, h]));
    // 2027: Labor Day = Mon Sep 6; Thanksgiving = 4th Thu Nov = Nov 25. 2028: Memorial = May 29.
    expect(b['Labor Day'].start).toBe('2027-09-06');
    expect(b['Thanksgiving'].start).toBe('2027-11-25');
    expect(b['Memorial Day'].start).toBe('2028-05-29');
  });
});

describe('normalizeHoliday — untrusted stored shapes', () => {
  it('drops entries with no usable start date', () => {
    expect(normalizeHoliday(null)).toBeNull();
    expect(normalizeHoliday('2026-12-25')).toBeNull();
    expect(normalizeHoliday({ name: 'Christmas' })).toBeNull();
    expect(normalizeHoliday({ name: 'Christmas', start: '12/25/2026' })).toBeNull();
    expect(normalizeHoliday({ start: 42 })).toBeNull();
  });

  it('treats a missing, blank, malformed or BACKWARDS end as single-day', () => {
    for (const end of [undefined, '', null, 'nonsense', '2026-12-20']) {
      expect(normalizeHoliday({ name: 'X', start: '2026-12-25', end })).toMatchObject({
        start: '2026-12-25', end: '2026-12-25',
      });
    }
  });

  it('falls back to a generic name and a derived id rather than dropping the entry', () => {
    const h = normalizeHoliday({ start: '2026-12-25' }, 3);
    expect(h.name).toBe('Holiday');
    expect(h.id).toBe('h3_2026-12-25');
  });

  it('trims the name', () => {
    expect(normalizeHoliday({ name: '  Christmas  ', start: '2026-12-25' }).name).toBe('Christmas');
  });
});

describe('resolveHolidays / expandHolidayDates', () => {
  it('drops junk entries but keeps the valid ones, sorted by start date', () => {
    const conf = confWith([
      { id: 'c', name: 'Christmas', start: '2026-12-25' },
      null,
      { name: 'no start' },
      { id: 't', name: 'Thanksgiving', start: '2026-11-26' },
    ]);
    expect(resolveHolidays(conf).map(h => h.name)).toEqual(['Thanksgiving', 'Christmas']);
  });

  it('expands an inclusive range', () => {
    expect(expandHolidayDates({ name: 'X', start: '2026-12-24', end: '2026-12-26' }))
      .toEqual(['2026-12-24', '2026-12-25', '2026-12-26']);
  });

  it('bounds a corrupted range so a year typo cannot swallow the block', () => {
    // 2026-12-24 .. 2027-12-25 would be 367 days without the cap.
    expect(expandHolidayDates({ name: 'typo', start: '2026-12-24', end: '2027-12-25' })).toHaveLength(31);
  });
});

describe('range helpers', () => {
  const conf = confWith([
    { id: 'x', name: 'Christmas', start: '2026-12-24', end: '2026-12-25' },
    { id: 'n', name: "New Year's", start: '2026-12-31', end: '2027-01-01' },
  ]);

  it('holidaysInRange clips a holiday straddling the block boundary to its in-block dates only', () => {
    // A block ending Dec 31 owns New Year's Eve but not New Year's Day.
    const found = holidaysInRange('2026-12-20', '2026-12-31', conf);
    expect(found.map(h => h.name)).toEqual(['Christmas', "New Year's"]);
    expect(found.find(h => h.name === "New Year's").dates).toEqual(['2026-12-31']);
  });

  it('excludes a holiday with no dates in range at all', () => {
    expect(holidaysInRange('2026-11-01', '2026-11-30', conf)).toEqual([]);
    expect(holidayDatesInRange('2026-11-01', '2026-11-30', conf)).toEqual([]);
  });

  it('holidayDatesInRange returns a flat sorted deduped list', () => {
    expect(holidayDatesInRange('2026-12-01', '2027-01-31', conf))
      .toEqual(['2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01']);
  });

  it('returns [] for a missing range rather than throwing', () => {
    expect(holidaysInRange(null, '2027-01-01', conf)).toEqual([]);
    expect(holidayDatesInRange('2026-12-01', undefined, conf)).toEqual([]);
  });
});

describe('countHolidayShifts — a shift STARTING on the holiday counts', () => {
  const dates = new Set(['2026-12-24', '2026-12-25']);

  it('counts a night shift that starts on the holiday and runs into the next day', () => {
    // Schedule cells are keyed by START date app-wide, so this needs no timing logic — the test
    // pins the DEFINITION, which is the part that could be argued the other way.
    expect(countHolidayShifts({ '2026-12-25': 'POD-N' }, dates)).toBe(1);
  });

  it('does NOT count a night shift starting the day AFTER the holiday', () => {
    expect(countHolidayShifts({ '2026-12-26': 'POD-N' }, dates)).toBe(0);
  });

  it('counts each holiday date worked, once per date', () => {
    expect(countHolidayShifts({ '2026-12-24': 'POD-D', '2026-12-25': 'POD-N' }, dates)).toBe(2);
  });

  it('counts nothing for a resident who is off (the "unavailable, not spared" choice)', () => {
    // A resident on vacation simply has no cell on those dates. They are not credited, and not
    // excluded — their 0 is what makes them a stronger candidate for the next holiday.
    expect(countHolidayShifts({ '2026-12-20': 'POD-D' }, dates)).toBe(0);
    expect(countHolidayShifts({}, dates)).toBe(0);
    expect(countHolidayShifts(undefined, dates)).toBe(0);
  });
});

describe('holidayNameForDateAnyAy', () => {
  const ayData = {
    'AY26/27': confWith([{ id: 'c', name: 'Christmas', start: '2026-12-25' }]),
    'AY27/28': confWith([{ id: 'j', name: 'Independence Day', start: '2027-07-04' }]),
  };

  it('resolves a date against its OWN academic year, not a fixed one', () => {
    expect(holidayNameForDateAnyAy('2026-12-25', ayData)).toBe('Christmas');
    expect(holidayNameForDateAnyAy('2027-07-04', ayData)).toBe('Independence Day');
  });

  it('rolls the academic year over on July 1', () => {
    // 2027-06-30 is still AY26/27 (which has no July 4 entry); 2027-07-01 is AY27/28.
    expect(holidayNameForDateAnyAy('2027-06-30', ayData)).toBeNull();
    expect(holidayNameForDateAnyAy('2027-07-04', ayData)).toBe('Independence Day');
  });

  it('returns null for an AY with no configuration — never a derived fallback', () => {
    expect(holidayNameForDateAnyAy('2030-12-25', ayData)).toBeNull();
    expect(holidayNameForDateAnyAy('2026-12-25', {})).toBeNull();
    expect(holidayNameForDateAnyAy(null, ayData)).toBeNull();
    expect(holidayNameForDateAnyAy('2026-12-25', null)).toBeNull();
  });
});

describe('buildHolidayRoster', () => {
  const conf = confWith([{ id: 'c', name: 'Christmas', start: '2026-12-24', end: '2026-12-25' }]);
  const residents = [
    { id: 'r1', firstName: 'Ada', lastName: 'Byron' },
    { id: 'r2', firstName: 'Grace', lastName: 'Adams' },
  ];
  const schedule = {
    r1: { '2026-12-25': 'POD-N' },
    r2: { '2026-12-25': 'FLEX-D', '2026-12-26': 'POD-D' },
  };

  it('reports who works each holiday date, LAST-name-sorted, with labels', () => {
    const [christmas] = buildHolidayRoster({
      schedule, residents, startDate: '2026-12-20', endDate: '2026-12-31', ayConf: conf,
      shiftLabelFor: sid => sid.toLowerCase(),
    });
    expect(christmas.name).toBe('Christmas');
    expect(christmas.days.map(d => d.date)).toEqual(['2026-12-24', '2026-12-25']);
    expect(christmas.days[0].assignments).toEqual([]);
    expect(christmas.days[1].assignments.map(a => a.name)).toEqual(['Grace Adams', 'Ada Byron']);
    expect(christmas.days[1].assignments[0]).toMatchObject({ shiftId: 'FLEX-D', shiftLabel: 'flex-d' });
  });

  it('ignores shifts on adjacent non-holiday dates', () => {
    const [christmas] = buildHolidayRoster({
      schedule, residents, startDate: '2026-12-20', endDate: '2026-12-31', ayConf: conf,
    });
    const named = christmas.days.flatMap(d => d.assignments.map(a => a.shiftId));
    expect(named).not.toContain('POD-D'); // r2's Dec 26 shift
  });

  it('returns [] when nothing is configured', () => {
    expect(buildHolidayRoster({ schedule, residents, startDate: '2026-12-20', endDate: '2026-12-31', ayConf: {} }))
      .toEqual([]);
  });
});
