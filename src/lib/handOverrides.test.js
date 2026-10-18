import { describe, it, expect } from 'vitest';
import {
  normalizeHandOverrides, getHandOverride, pruneHandOverrides, syncHandOverrides,
  applyHandOverrideToViolations, applyHandOverridesToIssues, listHandOverrides, overrideTooltip, solverUnsafeHandOverrides, handOverrideCells,
} from './handOverrides.js';

const entry = (over = {}) => ({ shiftId: 'TRAUMA-D', ruleIds: ['traumaDayRotationGuard'], note: 'chief call', at: '2026-10-18T00:00:00.000Z', by: 'a@b.c', ...over });
const ho = { r1: { '2026-07-07': entry() } };
const sched = { r1: { '2026-07-07': 'TRAUMA-D' } };

describe('normalizeHandOverrides', () => {
  it('tolerates garbage shapes', () => {
    for (const bad of [null, undefined, 5, 'x', [], { r1: 'x' }, { r1: [] }, { r1: { d: null } }, { r1: { d: { shiftId: '' } } }, { r1: { d: { shiftId: 'A', ruleIds: [] } } }]) {
      expect(normalizeHandOverrides(bad)).toEqual({});
    }
  });
  it('keeps a valid entry and cleans fields', () => {
    const n = normalizeHandOverrides({ r1: { d: { shiftId: 'A', ruleIds: ['x', 'x', 3], note: '  ', at: 5 } } });
    expect(n).toEqual({ r1: { d: { shiftId: 'A', ruleIds: ['x'], note: null, at: null, by: null, measured: {} } } });
  });
});

describe('getHandOverride / prune', () => {
  it('requires the cell to still hold the recorded shift', () => {
    expect(getHandOverride(ho, sched, 'r1', '2026-07-07')).toBeTruthy();
    expect(getHandOverride(ho, sched, 'r1', '2026-07-07', 'TRAUMA-D')).toBeTruthy();
    expect(getHandOverride(ho, sched, 'r1', '2026-07-07', 'POD-D')).toBeNull();
    expect(getHandOverride(ho, { r1: { '2026-07-07': 'POD-D' } }, 'r1', '2026-07-07')).toBeNull();
    expect(getHandOverride(ho, { r1: {} }, 'r1', '2026-07-07')).toBeNull();
  });
  it('prune drops stale entries and empty residents', () => {
    expect(pruneHandOverrides(ho, { r1: { '2026-07-07': null } })).toEqual({});
    expect(Object.keys(pruneHandOverrides(ho, sched))).toEqual(['r1']);
  });
});

describe('syncHandOverrides', () => {
  const prev = { schedule: { r1: {} }, handOverrides: {} };
  it('records an entry for the newly placed cell, with rules, note, who, when', () => {
    const next = { ...prev, schedule: { r1: { '2026-07-07': 'TRAUMA-D' } } };
    const out = syncHandOverrides(prev, next, { ruleIds: ['traumaDayRotationGuard', 'vacation', 'overrideTierThing'], note: ' why ' }, 'me@x.y', 'NOW');
    expect(out.handOverrides.r1['2026-07-07']).toEqual({ shiftId: 'TRAUMA-D', ruleIds: ['traumaDayRotationGuard'], note: 'why', at: 'NOW', by: 'me@x.y', measured: {} });
    // the cell change and the record are in the SAME returned block (one undo step)
    expect(out.schedule).toBe(next.schedule);
  });
  it('does nothing (same object) for an ordinary edit with no overrides around', () => {
    const next = { ...prev, schedule: { r1: { d: 'POD-D' } } };
    expect(syncHandOverrides(prev, next, null)).toBe(next);
    expect(syncHandOverrides(prev, next, { ruleIds: ['nightsTotalBlock'], note: null })).toBe(next); // override-tier, not hand-overridable
  });
  it('drops the entry when the cell is cleared, changed, or the schedule is wiped', () => {
    const p = { schedule: sched, handOverrides: ho };
    expect(syncHandOverrides(p, { ...p, schedule: { r1: { '2026-07-07': null } } }, null).handOverrides).toEqual({});
    expect(syncHandOverrides(p, { ...p, schedule: { r1: { '2026-07-07': 'POD-D' } } }, null).handOverrides).toEqual({});
    expect(syncHandOverrides(p, { ...p, schedule: {} }, null).handOverrides).toEqual({});
  });
  it('keeps an untouched entry while another cell changes', () => {
    const p = { schedule: sched, handOverrides: ho };
    const next = { ...p, schedule: { r1: { '2026-07-07': 'TRAUMA-D', '2026-07-08': 'POD-D' } } };
    expect(syncHandOverrides(p, next, null).handOverrides).toEqual(normalizeHandOverrides(ho));
  });
  it('a swap records both placed cells, a move records only the destination', () => {
    const p = { schedule: { r1: { a: 'X' }, r2: { a: 'Y' } }, handOverrides: {} };
    const swap = syncHandOverrides(p, { ...p, schedule: { r1: { a: 'Y' }, r2: { a: 'X' } } }, { ruleIds: ['nightRunMax'] }, null, 'T');
    expect(Object.keys(swap.handOverrides).sort()).toEqual(['r1', 'r2']);
    const mv = syncHandOverrides(p, { ...p, schedule: { r1: { a: null }, r2: { a: 'Y', b: 'X' } } }, { ruleIds: ['nightRunMax'] }, null, 'T');
    expect(Object.keys(mv.handOverrides)).toEqual(['r2']);
    expect(Object.keys(mv.handOverrides.r2)).toEqual(['b']);
  });
});

describe('downgrades', () => {
  const v = (over) => ({ message: 'm', level: 'error', rule: 'traumaDayRotationGuard', ...over });
  it('cellViolations: covered hand-overridable error becomes an overridden warn; others untouched', () => {
    const out = applyHandOverrideToViolations([v(), v({ rule: 'vacation' }), v({ rule: 'nightRunMax' })], entry({ ruleIds: ['traumaDayRotationGuard', 'vacation'] }));
    expect(out[0]).toMatchObject({ level: 'warn', overridden: true, message: 'Overridden: m', overrideNote: 'chief call' });
    expect(out[1].level).toBe('error'); // ACGME/legal rule never downgrades, even if (maliciously) listed
    expect(out[2].level).toBe('error'); // not covered by this entry
  });
  it('validateAll post-pass: matched by cell+shift, stale entry ignored', () => {
    const issues = [{ residentId: 'r1', dateStr: '2026-07-07', shiftId: 'TRAUMA-D', rule: 'traumaDayRotationGuard', level: 'error', message: 'm' }];
    expect(applyHandOverridesToIssues(issues, ho, sched)[0]).toMatchObject({ level: 'warn', overridden: true });
    expect(applyHandOverridesToIssues(issues, ho, { r1: { '2026-07-07': 'POD-D' } })[0].level).toBe('error');
    expect(applyHandOverridesToIssues(issues, {}, sched)).toBe(issues);
    const other = [{ ...issues[0], dateStr: '2026-07-08' }];
    expect(applyHandOverridesToIssues(other, ho, sched)[0].level).toBe('error');
  });
  it('aggregate (dateStr null) issues match any live entry of that resident naming the rule', () => {
    const h = { r1: { d1: entry({ shiftId: 'PED-N', ruleIds: ['nightRunMax'] }) } };
    const s = { r1: { d1: 'PED-N' } };
    const issues = [{ residentId: 'r1', dateStr: null, rule: 'nightRunMax', level: 'error', message: 'm' }, { residentId: 'r2', dateStr: null, rule: 'nightRunMax', level: 'error', message: 'm' }];
    const out = applyHandOverridesToIssues(issues, h, s);
    expect(out[0].overridden).toBe(true);
    expect(out[1].level).toBe('error');
  });
});

describe('listing, tooltip, solver safety', () => {
  it('lists live overrides with labels, sorted', () => {
    const l = listHandOverrides(ho, sched, { r1: { firstName: 'A', lastName: 'B' } });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ name: 'A B', shiftId: 'TRAUMA-D', note: 'chief call' });
    expect(l[0].ruleLabels[0]).toMatch(/Trauma Day/);
    expect(listHandOverrides(ho, {}, {})).toEqual([]);
  });
  it('tooltip names rules, note, who', () => {
    const t = overrideTooltip(entry());
    expect(t).toMatch(/Trauma Day/); expect(t).toMatch(/chief call/); expect(t).toMatch(/a@b\.c/);
  });
  it('only pure eligibility-guard overrides on non-trauma-cap residents are solver-safe', () => {
    const pgy1 = { r1: { pgy: 1, category: 'EM_HOME' } }, pgy2 = { r1: { pgy: 2, category: 'EM_HOME' } };
    const cap = r => r.category === 'EM_HOME' && (r.pgy === 2 || r.pgy === 3);
    expect(solverUnsafeHandOverrides(ho, sched, pgy1, cap)).toEqual([]);
    expect(solverUnsafeHandOverrides(ho, sched, pgy2, cap)).toHaveLength(1); // could bind caps.trauma
    expect(solverUnsafeHandOverrides(ho, sched, {}, cap)).toHaveLength(1); // unknown resident = unsafe
    const h = { r1: { d: entry({ shiftId: 'PED-N', ruleIds: ['nightRunMax'] }) } };
    expect(solverUnsafeHandOverrides(h, { r1: { d: 'PED-N' } }, { r1: { pgy: 1 } }, () => false)).toHaveLength(1);
    expect(solverUnsafeHandOverrides(h, { r1: { d: null } }, {}, () => true)).toEqual([]); // stale = inert
  });
});

describe('per-cell records and measured aggregates', () => {
  it('meta.cells records only the confirmed cell, not the other side of a swap', () => {
    const p = { schedule: { r1: { a: 'X' }, r2: { a: 'Y' } }, handOverrides: {} };
    const next = { ...p, schedule: { r1: { a: 'Y' }, r2: { a: 'X' } } };
    const meta = { ruleIds: ['nightRunMax'], note: null, cells: [{ residentId: 'r2', dateStr: 'a', ruleIds: ['nightRunMax'], measured: { nightRunMax: 7 } }] };
    const out = syncHandOverrides(p, next, meta, null, 'T');
    expect(Object.keys(out.handOverrides)).toEqual(['r2']);
    expect(out.handOverrides.r2.a.measured).toEqual({ nightRunMax: 7 });
  });
  it('a cell listed in meta.cells that did not actually change is ignored', () => {
    const p = { schedule: { r1: { a: 'X' } }, handOverrides: {} };
    const out = syncHandOverrides(p, { ...p }, { ruleIds: ['nightRunMax'], cells: [{ residentId: 'r1', dateStr: 'a', ruleIds: ['nightRunMax'] }] });
    expect(out.handOverrides).toEqual({});
  });
  it('handOverrideCells groups by violation cell, falls back to default, keeps max measured', () => {
    const cells = handOverrideCells([
      { rule: 'nightRunMax', measured: 7, cell: { residentId: 'r1', dateStr: 'a' } },
      { rule: 'nightRunMax', measured: 8, cell: { residentId: 'r1', dateStr: 'a' } },
      { rule: 'jcMaxPerAy', measured: 4 },
      { rule: 'vacation' },
    ], { residentId: 'r9', dateStr: 'z' });
    expect(cells).toEqual([
      { residentId: 'r1', dateStr: 'a', ruleIds: ['nightRunMax'], measured: { nightRunMax: 8 } },
      { residentId: 'r9', dateStr: 'z', ruleIds: ['jcMaxPerAy'], measured: { jcMaxPerAy: 4 } },
    ]);
  });
  it('aggregate issue downgrades only while the measured value is <= the confirmed one', () => {
    const h = { r1: { d1: entry({ shiftId: 'PED-N', ruleIds: ['nightRunMax'], measured: { nightRunMax: 7 } }) } };
    const s = { r1: { d1: 'PED-N' } };
    const mk = measured => [{ residentId: 'r1', dateStr: null, rule: 'nightRunMax', level: 'error', message: 'm', measured }];
    expect(applyHandOverridesToIssues(mk(7), h, s)[0].overridden).toBe(true);
    expect(applyHandOverridesToIssues(mk(6), h, s)[0].overridden).toBe(true);
    expect(applyHandOverridesToIssues(mk(8), h, s)[0].level).toBe('error');
    // cellViolations path too
    expect(applyHandOverrideToViolations(mk(8), h.r1.d1)[0].level).toBe('error');
  });
});
