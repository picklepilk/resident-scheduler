import { describe, it, expect } from 'vitest';
import { computeJeopardyTotals, computeBuyDownsApplied, computeLedger } from './jeopardyLedger.js';

const AY = 'AY26/27';

function assignment(overrides = {}) {
  return { blockType: 'EM', isChief: false, targetDelta: 0, targetNote: '', targetIsBuyDown: false, ...overrides };
}

describe('computeJeopardyTotals', () => {
  it('derives both counts from one record; a null activatedResidentId counts only the sick call', () => {
    const log = [
      { id: '1', date: '2026-08-01', shiftId: 'MT-D', sickResidentId: 'r1', activatedResidentId: 'r2', note: '', at: '' },
      { id: '2', date: '2026-08-02', shiftId: 'MT-N', sickResidentId: 'r3', activatedResidentId: null, note: '', at: '' },
    ];
    const totals = computeJeopardyTotals(AY, log);
    expect(totals.r1).toEqual({ sickCalls: 1, activations: 0 });
    expect(totals.r2).toEqual({ sickCalls: 0, activations: 1 });
    expect(totals.r3).toEqual({ sickCalls: 1, activations: 0 });
  });

  it('excludes records outside the AY, including exactly at the July 1 boundary', () => {
    const log = [
      { id: '1', date: '2026-06-30', sickResidentId: 'r1', activatedResidentId: 'r2' }, // AY25/26 (last day)
      { id: '2', date: '2026-07-01', sickResidentId: 'r1', activatedResidentId: 'r2' }, // AY26/27 (first day)
      { id: '3', date: '2027-06-30', sickResidentId: 'r1', activatedResidentId: 'r2' }, // AY26/27 (last day)
      { id: '4', date: '2027-07-01', sickResidentId: 'r1', activatedResidentId: 'r2' }, // AY27/28 (first day)
    ];
    const totals = computeJeopardyTotals(AY, log);
    // Only records 2 and 3 fall inside AY26/27.
    expect(totals.r1.sickCalls).toBe(2);
    expect(totals.r2.activations).toBe(2);
  });

  it('a resident who appears nowhere in the log is absent from the map (treated as zero by callers)', () => {
    const totals = computeJeopardyTotals(AY, [
      { id: '1', date: '2026-08-01', sickResidentId: 'r1', activatedResidentId: 'r2' },
    ]);
    expect(totals.someoneElse).toBeUndefined();
  });

  it('does not throw on malformed, empty, or null input', () => {
    expect(() => computeJeopardyTotals(AY, null)).not.toThrow();
    expect(computeJeopardyTotals(AY, null)).toEqual({});
    expect(computeJeopardyTotals(AY, [])).toEqual({});
    expect(computeJeopardyTotals(AY, undefined)).toEqual({});
    const junk = [
      null,
      undefined,
      42,
      'not a record',
      {},
      { date: null, sickResidentId: 'r1' },
      { date: 'not-a-date', sickResidentId: 'r1' },
      { date: '2026-08-01', sickResidentId: '' },
      { date: '2026-08-01', sickResidentId: null },
    ];
    expect(() => computeJeopardyTotals(AY, junk)).not.toThrow();
    expect(computeJeopardyTotals(AY, junk)).toEqual({});
  });
});

describe('computeBuyDownsApplied', () => {
  it('sums applied buy-downs across multiple snapshots plus the live block', () => {
    const block = { id: 'live', academicYear: AY, emBlockAssignments: { r1: assignment({ targetDelta: -1, targetIsBuyDown: true }) } };
    const blocksHistory = [
      { id: 'blkA', academicYear: AY, data: { emBlockAssignments: { r1: assignment({ targetDelta: -2, targetIsBuyDown: true }) } } },
      { id: 'blkB', data: { academicYear: AY, emBlockAssignments: { r1: assignment({ targetDelta: -3, targetIsBuyDown: true }) } } },
    ];
    const applied = computeBuyDownsApplied(AY, block, blocksHistory);
    expect(applied.r1).toBe(1 + 2 + 3);
  });

  it('does not double-count the live block when a snapshot with the same id exists', () => {
    const block = { id: 'blkA', academicYear: AY, emBlockAssignments: { r1: assignment({ targetDelta: -5, targetIsBuyDown: true }) } };
    const blocksHistory = [
      // Same id as the live block, same underlying data (as if it were just saved) — this
      // snapshot must be skipped in favor of counting `block` itself exactly once.
      { id: 'blkA', academicYear: AY, data: { emBlockAssignments: { r1: assignment({ targetDelta: -5, targetIsBuyDown: true }) } } },
    ];
    const applied = computeBuyDownsApplied(AY, block, blocksHistory);
    expect(applied.r1).toBe(5);
  });

  it('counts unpublished snapshots (deliberate divergence from the published-only precedent)', () => {
    const blocksHistory = [
      { id: 'draft', academicYear: AY, published: false, data: { emBlockAssignments: { r1: assignment({ targetDelta: -4, targetIsBuyDown: true }) } } },
    ];
    const applied = computeBuyDownsApplied(AY, null, blocksHistory);
    expect(applied.r1).toBe(4);
  });

  it('contributes nothing when targetIsBuyDown is false, even with a negative targetDelta', () => {
    const blocksHistory = [
      { id: 'blkA', academicYear: AY, data: { emBlockAssignments: { r1: assignment({ targetDelta: -3, targetIsBuyDown: false }) } } },
    ];
    expect(computeBuyDownsApplied(AY, null, blocksHistory)).toEqual({});
  });

  it('contributes nothing for a positive or zero targetDelta, even when targetIsBuyDown is true', () => {
    const blocksHistory = [
      { id: 'blkA', academicYear: AY, data: { emBlockAssignments: {
        r1: assignment({ targetDelta: 3, targetIsBuyDown: true }),
        r2: assignment({ targetDelta: 0, targetIsBuyDown: true }),
      } } },
    ];
    expect(computeBuyDownsApplied(AY, null, blocksHistory)).toEqual({});
  });

  it('derives the live block AY from startDate when academicYear is absent', () => {
    const block = { id: 'live', startDate: '2026-08-01', emBlockAssignments: { r1: assignment({ targetDelta: -1, targetIsBuyDown: true }) } };
    expect(computeBuyDownsApplied(AY, block, [])).toEqual({ r1: 1 });
    expect(computeBuyDownsApplied('AY25/26', block, [])).toEqual({});
  });

  it('does not throw on malformed, empty, or null input, including a null/undefined live block', () => {
    expect(() => computeBuyDownsApplied(AY, null, null)).not.toThrow();
    expect(computeBuyDownsApplied(AY, null, null)).toEqual({});
    expect(computeBuyDownsApplied(AY, undefined, undefined)).toEqual({});
    const junkHistory = [
      null,
      undefined,
      42,
      { id: 'x' }, // no data at all
      { id: 'y', academicYear: AY, data: {} },
      { id: 'z', academicYear: AY, data: { emBlockAssignments: null } },
      { id: 'w', academicYear: AY, data: { emBlockAssignments: { r1: null } } },
      { id: 'v', academicYear: AY, data: { emBlockAssignments: { r1: { targetIsBuyDown: true, targetDelta: 'not-a-number' } } } },
      { id: 'u', academicYear: AY, data: { emBlockAssignments: { r1: { targetIsBuyDown: true, targetDelta: NaN } } } },
    ];
    expect(() => computeBuyDownsApplied(AY, {}, junkHistory)).not.toThrow();
    expect(computeBuyDownsApplied(AY, {}, junkHistory)).toEqual({});
  });
});

describe('computeLedger', () => {
  it('combines totals and applied into sickCalls/activations/applied/remaining', () => {
    const log = [
      { id: '1', date: '2026-08-01', sickResidentId: 'r1', activatedResidentId: 'r2' },
      { id: '2', date: '2026-08-05', sickResidentId: 'r3', activatedResidentId: 'r2' },
    ];
    const block = { id: 'live', academicYear: AY, emBlockAssignments: { r2: assignment({ targetDelta: -1, targetIsBuyDown: true }) } };
    const blocksHistory = [];
    const ledger = computeLedger(AY, log, block, blocksHistory);
    expect(ledger.r2).toEqual({ sickCalls: 0, activations: 2, applied: 1, remaining: 1 });
    expect(ledger.r1).toEqual({ sickCalls: 1, activations: 0, applied: 0, remaining: 0 });
  });

  it('lets remaining go negative when applied exceeds activations, without clamping', () => {
    const log = [
      { id: '1', date: '2026-08-01', sickResidentId: 'r1', activatedResidentId: 'r2' },
    ];
    const block = { id: 'live', academicYear: AY, emBlockAssignments: { r2: assignment({ targetDelta: -3, targetIsBuyDown: true }) } };
    const ledger = computeLedger(AY, log, block, []);
    expect(ledger.r2).toEqual({ sickCalls: 0, activations: 1, applied: 3, remaining: -2 });
  });

  it('includes a resident with applied buy-downs but no incident-log entries', () => {
    const block = { id: 'live', academicYear: AY, emBlockAssignments: { r9: assignment({ targetDelta: -2, targetIsBuyDown: true }) } };
    const ledger = computeLedger(AY, [], block, []);
    expect(ledger.r9).toEqual({ sickCalls: 0, activations: 0, applied: 2, remaining: -2 });
  });

  it('does not throw on malformed, empty, or null input', () => {
    expect(() => computeLedger(AY, null, null, null)).not.toThrow();
    expect(computeLedger(AY, null, null, null)).toEqual({});
    expect(computeLedger(AY, undefined, undefined, undefined)).toEqual({});
  });
});
