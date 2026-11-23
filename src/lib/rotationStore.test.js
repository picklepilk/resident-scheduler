import { describe, it, expect } from 'vitest';
import {
  getRotations, upsertRotations, updateRotation, findRotationForResident, blockDatesFromHome,
  setQgendaSlotRuns, getQgendaSlotRuns, deriveBlocks, buildRotationCtx, planApplyRoster,
} from './rotationStore.js';

const AY = '2026-2027';
const row = (o = {}) => ({ firstName: 'Ada', lastName: 'Zed', category: 'PEDS', pgy: 2, start: '2026-11-02', end: '2026-11-29', scheduledByUs: true, ...o });
let n = 0;
const mk = () => ({ makeId: () => `id${++n}`, now: 'T' });

describe('rotationStore', () => {
  it('upsert adds, re-import updates dates but keeps chief edits', () => {
    let { ayData, added } = upsertRotations({}, AY, [row()], mk());
    expect(added).toBe(1);
    const id = ayData[AY].rotations[0].id;
    ayData = updateRotation(ayData, AY, { id, obligation: 9, ranges: [{ start: '2026-11-02', end: '2026-11-15', count: 7, source: 'typed' }], splits: ['2026-11-20'] });
    const r2 = upsertRotations(ayData, AY, [row({ end: '2026-11-30', pgy: 3 })], mk());
    expect(r2.updated).toBe(1);
    const rot = r2.ayData[AY].rotations;
    expect(rot).toHaveLength(1);
    expect(rot[0]).toMatchObject({ id, end: '2026-11-30', pgy: 3, obligation: 9, splits: ['2026-11-20'] });
    expect(rot[0].ranges).toHaveLength(1);
  });

  it('null pgy defaults to first option and is flagged; BAMC PA is not scheduled by us', () => {
    const { ayData, guessed } = upsertRotations({}, AY, [row({ pgy: null }), row({ lastName: 'Q', category: null, pgy: null, scheduledByUs: false })], mk());
    expect(guessed).toBe(1);
    const rots = getRotations(ayData, AY);
    expect(rots[0].pgyGuessed).toBe(true);
    expect(rots[0].pgy).not.toBeNull();
    expect(rots[1].scheduledByUs).toBe(false);
  });

  it('getRotations drops junk', () => {
    expect(getRotations({ [AY]: { rotations: [null, 5, { start: 'x' }, row()] } }, AY)).toHaveLength(1);
    expect(getRotations(undefined, AY)).toEqual([]);
    expect(getRotations({ [AY]: { rotations: 'bad' } }, AY)).toEqual([]);
  });

  it('findRotationForResident: id, name+category+overlap, ambiguous => null', () => {
    const { ayData } = upsertRotations({}, AY, [row(), row({ start: '2027-01-04', end: '2027-01-17' }), row({ lastName: 'Other' })], mk());
    const rots = getRotations(ayData, AY);
    const block = { startDate: '2026-11-16', endDate: '2026-12-13' };
    const res = { firstName: 'ada', lastName: 'ZED', category: 'PEDS' };
    expect(findRotationForResident(rots, res, block).start).toBe('2026-11-02');
    expect(findRotationForResident(rots, { ...res, category: 'PSYCH' }, block)).toBeNull();
    expect(findRotationForResident(rots, { ...res, rotationId: rots[1].id }, block).id).toBe(rots[1].id);
    // both Ada rotations overlap a wide block => ambiguous
    expect(findRotationForResident(rots, res, { startDate: '2026-11-01', endDate: '2027-01-31' })).toBeNull();
    expect(findRotationForResident(rots, res, { startDate: '2027-03-01', endDate: '2027-03-28' })).toBeNull();
  });

  it('blockDatesFromHome and slot runs store', () => {
    expect(blockDatesFromHome([{ start: '2026-07-01', end: '2026-07-28' }, { start: 'x', end: 'y' }, { start: '2026-07-29', end: '2026-08-25' }]))
      .toEqual([{ id: 'b1', startDate: '2026-07-01', endDate: '2026-07-28' }, { id: 'b2', startDate: '2026-07-29', endDate: '2026-08-25' }]);
    const ay = setQgendaSlotRuns({}, AY, [{ id: 'a@1', slot: 'Neurology 1', hint: { category: 'NEURO', pgy: null }, start: '2026-11-02', end: '2026-11-10', count: 5, areaMix: { peds: 0, main: 5, trauma: 0 }, dates: ['x'] }]);
    expect(ay[AY].qgendaSlotRuns[0].dates).toBeUndefined();
    expect(getQgendaSlotRuns(ay, AY)).toHaveLength(1);
  });

  it('planApplyRoster pairs, adds, skips reference rows, lists extras', () => {
    const { ayData } = upsertRotations({}, AY, [
      row(), row({ lastName: 'New', firstName: 'Bo' }),
      row({ lastName: 'Ref', category: null, pgy: null, scheduledByUs: false }),
      row({ lastName: 'Far', start: '2027-02-01', end: '2027-02-14' }),
      row({ lastName: 'Guess', firstName: 'Guess', category: 'PEDS', pgy: null }),
    ], mk());
    const rots = getRotations(ayData, AY);
    const block = { startDate: '2026-11-16', endDate: '2026-12-13' };
    const residents = [
      { id: 'r1', firstName: 'Ada', lastName: 'Zed', category: 'PEDS', pgy: 2 },
      { id: 'r2', firstName: 'Cy', lastName: 'Extra', category: 'PSYCH', pgy: 1 },
      { id: 'r3', firstName: 'Guess', lastName: 'Guess', category: 'PEDS', pgy: 3 },
      { id: 'em', firstName: 'Ada', lastName: 'Zed', category: 'EM_HOME', pgy: 1 },
    ];
    const plan = planApplyRoster(rots, residents, block);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.entries.map(e => e.action).sort()).toEqual(['add', 'update', 'update']);
    expect(plan.entries.find(e => e.match?.id === 'r3').pgyFix).toBe(3);
    expect(plan.notOnRoster.map(r => r.id)).toEqual(['r2']);
  });

  it('deriveBlocks prefers stored blockDates else snapshots+open block; ctx null without rotations', () => {
    const block = { id: 'cur', startDate: '2026-11-16', endDate: '2026-12-13' };
    const hist = [{ id: 'h', data: { startDate: '2026-10-19', endDate: '2026-11-15' } }];
    expect(deriveBlocks({}, block, hist).map(b => b.startDate)).toEqual(['2026-10-19', '2026-11-16']);
    expect(deriveBlocks({ blockDates: [{ id: 'b1', startDate: '2026-07-01', endDate: '2026-07-28' }] }, block, hist)).toHaveLength(1);
    expect(buildRotationCtx({}, block, hist)).toBeNull();
    const { ayData } = upsertRotations({}, AY, [row()], mk());
    expect(buildRotationCtx(ayData[AY], block, hist).rotations).toHaveLength(1);
  });
});
