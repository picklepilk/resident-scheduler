// src/lib/expectedFiller.test.js
import { describe, it, expect } from 'vitest';
import { expectedFillerFor } from './expectedFiller.js';

// Small stand-ins for CATEGORIES (src/lib/parse.js) — only the fields expectedFiller.js reads.
const CATEGORIES = [
  { id: 'EM_HOME', label: 'EM – Home', shortLabel: 'EM-H' },
  { id: 'EM_BAMC', label: 'EM – BAMC', shortLabel: 'BAMC' },
  { id: 'FM', label: 'Family Medicine', shortLabel: 'FM' },
  { id: 'PEDS', label: 'Pediatrics', shortLabel: 'PEDS' },
];

function res(id, category, pgy, extra = {}) {
  return { id, category, pgy, firstName: id, lastName: '', ...extra };
}

// Mirrors SENIOR_COMPOSITION's shape (ResidentScheduler.jsx:2506) without importing the big file.
const COMPOSITION = { POD: { primary: 3, fallback: 2 }, FLEX: { primary: 2, fallback: 3 } };
const WED_DAY_DATE = '2026-10-14'; // stand-in "exempt Wednesday day shift" date for these tests
const WELLNESS_DATE = '2026-10-07';
const CONFERENCE_DATE = '2026-10-21';
const ORDINARY_DATE = '2026-10-01';

const baseSeniorityRules = {
  pgy1OnlyShiftIds: ['TRAUMA-D'],
  pedGuardOwnerLabels: { 'PED-N-FM': 'Owners only: FM PGY-3' },
  composition: COMPOSITION,
  isCompositionExempt: (shift, ds) => shift.type === 'day' && ds === WED_DAY_DATE,
  substituteStatus: (area, ds) => {
    if (ds === WELLNESS_DATE) return 'wellness';
    if (ds === CONFERENCE_DATE) return 'conference';
    return null;
  },
};

describe('expectedFillerFor — bucket grouping/labels', () => {
  const residents = [
    res('a', 'EM_HOME', 3),
    res('b', 'EM_HOME', 3),
    res('c', 'EM_HOME', 2),
    res('d', 'EM_BAMC', 1),
    res('e', 'FM', 1),
    res('f', 'PEDS', 2),
    res('g', 'IM', 2), // category not in the injected CATEGORIES stub — must still render, not vanish
  ];
  const effectiveEligibleShifts = () => ['POD-D'];

  it('groups eligible residents into one bucket per category+PGY with app-specified labels', () => {
    const { buckets } = expectedFillerFor({
      shiftId: 'POD-D', dateStr: ORDINARY_DATE, residents, effectiveEligibleShifts,
      categories: CATEGORIES, seniorityRules: baseSeniorityRules,
    });
    const byKey = Object.fromEntries(buckets.map(b => [b.key, b]));
    expect(byKey['EM_HOME_3']).toMatchObject({ label: 'EM PGY-3', category: 'EM_HOME', pgy: 3, count: 2 });
    expect(byKey['EM_HOME_2']).toMatchObject({ label: 'EM PGY-2', count: 1 });
    expect(byKey['EM_BAMC_1']).toMatchObject({ label: 'BAMC PGY-1', count: 1 });
    expect(byKey['FM_1']).toMatchObject({ label: 'Off-svc FM PGY-1', count: 1 });
    expect(byKey['PEDS_2']).toMatchObject({ label: 'Off-svc PEDS PGY-2', count: 1 });
    // IM isn't in the CATEGORIES stub passed in — falls back to the bare category id, still present.
    expect(byKey['IM_2']).toMatchObject({ label: 'Off-svc IM PGY-2', count: 1 });
  });

  it('excludes residents the effectiveEligibleShifts function does not list for this shift', () => {
    const { buckets } = expectedFillerFor({
      shiftId: 'POD-D', dateStr: ORDINARY_DATE, residents,
      effectiveEligibleShifts: (r) => (r.category === 'EM_HOME' ? ['POD-D'] : []),
      categories: CATEGORIES, seniorityRules: baseSeniorityRules,
    });
    expect(buckets.map(b => b.key).sort()).toEqual(['EM_HOME_2', 'EM_HOME_3']);
  });

  it('tolerates a missing effectiveEligibleShifts (no buckets, no throw)', () => {
    const { buckets } = expectedFillerFor({ shiftId: 'POD-D', dateStr: ORDINARY_DATE, residents });
    expect(buckets).toEqual([]);
  });
});

describe('expectedFillerFor — availability counting', () => {
  const residents = [res('a', 'EM_HOME', 3), res('b', 'EM_HOME', 3), res('c', 'EM_HOME', 3)];
  const effectiveEligibleShifts = () => ['POD-D'];

  it('counts eligible residents into `count` and free-that-date residents into `availableCount`', () => {
    const unavailable = new Set(['b']);
    const { buckets } = expectedFillerFor({
      shiftId: 'POD-D', dateStr: ORDINARY_DATE, residents, effectiveEligibleShifts,
      isAvailableOnDate: (r) => !unavailable.has(r.id),
      seniorityRules: baseSeniorityRules,
    });
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ count: 3, availableCount: 2 });
  });

  it('defaults availableCount to the full eligible count when isAvailableOnDate is omitted', () => {
    const { buckets } = expectedFillerFor({
      shiftId: 'POD-D', dateStr: ORDINARY_DATE, residents, effectiveEligibleShifts,
      seniorityRules: baseSeniorityRules,
    });
    expect(buckets[0]).toMatchObject({ count: 3, availableCount: 3 });
  });

  it('isEligibleOnDate, when provided, REPLACES the static check (date-scoped exclusion, e.g. vacation)', () => {
    const onVacation = new Set(['a']);
    const { buckets } = expectedFillerFor({
      shiftId: 'POD-D', dateStr: ORDINARY_DATE, residents, effectiveEligibleShifts,
      isEligibleOnDate: (r, ds, shiftId) => !onVacation.has(r.id) && shiftId === 'POD-D',
      seniorityRules: baseSeniorityRules,
    });
    expect(buckets[0]).toMatchObject({ count: 2 });
  });
});

describe('expectedFillerFor — requirement text/kind', () => {
  const residents = [res('a', 'EM_HOME', 3)];
  const effectiveEligibleShifts = () => ['POD-D', 'FLEX-D', 'TRAUMA-D', 'PED-N-FM', 'MT-D'];

  it('POD hard composition on an ordinary day: pgy3, no substitute mentioned', () => {
    const { requirement, requirementKind } = expectedFillerFor({
      shiftId: 'POD-D', dateStr: ORDINARY_DATE, residents, effectiveEligibleShifts,
      seniorityRules: baseSeniorityRules,
    });
    expect(requirement).toBe('POD needs a PGY-3');
    expect(requirementKind).toBe('pgy3');
  });

  it('FLEX hard composition on an ordinary day: pgy2', () => {
    const { requirement, requirementKind } = expectedFillerFor({
      shiftId: 'FLEX-D', dateStr: ORDINARY_DATE, residents, effectiveEligibleShifts,
      seniorityRules: baseSeniorityRules,
    });
    expect(requirement).toBe('FLEX needs a PGY-2');
    expect(requirementKind).toBe('pgy2');
  });

  it('Wednesday DAY-type shift is exempt from composition entirely (Grand Rounds)', () => {
    const { requirement, requirementKind } = expectedFillerFor({
      shiftId: 'POD-D', dateStr: WED_DAY_DATE, residents, effectiveEligibleShifts,
      seniorityRules: baseSeniorityRules,
    });
    expect(requirement).toBeNull();
    expect(requirementKind).toBeNull();
  });

  it('is NOT exempt on a non-day shift type even on the same Wednesday (eve/night keep the rule)', () => {
    // POD-E on the Wednesday day-exempt date still hard-requires its primary PGY.
    const { requirement, requirementKind } = expectedFillerFor({
      shiftId: 'POD-E', dateStr: WED_DAY_DATE, residents,
      effectiveEligibleShifts: () => ['POD-E'],
      seniorityRules: baseSeniorityRules,
    });
    expect(requirement).toBe('POD needs a PGY-3');
    expect(requirementKind).toBe('pgy3');
  });

  it('names the Wellness-Wednesday fallback PGY as an allowed substitute', () => {
    const { requirement, requirementKind } = expectedFillerFor({
      shiftId: 'POD-D', dateStr: WELLNESS_DATE, residents, effectiveEligibleShifts,
      seniorityRules: baseSeniorityRules,
    });
    expect(requirement).toBe('POD needs a PGY-3, PGY-2 allowed today (Wellness Wed)');
    expect(requirementKind).toBe('pgy3');
  });

  it('names the conference-away fallback PGY as an allowed substitute', () => {
    const { requirement, requirementKind } = expectedFillerFor({
      shiftId: 'FLEX-D', dateStr: CONFERENCE_DATE, residents, effectiveEligibleShifts,
      seniorityRules: baseSeniorityRules,
    });
    expect(requirement).toBe('FLEX needs a PGY-2, PGY-3 allowed today (conference)');
    expect(requirementKind).toBe('pgy2');
  });

  it('Trauma Day: PGY-1-only, from the injected pgy1OnlyShiftIds list', () => {
    const { requirement, requirementKind } = expectedFillerFor({
      shiftId: 'TRAUMA-D', dateStr: ORDINARY_DATE, residents, effectiveEligibleShifts,
      seniorityRules: baseSeniorityRules,
    });
    expect(requirement).toBe('Trauma day: PGY-1 only');
    expect(requirementKind).toBe('pgy1Only');
  });

  it('PED-N-FM: owner-guarded shift, from the injected pedGuardOwnerLabels map', () => {
    const { requirement, requirementKind } = expectedFillerFor({
      shiftId: 'PED-N-FM', dateStr: ORDINARY_DATE, residents, effectiveEligibleShifts,
      seniorityRules: baseSeniorityRules,
    });
    expect(requirement).toBe('Owners only: FM PGY-3');
    expect(requirementKind).toBe('owner');
  });

  it('a shift with no composition/ownership/pgy1-only rule reports no requirement', () => {
    const { requirement, requirementKind } = expectedFillerFor({
      shiftId: 'MT-D', dateStr: ORDINARY_DATE, residents, effectiveEligibleShifts,
      seniorityRules: baseSeniorityRules,
    });
    expect(requirement).toBeNull();
    expect(requirementKind).toBeNull();
  });

  it('defaults to no requirement when seniorityRules is omitted entirely', () => {
    const { requirement, requirementKind } = expectedFillerFor({
      shiftId: 'POD-D', dateStr: ORDINARY_DATE, residents, effectiveEligibleShifts,
    });
    expect(requirement).toBeNull();
    expect(requirementKind).toBeNull();
  });
});
