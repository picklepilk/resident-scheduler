import { describe, it, expect } from 'vitest';
import { clearScheduleFields } from './clearSchedule.js';

const mk = () => ({
  schedule: { r1: { '2026-07-01': 'POD-D', '2026-07-02': 'POD-D', '2026-07-10': 'POD-N' }, r2: { '2026-07-02': 'PED-S' } },
  lockedCells: { r1: { '2026-07-02': true } },
  handOverrides: { r1: { '2026-07-02': { shiftId: 'POD-D', ruleIds: ['x'] }, '2026-07-01': { shiftId: 'POD-D', ruleIds: ['x'] } } },
  generationReport: { a: 1 }, lastGenerated: { b: 1 }, generatedWithGaps: { c: 1 },
  issueAcks: { 'underTarget|r1|2026-07-01|||m': { at: '' }, 'k|r2|2026-07-10|||m': {}, 'agg||||||m': {} },
  name: 'B',
});

describe('clearScheduleFields', () => {
  it('all wipes everything', () => {
    const { block, cleared } = clearScheduleFields(mk(), { mode: 'all' });
    expect(cleared).toBe(4);
    expect(block).toMatchObject({ schedule: {}, lockedCells: {}, handOverrides: {}, generationReport: null, lastGenerated: null, generatedWithGaps: null, issueAcks: {}, name: 'B' });
  });
  it('unlocked keeps locked cells and locks, prunes overrides', () => {
    const { block, cleared } = clearScheduleFields(mk(), { mode: 'unlocked' });
    expect(cleared).toBe(3);
    expect(block.schedule).toEqual({ r1: { '2026-07-02': 'POD-D' } });
    expect(block.lockedCells).toEqual({ r1: { '2026-07-02': true } });
    expect(Object.keys(block.handOverrides.r1)).toEqual(['2026-07-02']);
    expect(block.generationReport).toBeNull();
    expect(block.issueAcks).toEqual({});
  });
  it('range clears only unlocked cells in range, inclusive', () => {
    const { block, cleared } = clearScheduleFields(mk(), { mode: 'range', start: '2026-07-01', end: '2026-07-02' });
    expect(cleared).toBe(2);
    expect(block.schedule).toEqual({ r1: { '2026-07-02': 'POD-D', '2026-07-10': 'POD-N' } });
    expect(block.schedule.r2).toBeUndefined();
    expect(Object.keys(block.issueAcks).sort()).toEqual(['k|r2|2026-07-10|||m']);
  });
  it('rejects bad range', () => {
    const b = mk();
    const r = clearScheduleFields(b, { mode: 'range', start: '2026-07-05', end: '2026-07-01' });
    expect(r.error).toBeTruthy();
    expect(r.cleared).toBe(0);
    expect(r.block).toBe(b);
  });
  it('tolerates missing/junk fields', () => {
    expect(clearScheduleFields({}, { mode: 'unlocked' }).cleared).toBe(0);
    expect(clearScheduleFields(null, { mode: 'all' }).block.schedule).toEqual({});
    const r = clearScheduleFields({ schedule: { r1: 'junk', r2: { d: 'S' } }, lockedCells: [], handOverrides: 'x', issueAcks: 5 }, { mode: 'unlocked' });
    expect(r.cleared).toBe(1);
    expect(r.block.schedule).toEqual({});
  });
});
