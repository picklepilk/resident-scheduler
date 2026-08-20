/** @vitest-environment jsdom */
// src/lib/pedsPgy2Migration.test.js
// Peds is now PGY-2/PGY-3 only (chief-directed AY26/27 restructure) — PEDS_1 is gone from
// BASE_ELIGIBILITY/DEFAULT_DAY_RULES/SHIFT_TARGETS. This migration rewrites already-saved PEDS
// residents recorded as pgy:1 to pgy:2 so they don't silently lose all eligibility (empty
// BASE_ELIGIBILITY['PEDS_1']) after the restructure — see the comment above
// migratePedsPgy1ToPgy2 in ResidentScheduler.jsx.
import { describe, it, expect } from 'vitest';
import { migratePedsPgy1ToPgy2 } from '../ResidentScheduler.jsx';

describe('migratePedsPgy1ToPgy2', () => {
  it('rewrites a PEDS pgy:1 resident to pgy:2', () => {
    const list = [{ id: 'p1', category: 'PEDS', pgy: 1 }];
    const next = migratePedsPgy1ToPgy2(list);
    expect(next).toEqual([{ id: 'p1', category: 'PEDS', pgy: 2 }]);
  });

  it('leaves a PEDS pgy:3 resident unchanged', () => {
    const list = [{ id: 'p1', category: 'PEDS', pgy: 3 }];
    const next = migratePedsPgy1ToPgy2(list);
    expect(next).toBe(list);
    expect(next).toEqual([{ id: 'p1', category: 'PEDS', pgy: 3 }]);
  });

  it('leaves a non-PEDS pgy:1 resident (e.g. EM_HOME, EM_BAMC, NEURO) unchanged', () => {
    const list = [
      { id: 'e1', category: 'EM_HOME', pgy: 1 },
      { id: 'b1', category: 'EM_BAMC', pgy: 1 },
      { id: 'n1', category: 'NEURO', pgy: 1 },
    ];
    const next = migratePedsPgy1ToPgy2(list);
    expect(next).toBe(list);
  });

  it('only rewrites the matching entries in a mixed roster, preserving order', () => {
    const list = [
      { id: 'e1', category: 'EM_HOME', pgy: 1 },
      { id: 'p1', category: 'PEDS', pgy: 1 },
      { id: 'p2', category: 'PEDS', pgy: 3 },
      { id: 'f1', category: 'FM', pgy: 1 },
    ];
    const next = migratePedsPgy1ToPgy2(list);
    expect(next).toEqual([
      { id: 'e1', category: 'EM_HOME', pgy: 1 },
      { id: 'p1', category: 'PEDS', pgy: 2 },
      { id: 'p2', category: 'PEDS', pgy: 3 },
      { id: 'f1', category: 'FM', pgy: 1 },
    ]);
  });

  it('is idempotent — running twice equals running once', () => {
    const list = [{ id: 'p1', category: 'PEDS', pgy: 1 }];
    const once = migratePedsPgy1ToPgy2(list);
    const twice = migratePedsPgy1ToPgy2(once);
    expect(twice).toEqual(once);
    // Second pass is a true no-op — same reference, not just deep-equal — since nothing changed.
    expect(twice).toBe(once);
  });

  it('returns the same reference when nothing needs to change (no pointless write)', () => {
    const list = [{ id: 'p1', category: 'PEDS', pgy: 3 }, { id: 'e1', category: 'EM_HOME', pgy: 2 }];
    const next = migratePedsPgy1ToPgy2(list);
    expect(next).toBe(list);
  });

  it('does not throw on a malformed or empty list', () => {
    expect(migratePedsPgy1ToPgy2(null)).toBeNull();
    expect(migratePedsPgy1ToPgy2(undefined)).toBeUndefined();
    expect(migratePedsPgy1ToPgy2([])).toEqual([]);
    // A non-array input is returned untouched (untrusted shape, same convention as
    // migratePedNightAssignments's schedule-row guard).
    expect(migratePedsPgy1ToPgy2('not-an-array')).toBe('not-an-array');
  });

  it('skips a malformed entry (corrupted/hand-edited localStorage) rather than throwing', () => {
    const list = [null, 'not-an-object', { id: 'p1', category: 'PEDS', pgy: 1 }];
    const next = migratePedsPgy1ToPgy2(list);
    expect(next).toEqual([null, 'not-an-object', { id: 'p1', category: 'PEDS', pgy: 2 }]);
  });
});
