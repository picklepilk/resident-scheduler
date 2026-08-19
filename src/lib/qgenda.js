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

import { SHIFT_MAP } from './shifts.js';

// Our shift id -> the chief's ACTUAL QGenda task name (confirmed against his real QGenda
// instance). Value is either a literal string, or a function `(resident) => string` for the one
// task name that depends on resident PGY (TRAUMA-D).
//
// The eight 12h shift ids (POD-D12/POD-N12/MT-D12/MT-N12/FLEX-D12/FLEX-N12/PED-D12/PED-N12) are
// DELIBERATELY ABSENT — nobody has confirmed what (if anything) they're called in QGenda, since
// they're a conference-week opt-in the chief hasn't exported yet. Do not guess a name for them;
// let qgendaTaskFor's fallback (SHIFT_MAP label) carry them until a real name is confirmed, then
// add it here.
export const QGENDA_TASKS = {
  'POD-D': 'MC Team Day',
  'POD-E': 'MC Team Eve',
  'POD-N': 'MC Team Night',
  'FLEX-D': 'Flex Team Day',
  'FLEX-E': 'Flex Team Eve',
  'FLEX-N': 'Flex Team Night',
  'MT-D': 'Midtrack Day',
  'MT-E': 'Midtrack Evening',
  'MT-N': 'Midtrack Night',
  'PED-D': 'Peds Day',
  'PED-E': 'Peds Eve',
  'PED-S': 'Peds Swing',
  'PED-N': 'Peds Night',
  'PED-N-FM': 'Peds Night (FM Only)',
  'TRAUMA-N': 'Trauma Night-PGY2+3',
  'TRAUMA-D': (r) => (r?.pgy === 1 ? 'Trauma Day-Intern' : 'Trauma Day'),
};

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
