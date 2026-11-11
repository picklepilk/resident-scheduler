// Every validateAll issue carries a rule id (2026-11-11: night-stint shape, coverage min/max, intern
// pairing and JC presenter warns used to carry none), and every id is tiered in RULE_POLICY or is one
// of the known non-policy ids. The new ids are 'info' tier, so they never count as export-blocking.
import { describe, it, expect } from 'vitest';
import { generateScheduleBest, validateAll, countBlockingWarns } from '../ResidentScheduler.jsx';
import { makeRealScaleFixture } from './__fixtures__/realScale.js';
import { RULE_POLICY } from './rulePolicy.js';

const NEW_IDS = ['nightStintIsolated', 'nightStintPair', 'coverageBelowMin', 'coverageAboveMax', 'internPairing', 'jcPresenterMissing'];

describe('validateAll rule ids', () => {
  it('no warn is rule-less, new ids are info tier and never blocking', () => {
    const a = makeRealScaleFixture({});
    const res = generateScheduleBest(a, { attempts: 3, baseSeed: 1000 });
    const issues = validateAll(a.allResidents, res.schedule, a.block, a.eligOverrides, a.appSettings, a.dayRules, a.coverage, a.blocksHistory, a.ayConf);
    expect(issues.filter(i => !i.rule).map(i => i.message)).toEqual([]);
    const seen = new Set(issues.map(i => i.rule));
    expect(NEW_IDS.filter(id => seen.has(id)).length).toBeGreaterThanOrEqual(4); // fixture exercises most of them
    for (const id of NEW_IDS) expect(RULE_POLICY[id]?.tier, id).toBe('info');
    const newOnly = issues.filter(i => NEW_IDS.includes(i.rule));
    expect(countBlockingWarns(newOnly, a.appSettings?.rulePriority)).toBe(0);
  });
});
