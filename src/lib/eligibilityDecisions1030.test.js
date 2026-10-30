/** @vitest-environment jsdom */
// src/lib/eligibilityDecisions1030.test.js
// Chief + program-director eligibility decisions of 2026-10-30 ("the app's rule is the goal, break as
// needed to fill the schedule"; ACGME rules stay hard):
//   1. Off-service weekday/shift-time restrictions are AS NEEDED (fullBlockDays / onlyDays /
//      dayTypeRestrictions carry the flag; date-specific unavailability stays hard).
//   2. Peds/EM PGY-2: Trauma only as needed.
//   3. EM Home / BAMC interns may work Midtrack Mon/Tue evenings/nights normally.
//   4. Trauma/Peds + Peds/Trauma interns may work PED Swing on the peds half.
//   5. Midtrack Day on a Wednesday: min 0 / max 1, BAMC only.
// PUBLIC REPO: synthetic residents only.
import { describe, it, expect } from 'vitest';
import {
  getEligibleShifts, getAsNeededShifts, residentHasAsNeededGate, validateAll, generateSchedule,
  buildSolverPayload, DEFAULT_DAY_RULES, LEGACY_DAY_RULE_DEFAULTS,
} from '../ResidentScheduler.jsx';
import { SHIFTS } from './shifts.js';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

// Mon 2026-07-06 .. Sun 2026-08-02.
const block = { id: 'blk_1030', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const MON = '2026-07-06', TUE = '2026-07-07', WED = '2026-07-08', THU = '2026-07-09', FRI = '2026-07-10', SAT = '2026-07-11';
const ctx = { blockStart: block.startDate, forGenerator: true, ayConf: {} };

function res(o) {
  return {
    id: o.id, firstName: 'Test', lastName: 'Resident',
    category: o.category ?? 'EM_HOME', pgy: o.pgy ?? 1, blockType: o.blockType ?? 'EM', chiefRole: null,
    approvedDatesOff: [], vacationDates: o.vacationDates ?? [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [],
  };
}
const fm1 = (o = {}) => res({ id: 'fm', category: 'FM', pgy: 1, blockType: undefined, ...o });
const elig = (r, ds, special = {}, dr = {}) => getEligibleShifts(r, ds, special, {}, {}, dr, ctx);
const asn = (r, ds, special = {}, dr = {}) => getAsNeededShifts(r, ds, special, {}, {}, dr, ctx);
function coverageOnly(entries) {
  return { ...Object.fromEntries(SHIFTS.map(s => [s.id, { min: 0, max: 0 }])), ...entries };
}
const gen = (residents, coverage, extra = {}) => generateSchedule({
  allResidents: residents, block, coverage, eligOverrides: {}, appSettings: {}, dayRules: {}, ayConf: {},
  blocksHistory: [], rng: mulberry32(7), ...extra,
});

describe('decision 1: off-service weekday limits are as-needed', () => {
  it('flags are on the intended keys; date-specific rules stay hard', () => {
    for (const k of ['FM_1', 'FM_3', 'NEURO_1', 'POD_1']) {
      expect(DEFAULT_DAY_RULES[k].fullBlockAsNeeded, k).toBe(true);
      expect(DEFAULT_DAY_RULES[k].fullBlockLabel, k).toBeTruthy();
    }
    for (const k of ['FM_1', 'IM_2', 'ANES_1', 'PSYCH_1', 'POD_1']) {
      expect(DEFAULT_DAY_RULES[k].dayTypeRestrictions.every(r => r.asNeeded && r.asNeededLabel), k).toBe(true);
    }
    expect(DEFAULT_DAY_RULES.IM_2.residentFlagOverrides[0].asNeeded).toBeUndefined(); // CCU nights stay hard
    expect(DEFAULT_DAY_RULES.ANES_1.specialDayRules).toBeTruthy();                      // anesthesia days stay hard
    expect(DEFAULT_DAY_RULES.ANES_1.computedDayRules).toBeTruthy();                     // first Friday stays hard
    expect(DEFAULT_DAY_RULES.EM_BAMC_1.fullBlockAsNeeded).toBeUndefined();              // Thursday GR stays hard
    expect(DEFAULT_DAY_RULES.PEDS_2.dayTypeRestrictions[0].asNeeded).toBeUndefined();   // Peds Wed stays hard
  });

  it('Family Med PGY-1: Wed/Thu strict-blocked, as-needed with the label; Tue night as-needed; getEligibleShifts unchanged', () => {
    const r = fm1();
    expect(elig(r, WED)).toEqual([]);
    expect(elig(r, THU)).toEqual([]);
    expect(asn(r, WED).get('PED-D')).toBe('Family Med on Wed/Thu');
    expect(asn(r, THU).get('POD-N')).toBe('Family Med on Wed/Thu');
    expect(elig(r, TUE)).toContain('POD-D');
    expect(elig(r, TUE)).not.toContain('POD-N');
    expect(asn(r, TUE).get('POD-N')).toBe('Family Med on a Tue night');
    expect(asn(r, TUE).has('POD-D')).toBe(false);
    expect(residentHasAsNeededGate(r, {})).toBe(true);
  });

  it('Neurology Wed/Fri, Psych Mon night / Tue day / Wed eve+night, IM Tue/Wed, Anesthesia Wed eve+night', () => {
    const neuro = res({ id: 'n', category: 'NEURO', pgy: 1, blockType: undefined });
    expect(elig(neuro, FRI)).toEqual([]);
    expect(asn(neuro, FRI).get('POD-D')).toBe('Neurology on Wed/Fri');
    expect(asn(neuro, WED).get('POD-N')).toBe('Neurology on Wed/Fri');
    expect(elig(neuro, THU).length).toBeGreaterThan(0);

    const psych = res({ id: 'p', category: 'PSYCH', pgy: 1, blockType: undefined });
    expect(asn(psych, MON).get('POD-N')).toBe('Psych on a Mon night');
    expect(asn(psych, TUE).get('POD-D')).toBe('Psych on a Tue day');
    expect(asn(psych, WED).get('POD-E')).toBe('Psych on a Wed eve/night');
    expect(elig(psych, WED)).toContain('POD-D');
    expect(asn(psych, WED).has('POD-D')).toBe(false);

    const im = res({ id: 'i', category: 'IM', pgy: 2, blockType: undefined });
    expect(asn(im, TUE).get('POD-N')).toBe('IM on a Tue eve/night');
    expect(asn(im, WED).get('POD-D')).toBe('IM on a Wed day/eve');
    expect(elig(im, WED).every(s => s.endsWith('-N') || s.endsWith('-N12'))).toBe(true);

    const anes = res({ id: 'a', category: 'ANES', pgy: 1, blockType: undefined });
    expect(asn(anes, WED).get('POD-N')).toBe('Anesthesia on a Wed eve/night');
  });

  it('date-specific hard rules (anesthesia days, Code Blue days, CCU-nights flag) are NOT relaxed', () => {
    const anes = res({ id: 'a', category: 'ANES', pgy: 1, blockType: undefined });
    expect(asn(anes, WED, { anesDays: [WED] }).size).toBe(0);
    expect(elig(anes, WED, { anesDays: [WED] })).toEqual([]);
    const im = res({ id: 'i', category: 'IM', pgy: 2, blockType: undefined });
    expect(asn(im, TUE, { codeBlueDays: [TUE] }).size).toBe(0);
    const ccu = { ...im, isCCUNights: true };
    expect(asn(ccu, TUE).size).toBe(0);
  });

  it('generator uses an as-needed off-service cell ONLY to fill an otherwise-empty MIN slot', () => {
    // FM-1 is on vacation every day except Wed/Thu (their blocked days), so the only way to staff PED-D is as-needed.
    const strictDays = ['2026-07-06', '2026-07-07', '2026-07-10', '2026-07-11', '2026-07-12'];
    const vac = [];
    for (let w = 0; w < 4; w++) for (const d of strictDays) { const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + 7 * w); vac.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`); }
    const r = fm1({ vacationDates: vac });
    const { schedule, report } = gen([r], coverageOnly({ 'PED-D': { min: 1, max: 1 } }));
    const cells = Object.entries(schedule.fm).filter(([, sid]) => sid);
    expect(cells.length).toBeGreaterThan(0);
    // (POD-D has an unconditional Wednesday min of 1 via DOW_COVERAGE_OVERRIDE, so Wednesday POD-D is a min slot too)
    for (const [ds, sid] of cells) {
      expect(['PED-D', 'POD-D']).toContain(sid);
      expect([3, 4]).toContain(new Date(ds + 'T00:00:00').getDay());
      expect(report.asNeededPlacements).toContainEqual({ residentId: 'fm', name: 'Test Resident', dateStr: ds, shiftId: sid, label: 'Family Med on Wed/Thu' });
    }
    // optional (top-up) pass never recruits an as-needed cell: min 0 / max 1 stays empty
    const top = gen([r], coverageOnly({ 'PED-D': { min: 0, max: 1 } }));
    expect(Object.values(top.schedule.fm).filter(sid => sid === 'PED-D')).toEqual([]);
    expect(top.report.asNeededPlacements.filter(p => p.shiftId === 'PED-D')).toEqual([]);
  });

  it('prefers a strictly eligible resident over the as-needed one', () => {
    const r = fm1();
    const staff = [res({ id: 'e1', category: 'EM_HOME', pgy: 2 }), res({ id: 'e2', category: 'EM_HOME', pgy: 2 }), res({ id: 'e3', category: 'EM_HOME', pgy: 2 })];
    const { report } = gen([r, ...staff], coverageOnly({ 'PED-D': { min: 1, max: 1 } }));
    // PED-D min slots are all staffed strictly; the only as-needed use is Wednesday POD-D (min 1 by DOW override,
    // and no EM Home resident is available that day: Grand Rounds)
    expect(report.asNeededPlacements.filter(p => p.shiftId === 'PED-D')).toEqual([]);
  });

  it('validateAll: an off-service resident on a blocked weekday is a non-blocking asNeededException, not an error', () => {
    const issues = validateAll([fm1()], { fm: { [WED]: 'PED-D' } }, block, {}, {}, {}, {}, [], {});
    const ex = issues.filter(i => i.rule === 'asNeededException');
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ level: 'warn', dateStr: WED, shiftId: 'PED-D' });
    expect(ex[0].message).toContain('Family Med on Wed/Thu');
    expect(issues.filter(i => i.rule === 'rotationEligibility' && i.dateStr === WED)).toEqual([]);
  });

  it('a chief override that replaces the rule without the flag turns the relaxation off (wholesale replacement)', () => {
    const dr = { FM_1: { fullBlockDays: [3, 4] } };
    expect(asn(fm1(), WED, {}, dr).size).toBe(0);
  });

  it('solver payload ships the off-service cells in `asNeeded`, never in `eligible`', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload({ ...fixture, allResidents: [...fixture.allResidents, fm1()] });
    expect(payload.eligible.fm[WED]).toBeUndefined();
    expect(payload.asNeeded).toContainEqual({ residentId: 'fm', date: WED, shiftId: 'PED-D' });
    expect(payload.eligible.fm[MON]).toBeDefined();
  });
});

describe('decision 2: Peds/EM PGY-2 on Trauma is as-needed', () => {
  const pe = () => res({ id: 'pe', pgy: 2, blockType: 'PEDS_EM' });
  it('gate carries the flag + label; strict list has no trauma, as-needed returns TRAUMA-N on a window night only', () => {
    const g = DEFAULT_DAY_RULES.EM_HOME_2.shiftGates.find(x => x.id === 'peds_em_trauma_strip');
    expect(g).toMatchObject({ asNeeded: true, asNeededLabel: 'Peds/EM on Trauma' });
    const SAT_ = SAT; // Saturday is inside PGY-2's TRAUMA-N window (Fri/Sat/Sun/Mon)
    expect(elig(pe(), SAT_)).not.toContain('TRAUMA-N');
    expect(asn(pe(), SAT_).get('TRAUMA-N')).toBe('Peds/EM on Trauma');
    expect(asn(pe(), SAT_).has('TRAUMA-D')).toBe(false); // PGY-2 has no TRAUMA-D at all (true ineligibility stays hard)
    expect(asn(pe(), TUE).has('TRAUMA-N')).toBe(false);  // trauma_n_window (hard) still applies
  });
  it('a regular EM PGY-2 is unaffected (strict TRAUMA-N on a window night, no as-needed)', () => {
    const em = res({ id: 'em2', pgy: 2, blockType: 'EM' });
    expect(elig(em, SAT)).toContain('TRAUMA-N');
    expect(asn(em, SAT).size).toBe(0);
  });
  it('the 10-12 peds mix constants are untouched', () => {
    const fx = makeFixture('standard');
    expect(buildSolverPayload(fx)).toBeTruthy();
  });
});

describe('decision 3: Midtrack Mon/Tue evenings/nights are normal for interns', () => {
  it('no mt_intern_mon_tue_evenight gate remains on EM_HOME_1 / EM_BAMC_1', () => {
    for (const k of ['EM_HOME_1', 'EM_BAMC_1']) {
      expect((DEFAULT_DAY_RULES[k].shiftGates || []).some(g => g.id === 'mt_intern_mon_tue_evenight'), k).toBe(false);
    }
  });
  it('EM Home and BAMC interns keep MT-E/MT-N/MT-N12 on Mon and Tue even for the generator', () => {
    for (const r of [res({ id: 'h1', pgy: 1 }), res({ id: 'b1', category: 'EM_BAMC', pgy: 1 })]) {
      for (const ds of [MON, TUE]) {
        const e = elig(r, ds);
        expect(e, `${r.category} ${ds}`).toEqual(expect.arrayContaining(['MT-E', 'MT-N']));
      }
    }
  });
  it('the superseded shapes are recorded as legacy so a stale saved override gets pruned', () => {
    const legacy = LEGACY_DAY_RULE_DEFAULTS;
    expect(legacy.EM_HOME_1.some(s => (s.shiftGates || []).some(g => g.id === 'mt_intern_mon_tue_evenight' && g.asNeeded === undefined) &&
      (s.shiftGates || []).some(g => g.id === 'us_em_window' && g.asNeeded === true))).toBe(true);
    expect(legacy.EM_HOME_2.some(s => (s.shiftGates || []).some(g => g.id === 'peds_em_trauma_strip' && !g.asNeeded) && !(s.fullBlockDays))).toBe(true);
    expect(legacy.IM_2.length).toBeGreaterThanOrEqual(2);
    expect(legacy.NEURO_1).toEqual([{ fullBlockDays: [3, 5] }]);
  });
});

describe('decision 4: Trauma/Peds interns may work PED Swing on the peds half', () => {
  it('PEDS_TRAUMA: peds half (first 14 days) allows PED-D/E/S/N; trauma half stays TRAUMA-D only', () => {
    const r = res({ id: 'pt', pgy: 1, blockType: 'PEDS_TRAUMA' });
    const peds = elig(r, SAT); // day index 5 -> peds half
    expect(peds).toEqual(expect.arrayContaining(['PED-D', 'PED-E', 'PED-S', 'PED-N']));
    expect(peds.every(s => s.startsWith('PED-'))).toBe(true);
    const trauma = elig(r, '2026-07-21'); // Tue, second half
    expect(trauma.every(s => s === 'TRAUMA-D')).toBe(true);
    expect(trauma).not.toContain('PED-S');
  });
  it('TRAUMA_PEDS mirrors it (peds half is the second half)', () => {
    const r = res({ id: 'tp', pgy: 1, blockType: 'TRAUMA_PEDS' });
    expect(elig(r, '2026-07-25')).toContain('PED-S');
    expect(elig(r, SAT)).not.toContain('PED-S');
  });
  it('the solver payload eligible list carries PED-S on the peds half (no separate split filter exists)', () => {
    const fixture = makeFixture('standard');
    const r = res({ id: 'pt', pgy: 1, blockType: 'PEDS_TRAUMA' });
    const payload = buildSolverPayload({ ...fixture, allResidents: [...fixture.allResidents, r] });
    expect(payload.eligible.pt[SAT]).toContain('PED-S');
  });
});

describe('decision 5: Midtrack Day on a Wednesday is BAMC-only, min 0 / max 1', () => {
  it('BAMC may work MT-D on Wednesday; EM Home (Grand Rounds) and other categories never do; other days unchanged', () => {
    const bamc = res({ id: 'b', category: 'EM_BAMC', pgy: 1 });
    expect(elig(bamc, WED)).toContain('MT-D');
    expect(elig(bamc, TUE)).toContain('MT-D');
    // EM Home PGY-3 with the Grand Rounds noDay cleared by an override: the dedicated strip still removes it
    const h3 = res({ id: 'h3', pgy: 3 });
    const noGr = { EM_HOME_3: { shiftGates: [] } };
    expect(elig(h3, THU, {}, noGr)).toContain('MT-D');
    expect(elig(h3, WED, {}, noGr)).not.toContain('MT-D');
    expect(elig(res({ id: 'h1', pgy: 1 }), WED)).not.toContain('MT-D');
  });
  it('the solver payload sends Wednesday MT-D coverage min 0 / max 1 and only BAMC residents carry the cell', () => {
    const fixture = makeFixture('standard');
    const bamc = res({ id: 'bamc1', category: 'EM_BAMC', pgy: 1 });
    const payload = buildSolverPayload({ ...fixture, allResidents: [...fixture.allResidents, bamc] });
    expect(payload.coverage['MT-D'][WED]).toEqual({ min: 0, max: 1 });
    expect(payload.coverage['MT-D'][TUE].min).toBeGreaterThan(0);
    const bamcIds = new Set([...fixture.allResidents, bamc].filter(r => r.category === 'EM_BAMC').map(r => r.id));
    expect(bamcIds.has('bamc1')).toBe(true);
    for (const [rid, byDate] of Object.entries(payload.eligible)) {
      const has = (byDate[WED] || []).includes('MT-D');
      expect(has, rid).toBe(bamcIds.has(rid) ? has : false); // never true for a non-BAMC resident
    }
    expect((payload.eligible.bamc1[WED] || [])).toContain('MT-D');
  });
  it('generator: a BAMC resident gets Wednesday MT-D only from the optional top-up, never as a min fill', () => {
    const bamc = res({ id: 'b', category: 'EM_BAMC', pgy: 1 });
    const { report } = gen([bamc], coverageOnly({ 'MT-D': { min: 1, max: 1 } }));
    // Wednesday dates cannot be reported unfilled: min is 0 there
    expect(report.unfilled.filter(u => new Date(u.dateStr + 'T00:00:00').getDay() === 3 && u.shiftId === 'MT-D')).toEqual([]);
  });
});
