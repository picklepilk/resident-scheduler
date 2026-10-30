// "Keep optimizer changes small" (appSettings.solverStickToHint) -> config.hintStickiness.
import { describe, it, expect } from 'vitest';
import { buildSolverPayload, HINT_STICKINESS_WEIGHT } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

function base(extraSettings = {}) {
  const f = makeFixture('standard');
  return {
    allResidents: f.allResidents, block: f.block, coverage: f.coverage || {}, eligOverrides: f.eligOverrides,
    appSettings: { ...f.appSettings, ...extraSettings }, dayRules: f.dayRules, blocksHistory: [], ayConf: f.ayConf || {},
  };
}

describe('buildSolverPayload hintStickiness', () => {
  const b0 = base();
  const hint = { [b0.allResidents[0].id]: { [b0.block.startDate]: 'POD-D' } };

  it('is omitted when the setting is off or unset', () => {
    expect(buildSolverPayload({ ...b0, hint }).config.hintStickiness).toBeUndefined();
    expect(buildSolverPayload({ ...base({ solverStickToHint: false }), hint }).config.hintStickiness).toBeUndefined();
  });
  it('is set to HINT_STICKINESS_WEIGHT when on and a hint is passed', () => {
    const p = buildSolverPayload({ ...base({ solverStickToHint: true }), hint });
    expect(p.config.hintStickiness).toBe(HINT_STICKINESS_WEIGHT);
    expect(HINT_STICKINESS_WEIGHT).toBeGreaterThan(0);
  });
  it('is omitted when on but there is no hint', () => {
    expect(buildSolverPayload({ ...base({ solverStickToHint: true }) }).config.hintStickiness).toBeUndefined();
  });
  it('never overrides an explicit caller config value', () => {
    const p = buildSolverPayload({ ...base({ solverStickToHint: true }), hint, config: { hintStickiness: 7 } });
    expect(p.config.hintStickiness).toBe(7);
  });
});
