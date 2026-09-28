/** @vitest-environment jsdom */
// src/lib/pickEngineResult.test.js
// Unit tests for `pickEngineResult` (ResidentScheduler.jsx) — the engine-arbitration function that
// replaced generateViaSolverOrLocal's old "any usable CP-SAT status wins unjudged" behavior (see
// engineHeadToHead.test.js for the measurement that motivated this). Uses the same committed
// synthetic fixture the generator harness/baseline suites use, and constructs a deliberately
// worse "engine result" by stripping real assigned shifts out of a real generateScheduleBest
// schedule (this reliably creates underTarget/coverage-min errors validateAll treats as hard
// errors) rather than hand-rolling a fake report shape that would drift from what the real
// scorer actually reads.
import { describe, it, expect, beforeAll } from 'vitest';
import { generateScheduleBest, pickEngineResult } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';
import { getBlockDates } from './dates.js';

const args = makeFixture('standard');
const blockDates = getBlockDates(args.block.startDate, args.block.endDate);

// Deep-clones `res` and force-writes one guaranteed hard validateAll error: an evening shift
// immediately followed by a day shift the next day for the same resident (CLAUDE.md: "eve→day
// next day hard (either placement order)"). generateScheduleBest's own candidate pool hard-excludes
// this pattern (see checkCircadianViolations), so a real best-of-N result should have zero of
// these already — writing exactly one in reliably makes the mutated schedule strictly worse than
// the unmutated one, regardless of whatever baseline errors the small synthetic fixture already
// carries (e.g. underTarget noise from a 3-attempt run with no repair).
function worsen(res) {
  const schedule = JSON.parse(JSON.stringify(res.schedule));
  const resId = Object.keys(schedule)[0];
  schedule[resId][blockDates[0]] = 'POD-E';
  schedule[resId][blockDates[1]] = 'POD-D';
  return { ...res, schedule };
}

describe('pickEngineResult', () => {
  let good;

  beforeAll(() => {
    good = generateScheduleBest(args, { attempts: 3, baseSeed: 12345 });
  });

  it('solver null -> local wins', () => {
    const { result, winner, engineComparison } = pickEngineResult(null, good, args);
    expect(winner).toBe('local');
    expect(result).toBe(good);
    expect(engineComparison.winner).toBe('local');
    expect(engineComparison.solver).toBeNull();
    expect(engineComparison.local).not.toBeNull();
  });

  it('both null -> no winner', () => {
    const { result, winner, engineComparison } = pickEngineResult(null, null, args);
    expect(result).toBeNull();
    expect(winner).toBeNull();
    expect(engineComparison).toBeNull();
  });

  it('identical results -> tie goes to local', () => {
    const solverClone = { schedule: JSON.parse(JSON.stringify(good.schedule)), report: JSON.parse(JSON.stringify(good.report)) };
    const { result, winner, engineComparison } = pickEngineResult(solverClone, good, args);
    expect(winner).toBe('local');
    expect(result).toBe(good);
    expect(engineComparison.solver.errorCount).toBe(engineComparison.local.errorCount);
    expect(engineComparison.solver.blockingWarnCount).toBe(engineComparison.local.blockingWarnCount);
  });

  it('solver with fewer errors -> cpsat wins', () => {
    const bad = worsen(good);
    const { result, winner, engineComparison } = pickEngineResult(good, bad, args);
    expect(winner).toBe('cpsat');
    expect(result).toBe(good);
    expect(engineComparison.solver.errorCount).toBeLessThan(engineComparison.local.errorCount);
  });

  it('engineComparison is plain JSON — survives a round trip with no functions', () => {
    const bad = worsen(good);
    const { engineComparison } = pickEngineResult(good, bad, args);
    const roundTripped = JSON.parse(JSON.stringify(engineComparison));
    expect(roundTripped).toEqual(engineComparison);
    const walk = (v) => {
      expect(typeof v).not.toBe('function');
      if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k]);
    };
    walk(engineComparison);
  });
});
