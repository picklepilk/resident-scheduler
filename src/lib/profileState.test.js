import { describe, it, expect } from 'vitest';
import { nextProfile } from './profileState.js';

describe('nextProfile', () => {
  const admin = { role: 'admin', resident_id: null };
  it('takes the fetched row', () => {
    expect(nextProfile(undefined, admin, null)).toBe(admin);
    expect(nextProfile(admin, { role: 'resident', resident_id: 'r1' }, null)).toEqual({ role: 'resident', resident_id: 'r1' });
  });
  it('maps a missing row to null', () => {
    expect(nextProfile(undefined, null, null)).toBeNull();
    expect(nextProfile(admin, undefined, null)).toBeNull();
  });
  it('keeps the previous profile when a re-fetch fails', () => {
    expect(nextProfile(admin, null, { message: 'x' })).toBe(admin);
  });
  it('resolves a first-ever failure to null so the gate does not hang', () => {
    expect(nextProfile(undefined, null, { message: 'x' })).toBeNull();
  });
});
