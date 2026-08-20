/** @vitest-environment jsdom */
// src/lib/nightAreaDiversity.test.js
// Generator-quality-pack item 5: a small score() nudge toward spreading a resident's night
// shifts across PED/POD/MT/FLEX rather than repeating the same area. score() is a closure over
// generator state and can't be called directly from a test, so nightAreaDiversityTerm — the pure
// piece of that logic — is exported specifically so this can be tested directly.
import { describe, it, expect } from 'vitest';
import { nightAreaDiversityTerm, NIGHT_DIVERSITY_AREAS } from '../ResidentScheduler.jsx';

describe('nightAreaDiversityTerm', () => {
  it('gives a small bonus for an area not yet worked this block', () => {
    expect(nightAreaDiversityTerm(0)).toBe(1);
  });

  it('is neutral for 1-2 prior shifts in the same area', () => {
    expect(nightAreaDiversityTerm(1)).toBe(0);
    expect(nightAreaDiversityTerm(2)).toBe(0);
  });

  it('gives a small penalty once an area has been repeated several times', () => {
    expect(nightAreaDiversityTerm(3)).toBe(-1);
    expect(nightAreaDiversityTerm(4)).toBe(-1);
    expect(nightAreaDiversityTerm(10)).toBe(-1);
  });

  it('never returns a magnitude larger than 1 (must stay a small nudge, never fight nightCluster)', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 20]) {
      expect(Math.abs(nightAreaDiversityTerm(n))).toBeLessThanOrEqual(1);
    }
  });
});

describe('NIGHT_DIVERSITY_AREAS', () => {
  it('covers exactly the four night-capable non-trauma areas, excluding TRAUMA', () => {
    expect(new Set(NIGHT_DIVERSITY_AREAS)).toEqual(new Set(['PED', 'POD', 'MT', 'FLEX']));
    expect(NIGHT_DIVERSITY_AREAS).not.toContain('TRAUMA');
  });
});
