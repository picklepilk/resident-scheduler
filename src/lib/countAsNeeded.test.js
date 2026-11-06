/** @vitest-environment jsdom */
// src/lib/countAsNeeded.test.js
// Program decisions 2026-10-30 (chief + program director), COUNT-based as-needed rules:
//  1. Nights per block: target 6; 7-12 only AS NEEDED to fill a coverage minimum; never more than 12.
//  2. BAMC PGY-1: Thursday evening/night ordinary; Thursday DAY and Wednesday NIGHT as-needed, at most ONE of
//     the two in total per block.
// PUBLIC REPO: synthetic residents only.
import { describe, it, expect } from 'vitest';
import {
  getEligibleShifts, getAsNeededShifts, validateAll, generateSchedule, buildSolverPayload,
  NIGHT_RULES, DEFAULT_DAY_RULES, LEGACY_DAY_RULE_DEFAULTS, countAsNeededExceptions,
} from '../ResidentScheduler.jsx';
import { SHIFTS, SHIFT_MAP } from './shifts.js';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

// Mon 2026-07-06 .. Sun 2026-08-02. Wed = 07-08/15/22/29, Thu = 07-09/16/23/30.
const block = { id: 'blk_count', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const THU = '2026-07-09';
const WED = '2026-07-08';
const FRI = '2026-07-10';
const day = n => `2026-07-${String(n).padStart(2, '0')}`;

function res(o) {
  return {
    id: o.id, firstName: 'Test', lastName: 'Resident', category: o.category ?? 'EM_HOME', pgy: o.pgy ?? 2,
    blockType: o.blockType ?? 'EM', chiefRole: null, approvedDatesOff: [], vacationDates: [], jeopardyDates: [],
    jcPresentDates: [], grLectureDates: [],
  };
}
const bamc = (o = {}) => res({ id: 'bamc', category: 'EM_BAMC', pgy: 1, ...o });
const ctx = { blockStart: block.startDate, forGenerator: true, ayConf: {} };
const elig = (r, ds) => getEligibleShifts(r, ds, {}, {}, {}, {}, ctx);
const asNeeded = (r, ds) => getAsNeededShifts(r, ds, {}, {}, {}, {}, ctx);
function coverageOnly(entries) {
  const cov = Object.fromEntries(SHIFTS.map(s => [s.id, { min: 0, max: 0 }]));
  return { ...cov, ...entries };
}
const gen = (residents, coverage) => generateSchedule({
  allResidents: residents, block, coverage, eligOverrides: {}, appSettings: {}, dayRules: {}, ayConf: {},
  blocksHistory: [], rng: mulberry32(7), repair: true, // the nights last-resort sweep runs after repair
});
const validate = (residents, schedule, coverage = coverageOnly({})) =>
  validateAll(residents, schedule, block, {}, {}, {}, coverage, [], {});
const nightsOf = row => Object.values(row || {}).filter(s => s && SHIFT_MAP[s]?.type === 'night').length;

describe('night rule data', () => {
  it('soft target 6, hard max 12, per-run max unchanged', () => {
    expect(NIGHT_RULES.targetPerBlock).toBe(6);
    expect(NIGHT_RULES.maxPerBlock).toBe(12);
    expect(NIGHT_RULES.maxRun).toBe(6);
  });
});

describe('nights per block: generator', () => {
  const POD_N = coverageOnly({ 'PED-N': { min: 1, max: 1 } });

  it('one resident, POD-N min 1 every night: goes above 6 only as needed, never above 12', () => {
    const r = res({ id: 'solo', pgy: 3 });
    const { schedule, report } = gen([r], POD_N);
    const n = nightsOf(schedule.solo);
    expect(n).toBeGreaterThan(6); // a min slot nobody else can fill -> as-needed nights
    expect(n).toBeLessThanOrEqual(12);
    const placements = report.asNeededPlacements.filter(p => p.label === 'Night above 6 this block');
    expect(placements).toHaveLength(n - 6);
  });

  it('enough residents: nobody is pushed past the 6-night target', () => {
    const rs = ['a', 'b', 'c', 'd', 'e'].map(id => res({ id, pgy: 3 }));
    const { schedule, report } = gen(rs, POD_N);
    for (const r of rs) expect(nightsOf(schedule[r.id])).toBeLessThanOrEqual(6);
    expect(report.asNeededPlacements.filter(p => p.label === 'Night above 6 this block')).toEqual([]);
  });

  it('optional (top-up) headroom never buys a 7th night: min 0 / max 1', () => {
    const r = res({ id: 'solo', pgy: 3 });
    const { schedule } = gen([r], coverageOnly({ 'POD-N': { min: 0, max: 1 } }));
    expect(nightsOf(schedule.solo)).toBeLessThanOrEqual(6);
  });

  it('never a 13th even when every night of the block is a minimum', () => {
    const r = res({ id: 'solo', pgy: 3 });
    const cov = coverageOnly({ 'POD-N': { min: 1, max: 1 }, 'FLEX-N': { min: 1, max: 1 }, 'PED-N': { min: 1, max: 1 } });
    const { schedule } = gen([r], cov);
    expect(nightsOf(schedule.solo)).toBeLessThanOrEqual(12);
  });
});

describe('nights per block: validateAll', () => {
  function rowWithNights(n) {
    // runs of at most 6 separated by a gap; first run 07-06.., second run 07-15..
    const row = {};
    let left = n;
    for (let i = 0; i < 6 && left > 0; i++, left--) row[day(6 + i)] = 'POD-N';
    for (let i = 0; i < 6 && left > 0; i++, left--) row[day(15 + i)] = 'POD-N';
    for (let i = 0; i < 6 && left > 0; i++, left--) row[`2026-07-${String(24 + i)}`] = 'POD-N';
    return row;
  }
  const r = res({ id: 'v1', pgy: 3 });
  const run = n => validate([r], { v1: rowWithNights(n) }).filter(i => i.residentId === 'v1');

  it('6 nights: no night exception, no cap issue', () => {
    const issues = run(6);
    expect(issues.find(i => i.rule === 'nightsTotalBlock')).toBeUndefined();
    expect(issues.find(i => i.rule === 'asNeededException' && /Night above 6/.test(i.message))).toBeUndefined();
  });
  it('7 nights: one exception unit, a warn (not an error), labelled', () => {
    const issues = run(7);
    const ex = issues.find(i => i.rule === 'asNeededException' && /Night above 6 this block/.test(i.message));
    expect(ex).toBeTruthy();
    expect(ex.level).toBe('warn');
    expect(ex.units).toBe(1);
    expect(issues.find(i => i.rule === 'nightsTotalBlock')).toBeUndefined();
    expect(countAsNeededExceptions(issues)).toBe(1);
  });
  it('12 nights: six exception units, still no cap error', () => {
    const issues = run(12);
    expect(issues.find(i => i.rule === 'asNeededException' && /Night above 6/.test(i.message)).units).toBe(6);
    expect(issues.find(i => i.rule === 'nightsTotalBlock')).toBeUndefined();
    expect(countAsNeededExceptions(issues)).toBe(6);
  });
  it('13 nights: nightsTotalBlock fires (hard max 12)', () => {
    const issues = run(13);
    expect(issues.find(i => i.rule === 'nightsTotalBlock')).toBeTruthy();
    // the excess units are capped at the 12-night max
    expect(countAsNeededExceptions(issues)).toBe(6);
  });
});

describe('BAMC Thursday day / Wednesday night: eligibility', () => {
  it('Thursday evening and night shifts are ordinary (strictly eligible)', () => {
    const s = elig(bamc(), THU);
    expect(s).toContain('POD-E');
    expect(s).toContain('POD-N');
    expect(s).not.toContain('POD-D');
    expect(s).not.toContain('FLEX-D');
  });
  it('Thursday day shifts are HARD-stripped: not eligible and not even as-needed', () => {
    const m = asNeeded(bamc(), THU);
    expect(m.has('POD-D')).toBe(false);
    expect(m.has('MT-D')).toBe(false);
    expect(m.has('FLEX-D')).toBe(false);
    expect(m.size).toBe(0);
  });
  it('Wednesday night is as-needed, labelled; Wednesday day/evening are ordinary', () => {
    const s = elig(bamc(), WED);
    expect(s).toContain('POD-D');
    expect(s).toContain('POD-E');
    expect(s).not.toContain('POD-N');
    expect(asNeeded(bamc(), WED).get('POD-N')).toBe('BAMC Wednesday night');
  });
  it('other weekdays are unaffected', () => {
    expect(elig(bamc(), FRI)).toEqual(expect.arrayContaining(['POD-D', 'POD-E', 'POD-N']));
    expect(asNeeded(bamc(), FRI).size).toBe(0);
  });
  it('EM Home residents keep their own rules (no BAMC gate)', () => {
    expect(residentGateIds(DEFAULT_DAY_RULES.EM_HOME_2)).not.toContain('bamc_thu_day');
  });
  it('the old as-needed Thursday-day shape is in LEGACY_DAY_RULE_DEFAULTS (stale overrides get pruned)', () => {
    const legacy = LEGACY_DAY_RULE_DEFAULTS.EM_BAMC_1;
    expect(legacy.some(l => (l.shiftGates || []).some(g => g.id === 'bamc_thu_day' && g.asNeeded === true))).toBe(true);
    const cur = DEFAULT_DAY_RULES.EM_BAMC_1.shiftGates.find(g => g.id === 'bamc_thu_day');
    expect(cur.asNeeded).toBeUndefined();
  });
});
function residentGateIds(dr) { return (dr.shiftGates || []).map(g => g.id); }

describe('BAMC Thursday day / Wednesday night: generator + validateAll', () => {
  const isThuDay = (ds, sid) => !!sid && SHIFT_MAP[sid].type === 'day' && new Date(ds + 'T12:00:00').getDay() === 4;
  const isWedNight = (ds, sid) => !!sid && SHIFT_MAP[sid].type === 'night' && new Date(ds + 'T12:00:00').getDay() === 3;
  const threeBamc = () => ['b1', 'b2', 'b3'].map(id => bamc({ id }));
  it('Thursday evening/night fill normally', () => {
    const cov = coverageOnly({ 'PED-N': { min: 1, max: 1 } });
    const rs = ['b1', 'b2', 'b3', 'b4', 'b5'].map(id => bamc({ id }));
    const { schedule } = gen(rs, cov);
    expect(rs.some(r => Object.entries(schedule[r.id]).some(([ds, sid]) => sid === 'PED-N' && new Date(ds + 'T12:00:00').getDay() === 4))).toBe(true);
  });
  it('a Thursday-day minimum only BAMC residents could fill stays unfilled: never a Thursday day shift', () => {
    const rs = threeBamc();
    const { schedule, report } = gen(rs, coverageOnly({ 'PED-D': { min: 1, max: 1 } }));
    for (const r of rs) {
      expect(Object.entries(schedule[r.id]).filter(([ds, sid]) => isThuDay(ds, sid))).toEqual([]);
    }
    expect(report.asNeededPlacements.filter(p => p.label === 'BAMC Thursday day shift')).toEqual([]);
  });
  it('Wednesday-night demand: at most one Wednesday night per resident, recorded as-needed', () => {
    const rs = threeBamc();
    const { schedule, report } = gen(rs, coverageOnly({ 'PED-D': { min: 1, max: 1 }, 'PED-N': { min: 1, max: 1 } }));
    let total = 0;
    for (const r of rs) {
      const row = Object.entries(schedule[r.id]);
      expect(row.filter(([ds, sid]) => isThuDay(ds, sid)).length).toBe(0);
      const w = row.filter(([ds, sid]) => isWedNight(ds, sid)).length;
      expect(w).toBeLessThanOrEqual(1);
      total += w;
    }
    expect(report.asNeededPlacements.filter(p => p.label === 'BAMC Wednesday night').length).toBe(total);
  });
  it('optional (top-up) pass never uses a Thursday day shift or Wednesday night', () => {
    const cov = coverageOnly({ 'POD-D': { min: 0, max: 1 }, 'POD-N': { min: 0, max: 1 } });
    const { schedule } = gen([bamc()], cov);
    for (const [ds, sid] of Object.entries(schedule.bamc)) {
      if (!sid) continue;
      expect(isThuDay(ds, sid)).toBe(false);
      expect(isWedNight(ds, sid)).toBe(false);
    }
  });
  it('validateAll: a hand-placed Thursday day shift is a hard error; Thursday evening/night is clean', () => {
    const b = bamc();
    const dayIssues = validate([b], { bamc: { [THU]: 'POD-D' } }).filter(i => i.residentId === 'bamc');
    expect(dayIssues.some(i => i.level === 'error' && i.dateStr === THU)).toBe(true);
    expect(dayIssues.find(i => i.rule === 'asNeededException')).toBeUndefined();
    for (const sid of ['POD-E', 'POD-N']) {
      const ok = validate([b], { bamc: { [THU]: sid } }).filter(i => i.residentId === 'bamc' && i.level === 'error' && i.dateStr === THU);
      expect(ok).toEqual([]);
    }
  });
  it('validateAll: one Wednesday night is an as-needed warn; a second is a program-tier error', () => {
    const b = bamc();
    const one = validate([b], { bamc: { [WED]: 'POD-N' } }).filter(i => i.residentId === 'bamc');
    const ex = one.find(i => i.rule === 'asNeededException');
    expect(ex.level).toBe('warn');
    expect(ex.message).toMatch(/BAMC Wednesday night/);
    expect(one.find(i => i.rule === 'bamcWedNight')).toBeUndefined();
    const two = validate([b], { bamc: { [WED]: 'POD-N', '2026-07-15': 'POD-N' } }).filter(i => i.residentId === 'bamc');
    const cap = two.find(i => i.rule === 'bamcWedNight');
    expect(cap).toBeTruthy();
    expect(cap.level).toBe('error');
    expect(countAsNeededExceptions(two)).toBe(2);
  });
});

describe('BAMC: solver payload', () => {
  it('ships only Wednesday-night cells as asNeeded (never Thursday day), plus the cap and night limits', () => {
    const fx = makeFixture('standard');
    const payload = buildSolverPayload({ ...fx, allResidents: [...fx.allResidents, bamc({ id: 'bamc_pl' })] });
    const cells = payload.asNeeded.filter(c => c.residentId === 'bamc_pl');
    const dowOf = c => new Date(c.date + 'T12:00:00').getDay();
    expect(cells.some(c => c.shiftId === 'POD-N' && dowOf(c) === 3)).toBe(true);
    expect(cells.some(c => dowOf(c) === 4 && SHIFT_MAP[c.shiftId].type === 'day')).toBe(false);
    for (const [ds, ids] of Object.entries(payload.eligible.bamc_pl)) {
      if (new Date(ds + 'T12:00:00').getDay() === 4) expect(ids.some(id => SHIFT_MAP[id].type === 'day')).toBe(false);
    }
    expect(payload.eligible.bamc_pl[fx.block.startDate]).toBeDefined();
    const caps = payload.residents.find(r => r.id === 'bamc_pl').caps;
    expect(caps.bamcGrExceptions).toBe(1);
    expect(caps.bamcWedNights).toBe(1);
    expect(caps.nights).toBe(6);
    expect(caps.nightsMax).toBe(12);
  });
});
