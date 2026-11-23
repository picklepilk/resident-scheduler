import { describe, it, expect } from 'vitest';
import { buildSolverTestFile, readSolverTestFile } from './solverTestFile.js';

const mk = () => ({
  residents: [
    { id: 'uuid-aaa', name: 'Zed Zebra', firstName: 'Zed', lastName: 'Zebra', email: 'z@example.test', pgy: 1, notes: 'secret', targetNote: 'tn' },
    { id: 'uuid-bbb', fullName: 'Y Yak', pgy: 2 },
  ],
  hint: { 'uuid-aaa': { '2026-07-01': 'POD-D' }, 'uuid-bbb': {} },
  locked: [{ resident: 'uuid-bbb', date: '2026-07-02', shift: 'POD-D' }],
  pairs: [['uuid-aaa', 'uuid-bbb']],
  config: { maxTimeSeconds: 60 },
});
const meta = { label: 'L', startDate: '2026-07-01', endDate: '2026-07-28', createdAt: 'T' };

describe('solverTestFile', () => {
  it('codes ids in keys and values and drops name fields', () => {
    const f = buildSolverTestFile(mk(), meta);
    const s = JSON.stringify(f);
    expect(s).not.toMatch(/uuid-/);
    expect(f.payload.residents.map(r => r.id)).toEqual(['R01', 'R02']);
    expect(f.payload.hint.R01['2026-07-01']).toBe('POD-D');
    expect(f.payload.locked[0].resident).toBe('R02');
    expect(f.payload.pairs[0]).toEqual(['R01', 'R02']);
    for (const k of ['Zebra', 'firstName', 'email', 'notes', 'targetNote', 'fullName']) expect(s).not.toContain(k);
    expect(f.residentCount).toBe(2);
    expect(f.kind).toBe('resident-solver-test');
  });
  it('does not mutate input', () => {
    const p = mk(); buildSolverTestFile(p, meta);
    expect(p.residents[0].id).toBe('uuid-aaa');
  });
  it('throws on leaked name without echoing it', () => {
    const p = mk(); p.config.tag = 'prefix zebra suffix';
    let err;
    try { buildSolverTestFile(p, { ...meta, nameStrings: ['Zebra', 'ab'] }); } catch (e) { err = e; }
    expect(err.message).toMatch(/1 resident/);
    expect(err.message.toLowerCase()).not.toContain('zebra');
  });
  it('round trips and rejects bad kind/version', () => {
    const f = buildSolverTestFile(mk(), meta);
    const { payload, meta: m } = readSolverTestFile(JSON.stringify(f));
    expect(payload.residents).toHaveLength(2);
    expect(m.label).toBe('L');
    expect(() => readSolverTestFile({ ...f, kind: 'x' })).toThrow(/kind/);
    expect(() => readSolverTestFile({ ...f, version: 2 })).toThrow(/version/);
  });
  it('uses 3-digit codes past 99 residents', () => {
    const residents = Array.from({ length: 100 }, (_, i) => ({ id: `id${i}`, pgy: 1 }));
    const f = buildSolverTestFile({ residents }, meta);
    expect(f.payload.residents[0].id).toBe('R001');
    expect(f.payload.residents[99].id).toBe('R100');
  });
});
