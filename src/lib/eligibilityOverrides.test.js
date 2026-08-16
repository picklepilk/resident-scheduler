import { describe, it, expect } from 'vitest';
import {
  backfillLaterAddedShiftIds,
  isEligibilityDiff,
  eligibilityDiff,
  isEligibilityDiffEmpty,
  applyEligibilityDiff,
  normalizeEligibilityOverride,
  resolveEligibilityList,
} from './eligibilityOverrides.js';

// A base carrying both 9h shifts and their 12h conference variants, used across most of this file.
const POD_BASE = ['POD-D', 'POD-N', 'POD-D12', 'POD-N12'];

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
