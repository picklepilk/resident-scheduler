import { describe, it, expect } from 'vitest';
import {
  normalizeHandOverrides, getHandOverride, pruneHandOverrides, syncHandOverrides,
  applyHandOverrideToViolations, applyHandOverridesToIssues, listHandOverrides, overrideTooltip, solverUnsafeHandOverrides,
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
    expect(n).toEqual({ r1: { d: { shiftId: 'A', ruleIds: ['x'], note: null, at: null, by: null } } });
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
    expect(out.handOverrides.r1['2026-07-07']).toEqual({ shiftId: 'TRAUMA-D', ruleIds: ['traumaDayRotationGuard'], note: 'why', at: 'NOW', by: 'me@x.y' });
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
    expect(syncHandOverrides(p, next, null).handOverrides).toEqual(ho);
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
  it('only pure eligibility-guard overrides are solver-safe', () => {
    expect(solverUnsafeHandOverrides(ho, sched)).toEqual([]);
    const h = { r1: { d: entry({ shiftId: 'PED-N', ruleIds: ['nightRunMax'] }) } };
    expect(solverUnsafeHandOverrides(h, { r1: { d: 'PED-N' } })).toHaveLength(1);
    expect(solverUnsafeHandOverrides(h, { r1: { d: null } })).toEqual([]); // stale = inert
  });
});
