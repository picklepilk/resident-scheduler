import { describe, it, expect } from 'vitest';
import { restRankedBelowCoverage } from './rulePriorityRanking.js';

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
