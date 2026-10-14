// Tests ../supabaseClient.js's resolveAuthToken — the pure fallback logic sbFetch
// (ResidentScheduler.jsx's SUPABASE SYNC section) uses to pick the Authorization header's token:
// the live session access token when one exists, else the anon key. Lives under src/lib/ purely
// so it sits inside vitest.config.js's include glob (../supabaseClient.js itself is outside that
// glob) — same convention src/lib/uiPrefsHook.test.js documents for src/uiPrefs.js.
//
// getAccessToken() itself (the async session-token getter) is NOT unit-tested here — it's a thin
// one-line wrapper around supabase-js's own getSession(), and ResidentScheduler.jsx/supabaseClient
// UI-adjacent code is covered by npm run dev + manual verification per CLAUDE.md, same as the rest
// of this file's auth surface.
import { describe, it, expect } from 'vitest';
import { resolveAuthToken } from '../supabaseClient.js';

describe('resolveAuthToken', () => {
  it('prefers a live session access token over the anon key', () => {
    expect(resolveAuthToken('session-jwt', 'anon-key')).toBe('session-jwt');
  });

  it('falls back to the anon key when there is no session (signed out / unconfigured)', () => {
    expect(resolveAuthToken(null, 'anon-key')).toBe('anon-key');
    expect(resolveAuthToken(undefined, 'anon-key')).toBe('anon-key');
  });

  it('only falls back on null/undefined, never on falsy-but-present values', () => {
    // `??` not `||`, deliberately: a real (if currently empty-string, which never legitimately
    // happens) access token value should win over the anon fallback — only the ABSENCE of a
    // token (null from getAccessToken, undefined from an omitted arg) should trigger it.
    expect(resolveAuthToken('', 'anon-key')).toBe('');
  });
});
