import { describe, it, expect } from 'vitest';
import { snapToBlock, buildSnapData } from '../ResidentScheduler.jsx';

function liveBlock() {
  return {
    id: 'blk_1', name: 'Block 3', academicYear: '2026-2027', startDate: '2026-09-01', endDate: '2026-09-28',
    emBlockAssignments: { r1: { blockType: 'EM_HOME_1' } },
    offServiceResidents: [{ id: 'o1', firstName: 'A', lastName: 'B' }],
    schedule: { r1: { '2026-09-02': 'POD-D' } },
    specialDays: {}, conferences: {}, generationReport: null,
    overrideLog: [], activityLog: [],
    handOverrides: { r1: { '2026-09-02': { shiftId: 'POD-D', ruleIds: ['traumaDayRotationGuard'], note: 'chief ok', measured: {}, at: '2026-09-01T00:00:00.000Z', by: 'x' } } },
    issueAcks: { k1: { at: '2026-09-01T00:00:00.000Z', by: 'me', note: 'fine' } },
    jeopardySchedule: { pgy1: {}, pgy2: {}, pgy3: {} }, metroJeopardyRanges: [],
  };
}

describe('snapToBlock', () => {
  it('round-trips a snapshot built the app way', () => {
    const b = liveBlock();
    const snap = { id: b.id, name: b.name, academicYear: b.academicYear, startDate: b.startDate, endDate: b.endDate, data: buildSnapData(b) };
    const out = snapToBlock(snap);
    expect(out.id).toBe('blk_1');
    expect(out.schedule).toEqual(b.schedule);
    expect(out.handOverrides).toEqual(b.handOverrides);
    expect(out.issueAcks).toEqual(b.issueAcks);
    expect(out.offServiceResidents).toEqual(b.offServiceResidents);
    expect([out.startDate, out.endDate, out.academicYear, out.name]).toEqual([b.startDate, b.endDate, b.academicYear, b.name]);
  });

  it('tolerates a bare/legacy snapshot and does not alias or mutate it', () => {
    const snap = { id: 's', name: 'X', data: { schedule: { r: { '2026-01-01': 'POD-D' } } } };
    const frozen = JSON.stringify(snap);
    const out = snapToBlock(snap);
    expect(out.handOverrides).toEqual({});
    expect(out.issueAcks).toEqual({});
    expect(out.overrideLog).toEqual([]);
    expect(JSON.stringify(snap)).toBe(frozen);
  });
});
