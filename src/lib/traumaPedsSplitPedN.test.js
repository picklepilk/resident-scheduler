// Regression/behavior guard for the `appSettings.allowSplitPedsNights` opt-in (default OFF): a
// TRAUMA_PEDS/PEDS_TRAUMA EM Home PGY-1's peds half is normally PED-D/PED-E only (getEligibleShifts
// step 5, "Peds/Trauma half-block split"). This flag lets the chief additionally allow PED-N on
// that half — never on the trauma half (there's no trauma-side sub-target budget for it), and
// never outside the existing Thu-Sun `ped_n_em_window` shiftGate. See CLAUDE.md's "Trauma/Peds
// rotation 8/11 split" section and the comment above BASE_ELIGIBILITY for the underlying rules
// this toggle unblocks (all of which already existed — the half-block filter was the only thing
// stopping it).
import { describe, it, expect } from 'vitest';
import { getEligibleShifts } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

// Alpha: EM_HOME PGY-1, blockType TRAUMA_PEDS. Block is 2026-07-06 (Mon) .. 2026-08-02 (Sun).
// TRAUMA_PEDS is trauma for the first 14 days (block day-index 0-13, i.e. 2026-07-06..2026-07-19)
// and peds for the last 14 (day-index 14-27, i.e. 2026-07-20..2026-08-02).
const PEDS_HALF_THU = '2026-07-23';  // day-index 17 — peds half, and a Thursday (Thu-Sun window)
const PEDS_HALF_MON = '2026-07-20';  // day-index 14 — peds half, but a Monday (outside the window)
const TRAUMA_HALF_THU = '2026-07-09'; // day-index 3 — trauma half, also a Thursday

function alphaElig(dateStr, allowSplitPedsNights) {
  const f = makeFixture('standard');
  const alpha = f.allResidents.find(r => r.id === 'syn_alpha');
  expect(alpha, 'fixture should contain Alpha (EM_HOME PGY-1, TRAUMA_PEDS)').toBeTruthy();
  expect(alpha.blockType).toBe('TRAUMA_PEDS');
  return getEligibleShifts(
    alpha, dateStr, f.block.specialDays || {}, f.eligOverrides,
    { ...f.appSettings, allowSplitPedsNights }, f.dayRules,
    { blockStart: f.block.startDate },
  );
}

describe('allowSplitPedsNights: TRAUMA_PEDS/PEDS_TRAUMA peds-half PED-N opt-in', () => {
  it('flag off: a Thursday in the peds half has no PED-N', () => {
    const elig = alphaElig(PEDS_HALF_THU, false);
    expect(elig).not.toContain('PED-N');
    expect(elig).toEqual(expect.arrayContaining(['PED-D', 'PED-E']));
  });

  it('flag on: the same Thursday in the peds half now includes PED-N', () => {
    const elig = alphaElig(PEDS_HALF_THU, true);
    expect(elig).toContain('PED-N');
  });

  it('flag on: a Monday/Tuesday/Wednesday in the peds half still has no PED-N (Thu-Sun window)', () => {
    const elig = alphaElig(PEDS_HALF_MON, true);
    expect(elig).not.toContain('PED-N');
    expect(elig).toEqual(expect.arrayContaining(['PED-D', 'PED-E']));
  });

  it('flag on: the trauma half is unaffected — still only TRAUMA-D', () => {
    const elig = alphaElig(TRAUMA_HALF_THU, true);
    expect(elig).toEqual(['TRAUMA-D']);
  });
});
