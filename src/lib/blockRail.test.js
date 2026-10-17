import { describe, it, expect } from 'vitest';
import { ayOptionsFor, buildRailBlocks, railNumeral, todayMarker, shortDateRange } from './blockRail.js';

const snap = (id, ay, start, end, over = {}) => ({
  id, name: `Block ${id}`, academicYear: ay, startDate: start, endDate: end, published: false,
  data: { schedule: { r1: { [start]: 'POD-D' } }, activityLog: [{ at: 'x' }] }, ...over,
});

describe('ayOptionsFor', () => {
  it('returns unique AYs sorted descending, includes the live block AY', () => {
    const h = [snap('a', '2025-26', '2025-07-01', '2025-07-28'), snap('b', '2026-27', '2026-07-01', '2026-07-28'), snap('c', '2025-26', '2025-08-01', '2025-08-28')];
    expect(ayOptionsFor(h, { academicYear: '2027-28' })).toEqual(['2027-28', '2026-27', '2025-26']);
  });
  it('falls back to Unknown for snapshots without an AY and tolerates a missing live AY', () => {
    expect(ayOptionsFor([snap('a', '', '2025-07-01', '2025-07-28')], {})).toEqual(['Unknown']);
    expect(ayOptionsFor([], null)).toEqual([]);
  });
});

describe('buildRailBlocks', () => {
  const h = [snap('b2', '2026-27', '2026-08-01', '2026-08-28'), snap('b1', '2026-27', '2026-07-01', '2026-07-28'), snap('o', '2025-26', '2025-07-01', '2025-07-28')];
  it('excludes other AYs and sorts by start date', () => {
    const rows = buildRailBlocks({ blocksHistory: h, liveBlock: { id: 'zzz', academicYear: '2026-27' }, ay: '2026-27' });
    expect(rows.map(r => r.id)).toEqual(['b1', 'b2']);
    expect(rows.every(r => !r.isLive && !r.unsaved)).toBe(true);
  });
  it('live block overrides the same-id snapshot schedule and activity log', () => {
    const live = { id: 'b1', academicYear: '2026-27', startDate: '2026-07-01', endDate: '2026-07-28', schedule: { live: {} }, activityLog: [{ at: 'live' }] };
    const rows = buildRailBlocks({ blocksHistory: h, liveBlock: live, ay: '2026-27' });
    const r = rows.find(x => x.id === 'b1');
    expect(r.isLive).toBe(true);
    expect(r.unsaved).toBe(false);
    expect(r.schedule).toBe(live.schedule);
    expect(r.activityLog).toBe(live.activityLog);
    expect(rows.find(x => x.id === 'b2').schedule).toEqual(h[0].data.schedule);
    expect(rows.find(x => x.id === 'b2').activityLog).toEqual(h[0].data.activityLog);
  });
  it('live row uses the live block name and dates, not the stale snapshot', () => {
    const live = { id: 'b1', name: 'Renamed', academicYear: '2026-27', startDate: '2026-07-02', endDate: '2026-07-29', schedule: {} };
    const r = buildRailBlocks({ blocksHistory: h, liveBlock: live, ay: '2026-27' }).find(x => x.id === 'b1');
    expect(r).toMatchObject({ name: 'Renamed', startDate: '2026-07-02', endDate: '2026-07-29' });
    expect(r.snap.name).toBe('Block b1');
  });
  it('appends an unsaved live block with dates and keeps order', () => {
    const live = { id: 'new', name: 'Fresh', academicYear: '2026-27', startDate: '2026-06-01', endDate: '2026-06-28', schedule: {} };
    const rows = buildRailBlocks({ blocksHistory: h, liveBlock: live, ay: '2026-27' });
    expect(rows[0]).toMatchObject({ id: 'new', isLive: true, unsaved: true, key: '__live_new', published: false });
    expect(rows).toHaveLength(3);
  });
  it('omits a live block without a start date or in another AY', () => {
    expect(buildRailBlocks({ blocksHistory: [], liveBlock: { id: 'x', academicYear: '2026-27' }, ay: '2026-27' })).toEqual([]);
    expect(buildRailBlocks({ blocksHistory: [], liveBlock: { id: 'x', academicYear: '2025-26', startDate: '2025-07-01' }, ay: '2026-27' })).toEqual([]);
  });
  it('flags imported and published snapshots; tolerates missing data', () => {
    const rows = buildRailBlocks({
      blocksHistory: [{ id: 'blk_import_1', academicYear: '2026-27', startDate: '2026-07-01', endDate: '2026-07-28', published: true }],
      liveBlock: null, ay: '2026-27',
    });
    expect(rows[0]).toMatchObject({ imported: true, published: true, schedule: {}, activityLog: [] });
  });
});

describe('railNumeral', () => {
  it('uses the first integer in the name, zero padded', () => {
    expect(railNumeral('Block 5 - Oct', 0)).toBe('05');
    expect(railNumeral('B12', 0)).toBe('12');
    expect(railNumeral('Block 123', 0)).toBe('123');
  });
  it('falls back to index + 1', () => {
    expect(railNumeral('Orientation', 2)).toBe('03');
    expect(railNumeral('', 0)).toBe('01');
    expect(railNumeral(undefined, 11)).toBe('12');
  });
});

describe('todayMarker', () => {
  const blocks = [
    { key: 'a', startDate: '2026-07-01', endDate: '2026-07-10' },
    { key: 'b', startDate: '2026-07-11', endDate: '2026-07-20' },
  ];
  it('returns the block and centre-of-day fraction', () => {
    const m = todayMarker(blocks, '2026-07-13');
    expect(m.key).toBe('b');
    expect(m.fraction).toBeCloseTo(0.25, 5);
  });
  it('is inclusive on both edges and stays inside 0..1', () => {
    const first = todayMarker(blocks, '2026-07-01');
    expect(first.key).toBe('a');
    expect(first.fraction).toBeCloseTo(0.05, 5);
    const last = todayMarker(blocks, '2026-07-20');
    expect(last.key).toBe('b');
    expect(last.fraction).toBeCloseTo(0.95, 5);
  });
  it('returns null outside every block or with bad input', () => {
    expect(todayMarker(blocks, '2026-06-30')).toBeNull();
    expect(todayMarker(blocks, '2026-07-21')).toBeNull();
    expect(todayMarker([], '2026-07-01')).toBeNull();
    expect(todayMarker(blocks, '')).toBeNull();
    expect(todayMarker([{ key: 'x' }], '2026-07-01')).toBeNull();
  });
});

describe('shortDateRange', () => {
  it('formats an inclusive span with an en dash', () => {
    expect(shortDateRange('2026-10-13', '2026-11-09')).toBe('Oct 13–Nov 9');
  });
  it('degrades gracefully on missing dates', () => {
    expect(shortDateRange('2026-10-13', '')).toBe('Oct 13');
    expect(shortDateRange(undefined, undefined)).toBe('');
  });
});
