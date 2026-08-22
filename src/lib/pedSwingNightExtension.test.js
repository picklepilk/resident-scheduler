/** @vitest-environment jsdom */
// src/lib/pedSwingNightExtension.test.js
// Regression guard for the PED-S/PED-N "all days / all nights" extension (chief-confirmed
// against live QGenda — see CLAUDE.md's "PED-N SPLIT INTO TWO SHIFT IDS" section and the
// resumption plan behind this batch): PED-S (Peds Swing) used to be EM-Home-PGY-2-on-EM/TOX-or-
// EM/EMS-only, Mon/Tue/Thu/Fri; PED-N (Peds Night, 19:00-04:00) used to be confined to EM Home/
// BAMC/FM-1's Thu-Sun window via the `ped_n_em_window` shiftGate. Both restrictions are gone:
// PED-S now exists all 7 days and is open to EM_HOME (all 3 PGYs), EM_BAMC, PEDS (PGY-2/3), and
// FM-1; PED-N now runs all 7 nights and gained PEDS (PGY-2/3) as an owner too (EM_HOME/BAMC/FM-1
// already had it). PED-N-FM (FM-3's own 23:00-08:00 shift, Mon/Tue/Wed only) is unaffected by any
// of this — a regression guard here confirms the single-owner guard still holds.
//
// Uses hand-built minimal resident objects (category/pgy/blockType only) rather than the
// synthetic fixture, since the fixture doesn't cover every category/PGY combination this batch
// touches (no FM PGY-1, no PEDS PGY-3) — same minimal-resident convention as
// finalSundayRule.test.js/availabilityFeatures.test.js.
import { describe, it, expect } from 'vitest';
import { getEligibleShifts } from '../ResidentScheduler.jsx';

const MONDAY = '2026-07-06';    // used to be outside PED-N's old Thu-Sun window
const WEDNESDAY = '2026-07-08'; // used to be outside PED-S's old Mon/Tue/Thu/Fri window
const SATURDAY = '2026-07-11';  // ditto — also outside PED-S's old window

const CTX = { blockStart: '2026-07-06' };

function elig(resident, dateStr) {
  return getEligibleShifts(resident, dateStr, {}, {}, {}, {}, CTX);
}

describe('PED-S (Peds Swing) — extended ownership + all-7-days', () => {
  const owners = [
    { label: 'EM_HOME PGY-1', resident: { id: 'r1', category: 'EM_HOME', pgy: 1, blockType: 'EM' } },
    { label: 'EM_HOME PGY-2', resident: { id: 'r2', category: 'EM_HOME', pgy: 2, blockType: 'EM' } },
    { label: 'EM_HOME PGY-3', resident: { id: 'r3', category: 'EM_HOME', pgy: 3, blockType: 'EM' } },
    { label: 'EM_BAMC PGY-1', resident: { id: 'r4', category: 'EM_BAMC', pgy: 1, blockType: 'EM' } },
    { label: 'PEDS PGY-2', resident: { id: 'r5', category: 'PEDS', pgy: 2 } },
    { label: 'PEDS PGY-3', resident: { id: 'r6', category: 'PEDS', pgy: 3 } },
    { label: 'FM PGY-1', resident: { id: 'r7', category: 'FM', pgy: 1 } },
  ];

  for (const { label, resident } of owners) {
    it(`${label} is eligible for PED-S`, () => {
      // EM_BAMC's own fullBlockDays:[4] (Thursday GR) would otherwise block this resident
      // entirely — pick a date that's never Thursday for every owner (Monday works for all).
      expect(elig(resident, MONDAY)).toContain('PED-S');
    });
  }

  it('PED-S is available on a Wednesday now (used to be excluded by SHIFT_DOW)', () => {
    const emHome2 = { id: 'w1', category: 'EM_HOME', pgy: 2, blockType: 'EM' };
    expect(elig(emHome2, WEDNESDAY)).toContain('PED-S');
  });

  it('PED-S is available on a Saturday now (used to be excluded by SHIFT_DOW)', () => {
    const emHome2 = { id: 'w2', category: 'EM_HOME', pgy: 2, blockType: 'EM' };
    expect(elig(emHome2, SATURDAY)).toContain('PED-S');
  });

  it('PED-S is NOT confined to the old EM_TOX/EM_EMS rotations any more — an EM_HOME PGY-2 on a plain EM rotation is eligible', () => {
    const plainEm = { id: 'w3', category: 'EM_HOME', pgy: 2, blockType: 'EM' };
    expect(elig(plainEm, MONDAY)).toContain('PED-S');
  });

  it('a category that was never a PED-S owner (e.g. IM) is still not eligible', () => {
    const im = { id: 'w4', category: 'IM', pgy: 2 };
    expect(elig(im, MONDAY)).not.toContain('PED-S');
  });

  it('FM-3 (the PED-N-FM-exclusive category) is still not eligible for PED-S', () => {
    const fm3 = { id: 'w5', category: 'FM', pgy: 3 };
    expect(elig(fm3, MONDAY)).not.toContain('PED-S');
  });
});

describe('PED-N (Peds Night, 19:00-04:00) — extended ownership + all-7-nights', () => {
  const owners = [
    { label: 'EM_HOME PGY-1', resident: { id: 'n1', category: 'EM_HOME', pgy: 1, blockType: 'EM' } },
    { label: 'EM_HOME PGY-2', resident: { id: 'n2', category: 'EM_HOME', pgy: 2, blockType: 'EM' } },
    { label: 'EM_HOME PGY-3', resident: { id: 'n3', category: 'EM_HOME', pgy: 3, blockType: 'EM' } },
    { label: 'EM_BAMC PGY-1', resident: { id: 'n4', category: 'EM_BAMC', pgy: 1, blockType: 'EM' } },
    { label: 'PEDS PGY-2', resident: { id: 'n5', category: 'PEDS', pgy: 2 } },
    { label: 'PEDS PGY-3', resident: { id: 'n6', category: 'PEDS', pgy: 3 } },
    { label: 'FM PGY-1', resident: { id: 'n7', category: 'FM', pgy: 1 } },
  ];

  for (const { label, resident } of owners) {
    it(`${label} is eligible for PED-N`, () => {
      expect(elig(resident, MONDAY)).toContain('PED-N');
    });
  }

  it('PED-N is available on a Monday now (used to be excluded by the ped_n_em_window Thu-Sun gate)', () => {
    const emHome1 = { id: 'n8', category: 'EM_HOME', pgy: 1, blockType: 'EM' };
    expect(elig(emHome1, MONDAY)).toContain('PED-N');
  });

  it('a category that was never a PED-N owner (e.g. IM) is still not eligible', () => {
    const im = { id: 'n9', category: 'IM', pgy: 2 };
    expect(elig(im, MONDAY)).not.toContain('PED-N');
  });
});

describe('PED-N-FM (FM-3-exclusive, 23:00-08:00, Mon/Tue/Wed) — unaffected single-owner guard', () => {
  it('FM-3 is eligible for PED-N-FM on a Monday (within its own onlyDays window)', () => {
    const fm3 = { id: 'fm3a', category: 'FM', pgy: 3 };
    expect(elig(fm3, MONDAY)).toContain('PED-N-FM');
  });

  it('FM-3 is NOT eligible for PED-N-FM on a Saturday (outside its own Mon/Tue/Wed onlyDays window)', () => {
    const fm3 = { id: 'fm3b', category: 'FM', pgy: 3 };
    expect(elig(fm3, SATURDAY)).not.toContain('PED-N-FM');
  });

  it('no other category — including the new PED-N owners — is ever eligible for PED-N-FM', () => {
    const others = [
      { id: 'o1', category: 'EM_HOME', pgy: 1, blockType: 'EM' },
      { id: 'o2', category: 'EM_BAMC', pgy: 1, blockType: 'EM' },
      { id: 'o3', category: 'PEDS', pgy: 2 },
      { id: 'o4', category: 'FM', pgy: 1 },
    ];
    for (const r of others) {
      expect(elig(r, MONDAY), `${r.category}_${r.pgy} should not be eligible for PED-N-FM`).not.toContain('PED-N-FM');
    }
  });
});
