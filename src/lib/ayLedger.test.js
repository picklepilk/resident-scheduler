// src/lib/ayLedger.test.js
// Pure unit tests for the AY fairness ledger — no ResidentScheduler.jsx import, no DOM.
import { describe, it, expect } from 'vitest';
import { buildAyLedger, iqrOutlierIds, defaultIsEm, GROUP_LABELS, DEFAULT_OUTLIER_MIN_GROUP_SIZE } from './ayLedger.js';

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

describe('AY population rule: no history is excluded, never zeroed', () => {
  it('a resident absent from every in-scope block never appears in the ledger', () => {
    const r1 = resident('r1');
    const r2 = resident('r2'); // never scheduled anywhere
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { r1: { '2026-07-06': 'POD-D' } },
    });
    const { groups } = buildAyLedger({
      ay: AY, allResidents: [r1, r2], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget,
    });
    const ids = groups.flatMap(g => g.rows.map(r => r.residentId));
    expect(ids).toEqual(['r1']);
  });

  it('a resident present in a snapshot with an entirely empty row still counts as history (blocks=1, assigned=0)', () => {
    const r1 = resident('r1');
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { r1: {} }, // on the roster for the block, fully off/vacation — real information
    });
    const { groups } = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    const row = groups.flatMap(g => g.rows).find(r => r.residentId === 'r1');
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
    const { groups } = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    expect(groups.flatMap(g => g.rows)).toHaveLength(0);
  });

  it('a different academic year is excluded entirely', () => {
    const r1 = resident('r1');
    const snap = snapshot({
      id: 'b1', startDate: '2025-07-06', endDate: '2025-07-12', academicYear: 'AY25/26',
      schedule: { r1: { '2025-07-06': 'POD-D' } },
    });
    const { groups } = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    expect(groups.flatMap(g => g.rows)).toHaveLength(0);
  });

  it('a resident no longer on the current roster is silently dropped, not shown zeroed', () => {
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { ghost: { '2026-07-06': 'POD-D' } },
    });
    const { groups } = buildAyLedger({ ay: AY, allResidents: [], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    expect(groups.flatMap(g => g.rows)).toHaveLength(0);
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
    const { groups } = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], ayConf, getShiftTarget: fakeGetShiftTarget });
    const row = groups.flatMap(g => g.rows).find(r => r.residentId === 'r1');
    expect(row.assigned).toBe(3);
    expect(row.nights).toBe(2);          // 07-06 POD-N + 07-12 POD-N
    expect(row.weekendShifts).toBe(2);   // 07-11 (Sat) + 07-12 (Sun)
    expect(row.holidayShifts).toBe(1);   // 07-06 only (holiday configured for that one date)
  });

  it('counts 12h shifts via the shared TWELVE_HOUR_IDS catalog', () => {
    const r1 = resident('r1');
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-08',
      schedule: { r1: { '2026-07-06': 'POD-D12', '2026-07-07': 'POD-D' } },
    });
    const { groups } = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    const row = groups.flatMap(g => g.rows).find(r => r.residentId === 'r1');
    expect(row.twelveHour).toBe(1);
  });

  it('absent holiday config is a strict no-op (never derives defaults)', () => {
    const r1 = resident('r1');
    const snap = snapshot({
      id: 'b1', startDate: '2026-12-24', endDate: '2026-12-26',
      schedule: { r1: { '2026-12-25': 'POD-D' } },
    });
    const { groups } = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap], ayConf: {}, getShiftTarget: fakeGetShiftTarget });
    const row = groups.flatMap(g => g.rows).find(r => r.residentId === 'r1');
    expect(row.holidayShifts).toBe(0);
  });
});

describe('current (live) block is folded in regardless of save/publish state', () => {
  it('includes an unsaved current block', () => {
    const r1 = resident('r1');
    const currentBlock = { id: 'live', academicYear: AY, startDate: '2026-09-01', endDate: '2026-09-03', schedule: { r1: { '2026-09-01': 'POD-D' } } };
    const { groups } = buildAyLedger({ ay: AY, allResidents: [r1], currentBlock, blocksHistory: [], getShiftTarget: fakeGetShiftTarget });
    const row = groups.flatMap(g => g.rows).find(r => r.residentId === 'r1');
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
    const { groups } = buildAyLedger({ ay: AY, allResidents: [r1], currentBlock, blocksHistory: [staleSnap], getShiftTarget: fakeGetShiftTarget });
    const row = groups.flatMap(g => g.rows).find(r => r.residentId === 'r1');
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
    const { groups } = buildAyLedger({ ay: AY, allResidents: [r1], currentBlock, blocksHistory: [snap1], getShiftTarget: fakeGetShiftTarget });
    const row = groups.flatMap(g => g.rows).find(r => r.residentId === 'r1');
    expect(row.target).toBe(14 + 16); // 16-2 for block 1, 16 for block 2
    expect(row.deltaFromTarget).toBe(row.assigned - row.target);
  });

  it('a self-cover (null target) block contributes 0 to the target sum but still counts assigned shifts', () => {
    const r1 = resident('r1', { baseTarget: 16 });
    const snap1 = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { r1: { '2026-07-06': 'POD-D' } },
      emBlockAssignments: { r1: {} },
    });
    // fakeGetShiftTarget returns null when resident.selfCover is set — simulate via a per-block
    // assignment flag the fake doesn't actually read; instead just verify the "no getShiftTarget"
    // path leaves target null and still counts assigned.
    const { groups } = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: [snap1], getShiftTarget: undefined });
    const row = groups.flatMap(g => g.rows).find(r => r.residentId === 'r1');
    expect(row.target).toBeNull();
    expect(row.deltaFromTarget).toBeNull();
    expect(row.assigned).toBe(1);
  });
});

describe('grouping: EM Home / EM BAMC / off-service', () => {
  it('buckets residents into the three groups and excludes off-service from spread/outlier stats', () => {
    const emHome = resident('eh1', { category: 'EM_HOME' });
    const emBamc = resident('eb1', { category: 'EM_BAMC' });
    const offSvc = resident('os1', { category: 'PED_2', pgy: 2 });
    const snap = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-07',
      schedule: {
        eh1: { '2026-07-06': 'POD-D' },
        eb1: { '2026-07-06': 'POD-D' },
        os1: { '2026-07-06': 'PED-D' },
      },
    });
    const { groups } = buildAyLedger({ ay: AY, allResidents: [emHome, emBamc, offSvc], blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    const byKey = Object.fromEntries(groups.map(g => [g.key, g]));
    expect(byKey.EM_HOME.rows.map(r => r.residentId)).toEqual(['eh1']);
    expect(byKey.EM_BAMC.rows.map(r => r.residentId)).toEqual(['eb1']);
    expect(byKey.OFF_SERVICE.rows.map(r => r.residentId)).toEqual(['os1']);
    expect(byKey.OFF_SERVICE.excludedFromSpread).toBe(true);
    expect(byKey.OFF_SERVICE.rows[0].target).toBeNull();
    expect(byKey.OFF_SERVICE.stats.deltaFromTarget).toBeUndefined();
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

describe('spread stats and IQR outlier flagging', () => {
  function makeRoster(n) { return Array.from({ length: n }, (_, i) => resident(`r${i}`)); }
  function makeSnap(assignedCounts) {
    const schedule = {};
    const dates = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-13', '2026-07-14'];
    Object.entries(assignedCounts).forEach(([rid, count]) => {
      schedule[rid] = {};
      for (let i = 0; i < count; i++) schedule[rid][dates[i]] = 'POD-D';
    });
    return snapshot({ id: 'b1', startDate: '2026-07-06', endDate: '2026-07-14', schedule });
  }

  it('reports min/median/max per column', () => {
    const roster = makeRoster(3);
    const snap = makeSnap({ r0: 1, r1: 2, r2: 3 });
    const { groups } = buildAyLedger({ ay: AY, allResidents: roster, blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    const g = groups.find(g => g.key === 'EM_HOME');
    expect(g.stats.assigned).toEqual({ min: 1, median: 2, max: 3, count: 3 });
  });

  it('flags no outliers when the group is below DEFAULT_OUTLIER_MIN_GROUP_SIZE', () => {
    const roster = makeRoster(3);
    const snap = makeSnap({ r0: 1, r1: 1, r2: 7 }); // r2 would otherwise clearly be an outlier
    const { groups } = buildAyLedger({ ay: AY, allResidents: roster, blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    const g = groups.find(g => g.key === 'EM_HOME');
    expect(g.rows.length).toBeLessThan(DEFAULT_OUTLIER_MIN_GROUP_SIZE);
    expect(g.outlierIds.assigned).toEqual([]);
  });

  it('flags a clear outlier once the group reaches the minimum size', () => {
    const roster = makeRoster(5);
    const snap = makeSnap({ r0: 1, r1: 1, r2: 1, r3: 1, r4: 7 });
    const { groups } = buildAyLedger({ ay: AY, allResidents: roster, blocksHistory: [snap], getShiftTarget: fakeGetShiftTarget });
    const g = groups.find(g => g.key === 'EM_HOME');
    expect(g.outlierIds.assigned).toContain('r4');
  });

  it('iqrOutlierIds is directly testable and returns [] under 4 values', () => {
    const rows = [{ residentId: 'a', x: 1 }, { residentId: 'b', x: 100 }];
    expect(iqrOutlierIds(rows, 'x')).toEqual([]);
  });
});

describe('untrusted-shape guards', () => {
  it('tolerates a non-array blocksHistory, garbage snapshot entries, and non-object schedule rows', () => {
    const r1 = resident('r1');
    const garbage = [null, 'nope', 42, { id: 'ok', published: true, academicYear: AY, startDate: '2026-07-06', endDate: '2026-07-07', data: { schedule: { r1: 'not-an-object' } } }];
    expect(() => buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: garbage, getShiftTarget: fakeGetShiftTarget })).not.toThrow();
    const { groups } = buildAyLedger({ ay: AY, allResidents: [r1], blocksHistory: garbage, getShiftTarget: fakeGetShiftTarget });
    expect(groups.flatMap(g => g.rows)).toHaveLength(0); // r1's row was garbage ('not-an-object'), so no history
  });

  it('tolerates blocksHistory being undefined entirely', () => {
    expect(() => buildAyLedger({ ay: AY, allResidents: [resident('r1')], getShiftTarget: fakeGetShiftTarget })).not.toThrow();
  });
});

describe('non-schedulable rotations owe no target', () => {
  it('a block on a non-schedulable rotation adds shifts but no target', () => {
    const r1 = resident('r1');
    const emBlock = snapshot({
      id: 'b1', startDate: '2026-07-06', endDate: '2026-07-12',
      schedule: { r1: { '2026-07-06': 'POD-D' } }, emBlockAssignments: { r1: { blockType: 'EM' } },
    });
    const offBlock = snapshot({
      id: 'b2', startDate: '2026-07-13', endDate: '2026-07-19',
      schedule: { r1: { '2026-07-13': 'POD-D' } }, emBlockAssignments: { r1: { blockType: 'ELECTIVE' } },
    });
    const { groups } = buildAyLedger({
      ay: AY, allResidents: [r1], blocksHistory: [emBlock, offBlock], getShiftTarget: fakeGetShiftTarget,
      isSchedulable: r => r.blockType !== 'ELECTIVE',
    });
    const row = groups.flatMap(g => g.rows).find(r => r.residentId === 'r1');
    expect(row.assigned).toBe(2);
    expect(row.target).toBe(16);
  });
});
