/** @vitest-environment jsdom */
// src/lib/supplyDemand.test.js
// Generator-quality-pack item 6: when generation finishes with residents left under target,
// generateSchedule now checks whether the schedule's own coverage configuration could ever hold
// enough resident-shifts to satisfy every target in the first place. computeTotalCoverageSupply
// and computeTotalTargetDemand are the two pure halves of that comparison — exported specifically
// so the math can be tested directly instead of only through a full generateSchedule run.
import { describe, it, expect } from 'vitest';
import { computeTotalCoverageSupply, computeTotalTargetDemand, getShiftTarget } from '../ResidentScheduler.jsx';

describe('computeTotalCoverageSupply', () => {
  it('sums default per-shift coverage MAX for a single ordinary Wednesday, respecting SHIFT_DOW and the Wednesday POD-D/FLEX-D drop', () => {
    // 2026-07-08 is a Wednesday. With coverage={} (all defaults) and ayConf={} (no 12h window
    // active anywhere): TRAUMA-D/TRAUMA-N are excluded by SHIFT_DOW (neither's allowed weekdays
    // include Wednesday) — PED-S is NOT excluded here any more (chief-confirmed against live
    // QGenda, dropped from SHIFT_DOW entirely — it now exists all 7 days); every 12h id resolves
    // to max 0 (either DEFAULT_COVERAGE_MINMAX's explicit {0,0} for PED-D12/PED-N12, or the "12h
    // id in no window" {0,0} branch for the other six). What remains: POD-D(2,
    // DOW_COVERAGE_OVERRIDE forces max 2 same as base) + POD-E(2) + POD-N(2) + PED-D(1) + PED-E(1)
    // + PED-N(1) + PED-N-FM(1) + PED-S(1) + FLEX-D(2, DOW_COVERAGE_OVERRIDE drops base max 3 -> 2)
    // + FLEX-E(3) + FLEX-N(3) + MT-D(1) + MT-E(1) + MT-N(1) = 22.
    const supply = computeTotalCoverageSupply(['2026-07-08'], {}, {});
    expect(supply).toBe(22);
  });

  it('is additive across dates (two ordinary Wednesdays = double one)', () => {
    const one = computeTotalCoverageSupply(['2026-07-08'], {}, {});
    const two = computeTotalCoverageSupply(['2026-07-08', '2026-07-15'], {}, {});
    expect(two).toBe(one * 2);
  });

  it('drops TRAUMA-D/TRAUMA-N contribution on a day SHIFT_DOW excludes them, but includes it on an allowed day', () => {
    // 2026-07-09 is a Thursday: TRAUMA-D's allowed days are [Sun,Tue,Thu,Sat] (includes Thursday),
    // so TRAUMA-D(max 1) contributes there but not on the Wednesday above (PED-S now contributes
    // equally on both days — it has no SHIFT_DOW entry any more).
    const wed = computeTotalCoverageSupply(['2026-07-08'], {}, {});
    const thu = computeTotalCoverageSupply(['2026-07-09'], {}, {});
    expect(thu).toBeGreaterThan(wed);
  });

  it('returns 0 for an empty date list', () => {
    expect(computeTotalCoverageSupply([], {}, {})).toBe(0);
  });
});

describe('computeTotalTargetDemand', () => {
  it('sums getShiftTarget over schedulable residents with a real target, excluding self-cover and non-schedulable residents', () => {
    const pgy1 = { id: 'r1', category: 'EM_HOME', pgy: 1 }; // target 20 (EM defaults schedulable)
    const pgy2 = { id: 'r2', category: 'EM_HOME', pgy: 2 }; // target 19
    const selfCover = { id: 'r3', category: 'NO_SUCH_CATEGORY', pgy: 1 }; // no SHIFT_TARGETS entry -> null
    const offService = { id: 'r4', category: 'EM_HOME', pgy: 3, blockType: 'METRO' }; // non-schedulable
    expect(getShiftTarget(pgy1)).toBe(20);
    expect(getShiftTarget(selfCover)).toBeNull();

    const demand = computeTotalTargetDemand([pgy1, pgy2, selfCover, offService], {});
    expect(demand).toBe(20 + 19);
  });

  it('returns 0 for an empty roster', () => {
    expect(computeTotalTargetDemand([], {})).toBe(0);
  });

  it('respects appSettings.targetOverrides (same resolution getShiftTarget itself uses)', () => {
    const r = { id: 'r1', category: 'EM_HOME', pgy: 1 };
    const demand = computeTotalTargetDemand([r], { targetOverrides: { EM_HOME_1: 5 } });
    expect(demand).toBe(5);
  });
});
