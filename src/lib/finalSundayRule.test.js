/** @vitest-environment jsdom */
// src/lib/finalSundayRule.test.js
// Unit tests for the chief-directed "final-Sunday overnight transition" rule (CLAUDE.md 1.12):
// a resident may work an overnight on the block's own FINAL Sunday only if they continue on a
// schedulable EM rotation next block (the night run can roll onward) — anyone rotating to a
// different service must not work that final-Sunday overnight. Imports the real
// ResidentScheduler.jsx under jsdom, same pattern as grRestRules.test.js/generator.harness.test.js
// (verified import-safe there already).
import { describe, it, expect } from 'vitest';
import { getEligibleShifts, validateAll, nextBlockRotationFor } from '../ResidentScheduler.jsx';
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

describe('getEligibleShifts — final-Sunday night-shift strip', () => {
  it('continuing-EM resident KEEPS night eligibility on the final Sunday', () => {
    const { fixture, papa } = papaFixture();
    const nextRotation = nextBlockRotationFor(papa, fixture.block, [nextSnapshot('EM')]);
    const elig = getEligibleShifts(papa, FINAL_SUNDAY, {}, {}, {}, {}, {
      blockStart: fixture.block.startDate, finalSunday: FINAL_SUNDAY, nextRotation,
    });
    expect(elig).toContain('TRAUMA-N');
  });

  it('non-continuing resident LOSES night eligibility on the final Sunday', () => {
    const { fixture, papa } = papaFixture();
    const nextRotation = nextBlockRotationFor(papa, fixture.block, [nextSnapshot('METRO')]);
    const elig = getEligibleShifts(papa, FINAL_SUNDAY, {}, {}, {}, {}, {
      blockStart: fixture.block.startDate, finalSunday: FINAL_SUNDAY, nextRotation,
    });
    expect(elig).not.toContain('TRAUMA-N');
    expect(elig.every(s => s !== 'TRAUMA-N')).toBe(true);
  });

  it('unknown next block does NOT strip night eligibility (generation stays warn-only)', () => {
    const { fixture, papa } = papaFixture();
    const nextRotation = nextBlockRotationFor(papa, fixture.block, []); // known:false
    const elig = getEligibleShifts(papa, FINAL_SUNDAY, {}, {}, {}, {}, {
      blockStart: fixture.block.startDate, finalSunday: FINAL_SUNDAY, nextRotation,
    });
    expect(elig).toContain('TRAUMA-N');
  });

  it('non-final Sundays are unaffected even for a non-continuing resident', () => {
    const { fixture, papa } = papaFixture();
    const nextRotation = nextBlockRotationFor(papa, fixture.block, [nextSnapshot('METRO')]);
    const elig = getEligibleShifts(papa, NON_FINAL_SUNDAY, {}, {}, {}, {}, {
      blockStart: fixture.block.startDate, finalSunday: FINAL_SUNDAY, nextRotation,
    });
    expect(elig).toContain('TRAUMA-N');
  });
});

describe('validateAll — final-Sunday overnight transition', () => {
  function runValidate(fixture, papa, rs, blocksHistory) {
    const schedule = { [papa.id]: rs };
    const issues = validateAll(
      fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
      fixture.appSettings, fixture.dayRules, fixture.coverage, blocksHistory, fixture.ayConf
    );
    return issues.filter(i => i.residentId === papa.id && i.dateStr === FINAL_SUNDAY);
  }

  it('errors when the resident is known to NOT continue on a schedulable EM rotation', () => {
    const { fixture, papa } = papaFixture();
    const issues = runValidate(fixture, papa, { [FINAL_SUNDAY]: 'TRAUMA-N' }, [nextSnapshot('METRO')]);
    expect(issues.some(i => i.level === 'error' && /Final-Sunday overnight/.test(i.message))).toBe(true);
  });

  it('does NOT error when the resident continues on a schedulable EM rotation next block', () => {
    const { fixture, papa } = papaFixture();
    const issues = runValidate(fixture, papa, { [FINAL_SUNDAY]: 'TRAUMA-N' }, [nextSnapshot('EM')]);
    expect(issues.some(i => /Final-Sunday overnight/.test(i.message))).toBe(false);
  });

  it('warns (not errors) when the next block has not been saved/imported yet', () => {
    const { fixture, papa } = papaFixture();
    const issues = runValidate(fixture, papa, { [FINAL_SUNDAY]: 'TRAUMA-N' }, []);
    expect(issues.some(i => i.level === 'warn' && /next block not imported/.test(i.message))).toBe(true);
    expect(issues.some(i => i.level === 'error' && /Final-Sunday overnight/.test(i.message))).toBe(false);
  });

  it('non-final Sundays raise no final-Sunday issue regardless of next-block continuation', () => {
    const { fixture, papa } = papaFixture();
    const schedule = { [papa.id]: { [NON_FINAL_SUNDAY]: 'TRAUMA-N' } };
    const issues = validateAll(
      fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
      fixture.appSettings, fixture.dayRules, fixture.coverage, [nextSnapshot('METRO')], fixture.ayConf
    );
    expect(issues.some(i => i.residentId === papa.id && /Final-Sunday overnight|next block not imported/.test(i.message))).toBe(false);
  });
});
