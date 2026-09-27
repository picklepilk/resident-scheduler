// src/lib/rulePolicy.test.js
import { describe, it, expect } from 'vitest';
import { RULE_POLICY, OVERRIDE_TIER_RULE_IDS, severityFor } from './rulePolicy.js';

const TIERS = ['acgme', 'program', 'override'];

describe('RULE_POLICY', () => {
  it('every rule has a valid tier and a non-empty plain-language label', () => {
    for (const [id, entry] of Object.entries(RULE_POLICY)) {
      expect(TIERS, `${id}.tier`).toContain(entry.tier);
      expect(typeof entry.label, `${id}.label`).toBe('string');
      expect(entry.label.length, `${id}.label`).toBeGreaterThan(0);
    }
  });

  it('OVERRIDE_TIER_RULE_IDS is exactly the ids tiered "override"', () => {
    const expected = Object.keys(RULE_POLICY).filter(id => RULE_POLICY[id].tier === 'override');
    expect([...OVERRIDE_TIER_RULE_IDS].sort()).toEqual(expected.sort());
  });

  it('matches the chief-approved policy matrix (2026-09-26) — spot-check a few from each tier', () => {
    expect(RULE_POLICY.sixConsecutiveWorkDays.tier).toBe('acgme');
    expect(RULE_POLICY.nightRunMax.tier).toBe('acgme');
    expect(RULE_POLICY.vacation.tier).toBe('acgme');
    expect(RULE_POLICY.bamcWedNight.tier).toBe('program');
    expect(RULE_POLICY.jcMaxPerAy.tier).toBe('program');
    expect(RULE_POLICY.traumaPedsSplit.tier).toBe('program');
    expect(RULE_POLICY.nightsTotalBlock.tier).toBe('override');
    expect(RULE_POLICY.podPgy3Composition.tier).toBe('override');
    expect(RULE_POLICY.approvedDayOff.tier).toBe('override');
  });
});

describe('severityFor', () => {
  it('validator surface: acgme/program -> error, override -> warn', () => {
    expect(severityFor('vacation', 'validator')).toBe('error');
    expect(severityFor('bamcWedNight', 'validator')).toBe('error');
    expect(severityFor('nightsTotalBlock', 'validator')).toBe('warn');
    expect(severityFor('approvedDayOff', 'validator')).toBe('warn');
  });

  it('handEdit surface: acgme/program -> error (blocking), override -> confirm', () => {
    expect(severityFor('vacation', 'handEdit')).toBe('error');
    expect(severityFor('bamcWedNight', 'handEdit')).toBe('error');
    expect(severityFor('nightsTotalBlock', 'handEdit')).toBe('confirm');
    expect(severityFor('approvedDayOff', 'handEdit')).toBe('confirm');
  });

  it('an unrecognized rule id defaults to the strictest reading on both surfaces', () => {
    expect(severityFor('someMadeUpRuleId', 'validator')).toBe('error');
    expect(severityFor('someMadeUpRuleId', 'handEdit')).toBe('error');
    expect(severityFor(undefined, 'validator')).toBe('error');
  });

  it('full matrix over every declared rule id (no id silently falls through to a wrong default)', () => {
    for (const [id, entry] of Object.entries(RULE_POLICY)) {
      const validatorLevel = severityFor(id, 'validator');
      const handEditLevel = severityFor(id, 'handEdit');
      if (entry.tier === 'override') {
        expect(validatorLevel, id).toBe('warn');
        expect(handEditLevel, id).toBe('confirm');
      } else {
        expect(validatorLevel, id).toBe('error');
        expect(handEditLevel, id).toBe('error');
      }
    }
  });
});
