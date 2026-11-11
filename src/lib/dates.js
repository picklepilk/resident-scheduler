// src/lib/dates.js
// Pure date helpers extracted from ResidentScheduler.jsx's UTILITIES section.
// No React, no side effects at import time — safe to unit-test in isolation.

// Guards against Invalid Date (isNaN getTime) — toISOString() throws RangeError on those,
// which without this guard propagates up through every date-math caller as an unhandled crash.
// PERF: these three are called millions of times per generateScheduleBest (profile: ~54% of self
// time, mostly Date construction in local-tz and toISOString). Results are memoized by input
// (string / epoch ms); every call still returns a FRESH Date, so callers that mutate the result
// (setDate etc.) cannot corrupt the cache. Caches are bounded (cleared wholesale past CACHE_MAX).
const CACHE_MAX = 50000;
const _toDateStrCache = new Map();   // epoch ms -> 'YYYY-MM-DD' | null
const _parseDateCache = new Map();   // 'YYYY-MM-DD' -> epoch ms (NaN for invalid)
const _addDaysCache = new Map();     // n -> Map<epoch ms, epoch ms>
export function toDateStr(d) {
  const t = d.getTime();
  let v = _toDateStrCache.get(t);
  if (v === undefined) {
    v = isNaN(t) ? null : d.toISOString().slice(0, 10);
    if (_toDateStrCache.size >= CACHE_MAX) _toDateStrCache.clear();
    _toDateStrCache.set(t, v);
  }
  return v;
}
export function parseDate(s) {
  if (typeof s !== 'string') { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
  let ms = _parseDateCache.get(s);
  if (ms === undefined) {
    const [y,m,d] = s.split('-').map(Number);
    ms = new Date(y, m-1, d).getTime();
    if (_parseDateCache.size >= CACHE_MAX) _parseDateCache.clear();
    _parseDateCache.set(s, ms);
  }
  return new Date(ms);
}
export function addDays(d, n) {
  const t = d.getTime();
  let byN = _addDaysCache.get(n);
  if (byN === undefined) { byN = new Map(); _addDaysCache.set(n, byN); }
  let ms = byN.get(t);
  if (ms === undefined) {
    const r = new Date(d); r.setDate(r.getDate() + n); ms = r.getTime();
    if (byN.size >= CACHE_MAX) byN.clear();
    byN.set(t, ms);
  }
  return new Date(ms);
}

// 'YYYY-MM-DD' -> whole days since the Unix epoch (UTC, so DST-proof); null for anything else.
export function isoDayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000 : null;
}

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
