import { describe, it, expect } from 'vitest';
import { restRankedBelowCoverage, rankedBelowCoverage, RANKED_SOFT_RULE_ISSUES } from './rulePriorityRanking.js';

describe('restRankedBelowCoverage', () => {
  it('default order ranks coverage above rest', () => {
    expect(restRankedBelowCoverage(['coverageMin', 'seniorComposition', 'postNightRest'])).toBe(true);
  });
  it('chief reorder putting rest first flips it', () => {
    expect(restRankedBelowCoverage(['postNightRest', 'coverageMin', 'seniorComposition'])).toBe(false);
    expect(restRankedBelowCoverage(['seniorComposition', 'postNightRest', 'coverageMin'])).toBe(false);
  });
  it('untrusted shapes fall back to the default order', () => {
    expect(restRankedBelowCoverage(undefined)).toBe(true);
    expect(restRankedBelowCoverage('postNightRest')).toBe(true);
    expect(restRankedBelowCoverage(['postNightRest'])).toBe(true);
  });
});

describe('rankedBelowCoverage', () => {
  it('works per soft rule id', () => {
    expect(rankedBelowCoverage(['coverageMin', 'seniorComposition', 'postNightRest'], 'seniorComposition')).toBe(true);
    expect(rankedBelowCoverage(['seniorComposition', 'coverageMin', 'postNightRest'], 'seniorComposition')).toBe(false);
    expect(rankedBelowCoverage(['seniorComposition', 'coverageMin', 'postNightRest'], 'postNightRest')).toBe(true);
  });
  it('untrusted shapes answer true', () => {
    expect(rankedBelowCoverage(null, 'seniorComposition')).toBe(true);
    expect(rankedBelowCoverage(['coverageMin'], 'seniorComposition')).toBe(true);
  });
  it('maps composition to both validator rule ids', () => {
    expect(RANKED_SOFT_RULE_ISSUES.seniorComposition).toEqual(['podPgy3Composition', 'flexSeniorComposition']);
  });
});

