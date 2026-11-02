/** @vitest-environment jsdom */
// Chief decision 2026-11-01: Podiatry may work any time Friday and otherwise Saturday mornings,
// nothing else on weekends. Friday: any shift; Saturday: DAY only; Sunday: nothing. All HARD (not as-needed).
// PUBLIC REPO: synthetic residents only.
import { describe, it, expect } from 'vitest';
import {
  getEligibleShifts, getAsNeededShifts, buildSolverPayload, DEFAULT_DAY_RULES, LEGACY_DAY_RULE_DEFAULTS,
} from '../ResidentScheduler.jsx';
import { SHIFT_MAP } from './shifts.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const block = { id: 'blk_pod', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const MON = '2026-07-06', FRI = '2026-07-10', SAT = '2026-07-11', SUN = '2026-07-12';
const ctx = { blockStart: block.startDate, forGenerator: true, ayConf: {} };
const pod = { id: 'podi', firstName: 'Test', lastName: 'Podiatry', category: 'POD', pgy: 1, blockType: undefined,
  chiefRole: null, approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [] };
const elig = ds => getEligibleShifts(pod, ds, {}, {}, {}, {}, ctx);
const asn = ds => getAsNeededShifts(pod, ds, {}, {}, {}, {}, ctx);

describe('Podiatry weekend (2026-11-01)', () => {
  it('Friday offers every Podiatry shift incl. evening and night', () => {
    const f = elig(FRI);
    expect(f.length).toBeGreaterThan(0);
    expect(f.some(s => SHIFT_MAP[s].type === 'eve')).toBe(true);
    expect(f.some(s => SHIFT_MAP[s].type === 'night')).toBe(true);
    expect(f.some(s => SHIFT_MAP[s].type === 'day')).toBe(true);
  });
  it('Saturday offers day shifts only', () => {
    const s = elig(SAT);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every(x => SHIFT_MAP[x].type === 'day')).toBe(true);
  });
  it('Sunday offers nothing', () => { expect(elig(SUN)).toEqual([]); });
  it('weekend limits are hard: no as-needed shifts Sat/Sun; Mon day still as-needed', () => {
    expect(asn(SAT).size).toBe(0);
    expect(asn(SUN).size).toBe(0);
    expect(asn(MON).size).toBeGreaterThan(0);
  });
  it('solver payload: Sat eve/night and Sunday cells appear in neither eligible nor asNeeded', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload({ ...fixture, allResidents: [...fixture.allResidents, pod] });
    const sat = payload.eligible.podi?.[SAT] || [];
    expect(sat.length).toBeGreaterThan(0);
    expect(sat.every(s => SHIFT_MAP[s].type === 'day')).toBe(true);
    expect(payload.eligible.podi?.[SUN]).toBeUndefined();
    expect(payload.eligible.podi?.[FRI].some(s => SHIFT_MAP[s].type === 'night')).toBe(true);
    const mine = payload.asNeeded.filter(a => a.residentId === 'podi');
    expect(mine.filter(a => a.date === SUN)).toEqual([]);
    expect(mine.filter(a => a.date === SAT)).toEqual([]);
  });
  it('old as-needed weekend shape is kept in LEGACY_DAY_RULE_DEFAULTS.POD_1 so a stale override is pruned', () => {
    const legacy = LEGACY_DAY_RULE_DEFAULTS.POD_1;
    expect(legacy.some(l => l.fullBlockAsNeeded && l.fullBlockLabel === 'Podiatry on a weekend' && l.fullBlockDays.join() === '6,0')).toBe(true);
    expect(DEFAULT_DAY_RULES.POD_1.fullBlockAsNeeded).toBeUndefined();
    expect(DEFAULT_DAY_RULES.POD_1.fullBlockDays).toEqual([0]);
  });
});
