/** @vitest-environment jsdom */
// Rotation ledger seam: offServiceWindowStatus / offServiceWindowTargetDelta / composeAllResidents /
// validateAll with ayData[AY].rotations. No rotation linked => legacy path (covered by
// seniorityTargets.test.js, untouched).
import { describe, it, expect } from 'vitest';
import {
  offServiceWindowStatus, offServiceWindowTargetDelta, offServiceWindowSummary, composeAllResidents,
  validateAll, getShiftTarget,
} from '../ResidentScheduler.jsx';
import { upsertRotations, buildRotationCtx, updateRotation } from './rotationStore.js';

const AY = 'AY26/27';
const block = { id: 'b6', startDate: '2026-11-16', endDate: '2026-12-13', academicYear: AY, specialDays: {}, emBlockAssignments: {} };
const prev = { id: 'blk_import_2026-10-19', data: { startDate: '2026-10-19', endDate: '2026-11-15' } };
const history = [prev];
const peds = { id: 'o1', firstName: 'Ada', lastName: 'Zed', category: 'PEDS', pgy: 2, blockType: 'EM', availabilityMode: 'ranges',
  availableRanges: [{ start: '2026-11-16', end: '2026-11-29' }], canWorkDates: [], approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [] };

function ayWith(rows, edit) {
  let { ayData } = upsertRotations({}, AY, rows, { makeId: (() => { let n = 0; return () => `r${++n}`; })() });
  if (edit) ayData = updateRotation(ayData, AY, edit);
  return ayData;
}
const row = (o = {}) => ({ firstName: 'Ada', lastName: 'Zed', category: 'PEDS', pgy: 2, start: '2026-11-02', end: '2026-11-29', scheduledByUs: true, ...o });
const ctxOf = ay => buildRotationCtx(ay[AY], block, history);

describe('rotation ledger seam', () => {
  it('no rotation linked: legacy path (clipped 14-day window, no history => pro-rated)', () => {
    const st = offServiceWindowStatus({ ...peds, availableRanges: [{ start: '2026-11-02', end: '2026-11-29' }] }, block, history, {});
    expect(st.ledger).toBeUndefined();
    expect(st.base).toBe(15);
  });

  it('rotation linked by name+category+overlap: ledger numbers drive the status', () => {
    const ay = ayWith([row()], { id: 'r1', ranges: [{ start: '2026-11-02', end: '2026-11-15', count: 7, source: 'typed' }] });
    const st = offServiceWindowStatus(peds, block, history, ctxOf(ay));
    expect(st.ledger).toBeTruthy();
    expect(st).toMatchObject({ base: 15, alreadyWorked: 7, effectiveTarget: 8, foundHistory: true, source: 'typed', delta: -7, owedAfter: 0 });
    expect(st.ranges).toEqual([{ start: '2026-11-02', end: '2026-11-29' }]);
    expect(offServiceWindowSummary(st)).toMatch(/Rotation owes 15 · 7 done before \(typed\) · 8 here · 0 after/);
    expect(offServiceWindowTargetDelta(peds, block, history, ctxOf(ay))).toBe(-7);
  });

  it('rotationId link wins even when the resident name differs', () => {
    const ay = ayWith([row({ lastName: 'Other' })]);
    expect(offServiceWindowStatus(peds, block, history, ctxOf(ay))).toBeNull();
    const st = offServiceWindowStatus({ ...peds, rotationId: 'r1' }, block, history, ctxOf(ay));
    expect(st.ledger).toBeTruthy();
  });

  it('a rotation fully inside the block (short) now gets a scaled target instead of the full one', () => {
    const ay = ayWith([row({ start: '2026-11-16', end: '2026-11-29' })]);
    const st = offServiceWindowStatus(peds, block, history, ctxOf(ay));
    expect(st.effectiveTarget).toBe(8); // 15 * 14/28 = 7.5 -> 8
    expect(st.foundHistory).toBe(false);
  });

  it('targetOverrides: composed target still lands exactly on ledger.dueHere', () => {
    const ay = ayWith([row()], { id: 'r1', ranges: [{ start: '2026-11-02', end: '2026-11-15', count: 7, source: 'typed' }] });
    const b = { ...block, offServiceResidents: [peds] };
    const settings = { targetOverrides: { PEDS_2: 12 } };
    const [composed] = composeAllResidents([], b, history, ay, settings);
    expect(getShiftTarget(composed, settings)).toBe(8);
    const plain = composeAllResidents([], b, history, ay, {})[0];
    expect(getShiftTarget(plain, {})).toBe(8);
  });

  it('dueHere 0: composed target is null (owes nothing here)', () => {
    const ay = ayWith([row()], { id: 'r1', ranges: [{ start: '2026-11-02', end: '2026-11-15', count: 15, source: 'typed' }] });
    const b = { ...block, offServiceResidents: [peds] };
    const [composed] = composeAllResidents([], b, history, ay, {});
    expect(getShiftTarget(composed, {})).toBeNull();
  });

  it('BAMC PA / not scheduled by us: legacy path', () => {
    const ay = ayWith([row({ scheduledByUs: false })]);
    expect(offServiceWindowStatus(peds, block, history, ctxOf(ay))).toBeNull(); // clipped window inside block: legacy null
  });

  it('validator: underTarget message keeps prefix and gains rotation breakdown; info flag for estimated before-count', () => {
    const ay = ayWith([row()]);
    const b = { ...block, offServiceResidents: [peds] };
    const all = composeAllResidents([], b, history, ay, {});
    const issues = validateAll(all, {}, b, {}, {}, {}, {}, history, ay[AY]);
    const under = issues.find(i => i.rule === 'underTarget' && i.residentId === 'o1');
    expect(under.message.startsWith('Under target: 0/')).toBe(true);
    expect(under.message).toMatch(/rotation owes 15, 8 done before$/);
    const info = issues.filter(i => i.rule === 'rotationPriorEstimated' && i.residentId === 'o1');
    expect(info).toHaveLength(1);
    expect(info[0].level).toBe('warn');
  });

  it('validator: no ledger issues when the before-count is typed', () => {
    const ay = ayWith([row()], { id: 'r1', ranges: [{ start: '2026-11-02', end: '2026-11-15', count: 7, source: 'typed' }] });
    const b = { ...block, offServiceResidents: [peds] };
    const all = composeAllResidents([], b, history, ay, {});
    const issues = validateAll(all, {}, b, {}, {}, {}, {}, history, ay[AY]);
    expect(issues.some(i => i.rule === 'rotationPriorEstimated')).toBe(false);
  });
});
