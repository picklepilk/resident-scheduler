import { describe, it, expect } from 'vitest';
import { classifyRosterDept, splitRosterName, parseRosterRotationRows } from './rosterRows.js';

describe('classifyRosterDept', () => {
  it('maps scheduled departments', () => {
    for (const [raw, cat] of [['ANES', 'ANES'], ['PED', 'PEDS'], ['FM', 'FM'], ['POD', 'POD'], ['PSYC', 'PSYCH'], ['Int Med', 'IM'], ['NEURO', 'NEURO'], ['BAMC', 'EM_BAMC']]) {
      expect(classifyRosterDept(raw)).toEqual({ category: cat, scheduledByUs: true, reference: false, note: false });
    }
  });
  it('treats BAMC PA spellings as reference only', () => {
    for (const raw of ['BAMC PA', 'BAMCPA', 'BAMC-PA', 'bamc pa']) {
      expect(classifyRosterDept(raw)).toEqual({ category: null, scheduledByUs: false, reference: true, note: false });
    }
  });
  it('flags long text as note', () => {
    expect(classifyRosterDept('BAMC - Once rotator has been cleared by badging').note).toBe(true);
  });
  it('blank/unknown give nothing', () => {
    expect(classifyRosterDept('')).toEqual({ category: null, scheduledByUs: false, reference: false, note: false });
    expect(classifyRosterDept('XYZ').category).toBeNull();
  });
});

describe('splitRosterName', () => {
  it('handles Last, First', () => expect(splitRosterName('Doe, Jane')).toEqual({ firstName: 'Jane', lastName: 'Doe' }));
  it('handles First Last', () => expect(splitRosterName('Jane Doe')).toEqual({ firstName: 'Jane', lastName: 'Doe' }));
  it('title-cases ALL CAPS', () => {
    expect(splitRosterName('JANE DOE')).toEqual({ firstName: 'Jane', lastName: 'Doe' });
    expect(splitRosterName("DOE-SMITH, JANE")).toEqual({ firstName: 'Jane', lastName: 'Doe-Smith' });
  });
  it('strips trailing * and extra spaces', () => {
    expect(splitRosterName('  Doe,   Jane * ')).toEqual({ firstName: 'Jane', lastName: 'Doe' });
    expect(splitRosterName('Jane  Doe*')).toEqual({ firstName: 'Jane', lastName: 'Doe' });
  });
  it('returns null for unusable input', () => {
    expect(splitRosterName('')).toBeNull();
    expect(splitRosterName('Madonna')).toBeNull();
  });
});

describe('parseRosterRotationRows', () => {
  // Two side-by-side groups: ID | Name | Dept | Dates, at different column offsets.
  const rows = [
    ['JULY ROTATIONS', '', '', '', '', '', '', '', ''],
    ['101', 'Doe, Jane', 'ANES', '7/6 - 8/2', '', '202', 'JOHN ROE', 'Int Med', '07/06-08/02'],
    ['', 'Smith, Amy*', 'FM', '7/6-8/2', '', '', 'Bob Poe', 'BAMC PA', '7/6 - 8/2'],
    ['', 'Lee, Kim', 'BAMC - Once rotator has been cleared by badging', '7/6 - 8/2', '', '', '', 'PED', '7/6 - 8/2'],
    ['DECEMBER ROTATIONS'],
    ['303', 'Tran, Ola', 'NEURO', '12/21 - 1/17', '', '', 'Ng, Pat', 'POD', '6/1 - 6/28'],
    ['', 'Wu, Sam', 'BAMC', '6/29 - 7/26'],
    ['', 'Kay, Zed', 'XYZ', '1/5 - 2/1'],
  ];
  const { rotations, warnings } = parseRosterRotationRows(rows, 2026);
  const by = (last) => rotations.find(r => r.lastName === last);

  it('reads id/name/dept/dates at any column offset', () => {
    expect(by('Doe')).toMatchObject({ firstName: 'Jane', category: 'ANES', pgy: 1, start: '2026-07-06', end: '2026-08-02', scheduledByUs: true, externalId: '101', dept: 'ANES' });
    expect(by('Roe')).toMatchObject({ firstName: 'John', category: 'IM', pgy: 2, externalId: '202', start: '2026-07-06' });
  });
  it('externalId null when ID missing', () => {
    expect(by('Smith').externalId).toBeNull();
    expect(by('Smith')).toMatchObject({ firstName: 'Amy', category: 'FM', pgy: 1 });
  });
  it('warns about assumed FM PGY', () => {
    expect(warnings.some(w => /PGY assumed 1 for Amy Smith/.test(w))).toBe(true);
  });
  it('keeps BAMC PA as reference, not scheduled', () => {
    expect(by('Poe')).toMatchObject({ category: null, scheduledByUs: false, pgy: null, dept: 'BAMC PA' });
  });
  it('skips note rows', () => {
    expect(by('Lee')).toBeUndefined();
  });
  it('crosses New Year', () => {
    expect(by('Tran')).toMatchObject({ category: 'NEURO', start: '2026-12-21', end: '2027-01-17' });
  });
  it('end of AY lands in next calendar year; straddle at AY start stays in AY start year', () => {
    expect(by('Ng')).toMatchObject({ category: 'POD', start: '2027-06-01', end: '2027-06-28' });
    expect(by('Wu')).toMatchObject({ category: 'EM_BAMC', pgy: 1, start: '2026-06-29', end: '2026-07-26' });
  });
  it('unknown department kept unscheduled with warning', () => {
    expect(by('Kay')).toMatchObject({ category: null, scheduledByUs: false, start: '2027-01-05' });
    expect(warnings.some(w => /unrecognized department "XYZ"/.test(w))).toBe(true);
  });
});
