// src/lib/offServiceWindow.js
// Pure day-math for the "straddle" visual: how much of an off-service resident's own ER rotation
// window (offServiceWindowStatus's `ranges` field — the resident's real, possibly block-straddling
// availableRanges, UNCLAMPED since the 2026-10-14 ImportMatrixModal fix) falls OUTSIDE the block
// that's currently open. offServiceWindowStatus already answers "what's the target adjustment";
// this answers the display-only question "how many days, which direction" so the 3 call sites
// (Off-Service tab tile, Schedule grid row, ResidentCard — see OffServiceStraddleBadge in
// ResidentScheduler.jsx) can't compute it three slightly different ways.
//
// Dates are ISO strings (YYYY-MM-DD) throughout — lexicographic compare is safe, same convention
// offServiceWindowStatus itself relies on. No React, no side effects at import time.

import { parseDate, addDays, toDateStr } from './dates.js';

const DAY_MS = 86_400_000;
const dayCount = (startStr, endStr) => Math.round((parseDate(endStr) - parseDate(startStr)) / DAY_MS) + 1;
const prevDay = ds => toDateStr(addDays(parseDate(ds), -1));
const nextDay = ds => toDateStr(addDays(parseDate(ds), 1));
const plural = n => (n === 1 ? 'day' : 'days');

// ranges: the array offServiceWindowStatus returns as `status.ranges` (already filtered to
// start/end present and start<=end). blockStart/blockEnd: the open block's startDate/endDate.
// Returns null when nothing straddles (ranges empty/absent, or every range sits fully inside the
// block — the common case). Otherwise { daysBefore, daysAfter, label }.
export function offServiceStraddle(ranges, blockStart, blockEnd) {
  if (!Array.isArray(ranges) || !ranges.length || !blockStart || !blockEnd) return null;
  let daysBefore = 0;
  let daysAfter = 0;
  for (const rg of ranges) {
    if (!rg?.start || !rg?.end || rg.start > rg.end) continue;
    if (rg.start < blockStart) {
      const before = rg.end < blockStart ? rg.end : prevDay(blockStart);
      daysBefore += dayCount(rg.start, before);
    }
    if (rg.end > blockEnd) {
      const after = rg.start > blockEnd ? rg.start : nextDay(blockEnd);
      daysAfter += dayCount(after, rg.end);
    }
  }
  if (daysBefore <= 0 && daysAfter <= 0) return null;

  let label;
  if (daysBefore > 0 && daysAfter > 0) {
    label = `← ${daysBefore} ${plural(daysBefore)} before · ${daysAfter} ${plural(daysAfter)} after →`;
  } else if (daysAfter > 0) {
    label = `ER window continues → ${daysAfter} ${plural(daysAfter)} after this block`;
  } else {
    label = `← ${daysBefore} ${plural(daysBefore)} before this block`;
  }
  return { daysBefore, daysAfter, label };
}
