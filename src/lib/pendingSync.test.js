import { describe, it, expect } from 'vitest';
import { decideMountOverlay, isBlankLocalState, localDiffersFromCloud, pendingKey, readPending, writePending, clearPending } from './pendingSync.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

const KEYS = ['a', 'b'];
describe('decideMountOverlay (arguments as the JSX passes them)', () => {
  const base = { marker: { baseVersion: 5 }, cloudVersion: 5, localEqualsCloud: false, localIsBlank: false };
  it('marker clear: takes the cloud copy (normal overlay)', () => {
    expect(decideMountOverlay({ ...base, marker: null })).toBe('take-cloud');
  });
  it('marker clear + blank local: still takes cloud', () => {
    expect(decideMountOverlay({ ...base, marker: null, localIsBlank: true })).toBe('take-cloud');
  });
  it('marker set, local content equals cloud (any version): silently takes cloud', () => {
    expect(decideMountOverlay({ ...base, cloudVersion: 6, localEqualsCloud: true })).toBe('take-cloud');
    expect(decideMountOverlay({ ...base, localEqualsCloud: true })).toBe('take-cloud');
  });
  it('marker set + cloud unchanged since base: keeps local', () => {
    expect(decideMountOverlay(base)).toBe('keep-local');
  });
  it('marker set + cloud version changed + content differs: asks', () => {
    expect(decideMountOverlay({ ...base, cloudVersion: 6 })).toBe('ask');
  });
  it('marker set + unknown base version: asks', () => {
    expect(decideMountOverlay({ ...base, marker: { baseVersion: null } })).toBe('ask');
    expect(decideMountOverlay({ ...base, marker: {} })).toBe('ask');
  });
  it('never keeps local when local is blank/default, even with equal versions', () => {
    expect(decideMountOverlay({ ...base, localIsBlank: true })).toBe('ask');
  });
});

describe('isBlankLocalState', () => {
  const blank = { res_em_roster: [], res_blocks_history: [], res_import_log: [], res_ay_data: {}, res_eligibility_overrides: {}, res_day_rules: {}, res_coverage: {} };
  it('true for defaults, false once any user data exists', () => {
    expect(isBlankLocalState(blank)).toBe(true);
    expect(isBlankLocalState({ ...blank, res_em_roster: [{ id: 'x' }] })).toBe(false);
    expect(isBlankLocalState({ ...blank, res_ay_data: { '2026': {} } })).toBe(false);
    expect(isBlankLocalState({ ...blank, res_blocks_history: [{}] })).toBe(false);
  });
});

describe('localDiffersFromCloud', () => {
  it('ignores keys the cloud lacks and compares deeply', () => {
    expect(localDiffersFromCloud({ a: [1], b: 2 }, { a: [1] }, KEYS)).toBe(false);
    expect(localDiffersFromCloud({ a: [1] }, { a: [2] }, KEYS)).toBe(true);
    expect(localDiffersFromCloud({ a: [1] }, { a: null }, KEYS)).toBe(false);
  });
  it('is key-order independent (jsonb reorders keys), at any depth', () => {
    expect(localDiffersFromCloud({ a: { x: 1, y: { p: 1, q: [{ m: 1, n: 2 }] } } }, { a: { y: { q: [{ n: 2, m: 1 }], p: 1 }, x: 1 } }, KEYS)).toBe(false);
  });
  it('array order still matters', () => {
    expect(localDiffersFromCloud({ a: [1, 2] }, { a: [2, 1] }, KEYS)).toBe(true);
  });
  it('treats undefined-valued keys as missing, like a JSON round trip', () => {
    expect(localDiffersFromCloud({ a: { x: 1, y: undefined } }, { a: { x: 1 } }, KEYS)).toBe(false);
    expect(localDiffersFromCloud({ a: { x: 1 } }, { a: { x: 1, y: undefined } }, KEYS)).toBe(false);
    expect(localDiffersFromCloud({ a: [undefined] }, { a: [null] }, KEYS)).toBe(false);
    expect(localDiffersFromCloud({ a: { x: 1, y: 0 } }, { a: { x: 1 } }, KEYS)).toBe(true);
  });
});

describe('pending marker storage', () => {
  it('round-trips per row and survives a throwing storage', () => {
    const s = mem();
    expect(readPending('main', s)).toBeNull();
    writePending('main', { baseVersion: 3 }, s);
    expect(readPending('main', s)).toEqual({ baseVersion: 3 });
    expect(readPending('pg_x', s)).toBeNull();
    clearPending('main', s);
    expect(readPending('main', s)).toBeNull();
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    expect(readPending('main', bad)).toBeNull();
    expect(() => { writePending('main', { baseVersion: 1 }, bad); clearPending('main', bad); }).not.toThrow();
    expect(pendingKey('main').startsWith('res_')).toBe(true);
  });
  it('treats corrupt JSON as a marker with unknown base', () => {
    const s = mem(); s.setItem(pendingKey('main'), '{oops');
    expect(readPending('main', s)).toEqual({ baseVersion: null });
  });
});
