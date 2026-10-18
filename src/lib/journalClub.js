// src/lib/journalClub.js
// Journal Club date helpers. JC dates are CHIEF-LOGGED per academic year in ayData[AY].jcDates
// (see lib/ruleDates.js). They used to be derived (first Tuesday of every month) when no list was
// stored; as of 2026-10-18 an absent list means NO dates. The first-Tuesday math survives only as a
// suggester (getFirstTuesdaysInRange) and in the one-time migration that materialized the old
// derived dates into stored lists.

import { parseDate, toDateStr, getAcademicYearFor } from './dates.js';

// Preserved verbatim from ResidentScheduler.jsx's CIRCADIAN/JOURNAL CLUB section.
export function isFirstTuesday(dateStr) {
  const d = parseDate(dateStr);
  return d.getDay() === 2 && d.getDate() <= 7;
}

// Preserved verbatim (inclusive both ends).
export function getFirstTuesdaysInRange(startStr, endStr) {
  if (!startStr || !endStr) return [];
  const result = [];
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  let month = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (month <= lastMonth) {
    const d = new Date(month);
    while (d.getDay() !== 2) d.setDate(d.getDate() + 1); // advance to Tuesday
    if (d >= start && d <= end) result.push(toDateStr(d));
    month.setMonth(month.getMonth() + 1);
  }
  return result;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sortedDedupedDates(list) {
  return Array.from(new Set(list)).sort();
}

// Untrusted-shape filter for a stored jcDates value (JSON backup / cloud row / hand-edited
// localStorage). Returns null if the value isn't an array at all — the caller treats null as
// "no stored list, derive instead." An array that IS present but filters down to zero valid
// entries (including an already-empty array) is a real answer, not a signal to derive.
function validStoredList(v) {
  if (!Array.isArray(v)) return null;
  return v.filter(x => typeof x === 'string' && DATE_RE.test(x));
}

// Resolves the chief-logged Journal Club dates for one academic year (absent/invalid = []).
// opts.fallbackDateStr is kept for call-site compatibility; the AY is no longer needed to derive,
// so it is unused.
export function resolveJcDates(ayString, ayConf, opts = {}) { // eslint-disable-line no-unused-vars
  return sortedDedupedDates(validStoredList(ayConf?.jcDates) || []);
}

// resolveJcDates(...) clipped to [startStr, endStr] inclusive. Plain string compare is safe here
// since every date is YYYY-MM-DD (lexicographic order matches chronological order).
export function jcDatesInRange(startStr, endStr, ayString, ayConf, opts = {}) {
  if (!startStr || !endStr) return [];
  return resolveJcDates(ayString, ayConf, opts).filter(d => d >= startStr && d <= endStr);
}

// Membership test against resolveJcDates(...). Called from hot generator paths (per candidate,
// per slot) — no module-level cache here (the caller hoists resolveJcDates's result once per
// day/pass if it needs to avoid recomputation); a plain array + includes is cheap enough for the
// list sizes involved (well under a hundred dates per AY).
export function isJcDate(dateStr, ayString, ayConf, opts = {}) {
  return resolveJcDates(ayString, ayConf, opts).includes(dateStr);
}

// For validators that see dates spanning MULTIPLE academic years (a resident's jcPresentDates
// accumulates across years): resolves against the date's own AY entry in ayData.
export function isJcDateAnyAy(dateStr, ayData) {
  const ay = getAcademicYearFor(dateStr);
  return resolveJcDates(ay, ayData?.[ay]).includes(dateStr);
}
