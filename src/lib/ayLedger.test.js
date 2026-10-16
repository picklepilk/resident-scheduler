// src/lib/ayLedger.test.js
// Pure unit tests for the AY fairness ledger — no ResidentScheduler.jsx import, no DOM.
import { describe, it, expect } from 'vitest';
import {
  buildAyLedger, flagLedgerRows, computeColumnVisibility, defaultIsEm, GROUP_LABELS,
  DEFAULT_BEHIND_TARGET_THRESHOLD,
} from './ayLedger.js';

const AY = 'AY26/27';

function resident(id, overrides = {}) {
  return { id, firstName: `F${id}`, lastName: `L${id}`, category: 'EM_HOME', pgy: 2, ...overrides };
}

// Simple fixed-target stand-in for the real getShiftTarget (which lives in ResidentScheduler.jsx
// and is injected, per CLAUDE.md's "lib may not import ResidentScheduler.jsx"). Mirrors the real
// shape: returns null for an explicit opt-out, otherwise base + delta.
function fakeGetShiftTarget(r) {
  if (r.selfCover) return null;
  const base = r.baseTarget ?? 16;
  const d = Number(r.targetDelta);
  const t = base + (Number.isFinite(d) ? d : 0);
  return t > 0 ? t : null;
}

function snapshot({ id, startDate, endDate, schedule, academicYear = AY, published = true, emBlockAssignments = {} }) {
  return {
    id, published, academicYear, startDate, endDate, savedAt: `${startDate}T00:00:00.000Z`,
    data: { schedule, emBlockAssignments, startDate, endDate, academicYear },
  };
}

// Flattens every compared row across every category/PGY group, for assertions that don't care
// about the grouping structure itself.
function allComparedRows(ledger) {
  return ledger.categories.flatMap(c => c.pgyGroups.flatMap(g => g.rows));
}
function allNoTargetRows(ledger) {
  return ledger.categories.flatMap(c => c.pgyGroups.flatMap(g => g.noTargetRows));
}

describe('AY population rule: no history is excluded, never zeroed', () => {
  it('a resident absent from every in-scope block never appears in the ledger', () => {
    const r1 = resident('r1');
    const r2 = resident('r2'); // never scheduled anywhere
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { r1: { '2026-07-06': 'POD-D' } },
    });
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1, r2], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    expect(allComparedRows(ledger).map(r => r.residentId)).toEqual(['r1']);
  });

  it('a resident present in a snapshot with an entirely empty row still counts as history (blocks=1, assigned=0)', () => {
    const r1 = resident('r1');
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { r1: {} }, // on the roster for the block, fully off/vacation — real information
    });
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    const row = allComparedRows(ledger).find(r => r.residentId === 'r1');
    expect(row).toBeTruthy();
    expect(row.blocks).toBe(1);
    expect(row.assigned).toBe(0);
  });

  it('unpublished snapshots are excluded entirely', () => {
    const r1 = resident('r1');
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12', published: false,
      schedule: { r1: { '2026-07-06': 'POD-D' } },
    });
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    expect(allComparedRows(ledger)).toHaveLength(0);
  });

  it('a different academic year is excluded entirely', () => {
    const r1 = resident('r1');
    const snap = snapshot({
      id: 'b1', startDate: '2025-07-06', endDate: '2025-07-12', academicYear: 'AY25/26',
      schedule: { r1: { '2025-07-06': 'POD-D' } },
    });
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    expect(allComparedRows(ledger)).toHaveLength(0);
  });

  it('a resident no longer on the current roster is silently dropped, not shown zeroed', () => {
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { ghost: { '2026-07-06': 'POD-D' } },
    });
    const ledger = buildAyLedger({ ay: AY, allResidents: [], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    expect(allComparedRows(ledger)).toHaveLength(0);
    expect(ledger.categories).toHaveLength(0);
  });
});

describe('definitions are reused, not re-derived', () => {
  it('counts nights (isNightShiftId), weekend shifts (Sat/Sun), and holiday shifts (holidayDateSet) correctly', () => {
    const r1 = resident('r1');
    // 2026-07-06 is a Monday; 2026-07-11/12 are Sat/Sun.
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: {
        r1: {
          '2026-07-06': 'POD-N',  // night, weekday, not holiday
          '2026-07-11': 'POD-D',  // day, Saturday
          '2026-07-12': 'POD-N',  // night, Sunday
          '2026-07-04': undefined, // out of range, ignored
        },
      },
    });
    const ayConf = { holidays: [{ id: 'h1', name: 'Independence Day', start: '2026-07-06', end: '2026-07-06' }] };
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], ayConf, getShiftTarget: fakeGetShiftTarget });
    const row = allComparedRows(ledger).find(r => r.residentId === 'r1');
    expect(row.assigned).toBe(3);
    expect(row.nights).toBe(2);          // 07-06 POD-N + 07-12 POD-N
    expect(row.weekendShifts).toBe(2);   // 07-11 (Sat) + 07-12 (Sun)
    expect(row.holidayShifts).toBe(1);   // 07-06 only (holiday configured for that one date)
  });

  it('sums hours via SHIFT_TIMING durationH', () => {
    const r1 = resident('r1');
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-08',
      schedule: {
        r1: {
          '2026-07-06': 'POD-D',   // POD, 9h
          '2026-07-07': 'POD-N',   // POD, 9h
          '2026-07-08': 'TRAUMA-D', // TRAUMA, 12h
        },
      },
    });
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    const row = allComparedRows(ledger).find(r => r.residentId === 'r1');
    expect(row.hours).toBe(9 + 9 + 12);
  });

  it('counts 12h shifts via the shared TWELVE_HOUR_IDS catalog', () => {
    const r1 = resident('r1');
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-08',
      schedule: { r1: { '2026-07-06': 'POD-D12', '2026-07-07': 'POD-D' } },
    });
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    const row = allComparedRows(ledger).find(r => r.residentId === 'r1');
    expect(row.twelveHour).toBe(1);
  });

  it('absent holiday config is a strict no-op (never derives defaults)', () => {
    const r1 = resident('r1');
    const snap = snapshot({
      id: 'b1', startDate: '2026-12-24', endDate: '2026-12-26',
      schedule: { r1: { '2026-12-25': 'POD-D' } },
    });
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], ayConf: {}, getShiftTarget: fakeGetShiftTarget });
    const row = allComparedRows(ledger).find(r => r.residentId === 'r1');
    expect(row.holidayShifts).toBe(0);
  });

  it('formats name as "Last, First" with no PGY suffix', () => {
    const r1 = resident('r1', { firstName: 'Casey', lastName: 'Hughes' });
    const snap = snapshot({ id: 'b1', startDate: '2026-07-06', endDate: '2026-07-06', schedule: { r1: { '2026-07-06': 'POD-D' } } });
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    expect(allComparedRows(ledger)[0].name).toBe('Hughes, Casey');
  });
});

describe('current (live) block is folded in regardless of save/publish state', () => {
  it('includes an unsaved current block', () => {
    const r1 = resident('r1');
    const currentBlock = { id: 'live', academicYear: AY, startDate: '2026-09-01', endDate: '2026-09-03', schedule: { r1: { '2026-09-01': 'POD-D' } } };
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], currentBlock, blocksHistory: [], getShiftTarget: fakeGetShiftTarget });
    const row = allComparedRows(ledger).find(r => r.residentId === 'r1');
    expect(row.assigned).toBe(1);
    expect(row.blocks).toBe(1);
  });

  it('does not double-count when the current block also has a stale published copy in blocksHistory', () => {
    const r1 = resident('r1');
    const staleSnap = snapshot({
      id: 'live', startDate: '2026-09-01', endDate: '2026-09-03',
      schedule: { r1: { '2026-09-01': 'POD-D' } }, // stale: missing the 09-02 shift added after save
    });
    const currentBlock = {
      id: 'live', academicYear: AY, startDate: '2026-09-01', endDate: '2026-09-03',
      schedule: { r1: { '2026-09-01': 'POD-D', '2026-09-02': 'POD-E' } },
    };
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], currentBlock, blocksHistory: [staleSnap], getShiftTarget: fakeGetShiftTarget });
    const row = allComparedRows(ledger).find(r => r.residentId === 'r1');
    expect(row.blocks).toBe(1);   // the live version replaces the stale saved copy, not added to it
    expect(row.assigned).toBe(2); // the live (more current) count, not the stale snapshot's 1
  });
});

describe('target reconstruction', () => {
  it('sums target across blocks using each block\'s own emBlockAssignments (blockType/isChief/targetDelta)', () => {
    const r1 = resident('r1', { baseTarget: 16 });
    const snap1 = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { r1: { '2026-07-06': 'POD-D' } },
      emBlockAssignments: { r1: { targetDelta: -2 } }, // buy-down this block only
    });
    const currentBlock = {
      id: 'b2', academicYear: AY, startDate: '2026-08-03', endDate: '2026-08-09',
      schedule: { r1: { '2026-08-03': 'POD-D' } },
      emBlockAssignments: {}, // no delta this block
    };
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], currentBlock, blocksHistory: [snap1], getShiftTarget: fakeGetShiftTarget });
    const row = allComparedRows(ledger).find(r => r.residentId === 'r1');
    expect(row.target).toBe(14 + 16); // 16-2 for block 1, 16 for block 2
    expect(row.deltaFromTarget).toBe(row.assigned - row.target);
  });

  it('a self-cover (no getShiftTarget) block contributes 0 to the target sum but still counts assigned shifts, landing the resident in noTargetRows', () => {
    const r1 = resident('r1', { baseTarget: 16 });
    const snap1 = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { r1: { '2026-07-06': 'POD-D' } },
      emBlockAssignments: { r1: {} },
    });
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap1], getShiftTarget: undefined });
    expect(allComparedRows(ledger)).toHaveLength(0);
    const row = allNoTargetRows(ledger).find(r => r.residentId === 'r1');
    expect(row.target).toBeNull();
    expect(row.deltaFromTarget).toBeNull();
    expect(row.assigned).toBe(1);
  });
});

describe('grouping: EM Home / EM BAMC categories, PGY subgroups, off-service kept separate', () => {
  it('buckets residents by category then PGY, and off-service into its own top-level section', () => {
    const emHome1 = resident('eh1', { category: 'EM_HOME', pgy: 1 });
    const emHome2 = resident('eh2', { category: 'EM_HOME', pgy: 2 });
    const emBamc = resident('eb1', { category: 'EM_BAMC', pgy: 2 });
    const offSvc = resident('os1', { category: 'PED_2', pgy: 2 });
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-07',
      schedule: {
        eh1: { '2026-07-06': 'POD-D' },
        eh2: { '2026-07-06': 'POD-D' },
        eb1: { '2026-07-06': 'POD-D' },
        os1: { '2026-07-06': 'PED-D' },
      },
    });
    const ledger = buildAyLedger({ ay: AY, allResidents: [emHome1, emHome2, emBamc, offSvc], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    const byKey = Object.fromEntries(ledger.categories.map(c => [c.key, c]));
    expect(Object.keys(byKey).sort()).toEqual(['EM_BAMC', 'EM_HOME']);
    expect(byKey.EM_HOME.pgyGroups.map(g => g.label)).toEqual(['PGY-1', 'PGY-2']);
    expect(byKey.EM_HOME.pgyGroups[0].rows.map(r => r.residentId)).toEqual(['eh1']);
    expect(byKey.EM_BAMC.pgyGroups[0].rows.map(r => r.residentId)).toEqual(['eb1']);
    expect(ledger.offService.rows.map(r => r.residentId)).toEqual(['os1']);
    expect(ledger.offService.rows[0].target).toBeNull();
  });

  it('a category absent from the AY (e.g. no BAMC residents) is omitted entirely, not shown empty', () => {
    const emHome = resident('eh1');
    const snap = snapshot({ id: 'b1', startDate: '2026-07-06', endDate: '2026-07-06', schedule: { eh1: { '2026-07-06': 'POD-D' } } });
    const ledger = buildAyLedger({ ay: AY, allResidents: [emHome], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    expect(ledger.categories.map(c => c.key)).toEqual(['EM_HOME']);
  });

  it('an EM resident with no target this AY (every block non-schedulable) lands in noTargetRows, not rows', () => {
    const r1 = resident('r1', { pgy: 2 });
    const electiveBlock = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { r1: { '2026-07-06': 'ELECTIVE' } }, emBlockAssignments: { r1: { blockType: 'ELECTIVE' } },
    });
    const ledger = buildAyLedger({
      ay: AY, allResidents: [r1], blocksHistory: [electiveBlock], getShiftTarget: fakeGetShiftTarget,
      isSchedulable: r => r.blockType !== 'ELECTIVE',
    });
    expect(allComparedRows(ledger)).toHaveLength(0);
    expect(allNoTargetRows(ledger).map(r => r.residentId)).toEqual(['r1']);
  });

  it('defaultIsEm matches ResidentScheduler.jsx\'s isEmResident definition', () => {
    expect(defaultIsEm({ category: 'EM_HOME' })).toBe(true);
    expect(defaultIsEm({ category: 'EM_BAMC' })).toBe(true);
    expect(defaultIsEm({ category: 'PED_1' })).toBe(false);
    expect(defaultIsEm(null)).toBe(false);
  });

  it('GROUP_LABELS covers every group key the output can produce', () => {
    expect(Object.keys(GROUP_LABELS).sort()).toEqual(['EM_BAMC', 'EM_HOME', 'OFF_SERVICE']);
  });
});

describe('computeColumnVisibility (hide-empty-column helper)', () => {
  it('hides holidays/twelveHour/blocks columns when every row is zero/one', () => {
    const rows = [{ holidayShifts: 0, twelveHour: 0, blocks: 1 }, { holidayShifts: 0, twelveHour: 0, blocks: 1 }];
    expect(computeColumnVisibility(rows)).toEqual({ holidays: false, twelveHour: false, blocks: false });
  });

  it('shows a column once any single row has a non-zero (or, for blocks, >1) value', () => {
    const rows = [{ holidayShifts: 1, twelveHour: 0, blocks: 1 }, { holidayShifts: 0, twelveHour: 2, blocks: 3 }];
    expect(computeColumnVisibility(rows)).toEqual({ holidays: true, twelveHour: true, blocks: true });
  });

  it('tolerates an empty or non-array input', () => {
    expect(computeColumnVisibility([])).toEqual({ holidays: false, twelveHour: false, blocks: false });
    expect(computeColumnVisibility(undefined)).toEqual({ holidays: false, twelveHour: false, blocks: false });
  });
});

describe('untrusted-shape guards', () => {
  it('tolerates a non-array blocksHistory, garbage snapshot entries, and non-object schedule rows', () => {
    const r1 = resident('r1');
    const garbage = [null, 'nope', 42, { id: 'ok', published: true, academicYear: AY, startDate: '2026-07-06', endDate: '2026-07-07', data: { schedule: { r1: 'not-an-object' } } }];
    expect(() => buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: garbage, getShiftTarget: fakeGetShiftTarget })).not.toThrow();
    const ledger = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: garbage, getShiftTarget: fakeGetShiftTarget });
    expect(allComparedRows(ledger)).toHaveLength(0); // r1's row was garbage ('not-an-object'), so no history
  });

  it('tolerates blocksHistory being undefined entirely', () => {
    expect(() => buildAyLedger({ ay: AY, allResidents: [resident('r1')], getShiftTarget: fakeGetShiftTarget })).not.toThrow();
  });
});

// ─── flagLedgerRows ─────────────────────────────────────────────────────────

function pgyGroupFixture({ key = 'EM_HOME_PGY2', pgy = 2, rows }) {
  const assignedMedian = (() => { const v = rows.map(r => r.assigned).sort((a, b) => a - b); const m = v.length; return m % 2 ? v[(m - 1) / 2] : (v[m / 2 - 1] + v[m / 2]) / 2; })();
  const nightsMedian = (() => { const v = rows.map(r => r.nights).sort((a, b) => a - b); const m = v.length; return m % 2 ? v[(m - 1) / 2] : (v[m / 2 - 1] + v[m / 2]) / 2; })();
  const weekendMedian = (() => { const v = rows.map(r => r.weekendShifts).sort((a, b) => a - b); const m = v.length; return m % 2 ? v[(m - 1) / 2] : (v[m / 2 - 1] + v[m / 2]) / 2; })();
  return { key, pgy, label: `PGY-${pgy}`, rows, noTargetRows: [], medians: { assigned: assignedMedian, nights: nightsMedian, weekendShifts: weekendMedian, hours: null } };
}
function flagRow(id, { assigned = 10, nights = 0, weekendShifts = 0, target = null, name } = {}) {
  return { residentId: id, name: name || id, category: 'EM_HOME', pgy: 2, assigned, nights, weekendShifts, holidayShifts: 0, twelveHour: 0, hours: 0, blocks: 1, target, deltaFromTarget: target != null ? assigned - target : null };
}

describe('flagLedgerRows: behind-target', () => {
  it(`flags behind-target once target - assigned >= ${DEFAULT_BEHIND_TARGET_THRESHOLD}, not below it`, () => {
    const rows = [
      flagRow('a', { assigned: 14, target: 16 }), // delta -2, flagged
      flagRow('b', { assigned: 15, target: 16 }), // delta -1, not flagged
    ];
    const group = pgyGroupFixture({ rows });
    const { categories, summary } = flagLedgerRows([{ key: 'EM_HOME', label: 'EM Home', pgyGroups: [group] }]);
    const byId = Object.fromEntries(categories[0].pgyGroups[0].rows.map(r => [r.residentId, r]));
    expect(byId.a.flags.behindTarget).toBe(true);
    expect(byId.b.flags.behindTarget).toBe(false);
    expect(summary.behindTargetIds).toEqual(['a']);
  });
});

describe('flagLedgerRows: heavy/light nights and weekends use rate-per-shift-worked plus a raw-count gate', () => {
  it('flags heavy nights for a resident whose rate AND raw count both clear the group, and light for the symmetric case', () => {
    // 4 residents, all assigned=10. nights: [0, 2, 2, 8] -> raw median 2, rate median 0.2.
    const rows = [
      flagRow('light', { assigned: 10, nights: 0 }),
      flagRow('mid1', { assigned: 10, nights: 2 }),
      flagRow('mid2', { assigned: 10, nights: 2 }),
      flagRow('heavy', { assigned: 10, nights: 8 }),
    ];
    const group = pgyGroupFixture({ rows });
    const { categories } = flagLedgerRows([{ key: 'EM_HOME', label: 'EM Home', pgyGroups: [group] }]);
    const byId = Object.fromEntries(categories[0].pgyGroups[0].rows.map(r => [r.residentId, r]));
    expect(byId.heavy.flags.heavyNights).toBe(true);
    expect(byId.light.flags.lightNights).toBe(true);
    expect(byId.mid1.flags.heavyNights).toBe(false);
    expect(byId.mid1.flags.lightNights).toBe(false);
  });

  it('does not flag heavy/light when a resident worked fewer than 2 comparable peers (no meaningful median)', () => {
    const rows = [flagRow('solo', { assigned: 10, nights: 8 })];
    const group = pgyGroupFixture({ rows });
    const { categories } = flagLedgerRows([{ key: 'EM_HOME', label: 'EM Home', pgyGroups: [group] }]);
    expect(categories[0].pgyGroups[0].rows[0].flags.heavyNights).toBe(false);
  });

  it('a resident who worked zero shifts is never flagged for being "light" (no reduced-block penalty)', () => {
    const rows = [
      flagRow('zero', { assigned: 0, nights: 0, weekendShifts: 0 }),
      flagRow('normal1', { assigned: 10, nights: 4, weekendShifts: 2 }),
      flagRow('normal2', { assigned: 10, nights: 4, weekendShifts: 2 }),
    ];
    const group = pgyGroupFixture({ rows });
    const { categories } = flagLedgerRows([{ key: 'EM_HOME', label: 'EM Home', pgyGroups: [group] }]);
    const zero = categories[0].pgyGroups[0].rows.find(r => r.residentId === 'zero');
    expect(zero.flags.lightNights).toBe(false);
    expect(zero.flags.lightWeekends).toBe(false);
  });

  it('flags heavy weekends symmetrically to heavy nights', () => {
    const rows = [
      flagRow('a', { assigned: 10, weekendShifts: 1 }),
      flagRow('b', { assigned: 10, weekendShifts: 1 }),
      flagRow('c', { assigned: 10, weekendShifts: 6 }),
    ];
    const group = pgyGroupFixture({ rows });
    const { categories } = flagLedgerRows([{ key: 'EM_HOME', label: 'EM Home', pgyGroups: [group] }]);
    const byId = Object.fromEntries(categories[0].pgyGroups[0].rows.map(r => [r.residentId, r]));
    expect(byId.c.flags.heavyWeekends).toBe(true);
  });
});

describe('flagLedgerRows: default sort is behind-target, then heavy, then alphabetical', () => {
  it('orders a mixed group correctly', () => {
    const rows = [
      flagRow('zzNormal', { assigned: 10, target: 10, nights: 2, weekendShifts: 1 }),
      flagRow('aaBehind', { assigned: 8, target: 10, nights: 2, weekendShifts: 1 }),
      flagRow('mmHeavy', { assigned: 10, target: 10, nights: 8, weekendShifts: 1 }),
      flagRow('bbNormal', { assigned: 10, target: 10, nights: 2, weekendShifts: 1 }),
    ];
    const group = pgyGroupFixture({ rows });
    const { categories } = flagLedgerRows([{ key: 'EM_HOME', label: 'EM Home', pgyGroups: [group] }]);
    expect(categories[0].pgyGroups[0].rows.map(r => r.residentId)).toEqual(['aaBehind', 'mmHeavy', 'bbNormal', 'zzNormal']);
  });
});

describe('flagLedgerRows: summary aggregates ids across every category/PGY group', () => {
  it('collects flagged ids from multiple groups into one summary', () => {
    const groupA = pgyGroupFixture({ key: 'EM_HOME_PGY1', pgy: 1, rows: [flagRow('a1', { assigned: 8, target: 10 })] });
    const groupB = pgyGroupFixture({ key: 'EM_HOME_PGY2', pgy: 2, rows: [flagRow('b1', { assigned: 8, target: 10 })] });
    const { summary } = flagLedgerRows([
      { key: 'EM_HOME', label: 'EM Home', pgyGroups: [groupA, groupB] },
    ]);
    expect(summary.behindTargetIds.sort()).toEqual(['a1', 'b1']);
  });

  it('tolerates an empty categories array', () => {
    expect(() => flagLedgerRows([])).not.toThrow();
    const { categories, summary } = flagLedgerRows([]);
    expect(categories).toEqual([]);
    expect(summary.behindTargetIds).toEqual([]);
  });
});

describe('non-schedulable rotations owe no target (integration with buildAyLedger)', () => {
  it('a block on a non-schedulable rotation adds shifts but no target toward that block', () => {
    const r1 = resident('r1');
    const emBlock = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { r1: { '2026-07-06': 'POD-D' } }, emBlockAssignments: { r1: { blockType: 'EM' } },
    });
    const offBlock = snapshot({
      id: 'b2', startDate: '2026-07-13', endDate: '2026-07-19',
      schedule: { r1: { '2026-07-13': 'POD-D' } }, emBlockAssignments: { r1: { blockType: 'ELECTIVE' } },
    });
    const ledger = buildAyLedger({
      ay: AY, allResidents: [r1], blocksHistory: [emBlock, offBlock], getShiftTarget: fakeGetShiftTarget,
      isSchedulable: r => r.blockType !== 'ELECTIVE',
    });
    const row = allComparedRows(ledger).find(r => r.residentId === 'r1');
    expect(row.assigned).toBe(2);
    expect(row.target).toBe(16);
  });
});
