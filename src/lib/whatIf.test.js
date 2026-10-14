// src/lib/whatIf.test.js
import { describe, it, expect } from 'vitest';
import { applyScenario, compareResults } from './whatIf.js';

function baseArgsFixture() {
  return {
    allResidents: [
      { id: 'r1', firstName: 'Alice', lastName: 'Resident', category: 'EM_HOME', pgy: 2, blockType: 'EM',
        isChief: false, targetDelta: 3, approvedDatesOff: ['2026-01-05'], vacationDates: ['2026-01-10'],
        jeopardyDates: ['2026-01-02'], jcPresentDates: ['2026-01-06'], grLectureDates: ['2026-01-07'],
        workRestrictions: [{ kind: 'noNights' }], wellnessOverride: '2026-01-08', qgendaStaffId: 'ALICE1',
        canWorkDates: [], availabilityMode: 'full', availableRanges: [] },
      { id: 'r2', firstName: 'Bob', lastName: 'Off', category: 'POD', pgy: 1, blockType: 'EM',
        isChief: false, approvedDatesOff: [], availabilityMode: 'full', availableRanges: [] },
    ],
    block: { id: 'blk1', startDate: '2026-01-01', endDate: '2026-01-14', schedule: {}, lockedCells: {} },
    coverage: { 'POD-D': { min: 2, max: 3 } },
    eligOverrides: {},
    appSettings: { rulePriority: ['postNightRest'] },
    dayRules: {},
    blocksHistory: [],
    ayConf: {},
  };
}

describe('applyScenario', () => {
  it('never mutates baseArgs', () => {
    const baseArgs = baseArgsFixture();
    const snapshot = JSON.parse(JSON.stringify(baseArgs));
    applyScenario(baseArgs, [
      { kind: 'cloneResident', templateId: 'r1', count: 2 },
      { kind: 'removeResident', residentId: 'r2' },
      { kind: 'coverageMin', shiftId: 'POD-D', min: 5 },
    ]);
    expect(baseArgs).toEqual(snapshot);
  });

  it('cloneResident adds fresh residents stripped of personal fields, keeping scheduling traits', () => {
    const baseArgs = baseArgsFixture();
    const scenario = applyScenario(baseArgs, [{ kind: 'cloneResident', templateId: 'r1', count: 2 }]);
    expect(scenario.allResidents).toHaveLength(4);
    const clones = scenario.allResidents.filter(r => r.id.startsWith('whatif_'));
    expect(clones).toHaveLength(2);
    expect(clones.map(c => c.id).sort()).toEqual(['whatif_1', 'whatif_2']);
    for (const [i, c] of clones.entries()) {
      expect(c.category).toBe('EM_HOME');
      expect(c.pgy).toBe(2);
      expect(c.blockType).toBe('EM');
      expect(c.firstName).toBe('What-if');
      expect(c.lastName).toBe(`PGY-2 #${i + 1}`);
      expect(c.isChief).toBe(false);
      expect(c.targetDelta).toBeUndefined();
      expect(c.approvedDatesOff).toEqual([]);
      expect(c.vacationDates).toEqual([]);
      expect(c.jeopardyDates).toEqual([]);
      expect(c.jcPresentDates).toEqual([]);
      expect(c.grLectureDates).toEqual([]);
      expect(c.workRestrictions).toEqual([]);
      expect(c.wellnessOverride).toBeNull();
      expect(c.qgendaStaffId).toBeUndefined();
      expect(c.availabilityMode).toBe('full');
    }
  });

  it('cloneResident with start/end restricts availability via availabilityMode ranges', () => {
    const baseArgs = baseArgsFixture();
    const scenario = applyScenario(baseArgs, [
      { kind: 'cloneResident', templateId: 'r2', count: 1, start: '2026-01-03', end: '2026-01-05' },
    ]);
    const clone = scenario.allResidents.find(r => r.id === 'whatif_1');
    expect(clone.availabilityMode).toBe('ranges');
    expect(clone.availableRanges).toEqual([{ start: '2026-01-03', end: '2026-01-05' }]);
  });

  it('cloneResident is a no-op when the template id is unknown', () => {
    const baseArgs = baseArgsFixture();
    const scenario = applyScenario(baseArgs, [{ kind: 'cloneResident', templateId: 'nope', count: 2 }]);
    expect(scenario.allResidents).toHaveLength(2);
  });

  it('removeResident with no range drops the resident entirely', () => {
    const baseArgs = baseArgsFixture();
    const scenario = applyScenario(baseArgs, [{ kind: 'removeResident', residentId: 'r2' }]);
    expect(scenario.allResidents.map(r => r.id)).toEqual(['r1']);
  });

  it('removeResident with a range keeps the resident but blocks those dates via approvedDatesOff', () => {
    const baseArgs = baseArgsFixture();
    const scenario = applyScenario(baseArgs, [
      { kind: 'removeResident', residentId: 'r1', start: '2026-01-05', end: '2026-01-07' },
    ]);
    const r1 = scenario.allResidents.find(r => r.id === 'r1');
    expect(r1).toBeDefined();
    expect(r1.approvedDatesOff).toEqual(expect.arrayContaining(['2026-01-05', '2026-01-05', '2026-01-06', '2026-01-07']));
    // original date (2026-01-05, already in template) survives the merge without duplication
    expect(r1.approvedDatesOff.filter(d => d === '2026-01-05')).toHaveLength(1);
  });

  it('coverageMin overrides min and raises max to match when the existing max was lower', () => {
    const baseArgs = baseArgsFixture();
    const scenario = applyScenario(baseArgs, [{ kind: 'coverageMin', shiftId: 'POD-D', min: 5 }]);
    expect(scenario.coverage['POD-D']).toEqual({ min: 5, max: 5 });
  });

  it('coverageMin keeps an existing higher max untouched', () => {
    const baseArgs = baseArgsFixture();
    baseArgs.coverage['POD-D'] = { min: 2, max: 8 };
    const scenario = applyScenario(baseArgs, [{ kind: 'coverageMin', shiftId: 'POD-D', min: 5 }]);
    expect(scenario.coverage['POD-D']).toEqual({ min: 5, max: 8 });
  });

  it('coverageMin on a shift with no existing entry starts from {0,0}', () => {
    const baseArgs = baseArgsFixture();
    const scenario = applyScenario(baseArgs, [{ kind: 'coverageMin', shiftId: 'FLEX-D', min: 3 }]);
    expect(scenario.coverage['FLEX-D']).toEqual({ min: 3, max: 3 });
  });

  it('skips unknown change kinds without throwing', () => {
    const baseArgs = baseArgsFixture();
    const scenario = applyScenario(baseArgs, [{ kind: 'somethingElse', foo: 1 }]);
    expect(scenario.allResidents).toHaveLength(2);
  });
});

describe('compareResults', () => {
  function result(unfilled, issues, qualityVector) {
    return { report: { unfilled }, issues, qualityVector };
  }

  it('computes coverageMiss/errorCount/underTargetCount deltas', () => {
    const base = result(
      [
        { dateStr: '2026-01-01', shiftId: 'POD-D', slotIndex: 0 },
        { dateStr: '2026-01-02', shiftId: 'POD-D', slotIndex: 0 },
      ],
      [{ level: 'error', rule: 'circadianBlocked' }, { level: 'warn', rule: 'underTarget' }],
      [1, 2, 3],
    );
    const scenario = result(
      [{ dateStr: '2026-01-01', shiftId: 'POD-D', slotIndex: 0 }],
      [{ level: 'warn', rule: 'underTarget' }],
      [0, 1, 2],
    );
    const cmp = compareResults(base, scenario);
    expect(cmp.coverageMiss).toEqual({ before: 2, after: 1, delta: -1 });
    expect(cmp.errorCount).toEqual({ before: 1, after: 0, delta: -1 });
    expect(cmp.underTargetCount).toEqual({ before: 1, after: 1, delta: 0 });
    expect(cmp.qualityVector).toEqual({ before: [1, 2, 3], after: [0, 1, 2] });
  });

  it('computes per-shift before/after and slots closed/opened by (date, shift, slotIndex) identity', () => {
    const base = result(
      [
        { dateStr: '2026-01-01', shiftId: 'POD-D', slotIndex: 0 },
        { dateStr: '2026-01-01', shiftId: 'POD-D', slotIndex: 1 },
        { dateStr: '2026-01-02', shiftId: 'FLEX-N', slotIndex: 0 },
      ],
      [], [],
    );
    const scenario = result(
      [
        { dateStr: '2026-01-01', shiftId: 'POD-D', slotIndex: 1 }, // same slot as base — stays unfilled
        { dateStr: '2026-01-03', shiftId: 'FLEX-N', slotIndex: 0 }, // new slot — opened
      ],
      [], [],
    );
    const cmp = compareResults(base, scenario);
    expect(cmp.perShift['POD-D']).toEqual({ before: 2, after: 1, delta: -1 });
    expect(cmp.perShift['FLEX-N']).toEqual({ before: 1, after: 1, delta: 0 });
    // closed: (01-01,POD-D,0) — present in base, absent in scenario
    // (01-02,FLEX-N,0) also closed; (01-01,POD-D,1) survives in both so it does NOT count as closed
    expect(cmp.slotsClosed).toBe(2);
    // opened: (01-03,FLEX-N,0) is new
    expect(cmp.slotsOpened).toBe(1);
  });

  it('handles missing report/issues/qualityVector gracefully', () => {
    const cmp = compareResults({}, {});
    expect(cmp.coverageMiss).toEqual({ before: 0, after: 0, delta: 0 });
    expect(cmp.errorCount).toEqual({ before: 0, after: 0, delta: 0 });
    expect(cmp.perShift).toEqual({});
    expect(cmp.slotsClosed).toBe(0);
    expect(cmp.slotsOpened).toBe(0);
  });
});
