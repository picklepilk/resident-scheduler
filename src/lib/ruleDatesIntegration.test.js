// Logged (not derived) computed-date rules, exercised through the real eligibility + readiness code.
import { describe, it, expect } from 'vitest';
import { getEligibleShifts, checkGenerateReadiness } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';
import { withLoggedDates } from './ruleDates.js';

const ANES = { id: 'a1', category: 'ANES', pgy: 1, firstName: 'A', lastName: 'B', approvedDatesOff: [], vacationDates: [] };
const FIRST_FRIDAY = '2026-08-07';

describe('logged rule dates drive eligibility', () => {
  it('First Friday blocks Anesthesia only on a LOGGED date', () => {
    const none = getEligibleShifts(ANES, FIRST_FRIDAY, {}, {}, {}, {}, { blockStart: '2026-07-06', ayConf: {} });
    expect(none.length).toBeGreaterThan(0);
    const logged = withLoggedDates({}, 'firstFriday', [FIRST_FRIDAY]);
    expect(getEligibleShifts(ANES, FIRST_FRIDAY, {}, {}, {}, {}, { blockStart: '2026-07-06', ayConf: logged })).toEqual([]);
    expect(getEligibleShifts(ANES, '2026-09-04', {}, {}, {}, {}, { blockStart: '2026-07-06', ayConf: logged }).length).toBeGreaterThan(0);
  });
});

describe('pre-generate readiness gate', () => {
  it('warns when no rule dates are logged for the block, stays quiet when logged', () => {
    const fx = makeFixture('standard');
    const args = { allResidents: fx.allResidents, block: fx.block, dayRules: fx.dayRules, appSettings: fx.appSettings };
    const bare = checkGenerateReadiness({ ...args, ayConf: {} }).messages.filter(m => /dates logged/.test(m));
    expect(bare.some(m => /Wellness Wednesday \(PGY-1\)/.test(m))).toBe(true);
    expect(bare.some(m => /Journal Club/.test(m))).toBe(true);
    const ok = checkGenerateReadiness({ ...args, ayConf: fx.ayConf }).messages.filter(m => /dates logged/.test(m));
    expect(ok).toEqual([]);
  });

  it('warns when the rule-date migration has not run, quiet once marked', () => {
    const fx = makeFixture('standard');
    const base = { allResidents: fx.allResidents, block: fx.block, dayRules: fx.dayRules, ayConf: fx.ayConf };
    const msg = s => checkGenerateReadiness({ ...base, appSettings: s }).messages.filter(m => /not yet migrated/.test(m));
    expect(msg({})).toHaveLength(1);
    expect(msg({ ruleDatesMigrated: true })).toEqual([]);
  });
});
