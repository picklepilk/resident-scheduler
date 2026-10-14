// Tests ../residentRequests/blockLookup.js's normalizeLookupBlocks/normalizeLookupAyData/
// normalizeLookupRoster — the pure shape-guarding logic applied to
// public.resident_block_lookup()'s jsonb result (supabase/migrate_res_state_admin_only.sql)
// before fetchBlocksForLookup/fetchAyDataForLookup/fetchRosterForPicker hand it to
// RequestForm/RequestList/ResidentPicker. Lives under src/lib/ purely so it sits inside
// vitest.config.js's include glob — same convention src/lib/uiPrefsHook.test.js documents for
// src/uiPrefs.js. Importing blockLookup.js directly is safe with no supabase-js mocking: its
// module-level code only reads unset globalThis flags in this test environment (AUTH_ENABLED
// resolves false, `supabase` resolves null), same as every other file that imports
// supabaseClient.js outside a browser.
import { describe, it, expect } from 'vitest';
import {
  normalizeLookupBlocks,
  normalizeLookupAyData,
  normalizeLookupRoster,
} from '../residentRequests/blockLookup.js';

describe('normalizeLookupBlocks', () => {
  it('passes through a well-formed blocks array', () => {
    const blocks = [{ id: 'b1', name: 'Block 1', startDate: '2026-01-01', endDate: '2026-01-28' }];
    expect(normalizeLookupBlocks({ blocks })).toBe(blocks);
  });

  it('defaults to [] for every malformed shape (null RPC result, missing/non-array field)', () => {
    expect(normalizeLookupBlocks(null)).toEqual([]);
    expect(normalizeLookupBlocks(undefined)).toEqual([]);
    expect(normalizeLookupBlocks({})).toEqual([]);
    expect(normalizeLookupBlocks({ blocks: 'not-an-array' })).toEqual([]);
    expect(normalizeLookupBlocks({ blocks: null })).toEqual([]);
  });
});

describe('normalizeLookupAyData', () => {
  it('passes through a well-formed ayData object', () => {
    const ayData = { 2026: { holidays: [] } };
    expect(normalizeLookupAyData({ ayData })).toBe(ayData);
  });

  it('defaults to {} for every malformed shape', () => {
    expect(normalizeLookupAyData(null)).toEqual({});
    expect(normalizeLookupAyData(undefined)).toEqual({});
    expect(normalizeLookupAyData({})).toEqual({});
    expect(normalizeLookupAyData({ ayData: null })).toEqual({});
    expect(normalizeLookupAyData({ ayData: 'not-an-object' })).toEqual({});
  });
});

describe('normalizeLookupRoster', () => {
  it('narrows to id/firstName/lastName and sorts by last name', () => {
    const roster = [
      { id: 'r2', firstName: 'Bob', lastName: 'Zeta', extraField: 'should be dropped' },
      { id: 'r1', firstName: 'Alice', lastName: 'Adams' },
    ];
    expect(normalizeLookupRoster({ roster })).toEqual([
      { id: 'r1', firstName: 'Alice', lastName: 'Adams' },
      { id: 'r2', firstName: 'Bob', lastName: 'Zeta' },
    ]);
  });

  it('defaults to [] for every malformed shape', () => {
    expect(normalizeLookupRoster(null)).toEqual([]);
    expect(normalizeLookupRoster(undefined)).toEqual([]);
    expect(normalizeLookupRoster({})).toEqual([]);
    expect(normalizeLookupRoster({ roster: 'not-an-array' })).toEqual([]);
  });
});
