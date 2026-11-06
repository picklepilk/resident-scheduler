/** @vitest-environment jsdom */
// POD third body (chief rule 2026-10-31): the 3rd POD D/E/N body prefers off-service; core EM
// residents beyond POD_CORE_CAP only when they have no other option. Generator stage
// `podThirdBodyCore` + validateAll info rule `podThirdBody`.
import { describe, it, expect } from 'vitest';
import { validateAll, generateSchedule } from '../ResidentScheduler.jsx';
import { POD_THIRD_BODY_SHIFT_IDS, POD_CORE_CAP } from './coverage.js';
import { RULE_POLICY, severityFor } from './rulePolicy.js';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const isCore = r => r.category === 'EM_HOME' || r.category === 'EM_BAMC';
const block = { id: 'blk_test', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const DAY = '2026-07-09'; // Thursday
function res(id, category, pgy) {
  return { id, firstName: 'Test', lastName: 'Resident', category, pgy, blockType: null, chiefRole: null,
    approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [] };
}
const podIssues = (rs, schedule) =>
  validateAll(rs, schedule, block, {}, {}, {}, {}, [], {}).filter(i => i.rule === 'podThirdBody');

function coreCountCells(allResidents, schedule) {
  const out = [];
  const dates = new Set(allResidents.flatMap(r => Object.keys(schedule[r.id] || {})));
  for (const ds of dates) for (const sid of POD_THIRD_BODY_SHIFT_IDS) {
    const n = allResidents.filter(r => isCore(r) && schedule[r.id]?.[ds] === sid).length;
    if (n > POD_CORE_CAP) out.push({ ds, sid, n });
  }
  return out;
}

describe('podThirdBody validator', () => {
  it('warns (info) on 3 core EM bodies', () => {
    const rs = [res('a', 'EM_HOME', 3), res('b', 'EM_HOME', 2), res('c', 'EM_BAMC', 1)];
    const schedule = Object.fromEntries(rs.map(r => [r.id, { [DAY]: 'POD-D' }]));
    const w = podIssues(rs, schedule);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ level: 'warn', shiftId: 'POD-D', dateStr: DAY });
  });
  it('no warn on 2 core + 1 off-service', () => {
    const rs = [res('a', 'EM_HOME', 3), res('b', 'EM_HOME', 2), res('c', 'ANES', null)];
    const schedule = Object.fromEntries(rs.map(r => [r.id, { [DAY]: 'POD-D' }]));
    expect(podIssues(rs, schedule)).toEqual([]);
  });
  it('is tier info', () => {
    expect(RULE_POLICY.podThirdBody.tier).toBe('info');
    expect(severityFor('podThirdBody', 'validator')).toBe('warn');
  });
});

describe('podThirdBodyCore generator stage', () => {
  // `feasible` has surplus off-service supply and lots of top-up headroom: with the stage disabled it
  // produced ~145 three-core POD cells over seeds 1-3 (measured 2026-10-31); with it, none.
  it('never builds a 3-core POD cell when off-service bodies are available, yet still tops up to 3 with them', () => {
    let threeCore = 0, threeBodies = 0;
    for (const seed of [1, 2, 3]) {
      const fx = makeFixture('feasible');
      const { schedule } = generateSchedule({ ...fx, rng: mulberry32(seed) });
      threeCore += coreCountCells(fx.allResidents, schedule).length;
      const dates = new Set(fx.allResidents.flatMap(r => Object.keys(schedule[r.id] || {})));
      for (const ds of dates) for (const sid of POD_THIRD_BODY_SHIFT_IDS)
        if (fx.allResidents.filter(r => schedule[r.id]?.[ds] === sid).length >= 3) threeBodies++;
    }
    expect(threeCore).toBeLessThanOrEqual(5);
    expect(threeBodies).toBeGreaterThan(0);
  });
});
