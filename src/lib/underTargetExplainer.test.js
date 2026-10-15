import { describe, it, expect } from 'vitest';
import { scanUnderTargetSlots, topBlockerReasons } from './underTargetExplainer.js';

// Same posture as slotCandidates.test.js/slotFixes.test.js: stub predicates standing in for the
// real rule engine, exercising only the pure scan/bucketing math here.
const SHIFTS = [{ id: 'POD-D' }, { id: 'POD-N' }];
const DATES = ['d1', 'd2', 'd3'];

function alwaysEligible() { return true; }
function noHard() { return []; }
function noSoft() { return []; }
function fullCoverage() { return () => ({ min: 1, max: 1, count: 1 }); }
function openCoverage() { return () => ({ min: 1, max: 2, count: 1 }); }

describe('scanUnderTargetSlots', () => {
  it('buckets an eligible, hard-clean, open slot as legal', () => {
    const out = scanUnderTargetSlots({
      residentId: 'R', dates: DATES, shifts: SHIFTS, schedule: { R: {} }, lockedCells: {},
      isEligible: alwaysEligible, hardViolations: noHard, softViolations: noSoft,
      targetInfo: () => ({ count: 10, target: 20 }), coverageFor: openCoverage(),
    });
    expect(out.legal.length).toBe(DATES.length * SHIFTS.length);
    expect(out.legal[0]).toMatchObject({ dateStr: 'd1', shiftId: 'POD-D', needsOverride: false });
    expect(out.blockedFixable).toEqual([]);
    expect(out.blockedOther).toEqual([]);
    expect(out.noHeadroomCount).toBe(0);
  });

  it('counts a fully-staffed slot as noHeadroom and skips it regardless of eligibility', () => {
    const out = scanUnderTargetSlots({
      residentId: 'R', dates: DATES, shifts: SHIFTS, schedule: { R: {} }, lockedCells: {},
      isEligible: alwaysEligible, hardViolations: noHard, softViolations: noSoft,
      targetInfo: () => ({ count: 10, target: 20 }), coverageFor: fullCoverage(),
    });
    expect(out.legal).toEqual([]);
    expect(out.noHeadroomCount).toBe(DATES.length * SHIFTS.length);
  });

  it('skips an already-working date entirely (not tallied anywhere)', () => {
    const out = scanUnderTargetSlots({
      residentId: 'R', dates: ['d1'], shifts: SHIFTS, schedule: { R: { d1: 'MT-D' } }, lockedCells: {},
      isEligible: alwaysEligible, hardViolations: noHard, softViolations: noSoft,
      targetInfo: () => ({ count: 10, target: 20 }), coverageFor: openCoverage(),
    });
    expect(out.legal).toEqual([]);
    expect(out.blockedFixable).toEqual([]);
    expect(out.blockedOther).toEqual([]);
    expect(out.noHeadroomCount).toBe(0);
    expect(out.scanned).toBe(0);
  });

  it('sorts a fixable hard-rule block (rest) into blockedFixable and tallies it', () => {
    const hardViolations = (rid, ds, sid) => (ds === 'd1' ? [{ rule: 'restShiftLength', message: 'Rest short' }] : []);
    const out = scanUnderTargetSlots({
      residentId: 'R', dates: DATES, shifts: [{ id: 'POD-D' }], schedule: { R: {} }, lockedCells: {},
      isEligible: alwaysEligible, hardViolations, softViolations: noSoft,
      targetInfo: () => ({ count: 10, target: 20 }), coverageFor: openCoverage(),
    });
    expect(out.blockedFixable).toHaveLength(1);
    expect(out.blockedFixable[0]).toMatchObject({ dateStr: 'd1', shiftId: 'POD-D', blockerKinds: ['hardRule'] });
    expect(out.blockerTotals).toEqual({ restShiftLength: 1 });
    expect(out.legal.length).toBe(DATES.length - 1);
  });

  it('sorts an unfixable hard-rule block (seniority) into blockedOther, not blockedFixable', () => {
    const hardViolations = () => [{ rule: 'pgy3Required', message: 'PGY-3 required' }];
    const out = scanUnderTargetSlots({
      residentId: 'R', dates: ['d1'], shifts: [{ id: 'POD-D' }], schedule: { R: {} }, lockedCells: {},
      isEligible: alwaysEligible, hardViolations, softViolations: noSoft,
      targetInfo: () => ({ count: 10, target: 20 }), coverageFor: openCoverage(),
    });
    expect(out.blockedFixable).toEqual([]);
    expect(out.blockedOther).toHaveLength(1);
    expect(out.blockerTotals).toEqual({ pgy3Required: 1 });
  });

  it('sorts a non-overridable eligibility block into blockedOther and tallies it', () => {
    const isEligible = () => false;
    const eligibilityReason = () => ({ rule: 'vacation', tier: 'acgme', label: 'On vacation' });
    const out = scanUnderTargetSlots({
      residentId: 'R', dates: ['d1'], shifts: [{ id: 'POD-D' }], schedule: { R: {} }, lockedCells: {},
      isEligible, eligibilityReason, hardViolations: noHard, softViolations: noSoft,
      targetInfo: () => ({ count: 10, target: 20 }), coverageFor: openCoverage(),
    });
    expect(out.blockedOther).toHaveLength(1);
    expect(out.blockedOther[0].blockerKinds).toEqual(['eligibility']);
    expect(out.blockerTotals).toEqual({ vacation: 1 });
  });

  it('buckets an override-tier-eligible resident into override, never legal', () => {
    const isEligible = () => false;
    const eligibilityReason = () => ({ rule: 'wellnessWednesday', tier: 'override', label: 'Wellness Wednesday' });
    const out = scanUnderTargetSlots({
      residentId: 'R', dates: ['d1'], shifts: [{ id: 'POD-D' }], schedule: { R: {} }, lockedCells: {},
      isEligible, eligibilityReason, hardViolations: noHard, softViolations: noSoft,
      targetInfo: () => ({ count: 10, target: 20 }), coverageFor: openCoverage(),
    });
    expect(out.legal).toEqual([]);
    expect(out.override).toHaveLength(1);
    expect(out.override[0].needsOverride).toBe(true);
  });

  it('skips a shift not active on that weekday (TRAUMA-D, real SHIFT_DOW-restricted id)', () => {
    // TRAUMA-D's real SHIFT_DOW entry is [0,2,4,6] (Sun/Tue/Thu/Sat) — find a Monday (dow 1, NOT
    // in that list) and a Sunday (dow 0, IS in that list) near a fixed anchor so the assertion
    // doesn't depend on hardcoding a calendar date by eye.
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const findDow = (target) => { const d = new Date(2026, 9, 1); while (d.getDay() !== target) d.setDate(d.getDate() + 1); return fmt(d); };
    const monday = findDow(1);
    const sunday = findDow(0);

    const outMonday = scanUnderTargetSlots({
      residentId: 'R', dates: [monday], shifts: [{ id: 'TRAUMA-D' }], schedule: { R: {} }, lockedCells: {},
      isEligible: alwaysEligible, hardViolations: noHard, softViolations: noSoft,
      targetInfo: () => ({ count: 10, target: 20 }), coverageFor: openCoverage(),
    });
    expect(outMonday.scanned).toBe(0);
    expect(outMonday.legal).toEqual([]);

    const outSunday = scanUnderTargetSlots({
      residentId: 'R', dates: [sunday], shifts: [{ id: 'TRAUMA-D' }], schedule: { R: {} }, lockedCells: {},
      isEligible: alwaysEligible, hardViolations: noHard, softViolations: noSoft,
      targetInfo: () => ({ count: 10, target: 20 }), coverageFor: openCoverage(),
    });
    expect(outSunday.scanned).toBe(1);
    expect(outSunday.legal).toHaveLength(1);
  });

  it('defaults to empty buckets for empty dates/shifts', () => {
    const out = scanUnderTargetSlots({ residentId: 'R', dates: [], shifts: [], schedule: {}, lockedCells: {}, isEligible: alwaysEligible, hardViolations: noHard, softViolations: noSoft, targetInfo: () => ({}), coverageFor: () => ({}) });
    expect(out).toMatchObject({ legal: [], override: [], blockedFixable: [], blockedOther: [], blockerTotals: {}, noHeadroomCount: 0, scanned: 0 });
  });
});

describe('topBlockerReasons', () => {
  it('sorts by count descending, ties in first-seen order, bounded to n', () => {
    const totals = { restShiftLength: 2, pgy3Required: 5, rolling80h: 2 };
    expect(topBlockerReasons(totals, 2)).toEqual([
      { rule: 'pgy3Required', count: 5 },
      { rule: 'restShiftLength', count: 2 },
    ]);
  });

  it('returns [] for empty/undefined totals', () => {
    expect(topBlockerReasons({})).toEqual([]);
    expect(topBlockerReasons(undefined)).toEqual([]);
  });
});
