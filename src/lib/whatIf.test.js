// src/lib/whatIf.test.js
import { describe, it, expect } from 'vitest';
import { applyScenario, compareResults, compareResultSets } from './whatIf.js';

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

describe('compareResultSets', () => {
  function fakeResult({ coverageMiss = 0, errors = 0, underTarget = 0, tag = '' } = {}) {
    const unfilled = [];
    for (let i = 0; i < coverageMiss; i++) unfilled.push({ dateStr: '2026-01-01', shiftId: `SHIFT${tag}`, slotIndex: i });
    const issues = [];
    for (let i = 0; i < errors; i++) issues.push({ level: 'error', rule: 'someHardRule' });
    for (let i = 0; i < underTarget; i++) issues.push({ level: 'warn', rule: 'underTarget' });
    return { report: { unfilled }, issues, qualityVector: [coverageMiss] };
  }

  it('medians an odd run count exactly (the true middle value)', () => {
    const base = [5, 3, 4].map(n => fakeResult({ coverageMiss: n }));
    const scenario = [2, 1, 3].map(n => fakeResult({ coverageMiss: n }));
    const cmp = compareResultSets(base, scenario);
    expect(cmp.coverageMiss).toMatchObject({ before: 4, after: 2, delta: -2 });
    // odd count: the median-representative run IS the run carrying the median value (index 2, value 4)
    expect(cmp.representativeIndex.base).toBe(2);
  });

  it('medians an even run count by averaging the two middle values, but picks the LOWER one as the representative run', () => {
    const base = [4, 2].map(n => fakeResult({ coverageMiss: n }));
    const scenario = [8, 8, 2, 4].map(n => fakeResult({ coverageMiss: n }));
    const cmp = compareResultSets(base, scenario);
    expect(cmp.coverageMiss.before).toBe(3); // (2+4)/2 — no run actually has 3 unfilled slots
    expect(cmp.coverageMiss.after).toBe(6); // sorted [2,4,8,8] -> (4+8)/2
    // base=[4,2]: representative is the run with value 2 (index 1), not the averaged 3
    expect(cmp.representativeIndex.base).toBe(1);
  });

  it('reports min-max range across runs for coverageMiss/errors/under-target independently of the median', () => {
    const base = [
      fakeResult({ coverageMiss: 5, errors: 1, underTarget: 0 }),
      fakeResult({ coverageMiss: 3, errors: 3, underTarget: 2 }),
      fakeResult({ coverageMiss: 4, errors: 0, underTarget: 1 }),
    ];
    const scenario = [
      fakeResult({ coverageMiss: 2, errors: 2, underTarget: 1 }),
      fakeResult({ coverageMiss: 1, errors: 0, underTarget: 0 }),
      fakeResult({ coverageMiss: 3, errors: 1, underTarget: 1 }),
    ];
    const cmp = compareResultSets(base, scenario);
    expect(cmp.coverageMiss.beforeRange).toEqual({ min: 3, max: 5 });
    expect(cmp.coverageMiss.afterRange).toEqual({ min: 1, max: 3 });
    expect(cmp.errorCount.beforeRange).toEqual({ min: 0, max: 3 });
    expect(cmp.underTargetCount.afterRange).toEqual({ min: 0, max: 1 });
  });

  it('picks each side\'s median-representative run independently — same seed-list length never forces matching indices', () => {
    // Same positions, mirrored distributions: base's "typical" run and scenario's "typical" run
    // land at different array indices here, showing the pick is driven by each side's OWN sorted
    // coverageMiss values, not by which seed index generated it (the seed pairing that makes this
    // an apples-to-apples comparison lives upstream in runWhatIf, not in this pure function).
    const base = [10, 1, 1].map(n => fakeResult({ coverageMiss: n }));
    const scenario = [1, 1, 10].map(n => fakeResult({ coverageMiss: n }));
    const cmp = compareResultSets(base, scenario);
    expect(cmp.representativeIndex.base).toBe(2);
    expect(cmp.representativeIndex.scenario).toBe(1);
  });

  it('derives perShift/slotsClosed/slotsOpened/qualityVector from the two median-representative runs, not an average', () => {
    const base = [
      fakeResult({ coverageMiss: 5, tag: 'A' }),
      fakeResult({ coverageMiss: 3, tag: 'B' }),
      fakeResult({ coverageMiss: 4, tag: 'C' }),
    ];
    const scenario = [
      fakeResult({ coverageMiss: 1, tag: 'X' }),
      fakeResult({ coverageMiss: 2, tag: 'Y' }),
      fakeResult({ coverageMiss: 3, tag: 'Z' }),
    ];
    const cmp = compareResultSets(base, scenario);
    const baseRepTag = `SHIFT${['A', 'B', 'C'][cmp.representativeIndex.base]}`;
    const scenarioRepTag = `SHIFT${['X', 'Y', 'Z'][cmp.representativeIndex.scenario]}`;
    expect(Object.keys(cmp.perShift)).toEqual(expect.arrayContaining([baseRepTag, scenarioRepTag]));
  });

  it('handles empty run lists gracefully', () => {
    const cmp = compareResultSets([], []);
    expect(cmp.coverageMiss).toEqual({ before: 0, after: 0, delta: 0, beforeRange: { min: 0, max: 0 }, afterRange: { min: 0, max: 0 } });
    expect(cmp.representativeIndex).toEqual({ base: -1, scenario: -1 });
  });
});
