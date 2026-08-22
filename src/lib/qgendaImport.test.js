import { describe, it, expect } from 'vitest';
import {
  normalizeTaskName, parseMonthBandCell, resolveDateColumns, parseQGendaGrid,
  buildQGendaImport, buildScheduleFromImport, QGENDA_TASK_TO_SHIFT, RES_CALL_RE,
} from './qgendaImport.js';
import { QGENDA_TASKS, qgendaTaskFor } from './qgenda.js';

// Synthetic sheet in the exact shape of the real "Grid By Staff" export. Names are invented —
// the real workbook's 49 residents are live PII and this repo is public (see CLAUDE.md), so the
// structure is reproduced here and the real file is only ever fed through the app's own uploader.
function sheet({ band, days, dow, people }) {
  return [
    ['UT Health San Antonio'],
    ['Printed: 8/22/2026 12:43 AM'],
    [],
    ['', ...band],
    ['', ...days],
    ['', ...dow],
    ...people.map(p => [p.name, ...p.cells]),
  ];
}

const STANDARD = sheet({
  band:   ['Jul-26', '', '', '', '', 'Aug-26', '', ''],
  days:   ['27', '28', '29', '30', '31', '1', '2', '3'],
  dow:    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon'],
  people: [
    { name: 'EMERGENCY MED, EMERGENCY MED', cells: ['', '', '', '', '', '', '', ''] },
    { name: 'MD OPEN, MD OPEN',             cells: ['', '', '', '', '', '', '', ''] },
    { name: 'Rivera, Dana',  cells: ['MC Team Day 7a-4p', 'MC Team Day 7a-4p', '', '*Peds Night 7p-4a', '', '', '', 'Flex Team Eve 2p-11p'] },
    { name: 'Okafor, Sam',   cells: ['', 'Res_Call PGY2', 'Res_Call PGY2', '', 'Midtrack night 11p-8a', '', '', ''] },
    { name: 'Lindqvist, Bo', cells: ['Trauma Day-Intern', '', '', '', '', '', '', '*Peds Night (FM only) 11p-8a'] },
  ],
});

describe('normalizeTaskName', () => {
  it('strips the leading asterisk, collapses whitespace, lowercases', () => {
    expect(normalizeTaskName('*Peds Night 7p-4a')).toBe('peds night 7p-4a');
    expect(normalizeTaskName('  Midtrack   night 11p-8a ')).toBe('midtrack night 11p-8a');
  });

  it('is tolerant of the casing/prefix drift a future export might introduce', () => {
    expect(normalizeTaskName('MIDTRACK NIGHT 11p-8a')).toBe(normalizeTaskName('Midtrack night 11p-8a'));
    expect(normalizeTaskName('Peds Day 7a-4p')).toBe(normalizeTaskName('*Peds Day 7a-4p'));
  });
});

describe('QGENDA_TASK_TO_SHIFT', () => {
  // The whole point of deriving the reverse map from QGENDA_TASKS: export and import cannot drift.
  it('resolves every string QGENDA_TASKS can emit back to its own shift id', () => {
    for (const [shiftId, entry] of Object.entries(QGENDA_TASKS)) {
      const names = typeof entry === 'function' ? [1, 2, 3].map(pgy => entry({ pgy })) : [entry];
      for (const name of names) {
        expect(QGENDA_TASK_TO_SHIFT.get(normalizeTaskName(name))).toBe(shiftId);
      }
    }
  });

  it('round-trips id -> task -> id for every mapped shift', () => {
    for (const shiftId of Object.keys(QGENDA_TASKS)) {
      const { task } = qgendaTaskFor(shiftId, { pgy: shiftId === 'TRAUMA-D' ? 1 : 2 });
      expect(QGENDA_TASK_TO_SHIFT.get(normalizeTaskName(task))).toBe(shiftId);
    }
  });

  // The eight 12h ids have no confirmed QGenda name, so qgendaTaskFor falls back to the on-screen
  // label. That fallback must NOT become a silent import mapping.
  it('does not map the 12h fallback labels', () => {
    expect(QGENDA_TASK_TO_SHIFT.has(normalizeTaskName('POD Day 12h'))).toBe(false);
  });
});

describe('RES_CALL_RE', () => {
  it('matches the three jeopardy tracks and captures the PGY', () => {
    expect(RES_CALL_RE.exec('Res_Call PGY1')[1]).toBe('1');
    expect(RES_CALL_RE.exec('Res_Call PGY3')[1]).toBe('3');
    expect(RES_CALL_RE.exec('res call pgy 2')[1]).toBe('2');
  });

  it('does not match a clinical task', () => {
    expect(RES_CALL_RE.test('MC Team Day 7a-4p')).toBe(false);
  });
});

describe('parseMonthBandCell', () => {
  it('parses the two-digit-year form the export uses', () => {
    expect(parseMonthBandCell('Jul-26')).toEqual({ month: 6, year: 2026 });
    expect(parseMonthBandCell('Aug-26')).toEqual({ month: 7, year: 2026 });
  });

  it('parses spelled-out and four-digit variants', () => {
    expect(parseMonthBandCell('July 2026')).toEqual({ month: 6, year: 2026 });
  });

  it('returns null for anything that is not a month band', () => {
    for (const v of ['', '27', 'Mon', 'MC Team Day 7a-4p', null, undefined]) {
      expect(parseMonthBandCell(v)).toBeNull();
    }
  });
});

describe('resolveDateColumns', () => {
  it('maps every day-number column to an ISO date across a month boundary', () => {
    const { dates, dayRow, error } = resolveDateColumns(STANDARD);
    expect(error).toBeNull();
    expect(dayRow).toBe(4);
    expect(Object.values(dates)).toEqual([
      '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31',
      '2026-08-01', '2026-08-02', '2026-08-03',
    ]);
  });

  // The band row only marks a month where it CHANGES, so a block starting mid-month has no band
  // cell at its first column and the roll has to come from the backward day jump alone.
  it('rolls the month forward on a backward day jump with no band cell', () => {
    const rows = sheet({
      band:   ['Jan-27', '', '', ''],
      days:   ['30', '31', '1', '2'],
      dow:    ['Sat', 'Sun', 'Mon', 'Tue'],
      people: [{ name: 'A, B', cells: ['MC Team Day 7a-4p', '', '', ''] }],
    });
    expect(Object.values(resolveDateColumns(rows).dates))
      .toEqual(['2027-01-30', '2027-01-31', '2027-02-01', '2027-02-02']);
  });

  it('rolls the year on a December -> January boundary', () => {
    const rows = sheet({
      band:   ['Dec-26', '', '', ''],
      days:   ['30', '31', '1', '2'],
      dow:    ['Wed', 'Thu', 'Fri', 'Sat'],
      people: [{ name: 'A, B', cells: ['MC Team Day 7a-4p', '', '', ''] }],
    });
    expect(Object.values(resolveDateColumns(rows).dates))
      .toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });

  // Dates are built from integers, never from Date.toISOString(), which would shift by a day for
  // any viewer east of UTC. Asserting the literal strings is what pins that down.
  it('reports an error rather than guessing when no day-number row exists', () => {
    const { error } = resolveDateColumns([['UT Health'], ['Printed: x'], []]);
    expect(error).toBe('No day-number header row found');
  });

  it('finds the day row by content even when the preamble is a different length', () => {
    const rows = [[], [], [], [], [], ['', 'Sep-26', '', '', '', '', '', ''],
      ['', '1', '2', '3', '4', '5', '6', '7'], ['', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon']];
    const { dayRow, dates } = resolveDateColumns(rows);
    expect(dayRow).toBe(6);
    expect(Object.values(dates)[0]).toBe('2026-09-01');
  });
});

describe('parseQGendaGrid', () => {
  const parsed = parseQGendaGrid(STANDARD);

  it('returns the date columns in order', () => {
    expect(parsed.dates).toHaveLength(8);
    expect(parsed.dates[0]).toBe('2026-07-27');
    expect(parsed.dates[7]).toBe('2026-08-03');
  });

  // The real export carries ~158 attending/section rows with no assignments. They are excluded by
  // "has no cells", never by row number, because that list changes length every export.
  it('skips person rows with no assignments at all', () => {
    expect(parsed.entries.map(e => e.rawName)).toEqual(['Rivera, Dana', 'Okafor, Sam', 'Lindqvist, Bo']);
  });

  it('maps clinical tasks to shift ids on the right dates', () => {
    const dana = parsed.entries.find(e => e.rawName === 'Rivera, Dana');
    expect(dana.shifts).toEqual([
      { date: '2026-07-27', shiftId: 'POD-D' },
      { date: '2026-07-28', shiftId: 'POD-D' },
      { date: '2026-07-30', shiftId: 'PED-N' },
      { date: '2026-08-03', shiftId: 'FLEX-E' },
    ]);
    expect(dana.jeopardyDates).toEqual([]);
  });

  // Jeopardy must stay OUT of the shift list: validateAll hard-errors a clinical shift on a
  // jeopardy date, so folding these into the schedule would manufacture one error per cell.
  it('routes Res_Call cells to jeopardyDates, never to shifts', () => {
    const sam = parsed.entries.find(e => e.rawName === 'Okafor, Sam');
    expect(sam.jeopardyDates).toEqual(['2026-07-28', '2026-07-29']);
    expect(sam.shifts).toEqual([{ date: '2026-07-31', shiftId: 'MT-N' }]);
  });

  it('infers PGY from Res_Call and from the intern trauma task', () => {
    expect(parsed.entries.find(e => e.rawName === 'Okafor, Sam').inferredPgy).toBe(2);
    expect(parsed.entries.find(e => e.rawName === 'Lindqvist, Bo').inferredPgy).toBe(1);
    expect(parsed.entries.find(e => e.rawName === 'Rivera, Dana').inferredPgy).toBeNull();
  });

  it('resolves the FM-only peds night to its own shift id, not PED-N', () => {
    const bo = parsed.entries.find(e => e.rawName === 'Lindqvist, Bo');
    expect(bo.shifts.find(s => s.date === '2026-08-03').shiftId).toBe('PED-N-FM');
  });

  it('reports nothing unknown for a clean sheet', () => {
    expect(parsed.unknownTasks).toEqual([]);
  });

  // An unrecognized task is a real shift about to be lost. Dropping it silently shows up weeks
  // later as an unexplained coverage hole, so it is surfaced with a count instead.
  it('collects unknown task strings with counts instead of dropping them', () => {
    const rows = sheet({
      band:   ['Jul-26', '', ''],
      days:   ['27', '28', '29'],
      dow:    ['Mon', 'Tue', 'Wed'],
      people: [
        { name: 'Rivera, Dana', cells: ['Ultrasound Elective', 'Ultrasound Elective', 'MC Team Day 7a-4p'] },
        { name: 'Okafor, Sam',  cells: ['Admin Block', '', ''] },
      ],
    });
    const p = parseQGendaGrid(rows);
    expect(p.unknownTasks).toEqual([
      { task: 'Ultrasound Elective', count: 2 },
      { task: 'Admin Block', count: 1 },
    ]);
    // The row is still kept — its one recognized shift survives.
    expect(p.entries.find(e => e.rawName === 'Rivera, Dana').shifts)
      .toEqual([{ date: '2026-07-29', shiftId: 'POD-D' }]);
    // A row whose every cell was unknown has nothing left, so it drops out entirely.
    expect(p.entries.some(e => e.rawName === 'Okafor, Sam')).toBe(false);
  });

  it('returns an error object rather than throwing on junk input', () => {
    expect(parseQGendaGrid(null).error).toBeTruthy();
    expect(parseQGendaGrid([]).error).toBeTruthy();
    expect(parseQGendaGrid([['nothing', 'here']]).entries).toEqual([]);
  });
});

describe('buildQGendaImport', () => {
  const parsed = parseQGendaGrid(STANDARD);
  const roster = [
    { id: 'r1', firstName: 'Dana', lastName: 'Rivera', pgy: 2 },
    { id: 'r2', firstName: 'Sam',  lastName: 'Okafor', pgy: 2 },
  ];

  it('matches roster residents and reports the rest as unmatched', () => {
    const out = buildQGendaImport(parsed, roster);
    expect(out.matched.map(m => m.residentId)).toEqual(['r1', 'r2']);
    expect(out.unmatched.map(u => u.rawName)).toEqual(['Lindqvist, Bo']);
    expect(out.unmatched[0].reason).toBe('No roster match');
  });

  it('reports the date range for the block the import would create', () => {
    expect(buildQGendaImport(parsed, roster).dateRange)
      .toEqual({ start: '2026-07-27', end: '2026-08-03' });
  });

  // Never auto-resolve: picking one of two namesakes writes someone else's shifts onto the wrong
  // resident, and nothing downstream can detect it.
  it('flags an ambiguous name rather than picking a candidate', () => {
    const twins = [
      { id: 'a', firstName: 'Dana', lastName: 'Rivera', pgy: 1 },
      { id: 'b', firstName: 'Dana', lastName: 'Rivera', pgy: 3 },
    ];
    const out = buildQGendaImport(parsed, twins);
    const dana = out.unmatched.find(u => u.rawName === 'Rivera, Dana');
    expect(dana.reason).toMatch(/Ambiguous/);
    expect(dana.candidates).toHaveLength(2);
    expect(out.matched).toEqual([]);
  });

  it('carries the inferred PGY onto unmatched rows so the modal can pre-fill it', () => {
    const out = buildQGendaImport(parsed, []);
    expect(out.unmatched.find(u => u.rawName === 'Okafor, Sam').inferredPgy).toBe(2);
    expect(out.unmatched.find(u => u.rawName === 'Lindqvist, Bo').inferredPgy).toBe(1);
  });

  it('passes unknown tasks straight through to the preview', () => {
    expect(buildQGendaImport({ entries: [], dates: [], unknownTasks: [{ task: 'X', count: 3 }] }, []).unknownTasks)
      .toEqual([{ task: 'X', count: 3 }]);
  });

  it('tolerates an empty or missing parse result', () => {
    expect(buildQGendaImport(null, roster)).toEqual({
      matched: [], unmatched: [], unknownTasks: [], dowMismatches: [], dates: [], dateRange: null,
    });
  });
});

describe('buildScheduleFromImport', () => {
  it('produces the {residentId: {date: shiftId}} shape block.schedule uses', () => {
    const out = buildQGendaImport(parseQGendaGrid(STANDARD), [
      { id: 'r1', firstName: 'Dana', lastName: 'Rivera', pgy: 2 },
      { id: 'r2', firstName: 'Sam', lastName: 'Okafor', pgy: 2 },
    ]);
    expect(buildScheduleFromImport(out.matched)).toEqual({
      r1: { '2026-07-27': 'POD-D', '2026-07-28': 'POD-D', '2026-07-30': 'PED-N', '2026-08-03': 'FLEX-E' },
      r2: { '2026-07-31': 'MT-N' },
    });
  });

  it('never writes a jeopardy date into the schedule', () => {
    const out = buildQGendaImport(parseQGendaGrid(STANDARD), [{ id: 'r2', firstName: 'Sam', lastName: 'Okafor', pgy: 2 }]);
    const sched = buildScheduleFromImport(out.matched);
    expect(sched.r2['2026-07-28']).toBeUndefined();
    expect(sched.r2['2026-07-29']).toBeUndefined();
  });

  it('skips entries with no resident id', () => {
    expect(buildScheduleFromImport([{ shifts: [{ date: '2026-07-27', shiftId: 'POD-D' }] }])).toEqual({});
    expect(buildScheduleFromImport(null)).toEqual({});
  });
});

// The month/year walk is INFERENCE — a missing band cell could shift a whole block by a month
// and every resulting date would still look structurally valid. The export's own weekday row is
// independent evidence, so resolveDateColumns cross-checks against it.
describe('DOW cross-check', () => {
  it('reports no mismatches when the dates agree with the printed weekdays', () => {
    expect(resolveDateColumns(STANDARD).dowMismatches).toEqual([]);
  });

  it('flags a column whose resolved date lands on a different weekday than printed', () => {
    const rows = sheet({
      band:   ['Jul-25', '', ''],          // wrong year: 7/27/2025 is a Sunday, not a Monday
      days:   ['27', '28', '29'],
      dow:    ['Mon', 'Tue', 'Wed'],
      people: [{ name: 'A, B', cells: ['MC Team Day 7a-4p', '', ''] }],
    });
    const { dowMismatches } = resolveDateColumns(rows);
    expect(dowMismatches).toHaveLength(3);
    expect(dowMismatches[0]).toEqual({ column: 1, date: '2025-07-27', printed: 'mon', actual: 'sun' });
  });

  it('surfaces the mismatches through parseQGendaGrid and buildQGendaImport', () => {
    const rows = sheet({
      band:   ['Jul-25', '', ''],
      days:   ['27', '28', '29'],
      dow:    ['Mon', 'Tue', 'Wed'],
      people: [{ name: 'A, B', cells: ['MC Team Day 7a-4p', '', ''] }],
    });
    const parsed = parseQGendaGrid(rows);
    expect(parsed.dowMismatches).toHaveLength(3);
    expect(buildQGendaImport(parsed, []).dowMismatches).toHaveLength(3);
  });
});
