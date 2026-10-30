/** @vitest-environment jsdom */
// src/lib/asNeeded.test.js
// Program decision 2026-10-30: some rules are "the goal, but break as needed to fill the schedule".
// A day-rule shiftGate flagged `asNeeded: true` (first consumer: us_em_window, US/EM interns outside
// Sat/Sun/Mon) keeps stripping in getEligibleShifts, but getAsNeededShifts returns what ONLY those gates
// withheld; the generator may use those cells ONLY to fill a coverage MINIMUM (never the optional
// top-up pass), validateAll turns the rotationEligibility error into a visible, non-blocking
// `asNeededException` warn, and buildSolverPayload ships the cells in a separate `asNeeded` list.
// PUBLIC REPO: synthetic residents only.
import { describe, it, expect } from 'vitest';
import {
  getEligibleShifts, getAsNeededShifts, residentHasAsNeededGate, collectAsNeededPlacements, validateAll,
  generateSchedule, buildSolverPayload, mapSolverResult, countBlockingWarns, DEFAULT_DAY_RULES,
} from '../ResidentScheduler.jsx';
import { SHIFTS } from './shifts.js';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';
import { computeQualityVector, FAIRNESS_AXIS_WEIGHTS, fairnessAxesTotal } from './scheduleQuality.js';

const LABEL = 'US/EM outside Sat/Sun/Mon';
// Mon 2026-07-06 .. Sun 2026-08-02 (28 days). Tuesday = 07-07, Wednesday = 07-08, Friday = 07-10.
const block = { id: 'blk_asneeded', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const TUE = '2026-07-07';
const WED = '2026-07-08';
const MON = '2026-07-06';
const SAT = '2026-07-11';

function res(o) {
  return {
    id: o.id, firstName: o.firstName ?? 'Test', lastName: 'Resident',
    category: o.category ?? 'EM_HOME', pgy: o.pgy ?? 1, blockType: o.blockType ?? 'EM', chiefRole: null,
    approvedDatesOff: [], vacationDates: o.vacationDates ?? [], jeopardyDates: o.jeopardyDates ?? [],
    jcPresentDates: [], grLectureDates: [],
  };
}
const usEm = (o = {}) => res({ id: 'usem', blockType: 'US_EM', ...o });
const ctx = { blockStart: block.startDate, forGenerator: true, ayConf: {} };
const elig = (r, ds, appSettings = {}) => getEligibleShifts(r, ds, {}, {}, appSettings, {}, ctx);
const asNeeded = (r, ds, appSettings = {}) => getAsNeededShifts(r, ds, {}, {}, appSettings, {}, ctx);

// Coverage where ONLY the named shifts have headcount (everything else {0,0}).
function coverageOnly(entries) {
  const cov = Object.fromEntries(SHIFTS.map(s => [s.id, { min: 0, max: 0 }]));
  return { ...cov, ...entries };
}
// Every Sat/Sun/Mon date in the block (the preferred US/EM window).
function windowDates() {
  const out = [];
  for (let d = new Date(2026, 6, 6); d <= new Date(2026, 7, 2); d.setDate(d.getDate() + 1)) {
    if ([0, 1, 6].includes(d.getDay())) out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}
const gen = (residents, coverage, extra = {}) => generateSchedule({
  allResidents: residents, block, coverage, eligOverrides: {}, appSettings: {}, dayRules: {}, ayConf: {},
  blocksHistory: [], rng: mulberry32(7), ...extra,
});

describe('as-needed gate data', () => {
  it('us_em_window is flagged asNeeded with the human label; other gates are not', () => {
    const gates = DEFAULT_DAY_RULES.EM_HOME_1.shiftGates;
    const g = gates.find(x => x.id === 'us_em_window');
    expect(g.asNeeded).toBe(true);
    expect(g.asNeededLabel).toBe(LABEL);
    expect(gates.filter(x => x.id !== 'us_em_window').every(x => !x.asNeeded)).toBe(true);
  });
  it('residentHasAsNeededGate is true only for a resident the gate actually filters in', () => {
    expect(residentHasAsNeededGate(usEm(), {})).toBe(true);
    expect(residentHasAsNeededGate(res({ id: 'em', blockType: 'EM' }), {})).toBe(false);
    expect(residentHasAsNeededGate(res({ id: 'p2', pgy: 2 }), {})).toBe(false);
  });
});

describe('getAsNeededShifts', () => {
  it('getEligibleShifts is unchanged: the US/EM intern is still blocked outside Sat/Sun/Mon', () => {
    expect(elig(usEm(), TUE)).toEqual([]);
    expect(elig(usEm(), SAT).length).toBeGreaterThan(0);
  });
  it('returns the day-rule-withheld shifts, labelled, on a non-window weekday', () => {
    const m = asNeeded(usEm(), TUE);
    expect(m.get('MT-D')).toBe(LABEL);
    expect(m.get('POD-N')).toBe(LABEL);
    // disjoint from the strict set by construction
    for (const s of elig(usEm(), TUE)) expect(m.has(s)).toBe(false);
    // shiftActiveOnDow still holds: TRAUMA-D only runs Sun/Tue/Thu/Sat but PGY-1 on a plain EM-US/EM
    // rotation is not on a trauma block, so it must NOT leak through the as-needed relax either
    expect(m.has('TRAUMA-D')).toBe(false);
  });
  it('another hard rule blocking the shift keeps it OUT (Grand Rounds Wednesday = no EM Home day shifts)', () => {
    const m = asNeeded(usEm(), WED);
    expect(m.has('MT-D')).toBe(false);
    expect(m.has('POD-D')).toBe(false);
    expect(m.get('MT-E')).toBe(LABEL); // eve/night on Wednesday remain workable
  });
  it('vacation, and jeopardy under policy "block", keep every shift out', () => {
    expect(asNeeded(usEm({ vacationDates: [TUE] }), TUE).size).toBe(0);
    const jeo = usEm({ jeopardyDates: [TUE] });
    expect(asNeeded(jeo, TUE, { jeopardyPolicy: 'block' }).size).toBe(0);
    expect(asNeeded(jeo, TUE, { jeopardyPolicy: 'warn' }).size).toBeGreaterThan(0); // pool/validator handle 'warn' separately
  });
  it('Monday NIGHT (excluded even inside the window) is as-needed; Monday day shifts stay strict', () => {
    const r = usEm();
    expect(elig(r, MON)).toContain('POD-D');
    expect(elig(r, MON)).not.toContain('POD-N');
    expect(asNeeded(r, MON).get('POD-N')).toBe(LABEL);
    expect(asNeeded(r, MON).has('POD-D')).toBe(false);
  });
  it('a resident with no asNeeded gate gets an empty Map and no extra evaluation', () => {
    expect(asNeeded(res({ id: 'em', blockType: 'EM' }), TUE).size).toBe(0);
    expect(asNeeded(res({ id: 'p2', pgy: 2 }), TUE).size).toBe(0);
  });
  it('a chief override that replaces the gate list without the flag turns the mechanism off', () => {
    const dayRules = { EM_HOME_1: { shiftGates: [{ id: 'us_em_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['US_EM'] }, allowedDays: [0, 1, 6], outsideAction: 'blockEntireDay', overrideImmune: true }] } };
    expect(getAsNeededShifts(usEm(), TUE, {}, {}, {}, dayRules, ctx).size).toBe(0);
  });
});

describe('generator: asNeededFallback stage', () => {
  const intern = () => usEm({ vacationDates: windowDates() }); // no preferred day is workable
  const MT = coverageOnly({ 'MT-D': { min: 1, max: 1 } });

  it('uses an as-needed intern when a MINIMUM slot is otherwise empty, records it, and honours target 5', () => {
    const r = intern();
    const { schedule, report } = gen([r], MT);
    const cells = Object.entries(schedule.usem).filter(([, sid]) => sid);
    expect(cells.length).toBe(5); // total stays 5 shifts
    expect(report.asNeededPlacements).toHaveLength(5);
    for (const [ds, sid] of cells) {
      expect([0, 1, 6]).not.toContain(new Date(ds + 'T00:00:00').getDay()); // never the (vacationed) window
      expect(new Date(ds + 'T00:00:00').getDay()).not.toBe(3);              // GR Wednesday day shift stays blocked
      expect(report.asNeededPlacements).toContainEqual({ residentId: 'usem', name: 'Test Resident', dateStr: ds, shiftId: sid, label: LABEL });
    }
    // everything else is just a coverage hole, not a rule break
    expect(report.unfilled.length).toBeGreaterThan(0);
  });

  it('never uses an as-needed cell in the OPTIONAL (top-up) pass: min 0 / max 1 stays empty', () => {
    const r = intern();
    const { schedule, report } = gen([r], coverageOnly({ 'MT-D': { min: 0, max: 1 } }));
    expect(Object.values(schedule.usem).filter(Boolean)).toEqual([]);
    expect(report.asNeededPlacements).toEqual([]);
  });

  it('prefers a strictly eligible resident: with enough normal staff no as-needed cell is used', () => {
    const staff = ['a', 'b', 'c'].map(id => res({ id, pgy: 2, category: 'EM_HOME', blockType: 'EM' }));
    const { schedule, report } = gen([intern(), ...staff], MT);
    expect(report.asNeededPlacements).toEqual([]);
    expect(Object.values(schedule.usem).filter(Boolean)).toEqual([]);
  });

  it('does not touch a hand-kept (pre-existing) as-needed cell in the placements log', () => {
    const r = intern();
    const kept = { usem: { [TUE]: 'MT-D' } };
    const { schedule, report } = gen([r], MT, { block: { ...block, schedule: kept } });
    expect(schedule.usem[TUE]).toBe('MT-D');
    expect(report.asNeededPlacements.find(p => p.dateStr === TUE)).toBeUndefined();
  });

  it('collectAsNeededPlacements agrees with the generator log', () => {
    const r = intern();
    const { schedule, report } = gen([r], MT);
    const again = collectAsNeededPlacements({ allResidents: [r], schedule, block });
    expect(again.map(p => `${p.dateStr}|${p.shiftId}`).sort()).toEqual(report.asNeededPlacements.map(p => `${p.dateStr}|${p.shiftId}`).sort());
  });
});

describe('validateAll: asNeededException', () => {
  const run = (r, schedule) => validateAll([r], schedule, block, {}, {}, {}, {}, [], {});

  it('warns (not errors) for a shift withheld only by the as-needed gate, with the label in the message', () => {
    const issues = run(usEm(), { usem: { [TUE]: 'MT-D' } });
    const ex = issues.filter(i => i.rule === 'asNeededException');
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ level: 'warn', residentId: 'usem', dateStr: TUE, shiftId: 'MT-D', message: `${LABEL} — used to fill coverage (as needed)` });
    expect(issues.filter(i => i.rule === 'rotationEligibility' && i.dateStr === TUE)).toEqual([]);
    expect(issues.filter(i => i.dateStr === TUE && i.level === 'error')).toEqual([]);
  });
  it('is NOT export-blocking and not counted by countBlockingWarns', () => {
    const issues = run(usEm(), { usem: { [TUE]: 'MT-D' } });
    const asn = issues.filter(i => i.rule === 'asNeededException');
    expect(countBlockingWarns(asn, undefined)).toBe(0);
  });
  it('a shift another hard rule blocks (Wednesday GR day shift) is still an error', () => {
    const issues = run(usEm(), { usem: { [WED]: 'MT-D' } });
    expect(issues.filter(i => i.rule === 'asNeededException')).toEqual([]);
    expect(issues.some(i => i.dateStr === WED && i.level === 'error')).toBe(true);
  });
  it('a strictly eligible window day produces no exception', () => {
    const issues = run(usEm(), { usem: { [SAT]: 'MT-D' } });
    expect(issues.filter(i => i.rule === 'asNeededException')).toEqual([]);
  });
});

describe('ranking: asNeededUse lives in the existing last quality slot', () => {
  it('weight 40 on the fairness+shape axis, still a 4-slot vector (no 5th slot)', () => {
    expect(FAIRNESS_AXIS_WEIGHTS.asNeededUse).toBe(40);
    expect(fairnessAxesTotal({ asNeededUse: 2 })).toBe(80);
    const base = { coverageMiss: 0, seniorGaps: 0, restCompromises: 0 };
    const v0 = computeQualityVector({ ...base }, ['coverageMin', 'seniorComposition', 'postNightRest']);
    const v2 = computeQualityVector({ ...base, asNeededUse: 2 }, ['coverageMin', 'seniorComposition', 'postNightRest']);
    expect(v2).toHaveLength(4);
    expect(v2.slice(0, 3)).toEqual(v0.slice(0, 3));
    expect(v2[3] - v0[3]).toBe(80);
  });
});

describe('buildSolverPayload / mapSolverResult', () => {
  it('ships as-needed cells in a separate `asNeeded` list, never inside `eligible`', () => {
    const fixture = makeFixture('standard');
    const intern = usEm({ id: 'usem_pl' });
    const payload = buildSolverPayload({ ...fixture, allResidents: [...fixture.allResidents, intern] });
    expect(payload.eligible.usem_pl[TUE]).toBeUndefined();
    expect(payload.asNeeded).toContainEqual({ residentId: 'usem_pl', date: TUE, shiftId: 'MT-D' });
    expect(payload.asNeeded.filter(c => c.residentId === 'usem_pl').length).toBeGreaterThan(0); // (BAMC residents also ship Thu-day/Wed-night cells)
    expect(payload.asNeeded.some(c => c.date === TUE && c.shiftId === 'MT-D')).toBe(true);
    // Wednesday day shifts (GR) are not as-needed
    expect(payload.asNeeded.find(c => c.date === WED && c.shiftId === 'MT-D')).toBeUndefined();
    // preferred window stays strict
    expect(payload.eligible.usem_pl[SAT]).toContain('MT-D');
    expect(payload.asNeeded.find(c => c.date === SAT && c.shiftId === 'MT-D')).toBeUndefined();
    expect(JSON.stringify(payload)).not.toMatch(/"(name|firstName|lastName)":/); // ids only
  });
  it('omits the field entirely when no resident carries an asNeeded gate', () => {
    const fx = makeFixture('standard');
    // BAMC PGY-1s carry the Thu-day / Wed-night as-needed gates (2026-10-30) — drop them for the "no gate" case.
    expect(buildSolverPayload({ ...fx, allResidents: fx.allResidents.filter(r => r.category !== 'EM_BAMC') }).asNeeded).toBeUndefined();
  });
  it('mapSolverResult derives report.asNeededPlacements from the returned schedule (kept cells excluded)', () => {
    const r = usEm({ id: 'usem_pl' });
    const json = { status: 'OPTIMAL', schedule: { usem_pl: { [TUE]: 'MT-D', [SAT]: 'MT-D' } } };
    const out = mapSolverResult(json, { block: { ...block, schedule: { usem_pl: {} } }, allResidents: [r] });
    expect(out.report.asNeededPlacements).toEqual([{ residentId: 'usem_pl', name: 'Test Resident', dateStr: TUE, shiftId: 'MT-D', label: LABEL }]);
    const kept = mapSolverResult(json, { block: { ...block, schedule: { usem_pl: { [TUE]: 'MT-D' } } }, allResidents: [r] });
    expect(kept.report.asNeededPlacements).toEqual([]);
  });
});
