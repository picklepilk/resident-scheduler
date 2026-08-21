/** @vitest-environment jsdom */
// src/lib/jeopardyFill.test.js
// Unit tests for fillJeopardy (Jeopardy auto-fill — see CLAUDE.md "JEOPARDY AUTO-FILL"). Lives
// under src/lib/ following the generator.harness.test.js pattern: fillJeopardy/validateAll are
// exported named exports of ResidentScheduler.jsx (verified import-safe under jsdom), and the
// logic genuinely belongs to that file (candidate rotation ids, block-shape helpers) so it isn't
// worth extracting a parallel lib module just to get a "pure" test file.
import { describe, it, expect } from 'vitest';
import { fillJeopardy, validateAll, isJeopardyDate } from '../ResidentScheduler.jsx';

// Minimal EM_HOME resident factory — mirrors the field set __fixtures__/syntheticRoster.js proved
// safe to hand to validateAll/getEligibleShifts without crashing on an undefined array access.
function makeResident(overrides) {
  return {
    id: overrides.id,
    firstName: overrides.firstName,
    lastName: 'TestResident',
    category: 'EM_HOME',
    pgy: overrides.pgy,
    blockType: overrides.blockType,
    isCCUNights: false,
    chiefRole: null,
    approvedDatesOff: overrides.approvedDatesOff ?? [],
    vacationDates: overrides.vacationDates ?? [],
    jeopardyDates: overrides.jeopardyDates ?? [],
    jcPresentDates: [],
    grLectureDates: [],
    availabilityMode: 'full',
    availableRanges: [],
    canWorkDates: [],
  };
}

const DATES6 = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11'];
const BLOCK_START = DATES6[0];
const BLOCK_END = DATES6[DATES6.length - 1];

function makeBlock(overrides = {}) {
  return {
    id: 'blk_test',
    startDate: BLOCK_START,
    endDate: BLOCK_END,
    schedule: {},
    jeopardySchedule: { pgy1: {}, pgy2: {}, pgy3: {} },
    metroJeopardyRanges: [],
    emBlockAssignments: {},
    ...overrides,
  };
}

describe('fillJeopardy — pgy1 balance across candidates, respecting vacation', () => {
  it('balances counts across all pgy1 candidates and never assigns a resident on their own vacation date', () => {
    const a = makeResident({ id: 'p1_a', pgy: 1, blockType: 'ORTHO_VAC', vacationDates: [DATES6[0], DATES6[1]] });
    const b = makeResident({ id: 'p1_b', pgy: 1, blockType: 'ANES_VAC' });
    const c = makeResident({ id: 'p1_c', pgy: 1, blockType: 'ORTHO_VAC' });
    const block = makeBlock();

    const { jeopardySchedule, unfilled } = fillJeopardy(block, [a, b, c]);

    // pgy2/pgy3 legitimately report noCandidates (no candidates for those tracks in this fixture)
    // — only pgy1 (the track under test) should have zero gaps.
    expect(unfilled.filter(u => u.track === 'pgy1')).toEqual([]);
    // Every one of the 6 dates got someone.
    expect(Object.keys(jeopardySchedule.pgy1)).toHaveLength(6);
    // Never on a's own vacation dates.
    expect(jeopardySchedule.pgy1[DATES6[0]]).not.toBe('p1_a');
    expect(jeopardySchedule.pgy1[DATES6[1]]).not.toBe('p1_a');
    // Deterministic, exact-count balance (worked out by hand against the tie-break rule: lowest
    // running count, then lowest blockType-group running count, then resident id).
    const counts = { p1_a: 0, p1_b: 0, p1_c: 0 };
    for (const rid of Object.values(jeopardySchedule.pgy1)) counts[rid]++;
    expect(counts).toEqual({ p1_a: 2, p1_b: 2, p1_c: 2 });
  });
});

describe('fillJeopardy — a candidate already working a shift that date is never picked (hard rule, all tracks)', () => {
  it('picks the candidate with no shift that date over one who is scheduled', () => {
    const x = makeResident({ id: 'p2_x', pgy: 2, blockType: 'EM_EMS' });
    const y = makeResident({ id: 'p2_y', pgy: 2, blockType: 'EM_TOX' });
    const block = makeBlock({ schedule: { p2_x: { [DATES6[0]]: 'POD-D' } } }); // x is working date 0

    const { jeopardySchedule } = fillJeopardy(block, [x, y]);

    expect(jeopardySchedule.pgy2[DATES6[0]]).toBe('p2_y'); // y is free that date, x is hard-excluded
  });

  it('never assigns the only candidate when they are already scheduled that date — reports allScheduled instead', () => {
    const x = makeResident({ id: 'p2_x', pgy: 2, blockType: 'EM_EMS' });
    const block = makeBlock({ schedule: { p2_x: { [DATES6[0]]: 'POD-D' } } }); // only candidate, and busy

    const { jeopardySchedule, unfilled } = fillJeopardy(block, [x]);

    expect(jeopardySchedule.pgy2[DATES6[0]]).toBeUndefined();
    const gap = unfilled.find(u => u.track === 'pgy2' && u.date === DATES6[0]);
    expect(gap?.reason).toBe('allScheduled');
  });

  it('still fills normally on a date where the sole candidate is free', () => {
    const x = makeResident({ id: 'p2_x', pgy: 2, blockType: 'EM_EMS' });
    const block = makeBlock({ schedule: { p2_x: { [DATES6[0]]: 'POD-D' } } }); // busy date 0 only

    const { jeopardySchedule, unfilled } = fillJeopardy(block, [x]);

    expect(jeopardySchedule.pgy2[DATES6[1]]).toBe('p2_x'); // free on date 1, fills normally
    expect(unfilled.filter(u => u.track === 'pgy2' && u.date === DATES6[1])).toEqual([]);
  });
});

describe('fillJeopardy — pgy3 skips metroJeopardyRanges dates', () => {
  it('leaves metro-covered dates empty and never reports them as unfilled', () => {
    const m = makeResident({ id: 'p3_m', pgy: 3, blockType: 'ADMIN' });
    const block = makeBlock({ metroJeopardyRanges: [{ start: DATES6[2], end: DATES6[3] }] });

    const { jeopardySchedule, unfilled } = fillJeopardy(block, [m]);

    expect(jeopardySchedule.pgy3[DATES6[2]]).toBeUndefined();
    expect(jeopardySchedule.pgy3[DATES6[3]]).toBeUndefined();
    expect(jeopardySchedule.pgy3[DATES6[0]]).toBe('p3_m');
    expect(jeopardySchedule.pgy3[DATES6[4]]).toBe('p3_m');
    // pgy1/pgy2 legitimately report noCandidates here (no candidates for those tracks) — pgy3
    // itself (the track under test) should have zero gaps: metro-covered dates are not "unfilled".
    expect(unfilled.filter(u => u.track === 'pgy3')).toEqual([]);
  });
});

describe('fillJeopardy — preserves existing manual cells', () => {
  it('never overwrites a pre-existing cell, even one pointing at a non-candidate id', () => {
    const a = makeResident({ id: 'p1_a', pgy: 1, blockType: 'ORTHO_VAC' });
    const block = makeBlock({ jeopardySchedule: { pgy1: { [DATES6[0]]: 'hand_typed_id' }, pgy2: {}, pgy3: {} } });

    const { jeopardySchedule } = fillJeopardy(block, [a]);

    expect(jeopardySchedule.pgy1[DATES6[0]]).toBe('hand_typed_id'); // untouched
    expect(jeopardySchedule.pgy1[DATES6[1]]).toBe('p1_a'); // other dates still filled
  });

  it('running a second fill on an already-filled schedule is a no-op (idempotent)', () => {
    const a = makeResident({ id: 'p1_a', pgy: 1, blockType: 'ORTHO_VAC' });
    const b = makeResident({ id: 'p1_b', pgy: 1, blockType: 'ANES_VAC' });
    const block = makeBlock();
    const first = fillJeopardy(block, [a, b]);
    const second = fillJeopardy({ ...block, jeopardySchedule: first.jeopardySchedule }, [a, b]);
    // Schedule (and the pgy1 track's own unfilled — pgy2/pgy3 have no candidates in this fixture,
    // so they legitimately report noCandidates on every date both times) is unchanged re-run.
    expect(second.jeopardySchedule).toEqual(first.jeopardySchedule);
    expect(second.unfilled.filter(u => u.track === 'pgy1')).toEqual([]);
    expect(second.unfilled).toEqual(first.unfilled);
  });
});

describe('fillJeopardy — unfilled reasons', () => {
  it('reports noCandidates for every date when nobody on the roster qualifies for a track', () => {
    const offTrackResident = makeResident({ id: 'not_a_candidate', pgy: 1, blockType: 'EM' }); // not ORTHO_VAC/ANES_VAC
    const block = makeBlock();

    const { unfilled } = fillJeopardy(block, [offTrackResident]);

    const pgy1Unfilled = unfilled.filter(u => u.track === 'pgy1');
    expect(pgy1Unfilled).toHaveLength(DATES6.length);
    expect(pgy1Unfilled.every(u => u.reason === 'noCandidates')).toBe(true);
  });

  it('reports allUnavailable when every candidate is on vacation that date', () => {
    const a = makeResident({ id: 'p2_a', pgy: 2, blockType: 'EM_EMS', vacationDates: [...DATES6] });
    const block = makeBlock();

    const { unfilled } = fillJeopardy(block, [a]);

    const pgy2Unfilled = unfilled.filter(u => u.track === 'pgy2');
    expect(pgy2Unfilled).toHaveLength(DATES6.length);
    expect(pgy2Unfilled.every(u => u.reason === 'allUnavailable')).toBe(true);
  });

  it('reports allScheduled (distinct from allUnavailable) when every candidate is off-duty-eligible but already working that date', () => {
    const a = makeResident({ id: 'p2_a', pgy: 2, blockType: 'EM_EMS' });
    const b = makeResident({ id: 'p2_b', pgy: 2, blockType: 'EM_TOX' });
    const block = makeBlock({ schedule: {
      p2_a: { [DATES6[0]]: 'POD-D' },
      p2_b: { [DATES6[0]]: 'MT-N' },
    } });

    const { jeopardySchedule, unfilled } = fillJeopardy(block, [a, b]);

    expect(jeopardySchedule.pgy2[DATES6[0]]).toBeUndefined();
    const gap = unfilled.find(u => u.track === 'pgy2' && u.date === DATES6[0]);
    expect(gap?.reason).toBe('allScheduled');
  });
});

describe('validateAll — jeopardySchedule union with resident.jeopardyDates', () => {
  it('flags (as a hard error, under default warn policy) a resident scheduled for a shift on a date they are on the jeopardySchedule track, not just resident.jeopardyDates', () => {
    const onCall = makeResident({ id: 'p3_admin', pgy: 3, blockType: 'ADMIN' });
    const block = makeBlock({
      schedule: { p3_admin: { [DATES6[0]]: 'POD-D' } },
      jeopardySchedule: { pgy1: {}, pgy2: {}, pgy3: { [DATES6[0]]: 'p3_admin' } }, // via track, not resident.jeopardyDates
    });

    const issues = validateAll([onCall], block.schedule, block, {}, {}, {}, {}, [], {});

    // Escalated: a clinical shift on a jeopardy date is now a hard error under 'warn' policy too
    // (only 'off' stays silent) — see CLAUDE.md "may never land on a date the resident already
    // works clinically".
    const jeopardyIssue = issues.find(i => i.residentId === 'p3_admin' && i.dateStr === DATES6[0] && /jeopardy/i.test(i.message));
    expect(jeopardyIssue).toBeTruthy();
    expect(jeopardyIssue.level).toBe('error');
  });
});

describe('isJeopardyDate — off-service residents can never be on jeopardy (read-time category guard)', () => {
  it('returns false for an off-service resident (e.g. PEDS) even with a populated jeopardyDates field', () => {
    const offService = makeResident({ id: 'peds_1', pgy: 1, blockType: 'EM' });
    offService.category = 'PEDS';
    offService.jeopardyDates = [DATES6[0]];

    expect(isJeopardyDate(offService, DATES6[0], { pgy1: {}, pgy2: {}, pgy3: {} })).toBe(false);
    // Also ignores a jeopardySchedule track pointing at them (shouldn't be possible via
    // jeopardyCandidatesFor, but the guard is unconditional either way).
    expect(isJeopardyDate(offService, DATES6[0], { pgy1: { [DATES6[0]]: 'peds_1' }, pgy2: {}, pgy3: {} })).toBe(false);
  });

  it('is unaffected for EM_HOME and EM_BAMC residents', () => {
    const home = makeResident({ id: 'home_1', pgy: 3, blockType: 'ADMIN', jeopardyDates: [DATES6[0]] });
    expect(isJeopardyDate(home, DATES6[0], { pgy1: {}, pgy2: {}, pgy3: {} })).toBe(true);

    const bamc = makeResident({ id: 'bamc_1', pgy: 3, blockType: 'ADMIN', jeopardyDates: [DATES6[0]] });
    bamc.category = 'EM_BAMC';
    expect(isJeopardyDate(bamc, DATES6[0], { pgy1: {}, pgy2: {}, pgy3: {} })).toBe(true);
  });
});
