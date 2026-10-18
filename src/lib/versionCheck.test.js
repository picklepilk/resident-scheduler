import { describe, it, expect } from 'vitest';
import { extractBundleHash, isStale, shouldRunCheck, bannerVisibleAfterStaleCheck } from './versionCheck.js';

const html = h => `<html><head><script type="module" crossorigin src="/assets/index-${h}.js"></script><link rel="modulepreload" href="/assets/vendor-ZZZ.js"></head></html>`;

describe('versionCheck', () => {
  it('extracts entry hash from html and bare src', () => {
    expect(extractBundleHash(html('Ab1_-x'))).toBe('Ab1_-x');
    expect(extractBundleHash('/assets/index-Ab1.js?x=1')).toBe('Ab1');
  });
  it('returns null for dev/unparseable input', () => {
    expect(extractBundleHash('/src/main.jsx')).toBeNull();
    expect(extractBundleHash('<script type="module" src="/src/main.jsx"></script>')).toBeNull();
    expect(extractBundleHash(null)).toBeNull();
  });
  it('isStale only when both known and different', () => {
    expect(isStale('a', 'b')).toBe(true);
    expect(isStale('a', 'a')).toBe(false);
    expect(isStale(null, 'b')).toBe(false);
    expect(isStale('a', null)).toBe(false);
  });
  it('throttles and snoozes', () => {
    expect(shouldRunCheck(null, 1000)).toBe(true);
    expect(shouldRunCheck(1000, 2000)).toBe(false);
    expect(shouldRunCheck(1000, 61000)).toBe(true);
    expect(bannerVisibleAfterStaleCheck(null, 5)).toBe(true);
    expect(bannerVisibleAfterStaleCheck(0, 1000)).toBe(false);
    expect(bannerVisibleAfterStaleCheck(0, 31 * 60 * 1000)).toBe(true);
  });
});
