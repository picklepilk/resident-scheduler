// src/lib/qgendaImport.js
// Reads a QGenda "Grid By Staff" .xlsx export back INTO this app — the inverse of the CSV export
// in ./qgenda.js. Pure: no React, no ResidentScheduler.jsx import (lib module rule, see CLAUDE.md).
//
// WHY THIS EXISTS: the chief builds the real schedule in QGenda, and until now the app had no way
// to read it. That made his own best block unavailable for comparison against generated output,
// and made the roster something he had to re-key by hand.
//
// SHAPE OF THE WORKBOOK (verified against the real 7/27/2026-8/23/2026 export):
//   row 0   "UT Health San Antonio"                 <- title, ignored
//   row 1   "Printed: ..."                          <- ignored
//   row 3   ''  'Jul-26' '' '' '' '' 'Aug-26' ...   <- MONTH BAND, sparse: only where month changes
//   row 4   ''  27 28 29 30 31 1 2 3 ...            <- DAY NUMBERS, one per date column
//   row 5   ''  Mon Tue Wed Thu Fri Sat Sun ...     <- day-of-week
//   rows 6+ 'Last, First' | task | task | ...       <- one row per person
// The person rows include ~158 attendings and section markers with no assignments at all; those
// are filtered by "has at least one non-blank date cell", never by a hardcoded row number, since
// the attending list changes length every export.
import { QGENDA_TASKS } from './qgenda.js';
import { splitName } from './parse.js';
import { stripNameSuffix, matchRosterByName } from './nameMatch.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Jeopardy call rows. These are a TRACK, not a clinical shift — they must never land in
// block.schedule, because validateAll hard-errors a clinical shift on a jeopardy date under every
// policy but 'off' (see CLAUDE.md, "Jeopardy may never collide with a clinical shift"). Routing
// them into the schedule would manufacture one hard error per cell.
export const RES_CALL_RE = /^res[_\s]*call\s*pgy\s*([123])$/i;

// QGenda matches task names exactly, but a human re-exporting next year may not reproduce the
// casing or the '*' prefix character-for-character. The reverse lookup is therefore keyed on a
// normalized form so IMPORT stays tolerant even though EXPORT stays byte-exact.
export function normalizeTaskName(raw) {
  return String(raw ?? '').trim().replace(/^\*+/, '').replace(/\s+/g, ' ').toLowerCase();
}

// Derived from QGENDA_TASKS so ./qgenda.js remains the single source of truth for task names —
// a hand-maintained second copy here is exactly how import and export drift apart.
// TRAUMA-D is a function of the resident's PGY, so both of its outputs are registered.
export const QGENDA_TASK_TO_SHIFT = (() => {
  const map = new Map();
  for (const [shiftId, entry] of Object.entries(QGENDA_TASKS)) {
    const names = typeof entry === 'function' ? [1, 2, 3].map(pgy => entry({ pgy })) : [entry];
    for (const name of names) {
      const key = normalizeTaskName(name);
      if (key) map.set(key, shiftId);
    }
  }
  return map;
})();

// Only the intern variant of Trauma Day tells us a PGY. Derived from the same map so the two
// can't disagree about which string means "intern".
const TRAUMA_INTERN_KEY = normalizeTaskName(
  typeof QGENDA_TASKS['TRAUMA-D'] === 'function' ? QGENDA_TASKS['TRAUMA-D']({ pgy: 1 }) : '');

function cell(row, i) { return String(row?.[i] ?? '').trim(); }

// 'Jul-26' / 'Jul 26' / 'July 2026' -> {month: 0-11, year: 2026}. Returns null for anything else,
// which is what makes the month-band row safe to scan blindly.
export function parseMonthBandCell(raw) {
  const m = /^([A-Za-z]{3,})[-\s/]*(\d{2,4})$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return null;
  return { month, year: n < 100 ? 2000 + n : n };
}

// Built by hand rather than via toDateStr(new Date(...)): toDateStr goes through toISOString,
// which shifts the date by a day for any viewer at a positive UTC offset. The workbook gives us
// plain integers, so there is no reason to round-trip through a Date at all.
function isoFrom(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const DOW_RE = /^(sun|mon|tue|wed|thu|fri|sat)/i;
const DOW_INDEX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function countDayNumbers(row) {
  let count = 0;
  for (let c = 1; c < (row?.length ?? 0); c++) {
    const v = cell(row, c);
    if (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 31) count++;
  }
  return count;
}

function countDowCells(row) {
  let count = 0;
  for (let c = 1; c < (row?.length ?? 0); c++) if (DOW_RE.test(cell(row, c))) count++;
  return count;
}

// Locates the day-number row by CONTENT, not position — the preamble rows are report chrome and
// are not guaranteed to stay put across QGenda template changes.
//
// The primary signature is "a row of day numbers with a row of weekday names directly beneath
// it", which is far more specific than day numbers alone: a printed date, a page number, or a
// count column can all look like small integers, but only the real header has Mon/Tue/Wed under
// it. The bare-numbers rule is kept as a fallback for an export that somehow omits the DOW row.
function findDayNumberRow(rows) {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    if (countDayNumbers(rows[i]) >= 3 && countDowCells(rows[i + 1]) >= 3) return i;
  }
  for (let i = 0; i < limit; i++) {
    if (countDayNumbers(rows[i]) >= 7) return i;
  }
  return -1;
}

// Walks the day-number row left to right, taking month/year from the sparse band row above it and
// rolling the month forward on any backward day jump the band did not already announce. Both
// mechanisms are needed: the band marks 'Aug-26' at the column where August starts, but a block
// beginning mid-month has no band cell at its first column, and the year only ever changes
// implicitly (Dec -> Jan).
export function resolveDateColumns(rows) {
  const dayRow = findDayNumberRow(rows);
  if (dayRow < 0) return { dates: {}, dayRow: -1, error: 'No day-number header row found' };
  const bandRow = dayRow > 0 ? rows[dayRow - 1] : [];

  const width = Math.max(rows[dayRow]?.length ?? 0, bandRow?.length ?? 0);
  let cur = null, prevDay = null;
  const dates = {};
  for (let c = 1; c < width; c++) {
    const band = parseMonthBandCell(cell(bandRow, c));
    if (band) { cur = { ...band }; prevDay = null; }
    const dayStr = cell(rows[dayRow], c);
    if (!/^\d{1,2}$/.test(dayStr)) continue;
    const day = Number(dayStr);
    if (!cur) continue;                       // day numbers before any month band -> unusable
    if (prevDay != null && day < prevDay) {   // rolled into the next month with no band cell
      cur.month += 1;
      if (cur.month > 11) { cur.month = 0; cur.year += 1; }
    }
    dates[c] = isoFrom(cur.year, cur.month, day);
    prevDay = day;
  }

  // Cross-check every resolved date against the weekday the export itself printed. The month/year
  // walk above is inference — a missing band cell or an unexpected column layout could silently
  // shift a whole block by a month or a year, and every downstream date would still LOOK valid.
  // The DOW row is independent evidence, so a disagreement is reported rather than assumed away.
  // new Date(y, m, d) is local-midnight and .getDay() reads it back locally, so this never
  // round-trips through UTC (see isoFrom above for the same reason).
  const dowRow = rows[dayRow + 1];
  const dowMismatches = [];
  if (countDowCells(dowRow) >= 3) {
    for (const [c, iso] of Object.entries(dates)) {
      const printed = cell(dowRow, Number(c)).slice(0, 3).toLowerCase();
      if (!DOW_RE.test(printed)) continue;
      const [y, m, d] = iso.split('-').map(Number);
      const actual = DOW_INDEX[new Date(y, m - 1, d).getDay()];
      if (actual !== printed) dowMismatches.push({ column: Number(c), date: iso, printed, actual });
    }
  }

  return {
    dates, dayRow, dowMismatches,
    error: Object.keys(dates).length ? null : 'No date columns resolved',
  };
}

// rows: the sheet as sheet_to_json(..., {header:1, raw:false, defval:''}) gives it.
// Returns { dates, entries, unknownTasks, error }.
//   dates        - ISO strings in column order
//   entries      - one per person row that has at least one assignment
//   unknownTasks - [{task, count}] for every cell string that is neither a known task nor
//                  Res_Call. Surfaced to the chief rather than dropped silently: an unrecognized
//                  task is a real shift the import is about to lose, and a silent loss shows up
//                  later as an unexplained coverage hole.
export function parseQGendaGrid(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const { dates: dateByCol, dayRow, dowMismatches, error } = resolveDateColumns(list);
  if (error) return { dates: [], entries: [], unknownTasks: [], dowMismatches: [], error };

  const cols = Object.keys(dateByCol).map(Number).sort((a, b) => a - b);
  const dates = cols.map(c => dateByCol[c]);

  const unknown = new Map();
  const entries = [];
  for (let i = dayRow + 1; i < list.length; i++) {
    const row = list[i];
    const rawName = cell(row, 0);
    if (!rawName) continue;
    const shifts = [], jeopardyDates = [];
    let inferredPgy = null;
    for (const c of cols) {
      const raw = cell(row, c);
      if (!raw) continue;
      const call = RES_CALL_RE.exec(raw);
      if (call) {
        jeopardyDates.push(dateByCol[c]);
        if (inferredPgy == null) inferredPgy = Number(call[1]);
        continue;
      }
      const key = normalizeTaskName(raw);
      const shiftId = QGENDA_TASK_TO_SHIFT.get(key);
      if (!shiftId) { unknown.set(raw, (unknown.get(raw) ?? 0) + 1); continue; }
      if (key === TRAUMA_INTERN_KEY && inferredPgy == null) inferredPgy = 1;
      shifts.push({ date: dateByCol[c], shiftId });
    }
    // Attendings, "MD OPEN", and the section-marker rows all land here.
    if (!shifts.length && !jeopardyDates.length) continue;
    entries.push({ rowIndex: i, rawName, shifts, jeopardyDates, inferredPgy });
  }

  return {
    dates,
    entries,
    unknownTasks: [...unknown.entries()]
      .map(([task, count]) => ({ task, count }))
      .sort((a, b) => b.count - a.count || a.task.localeCompare(b.task)),
    dowMismatches: dowMismatches ?? [],
    error: null,
  };
}

// Reconciles a parsed grid against the existing roster. The {matched, unmatched} vocabulary
// deliberately mirrors parseVacationWorkbook's preview shape so the two import modals read the
// same way. A name with more than one roster candidate is AMBIGUOUS and is never auto-resolved —
// guessing writes one resident's shifts onto their namesake with nothing downstream able to
// detect it.
export function buildQGendaImport(parsed, roster) {
  const matched = [], unmatched = [];
  for (const entry of parsed?.entries ?? []) {
    const name = splitName(stripNameSuffix(entry.rawName));
    if (!name) {
      unmatched.push({ ...entry, reason: 'Could not parse "Last, First" name', candidates: [] });
      continue;
    }
    const base = { ...entry, firstName: name.firstName, lastName: name.lastName };
    const hits = matchRosterByName(name.firstName, name.lastName, roster);
    if (hits.length === 0) {
      unmatched.push({ ...base, reason: 'No roster match', candidates: [] });
    } else if (hits.length > 1) {
      unmatched.push({
        ...base,
        reason: 'Ambiguous — multiple roster matches',
        candidates: hits.map(c => `${c.lastName}, ${c.firstName} (PGY-${c.pgy})`),
      });
    } else {
      matched.push({ ...base, residentId: hits[0].id, rosterName: `${hits[0].lastName}, ${hits[0].firstName}` });
    }
  }
  const dates = parsed?.dates ?? [];
  return {
    matched, unmatched,
    unknownTasks: parsed?.unknownTasks ?? [],
    dowMismatches: parsed?.dowMismatches ?? [],
    dates,
    dateRange: dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null,
  };
}

// Folds entries into the {residentId: {dateStr: shiftId}} shape block.schedule uses.
// Jeopardy dates are deliberately NOT included — see RES_CALL_RE above.
export function buildScheduleFromImport(entries) {
  const schedule = {};
  for (const m of entries ?? []) {
    if (!m.residentId || !m.shifts?.length) continue;
    const row = schedule[m.residentId] ?? (schedule[m.residentId] = {});
    for (const s of m.shifts) row[s.date] = s.shiftId;
  }
  return schedule;
}
