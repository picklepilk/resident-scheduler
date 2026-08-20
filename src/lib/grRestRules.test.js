/** @vitest-environment jsdom */
// src/lib/grRestRules.test.js
// Unit tests for the Phase 1B GR/streak/night rest rules (see CLAUDE.md-adjacent plan doc,
// "1.5 Grand Rounds rest fixes" / "1.6 NEW HARD RULE: 24h gap after a 6-consecutive-workday run" /
// "1.7 Night runs: one run of 5-6 strongly preferred"). Imports the real ResidentScheduler.jsx
// under jsdom, same pattern as generator.harness.test.js — verified import-safe there already.
import { describe, it, expect } from 'vitest';
import { isStreakWorkDay, sixDayRunRestViolation, validateAll } from '../ResidentScheduler.jsx';
import { parseDate, addDays, toDateStr } from './dates.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

// Minimal EM_HOME PGY-3 stand-in (grWorkDow = Wednesday) — isStreakWorkDay/sixDayRunRestViolation
// are pure functions of (rs, resident, ds, ...), so a hand-built resident object is enough; no
// need to pull the full synthetic roster for these two.
const papaBare = {
  id: 'papa_bare', category: 'EM_HOME', pgy: 3,
  vacationDates: [], approvedDatesOff: [], jcPresentDates: [],
};

describe('isStreakWorkDay — post-overnight GR exemption (1.5b)', () => {
  // 2026-07-15 is a Wednesday (EM_HOME's GR weekday) — matches syntheticRoster.js's own
  // GR_WED_1 fixture date, same block-window assumption (2026-07-06 = Monday).
  const GR_WED = '2026-07-15';
  const PRIOR_DAY = '2026-07-14'; // Tuesday, the calendar day immediately before GR_WED

  it('counts the GR weekday as worked when nothing precedes it', () => {
    expect(isStreakWorkDay({}, papaBare, GR_WED)).toBe(true);
  });

  it('does NOT count the GR weekday when a night shift was worked the day before', () => {
    const rs = { [PRIOR_DAY]: 'TRAUMA-N' };
    expect(isStreakWorkDay(rs, papaBare, GR_WED)).toBe(false);
  });

  it('still counts the GR weekday when the day before was a non-night shift', () => {
    const rs = { [PRIOR_DAY]: 'POD-D' };
    expect(isStreakWorkDay(rs, papaBare, GR_WED)).toBe(true);
  });

  it('honors a night shift carried in from the previous block tail (prevRs) the same way', () => {
    const prevRs = { [PRIOR_DAY]: 'MT-N' };
    expect(isStreakWorkDay({}, papaBare, GR_WED, prevRs)).toBe(false);
  });

  it('BAMC (Thursday GR) gets the same exemption', () => {
    // 2026-07-16 is a Thursday (EM_BAMC's GR weekday).
    const bamc = { id: 'bamc_bare', category: 'EM_BAMC', pgy: 1, vacationDates: [], approvedDatesOff: [], jcPresentDates: [] };
    const rs = { '2026-07-15': 'FLEX-N' }; // Wednesday night shift
    expect(isStreakWorkDay(rs, bamc, '2026-07-16')).toBe(false);
  });
});

describe('sixDayRunRestViolation (1.6) — 24h rest after a maxed 6-day work run', () => {
  function sixDayRun(startDs, sid = 'POD-D') {
    const rs = {};
    let d = parseDate(startDs);
    for (let i = 0; i < 6; i++) { rs[toDateStr(d)] = sid; d = addDays(d, 1); }
    return rs;
  }

  it('fires when the next shift starts <24h after the run\'s last shift end', () => {
    const rs = sixDayRun('2026-07-06'); // Mon-Sat, last day 2026-07-11, POD-D ends 16:00
    // Sunday 2026-07-12 POD-D starts 07:00 -> only 15h off.
    const v = sixDayRunRestViolation(rs, papaBare, '2026-07-12', 'POD-D');
    expect(v).not.toBeNull();
    expect(v.level).toBe('error');
  });

  it('passes when the next shift starts >=24h after the run\'s last shift end', () => {
    const rs = sixDayRun('2026-07-06');
    // Monday 2026-07-13 POD-D starts 07:00, two calendar days later -> well over 24h.
    expect(sixDayRunRestViolation(rs, papaBare, '2026-07-13', 'POD-D')).toBeNull();
  });

  it('does not fire for a run shorter than the 6-day max', () => {
    const rs = {};
    let d = parseDate('2026-07-06');
    for (let i = 0; i < 5; i++) { rs[toDateStr(d)] = 'POD-D'; d = addDays(d, 1); } // Mon-Fri, 5 days
    // Saturday 2026-07-11 POD-D starts 07:00 -> only 15h off, but the run was only 5 days.
    expect(sixDayRunRestViolation(rs, papaBare, '2026-07-11', 'POD-D')).toBeNull();
  });

  it('measures from the last actual SHIFT end, not the run\'s last calendar day (GR obligation tail)', () => {
    // 6 nights Thu(07-09)..Tue(07-14), then GR Wednesday 07-15 carries no shift (post-overnight
    // exemption, 1.5b) — the chief-confirmed "6 nights then GR Wednesday is legal" scenario.
    // TRAUMA-N ends 06:00 the following calendar day.
    const rs = {};
    let d = parseDate('2026-07-09');
    for (let i = 0; i < 6; i++) { rs[toDateStr(d)] = 'TRAUMA-N'; d = addDays(d, 1); }
    // Same-day Wednesday evening (POD-E starts 15:00): gap from 06:00 -> 9h, fails.
    const sameDay = sixDayRunRestViolation(rs, papaBare, '2026-07-15', 'POD-E');
    expect(sameDay).not.toBeNull();
    // Thursday 07-16 day shift (POD-D starts 07:00): gap from Wed 06:00 -> 25h, passes.
    expect(sixDayRunRestViolation(rs, papaBare, '2026-07-16', 'POD-D')).toBeNull();
  });

  it('a run made entirely of obligation days (no shifts at all) never fires', () => {
    expect(sixDayRunRestViolation({}, papaBare, '2026-07-16', 'POD-D')).toBeNull();
  });
});

describe('validateAll — night stint count thresholds (1.7)', () => {
  function papaFixture() {
    const fixture = makeFixture('standard');
    const papa = fixture.allResidents.find(r => r.id === 'syn_papa'); // EM_HOME PGY-3, no special dates
    return { fixture, papa };
  }

  function nightRun(startDs, len, sid = 'POD-N') {
    const rs = {};
    let d = parseDate(startDs);
    for (let i = 0; i < len; i++) { rs[toDateStr(d)] = sid; d = addDays(d, 1); }
    return rs;
  }

  function runValidate(fixture, papa, rs) {
    const schedule = { [papa.id]: rs };
    const issues = validateAll(
      fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
      fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf
    );
    return issues.filter(i => i.residentId === papa.id);
  }

  it('a single isolated run shorter than minRun (5) warns, not errors', () => {
    const { fixture, papa } = papaFixture();
    // 3 nights, well clear of the block's first/last date so it isn't edge-exempt.
    const issues = runValidate(fixture, papa, nightRun('2026-07-10', 3));
    expect(issues.some(i => i.level === 'warn' && /Isolated night stint of 3/.test(i.message))).toBe(true);
    expect(issues.some(i => /night stints/.test(i.message))).toBe(false);
    expect(issues.some(i => i.level === 'error' && /consecutive night shifts/.test(i.message))).toBe(false);
  });

  it('a single run of exactly minRun (5) raises no short-run warning', () => {
    const { fixture, papa } = papaFixture();
    const issues = runValidate(fixture, papa, nightRun('2026-07-10', 5));
    expect(issues.some(i => /Isolated night stint/.test(i.message))).toBe(false);
  });

  it('two separate 5-night stints warns ("acceptable only if necessary"), not an error', () => {
    const { fixture, papa } = papaFixture();
    const rs = { ...nightRun('2026-07-06', 5), ...nightRun('2026-07-13', 5) };
    const issues = runValidate(fixture, papa, rs);
    expect(issues.some(i => i.level === 'warn' && /2 separate night stints/.test(i.message))).toBe(true);
    expect(issues.some(i => i.level === 'error' && /separate night stints/.test(i.message))).toBe(false);
  });

  it('three separate 5-night stints is a hard error', () => {
    const { fixture, papa } = papaFixture();
    const rs = { ...nightRun('2026-07-06', 5), ...nightRun('2026-07-13', 5), ...nightRun('2026-07-20', 5) };
    const issues = runValidate(fixture, papa, rs);
    expect(issues.some(i => i.level === 'error' && /3 separate night stints/.test(i.message))).toBe(true);
  });
});
