import { describe, it, expect } from 'vitest';
import { keysToClearOnSignOut, SIGN_OUT_PRESERVE_KEYS } from './signOutCleanup.js';

describe('keysToClearOnSignOut', () => {
  it('clears every LS_BACKUP_KEYS-style res_* key', () => {
    const all = ['res_em_roster', 'res_current_block', 'res_blocks_history', 'res_app_settings'];
    expect(keysToClearOnSignOut(all).sort()).toEqual(all.sort());
  });

  it('clears res_demo_* mirrors the same as their real counterparts', () => {
    const all = ['res_demo_em_roster', 'res_demo_current_block'];
    expect(keysToClearOnSignOut(all).sort()).toEqual(all.sort());
  });

  it('preserves device-local prefs', () => {
    const all = ['res_dark_mode', 'res_ui_prefs', 'res_whats_new_seen', 'res_em_roster'];
    expect(keysToClearOnSignOut(all)).toEqual(['res_em_roster']);
  });

  it('clears res_demo_mode (not treated as a preserved device pref)', () => {
    const all = ['res_demo_mode', 'res_em_roster'];
    expect(keysToClearOnSignOut(all).sort()).toEqual(['res_demo_mode', 'res_em_roster']);
  });

  it('leaves non-res_ keys untouched (never in the input in practice, but must not explode)', () => {
    const all = ['unrelated_key', 'res_em_roster'];
    expect(keysToClearOnSignOut(all)).toEqual(['res_em_roster']);
  });

  it('returns an empty array when nothing qualifies', () => {
    expect(keysToClearOnSignOut(SIGN_OUT_PRESERVE_KEYS)).toEqual([]);
  });

  it('is pure — never mutates its input', () => {
    const all = ['res_em_roster', 'res_dark_mode'];
    const copy = [...all];
    keysToClearOnSignOut(all);
    expect(all).toEqual(copy);
  });
});
