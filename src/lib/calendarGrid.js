// Pure calendar-month grid helpers for the Schedule tab's Month / Per-Resident-Month views
// (ResidentScheduler.jsx). A lib module may never import ResidentScheduler.jsx (see CLAUDE.md), so
// this duplicates the same padded-week algorithm as that file's own `buildWeekRows` (used by the
// block-date-range Calendar view) rather than importing it — verified identical output for a
// contiguous date list, the only shape both callers ever pass.

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Pads and chunks a flat list of ISO date strings into Sunday-start week rows, padding the first
// and last week with `null` placeholders so every row has exactly 7 cells.
export function paddedCalendarWeeks(dates) {
  if (!dates || !dates.length) return [];
  const pad = new Date(dates[0] + 'T00:00:00').getDay();
  const padded = [...Array(pad).fill(null), ...dates];
  while (padded.length % 7 !== 0) padded.push(null);
  const rows = [];
  for (let i = 0; i < padded.length; i += 7) rows.push(padded.slice(i, i + 7));
  return rows;
}

// Every ISO date string in a given calendar month. `month` is 1-indexed (matches the
// `getMonth()+1` convention used throughout ResidentScheduler.jsx), not JS Date's native 0-index.
export function monthDates(year, month) {
  const out = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    out.push(toDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// { year, month } for every calendar month overlapping [startDate, endDate] (inclusive ISO date
// strings), in order. Used to bound month-view prev/next navigation to months the block actually
// touches. Returns [] for a missing/invalid range.
export function monthsInRange(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const out = [];
  let y = start.getFullYear(), m = start.getMonth() + 1;
  const endY = end.getFullYear(), endM = end.getMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function sameMonth(a, b) {
  return !!a && !!b && a.year === b.year && a.month === b.month;
}
