// src/lib/scheduleGrouping.test.js
// Unit tests for the Schedule tab's row partitioning. Pure module, so this exercises the real
// ordering/bucketing rules directly instead of through the 8,300-line component (which has no UI
// tests at all — see CLAUDE.md).
import { describe, it, expect } from 'vitest';
import { groupResidents, GRID_GROUP_MODES, GRID_GROUP_MODE_DEFAULT, PGY_GROUPS } from './scheduleGrouping.js';
import { CATEGORIES } from './parse.js';

// Stand-ins for the two tables ResidentScheduler.jsx injects. Kept minimal and local: the point is
// to test the partition logic, and using tiny tables makes the expected ordering readable. The real
// call site passes BLOCK_TYPES_EM/BLOCK_TYPE_MAP/isEmResident.
const BLOCK_TYPES = [
  { id: 'EM',      label: 'EM' },
  { id: 'EM_TOX',  label: 'EM/TOX' },
  { id: 'METRO',   label: 'Metro' },
];
const isEm = r => r.category === 'EM_HOME' || r.category === 'EM_BAMC';
const tables = { categories: CATEGORIES, blockTypes: BLOCK_TYPES, blockTypeMap: {}, isEm };

const res = (id, category, pgy, blockType) => ({ id, category, pgy, ...(blockType ? { blockType } : {}) });

// Roster deliberately mixes EM/off-service, several PGYs, and several rotations.
const ROSTER = [
  res('a', 'EM_HOME', 1, 'EM'),
  res('b', 'EM_HOME', 2, 'EM_TOX'),
  res('c', 'EM_HOME', 3, 'METRO'),
  res('d', 'EM_BAMC', 1, 'EM'),
  res('e', 'PEDS',    2),
  res('f', 'FM',      3),
  res('g', 'EM_HOME', 2, 'EM'),
];

const ids = groups => groups.map(g => [g.cat.id, g.members.map(m => m.id)]);

describe('groupResidents — category mode (regression lock)', () => {
  it('reproduces the original CATEGORIES-order behavior', () => {
    expect(ids(groupResidents(ROSTER, 'category', tables))).toEqual([
      ['EM_HOME', ['a', 'b', 'c', 'g']],
      ['EM_BAMC', ['d']],
      ['PEDS',    ['e']],
      ['FM',      ['f']],
    ]);
  });

  it('skips categories with no members rather than rendering an empty banner', () => {
    const out = groupResidents([res('a', 'EM_HOME', 1)], 'category', tables);
    expect(out).toHaveLength(1);
    expect(out[0].cat.id).toBe('EM_HOME');
  });

  it('is the fallback for an unrecognized mode, so a stale pref can never blank the grid', () => {
    expect(ids(groupResidents(ROSTER, 'sortByVibes', tables)))
      .toEqual(ids(groupResidents(ROSTER, 'category', tables)));
  });

  it('returns [] for a missing or non-array roster instead of throwing', () => {
    for (const bad of [undefined, null, 'nope', 7]) {
      expect(groupResidents(bad, 'category', tables)).toEqual([]);
    }
  });
});

describe('groupResidents — pgy mode', () => {
  it('buckets PGY-1/2/3 in order, EM before off-service within each bucket', () => {
    // 'e' (PEDS 2) sorts after the EM_HOME PGY-2s because CATEGORIES puts EM_HOME first; 'b' before
    // 'g' because both are EM_HOME and 'b' comes first in the input.
    expect(ids(groupResidents(ROSTER, 'pgy', tables))).toEqual([
      ['PGY_1', ['a', 'd']],
      ['PGY_2', ['b', 'g', 'e']],
      ['PGY_3', ['c', 'f']],
    ]);
  });

  it('partitions ALL residents by their own PGY, off-service included', () => {
    const out = groupResidents(ROSTER, 'pgy', tables);
    expect(out.flatMap(g => g.members.map(m => m.id)).sort()).toEqual(ROSTER.map(r => r.id).sort());
  });

  it('routes a missing/garbage pgy into PGY_OTHER rather than dropping the row', () => {
    const odd = [res('x', 'EM_HOME', undefined), res('y', 'EM_HOME', 7), res('z', 'EM_HOME', 1)];
    const out = groupResidents(odd, 'pgy', tables);
    expect(ids(out)).toEqual([['PGY_1', ['z']], ['PGY_OTHER', ['x', 'y']]]);
  });

  it('carries badge/rowBg on every group so the banner render needs no mode-specific styling', () => {
    for (const g of groupResidents(ROSTER, 'pgy', tables)) {
      expect(typeof g.cat.label).toBe('string');
      expect(g.cat.badge).toBeTruthy();
      expect(g.cat.rowBg).toBeTruthy();
    }
  });
});

describe('groupResidents — rotation mode', () => {
  it('orders EM rotations by BLOCK_TYPES declaration order, then off-service categories', () => {
    expect(ids(groupResidents(ROSTER, 'rotation', tables))).toEqual([
      ['ROT_EM',     ['a', 'd', 'g']],
      ['ROT_EM_TOX', ['b']],
      ['ROT_METRO',  ['c']],
      ['PEDS',       ['e']],
      ['FM',         ['f']],
    ]);
  });

  it('treats an EM resident with no blockType as EM (the app-wide default)', () => {
    const out = groupResidents([res('n', 'EM_HOME', 1)], 'rotation', tables);
    expect(ids(out)).toEqual([['ROT_EM', ['n']]]);
  });

  it('labels EM groups from the rotation, and off-service groups from their own category', () => {
    const out = groupResidents(ROSTER, 'rotation', tables);
    expect(out.find(g => g.cat.id === 'ROT_EM_TOX').cat.label).toBe('EM/TOX');
    // Off-service reuses the real CATEGORIES entry, so its badge matches everywhere else in the app.
    const peds = out.find(g => g.cat.id === 'PEDS');
    expect(peds.cat).toBe(CATEGORIES.find(c => c.id === 'PEDS'));
  });

  it('catches an EM resident on a rotation absent from the table instead of losing the row', () => {
    const out = groupResidents([res('q', 'EM_HOME', 2, 'NOT_A_REAL_ROTATION')], 'rotation', tables);
    expect(ids(out)).toEqual([['ROT_OTHER', ['q']]]);
  });

  it('never drops or duplicates a resident', () => {
    const out = groupResidents(ROSTER, 'rotation', tables);
    expect(out.flatMap(g => g.members.map(m => m.id)).sort()).toEqual(ROSTER.map(r => r.id).sort());
  });
});

describe('mode table', () => {
  it('every declared mode produces a usable partition', () => {
    for (const mode of GRID_GROUP_MODES) {
      const out = groupResidents(ROSTER, mode, tables);
      expect(out.length).toBeGreaterThan(0);
      expect(out.flatMap(g => g.members.map(m => m.id)).sort()).toEqual(ROSTER.map(r => r.id).sort());
    }
  });

  it('the default mode is one of the declared modes', () => {
    expect(GRID_GROUP_MODES).toContain(GRID_GROUP_MODE_DEFAULT);
  });

  it('PGY_GROUPS covers exactly the levels CATEGORIES can produce, plus a catch-all', () => {
    const declared = new Set(CATEGORIES.flatMap(c => c.pgyOptions));
    const covered = new Set(PGY_GROUPS.map(g => g.pgy).filter(p => p !== null));
    expect([...declared].sort()).toEqual([...covered].sort());
    expect(PGY_GROUPS.some(g => g.pgy === null)).toBe(true);
  });
});
