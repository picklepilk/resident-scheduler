import { describe, it, expect } from 'vitest';
import { decideMountOverlay, localDiffersFromCloud, pendingKey, readPending, writePending, clearPending } from './pendingSync.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

describe('decideMountOverlay', () => {
  it('marker clear: takes the cloud copy (normal overlay)', () => {
    expect(decideMountOverlay({ marker: null, cloud: { status: 'ok', version: 5 }, localDiffers: true })).toBe('take-cloud');
  });
  it('marker set but local already equals cloud: takes cloud', () => {
    expect(decideMountOverlay({ marker: { baseVersion: 5 }, cloud: { status: 'ok', version: 6 }, localDiffers: false })).toBe('take-cloud');
  });
  it('marker set + cloud unchanged since base: keeps local', () => {
    expect(decideMountOverlay({ marker: { baseVersion: 5 }, cloud: { status: 'ok', version: 5 }, localDiffers: true })).toBe('keep-local');
  });
  it('marker set + cloud changed: asks', () => {
    expect(decideMountOverlay({ marker: { baseVersion: 5 }, cloud: { status: 'ok', version: 6 }, localDiffers: true })).toBe('ask');
  });
  it('marker set + unknown base version: asks', () => {
    expect(decideMountOverlay({ marker: { baseVersion: null }, cloud: { status: 'ok', version: 6 }, localDiffers: true })).toBe('ask');
    expect(decideMountOverlay({ marker: {}, cloud: { status: 'ok', version: 6 }, localDiffers: true })).toBe('ask');
  });
  it('marker set + cloud fetch failed: holds (no overlay, no write)', () => {
    expect(decideMountOverlay({ marker: { baseVersion: 5 }, cloud: { status: 'error' }, localDiffers: true })).toBe('hold');
  });
  it('marker set + cloud row empty: not decided here (seed path owns it)', () => {
    expect(decideMountOverlay({ marker: { baseVersion: 5 }, cloud: { status: 'empty' }, localDiffers: true })).toBe('take-cloud');
  });
});

describe('localDiffersFromCloud', () => {
  it('ignores keys the cloud lacks and compares deeply', () => {
    expect(localDiffersFromCloud({ a: [1], b: 2 }, { a: [1] }, ['a', 'b'])).toBe(false);
    expect(localDiffersFromCloud({ a: [1] }, { a: [2] }, ['a'])).toBe(true);
    expect(localDiffersFromCloud({ a: [1] }, { a: null }, ['a'])).toBe(false);
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
