/** @vitest-environment jsdom */
// Chief decision 2026-11-01: Trauma Day stays Sun/Tue/Thu/Sat only; Trauma/Peds interns do trauma
// in block days 1-14 and peds in days 15-28, Peds/Trauma the reverse. No run preference for TRAUMA-D.
// Enforcement lives in getEligibleShifts step 5 (traumaPedsHalf); the solver receives the result via
// buildSolverPayload (`eligible` + traumaPedsSplit.traumaDates/pedsDates). Synthetic residents only.
import { describe, it, expect } from 'vitest';
import { getEligibleShifts, generateSchedule, validateAll, buildSolverPayload } from '../ResidentScheduler.jsx';
import { SHIFTS } from './shifts.js';
import { mulberry32 } from './rng.js';
import { parseDate, addDays, toDateStr } from './dates.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const START = '2026-07-06'; // Monday
const block = { id: 'blk_halves', startDate: START, endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const dates = Array.from({ length: 28 }, (_, i) => toDateStr(addDays(parseDate(START), i)));
const FIRST_HALF = new Set(dates.slice(0, 14));
const SECOND_HALF = new Set(dates.slice(14));
const TRAUMA_DAYS = [0, 2, 4, 6]; // Sun Tue Thu Sat
const ctx = { blockStart: START, forGenerator: true, ayConf: {} };

function intern(id, blockType) {
  return {
    id, firstName: 'Test', lastName: id, category: 'EM_HOME', pgy: 1, blockType, chiefRole: null,
    approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [],
  };
}
const TP = intern('syn_tp', 'TRAUMA_PEDS');
const PT = intern('syn_pt', 'PEDS_TRAUMA');
const elig = (r, ds) => getEligibleShifts(r, ds, {}, {}, {}, {}, ctx);
const dow = ds => parseDate(ds).getDay();
const isTrauma = s => s.startsWith('TRAUMA-');
const isPeds = s => s.startsWith('PED-');

describe('Trauma/Peds half split: eligibility', () => {
  it('Trauma/Peds: trauma-only (TRAUMA-D) days 1-14, peds-only days 15-28', () => {
    for (const ds of dates) {
      const e = elig(TP, ds);
      if (FIRST_HALF.has(ds)) {
        expect(e.filter(s => !isTrauma(s)), ds).toEqual([]);
        expect(e.some(isPeds)).toBe(false);
        if (TRAUMA_DAYS.includes(dow(ds))) expect(e, ds).toContain('TRAUMA-D');
      } else {
        expect(e.some(isTrauma), ds).toBe(false);
        expect(e.filter(s => !isPeds(s)), ds).toEqual([]);
        expect(e.length, ds).toBeGreaterThan(0);
      }
    }
  });

  it('Peds/Trauma: the reverse', () => {
    for (const ds of dates) {
      const e = elig(PT, ds);
      if (SECOND_HALF.has(ds)) {
        expect(e.filter(s => !isTrauma(s)), ds).toEqual([]);
        if (TRAUMA_DAYS.includes(dow(ds))) expect(e, ds).toContain('TRAUMA-D');
      } else {
        expect(e.some(isTrauma), ds).toBe(false);
        expect(e.filter(s => !isPeds(s)), ds).toEqual([]);
        expect(e.length, ds).toBeGreaterThan(0);
      }
    }
  });

  it('TRAUMA-D is eligible only on Sun/Tue/Thu/Sat, never Mon/Wed/Fri', () => {
    for (const r of [TP, PT]) for (const ds of dates) {
      if (elig(r, ds).includes('TRAUMA-D')) expect(TRAUMA_DAYS, ds).toContain(dow(ds));
    }
  });

  it('half boundary is day 14 / 15 (0-based index 13 / 14)', () => {
    expect(elig(TP, dates[13])).not.toEqual([]);
    expect(elig(TP, dates[13]).some(isPeds)).toBe(false);
    expect(elig(TP, dates[14]).some(isTrauma)).toBe(false);
    expect(elig(TP, dates[14]).some(isPeds)).toBe(true);
  });
});

describe('Trauma/Peds half split: generator', () => {
  const coverage = Object.fromEntries(SHIFTS.map(s => [s.id, { min: 0, max: 0 }]));
  coverage['TRAUMA-D'] = { min: 1, max: 1 };
  coverage['PED-D'] = { min: 1, max: 1 };
  coverage['PED-E'] = { min: 1, max: 1 };
  const result = generateSchedule({
    allResidents: [TP, PT], block, coverage, eligOverrides: {}, appSettings: {}, dayRules: {}, ayConf: {},
    blocksHistory: [], rng: mulberry32(11),
  });
  const sched = result.schedule ?? result;
  const cellsOf = id => {
    const out = [];
    for (const ds of dates) {
      const v = sched[id]?.[ds] ?? sched[ds]?.[id];
      const arr = Array.isArray(v) ? v : (v ? [v] : []);
      for (const s of arr) out.push([ds, typeof s === 'string' ? s : s.shiftId ?? s.id]);
    }
    return out;
  };

  it('places work for both interns and keeps every cell inside its half', () => {
    const tp = cellsOf('syn_tp'), pt = cellsOf('syn_pt');
    expect(tp.length).toBeGreaterThan(0);
    expect(pt.length).toBeGreaterThan(0);
    expect(tp.some(([, s]) => isTrauma(s))).toBe(true);
    expect(tp.some(([, s]) => isPeds(s))).toBe(true);
    expect(pt.some(([, s]) => isTrauma(s))).toBe(true);
    expect(pt.some(([, s]) => isPeds(s))).toBe(true);
    for (const [ds, s] of tp) {
      if (isTrauma(s)) expect(FIRST_HALF.has(ds), `TP ${s} ${ds}`).toBe(true);
      if (isPeds(s)) expect(SECOND_HALF.has(ds), `TP ${s} ${ds}`).toBe(true);
    }
    for (const [ds, s] of pt) {
      if (isTrauma(s)) expect(SECOND_HALF.has(ds), `PT ${s} ${ds}`).toBe(true);
      if (isPeds(s)) expect(FIRST_HALF.has(ds), `PT ${s} ${ds}`).toBe(true);
    }
  });

  it('TRAUMA-D lands only on Sun/Tue/Thu/Sat', () => {
    for (const id of ['syn_tp', 'syn_pt']) for (const [ds, s] of cellsOf(id)) {
      if (s === 'TRAUMA-D') expect(TRAUMA_DAYS, ds).toContain(dow(ds));
    }
  });

  it('validator reports no traumaPedsSplit / rotationEligibility errors', () => {
    const issues = validateAll([TP, PT], sched, block, {}, {}, {}, coverage, [], {});
    const list = Array.isArray(issues) ? issues : (issues.issues ?? []);
    expect(list.filter(i => i.level === 'error' && ['traumaPedsSplit', 'rotationEligibility'].includes(i.rule))).toEqual([]);
  });
});

describe('Trauma/Peds half split: solver payload carries the same halves', () => {
  it('traumaPedsSplit dates and `eligible` match the browser halves', () => {
    const f = makeFixture('standard');
    const payload = buildSolverPayload(f);
    const byId = Object.fromEntries(payload.residents.map(r => [r.id, r]));
    const alpha = byId.syn_alpha; // TRAUMA_PEDS PGY-1
    expect(alpha.traumaPedsSplit.traumaDates).toEqual(payload.block.dates.slice(0, 14));
    expect(alpha.traumaPedsSplit.pedsDates).toEqual(payload.block.dates.slice(14));
    for (const ds of payload.block.dates) {
      const e = payload.eligible.syn_alpha?.[ds] || [];
      const area = sid => payload.shifts[sid]?.area;
      if (alpha.traumaPedsSplit.traumaDates.includes(ds)) expect(e.some(s => area(s) === 'PED'), ds).toBe(false);
      else expect(e.some(s => area(s) === 'TRAUMA'), ds).toBe(false);
    }
  });
});
