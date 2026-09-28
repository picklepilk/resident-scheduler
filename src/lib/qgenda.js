// src/lib/qgenda.js
// QGenda CSV export helpers — task-name mapping and staff-name formatting.
// Pure, no React. MUST NOT import ResidentScheduler.jsx (that file will import this one for the
// QGenda export section — importing back would be circular).
//
// Design bias, per the chief's own situation: he has NO QGenda admin access and cannot trial-run
// an upload himself. Every knob that might need a one-line correction after a failed real-world
// import (task names, column headers) is exported as plain data here, not hardcoded inline in the
// export routine, so a fix is a values-only edit — no redeploy required if it's ever wired up to
// come from app settings, and at minimum no hunting through export-formatting code to find it.

import { SHIFT_MAP, SHIFT_TIMING } from './shifts.js';
import { addDays, toDateStr, parseDate, qgendaDate } from './dates.js';

// Our shift id -> the chief's ACTUAL QGenda task name (confirmed against his real QGenda
// instance). Value is either a literal string, or a function `(resident) => string` for the one
// task name that depends on resident PGY (TRAUMA-D).
//
// The eight 12h shift ids (POD-D12/POD-N12/MT-D12/MT-N12/FLEX-D12/FLEX-N12/PED-D12/PED-N12) are
// DELIBERATELY ABSENT — nobody has confirmed what (if anything) they're called in QGenda, since
// they're a conference-week opt-in the chief hasn't exported yet. Do not guess a name for them;
// let qgendaTaskFor's fallback (SHIFT_MAP label) carry them until a real name is confirmed, then
// add it here.
// TRANSCRIBED VERBATIM from a real QGenda export — "UT Health San Antonio - Grid By Staff -
// 7/27/2026 to 8/23/2026". Every one of these 16 strings was copied out of a cell of that
// workbook, not typed from memory. DO NOT "tidy" them. The odd bits are all real:
//   - the leading '*' on every Peds task,
//   - the lowercase 'night' in "Midtrack night" and the lowercase 'only' in "(FM only)",
//   - the trailing hour range on all but the two Trauma tasks.
// The previous values here were written from memory and omitted the hour suffix on 14 of 16
// entries — precisely the "nothing imports" failure this module's header comment anticipates:
// QGenda does not recognize "MC Team Day", only "MC Team Day 7a-4p".
//
// The hour ranges agree exactly with SHIFT_TIMING (./shifts.js) for all 14 timed tasks — Flex Day
// 6a-3p = 06:00 + 9h, Peds Night 7p-4a = 19:00 + 9h, Peds Swing 11a-8p = 11:00 + 9h. If a shift is
// ever retimed, retime the string here in the same commit, or the export silently keeps claiming
// hours the app no longer schedules.
//
// TRAUMA-D stays a function, but only its PGY-1 branch is CONFIRMED: "Trauma Day-Intern" appears
// in the export and a bare "Trauma Day" never does, because TRAUMA-D is PGY-1-only by
// eligibility. The non-intern branch is left in place as a safe default rather than deleted,
// since nothing guarantees that eligibility rule is permanent.
export const QGENDA_TASKS = {
  'POD-D': 'MC Team Day 7a-4p',
  'POD-E': 'MC Team Eve 3p-12a',
  'POD-N': 'MC Team Night 11p-8a',
  'FLEX-D': 'Flex Team Day 6a-3p',
  'FLEX-E': 'Flex Team Eve 2p-11p',
  'FLEX-N': 'Flex Team Night 10p-7a',
  'MT-D': 'Midtrack Day 7a-4p',
  'MT-E': 'Midtrack Evening 3p-12a',
  'MT-N': 'Midtrack night 11p-8a',
  'PED-D': '*Peds Day 7a-4p',
  'PED-E': '*Peds Eve 3p-12a',
  'PED-S': '*Peds Swing 11a-8p',
  'PED-N': '*Peds Night 7p-4a',
  'PED-N-FM': '*Peds Night (FM only) 11p-8a',
  'TRAUMA-N': 'Trauma Night-PGY2+3',
  'TRAUMA-D': (r) => (r?.pgy === 1 ? 'Trauma Day-Intern' : 'Trauma Day'),
  // NOT a real SHIFTS id — the synthetic id (QGENDA_JEOPARDY_TASK_ID below) buildQGendaCSVRows
  // (ResidentScheduler.jsx) uses to export a jeopardy/call day through this SAME qgendaTaskFor
  // override mechanism, so the chief can fix its task name in Settings exactly like any clinical
  // shift, no separate code path. 'Call' is an UNCONFIRMED placeholder (no real QGenda export has
  // ever included a jeopardy row) — correct it here, the same way the 12h ids above will be
  // corrected once a real name is confirmed.
  JEOPARDY: 'Call',
};

// Synthetic shift id for a jeopardy/call day (no matching SHIFTS entry, no SHIFT_TIMING entry —
// see qgendaShiftClock, which naturally yields blank Start/End/no-rollover for it). Kept as its
// own export so ResidentScheduler.jsx's row builder and Settings task-name editor both key off
// one literal instead of a second hardcoded 'JEOPARDY' string.
export const QGENDA_JEOPARDY_TASK_ID = 'JEOPARDY';

// Resolves the QGenda task name for one exported shift.
//
// Resolution order:
//   1. A non-blank (post-trim) chief-entered override for this shift id -> source:'override'.
//   2. QGENDA_TASKS[shiftId] (invoked with `resident` if it's a function) -> source:'default'.
//   3. SHIFT_MAP[shiftId]'s on-screen label, or the raw id as a last resort -> source:'fallback'.
//
// WHY FALL BACK TO A LABEL RATHER THAN BLANK OR SKIPPING THE ROW: a blank Task column is the
// value most likely to fail import outright (and in many importers, one bad row fails the WHOLE
// file, not just that row) — that's the exact "nothing imports, unreadable" failure this module
// exists to prevent. A silently-SKIPPED row is worse in a quieter way: it's a resident who simply
// does not exist in QGenda that shift, and nobody notices until someone doesn't show up. A
// wrong-but-present name fails VISIBLY — QGenda (or the chief eyeballing the CSV) flags an
// unrecognized task string, and it's a one-line Settings fix with no redeploy. `source` is
// returned precisely so a caller can warn on 'fallback' rows before export, and so the policy can
// flip to skip-with-warning in one line if we ever learn QGenda rejects a file outright over an
// unrecognized task name instead of just that row.
export function qgendaTaskFor(shiftId, resident, overrides = {}) {
  const override = overrides?.[shiftId];
  if (typeof override === 'string' && override.trim()) {
    return { task: override.trim(), source: 'override' };
  }

  const entry = QGENDA_TASKS[shiftId];
  if (entry != null) {
    const task = typeof entry === 'function' ? entry(resident) : entry;
    if (typeof task === 'string' && task.trim()) {
      return { task, source: 'default' };
    }
  }

  const task = SHIFT_MAP[shiftId]?.label ?? shiftId;
  return { task, source: 'fallback' };
}

// Pure clock math for one shift id's Start/End/rollover, extracted out of buildQGendaCSVRows
// (ResidentScheduler.jsx) so it's testable without a schedule or block object. SHIFT_TIMING
// stores start/duration as plain hour numbers (never Date objects), so this never touches a
// calendar date — see qgendaEndDate below for the day-rollover half.
// A shift id absent from SHIFT_TIMING (currently only QGENDA_JEOPARDY_TASK_ID) has no confirmed
// timing at all — see this module's header/CLAUDE.md note — so it deliberately gets blank
// Start/End and never rolls, rather than guessing.
export function qgendaShiftClock(shiftId) {
  const t = SHIFT_TIMING[shiftId];
  const startH = t?.startH;
  const durationH = t?.durationH;
  if (startH == null || durationH == null) return { startStr: '', endStr: '', rollsOver: false };
  const fmtHM = h => {
    const hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };
  return {
    startStr: fmtHM(startH),
    endStr: fmtHM(startH + durationH),
    rollsOver: (startH + durationH) >= 24,
  };
}

// Resolves the EndDate column for one row: `rollsOver` (see qgendaShiftClock) rolls the calendar
// date forward one day (e.g. a night shift starting 23:00), otherwise EndDate is the same date as
// Date. Kept as its own function (rather than inlined into qgendaShiftClock) because it's the one
// piece of this math that touches a calendar date, not just hour-of-day arithmetic.
export function qgendaEndDate(dateStr, rollsOver) {
  return rollsOver ? toDateStr(addDays(parseDate(dateStr), 1)) : dateStr;
}

// Builds the {column: value} map (keyed by the canonical column ids used across every
// QGENDA_VARIANTS entry) for ONE exported row — either a real clinical shift assignment, or a
// jeopardy/call day (pass QGENDA_JEOPARDY_TASK_ID as shiftId; qgendaShiftClock naturally yields
// blank Start/End/EndDate-no-rollover for it, since jeopardy has no confirmed timing anywhere in
// this app — see that constant's own comment). Caller still owns iterating residents/dates and
// deciding WHICH rows to build (buildQGendaCSVRows in ResidentScheduler.jsx) — this is just the
// per-row math + task-name resolution, extracted so it's testable without a schedule.
// `columns` is NOT applied here — the caller picks which of these keys it wants per variant
// (QGENDA_VARIANTS[*].columns) and does its own `columns.map(col => valuesByColumn[col] ?? '')`.
export function qgendaRowValues(shiftId, resident, dateStr, { overrides, nameFormat } = {}) {
  const { startStr, endStr, rollsOver } = qgendaShiftClock(shiftId);
  const { task, source } = qgendaTaskFor(shiftId, resident, overrides);
  const valuesByColumn = {
    Staff: qgendaName(resident, nameFormat),
    Date: qgendaDate(dateStr),
    EndDate: qgendaDate(qgendaEndDate(dateStr, rollsOver)),
    Task: task,
    StartTime: startStr,
    EndTime: endStr,
  };
  return { valuesByColumn, source };
}

// Supported staff-name formats for the export, in chief-facing display order.
export const QGENDA_NAME_FORMATS = ['lastFirstInitial', 'lastFirst', 'firstLast'];

// Formats a resident's name for the QGenda Staff column.
//
// If `resident.qgendaStaffId` is set (non-blank), it's returned VERBATIM regardless of `format` —
// the escape hatch for when QGenda matches staff by an internal abbreviation/id we cannot guess
// from a name (e.g. "SMITHJ"), same rationale as the override map above: a chief-entered value
// beats an algorithm guessing at another system's internal format.
//
// Otherwise formats from `firstName`/`lastName`, tolerating either being missing/blank/whitespace
// and never emitting a stray leading/trailing comma or space:
//   lastFirstInitial -> "Smith, J"   (no trailing period)
//   lastFirst         -> "Smith, John"
//   firstLast         -> "John Smith"
// A hyphenated name (e.g. "Mary-Jane") is passed through untouched except lastFirstInitial's
// first-initial, which is just the first character of whatever's in `firstName` — "Mary-Jane" ->
// "M", same as any other first name.
export function qgendaName(resident, format = 'lastFirstInitial') {
  const staffId = typeof resident?.qgendaStaffId === 'string' ? resident.qgendaStaffId.trim() : '';
  if (staffId) return staffId;

  const first = typeof resident?.firstName === 'string' ? resident.firstName.trim() : '';
  const last = typeof resident?.lastName === 'string' ? resident.lastName.trim() : '';

  switch (format) {
    case 'firstLast':
      return [first, last].filter(Boolean).join(' ');
    case 'lastFirst':
      if (last && first) return `${last}, ${first}`;
      return last || first || '';
    case 'lastFirstInitial':
    default:
      if (last && first) return `${last}, ${first[0]}`;
      return last || first || '';
  }
}

// Export column layouts. Column NAMES ARE DATA, not hardcoded strings scattered through the
// export routine — deliberate, because we cannot verify QGenda's expected header names (no admin
// access to trial-run against), and real-world QGenda templates commonly use different header
// spellings than the ones guessed here (e.g. StartDate/TaskName/StaffAbbrev instead of
// Date/Task/Staff). If a real import fails on headers alone, the fix is editing the `columns`
// array below, not touching export logic.
export const QGENDA_VARIANTS = {
  minimal: { id: 'minimal', label: 'Minimal', columns: ['Staff', 'Date', 'Task'] },
  withTimes: {
    id: 'withTimes',
    label: 'With times',
    columns: ['Staff', 'Date', 'EndDate', 'Task', 'StartTime', 'EndTime'],
  },
};

// Default printed header text for every canonical column id any QGENDA_VARIANTS entry uses.
// These header NAMES are unverified guesses (same caveat as QGENDA_VARIANTS itself above) — the
// chief's real QGenda import template may expect different spellings (e.g. StartDate/TaskName),
// so appSettings.qgendaHeaderOverrides (below) lets him fix the printed header text himself, in
// Settings, with no redeploy. This only ever renames the printed header — column IDENTITY (what
// data lands in that position, keyed by these same ids in qgendaRowValues' valuesByColumn) never
// changes.
export const QGENDA_COLUMN_DEFAULTS = {
  Staff: 'Staff',
  Date: 'Date',
  EndDate: 'EndDate',
  Task: 'Task',
  StartTime: 'StartTime',
  EndTime: 'EndTime',
};

// Normalizes untrusted appSettings.qgendaHeaderOverrides shape (backup/cloud-sourced, same
// posture as every other appSettings sub-key per CLAUDE.md) into a clean {columnId: headerText}
// map containing ONLY recognized canonical column ids with a non-blank, trimmed override that
// actually differs from the default — a non-string, blank/whitespace-only, or exactly-default
// value is dropped rather than stored, same sparse-write convention as qgendaTaskOverrides
// (ResidentScheduler.jsx's updQgendaTask), so a cleared field never resurfaces as a mysteriously
// renamed column and a stale/garbage key can never leak into the printed header row.
export function normalizeQgendaHeaderOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const col of Object.keys(QGENDA_COLUMN_DEFAULTS)) {
    const v = raw[col];
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (!trimmed || trimmed === QGENDA_COLUMN_DEFAULTS[col]) continue;
    out[col] = trimmed;
  }
  return out;
}

// Resolves the printed header row for a QGENDA_VARIANTS[*].columns array, applying normalized
// chief overrides over the canonical defaults, in column order — the same order the data rows
// use, so a swap here always lines up with valuesByColumn.
export function resolveQgendaHeaders(columns, overrides) {
  const clean = normalizeQgendaHeaderOverrides(overrides);
  return columns.map(col => clean[col] || QGENDA_COLUMN_DEFAULTS[col] || col);
}
