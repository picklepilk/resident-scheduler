/** @vitest-environment jsdom */
// src/lib/rollingWindowHours.test.js
// Generator-quality-pack item 3: generateSchedule's candidatePool hoursCapped filter used to
// approximate the ACGME 80h/4-week rolling rule with a flat block-length cap. It now shares the
// exact rolling-window core validateAll's weeklyHourStats uses (maxRollingWindowHoursFor +
// timedAssignmentsFor) so the two can no longer disagree. These are pure, exported specifically
// so this divergence can be tested directly instead of only through a full generateSchedule run.
import { describe, it, expect } from 'vitest';
import {
  maxRollingWindowHoursFor, timedAssignmentsFor, ROLLING_WINDOW_MS, ROLLING_WINDOW_CAP_H,
} from '../ResidentScheduler.jsx';

describe('timedAssignmentsFor', () => {
  it('drops empty/falsy cells and unknown shift ids, keeps the rest as {dateMs, durationH}', () => {
    const rs = { '2026-07-06': 'POD-D', '2026-07-07': null, '2026-07-08': '', '2026-07-09': 'NOT-A-REAL-SHIFT' };
    const timed = timedAssignmentsFor(rs);
    expect(timed).toHaveLength(1);
    expect(timed[0].durationH).toBeGreaterThan(0);
    expect(timed[0].dateMs).toBe(new Date(2026, 6, 6).getTime());
  });

  it('returns an empty array for an empty schedule', () => {
    expect(timedAssignmentsFor({})).toEqual([]);
  });
});

describe('maxRollingWindowHoursFor', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('returns 0 for no assignments and no hypothetical extra', () => {
    expect(maxRollingWindowHoursFor([])).toBe(0);
  });

  it('sums every assignment within one 28-day window when they all fit', () => {
    const base = Date.UTC(2026, 6, 1);
    const timed = [
      { dateMs: base, durationH: 12 },
      { dateMs: base + 5 * DAY_MS, durationH: 12 },
      { dateMs: base + 10 * DAY_MS, durationH: 12 },
    ];
    expect(maxRollingWindowHoursFor(timed)).toBe(36);
  });

  it('excludes an assignment that falls outside every 28-day window containing the others', () => {
    const base = Date.UTC(2026, 6, 1);
    const timed = [
      { dateMs: base, durationH: 12 },
      // 40 days later — outside a 28-day window starting at `base`, and `base` is outside a
      // window starting 40 days later too, so the two can never share a window.
      { dateMs: base + 40 * DAY_MS, durationH: 12 },
    ];
    expect(maxRollingWindowHoursFor(timed)).toBe(12);
  });

  it('a hypothetical `extra` entry is included without mutating the input array', () => {
    const base = Date.UTC(2026, 6, 1);
    const timed = [{ dateMs: base, durationH: 12 }];
    const withExtra = maxRollingWindowHoursFor(timed, { dateMs: base + DAY_MS, durationH: 12 });
    expect(withExtra).toBe(24);
    expect(timed).toHaveLength(1); // input untouched
  });

  it('ROLLING_WINDOW_CAP_H is 320 (80h/wk * 4 weeks), ROLLING_WINDOW_MS is 28 days', () => {
    expect(ROLLING_WINDOW_CAP_H).toBe(320);
    expect(ROLLING_WINDOW_MS).toBe(28 * 24 * 60 * 60 * 1000);
  });

  it('a resident who would exceed the cap only when the hypothetical shift is added is caught', () => {
    // 26 nine-hour shifts inside one 28-day window = 234h, well under 320. Adding one more
    // 12h shift lands right at 246h — still under cap; push it further to actually cross 320.
    const base = Date.UTC(2026, 6, 1);
    const timed = Array.from({ length: 26 }, (_, i) => ({ dateMs: base + i * DAY_MS, durationH: 12 }));
    // 26*12 = 312h, under the 320h cap.
    expect(maxRollingWindowHoursFor(timed)).toBe(312);
    // Adding one more 12h shift inside the same window pushes it to 324h — over cap.
    expect(maxRollingWindowHoursFor(timed, { dateMs: base + 26 * DAY_MS, durationH: 12 })).toBe(324);
  });
});
