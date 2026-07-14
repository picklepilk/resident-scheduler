// ResidentScheduler.jsx — v0.3
// EM Residency Scheduler · UH Emergency Medicine

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Plus, Trash2, AlertTriangle, Calendar, Users, Settings as SettingsIcon,
  X, ChevronDown, Download, Info, RefreshCw, CheckCircle, AlertCircle,
  Home, Archive, Save, ChevronRight, Check, Table2, Activity,
  Stethoscope, ClipboardList, BookOpen, Shield, Edit2, LayoutDashboard,
  CalendarDays, AlertOctagon, HelpCircle, Upload, Wand2,
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

// Chief-editable day-of-week / block-type scheduling rules — see the Scheduling Rules tab.
// Per CATEGORY_PGY key. Chief edits are stored as overrides (state `dayRules`, same
// override-precedence idiom as `eligOverrides`) and merged over these defaults in
// getEffectiveDayRules(). A reserved 'TRAUMA_BLOCKS' key (string[] of block-type ids) may
// also appear in the override object, replacing the static TRAUMA_BLOCKS constant above.
//
// Shapes:
//   fullBlockDays: number[]                 — whole category+pgy unschedulable that weekday
//   onlyDaysEnabled/onlyDays                — inverse: ONLY these weekdays are schedulable
//   dayTypeRestrictions: [{days:number[], mode:'onlyDay'|'noNight'|'onlyNight'|'noDay'}]
//   shiftGates: [{id, shiftIds:string[]|'ALL', blockTypeFilter:{mode:'only'|'except', ids?:string[], ref?:'TRAUMA_BLOCKS'}|null,
//                 allowedDays?:number[], nightExcludedDays?:number[], outsideAction:'stripShiftIds'|'blockEntireDay', overrideImmune:boolean}]
//   specialDayRules: [{listKey:'codeBlueDays'|'advocacyDays'|'procDays'|'anesDays', offset:'sameDay'|'dayBefore'|'sameDayAndDayBefore'}]
//   residentFlagOverrides: [{flag:string, fullBlockDays:number[]}]  — replaces dayTypeRestrictions when resident[flag] is true
const DEFAULT_DAY_RULES = {
  EM_HOME_1: {
    fullBlockDays: [3], // GR Wednesday
    shiftGates: [
      { id: 'trauma_strip_non_trauma_block', shiftIds: ['TRAUMA-D','TRAUMA-N'],
        blockTypeFilter: { mode: 'except', ref: 'TRAUMA_BLOCKS' }, outsideAction: 'stripShiftIds', overrideImmune: false },
      { id: 'trauma_day_gate', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: null,
        allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'us_em_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['US_EM'] },
        allowedDays: [0,1,6], nightExcludedDays: [1], outsideAction: 'blockEntireDay', overrideImmune: true },
    ],
  },
  EM_HOME_2: {
    fullBlockDays: [3],
    shiftGates: [
      { id: 'peds_em_trauma_strip', shiftIds: ['TRAUMA-D','TRAUMA-N'],
        blockTypeFilter: { mode: 'only', ids: ['PEDS_EM'] }, outsideAction: 'stripShiftIds', overrideImmune: false },
      { id: 'em_ems_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_EMS'] },
        allowedDays: [1,2], outsideAction: 'blockEntireDay', overrideImmune: true },
      { id: 'em_tox_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_TOX'] },
        allowedDays: [4,5], outsideAction: 'blockEntireDay', overrideImmune: true },
    ],
  },
  EM_HOME_3: { fullBlockDays: [3] },
  EM_BAMC_1: {
    dayTypeRestrictions: [{ days: [3], mode: 'onlyDay' }],
    specialDayRules: [{ listKey: 'procDays', offset: 'sameDayAndDayBefore' }],
  },
  PEDS_1: { specialDayRules: [{ listKey: 'advocacyDays', offset: 'dayBefore' }] },
  PEDS_3: { specialDayRules: [{ listKey: 'advocacyDays', offset: 'dayBefore' }] },
  FM_1: {
    fullBlockDays: [3,4],
    dayTypeRestrictions: [{ days: [2], mode: 'noNight' }],
  },
  FM_3: { onlyDaysEnabled: true, onlyDays: [1,2,3] },
  IM_2: {
    dayTypeRestrictions: [{ days: [3], mode: 'onlyDay' }],
    specialDayRules: [{ listKey: 'codeBlueDays', offset: 'sameDayAndDayBefore' }],
    residentFlagOverrides: [{ flag: 'isCCUNights', fullBlockDays: [2,3] }],
  },
  NEURO_1: { fullBlockDays: [3,5] },
  ANES_1: {
    dayTypeRestrictions: [{ days: [3], mode: 'onlyDay' }],
    specialDayRules: [{ listKey: 'anesDays', offset: 'sameDay' }],
  },
  PSYCH_1: {
    fullBlockDays: [2],
    dayTypeRestrictions: [{ days: [1], mode: 'noNight' }, { days: [3], mode: 'onlyDay' }],
  },
  POD_1: {
    fullBlockDays: [6,0],
    dayTypeRestrictions: [{ days: [5], mode: 'noNight' }, { days: [1], mode: 'noDay' }, { days: [3], mode: 'onlyDay' }],
  },
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

// Residents needed per shift per day, used by Generate Schedule. Chief edits are stored as a
// sparse override object in localStorage (res_coverage) and merged over these defaults — same
// idiom as dayRules/eligOverrides. 0 = the generator does not staff that shift.
const DEFAULT_COVERAGE = Object.fromEntries(SHIFTS.map(s => [s.id, 1]));
function getCoverageFor(shiftId, coverage = {}) { return coverage[shiftId] ?? DEFAULT_COVERAGE[shiftId] ?? 0; }

// Static rules reference per category_pgy — used in Rules tab
// Hand-maintained prose that doesn't fit the structured DEFAULT_DAY_RULES schema — supplementary
// context only (shift-count math, workflow advice, unresolved TBDs). Day-of-week/block-type rules
// themselves are enforced AND described entirely from DEFAULT_DAY_RULES/dayRules — see
// describeDayRules()/describeShiftGates() in the Scheduling Rules tab, so they can't drift from
// what's actually enforced the way static text could.
const RULE_NOTES = {
  EM_HOME_1: {
    blockTypeNotes: [
      { ids: ['PEDS_TRAUMA','TRAUMA_PEDS'], note: '8 Trauma Day shifts (Tue/Thu/Sat/Sun) + 11 Peds shifts (any eligible day) = 19 total.' },
      { ids: ['US_EM'], note: '5 EM shifts total.' },
      { ids: ['EM_RES_VAC'], note: 'Chief schedules weeks 1–2 only ⚠ TBD count (not currently enforced by the rules editor).' },
    ],
    tbdItems: ['EM/Res/VAC week-1 & 2 shift count', 'Buy-down day split definition'],
  },
  EM_HOME_2: {
    blockTypeNotes: [
      { ids: ['PEDS_EM'], note: 'Prioritize Peds shifts; schedule LAST in workflow. ⚠ TBD total shift split.' },
      { ids: ['OB_VAC'], note: 'Not scheduled by chief — resident self-arranges (rotation marked non-schedulable).' },
    ],
    tbdItems: ['Peds/EM total shift split confirmation'],
  },
  EM_HOME_3: {
    blockTypeNotes: [
      { ids: ['METRO'], note: 'Self-pick 12 Metro shifts + 8 on-call days; chief does not schedule (rotation marked non-schedulable).' },
      { ids: ['ADMIN'], note: 'On-call only (4 teaching + 4 other); no regular ED shifts (rotation marked non-schedulable).' },
      { ids: ['ELECTIVE'], note: '⚠ TBD: confirm whether chief schedules any UH ED shifts during elective.' },
    ],
    tbdItems: ['Elective block ED shift scheduling confirmation'],
    softPrefs: ['Try to give Sunday off before ICU rotations'],
  },
  EM_BAMC_1: {
    specialNotes: [
      'Thursday: 1×/month allowed — row of nights only ⚠ TBD definition (not currently enforced by the app).',
      'Procedure days: off night before + day of (can work night-of if critical) ⚠ TBD date list.',
      'Peds shifts 1–3/block ⚠ TBD exact count.',
    ],
    tbdItems: ['Row-of-nights definition for GR Thursday', 'Procedure day source/list'],
  },
  PEDS_1: {
    specialNotes: ['Friday 1–4pm: GR protected — should not be scheduled (not currently enforced by the app).', 'Night before advocacy days: off.', 'Peds residents self-cover; app displays schedule only.'],
    tbdItems: ['Advocacy day list — chief provides each block'],
  },
  PEDS_3: {
    specialNotes: ['Friday 1–4pm: GR protected — should not be scheduled (not currently enforced by the app).', 'Night before advocacy days: off.', 'Self-cover arrangement.'],
    tbdItems: ['Advocacy day list — chief provides each block'],
  },
  FM_1: {
    tbdItems: ['Peds shift eligibility confirmation', 'Peds target count if eligible'],
  },
  FM_3: {
    specialNotes: ['Interpretation A confirmed: FM-3 ONLY works Peds nights, Mon–Wed ⚠ verify.'],
  },
  IM_2: {
    specialNotes: ['Code Blue days: off night before + day of ⚠ manual entry required.'],
    tbdItems: ['CCU nights detection (currently manual checkbox on resident)', 'Code Blue day list source'],
  },
  NEURO_1: {
    softPrefs: ['Avoid Tuesday/Thursday night shifts when possible.'],
    tbdItems: ['Confirm eligible shift list with rotation director'],
  },
  ANES_1: {
    specialNotes: ['Ultrasound days: off (email Gardner annually for dates).'],
    tbdItems: ['1st Friday social hour (2–4pm) — not currently enforced by the app', 'US days for current academic year'],
  },
  PSYCH_1: {},
  POD_1: {},
};

const DOW_MODE_LABEL = { onlyDay: 'day shifts only', noNight: 'no night shifts', onlyNight: 'night shifts only', noDay: 'no day shifts' };

// Renders the current dayRules config for a row as the same {label, rule, type} shape the tab
// used to get from static RULES_DATA.dayRules — generated live, so it can never drift.
function describeDayRules(dr) {
  const out = [];
  if (dr.fullBlockDays?.length) out.push({ label: dr.fullBlockDays.map(d=>DOW[d]).join('/'), rule: 'No shifts', type: 'block' });
  if (dr.onlyDaysEnabled) out.push({ label: 'All other days', rule: `No shifts — only schedulable ${(dr.onlyDays||[]).map(d=>DOW[d]).join('/')}`, type: 'block' });
  for (const r of dr.dayTypeRestrictions || []) out.push({ label: r.days.map(d=>DOW[d]).join('/'), rule: DOW_MODE_LABEL[r.mode] || r.mode, type: 'restrict' });
  for (const f of dr.residentFlagOverrides || []) out.push({ label: `${f.fullBlockDays.map(d=>DOW[d]).join('/')} (when ${f.flag})`, rule: 'No shifts', type: 'block' });
  return out;
}

// Renders shiftGates as the same {ids, note} shape blockTypeNotes used — generated live.
function describeShiftGates(dr) {
  const out = [];
  for (const g of dr.shiftGates || []) {
    const shiftLabel = g.shiftIds === 'ALL' ? 'All shifts' : g.shiftIds.join('/');
    const filter = g.blockTypeFilter;
    const ids = filter?.ref === 'TRAUMA_BLOCKS' ? (dr.__traumaBlocks || TRAUMA_BLOCKS) : (filter?.ids || []);
    let scope = filter ? (filter.mode === 'only' ? 'on this rotation' : 'except on this rotation') : '';
    let dayText = '';
    if (g.allowedDays) {
      dayText = g.outsideAction === 'blockEntireDay'
        ? ` — only schedulable ${g.allowedDays.map(d=>DOW[d]).join('/')}`
        : ` — ${shiftLabel} only ${g.allowedDays.map(d=>DOW[d]).join('/')}`;
    }
    if (g.nightExcludedDays?.length) dayText += `, no night shifts ${g.nightExcludedDays.map(d=>DOW[d]).join('/')}`;
    if (!filter && !g.allowedDays) dayText = ` — ${shiftLabel} always excluded`;
    out.push({ ids: ids.length ? ids : ['ALL'], note: `${shiftLabel}${scope ? ' ' + scope : ''}${dayText}.${g.overrideImmune ? ' (applies even over a rotation-specific matrix override)' : ''}` });
  }
  return out;
}

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

function getAcademicYearFor(dateStr) {
  const d = parseDate(dateStr); const m = d.getMonth(); const y = d.getFullYear();
  const s = m >= 6 ? y : y - 1;
  return `AY${String(s).slice(2)}/${String(s+1).slice(2)}`;
}
function getAcademicYear() { return getAcademicYearFor(toDateStr(new Date())); }

// Shared start-date handler: auto-fills the end date to the configured block length and
// (re)derives the academic year from the selected date — used by both Home and Settings.
function applyStartDate(updateBlock, appSettings, s) {
  const len = (appSettings?.defaultBlockLength ?? 28) - 1;
  updateBlock(b => ({
    ...b,
    startDate: s,
    endDate: s ? toDateStr(addDays(parseDate(s), len)) : b.endDate,
    academicYear: s ? getAcademicYearFor(s) : b.academicYear,
  }));
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

// ─── ROSTER IMPORT ─────────────────────────────────────────────────────────────

// Recognized free-text spellings for each category, beyond its own id/label/shortLabel.
const CATEGORY_SYNONYMS = {
  EM_HOME: ['em', 'emhome', 'emergencymedicine'],
  EM_BAMC: ['bamc', 'embamc'],
  PEDS:    ['peds', 'pediatrics'],
  FM:      ['fm', 'familymedicine'],
  IM:      ['im', 'internalmedicine'],
  NEURO:   ['neuro', 'neurology'],
  ANES:    ['anes', 'anesthesia', 'anesthesiology'],
  PSYCH:   ['psych', 'psychiatry'],
  POD:     ['pod', 'podiatry'],
};
function normalizeToken(s) { return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function matchCategory(raw) {
  const n = normalizeToken(raw);
  if (!n) return null;
  for (const c of CATEGORIES) {
    if (n === normalizeToken(c.id) || n === normalizeToken(c.label) || n === normalizeToken(c.shortLabel)) return c.id;
  }
  for (const [id, syns] of Object.entries(CATEGORY_SYNONYMS)) if (syns.includes(n)) return id;
  return null;
}

// Splits one CSV line honoring double-quoted fields (so `"Last, First"` survives comma-splitting).
function splitCsvLine(line) {
  const out = []; let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function splitName(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.includes(',')) {
    const [last, first] = s.split(',').map(x => x.trim());
    if (!last || !first) return null;
    return { firstName: first, lastName: last };
  }
  const parts = s.split(/\s+/);
  if (parts.length < 2) return null;
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

// Parses pasted or uploaded roster text into resident rows. Only Name/Category/PGY are read —
// any Rotation/date columns present (as in the QGenda-style export this mirrors) are ignored.
// allowedCategoryIds restricts which categories this import target (EM Home vs Off-Service) accepts.
function parseRosterText(text, allowedCategoryIds) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const ok = [], errors = [];
  if (!lines.length) return { ok, errors };

  const delim = lines[0].includes('\t') ? '\t' : ',';
  const split = line => delim === '\t' ? line.split('\t').map(s => s.trim()) : splitCsvLine(line);

  let startIdx = 0, nameIdx = 0, catIdx = 1, pgyIdx = 2;
  const first = split(lines[0]);
  if (/resident|name/i.test(first[0] || '') && first.some(c => /category|service/i.test(c))) {
    startIdx = 1;
    const li = first.map(c => c.toLowerCase());
    nameIdx = li.findIndex(c => /resident|name/.test(c));
    catIdx  = li.findIndex(c => /category|service/.test(c));
    pgyIdx  = li.findIndex(c => /pgy/.test(c));
    if (nameIdx < 0) nameIdx = 0; if (catIdx < 0) catIdx = 1; if (pgyIdx < 0) pgyIdx = 2;
  }

  for (let i = startIdx; i < lines.length; i++) {
    const lineNo = i + 1;
    let cols = split(lines[i]);
    let nI = nameIdx, cI = catIdx, pI = pgyIdx;

    // Unquoted comma-delimited "Last, First" splits the name's own comma into an extra
    // column (e.g. "Chen, Liling,EM - Home,1" -> 4 cols instead of 3). If the category
    // doesn't match where expected, retry once with the name and next column rejoined.
    if (delim === ',' && !matchCategory(cols[cI]) && cols.length > cI + 1 && matchCategory(cols[cI + 1])) {
      cols = [`${cols[nI]}, ${cols[nI + 1]}`, ...cols.slice(cI + 1)];
      cI = 1; pI = 2;
    }

    const name = splitName(cols[nI]);
    if (!name) { errors.push({ line: lineNo, raw: lines[i], reason: 'Expected a "Last, First" name' }); continue; }

    const category = matchCategory(cols[cI]);
    if (!category) { errors.push({ line: lineNo, raw: lines[i], reason: `Unrecognized category "${cols[cI] ?? ''}"` }); continue; }
    if (!allowedCategoryIds.includes(category)) {
      errors.push({ line: lineNo, raw: lines[i], reason: `"${CAT_MAP[category].label}" can't be imported here` });
      continue;
    }

    const pgyMatch = String(cols[pI] ?? '').match(/[0-9]/);
    const pgy = pgyMatch ? Number(pgyMatch[0]) : null;
    const pgyOptions = CAT_MAP[category].pgyOptions;
    if (!pgy || !pgyOptions.includes(pgy)) {
      errors.push({ line: lineNo, raw: lines[i], reason: `PGY "${cols[pI] ?? ''}" isn't valid for ${CAT_MAP[category].label} (allowed: ${pgyOptions.join(', ')})` });
      continue;
    }

    ok.push({ firstName: name.firstName, lastName: name.lastName, category, pgy });
  }

  return { ok, errors };
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

// App-level settings (persisted in res_app_settings)
const DEFAULT_APP_SETTINGS = {
  jeopardyPolicy: 'warn',     // 'block' = unschedulable | 'warn' = allowed with warning | 'off' = ignore
  enforceRest: true,          // rest-period rule (shift length = required hours off)
  pgy2TraumaCap: 3,           // warn when an EM Home PGY-2 exceeds this many trauma shifts/block
  defaultBlockLength: 28,     // days — auto-fills end date when start date is set
  maxSavedBlocks: 24,         // history depth on the Home tab
  targetOverrides: {},        // { [CATEGORY_PGY]: number, CHIEF: number } — overrides SHIFT_TARGETS
};

// Effective shift target for a resident, honoring Settings overrides
function getShiftTarget(resident, appSettings = {}) {
  const o = appSettings.targetOverrides || {};
  if (resident.isChief) return o.CHIEF ?? 16;
  const key = `${resident.category}_${resident.pgy}`;
  return o[key] ?? SHIFT_TARGETS[key] ?? null;
}

// Resolve the eligibility list for a resident, most specific key first:
//   1. CATEGORY_PGY__ROTATION  (rotation-specific override from the Shift Matrix)
//   2. CATEGORY_PGY            (category-level override)
//   3. BASE_ELIGIBILITY default
// rotationSpecific=true means the chief explicitly configured this rotation,
// so built-in rotation shift-type filters (e.g. PGY-1 no-trauma-off-trauma-blocks)
// are skipped — the override IS the rule. Day-of-week rules always still apply.
function getEffectiveEligibility(resident, eligOverrides = {}) {
  const key = `${resident.category}_${resident.pgy}`;
  const isEM = resident.category === 'EM_HOME' || resident.category === 'EM_BAMC';
  if (isEM && resident.blockType) {
    const rotKey = `${key}__${resident.blockType}`;
    if (eligOverrides[rotKey]) return { list: [...eligOverrides[rotKey]], rotationSpecific: true };
  }
  if (eligOverrides[key]) return { list: [...eligOverrides[key]], rotationSpecific: false };
  return { list: [...(BASE_ELIGIBILITY[key] || [])], rotationSpecific: false };
}

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

// Resolve the chief-editable day/block rules for a CATEGORY_PGY key: chief override > default.
function getEffectiveDayRules(key, dayRules = {}) {
  return dayRules[key] ?? DEFAULT_DAY_RULES[key] ?? {};
}

function matchesMode(shiftType, mode) {
  switch (mode) {
    case 'onlyDay':   return shiftType === 'day';
    case 'onlyNight': return shiftType === 'night';
    case 'noNight':   return shiftType !== 'night';
    case 'noDay':     return shiftType !== 'day';
    default:          return true;
  }
}

// A shiftGate's blockTypeFilter decides whether the gate applies to this resident's block type.
// mode 'only' → applies when bt IS in the list; mode 'except' → applies when bt is NOT in the list.
// No filter (null/undefined) → always applies.
function blockTypeFilterPasses(filter, bt, traumaBlocks) {
  if (!filter) return true;
  const list = filter.ref === 'TRAUMA_BLOCKS' ? traumaBlocks : (filter.ids || []);
  const inList = list.includes(bt);
  return filter.mode === 'only' ? inList : !inList;
}

function getEligibleShifts(resident, dateStr, specialDays = {}, eligOverrides = {}, appSettings = {}, dayRules = {}) {
  if (!isSchedulable(resident)) return [];
  // Approved days off — resident blocked entirely
  if ((resident.approvedDatesOff || []).includes(dateStr)) return [];
  // Jeopardy call — blocks scheduling only when policy is 'block' (see Settings)
  if ((appSettings.jeopardyPolicy ?? 'warn') === 'block' &&
      (resident.jeopardyDates || []).includes(dateStr)) return [];
  const date = parseDate(dateStr);
  const dow = date.getDay();
  const { category, pgy } = resident;
  const bt = resident.blockType || 'EM';
  const key = `${category}_${pgy}`;

  // Matrix resolution: rotation-specific override > category override > base default
  const { list, rotationSpecific } = getEffectiveEligibility(resident, eligOverrides);
  let eligible = list;

  // Chief-editable day/block rules (Scheduling Rules tab) — see DEFAULT_DAY_RULES for shapes.
  const dr = getEffectiveDayRules(key, dayRules);
  const traumaBlocks = dayRules.TRAUMA_BLOCKS ?? TRAUMA_BLOCKS;

  // 1. Full-day block / restrict-to-only-these-days
  if (dr.fullBlockDays?.includes(dow)) return [];
  if (dr.onlyDaysEnabled && !(dr.onlyDays || []).includes(dow)) return [];

  // 2. Shift/rotation gates — subset-of-shifts or block-type day windows
  for (const g of dr.shiftGates || []) {
    if (!blockTypeFilterPasses(g.blockTypeFilter, bt, traumaBlocks)) continue;
    if (!g.overrideImmune && rotationSpecific) continue; // chief's explicit matrix override wins
    const gateShiftIds = g.shiftIds === 'ALL' ? null : g.shiftIds;
    if (g.allowedDays) {
      if (!g.allowedDays.includes(dow)) {
        if (g.outsideAction === 'blockEntireDay') return [];
        eligible = eligible.filter(s => !(gateShiftIds ? gateShiftIds.includes(s) : true));
      } else if (g.nightExcludedDays?.includes(dow)) {
        eligible = eligible.filter(s => !(gateShiftIds ? gateShiftIds.includes(s) : true) || SHIFT_MAP[s]?.type !== 'night');
      }
    } else if (gateShiftIds) {
      eligible = eligible.filter(s => !gateShiftIds.includes(s));
    } else {
      return [];
    }
  }

  // 3. Resident-flag override (e.g. IM CCU nights) replaces plain day-type restrictions when active
  const activeFlag = (dr.residentFlagOverrides || []).find(f => resident[f.flag]);
  if (activeFlag) {
    if (activeFlag.fullBlockDays.includes(dow)) return [];
  } else {
    for (const r of dr.dayTypeRestrictions || []) {
      if (r.days.includes(dow)) eligible = eligible.filter(s => matchesMode(SHIFT_MAP[s]?.type, r.mode));
    }
  }

  // 4. Special-day-list rules (Code Blue / advocacy / procedure / anesthesia dates)
  for (const s of dr.specialDayRules || []) {
    const listArr = specialDays[s.listKey] || [];
    if ((s.offset === 'sameDay' || s.offset === 'sameDayAndDayBefore') && listArr.includes(dateStr)) return [];
    if ((s.offset === 'dayBefore' || s.offset === 'sameDayAndDayBefore') && listArr.includes(toDateStr(addDays(date, 1)))) return [];
  }

  return eligible;
}

function validateAll(allResidents, schedule, block, eligOverrides = {}, appSettings = {}, dayRules = {}) {
  const issues = [];
  const sd = block.specialDays || {};
  const jeopardyPolicy = appSettings.jeopardyPolicy ?? 'warn';
  for (const resident of allResidents) {
    const rs = schedule[resident.id] || {};
    const name = `${resident.firstName} ${resident.lastName}`;
    for (const [ds, sid] of Object.entries(rs)) {
      if (!sid) continue;
      // Approved day off — highest-priority violation
      if ((resident.approvedDatesOff || []).includes(ds)) {
        issues.push({ residentId: resident.id, name, dateStr: ds, shiftId: sid,
          message: 'Shift scheduled on an approved day off', level: 'error' });
        continue;
      }
      // Jeopardy call date
      if (jeopardyPolicy !== 'off' && (resident.jeopardyDates || []).includes(ds)) {
        issues.push({ residentId: resident.id, name, dateStr: ds, shiftId: sid,
          message: jeopardyPolicy === 'block'
            ? 'Shift scheduled on a jeopardy call date (blocked by Settings)'
            : 'Scheduled while on jeopardy call — confirm backup coverage is acceptable',
          level: jeopardyPolicy === 'block' ? 'error' : 'warn' });
        if (jeopardyPolicy === 'block') continue;
      }
      const elig = getEligibleShifts(resident, ds, sd, eligOverrides, appSettings, dayRules);
      if (!elig.includes(sid)) {
        const dow = parseDate(ds).getDay();
        let msg = 'Shift not eligible for this resident on this day';
        if (resident.category === 'EM_HOME' && dow === 3) msg = 'GR Wednesday — EM Home not schedulable in ED';
        else if (!SHIFT_MAP[sid]) msg = 'Unknown shift type';
        issues.push({ residentId: resident.id, name, dateStr: ds, shiftId: sid, message: msg, level: 'error' });
      }
    }
    const target = getShiftTarget(resident, appSettings);
    if (target != null) {
      const count = Object.values(rs).filter(Boolean).length;
      if (count > target)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `Over target: ${count}/${target} shifts`, level: 'warn' });
    }

    // PGY-2 soft trauma cap (configurable in Settings; 0 disables)
    const traumaCap = appSettings.pgy2TraumaCap ?? 3;
    if (traumaCap > 0 && resident.category === 'EM_HOME' && resident.pgy === 2) {
      const traumaCount = Object.values(rs).filter(s => s === 'TRAUMA-D' || s === 'TRAUMA-N').length;
      if (traumaCount > traumaCap)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `Trauma shifts: ${traumaCount} — PGY-2 cap is ${traumaCap}/block (target 2–3)`, level: 'warn' });
    }

    // Rest-period check — sort all assignments by start time, then check each consecutive pair
    if (appSettings.enforceRest !== false) {
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
  }
  return issues;
}

// ─── SCHEDULE GENERATOR ───────────────────────────────────────────────────────
// Greedy fill: per day, staff the most-constrained shift first (MRV); per slot, pick the
// eligible resident furthest below target, preferring day/eve/night variety and short streaks.
// Fill mode never overwrites a non-empty cell — that is the "keep manual assignments" contract.
// Returns { schedule, report } or null when the block has no dates.
function generateSchedule({ allResidents, block, coverage = {}, eligOverrides = {}, appSettings = {}, dayRules = {}, clearFirst = false }) {
  const dates = getBlockDates(block.startDate, block.endDate);
  if (!dates.length) return null;

  const sd          = block.specialDays || {};
  const enforceRest = appSettings.enforceRest !== false;
  const jeoPolicy   = appSettings.jeopardyPolicy ?? 'warn';
  const traumaCap   = appSettings.pgy2TraumaCap ?? 3;

  const schedule = {};
  for (const r of allResidents) schedule[r.id] = clearFirst ? {} : { ...(block.schedule?.[r.id] || {}) };

  // Per-resident running state, seeded from kept assignments
  const target = {}, assigned = {}, typeCount = {}, traumaCount = {};
  let keptManual = 0;
  for (const r of allResidents) {
    target[r.id] = getShiftTarget(r, appSettings);
    assigned[r.id] = 0;
    typeCount[r.id] = { day: 0, eve: 0, night: 0 };
    traumaCount[r.id] = 0;
    for (const sid of Object.values(schedule[r.id])) {
      if (!sid) continue;
      assigned[r.id]++; keptManual++;
      const sh = SHIFT_MAP[sid];
      if (sh) typeCount[r.id][sh.type]++;
      if (sh?.area === 'TRAUMA') traumaCount[r.id]++;
    }
  }

  // Eligibility cache: eligCache[rid][ds] = Set of eligible shift ids
  const eligCache = {};
  for (const r of allResidents) {
    eligCache[r.id] = {};
    for (const ds of dates) eligCache[r.id][ds] = new Set(getEligibleShifts(r, ds, sd, eligOverrides, appSettings, dayRules));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: clearFirst ? 'regenerate' : 'fill',
    totalSlots: 0, keptManual, filled: 0,
    unfilled: [], underTarget: [], jeopardyPlacements: [],
  };

  function streakBefore(rid, ds) {
    let n = 0, d = parseDate(ds);
    while (n < 14) { d = addDays(d, -1); if (schedule[rid][toDateStr(d)]) n++; else break; }
    return n;
  }

  // Candidate pool; the filter that empties it names the unfilled reason.
  function candidatePool(shift, ds) {
    let pool = allResidents.filter(r => eligCache[r.id][ds].has(shift.id));
    if (!pool.length) return { candidates: [], reason: 'noEligible' };
    pool = pool.filter(r => !schedule[r.id][ds]);
    if (!pool.length) return { candidates: [], reason: 'allWorking' };
    pool = pool.filter(r => target[r.id] != null);
    if (!pool.length) return { candidates: [], reason: 'selfCoverOnly' };
    pool = pool.filter(r => assigned[r.id] < target[r.id]);
    if (!pool.length) return { candidates: [], reason: 'allAtTarget' };
    if (shift.area === 'TRAUMA' && traumaCap > 0) {
      pool = pool.filter(r => !(r.category === 'EM_HOME' && r.pgy === 2 && traumaCount[r.id] >= traumaCap));
      if (!pool.length) return { candidates: [], reason: 'traumaCapped' };
    }
    if (enforceRest) {
      pool = pool.filter(r => checkRestViolations(r.id, ds, shift.id, schedule).length === 0);
      if (!pool.length) return { candidates: [], reason: 'allRestBlocked' };
    }
    return { candidates: pool, reason: null };
  }

  // Weights are ordered by priority, each comfortably larger than the sum below it so a
  // higher-priority factor always wins: hitting shift target (100) outranks day/eve/night
  // variety (20), which outranks trimming a long consecutive-workday streak (15); avoiding
  // a jeopardy-call date under 'warn' policy (50) sits between them since it's a soft
  // preference, not a hard rule (jeopardyPolicy 'block' already excludes the resident
  // entirely upstream, in getEligibleShifts). Math.random() only breaks exact ties.
  function score(r, shift, ds) {
    const t = target[r.id];
    const deficit = (t - assigned[r.id]) / t;
    const mixShare = typeCount[r.id][shift.type] / Math.max(1, assigned[r.id]);
    const streak = streakBefore(r.id, ds);
    const jeo = jeoPolicy === 'warn' && (r.jeopardyDates || []).includes(ds) ? 1 : 0;
    return 100 * deficit - 20 * mixShare - 15 * Math.max(0, streak - 3) - 50 * jeo + Math.random();
  }

  for (const ds of dates) {
    // Open slots for the day: coverage minus already-assigned (kept manual counts toward coverage)
    const slots = [];
    for (const shift of SHIFTS) {
      const already = allResidents.filter(r => schedule[r.id][ds] === shift.id).length;
      const need = getCoverageFor(shift.id, coverage);
      report.totalSlots += need;
      for (let k = already; k < need; k++) slots.push({ shift, slotIndex: k });
    }
    // MRV: fill the most-constrained shift first (fewest strict candidates as of the day start).
    // Cache each shift's first-slot pool here and reuse it below — the fill loop only needs to
    // recompute once a slot has actually been filled and state (assigned/typeCount) changed.
    const poolCache = {};
    for (const { shift } of slots) {
      if (poolCache[shift.id] == null) poolCache[shift.id] = candidatePool(shift, ds);
    }
    slots.sort((a, b) => poolCache[a.shift.id].candidates.length - poolCache[b.shift.id].candidates.length);

    for (const slot of slots) {
      const { candidates, reason } = poolCache[slot.shift.id] ?? candidatePool(slot.shift, ds);
      poolCache[slot.shift.id] = null;
      if (!candidates.length) {
        report.unfilled.push({ dateStr: ds, shiftId: slot.shift.id, slotIndex: slot.slotIndex, reason });
        continue;
      }
      let best = candidates[0], bestScore = -Infinity;
      for (const r of candidates) {
        const s = score(r, slot.shift, ds);
        if (s > bestScore) { bestScore = s; best = r; }
      }
      schedule[best.id][ds] = slot.shift.id;
      assigned[best.id]++;
      typeCount[best.id][slot.shift.type]++;
      if (slot.shift.area === 'TRAUMA') traumaCount[best.id]++;
      if (jeoPolicy === 'warn' && (best.jeopardyDates || []).includes(ds)) {
        report.jeopardyPlacements.push({ residentId: best.id, name: `${best.firstName} ${best.lastName}`, dateStr: ds, shiftId: slot.shift.id });
      }
      report.filled++;
    }
  }

  report.underTarget = allResidents
    .filter(r => target[r.id] != null && isSchedulable(r) && assigned[r.id] < target[r.id])
    .map(r => ({ residentId: r.id, name: `${r.firstName} ${r.lastName}`, assigned: assigned[r.id], target: target[r.id] }));

  return { schedule, report };
}

// Render-time summary of a generation report: group unfilled slots per shift, detect
// structural weekday gaps (day-of-week rules that block everyone — Trauma days, GR Wed),
// and derive plain-language recommendations. Not stored — wording can evolve freely.
function summarizeGenerationReport(report, appSettings = {}) {
  const byShift = {};
  for (const u of report.unfilled) {
    (byShift[u.shiftId] ??= []).push(u);
  }
  const dow = ds => parseDate(ds).getDay();
  const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return Object.entries(byShift).map(([shiftId, slots]) => {
    const reasonCounts = {};
    for (const s of slots) reasonCounts[s.reason] = (reasonCounts[s.reason] || 0) + 1;

    // Structural test: every noEligible gap for this shift falls on a fixed weekday subset,
    // and that subset is a strict subset of the block's weekdays — i.e. a day-of-week rule.
    const noElig = slots.filter(s => s.reason === 'noEligible');
    const gapDows = [...new Set(noElig.map(s => dow(s.dateStr)))].sort();
    const structural = noElig.length > 0 && noElig.length === slots.length && gapDows.length < 7 &&
      noElig.every(s => gapDows.includes(dow(s.dateStr)));

    const recs = [];
    const label = SHIFT_MAP[shiftId]?.label || shiftId;
    if (reasonCounts.noEligible) {
      recs.push(structural
        ? `${label} had no eligible residents on ${gapDows.map(d=>DOW_NAMES[d]).join('/')} — a day-of-week rule blocks everyone (e.g. Trauma Tue/Thu/Sat/Sun window, GR Wednesday). If that's expected, no action needed; otherwise edit the rule on this tab.`
        : `No resident in this block is eligible for ${label} on those days — check the Shift Matrix and each resident's rotation (EM Residents tab).`);
    }
    if (reasonCounts.allAtTarget) recs.push(`Everyone eligible for ${label} had already reached their shift target — raise targets in Settings → Shift Targets, or lower ${label} coverage above.`);
    if (reasonCounts.allRestBlocked) recs.push(`All eligible residents were blocked by the rest-period rule — rearrange nearby night shifts manually, or Generate again (tie-breaking is randomized, a different arrangement may fit).`);
    if (reasonCounts.allWorking) recs.push(`Everyone eligible for ${label} was already working that day — add residents to this block or reduce same-day coverage.`);
    if (reasonCounts.selfCoverOnly) recs.push(`Only self-scheduling residents (no shift target, e.g. Peds) are eligible for ${label} — assign them manually in the grid, or set ${label} coverage to 0.`);
    if (reasonCounts.traumaCapped) recs.push(`Eligible PGY-2s hit the trauma cap (${appSettings.pgy2TraumaCap ?? 3}/block) — raise the cap in Settings or cover with a PGY-1/PGY-3.`);

    return { shiftId, slots, reasonCounts, structural, gapDows, recommendations: recs };
  }).sort((a, b) => (a.structural ? 1 : 0) - (b.structural ? 1 : 0));
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

// Collapsible variant of SectionCard — same styling, toggleable body, default open.
// `action` (e.g. Save/New buttons) sits in the header and won't trigger the toggle.
function CollapsibleCard({ title, subtitle, children, action, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors text-left">
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action && <span onClick={e => e.stopPropagation()}>{action}</span>}
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}/>
        </div>
      </button>
      {open && <div className="px-5 py-4">{children}</div>}
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
      <CollapsibleCard title="Block Overview">
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
      </CollapsibleCard>

      {/* Conferences in this block */}
      <CollapsibleCard title="Conferences This Block"
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
      </CollapsibleCard>

      {/* 1st Fridays */}
      {firstFridays.length > 0 && (
        <CollapsibleCard title="First Fridays This Block"
          subtitle="Anesthesia: off 2–4pm social hour. ⚠ Full rule TBD.">
          <div className="flex flex-wrap gap-2">
            {firstFridays.map(d => (
              <span key={d} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 border border-violet-200 text-sm font-medium text-violet-700">
                <CalendarDays size={13}/>
                {formatDisplayDate(d)}
              </span>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Special days for this block — editable */}
      <CollapsibleCard title="Special Days" subtitle="Days with schedule restrictions. Changes take effect immediately in the schedule grid.">
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
      </CollapsibleCard>

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

function HomeTab({ block, updateBlock, emRoster, blocksHistory, ayData, updateAyData, appSettings, onContinue, onLoadBlock, onSaveBlock, onNewBlock }) {
  const shiftCount = Object.values(block.schedule || {}).reduce((s,d) => s + Object.values(d).filter(Boolean).length, 0);
  const resCount   = emRoster.length + (block.offServiceResidents || []).length;
  const daysInBlock = getBlockDates(block.startDate, block.endDate).length;
  const [blockOpen, setBlockOpen] = useState(true);
  const [ayOpen, setAyOpen] = useState(true);

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

  function onStartDateChange(s) { applyStartDate(updateBlock, appSettings, s); }

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Current Block — inline editable form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Card header — collapsible; Save/New buttons don't trigger the toggle */}
        <button onClick={() => setBlockOpen(p => !p)}
          className="w-full px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors text-left">
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Current Block</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {resCount > 0 || shiftCount > 0
                ? `${resCount} resident${resCount !== 1 ? 's' : ''} · ${shiftCount} shift${shiftCount !== 1 ? 's' : ''} assigned`
                : 'Set dates below to start scheduling'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span onClick={e => e.stopPropagation()} className="flex gap-2">
              <button onClick={onSaveBlock}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
                <Save size={12}/> Save Block
              </button>
              <button onClick={onNewBlock}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors">
                <Plus size={12}/> New Block
              </button>
            </span>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${blockOpen ? 'rotate-180' : ''}`}/>
          </div>
        </button>

        {blockOpen && <>
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
        </>}
      </div>

      {/* Saved Blocks — grouped by AY */}
      <div className="space-y-2">
        <button onClick={() => setAyOpen(p => !p)} className="w-full flex items-center justify-between mb-1 text-left">
          <h3 className="text-sm font-semibold text-gray-700">Academic Years</h3>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-400">Conference & ITE dates are set per AY</p>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${ayOpen ? 'rotate-180' : ''}`}/>
          </div>
        </button>

        {ayOpen && (byYear.length === 0 ? (
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
        )))}
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
    jeopardyDates:    initial?.jeopardyDates    ?? [],
  });

  const [newOffDate, setNewOffDate] = useState('');
  const [newJeoDate, setNewJeoDate] = useState('');

  function addOffDate() {
    const d = newOffDate;
    if (!d || form.approvedDatesOff.includes(d)) { setNewOffDate(''); return; }
    set('approvedDatesOff', [...form.approvedDatesOff, d].sort());
    setNewOffDate('');
  }
  function removeOffDate(d) { set('approvedDatesOff', form.approvedDatesOff.filter(x => x !== d)); }

  function addJeoDate() {
    const d = newJeoDate;
    if (!d || form.jeopardyDates.includes(d)) { setNewJeoDate(''); return; }
    set('jeopardyDates', [...form.jeopardyDates, d].sort());
    setNewJeoDate('');
  }
  function removeJeoDate(d) { set('jeopardyDates', form.jeopardyDates.filter(x => x !== d)); }

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
      jeopardyDates:    form.jeopardyDates,
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

        {/* Jeopardy Call Dates */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Jeopardy Call Dates</label>
          <p className="text-xs text-gray-400 mb-2">Resident covers backup (jeopardy) call these dates — handling set in Settings</p>
          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[22px]">
            {form.jeopardyDates.length === 0
              ? <span className="text-xs text-gray-300 italic">None set</span>
              : form.jeopardyDates.map(d => (
                <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200">
                  {formatDisplayDate(d)}
                  <button type="button" onClick={() => removeJeoDate(d)} className="hover:opacity-60"><X size={10}/></button>
                </span>
              ))
            }
          </div>
          <div className="flex items-center gap-1.5">
            <input type="date" value={newJeoDate} onChange={e => setNewJeoDate(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addJeoDate())}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white" />
            <button type="button" onClick={addJeoDate} disabled={!newJeoDate}
              className="text-xs px-2.5 py-1 bg-violet-500 hover:bg-violet-600 text-white rounded-lg disabled:opacity-30 transition-colors font-medium">
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

// Bulk-import wrapper — paste or upload roster text, preview, then commit new rows only.
// Shared by the EM Residents and Off-Service tabs; `allowedCategoryIds` scopes which
// categories are accepted (EM_HOME only, vs the 8 off-service specialties).
function ImportRosterModal({ title, allowedCategoryIds, existingNames, onImport, onClose }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);
  const existingKeys = useMemo(() => new Set(existingNames.map(n => normalizeToken(n.firstName + n.lastName))), [existingNames]);

  function parse() {
    const { ok, errors } = parseRosterText(text, allowedCategoryIds);
    const seen = new Set();
    const rows = ok.map(r => {
      const key = normalizeToken(r.firstName + r.lastName);
      const status = existingKeys.has(key) || seen.has(key) ? 'duplicate' : 'new';
      seen.add(key);
      return { ...r, key, status };
    });
    setPreview({ rows, errors });
  }

  function pickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(file);
    e.target.value = '';
  }

  function commit() {
    const newRows = preview.rows.filter(r => r.status === 'new').map(({ key, status, ...r }) => r);
    onImport(newRows);
    onClose();
  }

  const newCount = preview?.rows.filter(r => r.status === 'new').length ?? 0;

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Paste rows copied from a spreadsheet, or upload a CSV/text file. Expected columns: Resident ("Last, First"), Category, PGY —
          any Rotation or date columns are ignored.
        </p>
        <textarea value={text} onChange={e => { setText(e.target.value); setPreview(null); }} rows={6}
          placeholder={'Chen, Liling\tEM - Home\t1\nGallegos, Abel\tEM - Home\t1'}
          className="w-full text-xs font-mono border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
            <Upload size={12}/> Choose file
          </button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={pickFile} className="hidden"/>
          <button type="button" onClick={parse} disabled={!text.trim()}
            className="ml-auto px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg">
            Parse
          </button>
        </div>

        {preview && (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {preview.rows.map((r,i) => (
              <div key={`ok-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                {r.status === 'new'
                  ? <Check size={12} className="text-emerald-500 shrink-0"/>
                  : <span className="text-gray-300 shrink-0 text-[10px] font-semibold">—</span>}
                <span className="text-gray-700">{r.firstName} {r.lastName}</span>
                <span className="text-gray-400">PGY-{r.pgy} · {CAT_MAP[r.category].shortLabel}</span>
                {r.status === 'duplicate' && <span className="ml-auto text-gray-400">already in roster, skipped</span>}
              </div>
            ))}
            {preview.errors.map((e,i) => (
              <div key={`err-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-xs bg-red-50/50">
                <X size={12} className="text-red-400 shrink-0"/>
                <span className="text-red-700">Line {e.line}: {e.reason}</span>
              </div>
            ))}
            {preview.rows.length === 0 && preview.errors.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">Nothing recognizable in that text.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">Cancel</button>
          <button type="button" onClick={commit} disabled={!preview || newCount === 0}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg font-medium transition-colors">
            Import {newCount > 0 ? newCount : ''} resident{newCount!==1?'s':''}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── EM RESIDENTS TAB ─────────────────────────────────────────────────────────

function EMResidentsTab({ emRoster, setEmRoster, block, updateBlock, appSettings }) {
  // showAdd: null | { pgy, category }
  const [showAdd, setShowAdd]         = useState(null);
  const [showImport, setShowImport]   = useState(false);
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
  function target(r) { const ba = assign[r.id] || {}; return getShiftTarget({ ...r, isChief: !!ba.isChief }, appSettings); }

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
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
            <Upload size={11}/> Import Roster
          </button>
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
                      {(res.approvedDatesOff?.length > 0 || res.jeopardyDates?.length > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(res.approvedDatesOff || []).map(d => (
                            <span key={d} className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200 font-medium">{formatDisplayDate(d)} off</span>
                          ))}
                          {(res.jeopardyDates || []).map(d => (
                            <span key={`j${d}`} className="text-xs px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 border border-violet-200 font-medium">J: {formatDisplayDate(d)}</span>
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
      {showImport && (
        <ImportRosterModal title="Import EM Home Roster" allowedCategoryIds={['EM_HOME']}
          existingNames={emRoster}
          onImport={rows => setEmRoster(p => [...p, ...rows.map(r => ({
            id: uuid(), ...r, blockType: 'EM', isCCUNights: false, approvedDatesOff: [], jeopardyDates: [],
          }))])}
          onClose={() => setShowImport(false)}/>
      )}
    </div>
  );
}

// ─── OFF-SERVICE TAB ──────────────────────────────────────────────────────────

function OffServiceTab({ block, updateBlock, appSettings }) {
  // showAdd: null | { category }
  const [showAdd, setShowAdd]           = useState(null);
  const [showImport, setShowImport]     = useState(false);
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
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
            <Upload size={11}/> Import Roster
          </button>
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
                  const tgt  = getShiftTarget(res, appSettings);
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
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                            <SpecialDaysList label="Approved Dates Off" dates={res.approvedDatesOff || []}
                              onUpdate={d => setField(res.id, 'approvedDatesOff', d)}
                              chipClass="bg-orange-100 text-orange-600 border border-orange-200"/>
                            <SpecialDaysList label="Jeopardy Call Dates" dates={res.jeopardyDates || []}
                              onUpdate={d => setField(res.id, 'jeopardyDates', d)}
                              chipClass="bg-violet-100 text-violet-600 border border-violet-200"/>
                          </div>
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
      {showImport && (
        <ImportRosterModal title="Import Off-Service Roster" allowedCategoryIds={offServiceCats.map(c => c.id)}
          existingNames={residents}
          onImport={rows => updateBlock(b => ({ ...b, offServiceResidents: [...(b.offServiceResidents || []), ...rows.map(r => ({
            id: uuid(), ...r, isCCUNights: false, approvedDatesOff: [], jeopardyDates: [],
          }))] }))}
          onClose={() => setShowImport(false)}/>
      )}
    </div>
  );
}

// ─── SHIFT MATRIX TAB ─────────────────────────────────────────────────────────

function ShiftMatrixTab({ eligOverrides, setEligOverrides }) {
  // expanded: which EM Home rows show their per-rotation sub-rows
  const [expanded, setExpanded] = useState({});

  function effective(k) { return eligOverrides[k] ?? BASE_ELIGIBILITY[k] ?? []; }
  function isElig(k,s) { return effective(k).includes(s); }
  function toggle(k,s) {
    setEligOverrides(p=>{ const cur=[...effective(k)]; const next=cur.includes(s)?cur.filter(x=>x!==s):[...cur,s]; return {...p,[k]:next}; });
  }
  function isModified(k) { return JSON.stringify([...(BASE_ELIGIBILITY[k]||[])].sort()) !== JSON.stringify([...effective(k)].sort()); }
  function resetRow(k) { setEligOverrides(p=>{ const n={...p}; delete n[k]; return n; }); }

  // Rotation sub-row helpers — key format: CATEGORY_PGY__ROTATION
  function subKey(parentKey, btId) { return `${parentKey}__${btId}`; }
  function subEffective(parentKey, btId) {
    return eligOverrides[subKey(parentKey, btId)] ?? effective(parentKey);
  }
  function subHasOverride(parentKey, btId) { return !!eligOverrides[subKey(parentKey, btId)]; }
  function subToggle(parentKey, btId, s) {
    const k = subKey(parentKey, btId);
    setEligOverrides(p=>{
      const cur = [...(p[k] ?? effective(parentKey))];
      const next = cur.includes(s) ? cur.filter(x=>x!==s) : [...cur, s];
      return { ...p, [k]: next };
    });
  }
  function subReset(parentKey, btId) { resetRow(subKey(parentKey, btId)); }

  // Schedulable rotations per EM Home PGY (sub-rows only make sense where the chief schedules)
  function rotationsFor(rowKey) {
    const m = rowKey.match(/^EM_HOME_(\d)$/);
    if (!m) return [];
    const ids = EM_HOME_BLOCK_TYPES_BY_PGY[Number(m[1])] || [];
    return ids.map(id => BLOCK_TYPE_MAP[id]).filter(b => b && b.schedulable);
  }

  const areaColor = { POD:'text-blue-700 bg-blue-50 border-blue-200', PED:'text-emerald-700 bg-emerald-50 border-emerald-200', FLEX:'text-purple-700 bg-purple-50 border-purple-200', MT:'text-amber-700 bg-amber-50 border-amber-200', TRAUMA:'text-red-700 bg-red-50 border-red-200' };

  function CellButton({ k, s, checked, inherited = false, onToggle }) {
    return (
      <td className="border-r border-gray-100 p-0 text-center">
        <button onClick={onToggle}
          title={`${checked ? 'Remove' : 'Add'} ${s.label}${inherited ? ' (inherits from category default — clicking creates a rotation override)' : ''}`}
          className={`w-full h-9 flex items-center justify-center transition-colors ${checked ? 'bg-indigo-50 hover:bg-indigo-100' : 'hover:bg-gray-100'}`}>
          {checked
            ? <div className={`w-4 h-4 rounded flex items-center justify-center ${s.chip} ${inherited ? 'opacity-40' : ''}`}><Check size={9}/></div>
            : <div className={`w-4 h-4 rounded border-2 ${inherited ? 'border-gray-100' : 'border-gray-200'}`}/>}
        </button>
      </td>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Shift Eligibility Matrix</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Toggle eligibility per residency &amp; year. Expand an EM Home row (▸) to set per-rotation eligibility — e.g. different shifts on EMS vs Tox vs Peds/Trauma months.
            Day-of-week rules (GR days, clinic days) are enforced on top of this matrix.
          </p>
        </div>
        <button onClick={()=>setEligOverrides({})} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors shrink-0">
          <RefreshCw size={12}/> Reset All
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto schedule-scroll">
          <table className="text-xs border-collapse" style={{minWidth:900}}>
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 w-56 min-w-56 border-b border-r border-gray-200 px-3 py-2 text-left text-gray-500 font-semibold">Residency / Year / Rotation</th>
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
                const rotations = rotationsFor(row.key);
                const isOpen = !!expanded[row.key];
                const rotOverrideCount = rotations.filter(b => subHasOverride(row.key, b.id)).length;
                return (
                  <React.Fragment key={row.key}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className={`sticky left-0 z-10 border-r border-gray-200 px-3 py-2 ${cat?.rowBg||'bg-white'}`}>
                        <div className="flex items-center gap-2">
                          {rotations.length > 0 && (
                            <button onClick={()=>setExpanded(p=>({...p,[row.key]:!p[row.key]}))}
                              title={isOpen ? 'Hide rotations' : 'Show per-rotation eligibility'}
                              className="text-gray-400 hover:text-indigo-600 transition-colors -ml-1">
                              <ChevronDown size={12} className={`transition-transform ${isOpen ? '' : '-rotate-90'}`}/>
                            </button>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cat?.badge}`}>{row.sub}</span>
                          <span className="text-gray-700 font-medium">{row.label}</span>
                          {mod && <span className="text-indigo-500 text-xs" title="Modified from default">✎</span>}
                          {rotOverrideCount > 0 && (
                            <span className="text-xs text-violet-500" title={`${rotOverrideCount} rotation override${rotOverrideCount!==1?'s':''}`}>
                              {rotOverrideCount}⚙
                            </span>
                          )}
                        </div>
                      </td>
                      {SHIFTS.map(s=>(
                        <CellButton key={s.id} k={row.key} s={s}
                          checked={isElig(row.key, s.id)}
                          onToggle={()=>toggle(row.key, s.id)}/>
                      ))}
                      <td className="px-2">
                        {mod && <button onClick={()=>resetRow(row.key)} title="Reset row"><RefreshCw size={11} className="text-gray-400 hover:text-indigo-600"/></button>}
                      </td>
                    </tr>

                    {/* Per-rotation sub-rows */}
                    {isOpen && rotations.map(bt=>{
                      const hasOv = subHasOverride(row.key, bt.id);
                      const eff = subEffective(row.key, bt.id);
                      return (
                        <tr key={subKey(row.key, bt.id)} className="bg-slate-50/60 hover:bg-slate-100/60 transition-colors">
                          <td className="sticky left-0 z-10 border-r border-gray-200 pl-9 pr-3 py-1.5 bg-slate-50">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 font-medium">{bt.label}</span>
                              {hasOv
                                ? <span className="text-violet-500 text-xs font-medium" title="Rotation-specific override active">override ✎</span>
                                : <span className="text-gray-300 text-xs italic">inherits</span>}
                            </div>
                          </td>
                          {SHIFTS.map(s=>(
                            <CellButton key={s.id} k={subKey(row.key, bt.id)} s={s}
                              checked={eff.includes(s.id)}
                              inherited={!hasOv}
                              onToggle={()=>subToggle(row.key, bt.id, s.id)}/>
                          ))}
                          <td className="px-2">
                            {hasOv && <button onClick={()=>subReset(row.key, bt.id)} title="Remove override (revert to inherited)"><RefreshCw size={11} className="text-gray-400 hover:text-violet-600"/></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-gray-400">
        <p><span className="font-medium text-gray-500">How rotation rows work:</span> a dimmed check = inherited from the category row above. Click any cell in a rotation row to create a rotation-specific override — that rotation then uses its own list (marked <span className="text-violet-500 font-medium">override ✎</span>) and ignores later changes to the parent row until you reset it.</p>
        <p className="italic">A rotation override replaces built-in shift-type rules for that rotation (e.g. PGY-1 "no trauma outside trauma blocks"), but day-of-week rules (GR Wednesday, EMS Mon/Tue, Tox Thu/Fri, trauma Tue/Thu/Sat/Sun) always still apply.</p>
      </div>
    </div>
  );
}

// ─── RULES TAB ────────────────────────────────────────────────────────────────

// Collapsible sub-section within a Scheduling Rules row — independent of the row's own
// expand/collapse, so long rows (many gates/notes) can be skimmed without full-row scrolling.
function Collapsible({ title, badge, defaultOpen = true, titleClassName = 'text-gray-500 group-hover:text-gray-700', children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" onClick={()=>setOpen(p=>!p)} className="w-full flex items-center gap-2 text-left group mb-1">
        <ChevronDown size={11} className={`text-gray-300 group-hover:text-gray-500 transition-transform shrink-0 ${open?'':'-rotate-90'}`}/>
        <span className={`text-xs font-semibold uppercase tracking-wide ${titleClassName}`}>{title}</span>
        {badge}
      </button>
      {open && <div className="pl-4">{children}</div>}
    </div>
  );
}

function DayPillRow({ days, onToggle, color = 'indigo' }) {
  const on  = color === 'red' ? 'bg-red-600 text-white border-red-600' : 'bg-indigo-600 text-white border-indigo-600';
  const off = color === 'red' ? 'bg-white text-gray-500 border-gray-200 hover:border-red-300' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300';
  return (
    <div className="flex gap-1 flex-wrap">
      {DOW.map((d,i)=>(
        <button key={i} type="button" onClick={()=>onToggle(i)}
          className={`w-8 h-7 text-xs font-medium rounded border transition-colors ${days.includes(i) ? on : off}`}>
          {d}
        </button>
      ))}
    </div>
  );
}

// Editable controls for one CATEGORY_PGY's day/block rules (DEFAULT_DAY_RULES shape).
// `update(fn)` applies fn(currentDr) => nextDr immutably via the parent's setDayRules.
function DayRulesEditor({ rowKey, dr, update }) {
  const pgyMatch = rowKey.match(/_(\d)$/);
  const pgy = pgyMatch ? Number(pgyMatch[1]) : null;
  const isEmHome = rowKey.startsWith('EM_HOME_');
  const rotationOptions = isEmHome ? (EM_HOME_BLOCK_TYPES_BY_PGY[pgy] || []).map(id => BLOCK_TYPE_MAP[id]).filter(Boolean) : [];

  const toggleIn = (arr, i) => (arr||[]).includes(i) ? arr.filter(x=>x!==i) : [...(arr||[]), i].sort((a,b)=>a-b);

  function addRestriction() { update(d => ({ ...d, dayTypeRestrictions: [...(d.dayTypeRestrictions||[]), { days: [], mode: 'onlyDay' }] })); }
  function updRestriction(i, patch) { update(d => ({ ...d, dayTypeRestrictions: d.dayTypeRestrictions.map((r,idx)=>idx===i?{...r,...patch}:r) })); }
  function rmRestriction(i) { update(d => ({ ...d, dayTypeRestrictions: d.dayTypeRestrictions.filter((_,idx)=>idx!==i) })); }

  function addGate() {
    update(d => ({ ...d, shiftGates: [...(d.shiftGates||[]),
      { id: `gate_${Date.now()}`, shiftIds: 'ALL', blockTypeFilter: null, allowedDays: undefined, nightExcludedDays: undefined, outsideAction: 'blockEntireDay', overrideImmune: false } ] }));
  }
  function updGate(i, patch) { update(d => ({ ...d, shiftGates: d.shiftGates.map((g,idx)=>idx===i?{...g,...patch}:g) })); }
  function rmGate(i) { update(d => ({ ...d, shiftGates: d.shiftGates.filter((_,idx)=>idx!==i) })); }

  function addSpecialRule(listKey) { update(d => ({ ...d, specialDayRules: [...(d.specialDayRules||[]), { listKey, offset: 'sameDay' }] })); }
  function rmSpecialRule(listKey) { update(d => ({ ...d, specialDayRules: (d.specialDayRules||[]).filter(r=>r.listKey!==listKey) })); }
  function updSpecialRule(listKey, offset) { update(d => ({ ...d, specialDayRules: (d.specialDayRules||[]).map(r=>r.listKey===listKey?{...r,offset}:r) })); }

  const ccuOverride = (dr.residentFlagOverrides||[]).find(f => f.flag === 'isCCUNights');

  return (
    <div className="space-y-4">
      {/* Full block / only days */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Full-Day Block</div>
        <p className="text-xs text-gray-400 mb-1.5">Whole day unschedulable for this type.</p>
        <DayPillRow color="red" days={dr.fullBlockDays||[]} onToggle={i=>update(d=>({...d, fullBlockDays: toggleIn(d.fullBlockDays, i)}))}/>
      </div>

      <div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={!!dr.onlyDaysEnabled} onChange={e=>update(d=>({...d, onlyDaysEnabled: e.target.checked}))} className="rounded"/>
          Restrict to only these days
        </label>
        {dr.onlyDaysEnabled && (
          <DayPillRow days={dr.onlyDays||[]} onToggle={i=>update(d=>({...d, onlyDays: toggleIn(d.onlyDays, i)}))}/>
        )}
      </div>

      {/* Day-type restrictions */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shift-Type Restrictions</div>
          <button onClick={addRestriction} className="text-xs text-indigo-600 hover:underline">+ Add</button>
        </div>
        <div className="space-y-2">
          {(dr.dayTypeRestrictions||[]).map((r,i)=>(
            <div key={i} className="flex items-center gap-2 flex-wrap bg-gray-50 rounded-lg p-2">
              <DayPillRow days={r.days||[]} onToggle={day=>updRestriction(i,{days: toggleIn(r.days, day)})}/>
              <select value={r.mode} onChange={e=>updRestriction(i,{mode: e.target.value})} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5">
                {Object.entries(DOW_MODE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
              <button onClick={()=>rmRestriction(i)} className="text-gray-300 hover:text-red-500 ml-auto"><Trash2 size={13}/></button>
            </div>
          ))}
          {(dr.dayTypeRestrictions||[]).length===0 && <p className="text-xs text-gray-300 italic">None</p>}
        </div>
      </div>

      {/* Shift / rotation gates */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shift &amp; Rotation Gates</div>
          <button onClick={addGate} className="text-xs text-indigo-600 hover:underline">+ Add gate</button>
        </div>
        <div className="space-y-2">
          {(dr.shiftGates||[]).map((g,i)=>{
            const specific = g.shiftIds !== 'ALL';
            const filterOn = !!g.blockTypeFilter;
            const usingTrauma = g.blockTypeFilter?.ref === 'TRAUMA_BLOCKS';
            return (
              <div key={g.id||i} className="bg-gray-50 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={specific ? 'specific' : 'all'}
                    onChange={e=>updGate(i, e.target.value==='all' ? {shiftIds:'ALL', outsideAction:'blockEntireDay'} : {shiftIds:[]})}
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1.5">
                    <option value="all">All shifts</option>
                    <option value="specific">Specific shifts</option>
                  </select>
                  <button onClick={()=>rmGate(i)} className="text-gray-300 hover:text-red-500 ml-auto"><Trash2 size={13}/></button>
                </div>
                {specific && (
                  <div className="flex flex-wrap gap-1">
                    {SHIFTS.map(s=>{
                      const checked = (Array.isArray(g.shiftIds)?g.shiftIds:[]).includes(s.id);
                      return (
                        <button key={s.id} type="button"
                          onClick={()=>updGate(i, { shiftIds: checked ? g.shiftIds.filter(x=>x!==s.id) : [...(Array.isArray(g.shiftIds)?g.shiftIds:[]), s.id] })}
                          className={`text-xs px-1.5 py-0.5 rounded font-bold border ${checked ? s.chip+' border-transparent' : 'bg-white text-gray-400 border-gray-200'}`}>
                          {s.id}
                        </button>
                      );
                    })}
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                  <input type="checkbox" checked={filterOn} className="rounded"
                    onChange={e=>updGate(i, { blockTypeFilter: e.target.checked ? { mode:'only', ids:[] } : null })}/>
                  Limit to specific rotations
                </label>
                {filterOn && (
                  <div className="pl-5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <select value={g.blockTypeFilter.mode} onChange={e=>updGate(i,{blockTypeFilter:{...g.blockTypeFilter, mode:e.target.value}})}
                        className="text-xs border border-gray-300 rounded-lg px-2 py-1">
                        <option value="only">Only on</option>
                        <option value="except">Except on</option>
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                        <input type="checkbox" checked={usingTrauma} className="rounded"
                          onChange={e=>updGate(i,{blockTypeFilter:{mode:g.blockTypeFilter.mode, ...(e.target.checked ? {ref:'TRAUMA_BLOCKS'} : {ids:[]})}})}/>
                        Use "Trauma Block Types" list
                      </label>
                    </div>
                    {!usingTrauma && (
                      <div className="flex flex-wrap gap-1">
                        {(rotationOptions.length ? rotationOptions : BLOCK_TYPES_EM).map(bt=>{
                          const checked = (g.blockTypeFilter.ids||[]).includes(bt.id);
                          return (
                            <button key={bt.id} type="button"
                              onClick={()=>updGate(i, { blockTypeFilter: { ...g.blockTypeFilter, ids: checked ? g.blockTypeFilter.ids.filter(x=>x!==bt.id) : [...(g.blockTypeFilter.ids||[]), bt.id] } })}
                              className={`text-xs px-1.5 py-0.5 rounded border font-medium ${checked ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-500 border-gray-200'}`}>
                              {bt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                  <input type="checkbox" checked={!!g.allowedDays} className="rounded"
                    onChange={e=>updGate(i, { allowedDays: e.target.checked ? [] : undefined, nightExcludedDays: undefined })}/>
                  Limit to specific days
                </label>
                {g.allowedDays && (
                  <div className="pl-5 space-y-1.5">
                    <DayPillRow days={g.allowedDays} onToggle={day=>updGate(i,{allowedDays: toggleIn(g.allowedDays, day)})}/>
                    {specific ? null : (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">No night shifts on:</p>
                        <DayPillRow days={g.nightExcludedDays||[]} onToggle={day=>updGate(i,{nightExcludedDays: toggleIn(g.nightExcludedDays, day)})}/>
                      </div>
                    )}
                    {specific && (
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                        <input type="checkbox" checked={g.outsideAction==='blockEntireDay'} className="rounded"
                          onChange={e=>updGate(i,{outsideAction: e.target.checked ? 'blockEntireDay' : 'stripShiftIds'})}/>
                        Block entire day outside allowed days (instead of just these shifts)
                      </label>
                    )}
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                  <input type="checkbox" checked={!!g.overrideImmune} className="rounded"
                    onChange={e=>updGate(i,{overrideImmune: e.target.checked})}/>
                  Always apply, even over a rotation-specific Shift Matrix override
                </label>
              </div>
            );
          })}
          {(dr.shiftGates||[]).length===0 && <p className="text-xs text-gray-300 italic">None</p>}
        </div>
      </div>

      {/* Special day rules */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Special-Day Rules</div>
        <p className="text-xs text-gray-400 mb-1.5">Dates are edited on the Dashboard tab — this controls how each list affects eligibility.</p>
        <div className="space-y-1.5">
          {[
            {key:'codeBlueDays', label:'Code Blue days'},
            {key:'advocacyDays', label:'Advocacy days'},
            {key:'procDays', label:'Procedure days'},
            {key:'anesDays', label:'Anesthesia days'},
          ].map(({key,label})=>{
            const rule = (dr.specialDayRules||[]).find(r=>r.listKey===key);
            return (
              <div key={key} className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none w-40 shrink-0">
                  <input type="checkbox" checked={!!rule} className="rounded"
                    onChange={e=>e.target.checked ? addSpecialRule(key) : rmSpecialRule(key)}/>
                  {label}
                </label>
                {rule && (
                  <select value={rule.offset} onChange={e=>updSpecialRule(key, e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1">
                    <option value="sameDay">Block that day</option>
                    <option value="dayBefore">Block the day before</option>
                    <option value="sameDayAndDayBefore">Block that day &amp; the day before</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CCU-nights override (IM_2 only) */}
      {rowKey === 'IM_2' && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">CCU Nights Override</div>
          <p className="text-xs text-gray-400 mb-1.5">When a resident's "Covering CCU nights" flag is set, block these days instead of the Shift-Type Restrictions above.</p>
          <DayPillRow color="red" days={ccuOverride?.fullBlockDays||[]}
            onToggle={i=>update(d=>({...d, residentFlagOverrides: [{ flag:'isCCUNights', fullBlockDays: toggleIn(ccuOverride?.fullBlockDays, i) }] }))}/>
        </div>
      )}
    </div>
  );
}

function RulesTab({ allResidents, block, eligOverrides, appSettings, dayRules, setDayRules, coverage, setCoverage }) {
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

  const traumaBlocks = dayRules.TRAUMA_BLOCKS ?? TRAUMA_BLOCKS;
  const traumaBlocksModified = JSON.stringify([...traumaBlocks].sort()) !== JSON.stringify([...TRAUMA_BLOCKS].sort());
  function toggleTraumaBlock(id) {
    const next = traumaBlocks.includes(id) ? traumaBlocks.filter(x=>x!==id) : [...traumaBlocks, id];
    setDayRules(p=>({...p, TRAUMA_BLOCKS: next}));
  }
  function resetTraumaBlocks() { setDayRules(p=>{ const n={...p}; delete n.TRAUMA_BLOCKS; return n; }); }

  function effectiveDr(key) { return dayRules[key] ?? DEFAULT_DAY_RULES[key] ?? {}; }
  function isRowModified(key) { return dayRules[key] !== undefined; }
  function updateDr(key, updater) {
    setDayRules(p => ({ ...p, [key]: updater(p[key] ?? DEFAULT_DAY_RULES[key] ?? {}) }));
  }
  function resetDr(key) { setDayRules(p => { const n = {...p}; delete n[key]; return n; }); }

  function eligSummaryFor(shiftIds) {
    if (shiftIds.length === 0) return 'No shifts configured.';
    const parts = SHIFT_AREAS.map(area => {
      const areaShifts = SHIFTS.filter(s=>s.area===area).map(s=>s.id);
      const covered = areaShifts.filter(id=>shiftIds.includes(id));
      if (covered.length === 0) return null;
      if (covered.length === areaShifts.length) return area;
      return `${area} (${covered.map(id=>SHIFT_MAP[id].type[0].toUpperCase()).join('')})`;
    }).filter(Boolean);
    return parts.length ? `Eligible: ${parts.join(', ')}.` : 'No shifts configured.';
  }

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
          <h2 className="text-base font-semibold text-gray-800">Scheduling Rules</h2>
          <p className="text-xs text-gray-500 mt-0.5">{showAll ? 'All resident types' : `${displayRows.length} type${displayRows.length!==1?'s':''} active this block`} — edited here, no code changes needed.</p>
        </div>
        <button onClick={()=>setShowAll(p=>!p)} className="text-xs text-indigo-600 hover:underline">
          {showAll ? 'Show active only' : 'Show all types'}
        </button>
      </div>

      <SectionCard title="Daily Shift Coverage" subtitle="How many residents each shift needs per day — used by Generate Schedule on the Schedule tab.">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="text-left font-medium pr-4 pb-2">Area</th>
                {['day','eve','night'].map(t => <th key={t} className="text-center font-medium px-3 pb-2 capitalize">{t === 'eve' ? 'Evening' : t}</th>)}
              </tr>
            </thead>
            <tbody>
              {SHIFT_AREAS.map(area => (
                <tr key={area}>
                  <td className="pr-4 py-1"><span className={`text-xs px-2 py-0.5 rounded font-bold ${SHIFTS.find(s=>s.area===area).chip}`}>{area}</span></td>
                  {['day','eve','night'].map(t => {
                    const shift = SHIFTS.find(s => s.area === area && s.type === t);
                    if (!shift) return <td key={t} className="text-center text-gray-300 px-3">—</td>;
                    const overridden = coverage[shift.id] != null;
                    return (
                      <td key={t} className="text-center px-3 py-1">
                        <span className="inline-flex items-center gap-1">
                          <input type="number" min={0} max={10}
                            value={getCoverageFor(shift.id, coverage)}
                            onChange={e => setCoverage(p => {
                              const n = { ...p };
                              const v = Math.max(0, Math.min(10, Number(e.target.value) || 0));
                              if (v === DEFAULT_COVERAGE[shift.id]) delete n[shift.id]; else n[shift.id] = v;
                              return n;
                            })}
                            className={`w-14 text-center text-sm border rounded-lg py-1 ${overridden ? 'border-indigo-400 bg-indigo-50 text-indigo-800 font-semibold' : 'border-gray-200'}`}/>
                          {overridden && (
                            <button onClick={() => setCoverage(p => { const n = { ...p }; delete n[shift.id]; return n; })}
                              title="Reset to default" className="text-gray-300 hover:text-indigo-600"><RefreshCw size={11}/></button>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Total: <strong className="text-gray-700">{SHIFTS.reduce((s, sh) => s + getCoverageFor(sh.id, coverage), 0)}</strong> resident-shifts needed per day.
          Set a shift to 0 to leave it out of generation. Trauma day-of-week limits still apply on top.
        </p>
      </SectionCard>

      <SectionCard title="Trauma Block Types" subtitle='Rotations treated as "trauma blocks" for the EM Home PGY-1 trauma-eligibility gate.'>
        <div className="flex items-center gap-2 flex-wrap">
          {BLOCK_TYPES_EM.map(bt=>{
            const checked = traumaBlocks.includes(bt.id);
            return (
              <button key={bt.id} type="button" onClick={()=>toggleTraumaBlock(bt.id)}
                className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors ${checked ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>
                {bt.label}
              </button>
            );
          })}
          {traumaBlocksModified && (
            <button onClick={resetTraumaBlocks} className="text-xs text-gray-400 hover:text-indigo-600 flex items-center gap-1"><RefreshCw size={11}/> Reset</button>
          )}
        </div>
      </SectionCard>

      {displayRows.map(row => {
        const cat = CAT_MAP[row.catId];
        const rn = RULE_NOTES[row.key] || {};
        const dr = effectiveDr(row.key);
        const modified = isRowModified(row.key);
        const effectiveShifts = eligOverrides[row.key] ?? BASE_ELIGIBILITY[row.key] ?? [];
        const isOpen = openKeys[row.key] !== false; // default open
        const targetOv = (appSettings?.targetOverrides||{})[row.key];
        const target = targetOv ?? SHIFT_TARGETS[row.key] ?? null;
        const generatedDayRules = [...describeDayRules(dr), ...describeShiftGates({...dr, __traumaBlocks: traumaBlocks})
          .map(g=>({label: g.ids[0]==='ALL' ? 'All rotations' : g.ids.map(id=>BLOCK_TYPE_MAP[id]?.label||id).join('/'), rule: g.note, type: 'restrict'}))];

        // Find active residents of this type
        const active = allResidents.filter(r => eligKey(r) === row.key && isSchedulable(r));

        return (
          <div key={row.key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Header */}
            <button onClick={()=>toggle(row.key)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left">
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat?.badge}`}>{row.sub}</span>
                <span className="font-semibold text-gray-800 text-sm">{row.label}</span>
                {modified && <span className="text-indigo-500 text-xs" title="Modified from default">✎</span>}
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
                <div className="pt-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Shift Target</div>
                    <p className="text-sm text-gray-700">{target != null ? `${target} shifts/block` : 'Per Amion — not set by this app (self-cover)'}</p>
                  </div>
                  {modified && (
                    <button onClick={()=>resetDr(row.key)} className="text-xs text-gray-400 hover:text-indigo-600 flex items-center gap-1 shrink-0"><RefreshCw size={11}/> Reset rules</button>
                  )}
                </div>

                {/* Eligible shifts */}
                <Collapsible title="Eligible Shifts">
                  <p className="text-xs text-gray-600 mb-2">{eligSummaryFor(effectiveShifts)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {effectiveShifts.map(sid=>{
                      const s=SHIFT_MAP[sid];
                      return s ? <span key={sid} className={`text-xs px-2 py-0.5 rounded font-bold ${s.chip}`}>{sid}</span> : null;
                    })}
                    {effectiveShifts.length===0 && <span className="text-xs text-gray-400 italic">None configured</span>}
                  </div>
                  {eligOverrides[row.key] && (
                    <p className="text-xs text-indigo-600 mt-1">✎ Matrix overrides are active for this type — edit on the Shift Matrix tab.</p>
                  )}
                </Collapsible>

                {/* Live-generated summary of the rules below, for quick scanning */}
                {generatedDayRules.length > 0 && (
                  <Collapsible title="Current Day / Rotation Rules">
                    <div className="space-y-1">
                      {generatedDayRules.map((r,i)=>(
                        <div key={i} className="flex items-start gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${ruleTypeColor[r.type]||'bg-gray-100 text-gray-600'}`}>
                            {ruleTypeLabel[r.type]||r.type}
                          </span>
                          <span className="text-xs text-gray-600 font-medium mr-1">{r.label}:</span>
                          <span className="text-xs text-gray-600">{r.rule}</span>
                        </div>
                      ))}
                    </div>
                  </Collapsible>
                )}

                {/* Editable rules */}
                <div className="border-t border-gray-100 pt-3">
                  <Collapsible title="Edit Day &amp; Block Rules">
                    <DayRulesEditor rowKey={row.key} dr={dr} update={fn=>updateDr(row.key, fn)}/>
                  </Collapsible>
                </div>

                {/* Supplementary block-type notes */}
                {rn.blockTypeNotes?.length > 0 && (
                  <Collapsible title="Additional Notes by Rotation">
                    <div className="space-y-1">
                      {rn.blockTypeNotes.map((bn,i)=>(
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <div className="flex gap-1 shrink-0 flex-wrap">
                            {bn.ids.map(id=><span key={id} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">{BLOCK_TYPE_MAP[id]?.label||id}</span>)}
                          </div>
                          <span className="text-gray-600">{bn.note}</span>
                        </div>
                      ))}
                    </div>
                  </Collapsible>
                )}

                {/* Soft prefs */}
                {rn.softPrefs?.length > 0 && (
                  <Collapsible title="Soft Preferences">
                    <ul className="space-y-0.5">
                      {rn.softPrefs.map((p,i)=><li key={i} className="text-xs text-blue-700 flex items-start gap-1"><span>•</span>{p}</li>)}
                    </ul>
                  </Collapsible>
                )}

                {/* Special notes */}
                {rn.specialNotes?.length > 0 && (
                  <Collapsible title="Special Notes">
                    <ul className="space-y-0.5">
                      {rn.specialNotes.map((n,i)=><li key={i} className="text-xs text-gray-600 flex items-start gap-1"><span>•</span>{n}</li>)}
                    </ul>
                  </Collapsible>
                )}

                {/* TBD items */}
                {rn.tbdItems?.length > 0 && (
                  <Collapsible title="⚠ Pending Clarification" titleClassName="text-amber-600">
                    <ul className="space-y-0.5">
                      {rn.tbdItems.map((t,i)=><li key={i} className="text-xs text-amber-700 flex items-start gap-1"><span>•</span>{t}</li>)}
                    </ul>
                  </Collapsible>
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

function ShiftPickerModal({ resident, dateStr, currentShift, block, eligOverrides, appSettings, dayRules, onSelect, onClose, showToast }) {
  const [pending, setPending] = useState(null);
  const sd = block.specialDays || {};
  const eligible = getEligibleShifts(resident, dateStr, sd, eligOverrides, appSettings, dayRules);
  const display = formatDisplayDate(dateStr);
  const name = `${resident.firstName} ${resident.lastName}`;
  const onJeopardy = (resident.jeopardyDates || []).includes(dateStr);

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
    // 2. Jeopardy call warning (policy 'warn'; 'block' already empties the eligible list)
    const policy = (appSettings || {}).jeopardyPolicy ?? 'warn';
    if (policy === 'warn' && onJeopardy) {
      vs.push('Resident is on jeopardy call this date — confirm backup coverage is acceptable');
    }
    // 3. Rest-period check against neighbouring shifts in the schedule
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
        {onJeopardy && <> · <span className="font-medium text-violet-600">Jeopardy call</span></>}
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

function ScheduleGrid({ allResidents, block, updateBlock, eligOverrides, appSettings, dayRules, coverage, showToast }) {
  const [picker, setPicker] = useState(null);
  const [catFilter, setCatFilter] = useState('ALL');
  const [confirmRegen, setConfirmRegen] = useState(false);
  const sched = block.schedule || {};
  const sd = block.specialDays || {};
  const jeoBlock = (appSettings?.jeopardyPolicy ?? 'warn') === 'block';
  const dates = useMemo(()=>getBlockDates(block.startDate,block.endDate),[block.startDate,block.endDate]);

  const violMap = useMemo(()=>{
    const m={};
    for (const issue of validateAll(allResidents,sched,block,eligOverrides,appSettings,dayRules)) {
      if (issue.dateStr) { const k=`${issue.residentId}_${issue.dateStr}`; (m[k]=m[k]||[]).push(issue); }
    }
    return m;
  },[allResidents,sched,block,eligOverrides,appSettings,dayRules]);

  const filtered = catFilter==='ALL'?allResidents:allResidents.filter(r=>r.category===catFilter);
  const grouped = useMemo(()=>{
    const g=[];
    for (const cat of CATEGORIES) { const m=filtered.filter(r=>r.category===cat.id); if(m.length) g.push({cat,members:m}); }
    return g;
  },[filtered]);

  function assign(resId,ds,sid) {
    updateBlock(b=>({...b,schedule:{...b.schedule,[resId]:{...(b.schedule[resId]||{}),[ds]:sid}}}));
  }

  const totalAssigned = useMemo(()=>Object.values(sched).reduce((s,d)=>s+Object.values(d||{}).filter(Boolean).length,0),[sched]);

  function runGenerate(clearFirst) {
    setConfirmRegen(false);
    const res = generateSchedule({ allResidents, block, coverage, eligOverrides, appSettings, dayRules, clearFirst });
    if (!res) { showToast('Set block dates first', 'red'); return; }
    if (res.report.totalSlots === 0) { showToast('Coverage is 0 for every shift — set coverage on the Scheduling Rules tab', 'red'); return; }
    updateBlock(b => ({ ...b, schedule: res.schedule, generationReport: res.report }));
    const u = res.report.unfilled.length;
    showToast(u === 0
      ? `Schedule generated — all ${res.report.totalSlots} coverage slots filled`
      : `Filled ${res.report.filled} shifts — ${u} slots unfilled, see the Violations tab for details`,
      u === 0 ? 'green' : 'amber');
  }

  if (!dates.length) return (
    <div className="text-center py-16 text-gray-400">
      <Calendar size={40} className="mx-auto mb-3 opacity-40"/>
      <p className="text-sm">Set block dates in Settings to show the grid.</p>
    </div>
  );

  return (
    <div>
      {/* Generate actions */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <span className="text-xs text-gray-500">
          <strong className="text-gray-700">{totalAssigned}</strong> shifts assigned
          {block.generationReport && <> · last generated {new Date(block.generationReport.generatedAt).toLocaleString()}</>}
        </span>
        <span className="flex items-center gap-2">
          <button onClick={()=>runGenerate(false)}
            title="Fills empty coverage slots using the scheduling rules. Existing assignments (manual or generated) are never overwritten."
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
            <Wand2 size={13}/> Generate Schedule
          </button>
          <button onClick={()=>setConfirmRegen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-600 rounded-lg transition-colors">
            <RefreshCw size={12}/> Clear &amp; Regenerate
          </button>
        </span>
      </div>

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

      {/* Legend */}
      <div className="flex items-center gap-2.5 mb-3 flex-wrap text-xs text-gray-400">
        <span className="px-1.5 py-0.5 rounded font-bold bg-yellow-100 text-yellow-700">GR</span>
        <span className="px-1.5 py-0.5 rounded font-bold bg-orange-100 text-orange-500">OFF</span>
        <span className="px-1.5 py-0.5 rounded font-bold bg-violet-100 text-violet-600">J</span>
        <span>= grand rounds · approved off · jeopardy call</span>
        <span className="px-1.5 py-0.5 rounded border border-red-300 text-red-500 font-medium">red ring</span>
        <span>= rule violation</span>
      </div>

      {/* Empty-schedule CTA */}
      {totalAssigned === 0 && (
        <div className="text-center py-8 mb-3 bg-indigo-50/50 rounded-xl border-2 border-dashed border-indigo-200">
          <Wand2 size={28} className="mx-auto mb-2 text-indigo-400"/>
          <p className="text-sm font-medium text-gray-700 mb-1">No shifts assigned yet</p>
          <p className="text-xs text-gray-500 mb-3">Auto-fill the whole block using the scheduling rules, coverage needs, and everyone's days off.</p>
          <button onClick={()=>runGenerate(false)}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
            <Wand2 size={14}/> Generate Schedule
          </button>
          <p className="text-xs text-gray-400 mt-2.5">…or click any cell below to assign manually. Coverage per shift is set on the Scheduling Rules tab.</p>
        </div>
      )}

      {confirmRegen && (
        <Modal title="Clear & Regenerate?" onClose={()=>setConfirmRegen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This clears <strong>all current assignments — including ones you entered manually</strong> — and
              regenerates the whole schedule from scratch. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setConfirmRegen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={()=>runGenerate(true)} className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg">Clear &amp; Regenerate</button>
            </div>
          </div>
        </Modal>
      )}

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
                  const tgt=getShiftTarget(res, appSettings);
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
                        const isJeopardy=(res.jeopardyDates||[]).includes(ds);
                        const isJeoBlocked=isJeopardy&&jeoBlock;
                        const elig=getEligibleShifts(res,ds,sd,eligOverrides,appSettings,dayRules);
                        const d=parseDate(ds); const dow=d.getDay();
                        const isWed=dow===3; const isWknd=dow===0||dow===6;
                        const isGR=isWed&&res.category==='EM_HOME'&&elig.length===0;
                        const shift=sid?SHIFT_MAP[sid]:null;
                        let bg=isApprovedOff?'bg-orange-50':isJeoBlocked?'bg-violet-50':isGR?'bg-yellow-50':isWknd?'bg-slate-50':elig.length===0?'bg-gray-50':'bg-white';
                        if(hasV) bg='bg-red-50';
                        const clickable=(elig.length>0||sid)&&!isApprovedOff;
                        return (
                          <div key={ds} style={{width:CELL_W,minWidth:CELL_W,height:36}}
                            onClick={()=>clickable&&setPicker({resident:res,dateStr:ds})}
                            title={isApprovedOff?'Approved day off':isJeoBlocked?'Jeopardy call (blocked by Settings)':isJeopardy?'Jeopardy call':isGR?'GR Wednesday':elig.length===0?'No eligible shifts':''}
                            className={`relative border-r border-b border-gray-100 ${bg} ${hasV?'ring-1 ring-inset ring-red-400':''} ${clickable?'cursor-pointer hover:brightness-95':'cursor-default'} transition-all`}>
                            {isApprovedOff&&!sid && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-orange-500">OFF</span></div>}
                            {isJeoBlocked&&!sid&&!isApprovedOff && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-violet-500">J</span></div>}
                            {isGR&&!sid&&!isApprovedOff&&!isJeoBlocked && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-yellow-600">GR</span></div>}
                            {shift && <div className={`absolute inset-1 flex items-center justify-center rounded text-xs font-bold ${shift.chip}`}>{sid}</div>}
                            {isJeopardy&&!isJeoBlocked && <span className="absolute top-0 right-0 text-[9px] leading-none font-bold text-violet-600 bg-violet-100 rounded-bl px-0.5 py-px z-10" title="Jeopardy call">J</span>}
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
          block={block} eligOverrides={eligOverrides} appSettings={appSettings} dayRules={dayRules}
          onSelect={sid=>assign(picker.resident.id,picker.dateStr,sid)}
          onClose={()=>setPicker(null)} showToast={showToast}/>
      )}
    </div>
  );
}

// ─── VALIDATION TAB ───────────────────────────────────────────────────────────

function GenerationReportCard({ report, appSettings }) {
  const summary = useMemo(()=>summarizeGenerationReport(report, appSettings),[report,appSettings]);
  const structuralCount = summary.filter(s=>s.structural).length;
  const realGapGroups = summary.filter(s=>!s.structural);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 bg-indigo-50/60">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5"><Wand2 size={14}/> Generation Report</span>
          <span className="text-xs text-indigo-400">{new Date(report.generatedAt).toLocaleString()}</span>
        </div>
        <p className="text-xs text-indigo-700 mt-1">
          Filled {report.filled} of {report.totalSlots} coverage slots ({report.keptManual} kept from manual entries).
          Reflects the schedule at generation time — manual edits since aren't included.
        </p>
      </div>
      <div className="p-4 space-y-3">
        {report.unfilled.length === 0 && report.underTarget.length === 0 && (
          <p className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle size={14}/> Every coverage slot was filled.</p>
        )}

        {realGapGroups.map(g => (
          <div key={g.shiftId} className="border border-amber-200 bg-amber-50/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xs px-2 py-0.5 rounded font-bold ${SHIFT_MAP[g.shiftId]?.chip}`}>{g.shiftId}</span>
              <span className="text-xs text-amber-700 font-medium">{g.slots.length} unfilled slot{g.slots.length!==1?'s':''}</span>
            </div>
            <p className="text-xs text-gray-500 mb-1.5">{g.slots.map(s=>formatDisplayDate(s.dateStr)).join(', ')}</p>
            {g.recommendations.map((r,i)=><p key={i} className="text-xs text-gray-700">→ {r}</p>)}
          </div>
        ))}

        {structuralCount > 0 && (
          <div className="border border-gray-200 bg-gray-50 rounded-lg p-3">
            <span className="text-xs font-medium text-gray-500 px-1.5 py-0.5 rounded bg-gray-200 mr-1.5">Expected</span>
            <span className="text-xs text-gray-500">{structuralCount} shift{structuralCount!==1?'s have':' has'} gaps that match a day-of-week rule (e.g. Trauma window, GR Wednesday) — not a coverage problem.</span>
            {summary.filter(s=>s.structural).map(g=>(
              <p key={g.shiftId} className="text-xs text-gray-600 mt-1">→ {g.recommendations[0]}</p>
            ))}
          </div>
        )}

        {report.underTarget.length > 0 && (
          <div className="border border-gray-200 rounded-lg p-3">
            <span className="text-xs font-semibold text-gray-600">Residents left under target</span>
            <ul className="mt-1 space-y-0.5">
              {report.underTarget.map(u=>(
                <li key={u.residentId} className="text-xs text-gray-600">{u.name} — {u.assigned}/{u.target}</li>
              ))}
            </ul>
          </div>
        )}

        {report.jeopardyPlacements.length > 0 && (
          <div className="border border-violet-200 bg-violet-50/60 rounded-lg p-3">
            <span className="text-xs font-semibold text-violet-700">Placed on jeopardy call dates (warn policy)</span>
            <ul className="mt-1 space-y-0.5">
              {report.jeopardyPlacements.map((j,i)=>(
                <li key={i} className="text-xs text-violet-700">{j.name} — {formatDisplayDate(j.dateStr)} · {j.shiftId}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ValidationTab({ allResidents, block, eligOverrides, appSettings, dayRules }) {
  const issues = useMemo(()=>validateAll(allResidents,block.schedule||{},block,eligOverrides,appSettings,dayRules),[allResidents,block,eligOverrides,appSettings,dayRules]);
  const errors=issues.filter(i=>i.level==='error'), warns=issues.filter(i=>i.level==='warn');
  const byRes = useMemo(()=>{
    const m={};
    for(const i of issues){ if(!m[i.residentId]) m[i.residentId]={name:i.name,issues:[]}; m[i.residentId].issues.push(i); }
    return m;
  },[issues]);

  const report = block.generationReport;

  if(!issues.length) return (
    <div className="space-y-4">
      {report && <GenerationReportCard report={report} appSettings={appSettings}/>}
      <div className="text-center py-16">
        <CheckCircle size={48} className="mx-auto mb-3 text-emerald-500"/>
        <p className="text-gray-700 font-semibold">No rule violations</p>
        <p className="text-sm text-gray-400 mt-1">All scheduled shifts comply with current rules.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {report && <GenerationReportCard report={report} appSettings={appSettings}/>}
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

const LS_BACKUP_KEYS = ['res_em_roster','res_current_block','res_blocks_history','res_eligibility_overrides','res_ay_data','res_app_settings','res_day_rules','res_coverage'];

function SettingsTab({ block, updateBlock, onBlockReset, appSettings, setAppSettings, showToast }) {
  const [resetConfirm, setResetConfirm] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const fileRef = useRef(null);
  const upd  = (f,v) => updateBlock(b=>({...b,[f]:v}));
  const updS = (f,v) => setAppSettings(p=>({...p,[f]:v}));

  function updTarget(key, raw) {
    setAppSettings(p => {
      const o = { ...(p.targetOverrides || {}) };
      const n = raw === '' ? null : Number(raw);
      if (n === null || Number.isNaN(n) || n < 0) delete o[key]; else o[key] = n;
      return { ...p, targetOverrides: o };
    });
  }

  function exportData() {
    const data = {};
    for (const k of LS_BACKUP_KEYS) {
      try { data[k] = JSON.parse(localStorage.getItem(k)); } catch { data[k] = null; }
    }
    const payload = { app: 'resident-scheduler', exportedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `resident-scheduler-backup-${toDateStr(new Date())}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('Backup downloaded', 'green');
  }

  function importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const d = parsed.data || parsed;
        let n = 0;
        for (const k of LS_BACKUP_KEYS) {
          if (d[k] !== undefined && d[k] !== null) { localStorage.setItem(k, JSON.stringify(d[k])); n++; }
        }
        if (n === 0) { showToast('No recognizable data found in that file', 'red'); return; }
        window.location.reload();
      } catch {
        showToast('Could not read backup file — is it a valid export?', 'red');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function clearAll() {
    for (const k of LS_BACKUP_KEYS) localStorage.removeItem(k);
    window.location.reload();
  }

  const jeoPolicy = appSettings.jeopardyPolicy ?? 'warn';
  const targetRows = [...MATRIX_ROWS, { key: 'CHIEF', label: 'Chief Resident', sub: 'PGY-3', catId: 'EM_HOME' }];
  const defaultTargetFor = k => k === 'CHIEF' ? 16 : (SHIFT_TARGETS[k] ?? null);

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Block name & dates */}
      <CollapsibleCard title="Block Name & Dates" subtitle="Also editable on the Home tab.">
        <div className="space-y-3">
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Block Name</label>
            <input className="input-field" value={block.name||''} onChange={e=>upd('name',e.target.value)} placeholder="e.g. Block 3 — Jun/Jul 2026"/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" className="input-field" value={block.startDate||''} onChange={e=>applyStartDate(updateBlock,appSettings,e.target.value)}/></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" className="input-field" value={block.endDate||''} onChange={e=>upd('endDate',e.target.value)}/></div>
          </div>
          {block.startDate&&block.endDate && <p className="text-xs text-gray-400">{getBlockDates(block.startDate,block.endDate).length} days in block</p>}
        </div>
      </CollapsibleCard>

      {/* Rule enforcement */}
      <CollapsibleCard title="Rule Enforcement" subtitle="How strictly the app enforces scheduling rules.">
        <div className="space-y-5">

          {/* Jeopardy policy */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Jeopardy Call Handling</label>
            <p className="text-xs text-gray-400 mb-2">What happens when a resident has a shift on a jeopardy call date</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { v: 'block', l: 'Block',  d: 'Day is unschedulable (like a day off)' },
                { v: 'warn',  l: 'Warn',   d: 'Allowed, but flagged as a warning' },
                { v: 'off',   l: 'Ignore', d: 'No restriction or warning' },
              ].map(({ v, l, d }) => (
                <button key={v} onClick={()=>updS('jeopardyPolicy', v)}
                  className={`flex flex-col items-start px-3 py-2 rounded-lg border-2 text-left transition-all ${jeoPolicy===v?'border-violet-500 bg-violet-50':'border-gray-200 hover:border-violet-300 bg-white'}`}>
                  <span className={`text-xs font-bold ${jeoPolicy===v?'text-violet-700':'text-gray-700'}`}>{l}</span>
                  <span className="text-xs text-gray-400 mt-0.5">{d}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Rest rule */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={appSettings.enforceRest !== false}
              onChange={e=>updS('enforceRest', e.target.checked)} className="rounded mt-0.5"/>
            <span>
              <span className="block text-xs font-semibold text-gray-700">Enforce rest-period rule</span>
              <span className="block text-xs text-gray-400">After a shift of H hours, the resident needs ≥ H hours off before the next shift (e.g. 12h Trauma → 12h rest)</span>
            </span>
          </label>

          {/* Trauma cap */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700">PGY-2 trauma cap per block</label>
              <p className="text-xs text-gray-400">Warn when an EM Home PGY-2 exceeds this many trauma shifts (target 2–3). Set 0 to disable.</p>
            </div>
            <input type="number" min="0" max="31" value={appSettings.pgy2TraumaCap ?? 3}
              onChange={e=>updS('pgy2TraumaCap', Math.max(0, Number(e.target.value) || 0))}
              className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"/>
          </div>
        </div>
      </CollapsibleCard>

      {/* Shift targets */}
      <CollapsibleCard title="Shift Targets" subtitle="Shifts per block by residency & year. Leave blank to use the default; used for progress bars and over-target warnings.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {targetRows.map(row => {
            const cat = CAT_MAP[row.catId];
            const def = defaultTargetFor(row.key);
            const ov  = (appSettings.targetOverrides || {})[row.key];
            return (
              <div key={row.key} className="flex items-center justify-between gap-2 py-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${cat?.badge}`}>{row.sub}</span>
                  <span className="text-xs text-gray-600 truncate">{row.label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <input type="number" min="0" max="31" value={ov ?? ''} placeholder={def ?? '—'}
                    onChange={e=>updTarget(row.key, e.target.value)}
                    className={`w-14 text-xs border rounded-lg px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-indigo-400 ${ov != null ? 'border-indigo-300 bg-indigo-50 font-semibold' : 'border-gray-200'}`}/>
                  {ov != null && (
                    <button onClick={()=>updTarget(row.key, '')} title="Reset to default" className="text-gray-300 hover:text-indigo-500"><RefreshCw size={10}/></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-300 mt-2 italic">Peds PGY-1/3 have no target — their schedule comes from Amion.</p>
      </CollapsibleCard>

      {/* Defaults */}
      <CollapsibleCard title="Defaults">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700">Default block length (days)</label>
              <p className="text-xs text-gray-400">Auto-fills the end date when you set a start date</p>
            </div>
            <input type="number" min="7" max="60" value={appSettings.defaultBlockLength ?? 28}
              onChange={e=>updS('defaultBlockLength', Math.max(7, Number(e.target.value) || 28))}
              className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"/>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700">Saved blocks to keep</label>
              <p className="text-xs text-gray-400">Older saved blocks are dropped past this limit</p>
            </div>
            <input type="number" min="1" max="100" value={appSettings.maxSavedBlocks ?? 24}
              onChange={e=>updS('maxSavedBlocks', Math.max(1, Number(e.target.value) || 24))}
              className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"/>
          </div>
        </div>
      </CollapsibleCard>

      {/* Data management */}
      <CollapsibleCard title="Data Management" subtitle="All data lives in this browser's local storage — it does not sync between devices. Export a backup regularly.">
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportData}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
            <Download size={14}/> Export Backup
          </button>
          <button onClick={()=>fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors">
            <Upload size={14}/> Import Backup
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={importData} className="hidden"/>
        </div>
        <p className="text-xs text-gray-400 mt-2">Importing replaces ALL current data (rosters, blocks, matrix, settings) with the backup's contents, then reloads the app.</p>
      </CollapsibleCard>

      {/* Pointers */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-700 flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0"/>
        <span>Conference &amp; ITE dates: <strong>Home tab</strong> → AY folder. Special days (Code Blue, advocacy, procedure, US days): <strong>Dashboard</strong> tab. Per-rotation shift eligibility: <strong>Shift Matrix</strong> tab.</span>
      </div>

      {/* Block reset */}
      <CollapsibleCard title="Block Reset" subtitle="Clears off-service roster and schedule. EM Home roster is preserved.">
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
      </CollapsibleCard>

      {/* Danger zone */}
      <CollapsibleCard title="Clear All Data" subtitle="Deletes everything: rosters, all saved blocks, matrix overrides, AY data, and settings.">
        {clearConfirm ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-red-600 font-medium">This erases ALL app data. Export a backup first!</span>
            <button onClick={clearAll} className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Erase Everything</button>
            <button onClick={()=>setClearConfirm(false)} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">Cancel</button>
          </div>
        ) : (
          <button onClick={()=>setClearConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 hover:bg-red-50 rounded-lg font-medium">
            <Trash2 size={14}/> Clear All Data
          </button>
        )}
      </CollapsibleCard>
    </div>
  );
}

// ─── USER GUIDE TAB ───────────────────────────────────────────────────────────

function GuideSection({ id, title, open, onToggle, goTab, onNavigate, children }) {
  return (
    <div id={`guide-${id}`} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden scroll-mt-4">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
        <div className="flex items-center gap-3">
          {goTab && open && (
            <span onClick={e=>{e.stopPropagation(); onNavigate?.(goTab.id);}}
              className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer whitespace-nowrap">
              Open {goTab.label} →
            </span>
          )}
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${open?'rotate-180':''}`}/>
        </div>
      </button>
      {open && <div className="px-5 pb-4 text-sm text-gray-600 space-y-2 [&_li]:ml-4 [&_strong]:text-gray-800">{children}</div>}
    </div>
  );
}

// Section registry: id, title, optional tab link, keywords for search.
const GUIDE_SECTIONS = [
  { id: 'quickstart', title: 'Monthly Workflow — Quick Start', keywords: 'workflow steps new block start month save export' },
  { id: 'home',       title: 'Home — Blocks & Academic Years', goTab: 'home', keywords: 'save load block academic year AY folder conference ITE dates' },
  { id: 'dashboard',  title: 'Dashboard — Block at a Glance', goTab: 'dashboard', keywords: 'progress conferences code blue advocacy procedure US days first friday anesthesia social checklist' },
  { id: 'residents',  title: 'Residents — Profiles, Days Off & Jeopardy', goTab: 'em', keywords: 'roster intern graduate rotation off-service visiting BAMC days off jeopardy backup call CCU pencil edit import upload csv paste bulk' },
  { id: 'matrix',     title: 'Shift Matrix — Who Can Work What', goTab: 'matrix', keywords: 'eligibility matrix toggle rotation override EMS tox peds trauma reset' },
  { id: 'generate',   title: 'Generate Schedule — Auto-Fill', goTab: 'rules', keywords: 'generate auto generate coverage fill regenerate clear wand button' },
  { id: 'grid',       title: 'Schedule Grid — Reading the Cells', goTab: 'schedule', keywords: 'cells GR grand rounds off jeopardy red ring gray picker rest period filter chips targets generate' },
  { id: 'legend',     title: 'Cell & Shift Color Legend', goTab: 'schedule', keywords: 'colors legend chips POD PED FLEX MT trauma day eve night swatch' },
  { id: 'rules',      title: 'Violations & Generation Report', goTab: 'validation', keywords: 'errors warnings violations rules day-of-week clinic enforcement badge count generation report unfilled recommendations' },
  { id: 'export',     title: 'Exporting to QGenda', keywords: 'export CSV QGenda download grid import migrate' },
  { id: 'settings',   title: 'Settings & Data Safety', goTab: 'settings', keywords: 'backup restore import localStorage sync computers jeopardy policy rest rule trauma cap shift targets data' },
  { id: 'faq',        title: 'FAQ & Troubleshooting', keywords: 'faq help troubleshooting gray cell missing data disappeared export button assign anyway sync' },
];

function UserGuideTab({ onNavigate }) {
  const [query, setQuery] = useState('');
  const [openMap, setOpenMap] = useState(() => Object.fromEntries(GUIDE_SECTIONS.map(s => [s.id, true])));
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return new Set(GUIDE_SECTIONS.map(s => s.id));
    return new Set(GUIDE_SECTIONS.filter(s => (s.title + ' ' + s.keywords).toLowerCase().includes(q)).map(s => s.id));
  }, [q]);
  const setAll = v => setOpenMap(Object.fromEntries(GUIDE_SECTIONS.map(s => [s.id, v])));
  const jumpTo = id => {
    setOpenMap(m => ({ ...m, [id]: true }));
    setTimeout(() => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const sec = id => {
    const s = GUIDE_SECTIONS.find(x => x.id === id);
    return {
      id, title: s.title,
      goTab: s.goTab ? TABS.find(t => t.id === s.goTab) : null,
      onNavigate,
      open: q ? visible.has(id) : openMap[id],
      onToggle: () => setOpenMap(m => ({ ...m, [id]: !m[id] })),
    };
  };
  const show = id => visible.has(id);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold text-gray-800">User Guide</h2>
        <p className="text-xs text-gray-500 mt-0.5">How to build a monthly resident schedule with this app</p>
      </div>

      {/* Search + expand/collapse */}
      <div className="flex items-center gap-2">
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search the guide… (e.g. jeopardy, export, gray cell)"
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"/>
        {query && <button onClick={()=>setQuery('')} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>}
        <button onClick={()=>setAll(true)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 whitespace-nowrap">Expand all</button>
        <button onClick={()=>setAll(false)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 whitespace-nowrap">Collapse all</button>
      </div>

      {/* Table of contents */}
      {!q && (
        <div className="flex flex-wrap gap-1.5">
          {GUIDE_SECTIONS.map(s => (
            <button key={s.id} onClick={()=>jumpTo(s.id)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors">
              {s.title.split(' — ')[0]}
            </button>
          ))}
        </div>
      )}
      {q && visible.size === 0 && (
        <div className="text-sm text-gray-500 bg-white rounded-xl border border-gray-200 px-5 py-6 text-center">
          No sections match "{query}". Try a different term, e.g. "jeopardy", "export", or "backup".
        </div>
      )}

      {show('quickstart') && <GuideSection {...sec('quickstart')}>
        <ol className="list-decimal space-y-1.5 text-sm">
          <li><strong>Home tab</strong> — click <strong>New Block</strong>, then set the block name and start date (end date and academic year auto-fill from it — both stay editable).</li>
          <li><strong>EM Residents / Off-Service tabs</strong> — set each EM Home resident's rotation, and add this month's visiting residents (or use <strong>Import Roster</strong> to paste/upload a roster instead of adding one at a time). Enter approved dates off and jeopardy call dates.</li>
          <li><strong>Dashboard tab</strong> — enter this block's special days (Code Blue, advocacy, procedure, US days) before scheduling — they affect eligibility.</li>
          <li><strong>Scheduling Rules tab</strong> — set daily shift coverage (how many residents each shift needs), then click <strong>Generate Schedule</strong> on the Schedule tab to auto-fill the whole block.</li>
          <li><strong>Schedule tab</strong> — review the generated schedule, or click any cell to assign/adjust a shift manually. The picker only offers shifts that resident can legally work that day; anything else needs an explicit "Assign Anyway".</li>
          <li><strong>Violations tab</strong> — review the Generation Report and any remaining errors/warnings before finalizing.</li>
          <li><strong>Home tab</strong> — click <strong>Save Block</strong> to archive it, then use the <strong>QGenda CSV</strong> button (header) to migrate the schedule into QGenda.</li>
        </ol>
      </GuideSection>}

      {show('home') && <GuideSection {...sec('home')}>
        <p>The <strong>Current Block</strong> card is your active workspace: name and dates editable inline (collapse it with the header once set up). Special days live on the <strong>Dashboard</strong> tab.</p>
        <ul className="list-disc space-y-1">
          <li><strong>Save Block</strong> snapshots everything (roster assignments, schedule, special days) into the AY folder below. Re-saving the same block updates its snapshot.</li>
          <li><strong>Load</strong> restores a saved block — you'll be prompted to save current work first.</li>
          <li>Each <strong>AY folder</strong> holds that year's conference &amp; ITE dates (click "Conference &amp; ITE Dates" inside the folder). These apply to every block in that year and surface on the Dashboard when they overlap the block.</li>
        </ul>
      </GuideSection>}

      {show('dashboard') && <GuideSection {...sec('dashboard')}>
        <p>Shows block progress, any conferences that fall inside the current block, first Fridays (Anesthesia social), and editable special-day lists. Use it as the pre-scheduling checklist: confirm conferences, Code Blue days, advocacy days, procedure days, and US days are all entered before assigning shifts.</p>
      </GuideSection>}

      {show('residents') && <GuideSection {...sec('residents')}>
        <ul className="list-disc space-y-1">
          <li><strong>EM Home roster persists</strong> across blocks — add interns once a year, remove graduates. Their rotation is set per block.</li>
          <li><strong>Off-service residents are per-block</strong> — cleared on New Block/Block Reset, re-entered each month.</li>
          <li><strong>Import Roster</strong> — paste rows from a spreadsheet or upload a CSV (Name, Category, PGY — any Rotation/date columns are ignored) instead of adding residents one at a time. Shows a preview before committing; already-listed names are skipped automatically.</li>
          <li><strong>Approved Dates Off</strong> (orange) — hard-blocked in the grid; scheduling over one is an error. Off-service residents can add/remove these directly on their tile, no need to open Edit.</li>
          <li><strong>Jeopardy Call Dates</strong> (violet "J") — the resident is on backup call. How this affects scheduling is configurable in Settings: Block (unschedulable), Warn (default — allowed but flagged), or Ignore.</li>
          <li>Edit any profile with the pencil icon; the IM "CCU nights" toggle blocks Tue/Wed automatically.</li>
        </ul>
      </GuideSection>}

      {show('matrix') && <GuideSection {...sec('matrix')}>
        <p>The matrix defines which shift types each <strong>residency + year</strong> can work. Checks are color-coded by area (POD, PED, FLEX, MT, Trauma).</p>
        <ul className="list-disc space-y-1">
          <li>Click any cell to toggle. Modified rows show <span className="text-indigo-500">✎</span> and a per-row reset.</li>
          <li><strong>Per-rotation rules:</strong> expand an EM Home row (▸) to see its rotations (EM, EMS, Tox, Peds/Trauma…). Dimmed checks inherit from the parent row; clicking creates a <span className="text-violet-500">rotation override</span> so e.g. an EMS month can have a different shift list than a standard EM month.</li>
          <li>Day-of-week rules (GR Wednesday, clinic days, EMS Mon/Tue, Tox Thu/Fri, trauma Tue/Thu/Sat/Sun) are enforced on top of the matrix and aren't edited here — see the Scheduling Rules tab, which now controls those directly.</li>
        </ul>
      </GuideSection>}

      {show('generate') && <GuideSection {...sec('generate')}>
        <p>Set <strong>Daily Shift Coverage</strong> on the Scheduling Rules tab first — how many residents each shift (POD Day, Trauma Night, etc.) needs per day. Then, on the Schedule tab, click <strong>Generate Schedule</strong> to auto-fill every open slot for the whole block.</p>
        <ul className="list-disc space-y-1">
          <li>The generator respects everyone's eligibility, days off, jeopardy policy, rest-period rule, and the PGY-2 trauma cap — it never assigns a shift a resident couldn't legally work.</li>
          <li><strong>Generate never overwrites a cell you've already filled in</strong> — manual or picker assignments are kept, and it only fills what's still empty. Run it again anytime after making manual edits.</li>
          <li><strong>Clear &amp; Regenerate</strong> wipes every assignment (including manual ones) and rebuilds from scratch — confirm before using it.</li>
          <li>After generating, check the <strong>Violations tab</strong> for a Generation Report: any coverage slot it couldn't fill, why, and what to change.</li>
        </ul>
      </GuideSection>}

      {show('grid') && <GuideSection {...sec('grid')}>
        <ul className="list-disc space-y-1">
          <li><strong className="text-yellow-600">GR</strong> (yellow) — Grand Rounds Wednesday; EM Home residents can't be in the ED.</li>
          <li><strong className="text-orange-500">OFF</strong> (orange) — approved day off.</li>
          <li><strong className="text-violet-600">J</strong> (violet) — jeopardy call; corner badge if warn-mode, full cell if block-mode.</li>
          <li><strong className="text-red-500">Red ring</strong> — rule violation on that assignment.</li>
          <li>Gray cells have no eligible shifts that day (clinic day, weekend call, etc.).</li>
          <li>The shift picker validates <em>before</em> you commit: eligibility, jeopardy, and the rest-period rule (a shift's length = the hours off required after it; Trauma 12h → 12h rest).</li>
          <li>Filter by residency with the chips above the grid. Shift counts vs target show next to each name.</li>
        </ul>
      </GuideSection>}

      {show('legend') && <GuideSection {...sec('legend')}>
        <p className="text-xs text-gray-500">Shift chips as they appear in the Schedule grid, grouped by area:</p>
        <div className="space-y-2">
          {SHIFT_AREAS.map(area => (
            <div key={area} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-500 w-16">{area}</span>
              {SHIFTS.filter(s=>s.area===area).map(s => (
                <span key={s.id} className="flex items-center gap-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${s.chip}`}>{s.id}</span>
                  <span className="text-[11px] text-gray-500">{s.hours}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 pt-1">Special cell markers:</p>
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-600">
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-yellow-100 text-yellow-700">GR</span> Grand Rounds Wed</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-orange-100 text-orange-600">OFF</span> approved day off</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-violet-100 text-violet-700">J</span> jeopardy call</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-white text-gray-700 ring-2 ring-red-400">POD-D</span> rule violation</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-gray-100 text-gray-400">—</span> no eligible shifts</span>
        </div>
      </GuideSection>}

      {show('rules') && <GuideSection {...sec('rules')}>
        <p>If you ran <strong>Generate Schedule</strong>, a <strong>Generation Report</strong> appears at the top of the Violations tab: how many coverage slots were filled, which ones weren't and why (no eligible resident, everyone at target, rest-rule conflicts, trauma cap…), with a plain-language recommendation for each — raise a target, lower coverage, check the Shift Matrix, and so on. Gaps that just match a day-of-week rule (Trauma's Tue/Thu/Sat/Sun window, GR Wednesday) are marked "Expected" rather than flagged as problems.</p>
        <p>Below that, the <strong>Violations list</strong> shows every error (must fix: ineligible shifts, days-off conflicts, rest violations, overlaps) and warning (review: over target, trauma cap, jeopardy) grouped by resident. The sidebar badge shows the live count. Exporting a CSV with unresolved errors will prompt for confirmation first.</p>
        <p>The <strong>Scheduling Rules tab</strong> is where every residency/PGY type's day-of-week and rotation rules live — full-day blocks, day/night-only restrictions, rotation-specific day windows (EMS Mon/Tue, Tox Thu/Fri, trauma Tue/Thu/Sat/Sun…), how Code Blue/advocacy/procedure/anesthesia dates affect eligibility, and the <strong>Daily Shift Coverage</strong> grid used by Generate Schedule. Edit them directly here — no code changes needed. Each type shows a ✎ mark and reset button when modified from the built-in defaults. Shift targets and eligible shifts are shown live; the ⚠ notes below each type are outstanding clarifications, not enforced rules.</p>
      </GuideSection>}

      {show('export') && <GuideSection {...sec('export')}>
        <p>Two CSV buttons live in the header once a block has a start date:</p>
        <ul className="list-disc space-y-1">
          <li><strong>Grid CSV</strong> — the same resident × date matrix shown on the Schedule tab, raw shift codes only. Best for your own visual cross-check, not for importing anywhere.</li>
          <li><strong>QGenda CSV</strong> — one row per assignment (resident, date, shift, real start/end time, hours) instead of one column per date. This removes the manual date-column transposition step — check it against QGenda's import format before relying on it fully.</li>
        </ul>
        <p>If the schedule has unresolved errors (ineligible shifts, days-off conflicts, rest violations), either export will ask you to confirm before downloading.</p>
      </GuideSection>}

      {show('settings') && <GuideSection {...sec('settings')}>
        <ul className="list-disc space-y-1">
          <li><strong>Rule Enforcement</strong> — jeopardy policy, rest-period rule on/off, PGY-2 trauma cap.</li>
          <li><strong>Shift Targets</strong> — override shifts-per-block for any residency/year (incl. Chief).</li>
          <li><strong>Data Management</strong> — everything is stored in this browser only (localStorage). It does <em>not</em> sync between computers. <strong>Export a backup</strong> regularly; Import restores it on any machine.</li>
        </ul>
      </GuideSection>}

      {show('faq') && <GuideSection {...sec('faq')}>
        <ul className="list-disc space-y-2">
          <li><strong>Why is a cell gray?</strong> That resident has no eligible shifts that day — a clinic day, day-of-week restriction (e.g. EMS Mon/Tue), GR Wednesday, or a non-schedulable rotation. Check the Shift Matrix and Scheduling Rules tabs to see why.</li>
          <li><strong>Why can't I assign a shift I know is fine?</strong> The picker only offers legal shifts. Use <strong>"Assign Anyway"</strong> in the picker to override — it will be flagged in Violations so you can track it.</li>
          <li><strong>My schedule disappeared on another computer.</strong> Data lives in the browser's localStorage and does <em>not</em> sync between machines. Use <strong>Settings → Export backup</strong> on one computer and <strong>Import</strong> on the other.</li>
          <li><strong>The CSV export buttons are missing.</strong> They appear in the header only once the current block has a start date set (Home tab).</li>
          <li><strong>A resident shows the wrong shifts in the picker.</strong> Check their rotation for this block (EM Residents tab) and any rotation override in the Shift Matrix — dimmed checks inherit, solid checks are overrides.</li>
          <li><strong>I saved a block by mistake.</strong> Re-saving the same block just updates its snapshot; you can also Load any earlier saved block from its AY folder on the Home tab.</li>
        </ul>
      </GuideSection>}
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
  { id: 'guide',      label: 'User Guide',    icon: HelpCircle },
];

export default function ResidentScheduler() {
  const [tab, setTab] = useState('home');
  const [toast, setToast] = useState(null);
  const [switchPending, setSwitchPending] = useState(null);
  const [exportConfirm, setExportConfirm] = useState(null); // 'grid' | 'qgenda' | null — pending export awaiting error confirmation

  const [emRoster, setEmRoster]           = useLocalStorage('res_em_roster', []);
  const [eligOverrides, setEligOverrides] = useLocalStorage('res_eligibility_overrides', {});
  const [blocksHistory, setBlocksHistory] = useLocalStorage('res_blocks_history', []);
  const [block, setBlock]                 = useLocalStorage('res_current_block', makeDefaultBlock());
  // AY-level data: conference & ITE dates keyed by academic year string
  const [ayData, setAyData]               = useLocalStorage('res_ay_data', {});
  // App-level settings: rule enforcement, targets, defaults
  const [appSettings, setAppSettings]     = useLocalStorage('res_app_settings', DEFAULT_APP_SETTINGS);
  // Chief-editable day-of-week / block-type scheduling rules (see DEFAULT_DAY_RULES)
  const [dayRules, setDayRules]           = useLocalStorage('res_day_rules', {});
  const [coverage, setCoverage]           = useLocalStorage('res_coverage', {});

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

  const violCount = useMemo(()=>validateAll(allResidents,block.schedule||{},block,eligOverrides,appSettings,dayRules).length,[allResidents,block,eligOverrides,appSettings,dayRules]);

  function updateBlock(fn) { setBlock(p=>typeof fn==='function'?fn(p):{...p,...fn}); }

  function saveBlock() {
    const shiftCount=Object.values(block.schedule||{}).reduce((s,d)=>s+Object.values(d).filter(Boolean).length,0);
    const snap={ id:block.id, name:block.name||'Unnamed Block', academicYear:block.academicYear||getAcademicYear(),
      startDate:block.startDate, endDate:block.endDate, savedAt:new Date().toISOString(),
      residentCount:emRoster.length+(block.offServiceResidents||[]).length, shiftCount,
      data:{ emBlockAssignments:block.emBlockAssignments||{}, offServiceResidents:block.offServiceResidents||[],
             schedule:block.schedule||{}, specialDays:block.specialDays||{}, conferences:block.conferences||{},
             generationReport:block.generationReport||null,
             startDate:block.startDate, endDate:block.endDate, name:block.name, academicYear:block.academicYear } };
    setBlocksHistory(p=>[snap,...p.filter(b=>b.id!==snap.id)].slice(0, appSettings.maxSavedBlocks ?? 24));
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
      conferences:d.conferences||{}, generationReport:d.generationReport||null });
    setSwitchPending(null); setTab('schedule');
    showToast(`Loaded "${snap.name}"`,'green');
  }

  function newBlock() {
    const hasCurrent=block.startDate||(block.offServiceResidents||[]).length>0;
    hasCurrent ? setSwitchPending('__new__') : doNewBlock();
  }

  function doNewBlock() {
    setBlock(makeDefaultBlock()); setSwitchPending(null); setTab('home');
    showToast('New block ready — enter dates below','amber');
  }

  function blockReset() {
    updateBlock(b=>({...makeDefaultBlock(),id:b.id,name:b.name,academicYear:b.academicYear,emBlockAssignments:{}}));
    showToast('Block reset','amber');
  }

  function downloadCSV(filename, rows) {
    const csv=rows.map(row=>row.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;a.click();
    URL.revokeObjectURL(url);
  }

  // Grid CSV: resident × date matrix — for the chief's own visual cross-check against the on-screen grid.
  function buildGridCSVRows() {
    const dates=getBlockDates(block.startDate,block.endDate);
    const header=['Resident','Category','PGY','Rotation',...dates.map(d=>formatDisplayDate(d))];
    const rows=allResidents.map(r=>{
      const cells=dates.map(d=>block.schedule?.[r.id]?.[d]||'');
      return[`${r.lastName}, ${r.firstName}`,CAT_MAP[r.category]?.label||r.category,`PGY-${r.pgy}`,r.blockType||'—',...cells];
    });
    return [header,...rows];
  }

  // QGenda CSV: tidy/long format — one row per assignment, with real shift times, for bulk import.
  function buildQGendaCSVRows() {
    const dates=getBlockDates(block.startDate,block.endDate);
    const header=['Resident','Category','PGY','Rotation','Date','DayOfWeek','ShiftId','ShiftLabel','Area','Start','End','Hours'];
    const rows=[];
    for (const r of allResidents) {
      for (const d of dates) {
        const sid=block.schedule?.[r.id]?.[d];
        if (!sid) continue;
        const s=SHIFT_MAP[sid];
        const t=SHIFT_TIMING[sid];
        const [startStr,endStr]=(s?.hours||'—').split('–');
        rows.push([
          `${r.lastName}, ${r.firstName}`, CAT_MAP[r.category]?.label||r.category, `PGY-${r.pgy}`, r.blockType||'—',
          prettyDate(d), DOW[parseDate(d).getDay()], sid, s?.label||sid, s?.area||'',
          startStr||'', endStr||'', t?.durationH ?? '',
        ]);
      }
    }
    return [header, ...rows];
  }

  function pendingErrorCount() {
    return validateAll(allResidents, block.schedule||{}, block, eligOverrides, appSettings, dayRules)
      .filter(i=>i.level==='error').length;
  }

  function runExport(kind) {
    if (kind==='grid') downloadCSV(`schedule_${block.startDate||'block'}.csv`, buildGridCSVRows());
    else downloadCSV(`qgenda_${block.startDate||'block'}.csv`, buildQGendaCSVRows());
    setExportConfirm(null);
  }

  function requestExport(kind) {
    if (pendingErrorCount() > 0) { setExportConfirm(kind); return; }
    runExport(kind);
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
              <>
                <button onClick={()=>requestExport('grid')} title="Resident × date grid — matches the on-screen Schedule tab"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 rounded-lg transition-colors">
                  <Download size={12}/> Grid CSV
                </button>
                <button onClick={()=>requestExport('qgenda')} title="One row per shift with real start/end times — for QGenda import"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 rounded-lg transition-colors">
                  <Download size={12}/> QGenda CSV
                </button>
              </>
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
              ayData={ayData} updateAyData={updateAyData} appSettings={appSettings}
              onContinue={()=>setTab('schedule')} onLoadBlock={loadBlock}
              onSaveBlock={saveBlock} onNewBlock={newBlock}/>
          )}
          {tab==='dashboard' && (
            <DashboardTab block={block} updateBlock={updateBlock} allResidents={allResidents}
              ayConf={currentAyConf} violationCount={violCount}/>
          )}
          {tab==='em' && <EMResidentsTab emRoster={emRoster} setEmRoster={setEmRoster} block={block} updateBlock={updateBlock} appSettings={appSettings}/>}
          {tab==='offservice' && <OffServiceTab block={block} updateBlock={updateBlock} appSettings={appSettings}/>}
          {tab==='matrix' && <ShiftMatrixTab eligOverrides={eligOverrides} setEligOverrides={setEligOverrides}/>}
          {tab==='schedule' && <ScheduleGrid allResidents={allResidents} block={block} updateBlock={updateBlock} eligOverrides={eligOverrides} appSettings={appSettings} dayRules={dayRules} coverage={coverage} showToast={showToast}/>}
          {tab==='rules' && <RulesTab allResidents={allResidents} block={block} eligOverrides={eligOverrides} appSettings={appSettings} dayRules={dayRules} setDayRules={setDayRules} coverage={coverage} setCoverage={setCoverage}/>}
          {tab==='validation' && <ValidationTab allResidents={allResidents} block={block} eligOverrides={eligOverrides} appSettings={appSettings} dayRules={dayRules}/>}
          {tab==='settings' && <SettingsTab block={block} updateBlock={updateBlock} onBlockReset={blockReset} appSettings={appSettings} setAppSettings={setAppSettings} showToast={showToast}/>}
          {tab==='guide' && <UserGuideTab onNavigate={setTab}/>}
        </main>
      </div>

      {/* Draft note */}
      <div className="bg-amber-50 border-t border-amber-200 px-4 py-1.5 shrink-0">
        <div className="flex items-center gap-2 text-xs text-amber-700">
          <Info size={12} className="shrink-0"/>
          <span><strong>Draft v0.4</strong> — Neuro/Anes/Psych/Pod matrix needs verification with chief. FM PGY-1 Peds eligibility TBD. Several rules marked ⚠ in Scheduling Rules tab. See User Guide for help; export backups from Settings.</span>
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

      {/* Pre-export validation gate */}
      {exportConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0"><AlertTriangle size={18} className="text-red-600"/></div>
              <div>
                <h2 className="font-semibold text-gray-900">Unresolved errors in this schedule</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {pendingErrorCount()} error{pendingErrorCount()!==1?'s':''} (ineligible shifts, approved-day-off conflicts, or rest violations) — see the Violations tab. Exporting now will carry them into {exportConfirm==='qgenda'?'QGenda':'the CSV'}.
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button onClick={()=>setExportConfirm(null)} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">Cancel</button>
              <button onClick={()=>runExport(exportConfirm)} className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Export Anyway</button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={()=>setToast(null)}/>
    </div>
  );
}
