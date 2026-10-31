/** @vitest-environment jsdom */
// Multi-hint CP-SAT portfolio: generateScheduleBest.alternates + buildSolverPayload.alternateHints.
import { describe, it, expect } from 'vitest';
import { generateScheduleBest, buildSolverPayload, pickDistinctAlternates } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const key = s => JSON.stringify(Object.keys(s).sort().map(r => [r, Object.entries(s[r]).filter(([, v]) => v).sort()]));

describe('generateScheduleBest alternates', () => {
  it('returns distinct runner-ups, never the winner, capped, and not persisted', async () => {
    const args = makeFixture('standard');
    await new Promise(r => setImmediate(r));
    const res = generateScheduleBest(args, { attempts: 6, baseSeed: 4242, repair: true, repairCandidates: 4 });
    const alts = res.alternates;
    expect(Array.isArray(alts)).toBe(true);
    expect(alts.length).toBeLessThanOrEqual(2); // default N=3 including the winner
    const keys = [res.schedule, ...alts].map(key);
    expect(new Set(keys).size).toBe(keys.length);
    // Not enumerable: spreads and JSON round-trips (persistence) drop it.
    expect(Object.keys(res)).not.toContain('alternates');
    expect('alternates' in { ...res }).toBe(false);
    expect(JSON.stringify(res)).not.toContain('alternates');
    expect(JSON.stringify(res.report)).not.toContain('alternates');
  }, 120000);

  it('alternates:1 yields none; larger N yields at most N-1', async () => {
    const args = makeFixture('standard');
    const one = generateScheduleBest(args, { attempts: 5, baseSeed: 9, repair: false, repairCandidates: 5, alternates: 1 });
    expect(one.alternates).toEqual([]);
    await new Promise(r => setImmediate(r));
    const many = generateScheduleBest(args, { attempts: 5, baseSeed: 9, repair: false, repairCandidates: 5, alternates: 4 });
    expect(many.alternates.length).toBeLessThanOrEqual(3);
    expect(many.alternates.length).toBeGreaterThan(0);
  }, 120000);
});

describe('buildSolverPayload alternateHints', () => {
  const f = makeFixture('standard');
  const base = { allResidents: f.allResidents, block: f.block, coverage: f.coverage || {}, eligOverrides: f.eligOverrides,
    appSettings: f.appSettings, dayRules: f.dayRules, blocksHistory: [], ayConf: f.ayConf || {} };
  const r0 = f.allResidents[0].id, r1 = f.allResidents[1].id, d = f.block.startDate;
  const hint = { [r0]: { [d]: 'POD-D' } };

  it('emits cells per alternate next to the primary hint, dropping empties', () => {
    const p = buildSolverPayload({ ...base, hint, alternateHints: [{ [r1]: { [d]: 'POD-D' } }, {}, null] });
    expect(p.hint).toEqual([{ residentId: r0, date: d, shiftId: 'POD-D' }]);
    expect(p.alternateHints).toEqual([[{ residentId: r1, date: d, shiftId: 'POD-D' }]]);
  });
  it('omits the field when absent, empty, or there is no primary hint', () => {
    expect(buildSolverPayload({ ...base, hint }).alternateHints).toBeUndefined();
    expect(buildSolverPayload({ ...base, hint, alternateHints: [] }).alternateHints).toBeUndefined();
    expect(buildSolverPayload({ ...base, alternateHints: [hint] }).alternateHints).toBeUndefined();
  });
});

describe('pickDistinctAlternates tier filter', () => {
  const mk = (cell, errorCount, blockingWarnCount) => ({ result: { schedule: { r: { '2026-01-01': cell } } }, score: { errorCount, blockingWarnCount, qualityVector: [0] } });
  it('skips other tiers and duplicates', () => {
    const win = mk('A', 0, 1);
    const out = pickDistinctAlternates(win, [win, mk('A', 0, 1), mk('B', 1, 1), mk('C', 0, 2), mk('D', 0, 1), mk('D', 0, 1)], 5);
    expect(out).toEqual([{ r: { '2026-01-01': 'D' } }]);
  });
});
