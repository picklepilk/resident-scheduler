import { describe, it, expect } from 'vitest';
import { computeTraumaSplitCapacity } from './traumaSplitCapacity.js';

// Block 2026-07-06 (Mon) .. 2026-08-02 (Sun): 28 days. First half 7/6-7/19, second 7/20-8/2.
const block = { startDate: '2026-07-06', endDate: '2026-08-02' };
const mk = (id, blockType) => ({ id, category: 'EM_HOME', pgy: 1, blockType });
const base = { ...block, traumaBlocks: ['TRAUMA_PEDS', 'PEDS_TRAUMA'], perResident: 8 };

describe('computeTraumaSplitCapacity', () => {
  it('one intern per half fits exactly (8 Trauma Days in 14 days)', () => {
    const r = computeTraumaSplitCapacity({ ...base, residents: [mk('a', 'TRAUMA_PEDS'), mk('b', 'PEDS_TRAUMA')] });
    expect(r.groups.map(g => [g.slots, g.needed])).toEqual([[8, 8], [8, 8]]);
    expect(r.shortfalls).toEqual([]);
  });
  it('three interns sharing the first half is a shortfall', () => {
    const r = computeTraumaSplitCapacity({ ...base, residents: [mk('a', 'TRAUMA_PEDS'), mk('b', 'TRAUMA_PEDS'), mk('c', 'TRAUMA_PEDS')] });
    expect(r.shortfalls).toHaveLength(1);
    const s = r.shortfalls[0];
    expect([s.count, s.needed, s.slots, s.start, s.end]).toEqual([3, 24, 8, '2026-07-06', '2026-07-19']);
    expect(s.message).toMatch(/3 Trauma\/Peds interns share 7\/6-7\/19: need 24 Trauma Days, only 8 exist/);
  });
  it('second half uses Peds/Trauma label and clips to block end', () => {
    const r = computeTraumaSplitCapacity({ ...base, residents: [mk('a', 'PEDS_TRAUMA'), mk('b', 'PEDS_TRAUMA')] });
    expect(r.shortfalls[0].message).toMatch(/2 Peds\/Trauma interns share 7\/20-8\/2/);
  });
  it('ignores non-split blocks and off-service residents', () => {
    const r = computeTraumaSplitCapacity({ ...base, residents: [mk('a', 'POD_1'), { id: 'x', category: 'OFF_SERVICE', blockType: 'TRAUMA_PEDS' }] });
    expect(r.groups).toEqual([]);
  });
  it('short block clips the second half window', () => {
    const r = computeTraumaSplitCapacity({ ...base, endDate: '2026-07-22', residents: [mk('a', 'PEDS_TRAUMA')] });
    expect(r.groups[0].end).toBe('2026-07-22');
    expect(r.groups[0].slots).toBe(1); // 7/20 Mon, 7/21 Tue, 7/22 Wed -> only Tue
  });
  it('bad input returns empty', () => {
    expect(computeTraumaSplitCapacity({}).groups).toEqual([]);
  });
});
