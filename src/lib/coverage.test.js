import { describe, it, expect } from 'vitest';
import {
  normalizeCoverageEntry, getCoverageFor,
  DEFAULT_COVERAGE, DOW_COVERAGE_MAX_OVERRIDE,
  CONF_SUPPRESSED_NORMAL_IDS, CONF_AUTO_SWAP_12H_IDS,
} from './coverage.js';

describe('normalizeCoverageEntry', () => {
  it('converts a legacy single-number shape to {min,max} with equal values', () => {
    expect(normalizeCoverageEntry(3)).toEqual({ min: 3, max: 3 });
  });

  it('clamps a negative legacy number to 0', () => {
    expect(normalizeCoverageEntry(-2)).toEqual({ min: 0, max: 0 });
  });

  it('passes through a well-formed {min,max} object', () => {
    expect(normalizeCoverageEntry({ min: 1, max: 3 })).toEqual({ min: 1, max: 3 });
  });

  it('clamps max up to min when max < min', () => {
    expect(normalizeCoverageEntry({ min: 3, max: 1 })).toEqual({ min: 3, max: 3 });
  });

  it('treats missing/garbage fields as 0', () => {
    expect(normalizeCoverageEntry({})).toEqual({ min: 0, max: 0 });
    expect(normalizeCoverageEntry({ min: 'x', max: 'y' })).toEqual({ min: 0, max: 0 });
  });

  it('returns null for a non-object, non-number value (untrusted shape)', () => {
    expect(normalizeCoverageEntry('nonsense')).toBeNull();
    expect(normalizeCoverageEntry(null)).toBeNull();
    expect(normalizeCoverageEntry(undefined)).toBeNull();
  });
});

describe('getCoverageFor: base lookup', () => {
  it('falls back to DEFAULT_COVERAGE when no chief override is present', () => {
    expect(getCoverageFor('POD-D', {})).toEqual(DEFAULT_COVERAGE['POD-D']);
  });

  it('prefers a chief override over the default', () => {
    expect(getCoverageFor('POD-D', { 'POD-D': { min: 5, max: 5 } })).toEqual({ min: 5, max: 5 });
  });

  it('normalizes a legacy-number chief override', () => {
    expect(getCoverageFor('MT-D', { 'MT-D': 4 })).toEqual({ min: 4, max: 4 });
  });

  it('falls back to {min:0,max:0} for a shift id present in neither map', () => {
    expect(getCoverageFor('NOT-A-SHIFT', {})).toEqual({ min: 0, max: 0 });
  });
});

describe('getCoverageFor: DOW_COVERAGE_MAX_OVERRIDE (POD Mon/Tue bump)', () => {
  it('raises POD-D max to 3 on Monday (dow=1)', () => {
    expect(getCoverageFor('POD-D', {}, 1)).toEqual({ min: 2, max: 3 });
  });

  it('raises POD-D max to 3 on Tuesday (dow=2)', () => {
    expect(getCoverageFor('POD-D', {}, 2)).toEqual({ min: 2, max: 3 });
  });

  it('does not raise POD-D max on Wednesday (dow=3)', () => {
    expect(getCoverageFor('POD-D', {}, 3)).toEqual({ min: 2, max: 2 });
  });

  it('never lowers a chief-customized max already above the override', () => {
    expect(getCoverageFor('POD-D', { 'POD-D': { min: 2, max: 5 } }, 1)).toEqual({ min: 2, max: 5 });
  });

  it('does not affect a shift with no dow override entry', () => {
    expect(getCoverageFor('FLEX-D', {}, 1)).toEqual(DEFAULT_COVERAGE['FLEX-D']);
  });

  it('min is never touched by dow', () => {
    expect(getCoverageFor('POD-D', {}, 1).min).toBe(DEFAULT_COVERAGE['POD-D'].min);
  });
});

describe('getCoverageFor: confActive conference-week suppression', () => {
  it('suppresses a normal id to {min:0,max:0} when confActive=true', () => {
    for (const sid of CONF_SUPPRESSED_NORMAL_IDS) {
      expect(getCoverageFor(sid, {}, undefined, true)).toEqual({ min: 0, max: 0 });
    }
  });

  it('does not suppress a normal id when confActive=false (falls through to base)', () => {
    expect(getCoverageFor('POD-D', {}, undefined, false)).toEqual(DEFAULT_COVERAGE['POD-D']);
  });

  it('activates a 12h auto-swap id to its base coverage when confActive=true', () => {
    expect(getCoverageFor('POD-D12', {}, undefined, true)).toEqual(DEFAULT_COVERAGE['POD-D12']);
  });

  it('suppresses a 12h auto-swap id to {min:0,max:0} when confActive=false', () => {
    for (const sid of CONF_AUTO_SWAP_12H_IDS) {
      expect(getCoverageFor(sid, {}, undefined, false)).toEqual({ min: 0, max: 0 });
    }
  });

  it('leaves PED-D12/PED-N12 opt-in (zero coverage) regardless of confActive, since PED is not in the auto-swap arrays', () => {
    expect(getCoverageFor('PED-D12', {}, undefined, true)).toEqual({ min: 0, max: 0 });
    expect(getCoverageFor('PED-D12', {}, undefined, false)).toEqual({ min: 0, max: 0 });
  });

  it('ignores confActive entirely for a shift outside both conference arrays', () => {
    expect(getCoverageFor('TRAUMA-D', {}, undefined, true)).toEqual(DEFAULT_COVERAGE['TRAUMA-D']);
    expect(getCoverageFor('TRAUMA-D', {}, undefined, false)).toEqual(DEFAULT_COVERAGE['TRAUMA-D']);
  });

  it('confActive=null/undefined bypasses conference logic entirely (normal base lookup)', () => {
    expect(getCoverageFor('POD-D', {})).toEqual(DEFAULT_COVERAGE['POD-D']);
  });
});
