import { describe, it, expect } from 'vitest';
import { summarizeSlotBlockers } from './unfilledExplainer.js';

describe('summarizeSlotBlockers', () => {
  it('groups by shiftId and sums blockerTotals across every slot for that shift', () => {
    const unfilled = [
      {
        dateStr: '2026-07-08', shiftId: 'POD-D', slotIndex: 0, reason: 'allAtTarget',
        blockers: { allAtTarget: 5, hoursCapped: 2 },
        nearMiss: [{ residentId: 'r1', reason: 'allAtTarget' }],
      },
      {
        dateStr: '2026-07-09', shiftId: 'POD-D', slotIndex: 0, reason: 'allAtTarget',
        blockers: { allAtTarget: 3, allRestBlocked: 4 },
        nearMiss: [{ residentId: 'r1', reason: 'allAtTarget' }, { residentId: 'r2', reason: 'allRestBlocked' }],
      },
      {
        dateStr: '2026-07-10', shiftId: 'MT-N', slotIndex: 0, reason: 'noEligible',
        blockers: { noEligible: 9 },
        nearMiss: [],
      },
    ];
    const summary = summarizeSlotBlockers(unfilled);

    expect(summary['POD-D'].slots).toBe(2);
    expect(summary['POD-D'].blockerTotals).toEqual({ allAtTarget: 8, hoursCapped: 2, allRestBlocked: 4 });
    expect(summary['POD-D'].nearMissResidents).toEqual({ r1: 2, r2: 1 });
    expect(summary['MT-N'].slots).toBe(1);
    expect(summary['MT-N'].blockerTotals).toEqual({ noEligible: 9 });
  });

  it('topBlocker excludes noEligible/allWorking unless they are the only reasons present', () => {
    const withMixedReasons = summarizeSlotBlockers([
      { shiftId: 'POD-D', blockers: { noEligible: 10, allAtTarget: 1 } },
    ]);
    expect(withMixedReasons['POD-D'].topBlocker).toBe('allAtTarget');

    const onlyTrivialReasons = summarizeSlotBlockers([
      { shiftId: 'PED-N', blockers: { noEligible: 4, allWorking: 2 } },
    ]);
    // noEligible has the higher count among the trivial-only set, so it wins when nothing else
    // is available to prefer.
    expect(onlyTrivialReasons['PED-N'].topBlocker).toBe('noEligible');
  });

  it('topBlocker is null when no slot carried a blockers histogram at all (old persisted report)', () => {
    const summary = summarizeSlotBlockers([
      { dateStr: '2026-07-08', shiftId: 'POD-D', slotIndex: 0, reason: 'allAtTarget' },
    ]);
    expect(summary['POD-D'].topBlocker).toBeNull();
    expect(summary['POD-D'].blockerTotals).toEqual({});
    expect(summary['POD-D'].nearMissResidents).toEqual({});
  });

  it('tolerates an empty/missing input and a slot missing shiftId', () => {
    expect(summarizeSlotBlockers([])).toEqual({});
    expect(summarizeSlotBlockers(undefined)).toEqual({});
    expect(summarizeSlotBlockers([{ dateStr: '2026-07-08' }])).toEqual({});
  });

  it('ignores a malformed nearMiss entry rather than throwing', () => {
    const summary = summarizeSlotBlockers([
      { shiftId: 'POD-D', nearMiss: [null, {}, { residentId: 'r1', reason: 'allAtTarget' }] },
    ]);
    expect(summary['POD-D'].nearMissResidents).toEqual({ r1: 1 });
  });
});
