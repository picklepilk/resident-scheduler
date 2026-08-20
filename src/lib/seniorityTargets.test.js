/** @vitest-environment jsdom */
// src/lib/seniorityTargets.test.js
// Tests for Phase 1C ("1.8 FLEX PGY-2 requirement becomes HARD", "1.9 Under-target enforcement",
// "1.10 Vacation-block targets beat chief 16", "1.11 Rotation-window targets for off-service
// residents"). Imports the real ResidentScheduler.jsx under jsdom — verified import-safe by the
// existing generator.harness.test.js/grRestRules.test.js suites, same pattern followed here.
import { describe, it, expect } from 'vitest';
import { validateAll, generateSchedule, getShiftTarget, offServiceWindowTargetDelta } from '../ResidentScheduler.jsx';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

// Minimal resident stand-in — validateAll only ever reads these fields with `|| []`/optional-chain
// defaults, so a hand-built object (same pattern as grRestRules.test.js's `papaBare`) is enough;
// no need for the full synthetic roster for the composition-loop tests below.
function res(overrides) {
  return {
    id: overrides.id, firstName: overrides.firstName ?? 'Test', lastName: 'Resident',
    category: overrides.category, pgy: overrides.pgy,
    blockType: overrides.blockType, chiefRole: overrides.chiefRole ?? null,
    approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [],
  };
}

// Matches syntheticRoster.js's own fixed block window (2026-07-06 Mon .. 2026-08-02 Sun) so the
// well-known Wellness-Wednesday dates line up: 1st Wed on/after start = 2026-07-08 (EM_HOME_1),
// 2nd = 2026-07-15 (EM_HOME_2/FLEX's own), 3rd = 2026-07-22 (EM_HOME_3/POD's own) — see
// DEFAULT_DAY_RULES' wellnessWednesday ordinals in ResidentScheduler.jsx.
const block = { id: 'blk_test', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const ORDINARY_WED = '2026-07-08'; // 1st Wednesday — neither FLEX's nor POD's own Wellness Wednesday
const FLEX_WW = '2026-07-15';      // FLEX's (PGY-2's) own Wellness Wednesday (2nd)
const POD_WW = '2026-07-22';       // POD's (PGY-3's) own Wellness Wednesday (3rd)

function compositionIssues(allResidents, schedule) {
  return validateAll(allResidents, schedule, block).filter(i => i.message.includes('requires an EM PGY-'));
}

describe('1.8 FLEX PGY-2 requirement is hard (mirrors POD)', () => {
  it('FLEX staffed by a PGY-3 alone on an ordinary Wednesday evening is a hard error', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const schedule = { p3: { [ORDINARY_WED]: 'FLEX-E' } };
    const issues = compositionIssues([pgy3], schedule);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'error', dateStr: ORDINARY_WED, shiftId: 'FLEX-E' });
    expect(issues[0].message).toContain('PGY-2');
  });

  it('FLEX staffed by a PGY-3 alone on FLEX\'s OWN Wellness Wednesday (2nd) raises no issue', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const schedule = { p3: { [FLEX_WW]: 'FLEX-E' } };
    expect(compositionIssues([pgy3], schedule)).toEqual([]);
  });

  it('FLEX staffed by a PGY-3 alone on POD\'s Wellness Wednesday (3rd, not FLEX\'s own) still errors', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const schedule = { p3: { [POD_WW]: 'FLEX-E' } };
    const issues = compositionIssues([pgy3], schedule);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('error');
  });

  it('FLEX staffed by a PGY-2 (the primary) on an ordinary day raises no issue', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p2: { '2026-07-09': 'FLEX-E' } };
    expect(compositionIssues([pgy2], schedule)).toEqual([]);
  });

  // Regression guard on POD's existing behavior — must still work identically after the shared
  // compositionSatisfies/seniorWellnessSubstituteAllowed generalization.
  it('POD staffed by a PGY-2 alone on POD\'s OWN Wellness Wednesday (3rd) raises no issue', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p2: { [POD_WW]: 'POD-E' } };
    expect(compositionIssues([pgy2], schedule)).toEqual([]);
  });

  it('POD staffed by a PGY-2 alone on an ordinary Wednesday evening still errors', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p2: { [ORDINARY_WED]: 'POD-E' } };
    const issues = compositionIssues([pgy2], schedule);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('PGY-3');
  });

  it('Wednesday DAY shifts stay exempt for both areas (Grand Rounds)', () => {
    const pgy1 = res({ id: 'p1', category: 'EM_HOME', pgy: 1 });
    const schedule = { p1: { [ORDINARY_WED]: 'FLEX-D' } };
    expect(compositionIssues([pgy1], schedule)).toEqual([]);
  });
});

describe('1.8 generator/validator agreement — no wrong-PGY FLEX/POD staffing', () => {
  for (const variant of ['standard', 'understaffed', 'vacationHeavy']) {
    it(`generateSchedule (with repair) never staffs FLEX/POD with the wrong PGY (${variant})`, () => {
      const fixture = makeFixture(variant);
      const { schedule } = generateSchedule({ ...fixture, rng: mulberry32(7), repair: true });
      const issues = validateAll(
        fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
        fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf,
      );
      const compIssues = issues.filter(i => i.message.includes('requires an EM PGY-'));
      expect(compIssues).toEqual([]);
    });
  }
});

describe('1.9 Under-target enforcement in validateAll', () => {
  it('EM Home under target is a hard error that mentions it blocks export', () => {
    const r = res({ id: 'r1', category: 'EM_HOME', pgy: 3, blockType: 'EM' });
    const issues = validateAll([r], { r1: {} }, block);
    const u = issues.find(i => i.residentId === 'r1' && i.message.startsWith('Under target'));
    expect(u).toBeTruthy();
    expect(u.level).toBe('error');
    expect(u.message).toContain('blocks export');
  });

  it('EM BAMC under target is also a hard error', () => {
    const r = res({ id: 'r1', category: 'EM_BAMC', pgy: 1, blockType: 'EM' });
    const issues = validateAll([r], { r1: {} }, block);
    const u = issues.find(i => i.residentId === 'r1' && i.message.startsWith('Under target'));
    expect(u?.level).toBe('error');
  });

  it('Peds under target is a warning, not an error, and does not claim to block export', () => {
    const r = res({ id: 'r1', category: 'PEDS', pgy: 2 });
    const issues = validateAll([r], { r1: {} }, block);
    const u = issues.find(i => i.residentId === 'r1' && i.message.startsWith('Under target'));
    expect(u).toBeTruthy();
    expect(u.level).toBe('warn');
    expect(u.message).not.toContain('blocks export');
  });

  it('a resident on a non-schedulable rotation (e.g. METRO) is never flagged under target', () => {
    // Regression guard: getShiftTarget resolves a real SHIFT_TARGETS number for METRO (it has no
    // BLOCK_TARGETS entry), but METRO is self-arranged and isSchedulable() correctly says false —
    // without that guard every METRO/ADMIN/OB_VAC resident would raise a false hard error.
    const r = res({ id: 'r1', category: 'EM_HOME', pgy: 3, blockType: 'METRO' });
    const issues = validateAll([r], { r1: {} }, block);
    expect(issues.some(i => i.residentId === 'r1' && i.message.startsWith('Under target'))).toBe(false);
  });

  it('over target is unaffected (still a warning) for a hard category', () => {
    const r = res({ id: 'r1', category: 'EM_HOME', pgy: 3, blockType: 'EM' });
    // 20 FLEX/POD-agnostic shifts, well over the base 18-shift EM_HOME_3 target.
    const rs = {};
    for (let i = 0; i < 20; i++) rs[`2026-07-${String(6 + i).padStart(2, '0')}`] = 'POD-D';
    const issues = validateAll([r], { r1: rs }, block);
    const over = issues.find(i => i.residentId === 'r1' && i.message.startsWith('Over target'));
    expect(over?.level).toBe('warn');
  });
});

describe('1.10 getShiftTarget — vacation-rotation BLOCK_TARGETS wins even for a chief', () => {
  it('PGY-3 chief on EM_VAC works the reduced 11, not the flat chief 16', () => {
    const r = { category: 'EM_HOME', pgy: 3, chiefRole: 'scheduling', blockType: 'EM_VAC' };
    expect(getShiftTarget(r)).toBe(11);
  });

  it('PGY-2 chief-role holder on EM_VAC works 12', () => {
    const r = { category: 'EM_HOME', pgy: 2, chiefRole: 'admin', blockType: 'EM_VAC' };
    expect(getShiftTarget(r)).toBe(12);
  });

  it('PGY-1 chief-role holder on EM_RES_VAC works 13', () => {
    const r = { category: 'EM_HOME', pgy: 1, chiefRole: 'academic', blockType: 'EM_RES_VAC' };
    expect(getShiftTarget(r)).toBe(13);
  });

  it('a chief on a NON-vacation rotation still gets the flat 16', () => {
    const r = { category: 'EM_HOME', pgy: 3, chiefRole: 'scheduling', blockType: 'EM' };
    expect(getShiftTarget(r)).toBe(16);
  });

  it('a Settings CHIEF override is ignored when the vacation-block target applies', () => {
    const r = { category: 'EM_HOME', pgy: 3, chiefRole: 'scheduling', blockType: 'EM_VAC' };
    expect(getShiftTarget(r, { targetOverrides: { CHIEF: 99 } })).toBe(11);
  });

  it('a non-chief resident on a vacation block is unaffected by this change (unchanged path)', () => {
    const r = { category: 'EM_HOME', pgy: 3, blockType: 'EM_VAC' };
    expect(getShiftTarget(r)).toBe(11);
  });
});

describe('1.11 offServiceWindowTargetDelta', () => {
  it('returns null for EM_HOME/EM_BAMC (not applicable)', () => {
    const r = { category: 'EM_HOME', pgy: 1, availabilityMode: 'ranges', availableRanges: [{ start: '2026-07-01', end: '2026-07-10' }] };
    expect(offServiceWindowTargetDelta(r, block, [])).toBeNull();
  });

  it('returns null when availabilityMode is not "ranges"', () => {
    const r = { category: 'POD', pgy: 1, availabilityMode: 'full', availableRanges: [] };
    expect(offServiceWindowTargetDelta(r, block, [])).toBeNull();
  });

  it('returns null when the window is fully inside this block (full obligation)', () => {
    const r = {
      category: 'POD', pgy: 1, availabilityMode: 'ranges',
      availableRanges: [{ start: '2026-07-10', end: '2026-07-23' }],
    };
    expect(offServiceWindowTargetDelta(r, block, [])).toBeNull();
  });

  it('podiatry cross-block case: 3 shifts already worked in the prior block, 14-day window split 7/7 -> effective target 11 (delta -3)', () => {
    const r = {
      id: 'pod1', firstName: 'Pat', lastName: 'Odiatry', category: 'POD', pgy: 1,
      availabilityMode: 'ranges',
      availableRanges: [{ start: '2026-06-29', end: '2026-07-12' }], // 14 days: 7 in prior block, 7 in this one
    };
    const priorBlock = {
      data: {
        startDate: '2026-06-08', endDate: '2026-07-05',
        offServiceResidents: [{ id: 'pod1', firstName: 'Pat', lastName: 'Odiatry', category: 'POD', pgy: 1 }],
        schedule: { pod1: { '2026-07-01': 'POD-D', '2026-07-02': 'POD-D', '2026-07-03': 'POD-D' } },
      },
    };
    const delta = offServiceWindowTargetDelta(r, block, [priorBlock]);
    expect(delta).toBe(-3); // base 14 (POD_1) -> effective 11
  });

  it('falls back to name matching when the off-service id differs across blocks (ids are per-block uuids)', () => {
    const r = {
      id: 'pod2-new-uuid', firstName: 'Pat', lastName: 'Odiatry', category: 'POD', pgy: 1,
      availabilityMode: 'ranges',
      availableRanges: [{ start: '2026-06-29', end: '2026-07-12' }],
    };
    const priorBlock = {
      data: {
        startDate: '2026-06-08', endDate: '2026-07-05',
        offServiceResidents: [{ id: 'pod2-old-uuid', firstName: 'Pat', lastName: 'Odiatry', category: 'POD', pgy: 1 }],
        schedule: { 'pod2-old-uuid': { '2026-07-01': 'POD-D', '2026-07-02': 'POD-D' } },
      },
    };
    const delta = offServiceWindowTargetDelta(r, block, [priorBlock]);
    expect(delta).toBe(-2); // base 14 -> effective 12 (2 already worked, matched by name not id)
  });

  it('PEDS with a genuinely ~2-week overlap and no history clamps the pro-rated target into [7,8]', () => {
    const r = {
      id: 'peds1', category: 'PEDS', pgy: 2, availabilityMode: 'ranges',
      // 28-day window, exactly half (14 days) inside this block.
      availableRanges: [{ start: '2026-06-22', end: '2026-07-19' }],
    };
    const delta = offServiceWindowTargetDelta(r, block, []);
    expect(delta).not.toBeNull();
    const effective = 15 + delta; // base PEDS_2/3 = 15
    expect(effective).toBeGreaterThanOrEqual(7);
    expect(effective).toBeLessThanOrEqual(8);
  });

  it('PEDS with only a small sliver of overlap is NOT forced into the [7,8] clamp', () => {
    const r = {
      id: 'peds2', category: 'PEDS', pgy: 3, availabilityMode: 'ranges',
      // 34-day window, only 4 days overlap this block (07-06..07-09) — ratio ~0.12, well below
      // the ~half-window band the [7,8] clamp is scoped to.
      availableRanges: [{ start: '2026-06-06', end: '2026-07-09' }],
    };
    const delta = offServiceWindowTargetDelta(r, block, []);
    const effective = 15 + delta;
    expect(effective).toBeLessThan(7);
  });
});
