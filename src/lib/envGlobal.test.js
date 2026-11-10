import { describe, it, expect, afterEach } from 'vitest';
import { isUnresolvedToken, readGlobal } from './envGlobal.js';

afterEach(() => { delete globalThis.__ENV_GLOBAL_TEST__; });

describe('envGlobal', () => {
  it('detects unresolved %TOKEN% strings only', () => {
    expect(isUnresolvedToken('%VITE_X%')).toBe(true);
    expect(isUnresolvedToken('https://x')).toBe(false);
    expect(isUnresolvedToken(undefined)).toBe(false);
  });
  it('readGlobal returns the value, or empty for missing/unresolved', () => {
    expect(readGlobal('__ENV_GLOBAL_TEST__')).toBe('');
    globalThis.__ENV_GLOBAL_TEST__ = '%VITE_X%';
    expect(readGlobal('__ENV_GLOBAL_TEST__')).toBe('');
    globalThis.__ENV_GLOBAL_TEST__ = 'abc';
    expect(readGlobal('__ENV_GLOBAL_TEST__')).toBe('abc');
  });
});
