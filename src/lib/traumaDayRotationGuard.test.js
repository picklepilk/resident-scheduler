// Regression guard (2026-10-16 real-data bug): TRAUMA-D is structurally limited to EM Home
// residents on a TRAUMA_BLOCKS rotation (PEDS_TRAUMA / TRAUMA_PEDS, or the chief's
// dayRules.TRAUMA_BLOCKS override) — even when the chief's saved EM_HOME_1 dayRules override
// predates DEFAULT_DAY_RULES' 'trauma_strip_non_trauma_block' gate (getEffectiveDayRules replaces
// shiftGates wholesale, so that gate silently vanished). The guard lives in
// getEffectiveEligibility (post-resolution, like stripPedGuardedShifts), not in shiftGates.
import { describe, it, expect } from 'vitest';
import { getEligibleShifts, validateAll, eligibilityBlockReasons } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const TUE = '2026-07-07';      // TRAUMA-D runs Tue/Thu/Sat/Sun; TRAUMA_PEDS trauma half
const THU_LATE = '2026-07-23';  // PEDS_TRAUMA trauma half (last 14 days)

// The stale saved override from the bug report: trauma_day_gate only (blockTypeFilter 'only'
// TRAUMA_BLOCKS), no trauma_strip_non_trauma_block gate.
const STALE_EM_HOME_1 = {
  dayTypeRestrictions: [{ days: [3], mode: 'noDay' }],
  shiftGates: [
    { id: 'trauma_day_gate', shiftIds: ['TRAUMA-D'], blockTypeFilter: { mode: 'only', ref: 'TRAUMA_BLOCKS' },
      allowedDays: [2, 4, 6, 0], outsideAction: 'stripShiftIds', overrideImmune: false },
  ],
};

function setup(blockType, dayRulesExtra = {}) {
  const f = makeFixture('standard');
  const alpha = f.allResidents.find(r => r.id === 'syn_alpha');
  const res = { ...alpha, blockType };
  const dayRules = { ...f.dayRules, ...dayRulesExtra };
  const elig = ds => getEligibleShifts(res, ds, f.block.specialDays || {}, f.eligOverrides, f.appSettings, dayRules, { blockStart: f.block.startDate });
  return { f, res, dayRules, elig };
}

describe('Trauma Day rotation guard', () => {
  it('stale override: TRAUMA-D removed for EM and US_EM rotations', () => {
    for (const bt of ['EM', 'US_EM']) {
      const { elig } = setup(bt, { EM_HOME_1: STALE_EM_HOME_1 });
      expect(elig(TUE)).not.toContain('TRAUMA-D');
    }
  });

  it('stale override: TRAUMA-D kept for TRAUMA_PEDS / PEDS_TRAUMA on allowed days in the trauma half', () => {
    expect(setup('TRAUMA_PEDS', { EM_HOME_1: STALE_EM_HOME_1 }).elig('2026-07-09')).toContain('TRAUMA-D');
    expect(setup('PEDS_TRAUMA', { EM_HOME_1: STALE_EM_HOME_1 }).elig(THU_LATE)).toContain('TRAUMA-D');
  });

  it('no override: EM rotation still has no TRAUMA-D', () => {
    expect(setup('EM').elig(TUE)).not.toContain('TRAUMA-D');
  });

  it('chief dayRules.TRAUMA_BLOCKS override is honored', () => {
    const { elig } = setup('EM', { TRAUMA_BLOCKS: ['EM'], EM_HOME_1: STALE_EM_HOME_1 });
    // split logic treats a non-TRAUMA_PEDS trauma block as trauma in the LAST 14 days
    expect(elig(THU_LATE)).toContain('TRAUMA-D');
    // and the default trauma rotation is no longer a trauma block under that override
    expect(setup('TRAUMA_PEDS', { TRAUMA_BLOCKS: ['EM'], EM_HOME_1: STALE_EM_HOME_1 }).elig('2026-07-09')).not.toContain('TRAUMA-D');
  });

  it('TRAUMA-N rules unchanged: not touched by the guard', () => {
    const f = makeFixture('standard');
    const pgy2 = f.allResidents.find(r => r.category === 'EM_HOME' && r.pgy === 2 && (r.blockType || 'EM') === 'EM');
    if (!pgy2) return;
    const withN = ['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13'].some(ds =>
      getEligibleShifts(pgy2, ds, {}, f.eligOverrides, f.appSettings, f.dayRules, { blockStart: f.block.startDate }).includes('TRAUMA-N'));
    expect(withN).toBe(true);
  });

  it('validateAll flags a manually placed TRAUMA-D on an EM-rotation PGY-1 as a hard error', () => {
    const { f, res, dayRules } = setup('EM', { EM_HOME_1: STALE_EM_HOME_1 });
    const others = f.allResidents.filter(r => r.id !== res.id);
    const schedule = { ...(f.block.schedule || {}), [res.id]: { [TUE]: 'TRAUMA-D' } };
    const issues = validateAll([res, ...others], schedule, f.block, f.eligOverrides, f.appSettings, dayRules, f.coverage || {}, [], f.ayConf || {});
    const hit = issues.find(i => i.residentId === res.id && i.dateStr === TUE && i.shiftId === 'TRAUMA-D');
    expect(hit).toBeTruthy();
    expect(hit.rule).toBe('traumaDayRotationGuard');
    expect(hit.level).toBe('error');
    expect(eligibilityBlockReasons(res, TUE, 'TRAUMA-D', { dayRules, eligOverrides: f.eligOverrides, appSettings: f.appSettings, blockStart: f.block.startDate }).rule)
      .toBe('traumaDayRotationGuard');
  });
});
