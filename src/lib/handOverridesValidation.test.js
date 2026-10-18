// Integration: a hand-placed TRAUMA-D on an EM-rotation PGY-1 (traumaDayRotationGuard, program
// tier) is a hard error until a confirmed block.handOverrides entry covers that exact cell+shift;
// then it is a flagged, non-export-blocking warn. Vacation can never be overridden.
import { describe, it, expect } from 'vitest';
import { validateAll, cellViolations, buildSolverPayload } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const TUE = '2026-07-07';

function setup() {
  const f = makeFixture('standard');
  const alpha = f.allResidents.find(r => r.id === 'syn_alpha');
  const res = { ...alpha, blockType: 'EM' };
  const all = [res, ...f.allResidents.filter(r => r.id !== res.id)];
  const schedule = { ...(f.block.schedule || {}), [res.id]: { [TUE]: 'TRAUMA-D' } };
  const run = (block) => validateAll(all, block.schedule || schedule, block, f.eligOverrides, f.appSettings, f.dayRules, f.coverage || {}, [], f.ayConf || {});
  const hit = issues => issues.find(i => i.residentId === res.id && i.dateStr === TUE && i.shiftId === 'TRAUMA-D' && i.rule === 'traumaDayRotationGuard');
  return { f, res, all, schedule, run, hit };
}
const entry = { shiftId: 'TRAUMA-D', ruleIds: ['traumaDayRotationGuard'], note: 'n', at: 'T', by: 'x@y.z' };

describe('hand overrides in validateAll / cellViolations', () => {
  it('baseline: no override -> hard error', () => {
    const { f, schedule, run, hit } = setup();
    expect(hit(run({ ...f.block, schedule })).level).toBe('error');
  });
  it('covered by a live entry -> flagged warn, overridden, program-tier id (not export-blocking)', () => {
    const { f, res, schedule, run, hit } = setup();
    const i = hit(run({ ...f.block, schedule, handOverrides: { [res.id]: { [TUE]: entry } } }));
    expect(i.level).toBe('warn');
    expect(i.overridden).toBe(true);
    expect(i.message).toMatch(/^Overridden: /);
    expect(i.rule).toBe('traumaDayRotationGuard');
  });
  it('stale shiftId (cell holds a different shift now) -> entry ignored', () => {
    const { f, res, schedule, run, hit } = setup();
    const stale = { [res.id]: { [TUE]: { ...entry, shiftId: 'POD-D' } } };
    expect(hit(run({ ...f.block, schedule, handOverrides: stale })).level).toBe('error');
  });
  it('an entry cannot excuse an unbreakable rule (vacation)', () => {
    const { f, res, all, schedule } = setup();
    const vac = { ...res, vacationDates: [TUE] };
    const allV = [vac, ...all.filter(r => r.id !== res.id)];
    const ho = { [res.id]: { [TUE]: { ...entry, ruleIds: ['traumaDayRotationGuard', 'vacation'] } } };
    const issues = validateAll(allV, schedule, { ...f.block, schedule, handOverrides: ho }, f.eligOverrides, f.appSettings, f.dayRules, f.coverage || {}, [], f.ayConf || {});
    expect(issues.find(i => i.rule === 'vacation' && i.residentId === res.id).level).toBe('error');
  });
  it('cellViolations: hypothetical placement is an error; with a live entry it reads as a warn', () => {
    const { f, res, all } = setup();
    const empty = { ...f.block, schedule: { [res.id]: {} } };
    const args = [f.eligOverrides, f.appSettings, f.dayRules, f.ayConf || {}, {}, null, {}, all, []];
    const v0 = cellViolations(res, TUE, 'TRAUMA-D', empty, ...args).find(v => v.rule === 'traumaDayRotationGuard');
    expect(v0.level).toBe('error');
    const placed = { ...f.block, schedule: { [res.id]: { [TUE]: 'TRAUMA-D' } }, handOverrides: { [res.id]: { [TUE]: entry } } };
    const v1 = cellViolations(res, TUE, 'TRAUMA-D', placed, ...args).find(v => v.rule === 'traumaDayRotationGuard');
    expect(v1).toMatchObject({ level: 'warn', overridden: true });
  });
  it('solver payload: traumaDay override is safe; a constraint-bound override makes buildSolverPayload throw', () => {
    const { f, res, all, schedule } = setup();
    const base = { allResidents: all, coverage: f.coverage || {}, eligOverrides: f.eligOverrides, appSettings: f.appSettings, dayRules: f.dayRules, blocksHistory: [], ayConf: f.ayConf || {} };
    const safe = { ...f.block, schedule, handOverrides: { [res.id]: { [TUE]: entry } } };
    expect(() => buildSolverPayload({ ...base, block: safe })).not.toThrow();
    const unsafe = { ...f.block, schedule, handOverrides: { [res.id]: { [TUE]: { ...entry, ruleIds: ['nightRunMax'] } } } };
    expect(() => buildSolverPayload({ ...base, block: unsafe })).toThrow(/hand override/);
    // trauma-cap subject (EM Home PGY-2/3): a locked TRAUMA-D could bind caps.trauma -> skip too
    const capRes = { ...res, pgy: 2 };
    const capAll = [capRes, ...all.filter(r => r.id !== res.id)];
    expect(() => buildSolverPayload({ ...base, allResidents: capAll, block: safe })).toThrow(/hand override/);
    const stale = { ...f.block, schedule, handOverrides: { [res.id]: { [TUE]: { ...entry, shiftId: 'POD-D', ruleIds: ['nightRunMax'] } } } };
    expect(() => buildSolverPayload({ ...base, block: stale })).not.toThrow();
  });
});
