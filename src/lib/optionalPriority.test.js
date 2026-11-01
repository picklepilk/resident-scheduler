import { describe, it, expect } from 'vitest';
import { OPTIONAL_DEFERRED_SHIFT_IDS, optionalSweepPredicates } from './optionalPriority.js';

describe('optionalSweepPredicates', () => {
  it('partitions shifts into non-deferred then deferred', () => {
    const [first, second] = optionalSweepPredicates();
    expect(OPTIONAL_DEFERRED_SHIFT_IDS).toEqual(['PED-S']);
    expect(first({ id: 'PED-N' })).toBe(true);
    expect(second({ id: 'PED-N' })).toBe(false);
    expect(first({ id: 'PED-S' })).toBe(false);
    expect(second({ id: 'PED-S' })).toBe(true);
  });
  it('accepts bare ids', () => {
    const [first, second] = optionalSweepPredicates();
    expect(first('POD-D')).toBe(true);
    expect(second('PED-S')).toBe(true);
  });
});

// Generator integration: PED Night is preferred over PED Swing when topping up optional headroom.
import { generateSchedule, DEFAULT_DAY_RULES } from '../ResidentScheduler.jsx';
import { SHIFTS } from './shifts.js';
import { mulberry32 } from './rng.js';

describe('generateSchedule optional top-up prefers PED-N over PED-S', () => {
  // Mon 2026-07-06 .. Sun 2026-08-02. PED-N is gated to Thu-Sun (so Mon has PED-S only; Thu 07-09 has both).
  // Date order puts Monday first, so without the deferral the lone extra shift lands on Monday's PED-S.
  const block = { id: 'blk_optprio', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
  const resident = {
    id: 'r1', firstName: 'Test', lastName: 'Resident', category: 'EM_HOME', pgy: 2, blockType: 'EM', chiefRole: null,
    approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [],
  };
  const cov = { ...Object.fromEntries(SHIFTS.map(s => [s.id, { min: 0, max: 0 }])), 'PED-N': { min: 0, max: 1 }, 'PED-S': { min: 0, max: 1 } };
  const dayRules = { EM_HOME_2: { ...DEFAULT_DAY_RULES.EM_HOME_2, shiftGates: [
    ...(DEFAULT_DAY_RULES.EM_HOME_2.shiftGates || []),
    { id: 'ped_n_test_window', shiftIds: ['PED-N'], blockTypeFilter: null, allowedDays: [0, 4, 5, 6], outsideAction: 'stripShiftIds', overrideImmune: true },
  ] } };

  it('a resident with room for exactly one extra shift ends on PED-N', () => {
    for (const seed of [1, 7, 11, 23]) {
      const { schedule } = generateSchedule({
        allResidents: [resident], block, coverage: cov, eligOverrides: {}, dayRules, ayConf: {}, blocksHistory: [],
        appSettings: { targetOverrides: { EM_HOME_2: 1 } }, rng: mulberry32(seed),
      });
      expect(Object.values(schedule.r1).filter(Boolean)).toEqual(['PED-N']);
    }
  });
});
