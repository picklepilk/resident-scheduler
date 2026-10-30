// src/lib/qgendaCalendarParse.js
// Reads a QGenda "Calendar By Task" CSV export (weekly grid) into flat rows, and maps those rows
// onto this app's shift ids / roster. Pure: no React, no ResidentScheduler.jsx import.
//
// Layout (verified against a real export): per week, a weekday-name row, a date row
// ("November 16, 2026" in every even column), then one row per assignment where each day owns two
// columns: [task name][assignee "Last, First"]. Weeks repeat down the sheet.
//
// Task-name mapping and name matching are REUSED, not re-implemented: qgendaImport.js owns the
// reverse of QGENDA_TASKS (QGENDA_TASK_TO_SHIFT) and nameMatch.js owns the roster matcher.
import { QGENDA_TASK_TO_SHIFT, normalizeTaskName, RES_CALL_RE } from './qgendaImport.js';
import { splitName } from './parse.js';
import { stripNameSuffix, matchRosterByName, nameTokenSet, tokensIntersect } from './nameMatch.js';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december'];
const DATE_CELL_RE = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/;

// Minimal RFC-4180 CSV reader (quoted fields, doubled quotes, CRLF). Returns string[][].
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// 'November 16, 2026' -> '2026-11-16' (string-built, no Date round trip), or null.
export function parseCalendarDateCell(raw) {
  const m = DATE_CELL_RE.exec(String(raw ?? '').trim());
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

// rows: string[][] (parseCsv output). Returns [{date, task, name}] in sheet order.
export function parseQGendaCalendarRows(rows) {
  const out = [];
  let dateByCol = null;
  for (const row of rows ?? []) {
    const dates = {};
    for (let c = 0; c < row.length; c += 2) {
      const d = parseCalendarDateCell(row[c]);
      if (d) dates[c] = d;
    }
    if (Object.keys(dates).length) { dateByCol = dates; continue; }
    if (!dateByCol) continue;
    for (const c of Object.keys(dateByCol).map(Number)) {
      const task = String(row[c] ?? '').trim();
      const name = String(row[c + 1] ?? '').trim();
      if (task && name) out.push({ date: dateByCol[c], task, name });
    }
  }
  return out;
}

export function parseQGendaCalendarCsv(text) { return parseQGendaCalendarRows(parseCsv(text)); }

// Maps parsed rows onto the app. `roster` = real people (EM roster + off-service) with
// id/firstName/lastName. Returns:
//   schedule         {residentId: {date: shiftId}}   (matched people only)
//   jeopardy         [{date, pgy, residentId|null, name}]  (Res_Call rows - never in schedule)
//   unmappedTasks    [{task, count}]
//   unmatchedEntries [{date, shiftId, name, reason, candidates}]  - names with no/ambiguous match
//   unmatchedNames   [{name, count, reason}]
//   conflicts        [{residentId, date, kept, dropped}]  - same person two shifts one day
//   fallbackMatches  [{name, residentId}]  - last-name-only matches (only with lastNameFallback)
export function mapQGendaCalendar(entries, roster, { lastNameFallback = false } = {}) {
  const schedule = {}, jeopardy = [], unmappedTasks = new Map(), unmatched = [], unmatchedNames = new Map(), conflicts = [], fallbackMatches = new Map();
  const cache = new Map();
  const resolve = (name) => {
    if (cache.has(name)) return cache.get(name);
    const parts = splitName(stripNameSuffix(name));
    let res;
    if (!parts) res = { id: null, reason: 'unparseable', candidates: [] };
    else {
      const hits = matchRosterByName(parts.firstName, parts.lastName, roster);
      res = hits.length === 1 ? { id: hits[0].id } : { id: null, reason: hits.length ? 'ambiguous' : 'no roster match', candidates: hits.map(h => h.id) };
      // Opt-in, reported: first names can differ between QGenda and the roster (nicknames,
      // spelling). A UNIQUE last-name match is then accepted and listed in `fallbackMatches`.
      if (!res.id && !hits.length && lastNameFallback) {
        const lt = nameTokenSet(parts.lastName);
        const byLast = roster.filter(r => tokensIntersect(lt, nameTokenSet(r.lastName)));
        if (byLast.length === 1) { res = { id: byLast[0].id }; fallbackMatches.set(name, byLast[0].id); }
      }
    }
    cache.set(name, res);
    return res;
  };
  for (const e of entries ?? []) {
    const call = RES_CALL_RE.exec(e.task.trim());
    if (call) { jeopardy.push({ date: e.date, pgy: Number(call[1]), residentId: resolve(e.name).id, name: e.name }); continue; }
    const shiftId = QGENDA_TASK_TO_SHIFT.get(normalizeTaskName(e.task));
    if (!shiftId) { unmappedTasks.set(e.task, (unmappedTasks.get(e.task) ?? 0) + 1); continue; }
    const r = resolve(e.name);
    if (!r.id) {
      unmatched.push({ date: e.date, shiftId, name: e.name, reason: r.reason, candidates: r.candidates });
      const u = unmatchedNames.get(e.name) ?? { name: e.name, count: 0, reason: r.reason };
      u.count++; unmatchedNames.set(e.name, u);
      continue;
    }
    const row = schedule[r.id] ?? (schedule[r.id] = {});
    if (row[e.date]) conflicts.push({ residentId: r.id, date: e.date, kept: row[e.date], dropped: shiftId });
    else row[e.date] = shiftId;
  }
  return {
    schedule, jeopardy,
    unmappedTasks: [...unmappedTasks.entries()].map(([task, count]) => ({ task, count })),
    unmatchedEntries: unmatched,
    unmatchedNames: [...unmatchedNames.values()].sort((a, b) => b.count - a.count),
    conflicts,
    fallbackMatches: [...fallbackMatches.entries()].map(([name, residentId]) => ({ name, residentId })),
  };
}
