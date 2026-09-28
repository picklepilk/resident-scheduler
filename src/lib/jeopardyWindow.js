// src/lib/jeopardyWindow.js
// Jeopardy WINDOW rule (chief-decided policy, 2026-09-26, memory `rule-override-policy`): a
// jeopardy call on date D means the resident must be non-clinical for the whole window
// [D 07:00, D+1 07:00), not just date D itself. That's stricter than a same-day-only check in two
// ways a same-day check misses:
//   - an overnight shift STARTING on D-1 that runs past 07:00 on D is blocked (POD-N 23:00-08:00
//     on D-1 ends 08:00 D, inside the window) — a shift ending AT OR BEFORE 07:00 D is NOT blocked
//     (PED-N 19:00-04:00 on D-1 ends 04:00 D, clear of it; TRAUMA-N 18:00-06:00 ends 06:00 D, also
//     clear);
//   - any shift STARTING on D itself falls inside the window (every catalog shift's own duration
//     carries it well past 07:00, so this covers "all shifts on D" with no special-casing).
// Pure, lib-legal — SHIFT_TIMING/shiftStartMs/shiftEndMs come from shifts.js, never from
// ResidentScheduler.jsx. ResidentScheduler.jsx's own isJeopardyDate (chief-typed jeopardyDates UNION
// block.jeopardySchedule tracks) decides WHICH dates are jeopardy dates at all — this module only
// answers "does this shift's time span overlap that date's window."
import { SHIFT_TIMING, shiftStartMs, shiftEndMs } from './shifts.js';
import { parseDate, addDays, toDateStr } from './dates.js';

export const JEOPARDY_WINDOW_START_H = 7;

function hourMs(dateStr, hour) {
  const d = parseDate(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0).getTime();
}

// [start, end) ms bounds of jeopardy date `jeopardyDateStr`'s own window.
export function jeopardyWindowBounds(jeopardyDateStr) {
  const startMs = hourMs(jeopardyDateStr, JEOPARDY_WINDOW_START_H);
  return { startMs, endMs: startMs + 24 * 60 * 60 * 1000 };
}

// Does `shiftId` scheduled on `shiftDateStr` overlap jeopardy date `jeopardyDateStr`'s window?
// `shiftDateStr` is normally either `jeopardyDateStr` itself (any shift starting D) or the day
// before it (an overnight that might run past 07:00 into D) — any other date can't geometrically
// overlap a 24h window, but this is plain ms-interval overlap, so it's correct for any pairing.
export function shiftOverlapsJeopardyWindow(shiftId, shiftDateStr, jeopardyDateStr) {
  const t = SHIFT_TIMING[shiftId];
  if (!t) return false;
  const shiftStart = shiftStartMs(shiftId, shiftDateStr);
  const shiftEnd = shiftEndMs(shiftId, shiftDateStr);
  const { startMs, endMs } = jeopardyWindowBounds(jeopardyDateStr);
  return shiftStart < endMs && shiftEnd > startMs;
}

// Does resident's own schedule row `rs` ({dateStr: shiftId}) already collide with jeopardy date
// `jeopardyDateStr`'s window — either a same-day shift or a D-1 overnight running past 07:00?
// Used retrospectively (validateAll/cellViolations already-scheduled checks, fillJeopardy's
// don't-double-book-an-overnight guard).
export function scheduleHitsJeopardyWindow(rs, jeopardyDateStr) {
  const prevDs = toDateStr(addDays(parseDate(jeopardyDateStr), -1));
  const prevSid = rs?.[prevDs];
  if (prevSid && shiftOverlapsJeopardyWindow(prevSid, prevDs, jeopardyDateStr)) return true;
  const sameSid = rs?.[jeopardyDateStr];
  if (sameSid && shiftOverlapsJeopardyWindow(sameSid, jeopardyDateStr, jeopardyDateStr)) return true;
  return false;
}
