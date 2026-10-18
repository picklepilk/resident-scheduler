import { describe, it, expect } from 'vitest';
import { compactSchedule, buildLastGenerated, sinceGenerateRows, revertRows } from './sinceGenerate.js';

const base = { r1: { '2026-01-01': 'POD-D', '2026-01-02': 'POD-N', '2026-01-03': '' }, r2: { '2026-01-01': 'PED-D' } };

describe('sinceGenerate', () => {
  it('compacts empties', () => {
    expect(compactSchedule(base).r1).toEqual({ '2026-01-01': 'POD-D', '2026-01-02': 'POD-N' });
    expect(compactSchedule(null)).toEqual({});
  });
  it('no rows when unchanged or no baseline', () => {
    const lg = buildLastGenerated({ schedule: base, engine: 'local' });
    expect(sinceGenerateRows(lg, base)).toEqual([]);
    expect(sinceGenerateRows(null, base)).toEqual([]);
  });
  it('detects added/removed/changed', () => {
    const lg = buildLastGenerated({ schedule: base });
    const now = { r1: { '2026-01-01': 'MT-D', '2026-01-03': 'POD-D' }, r2: { '2026-01-01': 'PED-D' } };
    const rows = sinceGenerateRows(lg, now);
    expect(rows).toHaveLength(3);
    expect(rows.find(r => r.date === '2026-01-01')).toMatchObject({ from: 'POD-D', to: 'MT-D', type: 'changed' });
    expect(rows.find(r => r.date === '2026-01-02')).toMatchObject({ from: 'POD-N', to: null, type: 'removed' });
    expect(rows.find(r => r.date === '2026-01-03')).toMatchObject({ from: null, to: 'POD-D', type: 'added' });
  });
  it('reverts, respecting locks', () => {
    const lg = buildLastGenerated({ schedule: base });
    const now = { r1: { '2026-01-01': 'MT-D', '2026-01-03': 'POD-D' }, r2: base.r2 };
    const rows = sinceGenerateRows(lg, now);
    const blk = { schedule: now, lockedCells: { r1: { '2026-01-01': true } } };
    const res = revertRows(blk, rows);
    expect(res.skippedLocked).toBe(1);
    expect(res.reverted).toBe(2);
    expect(res.block.schedule.r1['2026-01-01']).toBe('MT-D');
    expect(res.block.schedule.r1['2026-01-03']).toBeUndefined();
    expect(res.block.schedule.r1['2026-01-02']).toBe('POD-N');
    expect(blk.schedule.r1['2026-01-03']).toBe('POD-D');
    const all = revertRows(blk, rows, { allowLocked: true });
    expect(sinceGenerateRows(lg, all.block.schedule)).toEqual([]);
  });
});
