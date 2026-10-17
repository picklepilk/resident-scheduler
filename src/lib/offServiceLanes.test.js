import { describe, it, expect } from 'vitest';
import { laneBar, laneBoundaries } from './offServiceLanes.js';

const blocks = [
  { start: '2026-07-01', end: '2026-07-28' }, // 28 days
  { start: '2026-07-29', end: '2026-08-25' },
  { start: '2026-08-26', end: '2026-09-22' },
];

describe('laneBoundaries', () => {
  it('returns n+1 edges', () => expect(laneBoundaries(3, 100)).toEqual([0, 100, 200, 300]));
});

describe('laneBar', () => {
  it('aligned window spans whole blocks with no mid caps', () => {
    const b = laneBar(blocks, { start: '2026-07-01', end: '2026-08-25' }, 280);
    expect(b).toMatchObject({ x0: 0, x1: 560, startMid: false, endMid: false, contLeft: false, contRight: false });
  });
  it('mid-block start and end are flagged and placed proportionally', () => {
    const b = laneBar(blocks, { start: '2026-07-15', end: '2026-08-11' }, 280);
    expect(b.x0).toBeCloseTo(140); // day offset 14 of 28
    expect(b.x1).toBeCloseTo(280 + 140); // 14th day of block 2 ends at half
    expect(b.startMid).toBe(true);
    expect(b.endMid).toBe(true);
  });
  it('window before the first block clamps left with a continuation cap', () => {
    const b = laneBar(blocks, { start: '2026-06-10', end: '2026-07-10' }, 100);
    expect(b.x0).toBe(0);
    expect(b.contLeft).toBe(true);
    expect(b.startMid).toBe(false);
    expect(b.endMid).toBe(true);
  });
  it('window after the last block clamps right', () => {
    const b = laneBar(blocks, { start: '2026-09-10', end: '2026-10-20' }, 100);
    expect(b.x1).toBe(300);
    expect(b.contRight).toBe(true);
  });
  it('window entirely outside is zero width at the edge', () => {
    const b = laneBar(blocks, { start: '2026-12-01', end: '2026-12-20' }, 100);
    expect(b).toMatchObject({ x0: 300, x1: 300, outside: true, contRight: true });
    const c = laneBar(blocks, { start: '2026-05-01', end: '2026-05-20' }, 100);
    expect(c).toMatchObject({ x0: 0, x1: 0, outside: true, contLeft: true });
  });
  it('gap between blocks snaps to neighbouring block edges', () => {
    const gapped = [{ start: '2026-07-01', end: '2026-07-28' }, { start: '2026-08-05', end: '2026-08-30' }];
    const b = laneBar(gapped, { start: '2026-07-20', end: '2026-08-02' }, 100);
    expect(b.x1).toBe(100);
    expect(b.contRight).toBe(true);
    const c = laneBar(gapped, { start: '2026-07-30', end: '2026-08-10' }, 100);
    expect(c.x0).toBe(100);
    expect(c.contLeft).toBe(true);
  });
  it('rejects invalid input', () => {
    expect(laneBar([], { start: '2026-07-01', end: '2026-07-02' }, 100)).toBeNull();
    expect(laneBar(blocks, { start: 'x', end: '2026-07-02' }, 100)).toBeNull();
    expect(laneBar(blocks, { start: '2026-07-05', end: '2026-07-02' }, 100)).toBeNull();
  });
});
