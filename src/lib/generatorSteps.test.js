/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { mulberry32 } from './rng.js';
import { generateSchedule, generateScheduleBest, generateScheduleBestAsync, genProgressPct } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

describe('generateScheduleBestAsync', () => {
  it('matches generateScheduleBest for the same baseSeed and reports every attempt', async () => {
    const args = makeFixture('standard');
    const opts = { attempts: 3, baseSeed: 12345, repair: true };
    const sync = generateScheduleBest(args, opts);
    const events = [];
    const asyncRes = await generateScheduleBestAsync(args, opts, p => events.push(p));
    expect(asyncRes.schedule).toEqual(sync.schedule);
    expect(asyncRes.report.seed).toBe(sync.report.seed);
    const attempts = events.filter(e => e.phase === 'attempt');
    expect(attempts.map(e => e.done)).toEqual([1, 2, 3]);
    expect(attempts.every(e => e.total === 3)).toBe(true);
    const repairs = events.filter(e => e.phase === 'repair');
    expect(repairs.map(e => e.done)).toEqual([1, 2, 3]);
    expect(repairs.every(e => e.total === 3)).toBe(true);
  }, 120000);

  it('replay recipe reproduces the winning repair candidate', () => {
    const args = makeFixture('standard');
    const res = generateScheduleBest(args, { attempts: 4, baseSeed: 777, repair: true, repairCandidates: 3 });
    const { replay } = res.report;
    expect(typeof replay.repair).toBe('boolean');
    if (!replay.truePrimaryOnly) {
      const re = generateSchedule({ ...args, rng: mulberry32(replay.seed), repair: replay.repair });
      expect(re.schedule).toEqual(res.schedule);
    }
  }, 120000);
});

describe('genProgressPct', () => {
  it('maps phases to bar width', () => {
    expect(genProgressPct(null, 0)).toBe(0);
    expect(genProgressPct({ phase: 'local', done: 0, total: 20 }, 0)).toBe(5);
    expect(genProgressPct({ phase: 'local', done: 10, total: 20 }, 0)).toBe(30);
    expect(genProgressPct({ phase: 'local', done: 20, total: 20 }, 0)).toBe(55);
    expect(genProgressPct({ phase: 'local', polishing: true }, 0)).toBe(58);
    expect(genProgressPct({ phase: 'solver', budgetSec: 100 }, 0)).toBe(60);
    expect(genProgressPct({ phase: 'solver', budgetSec: 100 }, 50)).toBe(79);
    expect(genProgressPct({ phase: 'solver', budgetSec: 100 }, 999)).toBe(97);
    expect(genProgressPct({ phase: 'validate' }, 0)).toBe(99);
  });
});
