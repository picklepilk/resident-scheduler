/** @vitest-environment jsdom */
// src/lib/scoreWeights.test.js
// Phase 0 (score() priority audit) — permanent guard for generateSchedule's score() weight table.
// score() is a closure over generator state and cannot be called directly from a test, so these
// assertions run against the exported SCORE_TIERS table the function reads its weights from. That
// indirection is the entire reason the table exists.
//
// WHAT THIS FILE DOES AND DOESN'T CLAIM
// It does NOT assert that preference terms stay under one shift of `deficit`. They don't — the
// measured bands are 22/40/27 against a 5.0-point threshold. See the MEASURED FINDING note above
// SCORE_WEIGHTS in ResidentScheduler.jsx: that inversion is real on paper but inert in practice,
// because candidatePool's `allAtTarget` filter already keeps the optional fill phase to residents
// under their own target, so score() never gets the chance to push anyone past target. Rescaling
// the weights to satisfy the ideal was A/B'd over 6 seeds x 3 fixtures, moved `deficitSpread` not
// at all, and slightly worsened coverageMiss — so it was rejected rather than shipped.
//
// What IS asserted is a RATCHET plus classification hygiene: every weight must be classified into
// exactly one tier, and no preference group's band may grow beyond what today's audit recorded.
// That is what makes it safe to add a new scoring term (Phase 1's work-shape penalty) without
// silently re-widening a sum nobody is watching.
import { describe, it, expect } from 'vitest';
import { SCORE_TIERS } from '../ResidentScheduler.jsx';

const {
  SCORE_WEIGHTS, PREFERENCE_GROUPS, PREFERENCE_ALWAYS, PREFERENCE_MAX_INPUT, MAX_SHIFT_TARGET,
  PREFERENCE_BAND_CEILING,
} = SCORE_TIERS;

// Worst-case absolute contribution of one preference term: its weight times the largest input it
// can receive (1 for the 0/1 booleans, an explicit clamp for traumaNightBalance).
function bandOf(key) {
  return SCORE_WEIGHTS[key] * (PREFERENCE_MAX_INPUT[key] ?? 1);
}

function groupBand(keys) {
  return keys.reduce((sum, k) => sum + bandOf(k), 0);
}

const preferenceKeys = new Set([...Object.values(PREFERENCE_GROUPS).flat(), ...PREFERENCE_ALWAYS]);
const structuralKeys = Object.keys(SCORE_WEIGHTS).filter(k => !preferenceKeys.has(k));

describe('score() weight table — structural integrity', () => {
  it('every key referenced by a preference group exists in the weight table', () => {
    for (const [group, keys] of Object.entries(PREFERENCE_GROUPS)) {
      for (const k of keys) {
        expect(SCORE_WEIGHTS[k], `${group}.${k} missing from SCORE_WEIGHTS`).toBeTypeOf('number');
      }
    }
  });

  it('every weight is a finite non-negative number (signs live at the use site, not here)', () => {
    for (const [k, v] of Object.entries(SCORE_WEIGHTS)) {
      expect(Number.isFinite(v), `${k} is not finite`).toBe(true);
      expect(v, `${k} must be non-negative — apply the sign in score()`).toBeGreaterThanOrEqual(0);
    }
  });

  it('classifies every weight as exactly one of structural or preference', () => {
    // A weight added to the table without being classified fails here. That is the point: adding a
    // scoring term forces a deliberate tier decision instead of silently widening the sum.
    for (const k of Object.keys(SCORE_WEIGHTS)) {
      const isPref = preferenceKeys.has(k);
      const isStructural = structuralKeys.includes(k);
      expect(isPref !== isStructural, `${k} is classified as both or neither`).toBe(true);
    }
  });

  it('MAX_SHIFT_TARGET is derived from the real target constants, not hardcoded', () => {
    expect(MAX_SHIFT_TARGET).toBeGreaterThanOrEqual(19);
  });
});

describe('score() weight table — preference band ratchet', () => {
  for (const [group, keys] of Object.entries(PREFERENCE_GROUPS)) {
    it(`the "${group}" band does not grow beyond its recorded ceiling`, () => {
      expect(PREFERENCE_BAND_CEILING[group], `no recorded ceiling for group "${group}"`).toBeTypeOf('number');
      expect(groupBand(keys)).toBeLessThanOrEqual(PREFERENCE_BAND_CEILING[group]);
    });
  }

  it('every preference group has a recorded ceiling (a new group must declare one)', () => {
    for (const group of Object.keys(PREFERENCE_GROUPS)) {
      expect(Object.keys(PREFERENCE_BAND_CEILING)).toContain(group);
    }
  });

  it('the always-on band does not grow beyond its recorded ceiling', () => {
    // PREFERENCE_ALWAYS terms fire on every shift and therefore stack on top of whichever
    // shift-specific group applies. They're ratcheted separately so adding them could not silently
    // inflate the three ceilings the Phase 0 audit recorded.
    expect(groupBand(PREFERENCE_ALWAYS)).toBeLessThanOrEqual(PREFERENCE_BAND_CEILING.always);
  });

  it('the always-on band stays well under the smallest shift-specific group', () => {
    // Guards the sizing rationale: always-on terms are paid on every slot in the block, so if they
    // ever rivalled the shift-specific tuning they would quietly dominate the chief's dialled-in
    // preferences everywhere at once.
    const smallestGroup = Math.min(...Object.values(PREFERENCE_GROUPS).map(groupBand));
    expect(groupBand(PREFERENCE_ALWAYS)).toBeLessThan(smallestGroup);
  });

  it('preference terms still outrank the rng tie-break (they must actually do something)', () => {
    // rng() contributes [0,1). A preference band below that is indistinguishable from noise, which
    // would be its own bug — this bounds the weights from BELOW so a future "just shrink them all"
    // fix can't quietly zero the chief's tuned preferences out of existence.
    for (const keys of Object.values(PREFERENCE_GROUPS)) {
      expect(groupBand(keys)).toBeGreaterThan(1);
    }
  });
});

describe('score() weight table — records the known inversion rather than hiding it', () => {
  // These assertions deliberately encode the CURRENT, non-ideal reality. They exist so that if
  // someone later fixes the inversion for real, these fail loudly and force this file, the
  // MEASURED FINDING note, and the recorded ceilings to be updated together.
  const oneShiftOfDeficit = SCORE_WEIGHTS.deficit / MAX_SHIFT_TARGET;

  it('one shift of deficit is worth 5 points at the largest target', () => {
    expect(oneShiftOfDeficit).toBeCloseTo(5, 5);
  });

  it('at least one preference group still exceeds one shift of deficit (known, inert, documented)', () => {
    const largest = Math.max(...Object.values(PREFERENCE_GROUPS).map(groupBand));
    expect(largest).toBeGreaterThan(oneShiftOfDeficit);
  });

  it('the smallest structural weight is still below the largest preference band (known)', () => {
    const smallestStructural = Math.min(...structuralKeys.map(k => SCORE_WEIGHTS[k]));
    const largestGroup = Math.max(...Object.values(PREFERENCE_GROUPS).map(groupBand));
    expect(smallestStructural).toBeLessThan(largestGroup);
  });
});
