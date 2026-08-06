// src/lib/dates.js
// Pure date helpers extracted from ResidentScheduler.jsx's UTILITIES section.
// No React, no side effects at import time — safe to unit-test in isolation.

// Guards against Invalid Date (isNaN getTime) — toISOString() throws RangeError on those,
// which without this guard propagates up through every date-math caller as an unhandled crash.
export function toDateStr(d) { return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
export function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
export function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// M/d/yyyy (4-digit year) — QGenda's CSV importer rejects prettyDate's M/d/yy (2-digit year)
// with "Date must be in M/d/yyyy format". Scoped to the QGenda export only; every on-screen UI
// date label keeps using prettyDate (ResidentScheduler.jsx) — do not repoint those here.
export function qgendaDate(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export function formatAY(startYear) { return `AY${String(startYear).slice(2)}/${String(startYear+1).slice(2)}`; }
export function getAcademicYearFor(dateStr) {
  const d = parseDate(dateStr);
  return formatAY(d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1);
}
// NOT delegated to getAcademicYearFor(toDateStr(new Date())) — toDateStr uses toISOString (UTC),
// which would round-trip "now" through the wrong calendar day for any timezone behind UTC
// (e.g. US evenings) right around the July 1 AY boundary. Read local Y/M/D directly instead.
export function getAcademicYear() {
  const now = new Date();
  return formatAY(now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1);
}

export function getBlockDates(start, end) {
  if (!start || !end) return [];
  let cur = parseDate(start); const last = parseDate(end);
  if (isNaN(cur.getTime()) || isNaN(last.getTime())) return [];
  const dates = [];
  while (cur <= last) { dates.push(toDateStr(cur)); cur = addDays(cur, 1); }
  return dates;
}

// Full Saturday+Sunday weekend pairs fully contained within a block's date range (a weekend
// straddling the block's edge, with only one of the two days inside, is excluded — not a
// resident's fault, and the adjacent block may cover the other half). Shared by generateSchedule
// (soft nudge) and validateAll (warning) so "one full weekend off" can't drift between the two.
export function getBlockWeekends(dates) {
  const dateSet = new Set(dates);
  const weekends = [];
  for (const ds of dates) {
    if (parseDate(ds).getDay() === 6) {
      const sun = toDateStr(addDays(parseDate(ds), 1));
      if (dateSet.has(sun)) weekends.push([ds, sun]);
    }
  }
  return weekends;
}

// July 1 - July 1 window for an "AY26/27"-style academic-year string (see formatAY). Assumes the
// 2000s century, which covers this app's realistic date range.
export function ayWindowFor(ayString) {
  const m = /^AY(\d{2})\/(\d{2})$/.exec(ayString || '');
  if (!m) return null;
  const startYear = 2000 + parseInt(m[1], 10);
  return { start: `${startYear}-07-01`, end: `${startYear + 1}-07-01` };
}
