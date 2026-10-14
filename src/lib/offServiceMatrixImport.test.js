/** @vitest-environment jsdom */
// src/lib/offServiceMatrixImport.test.js
// Integration test for the 2026-10-14 straddle-window fix: ImportMatrixModal's commit() used to
// CLAMP an off-service resident's availableRanges to whichever single block was being imported, so
// offServiceWindowStatus's pro-rated/measured straddle math (see seniorityTargets.test.js's "1.11"
// suite) never actually fired on a real Master-Matrix import — totalWindowDays always equaled
// overlapDays. buildOffServiceResidentsForBlock is the extracted, unit-testable piece of commit()
// that now stores the REAL unclamped window (o.start/o.end verbatim); this test drives it the way a
// real two-block import would (the same off-service sheet row producing one record per EM block it
// overlaps, each with a fresh id but the identical unclamped range) and checks the straddle status
// comes out non-null/pro-rated on block 1 and measured on block 2.
import { describe, it, expect } from 'vitest';
import { buildOffServiceResidentsForBlock, offServiceWindowStatus } from '../ResidentScheduler.jsx';

// A podiatry resident's real ER window: 14 days, split exactly 7/7 across the two EM blocks below
// (mirrors seniorityTargets.test.js's existing podiatry cross-block fixture).
const offRow = { firstName: 'Pat', lastName: 'Odiatry', category: 'POD', pgy: 1, start: '2026-07-13', end: '2026-07-26' };
const block1 = { start: '2026-07-06', end: '2026-07-19' };
const block2 = { start: '2026-07-20', end: '2026-08-02' };

describe('Master Matrix import: off-service window straddling two EM blocks', () => {
  it('stores the UNCLAMPED window on every block the resident is imported into', () => {
    const [rec1] = buildOffServiceResidentsForBlock([offRow], block1);
    const [rec2] = buildOffServiceResidentsForBlock([offRow], block2);
    expect(rec1.availableRanges).toEqual([{ start: '2026-07-13', end: '2026-07-26' }]);
    expect(rec2.availableRanges).toEqual([{ start: '2026-07-13', end: '2026-07-26' }]);
    // Off-service ids are minted fresh per block import (see buildOffServiceResidentsForBlock's own
    // header) — cross-block matching has to fall back to name, exercised below.
    expect(rec1.id).not.toBe(rec2.id);
  });

  it('block 1: offServiceWindowStatus is non-null and pro-rated (no prior history yet)', () => {
    const [rec1] = buildOffServiceResidentsForBlock([offRow], block1);
    const status1 = offServiceWindowStatus(rec1, { startDate: block1.start, endDate: block1.end }, []);
    expect(status1).not.toBeNull();
    expect(status1.foundHistory).toBe(false);
    expect(status1.base).toBe(14); // POD_1
    expect(status1.overlapDays).toBe(7);
    expect(status1.totalWindowDays).toBe(14);
    expect(status1.effectiveTarget).toBe(7); // half the window overlaps block 1
  });

  it('block 2: measured from a block-1 blocksHistory snapshot, and block1-worked + block2-target == full base', () => {
    const [rec1] = buildOffServiceResidentsForBlock([offRow], block1);
    const [rec2] = buildOffServiceResidentsForBlock([offRow], block2);
    // 4 shifts actually assigned to rec1 inside the window, inside block 1's own saved snapshot
    // (schedule keyed by rec1's own per-block id, same shape saveBlock/import commit produce).
    const worked = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'];
    const priorSnapshot = {
      id: 'blk_import_2026-07-06',
      data: {
        startDate: block1.start, endDate: block1.end,
        offServiceResidents: [rec1],
        schedule: { [rec1.id]: Object.fromEntries(worked.map(d => [d, 'POD-D'])) },
      },
    };
    const status2 = offServiceWindowStatus(rec2, { startDate: block2.start, endDate: block2.end }, [priorSnapshot]);
    expect(status2).not.toBeNull();
    expect(status2.foundHistory).toBe(true); // name-matched across blocks, ids differ
    expect(status2.alreadyWorked).toBe(4);
    expect(status2.effectiveTarget).toBe(10); // base 14 - 4 worked
    expect(status2.alreadyWorked + status2.effectiveTarget).toBe(status2.base);
  });
});
