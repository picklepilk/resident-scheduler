// src/lib/journalClub.js
// Journal Club date helpers. JC dates were formerly derived-only (the first Tuesday of every
// month), fixed by the calendar with no chief input. They're now chief-overridable per academic
// year via ayData[AY].jcDates — a stored list wins over derivation, but an AY with no stored list
// (absent key, or a value that isn't a valid array) still derives the plain first-Tuesday
// schedule exactly as before, so every AY that predates this feature (and any new AY the chief
// hasn't touched yet) keeps working with zero migration.

import { parseDate, toDateStr, addDays, ayWindowFor, getAcademicYearFor } from './dates.js';

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

// Resolves the full list of Journal Club dates for one academic year: the chief's stored
// override if present (even if explicitly empty), otherwise every first Tuesday in the AY's
// July-to-July window. opts.fallbackDateStr lets a caller holding only a raw date (not an AY
// string) still resolve — used by isJcDate-style call sites that only know "this date," via
// getAcademicYearFor.
export function resolveJcDates(ayString, ayConf, opts = {}) {
  let win = ayWindowFor(ayString);
  if (!win && opts.fallbackDateStr) win = ayWindowFor(getAcademicYearFor(opts.fallbackDateStr));
  if (!win) return [];

  const stored = validStoredList(ayConf?.jcDates);
  if (stored) return sortedDedupedDates(stored);

  // ayWindowFor's end is exclusive (next AY's July 1) — getFirstTuesdaysInRange is inclusive,
  // so back the range up one day or a first-Tuesday July 1 of the NEXT AY would leak in.
  const lastDay = toDateStr(addDays(parseDate(win.end), -1));
  return sortedDedupedDates(getFirstTuesdaysInRange(win.start, lastDay));
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

// For validators that legitimately see dates spanning MULTIPLE academic years (a resident's
// jcPresentDates accumulates across years, unlike a single generated block). Derives the date's
// own AY, then resolves against that AY's entry in ayData — falling through to DERIVED first
// Tuesdays (never []) when ayData has no entry for that AY, so a historical presenting date from
// before this feature existed (or from an AY the chief never customized) still validates
// correctly instead of reading as invalid.
export function isJcDateAnyAy(dateStr, ayData) {
  const ay = getAcademicYearFor(dateStr);
  return resolveJcDates(ay, ayData?.[ay]).includes(dateStr);
}
