import { describe, it, expect } from 'vitest';
import { parseSlotLabel, slotRuns, rankRunsForRange } from './qgendaSlotRuns.js';

// Invented grid: 2026-07-29 .. 2026-08-27 (30 columns, crosses the Jul/Aug boundary).
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function buildGrid(bodyRows) {
  const days = [];
  for (let i = 0; i < 30; i++) days.push(new Date(Date.UTC(2026, 6, 29 + i)));
  const band = [''], nums = [''], dow = [''];
  days.forEach((d, i) => {
    band.push(i === 0 ? 'Jul-26' : d.getUTCDate() === 1 ? 'Aug-26' : '');
    nums.push(String(d.getUTCDate()));
    dow.push(DOW[d.getUTCDay()]);
  });
  return [['Example Health'], ['Printed: x'], [], band, nums, dow, ...bodyRows];
}
// idx -> task, 0-based date offset from 7/29
function row(name, cells) {
  const r = [name, ...Array(30).fill('')];
  for (const [i, t] of Object.entries(cells)) r[Number(i) + 1] = t;
  return r;
}
const range = (from, to, task) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, k) => [from + k, task]));

describe('parseSlotLabel', () => {
  it('classifies real placeholder labels as slots with hints', () => {
    expect(parseSlotLabel('Neurology 1, Neurology 1')).toMatchObject({ kind: 'slot', hint: { category: 'NEURO' } });
    expect(parseSlotLabel('Anesthesia 6, Anesthesia 6').hint.category).toBe('ANES');
    expect(parseSlotLabel('Family Medicine 2, Family Medicine 2').hint.category).toBe('FM');
    expect(parseSlotLabel('Psychiatry 10, Psychiatry 10').hint.category).toBe('PSYCH');
    expect(parseSlotLabel('Medicine PGY2-6, Medicine PGY2-6')).toMatchObject({ kind: 'slot', hint: { category: 'IM', pgy: 2 } });
    expect(parseSlotLabel('SAMMC9 - PGY2, SAMMC9 - PGY2')).toMatchObject({ hint: { category: 'EM_BAMC', pgy: 2 } });
    expect(parseSlotLabel('Resident 5, SAMMC3 PGY3')).toMatchObject({ kind: 'slot', hint: { category: 'EM_BAMC', pgy: 3 } });
    expect(parseSlotLabel('Off Service, Anes')).toMatchObject({ kind: 'slot', hint: { category: 'ANES' } });
    expect(parseSlotLabel('2026 BAMC Rotator 4, BAMC Rotator 4').hint.category).toBe('EM_BAMC');
    expect(parseSlotLabel('Military PGY-1, Military PGY-1')).toMatchObject({ hint: { category: 'EM_BAMC', pgy: 1 } });
  });
  it('treats Last, First without digits or dept words as person', () => {
    expect(parseSlotLabel('Zzyzx, Quentin')).toMatchObject({ kind: 'person', hint: { category: null, pgy: null } });
  });
  it('treats section rows, MD OPEN, phone numbers and blanks as markers', () => {
    expect(parseSlotLabel('[Residents Off Service]').kind).toBe('marker');
    expect(parseSlotLabel('MD OPEN').kind).toBe('marker');
    expect(parseSlotLabel('210-555-0100').kind).toBe('marker');
    expect(parseSlotLabel('').kind).toBe('marker');
  });
});

describe('slotRuns', () => {
  const grid = buildGrid([
    ['[Residents Off Service]'],
    // run 1: offsets 0-9 (7/29-8/7), Res_Call cells after the run are ignored; run 2 after 12-day gap: 22-27
    row('Neurology 1, Neurology 1', {
      ...range(0, 9, 'MC Team Day 7a-4p'), 10: 'Res_Call PGY2', 11: 'Res_Call PGY2',
      ...range(22, 27, 'Flex Team Night 10p-7a'),
    }),
    row('Psychiatry 3, Psychiatry 3', range(2, 8, '*Peds Day 7a-4p')),
    row('Zzyzx, Quentin', range(0, 29, 'MC Team Day 7a-4p')),
    row('MD OPEN', range(0, 3, 'MC Team Day 7a-4p')),
  ]);
  const runs = slotRuns(grid);

  it('ignores person and marker rows', () => {
    expect(new Set(runs.map(r => r.slot))).toEqual(new Set(['Neurology 1, Neurology 1', 'Psychiatry 3, Psychiatry 3']));
  });
  it('splits one slot into two runs across a long gap and crosses the month boundary', () => {
    const n = runs.filter(r => r.slot.startsWith('Neurology'));
    expect(n).toHaveLength(2);
    expect(n[0]).toMatchObject({ start: '2026-07-29', end: '2026-08-07', count: 10 });
    expect(n[0].dates).toContain('2026-07-31');
    expect(n[0].dates).toContain('2026-08-01');
    expect(n[1]).toMatchObject({ start: '2026-08-20', end: '2026-08-25', count: 6 });
  });
  it('excludes Res_Call cells from dates and counts', () => {
    const n0 = runs.find(r => r.slot.startsWith('Neurology'));
    expect(n0.count).toBe(10);
    expect(n0.dates).not.toContain('2026-08-08');
  });
  it('computes area mix and stable ids', () => {
    const p = runs.find(r => r.slot.startsWith('Psychiatry'));
    expect(p.areaMix).toEqual({ peds: 7, main: 0, trauma: 0 });
    expect(p.id).toBe('Psychiatry 3, Psychiatry 3@2026-07-31');
    expect(p.hint.category).toBe('PSYCH');
  });
  it('gapDays widens the join', () => {
    const joined = slotRuns(grid, { gapDays: 20 }).filter(r => r.slot.startsWith('Neurology'));
    expect(joined).toHaveLength(1);
  });
  it('returns [] when no header found', () => {
    expect(slotRuns([['a', 'b']])).toEqual([]);
  });
});

describe('rankRunsForRange', () => {
  const runs = [
    { id: 'A@2026-08-03', slot: 'A', hint: { category: 'NEURO', pgy: null }, start: '2026-08-03', end: '2026-08-14', count: 10, areaMix: { peds: 0, main: 10, trauma: 0 }, dates: [] },
    { id: 'B@2026-08-03', slot: 'B', hint: { category: null, pgy: null }, start: '2026-08-03', end: '2026-08-14', count: 10, areaMix: { peds: 10, main: 0, trauma: 0 }, dates: [] },
    { id: 'C@2026-08-10', slot: 'C', hint: { category: null, pgy: null }, start: '2026-08-10', end: '2026-08-14', count: 5, areaMix: { peds: 0, main: 5, trauma: 0 }, dates: [] },
    { id: 'D@2026-07-20', slot: 'D', hint: { category: null, pgy: null }, start: '2026-07-20', end: '2026-08-14', count: 10, areaMix: { peds: 0, main: 10, trauma: 0 }, dates: [] },
  ];
  const q = { start: '2026-08-03', end: '2026-08-14', category: 'NEURO', obligation: 10 };

  it('drops runs outside [start-1, end+1]', () => {
    expect(rankRunsForRange(runs, q).map(r => r.run.slot)).not.toContain('D');
  });
  it('prefers start-aligned main-area runs for non-peds categories', () => {
    const r = rankRunsForRange(runs, q);
    expect(r[0].run.slot).toBe('A');
    expect(r.map(x => x.run.slot)).toEqual(['A', 'B', 'C']);
    expect(r[0].reasons.length).toBeGreaterThan(0);
  });
  it('prefers peds-heavy runs for PEDS', () => {
    expect(rankRunsForRange(runs, { ...q, category: 'PEDS' })[0].run.slot).toBe('B');
  });
  it('penalises runs over obligation', () => {
    const r = rankRunsForRange(runs, { ...q, obligation: 8 });
    expect(r.find(x => x.run.slot === 'A').reasons.join()).toMatch(/exceeds obligation/);
  });
  it('skips usedRunIds (array or Set)', () => {
    expect(rankRunsForRange(runs, q, { usedRunIds: ['A@2026-08-03'] }).map(x => x.run.slot)).not.toContain('A');
    expect(rankRunsForRange(runs, q, { usedRunIds: new Set(['A@2026-08-03']) }).map(x => x.run.slot)).not.toContain('A');
  });
});
