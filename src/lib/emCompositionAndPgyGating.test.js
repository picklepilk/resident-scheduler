/** @vitest-environment jsdom */
// src/lib/emCompositionAndPgyGating.test.js
// Round 2b (~/.claude/plans/refactor-this-app-s-scheduling-stateless-locket.md, items 2b-1/2b-2):
// EM-count composition (SOFT, both engines) and PGY gating pool-restrict (generator) + their
// matching validateAll warnings. Follows seniorityTargets.test.js's pattern exactly (hand-built
// resident stand-ins, real validateAll against a fixed block/date set) since these checks live
// right next to that file's own SENIOR_COMPOSITION loop.
import { describe, it, expect } from 'vitest';
import { validateAll, generateSchedule } from '../ResidentScheduler.jsx';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

function res(overrides) {
  return {
    id: overrides.id, firstName: overrides.firstName ?? 'Test', lastName: 'Resident',
    category: overrides.category, pgy: overrides.pgy,
    blockType: overrides.blockType, chiefRole: overrides.chiefRole ?? null,
    approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [],
  };
}

// Same fixed block window as seniorityTargets.test.js so the well-known Wellness-Wednesday dates
// line up: 1st Wed on/after start = 2026-07-08 (ordinary), 2nd = 2026-07-15 (FLEX's own WW),
// 3rd = 2026-07-22 (POD's own WW).
const block = { id: 'blk_test', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const ORDINARY_WED = '2026-07-08';
const FLEX_WW = '2026-07-15';
const POD_WW = '2026-07-22';
const ORDINARY_DAY = '2026-07-09'; // Thursday — not exempt, not a Wellness Wednesday

function issuesFor(allResidents, schedule, appSettings = {}, ayConf = {}) {
  return validateAll(allResidents, schedule, block, {}, appSettings, {}, {}, [], ayConf);
}

function emCountWarnings(allResidents, schedule) {
  return issuesFor(allResidents, schedule).filter(i => i.message.includes('EM-count composition'));
}

function pgyGateWarnings(allResidents, schedule) {
  return issuesFor(allResidents, schedule).filter(i => i.message.includes('PGY gating'));
}

// Off-service stand-in — any category outside EM_HOME/EM_BAMC reads as non-EM for isEmResident.
function offService(id) {
  return res({ id, category: 'ANES', pgy: null });
}

describe('2b-1 EM-count composition — validateAll warnings', () => {
  it('POD staffed at 2 with only 1 EM (the composition-satisfying PGY-3) warns', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const off1 = offService('off1');
    const schedule = { p3: { [ORDINARY_DAY]: 'POD-D' }, off1: { [ORDINARY_DAY]: 'POD-D' } };
    const warns = emCountWarnings([pgy3, off1], schedule);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatchObject({ level: 'warn', dateStr: ORDINARY_DAY, shiftId: 'POD-D' });
    expect(warns[0].message).toContain('POD wants 2 EM');
  });

  it('POD staffed at 3 with only 1 EM warns (3rd body may be EM or off-service, but not BOTH extras off-service)', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const off1 = offService('off1');
    const off2 = offService('off2');
    const schedule = {
      p3: { [ORDINARY_DAY]: 'POD-D' }, off1: { [ORDINARY_DAY]: 'POD-D' }, off2: { [ORDINARY_DAY]: 'POD-D' },
    };
    const warns = emCountWarnings([pgy3, off1, off2], schedule);
    expect(warns).toHaveLength(1);
    expect(warns[0].message).toContain('POD wants 2 EM');
  });

  it('POD staffed at 3 with 2 EM (PGY-3 + EM intern) + 1 off-service raises no EM-count warning', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const pgy1 = res({ id: 'p1', category: 'EM_HOME', pgy: 1 });
    const off1 = offService('off1');
    const schedule = {
      p3: { [ORDINARY_DAY]: 'POD-D' }, p1: { [ORDINARY_DAY]: 'POD-D' }, off1: { [ORDINARY_DAY]: 'POD-D' },
    };
    expect(emCountWarnings([pgy3, pgy1, off1], schedule)).toEqual([]);
  });

  it('POD staffed at 2 with both EM raises no EM-count warning', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const pgy1 = res({ id: 'p1', category: 'EM_HOME', pgy: 1 });
    const schedule = { p3: { [ORDINARY_DAY]: 'POD-D' }, p1: { [ORDINARY_DAY]: 'POD-D' } };
    expect(emCountWarnings([pgy3, pgy1], schedule)).toEqual([]);
  });

  it('POD staffed at 1 (just the composition-satisfying senior) raises no EM-count warning — threshold is 2', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const schedule = { p3: { [ORDINARY_DAY]: 'POD-D' } };
    expect(emCountWarnings([pgy3], schedule)).toEqual([]);
  });

  it('FLEX staffed with 0 EM (all off-service, also a hard composition error) still warns for EM-count', () => {
    const off1 = offService('off1');
    const off2 = offService('off2');
    const off3 = offService('off3');
    const schedule = {
      off1: { [ORDINARY_DAY]: 'FLEX-E' }, off2: { [ORDINARY_DAY]: 'FLEX-E' }, off3: { [ORDINARY_DAY]: 'FLEX-E' },
    };
    const warns = emCountWarnings([off1, off2, off3], schedule);
    expect(warns).toHaveLength(1);
    expect(warns[0].message).toContain('FLEX wants at least 1 EM');
    // The hard composition error is also present (distinct concern) — not asserted away here.
    const errors = issuesFor([off1, off2, off3], schedule).filter(i => i.level === 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('FLEX staffed 3 (1 EM + 2 off-service) raises no EM-count warning', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const off1 = offService('off1');
    const off2 = offService('off2');
    const schedule = {
      p2: { [ORDINARY_DAY]: 'FLEX-E' }, off1: { [ORDINARY_DAY]: 'FLEX-E' }, off2: { [ORDINARY_DAY]: 'FLEX-E' },
    };
    expect(emCountWarnings([pgy2, off1, off2], schedule)).toEqual([]);
  });

  it('Wednesday DAY shifts stay exempt from the EM-count warning too (Grand Rounds)', () => {
    const off1 = offService('off1');
    const off2 = offService('off2');
    const schedule = { off1: { [ORDINARY_WED]: 'POD-D' }, off2: { [ORDINARY_WED]: 'POD-D' } };
    expect(emCountWarnings([off1, off2], schedule)).toEqual([]);
  });
});

describe('2b-2 PGY gating — validateAll warnings', () => {
  it('EM PGY-2 on POD while an EM PGY-3 already covers the senior requirement warns', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p3: { [ORDINARY_DAY]: 'POD-D' }, p2: { [ORDINARY_DAY]: 'POD-D' } };
    const warns = pgyGateWarnings([pgy3, pgy2], schedule);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatchObject({ residentId: 'p2', level: 'warn', dateStr: ORDINARY_DAY, shiftId: 'POD-D' });
  });

  it('EM PGY-3 on FLEX while an EM PGY-2 already covers the senior requirement warns', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const schedule = { p2: { [ORDINARY_DAY]: 'FLEX-E' }, p3: { [ORDINARY_DAY]: 'FLEX-E' } };
    const warns = pgyGateWarnings([pgy2, pgy3], schedule);
    expect(warns).toHaveLength(1);
    expect(warns[0].residentId).toBe('p3');
  });

  it('EM PGY-2 alone on POD (no PGY-3 anywhere) does NOT get the PGY-gating warning — only the hard error', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p2: { [ORDINARY_DAY]: 'POD-D' } };
    expect(pgyGateWarnings([pgy2], schedule)).toEqual([]);
  });

  it('EM PGY-2 substituting on POD\'s own Wellness Wednesday (no real PGY-3 present) does NOT warn', () => {
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p2: { [POD_WW]: 'POD-D' } };
    expect(pgyGateWarnings([pgy2], schedule)).toEqual([]);
  });

  it('EM PGY-3 substituting on FLEX\'s own Wellness Wednesday (no real PGY-2 present) does NOT warn', () => {
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const schedule = { p3: { [FLEX_WW]: 'FLEX-D' } };
    expect(pgyGateWarnings([pgy3], schedule)).toEqual([]);
  });

  it('Wednesday DAY shifts stay exempt from the PGY-gating warning too (Grand Rounds)', () => {
    // Both would satisfy compositionSatisfies==false anyway (no senior possible that day), but the
    // exempt short-circuit must fire before either check, not merely happen to agree.
    const pgy3 = res({ id: 'p3', category: 'EM_HOME', pgy: 3 });
    const pgy2 = res({ id: 'p2', category: 'EM_HOME', pgy: 2 });
    const schedule = { p3: { [ORDINARY_WED]: 'POD-D' }, p2: { [ORDINARY_WED]: 'POD-D' } };
    expect(pgyGateWarnings([pgy3, pgy2], schedule)).toEqual([]);
  });
});

describe('2b-2 PGY gating pool-restrict — generator behavior', () => {
  it('with ample PGY-3 supply, every generated POD-EM-PGY-2 placement is a recorded, legitimate fallback (a few seeds)', () => {
    // The `standard` fixture carries 6 EM Home PGY-3s against a 28-day block — ample supply, so
    // narrowForPgyGate should almost always exclude PGY-2 from POD. This does not assert a flat
    // zero (a day where every PGY-3 happens to be busy/ineligible is a legitimate fallback, per
    // narrowForPgyGate's own contract) — it asserts the STRONGER, exact invariant: any EM PGY-2
    // POD placement that does occur is EITHER one `report.pgyFallbacks` itself accounts for, OR
    // lands on POD's own Wellness Wednesday (POD_WW, this fixture's block-relative 3rd Wednesday
    // — see seniorityTargets.test.js's identical constant) — narrowForPgyGate deliberately EXEMPTS
    // that whole date (the hard composition rule's own accepted PGY-2 substitute, not a gating
    // compromise), so a WW-day placement is correctly never recorded as a fallback at all.
    for (const baseSeed of [1, 2, 3]) {
      const fx = makeFixture('standard');
      const { schedule, report } = generateSchedule({ ...fx, rng: mulberry32(baseSeed) });
      const fallbackKeys = new Set((report.pgyFallbacks || []).map(f => `${f.residentId}|${f.dateStr}|${f.shiftId}`));
      const pod2s = fx.allResidents.filter(r => r.category === 'EM_HOME' && r.pgy === 2);
      for (const r of pod2s) {
        for (const [ds, sid] of Object.entries(schedule[r.id] || {})) {
          if (sid && sid.startsWith('POD-') && ds !== POD_WW) {
            expect(fallbackKeys.has(`${r.id}|${ds}|${sid}`), `unexplained EM PGY-2 on ${sid}/${ds} (seed ${baseSeed})`).toBe(true);
          }
        }
      }
    }
  });

  it('with near-zero EM PGY-3 supply (a single PGY-3 across the whole block), POD still fills and the report records the fallback', () => {
    // Demote every EM Home PGY-3 EXCEPT ONE to an ineligible category. A flat zero PGY-3 supply
    // would only ever let POD's requirement be met on its own Wellness Wednesday (the sole
    // WW-substitute day) — narrowForPgyGate deliberately EXEMPTS that day entirely (it's the
    // accepted substitute, not a gating compromise), so it would never record a fallback at all.
    // Leaving exactly one real PGY-3 in the roster is what actually exercises the fallback path:
    // most POD (shift,date) pairs still need a body once that lone PGY-3 is already spent
    // elsewhere that day (or off), forcing a genuine EM PGY-2 fallback on an ORDINARY day.
    const fx = makeFixture('standard');
    const keepPgy3Id = fx.allResidents.find(r => r.category === 'EM_HOME' && r.pgy === 3)?.id;
    const allResidents = fx.allResidents.map(r =>
      (r.category === 'EM_HOME' && r.pgy === 3 && r.id !== keepPgy3Id)
        ? { ...r, category: 'ANES', pgy: null, blockType: null }
        : r
    );
    // Plain generateSchedule (one seeded attempt, no repair) rather than generateScheduleBest —
    // generateScheduleBest falls back to Math.random() for its OWN baseSeed whenever the caller
    // doesn't pass one, which would make this assertion genuinely flaky run-to-run; a single seeded
    // generateSchedule call is deterministic and (confirmed empirically across seeds 1-5) reliably
    // produces at least one fallback in this near-zero-PGY-3 scenario.
    const { schedule, report } = generateSchedule({ ...fx, allResidents, rng: mulberry32(1) });
    expect(schedule).toBeTruthy();
    expect(Array.isArray(report.pgyFallbacks)).toBe(true);
    expect(report.pgyFallbacks.length).toBeGreaterThan(0);
  });
});
