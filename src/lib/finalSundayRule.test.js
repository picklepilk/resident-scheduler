/** @vitest-environment jsdom */
// src/lib/finalSundayRule.test.js
// Unit tests for the chief-directed "final-Sunday overnight transition" rule (CLAUDE.md 1.12):
// a resident may work an overnight on the block's own FINAL Sunday only if they continue on a
// schedulable EM rotation next block (the night run can roll onward) — anyone rotating to a
// different service must not work that final-Sunday overnight. Imports the real
// ResidentScheduler.jsx under jsdom, same pattern as grRestRules.test.js/generator.harness.test.js
// (verified import-safe there already).
import { describe, it, expect } from 'vitest';
import { getEligibleShifts, validateAll, nextBlockRotationFor, finalSundayOf } from '../ResidentScheduler.jsx';
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

// 2026-10-30 (chief + PD): the final-Sunday overnight RULE was REMOVED. EM Home residents may start
// a night shift on the block's final Sunday regardless of where they rotate next block. The
// finalSundayOf/nextBlockRotationFor helpers above stay as inert, still-tested utilities.
describe('final-Sunday night start is ALLOWED (rule removed 2026-10-30)', () => {
  it.each([
    ['continuing EM', [nextSnapshot('EM')]],
    ['moving to a non-schedulable rotation', [nextSnapshot('METRO')]],
    ['absent from next block', [nextSnapshot(null)]],
    ['next block unknown', []],
  ])('getEligibleShifts keeps night eligibility on the final Sunday (%s)', (_label, history) => {
    const { fixture, papa } = papaFixture();
    const nextRotation = nextBlockRotationFor(papa, fixture.block, history);
    const elig = getEligibleShifts(papa, FINAL_SUNDAY, {}, {}, {}, {}, {
      blockStart: fixture.block.startDate, finalSunday: FINAL_SUNDAY, nextRotation,
    });
    expect(elig).toContain('TRAUMA-N');
  });

  it.each([
    ['moving off EM', [nextSnapshot('METRO')]],
    ['next block not imported', []],
  ])('validateAll raises no final-Sunday issue for an overnight on the final Sunday (%s)', (_label, history) => {
    const { fixture, papa } = papaFixture();
    const schedule = { [papa.id]: { [FINAL_SUNDAY]: 'TRAUMA-N' } };
    const issues = validateAll(
      fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
      fixture.appSettings, fixture.dayRules, fixture.coverage, history, fixture.ayConf
    );
    expect(issues.some(i => i.residentId === papa.id && i.dateStr === FINAL_SUNDAY
      && (i.rule === 'finalSundayOvernight' || /Final-Sunday overnight|next block not imported/.test(i.message)))).toBe(false);
  });
});
