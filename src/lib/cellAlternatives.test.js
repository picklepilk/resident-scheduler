import { describe, it, expect } from 'vitest';
import { findGiveCandidates, findSwapCandidates, findAssignOptions } from './cellAlternatives.js';

// Small stub helpers standing in for getEligibleShifts/cellViolations/getShiftTarget — these
// tests exercise the pure candidate math only, not the real rule engine (that's covered by
// generator/validateAll's own tests).
const RESIDENTS = [
  { id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' },
];

function makeEligible(map) {
  // map: { residentId: Set of eligible shiftIds for the test's one dateStr }
  return (residentId, _dateStr, shiftId) => !!map[residentId]?.has(shiftId);
}

describe('findGiveCandidates', () => {
  it('excludes busy residents (not free that day)', () => {
    const schedule = { A: { d1: 'POD-D' }, B: { d1: 'MT-D' }, C: {}, D: {} };
    const isEligible = makeEligible({ B: new Set(['POD-D']), C: new Set(['POD-D']), D: new Set(['POD-D']) });
    const out = findGiveCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    // B is busy (has MT-D that day) — excluded even though "eligible" per the stub.
    expect(out.map(c => c.residentId).sort()).toEqual(['C', 'D']);
  });

  it('returns nothing when the source cell itself is locked', () => {
    const schedule = { A: { d1: 'POD-D' }, B: {}, C: {} };
    const isEligible = makeEligible({ B: new Set(['POD-D']), C: new Set(['POD-D']) });
    const out = findGiveCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: { A: { d1: true } },
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out).toEqual([]);
  });

  it('excludes locked cells', () => {
    const schedule = { A: { d1: 'POD-D' }, B: {}, C: {} };
    const isEligible = makeEligible({ B: new Set(['POD-D']), C: new Set(['POD-D']) });
    const out = findGiveCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule,
      lockedCells: { B: { d1: true } },
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out.map(c => c.residentId)).toEqual(['C']);
  });

  it('excludes candidates with any hard violation', () => {
    const schedule = { A: { d1: 'POD-D' }, B: {}, C: {} };
    const isEligible = makeEligible({ B: new Set(['POD-D']), C: new Set(['POD-D']) });
    const hardViolations = (residentId) => (residentId === 'B' ? [{ message: 'nope', level: 'error' }] : []);
    const out = findGiveCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations, softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out.map(c => c.residentId)).toEqual(['C']);
  });

  it('ranks most-under-target first, then fewest soft violations', () => {
    const schedule = { A: { d1: 'POD-D' }, B: {}, C: {}, D: {} };
    const isEligible = makeEligible({
      B: new Set(['POD-D']), C: new Set(['POD-D']), D: new Set(['POD-D']),
    });
    const targets = { B: { count: 18, target: 20 }, C: { count: 10, target: 20 }, D: { count: 10, target: 20 } };
    const softs = { B: [], C: [{ level: 'warn' }, { level: 'warn' }], D: [{ level: 'warn' }] };
    const out = findGiveCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: (rid) => softs[rid],
      targetInfo: (rid) => targets[rid],
    });
    // C and D are equally under target (10 more needed) but D has fewer soft violations than C;
    // B is closest to target so ranks last of the three.
    expect(out.map(c => c.residentId)).toEqual(['D', 'C', 'B']);
  });

  it('ranks a resident with no target (self-cover) last', () => {
    const schedule = { A: { d1: 'POD-D' }, B: {}, C: {} };
    const isEligible = makeEligible({ B: new Set(['POD-D']), C: new Set(['POD-D']) });
    const targets = { B: { count: 0, target: null }, C: { count: 15, target: 20 } };
    const out = findGiveCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: (rid) => targets[rid],
    });
    expect(out.map(c => c.residentId)).toEqual(['C', 'B']);
  });

  it('returns empty when nobody is free/eligible', () => {
    const schedule = { A: { d1: 'POD-D' }, B: { d1: 'MT-D' }, C: { d1: 'MT-E' } };
    const isEligible = makeEligible({});
    const out = findGiveCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out).toEqual([]);
  });
});

describe('findSwapCandidates', () => {
  it('requires both sides clean of hard violations', () => {
    const schedule = { A: { d1: 'POD-D' }, B: { d1: 'MT-D' }, C: { d1: 'MT-E' } };
    const isEligible = makeEligible({
      A: new Set(['MT-D', 'MT-E']), B: new Set(['POD-D']), C: new Set(['POD-D']),
    });
    // B's side is clean both ways, C's candidate-side placement is dirty.
    const hardViolations = (residentId, _ds, shiftId) => (residentId === 'C' && shiftId === 'POD-D' ? [{ level: 'error' }] : []);
    const out = findSwapCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations, softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out.map(c => c.residentId)).toEqual(['B']);
  });

  it('excludes a candidate working the SAME shift that day', () => {
    const schedule = { A: { d1: 'POD-D' }, B: { d1: 'POD-D' } };
    const isEligible = makeEligible({ A: new Set(['POD-D']), B: new Set(['POD-D']) });
    const out = findSwapCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out).toEqual([]);
  });

  it('excludes a swap where either side is locked', () => {
    const schedule = { A: { d1: 'POD-D' }, B: { d1: 'MT-D' } };
    const isEligible = makeEligible({ A: new Set(['MT-D']), B: new Set(['POD-D']) });
    const out = findSwapCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule,
      lockedCells: { B: { d1: true } },
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out).toEqual([]);
  });

  it('returns empty when the source cell itself is locked', () => {
    const schedule = { A: { d1: 'POD-D' }, B: { d1: 'MT-D' } };
    const isEligible = makeEligible({ A: new Set(['MT-D']), B: new Set(['POD-D']) });
    const out = findSwapCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule,
      lockedCells: { A: { d1: true } },
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: () => ({ count: 0, target: 20 }),
    });
    expect(out).toEqual([]);
  });

  it('ranks by deficit then soft-violation count', () => {
    const schedule = { A: { d1: 'POD-D' }, B: { d1: 'MT-D' }, C: { d1: 'MT-E' } };
    const isEligible = makeEligible({
      A: new Set(['MT-D', 'MT-E']), B: new Set(['POD-D']), C: new Set(['POD-D']),
    });
    const targets = { B: { count: 15, target: 20 }, C: { count: 10, target: 20 } };
    const out = findSwapCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: () => [], targetInfo: (rid) => targets[rid],
    });
    expect(out.map(c => c.residentId)).toEqual(['C', 'B']);
  });
});

describe('findAssignOptions', () => {
  it('excludes shifts already at coverage max', () => {
    const coverage = { 'POD-D': { count: 2, min: 2, max: 2 }, 'MT-D': { count: 0, min: 1, max: 1 } };
    const out = findAssignOptions({
      residentId: 'A', dateStr: 'd1', candidateShiftIds: ['POD-D', 'MT-D'], schedule: {}, lockedCells: {},
      hardViolations: () => [], softViolations: () => [], coverageFor: (sid) => coverage[sid],
    });
    expect(out.map(c => c.shiftId)).toEqual(['MT-D']);
  });

  it('excludes shifts with a hard violation', () => {
    const coverage = { 'POD-D': { count: 0, min: 2, max: 2 }, 'MT-D': { count: 0, min: 1, max: 1 } };
    const hardViolations = (_rid, _ds, sid) => (sid === 'POD-D' ? [{ level: 'error' }] : []);
    const out = findAssignOptions({
      residentId: 'A', dateStr: 'd1', candidateShiftIds: ['POD-D', 'MT-D'], schedule: {}, lockedCells: {},
      hardViolations, softViolations: () => [], coverageFor: (sid) => coverage[sid],
    });
    expect(out.map(c => c.shiftId)).toEqual(['MT-D']);
  });

  it('ranks below-minimum shifts first, biggest gap first', () => {
    const coverage = {
      'POD-D': { count: 1, min: 2, max: 2 },   // shortfall 1
      'MT-D': { count: 0, min: 2, max: 3 },    // shortfall 2
      'FLEX-D': { count: 2, min: 2, max: 3 },  // at min, headroom 1
    };
    const out = findAssignOptions({
      residentId: 'A', dateStr: 'd1', candidateShiftIds: ['POD-D', 'MT-D', 'FLEX-D'], schedule: {}, lockedCells: {},
      hardViolations: () => [], softViolations: () => [], coverageFor: (sid) => coverage[sid],
    });
    expect(out.map(c => c.shiftId)).toEqual(['MT-D', 'POD-D', 'FLEX-D']);
  });

  it('returns empty when the cell itself is locked', () => {
    const coverage = { 'POD-D': { count: 0, min: 2, max: 2 } };
    const out = findAssignOptions({
      residentId: 'A', dateStr: 'd1', candidateShiftIds: ['POD-D'], schedule: {},
      lockedCells: { A: { d1: true } },
      hardViolations: () => [], softViolations: () => [], coverageFor: (sid) => coverage[sid],
    });
    expect(out).toEqual([]);
  });

  it('returns empty when no candidate shifts are given', () => {
    const out = findAssignOptions({
      residentId: 'A', dateStr: 'd1', candidateShiftIds: [], schedule: {}, lockedCells: {},
      hardViolations: () => [], softViolations: () => [], coverageFor: () => null,
    });
    expect(out).toEqual([]);
  });
});

// R6 (rule-policy plan, 2026-09-26): a candidate whose only soft violations are override-tier
// rulePolicy ids is still OFFERED (never hard-excluded — that's what `hardViolations`/level:'error'
// already does, unaffected by this), but tagged `needsOverride: true` and ranked LAST, behind every
// clean-or-advisory-only candidate. 'nightsTotalBlock' below is a real rulePolicy.js override-tier
// id; a rule-less warn (no `rule` field, e.g. postNightRest today) stays purely advisory.
describe('tier-aware ranking (needsOverride) — R6', () => {
  it('findGiveCandidates: an override-tier candidate is tagged needsOverride and ranked after a clean one', () => {
    const schedule = { A: { d1: 'POD-D' }, B: {}, C: {} };
    const isEligible = makeEligible({ B: new Set(['POD-D']), C: new Set(['POD-D']) });
    const softs = { B: [{ level: 'warn', rule: 'nightsTotalBlock', message: 'over cap' }], C: [] };
    const out = findGiveCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: (rid) => softs[rid],
      targetInfo: () => ({ count: 10, target: 20 }),
    });
    expect(out.map(c => c.residentId)).toEqual(['C', 'B']);
    expect(out.find(c => c.residentId === 'B').needsOverride).toBe(true);
    expect(out.find(c => c.residentId === 'C').needsOverride).toBe(false);
  });

  it('findGiveCandidates: an advisory (rule-less) warn does NOT count as needsOverride', () => {
    const schedule = { A: { d1: 'POD-D' }, B: {} };
    const isEligible = makeEligible({ B: new Set(['POD-D']) });
    const out = findGiveCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: () => [{ level: 'warn', message: 'soft rule flagged' }],
      targetInfo: () => ({ count: 10, target: 20 }),
    });
    expect(out[0].needsOverride).toBe(false);
  });

  it('findSwapCandidates: an override-tier candidate on either side is tagged and ranked last', () => {
    const schedule = { A: { d1: 'POD-D' }, B: { d1: 'MT-D' }, C: { d1: 'MT-D' } };
    const isEligible = makeEligible({
      B: new Set(['POD-D']), C: new Set(['POD-D']), A: new Set(['MT-D']),
    });
    const softs = { B: [{ level: 'warn', rule: 'traumaRunCap' }], C: [] };
    const out = findSwapCandidates({
      residentId: 'A', dateStr: 'd1', shiftId: 'POD-D', residents: RESIDENTS, schedule, lockedCells: {},
      isEligible, hardViolations: () => [], softViolations: (rid) => softs[rid] || [],
      targetInfo: () => ({ count: 10, target: 20 }),
    });
    expect(out.map(c => c.residentId)).toEqual(['C', 'B']);
    expect(out.find(c => c.residentId === 'B').needsOverride).toBe(true);
  });

  it('findAssignOptions: an override-tier shift is tagged and ranked after every non-override option, even one with a bigger shortfall', () => {
    const coverage = {
      'POD-D': { count: 0, min: 2, max: 2 },  // biggest shortfall, but override-tier
      'MT-D': { count: 1, min: 2, max: 2 },   // smaller shortfall, clean
    };
    const softs = { 'POD-D': [{ level: 'warn', rule: 'podPgy3Composition' }], 'MT-D': [] };
    const out = findAssignOptions({
      residentId: 'A', dateStr: 'd1', candidateShiftIds: ['POD-D', 'MT-D'], schedule: {}, lockedCells: {},
      hardViolations: () => [], softViolations: (_rid, _ds, sid) => softs[sid] || [], coverageFor: (sid) => coverage[sid],
    });
    expect(out.map(c => c.shiftId)).toEqual(['MT-D', 'POD-D']);
    expect(out.find(c => c.shiftId === 'POD-D').needsOverride).toBe(true);
  });
});
