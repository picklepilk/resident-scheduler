/** @vitest-environment jsdom */
// Chief decisions 2026-11-06: pre-generate warnings (warn-but-allow) + custom PGY-3 Wellness dates
// widening POD's PGY-2 substitute day. Synthetic fixtures only.
import { describe, it, expect } from 'vitest';
import { validateAll, checkGenerateReadiness } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';
import { withLoggedDates } from './ruleDates.js';

const block = { id: 'blk_t', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const POD_WW = '2026-07-22';   // logged PGY-3 class date
const CUSTOM = '2026-07-29';   // an ordinary Wednesday, only a custom PGY-3 date
const res = o => ({ firstName: 'T', lastName: 'R', approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [], blockType: undefined, chiefRole: null, ...o });
const podIssues = (residents, schedule) => {
  const fx = makeFixture('standard');
  return validateAll(residents, schedule, block, {}, {}, {}, {}, [], fx.ayConf).filter(i => i.message.includes('requires an EM PGY-'));
};

describe('POD substitute honors a PGY-3 custom Wellness date', () => {
  const p2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
  it('PGY-2 alone on POD errors on an ordinary Wednesday when no PGY-3 has that custom date', () => {
    const p3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    expect(podIssues([p2, p3], { p2: { [CUSTOM]: 'POD-E' }, p3: {} })).toHaveLength(1);
  });
  it('PGY-2 alone on POD is fine on a PGY-3 resident\'s custom Wellness date', () => {
    const p3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3, wellnessOverride: CUSTOM });
    expect(podIssues([p2, p3], { p2: { [CUSTOM]: 'POD-E' }, p3: {} })).toEqual([]);
  });
  it('optOut does not open a substitute day', () => {
    const p3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3, wellnessOverride: 'optOut' });
    expect(podIssues([p2, p3], { p2: { [CUSTOM]: 'POD-E' }, p3: {} })).toHaveLength(1);
  });
});

describe('pre-generate readiness: per-PGY Wellness + Trauma Day capacity', () => {
  const fx = makeFixture('standard');
  const args = { block: fx.block, dayRules: fx.dayRules, appSettings: { ...fx.appSettings, ruleDatesMigrated: true } };
  it('warns only for the PGY class with no Wellness date in the block', () => {
    let ayConf = fx.ayConf;
    ayConf = withLoggedDates(ayConf, 'wellnessWednesday', ['2026-12-02'], 2); // outside block
    const msgs = checkGenerateReadiness({ ...args, allResidents: fx.allResidents, ayConf }).messages.filter(m => /Wellness Wednesday/.test(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/PGY-2/);
  });
  it('warns when Trauma/Peds interns share a half with too few Trauma Days', () => {
    const interns = ['a', 'b', 'c'].map(id => res({ id, category: 'EM_HOME', pgy: 1, blockType: 'TRAUMA_PEDS' }));
    const out = checkGenerateReadiness({ ...args, allResidents: interns, ayConf: fx.ayConf });
    expect(out.messages.some(m => /3 Trauma\/Peds interns share 7\/6-7\/19: need 24 Trauma Days, only 8 exist/.test(m))).toBe(true);
    const one = checkGenerateReadiness({ ...args, allResidents: interns.slice(0, 1), ayConf: fx.ayConf });
    expect(one.messages.some(m => /Trauma Days/.test(m))).toBe(false);
  });
});
