/** @vitest-environment jsdom */
// src/lib/finalSundayRule.test.js
// Unit tests for the chief-directed "final-Sunday overnight transition" rule (CLAUDE.md 1.12):
// a resident may work an overnight on the block's own FINAL Sunday only if they continue on a
// schedulable EM rotation next block (the night run can roll onward) — anyone rotating to a
// different service must not work that final-Sunday overnight. Imports the real
// ResidentScheduler.jsx under jsdom, same pattern as grRestRules.test.js/generator.harness.test.js
// (verified import-safe there already).
import { describe, it, expect } from 'vitest';
import { getEligibleShifts, validateAll, nextBlockRotationFor, finalSundayOf, eligibilityBlockReasons, noSundayNightBeforeList } from '../ResidentScheduler.jsx';
import { isNightShiftId } from './shifts.js';
import { OVERRIDE_TIER_RULE_IDS } from './rulePolicy.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

// syntheticRoster's fixed block window: 2026-07-06 (Mon) .. 2026-08-02 (Sun) — the block's own
// last date IS a Sunday, so it doubles as the "final Sunday" for every test below.
const FINAL_SUNDAY = '2026-08-02';
// The block's FIRST Sunday — a Sunday that is emphatically not the final one, used for the
// "non-final Sundays unaffected" checks.
const NON_FINAL_SUNDAY = '2026-07-12';
// The day immediately after the block ends — where an abutting next-block snapshot must start
// for findNextBlockSnapshot to pick it up.
const NEXT_BLOCK_START = '2026-08-03';
const NEXT_BLOCK_END = '2026-08-30';

// Papa (EM_HOME PGY-3, no special date-chip data) is eligible for TRAUMA-N on Sunday under the
// default eligibility matrix/dayRules (Trauma Night window is Fri/Sat/Sun/Mon — see RULE_NOTES).
function papaFixture() {
  const fixture = makeFixture('standard');
  const papa = fixture.allResidents.find(r => r.id === 'syn_papa');
  return { fixture, papa };
}

function nextSnapshot(blockType) {
  return {
    id: 'blk_fixture_next',
    startDate: NEXT_BLOCK_START,
    endDate: NEXT_BLOCK_END,
    savedAt: '2026-08-01T00:00:00.000Z',
    published: true,
    data: {
      // Absent entry (blockType undefined, key omitted) models "not in the next snapshot's
      // assignments at all" (off-service, BAMC never added) — known:true, continuingEM:false.
      emBlockAssignments: blockType ? { syn_papa: { blockType } } : {},
    },
  };
}

describe('finalSundayOf', () => {
  it('returns the block\'s own end date when the block ends on a Sunday', () => {
    expect(finalSundayOf({ startDate: '2026-07-06', endDate: '2026-08-02' })).toBe('2026-08-02');
  });

  it('returns null when the block ends on a non-Sunday weekday, even though an earlier Sunday exists inside the block', () => {
    // 2026-08-05 is a Wednesday; the previous Sunday (2026-08-02) sits mid-block with several
    // more in-block days after it, so a night shift there does not span the block boundary at
    // all — the prior bug here returned that mid-block Sunday as if it were "the final Sunday".
    expect(finalSundayOf({ startDate: '2026-07-06', endDate: '2026-08-05' })).toBeNull();
  });

  it('returns null when the block has no startDate/endDate', () => {
    expect(finalSundayOf({})).toBeNull();
    expect(finalSundayOf({ startDate: '2026-07-06' })).toBeNull();
    expect(finalSundayOf({ endDate: '2026-08-02' })).toBeNull();
  });

  it('returns the end date even for a block shorter than a week, as long as it ends on Sunday', () => {
    expect(finalSundayOf({ startDate: '2026-07-27', endDate: '2026-08-02' })).toBe('2026-08-02');
  });
});

describe('nextBlockRotationFor', () => {
  it('known:false when no abutting next-block snapshot exists', () => {
    const { fixture, papa } = papaFixture();
    const r = nextBlockRotationFor(papa, fixture.block, []);
    expect(r).toEqual({ known: false, blockType: null, continuingEM: false });
  });

  it('continuingEM:true when the next snapshot has the resident on a schedulable EM rotation', () => {
    const { fixture, papa } = papaFixture();
    const r = nextBlockRotationFor(papa, fixture.block, [nextSnapshot('EM')]);
    expect(r).toEqual({ known: true, blockType: 'EM', continuingEM: true });
  });

  it('continuingEM:false when the resident is on a non-schedulable rotation next block', () => {
    const { fixture, papa } = papaFixture();
    // METRO is a real BLOCK_TYPES_EM id with schedulable:false (see EM_HOME_3 notes).
    const r = nextBlockRotationFor(papa, fixture.block, [nextSnapshot('METRO')]);
    expect(r).toEqual({ known: true, blockType: 'METRO', continuingEM: false });
  });

  it('continuingEM:false when the resident is simply absent from next snapshot\'s assignments', () => {
    const { fixture, papa } = papaFixture();
    const r = nextBlockRotationFor(papa, fixture.block, [nextSnapshot(null)]);
    expect(r).toEqual({ known: true, blockType: null, continuingEM: false });
  });
});

// Re-enabled 2026-11-18 (program decision, configurable): an EM Home resident who STARTS a selected
// rotation next block may not work an overnight on the block's final Sunday.
function ctxFor(fixture, papa, history, extra = {}) {
  return {
    blockStart: fixture.block.startDate, finalSunday: FINAL_SUNDAY,
    nextRotation: nextBlockRotationFor(papa, fixture.block, history), ...extra,
  };
}
const elig = (papa, ds, ctx, appSettings = {}) => getEligibleShifts(papa, ds, {}, {}, appSettings, {}, ctx);

describe('final-Sunday overnight rule (configurable, 2026-11-18)', () => {
  it('strips every night shift on the final Sunday when next block = EM/EMS', () => {
    const { fixture, papa } = papaFixture();
    const list = elig(papa, FINAL_SUNDAY, ctxFor(fixture, papa, [nextSnapshot('EM_EMS')]));
    expect(list).not.toContain('TRAUMA-N');
    expect(list.some(isNightShiftId)).toBe(false);
  });

  it('keeps night eligibility when next block = EM (not selected)', () => {
    const { fixture, papa } = papaFixture();
    expect(elig(papa, FINAL_SUNDAY, ctxFor(fixture, papa, [nextSnapshot('EM')]))).toContain('TRAUMA-N');
  });

  it('does not strip on a non-final Sunday', () => {
    const { fixture, papa } = papaFixture();
    expect(elig(papa, NON_FINAL_SUNDAY, ctxFor(fixture, papa, [nextSnapshot('EM_EMS')]))).toContain('TRAUMA-N');
  });

  it('custom empty list disables the rule; saved list replaces the default; bad shape falls back', () => {
    const { fixture, papa } = papaFixture();
    const ctx = ctxFor(fixture, papa, [nextSnapshot('EM_EMS')]);
    expect(elig(papa, FINAL_SUNDAY, ctx, { noSundayNightBeforeRotations: [] })).toContain('TRAUMA-N');
    expect(elig(papa, FINAL_SUNDAY, ctx, { noSundayNightBeforeRotations: ['EM_TOX'] })).toContain('TRAUMA-N');
    expect(elig(papa, FINAL_SUNDAY, ctx, { noSundayNightBeforeRotations: ['EM_EMS'] })).not.toContain('TRAUMA-N');
    expect(noSundayNightBeforeList({ noSundayNightBeforeRotations: 'nope' })).toContain('EM_EMS');
    expect(noSundayNightBeforeList({ noSundayNightBeforeRotations: ['EM_EMS', 'BOGUS', 'EM_EMS', 7] })).toEqual(['EM_EMS']);
    expect(noSundayNightBeforeList({})).toEqual(expect.arrayContaining(['EM_EMS', 'EM_TOX', 'US_EM', 'TRAUMA_PEDS', 'PEDS_TRAUMA', 'METRO', '9ICU']));
    expect(noSundayNightBeforeList({})).toHaveLength(16);
    expect(noSundayNightBeforeList({})).not.toContain('EM');
  });

  it('unknown next block does not strip', () => {
    const { fixture, papa } = papaFixture();
    expect(elig(papa, FINAL_SUNDAY, ctxFor(fixture, papa, []))).toContain('TRAUMA-N');
  });

  it('non-EM_HOME residents are unaffected', () => {
    const { fixture, papa } = papaFixture();
    const other = { ...papa, category: 'BAMC' };
    const ctx = ctxFor(fixture, papa, [nextSnapshot('EM_EMS')]);
    expect(getEligibleShifts(other, FINAL_SUNDAY, {}, {}, {}, {}, ctx)).toEqual(
      getEligibleShifts(other, FINAL_SUNDAY, {}, {}, {}, {}, { ...ctx, finalSunday: null }));
  });

  it('eligibilityBlockReasons names the override-tier rule and next rotation', () => {
    const { fixture, papa } = papaFixture();
    const reason = eligibilityBlockReasons(papa, FINAL_SUNDAY, 'TRAUMA-N', { ...ctxFor(fixture, papa, [nextSnapshot('METRO')]) });
    expect(reason).toMatchObject({ rule: 'finalSundayOvernight', tier: 'override', nextLabel: 'Metro' });
  });

  it('validateAll raises an override-tier finalSundayOvernight issue for a hand-placed night when next = METRO', () => {
    const { fixture, papa } = papaFixture();
    const schedule = { [papa.id]: { [FINAL_SUNDAY]: 'TRAUMA-N' } };
    const issues = validateAll(fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
      fixture.appSettings, fixture.dayRules, fixture.coverage, [nextSnapshot('METRO')], fixture.ayConf);
    const hit = issues.find(i => i.residentId === papa.id && i.dateStr === FINAL_SUNDAY && i.rule === 'finalSundayOvernight');
    expect(hit).toBeTruthy();
    expect(hit.message).toContain('Metro');
    expect(OVERRIDE_TIER_RULE_IDS).toContain('finalSundayOvernight');
  });

  it('validateAll only warns (no strip, no ack issue) when the next block is not entered', () => {
    const { fixture, papa } = papaFixture();
    const schedule = { [papa.id]: { [FINAL_SUNDAY]: 'TRAUMA-N' } };
    const issues = validateAll(fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
      fixture.appSettings, fixture.dayRules, fixture.coverage, [], fixture.ayConf);
    const mine = issues.filter(i => i.residentId === papa.id && i.dateStr === FINAL_SUNDAY);
    expect(mine.some(i => i.rule === 'finalSundayOvernight')).toBe(false);
    const warn = mine.find(i => i.rule === 'finalSundayNextBlockUnknown');
    expect(warn).toMatchObject({ level: 'warn' });
    expect(warn.message).toMatch(/^Next block not entered; check whether /);
  });

  it('no issue when next block = EM', () => {
    const { fixture, papa } = papaFixture();
    const schedule = { [papa.id]: { [FINAL_SUNDAY]: 'TRAUMA-N' } };
    const issues = validateAll(fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
      fixture.appSettings, fixture.dayRules, fixture.coverage, [nextSnapshot('EM')], fixture.ayConf);
    expect(issues.some(i => i.residentId === papa.id && i.dateStr === FINAL_SUNDAY
      && /finalSunday/.test(i.rule || ''))).toBe(false);
  });
});
