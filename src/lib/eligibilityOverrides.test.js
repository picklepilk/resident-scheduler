import { describe, it, expect } from 'vitest';
import {
  backfillLaterAddedShiftIds,
  applyLegacyShiftIdRenames,
  renameDiffShiftIds,
  isEligibilityDiff,
  eligibilityDiff,
  isEligibilityDiffEmpty,
  applyEligibilityDiff,
  normalizeEligibilityOverride,
  resolveEligibilityList,
} from './eligibilityOverrides.js';

// A base carrying both 9h shifts and their 12h conference variants, used across most of this file.
const POD_BASE = ['POD-D', 'POD-N', 'POD-D12', 'POD-N12'];

// Post-split base: FM-3's grant is now PED-N-FM, PED-N/PED-N12 no longer mean anything for FM-3.
const FM3_BASE = ['PED-N-FM'];

// An EM-Home-shaped base that still (correctly) grants plain PED-N -- the split only affects the
// FM-3 name, PED-N itself stays EM-Home-eligible. The rename must never fire against this base.
const EM_HOME_BASE = ['POD-D', 'PED-N', 'MT-D'];

describe('backfillLaterAddedShiftIds', () => {
  it('adds POD-D12 when the list has POD-D and the base grants POD-D12', () => {
    const result = backfillLaterAddedShiftIds(['POD-D'], ['POD-D', 'POD-D12']);
    expect(result).toEqual(['POD-D', 'POD-D12']);
  });

  it('adds POD-N12 when the list has POD-N and the base grants POD-N12', () => {
    const result = backfillLaterAddedShiftIds(['POD-N'], ['POD-N', 'POD-N12']);
    expect(result).toEqual(['POD-N', 'POD-N12']);
  });

  it('does not add a 12h id whose 9h counterpart is absent (area deliberately dropped)', () => {
    // list dropped POD-D entirely; base still carries POD-D/POD-D12 for other residents.
    const list = ['MT-D'];
    const base = ['POD-D', 'POD-D12', 'MT-D'];
    const result = backfillLaterAddedShiftIds(list, base);
    expect(result).toBe(list); // nothing to add -> identity
  });

  it('does not add a 12h id the base does not grant, even when the list has the 9h shift (NEURO_1-style)', () => {
    // base never grants FLEX-D12 at all (e.g. NEURO_1: eligible for FLEX-D but not FLEX-D12).
    const list = ['FLEX-D'];
    const base = ['FLEX-D'];
    const result = backfillLaterAddedShiftIds(list, base);
    expect(result).toBe(list);
  });

  it('returns the list unchanged (same reference) when nothing to add', () => {
    const list = ['POD-D', 'POD-D12'];
    const base = ['POD-D', 'POD-D12'];
    expect(backfillLaterAddedShiftIds(list, base)).toBe(list);
  });

  it('returns non-array inputs unchanged', () => {
    expect(backfillLaterAddedShiftIds(null, POD_BASE)).toBeNull();
    expect(backfillLaterAddedShiftIds(undefined, POD_BASE)).toBeUndefined();
    const list = ['POD-D'];
    expect(backfillLaterAddedShiftIds(list, null)).toBe(list);
    expect(backfillLaterAddedShiftIds(list, undefined)).toBe(list);
    expect(backfillLaterAddedShiftIds('nonsense', POD_BASE)).toBe('nonsense');
  });
});

describe('applyLegacyShiftIdRenames (legacy array)', () => {
  it('renames PED-N/PED-N12 to PED-N-FM against the post-split FM-3 base', () => {
    const result = applyLegacyShiftIdRenames(['PED-N', 'PED-N12'], FM3_BASE);
    expect(result).toEqual(['PED-N-FM']);
  });

  it('through normalizeEligibilityOverride the resulting diff is EMPTY (deletes the key)', () => {
    const legacy = ['PED-N', 'PED-N12'];
    const diff = normalizeEligibilityOverride(legacy, FM3_BASE);
    expect(diff).toEqual({ added: [], removed: [] });
    expect(resolveEligibilityList(legacy, FM3_BASE)).toEqual(FM3_BASE);
  });

  it('does NOT fire against an EM-Home-shaped base that still grants plain PED-N', () => {
    const list = [...EM_HOME_BASE];
    expect(applyLegacyShiftIdRenames(list, EM_HOME_BASE)).toBe(list);
    expect(normalizeEligibilityOverride(list, EM_HOME_BASE)).toEqual({ added: [], removed: [] });
  });

  it('does NOT fire when the base grants both the old and new ids', () => {
    const base = ['PED-N', 'PED-N-FM'];
    const list = ['PED-N', 'PED-N12'];
    expect(applyLegacyShiftIdRenames(list, base)).toBe(list);
  });

  it('is a no-op when the list never named the old id', () => {
    const list = ['POD-D'];
    expect(applyLegacyShiftIdRenames(list, FM3_BASE)).toBe(list);
  });

  it('returns non-array inputs unchanged', () => {
    expect(applyLegacyShiftIdRenames(null, FM3_BASE)).toBeNull();
    expect(applyLegacyShiftIdRenames(undefined, FM3_BASE)).toBeUndefined();
    const list = ['PED-N'];
    expect(applyLegacyShiftIdRenames(list, null)).toBe(list);
    expect(applyLegacyShiftIdRenames(list, undefined)).toBe(list);
    expect(applyLegacyShiftIdRenames('nonsense', FM3_BASE)).toBe('nonsense');
  });

  it('alsoDrop only drops an id absent from the current base -- one still directly granted survives', () => {
    // Contrived base where PED-N-FM AND PED-N12 are both directly granted (PED-N12 unrelated to
    // the rename here). The rename should still convert PED-N -> PED-N-FM but must leave the
    // independently-granted PED-N12 alone.
    const base = ['PED-N-FM', 'PED-N12'];
    const list = ['PED-N', 'PED-N12'];
    const result = applyLegacyShiftIdRenames(list, base);
    expect(result.sort()).toEqual(['PED-N-FM', 'PED-N12']);
  });
});

describe('renameDiffShiftIds (stored diff) -- the live population', () => {
  it('a removal survives the rename: {removed:[PED-N,PED-N12]} -> {removed:[PED-N-FM]}', () => {
    // This is the important case: a chief who explicitly revoked FM-3's peds night must not
    // silently regain that grant just because the underlying id was renamed.
    const diff = { added: [], removed: ['PED-N', 'PED-N12'] };
    expect(renameDiffShiftIds(diff, FM3_BASE)).toEqual({ added: [], removed: ['PED-N-FM'] });
  });

  it('an addition is translated: {added:[PED-N]} -> {added:[PED-N-FM]}', () => {
    const diff = { added: ['PED-N'], removed: [] };
    expect(renameDiffShiftIds(diff, FM3_BASE)).toEqual({ added: ['PED-N-FM'], removed: [] });
  });

  it('through normalizeEligibilityOverride, a stored removal diff keeps blocking FM-3 from PED-N-FM', () => {
    const stored = { added: [], removed: ['PED-N', 'PED-N12'] };
    const diff = normalizeEligibilityOverride(stored, FM3_BASE);
    expect(diff).toEqual({ added: [], removed: ['PED-N-FM'] });
    expect(resolveEligibilityList(stored, FM3_BASE)).toEqual([]);
  });

  it('does NOT fire against an EM-Home-shaped base that still grants plain PED-N', () => {
    const diff = { added: [], removed: ['PED-N'] };
    expect(renameDiffShiftIds(diff, EM_HOME_BASE)).toEqual(diff);
    expect(normalizeEligibilityOverride(diff, EM_HOME_BASE)).toEqual({ added: [], removed: ['PED-N'] });
  });

  it('does NOT fire when the base grants both the old and new ids', () => {
    const base = ['PED-N', 'PED-N-FM'];
    const diff = { added: [], removed: ['PED-N', 'PED-N12'] };
    expect(renameDiffShiftIds(diff, base)).toEqual(diff);
  });

  it('is a no-op when neither array names the old id', () => {
    const diff = { added: ['POD-D'], removed: ['MT-D'] };
    expect(renameDiffShiftIds(diff, FM3_BASE)).toEqual(diff);
  });

  it('rewrites only the side that actually names the old id', () => {
    const diff = { added: ['POD-D'], removed: ['PED-N', 'PED-N12'] };
    expect(renameDiffShiftIds(diff, FM3_BASE)).toEqual({ added: ['POD-D'], removed: ['PED-N-FM'] });
  });

  it('does not introduce duplicates when PED-N-FM is already present', () => {
    const diff = { added: [], removed: ['PED-N', 'PED-N12', 'PED-N-FM'] };
    const result = renameDiffShiftIds(diff, FM3_BASE);
    expect(result.removed.sort()).toEqual(['PED-N-FM']);
  });

  it('null/garbage diff and non-array base pass through unchanged', () => {
    expect(renameDiffShiftIds(null, FM3_BASE)).toBeNull();
    expect(renameDiffShiftIds(undefined, FM3_BASE)).toBeUndefined();
    const diff = { added: ['PED-N'], removed: [] };
    expect(renameDiffShiftIds(diff, null)).toBe(diff);
    expect(renameDiffShiftIds(diff, undefined)).toBe(diff);
  });

  it('alsoDrop only drops an id absent from the current base -- one still directly granted survives', () => {
    const base = ['PED-N-FM', 'PED-N12'];
    const diff = { added: [], removed: ['PED-N', 'PED-N12'] };
    const result = renameDiffShiftIds(diff, base);
    expect(result.removed.sort()).toEqual(['PED-N-FM', 'PED-N12']);
  });
});

describe('isEligibilityDiff', () => {
  it('true for an object with an added array', () => {
    expect(isEligibilityDiff({ added: [] })).toBe(true);
  });

  it('true for an object with a removed array', () => {
    expect(isEligibilityDiff({ removed: [] })).toBe(true);
  });

  it('false for a plain array (legacy shape)', () => {
    expect(isEligibilityDiff(['POD-D'])).toBe(false);
  });

  it('false for an object with neither added nor removed as arrays', () => {
    expect(isEligibilityDiff({})).toBe(false);
    expect(isEligibilityDiff({ added: 'nope' })).toBe(false);
  });

  it('false for null/undefined/primitives', () => {
    expect(isEligibilityDiff(null)).toBe(false);
    expect(isEligibilityDiff(undefined)).toBe(false);
    expect(isEligibilityDiff('nope')).toBe(false);
    expect(isEligibilityDiff(42)).toBe(false);
  });
});

describe('eligibilityDiff: plain diff, no backfill', () => {
  it('a list missing a base id yields that id in removed', () => {
    const diff = eligibilityDiff(['POD-D'], ['POD-D', 'POD-N']);
    expect(diff).toEqual({ added: [], removed: ['POD-N'] });
  });

  it('a list adding an id not in base yields that id in added', () => {
    const diff = eligibilityDiff(['POD-D', 'MT-D'], ['POD-D']);
    expect(diff).toEqual({ added: ['MT-D'], removed: [] });
  });

  it('added/removed are both sorted', () => {
    const diff = eligibilityDiff(['POD-D', 'Z-X', 'A-Y'], ['POD-D', 'C-1', 'B-2']);
    expect(diff.added).toEqual(['A-Y', 'Z-X']);
    expect(diff.removed).toEqual(['B-2', 'C-1']);
  });

  it('empty diff for an identical list', () => {
    const diff = eligibilityDiff(['POD-D', 'POD-N'], ['POD-N', 'POD-D']);
    expect(diff).toEqual({ added: [], removed: [] });
  });

  it('does NOT backfill later-added 12h ids -- an explicit list missing POD-D12 reports it removed', () => {
    const diff = eligibilityDiff(['POD-D', 'POD-N'], POD_BASE);
    expect(diff.removed.sort()).toEqual(['POD-D12', 'POD-N12']);
  });
});

describe('isEligibilityDiffEmpty', () => {
  it('true for {added:[],removed:[]}', () => {
    expect(isEligibilityDiffEmpty({ added: [], removed: [] })).toBe(true);
  });

  it('true for null/undefined', () => {
    expect(isEligibilityDiffEmpty(null)).toBe(true);
    expect(isEligibilityDiffEmpty(undefined)).toBe(true);
  });

  it('false when added is non-empty', () => {
    expect(isEligibilityDiffEmpty({ added: ['POD-D'], removed: [] })).toBe(false);
  });

  it('false when removed is non-empty', () => {
    expect(isEligibilityDiffEmpty({ added: [], removed: ['POD-D'] })).toBe(false);
  });
});

describe('applyEligibilityDiff', () => {
  it('base minus removed plus added, with base order preserved', () => {
    const base = ['POD-D', 'POD-N', 'POD-D12'];
    const diff = { removed: ['POD-N'], added: ['MT-D'] };
    expect(applyEligibilityDiff(base, diff)).toEqual(['POD-D', 'POD-D12', 'MT-D']);
  });

  it('an added id not present in base is appended', () => {
    const base = ['POD-D'];
    const diff = { added: ['MT-D'], removed: [] };
    expect(applyEligibilityDiff(base, diff)).toEqual(['POD-D', 'MT-D']);
  });

  it('an added id already present in base is not duplicated', () => {
    const base = ['POD-D', 'POD-N'];
    const diff = { added: ['POD-D'], removed: [] };
    expect(applyEligibilityDiff(base, diff)).toEqual(['POD-D', 'POD-N']);
  });

  it('empty diff returns a copy of base (equal but not the same reference)', () => {
    const base = ['POD-D', 'POD-N'];
    const result = applyEligibilityDiff(base, { added: [], removed: [] });
    expect(result).toEqual(base);
    expect(result).not.toBe(base);
  });

  it('null diff returns a copy of base', () => {
    const base = ['POD-D', 'POD-N'];
    const result = applyEligibilityDiff(base, null);
    expect(result).toEqual(base);
    expect(result).not.toBe(base);
  });
});

describe('normalizeEligibilityOverride', () => {
  it('null/undefined -> null', () => {
    expect(normalizeEligibilityOverride(null, POD_BASE)).toBeNull();
    expect(normalizeEligibilityOverride(undefined, POD_BASE)).toBeNull();
  });

  it('diff shape passes through, keeping only string ids', () => {
    const value = { added: ['POD-D', 42, ''], removed: ['POD-N', null] };
    expect(normalizeEligibilityOverride(value, POD_BASE)).toEqual({
      added: ['POD-D'],
      removed: ['POD-N'],
    });
  });

  it('legacy array shape gets backfill applied BEFORE diffing -- the ACEP-outage fix', () => {
    // A pre-12h save: chief only ever saw POD-D/POD-N, so the snapshot never had a chance to
    // include POD-D12/POD-N12. Without backfill-before-diff this would report both 12h ids as
    // deliberately removed, reproducing the outage.
    const legacy = ['POD-D', 'POD-N'];
    const diff = normalizeEligibilityOverride(legacy, POD_BASE);
    expect(diff).toEqual({ added: [], removed: [] });
    expect(resolveEligibilityList(legacy, POD_BASE).sort()).toEqual([...POD_BASE].sort());
  });

  it('a legacy snapshot that genuinely dropped an area reports those ids as removed', () => {
    // No POD-D at all in the snapshot -> POD-D/POD-D12 stay dropped; POD-N is present so its
    // 12h counterpart POD-N12 is still backfilled.
    const legacy = ['POD-N'];
    const diff = normalizeEligibilityOverride(legacy, POD_BASE);
    expect(diff.removed.sort()).toEqual(['POD-D', 'POD-D12']);
    expect(diff.added).toEqual([]);
  });

  it('junk values -> null', () => {
    expect(normalizeEligibilityOverride('nope', POD_BASE)).toBeNull();
    expect(normalizeEligibilityOverride(42, POD_BASE)).toBeNull();
    // {} has neither `added` nor `removed` as an array, so isEligibilityDiff is false, and it's
    // not an array either -- normalizeEligibilityOverride falls through to null.
    expect(normalizeEligibilityOverride({}, POD_BASE)).toBeNull();
  });

  it('arrays containing non-strings/empty strings are filtered before backfill/diff', () => {
    const base = ['POD-D', 'POD-N'];
    const legacy = ['POD-D', 42, '', null, 'POD-N'];
    expect(normalizeEligibilityOverride(legacy, base)).toEqual({ added: [], removed: [] });
  });
});

describe('resolveEligibilityList', () => {
  it('no override returns a copy of base', () => {
    const base = ['POD-D', 'POD-N'];
    const result = resolveEligibilityList(null, base);
    expect(result).toEqual(base);
    expect(result).not.toBe(base);
  });

  it('diff shape resolves correctly', () => {
    const base = ['POD-D', 'POD-N'];
    const value = { added: ['MT-D'], removed: ['POD-N'] };
    expect(resolveEligibilityList(value, base)).toEqual(['POD-D', 'MT-D']);
  });

  it('legacy array shape resolves correctly, including backfilled 12h ids', () => {
    const legacy = ['POD-D', 'POD-N'];
    expect(resolveEligibilityList(legacy, POD_BASE).sort()).toEqual([...POD_BASE].sort());
  });
});

describe('round-trip: applyEligibilityDiff(base, eligibilityDiff(list, base)) equals list as a set', () => {
  const cases = [
    {
      name: 'adds an id not in base and removes one',
      base: ['POD-D', 'POD-N', 'MT-D'],
      list: ['POD-D', 'MT-D', 'FLEX-D'],
    },
    {
      name: 'removes several ids, keeps one',
      base: ['A', 'B', 'C', 'D', 'E'],
      list: ['A'],
    },
    {
      name: 'no change at all',
      base: ['POD-D', 'POD-N'],
      list: ['POD-N', 'POD-D'],
    },
    {
      name: 'wholesale replacement (no overlap)',
      base: ['POD-D', 'POD-N'],
      list: ['MT-D', 'MT-N'],
    },
  ];

  for (const { name, base, list } of cases) {
    it(name, () => {
      const diff = eligibilityDiff(list, base);
      const result = applyEligibilityDiff(base, diff);
      expect(new Set(result)).toEqual(new Set(list));
    });
  }
});
