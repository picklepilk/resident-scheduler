/** @vitest-environment jsdom */
// src/lib/pedNightMigration.test.js
// PED-N was split into two single-owner shift ids (PED-N stays EM Home's Thu-Sun shift,
// PED-N-FM becomes FM-3's own Mon/Tue/Wed shift). This migration rewrites already-assigned
// FM-3 'PED-N' cells to 'PED-N-FM' so they don't surface as phantom validateAll errors after
// the split — see the comment above migratePedNightAssignments in ResidentScheduler.jsx.
import { describe, it, expect } from 'vitest';
import { migratePedNightAssignments } from '../ResidentScheduler.jsx';

describe('migratePedNightAssignments', () => {
  function categoryFor(map) {
    return id => map[id];
  }

  it('rewrites an FM resident\'s PED-N cell to PED-N-FM', () => {
    const schedule = { fm1: { '2026-08-03': 'PED-N' } };
    const next = migratePedNightAssignments(schedule, categoryFor({ fm1: 'FM' }));
    expect(next).toEqual({ fm1: { '2026-08-03': 'PED-N-FM' } });
  });

  it('leaves an EM Home resident\'s PED-N cell unchanged', () => {
    const schedule = { emh1: { '2026-08-06': 'PED-N' } };
    const next = migratePedNightAssignments(schedule, categoryFor({ emh1: 'EM_HOME' }));
    expect(next).toBe(schedule);
    expect(next).toEqual({ emh1: { '2026-08-06': 'PED-N' } });
  });

  it('leaves a cell for an unknown/unresolvable resident id unchanged', () => {
    const schedule = { ghost: { '2026-08-03': 'PED-N' } };
    const next = migratePedNightAssignments(schedule, categoryFor({}));
    expect(next).toBe(schedule);
    expect(next).toEqual({ ghost: { '2026-08-03': 'PED-N' } });
  });

  it('does not touch other shift ids, even for FM residents', () => {
    const schedule = { fm1: { '2026-08-03': 'PED-N', '2026-08-04': 'PED-N-FM', '2026-08-05': 'POD-D' } };
    const next = migratePedNightAssignments(schedule, categoryFor({ fm1: 'FM' }));
    expect(next).toEqual({ fm1: { '2026-08-03': 'PED-N-FM', '2026-08-04': 'PED-N-FM', '2026-08-05': 'POD-D' } });
  });

  it('is idempotent — running twice equals running once', () => {
    const schedule = {
      fm1: { '2026-08-03': 'PED-N', '2026-08-04': 'POD-D' },
      emh1: { '2026-08-06': 'PED-N' },
    };
    const map = categoryFor({ fm1: 'FM', emh1: 'EM_HOME' });
    const once = migratePedNightAssignments(schedule, map);
    const twice = migratePedNightAssignments(once, map);
    expect(twice).toEqual(once);
    // Second pass is a true no-op — same reference, not just deep-equal — since nothing changed.
    expect(twice).toBe(once);
  });

  it('returns the same reference when nothing needs to change (no pointless write)', () => {
    const schedule = { fm1: { '2026-08-03': 'POD-D' }, emh1: { '2026-08-06': 'PED-N' } };
    const next = migratePedNightAssignments(schedule, categoryFor({ fm1: 'FM', emh1: 'EM_HOME' }));
    expect(next).toBe(schedule);
  });

  it('does not throw on a malformed or empty schedule', () => {
    expect(migratePedNightAssignments(null, categoryFor({}))).toBeNull();
    expect(migratePedNightAssignments(undefined, categoryFor({}))).toBeUndefined();
    expect(migratePedNightAssignments({}, categoryFor({}))).toEqual({});
    // A resident row that isn't an object (corrupted/hand-edited localStorage) is skipped, not thrown on.
    expect(migratePedNightAssignments({ fm1: null, fm2: 'not-an-object' }, categoryFor({ fm1: 'FM', fm2: 'FM' })))
      .toEqual({ fm1: null, fm2: 'not-an-object' });
  });
});
