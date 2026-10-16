import { describe, it, expect } from 'vitest';
import {
  REAL_ROW_ID, LEGACY_DEMO_ROW_ID, PLAYGROUND_ID_PREFIX,
  isPlaygroundId, isLegacyDemoRowId, isSandboxRowId, ownerUidFromPlaygroundId,
  makePlaygroundId, isPlaygroundModeValue, resolveActiveRowId,
  assertWriteTargetRowId, makePlaygroundMeta, shapePlaygroundListRow, filterOwnPlaygrounds,
  findMatchingRealBlock, summarizePromoteDiff, promoteBlockSchedule,
} from './playgrounds.js';

describe('id minting/parsing', () => {
  it('mints an id that starts with the prefix and embeds the owner uid', () => {
    const id = makePlaygroundId('uid-123');
    expect(id.startsWith(PLAYGROUND_ID_PREFIX)).toBe(true);
    expect(isPlaygroundId(id)).toBe(true);
    expect(ownerUidFromPlaygroundId(id)).toBe('uid-123');
  });

  it('falls back to "local" for a blank/missing owner uid', () => {
    const id = makePlaygroundId(null);
    expect(ownerUidFromPlaygroundId(id)).toBe('local');
    expect(makePlaygroundId('').includes('_local_') || makePlaygroundId('  ').includes('_local_')).toBe(true);
  });

  it('mints distinct ids on repeated calls', () => {
    const a = makePlaygroundId('uid-1');
    const b = makePlaygroundId('uid-1');
    expect(a).not.toBe(b);
  });

  it('recognizes a non-playground id as not a playground id', () => {
    expect(isPlaygroundId(REAL_ROW_ID)).toBe(false);
    expect(isPlaygroundId(LEGACY_DEMO_ROW_ID)).toBe(false);
    expect(isPlaygroundId('pg_')).toBe(false); // no owner/rand split
    expect(isPlaygroundId('pg_onlyowner')).toBe(false); // no second underscore
    expect(isPlaygroundId(null)).toBe(false);
    expect(isPlaygroundId(undefined)).toBe(false);
  });

  it('isLegacyDemoRowId / isSandboxRowId classify every row kind correctly', () => {
    const pgId = makePlaygroundId('uid-9');
    expect(isLegacyDemoRowId(LEGACY_DEMO_ROW_ID)).toBe(true);
    expect(isLegacyDemoRowId(pgId)).toBe(false);
    expect(isSandboxRowId(pgId)).toBe(true);
    expect(isSandboxRowId(LEGACY_DEMO_ROW_ID)).toBe(true);
    expect(isSandboxRowId(REAL_ROW_ID)).toBe(false);
  });

  it('handles an owner uid containing no underscores (normal uuid shape) round-trip', () => {
    const uid = '3f9b1c2a-aaaa-bbbb-cccc-1234567890ab';
    const id = makePlaygroundId(uid);
    expect(ownerUidFromPlaygroundId(id)).toBe(uid);
  });
});

describe('legacy-flag migration / mode resolution', () => {
  it('treats absent/false as not in sandbox', () => {
    expect(isPlaygroundModeValue(undefined)).toBe(false);
    expect(isPlaygroundModeValue(null)).toBe(false);
    expect(isPlaygroundModeValue('false')).toBe(false);
    expect(resolveActiveRowId(undefined)).toBe(null);
    expect(resolveActiveRowId('false')).toBe(null);
  });

  it('treats legacy boolean "true" as the old shared demo row', () => {
    expect(isPlaygroundModeValue('true')).toBe(true);
    expect(resolveActiveRowId('true')).toBe(LEGACY_DEMO_ROW_ID);
  });

  it('treats a playground id string as that playground active', () => {
    const id = makePlaygroundId('uid-5');
    expect(isPlaygroundModeValue(id)).toBe(true);
    expect(resolveActiveRowId(id)).toBe(id);
  });

  it('resolves a corrupt/unrecognized stored value to null rather than guessing', () => {
    expect(resolveActiveRowId('garbage')).toBe(null);
    expect(resolveActiveRowId('')).toBe(null);
  });
});

describe('assertWriteTargetRowId', () => {
  it('allows a real write to the real row', () => {
    expect(() => assertWriteTargetRowId(REAL_ROW_ID, { expectPlayground: false })).not.toThrow();
  });

  it('allows a playground write to a playground row', () => {
    const id = makePlaygroundId('uid-1');
    expect(() => assertWriteTargetRowId(id, { expectPlayground: true })).not.toThrow();
  });

  it('allows a playground write to the legacy demo row (migration/delete path)', () => {
    expect(() => assertWriteTargetRowId(LEGACY_DEMO_ROW_ID, { expectPlayground: true })).not.toThrow();
  });

  it('refuses a real-workspace writer targeting a playground row', () => {
    const id = makePlaygroundId('uid-1');
    expect(() => assertWriteTargetRowId(id, { expectPlayground: false })).toThrow(/Refusing/);
  });

  it('refuses a real-workspace writer targeting the legacy demo row', () => {
    expect(() => assertWriteTargetRowId(LEGACY_DEMO_ROW_ID, { expectPlayground: false })).toThrow(/Refusing/);
  });

  it('refuses a playground writer targeting the real row', () => {
    expect(() => assertWriteTargetRowId(REAL_ROW_ID, { expectPlayground: true })).toThrow(/Refusing/);
  });
});

describe('playground metadata + list shaping', () => {
  it('builds metadata with sensible defaults', () => {
    const meta = makePlaygroundMeta({ name: '  My Sandbox  ', ownerUid: 'uid-1', ownerEmail: 'a@b.com', source: 'blank' });
    expect(meta.name).toBe('My Sandbox');
    expect(meta.ownerUid).toBe('uid-1');
    expect(meta.source).toBe('blank');
    expect(typeof meta.createdAt).toBe('string');
  });

  it('defaults an unnamed/blank name and non-"blank" source to "copy"', () => {
    const meta = makePlaygroundMeta({ name: '   ', ownerUid: 'uid-1' });
    expect(meta.name).toBe('Untitled playground');
    expect(meta.source).toBe('copy');
  });

  it('shapes a well-formed PostgREST listing row', () => {
    const id = makePlaygroundId('uid-1');
    const row = { id, updated_at: '2026-10-01T00:00:00Z', meta: { name: 'Block 4 practice', ownerUid: 'uid-1', source: 'blank', createdAt: '2026-09-30T00:00:00Z' } };
    const shaped = shapePlaygroundListRow(row);
    expect(shaped).toEqual({
      id, name: 'Block 4 practice', source: 'blank', ownerUid: 'uid-1', ownerEmail: null,
      createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    });
  });

  it('tolerates a row with missing/malformed meta (untrusted shape)', () => {
    const id = makePlaygroundId('uid-2');
    expect(shapePlaygroundListRow({ id, updated_at: null, meta: null })).toEqual({
      id, name: 'Untitled playground', source: 'copy', ownerUid: 'uid-2', ownerEmail: null,
      createdAt: null, updatedAt: null,
    });
    expect(shapePlaygroundListRow(null)).toEqual({
      id: null, name: 'Untitled playground', source: 'copy', ownerUid: null, ownerEmail: null,
      createdAt: null, updatedAt: null,
    });
  });

  it('falls back to the id-embedded owner uid when meta.ownerUid is missing', () => {
    const id = makePlaygroundId('uid-7');
    const shaped = shapePlaygroundListRow({ id, meta: {} });
    expect(shaped.ownerUid).toBe('uid-7');
  });

  it('filterOwnPlaygrounds keeps only rows whose id embeds the given owner uid', () => {
    const mine1 = makePlaygroundId('uid-1');
    const mine2 = makePlaygroundId('uid-1');
    const theirs = makePlaygroundId('uid-2');
    const rows = [{ id: mine1 }, { id: theirs }, { id: mine2 }];
    const mine = filterOwnPlaygrounds(rows, 'uid-1').map(r => r.id);
    expect(mine.sort()).toEqual([mine1, mine2].sort());
  });

  it('filterOwnPlaygrounds returns empty for a missing owner uid', () => {
    expect(filterOwnPlaygrounds([{ id: makePlaygroundId('uid-1') }], null)).toEqual([]);
  });
});

describe('promote: findMatchingRealBlock', () => {
  it('matches by block id', () => {
    const realDoc = { res_current_block: { id: 'blk1', startDate: '2026-01-01', endDate: '2026-01-28' } };
    const pgBlock = { id: 'blk1', startDate: '2099-01-01', endDate: '2099-01-28' }; // dates deliberately differ
    expect(findMatchingRealBlock(realDoc, pgBlock)).toBe(realDoc.res_current_block);
  });

  it('falls back to matching by start/end dates when ids differ', () => {
    const realDoc = { res_current_block: { id: 'blk-real', startDate: '2026-01-01', endDate: '2026-01-28' } };
    const pgBlock = { id: 'blk-pg-copy', startDate: '2026-01-01', endDate: '2026-01-28' };
    expect(findMatchingRealBlock(realDoc, pgBlock)).toBe(realDoc.res_current_block);
  });

  it('returns null when neither id nor dates match', () => {
    const realDoc = { res_current_block: { id: 'blk-real', startDate: '2026-01-01', endDate: '2026-01-28' } };
    const pgBlock = { id: 'blk-pg', startDate: '2026-02-01', endDate: '2026-02-28' };
    expect(findMatchingRealBlock(realDoc, pgBlock)).toBe(null);
  });

  it('returns null when the real doc has no current block', () => {
    expect(findMatchingRealBlock({}, { id: 'blk1' })).toBe(null);
    expect(findMatchingRealBlock(null, { id: 'blk1' })).toBe(null);
  });
});

describe('promote: summarizePromoteDiff', () => {
  it('counts changed cells and distinct residents affected', () => {
    const realBlock = { schedule: { r1: { '2026-01-01': 'POD-D' }, r2: { '2026-01-02': 'MT-N' } } };
    const pgBlock = { schedule: { r1: { '2026-01-01': 'POD-N' }, r2: { '2026-01-02': 'MT-N' }, r3: { '2026-01-03': 'FLEX-D' } } };
    const diff = summarizePromoteDiff(realBlock, pgBlock);
    expect(diff).toEqual({ cellsChanged: 2, residentsAffected: 2 }); // r1 swap, r3 new; r2 unchanged
  });

  it('reports zero for identical schedules', () => {
    const sched = { r1: { '2026-01-01': 'POD-D' } };
    expect(summarizePromoteDiff({ schedule: sched }, { schedule: { r1: { '2026-01-01': 'POD-D' } } }))
      .toEqual({ cellsChanged: 0, residentsAffected: 0 });
  });

  it('treats a missing cell on either side as unassigned, not a diff against itself', () => {
    const realBlock = { schedule: { r1: {} } };
    const pgBlock = { schedule: {} };
    expect(summarizePromoteDiff(realBlock, pgBlock)).toEqual({ cellsChanged: 0, residentsAffected: 0 });
  });
});

describe('promote: promoteBlockSchedule (merge)', () => {
  it('replaces only schedule+lockedCells of the matched block, leaving everything else untouched', () => {
    const realDoc = {
      res_em_roster: [{ id: 'r1' }],
      res_app_settings: { foo: 'bar' },
      res_current_block: {
        id: 'blk1', name: 'Block 4', startDate: '2026-01-01', endDate: '2026-01-28',
        offServiceResidents: [{ id: 'off1' }],
        schedule: { r1: { '2026-01-01': 'POD-D' } },
      },
      res_blocks_history: [{ id: 'blk0', data: { schedule: {} } }],
    };
    const pgBlock = {
      id: 'blk1', startDate: '2026-01-01', endDate: '2026-01-28',
      schedule: { r1: { '2026-01-01': 'POD-N' } },
      lockedCells: { r1: { '2026-01-01': true } },
    };
    const merged = promoteBlockSchedule(realDoc, pgBlock);
    expect(merged.res_current_block.schedule).toEqual(pgBlock.schedule);
    expect(merged.res_current_block.lockedCells).toEqual(pgBlock.lockedCells);
    // Untouched fields survive exactly:
    expect(merged.res_current_block.name).toBe('Block 4');
    expect(merged.res_current_block.offServiceResidents).toBe(realDoc.res_current_block.offServiceResidents);
    expect(merged.res_em_roster).toBe(realDoc.res_em_roster);
    expect(merged.res_app_settings).toBe(realDoc.res_app_settings);
    expect(merged.res_blocks_history).toBe(realDoc.res_blocks_history);
    // Original untouched (pure function):
    expect(realDoc.res_current_block.schedule).toEqual({ r1: { '2026-01-01': 'POD-D' } });
  });

  it('omits lockedCells from the patch when the playground block carries none', () => {
    const realDoc = { res_current_block: { id: 'blk1', startDate: '2026-01-01', endDate: '2026-01-28', lockedCells: { r1: { '2026-01-01': true } }, schedule: {} } };
    const pgBlock = { id: 'blk1', startDate: '2026-01-01', endDate: '2026-01-28', schedule: { r1: { '2026-01-01': 'POD-N' } } };
    const merged = promoteBlockSchedule(realDoc, pgBlock);
    // lockedCells untouched since pgBlock didn't carry the key at all
    expect(merged.res_current_block.lockedCells).toEqual({ r1: { '2026-01-01': true } });
  });

  it('returns null when there is no matching real block (refuse, do not guess)', () => {
    const realDoc = { res_current_block: { id: 'blk-real', startDate: '2026-01-01', endDate: '2026-01-28' } };
    const pgBlock = { id: 'blk-pg', startDate: '2099-01-01', endDate: '2099-01-28', schedule: {} };
    expect(promoteBlockSchedule(realDoc, pgBlock)).toBe(null);
  });
});
