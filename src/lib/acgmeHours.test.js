// src/lib/acgmeHours.test.js
// R3 (rule-policy plan, 2026-09-26, memory acgme-em-work-hours): ACGME EM 6.17.a rolling-7-day
// weekly caps (60 scheduled ED h / 72 total h) and the rest >= shift-length rule (6.17.a.2), always
// hard on EM Home/BAMC residents while on a schedulable EM rotation.
import { describe, it, expect } from 'vitest';
import {
  worstRollingWeek, wouldBreachWeeklyCaps, effectiveShiftEndMs,
  buildDailyContributions, weeklyCapBreachAt,
  ED_WEEKLY_CAP_H, TOTAL_WEEKLY_CAP_H, GR_START_H, GR_END_H, GR_DURATION_H, JC_DURATION_H,
} from './acgmeHours.js';
import { SHIFT_TIMING } from './shifts.js';
import { getBlockDates, parseDate, addDays, toDateStr } from './dates.js';
import { mulberry32 } from './rng.js';

function resident(overrides = {}) {
  return { vacationDates: [], approvedDatesOff: [], jcPresentDates: [], ...overrides };
}

describe('worstRollingWeek', () => {
  it('six 12h shifts inside a 7-day span push ED hours to 72 — over the 60h cap, exactly at (not over) the 72h total cap', () => {
    const r = resident();
    const rs = {};
    const dates = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11'];
    for (const ds of dates) rs[ds] = 'TRAUMA-D'; // 12h each => 72h ED across a 6-day span
    const worst = worstRollingWeek(r, rs, null, null);
    expect(worst).toBeTruthy();
    expect(worst.edHours).toBe(72);
    expect(worst.edHours).toBeGreaterThan(ED_WEEKLY_CAP_H);
    expect(worst.totalHours).toBe(72);
    expect(worst.totalHours).not.toBeGreaterThan(TOTAL_WEEKLY_CAP_H); // 72 is the cap, not over it
  });

  it('five 9h shifts + a Grand Rounds day + a Journal Club day in the same week stay comfortably under both caps', () => {
    const r = resident({ jcPresentDates: ['2026-07-12'] }); // Sunday — JC date, no shift that day
    const rs = {
      '2026-07-06': 'POD-D', '2026-07-07': 'POD-D', '2026-07-09': 'POD-D',
      '2026-07-10': 'POD-D', '2026-07-11': 'POD-D',
      // 2026-07-08 is a Wednesday — GR day (grDow=3), deliberately left shift-less.
    };
    const grDow = 3; // EM_HOME's Wednesday
    const worst = worstRollingWeek(r, rs, null, grDow);
    expect(worst.edHours).toBe(45); // 5 * 9h
    expect(worst.totalHours).toBe(45 + GR_DURATION_H + JC_DURATION_H); // 45 + 4 + 3 = 52
    expect(worst.edHours).toBeLessThan(ED_WEEKLY_CAP_H);
    expect(worst.totalHours).toBeLessThan(TOTAL_WEEKLY_CAP_H);
  });

  it('a window crossing the block boundary only breaches once the PREVIOUS block\'s tail is included', () => {
    const r = resident();
    const prevRs = { '2026-07-04': 'TRAUMA-D', '2026-07-05': 'TRAUMA-D' }; // 24h, previous block's tail
    const rs = { '2026-07-06': 'TRAUMA-D', '2026-07-07': 'TRAUMA-D', '2026-07-08': 'TRAUMA-D', '2026-07-09': 'TRAUMA-D' }; // 48h, current block
    // Current-block-only view: 48h, under the 60h cap.
    const currentOnly = worstRollingWeek(r, rs, null, null);
    expect(currentOnly.edHours).toBe(48);
    expect(currentOnly.edHours).toBeLessThan(ED_WEEKLY_CAP_H);
    // With the tail included, the 7-day window starting 2026-07-04 sees all 6 shifts = 72h, over cap.
    const withTail = worstRollingWeek(r, rs, prevRs, null);
    expect(withTail.edHours).toBe(72);
    expect(withTail.edHours).toBeGreaterThan(ED_WEEKLY_CAP_H);
    // Both 2026-07-03 and 2026-07-04 are valid 7-day windows containing all 6 shifts (72h) — the
    // scan picks the EARLIEST tied start, matching maxRollingWindowHoursFor's own convention.
    expect(withTail.edStartDate).toBe('2026-07-03');
  });

  it('returns null for a resident with no scheduled shift at all', () => {
    expect(worstRollingWeek(resident(), {}, null, 3)).toBeNull();
  });
});

describe('wouldBreachWeeklyCaps', () => {
  it('the 6th 12h shift in a rolling week breaches the ED cap; the same candidate on an isolated week does not', () => {
    const r = resident();
    const rs = {
      '2026-07-06': 'TRAUMA-D', '2026-07-07': 'TRAUMA-D', '2026-07-08': 'TRAUMA-D',
      '2026-07-09': 'TRAUMA-D', '2026-07-10': 'TRAUMA-D',
    };
    const breach = wouldBreachWeeklyCaps(r, rs, null, null, '2026-07-11', 'TRAUMA-D');
    expect(breach.edBreach).toBe(true);
    expect(breach.totalBreach).toBe(false); // 72 total is at, not over, the cap

    const farAway = wouldBreachWeeklyCaps(r, rs, null, null, '2026-08-15', 'TRAUMA-D');
    expect(farAway.edBreach).toBe(false);
    expect(farAway.totalBreach).toBe(false);
  });

  it('an unrecognized shift id never breaches (nothing to add)', () => {
    expect(wouldBreachWeeklyCaps(resident(), {}, null, null, '2026-07-06', 'NOT-A-SHIFT')).toEqual({ edBreach: false, totalBreach: false });
  });
});

describe('buildDailyContributions/weeklyCapBreachAt agrees with wouldBreachWeeklyCaps (property)', () => {
  // Generator hot-path parity: candidatePool asks weeklyCapBreachAt (fast, array-index-only) instead
  // of wouldBreachWeeklyCaps (slow, ~49 `new Date`s per call) for every candidate/slot — see
  // acgmeHours.js's own header on the pair. This proves they answer identically for every date of a
  // 28-day block, including the last 6 (the one place `weeklyRangeDates`' backward-only 6-day pad
  // means a checked window can run past the precomputed range — see weeklyCapBreachAt's own comment).
  //
  // grDow is deliberately null here rather than a real weekday: GR/JC are calendar/weekday facts
  // independent of any block, so wouldBreachWeeklyCaps' unbounded Date arithmetic can legitimately
  // see a real GR contribution 1-6 days past the block's own end that buildDailyContributions
  // structurally never computed (it only ever walks the precomputed `rangeDates` array) — a narrower,
  // pre-existing, documented gap (see weeklyCapBreachAt's comment) that 0-filling the missing ED
  // hours does not and cannot close. jcPresentDates stays confined to actual block dates for the same
  // reason. Within that scope (ED hours + in-block JC, matching everything buildDailyContributions
  // can actually represent) the two must agree exactly, which is what this test proves.
  const SHIFT_IDS = Object.keys(SHIFT_TIMING);
  const TWELVE_HOUR_IDS = SHIFT_IDS.filter(id => SHIFT_TIMING[id].durationH === 12);

  function randomRow(rng, dates, pShift) {
    const row = {};
    for (const ds of dates) {
      if (rng() < pShift) row[ds] = SHIFT_IDS[Math.floor(rng() * SHIFT_IDS.length)];
    }
    return row;
  }

  it('fast and slow paths agree for every date of a 28-day block, incl. the last 6, across several deterministic schedules', () => {
    const blockStart = '2026-07-06';
    const blockEnd = '2026-08-02';
    const dates = getBlockDates(blockStart, blockEnd);
    const weeklyRangeDates = getBlockDates(toDateStr(addDays(parseDate(dates[0]), -6)), dates[dates.length - 1]);
    const weeklyDateIndex = new Map(weeklyRangeDates.map((ds, i) => [ds, i]));
    const tailDates = getBlockDates(toDateStr(addDays(parseDate(blockStart), -6)), toDateStr(addDays(parseDate(blockStart), -1)));
    const grDow = null;

    for (const seed of [1, 2, 3, 4, 5]) {
      const rng = mulberry32(seed);
      const prevRs = randomRow(rng, tailDates, 0.5); // prev-block tail, incl. whatever 12h ids randomRow picks
      const rs = randomRow(rng, dates, 0.5);
      // Force 12h shifts onto the block's own last 6 days specifically — a real, well-over-cap ED run
      // sitting right where a checked window's tail can run past the precomputed range (backward-only
      // lookback pad, see weeklyRangeDates' own comment), exercising exactly the case
      // weeklyCapBreachAt's own comment proves is still safe.
      dates.slice(-6).forEach((ds, i) => { rs[ds] = TWELVE_HOUR_IDS[i % TWELVE_HOUR_IDS.length]; });
      const resident = {
        vacationDates: [], approvedDatesOff: [],
        jcPresentDates: [dates[10], dates[dates.length - 6]], // in-block only — see the describe-level note
      };

      const contrib = buildDailyContributions(resident, rs, prevRs, grDow, weeklyRangeDates);
      for (const ds of dates) {
        const idx = weeklyDateIndex.get(ds);
        for (const shiftId of SHIFT_IDS) {
          const fast = weeklyCapBreachAt(contrib, idx, shiftId);
          const slow = wouldBreachWeeklyCaps(resident, rs, prevRs, grDow, ds, shiftId);
          expect(fast, `seed ${seed} date ${ds} shift ${shiftId}`).toEqual(slow);
        }
      }
    }
  });
});

describe('effectiveShiftEndMs', () => {
  it('with no GR weekday, returns the shift\'s own end', () => {
    const r = resident();
    const raw = effectiveShiftEndMs('POD-D', '2026-07-09', r, null);
    const t = SHIFT_TIMING['POD-D'];
    const expected = new Date(2026, 6, 9, t.startH, 0, 0).getTime() + t.durationH * 3_600_000;
    expect(raw).toBe(expected);
  });

  it('a night shift ending 08:00 on this resident\'s Grand Rounds day is measured from Grand Rounds\' own end (12:00), not 08:00', () => {
    const r = resident();
    // POD-N: 23:00-08:00 (+1 day). Worked 2026-07-07 (Tue) -> ends 2026-07-08 (Wed) 08:00.
    const grDow = 3; // Wednesday
    const endMs = effectiveShiftEndMs('POD-N', '2026-07-07', r, grDow);
    const grEndMs = new Date(2026, 6, 8, GR_END_H, 0, 0).getTime();
    expect(endMs).toBe(grEndMs);
    // Demonstrates the ACGME rest-length boundary this feeds: PED-N starts 19:00 the same
    // Wednesday — 11h after the shift's own 08:00 end (would clear POD-N's 9h requirement), but
    // only 7h after Grand Rounds' 12:00 end (does NOT clear it).
    const nextStartMs = new Date(2026, 6, 8, 19, 0, 0).getTime();
    const gapFromShiftEnd = (nextStartMs - new Date(2026, 6, 8, 8, 0, 0).getTime()) / 3_600_000;
    const gapFromGrEnd = (nextStartMs - endMs) / 3_600_000;
    expect(gapFromShiftEnd).toBeGreaterThanOrEqual(9);
    expect(gapFromGrEnd).toBeLessThan(9);
  });

  it('does not adjust when the resident is on vacation/approved-off on Grand Rounds day (GR not actually attended)', () => {
    const r = resident({ vacationDates: ['2026-07-08'] });
    const grDow = 3;
    const endMs = effectiveShiftEndMs('POD-N', '2026-07-07', r, grDow);
    const rawEnd = new Date(2026, 6, 8, 8, 0, 0).getTime();
    expect(endMs).toBe(rawEnd);
  });

  it('does not adjust when the shift already ends at/after Grand Rounds\' own end', () => {
    const r = resident();
    const grDow = 3;
    // PED-D: 07:00-16:00 — ends well after GR_END_H (12:00).
    const endMs = effectiveShiftEndMs('PED-D', '2026-07-08', r, grDow);
    const rawEnd = new Date(2026, 6, 8, 16, 0, 0).getTime();
    expect(endMs).toBe(rawEnd);
  });
});
