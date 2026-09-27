// src/lib/acgmeHours.js
// ACGME EM Program Requirements 2025 reformatted (interim revision eff. Sept 3 2025), 6.17.a —
// EM-rotation-specific hour limits, STRICTER than the common 80h/4wk average (maxRollingWindowHoursFor
// in ResidentScheduler.jsx). Chief-decided policy 2026-09-26 (memory `acgme-em-work-hours` /
// `rule-override-policy`): always hard, applies only to EM residents (EM_HOME/EM_BAMC) while on a
// schedulable EM rotation — off-service residents keep the 80h rule only, enforced elsewhere.
//
// Pure module — no ResidentScheduler.jsx import (CLAUDE.md: "src/lib/* modules are pure ... may
// never import ResidentScheduler.jsx"). Business-rule mappings that live in that file (grWorkDow's
// category->weekday, isSchedulable/isEmResident) are passed in as plain values (`grDow`) by the
// caller rather than re-derived here, so there is exactly one place that can drift.
import { SHIFT_TIMING, shiftStartMs } from './shifts.js';
import { parseDate, addDays, toDateStr } from './dates.js';
import { JC_WINDOW_START_H, JC_WINDOW_END_H } from './shifts.js';

// 6.17.a.3: no more than this many SCHEDULED ED hours, or this many TOTAL hours (ED + Grand
// Rounds + Journal Club), in ANY rolling 7-day window.
export const ED_WEEKLY_CAP_H = 60;
export const TOTAL_WEEKLY_CAP_H = 72;

// Grand Rounds: 08:00-12:00, both sites (EM_HOME Wed, EM_BAMC Thu — see grWorkDow in
// ResidentScheduler.jsx). Counts toward the 72h total (EM FAQ: didactics count toward weekly hours).
export const GR_START_H = 8;
export const GR_END_H = 12;
export const GR_DURATION_H = GR_END_H - GR_START_H; // 4h

// Journal Club: 18:00-21:00 (same window shiftOverlapsJC uses) — counts toward the 72h total for
// its presenter on their own jcPresentDates.
export const JC_DURATION_H = JC_WINDOW_END_H - JC_WINDOW_START_H; // 3h

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * DAY_MS;

// Merges the current block's schedule row with the previous block's TAIL row (prevBlockTailSchedules'
// shape in ResidentScheduler.jsx) into one {dateStr: shiftId} lookup — a rolling 7-day window can
// start before the current block's own first date and still needs to see those shifts. Current-block
// entries win on a key collision (shouldn't happen — tail and live block cover disjoint date ranges
// — but matches every other prevTail consumer's convention, e.g. runLengthIfWorked).
function combinedRow(rs, prevRs) {
  return { ...(prevRs || {}), ...(rs || {}) };
}

function isOffDate(resident, ds) {
  return (resident?.vacationDates || []).includes(ds) || (resident?.approvedDatesOff || []).includes(ds);
}

// GR hours on `ds` if it's this resident's GR weekday and they're not vacation/approved-off that
// specific date — same exemption isStreakWorkDay/the 1-in-7 rule already apply to a GR obligation
// day with no actual schedule evidence.
function grHoursOn(resident, ds, grDow) {
  if (grDow == null) return 0;
  if (parseDate(ds).getDay() !== grDow) return 0;
  return isOffDate(resident, ds) ? 0 : GR_DURATION_H;
}

function jcHoursOn(resident, ds) {
  return (resident?.jcPresentDates || []).includes(ds) ? JC_DURATION_H : 0;
}

function edHoursOn(row, ds) {
  const sid = row[ds];
  const t = sid && SHIFT_TIMING[sid];
  return t ? t.durationH : 0;
}

// ED/total hours for the 7-day window starting at `windowStartMs` (local midnight of some date).
function windowTotals(resident, row, grDow, windowStartMs) {
  let edHours = 0, totalHours = 0;
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const ds = toDateStr(new Date(windowStartMs + i * DAY_MS));
    const ed = edHoursOn(row, ds);
    const gr = grHoursOn(resident, ds, grDow);
    const jc = jcHoursOn(resident, ds);
    edHours += ed;
    totalHours += ed + gr + jc;
  }
  return { edHours, totalHours };
}

// Every calendar date from (earliest scheduled shift - 6 days) to (latest scheduled shift),
// inclusive — a brute-force but complete set of candidate window starts. Only used by
// worstRollingWeek (a diagnostic, called once per resident, not in the generator's hot loop) —
// unlike the 80h rule's maxRollingWindowHoursFor, this doesn't rely on the "a window's worst start
// always lands exactly on an event date" shortcut, because GR/JC contributions are calendar-driven
// (a fixed weekday / a chief-set date), not shift-driven, so a window with no shift at all could in
// principle still need checking. Cheap in practice — blocks run ~28-56 days.
function fullDateRange(row) {
  const shiftDates = Object.keys(row).filter(ds => SHIFT_TIMING[row[ds]]);
  if (!shiftDates.length) return [];
  const times = shiftDates.map(ds => parseDate(ds).getTime());
  const minMs = Math.min(...times) - (WINDOW_DAYS - 1) * DAY_MS;
  const maxMs = Math.max(...times);
  const out = [];
  for (let t = minMs; t <= maxMs; t += DAY_MS) out.push(t);
  return out;
}

// worstRollingWeek: the worst rolling-7-day ED-hours window AND the worst rolling-7-day total-hours
// window for `resident`, given their `rs` (current block {dateStr: shiftId} row) and `prevRs`
// (optional — the previous saved block's tail row, so a window straddling the block boundary is
// still measured correctly). `grDow` is the resident's Grand Rounds weekday (grWorkDow(resident) in
// ResidentScheduler.jsx — pass it in, never re-derive; null for a resident with no GR obligation).
// Tracked SEPARATELY rather than as one combined "worst window" struct: the window that maximizes
// total hours is not always the same window that maximizes ED hours alone (a window with fewer ED
// hours but landing on a GR+JC day could have a higher total but lower ED than another window) — a
// single combined pick could silently under-report an ED-cap breach. Returns null when the resident
// has no scheduled shift at all (nothing to anchor a window on).
export function worstRollingWeek(resident, rs, prevRs, grDow) {
  const row = combinedRow(rs, prevRs);
  const starts = fullDateRange(row);
  if (!starts.length) return null;
  let maxEdHours = 0, edStartMs = null;
  let maxTotalHours = 0, totalStartMs = null;
  for (const startMs of starts) {
    const { edHours, totalHours } = windowTotals(resident, row, grDow, startMs);
    if (edHours > maxEdHours) { maxEdHours = edHours; edStartMs = startMs; }
    if (totalHours > maxTotalHours) { maxTotalHours = totalHours; totalStartMs = startMs; }
  }
  return {
    edHours: maxEdHours,
    edStartDate: edStartMs != null ? toDateStr(new Date(edStartMs)) : null,
    totalHours: maxTotalHours,
    totalStartDate: totalStartMs != null ? toDateStr(new Date(totalStartMs)) : null,
  };
}

// wouldBreachWeeklyCaps: fast hot-path check for the generator's candidatePool — would placing
// `shiftId` on `dateStr` push some rolling 7-day window that CONTAINS `dateStr` over the ED or total
// cap? Only the (at most) 7 windows whose 7-day span includes `dateStr` can possibly be affected by
// adding a shift there, so this checks exactly those instead of worstRollingWeek's full brute-force
// scan — O(7*7) day-lookups per call regardless of how long the resident's schedule is, matching the
// performance discipline candidatePool's other per-candidate filters already follow (see
// ResidentScheduler.jsx's cachedRestViolations/cachedTimedFor). Returns {edBreach, totalBreach}
// rather than a single boolean so the caller can report which cap actually failed.
export function wouldBreachWeeklyCaps(resident, rs, prevRs, grDow, dateStr, shiftId) {
  const t = SHIFT_TIMING[shiftId];
  if (!t) return { edBreach: false, totalBreach: false };
  const row = { ...combinedRow(rs, prevRs), [dateStr]: shiftId };
  const dsMs = parseDate(dateStr).getTime();
  let edBreach = false, totalBreach = false;
  for (let offset = -(WINDOW_DAYS - 1); offset <= 0; offset++) {
    const startMs = dsMs + offset * DAY_MS;
    const { edHours, totalHours } = windowTotals(resident, row, grDow, startMs);
    if (edHours > ED_WEEKLY_CAP_H) edBreach = true;
    if (totalHours > TOTAL_WEEKLY_CAP_H) totalBreach = true;
  }
  return { edBreach, totalBreach };
}

// buildDailyContributions / weeklyCapBreachAt: the FAST hot-path pair for candidatePool, which
// calls this once per resident per (shift, date) slot across the whole generation — wouldBreachWeeklyCaps
// above does 7 windows x 7 days = 49 `new Date(...)` + toDateStr constructions PER CALL, which
// measurably regressed generateScheduleBest's own CPU budget (profiled: ~3x slower on the standard
// fixture) once wired into the hot loop. This pair instead does the Date-heavy work ONCE per
// resident per scheduleVersion (same idiom as cachedTimedFor) — `rangeDates` is a single shared,
// pre-built contiguous date-string array (block dates plus a 6-day lookback pad for windows
// crossing the block start) that every resident/call reuses, and `buildDailyContributions` walks it
// ONCE to produce plain parallel arrays with zero further date arithmetic; `weeklyCapBreachAt` then
// does pure integer-index array sums, no Date objects at all.
export function buildDailyContributions(resident, rs, prevRs, grDow, rangeDates) {
  const row = combinedRow(rs, prevRs);
  const n = rangeDates.length;
  const ed = new Array(n);
  const other = new Array(n);
  for (let i = 0; i < n; i++) {
    const ds = rangeDates[i];
    ed[i] = edHoursOn(row, ds);
    other[i] = grHoursOn(resident, ds, grDow) + jcHoursOn(resident, ds);
  }
  return { ed, other };
}

// `candidateIdx` is the hypothetical placement's index into the SAME `rangeDates` array
// `buildDailyContributions` used. That date's own `ed[candidateIdx]` is always 0 going in
// (candidatePool only ever calls this for a date the resident doesn't already work), so overriding
// it with the candidate shift's duration for the sum is safe — never double-counts.
//
// A window can extend past the HIGH end of `rangeDates` — it's only padded backward (see
// weeklyRangeDates' own comment: a 6-day lookback pad before the block start, no matching forward
// pad past the block end), so a candidate placed in the block's own last ~6 days can need days that
// were never precomputed. Each such day is 0-filled (`i < 0 || i >= n` below) rather than discarding
// the whole window. R3's own property test (acgmeHours.test.js) swept every date of a 28-day block,
// including the last 6, against wouldBreachWeeklyCaps and found the two ALREADY agreed either way —
// discarding the window and 0-filling it are provably the same answer here, because the 6-day
// backward pad is exactly WINDOW_DAYS-1: whenever a window's tail runs past the block end, the
// LARGEST still-fully-in-range window for that same candidate date is a strict superset of its real
// (in-range) days, and every contribution is non-negative, so that in-range window's own sum is
// always >= the truncated window's — the truncated window could never have been the one that decided
// edBreach/totalBreach in the first place. 0-filling is kept anyway as the more transparently-correct
// form (this equivalence depends on the exact 6-day pad matching WINDOW_DAYS-1; discarding would
// silently stop being safe if that ever changed, 0-filling wouldn't).
// Documented residual gap this does NOT close (pre-existing, not introduced or fixed here): a
// resident's GR/JC obligation is a calendar/weekday fact independent of any block, so
// wouldBreachWeeklyCaps' unbounded Date arithmetic can legitimately pick up a REAL GR/JC contribution
// on one of those same not-yet-precomputed days — this function still reads 0 for it, since
// buildDailyContributions never computed an `other[]` entry that far forward, and 0-filling can't
// invent a value that was never computed. Closing that would mean forward-padding `rangeDates` past
// the block end too (a bigger change, not attempted here) — the property test deliberately keeps
// grDow null and jcPresentDates in-block to test the claim above that IS provably closed, rather than
// asserting agreement it can't actually deliver.
export function weeklyCapBreachAt(contrib, candidateIdx, shiftId) {
  const t = SHIFT_TIMING[shiftId];
  if (!t) return { edBreach: false, totalBreach: false };
  const { ed, other } = contrib;
  const n = ed.length;
  let edBreach = false, totalBreach = false;
  for (let offset = -(WINDOW_DAYS - 1); offset <= 0; offset++) {
    const startIdx = candidateIdx + offset;
    const endIdx = startIdx + WINDOW_DAYS; // exclusive
    let edSum = 0, totalSum = 0;
    for (let i = startIdx; i < endIdx; i++) {
      if (i < 0 || i >= n) continue; // not-yet-precomputed day — 0-fill, don't drop the whole window
      const e = i === candidateIdx ? t.durationH : ed[i];
      edSum += e;
      totalSum += e + other[i];
    }
    if (edSum > ED_WEEKLY_CAP_H) edBreach = true;
    if (totalSum > TOTAL_WEEKLY_CAP_H) totalBreach = true;
  }
  return { edBreach, totalBreach };
}

// effectiveShiftEndMs: the timestamp rest-period math should measure FROM after working
// `shiftId` on `dateStr` — normally the shift's own end, but pushed forward to Grand Rounds' own
// end (12:00) when this resident's GR falls on the calendar date the shift ends AND the shift ends
// before GR_END_H (EM FAQ 6.17.a.2: "a scheduled break equal to the scheduled length of the shift";
// EM FAQ: "time off counts from the end of conference" when attended — GR is assumed attended
// unless the resident is vacation/approved-off that date, same convention isStreakWorkDay/the 1-in-7
// rule already use for a shift-less GR obligation day). `resident` only needs vacationDates/
// approvedDatesOff (plain data, not ResidentScheduler.jsx logic); `grDow` is grWorkDow(resident),
// passed in by the caller.
export function effectiveShiftEndMs(shiftId, dateStr, resident, grDow) {
  const t = SHIFT_TIMING[shiftId];
  if (!t) return null;
  const startMs = shiftStartMs(shiftId, dateStr);
  const endMs = startMs + t.durationH * 3_600_000;
  if (grDow == null) return endMs;
  const endDate = new Date(endMs);
  if (endDate.getDay() !== grDow) return endMs;
  const endDs = toDateStr(endDate);
  if (isOffDate(resident, endDs)) return endMs;
  const grEndMs = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), GR_END_H, 0, 0).getTime();
  return endMs < grEndMs ? grEndMs : endMs;
}
