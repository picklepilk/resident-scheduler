/** @vitest-environment jsdom */
// withActivity: the wiring that stamps block.activityLog on tracked changes (see lib/blockActivity.js).
import { describe, it, expect } from 'vitest';
import { withActivity } from '../ResidentScheduler.jsx';

const viewer = { userId: 'u1', email: 'a@x.org' };

describe('withActivity', () => {
  it('infers edit from schedule diff and stamps the viewer', () => {
    const out = withActivity({ schedule: { r1: {} } }, { schedule: { r1: { '2026-10-01': 'POD-D' } } }, undefined, viewer);
    expect(out.activityLog).toHaveLength(1);
    expect(out.activityLog[0]).toMatchObject({ kind: 'edit', cells: 1, by: 'u1', email: 'a@x.org' });
  });
  it('infers lock from lockedCells-only change', () => {
    const out = withActivity({ schedule: {}, lockedCells: {} }, { schedule: {}, lockedCells: { r1: { d: true } } }, undefined, viewer);
    expect(out.activityLog[0]).toMatchObject({ kind: 'lock', cells: 1 });
  });
  it('returns next unchanged when nothing changed and no kind given', () => {
    const next = { schedule: {} };
    expect(withActivity({ schedule: {} }, next, undefined, viewer)).toBe(next);
  });
  it('explicit kind logs even with zero cells; null viewer gives null actor', () => {
    const out = withActivity({ schedule: {} }, { schedule: {} }, { kind: 'generate', note: 'local' }, undefined);
    expect(out.activityLog[0]).toMatchObject({ kind: 'generate', by: null, email: null, note: 'local' });
  });
  it('does not mutate prev log', () => {
    const prev = { schedule: {}, activityLog: [] };
    withActivity(prev, { schedule: { r: { d: 'POD-D' } } }, undefined, viewer);
    expect(prev.activityLog).toEqual([]);
  });
});
