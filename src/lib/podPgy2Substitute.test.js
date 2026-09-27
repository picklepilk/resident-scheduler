// src/lib/podPgy2Substitute.test.js
// R5 (2026-09-27 chief decision, memory rule-override-policy): "During those rare instances [PGY-3s
// at conference or on Wellness day] they should be replaced with a PGY-2." POD's hard PGY-3
// requirement (SENIOR_COMPOSITION.POD, see ResidentScheduler.jsx) already accepts that substitute via
// compositionSatisfies/seniorWellnessSubstituteAllowed — this file covers the NEW pieces layered on
// top: pool-narrowing that always prefers a genuine PGY-3 when one is actually available, the
// informational (never blocking) podPgy2Substitute validateAll warn, and the generator's
// report.podSubstitutes[] log. Mirrors emCompositionAndPgyGating.test.js's own hand-built-resident/
// fixed-block pattern (same file's Wellness-Wednesday date constants) rather than reinventing one.
import { describe, it, expect } from 'vitest';
import { validateAll, generateSchedule, getEligibleShifts } from '../ResidentScheduler.jsx';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

function res(overrides) {
  return {
    id: overrides.id, firstName: overrides.firstName ?? 'Test', lastName: 'Resident',
    category: overrides.category, pgy: overrides.pgy,
    blockType: overrides.blockType, chiefRole: overrides.chiefRole ?? null,
    approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [],
  };
}

// Same fixed block window as seniorityTargets.test.js/emCompositionAndPgyGating.test.js — 1st Wed on
// or after start = 2026-07-08, 2nd (FLEX's own WW) = 2026-07-15, 3rd (POD's own WW) = 2026-07-22.
const block = { id: 'blk_test', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const POD_WW = '2026-07-22';
const ORDINARY_DAY = '2026-07-09'; // Thursday — not exempt, not Wellness Wednesday; inside ACEP_CONF below
const NON_CONFERENCE_DAY = '2026-07-13'; // Monday — clear of both ACEP_CONF and POD_WW
// Thu-Fri, deliberately clear of POD_WW (2026-07-22) so 'conference' and 'wellness' reasons stay
// unambiguous in these tests (a real block CAN have both land on the same date — see
// substituteReasonFor's own comment on that overlap — just not exercised here).
const ACEP_CONF = { acepStart: '2026-07-09', acepEnd: '2026-07-10' };

function issuesFor(allResidents, schedule, ayConf = {}) {
  return validateAll(allResidents, schedule, block, {}, {}, {}, {}, [], ayConf);
}

describe('R5: POD PGY-2 substitute for an unavailable PGY-3 — validateAll', () => {
  it('conference date, no PGY-3 anywhere: EM PGY-2 alone on POD gets the info warn, not the hard error', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p2: { [ORDINARY_DAY]: 'POD-D' } };
    const issues = issuesFor([pgy2], schedule, ACEP_CONF);
    expect(issues.filter(i => i.rule === 'podPgy3Composition')).toEqual([]);
    const infoWarns = issues.filter(i => i.rule === 'podPgy2Substitute');
    expect(infoWarns).toHaveLength(1);
    expect(infoWarns[0]).toMatchObject({ dateStr: ORDINARY_DAY, shiftId: 'POD-D', level: 'warn' });
    expect(infoWarns[0].message).toContain('conference');
  });

  it("POD's own Wellness Wednesday, no PGY-3 anywhere: the info warn's reason is 'wellness' (POD-N, not POD-D — day shifts are Grand-Rounds-exempt on every Wednesday regardless of Wellness Wednesday, see seniorCompositionExempt)", () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p2: { [POD_WW]: 'POD-N' } };
    const issues = issuesFor([pgy2], schedule);
    const infoWarns = issues.filter(i => i.rule === 'podPgy2Substitute');
    expect(infoWarns).toHaveLength(1);
    expect(infoWarns[0].message).toContain('wellness');
  });

  it('conference date, a PGY-3 IS present and covers the shift: no info warn at all (nothing to flag)', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const schedule = { p3: { [ORDINARY_DAY]: 'POD-D' } };
    const issues = issuesFor([pgy3], schedule, ACEP_CONF);
    expect(issues.filter(i => i.rule === 'podPgy2Substitute')).toEqual([]);
    expect(issues.filter(i => i.rule === 'podPgy3Composition')).toEqual([]);
  });

  it('non-conference, non-Wellness-Wednesday date: EM PGY-2 alone on POD still gets the unchanged podPgy3Composition warning (override tier — export-blocking, per b4f1d70), never the info warn', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p2: { [NON_CONFERENCE_DAY]: 'POD-D' } };
    const issues = issuesFor([pgy2], schedule, ACEP_CONF); // ayConf configured, but this date sits outside its window
    const compIssues = issues.filter(i => i.rule === 'podPgy3Composition');
    expect(compIssues).toHaveLength(1);
    expect(compIssues[0].level).toBe('warn'); // override tier => 'warn' (see rulePolicy.js), still export-blocking
    expect(issues.filter(i => i.rule === 'podPgy2Substitute')).toEqual([]);
  });
});

// Every EM Home PGY-3 who could legally have taken `shiftId` on `dateStr` (rotation/day-rule
// eligible AND not already committed to something else that day) was, in fact, unavailable —
// the exact condition R5's directive requires before the generator may fall back to a PGY-2.
function noPgy3WasAvailable(allResidents, schedule, dateStr, shiftId, blockForCtx) {
  const pgy3s = allResidents.filter(r => r.category === 'EM_HOME' && r.pgy === 3);
  return pgy3s.every(r => {
    if (schedule[r.id]?.[dateStr]) return true; // already working something else that day
    const elig = getEligibleShifts(r, dateStr, blockForCtx.specialDays || {}, {}, {}, {}, { blockStart: blockForCtx.startDate });
    return !elig.includes(shiftId);
  });
}

describe('R5: POD PGY-2 substitute — generator behavior (conferenceBlock fixture, ACEP 07-20..07-23)', () => {
  // repair:true (the real generateScheduleBest default) is required here: the true-primary
  // preference is enforced by repairPass's own dedicated phase, run once on the winning attempt —
  // NOT inside fillDayPass's own hot loop, which only ever applies compositionSatisfies (allowing
  // the substitute, never preferring the primary over it) — see that branch's own comment for why
  // (score()'s `+ rng()` jitter term made in-loop narrowing destabilize which of
  // generateScheduleBest's 20 attempts wins, regressing the chief-benchmark fixture). A bare
  // generateSchedule({repair:false}) call is documented throughout this codebase as the raw,
  // unrepaired view — same posture as Phase 1's unfilled-slot fixes and Phase 2's rest-compromise
  // fixes, both also repair-only.
  it('with ample PGY-3 supply (6 real PGY-3s), any recorded substitute happened only because no PGY-3 was actually available for that exact slot', () => {
    for (const baseSeed of [1, 2, 3]) {
      const fx = makeFixture('conferenceBlock');
      const { schedule, report } = generateSchedule({ ...fx, rng: mulberry32(baseSeed), repair: true });
      for (const sub of report.podSubstitutes) {
        expect(
          noPgy3WasAvailable(fx.allResidents, schedule, sub.dateStr, sub.shiftId, fx.block),
          `seed ${baseSeed} ${sub.dateStr}/${sub.shiftId}: a PGY-3 was actually free for this slot`
        ).toBe(true);
      }
    }
  });

  it('with near-zero PGY-3 supply (a single PGY-3 across the whole block), the ACEP-window POD substitute path is reachable, every entry is a genuine no-PGY-3-available case, and none leaves a surviving hard composition warning on that exact shift/date', () => {
    const fx = makeFixture('conferenceBlock');
    const keepPgy3Id = fx.allResidents.find(r => r.category === 'EM_HOME' && r.pgy === 3)?.id;
    const allResidents = fx.allResidents.map(r =>
      (r.category === 'EM_HOME' && r.pgy === 3 && r.id !== keepPgy3Id)
        ? { ...r, category: 'ANES', pgy: null, blockType: null }
        : r
    );
    const seeds = [1, 2, 3, 4, 5];
    let totalSubs = 0;
    for (const seed of seeds) {
      const { schedule, report } = generateSchedule({ ...fx, allResidents, rng: mulberry32(seed), repair: true });
      expect(Array.isArray(report.podSubstitutes)).toBe(true);
      totalSubs += report.podSubstitutes.length;
      const issues = validateAll(allResidents, schedule, fx.block, {}, fx.appSettings, {}, {}, [], fx.ayConf);
      const compIssueKeys = new Set(issues.filter(i => i.rule === 'podPgy3Composition').map(i => `${i.dateStr}|${i.shiftId}`));
      for (const sub of report.podSubstitutes) {
        expect(['conference', 'wellness']).toContain(sub.reason);
        expect(noPgy3WasAvailable(allResidents, schedule, sub.dateStr, sub.shiftId, fx.block), `seed ${seed} ${sub.dateStr}/${sub.shiftId}`).toBe(true);
        expect(compIssueKeys.has(`${sub.dateStr}|${sub.shiftId}`), `seed ${seed} ${sub.dateStr}/${sub.shiftId} still has a hard composition warning`).toBe(false);
      }
    }
    expect(totalSubs).toBeGreaterThan(0);
  });
});
