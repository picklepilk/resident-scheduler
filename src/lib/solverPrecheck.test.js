import { describe, it, expect } from 'vitest';
import { precheckRequest, summarizePrecheck, precheckLine, ruleLabel, PRECHECK_SECONDS } from './solverPrecheck.js';

describe('solverPrecheck', () => {
  it('precheckRequest switches to score mode without mutating', () => {
    const p = { hint: [1], config: { maxTimeSeconds: 300, liveIncumbent: true } };
    const q = precheckRequest(p);
    expect(q.config.mode).toBe('score');
    expect(q.config.maxTimeSeconds).toBe(PRECHECK_SECONDS);
    expect(p.config.maxTimeSeconds).toBe(300);
    expect(precheckRequest({}).config.mode).toBe('score');
  });
  it('summarize: ok, broken, older host', () => {
    expect(summarizePrecheck({ hintCheck: { feasible: true, violations: [] } })).toEqual({ ok: true });
    expect(summarizePrecheck({})).toBeNull();
    expect(summarizePrecheck(null)).toBeNull();
    const s = summarizePrecheck({ hintCheck: { feasible: false, violations: [{ rule: 'coverageMax', count: 2 }, { rule: 'targetCeiling', count: 31 }] } });
    expect(s.ok).toBe(false);
    expect(s.total).toBe(33);
    expect(s.rules[0]).toMatchObject({ rule: 'targetCeiling', count: 31 });
  });
  it('unknown rule falls back to raw name', () => {
    expect(ruleLabel('newRule')).toBe('newRule');
  });
  it('line text', () => {
    expect(precheckLine(null)).toBe('');
    expect(precheckLine({ ok: true })).toBe("Starting grid passes the solver's rules.");
    const s = summarizePrecheck({ hintCheck: { feasible: false, violations: [{ rule: 'targetCeiling', count: 31 }] } });
    expect(precheckLine(s)).toBe('Starting grid breaks 31 solver rules (more shifts than the target allows 31). Optimize will start slower.');
    expect(precheckLine({ ok: false, total: 1, rules: [{ rule: 'x', count: 1, label: 'x' }] })).toContain('1 solver rule (');
  });
});
