/** @vitest-environment jsdom */
// src/lib/weekendOffAsNeeded.test.js
// Chief decision 2026-11-01: "one full weekend off per block" is the GOAL, broken ONLY to fill a coverage
// minimum. A broken weekend is an `asNeededException` (info tier, never export-blocking).
// PUBLIC REPO: synthetic residents only.
import { describe, it, expect } from 'vitest';
import {
  generateSchedule, validateAll, collectAsNeededPlacements, countAsNeededExceptions, WEEKEND_OFF_LABEL,
} from '../ResidentScheduler.jsx';
import { SHIFTS } from './shifts.js';
import { mulberry32 } from './rng.js';
import { severityFor } from './rulePolicy.js';

const block = { id: 'blk_wk', startDate: '2026-07-06', endDate: '2026-08-02', academicYear: 'AY26/27', specialDays: {} };
const weekends = [['2026-07-11', '2026-07-12'], ['2026-07-18', '2026-07-19'], ['2026-07-25', '2026-07-26'], ['2026-08-01', '2026-08-02']];
const res = id => ({
  id, firstName: 'Test', lastName: id, category: 'EM_HOME', pgy: 3, blockType: 'EM', chiefRole: null,
  approvedDatesOff: [], vacationDates: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [],
});
const coverageOnly = entries => ({ ...Object.fromEntries(SHIFTS.map(s => [s.id, { min: 0, max: 0 }])), ...entries });
const gen = (residents, coverage, appSettings = {}) => generateSchedule({
  allResidents: residents, block, coverage, eligOverrides: {}, appSettings, dayRules: {}, ayConf: {},
  blocksHistory: [], rng: mulberry32(7), repair: true,
});
const validate = (residents, schedule, coverage, appSettings = {}) =>
  validateAll(residents, schedule, block, {}, appSettings, {}, coverage, [], {});
const hasFreeWeekend = row => weekends.some(([a, b]) => !row?.[a] && !row?.[b]);
const weekendIssues = issues => issues.filter(i => i.rule === 'asNeededException' && i.message.includes(WEEKEND_OFF_LABEL));

describe('weekend off as needed', () => {
  it('rule policy: info tier surfaces as a warn level (non-blocking)', () => {
    expect(severityFor('asNeededException', 'validator')).toBe('warn');
  });

  it('keeps a full weekend off when coverage allows (min only on weekdays)', () => {
    const rs = [res('a'), res('b')];
    const cov = coverageOnly({ 'POD-D': { min: 1, max: 3 } });
    const { schedule, report } = gen(rs, cov);
    for (const r of rs) expect(hasFreeWeekend(schedule[r.id])).toBe(true);
    expect(report.asNeededPlacements.filter(p => p.label === WEEKEND_OFF_LABEL)).toEqual([]);
    expect(weekendIssues(validate(rs, schedule, cov))).toEqual([]);
  });

  it('breaks the weekend only when a lone resident must fill a daily minimum; flagged as-needed warn, not blocking', () => {
    const r = res('solo');
    const cov = coverageOnly({ 'POD-D': { min: 1, max: 1 } });
    const { schedule, report } = gen([r], cov);
    const row = schedule[r.id];
    // Every weekend day the resident worked was a min slot; nothing weekend-free is possible if all weekends are filled.
    const placements = report.asNeededPlacements.filter(p => p.label === WEEKEND_OFF_LABEL);
    if (hasFreeWeekend(row)) {
      expect(placements).toEqual([]);
    } else {
      expect(placements).toHaveLength(1);
      const issues = weekendIssues(validate([r], schedule, cov));
      expect(issues).toHaveLength(1);
      expect(issues[0].level).toBe('warn');
      expect(issues[0].units).toBe(1);
      expect(countAsNeededExceptions(validate([r], schedule, cov))).toBeGreaterThanOrEqual(1);
    }
  });

  it('collectAsNeededPlacements reports a fully worked weekend set once per resident', () => {
    const r = res('solo');
    const sched = { solo: {} };
    for (const [a, b] of weekends) { sched.solo[a] = 'POD-D'; sched.solo[b] = 'POD-D'; }
    const out = collectAsNeededPlacements({ allResidents: [r], schedule: sched, block, eligOverrides: {}, appSettings: {}, dayRules: {} })
      .filter(p => p.label === WEEKEND_OFF_LABEL);
    expect(out).toHaveLength(1);
  });

  it('setting off: no exception', () => {
    const r = res('solo');
    const sched = { solo: {} };
    for (const [a, b] of weekends) { sched.solo[a] = 'POD-D'; sched.solo[b] = 'POD-D'; }
    const cov = coverageOnly({});
    expect(weekendIssues(validate([r], sched, cov, { enforceWeekendOff: false }))).toEqual([]);
    expect(weekendIssues(validate([r], sched, cov, {}))).toHaveLength(1);
  });
});
