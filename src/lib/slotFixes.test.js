import { describe, it, expect } from 'vitest';
import { findFixablePlans } from './slotFixes.js';

// Small stub helpers standing in for coverage/eligibility/cellViolations — same posture as
// cellAlternatives.test.js/sickCallCover.test.js: these tests exercise the pure search/edit math
// only, not the real rule engine. Real calendar date strings are used throughout (slotFixes.js does
// real date arithmetic via lib/dates.js for its +/- 7 day search window).
const DATE = '2026-01-10';     // the empty slot being filled
const PREV1 = '2026-01-09';    // 1 day before DATE
const PREV2 = '2026-01-08';    // 2 days before DATE
const MOVE_TARGET = '2026-01-17'; // 7 days after DATE — edge of the default search window

function restBlockedOnPrev1(sched) {
  return (sched.R1 && sched.R1[PREV1]) ? [{ rule: 'restShiftLength', message: 'rest' }] : [];
}

describe('findFixablePlans', () => {
  it('offers a drop plan when dropping keeps coverage at/above its min', () => {
    const blocked = [{ residentId: 'R1', reasons: [{ rule: 'restShiftLength', message: 'rest' }], blockerKinds: ['hardRule'] }];
    const schedule = { R1: { [PREV1]: 'TRAUMA-N' } };
    const out = findFixablePlans({
      dateStr: DATE, shiftId: 'POD-D', blocked, residents: [{ id: 'R1' }], schedule, lockedCells: {},
      coverageFor: (sid, ds) => (sid === 'TRAUMA-N' && ds === PREV1 ? { min: 1, max: 2, count: 2 } : { min: 0, max: 5, count: 0 }),
      isEligible: () => true,
      hardViolations: (rid, ds, sid, sched) => (rid === 'R1' && ds === DATE && sid === 'POD-D' ? restBlockedOnPrev1(sched) : []),
      softViolations: () => [],
    });
    // Drop is tried before move/handoff (deterministic order) and is offered first — other legal
    // alternatives (e.g. moving the night shift elsewhere, since this stub's isEligible is wide
    // open) may also be found; this test only cares that the drop plan is among them.
    expect(out[0]).toEqual(
      { residentId: 'R1', edits: [{ kind: 'drop', fromDate: PREV1, shiftId: 'TRAUMA-N' }], final: { dateStr: DATE, shiftId: 'POD-D' } },
    );
  });

  it('never offers a drop that would breach the dropped shift/date coverage min', () => {
    const blocked = [{ residentId: 'R1', reasons: [{ rule: 'restShiftLength', message: 'rest' }], blockerKinds: ['hardRule'] }];
    const schedule = { R1: { [PREV1]: 'TRAUMA-N' } };
    const out = findFixablePlans({
      dateStr: DATE, shiftId: 'POD-D', blocked, residents: [{ id: 'R1' }], schedule, lockedCells: {},
      // count 2, min 2 — dropping would leave count 1, BELOW min. No other date/resident is
      // eligible, so neither move nor handoff can rescue it either.
      coverageFor: (sid, ds) => (sid === 'TRAUMA-N' && ds === PREV1 ? { min: 2, max: 2, count: 2 } : { min: 0, max: 5, count: 0 }),
      isEligible: (rid, ds, sid) => rid === 'R1' && ds === DATE && sid === 'POD-D',
      hardViolations: (rid, ds, sid, sched) => (rid === 'R1' && ds === DATE && sid === 'POD-D' ? restBlockedOnPrev1(sched) : []),
      softViolations: () => [],
    });
    expect(out).toEqual([]);
  });

  it('finds a move plan when a drop would breach coverage min but another date has headroom', () => {
    const blocked = [{ residentId: 'R1', reasons: [{ rule: 'restShiftLength', message: 'rest' }], blockerKinds: ['hardRule'] }];
    const schedule = { R1: { [PREV1]: 'TRAUMA-N' } };
    const out = findFixablePlans({
      dateStr: DATE, shiftId: 'POD-D', blocked, residents: [{ id: 'R1' }], schedule, lockedCells: {},
      coverageFor: (sid, ds) => {
        if (sid === 'TRAUMA-N' && ds === PREV1) return { min: 2, max: 2, count: 2 }; // drop would breach min
        if (sid === 'TRAUMA-N' && ds === MOVE_TARGET) return { min: 0, max: 3, count: 0 }; // headroom
        return { min: 0, max: 5, count: 0 };
      },
      isEligible: (rid, ds, sid) => rid === 'R1' && ((ds === DATE && sid === 'POD-D') || (ds === MOVE_TARGET && sid === 'TRAUMA-N')),
      hardViolations: (rid, ds, sid, sched) => (rid === 'R1' && ds === DATE && sid === 'POD-D' ? restBlockedOnPrev1(sched) : []),
      softViolations: () => [],
    });
    expect(out).toEqual([
      { residentId: 'R1', edits: [{ kind: 'move', fromDate: PREV1, shiftId: 'TRAUMA-N', toDate: MOVE_TARGET }], final: { dateStr: DATE, shiftId: 'POD-D' } },
    ]);
  });

  it('never moves a shift to a date outside blockDates', () => {
    const blocked = [{ residentId: 'R1', reasons: [{ rule: 'restShiftLength', message: 'rest' }], blockerKinds: ['hardRule'] }];
    const schedule = { R1: { [PREV1]: 'TRAUMA-N' } };
    const out = findFixablePlans({
      dateStr: DATE, shiftId: 'POD-D', blocked, residents: [{ id: 'R1' }], schedule, lockedCells: {},
      coverageFor: (sid, ds) => (sid === 'TRAUMA-N' && ds === PREV1 ? { min: 2, max: 2, count: 2 } : { min: 0, max: 3, count: 0 }),
      isEligible: (rid, ds, sid) => rid === 'R1' && ((ds === DATE && sid === 'POD-D') || (ds === MOVE_TARGET && sid === 'TRAUMA-N')),
      hardViolations: (rid, ds, sid, sched) => (rid === 'R1' && ds === DATE && sid === 'POD-D' ? restBlockedOnPrev1(sched) : []),
      softViolations: () => [],
      // Block ends before MOVE_TARGET — the only legal move target is out of block.
      blockDates: [PREV2, PREV1, DATE, '2026-01-11'],
    });
    expect(out).toEqual([]);
  });

  it('prefers the nearest move target when searchDates arrives in calendar order', () => {
    const blocked = [{ residentId: 'R1', reasons: [{ rule: 'restShiftLength', message: 'rest' }], blockerKinds: ['hardRule'] }];
    const schedule = { R1: { [PREV1]: 'TRAUMA-N' } };
    const FAR = '2026-01-20';
    const NEAR = '2026-01-12';
    const out = findFixablePlans({
      dateStr: DATE, shiftId: 'POD-D', blocked, residents: [{ id: 'R1' }], schedule, lockedCells: {},
      coverageFor: (sid, ds) => (sid === 'TRAUMA-N' && ds === PREV1 ? { min: 2, max: 2, count: 2 } : { min: 0, max: 3, count: 0 }),
      isEligible: (rid, ds, sid) => rid === 'R1' && ((ds === DATE && sid === 'POD-D') || ((ds === FAR || ds === NEAR) && sid === 'TRAUMA-N')),
      hardViolations: (rid, ds, sid, sched) => (rid === 'R1' && ds === DATE && sid === 'POD-D' ? restBlockedOnPrev1(sched) : []),
      softViolations: () => [],
      maxPlansPerResident: 1,
      searchDates: [FAR, NEAR],
    });
    expect(out[0].edits[0].toDate).toBe(NEAR);
  });

  it('finds a handoff plan when neither drop nor move is available', () => {
    const blocked = [{ residentId: 'R1', reasons: [{ rule: 'restShiftLength', message: 'rest' }], blockerKinds: ['hardRule'] }];
    const schedule = { R1: { [PREV1]: 'TRAUMA-N' }, R2: {} };
    const out = findFixablePlans({
      dateStr: DATE, shiftId: 'POD-D', blocked, residents: [{ id: 'R1' }, { id: 'R2' }], schedule, lockedCells: {},
      coverageFor: () => ({ min: 2, max: 2, count: 2 }), // no drop anywhere
      // R1 is eligible for nothing but its own target placement (no move target); R2 is free and
      // eligible to take the handed-off TRAUMA-N.
      isEligible: (rid, ds, sid) => {
        if (rid === 'R1') return ds === DATE && sid === 'POD-D';
        if (rid === 'R2') return ds === PREV1 && sid === 'TRAUMA-N';
        return false;
      },
      hardViolations: (rid, ds, sid, sched) => (rid === 'R1' && ds === DATE && sid === 'POD-D' ? restBlockedOnPrev1(sched) : []),
      softViolations: () => [],
    });
    expect(out).toEqual([
      { residentId: 'R1', edits: [{ kind: 'handoff', fromDate: PREV1, shiftId: 'TRAUMA-N', toResidentId: 'R2' }], final: { dateStr: DATE, shiftId: 'POD-D' } },
    ]);
  });

  it('never edits a locked own-shift cell, even when editing it would otherwise clear the violation', () => {
    const blocked = [{ residentId: 'R1', reasons: [{ rule: 'restShiftLength', message: 'rest' }], blockerKinds: ['hardRule'] }];
    const schedule = { R1: { [PREV1]: 'TRAUMA-N' } };
    const out = findFixablePlans({
      dateStr: DATE, shiftId: 'POD-D', blocked, residents: [{ id: 'R1' }], schedule,
      lockedCells: { R1: { [PREV1]: true } },
      coverageFor: () => ({ min: 1, max: 2, count: 2 }), // would otherwise allow a drop
      isEligible: () => true,
      hardViolations: (rid, ds, sid, sched) => (rid === 'R1' && ds === DATE && sid === 'POD-D' ? restBlockedOnPrev1(sched) : []),
      softViolations: () => [],
    });
    expect(out).toEqual([]);
  });

  it('never offers a plan that still leaves a hard violation on the final placement', () => {
    const blocked = [{ residentId: 'R1', reasons: [{ rule: 'restShiftLength', message: 'rest' }], blockerKinds: ['hardRule'] }];
    const schedule = { R1: { [PREV1]: 'TRAUMA-N' } };
    const out = findFixablePlans({
      dateStr: DATE, shiftId: 'POD-D', blocked, residents: [{ id: 'R1' }], schedule, lockedCells: {},
      coverageFor: () => ({ min: 1, max: 2, count: 2 }), // a drop looks possible...
      isEligible: () => true,
      // ...but the hard violation is unconditional (never actually clears, regardless of edits) —
      // a sanity check that the search re-verifies rather than trusting the blocked entry's rule tag.
      hardViolations: (rid, ds, sid) => (rid === 'R1' && ds === DATE && sid === 'POD-D' ? [{ rule: 'restShiftLength', message: 'still bad' }] : []),
      softViolations: () => [],
    });
    expect(out).toEqual([]);
  });

  it('respects the maxEdits depth limit (a 2-edit-only fix is refused at maxEdits=1, found at maxEdits=2)', () => {
    const blocked = [{ residentId: 'R1', reasons: [{ rule: 'restShiftLength', message: 'rest' }], blockerKinds: ['hardRule'] }];
    const schedule = { R1: { [PREV1]: 'TRAUMA-N', [PREV2]: 'TRAUMA-N' } };
    const hardViolations = (rid, ds, sid, sched) => {
      if (rid === 'R1' && ds === DATE && sid === 'POD-D') {
        const stillBlocked = sched.R1 && (sched.R1[PREV1] || sched.R1[PREV2]);
        return stillBlocked ? [{ rule: 'restShiftLength', message: 'rest' }] : [];
      }
      return [];
    };
    const base = {
      dateStr: DATE, shiftId: 'POD-D', blocked, residents: [{ id: 'R1' }], schedule, lockedCells: {},
      coverageFor: () => ({ min: 1, max: 3, count: 2 }),
      isEligible: () => true, hardViolations, softViolations: () => [],
    };
    expect(findFixablePlans({ ...base, maxEdits: 1 })).toEqual([]);
    const withTwo = findFixablePlans({ ...base, maxEdits: 2 });
    expect(withTwo[0]).toEqual({
      residentId: 'R1',
      edits: [
        { kind: 'drop', fromDate: PREV1, shiftId: 'TRAUMA-N' },
        { kind: 'drop', fromDate: PREV2, shiftId: 'TRAUMA-N' },
      ],
      final: { dateStr: DATE, shiftId: 'POD-D' },
    });
  });

  it('never attempts a resident whose blocker is not own-schedule fixable (e.g. eligibility)', () => {
    const blocked = [{ residentId: 'R1', reasons: [{ rule: 'vacation', message: 'On vacation' }], blockerKinds: ['eligibility'] }];
    const schedule = { R1: {} };
    const out = findFixablePlans({
      dateStr: DATE, shiftId: 'POD-D', blocked, residents: [{ id: 'R1' }], schedule, lockedCells: {},
      coverageFor: () => ({ min: 0, max: 5, count: 0 }),
      isEligible: () => true, hardViolations: () => [], softViolations: () => [],
    });
    expect(out).toEqual([]);
  });

  it('never mutates the input schedule', () => {
    const blocked = [{ residentId: 'R1', reasons: [{ rule: 'restShiftLength', message: 'rest' }], blockerKinds: ['hardRule'] }];
    const schedule = { R1: { [PREV1]: 'TRAUMA-N' } };
    const before = JSON.parse(JSON.stringify(schedule));
    findFixablePlans({
      dateStr: DATE, shiftId: 'POD-D', blocked, residents: [{ id: 'R1' }], schedule, lockedCells: {},
      coverageFor: () => ({ min: 1, max: 2, count: 2 }),
      isEligible: () => true,
      hardViolations: (rid, ds, sid, sched) => (rid === 'R1' && ds === DATE && sid === 'POD-D' ? restBlockedOnPrev1(sched) : []),
      softViolations: () => [],
    });
    expect(schedule).toEqual(before);
  });
});
