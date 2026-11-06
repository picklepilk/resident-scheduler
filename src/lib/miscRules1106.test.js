/** @vitest-environment jsdom */
// Chief decisions 2026-11-06: JC cap counts unpublished earlier blocks; peds-mix > max is an
// acknowledge-before-export rule; per-block payback allowance raises the over-target ceiling.
import { describe, it, expect } from 'vitest';
import { validateAll, getShiftTarget, getShiftCeiling, countPublishedJC, buildSolverPayload } from '../ResidentScheduler.jsx';
import { OVERRIDE_TIER_RULE_IDS, RULE_POLICY } from './rulePolicy.js';
import { OPTIONAL_SNAPSHOT_FIELDS } from './snapshotCompare.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const AY = 'AY26/27';
const block = { id: 'cur', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: AY, specialDays: {} };
const ayConf = { ...makeFixture('standard').ayConf, jcDates: ['2026-09-01', '2026-10-06'] };
const base = { firstName: 'T', lastName: 'R', approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [] };

describe('JC count includes unpublished earlier blocks (same AY)', () => {
  // 2026-06 first Tuesday = 2026-06-02 would be AY25/26; use AY26/27 block earlier in AY: 2026-07 block is first.
  const mkSnap = (id, published, ay) => ({
    id, published, academicYear: ay, startDate: '2026-09-01', endDate: '2026-09-28',
    data: { academicYear: ay, startDate: '2026-09-01', endDate: '2026-09-28', schedule: { r1: { '2026-09-01': 'POD-E', '2026-09-02': 'POD-D' } } },
  });
  it('unpublished snapshot counts', () => {
    const n = countPublishedJC('r1', AY, [mkSnap('a', false, AY)], 'cur', ayConf);
    const pub = countPublishedJC('r1', AY, [mkSnap('a', true, AY)], 'cur', ayConf);
    expect(n).toBeGreaterThan(0);
    expect(n).toBe(pub);
  });
  it('other AY and the current block id are excluded', () => {
    const pub = countPublishedJC('r1', AY, [mkSnap('a', true, AY)], 'cur', ayConf);
    expect(countPublishedJC('r1', AY, [mkSnap('b', false, 'AY25/26')], 'cur', ayConf)).toBe(0);
    expect(countPublishedJC('r1', AY, [mkSnap('cur', false, AY)], 'cur', ayConf)).toBe(0);
    expect(pub).toBeGreaterThanOrEqual(0);
  });
});

describe('peds/EM mix above max is acknowledge-before-export', () => {
  const r = { ...base, id: 'pe', category: 'EM_HOME', pgy: 2, blockType: 'PEDS_EM' };
  const days = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`2026-07-${String(6 + i + Math.floor(i / 5) * 2).padStart(2, '0')}`, 'PED-D']));
  const run = (n) => validateAll([r], { pe: days(n) }, block, {}, {}, {}, {}, [], ayConf).filter(i => i.rule === 'pedsMixMax' || /Peds\/EM mix/.test(i.message));
  it('rule is override tier (export-blocking until acknowledged)', () => {
    expect(RULE_POLICY.pedsMixMax.tier).toBe('override');
    expect(OVERRIDE_TIER_RULE_IDS).toContain('pedsMixMax');
  });
  it('13 peds shifts raises pedsMixMax; 12 does not', () => {
    expect(run(13).map(i => i.rule)).toContain('pedsMixMax');
    expect(run(12).filter(i => i.rule === 'pedsMixMax')).toHaveLength(0);
  });
  it('below 10 stays a plain rule-less warning', () => {
    const w = run(4).filter(i => /Peds\/EM mix/.test(i.message));
    // under-min only warns once total >= target; with 4 shifts it is silent either way, never pedsMixMax
    expect(w.filter(i => i.rule === 'pedsMixMax')).toHaveLength(0);
  });
});

describe('payback allowance raises the over-target ceiling', () => {
  const mk = (extra) => ({ ...base, id: 'x', category: 'EM_HOME', pgy: 3, blockType: 'EM', ...extra });
  const sched = (n) => ({ x: Object.fromEntries(Array.from({ length: n }, (_, i) => [`2026-07-${String(6 + i + Math.floor(i / 5) * 2).padStart(2, '0')}`, 'POD-D'])) });
  it('getShiftCeiling = target + allowance; target unchanged', () => {
    const r0 = mk({}); const r2 = mk({ paybackAllowance: 2 });
    const t = getShiftTarget(r0, {});
    expect(getShiftCeiling(r0, {})).toBe(t);
    expect(getShiftTarget(r2, {})).toBe(t);
    expect(getShiftCeiling(r2, {})).toBe(t + 2);
    expect(getShiftCeiling(mk({ paybackAllowance: -3 }), {})).toBe(t);
    expect(getShiftCeiling(mk({ paybackAllowance: 'abc' }), {})).toBe(t);
  });
  it('validator warns over target only beyond target + N', () => {
    const t = getShiftTarget(mk({}), {});
    const over = (r, n) => validateAll([r], sched(n), block, {}, {}, {}, {}, [], ayConf).filter(i => i.rule === 'overTarget');
    expect(over(mk({}), t + 1)).toHaveLength(1);
    expect(over(mk({ paybackAllowance: 2 }), t + 2)).toHaveLength(0);
    expect(over(mk({ paybackAllowance: 2 }), t + 3)).toHaveLength(1);
  });
  it('solver payload carries caps.targetCeiling only when allowance > 0', () => {
    const fixture = makeFixture('standard');
    const rid = fixture.allResidents.find(x => x.id === 'syn_mike');
    const p0 = buildSolverPayload(fixture);
    expect(p0.residents.find(x => x.id === 'syn_mike').caps.targetCeiling ?? null).toBeNull();
    const fx2 = { ...fixture, allResidents: fixture.allResidents.map(x => x.id === 'syn_mike' ? { ...x, paybackAllowance: 2 } : x) };
    const p2 = buildSolverPayload(fx2);
    const t = p2.residents.find(x => x.id === 'syn_mike').target;
    expect(p2.residents.find(x => x.id === 'syn_mike').caps.targetCeiling).toBe(t + 2);
    expect(rid).toBeTruthy();
  });
});
