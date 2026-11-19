// Chief decision 2026-11-19 (rules page q-12h-elig, "Let them work the 12-hour shifts"): on days an
// area runs ONLY 12h shifts (mode:'replace' window), FM PGY-3 (PED-N12, Mon-Wed only) and the
// off-service keys (Neuro/Anes/Psych/Podiatry: FLEX-D12/FLEX-N12) work the 12h ids instead of
// having nothing. Fixture roster is fictional.
import { describe, it, expect } from 'vitest';
import { getEligibleShifts } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

// Block 2026-07-06 (Mon) .. 2026-08-02 (Sun). Window covers 07-20 (Mon) .. 07-26 (Sun).
const WIN = { start: '2026-07-20', end: '2026-07-26' };
const win = (areas) => ({ twelveHourWindows: [{ id: 'w', ...WIN, areas, mode: 'replace' }] });
const MON = '2026-07-20', WED = '2026-07-22', THU = '2026-07-23', OUT_MON = '2026-07-13';

function elig(residentId, date, ayConf, eligOverrides) {
  const f = makeFixture('standard');
  const r = f.allResidents.find(x => x.id === residentId);
  expect(r).toBeTruthy();
  return getEligibleShifts(r, date, f.block.specialDays || {}, eligOverrides ?? f.eligOverrides, f.appSettings, f.dayRules,
    { blockStart: f.block.startDate, ayConf });
}

describe('off-service FLEX 12h inside a FLEX replace window', () => {
  const ay = win(['FLEX']);
  it('Neuro gets FLEX-D12/FLEX-N12 and loses FLEX-D/FLEX-N inside the window (Mon)', () => {
    const e = elig('syn_yankee', MON, ay);
    expect(e).toEqual(expect.arrayContaining(['FLEX-D12', 'FLEX-N12']));
    expect(e).not.toContain('FLEX-D');
    expect(e).not.toContain('FLEX-N');
  });
  it('outside the window: no 12h ids, normal FLEX kept', () => {
    const e = elig('syn_yankee', OUT_MON, ay);
    expect(e).not.toContain('FLEX-D12');
    expect(e).not.toContain('FLEX-N12');
    expect(e).toContain('FLEX-D');
  });
});

describe('FM PGY-3 PED-N12', () => {
  const ay = win(['PED']);
  it('inside a PED replace window: PED-N12 Mon and Wed, PED-N-FM suppressed', () => {
    for (const d of [MON, WED]) {
      const e = elig('syn_uniform', d, ay);
      expect(e).toContain('PED-N12');
      expect(e).not.toContain('PED-N-FM');
    }
  });
  it('inside a PED replace window: nothing Thu (Mon-Wed gate holds for PED-N12)', () => {
    expect(elig('syn_uniform', THU, ay)).not.toContain('PED-N12');
  });
  it('Thu outside any window: no PED-N-FM and no PED-N12', () => {
    expect(elig('syn_uniform', '2026-07-16', {})).toEqual([]);
  });
  it('Mon outside a window: PED-N-FM present (normal case unchanged)', () => {
    expect(elig('syn_uniform', OUT_MON, ay)).toContain('PED-N-FM');
  });
});

describe('saved overrides vs the new defaults', () => {
  it('empty diff override still sees the new ids', () => {
    const e = elig('syn_yankee', MON, win(['FLEX']), { NEURO_1: { added: [], removed: [] } });
    expect(e).toContain('FLEX-D12');
  });
  it('legacy array override equal to the old default does not mask FLEX-D12/FLEX-N12', () => {
    const old = ['POD-D', 'POD-E', 'POD-N', 'FLEX-D', 'FLEX-N', 'POD-D12', 'POD-N12'];
    const e = elig('syn_yankee', MON, win(['FLEX']), { NEURO_1: old });
    expect(e).toContain('FLEX-D12');
    expect(e).toContain('FLEX-N12');
  });
  it('diff override removing FLEX-N12 is honored', () => {
    const e = elig('syn_yankee', MON, win(['FLEX']), { NEURO_1: { added: [], removed: ['FLEX-N12'] } });
    expect(e).toContain('FLEX-D12');
    expect(e).not.toContain('FLEX-N12');
  });
});
