/** @vitest-environment jsdom */
// src/lib/whatIfRunner.test.js
// Integration check for runWhatIf (ResidentScheduler.jsx), the generator-facing half of the
// What-if staffing simulator — src/lib/whatIf.test.js covers the pure applyScenario/compareResults
// math in isolation; this exercises the real generateScheduleBest/validateAll pipeline on the
// committed 'understaffed' synthetic fixture (see __fixtures__/syntheticRoster.js), same pattern
// as unfilledDiagnostics.test.js.
import { describe, it, expect } from 'vitest';
import { runWhatIf } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

describe('runWhatIf (understaffed fixture)', () => {
  it('cloning an eligible resident does not increase unfilled minimum slots (median), and never mutates baseArgs', async () => {
    const fixture = makeFixture('understaffed');
    const baselineSnapshot = JSON.parse(JSON.stringify(fixture));

    // syn_india: EM_HOME PGY-2, blockType 'EM' (no rotation/trauma-split quirks), broadly eligible
    // across the standard EM shift catalog — a representative "add a body" scenario.
    // repeats:2/attempts:2 (not the default repeats:3/attempts:20) to stay fast — correctness of
    // the median/range math doesn't depend on either budget, only solution quality does.
    const changes = [{ kind: 'cloneResident', templateId: 'syn_india', count: 3 }];
    const result = await runWhatIf(fixture, changes, { seed: 42, attempts: 2, repeats: 2 });

    expect(result).toBeTruthy();
    expect(result.repeats).toBe(2);
    expect(result.seeds).toHaveLength(2);
    expect(result.comparison.coverageMiss.after).toBeLessThanOrEqual(result.comparison.coverageMiss.before);
    expect(result.scenario.allResidents.length).toBe(fixture.allResidents.length + 3);
    // The three clones carry fresh whatif_* ids, never collide with the roster's own syn_* ids.
    const cloneIds = result.scenario.allResidents.map(r => r.id).filter(id => id.startsWith('whatif_'));
    expect(cloneIds.sort()).toEqual(['whatif_1', 'whatif_2', 'whatif_3']);

    // baseArgs passed in must come out byte-for-byte identical — applyScenario deep-copies, and
    // runWhatIf itself must never write back into the caller's block/allResidents either.
    expect(fixture).toEqual(baselineSnapshot);
  });

  it('removing a resident for the whole block does not decrease unfilled minimum slots (median)', async () => {
    const fixture = makeFixture('understaffed');
    const changes = [{ kind: 'removeResident', residentId: 'syn_india' }];
    const result = await runWhatIf(fixture, changes, { seed: 7, attempts: 2, repeats: 2 });

    expect(result).toBeTruthy();
    expect(result.scenario.allResidents.find(r => r.id === 'syn_india')).toBeUndefined();
    expect(result.comparison.coverageMiss.after).toBeGreaterThanOrEqual(result.comparison.coverageMiss.before);
  });

  it('defaults to 3 repeats when not specified', async () => {
    const fixture = makeFixture('understaffed');
    const result = await runWhatIf(fixture, [{ kind: 'removeResident', residentId: 'syn_india' }], { seed: 3, attempts: 2 });
    expect(result.repeats).toBe(3);
    expect(result.seeds).toHaveLength(3);
    expect(result.comparison.repeats).toEqual({ base: 3, scenario: 3 });
  });

  it('pairs seeds across sides: seed_k = (baseSeed + k*0x9E3779B9)>>>0, same list for base and scenario', async () => {
    const fixture = makeFixture('understaffed');
    const result = await runWhatIf(fixture, [], { seed: 100, attempts: 2, repeats: 3 });
    const expectedSeeds = [0, 1, 2].map(k => (100 + k * 0x9E3779B9) >>> 0);
    expect(result.seeds).toEqual(expectedSeeds);
  });

  it('returns null for a block with no valid date range, same as generateScheduleBest', async () => {
    const fixture = makeFixture('understaffed');
    fixture.block = { ...fixture.block, startDate: '', endDate: '' };
    const result = await runWhatIf(fixture, [], { seed: 1, attempts: 2, repeats: 2 });
    expect(result).toBeNull();
  });

  it('stops before the scenario run when cancelled after the base run finishes', async () => {
    const fixture = makeFixture('understaffed');
    let scenarioStageSeen = false;
    const result = await runWhatIf(fixture, [{ kind: 'removeResident', residentId: 'syn_india' }], {
      seed: 1, attempts: 2, repeats: 2,
      onStage: s => { if (s.side === 'scenario') scenarioStageSeen = true; },
      isCancelled: () => scenarioStageSeen,
    });
    expect(result).toEqual({ cancelled: true });
  });

  it('reports progress as {side, run, of} for every run on both sides', async () => {
    const fixture = makeFixture('understaffed');
    const stages = [];
    await runWhatIf(fixture, [{ kind: 'removeResident', residentId: 'syn_india' }], {
      seed: 1, attempts: 2, repeats: 2, onStage: s => stages.push(s),
    });
    expect(stages).toEqual([
      { side: 'base', run: 1, of: 2 },
      { side: 'base', run: 2, of: 2 },
      { side: 'scenario', run: 1, of: 2 },
      { side: 'scenario', run: 2, of: 2 },
    ]);
  });
});
