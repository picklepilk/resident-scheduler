/** @vitest-environment jsdom */
// src/lib/traumaRunCap.test.js
// Regression guard for the chief-directed "at most 2 TRAUMA-N per contiguous night run" rule (see
// the resumption plan / CLAUDE.md "Trauma nights within night runs" — chief's benchmark schedule
// data showed 13/15 real trauma-bearing runs already comply with 1 trauma night per run, a 2nd
// tolerated, never a 3rd). Three layers, matching how every other hard rule in this file is
// covered: (a) the generator never PRODUCES the violation across seeds on the real synthetic
// fixture (candidatePool's hard exclusion, reason 'traumaRunCapped'); (b) validateAll's own
// retrospective walk raises the matching hard error when a violation exists on disk regardless of
// how it got there; (c) a hand-forced minimal scenario proves the 'traumaRunCapped' unfilled
// reason is reachable, not just theoretically wired.
import { describe, it, expect } from 'vitest';
import { generateSchedule, validateAll } from '../ResidentScheduler.jsx';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';
import { SHIFT_MAP, SHIFTS } from './shifts.js';
import { parseDate, addDays, toDateStr } from './dates.js';

// Local run-scan helper (mirrors nightRunSegments' contiguity rule, but keeps the shift ids per
// run rather than just lengths, since we need to count TRAUMA-N within each run) — deliberately
// re-derived here rather than importing an internal ResidentScheduler.jsx helper, since none of
// this logic is exported; validateAll/candidatePool are the real enforcement, this is only a
// test-side detector to assert against their output.
function nightRunsFor(rs) {
  const nightDates = Object.keys(rs || {}).filter(ds => rs[ds] && SHIFT_MAP[rs[ds]]?.type === 'night').sort();
  const runs = [];
  let prevDs = null;
  for (const ds of nightDates) {
    const contiguous = prevDs && toDateStr(addDays(parseDate(prevDs), 1)) === ds;
    if (contiguous) runs[runs.length - 1].push(rs[ds]);
    else runs.push([rs[ds]]);
    prevDs = ds;
  }
  return runs;
}

describe('trauma-run cap — generator never produces >2 TRAUMA-N in one contiguous night run', () => {
  for (const seed of [1, 2, 3, 42, 99]) {
    it(`generateSchedule respects the cap across every resident's night runs (standard, seed=${seed})`, () => {
      const fixture = makeFixture('standard');
      const { schedule } = generateSchedule({ ...fixture, rng: mulberry32(seed) });
      for (const r of fixture.allResidents) {
        const runs = nightRunsFor(schedule[r.id]);
        for (const run of runs) {
          const traumaCount = run.filter(sid => sid === 'TRAUMA-N').length;
          expect(traumaCount, `${r.id}'s run [${run.join(',')}] has too many TRAUMA-N`).toBeLessThanOrEqual(2);
        }
      }
      // Cross-check against validateAll's own hard error — it should never fire for this rule
      // on generator output, matching the BAMC Wednesday-night hard-cap test's own convention.
      const issues = validateAll(fixture.allResidents, schedule, fixture.block, fixture.eligOverrides, fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf);
      const traumaRunErrors = issues.filter(i => i.level === 'error' && i.message.includes('Trauma Night shifts in one consecutive night run'));
      expect(traumaRunErrors).toEqual([]);
    });
  }
});

describe('validateAll — trauma-run rules on a hand-built schedule', () => {
  const residents = [{ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM' }];
  const block = { id: 'blk', startDate: '2026-07-03', endDate: '2026-07-05', academicYear: 'AY26/27' };
  const appSettings = {};

  it('hard error: 3 TRAUMA-N in one contiguous run', () => {
    // 2026-07-03/04/05 are Fri/Sat/Sun — all inside TRAUMA-N's own SHIFT_DOW window.
    const schedule = { r1: { '2026-07-03': 'TRAUMA-N', '2026-07-04': 'TRAUMA-N', '2026-07-05': 'TRAUMA-N' } };
    const issues = validateAll(residents, schedule, block, {}, appSettings, {}, {}, [], {});
    const errors = issues.filter(i => i.level === 'error' && i.message.includes('Trauma Night shifts in one consecutive night run'));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('max 2 per run');
  });

  it('no error for exactly 2 TRAUMA-N in a run (the tolerated case)', () => {
    const schedule = { r1: { '2026-07-03': 'TRAUMA-N', '2026-07-04': 'TRAUMA-N' } };
    const issues = validateAll(residents, schedule, block, {}, appSettings, {}, {}, [], {});
    const errors = issues.filter(i => i.level === 'error' && i.message.includes('Trauma Night shifts in one consecutive night run'));
    expect(errors).toEqual([]);
  });

  it('warning: TRAUMA-N sits mid-run of a mixed run (not first/last)', () => {
    const schedule = { r1: { '2026-07-03': 'POD-N', '2026-07-04': 'TRAUMA-N', '2026-07-05': 'POD-N' } };
    const issues = validateAll(residents, schedule, block, {}, appSettings, {}, {}, [], {});
    const midRunWarns = issues.filter(i => i.level === 'warn' && i.message.includes('mid-run'));
    expect(midRunWarns.length).toBeGreaterThan(0);
  });

  it('no mid-run warning when TRAUMA-N sits at a run END (mixed run)', () => {
    const schedule = { r1: { '2026-07-03': 'TRAUMA-N', '2026-07-04': 'POD-N', '2026-07-05': 'POD-N' } };
    const issues = validateAll(residents, schedule, block, {}, appSettings, {}, {}, [], {});
    const midRunWarns = issues.filter(i => i.level === 'warn' && i.message.includes('mid-run'));
    expect(midRunWarns).toEqual([]);
  });

  it('no mid-run warning for a pure-trauma run (every night is TRAUMA-N)', () => {
    const schedule = { r1: { '2026-07-03': 'TRAUMA-N', '2026-07-04': 'TRAUMA-N' } };
    const issues = validateAll(residents, schedule, block, {}, appSettings, {}, {}, [], {});
    const midRunWarns = issues.filter(i => i.level === 'warn' && i.message.includes('mid-run'));
    expect(midRunWarns).toEqual([]);
  });
});

describe("candidatePool's traumaRunCapped reason is reachable through generateSchedule", () => {
  it('a resident already at 2 consecutive TRAUMA-N nights is excluded from a 3rd, surfacing reason traumaRunCapped', () => {
    // Minimal 1-resident scenario, isolated from the real fixture's roster/coverage noise: r1
    // already has TRAUMA-N kept on Fri/Sat (2026-07-03/04); Sunday (07-05, also inside TRAUMA-N's
    // window) has coverage min:1 and r1 is the only resident who could ever fill it. The existing
    // PER-BLOCK trauma cap (getTraumaCap, default 2) is disabled here (emTraumaCap: 0) so the
    // observed exclusion reason is unambiguously the NEW per-RUN cap, not the older per-block one.
    const zeroedCoverage = Object.fromEntries(SHIFTS.map(s => [s.id, { min: 0, max: 0 }]));
    zeroedCoverage['TRAUMA-N'] = { min: 1, max: 1 };
    const allResidents = [{ id: 'r1', category: 'EM_HOME', pgy: 2, blockType: 'EM', firstName: 'R', lastName: '1' }];
    const block = {
      id: 'blk', startDate: '2026-07-03', endDate: '2026-07-05', academicYear: 'AY26/27',
      schedule: { r1: { '2026-07-03': 'TRAUMA-N', '2026-07-04': 'TRAUMA-N' } },
    };
    const { report } = generateSchedule({
      allResidents, block, coverage: zeroedCoverage,
      appSettings: { emTraumaCap: 0 }, ayConf: { jcDates: [] },
      rng: mulberry32(1),
    });
    const traumaRunCappedUnfilled = report.unfilled.filter(u => u.reason === 'traumaRunCapped' && u.shiftId === 'TRAUMA-N' && u.dateStr === '2026-07-05');
    expect(traumaRunCappedUnfilled.length).toBe(1);
  });
});
