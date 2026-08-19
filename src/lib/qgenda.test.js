import { describe, it, expect } from 'vitest';
import { SHIFTS } from './shifts.js';
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
