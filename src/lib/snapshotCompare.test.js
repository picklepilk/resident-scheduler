import { describe, it, expect } from 'vitest';
import { snapshotsEqual } from './snapshotCompare.js';

describe('snapshotsEqual', () => {
  const base = { schedule: { a: 1 }, notes: 'x' };
  it('old snapshot without handOverrides equals block with {}', () => {
    expect(snapshotsEqual({ ...base, handOverrides: {} }, base)).toBe(true);
    expect(snapshotsEqual(base, { ...base, handOverrides: {}, issueAcks: [], lastGenerated: null })).toBe(true);
  });
  it('real override is not equal', () => {
    expect(snapshotsEqual({ ...base, handOverrides: { r1: { x: 1 } } }, base)).toBe(false);
  });
  it('non-allowlisted empty field still compared', () => {
    expect(snapshotsEqual({ ...base, extra: {} }, base)).toBe(false);
    expect(snapshotsEqual({ ...base, lockedCells: [] }, base)).toBe(false);
  });
  it('genuine data difference still dirty', () => {
    expect(snapshotsEqual({ ...base, notes: 'y' }, base)).toBe(false);
  });
});
