/** @vitest-environment jsdom */
// src/lib/solverShortlist.test.js
// em-scheduler port (2026-11-04): solver `report.shortlist` candidates are mapped through
// mapSolverResult and re-ranked with betterQuality inside pickEngineResult. No Python: the solver
// response is fabricated from real local schedules (a good one and degraded copies of it).
import { describe, it, expect } from 'vitest';
import { buildSolverPayload, mapSolverResult, pickEngineResult, generateSchedule, SOLVER_SHORTLIST_SIZE } from '../ResidentScheduler.jsx';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const fixture = makeFixture('feasible');
const good = generateSchedule({ ...fixture, rng: mulberry32(7) }).schedule;

// Degrade: drop every Nth assigned cell (deterministic) so coverage/target get strictly worse.
function degrade(sched, every, offset = 0) {
  const out = {}; let n = 0;
  for (const [rid, row] of Object.entries(sched)) {
    out[rid] = {};
    for (const [ds, sh] of Object.entries(row)) { if (sh && (n++ + offset) % every === 0) continue; out[rid][ds] = sh; }
  }
  return out;
}
const worse1 = degrade(good, 4);
const worse2 = degrade(good, 6, 1);

const args = { ...fixture };
const localOf = schedule => ({ schedule, report: { engine: 'local', unfilled: [], underTarget: [] } });
const json = (schedule, shortlist) => ({
  status: 'OPTIMAL', schedule,
  report: { unfilled: [], underTarget: [], overstaffed: [], restCompromises: [], ...(shortlist ? { shortlist } : {}) },
});
const solverRes = (schedule, shortlist) => mapSolverResult(json(schedule, shortlist), fixture);

describe('solver shortlist arbitration', () => {
  it('payload asks for a shortlist by default and lets the caller override', () => {
    expect(buildSolverPayload(fixture).config.shortlistSize).toBe(SOLVER_SHORTLIST_SIZE);
    expect(SOLVER_SHORTLIST_SIZE).toBe(5);
    expect(buildSolverPayload({ ...fixture, config: { shortlistSize: 0 } }).config.shortlistSize).toBe(0);
  });

  it('maps each shortlist entry and keeps its tiers', () => {
    const r = solverRes(worse1, [{ schedule: good, tiers: { a: 1 } }]);
    expect(r.shortlist).toHaveLength(1);
    expect(r.shortlist[0].tiers).toEqual({ a: 1 });
    expect(Object.keys(r.shortlist[0].schedule).length).toBeGreaterThan(0);
  });

  it('chooses a shortlist candidate strictly better than the winner (and better than local)', () => {
    const sr = solverRes(worse1, [{ schedule: worse2, tiers: {} }, { schedule: good, tiers: {} }]);
    const { result, winner, engineComparison } = pickEngineResult(sr, localOf(worse2), args);
    expect(winner).toBe('cpsat');
    expect(result.schedule).toEqual(sr.shortlist[1].schedule);
    expect(result.report.shortlistIndex).toBe(1);
    expect(engineComparison.shortlistIndex).toBe(1);
    expect(engineComparison.shortlistSize).toBe(2);
  });

  it('ignores worse candidates: the winner is kept and shortlistIndex is null', () => {
    const sr = solverRes(good, [{ schedule: worse1, tiers: {} }]);
    const { result, winner, engineComparison } = pickEngineResult(sr, localOf(worse2), args);
    expect(winner).toBe('cpsat');
    expect(result.schedule).toEqual(sr.schedule);
    expect(result.report.shortlistIndex).toBeUndefined();
    expect(engineComparison.shortlistIndex).toBeNull();
  });

  it('prefers the solver winner over an identical-scoring shortlist candidate', () => {
    const sr = solverRes(good, [{ schedule: JSON.parse(JSON.stringify(good)), tiers: {} }]);
    const { engineComparison, winner } = pickEngineResult(sr, localOf(worse1), args);
    expect(winner).toBe('cpsat');
    expect(engineComparison.shortlistIndex).toBeNull();
  });

  it('local still wins ties against the best solver candidate', () => {
    const sr = solverRes(worse1, [{ schedule: JSON.parse(JSON.stringify(good)), tiers: {} }]);
    const { winner, result } = pickEngineResult(sr, localOf(JSON.parse(JSON.stringify(good))), args);
    expect(winner).toBe('local');
    expect(result.shortlist).toBeUndefined();
  });

  it('local wins when every solver candidate is worse', () => {
    const sr = solverRes(worse1, [{ schedule: worse2, tiers: {} }]);
    expect(pickEngineResult(sr, localOf(good), args).winner).toBe('local');
  });

  it('strips the raw shortlist from the returned result and its report', () => {
    const sr = solverRes(worse1, [{ schedule: good, tiers: {} }]);
    const { result } = pickEngineResult(sr, localOf(worse2), args);
    expect(result.shortlist).toBeUndefined();
    expect(result.report.shortlist).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('"shortlist"');
  });

  it('no shortlist: behavior unchanged and no shortlist telemetry', () => {
    const { engineComparison } = pickEngineResult(solverRes(good), localOf(worse1), args);
    expect(engineComparison.shortlistSize).toBeUndefined();
  });
});
