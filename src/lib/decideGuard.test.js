import { describe, it, expect } from 'vitest';
import { wasDecisionApplied, DECISION_STALE_MESSAGE } from './decideGuard.js';

describe('wasDecisionApplied', () => {
  it('is true when the conditional update returned the row', () => {
    expect(wasDecisionApplied([{ id: 'a' }])).toBe(true);
  });
  it('is false when nothing matched (already decided / withdrawn)', () => {
    expect(wasDecisionApplied([])).toBe(false);
    expect(wasDecisionApplied(null)).toBe(false);
    expect(wasDecisionApplied(undefined)).toBe(false);
  });
  it('has a user-facing stale message', () => {
    expect(DECISION_STALE_MESSAGE).toMatch(/already decided/);
  });
});
