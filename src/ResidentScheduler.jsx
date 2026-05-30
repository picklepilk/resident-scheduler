// ResidentScheduler.jsx — v0.3
// EM Residency Scheduler · UH Emergency Medicine

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Plus, Trash2, AlertTriangle, Calendar, Users, Settings as SettingsIcon,
  X, ChevronDown, Download, Info, RefreshCw, CheckCircle, AlertCircle,
  Home, Archive, Save, ChevronRight, Check, Table2, Activity,
  Stethoscope, ClipboardList, BookOpen, Shield, Edit2, LayoutDashboard,
  CalendarDays, AlertOctagon, Stethoscope as Steth,
} from 'lucide-react';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const SHIFTS = [
  { id: 'POD-D',    label: 'POD Day',      area: 'POD',    hours: '07:00–16:00', type: 'day',   chip: 'bg-blue-600 text-white' },
  { id: 'POD-E',    label: 'POD Eve',      area: 'POD',    hours: '15:00–00:00', type: 'eve',   chip: 'bg-blue-400 text-white' },
  { id: 'POD-N',    label: 'POD Night',    area: 'POD',    hours: '23:00–08:00', type: 'night', chip: 'bg-blue-900 text-white' },
  { id: 'PED-D',    label: 'PED Day',      area: 'PED',    hours: '07:00–16:00', type: 'day',   chip: 'bg-emerald-600 text-white' },
  { id: 'PED-E',    label: 'PED Eve',      area: 'PED',    hours: '15:00–00:00', type: 'eve',   chip: 'bg-emerald-400 text-white' },
  { id: 'PED-N',    label: 'PED Night',    area: 'PED',    hours: '23:00–08:00', type: 'night', chip: 'bg-emerald-900 text-white' },
  { id: 'FLEX-D',   label: 'FLEX Day',     area: 'FLEX',   hours: '06:00–15:00', type: 'day',   chip: 'bg-purple-600 text-white' },
  { id: 'FLEX-E',   label: 'FLEX Eve',     area: 'FLEX',   hours: '14:00–23:00', type: 'eve',   chip: 'bg-purple-400 text-white' },
  { id: 'FLEX-N',   label: 'FLEX Night',   area: 'FLEX',   hours: '22:00–07:00', type: 'night', chip: 'bg-purple-900 text-white' },
  { id: 'MT-D',     label: 'MT Day',       area: 'MT',     hours: '07:00–16:00', type: 'day',   chip: 'bg-amber-600 text-white' },
  { id: 'MT-E',     label: 'MT Eve',       area: 'MT',     hours: '15:00–00:00', type: 'eve',   chip: 'bg-amber-400 text-white' },
  { id: 'MT-N',     label: 'MT Night',     area: 'MT',     hours: '23:00–08:00', type: 'night', chip: 'bg-amber-900 text-white' },
  { id: 'TRAUMA-D', label: 'Trauma Day',   area: 'TRAUMA', hours: '06:00–18:00', type: 'day',   chip: 'bg-red-600 text-white' },
  { id: 'TRAUMA-N', label: 'Trauma Night', area: 'TRAUMA', hours: '18:00–06:00', type: 'night', chip: 'bg-red-900 text-white' },
];
const SHIFT_MAP = Object.fromEntries(SHIFTS.map(s => [s.id, s]));
const SHIFT_AREAS = ['POD', 'PED', 'FLEX', 'MT', 'TRAUMA'];

// Exact start hour (24h) and duration for each shift — used for rest-period validation.
// End time = start + duration (may cross midnight into the next calendar day).
const SHIFT_TIMING = {
  'POD-D':    { startH: 7,  durationH: 9  },   // 07:00 – 16:00
  'POD-E':    { startH: 15, durationH: 9  },   // 15:00 – 00:00 (+1 day)
  'POD-N':    { startH: 23, durationH: 9  },   // 23:00 – 08:00 (+1 day)
  'PED-D':    { startH: 7,  durationH: 9  },
  'PED-E':    { startH: 15, durationH: 9  },
  'PED-N':    { startH: 23, durationH: 9  },
  'FLEX-D':   { startH: 6,  durationH: 9  },   // 06:00 – 15:00
  'FLEX-E':   { startH: 14, durationH: 9  },   // 14:00 – 23:00
  'FLEX-N':   { startH: 22, durationH: 9  },   // 22:00 – 07:00 (+1 day)
  'MT-D':     { startH: 7,  durationH: 9  },
  'MT-E':     { startH: 15, durationH: 9  },
  'MT-N':     { startH: 23, durationH: 9  },
  'TRAUMA-D': { startH: 6,  durationH: 12 },   // 06:00 – 18:00
  'TRAUMA-N': { startH: 18, durationH: 12 },   // 18:00 – 06:00 (+1 day)
};

const CATEGORIES = [
  { id: 'EM_HOME', label: 'EM – Home',        shortLabel: 'EM-H', pgyOptions: [1,2,3], persistent: true,  rowBg: 'bg-indigo-50',  badge: 'bg-indigo-600 text-white' },
  { id: 'EM_BAMC', label: 'EM – BAMC',        shortLabel: 'BAMC', pgyOptions: [1],     persistent: false, rowBg: 'bg-sky-50',     badge: 'bg-sky-600 text-white' },
  { id: 'PEDS',    label: 'Pediatrics',        shortLabel: 'PEDS', pgyOptions: [1,3],   persistent: false, rowBg: 'bg-emerald-50', badge: 'bg-emerald-600 text-white' },
  { id: 'FM',      label: 'Family Medicine',   shortLabel: 'FM',   pgyOptions: [1,3],   persistent: false, rowBg: 'bg-yellow-50',  badge: 'bg-yellow-500 text-white' },
  { id: 'IM',      label: 'Internal Medicine', shortLabel: 'IM',   pgyOptions: [2],     persistent: false, rowBg: 'bg-orange-50',  badge: 'bg-orange-500 text-white' },
  { id: 'NEURO',   label: 'Neurology',         shortLabel: 'NEURO',pgyOptions: [1],     persistent: false, rowBg: 'bg-pink-50',    badge: 'bg-pink-600 text-white' },
  { id: 'ANES',    label: 'Anesthesiology',    shortLabel: 'ANES', pgyOptions: [1],     persistent: false, rowBg: 'bg-violet-50',  badge: 'bg-violet-600 text-white' },
  { id: 'PSYCH',   label: 'Psychiatry',        shortLabel: 'PSYCH',pgyOptions: [1],     persistent: false, rowBg: 'bg-teal-50',    badge: 'bg-teal-600 text-white' },
  { id: 'POD',     label: 'Podiatry',          shortLabel: 'POD',  pgyOptions: [1],     persistent: false, rowBg: 'bg-stone-50',   badge: 'bg-stone-500 text-white' },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const BLOCK_TYPES_EM = [
  { id: 'EM',          label: 'EM',           schedulable: true,  atUH: true  },
  { id: 'EM_VAC',      label: 'EM/VAC',       schedulable: true,  atUH: true  },
  { id: 'EM_RES_VAC',  label: 'EM/Res/VAC',   schedulable: true,  atUH: true  },
  { id: 'EM_EMS',      label: 'EM/EMS',       schedulable: true,  atUH: true  },
  { id: 'EM_TOX',      label: 'EM/TOX',       schedulable: true,  atUH: true  },
  { id: 'PEDS_EM',     label: 'Peds/EM',      schedulable: true,  atUH: true  },
  { id: 'PEDS_TRAUMA', label: 'Peds/Trauma',  schedulable: true,  atUH: true  },
  { id: 'TRAUMA_PEDS', label: 'Trauma/Peds',  schedulable: true,  atUH: true  },
  { id: 'US_EM',       label: 'US/EM',        schedulable: true,  atUH: true  },
  { id: 'METRO',       label: 'Metro',        schedulable: false, atUH: true  },
  { id: 'ELECTIVE',    label: 'Elective',     schedulable: false, atUH: true  },
  { id: 'ADMIN',       label: 'Admin',        schedulable: false, atUH: true  },
  { id: 'BAPTIST',     label: 'Baptist',      schedulable: false, atUH: false },
  { id: 'MICU',        label: 'MICU',         schedulable: false, atUH: false },
  { id: 'ORTHO_VAC',   label: 'Ortho/VAC',    schedulable: false, atUH: false },
  { id: 'ANES_VAC',    label: 'ANES/VAC',     schedulable: false, atUH: false },
  { id: 'NICU',        label: 'NICU',         schedulable: false, atUH: false },
  { id: 'PICU',        label: 'PICU',         schedulable: false, atUH: false },
  { id: 'OB_VAC',      label: 'OB/VAC',       schedulable: false, atUH: false },
  { id: '9ICU',        label: '9ICU',         schedulable: false, atUH: false },
];
const BLOCK_TYPE_MAP = Object.fromEntries(BLOCK_TYPES_EM.map(b => [b.id, b]));
const TRAUMA_BLOCKS = ['PEDS_TRAUMA', 'TRAUMA_PEDS'];

// Block types shown in the rotation dropdown per PGY level (EM Home only)
const EM_HOME_BLOCK_TYPES_BY_PGY = {
  1: ['EM', 'EM_RES_VAC', 'PEDS_TRAUMA', 'TRAUMA_PEDS', 'US_EM',
      'ANES_VAC', 'ORTHO_VAC', 'NICU', 'PICU', 'OB_VAC'],
  2: ['EM', 'EM_VAC', 'EM_EMS', 'EM_TOX', 'PEDS_EM',
      'OB_VAC', 'BAPTIST', 'MICU', 'NICU', 'PICU', '9ICU'],
  3: ['EM', 'EM_VAC', 'METRO', 'ELECTIVE', 'ADMIN',
      'MICU', '9ICU'],
};

// Base eligibility — most permissive per category+PGY.
// Block-type & day-of-week restrictions are applied on top in getEligibleShifts.
const BASE_ELIGIBILITY = {
  // EM Home PGY-1: all areas; TRAUMA-D only (no TRAUMA-N); Trauma further gated by block type
  EM_HOME_1:  ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D'],
  // EM Home PGY-2/3: all shifts including TRAUMA-N
  EM_HOME_2:  ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N'],
  EM_HOME_3:  ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N'],
  // BAMC: no Trauma
  EM_BAMC_1:  ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N'],
  // Peds: PED only
  PEDS_1:     ['PED-D','PED-E','PED-N'],
  PEDS_3:     ['PED-D','PED-E','PED-N'],
  // FM-1: POD only (PED eligibility ⚠ TBD — add via matrix if confirmed)
  FM_1:       ['POD-D','POD-E','POD-N'],
  // FM-3: PED Night only, Mon/Tue/Wed
  FM_3:       ['PED-N'],
  // IM: POD + FLEX, no Peds/MT/Trauma
  IM_2:       ['POD-D','POD-E','POD-N','FLEX-D','FLEX-E','FLEX-N'],
  // Off-service (Neuro/Anes/Psych/Pod): POD + FLEX-D — verify exact matrix with chief
  NEURO_1:    ['POD-D','POD-E','POD-N','FLEX-D'],
  ANES_1:     ['POD-D','POD-E','POD-N','FLEX-D'],
  PSYCH_1:    ['POD-D','POD-E','POD-N','FLEX-D'],
  POD_1:      ['POD-D','POD-E','POD-N','FLEX-D'],
};

const SHIFT_TARGETS = {
  EM_HOME_1: 20, EM_HOME_2: 19, EM_HOME_3: 18,
  EM_BAMC_1: 19,
  FM_1: 14, FM_3: 12,
  IM_2: 6,
  NEURO_1: 14,
  ANES_1: 14,
  PSYCH_1: 14,
  POD_1: 14,
};

// Static rules reference per category_pgy — used in Rules tab
const RULES_DATA = {
  EM_HOME_1: {
    targetNote: '20 shifts/block',
    eligSummary: 'All ED areas. Trauma Day only — Trauma Night never eligible for PGY-1.',
    traumaNote: 'Trauma Day is ONLY available on Peds/Trauma and Trauma/Peds blocks. On those blocks, Trauma Day is restricted to Tue/Thu/Sat/Sun. Peds shifts (PED-D/E/N) are NOT subject to this day restriction — they remain available any eligible day throughout the block.',
    dayRules: [
      { label: 'Wednesday', rule: 'BLOCKED — GR 08:00–12:00 (counts as work day)', type: 'block' },
    ],
    blockTypeNotes: [
      { ids: ['PEDS_TRAUMA','TRAUMA_PEDS'], note: '8 Trauma Day shifts on Tue/Thu/Sat/Sun + 11 Peds shifts (any eligible day) = 19 total. Day restriction applies to Trauma only.' },
      { ids: ['US_EM'],       note: 'Chief schedules Sat/Sun/Mon only; no Mon nights. 5 EM shifts total.' },
      { ids: ['EM_RES_VAC'],  note: 'Chief schedules weeks 1–2 only ⚠ TBD count' },
    ],
    tbdItems: ['EM/Res/VAC week-1 & 2 shift count', 'Buy-down day split definition'],
  },
  EM_HOME_2: {
    targetNote: '19 shifts/block',
    eligSummary: 'All ED areas including Trauma Day and Trauma Night.',
    traumaNote: '2–3 Trauma shifts per month (soft target; app warns if > 3). Mixed into EM schedule.',
    dayRules: [
      { label: 'Wednesday', rule: 'BLOCKED — GR 08:00–12:00 (counts as work day)', type: 'block' },
    ],
    blockTypeNotes: [
      { ids: ['PEDS_EM'],  note: 'No Trauma on this block. Prioritize Peds shifts; schedule LAST in workflow. ⚠ TBD total shift split.' },
      { ids: ['EM_EMS'],   note: 'Chief schedules Mon/Tue only — Thu/Fri are EMS call (service-arranged, not chief-scheduled).' },
      { ids: ['EM_TOX'],   note: 'Chief schedules Thu/Fri only — Mon/Tue are Tox call (service-arranged, not chief-scheduled).' },
      { ids: ['OB_VAC'],   note: 'Not scheduled by chief. Resident self-arranges (schedulable = off).' },
    ],
    tbdItems: ['Peds/EM total shift split confirmation'],
  },
  EM_HOME_3: {
    targetNote: '18 shifts/block (Chief Resident: 16)',
    eligSummary: 'All ED areas including Trauma Day and Trauma Night.',
    dayRules: [
      { label: 'Wednesday', rule: 'BLOCKED — GR 08:00–12:00 (counts as work day)', type: 'block' },
    ],
    blockTypeNotes: [
      { ids: ['METRO'],    note: 'Self-pick 12 Metro shifts + 8 on-call days; chief does not schedule' },
      { ids: ['ADMIN'],    note: 'On-call only (4 teaching + 4 other); no regular ED shifts' },
      { ids: ['ELECTIVE'], note: '⚠ TBD: confirm whether chief schedules any UH ED shifts during elective' },
    ],
    tbdItems: ['Elective block ED shift scheduling confirmation'],
    softPrefs: ['Try to give Sunday off before ICU rotations'],
  },
  EM_BAMC_1: {
    targetNote: '19 shifts/block',
    eligSummary: 'All ED areas EXCEPT Trauma (no Trauma Day or Trauma Night).',
    dayRules: [
      { label: 'Wednesday', rule: 'Day shifts only (day worker)', type: 'restrict' },
      { label: 'Thursday',  rule: '1×/month allowed — row of nights only ⚠ TBD definition (GR day)', type: 'restrict' },
    ],
    specialNotes: [
      'Procedure days: off night before + day of (can work night-of if critical) ⚠ TBD date list',
      'Peds shifts 1–3/block ⚠ TBD exact count',
    ],
    tbdItems: ['Row-of-nights definition for GR Thursday', 'Procedure day source/list'],
  },
  PEDS_1: {
    targetNote: 'Per Amion — not set by this app (self-cover)',
    eligSummary: 'PED shifts only: Day, Eve, Night.',
    dayRules: [
      { label: 'Friday 1–4pm', rule: 'GR protected — should not be scheduled', type: 'restrict' },
    ],
    specialNotes: ['Night before advocacy days: off', 'Peds residents self-cover; app displays schedule only'],
    tbdItems: ['Advocacy day list — chief provides each block'],
  },
  PEDS_3: {
    targetNote: 'Per Amion — not set by this app (self-cover)',
    eligSummary: 'PED shifts only: Day, Eve, Night.',
    dayRules: [
      { label: 'Friday 1–4pm', rule: 'GR protected — should not be scheduled', type: 'restrict' },
    ],
    specialNotes: ['Night before advocacy days: off', 'Self-cover arrangement'],
    tbdItems: ['Advocacy day list — chief provides each block'],
  },
  FM_1: {
    targetNote: '14 shifts/block',
    eligSummary: 'POD shifts (Day/Eve/Night). ⚠ TBD: Peds eligibility unconfirmed — add via matrix if confirmed.',
    dayRules: [
      { label: 'Wednesday',  rule: 'No shifts (clinic day)', type: 'block' },
      { label: 'Thursday',   rule: 'No shifts (clinic day)', type: 'block' },
      { label: 'Tue nights', rule: 'No night shifts Tuesday', type: 'restrict' },
    ],
    tbdItems: ['Peds shift eligibility confirmation', 'Peds target count if eligible'],
  },
  FM_3: {
    targetNote: '12 shifts/block',
    eligSummary: 'PED Night only (23:00–08:00). Monday/Tuesday/Wednesday nights only.',
    dayRules: [
      { label: 'Thu/Fri/Sat/Sun', rule: 'No shifts', type: 'block' },
    ],
    specialNotes: ['Interpretation A confirmed: FM-3 ONLY works Peds nights, Mon–Wed ⚠ verify'],
  },
  IM_2: {
    targetNote: '6 shifts/block (8 if 3-week block)',
    eligSummary: 'POD and FLEX shifts. No Peds, no MT, no Trauma.',
    dayRules: [
      { label: 'Wednesday (standard)',    rule: 'Day shifts only (day worker)', type: 'restrict' },
      { label: 'Tue + Wed (CCU nights)',  rule: 'Both days blocked entirely when covering CCU nights', type: 'block' },
    ],
    specialNotes: ['Code Blue days: off night before + day of ⚠ manual entry required'],
    tbdItems: ['CCU nights detection (currently manual checkbox on resident)', 'Code Blue day list source'],
  },
  NEURO_1: {
    targetNote: '14 shifts/block (7 if 2-week block)',
    eligSummary: 'POD shifts (D/E/N) + FLEX Day. ⚠ Verify exact matrix with chief.',
    dayRules: [
      { label: 'Wednesday', rule: 'No shifts (GR Wed afternoon)', type: 'block' },
      { label: 'Friday',    rule: 'No shifts (GR Fri morning); Fri night OK only if critically needed', type: 'block' },
      { label: 'Tue/Thu nights', rule: 'Soft preference — avoid if possible', type: 'soft' },
    ],
    tbdItems: ['Confirm eligible shift list with rotation director'],
  },
  ANES_1: {
    targetNote: '14 shifts/block',
    eligSummary: 'POD shifts (D/E/N) + FLEX Day. ⚠ Verify exact matrix with chief.',
    dayRules: [
      { label: 'Wednesday', rule: 'Day shifts only (day worker)', type: 'restrict' },
      { label: '1st Friday 2–4pm', rule: 'Off ⚠ TBD: full rule text cut off in source', type: 'restrict' },
    ],
    specialNotes: ['Ultrasound days: off (email Gardner annually for dates)'],
    tbdItems: ['1st Friday social rule full text', 'US days for current academic year'],
  },
  PSYCH_1: {
    targetNote: '14 shifts/block (7 if half-month block)',
    eligSummary: 'POD shifts (D/E/N) + FLEX Day. ⚠ Verify exact matrix with chief.',
    dayRules: [
      { label: 'Tuesday',  rule: 'No shifts (all day)', type: 'block' },
      { label: 'Mon nights', rule: 'No Monday night shifts', type: 'restrict' },
      { label: 'Wednesday', rule: 'Day shifts only (day worker)', type: 'restrict' },
    ],
  },
  POD_1: {
    targetNote: '14 shifts/block',
    eligSummary: 'POD shifts (D/E/N) + FLEX Day. ⚠ Verify exact matrix with chief.',
    dayRules: [
      { label: 'Saturday',   rule: 'No shifts (weekend call)', type: 'block' },
      { label: 'Sunday',     rule: 'No shifts (weekend call)', type: 'block' },
      { label: 'Fri nights', rule: 'No Friday nights (weekend call)', type: 'block' },
      { label: 'Mon mornings', rule: 'No Monday day shifts (call carryover)', type: 'restrict' },
      { label: 'Wednesday',  rule: 'Day shifts only (day worker)', type: 'restrict' },
    ],
  },
};

const MATRIX_ROWS = [
  { key: 'EM_HOME_1', label: 'EM Home',        sub: 'PGY-1', catId: 'EM_HOME' },
  { key: 'EM_HOME_2', label: 'EM Home',        sub: 'PGY-2', catId: 'EM_HOME' },
  { key: 'EM_HOME_3', label: 'EM Home',        sub: 'PGY-3', catId: 'EM_HOME' },
  { key: 'EM_BAMC_1', label: 'EM BAMC',        sub: 'PGY-1', catId: 'EM_BAMC' },
  { key: 'PEDS_1',    label: 'Pediatrics',     sub: 'PGY-1', catId: 'PEDS' },
  { key: 'PEDS_3',    label: 'Pediatrics',     sub: 'PGY-3', catId: 'PEDS' },
  { key: 'FM_1',      label: 'Family Med',     sub: 'PGY-1', catId: 'FM' },
  { key: 'FM_3',      label: 'Family Med',     sub: 'PGY-3', catId: 'FM' },
  { key: 'IM_2',      label: 'Int. Medicine',  sub: 'PGY-2', catId: 'IM' },
  { key: 'NEURO_1',   label: 'Neurology',      sub: 'PGY-1', catId: 'NEURO' },
  { key: 'ANES_1',    label: 'Anesthesiology', sub: 'PGY-1', catId: 'ANES' },
  { key: 'PSYCH_1',   label: 'Psychiatry',     sub: 'PGY-1', catId: 'PSYCH' },
  { key: 'POD_1',     label: 'Podiatry',       sub: 'PGY-1', catId: 'POD' },
];

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const CELL_W = 52;
const NAME_W = 210;

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function toDateStr(d) { return d.toISOString().slice(0, 10); }
function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function uuid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function eligKey(r) { return `${r.category}_${r.pgy}`; }

function getAcademicYear() {
  const now = new Date(); const m = now.getMonth(); const y = now.getFullYear();
  const s = m >= 6 ? y : y - 1;
  return `AY${String(s).slice(2)}/${String(s+1).slice(2)}`;
}

function getBlockDates(start, end) {
  if (!start || !end) return [];
  const dates = []; let cur = parseDate(start); const last = parseDate(end);
  while (cur <= last) { dates.push(toDateStr(cur)); cur = addDays(cur, 1); }
  return dates;
}

function prettyDate(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

function formatDisplayDate(s) {
  const d = parseDate(s);
  return `${DOW[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`;
}

// ─── REST-PERIOD UTILITIES ────────────────────────────────────────────────────

// Millisecond timestamp for the START of a shift on a given date
function shiftStartMs(shiftId, dateStr) {
  const t = SHIFT_TIMING[shiftId];
  if (!t) return null;
  const d = parseDate(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.startH, 0, 0).getTime();
}

// Millisecond timestamp for the END of a shift (may be next calendar day)
function shiftEndMs(shiftId, dateStr) {
  const startMs = shiftStartMs(shiftId, dateStr);
  if (startMs === null) return null;
  return startMs + SHIFT_TIMING[shiftId].durationH * 3600_000;
}

// Returns violation strings for adding `newShiftId` on `dateStr` for a given resident.
// Rule: after completing a shift of length H, resident must have ≥ H hours off before the next shift.
function checkRestViolations(residentId, dateStr, newShiftId, schedule) {
  const violations = [];
  const nt = SHIFT_TIMING[newShiftId];
  if (!nt) return violations;

  const newStart = shiftStartMs(newShiftId, dateStr);
  const newEnd   = newStart + nt.durationH * 3_600_000;
  const rs       = schedule[residentId] || {};
  const refDate  = parseDate(dateStr);

  // Check ±2 days (night shifts can cross midnight so we need the day before/after)
  for (let offset = -2; offset <= 2; offset++) {
    if (offset === 0) continue; // same dateStr → data model already prevents two shifts
    const checkDs  = toDateStr(addDays(refDate, offset));
    const existSid = rs[checkDs];
    if (!existSid) continue;
    const et = SHIFT_TIMING[existSid];
    if (!et) continue;

    const exStart = shiftStartMs(existSid, checkDs);
    const exEnd   = exStart + et.durationH * 3_600_000;

    // Overlap check (shouldn't happen with one-shift-per-day model, but guard anyway)
    if (newStart < exEnd && exStart < newEnd) {
      violations.push(`Overlaps with ${existSid} on ${formatDisplayDate(checkDs)}`);
      continue;
    }

    if (exEnd <= newStart) {
      // Existing finishes before new starts → required gap = existing shift's duration
      const gapH = (newStart - exEnd) / 3_600_000;
      if (gapH < et.durationH) {
        violations.push(
          `Rest: only ${gapH % 1 === 0 ? gapH : gapH.toFixed(1)}h off after ${existSid} on ${formatDisplayDate(checkDs)} — ` +
          `that ${et.durationH}h shift requires ${et.durationH}h rest before returning`
        );
      }
    } else if (newEnd <= exStart) {
      // New finishes before existing starts → required gap = new shift's duration
      const gapH = (exStart - newEnd) / 3_600_000;
      if (gapH < nt.durationH) {
        violations.push(
          `Rest: only ${gapH % 1 === 0 ? gapH : gapH.toFixed(1)}h off before ${existSid} on ${formatDisplayDate(checkDs)} — ` +
          `this ${nt.durationH}h shift requires ${nt.durationH}h rest afterward`
        );
      }
    }
  }
  return violations;
}

function isSchedulable(resident) {
  if (resident.category === 'EM_HOME' || resident.category === 'EM_BAMC') {
    const bt = BLOCK_TYPE_MAP[resident.blockType];
    return bt ? bt.schedulable : false;
  }
  return true;
}

// Days elapsed / remaining in the current block relative to today
function getBlockProgress(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = parseDate(startStr);
  const end   = parseDate(endStr);
  const total = Math.round((end - start) / 86_400_000) + 1;
  const elapsed   = Math.max(0, Math.min(total, Math.round((today - start) / 86_400_000)));
  const remaining = total - elapsed;
  return { total, elapsed, remaining, pct: Math.round(elapsed / total * 100) };
}

// First Friday of each calendar month that falls within the block
function getFirstFridaysInBlock(startStr, endStr) {
  if (!startStr || !endStr) return [];
  const result = [];
  const start = parseDate(startStr);
  const end   = parseDate(endStr);
  let month = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (month <= lastMonth) {
    const d = new Date(month);
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1); // advance to Friday
    if (d >= start && d <= end) result.push(toDateStr(d));
    month.setMonth(month.getMonth() + 1);
  }
  return result;
}

// Conferences (from AY-level data) that overlap with the given block range
function getConferencesInBlock(startStr, endStr, ayConf = {}) {
  if (!startStr || !endStr) return [];
  const blockStart = parseDate(startStr);
  const blockEnd   = parseDate(endStr);
  const confs = [
    { key: 'acep',  name: 'ACEP',  who: 'PGY-3 attend',  start: ayConf.acepStart, end: ayConf.acepEnd  },
    { key: 'ite',   name: 'ITE',   who: 'All EM Home',   start: ayConf.iteDate,   end: ayConf.iteDate  },
    { key: 'aaem',  name: 'AAEM',  who: 'PGY-2 attend',  start: ayConf.aaemStart, end: ayConf.aaemEnd  },
    { key: 'saem',  name: 'SAEM',  who: 'PGY-1 attend',  start: ayConf.saemStart, end: ayConf.saemEnd  },
  ];
  return confs.filter(c => {
    if (!c.start) return false;
    const cs = parseDate(c.start);
    const ce = parseDate(c.end || c.start);
    return cs <= blockEnd && ce >= blockStart;
  });
}

const DEFAULT_AY_CONF = { acepStart:'', acepEnd:'', iteDate:'', aaemStart:'', aaemEnd:'', saemStart:'', saemEnd:'' };

function makeDefaultBlock() {
  return {
    id: `blk_${Date.now()}`, name: '', academicYear: getAcademicYear(),
    startDate: '', endDate: '',
    emBlockAssignments: {},   // { [residentId]: { blockType, isChief } }
    offServiceResidents: [],
    schedule: {},
    specialDays: { codeBlueDays: [], advocacyDays: [], procDays: [], anesDays: [] },
    conferences: { acepStart:'', acepEnd:'', iteDate:'', aaemStart:'', aaemEnd:'', saemStart:'', saemEnd:'' },
  };
}

// ─── ELIGIBILITY LOGIC ────────────────────────────────────────────────────────

function getEligibleShifts(resident, dateStr, specialDays = {}, eligOverrides = {}) {
  if (!isSchedulable(resident)) return [];
  // Approved days off — resident blocked entirely
  if ((resident.approvedDatesOff || []).includes(dateStr)) return [];
  const date = parseDate(dateStr);
  const dow = date.getDay();
  const key = eligKey(resident);
  const { category, pgy } = resident;
  const bt = resident.blockType || 'EM';

  let eligible = [...(eligOverrides[key] ?? BASE_ELIGIBILITY[key] ?? [])];

  // ── EM Home ──────────────────────────────────────────────────────────────
  if (category === 'EM_HOME') {
    // GR Wednesday: entire day blocked
    if (dow === 3) return [];

    // PGY-1 Trauma rule: only on Peds/Trauma or Trauma/Peds blocks,
    // and only on Tue(2)/Thu(4)/Sat(6)/Sun(0) on those blocks.
    // *** Peds shifts (PED-D/E/N) are NOT day-restricted — available every eligible day. ***
    if (pgy === 1) {
      if (!TRAUMA_BLOCKS.includes(bt)) {
        // Not a trauma block — no trauma shifts at all
        eligible = eligible.filter(s => s !== 'TRAUMA-D' && s !== 'TRAUMA-N');
      } else {
        // Peds/Trauma block: remove trauma shifts on non-Tue/Thu/Sat/Sun days only.
        // Peds shifts remain in the list regardless of day.
        if (![2, 4, 6, 0].includes(dow)) {
          eligible = eligible.filter(s => s !== 'TRAUMA-D' && s !== 'TRAUMA-N');
        }
      }
    }

    // PGY-2 block-type day restrictions
    if (pgy === 2) {
      // Peds/EM: no Trauma on this block
      if (bt === 'PEDS_EM') {
        eligible = eligible.filter(s => s !== 'TRAUMA-D' && s !== 'TRAUMA-N');
      }
      // EM/EMS: chief schedules Mon/Tue only — Thu/Fri are EMS call (service-arranged)
      if (bt === 'EM_EMS' && ![1, 2].includes(dow)) return [];
      // EM/TOX: chief schedules Thu/Fri only — Mon/Tue are Tox call (service-arranged)
      if (bt === 'EM_TOX' && ![4, 5].includes(dow)) return [];
      // OB/VAC: not scheduled by chief (isSchedulable already handles this)
      if (bt === 'OB_VAC') return [];
    }

    // US/EM block PGY-1: chief schedules Sat/Sun/Mon only, no Mon nights
    if (pgy === 1 && bt === 'US_EM') {
      if (![0, 1, 6].includes(dow)) return [];
      if (dow === 1) eligible = eligible.filter(s => SHIFT_MAP[s]?.type !== 'night');
    }
  }

  // ── EM BAMC ───────────────────────────────────────────────────────────────
  if (category === 'EM_BAMC') {
    if (dow === 3) eligible = eligible.filter(s => SHIFT_MAP[s]?.type === 'day');
    const proc = specialDays.procDays || [];
    if (proc.includes(dateStr)) return [];
    if (proc.includes(toDateStr(addDays(date, 1)))) return [];
  }

  // ── FM PGY-1 ──────────────────────────────────────────────────────────────
  if (category === 'FM' && pgy === 1) {
    if (dow === 3 || dow === 4) return [];
    if (dow === 2) eligible = eligible.filter(s => SHIFT_MAP[s]?.type !== 'night');
  }

  // ── FM PGY-3 ──────────────────────────────────────────────────────────────
  if (category === 'FM' && pgy === 3) {
    if (![1, 2, 3].includes(dow)) return [];
    // base eligibility is PED-N only
  }

  // ── IM PGY-2 ──────────────────────────────────────────────────────────────
  if (category === 'IM') {
    if (resident.isCCUNights) {
      if (dow === 2 || dow === 3) return [];
    } else {
      if (dow === 3) eligible = eligible.filter(s => SHIFT_MAP[s]?.type === 'day');
    }
    const cb = specialDays.codeBlueDays || [];
    if (cb.includes(dateStr) || cb.includes(toDateStr(addDays(date, 1)))) return [];
  }

  // ── Neurology PGY-1 ───────────────────────────────────────────────────────
  if (category === 'NEURO' && (dow === 3 || dow === 5)) return [];

  // ── Anesthesiology PGY-1 ─────────────────────────────────────────────────
  if (category === 'ANES') {
    if (dow === 3) eligible = eligible.filter(s => SHIFT_MAP[s]?.type === 'day');
    if ((specialDays.anesDays || []).includes(dateStr)) return [];
  }

  // ── Psychiatry PGY-1 ─────────────────────────────────────────────────────
  if (category === 'PSYCH') {
    if (dow === 2) return [];
    if (dow === 1) eligible = eligible.filter(s => SHIFT_MAP[s]?.type !== 'night');
    if (dow === 3) eligible = eligible.filter(s => SHIFT_MAP[s]?.type === 'day');
  }

  // ── Podiatry PGY-1 ───────────────────────────────────────────────────────
  if (category === 'POD') {
    if (dow === 6 || dow === 0) return [];
    if (dow === 5) eligible = eligible.filter(s => SHIFT_MAP[s]?.type !== 'night');
    if (dow === 1) eligible = eligible.filter(s => SHIFT_MAP[s]?.type !== 'day');
    if (dow === 3) eligible = eligible.filter(s => SHIFT_MAP[s]?.type === 'day');
  }

  // ── Pediatrics ────────────────────────────────────────────────────────────
  if (category === 'PEDS') {
    const tmrw = toDateStr(addDays(date, 1));
    if ((specialDays.advocacyDays || []).includes(tmrw)) return [];
  }

  return eligible;
}

function validateAll(allResidents, schedule, block, eligOverrides = {}) {
  const issues = [];
  const sd = block.specialDays || {};
  for (const resident of allResidents) {
    const rs = schedule[resident.id] || {};
    const name = `${resident.firstName} ${resident.lastName}`;
    const key = eligKey(resident);
    for (const [ds, sid] of Object.entries(rs)) {
      if (!sid) continue;
      // Approved day off — highest-priority violation
      if ((resident.approvedDatesOff || []).includes(ds)) {
        issues.push({ residentId: resident.id, name, dateStr: ds, shiftId: sid,
          message: 'Shift scheduled on an approved day off', level: 'error' });
        continue;
      }
      const elig = getEligibleShifts(resident, ds, sd, eligOverrides);
      if (!elig.includes(sid)) {
        const dow = parseDate(ds).getDay();
        let msg = 'Shift not eligible for this resident on this day';
        if (resident.category === 'EM_HOME' && dow === 3) msg = 'GR Wednesday — EM Home not schedulable in ED';
        else if (!SHIFT_MAP[sid]) msg = 'Unknown shift type';
        issues.push({ residentId: resident.id, name, dateStr: ds, shiftId: sid, message: msg, level: 'error' });
      }
    }
    const target = resident.isChief ? 16 : (SHIFT_TARGETS[key] ?? null);
    if (target != null) {
      const count = Object.values(rs).filter(Boolean).length;
      if (count > target)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `Over target: ${count}/${target} shifts`, level: 'warn' });
    }

    // PGY-2 soft trauma cap: 2–3 per month
    if (resident.category === 'EM_HOME' && resident.pgy === 2) {
      const traumaCount = Object.values(rs).filter(s => s === 'TRAUMA-D' || s === 'TRAUMA-N').length;
      if (traumaCount > 3)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `Trauma shifts: ${traumaCount} — PGY-2 target is 2–3/month (max 3)`, level: 'warn' });
    }

    // Rest-period check — sort all assignments by start time, then check each consecutive pair
    const assignments = Object.entries(rs)
      .filter(([, sid]) => sid && SHIFT_TIMING[sid])
      .map(([ds, sid]) => ({
        ds, sid,
        startMs: shiftStartMs(sid, ds),
        endMs:   shiftEndMs(sid, ds),
        durationH: SHIFT_TIMING[sid].durationH,
      }))
      .sort((a, b) => a.startMs - b.startMs);

    for (let i = 0; i < assignments.length - 1; i++) {
      const a = assignments[i];
      const b = assignments[i + 1];

      if (a.endMs > b.startMs) {
        // Shifts overlap
        issues.push({ residentId: resident.id, name, dateStr: b.ds, shiftId: b.sid,
          message: `Overlap: ${a.sid} (${formatDisplayDate(a.ds)}) and ${b.sid} (${formatDisplayDate(b.ds)}) overlap`,
          level: 'error' });
      } else {
        const gapH = (b.startMs - a.endMs) / 3_600_000;
        if (gapH < a.durationH) {
          const gapStr = gapH % 1 === 0 ? `${gapH}h` : `${gapH.toFixed(1)}h`;
          issues.push({ residentId: resident.id, name, dateStr: b.ds, shiftId: b.sid,
            message: `Rest violation: ${gapStr} off after ${a.sid} (${formatDisplayDate(a.ds)}) — ` +
                     `${a.durationH}h shift requires ${a.durationH}h rest before next shift`,
            level: 'error' });
        }
      }
    }
  }
  return issues;
}

// ─── HOOKS ────────────────────────────────────────────────────────────────────

function useLocalStorage(key, def) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(val)); }, [key, val]);
  return [val, setVal];
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh] ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const s = { amber:'bg-amber-50 border-amber-300 text-amber-800', red:'bg-rose-50 border-rose-300 text-rose-800', green:'bg-emerald-50 border-emerald-300 text-emerald-800' };
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium border ${s[toast.tone] || s.amber}`}>
      <span>{toast.msg}</span>
      <button onClick={onClose} className="ml-1 opacity-50 hover:opacity-100"><X size={14}/></button>
    </div>
  );
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ─── SPECIAL DAYS LIST ────────────────────────────────────────────────────────

function SpecialDaysList({ label, hint, dates = [], onUpdate, chipClass = 'bg-gray-100 text-gray-700 border border-gray-200' }) {
  const [newDate, setNewDate] = useState('');

  function add() {
    if (!newDate || dates.includes(newDate)) { setNewDate(''); return; }
    onUpdate([...dates, newDate].sort());
    setNewDate('');
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-0.5">{label}</p>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
        {dates.length === 0
          ? <span className="text-xs text-gray-300 italic">None set</span>
          : dates.map(d => (
            <span key={d} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${chipClass}`}>
              {formatDisplayDate(d)}
              <button onClick={() => onUpdate(dates.filter(x => x !== d))} className="hover:opacity-60 transition-opacity">
                <X size={10}/>
              </button>
            </span>
          ))
        }
      </div>
      <div className="flex items-center gap-1.5">
        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white" />
        <button onClick={add} disabled={!newDate}
          className="text-xs px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-30 transition-colors font-medium">
          Add
        </button>
      </div>
    </div>
  );
}

// ─── DASHBOARD TAB ────────────────────────────────────────────────────────────

function DashboardTab({ block, updateBlock, allResidents, ayConf, violationCount }) {
  const progress     = getBlockProgress(block.startDate, block.endDate);
  const confsInBlock = getConferencesInBlock(block.startDate, block.endDate, ayConf);
  const firstFridays = getFirstFridaysInBlock(block.startDate, block.endDate);
  const sd           = block.specialDays || {};
  const schedule     = block.schedule || {};

  const shiftCount = Object.values(schedule).reduce((s, d) => s + Object.values(d).filter(Boolean).length, 0);
  const schedulableCount = allResidents.filter(r => isSchedulable(r)).length;

  function updSD(field, newDates) {
    updateBlock(b => ({ ...b, specialDays: { ...(b.specialDays || {}), [field]: newDates } }));
  }

  const CONF_COLORS = { acep:'bg-red-100 text-red-700 border-red-200', ite:'bg-amber-100 text-amber-700 border-amber-200',
                        aaem:'bg-blue-100 text-blue-700 border-blue-200', saem:'bg-purple-100 text-purple-700 border-purple-200' };

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Block Overview */}
      <SectionCard title="Block Overview">
        {!block.startDate ? (
          <p className="text-sm text-gray-400 italic">No block dates set — go to Settings to set start/end dates.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-semibold text-gray-900 text-base">{block.name || 'Unnamed Block'}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {prettyDate(block.startDate)} → {prettyDate(block.endDate)}
                  <span className="text-gray-400 ml-2">· {block.academicYear}</span>
                </p>
                <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
                  <span>{schedulableCount} schedulable residents</span>
                  <span>{shiftCount} shifts assigned</span>
                  {violationCount > 0 && (
                    <span className="text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle size={11}/> {violationCount} violation{violationCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              {progress && (
                <div className="text-right shrink-0">
                  {progress.elapsed === 0
                    ? <p className="text-sm text-gray-500">Starts in {progress.remaining} day{progress.remaining !== 1 ? 's' : ''}</p>
                    : progress.remaining === 0
                    ? <p className="text-sm text-gray-500">Block complete</p>
                    : <p className="text-sm text-gray-700 font-medium">Day {progress.elapsed} of {progress.total}</p>
                  }
                  <p className="text-xs text-gray-400">{progress.remaining} day{progress.remaining !== 1 ? 's' : ''} remaining</p>
                </div>
              )}
            </div>
            {progress && (
              <div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${progress.pct}%` }}/>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{progress.pct}% complete</p>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Conferences in this block */}
      <SectionCard title="Conferences This Block"
        subtitle={confsInBlock.length === 0 ? 'No conferences fall within this block period.' : `${confsInBlock.length} conference${confsInBlock.length !== 1 ? 's' : ''} overlap this block — modified shift schedule applies to non-attending EM Home residents.`}>
        {confsInBlock.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            {Object.values(ayConf).some(Boolean)
              ? 'All AY conferences fall outside this block period.'
              : 'No conference dates set for this academic year — add them in the Home tab under the AY folder.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {confsInBlock.map(c => (
              <div key={c.key} className={`flex flex-col px-3 py-2 rounded-xl border text-sm font-medium ${CONF_COLORS[c.key] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                <span className="font-bold">{c.name}</span>
                <span className="text-xs opacity-75">{prettyDate(c.start)}{c.end && c.end !== c.start ? ` – ${prettyDate(c.end)}` : ''}</span>
                <span className="text-xs opacity-75">{c.who}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 1st Fridays */}
      {firstFridays.length > 0 && (
        <SectionCard title="First Fridays This Block"
          subtitle="Anesthesia: off 2–4pm social hour. ⚠ Full rule TBD.">
          <div className="flex flex-wrap gap-2">
            {firstFridays.map(d => (
              <span key={d} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 border border-violet-200 text-sm font-medium text-violet-700">
                <CalendarDays size={13}/>
                {formatDisplayDate(d)}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Special days for this block — editable */}
      <SectionCard title="Special Days" subtitle="Days with schedule restrictions. Changes take effect immediately in the schedule grid.">
        <div className="space-y-5">
          <SpecialDaysList
            label="IM Code Blue Days"
            hint="IM resident off night before + day of"
            dates={sd.codeBlueDays || []}
            onUpdate={d => updSD('codeBlueDays', d)}
            chipClass="bg-red-100 text-red-700 border border-red-200"
          />
          <SpecialDaysList
            label="Peds Advocacy Days"
            hint="Peds resident off the night before"
            dates={sd.advocacyDays || []}
            onUpdate={d => updSD('advocacyDays', d)}
            chipClass="bg-emerald-100 text-emerald-700 border border-emerald-200"
          />
          <SpecialDaysList
            label="BAMC Procedure Days"
            hint="BAMC resident off night before + day of (may work night-of if critical)"
            dates={sd.procDays || []}
            onUpdate={d => updSD('procDays', d)}
            chipClass="bg-sky-100 text-sky-700 border border-sky-200"
          />
          <SpecialDaysList
            label="Anesthesia US Days"
            hint="Anesthesia resident off these days (email Gardner annually for dates)"
            dates={sd.anesDays || []}
            onUpdate={d => updSD('anesDays', d)}
            chipClass="bg-violet-100 text-violet-700 border border-violet-200"
          />
        </div>
      </SectionCard>

    </div>
  );
}

// ─── HOME TAB ─────────────────────────────────────────────────────────────────

// Inline conference-date editor inside the AY folder
function AYConferenceEditor({ ay, conf, onUpdate }) {
  const [open, setOpen] = useState(false);
  const set = (f, v) => onUpdate({ ...conf, [f]: v });

  // One-line summary of what's set
  const parts = [
    conf.acepStart && `ACEP ${prettyDate(conf.acepStart)}`,
    conf.iteDate   && `ITE ${prettyDate(conf.iteDate)}`,
    conf.aaemStart && `AAEM ${prettyDate(conf.aaemStart)}`,
    conf.saemStart && `SAEM ${prettyDate(conf.saemStart)}`,
  ].filter(Boolean);

  return (
    <div className="bg-indigo-50 border-b border-indigo-100">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-indigo-100 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays size={13} className="text-indigo-500 shrink-0"/>
          <span className="text-xs font-semibold text-indigo-700">Conference &amp; ITE Dates</span>
          {parts.length > 0
            ? <span className="text-xs text-indigo-500 truncate">{parts.join(' · ')}</span>
            : <span className="text-xs text-indigo-400 italic">Not set — click to add</span>}
        </div>
        <ChevronDown size={13} className={`text-indigo-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>

      {open && (
        <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
          {[
            { f1:'acepStart', f2:'acepEnd', l:'ACEP', h:'PGY-3 · ~Oct 5–8', range:true  },
            { f1:'iteDate',   f2:null,      l:'ITE Exam', h:'All EM Home · ~Feb 24', range:false },
            { f1:'aaemStart', f2:'aaemEnd', l:'AAEM', h:'PGY-2 · ~Apr 25–29', range:true  },
            { f1:'saemStart', f2:'saemEnd', l:'SAEM', h:'PGY-1 · ~May 18–21', range:true  },
          ].map(({ f1, f2, l, h, range }) => (
            <div key={f1}>
              <label className="block text-xs font-medium text-gray-600 mb-0.5">{l} <span className="text-gray-400 font-normal">({h})</span></label>
              {range ? (
                <div className="flex items-center gap-1">
                  <input type="date" value={conf[f1]||''} onChange={e=>set(f1,e.target.value)}
                    className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white flex-1"/>
                  <span className="text-gray-400 text-xs">–</span>
                  <input type="date" value={conf[f2]||''} onChange={e=>set(f2,e.target.value)}
                    className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white flex-1"/>
                </div>
              ) : (
                <input type="date" value={conf[f1]||''} onChange={e=>set(f1,e.target.value)}
                  className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white w-full"/>
              )}
            </div>
          ))}
          <div className="col-span-2 flex justify-end pt-1">
            <button onClick={() => setOpen(false)}
              className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HomeTab({ block, updateBlock, emRoster, blocksHistory, ayData, updateAyData, onContinue, onLoadBlock, onSaveBlock, onNewBlock }) {
  const shiftCount = Object.values(block.schedule || {}).reduce((s,d) => s + Object.values(d).filter(Boolean).length, 0);
  const resCount   = emRoster.length + (block.offServiceResidents || []).length;
  const daysInBlock = getBlockDates(block.startDate, block.endDate).length;
  const sd = block.specialDays || {};

  // Group history by AY; also include AYs from ayData with no blocks yet
  const byYear = useMemo(() => {
    const m = {};
    for (const b of blocksHistory) { const ay = b.academicYear || 'Unknown'; (m[ay] = m[ay] || []).push(b); }
    for (const ay of Object.keys(ayData)) { if (!m[ay]) m[ay] = []; }
    return Object.entries(m).sort(([a],[b]) => b.localeCompare(a));
  }, [blocksHistory, ayData]);

  const [openYears, setOpenYears] = useState(() => {
    const i = {};
    for (const b of blocksHistory) i[b.academicYear || 'Unknown'] = true;
    for (const ay of Object.keys(ayData)) i[ay] = true;
    return i;
  });

  useEffect(() => {
    if (block.academicYear) setOpenYears(p => ({ ...p, [block.academicYear]: true }));
  }, [block.academicYear]);

  function toggleYear(y) { setOpenYears(p => ({ ...p, [y]: !p[y] })); }

  function setField(f, v) { updateBlock(b => ({ ...b, [f]: v })); }

  function onStartDateChange(s) {
    updateBlock(b => ({
      ...b,
      startDate: s,
      // Auto-set end to start+27 days (28-day block) if end is blank or was auto-set
      endDate: s ? toDateStr(addDays(parseDate(s), 27)) : b.endDate,
      // Auto-populate AY if not already set
      academicYear: b.academicYear || getAcademicYear(),
    }));
  }

  function updSD(field, dates) {
    updateBlock(b => ({ ...b, specialDays: { ...(b.specialDays || {}), [field]: dates } }));
  }

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Current Block — inline editable form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Current Block</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {resCount > 0 || shiftCount > 0
                ? `${resCount} resident${resCount !== 1 ? 's' : ''} · ${shiftCount} shift${shiftCount !== 1 ? 's' : ''} assigned`
                : 'Set dates below to start scheduling'}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={onSaveBlock}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
              <Save size={12}/> Save Block
            </button>
            <button onClick={onNewBlock}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors">
              <Plus size={12}/> New Block
            </button>
          </div>
        </div>

        {/* Block identity + dates grid — always visible, always editable */}
        <div className="px-5 pt-4 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Block Name</label>
              <input className="input-field" placeholder="e.g. Block 3 — Jun/Jul 2026"
                value={block.name || ''} onChange={e => setField('name', e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
              <input className="input-field" placeholder={getAcademicYear()}
                value={block.academicYear || ''} onChange={e => setField('academicYear', e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input type="date" className="input-field"
                value={block.startDate || ''} onChange={e => onStartDateChange(e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
              <input type="date" className="input-field"
                value={block.endDate || ''} onChange={e => setField('endDate', e.target.value)}/>
            </div>
          </div>

          {/* Days-in-block indicator */}
          {daysInBlock > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              {daysInBlock} days · {prettyDate(block.startDate)} → {prettyDate(block.endDate)}
            </p>
          )}
        </div>

        {/* Special Days — inline chip editors */}
        <div className="px-5 pb-4 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Special Days This Block</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <SpecialDaysList label="IM Code Blue Days" hint="IM off night before + day of"
              dates={sd.codeBlueDays || []} onUpdate={d => updSD('codeBlueDays', d)}
              chipClass="bg-red-100 text-red-700 border border-red-200"/>
            <SpecialDaysList label="Peds Advocacy Days" hint="Peds off night before"
              dates={sd.advocacyDays || []} onUpdate={d => updSD('advocacyDays', d)}
              chipClass="bg-emerald-100 text-emerald-700 border border-emerald-200"/>
            <SpecialDaysList label="BAMC Procedure Days" hint="BAMC off night before + day of"
              dates={sd.procDays || []} onUpdate={d => updSD('procDays', d)}
              chipClass="bg-sky-100 text-sky-700 border border-sky-200"/>
            <SpecialDaysList label="Anesthesia US Days" hint="Anesthesia off these days"
              dates={sd.anesDays || []} onUpdate={d => updSD('anesDays', d)}
              chipClass="bg-violet-100 text-violet-700 border border-violet-200"/>
          </div>
        </div>

        {/* Go to Schedule */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">
            {!block.startDate ? 'Set start date above to begin' : `Ready · ${daysInBlock} day block`}
          </span>
          <button onClick={onContinue} disabled={!block.startDate}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition-colors">
            Go to Schedule <ChevronRight size={14}/>
          </button>
        </div>
      </div>

      {/* Saved Blocks — grouped by AY */}
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-700">Academic Years</h3>
          <p className="text-xs text-gray-400">Conference & ITE dates are set per AY</p>
        </div>

        {byYear.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400 italic">
            No saved blocks yet. Click "Save Block" above to archive the current block.
          </div>
        ) : byYear.map(([year, blocks]) => (
          <div key={year} className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">

            {/* AY folder header */}
            <button onClick={() => toggleYear(year)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
              <div className="flex items-center gap-2.5">
                <Archive size={14} className="text-slate-500"/>
                <span className="font-bold text-slate-800 text-sm">{year}</span>
                <span className="text-xs text-slate-400">{blocks.length} block{blocks.length !== 1 ? 's' : ''}</span>
                {year === block.academicYear && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">Current</span>
                )}
              </div>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${openYears[year] ? 'rotate-180' : ''}`}/>
            </button>

            {openYears[year] && (
              <div className="bg-white">
                {/* Conference dates for this AY — inline editable */}
                <AYConferenceEditor
                  ay={year}
                  conf={ayData[year] || { ...DEFAULT_AY_CONF }}
                  onUpdate={conf => updateAyData(year, conf)}
                />

                {/* Blocks within this AY */}
                {blocks.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-gray-400 italic">No saved blocks for this year yet.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {blocks.map(b => (
                      <div key={b.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 text-sm truncate">{b.name || 'Unnamed'}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {b.startDate && <>{prettyDate(b.startDate)} → {prettyDate(b.endDate)} · </>}
                            {b.residentCount} residents · {b.shiftCount} shifts
                            {b.savedAt && <> · saved {new Date(b.savedAt).toLocaleDateString()}</>}
                          </div>
                        </div>
                        <button onClick={() => onLoadBlock(b)}
                          className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shrink-0">
                          Load
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RESIDENT FORM (shared by Add + Edit modals) ─────────────────────────────

function ResidentForm({ initial, onSubmit, onClose, title, submitLabel, persistentOnly = false, lockCategory = false, lockPgy = false }) {
  const availCats = persistentOnly
    ? CATEGORIES.filter(c => c.persistent)
    : CATEGORIES.filter(c => !c.persistent);

  const [form, setForm] = useState({
    firstName:        initial?.firstName        ?? '',
    lastName:         initial?.lastName         ?? '',
    category:         initial?.category         ?? availCats[0]?.id ?? 'EM_HOME',
    pgy:              initial?.pgy              ?? availCats[0]?.pgyOptions[0] ?? 1,
    isCCUNights:      initial?.isCCUNights      ?? false,
    approvedDatesOff: initial?.approvedDatesOff ?? [],
  });

  const [newOffDate, setNewOffDate] = useState('');

  function addOffDate() {
    const d = newOffDate;
    if (!d || form.approvedDatesOff.includes(d)) { setNewOffDate(''); return; }
    set('approvedDatesOff', [...form.approvedDatesOff, d].sort());
    setNewOffDate('');
  }
  function removeOffDate(d) { set('approvedDatesOff', form.approvedDatesOff.filter(x => x !== d)); }

  const catObj  = CAT_MAP[form.category];
  const pgyOpts = catObj?.pgyOptions || [1];

  function set(f, v) {
    setForm(p => {
      const n = { ...p, [f]: v };
      // Reset PGY when category changes (unless PGY is locked)
      if (f === 'category' && !lockPgy) {
        const opts = CAT_MAP[v]?.pgyOptions || [1];
        n.pgy = opts[0];
      }
      return n;
    });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    onSubmit({
      firstName:        form.firstName.trim(),
      lastName:         form.lastName.trim(),
      category:         form.category,
      pgy:              Number(form.pgy),
      isCCUNights:      form.isCCUNights,
      approvedDatesOff: form.approvedDatesOff,
    });
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {/* Name */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
            <input className="input-field" value={form.firstName} onChange={e => set('firstName', e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
            <input className="input-field" value={form.lastName} onChange={e => set('lastName', e.target.value)} required />
          </div>
        </div>

        {/* Category — locked = show badge only */}
        {lockCategory ? (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <span className={`inline-flex items-center text-xs px-3 py-1.5 rounded-lg font-medium ${catObj?.badge}`}>
              {catObj?.label}
            </span>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <select className="input-field" value={form.category} onChange={e => set('category', e.target.value)}>
              {availCats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        )}

        {/* PGY — locked = show badge only */}
        {lockPgy ? (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">PGY Level</label>
            <span className="inline-flex items-center text-sm px-3 py-1.5 rounded-lg font-semibold bg-indigo-100 text-indigo-800">
              PGY-{form.pgy}
            </span>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">PGY Level</label>
            <div className="flex gap-2">
              {pgyOpts.map(p => (
                <button key={p} type="button" onClick={() => set('pgy', p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.pgy === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                  }`}>
                  PGY-{p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CCU nights (IM only) */}
        {form.category === 'IM' && (
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox" checked={form.isCCUNights} onChange={e => set('isCCUNights', e.target.checked)} className="rounded" />
            Covering CCU nights this block (blocks Tue/Wed)
          </label>
        )}

        {/* Approved Dates Off */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Approved Dates Off</label>
          <p className="text-xs text-gray-400 mb-2">Resident is unavailable these dates — blocked in the schedule grid</p>
          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[22px]">
            {form.approvedDatesOff.length === 0
              ? <span className="text-xs text-gray-300 italic">None set</span>
              : form.approvedDatesOff.map(d => (
                <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                  {formatDisplayDate(d)}
                  <button type="button" onClick={() => removeOffDate(d)} className="hover:opacity-60"><X size={10}/></button>
                </span>
              ))
            }
          </div>
          <div className="flex items-center gap-1.5">
            <input type="date" value={newOffDate} onChange={e => setNewOffDate(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOffDate())}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white" />
            <button type="button" onClick={addOffDate} disabled={!newOffDate}
              className="text-xs px-2.5 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-30 transition-colors font-medium">
              Add
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">Cancel</button>
          <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">{submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

// Add wrapper — generates a new id on submit
function AddResidentModal({ onClose, onAdd, persistentOnly = false, initialCategory, initialPgy }) {
  const lockCategory = !!initialCategory;
  const lockPgy      = !!initialPgy;
  const cats = persistentOnly ? CATEGORIES.filter(c => c.persistent) : CATEGORIES.filter(c => !c.persistent);
  const startCat = initialCategory ?? cats[0]?.id ?? 'EM_HOME';
  const startPgy = initialPgy ?? CAT_MAP[startCat]?.pgyOptions[0] ?? 1;

  return (
    <ResidentForm
      title={persistentOnly ? 'Add EM Resident' : `Add ${CAT_MAP[startCat]?.label ?? 'Resident'}`}
      submitLabel="Add Resident"
      persistentOnly={persistentOnly}
      lockCategory={lockCategory}
      lockPgy={lockPgy}
      initial={{ category: startCat, pgy: startPgy }}
      onClose={onClose}
      onSubmit={data => { onAdd({ id: uuid(), ...data, blockType: 'EM' }); onClose(); }}
    />
  );
}

// Edit wrapper — pre-fills from existing resident
function EditResidentModal({ resident, persistentOnly = false, onClose, onSave }) {
  return (
    <ResidentForm
      title={`Edit — ${resident.firstName} ${resident.lastName}`}
      submitLabel="Save Changes"
      persistentOnly={persistentOnly}
      lockCategory={!persistentOnly}   // off-service: category locked (don't reassign specialty mid-block)
      lockPgy={false}
      initial={resident}
      onClose={onClose}
      onSubmit={data => { onSave({ ...resident, ...data }); onClose(); }}
    />
  );
}

// ─── EM RESIDENTS TAB ─────────────────────────────────────────────────────────

function EMResidentsTab({ emRoster, setEmRoster, block, updateBlock }) {
  // showAdd: null | { pgy, category }
  const [showAdd, setShowAdd]         = useState(null);
  const [editResident, setEditResident] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const assign = block.emBlockAssignments || {};
  const sched  = block.schedule || {};

  function addRes(r)  { setEmRoster(p => [...p, r]); }

  function saveEdit(updated) {
    setEmRoster(p => p.map(r => r.id === updated.id ? updated : r));
  }

  function removeRes(id) {
    setEmRoster(p => p.filter(r => r.id !== id));
    updateBlock(b => {
      const s = { ...b.schedule };          delete s[id];
      const a = { ...b.emBlockAssignments }; delete a[id];
      return { ...b, schedule: s, emBlockAssignments: a };
    });
    setConfirmRemove(null);
  }

  function setBA(id, field, value) {
    updateBlock(b => ({
      ...b,
      emBlockAssignments: { ...b.emBlockAssignments, [id]: { ...(b.emBlockAssignments[id] || {}), [field]: value } },
    }));
  }

  function shiftCount(id) { return Object.values(sched[id] || {}).filter(Boolean).length; }
  function target(r) { const ba = assign[r.id] || {}; return ba.isChief ? 16 : (SHIFT_TARGETS[eligKey(r)] ?? null); }

  const byPGY = [1, 2, 3].map(pgy => ({ pgy, list: emRoster.filter(r => r.pgy === pgy) })).filter(g => g.list.length);
  const [collapsed, setCollapsed] = useState({});
  const toggle = key => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="space-y-5">
      {/* Header + per-PGY / BAMC add buttons */}
      <div>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-gray-800">EM Home Residents</h2>
          <p className="text-xs text-gray-500 mt-0.5">Permanent roster — set each resident's rotation for this block</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-medium shrink-0">Add:</span>
          {[1, 2, 3].map(pgy => (
            <button key={pgy} onClick={() => setShowAdd({ pgy, category: 'EM_HOME' })}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
              <Plus size={11}/> EM PGY-{pgy}
            </button>
          ))}
        </div>
      </div>

      {emRoster.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
          No EM residents yet — use the Add buttons above
        </div>
      ) : byPGY.map(({ pgy, list }) => {
        const key = `pgy-${pgy}`;
        const isCollapsed = !!collapsed[key];
        const schedulableCount = list.filter(r => { const bt = BLOCK_TYPE_MAP[r.blockType || (assign[r.id]?.blockType) || 'EM']; return bt?.schedulable; }).length;
        return (
        <div key={pgy} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {/* Collapsible group header */}
          <button onClick={() => toggle(key)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">PGY-{pgy}</span>
              <span className="text-xs text-gray-400">{list.length} resident{list.length !== 1 ? 's' : ''}</span>
              {schedulableCount < list.length && (
                <span className="text-xs text-gray-400">{schedulableCount} schedulable</span>
              )}
            </div>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}/>
          </button>
          {!isCollapsed && (
          <div className="p-3 space-y-2">
            {list.map(res => {
              const ba      = assign[res.id] || {};
              const bt      = ba.blockType || 'EM';
              const btObj   = BLOCK_TYPE_MAP[bt];
              const sched_ok = btObj?.schedulable ?? false;
              const cnt     = shiftCount(res.id);
              const tgt     = target(res);
              const over    = tgt != null && cnt > tgt;
              const cat     = CAT_MAP[res.category];
              return (
                <div key={res.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{res.firstName} {res.lastName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat?.badge}`}>{cat?.shortLabel} PGY-{res.pgy}</span>
                        {ba.isChief && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-medium">Chief ★</span>}
                        {!sched_ok && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{btObj?.atUH ? 'not chief-sched' : 'away'}</span>}
                      </div>
                      {res.approvedDatesOff?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {res.approvedDatesOff.map(d => (
                            <span key={d} className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200 font-medium">{formatDisplayDate(d)} off</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Edit + Remove */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => setEditResident(res)} title="Edit profile"
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                        <Edit2 size={13}/>
                      </button>
                      <button onClick={() => setConfirmRemove(res.id)} title="Remove resident"
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 shrink-0">Rotation:</label>
                      <select value={bt} onChange={e => setBA(res.id, 'blockType', e.target.value)}
                        className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
                        {BLOCK_TYPES_EM
                          .filter(b => (EM_HOME_BLOCK_TYPES_BY_PGY[res.pgy] || []).includes(b.id))
                          .map(b => (
                            <option key={b.id} value={b.id}>{b.label}{!b.atUH ? ' (away)' : !b.schedulable ? ' (not sched)' : ''}</option>
                          ))
                        }
                      </select>
                    </div>
                    {res.pgy === 3 && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                        <input type="checkbox" checked={!!ba.isChief} onChange={e => setBA(res.id, 'isChief', e.target.checked)} className="rounded"/>
                        Chief (16 shifts)
                      </label>
                    )}
                    {tgt != null && sched_ok && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className={`text-xs font-medium ${over ? 'text-red-500' : 'text-gray-400'}`}>{cnt}/{tgt}</span>
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${over ? 'bg-red-500' : cnt >= tgt ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                            style={{ width: `${Math.min(100, tgt ? cnt / tgt * 100 : 0)}%` }}/>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
        );
      })}

      {showAdd && (
        <AddResidentModal persistentOnly
          initialCategory={showAdd.category}
          initialPgy={showAdd.pgy}
          onClose={() => setShowAdd(null)}
          onAdd={addRes}/>
      )}
      {editResident && (
        <EditResidentModal persistentOnly resident={editResident}
          onClose={() => setEditResident(null)}
          onSave={saveEdit}/>
      )}
      {confirmRemove && (
        <Modal title="Remove Resident" onClose={() => setConfirmRemove(null)}>
          <p className="text-sm text-gray-600 mb-4">Permanently removes from EM roster and clears their shifts this block.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmRemove(null)} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">Cancel</button>
            <button onClick={() => removeRes(confirmRemove)} className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Remove</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── OFF-SERVICE TAB ──────────────────────────────────────────────────────────

function OffServiceTab({ block, updateBlock }) {
  // showAdd: null | { category }
  const [showAdd, setShowAdd]           = useState(null);
  const [editResident, setEditResident] = useState(null);
  const residents = block.offServiceResidents || [];
  const sched     = block.schedule || {};

  function addRes(r) { updateBlock(b => ({ ...b, offServiceResidents: [...(b.offServiceResidents || []), r] })); }

  function saveEdit(updated) {
    updateBlock(b => ({
      ...b,
      offServiceResidents: b.offServiceResidents.map(r => r.id === updated.id ? updated : r),
    }));
  }

  function removeRes(id) {
    updateBlock(b => {
      const s = { ...b.schedule }; delete s[id];
      return { ...b, offServiceResidents: b.offServiceResidents.filter(r => r.id !== id), schedule: s };
    });
  }

  function setField(id, f, v) {
    updateBlock(b => ({ ...b, offServiceResidents: b.offServiceResidents.map(r => r.id === id ? { ...r, [f]: v } : r) }));
  }

  function shiftCount(id) { return Object.values(sched[id] || {}).filter(Boolean).length; }

  const offServiceCats = CATEGORIES.filter(c => !c.persistent);
  const grouped = offServiceCats
    .map(cat => ({ cat, members: residents.filter(r => r.category === cat.id) }))
    .filter(g => g.members.length);

  const [collapsed, setCollapsed] = useState({});
  const toggle = key => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="space-y-5">
      {/* Header + per-specialty add buttons */}
      <div>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-gray-800">Off-Service Residents</h2>
          <p className="text-xs text-gray-500 mt-0.5">Entered per block — cleared on block reset</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-medium shrink-0">Add:</span>
          {offServiceCats.map(cat => (
            <button key={cat.id} onClick={() => setShowAdd({ category: cat.id })}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${cat.badge}`}>
              <Plus size={11}/> {cat.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {residents.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
          No off-service residents this block — use the Add buttons above
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ cat, members }) => {
            const isCollapsed = !!collapsed[cat.id];
            return (
            <div key={cat.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {/* Collapsible category header */}
              <button onClick={() => toggle(cat.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                <div className="flex items-center gap-2.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cat.badge}`}>{cat.shortLabel}</span>
                  <span className="text-xs font-medium text-gray-700">{cat.label}</span>
                  <span className="text-xs text-gray-400">{members.length} resident{members.length !== 1 ? 's' : ''}</span>
                </div>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}/>
              </button>
              {!isCollapsed && (
              <div className="p-3 space-y-2">
                {members.map(res => {
                  const cnt  = shiftCount(res.id);
                  const tgt  = SHIFT_TARGETS[eligKey(res)] ?? null;
                  const over = tgt != null && cnt > tgt;
                  return (
                    <div key={res.id} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{res.firstName} {res.lastName}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.badge}`}>{cat.shortLabel} PGY-{res.pgy}</span>
                          </div>
                          {res.isCCUNights && <p className="text-xs text-orange-600 mt-0.5 font-medium">CCU nights</p>}
                          {res.approvedDatesOff?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {res.approvedDatesOff.map(d => (
                                <span key={d} className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200 font-medium">{formatDisplayDate(d)} off</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Edit + Remove */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => setEditResident(res)} title="Edit profile"
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                            <Edit2 size={13}/>
                          </button>
                          <button onClick={() => removeRes(res.id)} title="Remove resident"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </div>
                      {/* CCU nights quick-toggle */}
                      {res.category === 'IM' && (
                        <div className="mt-2">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                            <input type="checkbox" checked={!!res.isCCUNights}
                              onChange={e => setField(res.id, 'isCCUNights', e.target.checked)} className="rounded"/>
                            Covering CCU nights (blocks Tue/Wed)
                          </label>
                        </div>
                      )}
                      {tgt != null && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className={`text-xs font-medium ${over ? 'text-red-500' : 'text-gray-400'}`}>{cnt}/{tgt} shifts</span>
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${over ? 'bg-red-500' : cnt >= tgt ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                              style={{ width: `${Math.min(100, tgt ? cnt / tgt * 100 : 0)}%` }}/>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddResidentModal
          initialCategory={showAdd.category}
          onClose={() => setShowAdd(null)}
          onAdd={addRes}/>
      )}
      {editResident && (
        <EditResidentModal resident={editResident}
          onClose={() => setEditResident(null)}
          onSave={saveEdit}/>
      )}
    </div>
  );
}

// ─── SHIFT MATRIX TAB ─────────────────────────────────────────────────────────

function ShiftMatrixTab({ eligOverrides, setEligOverrides }) {
  function effective(k) { return eligOverrides[k] ?? BASE_ELIGIBILITY[k] ?? []; }
  function isElig(k,s) { return effective(k).includes(s); }
  function toggle(k,s) {
    setEligOverrides(p=>{ const cur=[...effective(k)]; const next=cur.includes(s)?cur.filter(x=>x!==s):[...cur,s]; return {...p,[k]:next}; });
  }
  function isModified(k) { return JSON.stringify([...(BASE_ELIGIBILITY[k]||[])].sort()) !== JSON.stringify([...effective(k)].sort()); }
  function resetRow(k) { setEligOverrides(p=>{ const n={...p}; delete n[k]; return n; }); }

  const areaColor = { POD:'text-blue-700 bg-blue-50 border-blue-200', PED:'text-emerald-700 bg-emerald-50 border-emerald-200', FLEX:'text-purple-700 bg-purple-50 border-purple-200', MT:'text-amber-700 bg-amber-50 border-amber-200', TRAUMA:'text-red-700 bg-red-50 border-red-200' };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Shift Eligibility Matrix</h2>
          <p className="text-xs text-gray-500 mt-0.5">Toggle eligibility per resident type. Day-of-week and block-type restrictions are enforced on top of this matrix at scheduling time.</p>
        </div>
        <button onClick={()=>setEligOverrides({})} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors">
          <RefreshCw size={12}/> Reset All
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto schedule-scroll">
          <table className="text-xs border-collapse" style={{minWidth:900}}>
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 w-48 min-w-48 border-b border-r border-gray-200 px-3 py-2 text-left text-gray-500 font-semibold">Resident Type</th>
                {SHIFT_AREAS.map(area=>{
                  const cnt = SHIFTS.filter(s=>s.area===area).length;
                  return <th key={area} colSpan={cnt} className={`border-b border-r border-gray-200 px-2 py-2 text-center font-bold text-xs ${areaColor[area]}`}>{area}</th>;
                })}
                <th className="w-8 bg-gray-50 border-b border-gray-200"/>
              </tr>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-200"/>
                {SHIFTS.map(s=>(
                  <th key={s.id} className="border-b border-r border-gray-100 px-1 py-1.5 text-center" title={s.hours}>
                    <span className={`text-xs px-1 py-0.5 rounded font-bold ${s.chip}`}>{s.type[0].toUpperCase()}</span>
                  </th>
                ))}
                <th className="bg-gray-50 border-b border-gray-200"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MATRIX_ROWS.map(row=>{
                const cat=CAT_MAP[row.catId];
                const mod=isModified(row.key);
                return (
                  <tr key={row.key} className="hover:bg-gray-50 transition-colors">
                    <td className={`sticky left-0 z-10 border-r border-gray-200 px-3 py-2 ${cat?.rowBg||'bg-white'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cat?.badge}`}>{row.sub}</span>
                        <span className="text-gray-700 font-medium">{row.label}</span>
                        {mod && <span className="text-indigo-500 text-xs" title="Modified">✎</span>}
                      </div>
                    </td>
                    {SHIFTS.map(s=>{
                      const checked=isElig(row.key,s.id);
                      return (
                        <td key={s.id} className="border-r border-gray-100 p-0 text-center">
                          <button onClick={()=>toggle(row.key,s.id)} title={`${checked?'Remove':'Add'} ${s.label} for ${row.label} ${row.sub}`}
                            className={`w-full h-9 flex items-center justify-center transition-colors ${checked?'bg-indigo-50 hover:bg-indigo-100':'hover:bg-gray-100'}`}>
                            {checked
                              ? <div className={`w-4 h-4 rounded flex items-center justify-center ${s.chip}`}><Check size={9}/></div>
                              : <div className="w-4 h-4 rounded border-2 border-gray-200"/>}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2">
                      {mod && <button onClick={()=>resetRow(row.key)} title="Reset row"><RefreshCw size={11} className="text-gray-400 hover:text-indigo-600"/></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3 italic">Note: EM Home PGY-1 Trauma Day is in the base matrix but is additionally gated by block type (Peds/Trauma and Trauma/Peds only) and day of week (Tue/Thu/Sat/Sun). See Rules tab for full details.</p>
    </div>
  );
}

// ─── RULES TAB ────────────────────────────────────────────────────────────────

function RulesTab({ allResidents, block, eligOverrides }) {
  const [showAll, setShowAll] = useState(true);
  const [openKeys, setOpenKeys] = useState({});

  // Find which types are active this block
  const activeTypes = useMemo(() => {
    const s = new Set();
    for (const r of allResidents) { if (isSchedulable(r)) s.add(eligKey(r)); }
    return s;
  }, [allResidents]);

  const displayRows = showAll ? MATRIX_ROWS : MATRIX_ROWS.filter(r => activeTypes.has(r.key));

  function toggle(k) { setOpenKeys(p=>({...p,[k]:!p[k]})); }

  const ruleTypeColor = { block:'text-red-700 bg-red-50', restrict:'text-amber-700 bg-amber-50', soft:'text-blue-700 bg-blue-50' };
  const ruleTypeLabel = { block:'Blocked', restrict:'Restricted', soft:'Soft pref' };

  if (displayRows.length === 0 && !showAll) {
    return (
      <div className="text-center py-12 text-gray-400 space-y-3">
        <Shield size={36} className="mx-auto opacity-40"/>
        <p className="text-sm">No schedulable residents active this block.</p>
        <button onClick={()=>setShowAll(true)} className="text-xs text-indigo-600 hover:underline">Show all types anyway</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Scheduling Rules Reference</h2>
          <p className="text-xs text-gray-500 mt-0.5">{showAll ? 'All resident types' : `${displayRows.length} type${displayRows.length!==1?'s':''} active this block`}</p>
        </div>
        <button onClick={()=>setShowAll(p=>!p)} className="text-xs text-indigo-600 hover:underline">
          {showAll ? 'Show active only' : 'Show all types'}
        </button>
      </div>

      {displayRows.map(row => {
        const cat = CAT_MAP[row.catId];
        const rd = RULES_DATA[row.key] || {};
        const effectiveShifts = eligOverrides[row.key] ?? BASE_ELIGIBILITY[row.key] ?? [];
        const isOpen = openKeys[row.key] !== false; // default open

        // Find active residents of this type
        const active = allResidents.filter(r => eligKey(r) === row.key && isSchedulable(r));

        return (
          <div key={row.key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Header */}
            <button onClick={()=>toggle(row.key)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left">
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat?.badge}`}>{row.sub}</span>
                <span className="font-semibold text-gray-800 text-sm">{row.label}</span>
                {active.length > 0 && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                    {active.length} active: {active.map(r=>`${r.lastName}`).join(', ')}
                  </span>
                )}
                {!activeTypes.has(row.key) && (
                  <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">not active this block</span>
                )}
              </div>
              <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen?'rotate-180':''}`}/>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                {/* Target */}
                <div className="pt-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Shift Target</div>
                  <p className="text-sm text-gray-700">{rd.targetNote || '—'}</p>
                </div>

                {/* Eligible shifts */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Eligible Shifts</div>
                  <p className="text-xs text-gray-600 mb-2">{rd.eligSummary}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {effectiveShifts.map(sid=>{
                      const s=SHIFT_MAP[sid];
                      return s ? <span key={sid} className={`text-xs px-2 py-0.5 rounded font-bold ${s.chip}`}>{sid}</span> : null;
                    })}
                    {effectiveShifts.length===0 && <span className="text-xs text-gray-400 italic">None configured</span>}
                  </div>
                  {rd.traumaNote && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2">⚠ {rd.traumaNote}</p>
                  )}
                  {eligOverrides[row.key] && (
                    <p className="text-xs text-indigo-600 mt-1">✎ Matrix overrides are active for this type</p>
                  )}
                </div>

                {/* Day restrictions */}
                {rd.dayRules?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Day-of-Week Restrictions</div>
                    <div className="space-y-1">
                      {rd.dayRules.map((dr,i)=>(
                        <div key={i} className="flex items-start gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${ruleTypeColor[dr.type]||'bg-gray-100 text-gray-600'}`}>
                            {ruleTypeLabel[dr.type]||dr.type}
                          </span>
                          <span className="text-xs text-gray-600 font-medium mr-1">{dr.label}:</span>
                          <span className="text-xs text-gray-600">{dr.rule}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Block-type notes */}
                {rd.blockTypeNotes?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Block-Type Specific Rules</div>
                    <div className="space-y-1">
                      {rd.blockTypeNotes.map((bn,i)=>(
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <div className="flex gap-1 shrink-0 flex-wrap">
                            {bn.ids.map(id=><span key={id} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">{BLOCK_TYPE_MAP[id]?.label||id}</span>)}
                          </div>
                          <span className="text-gray-600">{bn.note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Soft prefs */}
                {rd.softPrefs?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Soft Preferences</div>
                    <ul className="space-y-0.5">
                      {rd.softPrefs.map((p,i)=><li key={i} className="text-xs text-blue-700 flex items-start gap-1"><span>•</span>{p}</li>)}
                    </ul>
                  </div>
                )}

                {/* Special notes */}
                {rd.specialNotes?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Special Notes</div>
                    <ul className="space-y-0.5">
                      {rd.specialNotes.map((n,i)=><li key={i} className="text-xs text-gray-600 flex items-start gap-1"><span>•</span>{n}</li>)}
                    </ul>
                  </div>
                )}

                {/* TBD items */}
                {rd.tbdItems?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">⚠ Pending Clarification</div>
                    <ul className="space-y-0.5">
                      {rd.tbdItems.map((t,i)=><li key={i} className="text-xs text-amber-700 flex items-start gap-1"><span>•</span>{t}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── SHIFT PICKER MODAL ───────────────────────────────────────────────────────

function ShiftPickerModal({ resident, dateStr, currentShift, block, eligOverrides, onSelect, onClose, showToast }) {
  const [pending, setPending] = useState(null);
  const sd = block.specialDays || {};
  const eligible = getEligibleShifts(resident, dateStr, sd, eligOverrides);
  const display = formatDisplayDate(dateStr);
  const name = `${resident.firstName} ${resident.lastName}`;

  function violations(sid) {
    if (!sid) return [];
    const vs = [];
    // 1. Eligibility check
    if (!eligible.includes(sid)) {
      const dow = parseDate(dateStr).getDay();
      vs.push(resident.category === 'EM_HOME' && dow === 3
        ? 'GR Wednesday — EM Home not schedulable in ED'
        : 'Shift not in eligibility matrix for this resident/day combination');
    }
    // 2. Rest-period check against neighbouring shifts in the schedule
    vs.push(...checkRestViolations(resident.id, dateStr, sid, block.schedule || {}));
    return vs;
  }

  const v = violations(pending);

  function confirm() {
    onSelect(pending);
    showToast(`Assigned ${pending} to ${name} on ${display}`, v.length>0?'amber':'green');
    onClose();
  }

  return (
    <Modal title={`${name} — ${display}`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">
        {CAT_MAP[resident.category]?.label} · PGY-{resident.pgy}
        {resident.blockType && resident.category !== 'PEDS' && <> · <span className="font-medium">{BLOCK_TYPE_MAP[resident.blockType]?.label || resident.blockType}</span></>}
        {currentShift && <> · Current: <span className="font-medium">{currentShift}</span></>}
      </p>

      {eligible.length === 0 ? (
        <div className="flex items-center gap-2 text-orange-600 bg-orange-50 rounded-lg p-3 text-sm mb-3">
          <AlertTriangle size={15}/> No eligible shifts on this date.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {eligible.map(sid=>{
            const s=SHIFT_MAP[sid]; const active=pending===sid;
            return (
              <button key={sid} onClick={()=>setPending(active?null:sid)}
                className={`flex flex-col items-start px-3 py-2.5 rounded-lg border-2 text-left transition-all ${active?'border-indigo-500 bg-indigo-50':'border-gray-200 hover:border-indigo-300'}`}>
                <div className="flex items-center gap-2 w-full">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${s.chip}`}>{sid}</span>
                  {active && <CheckCircle size={13} className="text-indigo-500 ml-auto"/>}
                </div>
                <span className="text-xs text-gray-400 mt-0.5">{s.hours}</span>
              </button>
            );
          })}
        </div>
      )}

      {pending && v.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-1.5 text-rose-700 font-medium text-sm mb-1"><AlertCircle size={13}/> Violation detected</div>
          {v.map((w,i)=><p key={i} className="text-xs text-rose-600 ml-4">{w}</p>)}
        </div>
      )}
      {pending && v.length === 0 && (
        <div className="flex items-center gap-1.5 text-emerald-600 text-xs mb-3"><CheckCircle size={13}/> No violations</div>
      )}

      <div className="flex gap-2">
        {currentShift && <button onClick={()=>{onSelect(null);showToast(`Cleared ${name} on ${display}`,'amber');onClose();}} className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200 font-medium">Clear</button>}
        <div className="flex-1"/>
        <button onClick={onClose} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">Cancel</button>
        {pending && <button onClick={confirm} className={`px-3 py-1.5 text-sm rounded-lg font-medium text-white transition-colors ${v.length>0?'bg-amber-500 hover:bg-amber-600':'bg-indigo-600 hover:bg-indigo-700'}`}>
          {v.length>0?'Assign Anyway':'Assign Shift'}
        </button>}
      </div>
    </Modal>
  );
}

// ─── SCHEDULE GRID ────────────────────────────────────────────────────────────

function ScheduleGrid({ allResidents, block, updateBlock, eligOverrides, showToast }) {
  const [picker, setPicker] = useState(null);
  const [catFilter, setCatFilter] = useState('ALL');
  const sched = block.schedule || {};
  const sd = block.specialDays || {};
  const dates = useMemo(()=>getBlockDates(block.startDate,block.endDate),[block.startDate,block.endDate]);

  const violMap = useMemo(()=>{
    const m={};
    for (const issue of validateAll(allResidents,sched,block,eligOverrides)) {
      if (issue.dateStr) { const k=`${issue.residentId}_${issue.dateStr}`; (m[k]=m[k]||[]).push(issue); }
    }
    return m;
  },[allResidents,sched,block,eligOverrides]);

  const filtered = catFilter==='ALL'?allResidents:allResidents.filter(r=>r.category===catFilter);
  const grouped = useMemo(()=>{
    const g=[];
    for (const cat of CATEGORIES) { const m=filtered.filter(r=>r.category===cat.id); if(m.length) g.push({cat,members:m}); }
    return g;
  },[filtered]);

  function assign(resId,ds,sid) {
    updateBlock(b=>({...b,schedule:{...b.schedule,[resId]:{...(b.schedule[resId]||{}),[ds]:sid}}}));
  }

  if (!dates.length) return (
    <div className="text-center py-16 text-gray-400">
      <Calendar size={40} className="mx-auto mb-3 opacity-40"/>
      <p className="text-sm">Set block dates in Settings to show the grid.</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {['ALL',...CATEGORIES.map(c=>c.id)].map(cid=>{
          const cat=CAT_MAP[cid];
          const cnt=cid==='ALL'?allResidents.length:allResidents.filter(r=>r.category===cid).length;
          if(cid!=='ALL'&&cnt===0) return null;
          return (
            <button key={cid} onClick={()=>setCatFilter(cid)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${catFilter===cid?(cat?cat.badge:'bg-gray-700 text-white border-gray-700'):'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {cat?cat.shortLabel:'All'} ({cnt})
            </button>
          );
        })}
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto schedule-scroll">
          <div style={{minWidth:NAME_W+CELL_W*dates.length}}>
            <div className="flex bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
              <div className="grid-sticky bg-gray-50 border-r border-gray-200 flex items-center px-3" style={{width:NAME_W,minWidth:NAME_W}}>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Resident</span>
              </div>
              {dates.map(ds=>{
                const d=parseDate(ds); const dow=d.getDay(); const isWed=dow===3; const isWknd=dow===0||dow===6;
                return (
                  <div key={ds} style={{width:CELL_W,minWidth:CELL_W}}
                    className={`flex flex-col items-center justify-center py-1 border-r border-gray-100 ${isWed?'bg-yellow-50':isWknd?'bg-slate-100':'bg-gray-50'}`}>
                    <span className={`text-xs font-bold ${isWed?'text-yellow-700':isWknd?'text-slate-500':'text-gray-500'}`}>{DOW[dow]}</span>
                    <span className={`text-xs ${isWed?'text-yellow-600':isWknd?'text-slate-400':'text-gray-400'}`}>{d.getMonth()+1}/{d.getDate()}</span>
                  </div>
                );
              })}
            </div>

            {grouped.map(({cat,members})=>(
              <div key={cat.id}>
                <div className={`flex border-b border-gray-100 ${cat.rowBg}`}>
                  <div className="grid-sticky px-3 py-1.5 border-r border-gray-200" style={{width:NAME_W,minWidth:NAME_W,background:'inherit'}}>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${cat.badge}`}>{cat.label}</span>
                  </div>
                  <div style={{flex:1}}/>
                </div>
                {members.map(res=>{
                  const sched_ok=isSchedulable(res);
                  const cnt=Object.values(sched[res.id]||{}).filter(Boolean).length;
                  const tgt=res.isChief?16:(SHIFT_TARGETS[eligKey(res)]??null);
                  const over=tgt!=null&&cnt>tgt;
                  return (
                    <div key={res.id} className={`flex border-b border-gray-100 ${!sched_ok?'opacity-50':''} ${cat.rowBg}`}>
                      <div className={`grid-sticky border-r border-gray-200 flex items-center px-3 py-1 ${cat.rowBg}`} style={{width:NAME_W,minWidth:NAME_W}}>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-800 truncate">{res.lastName}, {res.firstName}{res.isChief?' ★':''}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-xs text-gray-400">PGY-{res.pgy}</span>
                            {res.blockType && res.category!=='PEDS' && (
                              <span className="text-xs text-gray-300">· {BLOCK_TYPE_MAP[res.blockType]?.label||res.blockType}</span>
                            )}
                            {tgt!=null && <span className={`text-xs font-medium ${over?'text-red-500':'text-gray-400'}`}>{cnt}/{tgt}</span>}
                          </div>
                        </div>
                      </div>
                      {dates.map(ds=>{
                        const sid=sched[res.id]?.[ds]||null;
                        const vKey=`${res.id}_${ds}`; const hasV=!!(violMap[vKey]?.length);
                        const isApprovedOff=(res.approvedDatesOff||[]).includes(ds);
                        const elig=getEligibleShifts(res,ds,sd,eligOverrides);
                        const d=parseDate(ds); const dow=d.getDay();
                        const isWed=dow===3; const isWknd=dow===0||dow===6;
                        const isGR=isWed&&res.category==='EM_HOME';
                        const shift=sid?SHIFT_MAP[sid]:null;
                        let bg=isApprovedOff?'bg-orange-50':isGR?'bg-yellow-50':isWknd?'bg-slate-50':elig.length===0?'bg-gray-50':'bg-white';
                        if(hasV) bg='bg-red-50';
                        const clickable=(elig.length>0||sid)&&!isApprovedOff;
                        return (
                          <div key={ds} style={{width:CELL_W,minWidth:CELL_W,height:36}}
                            onClick={()=>clickable&&setPicker({resident:res,dateStr:ds})}
                            title={isApprovedOff?'Approved day off':isGR?'GR Wednesday':elig.length===0?'No eligible shifts':''}
                            className={`relative border-r border-b border-gray-100 ${bg} ${hasV?'ring-1 ring-inset ring-red-400':''} ${clickable?'cursor-pointer hover:brightness-95':'cursor-default'} transition-all`}>
                            {isApprovedOff&&!sid && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-orange-500">OFF</span></div>}
                            {isGR&&!sid&&!isApprovedOff && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-yellow-600">GR</span></div>}
                            {shift && <div className={`absolute inset-1 flex items-center justify-center rounded text-xs font-bold ${shift.chip}`}>{sid}</div>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {picker && (
        <ShiftPickerModal resident={picker.resident} dateStr={picker.dateStr}
          currentShift={sched[picker.resident.id]?.[picker.dateStr]||null}
          block={block} eligOverrides={eligOverrides}
          onSelect={sid=>assign(picker.resident.id,picker.dateStr,sid)}
          onClose={()=>setPicker(null)} showToast={showToast}/>
      )}
    </div>
  );
}

// ─── VALIDATION TAB ───────────────────────────────────────────────────────────

function ValidationTab({ allResidents, block, eligOverrides }) {
  const issues = useMemo(()=>validateAll(allResidents,block.schedule||{},block,eligOverrides),[allResidents,block,eligOverrides]);
  const errors=issues.filter(i=>i.level==='error'), warns=issues.filter(i=>i.level==='warn');
  const byRes = useMemo(()=>{
    const m={};
    for(const i of issues){ if(!m[i.residentId]) m[i.residentId]={name:i.name,issues:[]}; m[i.residentId].issues.push(i); }
    return m;
  },[issues]);

  if(!issues.length) return (
    <div className="text-center py-16">
      <CheckCircle size={48} className="mx-auto mb-3 text-emerald-500"/>
      <p className="text-gray-700 font-semibold">No rule violations</p>
      <p className="text-sm text-gray-400 mt-1">All scheduled shifts comply with current rules.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        {errors.length>0 && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 font-medium"><AlertCircle size={15}/>{errors.length} error{errors.length!==1?'s':''}</div>}
        {warns.length>0 && <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-700 font-medium"><AlertTriangle size={15}/>{warns.length} warning{warns.length!==1?'s':''}</div>}
      </div>
      {Object.entries(byRes).map(([id,{name,issues:ri}])=>{
        const hasErr=ri.some(i=>i.level==='error');
        return (
          <div key={id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className={`px-4 py-2.5 border-b flex items-center gap-2 ${hasErr?'bg-red-50 border-red-100':'bg-amber-50 border-amber-100'}`}>
              {hasErr?<AlertCircle size={14} className="text-red-500"/>:<AlertTriangle size={14} className="text-amber-500"/>}
              <span className={`text-sm font-semibold ${hasErr?'text-red-800':'text-amber-800'}`}>{name}</span>
              <span className={`ml-auto text-xs ${hasErr?'text-red-400':'text-amber-400'}`}>{ri.length} issue{ri.length!==1?'s':''}</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {ri.map((issue,i)=>(
                <li key={i} className="px-4 py-2.5 flex items-start gap-2">
                  <span className={`mt-0.5 ${issue.level==='error'?'text-red-400':'text-amber-400'}`}>•</span>
                  <div className="text-sm text-gray-700">
                    {issue.dateStr && <span className="font-medium text-gray-400 text-xs mr-1.5">{formatDisplayDate(issue.dateStr)}{issue.shiftId?` · ${issue.shiftId}`:''}</span>}
                    {issue.message}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ─── SETTINGS TAB ─────────────────────────────────────────────────────────────

function SettingsTab({ block, updateBlock, onBlockReset }) {
  const [resetConfirm, setResetConfirm] = useState(false);
  const upd = (f,v) => updateBlock(b=>({...b,[f]:v}));

  return (
    <div className="space-y-5 max-w-lg">
      <SectionCard title="Block Name & Dates">
        <div className="space-y-3">
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Block Name</label>
            <input className="input-field" value={block.name||''} onChange={e=>upd('name',e.target.value)} placeholder="e.g. Block 3 — Jun/Jul 2025"/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" className="input-field" value={block.startDate||''} onChange={e=>upd('startDate',e.target.value)}/></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" className="input-field" value={block.endDate||''} onChange={e=>upd('endDate',e.target.value)}/></div>
          </div>
          {block.startDate&&block.endDate && <p className="text-xs text-gray-400">{getBlockDates(block.startDate,block.endDate).length} days in block</p>}
        </div>
      </SectionCard>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-700 flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0"/>
        <span>Conference &amp; ITE dates are now set <strong>per Academic Year</strong> in the <strong>Home tab</strong> — expand the AY folder and click "Conference &amp; ITE Dates". Special days below are per-block and can also be managed from the <strong>Dashboard</strong> tab.</span>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-700 flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0"/>
        <span>Special days (Code Blue, Peds advocacy, BAMC procedure, Anesthesia US) are managed on the <strong>Home</strong> tab (Current Block section) and the <strong>Dashboard</strong> tab.</span>
      </div>

      <SectionCard title="Block Reset" subtitle="Clears off-service roster and schedule. EM Home/BAMC roster is preserved.">
        {resetConfirm ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-red-600 font-medium">Cannot be undone.</span>
            <button onClick={()=>{onBlockReset();setResetConfirm(false);}} className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Confirm</button>
            <button onClick={()=>setResetConfirm(false)} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">Cancel</button>
          </div>
        ) : (
          <button onClick={()=>setResetConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 hover:bg-red-50 rounded-lg font-medium">
            <RefreshCw size={14}/> New Block
          </button>
        )}
      </SectionCard>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'home',       label: 'Home',          icon: Home },
  { id: 'dashboard',  label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'em',         label: 'EM Residents',  icon: Stethoscope },
  { id: 'offservice', label: 'Off-Service',   icon: Users },
  { id: 'matrix',     label: 'Shift Matrix',  icon: Table2 },
  { id: 'schedule',   label: 'Schedule',      icon: Calendar },
  { id: 'rules',      label: 'Scheduling Rules', icon: BookOpen },
  { id: 'validation', label: 'Violations',    icon: AlertTriangle },
  { id: 'settings',   label: 'Settings',      icon: SettingsIcon },
];

export default function ResidentScheduler() {
  const [tab, setTab] = useState('home');
  const [toast, setToast] = useState(null);
  const [switchPending, setSwitchPending] = useState(null);

  const [emRoster, setEmRoster]           = useLocalStorage('res_em_roster', []);
  const [eligOverrides, setEligOverrides] = useLocalStorage('res_eligibility_overrides', {});
  const [blocksHistory, setBlocksHistory] = useLocalStorage('res_blocks_history', []);
  const [block, setBlock]                 = useLocalStorage('res_current_block', makeDefaultBlock());
  // AY-level data: conference & ITE dates keyed by academic year string
  const [ayData, setAyData]               = useLocalStorage('res_ay_data', {});

  function updateAyData(ay, conf) {
    setAyData(p => ({ ...p, [ay]: conf }));
  }

  // Convenience: conference data for the current block's AY
  const currentAyConf = ayData[block.academicYear] || { ...DEFAULT_AY_CONF };

  function showToast(msg, tone='amber') { setToast({msg,tone}); setTimeout(()=>setToast(null),5000); }

  const allResidents = useMemo(()=>{
    const em = emRoster.map(r=>({
      ...r,
      blockType: block.emBlockAssignments?.[r.id]?.blockType ?? 'EM',
      isChief:   !!(block.emBlockAssignments?.[r.id]?.isChief),
    }));
    return [...em,...(block.offServiceResidents||[])];
  },[emRoster,block.emBlockAssignments,block.offServiceResidents]);

  const violCount = useMemo(()=>validateAll(allResidents,block.schedule||{},block,eligOverrides).length,[allResidents,block,eligOverrides]);

  function updateBlock(fn) { setBlock(p=>typeof fn==='function'?fn(p):{...p,...fn}); }

  function saveBlock() {
    const shiftCount=Object.values(block.schedule||{}).reduce((s,d)=>s+Object.values(d).filter(Boolean).length,0);
    const snap={ id:block.id, name:block.name||'Unnamed Block', academicYear:block.academicYear||getAcademicYear(),
      startDate:block.startDate, endDate:block.endDate, savedAt:new Date().toISOString(),
      residentCount:emRoster.length+(block.offServiceResidents||[]).length, shiftCount,
      data:{ emBlockAssignments:block.emBlockAssignments||{}, offServiceResidents:block.offServiceResidents||[],
             schedule:block.schedule||{}, specialDays:block.specialDays||{}, conferences:block.conferences||{},
             startDate:block.startDate, endDate:block.endDate, name:block.name, academicYear:block.academicYear } };
    setBlocksHistory(p=>[snap,...p.filter(b=>b.id!==snap.id)].slice(0,24));
    showToast(`"${snap.name}" saved`,'green');
  }

  function loadBlock(snap) {
    const hasCurrent=block.startDate||(block.offServiceResidents||[]).length>0||Object.keys(block.schedule||{}).length>0;
    hasCurrent ? setSwitchPending(snap) : doLoadBlock(snap);
  }

  function doLoadBlock(snap) {
    const d=snap.data||{};
    setBlock({ id:snap.id, name:snap.name||d.name||'', academicYear:snap.academicYear||d.academicYear||getAcademicYear(),
      startDate:snap.startDate||d.startDate||'', endDate:snap.endDate||d.endDate||'',
      emBlockAssignments:d.emBlockAssignments||{}, offServiceResidents:d.offServiceResidents||[],
      schedule:d.schedule||{}, specialDays:d.specialDays||{codeBlueDays:[],advocacyDays:[],procDays:[],anesDays:[]},
      conferences:d.conferences||{} });
    setSwitchPending(null); setTab('schedule');
    showToast(`Loaded "${snap.name}"`,'green');
  }

  function newBlock() {
    const hasCurrent=block.startDate||(block.offServiceResidents||[]).length>0;
    hasCurrent ? setSwitchPending('__new__') : doNewBlock();
  }

  function doNewBlock() {
    setBlock(makeDefaultBlock()); setSwitchPending(null); setTab('home');
    showToast('New block ready — enter dates and special days below','amber');
  }

  function blockReset() {
    updateBlock(b=>({...makeDefaultBlock(),id:b.id,name:b.name,academicYear:b.academicYear,emBlockAssignments:{}}));
    showToast('Block reset','amber');
  }

  function exportCSV() {
    const dates=getBlockDates(block.startDate,block.endDate);
    const header=['Resident','Category','PGY','Rotation',...dates.map(d=>formatDisplayDate(d))];
    const rows=allResidents.map(r=>{
      const cells=dates.map(d=>block.schedule?.[r.id]?.[d]||'');
      return[`${r.lastName}, ${r.firstName}`,CAT_MAP[r.category]?.label||r.category,`PGY-${r.pgy}`,r.blockType||'—',...cells];
    });
    const csv=[header,...rows].map(row=>row.map(c=>`"${c}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`schedule_${block.startDate||'block'}.csv`;a.click();
    URL.revokeObjectURL(url);
  }

  const isSwitchNew = switchPending==='__new__';
  const pendingSnap = !isSwitchNew&&switchPending?switchPending:null;

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* Header */}
      <header className="bg-indigo-700 text-white shadow-lg shrink-0">
        <div className="px-5 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-bold tracking-tight">EM Residency Scheduler</h1>
            <p className="text-indigo-200 text-xs">
              {block.name||'No block name'} · {block.startDate&&block.endDate?`${prettyDate(block.startDate)} → ${prettyDate(block.endDate)}`:'No dates set'} · {block.academicYear}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-indigo-300">{allResidents.length} residents</span>
            {block.startDate && (
              <button onClick={exportCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 rounded-lg transition-colors">
                <Download size={12}/> CSV
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Vertical sidebar */}
        <aside className="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col py-2 overflow-y-auto">
          <nav className="flex flex-col gap-0.5 px-2">
            {TABS.map(t=>{
              const Icon=t.icon; const active=tab===t.id;
              const badge=t.id==='validation'&&violCount>0?violCount:null;
              return (
                <button key={t.id} onClick={()=>setTab(t.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors text-left ${active?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-100 hover:text-slate-800'}`}>
                  <Icon size={15} className={active?'text-white':'text-slate-400'}/>
                  <span className="flex-1">{t.label}</span>
                  {badge && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums ${active?'bg-white/20 text-white':'bg-rose-100 text-rose-700'}`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sidebar footer */}
          <div className="mt-auto px-3 py-3 border-t border-gray-100">
            <div className="text-xs text-gray-400 space-y-0.5">
              <p className="font-medium text-gray-500">{emRoster.length} EM residents</p>
              <p>{(block.offServiceResidents||[]).length} off-service this block</p>
              {violCount > 0 && <p className="text-red-500 font-medium">{violCount} violation{violCount!==1?'s':''}</p>}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6 min-w-0">
          {tab==='home' && (
            <HomeTab block={block} updateBlock={updateBlock} emRoster={emRoster} blocksHistory={blocksHistory}
              ayData={ayData} updateAyData={updateAyData}
              onContinue={()=>setTab('schedule')} onLoadBlock={loadBlock}
              onSaveBlock={saveBlock} onNewBlock={newBlock}/>
          )}
          {tab==='dashboard' && (
            <DashboardTab block={block} updateBlock={updateBlock} allResidents={allResidents}
              ayConf={currentAyConf} violationCount={violCount}/>
          )}
          {tab==='em' && <EMResidentsTab emRoster={emRoster} setEmRoster={setEmRoster} block={block} updateBlock={updateBlock}/>}
          {tab==='offservice' && <OffServiceTab block={block} updateBlock={updateBlock}/>}
          {tab==='matrix' && <ShiftMatrixTab eligOverrides={eligOverrides} setEligOverrides={setEligOverrides}/>}
          {tab==='schedule' && <ScheduleGrid allResidents={allResidents} block={block} updateBlock={updateBlock} eligOverrides={eligOverrides} showToast={showToast}/>}
          {tab==='rules' && <RulesTab allResidents={allResidents} block={block} eligOverrides={eligOverrides}/>}
          {tab==='validation' && <ValidationTab allResidents={allResidents} block={block} eligOverrides={eligOverrides}/>}
          {tab==='settings' && <SettingsTab block={block} updateBlock={updateBlock} onBlockReset={blockReset}/>}
        </main>
      </div>

      {/* Draft note */}
      <div className="bg-amber-50 border-t border-amber-200 px-4 py-1.5 shrink-0">
        <div className="flex items-center gap-2 text-xs text-amber-700">
          <Info size={12} className="shrink-0"/>
          <span><strong>Draft v0.3</strong> — Neuro/Anes/Psych/Pod matrix (4 shifts each) needs verification with chief. FM PGY-1 Peds eligibility TBD — add via Shift Matrix if confirmed. Several rules marked ⚠ in Rules tab.</span>
        </div>
      </div>

      {/* Save-before-switch modal */}
      {switchPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0"><Archive size={18} className="text-amber-600"/></div>
              <div>
                <h2 className="font-semibold text-gray-900">Save current block first?</h2>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">"{block.name||'Current block'}"</span> has unsaved work.
                </p>
              </div>
            </div>
            {pendingSnap && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
                Loading: <span className="font-semibold text-gray-900">{pendingSnap.name}</span>
                {pendingSnap.startDate && <span className="text-xs text-gray-400 ml-2">{prettyDate(pendingSnap.startDate)} → {prettyDate(pendingSnap.endDate)}</span>}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <button onClick={()=>setSwitchPending(null)} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">Cancel</button>
              <button onClick={()=>{isSwitchNew?doNewBlock():doLoadBlock(pendingSnap);}} className="px-3 py-1.5 text-sm border border-gray-300 hover:bg-gray-50 rounded-lg text-gray-700">
                {isSwitchNew?'Discard & New':'Switch Without Saving'}
              </button>
              <button onClick={()=>{saveBlock();isSwitchNew?doNewBlock():doLoadBlock(pendingSnap);}} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium">
                <Save size={13}/> Save &amp; {isSwitchNew?'New':'Switch'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={()=>setToast(null)}/>
    </div>
  );
}
