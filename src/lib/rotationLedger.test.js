import { describe, it, expect } from 'vitest';
import {
  STANDARD_ROTATION_DAYS, normalizeRotation, rotationKey, rotationObligation,
  rotationSegments, segmentCapacity, rotationLedger,
} from './rotationLedger.js';

const T = { PEDS_2: 15, NEURO_1: 14, PEDS_1: 15, IM_1: 6, EM_BAMC_1: 10 };
const rot = (o = {}) => ({
  id: 'r1', firstName: 'Zed', lastName: 'Testo', category: 'PEDS', pgy: 2,
  start: '2026-11-02', end: '2026-11-15', scheduledByUs: true, obligation: null,
  ranges: [], splits: [], importedAt: null, ...o,
});
const B = (id, startDate, endDate) => ({ id, startDate, endDate });
const blocks = [B('b1', '2026-11-02', '2026-11-29'), B('b2', '2026-11-30', '2026-12-27'), B('b3', '2026-12-28', '2027-01-24')];
const opts = { blocks, shiftTargets: T };

describe('constants', () => {
  it('standards', () => { expect(STANDARD_ROTATION_DAYS).toEqual({ default: 28, IM: 15 }); });
});

describe('rotationObligation auto scaling', () => {
  it('14-day PEDS_2 15 -> 8', () => {
    expect(rotationObligation(rot(), T)).toEqual({ value: 8, source: 'auto', base: 15 });
  });
  it('7-day NEURO_1 14 -> 4 (3.5 rounds up)', () => {
    expect(rotationObligation(rot({ category: 'NEURO', pgy: 1, end: '2026-11-08' }), T).value).toBe(4);
  });
  it('35-day PEDS -> 15', () => {
    expect(rotationObligation(rot({ end: '2026-12-06' }), T).value).toBe(15);
  });
  it('IM 15-day base 6 -> 6; 8-day -> 3', () => {
    expect(rotationObligation(rot({ category: 'IM', pgy: 1, end: '2026-11-16' }), T).value).toBe(6);
    expect(rotationObligation(rot({ category: 'IM', pgy: 1, end: '2026-11-09' }), T).value).toBe(3);
  });
  it('min 1 when base > 0', () => {
    expect(rotationObligation(rot({ category: 'IM', pgy: 1, end: '2026-11-02' }), { IM_1: 2 }).value).toBe(1);
  });
  it('typed wins', () => {
    expect(rotationObligation(rot({ obligation: 5 }), T)).toEqual({ value: 5, source: 'typed', base: 15 });
    expect(rotationObligation(rot({ obligation: 0 }), T).value).toBe(0);
  });
  it('unknown base null', () => { expect(rotationObligation(rot({ pgy: 9 }), T)).toBeNull(); });
  it('BAMC and scheduledByUs false null', () => {
    expect(rotationObligation(rot({ category: 'EM_BAMC', pgy: 1 }), T)).toBeNull();
    expect(rotationObligation(rot({ scheduledByUs: false }), T)).toBeNull();
    expect(rotationLedger(rot({ category: 'EM_BAMC', pgy: 1 }), blocks[0], opts)).toBeNull();
    expect(rotationLedger(rot({ scheduledByUs: false }), blocks[0], opts)).toBeNull();
  });
});

describe('segments', () => {
  it('across 3 blocks', () => {
    const segs = rotationSegments(rot({ start: '2026-11-20', end: '2027-01-05' }), [...blocks].reverse());
    expect(segs.map(s => [s.start, s.end, s.blockId])).toEqual([
      ['2026-11-20', '2026-11-29', 'b1'],
      ['2026-11-30', '2026-12-27', 'b2'],
      ['2026-12-28', '2027-01-05', 'b3'],
    ]);
    expect(segs.map(s => s.days)).toEqual([10, 28, 9]);
  });
  it('inside one block is one segment', () => {
    expect(rotationSegments(rot(), blocks)).toEqual([{ start: '2026-11-02', end: '2026-11-15', days: 14, blockId: 'b1' }]);
  });
  it('split points start a new segment', () => {
    const segs = rotationSegments(rot({ splits: ['2026-11-09'] }), blocks);
    expect(segs.map(s => [s.start, s.end])).toEqual([['2026-11-02', '2026-11-08'], ['2026-11-09', '2026-11-15']]);
  });
  it('capacity', () => {
    expect(segmentCapacity({ days: 7 })).toBe(6);
    expect(segmentCapacity({ days: 14 })).toBe(12);
    expect(segmentCapacity({ days: 6 })).toBe(6);
    expect(segmentCapacity({ days: 0 })).toBe(0);
  });
});

describe('rotationLedger', () => {
  it('inside block: whole obligation here', () => {
    const l = rotationLedger(rot(), blocks[0], opts);
    expect(l).toMatchObject({ obligation: 8, obligationSource: 'auto', base: 15, doneBefore: 0, dueHere: 8, owedAfter: 0, cannotFit: 0, doneBeforeSource: 'none' });
  });
  it('straddle splits by days (estimated)', () => {
    const s = rotationLedger(rot({ start: '2026-11-16', end: '2026-12-13' }), B('d', '2026-11-02', '2026-11-29'), { blocks: [], shiftTargets: T });
    expect(s.segments.map(x => [x.where, x.days, x.count])).toEqual([['here', 14, 8], ['after', 14, 7]]);
    expect(s.dueHere + s.owedAfter).toBe(15);
  });
  it('Peds 11/2-11/29 vs block 11/16-12/13, before pinned 7 typed -> here 8', () => {
    const blk = B('c', '2026-11-16', '2026-12-13');
    const l = rotationLedger(rot({ end: '2026-11-29', ranges: [{ start: '2026-11-02', end: '2026-11-15', count: 7, source: 'typed' }] }),
      blk, { blocks: [blk], shiftTargets: T });
    expect(l.doneBefore).toBe(7);
    expect(l.doneBeforeSource).toBe('typed');
    expect(l.dueHere).toBe(8);
    expect(l.owedAfter).toBe(0);
  });
  it('unpinned before is estimated', () => {
    const blk = B('c', '2026-11-16', '2026-12-13');
    const l = rotationLedger(rot({ end: '2026-11-29' }), blk, { blocks: [blk], shiftTargets: T });
    expect(l.doneBeforeSource).toBe('estimated');
    expect(l.doneBefore + l.dueHere).toBe(15);
  });
  it('pinned range spanning segments shares by days', () => {
    const l = rotationLedger(rot({ start: '2026-11-20', end: '2026-12-10', ranges: [{ start: '2026-11-20', end: '2026-12-10', count: 10, source: 'qgenda' }] }),
      blocks[1], opts);
    expect(l.segments.map(s => [s.where, s.days, s.count, s.source])).toEqual([['before', 10, 5, 'qgenda'], ['here', 11, 5, 'qgenda']]);
    expect(l.doneBeforeSource).toBe('qgenda');
  });
  it('partial pinned range realigns segments', () => {
    const l = rotationLedger(rot({ ranges: [{ start: '2026-11-02', end: '2026-11-04', count: 3, source: 'saved' }] }), blocks[0], opts);
    expect(l.segments.map(s => [s.start, s.end, s.count, s.source])).toEqual([
      ['2026-11-02', '2026-11-04', 3, 'saved'], ['2026-11-05', '2026-11-15', 5, 'auto']]);
  });
  it('capacity cap and cannotFit', () => {
    const l = rotationLedger(rot({ end: '2026-11-08', obligation: 15 }), blocks[0], opts);
    expect(l.dueHere).toBe(6);
    expect(l.cannotFit).toBe(9);
  });
  it('overflow redistributes to segments with spare capacity', () => {
    const base = { start: '2026-11-23', end: '2026-12-20', splits: ['2026-11-30'] }; // 7 + 21 days
    const l = rotationLedger(rot({ ...base, obligation: 24 }), blocks[0], opts);
    expect(l.segments.map(s => s.days)).toEqual([7, 21]);
    expect(l.segments.map(s => s.count)).toEqual([6, 18]);
    expect(l.cannotFit).toBe(0);
    const l2 = rotationLedger(rot({ ...base, obligation: 20 }), blocks[0], opts);
    expect(l2.segments.map(s => s.count)).toEqual([5, 15]);
    const l3 = rotationLedger(rot({ ...base, obligation: 30 }), blocks[0], opts);
    expect(l3.segments.map(s => s.count)).toEqual([6, 18]);
    expect(l3.cannotFit).toBe(6);
  });
  it('tight segment overflow goes to roomy one', () => {
    const l = rotationLedger(rot({ start: '2026-11-28', end: '2026-12-25', obligation: 25 }), blocks[0], opts);
    expect(l.segments.map(s => s.days)).toEqual([2, 26]);
    expect(l.segments.reduce((a, s) => a + s.count, 0)).toBe(25);
    expect(l.segments[0].count).toBeLessThanOrEqual(2);
    expect(l.cannotFit).toBe(0);
  });
  it('pinned over capacity not capped, no cannotFit', () => {
    const l = rotationLedger(rot({ end: '2026-11-08', obligation: 9, ranges: [{ start: '2026-11-02', end: '2026-11-08', count: 9, source: 'typed' }] }), blocks[0], opts);
    expect(l.dueHere).toBe(9);
    expect(l.cannotFit).toBe(0);
  });
  it('pinned exceeds obligation -> unpinned gets 0', () => {
    const l = rotationLedger(rot({ start: '2026-11-02', end: '2026-11-29', obligation: 4, ranges: [{ start: '2026-11-02', end: '2026-11-15', count: 7, source: 'typed' }] }), blocks[0], opts);
    expect(l.segments.map(s => s.count)).toEqual([7, 0]);
  });
  it('typed obligation source passes through', () => {
    expect(rotationLedger(rot({ obligation: 3 }), blocks[0], opts)).toMatchObject({ obligationSource: 'typed', dueHere: 3 });
  });
  it('rotation not touching block still returns ledger, never here', () => {
    const l = rotationLedger(rot(), blocks[2], opts);
    expect(l.segments.every(s => s.where === 'before')).toBe(true);
    expect(l.dueHere).toBe(0);
  });
  it('deterministic, order independent, totals add up', () => {
    const r = rot({ start: '2026-11-20', end: '2027-01-05', splits: ['2026-12-05'] });
    const a = rotationLedger(r, blocks[1], { blocks: [...blocks].reverse(), shiftTargets: T });
    const b = rotationLedger(r, blocks[1], opts);
    expect(a).toEqual(b);
    const starts = a.segments.map(s => s.start);
    expect(starts).toEqual([...starts].sort());
    expect(a.doneBefore + a.dueHere + a.owedAfter + a.cannotFit).toBe(a.obligation);
  });
  it('bad block null', () => {
    expect(rotationLedger(rot(), null, opts)).toBeNull();
    expect(rotationLedger(rot(), { startDate: 'x', endDate: 'y' }, opts)).toBeNull();
  });
});

describe('normalizeRotation', () => {
  it('garbage -> null', () => {
    for (const g of [null, undefined, 'str', 5, [], {}, { start: 'bad', end: '2026-11-02' },
      { start: '2026-02-31', end: '2026-03-02' }, { start: '2026-11-10', end: '2026-11-02' }]) {
      expect(normalizeRotation(g)).toBeNull();
    }
  });
  it('cleans ranges/splits/obligation', () => {
    const n = normalizeRotation({
      start: '2026-11-02', end: '2026-11-15', obligation: -3, scheduledByUs: undefined,
      ranges: [null, 'x', { start: '2026-11-01', end: '2026-11-04', count: 2.6, source: 'weird' },
        { start: '2026-11-03', end: '2026-11-04', count: -1 },
        { start: '2026-12-01', end: '2026-12-02', count: 1 },
        { start: '2026-11-04', end: '2026-11-03', count: 1 },
        { start: '2026-11-10', end: '2026-12-30', count: 'a' }],
      splits: ['2026-11-09', '2026-11-09', 'bad', '2026-11-02', '2026-12-30', 7, '2026-11-05'],
    });
    expect(n.obligation).toBeNull();
    expect(n.scheduledByUs).toBe(true);
    expect(n.ranges).toEqual([{ start: '2026-11-02', end: '2026-11-04', count: 3, source: 'typed' }]);
    expect(n.splits).toEqual(['2026-11-05', '2026-11-09']);
  });
  it('idempotent, non-string names ok', () => {
    const n = normalizeRotation({ start: '2026-11-02', end: '2026-11-15', firstName: 4, lastName: null, obligation: '6' });
    expect(n.firstName).toBe('');
    expect(n.obligation).toBe(6);
    expect(normalizeRotation(n)).toEqual(n);
  });
  it('scheduledByUs false preserved', () => {
    expect(normalizeRotation({ start: '2026-11-02', end: '2026-11-15', scheduledByUs: false }).scheduledByUs).toBe(false);
  });
});

describe('rotationKey', () => {
  it('stable and normalized', () => {
    expect(rotationKey(rot({ firstName: " Zed-O'", lastName: 'Te sto' }))).toBe('testo|zedo|peds|2026-11-02');
    expect(rotationKey(rot({ firstName: 'ZED', lastName: 'TESTO' }))).toBe(rotationKey(rot({ firstName: 'zed', lastName: 'testo' })));
    expect(rotationKey(null)).toBe('|||');
  });
});
