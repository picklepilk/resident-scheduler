import { describe, it, expect } from 'vitest';
import {
  loggedDates, isLoggedDate, loggedDatesInRange, withLoggedDates, hasStoredList,
  suggestFirstFridays, suggestFirstTuesdays, suggestWellnessWednesdays, nthWeekdayOnOrAfter,
  materializeLegacyRuleDates, missingRuleDates, RULE_KEYS,
} from './ruleDates.js';

describe('logged storage', () => {
  it('absent / garbage shapes yield no dates', () => {
    expect(loggedDates('firstFriday', undefined)).toEqual([]);
    expect(loggedDates('firstFriday', { ruleDates: 'x' })).toEqual([]);
    expect(loggedDates('wellnessWednesday', { ruleDates: { wellnessWednesday: [1] } }, 3)).toEqual([]);
    expect(loggedDates('firstFriday', { ruleDates: { firstFriday: ['bad', '2026-08-07', 5] } })).toEqual(['2026-08-07']);
  });
  it('withLoggedDates is pure, sorts, dedupes, per-PGY', () => {
    const conf = { acepStart: 'x' };
    const a = withLoggedDates(conf, 'firstFriday', ['2026-09-04', '2026-08-07', '2026-08-07']);
    expect(conf.ruleDates).toBeUndefined();
    expect(loggedDates('firstFriday', a)).toEqual(['2026-08-07', '2026-09-04']);
    const b = withLoggedDates(a, 'wellnessWednesday', ['2026-08-05'], 2);
    expect(loggedDates('wellnessWednesday', b, 2)).toEqual(['2026-08-05']);
    expect(loggedDates('wellnessWednesday', b, 3)).toEqual([]);
    expect(loggedDates('firstFriday', b)).toHaveLength(2);
    expect(b.acepStart).toBe('x');
  });
  it('journal club rides ayConf.jcDates', () => {
    const c = withLoggedDates({}, 'journalClub', ['2026-08-04']);
    expect(c.jcDates).toEqual(['2026-08-04']);
    expect(isLoggedDate('journalClub', c, '2026-08-04')).toBe(true);
    expect(loggedDatesInRange('journalClub', c, '2026-08-05', '2026-09-01')).toEqual([]);
  });
  it('empty list is a stored list', () => {
    expect(hasStoredList('firstFriday', withLoggedDates({}, 'firstFriday', []))).toBe(true);
    expect(hasStoredList('firstFriday', {})).toBe(false);
  });
});

describe('suggesters', () => {
  it('first Fridays / Tuesdays / wellness', () => {
    expect(suggestFirstFridays('2026-07-01', '2026-09-30')).toEqual(['2026-07-03', '2026-08-07', '2026-09-04']);
    expect(suggestFirstTuesdays('2026-07-01', '2026-08-31')).toEqual(['2026-07-07', '2026-08-04']);
    expect(nthWeekdayOnOrAfter('2026-07-01', 3, 1)).toBe('2026-07-01');
    expect(suggestWellnessWednesdays(['2026-07-01', '2026-07-29'], 2)).toEqual(['2026-07-08', '2026-08-05']);
  });
});

describe('materializeLegacyRuleDates', () => {
  const blocks = [{ startDate: '2026-07-01', endDate: '2026-07-28' }, { startDate: '2026-07-29', endDate: '2026-08-25' }];
  it('fills AYs lacking stored lists and leaves stored lists alone', () => {
    const ayData = { 'AY26/27': { jcDates: ['2026-08-05'], ruleDates: { firstFriday: [] } } };
    const out = materializeLegacyRuleDates({ ayData, blocks, ordinalsByPgy: { 1: 1, 2: 2, 3: 3 } });
    const c = out['AY26/27'];
    expect(c.jcDates).toEqual(['2026-08-05']);
    expect(loggedDates('firstFriday', c)).toEqual([]);
    expect(loggedDates('wellnessWednesday', c, 3)).toEqual(['2026-07-15', '2026-08-12']);
    expect(loggedDates('wellnessWednesday', c, 1)).toEqual(['2026-07-01', '2026-07-29']);
  });
  it('creates entries for block AYs and extra-date AYs; JC derived once', () => {
    const out = materializeLegacyRuleDates({ ayData: {}, blocks, ordinalsByPgy: { 2: 2 }, extraDates: ['2025-09-02'] });
    expect(loggedDates('journalClub', out['AY26/27'])).toHaveLength(12);
    expect(loggedDates('firstFriday', out['AY26/27'])).toHaveLength(12);
    expect(loggedDates('wellnessWednesday', out['AY26/27'], 1)).toEqual([]);
    expect(out['AY25/26'].jcDates).toContain('2025-09-02');
  });
  it('is idempotent (same reference)', () => {
    const once = materializeLegacyRuleDates({ ayData: {}, blocks, ordinalsByPgy: { 1: 1 } });
    expect(materializeLegacyRuleDates({ ayData: once, blocks, ordinalsByPgy: { 1: 1 } })).toBe(once);
  });
});

describe('missingRuleDates', () => {
  const block = { startDate: '2026-08-01', endDate: '2026-08-28' };
  const rules = [{ ruleKey: RULE_KEYS.FIRST_FRIDAY, enabled: true, suggested: ['2026-08-07', '2026-09-04'] }];
  it('flags when enabled, suggested in block, none logged in block', () => {
    const r = missingRuleDates({ block, ayConf: {}, rules });
    expect(r).toHaveLength(1);
    expect(r[0].suggested).toEqual(['2026-08-07']);
    expect(r[0].message).toMatch(/No First Friday dates logged/);
  });
  it('quiet when any logged date is in block, when disabled, or nothing suggested', () => {
    expect(missingRuleDates({ block, ayConf: withLoggedDates({}, 'firstFriday', ['2026-08-14']), rules })).toEqual([]);
    expect(missingRuleDates({ block, ayConf: {}, rules: [{ ...rules[0], enabled: false }] })).toEqual([]);
    expect(missingRuleDates({ block, ayConf: {}, rules: [{ ...rules[0], suggested: ['2026-09-04'] }] })).toEqual([]);
  });
});
