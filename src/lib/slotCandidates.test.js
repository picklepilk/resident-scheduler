import { describe, it, expect } from 'vitest';
import { findSlotCandidates } from './slotCandidates.js';

// Small stub helpers standing in for getEligibleShifts/cellViolations/getShiftTarget — same posture
// as cellAlternatives.test.js: these tests exercise the pure candidate math only, not the real rule
// engine (that's covered by generator/validateAll's own tests).
const RESIDENTS = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];

function makeEligible(map) {
  return (residentId, _dateStr, shiftId) => !!map[residentId]?.has(shiftId);
}

describe('findSlotCandidates', () => {
  it('ranks the legal bucket: under target first, then fewest shifts, then fewest soft violations', () => {
    const schedule = { A: {}, B: {}, C: {}, D: {} };
    const isEligible = makeEligible({ A: new Set(['POD-D']), B: new Set(['POD-D']), C: new Set(['POD-D']), D: new Set(['POD-D']) });
    const targets = {
      A: { count: 18, target: 20 }, // closest to target — ranks last
      B: { count: 10, target: 20 }, // under target, tied with C on deficit
      C: { count: 10, target: 20 },
      D: { count: 10, target: 20 },
    };
    const softs = { A: [], B: [], C: [{ level: 'warn' }], D: [] };
    const out = findSlotCandidates({
      dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: (rid) => softs[rid],
      targetInfo: (rid) => targets[rid],
    });
    // B and D are equally under target (10 more needed) and equally clean — B sorts first among
    // ties only by insertion order (stable sort), both ahead of C (same deficit, one more soft
    // violation) and A (closest to target, ranks last).
    expect(out.legal.map(c => c.residentId)).toEqual(['B', 'D', 'C', 'A']);
  });

  it('uses the night/weekend tiebreak only for a night/weekend shift', () => {
    const schedule = { A: {}, B: {} };
    const isEligible = makeEligible({ A: new Set(['TRAUMA-N']), B: new Set(['TRAUMA-N']) });
    const targets = { A: { count: 10, target: 20 }, B: { count: 10, target: 20 } };
    const nightWeekendCounts = { A: 3, B: 1 };
    const out = findSlotCandidates({
      dateStr: 'd1', shiftId: 'TRAUMA-N', residents: [{ id: 'A' }, { id: 'B' }], schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: (rid) => targets[rid],
      isNightOrWeekendShift: () => true, nightWeekendCountFor: (rid) => nightWeekendCounts[rid],
    });
    // Equally under target, equally clean — B has fewer nights/weekends this block, so ranks first.
    expect(out.legal.map(c => c.residentId)).toEqual(['B', 'A']);
  });

  it('does not apply the night/weekend tiebreak for a non-night/weekend shift', () => {
    const schedule = { A: {}, B: {} };
    const isEligible = makeEligible({ A: new Set(['POD-D']), B: new Set(['POD-D']) });
    const targets = { A: { count: 10, target: 20 }, B: { count: 10, target: 20 } };
    const nightWeekendCounts = { A: 3, B: 1 };
    const out = findSlotCandidates({
      dateStr: 'd1', shiftId: 'POD-D', residents: [{ id: 'A' }, { id: 'B' }], schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: (rid) => targets[rid],
      isNightOrWeekendShift: () => false, nightWeekendCountFor: (rid) => nightWeekendCounts[rid],
    });
    // Tied on every other tiebreak and the night/weekend one doesn't apply here — stable sort keeps
    // input order.
    expect(out.legal.map(c => c.residentId)).toEqual(['A', 'B']);
  });

  it('blocks an already-working resident with rule "allWorking" (kind ownShift), never ranked', () => {
    const schedule = { A: { d1: 'MT-D' }, B: {} };
    const isEligible = makeEligible({ A: new Set(['POD-D']), B: new Set(['POD-D']) });
    const out = findSlotCandidates({
      dateStr: 'd1', shiftId: 'POD-D', residents: [{ id: 'A' }, { id: 'B' }], schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out.legal.map(c => c.residentId)).toEqual(['B']);
    expect(out.blocked).toEqual([
      { residentId: 'A', reasons: [{ rule: 'allWorking', message: 'Already working MT-D this date' }], blockerKinds: ['ownShift'] },
    ]);
  });

  it('blocks a non-overridable ineligible resident with the eligibilityReason text (kind eligibility)', () => {
    const schedule = { A: {} };
    const isEligible = () => false;
    const eligibilityReason = () => ({ rule: 'vacation', tier: 'acgme', label: 'Shift scheduled on a vacation date' });
    const out = findSlotCandidates({
      dateStr: 'd1', shiftId: 'POD-D', residents: [{ id: 'A' }], schedule, lockedCells: {},
      isEligible, eligibilityReason, hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out.legal).toEqual([]);
    expect(out.override).toEqual([]);
    expect(out.blocked).toEqual([
      { residentId: 'A', reasons: [{ rule: 'vacation', message: 'Shift scheduled on a vacation date' }], blockerKinds: ['eligibility'] },
    ]);
  });

  it('offers an override-tier-ineligible resident in the override bucket, tagged needsOverride', () => {
    const schedule = { A: {} };
    const isEligible = () => false;
    const eligibilityReason = () => ({ rule: 'wellnessWednesday', tier: 'override', label: 'Wellness Wednesday day/evening shift' });
    const out = findSlotCandidates({
      dateStr: 'd1', shiftId: 'POD-D', residents: [{ id: 'A' }], schedule, lockedCells: {},
      isEligible, eligibilityReason, hardViolations: () => [], softViolations: () => [{ level: 'warn', rule: 'wellnessWednesday' }],
      targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out.blocked).toEqual([]);
    expect(out.legal).toEqual([]);
    expect(out.override).toHaveLength(1);
    expect(out.override[0].residentId).toBe('A');
    expect(out.override[0].needsOverride).toBe(true);
  });

  it('offers an eligible resident with an override-tier soft violation in the override bucket', () => {
    const schedule = { A: {}, B: {} };
    const isEligible = makeEligible({ A: new Set(['TRAUMA-N']), B: new Set(['TRAUMA-N']) });
    const softs = { A: [{ level: 'warn', rule: 'nightsTotalBlock', message: 'over cap' }], B: [] };
    const out = findSlotCandidates({
      dateStr: 'd1', shiftId: 'TRAUMA-N', residents: [{ id: 'A' }, { id: 'B' }], schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: (rid) => softs[rid], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out.legal.map(c => c.residentId)).toEqual(['B']);
    expect(out.override.map(c => c.residentId)).toEqual(['A']);
    expect(out.override[0].needsOverride).toBe(true);
  });

  it('blocks an eligible resident with a hard violation, carrying the violation rule/message (kind hardRule)', () => {
    const schedule = { A: {} };
    const isEligible = () => true;
    const hardViolations = () => [{ rule: 'restShiftLength', message: 'Rest less than the length of the shift just worked' }];
    const out = findSlotCandidates({
      dateStr: 'd1', shiftId: 'POD-D', residents: [{ id: 'A' }], schedule, lockedCells: {},
      isEligible, hardViolations, softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out.legal).toEqual([]);
    expect(out.blocked).toEqual([
      { residentId: 'A', reasons: [{ rule: 'restShiftLength', message: 'Rest less than the length of the shift just worked' }], blockerKinds: ['hardRule'] },
    ]);
  });

  it('blocks (defensively) when the target empty cell itself is locked', () => {
    const schedule = { A: {} };
    const out = findSlotCandidates({
      dateStr: 'd1', shiftId: 'POD-D', residents: [{ id: 'A' }], schedule, lockedCells: { A: { d1: true } },
      isEligible: () => true, hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out.legal).toEqual([]);
    expect(out.blocked[0].blockerKinds).toEqual(['locked']);
  });
});
