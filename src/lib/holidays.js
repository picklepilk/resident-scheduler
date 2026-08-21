// src/lib/holidays.js
// Named holiday dates, chief-editable per academic year (ayData[AY].holidays), plus the pure
// counting helpers the quality scorer / generator / Validation card all read through. No React,
// no side effects at import time; imports only sibling src/lib modules (never
// ResidentScheduler.jsx, which imports lib/* the other direction — circular).
//
// WHY THIS EXISTS
// Who works Thanksgiving / Christmas / New Year's is the single most politically charged fact in
// a residency schedule, and until now the app had no concept of a holiday at all. A holiday is
// modelled as a NAMED, possibly MULTI-DAY entry ({name, start, end}) rather than a bare date list
// (the shape jcDates uses), because "Christmas" is one thing the chief reasons about even though
// it spans Dec 24-25, and the Validation card has to be able to say "Christmas: Rivera (POD-N)"
// rather than listing two unlabelled dates.
//
// ── ABSENT CONFIG DERIVES NOTHING ───────────────────────────────────────────────────────────────
// This is the ONE place this module deliberately departs from journalClub.js's convention. There,
// an absent ayData[AY].jcDates DERIVES first Tuesdays, because Journal Club always existed and
// deriving reproduced the previous hardcoded behavior exactly. Here, an absent ayData[AY].holidays
// resolves to [] — NOT to defaultUsHolidays(). Deriving by default would retroactively invent
// holiday obligations for every academic year already saved, silently move the generator's
// scoring and every committed quality baseline, and assert a US federal calendar the chief never
// approved (a program may not treat Memorial Day as a real holiday at all). The chief opts in
// explicitly via the editor's "Add US defaults" button, which materializes defaultUsHolidays()
// into a real stored, editable, deletable list.
//
// The strict consequence, relied on by the quality baselines and asserted in holidays.test.js:
// with no stored holidays, holidayDateSet()/holidayDatesInRange() are EMPTY, so the holidaySpread
// metric is exactly 0, the score() holidayEquity term is exactly 0, and nothing about generation
// or selection changes. Holiday support is inert until turned on.
//
// ── TIME OFF ON A HOLIDAY IS "UNAVAILABLE", NOT "SPARED" (documented choice) ────────────────────
// A resident whose vacationDates/approvedDatesOff covers a holiday simply cannot be assigned that
// day — the existing hard-off machinery in getEligibleShifts handles that, and this module needs
// no special case for it. They are NOT credited with having "had the holiday off" in any ledger,
// and they are NOT excluded from the equity population. Their holiday-worked count for that date
// is 0, which lowers their AY holiday total, which makes the equity terms steer the NEXT holiday
// toward them. That is the intended behavior: over an academic year, being off for Thanksgiving
// is exactly what should make you a stronger candidate for Christmas — the opposite of treating
// approved time off as a free pass that also earns credit.

import { parseDate, addDays, ayWindowFor } from './dates.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Local-calendar YYYY-MM-DD. Deliberately NOT dates.js's toDateStr, which goes through
// toISOString() (UTC) — the same reason getAcademicYear() reads local Y/M/D directly (see its
// comment in dates.js). Every date this module MANUFACTURES (the derived US defaults, range
// expansion) is built from local components so a timezone ahead of UTC can't shift Christmas to
// Christmas Eve.
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Nth (1-based) occurrence of `weekday` (0=Sun) in the given month. n=1 → first, n=4 → fourth.
function nthWeekdayOfMonth(year, monthIdx, weekday, n) {
  const first = new Date(year, monthIdx, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, monthIdx, 1 + offset + (n - 1) * 7);
}

// Last occurrence of `weekday` in the given month (Memorial Day = last Monday in May).
function lastWeekdayOfMonth(year, monthIdx, weekday) {
  const last = new Date(year, monthIdx + 1, 0); // day 0 of next month = last day of this one
  const back = (last.getDay() - weekday + 7) % 7;
  return new Date(year, monthIdx, last.getDate() - back);
}

// A sensible starting point for a US academic year, offered by the editor — never applied
// automatically (see the header). July 4 / Labor / Thanksgiving / Christmas Eve+Day fall in the
// AY's FIRST calendar year; New Year's spans the boundary; Memorial Day falls in the second.
// Returns [] for an unparseable AY string rather than guessing a year.
export function defaultUsHolidays(ayString) {
  const win = ayWindowFor(ayString);
  if (!win) return [];
  const y1 = Number(win.start.slice(0, 4)); // July of the AY's first calendar year
  const y2 = y1 + 1;
  const one = (id, name, d) => ({ id: `${id}_${ayString}`, name, start: ymd(d), end: ymd(d) });
  return [
    one('july4', 'Independence Day', new Date(y1, 6, 4)),
    one('labor', 'Labor Day', nthWeekdayOfMonth(y1, 8, 1, 1)),
    one('thanksgiving', 'Thanksgiving', nthWeekdayOfMonth(y1, 10, 4, 4)),
    { id: `christmas_${ayString}`, name: 'Christmas Eve & Day', start: `${y1}-12-24`, end: `${y1}-12-25` },
    { id: `newyears_${ayString}`, name: "New Year's Eve & Day", start: `${y1}-12-31`, end: `${y2}-01-01` },
    one('memorial', 'Memorial Day', lastWeekdayOfMonth(y2, 4, 1)),
  ];
}

// Untrusted-shape normalizer for one stored holiday entry (JSON backup / cloud row / hand-edited
// localStorage — this repo's standing convention that anything read back is untrusted). Returns
// null for anything unusable rather than a half-valid object. A missing/blank/backwards `end` is
// treated as a single-day holiday rather than dropped: `start` alone is a complete holiday, and a
// reversed range is far more likely a typo in the editor than an intent to span backwards.
export function normalizeHoliday(v, index = 0) {
  if (!v || typeof v !== 'object') return null;
  const start = typeof v.start === 'string' && DATE_RE.test(v.start) ? v.start : null;
  if (!start) return null;
  const rawEnd = typeof v.end === 'string' && DATE_RE.test(v.end) ? v.end : null;
  const end = rawEnd && rawEnd >= start ? rawEnd : start;
  const name = typeof v.name === 'string' && v.name.trim() ? v.name.trim() : 'Holiday';
  const id = typeof v.id === 'string' && v.id ? v.id : `h${index}_${start}`;
  return { id, name, start, end };
}

// The AY's holiday list: normalized, junk dropped, sorted by start date. An absent (or non-array)
// ayConf.holidays returns [] — it does NOT derive defaults. See the header.
export function resolveHolidays(ayConf) {
  const raw = ayConf?.holidays;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h, i) => normalizeHoliday(h, i))
    .filter(Boolean)
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
}

// Every date a holiday covers, inclusive of both ends. Bounded at 31 days so a hand-edited or
// corrupted end date (e.g. a year typo) can't spin a huge loop or swallow a whole block.
export function expandHolidayDates(h) {
  const norm = normalizeHoliday(h);
  if (!norm) return [];
  const out = [];
  let cur = parseDate(norm.start);
  const last = parseDate(norm.end);
  if (isNaN(cur.getTime()) || isNaN(last.getTime())) return [];
  while (cur <= last && out.length < 31) { out.push(ymd(cur)); cur = addDays(cur, 1); }
  return out;
}

// Set of every holiday date in the AY. Empty when nothing is configured — the no-op guarantee.
export function holidayDateSet(ayConf) {
  const set = new Set();
  for (const h of resolveHolidays(ayConf)) for (const ds of expandHolidayDates(h)) set.add(ds);
  return set;
}

export function isHolidayDate(dateStr, ayConf) {
  return holidayDateSet(ayConf).has(dateStr);
}

// Holidays with at least one date inside [startStr, endStr] inclusive, each carrying only the
// `dates` that actually fall in range — a holiday straddling a block boundary reports just its
// in-block half, so the Validation card never claims coverage of a date this block doesn't own.
export function holidaysInRange(startStr, endStr, ayConf) {
  if (!startStr || !endStr) return [];
  const out = [];
  for (const h of resolveHolidays(ayConf)) {
    const dates = expandHolidayDates(h).filter(d => d >= startStr && d <= endStr);
    if (dates.length) out.push({ ...h, dates });
  }
  return out;
}

// Flat, sorted, deduped date list for [startStr, endStr] — what the generator and the quality
// scorer consume (both only ever need "is this date a holiday", never which holiday it is).
export function holidayDatesInRange(startStr, endStr, ayConf) {
  const set = new Set();
  for (const h of holidaysInRange(startStr, endStr, ayConf)) for (const ds of h.dates) set.add(ds);
  return [...set].sort();
}

// Name of the holiday a date falls on, or null. For surfaces that legitimately see dates spanning
// MULTIPLE academic years — the day-off request queue accumulates requests across years, exactly
// like isJcDateAnyAy's callers. Derives the date's own AY and looks only in that AY's list; unlike
// isJcDateAnyAy there is no derived fallback, because an AY the chief never configured genuinely
// has no holidays (see the header).
export function holidayNameForDateAnyAy(dateStr, ayData) {
  if (!dateStr || !ayData) return null;
  // Inlined rather than importing getAcademicYearFor, to keep this module's date handling on its
  // own local-calendar footing (see ymd above): AY rolls over on July 1.
  const [y, m] = dateStr.split('-').map(Number);
  if (!y || !m) return null;
  const startYear = m >= 7 ? y : y - 1;
  const ay = `AY${String(startYear).slice(2)}/${String(startYear + 1).slice(2)}`;
  for (const h of resolveHolidays(ayData[ay])) {
    if (expandHolidayDates(h).includes(dateStr)) return h.name;
  }
  return null;
}

// How many holiday shifts one resident works, given their schedule row and a Set of holiday dates.
//
// DEFINITION (deliberate, matches the chief's mental model): a shift COUNTS if it is assigned to a
// holiday DATE — which is to say, if it STARTS on the holiday. `schedule[rid][ds]` is keyed by the
// shift's start date throughout this app, so this needs no shift-timing logic: a night shift
// starting Christmas Day counts as a Christmas shift even though most of its hours land on the
// 26th, and a night shift starting Dec 26 does not, even though it began three hours after
// Christmas ended. Anything else (crediting overlap hours, half-credit for a spanning night)
// would disagree with how residents actually talk about "working Christmas".
export function countHolidayShifts(residentSchedule, holidayDates) {
  if (!residentSchedule || !holidayDates || !holidayDates.size) return 0;
  let n = 0;
  for (const ds of holidayDates) if (residentSchedule[ds]) n++;
  return n;
}

// Per-holiday roster for the Validation card: who is on which shift for each holiday date in the
// block. Pure so it can be tested without rendering. `shiftLabelFor` is injected rather than
// imported from shifts.js so the caller controls label formatting (and so this module keeps a
// single, narrow dependency surface).
export function buildHolidayRoster({ schedule = {}, residents = [], startDate, endDate, ayConf, shiftLabelFor = sid => sid }) {
  return holidaysInRange(startDate, endDate, ayConf).map(h => ({
    ...h,
    days: h.dates.map(ds => ({
      date: ds,
      assignments: residents
        .filter(r => schedule[r.id]?.[ds])
        // Displayed "First Last" (how the rest of the report surfaces read) but sorted by LAST
        // name — the order a chief scans a roster in. Sorting on the display string instead would
        // silently order by first name.
        .map(r => ({
          residentId: r.id,
          name: `${r.firstName} ${r.lastName}`,
          sortKey: `${r.lastName || ''}, ${r.firstName || ''}`,
          shiftId: schedule[r.id][ds],
          shiftLabel: shiftLabelFor(schedule[r.id][ds]),
        }))
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
    })),
  }));
}
