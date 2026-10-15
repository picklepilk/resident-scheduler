import { describe, it, expect } from 'vitest';
import { findSickCallCoverage } from './sickCallCover.js';

// Small stub helpers standing in for getEligibleShifts/cellViolations/getShiftTarget — same style
// as cellAlternatives.test.js (these exercise the pure ranking/wiring only, not the real rule
// engine, which has its own tests).
const RESIDENTS = [{ id: 'SICK' }, { id: 'A' }, { id: 'B' }, { id: 'C' }];

function makeEligible(map) {
  return (residentId, _dateStr, shiftId) => !!map[residentId]?.has(shiftId);
}

describe('findSickCallCoverage', () => {
  it('skips dates where the sick resident had no shift assigned', () => {
    const schedule = { SICK: { d1: 'POD-D', d2: null }, A: {} };
    const out = findSickCallCoverage({
      sickResidentId: 'SICK', dates: ['d1', 'd2'], schedule, residents: RESIDENTS, lockedCells: {},
      isEligible: makeEligible({ A: new Set(['POD-D']) }),
      hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out.map(e => e.dateStr)).toEqual(['d1']);
  });

  it('marks a locked affected shift with empty candidates rather than throwing', () => {
    const schedule = { SICK: { d1: 'POD-D' }, A: {} };
    const out = findSickCallCoverage({
      sickResidentId: 'SICK', dates: ['d1'], schedule, residents: RESIDENTS,
      lockedCells: { SICK: { d1: true } },
      isEligible: makeEligible({ A: new Set(['POD-D']) }),
      hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out).toEqual([{ dateStr: 'd1', shiftId: 'POD-D', locked: true, candidates: [] }]);
  });

  it('excludes candidates with a hard violation, same as findGiveCandidates', () => {
    const schedule = { SICK: { d1: 'POD-D' }, A: {}, B: {} };
    const out = findSickCallCoverage({
      sickResidentId: 'SICK', dates: ['d1'], schedule, residents: RESIDENTS, lockedCells: {},
      isEligible: makeEligible({ A: new Set(['POD-D']), B: new Set(['POD-D']) }),
      hardViolations: (rid) => (rid === 'A' ? [{ level: 'error' }] : []),
      softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out[0].candidates.map(c => c.residentId)).toEqual(['B']);
  });

  it('ranks a jeopardy-for-that-date resident first among equally legal candidates', () => {
    const schedule = { SICK: { d1: 'POD-D' }, A: {}, B: {} };
    const targets = { A: { count: 10, target: 20 }, B: { count: 10, target: 20 } };
    const out = findSickCallCoverage({
      sickResidentId: 'SICK', dates: ['d1'], schedule, residents: RESIDENTS, lockedCells: {},
      isEligible: makeEligible({ A: new Set(['POD-D']), B: new Set(['POD-D']) }),
      hardViolations: () => [], softViolations: () => [], targetInfo: (rid) => targets[rid],
      jeopardyResidentIdsFor: () => new Set(['B']),
    });
    // A and B are equally under target — B is on jeopardy this date, so B sorts first.
    expect(out[0].candidates.map(c => c.residentId)).toEqual(['B', 'A']);
    expect(out[0].candidates[0].isJeopardy).toBe(true);
    expect(out[0].candidates[1].isJeopardy).toBe(false);
  });

  it('puts the jeopardy resident first even when further from target (natural first cover)', () => {
    // Per CLAUDE.md: "jeopardy tracks ... the natural first cover" — a legal jeopardy candidate
    // is offered first, ahead of the under-target ranking that orders everyone else.
    const schedule = { SICK: { d1: 'POD-D' }, A: {}, B: {} };
    const targets = { A: { count: 2, target: 20 }, B: { count: 19, target: 20 } };
    const out = findSickCallCoverage({
      sickResidentId: 'SICK', dates: ['d1'], schedule, residents: RESIDENTS, lockedCells: {},
      isEligible: makeEligible({ A: new Set(['POD-D']), B: new Set(['POD-D']) }),
      hardViolations: () => [], softViolations: () => [], targetInfo: (rid) => targets[rid],
      jeopardyResidentIdsFor: () => new Set(['B']),
    });
    expect(out[0].candidates.map(c => c.residentId)).toEqual(['B', 'A']);
  });

  it('breaks an under-target tie by fewest shifts, then by fewest nights/weekends for a night shift', () => {
    const schedule = { SICK: { d1: 'POD-N' }, A: {}, B: {} };
    const targets = { A: { count: 10, target: 20 }, B: { count: 10, target: 20 } };
    const out = findSickCallCoverage({
      sickResidentId: 'SICK', dates: ['d1'], schedule, residents: RESIDENTS, lockedCells: {},
      isEligible: makeEligible({ A: new Set(['POD-N']), B: new Set(['POD-N']) }),
      hardViolations: () => [], softViolations: () => [], targetInfo: (rid) => targets[rid],
      isNightOrWeekendShift: () => true,
      nightWeekendCountFor: (rid) => (rid === 'A' ? 5 : 2),
    });
    // Same deficit, same count (10) — B has fewer nights/weekends this block, so B sorts first.
    expect(out[0].candidates.map(c => c.residentId)).toEqual(['B', 'A']);
  });

  it('ignores the night/weekend tiebreak for a plain day shift', () => {
    const schedule = { SICK: { d1: 'POD-D' }, A: {}, B: {} };
    const targets = { A: { count: 10, target: 20 }, B: { count: 10, target: 20 } };
    const out = findSickCallCoverage({
      sickResidentId: 'SICK', dates: ['d1'], schedule, residents: RESIDENTS, lockedCells: {},
      isEligible: makeEligible({ A: new Set(['POD-D']), B: new Set(['POD-D']) }),
      hardViolations: () => [], softViolations: () => [], targetInfo: (rid) => targets[rid],
      isNightOrWeekendShift: () => false,
      nightWeekendCountFor: (rid) => (rid === 'A' ? 5 : 2),
      // soft-count tiebreak decides instead, since the night/weekend one is skipped
      softViolations: (rid) => (rid === 'A' ? [] : [{ level: 'warn' }]),
    });
    expect(out[0].candidates.map(c => c.residentId)).toEqual(['A', 'B']);
  });

  it('sorts needsOverride candidates last regardless of jeopardy/target', () => {
    const schedule = { SICK: { d1: 'POD-D' }, A: {}, B: {} };
    const targets = { A: { count: 2, target: 20 }, B: { count: 19, target: 20 } };
    const out = findSickCallCoverage({
      sickResidentId: 'SICK', dates: ['d1'], schedule, residents: RESIDENTS, lockedCells: {},
      // A is only reachable via an override-tier ineligibility; B is outright eligible.
      isEligible: makeEligible({ B: new Set(['POD-D']) }),
      eligibilityReason: (rid) => (rid === 'A' ? { tier: 'override' } : null),
      hardViolations: () => [], softViolations: () => [], targetInfo: (rid) => targets[rid],
      jeopardyResidentIdsFor: () => new Set(['A']),
    });
    expect(out[0].candidates.map(c => c.residentId)).toEqual(['B', 'A']);
    expect(out[0].candidates[1].needsOverride).toBe(true);
  });

  it('handles multiple affected dates independently', () => {
    const schedule = { SICK: { d1: 'POD-D', d2: 'POD-N' }, A: {}, B: {} };
    const out = findSickCallCoverage({
      sickResidentId: 'SICK', dates: ['d1', 'd2'], schedule, residents: RESIDENTS, lockedCells: {},
      isEligible: makeEligible({ A: new Set(['POD-D', 'POD-N']), B: new Set(['POD-D', 'POD-N']) }),
      hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out.map(e => ({ dateStr: e.dateStr, shiftId: e.shiftId }))).toEqual([
      { dateStr: 'd1', shiftId: 'POD-D' },
      { dateStr: 'd2', shiftId: 'POD-N' },
    ]);
  });

  it('accepts a plain array for jeopardyResidentIdsFor, not just a Set', () => {
    const schedule = { SICK: { d1: 'POD-D' }, A: {}, B: {} };
    const targets = { A: { count: 10, target: 20 }, B: { count: 10, target: 20 } };
    const out = findSickCallCoverage({
      sickResidentId: 'SICK', dates: ['d1'], schedule, residents: RESIDENTS, lockedCells: {},
      isEligible: makeEligible({ A: new Set(['POD-D']), B: new Set(['POD-D']) }),
      hardViolations: () => [], softViolations: () => [], targetInfo: (rid) => targets[rid],
      jeopardyResidentIdsFor: () => ['B'],
    });
    expect(out[0].candidates.map(c => c.residentId)).toEqual(['B', 'A']);
  });
});
