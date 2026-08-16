// Regression guard for a silent, recurring failure mode: a chief-saved eligibility override is a
// WHOLESALE snapshot of the shift list, so any shift id added to the app AFTER that override was
// saved is invisible to it forever. The chief hit this with the 12h conference shifts — ACEP dates
// were set correctly, the 9h POD/MT/FLEX shifts were suppressed for those dates as designed, and
// the 12h replacements could never be assigned because the saved override didn't list them. The
// result was residents simply not being scheduled during ACEP, with no error anywhere.
//
// LEGACY_ELIGIBILITY_DEFAULTS prunes overrides that still deep-equal a recorded pre-change default,
// but it cannot help here: it is keyed by CATEGORY_PGY only, so per-ROTATION overrides
// (CATEGORY_PGY__ROTATION, written by the Shift Matrix tab's expandable sub-rows) are never pruned,
// and a category override the chief actually customized doesn't deep-equal any snapshot either.
import { describe, it, expect } from 'vitest';
import { generateSchedule, getEligibleShifts } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';
import { mulberry32 } from './rng.js';
import { getBlockDates } from './dates.js';

// The EM_HOME_2 eligibility list exactly as it stood immediately before the 12h shifts existed.
const PRE_12H_EM_HOME_2 = [
  'POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','PED-S',
  'FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N',
];

function acepFixture(overrides) {
  const f = makeFixture('standard');
  const dates = getBlockDates(f.block.startDate, f.block.endDate);
  // A 4-day conference window inside the block, the same shape as the chief's ACEP 10/5–10/8.
  const confStart = dates[7], confEnd = dates[10];
  return {
    ...f,
    eligOverrides: overrides,
    ayConf: { acepStart: confStart, acepEnd: confEnd },
    _conf: { start: confStart, end: confEnd, dates: dates.slice(7, 11) },
  };
}

const TWELVE_H = /-(D12|N12)$/;

describe('legacy eligibility overrides vs. later-added shift ids', () => {
  it('a pre-12h CATEGORY override still allows 12h shifts during a conference window', () => {
    const f = acepFixture({ EM_HOME_2: PRE_12H_EM_HOME_2 });
    const { schedule } = generateSchedule({ ...f, rng: mulberry32(42) });
    const assigned = new Set();
    for (const rid of Object.keys(schedule)) {
      for (const ds of f._conf.dates) {
        const sid = schedule[rid]?.[ds];
        if (sid && TWELVE_H.test(sid)) assigned.add(sid);
      }
    }
    expect([...assigned].length).toBeGreaterThan(0);
  });

  it('a pre-12h ROTATION override still allows 12h shifts (never reachable by the legacy pruner)', () => {
    // Rotation overrides are keyed CATEGORY_PGY__ROTATION and getEffectiveEligibility prefers them
    // over the category list, so this is the strictest version of the bug.
    const f = acepFixture({ EM_HOME_2__EM: PRE_12H_EM_HOME_2 });
    const em2 = f.allResidents.find(r => r.category === 'EM_HOME' && r.pgy === 2 && r.blockType === 'EM');
    expect(em2, 'fixture should contain an EM_HOME PGY-2 on the EM rotation').toBeTruthy();

    const elig = getEligibleShifts(
      em2, f._conf.dates[0], f.block.specialDays || {}, f.eligOverrides,
      f.appSettings, f.dayRules, { blockStart: f.block.startDate, ayConf: f.ayConf },
    );
    // During the window the 9h POD/MT/FLEX shifts are suppressed by design. If the 12h ones aren't
    // eligible either, this resident has essentially nothing to work — which is exactly what the
    // chief saw.
    expect(elig.some(s => TWELVE_H.test(s))).toBe(true);
  });

  it('does not invent eligibility for an area the override deliberately dropped', () => {
    // POD removed entirely from the override — backfilling POD's 12h shifts would silently undo a
    // deliberate chief decision, so it must not happen.
    const noPod = PRE_12H_EM_HOME_2.filter(s => !s.startsWith('POD-'));
    const f = acepFixture({ EM_HOME_2: noPod });
    const em2 = f.allResidents.find(r => r.category === 'EM_HOME' && r.pgy === 2);
    const elig = getEligibleShifts(
      em2, f._conf.dates[0], f.block.specialDays || {}, f.eligOverrides,
      f.appSettings, f.dayRules, { blockStart: f.block.startDate, ayConf: f.ayConf },
    );
    expect(elig.some(s => s.startsWith('POD-'))).toBe(false);
  });

  it('does not grant a 12h shift the current BASE_ELIGIBILITY never gave that category', () => {
    // NEURO_1 is eligible for FLEX-D but NOT for FLEX-D12 in the live defaults. A naive
    // "9h implies 12h" rule would hand it out.
    const f = acepFixture({ NEURO_1: ['POD-D','POD-E','POD-N','FLEX-D'] });
    const neuro = f.allResidents.find(r => r.category === 'NEURO' && r.pgy === 1);
    if (!neuro) return; // variant has no neuro resident — nothing to assert
    const elig = getEligibleShifts(
      neuro, f._conf.dates[0], f.block.specialDays || {}, f.eligOverrides,
      f.appSettings, f.dayRules, { blockStart: f.block.startDate, ayConf: f.ayConf },
    );
    expect(elig).not.toContain('FLEX-D12');
    expect(elig).toContain('POD-D12');
  });
});
