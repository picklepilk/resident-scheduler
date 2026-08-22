import { describe, it, expect } from 'vitest';
import { SHIFTS, SHIFT_TIMING } from './shifts.js';
import {
  QGENDA_TASKS, qgendaTaskFor, QGENDA_NAME_FORMATS, qgendaName, QGENDA_VARIANTS,
} from './qgenda.js';

describe('qgendaTaskFor', () => {
  it('resolves every SHIFTS id to a non-empty string task', () => {
    for (const s of SHIFTS) {
      const { task } = qgendaTaskFor(s.id, { pgy: 2 });
      expect(typeof task).toBe('string');
      expect(task.trim().length).toBeGreaterThan(0);
    }
  });

  it('TRAUMA-D resolves by PGY: intern-specific name for PGY-1, shared name for PGY-2/3', () => {
    expect(qgendaTaskFor('TRAUMA-D', { pgy: 1 })).toEqual({ task: 'Trauma Day-Intern', source: 'default' });
    expect(qgendaTaskFor('TRAUMA-D', { pgy: 2 })).toEqual({ task: 'Trauma Day', source: 'default' });
    expect(qgendaTaskFor('TRAUMA-D', { pgy: 3 })).toEqual({ task: 'Trauma Day', source: 'default' });
  });

  it('TRAUMA-D falls back to the non-intern name when resident/pgy is missing', () => {
    expect(qgendaTaskFor('TRAUMA-D', undefined)).toEqual({ task: 'Trauma Day', source: 'default' });
  });

  it('a blank override falls back to the default task', () => {
    const { task, source } = qgendaTaskFor('POD-D', { pgy: 2 }, { 'POD-D': '' });
    expect(task).toBe(QGENDA_TASKS['POD-D']);
    expect(source).toBe('default');
  });

  it('a whitespace-only override falls back to the default task', () => {
    const { task, source } = qgendaTaskFor('POD-D', { pgy: 2 }, { 'POD-D': '   ' });
    expect(task).toBe(QGENDA_TASKS['POD-D']);
    expect(source).toBe('default');
  });

  it('a real override wins over the default and reports source:override', () => {
    const { task, source } = qgendaTaskFor('POD-D', { pgy: 2 }, { 'POD-D': 'Custom QGenda Name' });
    expect(task).toBe('Custom QGenda Name');
    expect(source).toBe('override');
  });

  it('trims a non-blank override before using it', () => {
    const { task } = qgendaTaskFor('POD-D', { pgy: 2 }, { 'POD-D': '  Custom QGenda Name  ' });
    expect(task).toBe('Custom QGenda Name');
  });

  it('an unmapped 12h id falls back to the SHIFT_MAP label with source:fallback', () => {
    const { task, source } = qgendaTaskFor('POD-D12', { pgy: 2 });
    expect(source).toBe('fallback');
    expect(task).toBe('POD Day 12h');
  });

  it('all eight 12h ids are absent from QGENDA_TASKS (no confirmed QGenda name yet)', () => {
    const twelveHourIds = ['POD-D12', 'POD-N12', 'MT-D12', 'MT-N12', 'FLEX-D12', 'FLEX-N12', 'PED-D12', 'PED-N12'];
    for (const id of twelveHourIds) {
      expect(QGENDA_TASKS[id]).toBeUndefined();
    }
  });

  it('an override on an unmapped 12h id still wins (fallback is only a last resort)', () => {
    const { task, source } = qgendaTaskFor('POD-D12', { pgy: 2 }, { 'POD-D12': 'Conference POD Day' });
    expect(task).toBe('Conference POD Day');
    expect(source).toBe('override');
  });

  it('an entirely unknown shift id falls back to the raw id itself', () => {
    const { task, source } = qgendaTaskFor('NOT-A-SHIFT', { pgy: 2 });
    expect(task).toBe('NOT-A-SHIFT');
    expect(source).toBe('fallback');
  });
});

describe('qgendaName', () => {
  it('lists all three formats in QGENDA_NAME_FORMATS', () => {
    expect(QGENDA_NAME_FORMATS).toEqual(['lastFirstInitial', 'lastFirst', 'firstLast']);
  });

  const resident = { firstName: 'John', lastName: 'Smith' };

  it('lastFirstInitial: "Last, F" with no trailing period', () => {
    expect(qgendaName(resident, 'lastFirstInitial')).toBe('Smith, J');
  });

  it('lastFirst: "Last, First"', () => {
    expect(qgendaName(resident, 'lastFirst')).toBe('Smith, John');
  });

  it('firstLast: "First Last"', () => {
    expect(qgendaName(resident, 'firstLast')).toBe('John Smith');
  });

  it('defaults to lastFirstInitial when no format given', () => {
    expect(qgendaName(resident)).toBe('Smith, J');
  });

  it('handles a missing lastName without a stray comma/space, for every format', () => {
    const r = { firstName: 'John', lastName: '' };
    expect(qgendaName(r, 'lastFirstInitial')).toBe('John');
    expect(qgendaName(r, 'lastFirst')).toBe('John');
    expect(qgendaName(r, 'firstLast')).toBe('John');
  });

  it('handles a missing firstName without a stray comma/space, for every format', () => {
    const r = { firstName: '', lastName: 'Smith' };
    expect(qgendaName(r, 'lastFirstInitial')).toBe('Smith');
    expect(qgendaName(r, 'lastFirst')).toBe('Smith');
    expect(qgendaName(r, 'firstLast')).toBe('Smith');
  });

  it('handles both names missing without throwing, returning an empty string', () => {
    const r = {};
    expect(qgendaName(r, 'lastFirstInitial')).toBe('');
    expect(qgendaName(r, 'lastFirst')).toBe('');
    expect(qgendaName(r, 'firstLast')).toBe('');
  });

  it('handles a one-word name (only lastName populated) the same as "missing firstName"', () => {
    const r = { lastName: 'Cher' };
    expect(qgendaName(r, 'lastFirstInitial')).toBe('Cher');
  });

  it('handles a hyphenated first name for the initial without throwing or mangling it', () => {
    const r = { firstName: 'Mary-Jane', lastName: 'Watson' };
    expect(qgendaName(r, 'lastFirstInitial')).toBe('Watson, M');
    expect(qgendaName(r, 'lastFirst')).toBe('Watson, Mary-Jane');
    expect(qgendaName(r, 'firstLast')).toBe('Mary-Jane Watson');
  });

  it('handles a hyphenated last name without mangling it', () => {
    const r = { firstName: 'Anthony', lastName: 'Smith-Jones' };
    expect(qgendaName(r, 'lastFirstInitial')).toBe('Smith-Jones, A');
    expect(qgendaName(r, 'firstLast')).toBe('Anthony Smith-Jones');
  });

  it('trims whitespace-padded names rather than emitting stray padding', () => {
    const r = { firstName: '  John  ', lastName: '  Smith  ' };
    expect(qgendaName(r, 'lastFirst')).toBe('Smith, John');
  });

  it('does not throw for a null/undefined resident', () => {
    expect(() => qgendaName(null)).not.toThrow();
    expect(() => qgendaName(undefined)).not.toThrow();
    expect(qgendaName(null)).toBe('');
  });

  it('qgendaStaffId overrides every format when present', () => {
    const r = { firstName: 'John', lastName: 'Smith', qgendaStaffId: 'JSMITH1' };
    expect(qgendaName(r, 'lastFirstInitial')).toBe('JSMITH1');
    expect(qgendaName(r, 'lastFirst')).toBe('JSMITH1');
    expect(qgendaName(r, 'firstLast')).toBe('JSMITH1');
  });

  it('a blank/whitespace-only qgendaStaffId is ignored, falling back to name formatting', () => {
    const r = { firstName: 'John', lastName: 'Smith', qgendaStaffId: '   ' };
    expect(qgendaName(r, 'lastFirstInitial')).toBe('Smith, J');
  });
});

describe('QGENDA_VARIANTS', () => {
  it('minimal has the Staff/Date/Task columns', () => {
    expect(QGENDA_VARIANTS.minimal.columns).toEqual(['Staff', 'Date', 'Task']);
  });

  it('withTimes has the fuller column set', () => {
    expect(QGENDA_VARIANTS.withTimes.columns).toEqual(['Staff', 'Date', 'EndDate', 'Task', 'StartTime', 'EndTime']);
  });

  it('every variant carries a matching id and a human label', () => {
    for (const [key, variant] of Object.entries(QGENDA_VARIANTS)) {
      expect(variant.id).toBe(key);
      expect(typeof variant.label).toBe('string');
      expect(variant.label.length).toBeGreaterThan(0);
    }
  });
});

// Ground-truth lock. Every string below was transcribed from a cell of the chief's real QGenda
// export ("Grid By Staff", 7/27/2026-8/23/2026). QGenda matches its Task column EXACTLY, so a
// well-meaning cleanup of the inconsistent casing ("Midtrack night", "(FM only)") or a stripped
// '*' prefix silently breaks every import — the failure mode is "QGenda invented 14 new tasks",
// which nobody notices until a shift has nobody on it. This test exists to make that edit fail
// loudly instead. src/lib/qgendaImport.js derives its reverse lookup from the same map, so these
// strings are also what the QGenda-workbook importer round-trips against.
describe('QGENDA_TASKS ground truth', () => {
  const OBSERVED = {
    'POD-D': 'MC Team Day 7a-4p',
    'POD-E': 'MC Team Eve 3p-12a',
    'POD-N': 'MC Team Night 11p-8a',
    'FLEX-D': 'Flex Team Day 6a-3p',
    'FLEX-E': 'Flex Team Eve 2p-11p',
    'FLEX-N': 'Flex Team Night 10p-7a',
    'MT-D': 'Midtrack Day 7a-4p',
    'MT-E': 'Midtrack Evening 3p-12a',
    'MT-N': 'Midtrack night 11p-8a',
    'PED-D': '*Peds Day 7a-4p',
    'PED-E': '*Peds Eve 3p-12a',
    'PED-S': '*Peds Swing 11a-8p',
    'PED-N': '*Peds Night 7p-4a',
    'PED-N-FM': '*Peds Night (FM only) 11p-8a',
    'TRAUMA-N': 'Trauma Night-PGY2+3',
  };

  it('matches the strings observed in the real export, byte for byte', () => {
    for (const [id, expected] of Object.entries(OBSERVED)) {
      expect(QGENDA_TASKS[id]).toBe(expected);
    }
  });

  it('TRAUMA-D PGY-1 resolves to the observed intern task name', () => {
    expect(qgendaTaskFor('TRAUMA-D', { pgy: 1 }).task).toBe('Trauma Day-Intern');
  });

  // The 14 timed tasks carry their hours in the name. If SHIFT_TIMING and the string ever
  // disagree, the export tells QGenda a shift runs hours the app does not schedule.
  it('every timed task name agrees with SHIFT_TIMING', () => {
    const h12 = n => (n % 12 === 0 ? 12 : n % 12);
    const ampm = n => (n % 24 < 12 ? 'a' : 'p');
    const stamp = n => `${h12(n)}${ampm(n)}`;
    for (const s of SHIFTS) {
      const name = QGENDA_TASKS[s.id];
      if (typeof name !== 'string') continue;            // 12h ids, TRAUMA-D function
      const m = /(d{1,2}[ap])-(d{1,2}[ap])$/.exec(name);
      if (!m) continue;                                  // the two Trauma tasks carry no hours
      const t = SHIFT_TIMING[s.id];
      expect(`${m[1]}-${m[2]}`).toBe(`${stamp(t.startH)}-${stamp(t.startH + t.durationH)}`);
    }
  });
});
