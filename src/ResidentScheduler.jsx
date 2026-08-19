// ResidentScheduler.jsx — v0.3
// EM Residency Scheduler · UH Emergency Medicine

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Plus, Trash2, AlertTriangle, Calendar, Users, Settings as SettingsIcon,
  X, ChevronDown, Download, Info, RefreshCw, CheckCircle, AlertCircle,
  Save, ChevronRight, Check, Table2, Activity,
  Stethoscope, ClipboardList, BookOpen, Shield, Edit2, LayoutDashboard,
  CalendarDays, AlertOctagon, HelpCircle, Upload, Wand2, GripVertical, ChevronUp, Sun, Moon,
  MessageSquare, Bug, Zap, Lightbulb, Lock, Unlock, Undo2, Redo2, Inbox, LogOut, Menu, Globe,
  Archive, FlaskConical, Clock,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
// jspdf-autotable@3.x's default-export interop is broken under esbuild/Rollup bundling (import
// autoTable from 'jspdf-autotable' resolves to the CJS namespace object, not the function, and
// throws "is not a function" at call time — verified against the installed 3.8.4 via an esbuild
// bundle, matching how Vite pre-bundles deps). A side-effect import instead runs the package's
// own applyPlugin(jsPDF) call, which patches doc.autoTable(...) on as an instance method — use
// that method form everywhere below, never the bare `autoTable(doc, opts)` function form.
import 'jspdf-autotable';
import RequestsTab from './RequestsTab';
import { supabase, AUTH_ENABLED, ROLE } from './supabaseClient';
import { parseDate, addDays, toDateStr, getBlockDates, getBlockWeekends, getAcademicYearFor, getAcademicYear, formatAY, ayWindowFor, qgendaDate } from './lib/dates.js';
import { AREA_COLORS, SHIFTS, SHIFT_MAP, SHIFT_TIMING, SHIFT_DOW, SHIFT_TYPES, SHIFT_AREAS, shiftOverlapsJC, isNightShiftId, shiftStartMs, shiftEndMs } from './lib/shifts.js';
import { getCoverageFor, DEFAULT_COVERAGE, TWELVE_HOUR_IDS, TWELVE_HOUR_AREAS, twelveHourStateFor, twelveHourAllows, resolveTwelveHourWindows } from './lib/coverage.js';
import { resolveJcDates, jcDatesInRange, isJcDate, isJcDateAnyAy } from './lib/journalClub.js';
import { resolveEligibilityList, eligibilityDiff, applyEligibilityDiff, normalizeEligibilityOverride, isEligibilityDiffEmpty } from './lib/eligibilityOverrides.js';
import { splitCsvLine, splitName, matchCategory, parseRosterText, parseDateRangeInAY, CATEGORIES, CAT_MAP, normalizeToken, DATE_RANGE_RE } from './lib/parse.js';
import { computeQualityMetrics, computeQualityVector, betterQuality } from './lib/scheduleQuality.js';
import { mulberry32 } from './lib/rng.js';
import { qgendaTaskFor, qgendaName, QGENDA_NAME_FORMATS, QGENDA_VARIANTS, QGENDA_TASKS } from './lib/qgenda.js';
import { computeJeopardyTotals, computeBuyDownsApplied, computeLedger } from './lib/jeopardyLedger.js';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// AREA_COLORS/SHIFTS/SHIFT_MAP/SHIFT_AREAS/SHIFT_TYPES/SHIFT_TIMING/SHIFT_DOW now live in
// lib/shifts.js; the 12h-window resolvers (resolveTwelveHourWindows/twelveHourStateFor/
// twelveHourAllows) and the coverage constants/helpers now live in lib/coverage.js;
// the Journal Club date resolvers live in lib/journalClub.js; CATEGORIES/CAT_MAP now live in
// lib/parse.js (see that file's own header comment for why) — imported above.

// Display labels for QGENDA_NAME_FORMATS, module-level (not local to one component) because both
// the QGenda export picker modal and SettingsTab's "QGenda Task Names" card render the same
// appSettings.qgendaNameFormat <select> — one label map, so the two can't drift apart.
const QGENDA_NAME_FORMAT_LABEL = { lastFirstInitial: 'Last, F (e.g. Smith, J)', lastFirst: 'Last, First', firstLast: 'First Last' };

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
// Peds overnight is two separate single-owner shift ids (see PED_GUARD_LEGITIMATE_OWNER):
// PED-N-FM (23:00-08:00) stays FM-3-exclusive program-wide, Mon/Tue/Wed only — no other
// category/PGY may work it, even via a rotation/matrix override (see getEligibleShifts'
// half-block/FM-3 handling). PED-N (19:00-04:00) is EM Home's own id, open to all three EM Home
// PGYs Thu-Sun (0,4,5,6) (chief-directed, AY26/27), confined to that window by each EM_HOME key's
// own overrideImmune ped_n_em_window shiftGate below — coverage stays min:0/max:1 either way
// ("ideally filled, other shifts take priority"), and a PGY-1 EM Home candidate is
// soft-deprioritized on PED-N in the generator's score() unless they've already done a
// Peds/Trauma-mix rotation this AY (see hasPriorPedsTrauma).
const BASE_ELIGIBILITY = {
  // EM Home PGY-1: all areas; TRAUMA-D only (no TRAUMA-N); Trauma further gated by block type.
  // PED-N included per the Thu-Sun EM Home window above (ped_n_em_window gate confines it).
  EM_HOME_1:  ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','POD-D12','POD-N12','PED-D12','PED-N12','FLEX-D12','FLEX-N12','MT-D12','MT-N12'],
  // EM Home PGY-2/3: all shifts including TRAUMA-N and (Thu-Sun) PED-N. PED-S (Peds Swing) is
  // further gated to only EM_TOX/EM_EMS rotations, Mon/Tue/Thu/Fri, via the ped_s_* shiftGates
  // below — nobody else is ever eligible for it, same single-owner invariant PED-N now has too
  // (PED-N's owner set is {EM_HOME_1/2/3}; FM-3's Mon/Tue/Wed grant is the separate PED-N-FM id —
  // see PED_GUARD_LEGITIMATE_OWNER).
  EM_HOME_2:  ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','PED-S','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N','POD-D12','POD-N12','PED-D12','PED-N12','FLEX-D12','FLEX-N12','MT-D12','MT-N12'],
  EM_HOME_3:  ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N','POD-D12','POD-N12','PED-D12','PED-N12','FLEX-D12','FLEX-N12','MT-D12','MT-N12'],
  // BAMC: no Trauma
  EM_BAMC_1:  ['POD-D','POD-E','POD-N','PED-D','PED-E','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','POD-D12','POD-N12','PED-D12','FLEX-D12','FLEX-N12','MT-D12','MT-N12'],
  // Peds: PED day/eve only — PED-N stays out of reach for this category on every day of the week,
  // Thu-Sun EM Home opening included (Peds residents never gained PED-N eligibility at all).
  PEDS_1:     ['PED-D','PED-E','PED-D12'],
  PEDS_3:     ['PED-D','PED-E','PED-D12'],
  // FM-1: POD default + PED-D/E as fill-in PRN (no PED nights — PED-N stays out of reach here too)
  FM_1:       ['POD-D','POD-E','POD-N','PED-D','PED-E','POD-D12','POD-N12','PED-D12'],
  // FM-3: PED Night only, Mon/Tue/Wed — still the only category/PGY exclusively eligible for
  // PED-N-FM those three days; EM Home covers the separate PED-N id Thu-Sun (see BASE_ELIGIBILITY
  // comment above). PED-N12 dropped deliberately: it's the 12h variant of PED-N's (EM) 19:00-07:00
  // timing, never FM-3's own 23:00-08:00 window — FM-3 was never really eligible for it. Accepted
  // tradeoff: if the chief ever defines a mode:'replace' PED 12-hour window, twelveHourAllows strips
  // PED-N-FM (not a TWELVE_HOUR_IDS member) and FM-3 has zero eligibility those dates.
  FM_3:       ['PED-N-FM'],
  // IM: POD + FLEX, no Peds/MT/Trauma
  IM_2:       ['POD-D','POD-E','POD-N','FLEX-D','FLEX-E','FLEX-N','POD-D12','POD-N12','FLEX-D12','FLEX-N12'],
  // Off-service (Neuro/Anes/Psych/Pod): POD + FLEX-D — verify exact matrix with chief. FLEX-D is
  // day-only for these four keys (no FLEX-E) — deliberately no FLEX-12h ids added (chief's
  // conservative default); no PED ids either since none of these keys have PED eligibility at all.
  NEURO_1:    ['POD-D','POD-E','POD-N','FLEX-D','POD-D12','POD-N12'],
  ANES_1:     ['POD-D','POD-E','POD-N','FLEX-D','POD-D12','POD-N12'],
  PSYCH_1:    ['POD-D','POD-E','POD-N','FLEX-D','POD-D12','POD-N12'],
  POD_1:      ['POD-D','POD-E','POD-N','FLEX-D','POD-D12','POD-N12'],
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
//                 allowedDays?:number[], nightExcludedDays?:number[], outsideAction:'stripShiftIds'|'blockEntireDay', overrideImmune:boolean,
//                 scope?:'generator'}]  — scope:'generator' hides the gate from the manual picker (auto-fill only), same idiom as dayTypeRestrictions[].scope
//   specialDayRules: [{listKey:'codeBlueDays'|'procDays'|'anesDays', offset:'sameDay'|'dayBefore'|'sameDayAndDayBefore'}]
//   (advocacyDays removed AY26/27 — Peds now uses fullBlockDays:[3] instead; see PEDS_1/PEDS_3 and
//   LEGACY_DAY_RULE_DEFAULTS for the pre-change shape)
//   residentFlagOverrides: [{flag:string, fullBlockDays:number[]}]  — replaces dayTypeRestrictions when resident[flag] is true
const DEFAULT_DAY_RULES = {
  EM_HOME_1: {
    // GR Wednesday — no day shifts (Grand Rounds); evenings/nights are workable.
    dayTypeRestrictions: [{ days: [3], mode: 'noDay' }],
    // Wellness Wednesday — the 1st Wednesday on/after the block's own start date is a day/eve
    // off for EM Home PGY-1 (night starting that Wednesday still allowed). Block-relative, not
    // calendar-month-relative — see nthWeekdayOnOrAfter/computedDayRules handling.
    computedDayRules: [{ type: 'wellnessWednesday', ordinal: 1 }],
    shiftGates: [
      { id: 'trauma_strip_non_trauma_block', shiftIds: ['TRAUMA-D','TRAUMA-N'],
        blockTypeFilter: { mode: 'except', ref: 'TRAUMA_BLOCKS' }, outsideAction: 'stripShiftIds', overrideImmune: false },
      { id: 'trauma_day_gate', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: null,
        allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'us_em_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['US_EM'] },
        allowedDays: [0,1,6], nightExcludedDays: [1], outsideAction: 'blockEntireDay', overrideImmune: true },
      // Avoid scheduling interns on Midtrack evenings/nights Mon/Tue (chief feedback) — generator
      // only, so the manual picker can still place one when needed.
      { id: 'mt_intern_mon_tue_evenight', shiftIds: ['MT-E','MT-N','MT-N12'], blockTypeFilter: null,
        allowedDays: [0,3,4,5,6], outsideAction: 'stripShiftIds', overrideImmune: false, scope: 'generator' },
      // PED-N (Peds Night) Thu-Sun window: EM Home gained PED-N in BASE_ELIGIBILITY (AY26/27
      // chief-directed change) but only Thu-Sun (0,4,5,6) — Mon/Tue/Wed stay FM-3-exclusive.
      // overrideImmune so a matrix override can't leak an EM Home resident onto PED-N outside
      // this window; FM-3's own eligibility/rules are untouched by this EM_HOME-scoped gate.
      { id: 'ped_n_em_window', shiftIds: ['PED-N','PED-N12'], blockTypeFilter: null,
        allowedDays: [0,4,5,6], outsideAction: 'stripShiftIds', overrideImmune: true },
    ],
  },
  EM_HOME_2: {
    // GR Wednesday — no day shifts (Grand Rounds); evenings/nights are workable.
    dayTypeRestrictions: [{ days: [3], mode: 'noDay' }],
    // Wellness Wednesday — 2nd Wednesday on/after the block's start date, PGY-2.
    computedDayRules: [{ type: 'wellnessWednesday', ordinal: 2 }],
    shiftGates: [
      { id: 'peds_em_trauma_strip', shiftIds: ['TRAUMA-D','TRAUMA-N'],
        blockTypeFilter: { mode: 'only', ids: ['PEDS_EM'] }, outsideAction: 'stripShiftIds', overrideImmune: false },
      // EM/EMS ↔ EM/TOX weekday windows swap effective 2026-08-01 (chief-directed change). Before
      // that date: EMS covers Mon/Tue, TOX covers Thu/Fri. From that date on: TOX covers Mon/Tue,
      // EMS covers Thu/Fri. Both variants are overrideImmune so a matrix override can't leak a
      // resident outside their rotation's window on either side of the cutover.
      { id: 'em_ems_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_EMS'] },
        allowedDays: [1,2], outsideAction: 'blockEntireDay', overrideImmune: true,
        activeWhen: { blockStartBefore: '2026-08-01' } },
      { id: 'em_tox_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_TOX'] },
        allowedDays: [4,5], outsideAction: 'blockEntireDay', overrideImmune: true,
        activeWhen: { blockStartBefore: '2026-08-01' } },
      { id: 'em_ems_window_aug26', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_EMS'] },
        allowedDays: [4,5], outsideAction: 'blockEntireDay', overrideImmune: true,
        activeWhen: { blockStartOnOrAfter: '2026-08-01' } },
      { id: 'em_tox_window_aug26', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_TOX'] },
        allowedDays: [1,2], outsideAction: 'blockEntireDay', overrideImmune: true,
        activeWhen: { blockStartOnOrAfter: '2026-08-01' } },
      // PED-S (Peds Swing): only EM/TOX or EM/EMS, and only on its own Mon/Tue/Thu/Fri window —
      // nobody else, ever (single-owner guard, same class PED-N/PED-N-FM belong to now that the
      // shift was split into two single-owner ids — see PED_GUARD_LEGITIMATE_OWNER). The weekday
      // pairing above already confines each rotation to its own two days, so PED-S naturally
      // follows the swap.
      { id: 'ped_s_rotation_gate', shiftIds: ['PED-S'],
        blockTypeFilter: { mode: 'except', ids: ['EM_TOX','EM_EMS'] }, outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'ped_s_day_window', shiftIds: ['PED-S'], blockTypeFilter: null,
        allowedDays: [1,2,4,5], outsideAction: 'stripShiftIds', overrideImmune: true },
      // PGY-2/3 aim for trauma NIGHTS; days only if necessary — separate weekday windows
      { id: 'trauma_d_window', shiftIds: ['TRAUMA-D'], blockTypeFilter: null,
        allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_n_window', shiftIds: ['TRAUMA-N'], blockTypeFilter: null,
        allowedDays: [5,6,0,1], outsideAction: 'stripShiftIds', overrideImmune: true },
      // PED-N (Peds Night) Thu-Sun window — see EM_HOME_1's ped_n_em_window comment above.
      { id: 'ped_n_em_window', shiftIds: ['PED-N','PED-N12'], blockTypeFilter: null,
        allowedDays: [0,4,5,6], outsideAction: 'stripShiftIds', overrideImmune: true },
    ],
  },
  EM_HOME_3: {
    // GR Wednesday — no day shifts (Grand Rounds); evenings/nights are workable.
    dayTypeRestrictions: [{ days: [3], mode: 'noDay' }],
    // Wellness Wednesday — 3rd Wednesday on/after the block's start date, PGY-3.
    computedDayRules: [{ type: 'wellnessWednesday', ordinal: 3 }],
    shiftGates: [
      { id: 'trauma_d_window', shiftIds: ['TRAUMA-D'], blockTypeFilter: null,
        allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_n_window', shiftIds: ['TRAUMA-N'], blockTypeFilter: null,
        allowedDays: [5,6,0,1], outsideAction: 'stripShiftIds', overrideImmune: true },
      // PED-N (Peds Night) Thu-Sun window — see EM_HOME_1's ped_n_em_window comment above.
      { id: 'ped_n_em_window', shiftIds: ['PED-N','PED-N12'], blockTypeFilter: null,
        allowedDays: [0,4,5,6], outsideAction: 'stripShiftIds', overrideImmune: true },
    ],
  },
  EM_BAMC_1: {
    // Thursday = BAMC's own Grand Rounds — never schedulable, no exceptions.
    fullBlockDays: [4],
    // Wednesday overnight (runs into Thursday GR) is allowed once per block, but only as a
    // manual pick (scope:'generator' hides it from auto-fill; validateAll warns past one/block).
    dayTypeRestrictions: [{ days: [3], mode: 'noNight', scope: 'generator' }],
    specialDayRules: [{ listKey: 'procDays', offset: 'sameDayAndDayBefore' }],
    // Avoid scheduling interns on Midtrack evenings/nights Mon/Tue (chief feedback) — generator
    // only, so the manual picker can still place one when needed.
    shiftGates: [
      { id: 'mt_intern_mon_tue_evenight', shiftIds: ['MT-E','MT-N','MT-N12'], blockTypeFilter: null,
        allowedDays: [0,3,4,5,6], outsideAction: 'stripShiftIds', overrideImmune: false, scope: 'generator' },
    ],
  },
  // Peds residents don't work Wednesdays at all (chief-directed, AY26/27) — replaces the old
  // "night before an advocacy day" mechanic entirely (see LEGACY_DAY_RULE_DEFAULTS for the old
  // shape); the advocacyDays special-day list itself is gone from SPECIAL_DAY_META.
  PEDS_1: { fullBlockDays: [3] },
  PEDS_3: { fullBlockDays: [3] },
  FM_1: {
    fullBlockDays: [3,4],
    dayTypeRestrictions: [{ days: [2], mode: 'noNight' }],
  },
  FM_3: { onlyDaysEnabled: true, onlyDays: [1,2,3] },
  IM_2: {
    // Chief-directed AY26/27 tightening: no Tuesday evening/night (day-only Tue) and no Wednesday
    // morning/evening (night-only Wed — Wednesday overnight still OK). Was Wed-day-only alone.
    dayTypeRestrictions: [{ days: [2], mode: 'onlyDay' }, { days: [3], mode: 'onlyNight' }],
    specialDayRules: [{ listKey: 'codeBlueDays', offset: 'sameDayAndDayBefore' }],
    residentFlagOverrides: [{ flag: 'isCCUNights', fullBlockDays: [2,3] }],
  },
  NEURO_1: { fullBlockDays: [3,5] },
  ANES_1: {
    dayTypeRestrictions: [{ days: [3], mode: 'onlyDay' }],
    specialDayRules: [{ listKey: 'anesDays', offset: 'sameDay' }],
    // Never schedule Anesthesia on the first Friday of the CALENDAR month (their social hour) —
    // computed from the date itself, not tied to the block's own start day.
    computedDayRules: [{ type: 'firstFridayOfMonth' }],
  },
  PSYCH_1: {
    // Monday: no night shifts. Tuesday: no DAY shifts (evening/night both allowed). Wednesday: day-only.
    dayTypeRestrictions: [{ days: [1], mode: 'noNight' }, { days: [2], mode: 'noDay' }, { days: [3], mode: 'onlyDay' }],
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

// Rotation-specific targets for EM Home, keyed CATEGORY_PGY__BLOCKTYPE. Checked before falling
// back to SHIFT_TARGETS in getShiftTarget(); a Settings targetOverrides entry still wins over both.
const BLOCK_TARGETS = {
  EM_HOME_1__EM_RES_VAC:  13, // EM/Vacation, PGY-1
  EM_HOME_2__EM_VAC:      12, // EM/Vacation, PGY-2
  EM_HOME_3__EM_VAC:      11, // EM/Vacation, PGY-3
  EM_HOME_1__US_EM:        5, // US/EM — 5 EM shifts total (Sat–Mon, no Mon night)
  EM_HOME_1__PEDS_TRAUMA: 19, // 8 trauma-half + 11 peds-half
  EM_HOME_1__TRAUMA_PEDS: 19,
  EM_HOME_2__PEDS_EM:     19, // 10–12 peds shifts + rest elsewhere
};

// DEFAULT_COVERAGE_MINMAX/DEFAULT_COVERAGE/DOW_COVERAGE_MAX_OVERRIDE/normalizeCoverageEntry/
// getCoverageFor now live in lib/coverage.js (imported above).

// Per-date coverage counts vs configured min/max, computed from the FULL schedule (never
// category-filtered rows) — shared by the grid's coverage footer (ScheduleGrid) and the
// Dashboard stat tiles (DashboardTab) so both read the same numbers.
function computeCoverageByDate(dates, sched, coverage, allResidents, ayConf) {
  const m = {};
  for (const ds of dates) {
    const dow = parseDate(ds).getDay();
    // Unconditional: twelveHourStateFor always returns a state object, and passing `undefined`
    // instead would read as "no date context" and let every 12h shift's DEFAULT_COVERAGE minimum
    // go live here — painting the calendar strips, stat tiles and coverage footer red.
    const conf12 = twelveHourStateFor(ds, ayConf || {});
    let filled = 0, minTotal = 0;
    const perShift = {};
    const belowMin = [], aboveMax = [];
    for (const s of SHIFTS) {
      if (SHIFT_DOW[s.id] && !SHIFT_DOW[s.id].includes(dow)) continue;
      const cov = getCoverageFor(s.id, coverage, dow, conf12);
      const count = allResidents.reduce((n,r)=> n + (sched[r.id]?.[ds]===s.id ? 1 : 0), 0);
      perShift[s.id] = { count, min: cov.min, max: cov.max };
      minTotal += cov.min;
      filled += count;
      if (cov.min > 0 && count < cov.min) belowMin.push(`${s.id} ${count}/${cov.min}`);
      if (count > cov.max) aboveMax.push(`${s.id} ${count}/${cov.max}`);
    }
    m[ds] = { perShift, filled, minTotal, belowMin, aboveMax };
  }
  return m;
}

// Shifts that carried any coverage requirement OR any actual assignment across the given dates —
// shared by the Schedule grid's coverage-footer expansion (ScheduleGrid) and the Dashboard year-
// calendar drill-down (DashboardTab) so both agree on which shift rows are worth showing.
function getActiveCoverageShifts(dates, coverageByDate) {
  return SHIFTS.filter(s => dates.some(ds => {
    const info = coverageByDate[ds]?.perShift[s.id];
    return info && (info.min > 0 || info.count > 0);
  }));
}

// ─── Legacy defaults (pre rules-correction passes) ─────────────────────────
// Snapshots of OLD DEFAULT_DAY_RULES / BASE_ELIGIBILITY entries for keys whose defaults changed,
// one array per key so a key can accumulate a snapshot from EACH correction pass over time. A
// chief's saved override replaces a key's default wholesale (getEffectiveDayRules /
// getEffectiveEligibility), so a no-op override equal to ANY prior default would otherwise mask
// the current, corrected default forever. See the one-time prune effect in the root component.
const LEGACY_DAY_RULE_DEFAULTS = {
  PSYCH_1: [{ fullBlockDays: [2], dayTypeRestrictions: [{ days: [1], mode: 'noNight' }, { days: [3], mode: 'onlyDay' }] }],
  EM_BAMC_1: [
    { dayTypeRestrictions: [{ days: [3], mode: 'onlyDay' }], specialDayRules: [{ listKey: 'procDays', offset: 'sameDayAndDayBefore' }] },
    // Pre-MT-intern-gate shape (still fullBlockDays:[4] Thursday GR + generator-scoped Wed-night exception, no shiftGates).
    { fullBlockDays: [4], dayTypeRestrictions: [{ days: [3], mode: 'noNight', scope: 'generator' }], specialDayRules: [{ listKey: 'procDays', offset: 'sameDayAndDayBefore' }] },
  ],
  // GR Wednesday used to fully block the day for EM Home (fullBlockDays:[3]) — chief feedback
  // (Ratna rules pass) corrected this to day-shifts-only, since residents CAN work Wednesday
  // evenings/nights as long as it doesn't conflict with Grand Rounds itself.
  EM_HOME_1: [
    { fullBlockDays: [3], shiftGates: [
      { id: 'trauma_strip_non_trauma_block', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: { mode: 'except', ref: 'TRAUMA_BLOCKS' }, outsideAction: 'stripShiftIds', overrideImmune: false },
      { id: 'trauma_day_gate', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: null, allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'us_em_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['US_EM'] }, allowedDays: [0,1,6], nightExcludedDays: [1], outsideAction: 'blockEntireDay', overrideImmune: true },
    ] },
    // Pre-Wellness-Wednesday shape (dayTypeRestrictions:[noDay Wed] + trauma/US-EM/MT-intern
    // gates, no computedDayRules yet) — the live default immediately before Wellness Wednesdays
    // (1st Wed of block, PGY-1) were added.
    { dayTypeRestrictions: [{ days: [3], mode: 'noDay' }], shiftGates: [
      { id: 'trauma_strip_non_trauma_block', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: { mode: 'except', ref: 'TRAUMA_BLOCKS' }, outsideAction: 'stripShiftIds', overrideImmune: false },
      { id: 'trauma_day_gate', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: null, allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'us_em_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['US_EM'] }, allowedDays: [0,1,6], nightExcludedDays: [1], outsideAction: 'blockEntireDay', overrideImmune: true },
      { id: 'mt_intern_mon_tue_evenight', shiftIds: ['MT-E','MT-N'], blockTypeFilter: null, allowedDays: [0,3,4,5,6], outsideAction: 'stripShiftIds', overrideImmune: false, scope: 'generator' },
    ] },
    // Pre-PED-N-Thu-Sun shape (Wellness Wednesday already added, no ped_n_em_window gate yet) —
    // the live default immediately before EM Home gained Thu-Sun PED-N eligibility (AY26/27).
    { dayTypeRestrictions: [{ days: [3], mode: 'noDay' }], computedDayRules: [{ type: 'wellnessWednesday', ordinal: 1 }], shiftGates: [
      { id: 'trauma_strip_non_trauma_block', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: { mode: 'except', ref: 'TRAUMA_BLOCKS' }, outsideAction: 'stripShiftIds', overrideImmune: false },
      { id: 'trauma_day_gate', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: null, allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'us_em_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['US_EM'] }, allowedDays: [0,1,6], nightExcludedDays: [1], outsideAction: 'blockEntireDay', overrideImmune: true },
      { id: 'mt_intern_mon_tue_evenight', shiftIds: ['MT-E','MT-N'], blockTypeFilter: null, allowedDays: [0,3,4,5,6], outsideAction: 'stripShiftIds', overrideImmune: false, scope: 'generator' },
    ] },
  ],
  EM_HOME_2: [
    { fullBlockDays: [3], shiftGates: [
      { id: 'peds_em_trauma_strip', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: { mode: 'only', ids: ['PEDS_EM'] }, outsideAction: 'stripShiftIds', overrideImmune: false },
      { id: 'em_ems_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_EMS'] }, allowedDays: [1,2], outsideAction: 'blockEntireDay', overrideImmune: true },
      { id: 'em_tox_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_TOX'] }, allowedDays: [4,5], outsideAction: 'blockEntireDay', overrideImmune: true },
    ] },
    // Pre-PED-S/Aug-2026-swap shape (adds trauma D/N windows, still single EMS/TOX gate each,
    // no activeWhen/PED-S gates — this was the live default immediately before this rules pass).
    { fullBlockDays: [3], shiftGates: [
      { id: 'peds_em_trauma_strip', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: { mode: 'only', ids: ['PEDS_EM'] }, outsideAction: 'stripShiftIds', overrideImmune: false },
      { id: 'em_ems_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_EMS'] }, allowedDays: [1,2], outsideAction: 'blockEntireDay', overrideImmune: true },
      { id: 'em_tox_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_TOX'] }, allowedDays: [4,5], outsideAction: 'blockEntireDay', overrideImmune: true },
      { id: 'trauma_d_window', shiftIds: ['TRAUMA-D'], blockTypeFilter: null, allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_n_window', shiftIds: ['TRAUMA-N'], blockTypeFilter: null, allowedDays: [5,6,0,1], outsideAction: 'stripShiftIds', overrideImmune: true },
    ] },
    // Pre-GR-Wednesday-correction shape (full Aug-2026/PED-S gate set, still fullBlockDays:[3]).
    { fullBlockDays: [3], shiftGates: [
      { id: 'peds_em_trauma_strip', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: { mode: 'only', ids: ['PEDS_EM'] }, outsideAction: 'stripShiftIds', overrideImmune: false },
      { id: 'em_ems_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_EMS'] }, allowedDays: [1,2], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartBefore: '2026-08-01' } },
      { id: 'em_tox_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_TOX'] }, allowedDays: [4,5], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartBefore: '2026-08-01' } },
      { id: 'em_ems_window_aug26', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_EMS'] }, allowedDays: [4,5], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartOnOrAfter: '2026-08-01' } },
      { id: 'em_tox_window_aug26', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_TOX'] }, allowedDays: [1,2], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartOnOrAfter: '2026-08-01' } },
      { id: 'ped_s_rotation_gate', shiftIds: ['PED-S'], blockTypeFilter: { mode: 'except', ids: ['EM_TOX','EM_EMS'] }, outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'ped_s_day_window', shiftIds: ['PED-S'], blockTypeFilter: null, allowedDays: [1,2,4,5], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_d_window', shiftIds: ['TRAUMA-D'], blockTypeFilter: null, allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_n_window', shiftIds: ['TRAUMA-N'], blockTypeFilter: null, allowedDays: [5,6,0,1], outsideAction: 'stripShiftIds', overrideImmune: true },
    ] },
    // Pre-Wellness-Wednesday shape (dayTypeRestrictions:[noDay Wed] + full Aug-2026/PED-S gate
    // set, no computedDayRules yet) — the live default immediately before Wellness Wednesdays
    // (2nd Wed of block, PGY-2) were added.
    { dayTypeRestrictions: [{ days: [3], mode: 'noDay' }], shiftGates: [
      { id: 'peds_em_trauma_strip', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: { mode: 'only', ids: ['PEDS_EM'] }, outsideAction: 'stripShiftIds', overrideImmune: false },
      { id: 'em_ems_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_EMS'] }, allowedDays: [1,2], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartBefore: '2026-08-01' } },
      { id: 'em_tox_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_TOX'] }, allowedDays: [4,5], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartBefore: '2026-08-01' } },
      { id: 'em_ems_window_aug26', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_EMS'] }, allowedDays: [4,5], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartOnOrAfter: '2026-08-01' } },
      { id: 'em_tox_window_aug26', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_TOX'] }, allowedDays: [1,2], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartOnOrAfter: '2026-08-01' } },
      { id: 'ped_s_rotation_gate', shiftIds: ['PED-S'], blockTypeFilter: { mode: 'except', ids: ['EM_TOX','EM_EMS'] }, outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'ped_s_day_window', shiftIds: ['PED-S'], blockTypeFilter: null, allowedDays: [1,2,4,5], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_d_window', shiftIds: ['TRAUMA-D'], blockTypeFilter: null, allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_n_window', shiftIds: ['TRAUMA-N'], blockTypeFilter: null, allowedDays: [5,6,0,1], outsideAction: 'stripShiftIds', overrideImmune: true },
    ] },
    // Pre-PED-N-Thu-Sun shape (Wellness Wednesday already added, no ped_n_em_window gate yet) —
    // the live default immediately before EM Home gained Thu-Sun PED-N eligibility (AY26/27).
    { dayTypeRestrictions: [{ days: [3], mode: 'noDay' }], computedDayRules: [{ type: 'wellnessWednesday', ordinal: 2 }], shiftGates: [
      { id: 'peds_em_trauma_strip', shiftIds: ['TRAUMA-D','TRAUMA-N'], blockTypeFilter: { mode: 'only', ids: ['PEDS_EM'] }, outsideAction: 'stripShiftIds', overrideImmune: false },
      { id: 'em_ems_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_EMS'] }, allowedDays: [1,2], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartBefore: '2026-08-01' } },
      { id: 'em_tox_window', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_TOX'] }, allowedDays: [4,5], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartBefore: '2026-08-01' } },
      { id: 'em_ems_window_aug26', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_EMS'] }, allowedDays: [4,5], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartOnOrAfter: '2026-08-01' } },
      { id: 'em_tox_window_aug26', shiftIds: 'ALL', blockTypeFilter: { mode: 'only', ids: ['EM_TOX'] }, allowedDays: [1,2], outsideAction: 'blockEntireDay', overrideImmune: true, activeWhen: { blockStartOnOrAfter: '2026-08-01' } },
      { id: 'ped_s_rotation_gate', shiftIds: ['PED-S'], blockTypeFilter: { mode: 'except', ids: ['EM_TOX','EM_EMS'] }, outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'ped_s_day_window', shiftIds: ['PED-S'], blockTypeFilter: null, allowedDays: [1,2,4,5], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_d_window', shiftIds: ['TRAUMA-D'], blockTypeFilter: null, allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_n_window', shiftIds: ['TRAUMA-N'], blockTypeFilter: null, allowedDays: [5,6,0,1], outsideAction: 'stripShiftIds', overrideImmune: true },
    ] },
  ],
  EM_HOME_3: [
    { fullBlockDays: [3] },
    // Pre-GR-Wednesday-correction shape (trauma D/N windows added, still fullBlockDays:[3]).
    { fullBlockDays: [3], shiftGates: [
      { id: 'trauma_d_window', shiftIds: ['TRAUMA-D'], blockTypeFilter: null, allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_n_window', shiftIds: ['TRAUMA-N'], blockTypeFilter: null, allowedDays: [5,6,0,1], outsideAction: 'stripShiftIds', overrideImmune: true },
    ] },
    // Pre-Wellness-Wednesday shape (dayTypeRestrictions:[noDay Wed] + trauma D/N windows, no
    // computedDayRules yet) — the live default immediately before Wellness Wednesdays (3rd Wed
    // of block, PGY-3) were added.
    { dayTypeRestrictions: [{ days: [3], mode: 'noDay' }], shiftGates: [
      { id: 'trauma_d_window', shiftIds: ['TRAUMA-D'], blockTypeFilter: null, allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_n_window', shiftIds: ['TRAUMA-N'], blockTypeFilter: null, allowedDays: [5,6,0,1], outsideAction: 'stripShiftIds', overrideImmune: true },
    ] },
    // Pre-PED-N-Thu-Sun shape (Wellness Wednesday already added, no ped_n_em_window gate yet) —
    // the live default immediately before EM Home gained Thu-Sun PED-N eligibility (AY26/27).
    { dayTypeRestrictions: [{ days: [3], mode: 'noDay' }], computedDayRules: [{ type: 'wellnessWednesday', ordinal: 3 }], shiftGates: [
      { id: 'trauma_d_window', shiftIds: ['TRAUMA-D'], blockTypeFilter: null, allowedDays: [2,4,6,0], outsideAction: 'stripShiftIds', overrideImmune: true },
      { id: 'trauma_n_window', shiftIds: ['TRAUMA-N'], blockTypeFilter: null, allowedDays: [5,6,0,1], outsideAction: 'stripShiftIds', overrideImmune: true },
    ] },
  ],
  // Pre-Wednesday-off shape (the "night before an advocacy day" mechanic, driven by a chief-edited
  // advocacyDays date list on the Dashboard) — replaced wholesale by a hard Wednesday fullBlockDays
  // (AY26/27 chief-directed change); the advocacyDays list itself is gone from SPECIAL_DAY_META.
  PEDS_1: [{ specialDayRules: [{ listKey: 'advocacyDays', offset: 'dayBefore' }] }],
  PEDS_3: [{ specialDayRules: [{ listKey: 'advocacyDays', offset: 'dayBefore' }] }],
  // Pre-AY26/27-tightening shape (Wednesday day-shift-only, no Tuesday restriction at all) — the
  // live default immediately before IM residents also lost Tuesday eve/night and Wednesday
  // morning/eve (Wednesday overnight still allowed).
  IM_2: [{ dayTypeRestrictions: [{ days: [3], mode: 'onlyDay' }] }],
};
const LEGACY_ELIGIBILITY_DEFAULTS = {
  EM_HOME_1: [
    ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D'],
    // Pre-PED-N-Thu-Sun shape (no PED-N at all) — the live default immediately before EM Home
    // gained Thu-Sun PED-N eligibility (AY26/27 chief-directed change).
    ['POD-D','POD-E','POD-N','PED-D','PED-E','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D'],
    // Pre-12h-conference-shift shape (no D12/N12 ids at all) — the live default immediately
    // before the conference-week 12h shift feature was added.
    ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D'],
  ],
  EM_HOME_2: [
    ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N'],
    // Pre-PED-S shape (had TRAUMA-N but no PED-S) — the live default immediately before this pass.
    ['POD-D','POD-E','POD-N','PED-D','PED-E','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N'],
    // Pre-PED-N-Thu-Sun shape (had PED-S, no PED-N) — the live default immediately before EM Home
    // gained Thu-Sun PED-N eligibility (AY26/27 chief-directed change).
    ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-S','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N'],
    // Pre-12h-conference-shift shape (no D12/N12 ids at all) — the live default immediately
    // before the conference-week 12h shift feature was added.
    ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','PED-S','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N'],
  ],
  EM_HOME_3: [
    ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N'],
    // Pre-PED-N-Thu-Sun shape (no PED-N at all) — the live default immediately before EM Home
    // gained Thu-Sun PED-N eligibility (AY26/27 chief-directed change).
    ['POD-D','POD-E','POD-N','PED-D','PED-E','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N'],
    // Pre-12h-conference-shift shape (no D12/N12 ids at all) — the live default immediately
    // before the conference-week 12h shift feature was added.
    ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N','TRAUMA-D','TRAUMA-N'],
  ],
  EM_BAMC_1: [
    ['POD-D','POD-E','POD-N','PED-D','PED-E','PED-N','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N'],
    // Pre-12h-conference-shift shape (no D12/N12 ids at all) — the live default immediately
    // before the conference-week 12h shift feature was added.
    ['POD-D','POD-E','POD-N','PED-D','PED-E','FLEX-D','FLEX-E','FLEX-N','MT-D','MT-E','MT-N'],
  ],
  PEDS_1: [
    ['PED-D','PED-E','PED-N'],
    // Pre-12h-conference-shift shape (no D12 id) — the live default immediately before the
    // conference-week 12h shift feature was added.
    ['PED-D','PED-E'],
  ],
  PEDS_3: [
    ['PED-D','PED-E','PED-N'],
    // Pre-12h-conference-shift shape (no D12 id) — the live default immediately before the
    // conference-week 12h shift feature was added.
    ['PED-D','PED-E'],
  ],
  FM_1: [
    ['POD-D','POD-E','POD-N'],
    // Pre-12h-conference-shift shape (no D12/N12/PED-D12 ids) — the live default immediately
    // before the conference-week 12h shift feature was added.
    ['POD-D','POD-E','POD-N','PED-D','PED-E'],
  ],
  // Pre-12h-conference-shift shape — the live default immediately before the conference-week 12h
  // shift feature was added (see the six entries below), plus the pre-PED-N-FM-split shape (before
  // FM-3's PED-N was renamed to its own PED-N-FM id and PED-N12 was dropped as never really FM-3's).
  // BELT-AND-BRACES ONLY: the prune compares with deepEqualNormalized against these ARRAY literals,
  // but the array->diff migration (renameDiffShiftIds in src/lib/eligibilityOverrides.js) already
  // runs first, so a live store holds {added,removed} diff objects that can never deep-equal a bare
  // array — this entry only fires for a stale JSON backup / un-upgraded device's cloud row / a
  // hand-edited localStorage value that skipped the migration. The real mechanism is
  // renameDiffShiftIds, not this list.
  FM_3:    [['PED-N'], ['PED-N','PED-N12']],
  IM_2:    [['POD-D','POD-E','POD-N','FLEX-D','FLEX-E','FLEX-N']],
  NEURO_1: [['POD-D','POD-E','POD-N','FLEX-D']],
  ANES_1:  [['POD-D','POD-E','POD-N','FLEX-D']],
  PSYCH_1: [['POD-D','POD-E','POD-N','FLEX-D']],
  POD_1:   [['POD-D','POD-E','POD-N','FLEX-D']],
};
// Row keys whose DEFAULT_DAY_RULES or BASE_ELIGIBILITY changed in this pass — used to flag a
// chief's genuinely-customized override for review (it was written against an old default).
const DAY_RULE_DEFAULTS_CHANGED = new Set([...Object.keys(LEGACY_DAY_RULE_DEFAULTS), ...Object.keys(LEGACY_ELIGIBILITY_DEFAULTS)]);

// Order-insensitive-for-primitive-arrays deep equality, used only for the one-time legacy-default
// prune above — good enough to catch untouched overrides without false-negatives on key order.
function normalizeForCompare(val) {
  if (Array.isArray(val)) {
    const arr = val.map(normalizeForCompare);
    return arr.every(v => v === null || typeof v !== 'object') ? [...arr].sort() : arr;
  }
  if (val && typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val).sort()) out[k] = normalizeForCompare(val[k]);
    return out;
  }
  return val;
}
function deepEqualNormalized(a, b) { return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b)); }

// Static rules reference per category_pgy — used in Rules tab
// Hand-maintained prose that doesn't fit the structured DEFAULT_DAY_RULES schema — supplementary
// context only (shift-count math, workflow advice, unresolved TBDs). Day-of-week/block-type rules
// themselves are enforced AND described entirely from DEFAULT_DAY_RULES/dayRules — see
// describeDayRules()/describeShiftGates() in the Scheduling Rules tab, so they can't drift from
// what's actually enforced the way static text could.
const SEVEN_DAY_RULE_NOTE = 'Max 6 consecutive work days (ACGME 1-in-7) — a day counts as worked if a shift is assigned, OR it\'s the resident\'s Grand Rounds weekday (EM Home: Wednesday; BAMC: Thursday), OR their Journal Club presenting date — unless they\'re on vacation/approved off that date. Counted across the block boundary using the previous saved block. Enforced by the generator, the manual picker/drag-drop, and Validation.';
// Note: these hardcode the same numbers as NIGHT_RULES/JC_MAX_PER_AY (declared later in the file)
// rather than referencing those constants directly — a top-level const referencing another
// const declared later in module order hits the temporal dead zone and throws at load time.
const CIRCADIAN_RULE_NOTE = 'Circadian scheduling: nights should cluster into one run of 4-6 (max 6) rather than isolated shifts; an evening shift can never be immediately followed by a day shift the next day, or vice versa; max 6 total night shifts/block (residents whose eligibility is entirely night shifts, e.g. FM-3 on PED-N-FM, are exempt from the per-block cap) — all enforced, including in Validation even when the rest-hours toggle is off. 24h off after a night shift before a day or evening shift, or Grand Rounds, is a ranked soft rule (Rules tab → Soft Rule Priority) — the generator only breaks it to protect a higher-ranked rule.';
const SENIOR_COMPOSITION_NOTE = 'Every staffed FLEX shift needs an EM PGY-2 (fallback PGY-3, soft). Every staffed POD shift needs an EM PGY-3 — hard, sole exception the resident\'s own 3rd Wellness Wednesday (PGY-2 may substitute that one day). Enforced by the generator (POD slot left unfilled and reported rather than staffed with the wrong PGY if no PGY-3 is available) and Validation.';
const JC_RULE_NOTE = 'Journal Club: 18:00-21:00, on the first Tuesday of each month by default — the chief can move any date for an academic year on the Dashboard tab. Any shift overlapping that window counts as "worked," including PED Swing and Trauma Night. Max 3 worked per academic year (July 1 - July 1), counting Published saved blocks plus the current block. One EM Home PGY-1, PGY-2, and PGY-3 present each Journal Club (set on the resident\'s profile or from the Journal Club card); a presenter\'s own overlapping shifts are hard-blocked that day, and a late night shift afterward is generator-avoided (manually placeable with a warning).';
const GR_LECTURE_RULE_NOTE = 'Grand Rounds lecture dates (set per-resident on the resident\'s profile): no evening/night shift the day before a lecture date (hard — enforced by the generator and Validation, error if violated). The generator also keeps that whole day off where possible (chief feedback); the manual picker still allows a day shift there if needed.';
// Chief role is set per-resident on the EM Residents tab (roster-level, not per-block) — see
// CHIEF_ROLES/effectiveChiefRole. All three roles carry the same 16-shift target; only the
// Academic Chief carries the extra Tuesday restriction below.
const CHIEF_ROLE_NOTE = 'A PGY-3 EM Home resident may hold one of three distinct chief roles for the year — Academic, Admin, or Scheduling Chief (set on the EM Residents tab) — each worth a 16-shift target. The Academic Chief additionally gets no evening/night shifts on Tuesdays (hard — enforced by the generator and Validation).';
// Peds Night is now two separate single-owner shift ids (see PED_GUARD_LEGITIMATE_OWNER):
// PED-N-FM (23:00-08:00) stays FM-3-exclusive Mon/Tue/Wed; PED-N (19:00-04:00) is EM Home's own
// id, Thu-Sun (AY26/27 chief-directed change). Coverage min stays 0 (best-effort, never required)
// on both; PGY-1 candidates are soft-deprioritized on PED-N in the generator unless they've
// already done a Peds/Trauma-mix rotation this AY.
const PED_N_EM_HOME_NOTE = 'Peds Night: FM-3 works the separate PED-N-FM shift (23:00-08:00) exclusively Mon/Tue/Wed; EM Home PGYs are eligible for PED-N (19:00-04:00) Thu-Sun (enforced via the ped_n_em_window rule). Coverage stays min 0/max 1 either way — "ideally filled, other shifts take priority," not required. PGY-1 candidates are soft-deprioritized on PED-N (generator only) unless already on/past a Peds/Trauma-mix rotation this academic year.';

const RULE_NOTES = {
  EM_HOME_1: {
    blockTypeNotes: [
      { ids: ['PEDS_TRAUMA','TRAUMA_PEDS'], note: 'First/last 14 days split (enforced): trauma half = 8 Trauma Day shifts (Tue/Thu/Sat/Sun only, generated last); peds half = 11 PED Day/Eve shifts. No other shifts on either half.' },
      { ids: ['US_EM'], note: '5 EM shifts total, Sat/Sun/Mon only (no Monday night). Enforced.' },
      { ids: ['EM_RES_VAC'], note: '13 shifts total. Enforced.' },
    ],
    specialNotes: [SEVEN_DAY_RULE_NOTE, CIRCADIAN_RULE_NOTE, SENIOR_COMPOSITION_NOTE, JC_RULE_NOTE, GR_LECTURE_RULE_NOTE, PED_N_EM_HOME_NOTE],
  },
  EM_HOME_2: {
    blockTypeNotes: [
      { ids: ['PEDS_EM'], note: '19 total; 10–12 Peds Day/Eve shifts (generator biases toward 10, hard-caps at 12), rest elsewhere. Enforced.' },
      { ids: ['EM_VAC'], note: '12 shifts total. Enforced.' },
      { ids: ['OB_VAC'], note: 'Not scheduled by chief — resident self-arranges (rotation marked non-schedulable).' },
      { ids: ['EM_EMS'], note: 'Weekday window swaps 2026-08-01 (chief-directed): before that date, EM/EMS covers Mon/Tue including the PED Swing shift; from that date on, EM/EMS covers Thu/Fri instead. Enforced.' },
      { ids: ['EM_TOX'], note: 'Weekday window swaps 2026-08-01: before that date, EM/TOX covers Thu/Fri; from that date on, EM/TOX covers Mon/Tue including the PED Swing shift. Enforced.' },
    ],
    specialNotes: ['Trauma: aim for 1–2 shifts/block, nights preferred (Fri/Sat/Sun/Mon window) — days (Tue/Thu/Sat/Sun window) only if necessary. Enforced.', SEVEN_DAY_RULE_NOTE, CIRCADIAN_RULE_NOTE, SENIOR_COMPOSITION_NOTE, JC_RULE_NOTE, GR_LECTURE_RULE_NOTE, PED_N_EM_HOME_NOTE],
  },
  EM_HOME_3: {
    blockTypeNotes: [
      { ids: ['EM_VAC'], note: '11 shifts total. Enforced.' },
      { ids: ['METRO'], note: 'Self-pick 12 Metro shifts + 8 on-call days; chief does not schedule (rotation marked non-schedulable).' },
      { ids: ['ADMIN'], note: 'On-call only (4 teaching + 4 other); no regular ED shifts (rotation marked non-schedulable).' },
    ],
    specialNotes: ['Trauma: same 1–2/block, nights-preferred rule as PGY-2. Enforced.', SEVEN_DAY_RULE_NOTE, CIRCADIAN_RULE_NOTE, JC_RULE_NOTE, GR_LECTURE_RULE_NOTE, CHIEF_ROLE_NOTE, PED_N_EM_HOME_NOTE],
    softPrefs: ['Try to give Sunday off before ICU rotations'],
  },
  EM_BAMC_1: {
    specialNotes: [
      'Thursday: BAMC Grand Rounds — never schedulable, no exceptions. Enforced.',
      'Wednesday overnight (runs into Thursday GR): allowed once per block, manual assignment only — the generator never auto-places it; Validation warns past one.',
      'Procedure days: off night before + day of (can work night-of if critical) — set by chief on the Dashboard tab.',
      'Defaults to the "EM" rotation when no rotation is set (fixes BAMC residents added via the Off-Service tab, which never assigns one) — so BAMC residents are schedulable by default.',
      'Soft generator nudge: prefer Flex/POD/Peds day shifts, especially Wednesday, over other placements.',
      SEVEN_DAY_RULE_NOTE, CIRCADIAN_RULE_NOTE, GR_LECTURE_RULE_NOTE,
    ],
  },
  PEDS_1: {
    specialNotes: ['No Wednesdays at all (enforced) — replaces the old night-before-advocacy-day mechanic.', 'Peds Night is FM-3\'s own PED-N-FM (Mon/Tue/Wed) or EM Home\'s own PED-N (Thu-Sun), program-wide — Peds residents are never eligible for either, on any day.', 'Peds residents self-cover; app displays schedule only.'],
  },
  PEDS_3: {
    specialNotes: ['No Wednesdays at all (enforced) — replaces the old night-before-advocacy-day mechanic.', 'Peds Night is FM-3\'s own PED-N-FM (Mon/Tue/Wed) or EM Home\'s own PED-N (Thu-Sun), program-wide — Peds residents are never eligible for either, on any day.', 'Self-cover arrangement.'],
  },
  FM_1: {
    specialNotes: ['PED-D/PED-E eligible as fill-in PRN (no Peds nights, no emphasis on Peds) — generator keeps them mostly on POD and discourages peds further past a soft ~1/3-of-target ceiling; Validation warns if exceeded.'],
  },
  FM_3: {
    specialNotes: ['FM-3 ONLY works Peds nights, its own PED-N-FM shift (23:00-08:00), Mon/Tue/Wed — exclusively FM-3\'s those three days program-wide (EM Home may optionally cover the separate PED-N shift (19:00-04:00) Thu-Sun, min coverage 0, PGY-1s soft-deprioritized there — see EM Home notes). Gaps Mon/Tue/Wed, or any day with no FM-3 on the block, are expected.'],
  },
  IM_2: {
    specialNotes: ['Code Blue days: off night before + day of — set by chief on the Dashboard tab.'],
    tbdItems: ['CCU nights detection (currently manual checkbox on resident)'],
  },
  NEURO_1: {
    softPrefs: ['Avoid Tuesday/Thursday night shifts when possible.'],
    tbdItems: ['Confirm eligible shift list with rotation director'],
  },
  ANES_1: {
    specialNotes: ['1st Friday of each calendar month (social hour): never schedulable. Enforced.', 'Ultrasound days: off (email the ultrasound coordinator annually for dates).'],
  },
  PSYCH_1: {
    specialNotes: ['Monday: no night shifts. Tuesday: no day shifts (evening/night OK). Wednesday: day-only.'],
  },
  POD_1: {
    specialNotes: ['Podiatry typically only rotates with EM ~December–February and covers a low number of shifts — no built-in seasonality; confine a podiatry resident to those months via their Availability setting (Date ranges) on the resident profile / Off-Service tab.'],
  },
};

const DOW_MODE_LABEL = { onlyDay: 'day shifts only', noNight: 'no night shifts', onlyNight: 'night shifts only', noDay: 'no day shifts' };

// Renders the current dayRules config for a row as the same {label, rule, type} shape the tab
// used to get from static RULES_DATA.dayRules — generated live, so it can never drift.
const COMPUTED_RULE_LABEL = { firstFridayOfMonth: '1st Friday of each calendar month' };
const ORDINAL_WORD = { 1: '1st', 2: '2nd', 3: '3rd' };

function describeDayRules(dr) {
  const out = [];
  if (dr.fullBlockDays?.length) out.push({ label: dr.fullBlockDays.map(d=>DOW[d]).join('/'), rule: 'No shifts', type: 'block' });
  if (dr.onlyDaysEnabled) out.push({ label: 'All other days', rule: `No shifts — only schedulable ${(dr.onlyDays||[]).map(d=>DOW[d]).join('/')}`, type: 'block' });
  for (const r of dr.dayTypeRestrictions || []) out.push({ label: r.days.map(d=>DOW[d]).join('/'), rule: `${DOW_MODE_LABEL[r.mode] || r.mode}${r.scope === 'generator' ? ' (generator only — manual picker still allows it)' : ''}`, type: 'restrict' });
  for (const f of dr.residentFlagOverrides || []) out.push({ label: `${f.fullBlockDays.map(d=>DOW[d]).join('/')} (when ${f.flag})`, rule: 'No shifts', type: 'block' });
  for (const c of dr.computedDayRules || []) {
    if (c.type === 'wellnessWednesday') {
      out.push({ label: `${ORDINAL_WORD[c.ordinal] || `${c.ordinal}th`} Wed of block`, rule: 'No day/eve shifts (night OK) — Wellness Wednesday', type: 'restrict' });
    } else {
      out.push({ label: COMPUTED_RULE_LABEL[c.type] || c.type, rule: 'No shifts', type: 'block' });
    }
  }
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
    let effText = '';
    if (g.activeWhen?.blockStartBefore) effText = ` (blocks starting before ${g.activeWhen.blockStartBefore})`;
    else if (g.activeWhen?.blockStartOnOrAfter) effText = ` (blocks starting ${g.activeWhen.blockStartOnOrAfter} or later)`;
    out.push({ ids: ids.length ? ids : ['ALL'], note: `${shiftLabel}${scope ? ' ' + scope : ''}${dayText}${effText}.${g.overrideImmune ? ' (applies even over a rotation-specific matrix override)' : ''}${g.scope === 'generator' ? ' (generator only — manual picker still allows it)' : ''}` });
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
// parseDate/addDays/toDateStr/getBlockDates/getBlockWeekends/getAcademicYearFor/
// getAcademicYear/formatAY now live in lib/dates.js (imported above).

function uuid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function eligKey(r) { return `${r.category}_${r.pgy}`; }

// Shared start-date handler: auto-fills the end date to the configured block length and
// (re)derives the academic year from the selected date — used by both Home and Settings.
function applyStartDate(updateBlock, appSettings, s) {
  const len = (appSettings?.defaultBlockLength ?? 28) - 1;
  updateBlock(b => {
    // Auto-derive AY from the date, but only while it still matches what auto-derivation
    // would have set for the block's previous start date (or is unset) — once a chief types
    // a custom AY it no longer matches that, so it's left alone on later start-date edits.
    const ayIsAutoDerived = !b.academicYear || (b.startDate && b.academicYear === getAcademicYearFor(b.startDate));
    return {
      ...b,
      startDate: s,
      endDate: s ? toDateStr(addDays(parseDate(s), len)) : b.endDate,
      academicYear: s && ayIsAutoDerived ? getAcademicYearFor(s) : b.academicYear,
    };
  });
}

// Pads and chunks a block's date range into Sunday-start week rows for the calendar sub-view —
// one continuous grid for the whole block rather than calendar-month pagination, since blocks
// are a fixed ~28 days and routinely span two calendar months.
function buildWeekRows(dates) {
  if (!dates.length) return [];
  const pad = parseDate(dates[0]).getDay();
  const padded = [...Array(pad).fill(null), ...dates];
  while (padded.length % 7 !== 0) padded.push(null);
  const rows = [];
  for (let i = 0; i < padded.length; i += 7) rows.push(padded.slice(i, i + 7));
  return rows;
}

function prettyDate(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

function formatDisplayDate(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${DOW[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`;
}

// ─── ROSTER IMPORT ─────────────────────────────────────────────────────────────
// CATEGORY_SYNONYMS/normalizeToken/matchCategory/splitCsvLine/splitName/parseRosterText/
// CATEGORIES/CAT_MAP now live in lib/parse.js (imported above).

// ─── MATRIX IMPORT (yearly Master Matrix Excel workbook) ──────────────────────
// Parses the chief's two-sheet workbook: "Home EM Residents" (a per-PGY grid of every
// EM-Home resident's rotation across the year's ~13 blocks) and "Off-Service Residents"
// (incoming rotators grouped by month, Name/Dept/Dates columns). Both sheets omit the
// year in date ranges (e.g. "7/27-8/23") — the two date parsers below use different
// strategies to infer it, because the two sheets have different structural quirks (see
// each function's comment). DATE_RANGE_RE/parseDateRangeInAY now live in lib/parse.js
// (imported above); parseSequentialDateRange stays here (Sheet 1 only, not reused elsewhere).

// Sheet 1's PGY sections read left-to-right as one continuous sequence of block windows,
// including a leading pre-orientation stub (e.g. "6/22-6/30") that sits chronologically
// BEFORE the AY's first July block — a plain month-cutoff rule would misdate that stub
// into the following June. Walking the row in order and only bumping the year when the
// start month actually goes backward avoids that trap entirely.
function parseSequentialDateRange(raw, cursor) {
  const m = DATE_RANGE_RE.exec(String(raw ?? ''));
  if (!m) return null;
  const sm = Number(m[1]), sd = Number(m[2]), em = Number(m[3]), ed = Number(m[4]);
  if (cursor.lastStartMonth != null && sm < cursor.lastStartMonth) cursor.year++;
  const startYear = cursor.year;
  const endYear = em < sm ? startYear + 1 : startYear; // range itself crosses the year turn
  cursor.lastStartMonth = sm;
  const pad = n => String(n).padStart(2, '0');
  return { start: `${startYear}-${pad(sm)}-${pad(sd)}`, end: `${endYear}-${pad(em)}-${pad(ed)}` };
}


// Reads the AY start year off the workbook's own title (e.g. "MASTER MATRIX 2026-2027");
// falls back to the app's current-AY calculation if the title doesn't match.
function parseAYStartYear(sheetRows) {
  const title = (sheetRows && sheetRows[0] && sheetRows[0][0]) || '';
  const m = /(\d{4})\s*-\s*\d{4}/.exec(title);
  if (m) return Number(m[1]);
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

// Same normalize-and-match approach as matchCategory, against BLOCK_TYPES_EM labels.
function matchBlockType(raw) {
  const n = normalizeToken(raw);
  if (!n) return null;
  for (const bt of BLOCK_TYPES_EM) if (normalizeToken(bt.label) === n) return bt.id;
  return null;
}

const PGY_SECTION_RE = /Resident\s*\(EM-?Home\s*PGY-?\s*(\d)\)/i;

// The date-range header row isn't always the section-header row itself (PGY-3's section in
// the real workbook has a stray "Block N" label row in between) — scan a few rows ahead for
// the first one with ≥2 recognizable date-range cells.
function findDateHeaderRow(sheetRows, fromIdx, maxLookahead = 5) {
  for (let i = fromIdx; i < Math.min(sheetRows.length, fromIdx + maxLookahead); i++) {
    const row = sheetRows[i] || [];
    let hits = 0;
    for (let c = 1; c < row.length; c++) if (DATE_RANGE_RE.test(row[c])) hits++;
    if (hits >= 2) return i;
  }
  return -1;
}

// A rotation id is a reliable PGY signal only if it appears in exactly one PGY's dropdown list
// (EM_HOME_BLOCK_TYPES_BY_PGY) — ids shared across PGYs (EM, EM_VAC, MICU, NICU...) say nothing.
function pgyExclusiveRotationIds() {
  const owner = {};
  for (const pgy of [1, 2, 3]) {
    for (const id of EM_HOME_BLOCK_TYPES_BY_PGY[pgy]) {
      owner[id] = owner[id] === undefined ? pgy : -1;
    }
  }
  return owner;
}

// Infers a resident group's PGY from which PGY's exclusive rotation ids its cells matched —
// used when the sheet groups residents into tracks with no PGY label at all (see
// parseHomeResidentMatrixGrouped). Returns null if no exclusive id was seen (ambiguous).
function inferGroupPgy(blockTypeIds) {
  const owner = pgyExclusiveRotationIds();
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const id of blockTypeIds) {
    const pgy = owner[id];
    if (pgy && pgy !== -1) counts[pgy]++;
  }
  let best = null, bestCount = 0;
  for (const pgy of [1, 2, 3]) if (counts[pgy] > bestCount) { best = pgy; bestCount = counts[pgy]; }
  return best;
}

// Fallback Home-sheet shape: no "Resident (EM-Home PGY-N)" markers — instead residents are
// grouped into blank-row-separated tracks (optionally preceded by a "Block N" label row and
// followed by a rotation-abbreviation legend, both ignored — neither has a comma in column 0 so
// neither is ever mistaken for a resident row), each track opening with its own "Resident" +
// date-range header row. Since no PGY is given, it's inferred per track via inferGroupPgy — the
// three tracks in a real 3-year program's export land on PGY-1/2/3 respectively because each
// year's rotation catalog contains ids exclusive to it (see EM_HOME_BLOCK_TYPES_BY_PGY).
function parseHomeResidentMatrixGrouped(sheetRows, ayStartYear) {
  const warnings = [];
  const residents = [];
  const groups = [];

  for (let i = 0; i < sheetRows.length; i++) {
    const cell0 = String((sheetRows[i] || [])[0] || '').trim();
    if (!/^resident\b/i.test(cell0)) continue;
    const headerRow = sheetRows[i];
    const cursor = { year: ayStartYear, lastStartMonth: null };
    const cols = [];
    for (let c = 1; c < headerRow.length; c++) {
      const range = parseSequentialDateRange(headerRow[c], cursor);
      if (range) cols.push({ colIdx: c, ...range });
    }
    if (!cols.length) continue;
    const rows = [];
    for (let r = i + 1; r < sheetRows.length; r++) {
      const row = sheetRows[r] || [];
      const nameCell = String(row[0] || '');
      if (!nameCell.includes(',')) break;
      const name = splitName(nameCell);
      if (!name) { warnings.push(`Couldn't parse resident name "${nameCell}" (row ${r + 1})`); continue; }
      rows.push({ ...name, raw: row });
    }
    groups.push({ cols, rows, headerRowIdx: i });
  }

  if (!groups.length) return { residents: [], blocks: [], warnings };

  const canonical = groups[0].cols;
  for (const g of groups.slice(1)) {
    const same = g.cols.length === canonical.length &&
      g.cols.every((c, idx) => c.start === canonical[idx].start && c.end === canonical[idx].end);
    if (!same) warnings.push(`A resident group's date columns (row ${g.headerRowIdx + 1}) don't match the first group's — using the first group's as canonical`);
  }

  for (const g of groups) {
    const ids = new Set();
    for (const row of g.rows) {
      for (const col of g.cols) {
        const raw = row.raw[col.colIdx];
        if (raw && String(raw).trim()) {
          const id = matchBlockType(raw);
          if (id) ids.add(id);
        }
      }
    }
    const inferred = inferGroupPgy(ids);
    g.pgy = inferred ?? 1;
    if (!inferred) warnings.push(`Couldn't determine PGY for the resident group at row ${g.headerRowIdx + 1} from its rotations — assumed PGY-1, verify on EM Residents tab`);
    residents.push(...g.rows.map(r => ({ firstName: r.firstName, lastName: r.lastName, category: 'EM_HOME', pgy: g.pgy })));
  }

  const blocks = [];
  for (const col of canonical) {
    const assignments = [];
    let anyRealAssignment = false;
    for (const g of groups) {
      const gCol = g.cols.find(c => c.start === col.start && c.end === col.end);
      if (!gCol) continue;
      for (const row of g.rows) {
        const raw = row.raw[gCol.colIdx];
        if (!raw || !String(raw).trim()) continue;
        const blockTypeId = matchBlockType(raw);
        if (blockTypeId) {
          assignments.push({ firstName: row.firstName, lastName: row.lastName, pgy: g.pgy, blockTypeId });
          anyRealAssignment = true;
        } else if (!/orientation|transition/i.test(raw)) {
          warnings.push(`Unrecognized rotation "${raw}" for ${row.firstName} ${row.lastName} (${col.start}–${col.end}) — left unassigned`);
        }
      }
    }
    if (anyRealAssignment) blocks.push({ start: col.start, end: col.end, assignments });
  }

  return { residents, blocks, warnings };
}

// Parses the "Home EM Residents" sheet into per-block EM-Home rotation assignments.
// Returns { residents: [{firstName,lastName,category:'EM_HOME',pgy}],
//           blocks: [{start,end, assignments:[{firstName,lastName,pgy,blockTypeId}]}],
//           warnings: string[] }.
function parseHomeResidentMatrix(sheetRows, ayStartYear) {
  const warnings = [];
  const residents = [];
  const sections = [];

  for (let i = 0; i < sheetRows.length; i++) {
    const cell0 = String((sheetRows[i] || [])[0] || '');
    const m = PGY_SECTION_RE.exec(cell0);
    if (!m) continue;
    const pgy = Number(m[1]);
    const headerRowIdx = findDateHeaderRow(sheetRows, i);
    if (headerRowIdx < 0) { warnings.push(`Couldn't find a date-range header row for PGY-${pgy} section (row ${i + 1})`); continue; }
    const headerRow = sheetRows[headerRowIdx];
    const cursor = { year: ayStartYear, lastStartMonth: null };
    const cols = [];
    for (let c = 1; c < headerRow.length; c++) {
      const range = parseSequentialDateRange(headerRow[c], cursor);
      if (range) cols.push({ colIdx: c, ...range });
    }
    const rows = [];
    // Resident rows are "Last, First" — stop at the first row that isn't (blank row,
    // stray artifact row, or the next section) rather than assuming a fixed row count.
    for (let r = headerRowIdx + 1; r < sheetRows.length; r++) {
      const row = sheetRows[r] || [];
      const nameCell = String(row[0] || '');
      if (!nameCell.includes(',')) break;
      const name = splitName(nameCell);
      if (!name) { warnings.push(`Couldn't parse resident name "${nameCell}" (PGY-${pgy} section, row ${r + 1})`); continue; }
      rows.push({ ...name, raw: row });
    }
    sections.push({ pgy, cols, rows });
    residents.push(...rows.map(r => ({ firstName: r.firstName, lastName: r.lastName, category: 'EM_HOME', pgy })));
  }

  if (!sections.length) {
    // Some chief exports drop the "Resident (EM-Home PGY-N)" section markers entirely and
    // instead group residents into blank-row-separated tracks with no PGY label at all —
    // fall back to that shape before giving up.
    const grouped = parseHomeResidentMatrixGrouped(sheetRows, ayStartYear);
    if (grouped.blocks.length) return grouped;
    warnings.push('No "Resident (EM-Home PGY-N)" sections found — is this the right sheet?');
    return { residents: [], blocks: [], warnings };
  }

  // Sections are expected to share the same date-range grid; a mismatch is warned about
  // (not fatal) and the first section's columns win as canonical.
  const canonical = sections[0].cols;
  for (const sec of sections.slice(1)) {
    const same = sec.cols.length === canonical.length &&
      sec.cols.every((c, idx) => c.start === canonical[idx].start && c.end === canonical[idx].end);
    if (!same) warnings.push(`PGY-${sec.pgy} section's date columns don't match the PGY-${sections[0].pgy} section's — using PGY-${sections[0].pgy}'s as canonical`);
  }

  const blocks = [];
  for (const col of canonical) {
    const assignments = [];
    let anyRealAssignment = false;
    for (const sec of sections) {
      const secCol = sec.cols.find(c => c.start === col.start && c.end === col.end);
      if (!secCol) continue;
      for (const row of sec.rows) {
        const raw = row.raw[secCol.colIdx];
        if (!raw || !String(raw).trim()) continue;
        const blockTypeId = matchBlockType(raw);
        if (blockTypeId) {
          assignments.push({ firstName: row.firstName, lastName: row.lastName, pgy: sec.pgy, blockTypeId });
          anyRealAssignment = true;
        } else if (!/orientation|transition/i.test(raw)) {
          warnings.push(`Unrecognized rotation "${raw}" for ${row.firstName} ${row.lastName} (${col.start}–${col.end}) — left unassigned`);
        }
      }
    }
    // A column with no real (non-Orientation/Transition) assignment anywhere is a stub
    // buffer period, not an actual scheduling block — excluded from the result entirely.
    if (anyRealAssignment) blocks.push({ start: col.start, end: col.end, assignments });
  }

  return { residents, blocks, warnings };
}

// Parses the "Off-Service Residents" sheet — Name/Dept/Dates triples repeated across three
// month-grouped column tracks whose exact column offsets drift a bit (merged-cell export
// artifacts). Rather than hardcode track positions, this scans for the one unambiguous
// anchor (a date-range-shaped cell) and reads Dept/Name from its immediate left neighbors,
// which stay adjacent regardless of which track or absolute column they land in.
// Returns { rows: [{firstName,lastName,category,pgy,start,end}], warnings: string[] }.
function parseOffServiceSheet(sheetRows, ayStartYear) {
  const warnings = [];
  const rows = [];
  let skippedNoName = 0;
  for (let r = 0; r < sheetRows.length; r++) {
    const row = sheetRows[r] || [];
    for (let c = 2; c < row.length; c++) {
      if (!DATE_RANGE_RE.test(row[c])) continue;
      const deptRaw = row[c - 1];
      const nameRaw = String(row[c - 2] || '').replace(/\*+\s*$/, '').trim(); // trailing "*" footnote marker
      if (!nameRaw) { skippedNoName++; continue; } // placeholder slot, no resident assigned yet
      const category = matchCategory(deptRaw);
      if (!category) { warnings.push(`Row ${r + 1}: unrecognized department "${deptRaw}" for "${nameRaw}" — skipped`); continue; }
      const name = splitName(nameRaw);
      if (!name) { warnings.push(`Row ${r + 1}: couldn't parse name "${nameRaw}" — skipped`); continue; }
      const range = parseDateRangeInAY(row[c], ayStartYear);
      const pgyOptions = CAT_MAP[category].pgyOptions;
      let pgy = pgyOptions[0];
      // FM_1/FM_3 eligibility is completely different (PED-N-FM-only vs POD-default) — the sheet
      // gives no PGY, so this is a genuine guess that must be flagged, not silently assumed.
      if (category === 'FM' && pgyOptions.length > 1) {
        pgy = 1;
        warnings.push(`PGY assumed 1 for ${name.firstName} ${name.lastName} (FM) — verify on the Off-Service tab if actually PGY-3`);
      }
      rows.push({ firstName: name.firstName, lastName: name.lastName, category, pgy, start: range.start, end: range.end });
    }
  }
  if (skippedNoName > 0) warnings.push(`${skippedNoName} placeholder row(s) with no resident name skipped`);
  return { rows, warnings };
}

// ─── REST-PERIOD UTILITIES ────────────────────────────────────────────────────
// shiftStartMs/shiftEndMs now live in lib/shifts.js (imported above).

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

// ─── ACGME 80-HOUR ROLLING 4-WEEK AVERAGE ──────────────────────────────────
// ACGME duty-hour rule: average ≤80h/week, averaged over any 4-week (28-day) window — not a
// hard per-week cap. For every assigned date, treat it as a candidate 28-day window start and
// sum durationH for every assignment landing in [windowStart, windowStart + 28d); the worst
// (max) such window sum is what matters. Pure function — only reads SHIFT_TIMING/parseDate,
// both already module-scoped above.
function weeklyHourStats(rs) {
  const timed = Object.entries(rs)
    .filter(([, sid]) => sid && SHIFT_TIMING[sid])
    .map(([ds, sid]) => ({ dateMs: parseDate(ds).getTime(), durationH: SHIFT_TIMING[sid].durationH }));
  if (!timed.length) return { maxWindowTotalH: 0, maxWeeklyAvg: 0 };

  const WINDOW_MS = 28 * 24 * 60 * 60 * 1000;
  let maxWindowTotalH = 0;
  for (const start of timed) {
    const windowEndMs = start.dateMs + WINDOW_MS;
    let total = 0;
    for (const a of timed) {
      if (a.dateMs >= start.dateMs && a.dateMs < windowEndMs) total += a.durationH;
    }
    if (total > maxWindowTotalH) maxWindowTotalH = total;
  }
  return { maxWindowTotalH, maxWeeklyAvg: maxWindowTotalH / 4 };
}

// ─── CIRCADIAN SCHEDULING RULES ────────────────────────────────────────────
// The rest-period check above only enforces "enough hours off equal to the prior shift's
// length" — a legal-rest check, not a circadian one. Two schedules can both pass that check
// while one is much harder on a resident's body clock (e.g. one isolated night shift, then a
// day shift a few days later with no gradual transition). These rules add: night shifts should
// cluster into a single run per block (4-6 nights, ideally 6), runs cap at 6, at least 24h off
// before returning to a day shift after a night run, and an evening shift can never be
// immediately followed by a day shift the next day (or vice versa) — only a night shift or
// another evening/day shift after a rest gap.
export const NIGHT_RULES = { minRun: 4, idealRun: 6, maxRun: 6, postNightDayRestH: 24, maxPerBlock: 6 };
// Grand Rounds start hour, used to compute rest gap between a night shift's end and GR the
// following morning for the postNightRest soft rule (GR itself is never a schedule entry).
const GR_START_HOUR = 8;
// ─── GENERATOR SCORE WEIGHTS ────────────────────────────────────────────────
// Every weight used by generateSchedule's score() lives here rather than as inline literals, so
// the relative magnitudes are auditable in one place and a new term can't be added without
// declaring which tier it belongs to. Exported for src/lib/scoreWeights.test.js, which asserts the
// tier invariant below — that test is the whole point of centralizing these.
//
// TIERS (this is the load-bearing distinction, not decoration):
//   STRUCTURAL — changes whether a schedule is acceptable, not merely nicer: hitting shift target,
//     night-run shape, jeopardy avoidance, seniority composition, rotation-mix minimums, streak
//     trimming, not pairing two interns. These are ALLOWED to outrank each other by design (e.g.
//     jeopardy avoidance at 50 deliberately beats half the deficit range) — the generator has
//     always traded these off against one another and that behavior is intentional.
//   PREFERENCE — pure tie-breaks expressing "nicer if possible" with no correctness content:
//     day-of-week pairings, yearly load balancing, area nudges, BAMC/tox steering.
//
// MEASURED FINDING (Phase 0 audit — do not silently "fix" this without re-measuring):
// The preference bands below EXCEED one shift's worth of `deficit`. deficit is
// (target-assigned)/target, so one shift is worth deficitWeight/target — at the largest target
// (20, EM_HOME_1) that is 5.0 points. The three preference groups band at 22 / 40 / 27 points, so
// on paper a pure day-of-week or area preference can outrank being 4-8 shifts further from target.
// The smallest structural weight (15) also sits BELOW the largest preference band (40).
//
// That arithmetic inversion is real. It does NOT, however, produce unfair target distribution in
// practice, and this was measured rather than assumed: rescaling every preference weight down by
// ~6x (so all three groups fit under 5.0) was A/B'd over 6 seeds x 3 fixtures and moved
// `deficitSpread` not at all (.0623->.0640, .1073->.1073, .1008->.1020) while making coverageMiss
// slightly worse. The rescale was therefore NOT adopted.
//
// The reason the inversion is inert: candidatePool's `allAtTarget` filter already restricts the
// optional fill phase to residents still under their own target, so score() is never in a position
// to push someone past target on preference. Target fairness is enforced UPSTREAM of score(), not
// by score()'s weights. If that filter is ever loosened, this inversion becomes live and the
// rescale should be revisited — that is precisely why the numbers are recorded here.
//
// What the test file guards is therefore a RATCHET, not the ideal: the bands may not grow beyond
// what is recorded today. A new term must be classified into a tier, and cannot widen the sum.
const SCORE_WEIGHTS = {
  // ── STRUCTURAL ──
  deficit: 100,             // distance from the resident's own shift target — the primary driver
  nightCluster: 40,         // circadian night-run shaping (extend a run / don't strand a short one)
  jeopardy: 50,            // avoid a jeopardy-call date under 'warn' policy
  mixShare: 20,             // day/eve/night variety within a resident's own assignments
  streakOver3: 15,          // trim consecutive-workday runs past 3
  traumaDaySenior: 30,      // PGY-2/3 should aim for trauma NIGHTS, days only if necessary
  pedsMixNeedsMore: 25,     // Peds/EM PGY-2 must reach PEDS_EM_MIX.min before other rotations sap slots
  fm1OnPeds: 15,            // FM-1s default to POD; peds is fill-in PRN only
  fm1OverPedsCap: 20,       // ...and harder once past the soft ~1/3-of-target peds ceiling
  seniorAdj: 20,            // FLEX/POD senior composition boost / second-senior discourage
  jcNearCap: 20,            // steer off a resident's 3rd (final) journal club this AY
  weekendOffRisk: 18,       // don't spend a resident's last remaining free weekend
  secondIntern: 35,         // no two EM interns on the same shift/team
  pedNPgy1Deprioritize: 25, // PED-N (the EM Home-only id, post-split): prefer PGY-2/3 over PGY-1

  // ── PREFERENCE ── (see PREFERENCE_KEYS / the invariant test)
  traumaNightDowPref: 12,  // TRAUMA-N: PGY-2 on Fri/Sat, PGY-3 on Sun/Mon
  traumaNightBalance: 2,  // ...mildly favor the senior with fewer trauma nights this AY (count clamped at 5)
  generalPedsNudge: 10,    // non-peds-rotation PGY-2/3 should pick up a few peds shifts a block
  pedsClassRepeat: 10,     // avoid stacking the same PGY class on consecutive peds days
  bamcFlexPodPedsDay: 6,  // BAMC interns prefer Flex/POD/Peds DAY shifts
  bamcWedBonus: 6,        // ...especially Wednesday
  podPgy1SecondSlot: 15,   // POD's 2nd/3rd slot prefers an EM intern once a PGY-3 is present
  toxPedsEvePref: 8,      // EM_TOX residents ideally land on Peds Evening specifically

  // ── PREFERENCE (always-on) ── Phase 1 work-shape steering. Unlike every preference above,
  // these can fire on ANY shift, so they stack with whichever shift-specific group applies and
  // are banded separately (PREFERENCE_ALWAYS). Kept small for exactly that reason: they are paid
  // on every slot in the block, so a large weight here would swamp the shift-specific tuning the
  // chief has already dialled in. The matching retrospective metric is workShapePenalty in
  // lib/scheduleQuality.js — this term steers the greedy fill, that one scores the result.
  workContinuity: 3,      // prefer extending an existing worked run over creating a scattered single
  areaContinuity: 1.5,    // ...and prefer staying in the same shift AREA across consecutive days
  offAdjacency: 2,        // avoid working the day immediately before/after vacation or approved time off
};

// Preference terms grouped by which shifts they can actually fire on. Terms in DIFFERENT groups
// are mutually exclusive for any single scored slot — TRAUMA-N is not a PED shift, PED is not POD —
// so summing all of them would assert against a state that cannot occur and would force the
// weights uselessly small. `bamc` terms fire on FLEX/POD/PED day shifts, so they're counted in
// both the PED and POD groups. The invariant is checked per group, and the worst group wins.
const PREFERENCE_GROUPS = {
  traumaNight: ['traumaNightDowPref', 'traumaNightBalance'],
  peds: ['generalPedsNudge', 'pedsClassRepeat', 'toxPedsEvePref', 'bamcFlexPodPedsDay', 'bamcWedBonus'],
  pod: ['podPgy1SecondSlot', 'bamcFlexPodPedsDay', 'bamcWedBonus'],
};

// Preference terms that can fire on ANY shift, so they stack on top of whichever group above
// applies instead of being mutually exclusive with it. Banded and ratcheted separately — folding
// them into each group would have forced the recorded per-shift ceilings upward and destroyed the
// ratchet's meaning on its first use.
const PREFERENCE_ALWAYS = ['workContinuity', 'areaContinuity', 'offAdjacency'];

// Worst-case input multiplier per preference term. Most are 0/1 booleans; traumaNightBalance's
// count is explicitly clamped to 5 inside score(), and areaContinuity can fire for BOTH the
// previous and next adjacent day (max 2).
const PREFERENCE_MAX_INPUT = { traumaNightBalance: 5, areaContinuity: 2 };

// Largest shift target in the app — the BINDING case for the invariant, because a bigger target
// makes each individual shift worth FEWER deficit points (deficit is a ratio), leaving the least
// headroom above the preference band. Derived from the real constants rather than hardcoded so
// adding a larger target can't silently invalidate the invariant. Both source maps are declared
// far above this point, so there's no temporal-dead-zone hazard here (see CLAUDE.md).
const MAX_SHIFT_TARGET = Math.max(...Object.values(SHIFT_TARGETS), ...Object.values(BLOCK_TARGETS));

// Recorded band ceilings as measured by the Phase 0 audit. These are a RATCHET: the test asserts
// each group's band stays at or below its recorded value, so a newly-added preference term (or a
// bumped weight) cannot quietly widen the sum further. They are deliberately NOT the ideal values —
// see the MEASURED FINDING note above for why the ideal was measured, rejected, and recorded.
// `always` covers PREFERENCE_ALWAYS (3 + 1.5*2 + 2 = 8). The three shift-specific ceilings are
// unchanged from the Phase 0 audit on purpose — Phase 1 added its steering in a separately-banded
// bucket rather than widening them.
const PREFERENCE_BAND_CEILING = { traumaNight: 22, peds: 40, pod: 27, always: 8 };

export const SCORE_TIERS = {
  SCORE_WEIGHTS, PREFERENCE_GROUPS, PREFERENCE_ALWAYS, PREFERENCE_MAX_INPUT, MAX_SHIFT_TARGET,
  PREFERENCE_BAND_CEILING,
};

// ─── SOFT RULE PRIORITY ─────────────────────────────────────────────────────
// A small, ranked set of soft rules the generator breaks in reverse-priority order when it can't
// satisfy all of them for a slot. Keep this list short and deliberate — it's not a general rules
// engine, just the conflict-resolution order for the three rules that can genuinely trade off
// against each other during min-coverage fill.
const SOFT_RULES = [
  { id: 'coverageMin', label: 'Minimum shift coverage', description: 'Fill every shift to its configured minimum staffing.' },
  { id: 'seniorComposition', label: 'FLEX/POD senior composition', description: 'Staff the senior PGY (primary, fallback the other) on every FLEX/POD shift.' },
  // blocksExport: this rule's warnings are safety-relevant enough to gate CSV/QGenda/PDF export
  // (see issueCounts.restWarns/requestExport) even though it's only 'warn' level — a property of
  // the rule itself, not a fact re-derived at each export-gate call site.
  { id: 'postNightRest', label: '24h off after nights', description: 'Prefer ≥24h off before a day shift or Grand Rounds following a night shift.', blocksExport: true },
];
export const DEFAULT_RULE_PRIORITY = SOFT_RULES.map(r => r.id);
const EXPORT_BLOCKING_RULE_IDS = new Set(SOFT_RULES.filter(r => r.blocksExport).map(r => r.id));
// Accepts an untrusted persisted value (old backup, hand-edited storage) and returns a valid,
// complete ordering: unknown ids dropped, missing ids appended in default order.
export function normalizeRulePriority(arr) {
  const ids = new Set(SOFT_RULES.map(r => r.id));
  // Dedup while filtering: a corrupted/hand-edited backup (untrusted shape, per this repo's
  // persistence convention) could repeat an id, which would otherwise survive into `cleaned` and
  // produce an array longer than SOFT_RULES with a duplicate React key on the Rules tab.
  const seen = new Set();
  const cleaned = [];
  for (const id of (Array.isArray(arr) ? arr : [])) {
    if (ids.has(id) && !seen.has(id)) { seen.add(id); cleaned.push(id); }
  }
  const missing = DEFAULT_RULE_PRIORITY.filter(id => !cleaned.includes(id));
  return [...cleaned, ...missing];
}
function ruleRank(appSettings, id) { return normalizeRulePriority(appSettings?.rulePriority).indexOf(id); }
// isNightShiftId now lives in lib/shifts.js (imported above).
// Residents whose entire effective eligibility is night-only (today: FM-3/PED-N-FM) are exempt from
// the block-wide night cap and the short-night-run warning — for FM-3 specifically, the Mon/Tue/
// Wed-only day-rule already makes runs of 4+ structurally impossible, so those checks would be
// pure noise for them.
export function isNightOnlyResident(resident, eligOverrides = {}) {
  const { list } = getEffectiveEligibility(resident, eligOverrides);
  return list.length > 0 && list.every(isNightShiftId);
}
// Length of the consecutive-night run adjacent to dateStr in the given direction (-1 = ending the
// day before dateStr, +1 = starting the day after) — 0 if that adjacent day wasn't a night shift.
// Capped at 14 as a sanity bound — a real run should never approach that.
function nightRun(rs, dateStr, dir) {
  let n = 0, d = addDays(parseDate(dateStr), dir);
  for (let i = 0; i < 14 && isNightShiftId(rs[toDateStr(d)]); i++) { n++; d = addDays(d, dir); }
  return n;
}
function nightRunBefore(rs, dateStr) { return nightRun(rs, dateStr, -1); }
// Mirror of nightRunBefore, looking forward from the day after dateStr — used so the generator
// can avoid stranding a short run when deciding what to place on an adjacent day.
function nightRunAfter(rs, dateStr) { return nightRun(rs, dateStr, 1); }
function countNightsInSchedule(rs) { return Object.values(rs).filter(isNightShiftId).length; }
// Number of separate consecutive-night runs currently in a resident's schedule (any shift-type
// mix of night ids counts as one run, same as nightRun above) — used by score()'s night-run
// clustering term to discourage a resident picking up a 2nd/3rd disconnected night stint instead
// of extending their one existing run. Date-order-independent (sorts keys), so it stays correct
// across generateSchedule's multi-pass fill order (TRAUMA-D / optional passes revisit dates
// out of pure chronological order relative to when a given ds is scored).
function nightRunSegments(rs) {
  const nightDates = Object.keys(rs).filter(ds => isNightShiftId(rs[ds])).sort();
  const segments = [];
  let prevDs = null;
  for (const ds of nightDates) {
    const contiguous = prevDs && toDateStr(addDays(parseDate(prevDs), 1)) === ds;
    if (contiguous) segments[segments.length - 1]++;
    else segments.push(1);
    prevDs = ds;
  }
  return segments;
}
// Hours between the end of a night shift on dateStr and Grand Rounds (GR_START_HOUR) on the
// resident's next GR weekday, checked up to 2 days out — or null if no GR falls in that window.
// GR is never a schedule entry, so this is the only way the postNightRest soft rule can see it.
function grRestGapH(resident, dateStr, nightShiftId) {
  const g = grWorkDow(resident);
  if (g == null) return null;
  for (let offset = 1; offset <= 2; offset++) {
    const d = addDays(parseDate(dateStr), offset);
    if (d.getDay() !== g) continue;
    const grStartMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), GR_START_HOUR, 0, 0).getTime();
    return (grStartMs - shiftEndMs(nightShiftId, dateStr)) / 3_600_000;
  }
  return null;
}
// Shared by checkCircadianViolations (real-time, placing nightShiftId) and validateAll
// (retrospective, over an already-complete schedule) so the GR-gap message/threshold can't
// drift between the two call sites the way two independently-maintained copies would.
function grRestViolation(resident, dateStr, nightShiftId) {
  const grGapH = grRestGapH(resident, dateStr, nightShiftId);
  if (grGapH == null || grGapH >= NIGHT_RULES.postNightDayRestH) return null;
  return { message: `Only ${grGapH}h off before Grand Rounds after this night shift — prefer ${NIGHT_RULES.postNightDayRestH}h`, level: 'warn', rule: 'postNightRest', gapH: grGapH };
}

// Evaluates placing newShiftId on dateStr against a resident's existing schedule rs (schedule
// shape: {dateStr: shiftId}). Returns [{message, level, rule?}] — used by both the generator
// (hard filter on 'error'-level results, soft-ranked handling of rule:'postNightRest' warnings)
// and validateAll/the picker (surfaced as-is).
function checkCircadianViolations(resident, dateStr, newShiftId, rs, { nightOnly = false } = {}) {
  const violations = [];
  const newType = SHIFT_MAP[newShiftId]?.type;
  if (!newType) return violations;

  if (newType === 'night') {
    const runBefore = nightRunBefore(rs, dateStr);
    const runAfter = nightRunAfter(rs, dateStr);
    const totalRun = runBefore + 1 + runAfter;
    if (totalRun > NIGHT_RULES.maxRun)
      violations.push({ message: `${totalRun} consecutive night shifts — max is ${NIGHT_RULES.maxRun}`, level: 'error' });
    if (!nightOnly) {
      const totalNights = countNightsInSchedule(rs) + 1;
      if (totalNights > NIGHT_RULES.maxPerBlock)
        violations.push({ message: `${totalNights} night shifts this block — max is ${NIGHT_RULES.maxPerBlock}`, level: 'warn' });
    }
    // Mirror of the 'day' branch below, but looking forward — a fill pass can place this night
    // shift AFTER a day shift already sits on dateStr+1/+2 (e.g. the generator's optional pass
    // runs after TRAUMA-D is already filled), so the 24h rest preference must be checked in both
    // directions, not just backward from an incoming day shift. Soft rule (rank: postNightRest) —
    // the generator only breaks it when higher-ranked rules would otherwise go unmet.
    for (let offset = 1; offset <= 2; offset++) {
      const checkDs = toDateStr(addDays(parseDate(dateStr), offset));
      const laterSid = rs[checkDs];
      if (!laterSid || SHIFT_MAP[laterSid]?.type !== 'day') continue;
      const gapH = (shiftStartMs(laterSid, checkDs) - shiftEndMs(newShiftId, dateStr)) / 3_600_000;
      if (gapH < NIGHT_RULES.postNightDayRestH)
        violations.push({ message: `Only ${gapH}h off before the day shift already scheduled after this night shift — prefer ${NIGHT_RULES.postNightDayRestH}h`, level: 'warn', rule: 'postNightRest', gapH });
      break; // only the soonest day shift after matters for this check
    }
    // Grand Rounds the following morning counts against the same soft rule — GR isn't a schedule
    // entry, so it's checked separately via grRestViolation rather than scanning rs.
    const grViolation = grRestViolation(resident, dateStr, newShiftId);
    if (grViolation) violations.push(grViolation);
  }

  if (newType === 'day' || newType === 'eve') {
    // Look back up to 2 days for the most recent night shift and check the 24h rest preference
    // before resuming a day OR evening shift. Extended to 'eve' because PED-N now ends 04:00
    // (retimed off the old 19:00-08:00 EM/FM shared shift) instead of 08:00 — a night shift
    // ending 04:00 followed by an evening shift starting ~14:00-15:00 the next day is only
    // 10-11h off, which clears checkRestViolations' plain gapH >= et.durationH hard check (an
    // eve shift only requires ~9h rest) but is nowhere near the 24h post-night preference, and
    // nothing else in this function caught a night->eve pair before this fix. Soft rule
    // (rank: postNightRest) — same as the day case, not a new hard error.
    for (let offset = 1; offset <= 2; offset++) {
      const checkDs = toDateStr(addDays(parseDate(dateStr), -offset));
      const priorSid = rs[checkDs];
      if (!priorSid || !isNightShiftId(priorSid)) continue;
      const gapH = (shiftStartMs(newShiftId, dateStr) - shiftEndMs(priorSid, checkDs)) / 3_600_000;
      if (gapH < NIGHT_RULES.postNightDayRestH)
        violations.push({ message: `Only ${gapH}h off after night shifts before this ${newType === 'eve' ? 'evening' : 'day'} shift — prefer ${NIGHT_RULES.postNightDayRestH}h`, level: 'warn', rule: 'postNightRest', gapH });
      break; // only the most recent night shift matters for this check
    }
  }

  // Evening → day the very next day (and the reverse) is disallowed even when a hard rest-hour
  // check would clear it — an abrupt turnaround with no gradual transition.
  if (newType === 'eve') {
    const nextSid = rs[toDateStr(addDays(parseDate(dateStr), 1))];
    if (SHIFT_MAP[nextSid]?.type === 'day')
      violations.push({ message: 'Evening shift immediately followed by a day shift the next day', level: 'error' });
  }
  if (newType === 'day') {
    const prevSid = rs[toDateStr(addDays(parseDate(dateStr), -1))];
    if (SHIFT_MAP[prevSid]?.type === 'eve')
      violations.push({ message: 'Day shift immediately follows an evening shift the day before', level: 'error' });
  }

  return violations;
}

// Shared by validateAll (post-hoc warning) and generateSchedule (forward-looking exclusion) so
// the two never silently diverge on who the trauma cap applies to. PGY-2 AND PGY-3 both aim for
// only 1-2 trauma shifts/block during EM rotations (nights preferred, days only if necessary).
function isTraumaCapSubject(resident) { return resident.category === 'EM_HOME' && (resident.pgy === 2 || resident.pgy === 3); }
// Trauma-night PGY-by-weekday preference (chief feedback): prefer PGY-2 on Fri/Sat, PGY-3 on
// Sun/Mon — a soft generator nudge, not a hard restriction (trauma_n_window already allows any
// PGY-2/3 on any of the four nights; this only breaks ties toward the preferred pairing).
function traumaNightPgyPrefersDow(pgy, dow) {
  return (pgy === 2 && (dow === 5 || dow === 6)) || (pgy === 3 && (dow === 0 || dow === 1));
}
// Yearly trauma-night count across PUBLISHED saved blocks (same excludeBlockId/AY-match pattern
// as countPublishedJC) — used only to nudge the generator toward balancing trauma-night load
// between PGY-2/3 across the academic year, not as a hard cap.
function countPublishedTraumaNights(residentId, ay, blocksHistory = [], excludeBlockId = null) {
  let count = 0;
  for (const snap of blocksHistory) {
    if (!snap?.published || snap.id === excludeBlockId) continue;
    if ((snap.academicYear || snap.data?.academicYear) !== ay) continue;
    const rs = snap.data?.schedule?.[residentId];
    if (!rs) continue;
    count += Object.values(rs).filter(s => s === 'TRAUMA-N').length;
  }
  return count;
}
// emTraumaCap replaces the old pgy2TraumaCap setting; legacy saved values are still honored so
// existing localStorage isn't silently reinterpreted until the chief touches the Settings field.
function getTraumaCap(appSettings = {}) { return appSettings.emTraumaCap ?? appSettings.pgy2TraumaCap ?? 2; }
// PGY-2/3 EM Home residents NOT already on a dedicated peds-mix rotation (Peds/EM, Trauma/Peds,
// Peds/Trauma — those have their own protected peds sub-targets) should still pick up a small
// number of peds shifts per block to fill gaps — chief feedback: "a few" (~2-3), not an emphasis.
// Configurable in Settings; a soft generator nudge only, never a requirement.
function getGeneralPedsTarget(appSettings = {}) { return appSettings.generalPedsMonthlyTarget ?? 2; }
function isGeneralPedsCandidate(resident, traumaBlocks) {
  return isTraumaCapSubject(resident) && !isPedsEmMix(resident) && !isTraumaPedsSplitResident(resident, traumaBlocks);
}
// EM interns: Home or BAMC PGY-1. Named predicate so the no-two-interns rule's generator score
// term and validateAll warning define "intern" identically (used at three call sites).
function isEmIntern(resident) { return (resident.category === 'EM_HOME' || resident.category === 'EM_BAMC') && resident.pgy === 1; }
// Soft ceiling on FM-1 peds shifts — peds is fill-in PRN only, not the emphasis (chief feedback):
// ~1/3 of their shift target. Centralized so the generator's score() discouragement and
// validateAll's warning can't drift on the divisor. Null target → no ceiling.
function getFm1PedsCap(target) { return target != null ? Math.ceil(target / 3) : null; }
// EM Home and EM BAMC residents default to the 'EM' rotation when no blockType is on file —
// this matches how EM Home residents already default (see the roster creation sites) and fixes
// EM_BAMC residents added via the Off-Service tab, which never assigns them a blockType at all.
function isSchedulable(resident) {
  if (resident.category === 'EM_HOME' || resident.category === 'EM_BAMC') {
    const bt = BLOCK_TYPE_MAP[resident.blockType || 'EM'];
    return bt ? bt.schedulable : false;
  }
  return true;
}

// ─── 6-consecutive-work-day rule (ACGME 1-in-7) ────────────────────────────
// grWorkDow identifies a resident's Grand Rounds weekday (EM Home = Wednesday, BAMC = Thursday)
// — used by GR-lecture validation, the post-night GR rest-gap check, and isStreakWorkDay below.
// Chief ruling (confirmed — a resident was once scheduled 8 days straight because a shift-less GR
// Wednesday counted as a day OFF, silently splitting one real 8-day obligation run into two
// "legal" <=6 runs): a day counts toward the streak if a shift is assigned that date, OR it's the
// resident's own GR weekday, OR it's a Journal Club presenting date (resident.jcPresentDates) —
// UNLESS the resident is on vacation or an approved day off that date, in which case it never
// counts even with an otherwise-obligated GR/JC date. `prevRs` (optional) is the resident's row
// from the immediately preceding saved block, so a shift there also counts — the walk needs to
// see across block boundaries, not just within the live block's own dates.
function grWorkDow(resident) {
  if (resident.category === 'EM_HOME') return 3;
  if (resident.category === 'EM_BAMC') return 4;
  return null;
}
// `bounds` (optional {min,max} date strings) caps how far the GR/JC/weekday fallback below is
// allowed to fabricate an obligation day with no actual schedule evidence — an assigned shift
// (rs[ds] or prevRs[ds]) always counts regardless of bounds, since that's real data, not
// inference. Without bounds, callers get the old unconditional behavior (every in-block caller
// already only ever asks about in-block dates, where the fallback is intentional per chief
// sign-off — see the comment block above grWorkDow).
function isStreakWorkDay(rs, resident, ds, prevRs = null, bounds = null) {
  if ((rs && rs[ds]) || (prevRs && prevRs[ds])) return true;
  if (!resident) return false;
  if ((resident.vacationDates || []).includes(ds) || (resident.approvedDatesOff || []).includes(ds)) return false;
  if (bounds && (ds < bounds.min || ds > bounds.max)) return false;
  if ((resident.jcPresentDates || []).includes(ds)) return true;
  const g = grWorkDow(resident);
  return g != null && parseDate(ds).getDay() === g;
}
const MAX_CONSECUTIVE_WORK_DAYS = 6;
// Length of the consecutive work-day run containing dateStr, assuming dateStr itself is worked.
// Walks both directions from dateStr; capped at 60 days each way as a sanity bound. `bounds` (see
// isStreakWorkDay) stops the walk from fabricating a GR/JC obligation day past either edge of what
// the app actually has evidence for — the block's own end date going forward, and (when no
// previous-block snapshot exists at all) the block's own start date going backward.
function runLengthIfWorked(rs, resident, dateStr, prevRs = null, bounds = null) {
  let len = 1;
  let d = addDays(parseDate(dateStr), -1);
  for (let i = 0; i < 60 && isStreakWorkDay(rs, resident, toDateStr(d), prevRs, bounds); i++) { len++; d = addDays(d, -1); }
  d = addDays(parseDate(dateStr), 1);
  for (let i = 0; i < 60 && isStreakWorkDay(rs, resident, toDateStr(d), prevRs, bounds); i++) { len++; d = addDays(d, 1); }
  return len;
}
// The {min,max} bounds a streak walk for this block should respect (see isStreakWorkDay) — max is
// always the block's own end date (there's no evidence for a day past it, since the next block may
// not exist yet); min is the 14-day lookback window ONLY when a previous-block snapshot was
// actually found (prevTail.__hasPrevBlock — see prevBlockTailSchedules), otherwise the block's own
// start date, so a GR/JC obligation is never fabricated for a week the app has zero record of.
function streakBounds(block, prevTail) {
  const hasPrevBlock = !!(prevTail && prevTail.__hasPrevBlock);
  return {
    min: hasPrevBlock ? toDateStr(addDays(parseDate(block.startDate), -14)) : block.startDate,
    max: block.endDate,
  };
}
// Finds the snapshot prevBlockTailSchedules should read from: prefers a published snapshot
// covering the day before block.startDate; falls back to the most recently saved one. Extracted
// so callers needing only "did a previous block exist at all" (e.g. streakBounds) don't have to
// duplicate this search.
function findPrevBlockSnapshot(block, blocksHistory = []) {
  if (!block?.startDate) return null;
  const dayBefore = toDateStr(addDays(parseDate(block.startDate), -1));
  const candidates = (blocksHistory || []).filter(snap => {
    if (!snap || snap.id === block.id) return false;
    const start = snap.startDate || snap.data?.startDate;
    const end = snap.endDate || snap.data?.endDate;
    return start && end && start <= dayBefore && dayBefore <= end;
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (!!a.published !== !!b.published) return a.published ? -1 : 1;
    return new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime();
  });
  return candidates[0];
}
// Tail (last 14 days before block.startDate) of the immediately-preceding saved block's schedule,
// per resident — lets the streak walk see across a block boundary (a resident who worked the tail
// of the prior block shouldn't get a fresh streak counter just because a new block started).
// Defensive against untrusted/partial snapshot shapes, same idiom as countPublishedJC. Returns {}
// when there's no block, no matching snapshot, or nothing to keep. The returned object also
// carries a non-enumerable `__hasPrevBlock` flag (see streakBounds) so callers can tell "no
// previous block was ever saved" apart from "one was saved but this resident had no shifts in its
// tail window" — both cases otherwise look identical (no entry for that resident's id).
function prevBlockTailSchedules(block, blocksHistory = []) {
  const result = {};
  if (!block?.startDate) return result;
  const snap = findPrevBlockSnapshot(block, blocksHistory);
  if (!snap) return result;
  Object.defineProperty(result, '__hasPrevBlock', { value: true, enumerable: false });
  const schedule = snap.data?.schedule || {};
  const windowStart = toDateStr(addDays(parseDate(block.startDate), -14));
  for (const [rid, rs] of Object.entries(schedule)) {
    if (!rs) continue;
    const tail = {};
    for (const [ds, sid] of Object.entries(rs)) {
      if (sid && ds >= windowStart && ds < block.startDate) tail[ds] = sid;
    }
    if (Object.keys(tail).length) result[rid] = tail;
  }
  return result;
}

// ─── Half-block Peds/Trauma split (TRAUMA_PEDS / PEDS_TRAUMA rotations) ────
// TRAUMA_PEDS does trauma during the first 14 days of the block, peds the last 14;
// PEDS_TRAUMA is the reverse. 0-based day index within the block:
function blockDayIndex(blockStart, dateStr) {
  return Math.round((parseDate(dateStr) - parseDate(blockStart)) / 86_400_000);
}
// Returns 'trauma' | 'peds' | null — which half-block window (if any) applies to this resident
// on this date. Only EM Home residents on a TRAUMA_BLOCKS rotation are subject to this split.
function traumaPedsHalf(resident, dateStr, blockStart, traumaBlocks) {
  if (!blockStart || resident.category !== 'EM_HOME' || !(traumaBlocks || []).includes(resident.blockType)) return null;
  const firstHalf = blockDayIndex(blockStart, dateStr) < 14;
  return (resident.blockType === 'TRAUMA_PEDS') === firstHalf ? 'trauma' : 'peds';
}
function isTraumaPedsSplitResident(resident, traumaBlocks) {
  return resident.category === 'EM_HOME' && (traumaBlocks || []).includes(resident.blockType);
}
// The combined 19-shift target for TRAUMA_PEDS/PEDS_TRAUMA is intentionally split into two
// protected sub-targets so the peds half (filled first, since Trauma Day is generated last —
// see the two-pass loop below) can never eat the trauma half's budget.
const TRAUMA_PEDS_SPLIT = { trauma: 8, peds: 11 };

// PED-N Thu-Sun EM-Home deprioritization support (see BASE_ELIGIBILITY/score()): true if resident
// has already done — or is currently on — a Peds/Trauma-mix rotation (TRAUMA_BLOCKS: PEDS_TRAUMA/
// TRAUMA_PEDS) this academic year, so a PGY-1 with real Peds exposure isn't penalized on PED-N
// same as a PGY-1 with none. Checks the CURRENT block's own rotation first (resident.blockType is
// already denormalized from block.emBlockAssignments by the caller — see allResidents in the root
// component), then every blocksHistory snapshot (published or not — an in-progress/unpublished
// block this AY still counts as "already done it") whose own startDate is strictly before this
// block's startDate and whose academicYear matches. Defensive against untrusted/partial snapshot
// shapes, same idiom as countPublishedJC/countPublishedTraumaNights.
function hasPriorPedsTrauma(resident, blocksHistory, block, traumaBlocks = TRAUMA_BLOCKS) {
  if (traumaBlocks.includes(resident.blockType)) return true;
  if (!block?.startDate) return false;
  return (blocksHistory || []).some(snap => {
    const snapAy = snap?.academicYear || snap?.data?.academicYear;
    const snapStart = snap?.startDate || snap?.data?.startDate;
    if (snapAy !== block.academicYear || !snapStart || snapStart >= block.startDate) return false;
    const bt = snap?.data?.emBlockAssignments?.[resident.id]?.blockType;
    return !!bt && traumaBlocks.includes(bt);
  });
}

// ─── Peds/EM mix (PGY-2 PEDS_EM rotation) ──────────────────────────────────
// Target 19 total shifts; aim for 10 peds shifts (min), up to 12 max, rest elsewhere.
function isPedsEmMix(resident) { return resident.category === 'EM_HOME' && resident.pgy === 2 && resident.blockType === 'PEDS_EM'; }
const PEDS_EM_MIX = { min: 10, max: 12 };

// ─── FLEX/POD seniority composition ────────────────────────────────────────
// FLEX: every staffed shift should include at least one EM-Home PGY-2 (falling back to PGY-3 if
// none is available) — this fallback stays a genuine soft rule, validateAll only ever warns.
// POD (AY26/27 chief-directed change): every staffed shift REQUIRES an EM-Home PGY-3, no
// exceptions, except the block's own PGY-3 Wellness Wednesday (see podWellnessSubstituteAllowed)
// when a PGY-2 substituting for the missing PGY-3 is explicitly allowed — validateAll escalates
// a staffed POD shift with no PGY-3 to a hard ERROR on every other day (FLEX keeps its soft
// warning, untouched). Additional slots on either shift should preferentially go to EM-Home
// PGY-1s (POD's 2nd slot especially — see score()'s podPgy1SecondSlot term) and off-service
// residents rather than a second senior. `comp.fallback` still names POD's PGY-2 as "the"
// fallback PGY for isSeniorFor/hasSenior's senior-class membership check (used by the generator's
// candidate-pool restriction and score()'s seniorAdj term) — the wellness-Wednesday-only
// restriction on when that fallback may actually satisfy the requirement lives in fillDayPass's
// POD-specific branch and validateAll, not here.
const SENIOR_COMPOSITION = { FLEX: { primary: 2, fallback: 3 }, POD: { primary: 3, fallback: 2 } };
function isSeniorFor(area, resident) {
  const comp = SENIOR_COMPOSITION[area];
  return !!comp && resident.category === 'EM_HOME' && (resident.pgy === comp.primary || resident.pgy === comp.fallback);
}

// ─── Off-service availability (full block / date ranges / specific days) ──
function isAvailableOnDate(resident, dateStr) {
  const mode = resident.availabilityMode || 'full';
  if (mode === 'ranges') return (resident.availableRanges || []).some(rg => rg.start && rg.end && rg.start <= dateStr && dateStr <= rg.end);
  if (mode === 'days')   return (resident.canWorkDates || []).includes(dateStr);
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

// ─── Wellness Wednesdays ────────────────────────────────────────────────────
// Block-relative (not calendar-month-relative, unlike firstFridayOfMonth above): the Nth
// occurrence of a weekday on/after a start date. Used for EM Home's Wellness Wednesdays (1st/
// 2nd/3rd Wednesday on/after the block's own startDate, per PGY) — see DEFAULT_DAY_RULES'
// computedDayRules{type:'wellnessWednesday', ordinal} and its handling in getEligibleShifts.
function nthWeekdayOnOrAfter(startStr, weekday, ordinal) {
  if (!startStr || !Number.isFinite(ordinal)) return null;
  const start = parseDate(startStr);
  const delta = (weekday - start.getDay() + 7) % 7;
  return toDateStr(addDays(start, delta + (ordinal - 1) * 7));
}

// POD's hard PGY-3 requirement (see SENIOR_COMPOSITION.POD) has exactly one exception: the
// block's own PGY-3 Wellness Wednesday (3rd Wednesday on/after the block's start date — see
// DEFAULT_DAY_RULES.EM_HOME_3's computedDayRules), when PGY-3s are off day/eve program-wide and a
// PGY-2 substituting for the missing PGY-3 is explicitly allowed. Reuses nthWeekdayOnOrAfter
// (ordinal 3, Wednesday) rather than reimplementing the same block-relative date math.
function podWellnessSubstituteAllowed(ds, blockStart) {
  return ds === nthWeekdayOnOrAfter(blockStart, 3, 3);
}

// ─── Journal Club ───────────────────────────────────────────────────────────
// Journal Club runs 18:00-21:00. Its DATES used to be derived-only (first Tuesday of each calendar
// month); they are now chief-overridable per academic year via ayData[AY].jcDates, resolved through
// lib/journalClub.js — an absent list still derives first Tuesdays, so nothing migrates. Every
// consumer below goes through resolveJcDates/jcDatesInRange/isJcDate rather than re-deriving, so
// the generator, the validator, the planner and the grid can't drift apart on what a JC date is.
// A resident "works" Journal Club if assigned any shift whose SHIFT_TIMING interval overlaps that
// window — derived from timing rather than a hand-maintained shift-id list, so PED-S (11:00-20:00)
// and any future shift are covered for free.
const JC_MAX_PER_AY = 3;
// isFirstTuesday/getFirstTuesdaysInRange now live in lib/journalClub.js (they had to move: a lib
// module may never import this file, and the resolvers need them). shiftOverlapsJC lives in
// lib/shifts.js; ayWindowFor in lib/dates.js — all imported above.
// Counts JC-worked occurrences for a resident across PUBLISHED saved blocks in the given
// academic year, excluding excludeBlockId (the live/current block, counted separately since it
// isn't itself a saved snapshot). Defensive against untrusted/partial snapshot shapes.
function countPublishedJC(residentId, ay, blocksHistory = [], excludeBlockId = null, ayConf = {}) {
  let count = 0;
  for (const snap of blocksHistory) {
    if (!snap?.published || snap.id === excludeBlockId) continue;
    if ((snap.academicYear || snap.data?.academicYear) !== ay) continue;
    const rs = snap.data?.schedule?.[residentId];
    if (!rs) continue;
    const snapStart = snap.startDate || snap.data?.startDate;
    for (const ds of jcDatesInRange(snapStart, snap.endDate || snap.data?.endDate, ay, ayConf, { fallbackDateStr: snapStart })) {
      if (shiftOverlapsJC(rs[ds])) count++;
    }
  }
  return count;
}
function countCurrentBlockJC(residentId, block, schedule, ayConf = {}) {
  const rs = schedule?.[residentId];
  if (!rs) return 0;
  let count = 0;
  for (const ds of jcDatesInRange(block.startDate, block.endDate, block.academicYear, ayConf, { fallbackDateStr: block.startDate })) {
    if (shiftOverlapsJC(rs[ds])) count++;
  }
  return count;
}

// ─── AY-to-date carryover (Phase 2) ────────────────────────────────────────
// Per-resident totals accumulated across PUBLISHED saved blocks earlier in the same academic year,
// so fairness can be measured over the year rather than resetting every block. Published-only,
// matching countPublishedJC's convention above: an unpublished draft is work-in-progress and must
// never move anyone's fairness math.
//
// Only the most recent AY_CARRYOVER_MAX_BLOCKS published blocks count. That cap is the recency
// clamp — the same defensive move as score()'s traumaNightBalance clamp, whose comment records
// that an uncapped accumulating term eventually swamped the tiers it was meant to tie-break. Late
// in an academic year an uncapped sum would similarly dwarf anything the current block can change,
// making the whole term inert (or, worse, permanently punitive toward one resident).
const AY_CARRYOVER_MAX_BLOCKS = 6;
// Published prior blocks needed before AY-to-date fairness is weighted at full strength. Below
// this the metric is blended toward block-only fairness — see computeQualityMetrics. Deliberately
// small: with "a few blocks, some published" (the real current state) the carryover should already
// be doing something, just not dominating.
const AY_CARRYOVER_FULL_AT = 3;

// Returns { [residentId]: { nights, weekendDates, assigned, blocks } } for the given AY. A resident
// absent from every published snapshot is simply absent from the map — callers MUST treat that as
// "no history", never as zero. Zero would read as maximally under-worked and would systematically
// hammer whoever is newest to the roster.
function computeAyPriorTotals(ay, blocksHistory = [], excludeBlockId = null) {
  const published = (blocksHistory || [])
    .filter(snap => snap?.published && snap.id !== excludeBlockId)
    .filter(snap => (snap.academicYear || snap.data?.academicYear) === ay)
    // Most recent first, then capped — see AY_CARRYOVER_MAX_BLOCKS above.
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
    .slice(0, AY_CARRYOVER_MAX_BLOCKS);

  const out = {};
  for (const snap of published) {
    const schedule = snap.data?.schedule || {};
    const dates = getBlockDates(snap.startDate || snap.data?.startDate, snap.endDate || snap.data?.endDate);
    for (const [rid, rs] of Object.entries(schedule)) {
      if (!rs) continue;
      let nights = 0, weekendDates = 0, assigned = 0, sawAny = false;
      for (const ds of dates) {
        const sid = rs[ds];
        if (!sid) continue;
        sawAny = true;
        assigned++;
        if (isNightShiftId(sid)) nights++;
        const dow = parseDate(ds).getDay();
        if (dow === 0 || dow === 6) weekendDates++;
      }
      // A resident present in the snapshot but with zero shifts in it (e.g. fully on vacation)
      // still counts as history — they were on the roster for that block, so their low totals are
      // real information, not missing data.
      if (!sawAny && !(rid in schedule)) continue;
      if (!out[rid]) out[rid] = { nights: 0, weekendDates: 0, assigned: 0, blocks: 0 };
      out[rid].nights += nights;
      out[rid].weekendDates += weekendDates;
      out[rid].assigned += assigned;
      out[rid].blocks += 1;
    }
  }
  return out;
}

// ─── Generate-readiness checks ─────────────────────────────────────────────
// Hoisted from RulesTab's inline special-day list (Rules tab's "Special-Day Rules" section) so
// the Rules tab and the pre-generate readiness gate share the same labels.
// advocacyDays removed (AY26/27): Peds residents now get a hard Wednesday fullBlockDays instead
// of a "night before an advocacy day" special-day rule — see DEFAULT_DAY_RULES.PEDS_1/PEDS_3.
// Old block.specialDays.advocacyDays data is left alone in already-saved snapshots (harmless,
// simply unread from here on) — never deleted or migrated.
const SPECIAL_DAY_META = [
  { key: 'codeBlueDays', label: 'Code Blue days' },
  { key: 'procDays', label: 'Procedure days' },
  { key: 'anesDays', label: 'Anesthesia days' },
];

// Special-day lists that matter for THIS block's residents (derived from each schedulable
// resident's effective specialDayRules, honoring chief overrides — not hardcoded) and are still
// empty on the block.
function getMissingSpecialDayLists(allResidents, block, dayRules) {
  const relevantKeys = new Set();
  for (const r of allResidents) {
    if (!isSchedulable(r)) continue;
    const dr = getEffectiveDayRules(eligKey(r), dayRules);
    for (const rule of dr.specialDayRules || []) relevantKeys.add(rule.listKey);
  }
  const sd = block.specialDays || {};
  return SPECIAL_DAY_META.filter(m => relevantKeys.has(m.key) && (sd[m.key] || []).length === 0);
}

// Extracted from JournalClubPlanner's inline presenter filter so the readiness gate can't drift
// from what the planner card shows.
function jcPresentersFor(emHomeResidents, ds, pgy) {
  return emHomeResidents.filter(r => r.pgy === pgy && (r.jcPresentDates || []).includes(ds));
}

// Journal-Club-date/PGY combinations inside this block's own date range with no presenter set.
function getJCPresenterGaps(allResidents, block, ayConf = {}) {
  const emHome = allResidents.filter(r => r.category === 'EM_HOME');
  const gaps = [];
  for (const ds of jcDatesInRange(block.startDate, block.endDate, block.academicYear, ayConf, { fallbackDateStr: block.startDate })) {
    for (const pgy of [1, 2, 3]) {
      if (jcPresentersFor(emHome, ds, pgy).length === 0) gaps.push({ dateStr: ds, pgy });
    }
  }
  return gaps;
}

// Human-readable readiness messages for the pre-Generate warning gate — empty array means ready.
// Checks the manual, per-block dates a chief is expected to enter before generation: special-day
// lists relevant to residents on this block, and Journal Club presenters for the Journal Club
// dates that fall within the block.
function checkGenerateReadiness({ allResidents, block, dayRules, ayConf = {} }) {
  const messages = [];
  for (const m of getMissingSpecialDayLists(allResidents, block, dayRules)) {
    messages.push(`No ${m.label.toLowerCase()} entered — some residents' eligibility rules depend on them (Dashboard tab → Special Days)`);
  }
  for (const g of getJCPresenterGaps(allResidents, block, ayConf)) {
    messages.push(`No PGY-${g.pgy} Journal Club presenter set for ${formatDisplayDate(g.dateStr)} (set on the resident's profile)`);
  }
  return messages;
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

// The "which dates run 12h shifts" question now lives entirely in lib/coverage.js
// (resolveTwelveHourWindows/twelveHourStateFor). An AY the chief has never edited still resolves
// the ACEP/AAEM/SAEM ranges above into implicit POD/MT/FLEX windows, so this file no longer needs
// its own conference-date predicate — deleting it keeps one answer rather than two that can drift.

const DEFAULT_AY_CONF = { acepStart:'', acepEnd:'', iteDate:'', aaemStart:'', aaemEnd:'', saemStart:'', saemEnd:'' };
// The conference DATE fields specifically. "Has this AY had its conferences entered?" has to test
// these by name, not Object.values(conf).some(Boolean) — the same per-AY object now also carries
// jcDates and twelveHourWindows, and an array is truthy even when empty, so the generic test would
// report conferences as set the moment a chief edited a Journal Club date.
const AY_CONF_DATE_FIELDS = ['acepStart','acepEnd','iteDate','aaemStart','aaemEnd','saemStart','saemEnd'];

// App-level settings (persisted in res_app_settings)
const DEFAULT_APP_SETTINGS = {
  jeopardyPolicy: 'warn',     // 'block' = unschedulable | 'warn' = allowed with warning | 'off' = ignore
  enforceRest: true,          // rest-period rule (shift length = required hours off)
  emTraumaCap: 2,             // warn when an EM Home PGY-2/3 exceeds this many trauma shifts/block
  defaultBlockLength: 28,     // days — auto-fills end date when start date is set
  maxSavedBlocks: 24,         // history depth on the Dashboard's Block Calendar
  targetOverrides: {},        // { [CATEGORY_PGY]: number, CHIEF: number } — overrides SHIFT_TARGETS/BLOCK_TARGETS
  rulePriority: DEFAULT_RULE_PRIORITY, // ranked soft-rule order the generator breaks lowest-first — see SOFT_RULES
  generalPedsMonthlyTarget: 2, // soft nudge: PGY-2/3 not on a dedicated peds rotation aim for this many peds shifts/block
  enforceWeekendOff: true,    // soft nudge: try to leave every schedulable resident one full weekend (Sat+Sun) off
  // Jeopardy/sick-call incident log — one record per real-world sick-call/activation event, see
  // src/lib/jeopardyLedger.js. Deliberately NOT its own res_* localStorage key: sbSaveState's
  // cloud write is a whole-column replace built fresh from THAT BUILD's own LS_BACKUP_KEYS, so a
  // device still running an older bundle (with no 10th key) would upload a document missing the
  // ledger entirely and silently wipe it from the shared cloud row — the exact record the
  // buy-downs in emBlockAssignments are audited against. Living inside res_app_settings means
  // setAppSettings(p => ({...p, ...})) spreads it through untouched even from an old bundle that
  // has never heard of this field, same as targetOverrides/rulePriority above. Do not "clean this
  // up" into its own key later without re-solving that problem.
  jeopardyLog: [],
};

// Chief-role designation (roster-level, `resident.chiefRole` on emRoster — see CLAUDE.md "Chief
// roles"): a PGY-3 EM Home resident can hold one of three distinct chief roles for their year.
// All three carry the same 16-shift target; only 'academic' carries the extra Tuesday
// scheduling restriction (see getEligibleShifts/validateAll below).
const CHIEF_ROLES = {
  academic:   { label: 'Academic Chief',   badge: 'A'  },
  admin:      { label: 'Admin Chief',      badge: 'Ad' },
  scheduling: { label: 'Scheduling Chief', badge: 'S'  },
};
// Backward-compat read: before the three-role split, "chief" was a single per-block boolean at
// `block.emBlockAssignments[id].isChief` (still denormalized onto resident objects as
// `resident.isChief` — see allResidents in the root component). A resident with that legacy flag
// still set but no `chiefRole` assigned yet is treated as equivalent to 'scheduling' for
// target-calculation (and badge-display) purposes ONLY — this is a read-time fallback, never a
// migration; it does not write `chiefRole` anywhere.
function effectiveChiefRole(resident) {
  return resident.chiefRole || (resident.isChief ? 'scheduling' : null);
}

// Effective shift target for a resident, honoring Settings overrides, then rotation-specific
// BLOCK_TARGETS (EM Home only), then the category-level SHIFT_TARGETS baseline, then a chief-
// entered per-block delta (`resident.targetDelta` — a one-block "buy-down"/"buy-up", denormalized
// onto the resident object from `block.emBlockAssignments[id].targetDelta` by allResidents; see
// CLAUDE.md "buy-down"). All four precedence branches feed ONE tail return so the delta is applied
// uniformly — appending it only after the branches would silently no-op for a chief resident or
// anyone with a Settings override, since those return early.
export function getShiftTarget(resident, appSettings = {}) {
  const o = appSettings.targetOverrides || {};
  const key = `${resident.category}_${resident.pgy}`;
  let base;
  if (effectiveChiefRole(resident)) {
    base = o.CHIEF ?? 16;
  } else if (o[key] != null) {
    base = o[key];
  } else if (resident.category === 'EM_HOME' && resident.blockType) {
    const bt = BLOCK_TARGETS[`${key}__${resident.blockType}`];
    base = bt != null ? bt : (SHIFT_TARGETS[key] ?? null);
  } else {
    base = SHIFT_TARGETS[key] ?? null;
  }
  if (base == null) return null; // self-cover; a delta must NEVER create a target
  const d = Number(resident.targetDelta);
  if (!Number.isFinite(d) || d === 0) return base;
  const t = base + d;
  // Return null, NEVER 0, when a delta zeros (or would go negative on) the target. Reason:
  // scheduleQuality.js's targetBearing filter is `targets[r.id] != null`, and `0 != null` is
  // TRUE — a target-0 resident would stay in the fairness population and deficitSpread would
  // score them assigned/target -> 0, the maximal outlier against peers near 1.0, weighted x10 in
  // the quality vector's slot 3 (same for nightSpread/weekendSpread). null is the correct
  // semantic — a fully-bought-down resident is a fairness non-participant, exactly like an
  // existing self-cover resident — and every downstream consumer (candidatePool,
  // scoreGenerationResult, scheduleQuality) already handles null.
  return t > 0 ? t : null;
}

// Resolve the eligibility list for a resident, most specific key first:
//   1. CATEGORY_PGY__ROTATION  (rotation-specific override from the Shift Matrix)
//   2. CATEGORY_PGY            (category-level override)
//   3. BASE_ELIGIBILITY default
// rotationSpecific=true means the chief explicitly configured this rotation,
// so built-in rotation shift-type filters (e.g. PGY-1 no-trauma-off-trauma-blocks)
// are skipped — the override IS the rule. Day-of-week rules always still apply.
// PED-N/PED-N-FM/PED-S may never become eligible for any category/PGY other than their legitimate
// owner(s) (EM_HOME_1/2/3 for PED-N, FM_3 alone for PED-N-FM, EM_HOME_2 only for PED-S — see
// BASE_ELIGIBILITY above) via a chief-saved override — a Shift Matrix override wholesale-replaces
// a key's eligibility list, and the owner-specific overrideImmune shiftGates that further restrict
// each shift (ped_n_em_window's Thu-Sun window, ped_s_*'s rotation/day window) never even get
// evaluated for a resident whose own category/PGY has no such gates defined (see CLAUDE.md: "no
// other category/PGY may ever be eligible ... including via a Shift Matrix rotation override").
// An owner's own overrides (category-level or rotation-specific) are left untouched, since
// keeping PED-N/PED-N-FM/PED-S in an owner's own customized list is the intended use of the
// feature. PED-N and PED-N-FM used to be one shift (bare 'PED-N') with a two-key owner set; now
// that they're split ids with their own timing, each has its own single owner, but the key still
// accepts an array (not just a string) for whichever id ever needs multiple owners again.
// PED_GUARD_LEGITIMATE_OWNER values may be a single key (PED-N-FM, PED-S) or an array of keys —
// stripPedGuardedShifts checks membership either way, so EM_BAMC_1 (never a PED-N owner, despite
// once having it in a stale LEGACY_ELIGIBILITY_DEFAULTS snapshot) stays excluded.
const PED_GUARD_LEGITIMATE_OWNER = { 'PED-N': ['EM_HOME_1', 'EM_HOME_2', 'EM_HOME_3'], 'PED-N-FM': 'FM_3', 'PED-S': 'EM_HOME_2' };
function stripPedGuardedShifts(list, key) {
  return list.filter(id => {
    const owner = PED_GUARD_LEGITIMATE_OWNER[id];
    if (!owner) return true;
    return Array.isArray(owner) ? owner.includes(key) : owner === key;
  });
}

// Chief-saved eligibility overrides are stored as a DIFF against the current defaults
// ({added, removed}, see src/lib/eligibilityOverrides.js), not as a snapshot of the shift list.
//
// The snapshot shape caused a real outage: the chief's saved overrides predated the 12h conference
// shifts, so during ACEP the 9h POD/MT/FLEX shifts were suppressed as designed and the 12h
// replacements could never be assigned — residents went unscheduled with no error anywhere.
// LEGACY_ELIGIBILITY_DEFAULTS could not catch it (it only prunes overrides that still deep-equal a
// recorded pre-change default, and it is keyed by CATEGORY_PGY, so per-ROTATION overrides are
// unreachable by it entirely). A diff has no blind spot: anything added to BASE_ELIGIBILITY later
// flows through unless the chief explicitly removed that exact id.
//
// Legacy array-shaped values are still accepted at read time forever (old JSON backup, cloud row
// written by an older build, another device mid-upgrade) — normalizeEligibilityOverride converts
// them, applying the 12h backfill FIRST so later-added ids aren't misread as deliberate removals.
// A one-time mount migration in the root component rewrites stored arrays into diffs.
//
// eligBaseFor: the list a key's diff applies ON TOP OF. Category keys diff against
// BASE_ELIGIBILITY; a rotation key (CATEGORY_PGY__ROTATION) diffs against its PARENT's effective
// list, which preserves the existing inheritance — a category-level change still reaches every
// rotation row that hasn't overridden that specific shift.
function eligCategoryList(key, eligOverrides = {}) {
  return resolveEligibilityList(eligOverrides[key], BASE_ELIGIBILITY[key] || []);
}
function eligBaseFor(key, eligOverrides = {}) {
  const parent = key.includes('__') ? key.slice(0, key.indexOf('__')) : null;
  return parent ? eligCategoryList(parent, eligOverrides) : (BASE_ELIGIBILITY[key] || []);
}

function getEffectiveEligibility(resident, eligOverrides = {}) {
  const key = `${resident.category}_${resident.pgy}`;
  const isEM = resident.category === 'EM_HOME' || resident.category === 'EM_BAMC';
  if (isEM && resident.blockType) {
    const rotKey = `${key}__${resident.blockType}`;
    if (eligOverrides[rotKey] != null) {
      const list = resolveEligibilityList(eligOverrides[rotKey], eligCategoryList(key, eligOverrides));
      return { list: stripPedGuardedShifts(list, key), rotationSpecific: true };
    }
  }
  return { list: stripPedGuardedShifts(eligCategoryList(key, eligOverrides), key), rotationSpecific: false };
}

// ─── WHAT'S NEW ───────────────────────────────────────────────────────────────
// Shown once per release, the first time someone opens the app after it updates. The chief and
// the residents never see a deploy happen, so a feature that isn't announced is a feature nobody
// finds — the 12h-shift swap already shipped once and went unnoticed for exactly that reason.
//
// `id` is what gets persisted as "seen", so it must be unique and must only change when there is
// something new worth interrupting someone for. Newest entry FIRST — everything above the stored
// id is shown, so a user who skips two releases gets both. Keep entries written for the chief
// (what changed for them and where to click), not commit messages.
const CHANGELOG = [
  {
    id: '2026-08-18-jeopardy-ledger',
    date: '2026-08-18',
    title: 'Jeopardy & sick-call tracking, Peds Night split into two shifts, editable QGenda task names, and per-block target overrides',
    items: [
      'New **Jeopardy & Sick Calls** card on the Dashboard tab: log every sick call and every jeopardy activation for the academic year — who called out, which shift, and who (if anyone) was pulled off jeopardy to cover. Each activation earns that resident a buy-down credit, tracked as earned/spent/remaining right on the card.',
      'This is **advisory only** — logging an incident never changes a schedule or a target by itself. The chief spends an earned credit by hand, on the EM Residents tab\'s existing **Target Δ** field, checked **buy-down**. Nothing auto-applies.',
      'The EM Residents tab now shows a compact sick-call/activation/credit line on any resident\'s tile who has one this academic year.',
      'Peds Night is now two separate shifts with correct hours: FM-3 keeps its own **PED-N-FM** (23:00–08:00), exclusively Mon/Tue/Wed; EM Home residents get **PED-N** (19:00–04:00), open Thu–Sun.',
      'QGenda export task names are now fully chief-editable — Settings → **QGenda Task Names** lets you set the exact task name QGenda expects per shift and preview the exported staff-name format, so a rejected import can be fixed without a redeploy.',
      'Per-block shift-target overrides ("buy-downs" and their opposite) are now available on the EM Residents tab: a **Target Δ** field per resident adjusts that one resident\'s shift-count target for the current block only, with a reason note.',
    ],
  },
  {
    id: '2026-08-16-jc-dates-12h-windows',
    date: '2026-08-16',
    title: 'Journal Club dates you control, and 12-hour shifts on any dates you choose',
    items: [
      'Journal Club is no longer locked to the first Tuesday. Dashboard tab → the academic-year band → **Journal Club Dates** lets you move, add or remove any date for the year. Untouched years still default to first Tuesdays.',
      'Journal Club presenters can now be assigned straight from the **Journal Club** card — one dropdown per PGY per date, showing who is already presenting and each resident\'s worked-JC count. The resident-profile date chips still work exactly as before.',
      '12-hour shifts are no longer tied to conference weeks. Dashboard tab → **12-Hour Shift Windows** lets you set any date range, pick which areas (POD / MT / FLEX / PED) switch to 12h, choose whether the normal 9h shifts are replaced or kept alongside, and override staffing numbers per window.',
      'Your existing ACEP / AAEM / SAEM dates keep working with no setup — they appear as ready-made windows you can edit.',
      'The schedule grid now marks every 12h date with a **12h** badge, and the Dashboard says how many 12h days a block has — including saying plainly when there are none.',
      '**Fixed the ACEP problem**: if you had ever customized shift eligibility (Shift Matrix tab, including a per-rotation row), your saved settings pre-dated the 12h shifts and never listed them — so during a conference the normal shifts were correctly switched off and the 12h ones could not be assigned, leaving residents unscheduled. Existing settings now pick up the 12h shifts automatically for any area they already cover.',
      'Fixed: every 12h shift was silently being counted as required staffing on ordinary, non-conference days, which inflated the unfilled-slot count on every schedule.',
    ],
  },
];
const WHATS_NEW_KEY = 'res_whats_new_seen';
// Device-local, deliberately NOT in LS_BACKUP_KEYS — "have I read this yet" is per-person, and
// restoring a colleague's backup or syncing another device must not mark it read for you. Same
// posture as res_dark_mode / res_demo_mode.
function unseenChangelog() {
  try {
    const seen = localStorage.getItem(WHATS_NEW_KEY);
    // No stored id = either a brand-new install or someone who predates this feature. Both get the
    // full list once; it's short, and the alternative (silently marking everything read) is how
    // the last release went unnoticed.
    if (!seen) return CHANGELOG;
    const i = CHANGELOG.findIndex(e => e.id === seen);
    return i === -1 ? CHANGELOG : CHANGELOG.slice(0, i);
  } catch { return []; }                               // storage blocked — never block the app
}

function makeDefaultBlock() {
  return {
    id: `blk_${Date.now()}`, name: '', academicYear: getAcademicYear(),
    startDate: '', endDate: '',
    emBlockAssignments: {},   // { [residentId]: { blockType, isChief, targetDelta, targetNote, targetIsBuyDown } }
                               // targetDelta/targetNote/targetIsBuyDown: a chief-entered ONE-BLOCK
                               // shift-target adjustment ("buy-down"/"buy-up"), expressed as a delta
                               // + reason note rather than an absolute number so it survives a
                               // SHIFT_TARGETS change and stays self-documenting — see getShiftTarget.
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

// A shiftGate's optional activeWhen decides whether the gate applies to a block, by the block's
// OWN start date (YYYY-MM-DD strings compare lexicographically) — used for rules that change on
// a known effective date (e.g. the Aug 2026 EM/EMS-EM/TOX swing-shift swap) while keeping the
// chief's wholesale-override model intact (an override still replaces every variant together).
// No blockStart available (e.g. a display-only call site) → the pre-cutover variant is treated
// as active, matching the rule that was in effect at authoring time.
function gateActiveForBlock(activeWhen, blockStart) {
  if (!activeWhen) return true;
  if (!blockStart) return !activeWhen.blockStartOnOrAfter;
  if (activeWhen.blockStartOnOrAfter && blockStart < activeWhen.blockStartOnOrAfter) return false;
  if (activeWhen.blockStartBefore && blockStart >= activeWhen.blockStartBefore) return false;
  return true;
}

// ctx: { blockStart, forGenerator, ayConf } — blockStart is the block's start date string
// (needed for the Peds/Trauma half-block split); forGenerator=true lets generator-only day-type
// restrictions apply (chief picker still allows those shifts manually — see
// dayTypeRestrictions[].scope); ayConf is the AY-level config, which now carries both the
// conference dates and the chief's 12h windows — it drives the 12h swap via twelveHourStateFor /
// twelveHourAllows (see lib/coverage.js). Omitting it at a call site means no window is active,
// i.e. no swap — safe, zero-regression default. Note this caller's no-context behavior is
// deliberately the OPPOSITE of getCoverageFor's: eligibility strips the swap ids when there is no
// state, while getCoverageFor treats "no state" as "show the base numbers" for the Rules tab.
export function getEligibleShifts(resident, dateStr, specialDays = {}, eligOverrides = {}, appSettings = {}, dayRules = {}, ctx = {}) {
  if (!isSchedulable(resident)) return [];
  // Approved days off — resident blocked entirely
  if ((resident.approvedDatesOff || []).includes(dateStr)) return [];
  // Vacation — distinct from approvedDatesOff (chief-tracked vacation dates, e.g. from the
  // vacation-xlsx importer) but the same hard-block mechanism/severity.
  if ((resident.vacationDates || []).includes(dateStr)) return [];
  // Off-service availability (full block / date ranges / specific days) — see isAvailableOnDate
  if (!isAvailableOnDate(resident, dateStr)) return [];
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

  // Shift-exists-on-this-weekday-at-all (e.g. PED-S is only Mon/Tue/Thu/Fri) — applies to both
  // the manual picker and the generator; the generator already skips these dates separately in
  // fillDayPass, but the picker had no equivalent check, so it offered the shift on invalid days.
  eligible = eligible.filter(s => !SHIFT_DOW[s] || SHIFT_DOW[s].includes(dow));

  // Academic Chief hard rule (resident-specific, not a DEFAULT_DAY_RULES entry — chiefRole is a
  // per-resident assignment, not a category/PGY default): no evening/night shifts on Tuesdays.
  // Only the 'academic' role carries this restriction — the legacy isChief→'scheduling' fallback
  // never applies here, since the Tuesday rule is new and shouldn't retroactively apply to
  // already-saved blocks whose chiefRole hasn't been explicitly set to 'academic'.
  if (resident.chiefRole === 'academic' && dow === 2) {
    eligible = eligible.filter(s => !['eve', 'night'].includes(SHIFT_MAP[s]?.type));
  }

  // Chief-editable day/block rules (Scheduling Rules tab) — see DEFAULT_DAY_RULES for shapes.
  const dr = getEffectiveDayRules(key, dayRules);
  const traumaBlocks = dayRules.TRAUMA_BLOCKS ?? TRAUMA_BLOCKS;

  // 1. Full-day block / restrict-to-only-these-days
  if (dr.fullBlockDays?.includes(dow)) return [];
  if (dr.onlyDaysEnabled && !(dr.onlyDays || []).includes(dow)) return [];

  // 1b. Computed-date rules — dates derived from the calendar itself, no manual list needed
  for (const c of dr.computedDayRules || []) {
    if (c.type === 'firstFridayOfMonth' && dow === 5 && date.getDate() <= 7) return [];
    // Wellness Wednesday — block-relative (needs ctx.blockStart), strips day+eve only; a night
    // shift starting that Wednesday is still allowed. No-ops if blockStart wasn't threaded
    // through by the caller (nthWeekdayOnOrAfter returns null).
    if (c.type === 'wellnessWednesday' && dow === 3 && dateStr === nthWeekdayOnOrAfter(ctx.blockStart, 3, c.ordinal)) {
      eligible = eligible.filter(s => !['day', 'eve'].includes(SHIFT_MAP[s]?.type));
    }
  }

  // 2. Shift/rotation gates — subset-of-shifts or block-type day windows
  for (const g of dr.shiftGates || []) {
    if (g.scope === 'generator' && !ctx.forGenerator) continue; // manual picker still allows it
    if (!gateActiveForBlock(g.activeWhen, ctx.blockStart)) continue;
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
      if (r.scope === 'generator' && !ctx.forGenerator) continue; // manual picker still allows it
      if (r.days.includes(dow)) eligible = eligible.filter(s => matchesMode(SHIFT_MAP[s]?.type, r.mode));
    }
  }

  // 4. Special-day-list rules (Code Blue / procedure / anesthesia dates)
  for (const s of dr.specialDayRules || []) {
    const listArr = specialDays[s.listKey] || [];
    if ((s.offset === 'sameDay' || s.offset === 'sameDayAndDayBefore') && listArr.includes(dateStr)) return [];
    if ((s.offset === 'dayBefore' || s.offset === 'sameDayAndDayBefore') && listArr.includes(toDateStr(addDays(date, 1)))) return [];
  }

  // 5. Peds/Trauma half-block split (TRAUMA_PEDS / PEDS_TRAUMA) — hardcoded, override-immune:
  // only two rotations are ever subject to this, so it isn't modeled as an editable gate.
  const half = traumaPedsHalf(resident, dateStr, ctx.blockStart, traumaBlocks);
  if (half === 'trauma') eligible = eligible.filter(s => s === 'TRAUMA-D');
  else if (half === 'peds') eligible = eligible.filter(s => s === 'PED-D' || s === 'PED-E');

  // 6. Journal Club presenter — hard-strip shifts overlapping 18:00-21:00 on the resident's own
  // presenting date; the generator additionally avoids placing them on a late night that evening
  // (manually placeable with a warning — see validateAll).
  if ((resident.jcPresentDates || []).includes(dateStr)) {
    eligible = eligible.filter(s => !shiftOverlapsJC(s));
    if (ctx.forGenerator) eligible = eligible.filter(s => SHIFT_MAP[s]?.type !== 'night');
  }

  // 7. Grand Rounds lecture — no evening/night shift the day before a lecture date (hard, both
  // generator and manual picker); the generator additionally keeps the whole day off (chief
  // feedback: try to give the lecturer the full day before off) — the manual picker still allows
  // a day shift if the chief needs to place one.
  if ((resident.grLectureDates || []).includes(toDateStr(addDays(date, 1)))) {
    eligible = eligible.filter(s => !['eve', 'night'].includes(SHIFT_MAP[s]?.type));
    if (ctx.forGenerator) eligible = eligible.filter(s => SHIFT_MAP[s]?.type !== 'day');
  }

  // 8. 12h window swap — chief-defined windows (or, for an AY the chief hasn't touched, the
  // implicit ACEP/AAEM/SAEM ones) decide which areas run 12h on this date. ctx.twelveHourState
  // lets a hot caller (the generator) hand in a state it already resolved for this date rather
  // than re-resolving per resident. Note PED's 12h pair stays available year-round when no window
  // names PED — that opt-in is gated by its coverage numbers, not by eligibility.
  const conf12 = ctx.twelveHourState || twelveHourStateFor(dateStr, ctx.ayConf || {});
  eligible = eligible.filter(s => twelveHourAllows(s, conf12));

  return eligible;
}

// Group residents' assignments by (date, shift-id) — considering only residents matching rowFilter
// and shifts matching shiftFilter — and push one issue per resident wherever more than one lands on
// the same (date, shift). Shared by the trauma single-resident rule and the no-two-interns rule so
// the grouping/reporting scaffold can't drift between them. `message(e, entries, names)` builds the
// per-resident text.
function pushSharedShiftViolations(issues, allResidents, schedule, { rowFilter, shiftFilter, message, level }) {
  const byDateShift = {};
  for (const resident of allResidents) {
    if (rowFilter && !rowFilter(resident)) continue;
    const rs = schedule[resident.id] || {};
    for (const [ds, sid] of Object.entries(rs)) {
      if (!sid || (shiftFilter && !shiftFilter(sid))) continue;
      (byDateShift[`${ds}__${sid}`] ||= []).push({ resident, ds, sid });
    }
  }
  for (const entries of Object.values(byDateShift)) {
    if (entries.length <= 1) continue;
    const names = entries.map(e => `${e.resident.firstName} ${e.resident.lastName}`).join(', ');
    for (const e of entries) {
      issues.push({ residentId: e.resident.id, name: `${e.resident.firstName} ${e.resident.lastName}`,
        dateStr: e.ds, shiftId: e.sid, message: message(e, entries, names), level });
    }
  }
}

export function validateAll(allResidents, schedule, block, eligOverrides = {}, appSettings = {}, dayRules = {}, coverage = {}, blocksHistory = [], ayConf = {}) {
  const issues = [];
  const sd = block.specialDays || {};
  const jeopardyPolicy = appSettings.jeopardyPolicy ?? 'warn';
  // Depends only on the block's own date range, not the resident — computed once and reused by
  // both the streak-run walk and the circadian night-run walk below (each per-resident).
  const blockDates = getBlockDates(block.startDate, block.endDate);
  // Also resident-independent (depends only on the block's date range) — compute once, not once
  // per resident inside the weekend-off check below.
  const blockWeekends = getBlockWeekends(blockDates);
  const prevTail = prevBlockTailSchedules(block, blocksHistory);
  const streakWalkBounds = streakBounds(block, prevTail);
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
      // Vacation — same severity as approved day off, distinct wording
      if ((resident.vacationDates || []).includes(ds)) {
        issues.push({ residentId: resident.id, name, dateStr: ds, shiftId: sid,
          message: 'Shift scheduled while resident is on vacation this date', level: 'error' });
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
      const elig = getEligibleShifts(resident, ds, sd, eligOverrides, appSettings, dayRules, { blockStart: block.startDate, ayConf });
      if (!elig.includes(sid)) {
        const dow = parseDate(ds).getDay();
        let msg = 'Shift not eligible for this resident on this day';
        const wwRule = resident.category === 'EM_HOME' && dow === 3 && ['day', 'eve'].includes(SHIFT_MAP[sid]?.type)
          ? (getEffectiveDayRules(`${resident.category}_${resident.pgy}`, dayRules).computedDayRules || [])
              .find(c => c.type === 'wellnessWednesday' && ds === nthWeekdayOnOrAfter(block.startDate, 3, c.ordinal))
          : null;
        if (wwRule) msg = `Wellness Wednesday (${ORDINAL_WORD[wwRule.ordinal] || `${wwRule.ordinal}th`} of block) — PGY-${resident.pgy} shouldn't work day/eve`;
        else if (resident.chiefRole === 'academic' && dow === 2 && ['eve', 'night'].includes(SHIFT_MAP[sid]?.type)) msg = 'Academic Chief — no Tuesday evening/night shifts';
        else if (resident.category === 'EM_HOME' && dow === 3 && SHIFT_MAP[sid]?.type === 'day') msg = 'GR Wednesday — EM Home has no day shifts (evenings/nights OK)';
        else if (!SHIFT_MAP[sid]) msg = 'Unknown shift type';
        issues.push({ residentId: resident.id, name, dateStr: ds, shiftId: sid, message: msg, level: 'error' });
      }
    }
    const target = getShiftTarget(resident, appSettings);
    if (target != null) {
      const count = Object.values(rs).filter(Boolean).length;
      if (count > target) {
        // Name the chief's own targetDelta override when it's the reason the number looks
        // unusual — otherwise "Over target: 17/17" reads as a mystery when it's really the
        // chief's own buy-down doing its job (target = base +/- delta).
        const d = Number(resident.targetDelta);
        const hasDelta = Number.isFinite(d) && d !== 0;
        const overrideNote = hasDelta
          ? ` (target ${target} = ${target - d} ${d < 0 ? '-' : '+'} ${Math.abs(d)}, ${resident.targetIsBuyDown ? 'buy-down' : (d < 0 ? 'reduction' : 'increase')})`
          : '';
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `Over target: ${count}/${target} shifts${overrideNote}`, level: 'warn' });
      }
    }

    // EM PGY-2/3 soft trauma cap (configurable in Settings; 0 disables)
    const traumaCap = getTraumaCap(appSettings);
    if (traumaCap > 0 && isTraumaCapSubject(resident)) {
      const traumaCount = Object.values(rs).filter(s => s === 'TRAUMA-D' || s === 'TRAUMA-N').length;
      if (traumaCount > traumaCap)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `Trauma shifts: ${traumaCount} — EM PGY-2/3 cap is ${traumaCap}/block (target 1–2)`, level: 'warn' });
    }

    // BAMC: Wednesday overnight runs into Thursday's own Grand Rounds — allowed at most once/block
    if (resident.category === 'EM_BAMC') {
      const wedNightCount = Object.entries(rs)
        .filter(([ds, s]) => s && SHIFT_MAP[s]?.type === 'night' && parseDate(ds).getDay() === 3).length;
      if (wedNightCount > 1)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `${wedNightCount} Wednesday-night shifts — BAMC allows at most one per block (runs into Thursday GR)`, level: 'warn' });
    }

    // One full weekend off (soft, Settings-toggleable): a schedulable resident should have at
    // least one Sat+Sun pair with no shifts either day.
    if (appSettings.enforceWeekendOff !== false && isSchedulable(resident)) {
      if (blockWeekends.length && !blockWeekends.some(([sat, sun]) => !rs[sat] && !rs[sun]))
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: 'No full weekend (Sat+Sun) off this block', level: 'warn' });
    }

    // Peds/EM mix (PGY-2 on PEDS_EM): aim for 10–12 peds shifts of the 19 total
    if (isPedsEmMix(resident)) {
      const pedsCount = Object.values(rs).filter(s => SHIFT_MAP[s]?.area === 'PED').length;
      const totalCount = Object.values(rs).filter(Boolean).length;
      const target = getShiftTarget(resident, appSettings);
      if (pedsCount > PEDS_EM_MIX.max)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `Peds/EM mix: ${pedsCount} peds shifts (goal ${PEDS_EM_MIX.min}–${PEDS_EM_MIX.max})`, level: 'warn' });
      else if (pedsCount < PEDS_EM_MIX.min && target != null && totalCount >= target)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `Peds/EM mix: ${pedsCount} peds shifts (goal ${PEDS_EM_MIX.min}–${PEDS_EM_MIX.max})`, level: 'warn' });
    }

    // FM-1 peds is fill-in PRN only — flag if they've ended up primarily peds (soft ~1/3-of-target
    // ceiling; chief feedback: use them to fill gaps, don't let peds become their emphasis).
    if (resident.category === 'FM' && resident.pgy === 1) {
      const pedsCount = Object.values(rs).filter(s => SHIFT_MAP[s]?.area === 'PED').length;
      const fm1Cap = getFm1PedsCap(getShiftTarget(resident, appSettings));
      if (fm1Cap != null && pedsCount > fm1Cap)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `FM-1 peds shifts: ${pedsCount} — peds is meant to be fill-in PRN, not the emphasis (soft ceiling ~${fm1Cap})`, level: 'warn' });
    }

    // Trauma/Peds rotation: protected 8-trauma/11-peds split within the combined 19-shift target
    if (isTraumaPedsSplitResident(resident, dayRules.TRAUMA_BLOCKS ?? TRAUMA_BLOCKS)) {
      const traumaHalfCount = Object.values(rs).filter(s => SHIFT_MAP[s]?.area === 'TRAUMA').length;
      const pedsHalfCount = Object.values(rs).filter(s => SHIFT_MAP[s]?.area === 'PED').length;
      if (traumaHalfCount > TRAUMA_PEDS_SPLIT.trauma)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `Trauma/Peds split: ${traumaHalfCount} trauma shifts — trauma half target is ${TRAUMA_PEDS_SPLIT.trauma}`, level: 'warn' });
      if (pedsHalfCount > TRAUMA_PEDS_SPLIT.peds)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `Trauma/Peds split: ${pedsHalfCount} peds shifts — peds half target is ${TRAUMA_PEDS_SPLIT.peds}`, level: 'warn' });
    }

    // Journal Club (EM Home only): cap of 3 worked/year (published blocks + this one), presenter
    // day-of protections, and sanity checks on jcPresentDates entries.
    if (resident.category === 'EM_HOME') {
      const jcTotal = countPublishedJC(resident.id, block.academicYear, blocksHistory, block.id, ayConf) + countCurrentBlockJC(resident.id, block, schedule, ayConf);
      if (jcTotal > JC_MAX_PER_AY)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `${jcTotal} Journal Clubs worked this academic year — max is ${JC_MAX_PER_AY} (counts Published blocks + this one)`, level: 'warn' });

      // jcPresentDates accumulates across academic years, so the "is this actually a JC date"
      // check has to be scoped to THIS AY — the old isFirstTuesday test was AY-agnostic and let
      // prior-year entries through. Fall back to the block's own start date when academicYear was
      // never set, so a block with no AY doesn't silently lose the whole check (including the
      // night-shift-after-JC warning below, which lives in the same loop and needs no AY).
      const effectiveJcAy = ayWindowFor(block.academicYear) ? block.academicYear : getAcademicYearFor(block.startDate);
      const ay = ayWindowFor(effectiveJcAy);
      for (const jcDate of resident.jcPresentDates || []) {
        const inThisAy = ay ? (jcDate >= ay.start && jcDate < ay.end) : false;
        if (inThisAy && !isJcDate(jcDate, effectiveJcAy, ayConf, { fallbackDateStr: block.startDate }))
          issues.push({ residentId: resident.id, name, dateStr: jcDate, shiftId: null,
            message: `Journal Club presenting date isn't a Journal Club date for ${effectiveJcAy}: ${formatDisplayDate(jcDate)}`, level: 'warn' });
        const nightSid = rs[jcDate];
        if (nightSid && SHIFT_MAP[nightSid]?.type === 'night')
          issues.push({ residentId: resident.id, name, dateStr: jcDate, shiftId: nightSid,
            message: `Presenter working a night shift after Journal Club (${formatDisplayDate(jcDate)})`, level: 'warn' });
      }
      if (ay) {
        const presentingInAy = (resident.jcPresentDates || []).filter(d => d >= ay.start && d < ay.end);
        if (presentingInAy.length > 1)
          issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
            message: `${presentingInAy.length} Journal Club presenting dates in ${effectiveJcAy} — each resident presents at most once/year`, level: 'warn' });
      }
    }

    // Grand Rounds lecture dates: no evening/night shift the day before a lecture (hard rule —
    // a violation here means the schedule was hand-edited or imported after the date was added),
    // and each entry should fall on the resident's own GR weekday.
    for (const grDate of resident.grLectureDates || []) {
      const expectedDow = grWorkDow(resident);
      if (expectedDow == null || parseDate(grDate).getDay() !== expectedDow)
        issues.push({ residentId: resident.id, name, dateStr: grDate, shiftId: null,
          message: `Grand Rounds lecture date isn't on this resident's GR weekday: ${formatDisplayDate(grDate)}`, level: 'warn' });
      const priorDs = toDateStr(addDays(parseDate(grDate), -1));
      const priorSid = rs[priorDs];
      if (priorSid && ['eve', 'night'].includes(SHIFT_MAP[priorSid]?.type))
        issues.push({ residentId: resident.id, name, dateStr: priorDs, shiftId: priorSid,
          message: `Evening/night shift the day before a Grand Rounds lecture (${formatDisplayDate(grDate)})`, level: 'error' });
    }

    // 6-consecutive-work-day rule (ACGME 1-in-7) — see isStreakWorkDay for what counts as a
    // worked day (shift assigned, GR weekday, or JC presenting date, unless vacation/approved
    // off). Walk starts 14 days before the block so a run continuing from the previous saved
    // block (prevTail) is visible, but only runs ending inside this block are reported — a run
    // that lives entirely in the previous block was already reported when that block was current.
    if (isSchedulable(resident) || Object.values(rs).some(Boolean)) {
      const residentPrevTail = prevTail[resident.id] || null;
      const walkDates = [...Array.from({ length: 14 }, (_, i) => toDateStr(addDays(parseDate(block.startDate), i - 14))), ...blockDates];
      let runStart = null, runHasShift = false;
      const flushRun = (runEnd) => {
        if (runStart == null) return;
        const len = blockDayIndex(runStart, runEnd) + 1;
        if (len > MAX_CONSECUTIVE_WORK_DAYS && runHasShift && runEnd >= block.startDate)
          issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
            message: `${len} consecutive work days (${formatDisplayDate(runStart)}–${formatDisplayDate(runEnd)}) — max ${MAX_CONSECUTIVE_WORK_DAYS}`,
            level: 'error' });
        runStart = null; runHasShift = false;
      };
      let prevDs = null;
      for (const ds of walkDates) {
        if (isStreakWorkDay(rs, resident, ds, residentPrevTail, streakWalkBounds)) {
          if (runStart == null) runStart = ds;
          if (ds >= block.startDate && rs[ds]) runHasShift = true;
        } else {
          if (prevDs != null) flushRun(prevDs);
        }
        prevDs = ds;
      }
      flushRun(walkDates[walkDates.length - 1]);
    }

    // Rest-period check — sort all assignments by start time, then check each consecutive pair.
    // The pairwise legal-rest-hours check below is the only part gated by enforceRest; the
    // circadian/GR-rest checks that follow are hard circadian rules (matching how the generator
    // already enforces them unconditionally) and always run regardless of that toggle.
    const assignments = Object.entries(rs)
      .filter(([, sid]) => sid && SHIFT_TIMING[sid])
      .map(([ds, sid]) => ({
        ds, sid,
        startMs: shiftStartMs(sid, ds),
        endMs:   shiftEndMs(sid, ds),
        durationH: SHIFT_TIMING[sid].durationH,
      }))
      .sort((a, b) => a.startMs - b.startMs);

    if (appSettings.enforceRest !== false) {
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

    // Post-night-day (soft postNightRest preference) and eve→day-next-day (hard) turnarounds —
    // delegate to checkCircadianViolations's 'day' branch (it looks backward from dateStr
    // through the already-complete schedule) so this retrospective check can't drift from the
    // generator/picker's real-time version of the same rule. Every returned level is surfaced
    // now — the 24h rest rule is a warn since it was demoted to a ranked soft rule.
    for (const a of assignments) {
      if (SHIFT_MAP[a.sid]?.type !== 'day') continue;
      for (const v of checkCircadianViolations(resident, a.ds, a.sid, rs)) {
        issues.push({ residentId: resident.id, name, dateStr: a.ds, shiftId: a.sid, message: v.message, level: v.level, rule: v.rule, gapH: v.gapH });
      }
    }

    // Grand Rounds the morning after a night shift counts against the same postNightRest soft
    // rule — GR isn't a schedule entry, so it's checked separately via grRestViolation.
    for (const a of assignments) {
      if (SHIFT_MAP[a.sid]?.type !== 'night') continue;
      const grViolation = grRestViolation(resident, a.ds, a.sid);
      if (grViolation) issues.push({ residentId: resident.id, name, dateStr: a.ds, shiftId: a.sid, ...grViolation });
    }

    // ACGME 80-hour rolling 4-week average (advisory — a block shorter than 4 weeks has
    // incomplete data, so this stays a warn, not an error; see weeklyHourStats above).
    if (isSchedulable(resident)) {
      const { maxWeeklyAvg } = weeklyHourStats(rs);
      if (maxWeeklyAvg > 80)
        issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
          message: `Averages ${Math.round(maxWeeklyAvg)}h/wk over a 4-week window (exceeds ACGME 80h limit)`,
          level: 'warn' });
    }

    // Circadian night-run check: consecutive night runs should be 4-6 (isolated 1-3-night stints
    // are a warning), and never exceed 6. Night-only residents (FM-3) are exempt from both the
    // short-run warning and the total-nights cap — see isNightOnlyResident. Runs touching the
    // block's first/last date are not flagged as "short" since they may continue in an adjacent
    // block this validator can't see.
    {
      const nOnly = isNightOnlyResident(resident, eligOverrides);
      let runStart = null, runLen = 0;
      const flushNightRun = (runEndIdx) => {
        if (runStart == null) return;
        const touchesEdge = runStart === blockDates[0] || blockDates[runEndIdx] === blockDates[blockDates.length - 1];
        if (runLen > NIGHT_RULES.maxRun)
          issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
            message: `${runLen} consecutive night shifts (${formatDisplayDate(runStart)}–${formatDisplayDate(blockDates[runEndIdx])}) — max ${NIGHT_RULES.maxRun}`, level: 'error' });
        else if (runLen < NIGHT_RULES.minRun && !nOnly && !touchesEdge)
          issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
            message: `Isolated night stint of ${runLen} (${formatDisplayDate(runStart)}–${formatDisplayDate(blockDates[runEndIdx])}) — aim for ${NIGHT_RULES.minRun}-${NIGHT_RULES.idealRun} in a row`, level: 'warn' });
        runStart = null; runLen = 0;
      };
      blockDates.forEach((ds, i) => {
        if (isNightShiftId(rs[ds])) {
          if (runStart == null) runStart = ds;
          runLen++;
        } else {
          flushNightRun(i - 1);
        }
      });
      flushNightRun(blockDates.length - 1);

      if (!nOnly) {
        const totalNights = countNightsInSchedule(rs);
        if (totalNights > NIGHT_RULES.maxPerBlock)
          issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
            message: `${totalNights} night shifts this block — max is ${NIGHT_RULES.maxPerBlock}`, level: 'warn' });
        // Prefer nights land in one clean run per block; a 2nd separate stint is tolerated, a
        // 3rd+ means nights are fragmented across the block instead of clustered.
        const runCount = nightRunSegments(rs).length;
        if (runCount > 2)
          issues.push({ residentId: resident.id, name, dateStr: null, shiftId: null,
            message: `${runCount} separate night stints this block — prefer clustering into one run (two is acceptable, more fragments nights unnecessarily)`, level: 'warn' });
      }
    }
  }

  // Block-level minimum/maximum coverage check — one issue per date+shift, not per resident.
  const countsByDateShift = {};
  for (const resident of allResidents) {
    const rs = schedule[resident.id] || {};
    for (const [ds, sid] of Object.entries(rs)) {
      if (!sid) continue;
      const k = `${ds}__${sid}`;
      countsByDateShift[k] = (countsByDateShift[k] || 0) + 1;
    }
  }
  for (const ds of blockDates) {
    const dsDow = parseDate(ds).getDay();
    const conf12 = twelveHourStateFor(ds, ayConf || {});
    for (const shift of SHIFTS) {
      if (SHIFT_DOW[shift.id] && !SHIFT_DOW[shift.id].includes(dsDow)) continue;
      const cov = getCoverageFor(shift.id, coverage, dsDow, conf12);
      const count = countsByDateShift[`${ds}__${shift.id}`] || 0;
      if (cov.min > 0 && count < cov.min)
        issues.push({ residentId: null, name: null, dateStr: ds, shiftId: shift.id,
          message: `Below minimum staffing: ${count}/${cov.min} on ${shift.label} (${formatDisplayDate(ds)})`, level: 'warn' });
      else if (count > cov.max)
        issues.push({ residentId: null, name: null, dateStr: ds, shiftId: shift.id,
          message: `Above maximum staffing: ${count}/${cov.max} on ${shift.label} (${formatDisplayDate(ds)})`, level: 'warn' });
    }
  }

  // FLEX/POD seniority composition. FLEX keeps its original soft "missing senior" warning
  // (PGY-2 primary, PGY-3 fallback, either satisfies it — unchanged). POD is a hard requirement
  // instead (AY26/27 chief-directed change): a staffed POD shift needs an EM PGY-3, no fallback
  // exception — except the block's own PGY-3 Wellness Wednesday (see podWellnessSubstituteAllowed),
  // when a PGY-2 substituting for the missing PGY-3 is explicitly allowed and raises no issue.
  const seniorShiftsByArea = Object.fromEntries(
    Object.keys(SENIOR_COMPOSITION).map(area => [area, SHIFTS.filter(s => s.area === area)]));
  for (const ds of blockDates) {
    for (const [area, comp] of Object.entries(SENIOR_COMPOSITION)) {
      for (const shift of seniorShiftsByArea[area]) {
        const assignedHere = allResidents.filter(r => (schedule[r.id] || {})[ds] === shift.id);
        if (!assignedHere.length) continue;
        if (area === 'POD') {
          const hasPgy3 = assignedHere.some(r => r.category === 'EM_HOME' && r.pgy === 3);
          if (hasPgy3) continue;
          const wellnessSubstituteOk = podWellnessSubstituteAllowed(ds, block.startDate)
            && assignedHere.some(r => isSeniorFor('POD', r));
          if (wellnessSubstituteOk) continue;
          issues.push({ residentId: null, name: null, dateStr: ds, shiftId: shift.id,
            message: `${shift.label} (${formatDisplayDate(ds)}) requires an EM PGY-3 — none assigned (only exception is the block's own PGY-3 Wellness Wednesday)`, level: 'error' });
          continue;
        }
        if (!assignedHere.some(r => isSeniorFor(area, r)))
          issues.push({ residentId: null, name: null, dateStr: ds, shiftId: shift.id,
            message: `${shift.label} (${formatDisplayDate(ds)}) has no EM PGY-${comp.primary} (or PGY-${comp.fallback} fallback) assigned`, level: 'warn' });
      }
    }
  }

  // Journal Club: each month should have one presenter marked from each of EM Home PGY-1/2/3.
  for (const jcDate of jcDatesInRange(block.startDate, block.endDate, block.academicYear, ayConf, { fallbackDateStr: block.startDate })) {
    for (const pgy of [1, 2, 3]) {
      const hasPresenter = allResidents.some(r => r.category === 'EM_HOME' && r.pgy === pgy && (r.jcPresentDates || []).includes(jcDate));
      if (!hasPresenter)
        issues.push({ residentId: null, name: null, dateStr: jcDate, shiftId: null,
          message: `No EM Home PGY-${pgy} marked as Journal Club presenter for ${formatDisplayDate(jcDate)}`, level: 'warn' });
    }
  }

  // Trauma shifts are single-resident by nature (physically one trauma bay) — this deliberately
  // ignores the coverage setting, which only the generator/UI use to decide how many to auto-fill.
  pushSharedShiftViolations(issues, allResidents, schedule, {
    shiftFilter: sid => sid === 'TRAUMA-D' || sid === 'TRAUMA-N',
    message: (e, entries, names) => `Two residents on ${e.sid} — trauma shifts are single-resident (${names})`,
    level: 'error',
  });

  // No two EM interns (Home or BAMC PGY-1) on the same shift/team (soft — flagged for review,
  // not blocked; a hard block would leave a min-coverage slot empty when only interns remain).
  pushSharedShiftViolations(issues, allResidents, schedule, {
    rowFilter: isEmIntern,
    message: (e, entries, names) => `${entries.length} interns on ${e.sid} (${names}) — avoid pairing two interns on the same shift`,
    level: 'warn',
  });

  return issues;
}

// ─── SCHEDULE GENERATOR ───────────────────────────────────────────────────────
// Greedy fill: per day, staff the most-constrained shift first (MRV); per slot, pick the
// eligible resident furthest below target, preferring day/eve/night variety and short streaks.
// Fill mode never overwrites a non-empty cell — that is the "keep manual assignments" contract.
// Returns { schedule, report } or null when the block has no dates.
export function generateSchedule({ allResidents, block, coverage = {}, eligOverrides = {}, appSettings = {}, dayRules = {}, clearFirst = false, blocksHistory = [], ayConf = {}, rng = Math.random, repair = false }) {
  const dates = getBlockDates(block.startDate, block.endDate);
  if (!dates.length) return null;

  const sd          = block.specialDays || {};
  const enforceRest = appSettings.enforceRest !== false;
  const jeoPolicy   = appSettings.jeopardyPolicy ?? 'warn';
  const traumaCap   = getTraumaCap(appSettings);
  const traumaBlocks = dayRules.TRAUMA_BLOCKS ?? TRAUMA_BLOCKS;
  const generalPedsTarget = getGeneralPedsTarget(appSettings);
  const enforceWeekendOff = appSettings.enforceWeekendOff !== false;
  const blockWeekends = getBlockWeekends(dates);

  // Hoisted per-date lookups. isJcDate lands inside score(), which runs per candidate per slot, and
  // twelveHourStateFor walks every window — both would otherwise be re-derived thousands of times.
  // A memoizing CLOSURE, not a prebuilt map, on purpose: a prebuilt map missing a key would yield
  // undefined, which getCoverageFor reads as "no date context" and would silently restore every
  // 12h shift's default minimum. A closure can't miss.
  const jcDateSet = new Set(jcDatesInRange(block.startDate, block.endDate, block.academicYear, ayConf, { fallbackDateStr: block.startDate }));
  const isJcDay = ds => jcDateSet.has(ds);
  const conf12Cache = {};
  const conf12For = ds => (conf12Cache[ds] ??= twelveHourStateFor(ds, ayConf || {}));

  const schedule = {};
  for (const r of allResidents) schedule[r.id] = clearFirst ? {} : { ...(block.schedule?.[r.id] || {}) };

  // Per-resident running state, seeded from kept assignments
  const target = {}, assigned = {}, typeCount = {}, traumaCount = {}, pedsCount = {}, nightCount = {}, nightOnly = {}, jcCount = {}, hoursTotal = {};
  // Yearly trauma-night count (published blocks this AY) — used only as a soft nudge to balance
  // trauma-night load between PGY-2/3 across the year (see traumaNightPgyPrefersDow in score()).
  const traumaNightYearly = {};
  // Whether this resident has already done (or is currently on) a Peds/Trauma-mix rotation this
  // AY — used only to lift the PED-N PGY-1 deprioritization in score() (see hasPriorPedsTrauma).
  // Precomputed once per resident (depends only on resident.blockType/blocksHistory/block, none of
  // which change mid-generation) rather than re-scanning blocksHistory on every score() call.
  const priorPedsTrauma = {};
  let keptManual = 0;
  for (const r of allResidents) {
    target[r.id] = getShiftTarget(r, appSettings);
    assigned[r.id] = 0;
    typeCount[r.id] = { day: 0, eve: 0, night: 0, swing: 0 };
    traumaCount[r.id] = 0;
    pedsCount[r.id] = 0;
    nightCount[r.id] = 0;
    hoursTotal[r.id] = 0;
    nightOnly[r.id] = isNightOnlyResident(r, eligOverrides);
    traumaNightYearly[r.id] = isTraumaCapSubject(r) ? countPublishedTraumaNights(r.id, block.academicYear, blocksHistory, block.id) : 0;
    priorPedsTrauma[r.id] = hasPriorPedsTrauma(r, blocksHistory, block, traumaBlocks);
    // Cross-block JC count (published blocks this AY) plus what's already kept in this block —
    // seeded once; kept assignments in `schedule[r.id]` are counted below via countCurrentBlockJC
    // rather than double-walking the loop, since that helper already knows how to find first
    // Tuesdays for this exact block.
    jcCount[r.id] = r.category === 'EM_HOME'
      ? countPublishedJC(r.id, block.academicYear, blocksHistory, block.id, ayConf) + countCurrentBlockJC(r.id, block, schedule, ayConf)
      : 0;
    for (const sid of Object.values(schedule[r.id])) {
      if (!sid) continue;
      assigned[r.id]++; keptManual++;
      const sh = SHIFT_MAP[sid];
      if (sh) typeCount[r.id][sh.type]++;
      if (sh?.area === 'TRAUMA') traumaCount[r.id]++;
      if (sh?.area === 'PED') pedsCount[r.id]++;
      if (sh?.type === 'night') nightCount[r.id]++;
      hoursTotal[r.id] += SHIFT_TIMING[sid]?.durationH || 0;
      if (sid === 'TRAUMA-N') traumaNightYearly[r.id] = (traumaNightYearly[r.id] || 0) + 1;
    }
  }
  const residentById = new Map(allResidents.map(r => [r.id, r]));
  // Every non-empty cell present in the incoming schedule BEFORE any fill pass runs — manual
  // entries (clearFirst:false) and partial-regenerate's locked/out-of-range cells alike (both
  // arrive via block.schedule, so this one set covers both UI paths by construction). The repair
  // pass (below, after the three fill passes) never touches these — same never-overwrite
  // invariant the fill passes themselves already honor for non-empty cells.
  const keptCells = new Set();
  for (const r of allResidents) {
    for (const ds of Object.keys(schedule[r.id])) {
      if (schedule[r.id][ds]) keptCells.add(`${r.id}|${ds}`);
    }
  }

  // Cross-block tail of the previous saved block's schedule, for the streak-hard-filter below —
  // NOT merged into `schedule` itself, since that would corrupt assigned/target counters.
  const prevTail = prevBlockTailSchedules(block, blocksHistory);
  const streakWalkBounds = streakBounds(block, prevTail);

  // Eligibility cache: eligCache[rid][ds] = Set of eligible shift ids
  const eligCache = {};
  for (const r of allResidents) {
    eligCache[r.id] = {};
    for (const ds of dates) eligCache[r.id][ds] = new Set(getEligibleShifts(r, ds, sd, eligOverrides, appSettings, dayRules, { blockStart: block.startDate, forGenerator: true, ayConf, twelveHourState: conf12For(ds) }));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: clearFirst ? 'regenerate' : 'fill',
    totalSlots: 0, keptManual, filled: 0, optionalFilled: 0,
    unfilled: [], underTarget: [], jeopardyPlacements: [], seniorGaps: [], restCompromises: [], repairs: [],
  };

  // streakBefore only looks at days strictly before ds, so its result can't change no matter
  // how many assignments happen ON ds — safe to compute once per (resident, day) and reuse
  // across every slot/candidate that day instead of re-walking up to 14 days each time. Uses
  // isStreakWorkDay (not a bare truthy-shift check) so GR/JC obligation days count the same way
  // the hard streak filter above does, and prevTail so a run continuing from the previous saved
  // block isn't undercounted right at the start of this one.
  let streakCache = {};
  function streakBefore(r, ds) {
    if (streakCache[r.id] !== undefined) return streakCache[r.id];
    let n = 0, d = parseDate(ds);
    const rPrevTail = prevTail[r.id] || null;
    while (n < 14) { d = addDays(d, -1); if (isStreakWorkDay(schedule[r.id], r, toDateStr(d), rPrevTail, streakWalkBounds)) n++; else break; }
    return streakCache[r.id] = n;
  }

  function hasSenior(shiftId, ds) {
    return allResidents.some(r => schedule[r.id][ds] === shiftId && isSeniorFor(SHIFT_MAP[shiftId].area, r));
  }
  const seniorGapKeys = new Set();
  // Peds class-balance (chief feedback): true if any resident (self or another) of this exact
  // category+PGY already has a Peds shift on ds — used to avoid stacking the same experience
  // level on consecutive peds days.
  function pedsClassOnDate(category, pgy, ds) {
    return allResidents.some(other => other.category === category && other.pgy === pgy && SHIFT_MAP[schedule[other.id]?.[ds]]?.area === 'PED');
  }
  // One full weekend off (chief feedback): true when ds falls in a weekend pair that's still
  // fully free for r AND it's the only such pair r has left — assigning here would consume it.
  // A resident who already has zero free weekends left isn't flagged again (nothing left to
  // protect); one with 2+ free weekends left is unaffected (plenty of headroom).
  function isLastFreeWeekend(r, ds) {
    const dow = parseDate(ds).getDay();
    if (dow !== 6 && dow !== 0) return false;
    const pair = blockWeekends.find(([sat, sun]) => sat === ds || sun === ds);
    if (!pair) return false;
    const [sat, sun] = pair;
    if (schedule[r.id][sat] || schedule[r.id][sun]) return false; // this weekend already broken
    const freeCount = blockWeekends.filter(([s, u]) => !schedule[r.id][s] && !schedule[r.id][u]).length;
    return freeCount === 1;
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
    // ACGME 80-hour rolling average, applied as a flat block-length cap (80/7 * block days) since
    // generateSchedule doesn't track week boundaries per resident — a soft over-cap in one week
    // balanced by a light one elsewhere still passes validateAll's own 4-week rolling check.
    const maxBlockHours = (80 / 7) * dates.length;
    pool = pool.filter(r => hoursTotal[r.id] + (SHIFT_TIMING[shift.id]?.durationH || 0) <= maxBlockHours);
    if (!pool.length) return { candidates: [], reason: 'hoursCapped' };
    if (isJcDay(ds) && shiftOverlapsJC(shift.id)) {
      pool = pool.filter(r => r.category !== 'EM_HOME' || jcCount[r.id] < JC_MAX_PER_AY);
      if (!pool.length) return { candidates: [], reason: 'jcCapped' };
    }
    if (shift.area === 'TRAUMA' && traumaCap > 0) {
      pool = pool.filter(r => !(isTraumaCapSubject(r) && traumaCount[r.id] >= traumaCap));
      if (!pool.length) return { candidates: [], reason: 'traumaCapped' };
    }
    // Protect the 8-trauma/11-peds split: a Trauma/Peds rotator can't consume the other half's
    // budget even though both halves share one combined 19-shift target.
    if (shift.area === 'TRAUMA') {
      pool = pool.filter(r => !(isTraumaPedsSplitResident(r, traumaBlocks) && traumaCount[r.id] >= TRAUMA_PEDS_SPLIT.trauma));
      if (!pool.length) return { candidates: [], reason: 'halfTargetMet' };
    }
    if (shift.area === 'PED') {
      pool = pool.filter(r => !(isTraumaPedsSplitResident(r, traumaBlocks) && pedsCount[r.id] >= TRAUMA_PEDS_SPLIT.peds));
      if (!pool.length) return { candidates: [], reason: 'halfTargetMet' };
    }
    if (enforceRest) {
      pool = pool.filter(r => checkRestViolations(r.id, ds, shift.id, schedule).length === 0);
      if (!pool.length) return { candidates: [], restFallback: [], reason: 'allRestBlocked' };
    }
    // Hard circadian rules only exclude here: >6-night run, eve→day-next-day (or reverse). The
    // 24h post-night rest preference (rule: 'postNightRest') is a ranked soft rule — violators
    // stay in the pool as `restFallback` rather than being excluded; fillDayPass decides whether
    // to use them, based on the chief's Soft Rule Priority order. Kept as a resident→violations
    // Map (not just an array) so both the O(n) re-lookup below and fillDayPass's restGapH tie-
    // break can reuse this one checkCircadianViolations pass per candidate instead of each
    // re-deriving it themselves.
    const circadianByResident = new Map(pool.map(r => [r, checkCircadianViolations(r, ds, shift.id, schedule[r.id], { nightOnly: nightOnly[r.id] })]));
    pool = pool.filter(r => circadianByResident.get(r).every(v => v.level !== 'error'));
    if (!pool.length) return { candidates: [], restFallback: [], reason: 'circadianBlocked' };
    // Block-wide night cap (Trauma Night counts too — it's type:'night' like the rest).
    if (SHIFT_MAP[shift.id]?.type === 'night') {
      pool = pool.filter(r => nightOnly[r.id] || nightCount[r.id] < NIGHT_RULES.maxPerBlock);
      if (!pool.length) return { candidates: [], restFallback: [], reason: 'nightCapped' };
    }
    if (shift.area === 'PED') {
      pool = pool.filter(r => !(isPedsEmMix(r) && pedsCount[r.id] >= PEDS_EM_MIX.max));
      if (!pool.length) return { candidates: [], restFallback: [], reason: 'pedsMixCapped' };
    }
    // Hard 6-consecutive-work-day rule (ACGME 1-in-7) — see isStreakWorkDay for what counts as
    // worked; prevTail lets the walk see a run continuing from the previous saved block.
    pool = pool.filter(r => runLengthIfWorked(schedule[r.id], r, ds, prevTail[r.id] || null, streakWalkBounds) <= MAX_CONSECUTIVE_WORK_DAYS);
    if (!pool.length) return { candidates: [], restFallback: [], reason: 'streakBlocked' };
    // Final split: candidates = clean of the postNightRest preference; restFallback = the same
    // survivors including rest-preference violators, for fillDayPass's priority-aware fallback.
    const restFallback = pool;
    const candidates = pool.filter(r => circadianByResident.get(r).every(x => x.rule !== 'postNightRest'));
    return { candidates, restFallback, reason: null, circadianByResident };
  }

  // Weights are ordered by priority, each comfortably larger than the sum below it so a
  // higher-priority factor always wins: hitting shift target (100) outranks night-run clustering
  // (40) and day/eve/night variety (20), which outranks trimming a long consecutive-workday
  // streak (15); avoiding a jeopardy-call date under 'warn' policy (50) sits between them since
  // it's a soft preference, not a hard rule (jeopardyPolicy 'block' already excludes the resident
  // entirely upstream, in getEligibleShifts). The trauma-nights-over-days preference (30) and
  // Peds/EM mix nudge (25) sit just below jeopardy avoidance; the "don't strand a short night
  // run" penalty (25) and FM-1 peds-fill-in discount (15) are minor tie-breaking preferences.
  // The trauma-night PGY/weekday preference (12) and its yearly-balance term (-2/night worked,
  // count clamped at 5 so it can't exceed -10 and stays below the 12 tier) are minor tie-breaks,
  // same tier as the FM-1 discount. The PED-N PGY-1 deprioritization (-25, same tier as the
  // "don't strand a short night run"/FM-1-peds-cap penalties) is likewise a soft nudge, not a
  // block — candidatePool never excludes an EM Home PGY-1 from PED-N, this only makes a PGY-2/3
  // or FM-3 candidate win the slot when one is also available. Math.random() only breaks exact ties.
  function score(r, shift, ds, seniorFilled) {
    const t = target[r.id];
    // t===0 can't reach this division — getShiftTarget never returns 0 (a delta that would zero
    // the target returns null instead, see its own comment), and null targets are filtered out of
    // every candidate BEFORE score() is ever called. Two of score()'s three call sites take only
    // candidatePool() output (fillDayPass's own pick, and repairPass's pickBestScore over
    // candidatePool candidates), so `target[r.id] != null` there is candidatePool's own
    // `pool.filter(r => target[r.id] != null)` guarantee. The THIRD call site — repairPass's
    // senior-gap juniors sort, `allResidents.filter(r => schedule[r.id][ds]===sid && movable(...))`
    // — does NOT go through candidatePool at all; it is safe only because movable() excludes
    // keptCells, so every resident it can select was placed by a PRIOR candidatePool call and
    // therefore already had a non-null target at placement time. Different invariant — don't
    // assume "candidatePool guarantees it" covers that call site too.
    const deficit = (t - assigned[r.id]) / t;
    const mixShare = typeCount[r.id][shift.type] / Math.max(1, assigned[r.id]);
    const streak = streakBefore(r, ds);
    const jeo = jeoPolicy === 'warn' && (r.jeopardyDates || []).includes(ds) ? 1 : 0;
    const dsDate = parseDate(ds); const dow = dsDate.getDay(); // parsed once — reused by the dow/adjacent-day terms below
    // PGY-2/3 should aim for trauma NIGHTS, using days only if necessary
    const traumaDaySenior = shift.id === 'TRAUMA-D' && r.category === 'EM_HOME' && r.pgy >= 2 ? 1 : 0;
    // Peds/EM PGY-2s should hit at least 10 peds shifts before other rotations sap the slot
    const pedsMixNeedsMore = shift.area === 'PED' && isPedsEmMix(r) && pedsCount[r.id] < PEDS_EM_MIX.min ? 1 : 0;
    // FM-1s default to POD; Peds is fill-in PRN only — once they're already at/above a soft
    // ~1/3-of-target ceiling, discourage further peds more strongly (chief feedback: don't let
    // them end up primarily peds). validateAll separately warns if this ceiling is exceeded.
    const fm1OnPeds = shift.area === 'PED' && r.category === 'FM' && r.pgy === 1 ? 1 : 0;
    const fm1Cap = getFm1PedsCap(t);
    const fm1OverPedsCap = fm1OnPeds && fm1Cap != null && pedsCount[r.id] >= fm1Cap ? 1 : 0;
    // PED-N Thu-Sun EM-Home opening (chief-directed, AY26/27): soft-deprioritize an EM Home PGY-1
    // candidate — not blocked, just less likely to be picked over a PGY-2/3 or FM-3 — unless
    // they've already done a Peds/Trauma-mix rotation this AY (see hasPriorPedsTrauma/BASE_ELIGIBILITY).
    const pedNPgy1Deprioritize = shift.id === 'PED-N' && r.category === 'EM_HOME' && r.pgy === 1 && !priorPedsTrauma[r.id] ? 1 : 0;
    // BAMC interns: prefer Flex/POD/Peds day shifts, especially Wednesday (chief feedback) —
    // the weakest of the new soft nudges, purely a tie-breaker.
    const bamcFlexPodPedsDay = r.category === 'EM_BAMC' && shift.type === 'day' && ['FLEX','POD','PED'].includes(shift.area) ? 1 : 0;
    const bamcWedBonus = bamcFlexPodPedsDay && dow === 3 ? 1 : 0;
    // Circadian night clustering: strongly prefer extending an existing night run over starting
    // an isolated one; avoid starting a run that can't reach the 4-night minimum; avoid placing
    // a non-night shift that would strand an existing short (1-3) night run mid-stretch. Beyond
    // that, prefer a resident end up with ONE night run per block — a 2nd separate run is
    // tolerated (mild discourage) but a 3rd+ is a strong discourage, since that's what produces
    // the "isolated night shift every other day" pattern chief flagged rather than one clean run.
    const runBefore = nightRunBefore(schedule[r.id], ds);
    let nightCluster = 0;
    if (shift.type === 'night') {
      if (runBefore > 0 && runBefore < NIGHT_RULES.maxRun) {
        nightCluster = 1;
      } else if (runBefore === 0) {
        const priorRunCount = nightRunSegments(schedule[r.id]).length;
        // Doubled from -0.5 (chief feedback: too-short night runs were still slipping through) —
        // now a stronger discourage than starting a 2nd separate run, since a run that structurally
        // can't reach minRun is worse than one that reaches it but isn't the resident's first.
        if ((t - assigned[r.id]) < NIGHT_RULES.minRun) nightCluster = -1.0;
        else if (priorRunCount >= 2) nightCluster = -1.5; // would start a 3rd+ separate run
        else if (priorRunCount === 1) nightCluster = -0.4; // would start a 2nd separate run
      }
    } else if (runBefore >= 1 && runBefore <= 3) {
      nightCluster = -0.625; // -25 at the 40-point scale below
    }
    // FLEX/POD seniority: boost the primary PGY when filling the (still-empty) senior slot;
    // once a senior is present, mildly discourage a second one so extra slots skew toward
    // PGY-1/off-service (candidatePool has already restricted the pool to seniors-only while
    // none is present, so this boost only ever matters among senior candidates at that point).
    const comp = SENIOR_COMPOSITION[shift.area];
    let seniorAdj = 0;
    if (comp) {
      if (!seniorFilled && r.category === 'EM_HOME' && r.pgy === comp.primary) seniorAdj = 1;
      else if (seniorFilled && isSeniorFor(shift.area, r)) seniorAdj = -0.6; // -12 at the 20-point scale below
    }
    // POD's 2nd/3rd slot preferentially goes to an EM Home/BAMC PGY-1 (soft, AY26/27 chief-
    // directed) — only once the PGY-3 requirement is already met by someone else in this slot
    // (seniorFilled), so this never competes with getting a senior placed in the first place.
    const podPgy1SecondSlot = shift.area === 'POD' && seniorFilled && isEmIntern(r) ? 1 : 0;
    // Mildly steer away from a resident's 3rd (final allowed) journal club this AY, once they're
    // already at 2 — candidatePool already hard-blocks a 4th.
    const jcNearCap = r.category === 'EM_HOME' && isJcDay(ds) && shiftOverlapsJC(shift.id) && jcCount[r.id] === 2 ? 1 : 0;
    // Trauma nights: prefer PGY-2 on Fri/Sat, PGY-3 on Sun/Mon (trauma_n_window already allows
    // any PGY-2/3 on any of the four nights — this only breaks ties toward the preferred
    // pairing), and mildly favor whichever senior has worked fewer trauma nights this academic
    // year so the load balances over time rather than per block.
    const traumaNightDowPref = shift.id === 'TRAUMA-N' && isTraumaCapSubject(r) && traumaNightPgyPrefersDow(r.pgy, dow) ? 1 : 0;
    // Clamp the yearly count so this stays a genuine minor tie-break: traumaNightYearly accumulates
    // across every published block in the AY, so unclamped it grows without bound and (at -2/night)
    // would eventually swamp the +12 dow-preference tier and even rival the 20/25 structural tiers,
    // steering a resident off TRAUMA-N purely on accrued load. Capped at 5 → term stays within -10.
    const traumaNightBalance = shift.id === 'TRAUMA-N' && isTraumaCapSubject(r) ? Math.min(traumaNightYearly[r.id] || 0, 5) : 0;
    // PGY-2/3 not already on a dedicated peds rotation should still pick up a few peds shifts a
    // block to fill gaps (chief feedback) — nudge decays to 0 once they reach generalPedsTarget.
    const generalPedsNudge = shift.area === 'PED' && isGeneralPedsCandidate(r, traumaBlocks) && pedsCount[r.id] < generalPedsTarget ? 1 : 0;
    // Peds class-balance: avoid stacking the same PGY class on consecutive peds days — mildly
    // discourage placing this class again the day right before/after another peds assignment
    // from the same class level.
    const pedsClassRepeat = shift.area === 'PED' && (
      pedsClassOnDate(r.category, r.pgy, toDateStr(addDays(dsDate, -1))) ||
      pedsClassOnDate(r.category, r.pgy, toDateStr(addDays(dsDate, 1)))
    ) ? 1 : 0;
    // One full weekend off: avoid spending a resident's last remaining free weekend when another
    // candidate has one to spare.
    const weekendOffRisk = enforceWeekendOff && isLastFreeWeekend(r, ds) ? 1 : 0;
    // No two EM interns (Home or BAMC PGY-1) on the same shift/team — strongly discouraged but
    // still fallback-allowed (candidatePool doesn't exclude on this; leaving the slot unfilled
    // would be worse than pairing two interns).
    const secondIntern = isEmIntern(r) && allResidents.some(other =>
      other.id !== r.id && isEmIntern(other) && schedule[other.id][ds] === shift.id) ? 1 : 0;
    // Tox residents' Mon/Tue window (em_tox_window/em_tox_window_aug26 shiftGates) already confines
    // WHEN they can work; this just nudges WHICH shift they land on within that window toward Peds
    // Evening specifically (chief: "ideally only evening peds") — soft preference only, doesn't
    // touch eligibility, so they remain free to fill whatever else the gates already allow.
    const toxPedsEvePref = shift.id === 'PED-E' && r.blockType === 'EM_TOX' ? 1 : 0;
    // Work-shape steering (Phase 1). The retrospective counterpart is workShapePenalty in
    // lib/scheduleQuality.js; this is the fill-time nudge so the greedy pass builds decent shape
    // directly instead of relying on best-of-N to stumble into it. Deliberately blind to shift
    // TYPE — nightCluster already owns night-run shaping at a far larger weight (40), and these
    // terms must not second-guess it.
    const prevDs = toDateStr(addDays(dsDate, -1));
    const nextDs = toDateStr(addDays(dsDate, 1));
    const prevSid = schedule[r.id][prevDs];
    const nextSid = schedule[r.id][nextDs];
    // Prefer extending an existing run over dropping an isolated shift into a gap. Binary, not a
    // count: two adjacent worked days is a resident working straight through, which the streak
    // penalty above already prices — this only distinguishes "attached to something" from "alone".
    const workContinuity = (prevSid || nextSid) ? 1 : 0;
    // Same AREA on an adjacent worked day. Counted per side (max 2), so a shift bridging two days
    // of the same area scores higher than one that churns on both sides.
    const areaContinuity =
      ((prevSid && SHIFT_MAP[prevSid]?.area === shift.area) ? 1 : 0) +
      ((nextSid && SHIFT_MAP[nextSid]?.area === shift.area) ? 1 : 0);
    // Don't butt a shift against time off (travel/rest day on either side of vacation or an
    // approved day off). Symmetric — no evidence yet that one side matters more.
    const offAdjacency =
      ((r.vacationDates || []).includes(prevDs) || (r.approvedDatesOff || []).includes(prevDs) ||
       (r.vacationDates || []).includes(nextDs) || (r.approvedDatesOff || []).includes(nextDs)) ? 1 : 0;

    // Weights come from SCORE_WEIGHTS (see its header for the STRUCTURAL/PREFERENCE tier split and
    // the invariant asserted in scoreWeights.test.js). Signs stay here at the use site, since the
    // sign is a property of how the term is applied, not of the weight's magnitude.
    const W = SCORE_WEIGHTS;
    return W.deficit * deficit + W.nightCluster * nightCluster - W.mixShare * mixShare
      - W.streakOver3 * Math.max(0, streak - 3) - W.jeopardy * jeo
      - W.traumaDaySenior * traumaDaySenior + W.pedsMixNeedsMore * pedsMixNeedsMore
      - W.fm1OnPeds * fm1OnPeds + W.seniorAdj * seniorAdj - W.jcNearCap * jcNearCap
      + W.traumaNightDowPref * traumaNightDowPref - W.traumaNightBalance * traumaNightBalance
      + W.generalPedsNudge * generalPedsNudge - W.pedsClassRepeat * pedsClassRepeat
      - W.weekendOffRisk * weekendOffRisk - W.secondIntern * secondIntern
      - W.fm1OverPedsCap * fm1OverPedsCap - W.pedNPgy1Deprioritize * pedNPgy1Deprioritize
      + W.bamcFlexPodPedsDay * bamcFlexPodPedsDay + W.bamcWedBonus * bamcWedBonus
      + W.podPgy1SecondSlot * podPgy1SecondSlot + W.toxPedsEvePref * toxPedsEvePref
      + W.workContinuity * workContinuity + W.areaContinuity * areaContinuity
      - W.offAdjacency * offAdjacency + rng();
  }

  // Fills one day's slots for a subset of SHIFTS. phase 'min' fills every shift up to its
  // configured minimum (a hard requirement — an empty pool here is reported as unfilled and
  // counts toward totalSlots). phase 'optional' then tops up toward each shift's maximum, but
  // only using headroom the 'allAtTarget' filter in candidatePool already provides (residents
  // still under their own target) — an empty pool here is silently skipped: the max is a cap
  // on how many CAN be assigned, not a requirement that they must be, so it's neither an
  // unfilled slot nor counted in totalSlots.
  function fillDayPass(ds, includeShift, phase) {
    streakCache = {};
    const slots = [];
    const dsDow = parseDate(ds).getDay();
    const conf12 = conf12For(ds);
    for (const shift of SHIFTS.filter(includeShift)) {
      if (SHIFT_DOW[shift.id] && !SHIFT_DOW[shift.id].includes(dsDow)) continue;
      const already = allResidents.filter(r => schedule[r.id][ds] === shift.id).length;
      // TRAUMA-D/TRAUMA-N are clamped to at most 1 inside getCoverageFor itself (single source of
      // truth shared with validateAll/computeCoverageByDate — see lib/coverage.js).
      const cov = getCoverageFor(shift.id, coverage, dsDow, conf12);
      if (phase === 'min') {
        // Count manual assignments that exceed configured coverage too, or totalSlots can end up
        // smaller than filled+keptManual (e.g. coverage set to 0 after a manual entry already
        // exists for that shift) and the report reads as internally inconsistent.
        report.totalSlots += Math.max(cov.min, already);
        for (let k = already; k < cov.min; k++) slots.push({ shift, slotIndex: k });
      } else {
        for (let k = Math.max(cov.min, already); k < cov.max; k++) slots.push({ shift, slotIndex: k });
      }
    }
    // MRV: fill the most-constrained shift first (fewest strict candidates as of the day start).
    // This pre-pass pool is ONLY a sort key — every shift's pool is computed against the same
    // start-of-day state, so it's fine as a rough ordering estimate but must NOT be reused for
    // the actual fill below: assigning shift A can remove a candidate from shift B's pool (e.g.
    // "already working today"), so each slot's real fill decision needs a fresh candidatePool
    // call against the current, mid-day state.
    const sortPool = {};
    for (const { shift } of slots) {
      if (sortPool[shift.id] == null) sortPool[shift.id] = candidatePool(shift, ds).candidates.length;
    }
    slots.sort((a, b) => sortPool[a.shift.id] - sortPool[b.shift.id]);

    // Rule ranks for this pass's priority-aware fallback decisions — larger index = less
    // important = broken first. Read once per day pass; cheap and appSettings doesn't change
    // mid-generation.
    const covRank = ruleRank(appSettings, 'coverageMin');
    const seniorRank = ruleRank(appSettings, 'seniorComposition');
    const restRank = ruleRank(appSettings, 'postNightRest');

    // Actual hours short of the 24h postNightRest target for candidate r, or null if r has no
    // such violation — used to break ties among restCompromise candidates by severity instead of
    // score() alone (see the selection loop below). Reads from candidatePool's own
    // circadianByResident Map rather than re-deriving checkCircadianViolations — that pool was
    // just computed fresh for this exact slot, so every candidate is already in it. A 'night'
    // placement can carry TWO independent postNightRest entries (an already-scheduled day shift
    // 1-2 days later, AND Grand Rounds the next morning — see checkCircadianViolations) — take
    // the smallest gapH (the worse of the two) so a candidate's severity reflects their worst
    // violation, not whichever entry happened to be pushed first.
    function restGapH(r, circadianByResident) {
      const v = circadianByResident.get(r) || [];
      const gaps = v.filter(x => x.rule === 'postNightRest' && typeof x.gapH === 'number').map(x => x.gapH);
      return gaps.length ? Math.min(...gaps) : null;
    }

    for (const slot of slots) {
      let { candidates, restFallback, reason, circadianByResident } = candidatePool(slot.shift, ds);
      let restCompromise = false;

      // If the clean pool is empty but a rest-violating pool exists, use it only when the chief
      // has ranked postNightRest below coverageMin (break the less important rule). Optional-
      // phase headroom is never worth a rest violation — restFallback only applies to 'min'.
      if (!candidates.length && phase === 'min' && restFallback?.length) {
        if (restRank > covRank) { candidates = restFallback; restCompromise = true; }
        else {
          report.unfilled.push({ dateStr: ds, shiftId: slot.shift.id, slotIndex: slot.slotIndex, reason: 'restProtected' });
          continue;
        }
      }
      if (!candidates.length) {
        if (phase === 'min') report.unfilled.push({ dateStr: ds, shiftId: slot.shift.id, slotIndex: slot.slotIndex, reason });
        continue;
      }
      // FLEX/POD seniority composition: while this shift/day has no senior yet, restrict to the
      // senior sub-pool if one exists. If none exists in the clean pool, check whether a senior
      // exists among restFallback's rest-preference violators BEFORE falling back to junior or
      // leaving the slot unfilled — otherwise the seniorComposition-vs-postNightRest tradeoff the
      // chief configures via Soft Rule Priority is silently skipped whenever a rest-clean junior
      // happens to exist (when restCompromise is already true, candidates === restFallback, so
      // seniorPool below would already have found a rest-violating senior — no separate check
      // needed in that case).
      // Computed once per slot (not per candidate below — it doesn't depend on the candidate). POD
      // doesn't use isSeniorFor('POD', r)'s generic PGY-3-primary/PGY-2-fallback membership here —
      // the AY26/27 hard rule (validateAll mirrors this) needs an EM Home PGY-3 specifically, with
      // a PGY-2 substitute allowed ONLY on the block's own PGY-3 Wellness Wednesday (see
      // podWellnessSubstituteAllowed) — so "filled" and candidate restriction get their own branch
      // below instead of sharing FLEX's soft, always-either-PGY generic logic.
      const isPod = slot.shift.area === 'POD';
      const podWellnessOk = isPod && podWellnessSubstituteAllowed(ds, block.startDate);
      const podSatisfies = r => r.category === 'EM_HOME' && (r.pgy === 3 || (podWellnessOk && r.pgy === 2));
      const seniorFilled = isPod
        ? allResidents.some(r => schedule[r.id][ds] === slot.shift.id && podSatisfies(r))
        : (SENIOR_COMPOSITION[slot.shift.area] ? hasSenior(slot.shift.id, ds) : null);
      if (isPod && !seniorFilled) {
        const pgy3Pool = candidates.filter(podSatisfies);
        if (pgy3Pool.length) {
          candidates = pgy3Pool;
        } else if (phase === 'min') {
          const candidateSet = new Set(candidates);
          const pgy3RestOnly = restCompromise ? [] : (restFallback || []).filter(r => podSatisfies(r) && !candidateSet.has(r));
          if (pgy3RestOnly.length && restRank > covRank) {
            // Same "break the least-important available rule" pattern as the postNightRest
            // fallback above — POD's PGY-3 requirement is hard (no seniorRank tradeoff, unlike
            // FLEX below), so postNightRest is the only rule left that can be broken to fill it.
            candidates = pgy3RestOnly;
            restCompromise = true;
          } else {
            // A rest-violating PGY-3 existed but Soft Rule Priority protects postNightRest over
            // coverageMin — that's 'restProtected' (the chief can fill this by reordering the
            // priority), not 'pgy3Required' (no PGY-3 existed at all, nothing to reorder).
            const reason = pgy3RestOnly.length ? 'restProtected' : 'pgy3Required';
            report.unfilled.push({ dateStr: ds, shiftId: slot.shift.id, slotIndex: slot.slotIndex, reason });
            continue;
          }
        } else {
          continue; // optional phase: max is a cap, not a requirement — same as other optional misses
        }
      } else if (SENIOR_COMPOSITION[slot.shift.area] && !seniorFilled) {
        const seniorPool = candidates.filter(r => isSeniorFor(slot.shift.area, r));
        if (seniorPool.length) {
          candidates = seniorPool;
        } else if (phase === 'min') {
          const candidateSet = new Set(candidates);
          const seniorRestOnly = restCompromise ? [] : (restFallback || []).filter(r => isSeniorFor(slot.shift.area, r) && !candidateSet.has(r));
          if (seniorRestOnly.length && restRank > seniorRank && restRank > covRank) {
            // Breaking postNightRest is the least-important option available among the three —
            // prefer a rest-violating senior over a rest-clean junior or leaving the slot empty.
            candidates = seniorRestOnly;
            restCompromise = true;
          } else if (seniorRank < covRank) {
            report.unfilled.push({ dateStr: ds, shiftId: slot.shift.id, slotIndex: slot.slotIndex, reason: 'seniorProtected' });
            continue;
          } else {
            const gapKey = `${ds}__${slot.shift.id}`;
            if (!seniorGapKeys.has(gapKey)) { seniorGapKeys.add(gapKey); report.seniorGaps.push({ dateStr: ds, shiftId: slot.shift.id }); }
          }
        } else {
          // Optional phase: max headroom is never worth a rest violation (matches candidatePool's
          // restFallback only ever being consulted in the 'min' phase) — always fall back to
          // junior and record the gap, same as before this fix.
          const gapKey = `${ds}__${slot.shift.id}`;
          if (!seniorGapKeys.has(gapKey)) { seniorGapKeys.add(gapKey); report.seniorGaps.push({ dateStr: ds, shiftId: slot.shift.id }); }
        }
      }
      // Selection: among the final candidate pool, prefer the smallest actual rest-hour shortfall
      // when this slot is being filled via a rest compromise — otherwise score() alone can pick a
      // candidate 22h short of rest over one only 1h short, purely by coincidence of unrelated
      // scoring factors (shift-count deficit, night clustering, etc.). Clean-pool picks are
      // unaffected by this branch entirely (restCompromise stays false, so score() alone decides
      // exactly as before this fix).
      let best = candidates[0], bestScore = -Infinity, bestGapH = restCompromise ? restGapH(best, circadianByResident) : null;
      for (const r of candidates) {
        const s = score(r, slot.shift, ds, seniorFilled);
        if (restCompromise) {
          const g = restGapH(r, circadianByResident);
          // Larger gapH (closer to the 24h target, less severe shortfall) wins first; score()
          // only breaks ties between candidates with an equally severe shortfall.
          if (bestGapH == null || (g != null && (g > bestGapH || (g === bestGapH && s > bestScore)))) {
            bestScore = s; bestGapH = g; best = r;
          }
        } else if (s > bestScore) {
          bestScore = s; best = r;
        }
      }
      schedule[best.id][ds] = slot.shift.id;
      assigned[best.id]++;
      hoursTotal[best.id] += SHIFT_TIMING[slot.shift.id]?.durationH || 0;
      typeCount[best.id][slot.shift.type]++;
      if (slot.shift.area === 'TRAUMA') traumaCount[best.id]++;
      if (slot.shift.area === 'PED') pedsCount[best.id]++;
      if (slot.shift.type === 'night') nightCount[best.id]++;
      if (slot.shift.id === 'TRAUMA-N') traumaNightYearly[best.id] = (traumaNightYearly[best.id] || 0) + 1;
      if (best.category === 'EM_HOME' && isJcDay(ds) && shiftOverlapsJC(slot.shift.id)) jcCount[best.id]++;
      if (jeoPolicy === 'warn' && (best.jeopardyDates || []).includes(ds)) {
        report.jeopardyPlacements.push({ residentId: best.id, name: `${best.firstName} ${best.lastName}`, dateStr: ds, shiftId: slot.shift.id });
      }
      if (restCompromise) {
        report.restCompromises.push({ residentId: best.id, name: `${best.firstName} ${best.lastName}`, dateStr: ds, shiftId: slot.shift.id });
      }
      if (phase === 'min') report.filled++; else report.optionalFilled++;
    }
  }

  // Bounded post-fill repair pass (only runs when `repair:true` is passed — generateScheduleBest
  // calls this once, on the winning seed, after best-of-N selection). Every move goes through the
  // SAME candidatePool the fill passes used (zero parallel rule implementation, zero rule drift)
  // and only ever admits clean `candidates` (never restFallback violators) — repair can fix a
  // compromise but never trade one soft-rule violation for another. `keptCells` (pre-existing
  // non-empty cells at seed time — manual entries AND partial-regenerate's locked/out-of-range
  // cells, both arrive via block.schedule) are never touched, matching the fill passes' own
  // never-overwrite invariant.
  function repairPass() {
    let budget = 300; // global cap on poolFor calls across every phase, so a stubborn block can't
                       // spin the repair pass indefinitely.

    function filledCount(sid, ds) {
      let n = 0;
      for (const r of allResidents) if (schedule[r.id][ds] === sid) n++;
      return n;
    }
    function minFor(sid, ds) {
      const dow = parseDate(ds).getDay();
      return getCoverageFor(sid, coverage, dow, conf12For(ds)).min;
    }
    function movable(rid, ds) { return !keptCells.has(`${rid}|${ds}`); }

    // Exact inverse of fillDayPass's commit block (L2894 area) — every counter it increments,
    // this decrements, term for term (including jcCount/traumaNightYearly, easy to miss).
    function unassignCell(rid, ds) {
      const sid = schedule[rid][ds];
      if (!sid) return null;
      delete schedule[rid][ds];
      assigned[rid]--;
      hoursTotal[rid] -= SHIFT_TIMING[sid]?.durationH || 0;
      const sh = SHIFT_MAP[sid];
      if (sh) typeCount[rid][sh.type]--;
      if (sh?.area === 'TRAUMA') traumaCount[rid]--;
      if (sh?.area === 'PED') pedsCount[rid]--;
      if (sh?.type === 'night') nightCount[rid]--;
      if (sid === 'TRAUMA-N') traumaNightYearly[rid] = (traumaNightYearly[rid] || 0) - 1;
      const r = residentById.get(rid);
      if (r?.category === 'EM_HOME' && isJcDay(ds) && shiftOverlapsJC(sid)) jcCount[rid]--;
      return sid;
    }
    function assignCell(rid, sid, ds) {
      schedule[rid][ds] = sid;
      assigned[rid]++;
      hoursTotal[rid] += SHIFT_TIMING[sid]?.durationH || 0;
      const sh = SHIFT_MAP[sid];
      if (sh) typeCount[rid][sh.type]++;
      if (sh?.area === 'TRAUMA') traumaCount[rid]++;
      if (sh?.area === 'PED') pedsCount[rid]++;
      if (sh?.type === 'night') nightCount[rid]++;
      if (sid === 'TRAUMA-N') traumaNightYearly[rid] = (traumaNightYearly[rid] || 0) + 1;
      const r = residentById.get(rid);
      if (r?.category === 'EM_HOME' && isJcDay(ds) && shiftOverlapsJC(sid)) jcCount[rid]++;
    }
    // streakCache is only valid within a single day's pass (see fillDayPass) — every call here
    // resets it first, since repair jumps between arbitrary dates, not one day at a time.
    function poolFor(shift, ds) {
      streakCache = {};
      budget--;
      return candidatePool(shift, ds);
    }
    function pickBestScore(pool, shift, ds) {
      const seniorFilled = SENIOR_COMPOSITION[shift.area] ? hasSenior(shift.id, ds) : null;
      let best = pool[0], bestScore = -Infinity;
      for (const r of pool) {
        const s = score(r, shift, ds, seniorFilled);
        if (s > bestScore) { bestScore = s; best = r; }
      }
      return best;
    }
    // Narrows a clean candidate pool by the same seniority requirement fillDayPass enforces —
    // candidatePool() itself doesn't know about POD/FLEX seniority composition (that narrowing is
    // fillDayPass's own extra layer), so without this, repair could place a junior into a POD slot
    // with no PGY-3 present, introducing a NEW hard validateAll error (confirmed empirically: a
    // Move A/B run without this narrowing did exactly that). POD is hard — if the shift/date has
    // no qualifying resident already and the pool has none either, this candidate can't fill it.
    // FLEX stays soft — prefer a senior when the pool has one, but junior fallback is still
    // admissible (matches fillDayPass's own soft fallback, and the resulting seniorGaps entry is
    // exactly what fillDayPass would have recorded — scored honestly by the quality vector either
    // way, not a hard error).
    function narrowForSeniority(pool, shift, ds) {
      if (shift.area === 'POD') {
        const podWellnessOk = podWellnessSubstituteAllowed(ds, block.startDate);
        const satisfies = r => r.category === 'EM_HOME' && (r.pgy === 3 || (podWellnessOk && r.pgy === 2));
        if (allResidents.some(r => schedule[r.id][ds] === shift.id && satisfies(r))) return pool;
        return pool.filter(satisfies);
      }
      if (SENIOR_COMPOSITION[shift.area] && !hasSenior(shift.id, ds)) {
        const seniors = pool.filter(r => isSeniorFor(shift.area, r));
        if (seniors.length) return seniors;
      }
      return pool;
    }
    // The donor-side twin of narrowForSeniority: vacating a cell can look like numeric surplus
    // (headcount above min) while the resident being removed was the shift's ONLY qualifying
    // PGY-3 — confirmed empirically: a Move A/B run without this check freed a POD-D slot whose
    // sole PGY-3 was the one being moved, leaving POD-D senior-less even though its headcount
    // stayed at min. Read against CURRENT schedule state (call after the tentative unassign, same
    // as the headcount check it accompanies) — true for every non-POD shift.
    function podStillSatisfied(shiftId, ds) {
      const shift = SHIFT_MAP[shiftId];
      if (shift?.area !== 'POD') return true;
      const podWellnessOk = podWellnessSubstituteAllowed(ds, block.startDate);
      const satisfies = r => r.category === 'EM_HOME' && (r.pgy === 3 || (podWellnessOk && r.pgy === 2));
      return allResidents.some(r => schedule[r.id][ds] === shiftId && satisfies(r));
    }

    // Phase 1 — unfilled min slots. Move A: same-day reassignment (someone already working a
    // different shift today switches to the unfilled shift). Move B: cross-day swap (someone
    // eligible but blocked today — at target, hours-capped — gets freed by vacating a genuinely
    // surplus cell elsewhere). Commit invariant: every shift touched — source AND destination,
    // every date — must sit at >= its own coverage min after the tentative mutation, or the move
    // reverts exactly. Every candidate pool is also run through narrowForSeniority (POD hard /
    // FLEX soft) so repair can't introduce a NEW hard error or bypass the seniority rule the fill
    // passes themselves enforce — generateScheduleBest's post-repair validateAll gate is still the
    // final backstop (discards the whole repaired result on any net regression), but this keeps
    // repair from routinely wasting its own attempts on moves that backstop would reject anyway.
    function repairUnfilledSlot(u) {
      const S = SHIFT_MAP[u.shiftId];
      if (!S) return false;
      const ds = u.dateStr;
      if (filledCount(S.id, ds) >= minFor(S.id, ds)) return true; // already fixed as a side effect

      const workingToday = allResidents.filter(r => schedule[r.id][ds] && movable(r.id, ds)).slice(0, 8);
      for (const r of workingToday) {
        if (budget <= 0) break;
        const tSid = unassignCell(r.id, ds);
        const { candidates: rawS } = poolFor(S, ds);
        const candidates = narrowForSeniority(rawS, S, ds);
        if (candidates.includes(r)) {
          assignCell(r.id, S.id, ds);
          if (filledCount(tSid, ds) >= minFor(tSid, ds) && podStillSatisfied(tSid, ds)) {
            // r's presence on T was headroom above T's own min (and, if T is POD, r wasn't its
            // only qualifying PGY-3) — a straight move, no backfill needed.
            report.optionalFilled = Math.max(0, report.optionalFilled - 1);
            report.repairs.push({ type: 'moveA', residentId: r.id, dateStr: ds, from: tSid, to: S.id });
            return true;
          }
          const tShift = SHIFT_MAP[tSid];
          const rawBackfill = tShift ? poolFor(tShift, ds) : { candidates: [] };
          const backfill = { candidates: tShift ? narrowForSeniority(rawBackfill.candidates, tShift, ds) : [] };
          if (backfill.candidates.length) {
            const winner = pickBestScore(backfill.candidates, tShift, ds);
            assignCell(winner.id, tSid, ds);
            report.repairs.push({ type: 'moveA', residentId: r.id, dateStr: ds, from: tSid, to: S.id, backfilledBy: winner.id });
            return true;
          }
          // T would drop below its own min with no one to backfill it — revert entirely.
          unassignCell(r.id, ds);
          assignCell(r.id, tSid, ds);
          continue;
        }
        assignCell(r.id, tSid, ds); // r isn't eligible for S — revert, try the next candidate.
        if (budget <= 0) break;
      }

      const eligibleNotWorking = allResidents.filter(r => eligCache[r.id][ds].has(S.id) && !schedule[r.id][ds]).slice(0, 8);
      for (const r of eligibleNotWorking) {
        if (budget <= 0) break;
        for (const ds2 of dates) {
          if (ds2 === ds || budget <= 0) continue;
          const sid2 = schedule[r.id][ds2];
          if (!sid2 || !movable(r.id, ds2)) continue;
          if (filledCount(sid2, ds2) <= minFor(sid2, ds2)) continue; // no headcount surplus to spare
          unassignCell(r.id, ds2);
          if (!podStillSatisfied(sid2, ds2)) { assignCell(r.id, sid2, ds2); continue; } // r was ds2's only PGY-3 — revert
          const { candidates: rawS } = poolFor(S, ds);
          const candidates = narrowForSeniority(rawS, S, ds);
          if (candidates.includes(r)) {
            assignCell(r.id, S.id, ds);
            report.optionalFilled = Math.max(0, report.optionalFilled - 1);
            report.repairs.push({ type: 'moveB', residentId: r.id, dateStr: ds, to: S.id, freedFrom: { dateStr: ds2, shiftId: sid2 } });
            return true;
          }
          assignCell(r.id, sid2, ds2); // revert, try the next donor date
        }
      }
      return false;
    }

    for (const u of [...report.unfilled]) {
      if (budget <= 0) break;
      // Moves can't change eligCache — a noEligible gap is structural, unfixable by rearrangement.
      if (u.reason === 'noEligible') continue;
      if (repairUnfilledSlot(u)) report.filled++;
    }
    // Re-derive which unfilled rows are still actually unfilled from the final schedule state —
    // report arrays are never authoritative after mutation (a row fixed as a side effect of a
    // DIFFERENT slot's repair must also drop here, not just the one repairUnfilledSlot directly
    // targeted).
    report.unfilled = report.unfilled.filter(u => filledCount(u.shiftId, u.dateStr) < minFor(u.shiftId, u.dateStr));

    // Phase 2 — rest compromises. Swap the violator out for a clean candidate if one exists now
    // (same shift/date, one out one in — coverage count is unchanged, no min-check needed).
    const restFixed = new Set();
    for (const c of [...report.restCompromises]) {
      if (budget <= 0) break;
      if (schedule[c.residentId]?.[c.dateStr] !== c.shiftId || !movable(c.residentId, c.dateStr)) continue;
      unassignCell(c.residentId, c.dateStr);
      const { candidates } = poolFor(SHIFT_MAP[c.shiftId], c.dateStr);
      if (candidates.length) {
        const winner = pickBestScore(candidates, SHIFT_MAP[c.shiftId], c.dateStr);
        assignCell(winner.id, c.shiftId, c.dateStr);
        restFixed.add(c);
        report.repairs.push({ type: 'clearRestCompromise', dateStr: c.dateStr, shiftId: c.shiftId, replacedResidentId: c.residentId, withResidentId: winner.id });
      } else {
        assignCell(c.residentId, c.shiftId, c.dateStr); // revert
      }
    }
    report.restCompromises = report.restCompromises.filter(c => !restFixed.has(c));

    // Phase 3 — senior gaps (FLEX only; POD's hard PGY-3 rule never produces a seniorGaps entry).
    // Try the lowest-scoring junior on that slot first (most "expendable" by the generator's own
    // scoring), 1-for-1 swap for a senior if one is available now.
    const gapFixed = new Set();
    for (const g of [...report.seniorGaps]) {
      if (budget <= 0) break;
      const shift = SHIFT_MAP[g.shiftId];
      if (!shift) continue;
      const juniors = allResidents
        .filter(r => schedule[r.id][g.dateStr] === g.shiftId && movable(r.id, g.dateStr))
        .sort((a, b) => score(a, shift, g.dateStr, false) - score(b, shift, g.dateStr, false));
      for (const junior of juniors) {
        if (budget <= 0) break;
        unassignCell(junior.id, g.dateStr);
        const { candidates } = poolFor(shift, g.dateStr);
        const seniors = candidates.filter(r => isSeniorFor(shift.area, r));
        if (seniors.length) {
          const winner = pickBestScore(seniors, shift, g.dateStr);
          assignCell(winner.id, g.shiftId, g.dateStr);
          gapFixed.add(g);
          report.repairs.push({ type: 'fillSeniorGap', dateStr: g.dateStr, shiftId: g.shiftId, replacedResidentId: junior.id, withResidentId: winner.id });
          break;
        }
        assignCell(junior.id, g.shiftId, g.dateStr); // revert, try the next junior
      }
    }
    report.seniorGaps = report.seniorGaps.filter(g => !gapFixed.has(g));
  }

  // Three passes over the whole block: everything else at minimum coverage first, then Trauma
  // Day at minimum last ("filling in PGY-1 trauma day shifts should be the final step of the
  // schedule"), then every shift's optional headroom up to its maximum. Minimums across the
  // whole block are satisfied before any optional slot can consume a resident's target headroom.
  // The first two passes partition SHIFTS disjointly, so report.totalSlots sums correctly.
  for (const ds of dates) fillDayPass(ds, s => s.id !== 'TRAUMA-D', 'min');
  for (const ds of dates) fillDayPass(ds, s => s.id === 'TRAUMA-D', 'min');
  for (const ds of dates) fillDayPass(ds, () => true, 'optional');
  if (repair) repairPass();

  report.underTarget = allResidents
    .filter(r => target[r.id] != null && isSchedulable(r) && assigned[r.id] < target[r.id])
    .map(r => ({
      residentId: r.id, name: `${r.firstName} ${r.lastName}`, assigned: assigned[r.id], target: target[r.id],
      ...(isTraumaPedsSplitResident(r, traumaBlocks) ? {
        traumaAssigned: traumaCount[r.id], traumaTarget: TRAUMA_PEDS_SPLIT.trauma,
        pedsAssigned: pedsCount[r.id], pedsTarget: TRAUMA_PEDS_SPLIT.peds,
      } : {}),
    }));

  return { schedule, report };
}

// Builds the input shape src/lib/scheduleQuality.js's computeQualityMetrics expects, from
// the same primitives generateSchedule itself used (getShiftTarget/isNightOnlyResident/
// getBlockWeekends) — keeps generator and quality-harness scoring inputs identical.
export function buildQualityInput({ schedule, report, allResidents, block, appSettings = {}, eligOverrides = {}, blocksHistory = [], ayConf = {} }) {
  const dates = getBlockDates(block.startDate, block.endDate);
  // AY-to-date carryover (Phase 2). Defaults to [] so every existing caller that doesn't pass
  // blocksHistory keeps today's exact block-only behavior — an empty map makes the carryover a
  // strict no-op inside computeQualityMetrics.
  const ay = block.academicYear || getAcademicYearFor(block.startDate);
  return {
    schedule,
    report,
    residents: allResidents,
    targets: Object.fromEntries(allResidents.map(r => [r.id, getShiftTarget(r, appSettings)])),
    // UNDELTA'D target per resident, for the AY carryover blend's scaledTarget (see
    // scheduleQuality.js's own comment on this param) — a one-block buy-down/buy-up must not
    // retroactively scale across prior blocks it never applied to. Computed by stripping
    // targetDelta off the same resident object getShiftTarget above just used, so this is the
    // exact base value that delta was added to/subtracted from.
    baselineTargets: Object.fromEntries(allResidents.map(r => [r.id, getShiftTarget({ ...r, targetDelta: undefined }, appSettings)])),
    nightOnlyIds: new Set(allResidents.filter(r => isNightOnlyResident(r, eligOverrides)).map(r => r.id)),
    nightRules: NIGHT_RULES,
    weekendPairs: getBlockWeekends(dates),
    // Passed rather than imported by scheduleQuality.js — see that module's header on why it must
    // never import from this file. Keeps the shape scorer's fragmentation floor in step with the
    // hard rule the generator and validateAll actually enforce.
    maxConsecutiveWorkDays: MAX_CONSECUTIVE_WORK_DAYS,
    ayPriorTotals: computeAyPriorTotals(ay, blocksHistory, block.id),
    ayCarryoverFullAt: AY_CARRYOVER_FULL_AT,
    // The scorer has to see the same coverage the generator saw. Without this it resolves every
    // 12h shift's DEFAULT_COVERAGE minimum on every date (~10 phantom unfillable slots/day) and
    // permanently disagrees with the generator it is scoring. Passed rather than imported for the
    // same circular-import reason as maxConsecutiveWorkDays above.
    ayConf,
  };
}

// Scores one generateSchedule() result the same way for every attempt in generateScheduleBest —
// (validateAll error count, export-blocking warning count, quality vector), the exact tuple
// betterQuality compares lexicographically. Quality is computed from the WHOLE final schedule
// (including any pre-existing kept cells) since those shift every resident's baseline counts —
// excluding them would distort deficit/spread/night-shape ordering and could pick the wrong
// winner (kept cells are identical across every attempt, so this never affects which attempt
// wins, only the absolute magnitude).
function scoreGenerationResult(res, args, rulePriority) {
  const dates = getBlockDates(args.block.startDate, args.block.endDate);
  const issues = validateAll(
    args.allResidents, res.schedule, args.block, args.eligOverrides,
    args.appSettings, args.dayRules, args.coverage, args.blocksHistory, args.ayConf
  );
  const errorCount = issues.filter(i => i.level === 'error').length;
  const blockingWarnCount = issues.filter(i => EXPORT_BLOCKING_RULE_IDS.has(i.rule)).length;
  const qInput = buildQualityInput({
    schedule: res.schedule, report: res.report, allResidents: args.allResidents,
    block: args.block, appSettings: args.appSettings, eligOverrides: args.eligOverrides,
    // AY-to-date carryover (Phase 2). args.blocksHistory is already threaded here for validateAll
    // above, so best-of-N selection now weighs year-to-date fairness with no new plumbing.
    blocksHistory: args.blocksHistory,
    ayConf: args.ayConf,
  });
  const metrics = computeQualityMetrics({
    ...qInput,
    dates,
    coverage: args.coverage,
    seniorGapCount: res.report.seniorGaps.length,
    restCompromiseCount: res.report.restCompromises.length,
  });
  return { errorCount, blockingWarnCount, qualityVector: computeQualityVector(metrics, rulePriority) };
}

// Best-of-N restart: runs generateSchedule `attempts` times with distinct seeds (generation is
// nondeterministic — score()'s tie-break addend — so different seeds can produce meaningfully
// different schedules), scores each with scoreGenerationResult, and keeps the strictly best
// result per betterQuality. One explicit baseSeed is generated per call (or accepted via opts)
// and persisted on the winning report alongside the winning seed + attempt index, so any result
// is replayable: `generateSchedule({...args, rng: mulberry32(report.seed)})` reproduces it.
//
// Repair runs once, AFTER selection: the winning seed is re-run with repair enabled (deterministic
// rng reproduces the exact same pre-repair schedule, then repair mutates from there) and the
// repaired result is adopted only on STRICT betterQuality improvement — a tie (or worse) keeps the
// unrepaired winner, since repair could otherwise trade away something the quality vector doesn't
// score for zero measured benefit.
export function generateScheduleBest(args, { attempts = 20, baseSeed, repair = true } = {}) {
  const resolvedBaseSeed = (baseSeed ?? Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
  const rulePriority = normalizeRulePriority(args.appSettings?.rulePriority);
  let best = null;

  for (let i = 0; i < attempts; i++) {
    const seed = (resolvedBaseSeed + i * 0x9E3779B9) >>> 0;
    const res = generateSchedule({ ...args, rng: mulberry32(seed), repair: false });
    if (!res) return null;
    const score = scoreGenerationResult(res, args, rulePriority);
    if (!best || betterQuality(score, best.score)) best = { seed, result: res, score };
  }

  if (repair) {
    const repaired = generateSchedule({ ...args, rng: mulberry32(best.seed), repair: true });
    const repairedScore = scoreGenerationResult(repaired, args, rulePriority);
    if (betterQuality(repairedScore, best.score)) best = { seed: best.seed, result: repaired, score: repairedScore };
  }

  best.result.report.attempts = attempts;
  best.result.report.baseSeed = resolvedBaseSeed;
  best.result.report.seed = best.seed;
  best.result.report.qualityVector = best.score.qualityVector;
  return best.result;
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
    // PED-N and PED-N-FM are now two separate single-owner ids (see PED_GUARD_LEGITIMATE_OWNER),
    // each confined to its own day-of-week window — PED-N-FM to FM-3's Mon/Tue/Wed (onlyDays),
    // PED-N to EM Home's Thu-Sun (ped_n_em_window). Re-derived from that data rather than
    // hardcoded per-id, so this stays correct if either window ever changes. A noEligible gap
    // INSIDE an id's own window is expected whenever its owning category isn't on this block or
    // isn't eligible that specific day — coverage stays min:0 either way ("ideally filled, other
    // shifts take priority," not required), so this whole path is only reachable at all after a
    // chief coverage edit raises one of these mins above 0. A gap OUTSIDE the window is a
    // different problem: the id is stripped to nothing for its owner (and everyone else) on that
    // weekday, so no one could ever fill it there — a coverage-editor mistake, not an expected gap.
    const PED_NIGHT_GAP_EXPECTED = {
      'PED-N-FM': { dows: [1,2,3],   owner: 'FM-3'    },
      'PED-N':    { dows: [0,4,5,6], owner: 'EM Home' },
    };
    const pedNightExpected = PED_NIGHT_GAP_EXPECTED[shiftId];
    const isPedNExpected = !!pedNightExpected && noElig.length > 0 && noElig.length === slots.length;
    const structural = isPedNExpected || (noElig.length > 0 && noElig.length === slots.length && gapDows.length < 7 &&
      noElig.every(s => gapDows.includes(dow(s.dateStr))));

    const recs = [];
    const label = SHIFT_MAP[shiftId]?.label || shiftId;
    if (reasonCounts.noEligible) {
      const pedNInWindow = isPedNExpected && gapDows.every(d => pedNightExpected.dows.includes(d));
      const gapDaysStr = gapDows.map(d => DOW_NAMES[d]).join('/');
      recs.push(isPedNExpected
        ? (pedNInWindow
            ? `${label} is ${pedNightExpected.owner}-exclusive on ${gapDaysStr} — these gaps mean no ${pedNightExpected.owner} resident is on this block / eligible those days. Expected, coverage min is 0. Leave open or assign manually.`
            : `${label} doesn't exist on ${gapDaysStr} at all — set its coverage minimum back to 0 or check the day rules.`)
        : structural
        ? `${label} had no eligible residents on ${gapDows.map(d=>DOW_NAMES[d]).join('/')} — a day-of-week rule blocks everyone (e.g. Trauma window, GR Wednesday, BAMC Thursday). If that's expected, no action needed; otherwise edit the rule on this tab.`
        : `No resident in this block is eligible for ${label} on those days — check the Shift Matrix and each resident's rotation (EM Residents tab).`);
    }
    if (reasonCounts.allAtTarget) recs.push(`Everyone eligible for ${label} had already reached their shift target — raise targets in Settings → Shift Targets, or lower ${label} coverage above.`);
    if (reasonCounts.allRestBlocked) recs.push(`All eligible residents were blocked by the rest-period rule — rearrange nearby night shifts manually, or Generate again (tie-breaking is randomized, a different arrangement may fit).`);
    if (reasonCounts.allWorking) recs.push(`Everyone eligible for ${label} was already working that day — add residents to this block or reduce same-day coverage.`);
    if (reasonCounts.selfCoverOnly) recs.push(`Only self-scheduling residents (no shift target, e.g. Peds) are eligible for ${label} — assign them manually in the grid, or set ${label} coverage to 0.`);
    if (reasonCounts.traumaCapped) recs.push(`Eligible EM PGY-2/3s hit the trauma cap (${getTraumaCap(appSettings)}/block) — raise the cap in Settings or cover with a trauma-block PGY-1.`);
    if (reasonCounts.pedsMixCapped) recs.push(`Peds/EM residents have hit their ${PEDS_EM_MIX.max}-peds-shift cap — cover ${label} with other peds-eligible residents.`);
    if (reasonCounts.streakBlocked) recs.push(`All eligible residents would have exceeded ${MAX_CONSECUTIVE_WORK_DAYS} consecutive work days — rearrange days off nearby, or Generate again.`);
    if (reasonCounts.halfTargetMet) recs.push(`Trauma/Peds rotators had already completed their ${TRAUMA_PEDS_SPLIT.trauma}-trauma/${TRAUMA_PEDS_SPLIT.peds}-peds half targets — remaining ${label} slots need another eligible resident, assigned manually.`);
    if (reasonCounts.circadianBlocked) recs.push(`All eligible residents were blocked by a hard circadian rule (max ${NIGHT_RULES.maxRun} consecutive nights, or no evening→day-next-day turnaround) — rearrange nearby nights manually, or Generate again.`);
    if (reasonCounts.nightCapped) recs.push(`Eligible residents were already at the ${NIGHT_RULES.maxPerBlock}-night/block cap — spread nights across more residents, or cover ${label} manually.`);
    if (reasonCounts.jcCapped) recs.push(`Eligible EM Home residents were already at ${JC_MAX_PER_AY} Journal Clubs worked this academic year (counts Published blocks) — cover ${label} with a resident under the cap.`);
    if (reasonCounts.restProtected) recs.push(`Left unfilled to protect the 24h post-night rest preference — filling ${label} here would have required a resident under ${NIGHT_RULES.postNightDayRestH}h off after a night shift. Reorder Soft Rule Priority on the Rules tab to allow this, or assign manually.`);
    if (reasonCounts.seniorProtected) recs.push(`Left unfilled to protect FLEX/POD senior composition — no senior PGY was eligible for ${label}. Reorder Soft Rule Priority on the Rules tab to staff a junior instead, or assign manually.`);
    if (reasonCounts.pgy3Required) recs.push(`No EM Home PGY-3 (or, on the block's own PGY-3 Wellness Wednesday, PGY-2 substitute) was eligible for ${label} — this shift hard-requires one, no fallback. Assign one manually.`);
    if (reasonCounts.hoursCapped) recs.push(`Eligible residents were already within reach of the ACGME 80h/week average for this block — cover ${label} with a resident further from the cap, or assign manually.`);

    return { shiftId, slots, reasonCounts, structural, gapDows, recommendations: recs };
  }).sort((a, b) => (a.structural ? 1 : 0) - (b.structural ? 1 : 0));
}

// ─── PDF EXPORT ─────────────────────────────────────────────────────────────
// jsPDF's built-in fonts are WinAnsi-encoded — never put "★" or other non-cp1252 glyphs into
// doc.text()/autoTable cells, or it corrupts the line's letter spacing. Plain ASCII only.

function pdfSave(doc, filename) {
  // No try/catch here: a failure has no reason to succeed on a same-arguments retry (there's
  // nothing left to fall back to once the iframe branch's own popup-blocked handling has already
  // run), so this lets the error propagate to the caller, which shows the chief a toast instead
  // of either silently doing nothing or crashing uncaught with zero feedback.
  if (window.self !== window.top) {
    // iframe embeds (e.g. Teams): blob URL opened in a new tab, since doc.save() is blocked
    const blob = doc.output('blob');
    const url  = URL.createObjectURL(blob);
    const a    = window.open(url, '_blank');
    if (!a) {
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.download = filename;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } else {
    doc.save(filename);
  }
}

// jsPDF's built-in fonts only render Windows-1252 (WinAnsi) glyphs correctly -- anything outside
// that range (CJK, Cyrillic, emoji, the star glyph U+2605) corrupts the WHOLE LINE's letter
// spacing, not just the one offending character (see the file-header comment above). Resident/
// block/category names are free-text and chief-entered, with no charset restriction, so always
// sanitize before handing them to doc.text()/autoTable. The final catch-all allows \xA0-\xFF
// through (Latin-1 Supplement, which maps identically onto cp1252's own \xA0-\xFF and is
// genuinely WinAnsi-safe \u2014 e.g. the "\u00b7" middle dot at U+00B7) rather than restricting to bare
// ASCII, or already-safe pre-existing punctuation in this file would get needlessly mangled to
// "?". NFKD-normalize + strip combining diacritics still runs first as a readable fallback for
// scripts outside Latin-1 entirely (e.g. Vietnamese/Central European diacritics).
function pdfSafeText(str) {
  if (str == null) return str;
  return String(str)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // combining diacritics stripped by NFKD
    .replace(/[\u2018\u2019]/g, "'")                   // smart single quotes
    .replace(/[\u201c\u201d]/g, '"')                   // smart double quotes
    .replace(/[\u2013\u2014]/g, '-')                   // en/em dash
    .replace(/\u2026/g, '...')                         // ellipsis
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');           // anything still outside WinAnsi-safe range
}

function pdfPageHeader(doc, title, subtitle) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(49, 46, 129); doc.rect(0, 0, W, 22, 'F');
  doc.setFillColor(99, 102, 241); doc.rect(0, 22, W, 1.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
  doc.text(pdfSafeText(title), 12, 14);
  if (subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(200, 200, 245); doc.text(pdfSafeText(subtitle), 12, 20); }
  doc.setTextColor(25, 35, 55);
}
function pdfPageFooter(doc, left) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  doc.setFontSize(7); doc.setTextColor(150, 160, 175);
  if (left) doc.text(pdfSafeText(left), 12, H - 6);
  doc.text('Page ' + doc.internal.getCurrentPageInfo().pageNumber, W - 12, H - 6, { align: 'right' });
}

// Demo Sandbox: a visible red banner drawn just below pdfPageHeader's bar so a demo-mode PDF
// export can never be mistaken for the real thing. Callers that draw this must also push their
// table's startY down by the same amount (see exportMatrixPDF/exportResidentCalendarPDF) to
// avoid overlapping the banner.
const PDF_DEMO_BANNER_H = 6;
function pdfDemoBanner(doc) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(220, 38, 38); doc.rect(0, 23.5, W, PDF_DEMO_BANNER_H, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
  doc.text(pdfSafeText('DEMO — NOT THE REAL SCHEDULE'), W / 2, 23.5 + PDF_DEMO_BANNER_H - 1.7, { align: 'center' });
  doc.setTextColor(25, 35, 55);
}

// Raw RGB, derived from AREA_COLORS (see CONSTANTS section) — the single source of truth for
// shift-area color. jsPDF can't consume Tailwind classes, so this pulls just the RGB tuples out.
const PDF_AREA_LIGHT = Object.fromEntries(
  Object.entries(AREA_COLORS).map(([area, c]) => [area, c.pdfLight])
);

// Shared by every export path (PDF/ICS/CSV/backup) so a demo-mode file's name always signals
// it's not the real schedule — see DEMO SANDBOX section.
function demoFilenameSuffix(demoMode) {
  return demoMode ? '-demo' : '';
}

// Residents × dates matrix — the primary PDF deliverable. Landscape A3 since a ~28-day block's
// date columns don't fit legibly on letter/A4.
function exportMatrixPDF({ block, allResidents, schedule, demoMode }) {
  const dates = getBlockDates(block.startDate, block.endDate);
  if (!dates.length) return;
  const sched = schedule || {};

  const head = ['Resident', ...dates.map(formatDisplayDate)];

  const body = [];
  const rowMeta = []; // parallel to body rows: {isDivider:true} or {isDivider:false, cells:[sid|null,...]}
  for (const cat of CATEGORIES) {
    const members = allResidents.filter(r => r.category === cat.id);
    if (!members.length) continue;
    body.push([pdfSafeText(cat.label), ...dates.map(()=>'')]);
    rowMeta.push({ isDivider: true });
    for (const r of members) {
      const rs = sched[r.id] || {};
      body.push([pdfSafeText(`${r.lastName}, ${r.firstName}`), ...dates.map(ds => rs[ds] || '')]);
      rowMeta.push({ isDivider: false, cells: dates.map(ds => rs[ds] || null) });
    }
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  const dateRange = block.startDate && block.endDate ? `${prettyDate(block.startDate)} to ${prettyDate(block.endDate)}` : '';
  pdfPageHeader(doc, `EM Residency Schedule — ${block.name || 'Block'}`, dateRange);
  if (demoMode) pdfDemoBanner(doc);

  doc.autoTable({
    head: [head],
    body,
    startY: demoMode ? 28 + PDF_DEMO_BANNER_H : 28,
    theme: 'grid',
    margin: { left: 8, right: 8, ...(demoMode ? { top: 23.5 + PDF_DEMO_BANNER_H + 2 } : {}) },
    styles: { fontSize: 6, cellPadding: 1, overflow: 'ellipsize', lineColor: [203,213,225], lineWidth: 0.1 },
    headStyles: { fillColor: [51,65,85], textColor: 255, fontSize: 6 },
    columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold' } },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const meta = rowMeta[data.row.index];
      if (!meta) return;
      if (meta.isDivider) {
        data.cell.styles.fillColor = [71, 85, 105];
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = 'bold';
        return;
      }
      if (data.column.index > 0) {
        const sid = meta.cells[data.column.index - 1];
        const area = sid ? SHIFT_MAP[sid]?.area : null;
        if (area && PDF_AREA_LIGHT[area]) data.cell.styles.fillColor = PDF_AREA_LIGHT[area];
        else {
          const dow = parseDate(dates[data.column.index - 1]).getDay();
          if (dow === 0 || dow === 6) data.cell.styles.fillColor = [241, 245, 249];
        }
      }
    },
    didDrawPage: () => { if (demoMode) pdfDemoBanner(doc); pdfPageFooter(doc, `${allResidents.length} residents · Generated ${new Date().toLocaleString()}`); },
  });

  pdfSave(doc, `schedule_matrix_${block.startDate || 'block'}${demoFilenameSuffix(demoMode)}.pdf`);
}

// One page per schedulable resident: Date/Shift/Time/Notes rows for the whole block. Notes
// carries the same OFF/jeopardy/JC-presenting/GR weekly attendance/GR-lecture/Wellness Wednesday
// markers ResidentCardsView shows on screen. Portrait letter — simpler than a week-quadrant
// calendar layout, and sufficient for a take-home schedule printout.
function exportResidentCalendarPDF({ block, allResidents, schedule, demoMode, dayRules }) {
  const dates = getBlockDates(block.startDate, block.endDate);
  if (!dates.length) return;
  const sched = schedule || {};
  const schedulable = allResidents.filter(isSchedulable);
  if (!schedulable.length) return;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  schedulable.forEach((r, i) => {
    if (i > 0) doc.addPage();
    const rs = sched[r.id] || {};
    pdfPageHeader(doc, `${r.lastName}, ${r.firstName} — PGY-${r.pgy}`, block.name || '');
    if (demoMode) pdfDemoBanner(doc);

    const wwOrdinal = r.category==='EM_HOME'
      ? (getEffectiveDayRules(`${r.category}_${r.pgy}`, dayRules||{}).computedDayRules||[]).find(c=>c.type==='wellnessWednesday')?.ordinal
      : null;

    const rows = dates.map(ds => {
      const sid = rs[ds] || null;
      const dow = parseDate(ds).getDay();
      const isOff = (r.approvedDatesOff||[]).includes(ds);
      const isVac = (r.vacationDates||[]).includes(ds);
      const notes = [];
      if (isOff) notes.push('OFF');
      if (isVac) notes.push('VAC');
      if ((r.jeopardyDates||[]).includes(ds)) notes.push('Jeopardy');
      if ((r.jcPresentDates||[]).includes(ds)) notes.push('JC presenting');
      if ((r.grLectureDates||[]).includes(ds)) notes.push('GR lecture');
      if (grWorkDow(r)===dow && !isOff && !isVac) notes.push('Grand Rounds');
      if (dow===3 && wwOrdinal!=null && ds===nthWeekdayOnOrAfter(block.startDate, 3, wwOrdinal)) notes.push('Wellness Wednesday');
      return [
        formatDisplayDate(ds),
        sid ? (SHIFT_MAP[sid]?.label || sid) : '-',
        sid ? (SHIFT_MAP[sid]?.hours || '') : '',
        notes.join(', '),
      ];
    });

    doc.autoTable({
      head: [['Date', 'Shift', 'Time', 'Notes']],
      body: rows,
      startY: demoMode ? 28 + PDF_DEMO_BANNER_H : 28,
      ...(demoMode ? { margin: { top: 23.5 + PDF_DEMO_BANNER_H + 2 } } : {}),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51,65,85] },
      didDrawPage: () => { if (demoMode) pdfDemoBanner(doc); pdfPageFooter(doc, `${r.lastName}, ${r.firstName}`); },
    });
  });

  pdfSave(doc, `schedule_by_resident_${block.startDate || 'block'}${demoFilenameSuffix(demoMode)}.pdf`);
}

// RFC 5545 text escaping — backslash, semicolon, comma, and embedded newlines all need escaping
// inside an ICS content line's value.
function icsEscape(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// "Floating local time" basic ICS timestamp (YYYYMMDDTHHMMSS — no trailing Z, no TZID) — these
// are wall-clock hospital shift times, deliberately timezone-naive. `dateObj` supplies Y/M/D,
// `hourFloat` supplies H/M/S (fractional hours, same representation SHIFT_TIMING uses elsewhere).
function icsStamp(dateObj, hourFloat) {
  const y = dateObj.getFullYear();
  const mo = String(dateObj.getMonth() + 1).padStart(2, '0');
  const da = String(dateObj.getDate()).padStart(2, '0');
  const hh = Math.floor(hourFloat) % 24;
  const mm = Math.round((hourFloat - Math.floor(hourFloat)) * 60);
  return `${y}${mo}${da}T${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}00`;
}

// One VCALENDAR (as a string) per resident — one VEVENT per assigned shift. Mirrors
// exportResidentCalendarPDF's date iteration and Notes-marker logic, and buildQGendaCSVRows'
// midnight-rollover handling (SHIFT_TIMING-derived start/duration, end date bumped a day when
// startH+durationH >= 24), but neither of those is modified — this is new, standalone code.
function buildResidentICS(resident, dates, sched, demoMode, dayRules, blockStart) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//resident-scheduler//EN', 'CALSCALE:GREGORIAN'];
  const wwOrdinal = resident.category==='EM_HOME'
    ? (getEffectiveDayRules(`${resident.category}_${resident.pgy}`, dayRules||{}).computedDayRules||[]).find(c=>c.type==='wellnessWednesday')?.ordinal
    : null;

  for (const ds of dates) {
    const sid = sched[ds];
    if (!sid) continue;
    const t = SHIFT_TIMING[sid];
    const startH = t?.startH;
    const durationH = t?.durationH;
    if (startH == null || durationH == null) continue; // no timing data — nothing safe to emit

    const startDateObj = parseDate(ds);
    const dow = startDateObj.getDay();
    const rollsOver = (startH + durationH) >= 24;
    const endDateStr = rollsOver ? toDateStr(addDays(startDateObj, 1)) : ds;
    const endDateObj = parseDate(endDateStr);
    const endHour = rollsOver ? (startH + durationH - 24) : (startH + durationH);

    const isOff = (resident.approvedDatesOff || []).includes(ds);
    const isVac = (resident.vacationDates || []).includes(ds);
    const notes = [];
    if (isOff) notes.push('OFF');
    if (isVac) notes.push('VAC');
    if ((resident.jeopardyDates || []).includes(ds)) notes.push('Jeopardy');
    if ((resident.jcPresentDates || []).includes(ds)) notes.push('JC presenting');
    if ((resident.grLectureDates || []).includes(ds)) notes.push('GR lecture');
    if (grWorkDow(resident)===dow && !isOff && !isVac) notes.push('Grand Rounds');
    if (blockStart && dow===3 && wwOrdinal!=null && ds===nthWeekdayOnOrAfter(blockStart, 3, wwOrdinal)) notes.push('Wellness Wednesday');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${resident.id}-${ds}-${sid}@resident-scheduler${demoFilenameSuffix(demoMode)}`);
    lines.push(`DTSTART:${icsStamp(startDateObj, startH)}`);
    lines.push(`DTEND:${icsStamp(endDateObj, endHour)}`);
    lines.push(`SUMMARY:${icsEscape(`${demoMode ? '[DEMO] ' : ''}${SHIFT_MAP[sid]?.label || sid}`)}`);
    lines.push(`LOCATION:${icsEscape(SHIFT_MAP[sid]?.area || '')}`);
    lines.push(`DESCRIPTION:${icsEscape(notes.join(', '))}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
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

// Renders the CHANGELOG entries a viewer hasn't acknowledged yet. Dismissing stores only the
// NEWEST id, so skipping three releases and reading them together still marks all three read.
// **bold** is the only markup supported — deliberately, so entries stay plain strings that can't
// inject markup into the page.
function WhatsNewModal({ entries, onClose }) {
  const renderText = text => text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-gray-800">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
  return (
    <Modal title="What's new" onClose={onClose} wide>
      <div className="space-y-5">
        {entries.map(e => (
          <div key={e.id}>
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-sm font-semibold text-gray-800">{e.title}</h3>
              <span className="text-xs text-gray-400">{formatDisplayDate(e.date)}</span>
            </div>
            <ul className="space-y-1.5">
              {e.items.map((it, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-600 leading-relaxed">
                  <span className="text-primary shrink-0 mt-0.5">•</span>
                  <span>{renderText(it)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex justify-end pt-1">
          <button onClick={onClose}
            className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded-lg font-medium transition-colors">
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Button primitive — token-first, replaces the divergent hand-rolled "secondary button" looks
// scattered across the file (header export buttons, schedule-grid toolbar, save-before-switch
// modal). Existing call sites are NOT migrated yet (later work) — this just defines the primitive.
const BUTTON_VARIANTS = {
  primary:       'bg-primary hover:bg-primary/90 text-primary-foreground',
  secondary:     'bg-card border border-border text-foreground/80 hover:bg-accent',
  danger:        'bg-destructive hover:bg-destructive/90 text-destructive-foreground',
  dangerOutline: 'bg-card border border-border text-foreground/80 hover:bg-accent hover:border-destructive/50 hover:text-destructive',
  ghost:         'text-muted-foreground hover:bg-accent hover:text-foreground',
};
const BUTTON_SIZES = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-1.5 text-sm',
};
function Button({ variant = 'secondary', size = 'md', icon: Icon, children, className = '', ...rest }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary} ${BUTTON_SIZES[size] || BUTTON_SIZES.md} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 13 : 14} />}
      {children}
    </button>
  );
}

// Standardized confirm-overlay primitive — same scrim opacity as Modal (bg-black/50), NOT the
// black/40 used by the two hand-rolled overlays elsewhere in this file. Not adopted anywhere yet;
// a later work package migrates those two hand-rolled overlays onto this. Deliberately not built
// on top of Modal — different anatomy (icon+title header, actions footer vs close-button header).
const CONFIRM_TONE_ICON = {
  warn:   'bg-amber-50 text-amber-700',
  danger: 'bg-destructive/10 text-destructive',
  info:   'bg-primary/10 text-primary',
};
function ConfirmDialog({ icon: Icon, tone = 'warn', title, children, actions }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          {Icon && (
            <div className={`p-2 rounded-lg shrink-0 ${CONFIRM_TONE_ICON[tone] || CONFIRM_TONE_ICON.warn}`}>
              <Icon size={18}/>
            </div>
          )}
          <h2 className="text-base font-semibold text-card-foreground pt-1">{title}</h2>
        </div>
        <div className="px-5 pb-4 text-sm text-muted-foreground">{children}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          {actions}
        </div>
      </div>
    </div>
  );
}

// Shared confirm dialog for wiping a block's shift assignments — used by both the Dashboard's
// Current Block card and ScheduleGrid's toolbar so the two surfaces can't drift on copy/behavior.
function ClearScheduleConfirm({ blockName, hasSnapshot, onConfirm, onClose }) {
  return (
    <ConfirmDialog icon={Trash2} tone="danger" title="Clear all shift assignments?"
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="danger" size="sm" icon={Trash2} onClick={onConfirm}>Clear Schedule</Button>
        </>
      }>
      <p>This clears all shift assignments on <strong className="text-foreground">{blockName || 'the current block'}</strong> — including ones you entered manually. Residents, rotations, dates, and days off are kept. This cannot be undone.</p>
      {hasSnapshot && <p className="mt-2">The saved copy is not changed until you save again.</p>}
    </ConfirmDialog>
  );
}

function ResetBlockConfirm({ onConfirm, onClose }) {
  return (
    <ConfirmDialog icon={RefreshCw} tone="danger" title="Reset this block?"
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="danger" size="sm" icon={RefreshCw} onClick={onConfirm}>Reset Block</Button>
        </>
      }>
      <p>Clears schedule, off-service residents, rotation assignments, and special days. Keeps name, dates, and academic year. Saved copy untouched until you save again.</p>
    </ConfirmDialog>
  );
}

// Header micro-timeline — thin block-progress bar fed by getBlockProgress() (see UTILITIES
// section). pct is already elapsed/total as a rounded percentage, so the fill's own right edge
// marks "today" — no separate tick mark needed on top of it.
function BlockProgressBar({ block }) {
  const progress = getBlockProgress(block?.startDate, block?.endDate);
  if (!progress) return null;
  const pct = Math.max(0, Math.min(100, progress.pct));
  return (
    <div className="flex flex-col justify-center gap-1 w-full"
      title={`Day ${progress.elapsed} of ${progress.total} · ${progress.remaining} remaining`}>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }}/>
      </div>
    </div>
  );
}

// Dashboard summary tile — ported from the sibling em-scheduler app.
function StatCard({ label, value, sub, icon: Icon, tone = "neutral", bar = null }) {
  const toneBg = {
    primary: "bg-primary/10 text-primary",
    success: "bg-green-50 text-green-700",
    warn:    "bg-amber-50 text-amber-700",
    danger:  "bg-destructive/10 text-destructive",
    neutral: "bg-muted text-muted-foreground",
  }[tone] || "bg-muted text-muted-foreground";
  const barColor = {
    primary: "bg-primary",
    success: "bg-green-500",
    warn:    "bg-amber-500",
    danger:  "bg-destructive",
    neutral: "bg-muted-foreground",
  }[bar?.color] || "bg-muted-foreground";
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${toneBg}`}>
        {Icon && <Icon size={18}/>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 font-medium">{label}</div>
        <div className="text-2xl font-semibold text-gray-900 mt-0.5 tabular-nums font-mono">{value}</div>
        {bar && (
          <div className="h-1.5 rounded-full bg-gray-100 mt-1.5 overflow-hidden" title={bar.title || undefined}>
            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                 style={{ width: `${Math.max(0, Math.min(100, bar.pct || 0))}%` }}/>
          </div>
        )}
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// Autosave pill — always shows the local-only "Saving…"/"Saved locally" behavior, plus (when
// cloud sync is configured — see SUPABASE SYNC) a cloud-aware "Loading…"/"Synced"/"Sync error"
// state layered on top.
function AutosaveIndicator({ state, cloudEnabled, dbStatus, dbError }) {
  const saving = state === 'saving' || (cloudEnabled && dbStatus === 'saving');
  if (cloudEnabled && dbStatus === 'loading') {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-gray-400">
        <RefreshCw size={11} className="animate-spin"/> Loading…
      </span>
    );
  }
  if (cloudEnabled && dbStatus === 'error') {
    return (
      <span title={dbError} className="flex items-center gap-1 text-[11px] font-medium text-red-500">
        <AlertCircle size={11}/> Sync error
      </span>
    );
  }
  return (
    <span title={cloudEnabled ? 'Synced across your devices' : "Data auto-saved to this browser's local storage"}
      className={`flex items-center gap-1 text-[11px] font-medium ${saving ? 'text-amber-600' : 'text-gray-400'}`}>
      {saving ? <RefreshCw size={11} className="animate-spin"/> : <CheckCircle size={11}/>}
      {saving ? 'Saving…' : (cloudEnabled ? 'Synced' : 'Saved locally')}
    </span>
  );
}

// Snapshot state (compared against this block's saved copy on the Dashboard) — distinct from
// AutosaveIndicator above, which reflects browser/cloud persistence and is always "safe" either way.
const SAVE_STATE_PILL = {
  never: { text: 'Not saved yet', className: 'bg-amber-500/10 text-amber-600' },
  dirty: { text: 'Unsaved changes', className: 'bg-amber-500/10 text-amber-600' },
  saved: { text: 'Saved', className: 'bg-muted text-muted-foreground' },
};
function SaveStatePill({ state }) {
  const s = SAVE_STATE_PILL[state] || SAVE_STATE_PILL.never;
  return (
    <span title="Compared against this block's saved copy on the Dashboard. Autosave (top right) covers your browser/cloud copy either way."
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${s.className}`}>
      {state === 'dirty' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500"/>}
      {s.text}
    </span>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const s = { amber:'bg-amber-50 border-amber-300 text-amber-800', red:'bg-red-50 border-red-300 text-red-800', green:'bg-green-50 border-green-300 text-green-800' };
  return (
    <div className={`no-print fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium border ${s[toast.tone] || s.amber}`}>
      <span>{toast.msg}</span>
      <button onClick={onClose} className="ml-1 opacity-50 hover:opacity-100"><X size={14}/></button>
    </div>
  );
}

// Segmented-control tab switcher for sub-views within a tab (e.g. Schedule's Grid/By Resident).
function SubTabs({ value, onChange, options }) {
  return (
    <div className="inline-flex flex-wrap max-w-full items-center gap-1 p-1 bg-gray-200/70 rounded-lg mb-4">
      {options.map(o => {
        const Ic = o.icon;
        const active = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${active ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>
            {Ic && <Ic size={14}/>}
            {o.label}
            {typeof o.badge !== 'undefined' && o.badge > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded tabular-nums font-mono ${active ? 'bg-gray-200 text-gray-600' : 'bg-gray-300/70 text-gray-600'}`}>{o.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-card-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// Collapsible variant of SectionCard — same styling, toggleable body, default open.
// `action` (e.g. Save/New buttons) sits in the header and won't trigger the toggle.
// Collapsible header button shared by CollapsibleCard and any custom multi-section card
// (e.g. DashboardTab's Current Block) that needs the same toggle but a body CollapsibleCard's
// single padded div can't express.
function CollapsibleHeader({ title, subtitle, action, open, onToggle }) {
  // A real <button> here would make any button inside `action` (e.g. DashboardTab's Save Block/
  // New Block) an invalid nested <button>, which React flags as a hydration error — role="button" +
  // keyboard handling keeps this toggle accessible without nesting interactive elements.
  return (
    <div role="button" tabIndex={0} onClick={onToggle}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      className="w-full px-5 py-4 border-b border-border flex items-start justify-between gap-3 hover:bg-accent transition-colors text-left cursor-pointer">
      <div>
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-card-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {action && <span onClick={e => e.stopPropagation()} className="flex items-center gap-2">{action}</span>}
        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}/>
      </div>
    </div>
  );
}

function CollapsibleCard({ title, subtitle, children, action, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm overflow-hidden">
      <CollapsibleHeader title={title} subtitle={subtitle} action={action} open={open} onToggle={() => setOpen(p => !p)}/>
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
          className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
        <button onClick={add} disabled={!newDate}
          className="text-xs px-2.5 py-1 bg-primary hover:bg-primary/90 text-white rounded-lg disabled:opacity-30 transition-colors font-medium">
          Add
        </button>
      </div>
    </div>
  );
}

// Date-range chips (start→end), used for off-service "available only part of the block".
function AvailabilityRangesEditor({ ranges = [], onUpdate }) {
  const [start, setStart] = useState('');
  const [end, setEnd]     = useState('');

  function add() {
    if (!start || !end || start > end) return;
    onUpdate([...ranges, { start, end }]);
    setStart(''); setEnd('');
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-0.5">Available Date Ranges</p>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
        {ranges.length === 0
          ? <span className="text-xs text-gray-300 italic">None set</span>
          : ranges.map((rg, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
              {formatDisplayDate(rg.start)} → {formatDisplayDate(rg.end)}
              <button onClick={() => onUpdate(ranges.filter((_, idx) => idx !== i))} className="hover:opacity-60 transition-opacity">
                <X size={10}/>
              </button>
            </span>
          ))
        }
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <input type="date" value={start} onChange={e => setStart(e.target.value)}
          className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
        <span className="text-xs text-gray-400">→</span>
        <input type="date" value={end} onChange={e => setEnd(e.target.value)}
          className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
        <button onClick={add} disabled={!start || !end || start > end}
          className="text-xs px-2.5 py-1 bg-primary hover:bg-primary/90 text-white rounded-lg disabled:opacity-30 transition-colors font-medium">
          Add
        </button>
      </div>
    </div>
  );
}

// ─── DASHBOARD TAB ────────────────────────────────────────────────────────────

// Planning card: every Journal Club date of the academic year with its PGY-1/2/3 presenter, plus
// each EM Home resident's worked-JC count against the 3/AY cap. Presenters are assignable inline
// here (the resident-profile chip editor still works too) — both write the same
// resident.jcPresentDates field, so there is no second source of truth. Dates come from
// resolveJcDates, so a chief-edited list and the derived first-Tuesday default look identical
// here. Self-contained so promoting it to its own tab later is just a TABS entry + routing line.
function JournalClubPlanner({ allResidents, block, blocksHistory, ayConf = {}, onAssignPresenter }) {
  const win = ayWindowFor(block.academicYear);
  const emHome = allResidents.filter(r => r.category === 'EM_HOME');

  if (!win) {
    return (
      <CollapsibleCard title="Journal Club">
        <p className="text-xs text-gray-400 italic">Set this block's academic year (Settings) to plan Journal Club.</p>
      </CollapsibleCard>
    );
  }

  const jcDates = resolveJcDates(block.academicYear, ayConf, { fallbackDateStr: block.startDate });
  const today = toDateStr(new Date());
  // How many dates each resident already presents this AY — surfaced in the dropdown so the chief
  // can see who is already committed before creating the once-per-AY conflict validateAll warns on.
  const presentingCount = {};
  for (const r of emHome) presentingCount[r.id] = (r.jcPresentDates || []).filter(d => d >= win.start && d < win.end).length;
  const workedCount = {};
  for (const r of emHome) workedCount[r.id] = countPublishedJC(r.id, block.academicYear, blocksHistory, block.id, ayConf) + countCurrentBlockJC(r.id, block, block.schedule || {}, ayConf);

  return (
    <CollapsibleCard title="Journal Club" subtitle={`${block.academicYear} · ${jcDates.length} date${jcDates.length === 1 ? '' : 's'}, 18:00–21:00 · dates are edited on the AY card above`}>
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-100">
                <th className="py-1 pr-3 font-medium">Date</th>
                <th className="py-1 pr-3 font-medium">PGY-1</th>
                <th className="py-1 pr-3 font-medium">PGY-2</th>
                <th className="py-1 pr-3 font-medium">PGY-3</th>
              </tr>
            </thead>
            <tbody>
              {jcDates.map(ds => {
                const inBlock = block.startDate && block.endDate && ds >= block.startDate && ds <= block.endDate;
                const isPast = ds < today;
                return (
                  <tr key={ds} className="border-b border-gray-50">
                    <td className="py-1 pr-3 whitespace-nowrap">
                      {formatDisplayDate(ds)}
                      {inBlock && <span className="ml-1.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-primary/10 text-primary">this block</span>}
                    </td>
                    {[1,2,3].map(pgy => {
                      const presenters = jcPresentersFor(emHome, ds, pgy);
                      const pool = emHome.filter(r => r.pgy === pgy);
                      // More than one presenter for the same PGY can only arrive from the profile
                      // editor (this select assigns exactly one). Keep surfacing it as the red
                      // conflict validateAll already warns about rather than silently showing one.
                      const conflicted = presenters.length > 1;
                      const selected = presenters.length === 1 ? presenters[0].id : '';
                      if (!onAssignPresenter) {
                        return (
                          <td key={pgy} className="py-1 pr-3">
                            {presenters.length === 0 ? (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isPast ? 'bg-gray-100 text-gray-400' : 'bg-amber-50 text-amber-600'}`}>unassigned</span>
                            ) : (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${conflicted ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                {presenters.map(p => `${p.lastName}, ${p.firstName}`).join(' + ')}
                              </span>
                            )}
                          </td>
                        );
                      }
                      const cls = conflicted ? 'border-red-300 bg-red-50 text-red-700'
                        : presenters.length === 1 ? 'border-green-200 bg-green-50 text-green-700'
                        : isPast ? 'border-gray-200 bg-gray-50 text-gray-400'
                        : 'border-amber-200 bg-amber-50 text-amber-700';
                      return (
                        <td key={pgy} className="py-1 pr-3">
                          <select value={conflicted ? '' : selected}
                            onChange={e => onAssignPresenter(ds, pgy, e.target.value || null)}
                            title={conflicted ? `${presenters.map(p => `${p.lastName}, ${p.firstName}`).join(' + ')} — more than one presenter set; choosing one here replaces them all` : undefined}
                            className={`text-[10px] font-medium border rounded px-1 py-0.5 max-w-[11rem] focus:outline-none focus:ring-1 focus:ring-primary ${cls}`}>
                            <option value="">{conflicted ? `⚠ ${presenters.length} presenters` : 'unassigned'}</option>
                            {pool.map(r => (
                              <option key={r.id} value={r.id}>
                                {r.lastName}, {r.firstName}
                                {presentingCount[r.id] > 0 && !presenters.some(p => p.id === r.id) ? ' · already presenting' : ''}
                                {` · ${workedCount[r.id]}/${JC_MAX_PER_AY} worked`}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {jcDates.length === 0 && (
                <tr><td colSpan={4} className="py-2 text-gray-400 italic">No Journal Club dates set for this academic year.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1.5">Worked Journal Clubs this AY (cap {JC_MAX_PER_AY})</div>
          <div className="flex flex-wrap gap-1.5">
            {emHome.map(r => {
              const count = workedCount[r.id];
              const cls = count > JC_MAX_PER_AY ? 'bg-red-50 text-red-600' : count === JC_MAX_PER_AY ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600';
              return (
                <span key={r.id} className={`text-[10px] font-medium px-2 py-1 rounded-full ${cls}`}>
                  {r.lastName}, {r.firstName} · {count}/{JC_MAX_PER_AY}
                </span>
              );
            })}
            {emHome.length === 0 && <span className="text-xs text-gray-400 italic">No EM Home residents on this roster.</span>}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">Only Published saved blocks (Dashboard tab) plus the current block count toward this cap.</p>
        </div>
      </div>
    </CollapsibleCard>
  );
}

// Jeopardy/sick-call incident log + advisory buy-down ledger for this block's AY. ADVISORY ONLY:
// this card displays earned/spent/remaining credits and nothing here writes to a target or
// schedule — see src/lib/jeopardyLedger.js's own header for why (auto-applying would change
// generator output without an explicit chief decision, the same restraint override capture takes
// with block.overrideLog). The chief SPENDS an earned credit by hand, on the EM Residents tab's
// existing Target Δ / buy-down fields (block.emBlockAssignments[id].targetDelta +
// targetIsBuyDown) — computeBuyDownsApplied reads those back in, so this card and that editor can
// never disagree about how many credits are left.
//
// Mirrors JournalClubPlanner's state-writing discipline directly above: writes go through a
// FUNCTIONAL setAppSettings updater keyed by the incident's own id, never by reading
// appSettings.jeopardyLog out of this render's own closure and rebuilding it — the same reason
// JournalClubPlanner updates emRoster via a functional setter matched by resident id instead of
// rebuilding from the derived allResidents memo. A stale closure here would silently drop a
// concurrent add/delete.
function JeopardySickCallsCard({ allResidents, block, blocksHistory, appSettings, setAppSettings }) {
  const ay = block.academicYear || (block.startDate ? getAcademicYearFor(block.startDate) : null);
  const log = Array.isArray(appSettings?.jeopardyLog) ? appSettings.jeopardyLog : [];

  const [date, setDate] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [sickResidentId, setSickResidentId] = useState('');
  const [activatedResidentId, setActivatedResidentId] = useState('');
  const [note, setNote] = useState('');

  const byId = useMemo(() => Object.fromEntries((allResidents || []).map(r => [r.id, r])), [allResidents]);
  // Residents whose OWN jeopardyDates includes the chosen date — surfaced as a hint in the
  // "pulled off jeopardy" select, never hard-validated: real life will have someone pulled who
  // wasn't formally on the list, and this must never block logging that.
  const onJeopardyThisDate = useMemo(() => {
    if (!date) return new Set();
    return new Set((allResidents || []).filter(r => (r.jeopardyDates || []).includes(date)).map(r => r.id));
  }, [allResidents, date]);

  // A residentId in the log may no longer be on the roster (departed, or an off-service resident
  // who only ever existed inside an old block) — the incident is history and must survive a
  // roster change rather than crash or silently vanish. Same "Unknown resident" spirit as
  // summarizeOverrides above, but identifiable enough to still be useful in a long-lived ledger.
  const residentLabel = (id) => {
    const r = byId[id];
    return r ? `${r.lastName}, ${r.firstName}` : `Former resident (${String(id).slice(0, 8)})`;
  };

  if (!ay) {
    return (
      <CollapsibleCard title="Jeopardy & Sick Calls">
        <p className="text-xs text-gray-400 italic">Set this block's academic year (Settings) to track jeopardy activations.</p>
      </CollapsibleCard>
    );
  }

  const ledger = computeLedger(ay, log, block, blocksHistory);
  const ayLog = log
    .filter(rec => {
      if (!rec || typeof rec.date !== 'string') return false;
      let recAy;
      try { recAy = getAcademicYearFor(rec.date); } catch { return false; }
      return recAy === ay;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.at || 0) - (a.at || 0));
  const ledgerRows = Object.entries(ledger).sort((a, b) => residentLabel(a[0]).localeCompare(residentLabel(b[0])));

  function addIncident() {
    if (!date || !sickResidentId) return;
    const rec = {
      id: uuid(), date, shiftId: shiftId || null, sickResidentId,
      activatedResidentId: activatedResidentId || null, note: note.trim(), at: Date.now(),
    };
    setAppSettings(p => ({ ...p, jeopardyLog: [...(Array.isArray(p.jeopardyLog) ? p.jeopardyLog : []), rec] }));
    setDate(''); setShiftId(''); setSickResidentId(''); setActivatedResidentId(''); setNote('');
  }

  function removeIncident(id) {
    setAppSettings(p => ({ ...p, jeopardyLog: (Array.isArray(p.jeopardyLog) ? p.jeopardyLog : []).filter(r => r.id !== id) }));
  }

  return (
    <CollapsibleCard title="Jeopardy & Sick Calls"
      subtitle={`${ay} · ${ayLog.length} incident${ayLog.length === 1 ? '' : 's'} · advisory only`}>
      <div className="space-y-4">
        <p className="text-xs text-gray-400">
          Log every sick call and jeopardy activation here. Each activation earns the activated resident a
          buy-down credit, tracked below — spend it later on the EM Residents tab's <strong>Target Δ</strong> field,
          checked <strong>buy-down</strong>. Nothing here auto-applies to any target or schedule.
        </p>

        {/* Add-incident form */}
        <div className="flex flex-wrap items-end gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"/>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Shift (optional)</label>
            <select value={shiftId} onChange={e => setShiftId(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary max-w-[9rem]">
              <option value="">—</option>
              {SHIFTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Called out sick</label>
            <select value={sickResidentId} onChange={e => setSickResidentId(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary max-w-[11rem]">
              <option value="">Select resident…</option>
              {(allResidents || []).map(r => <option key={r.id} value={r.id}>{r.lastName}, {r.firstName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Pulled off jeopardy (optional)</label>
            <select value={activatedResidentId} onChange={e => setActivatedResidentId(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary max-w-[13rem]">
              <option value="">Nobody / self-covered</option>
              {(allResidents || []).map(r => (
                <option key={r.id} value={r.id}>
                  {r.lastName}, {r.firstName}{onJeopardyThisDate.has(r.id) ? ' · on jeopardy this date' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Note</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note"
              className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"/>
          </div>
          <button onClick={addIncident} disabled={!date || !sickResidentId}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-white rounded-lg disabled:opacity-30 transition-colors">
            <Plus size={11}/> Add
          </button>
        </div>

        {/* Incident list, newest first */}
        {ayLog.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No incidents logged for {ay} yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {ayLog.map(rec => (
              <li key={rec.id} className="py-2 flex items-start gap-2 text-xs">
                <span className="text-gray-400 shrink-0 w-20">{formatDisplayDate(rec.date)}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-700">{residentLabel(rec.sickResidentId)}</span> called out sick
                  {rec.shiftId && <> on <span className="font-medium">{SHIFT_MAP[rec.shiftId]?.label || rec.shiftId}</span></>}
                  {rec.activatedResidentId
                    ? <> — <span className="font-medium text-teal-700">{residentLabel(rec.activatedResidentId)}</span> activated</>
                    : <span className="text-gray-400"> — nobody activated</span>}
                  {rec.note && <span className="block text-gray-400 mt-0.5">{rec.note}</span>}
                </div>
                <button onClick={() => removeIncident(rec.id)} title="Delete incident"
                  className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0">
                  <Trash2 size={12}/>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Per-resident rollup */}
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1.5">Ledger this AY</div>
          {ledgerRows.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Nothing logged yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ledgerRows.map(([rid, l]) => (
                <span key={rid} className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600"
                  title={`Sick calls ${l.sickCalls} · Activations ${l.activations} · Buy-downs applied ${l.applied} · Remaining ${l.remaining}`}>
                  {residentLabel(rid)} · sick {l.sickCalls} · act {l.activations} · applied {l.applied} · remaining {l.remaining}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </CollapsibleCard>
  );
}

// Read-only fairness/equity card: per-schedulable-resident nights/weekends/hours/area-mix totals
// for the current block's academic year. Combines PUBLISHED blocksHistory snapshots in that AY
// (same iteration/guard pattern as countPublishedJC — skip unpublished, skip the live block's own
// id, defensive optional-chaining against untrusted snapshot shape) with the live block's own
// schedule (same idea as countCurrentBlockJC), except walking every assigned date rather than
// only first-Tuesdays. Display-only — no editing affordances, no updateBlock calls.
function EquityPanel({ allResidents, block, blocksHistory }) {
  const ay = block.academicYear;

  const stats = useMemo(() => {
    const residents = allResidents.filter(isSchedulable);
    const byId = {};
    for (const r of residents) {
      byId[r.id] = { resident: r, nights: 0, weekends: 0, hours: 0, areaMix: {} };
    }
    if (!ay) return { rows: [], nightsMedian: 0, weekendsMedian: 0 };

    function tally(residentId, dateStr, sid) {
      const row = byId[residentId];
      if (!row || !sid) return;
      if (isNightShiftId(sid)) row.nights++;
      const dow = parseDate(dateStr).getDay();
      if (dow === 0 || dow === 6) row.weekends++;
      row.hours += SHIFT_TIMING[sid]?.durationH || 0;
      const area = SHIFT_MAP[sid]?.area;
      if (area) row.areaMix[area] = (row.areaMix[area] || 0) + 1;
    }

    for (const snap of blocksHistory) {
      if (!snap?.published || snap.id === block.id) continue;
      if ((snap.academicYear || snap.data?.academicYear) !== ay) continue;
      const schedule = snap.data?.schedule || {};
      for (const residentId of Object.keys(byId)) {
        const rs = schedule?.[residentId];
        if (!rs) continue;
        for (const ds of Object.keys(rs)) tally(residentId, ds, rs[ds]);
      }
    }

    // Live (unsaved) block's own schedule — not itself a published snapshot yet.
    const liveSchedule = block.schedule || {};
    for (const residentId of Object.keys(byId)) {
      const rs = liveSchedule[residentId];
      if (!rs) continue;
      for (const ds of Object.keys(rs)) tally(residentId, ds, rs[ds]);
    }

    const rows = Object.values(byId);
    const median = arr => {
      if (arr.length === 0) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
    };

    return { rows, nightsMedian: median(rows.map(r => r.nights)), weekendsMedian: median(rows.map(r => r.weekends)) };
  }, [allResidents, blocksHistory, block, ay]);

  if (!ay) {
    return (
      <CollapsibleCard title="Equity — Nights, Weekends & Hours">
        <p className="text-xs text-gray-400 italic">Set this block's academic year (Settings) to see equity stats.</p>
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard title="Equity — Nights, Weekends & Hours (this AY)"
      subtitle={`${ay} · counts published saved blocks (Dashboard tab) plus the current block`}>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {stats.rows.map(({ resident: r, nights, weekends, hours, areaMix }) => {
            const isOutlier = (stats.nightsMedian > 0 && nights > 1.5 * stats.nightsMedian) ||
              (stats.weekendsMedian > 0 && weekends > 1.5 * stats.weekendsMedian);
            const cls = isOutlier ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-50 text-gray-600 border border-gray-200';
            const mixStr = Object.entries(areaMix).sort((a, b) => b[1] - a[1]).map(([area, n]) => `${area} ${n}`).join(' · ');
            return (
              <span key={r.id} className={`text-[10px] font-medium px-2 py-1 rounded-full ${cls}`} title={mixStr || 'No shifts assigned this AY'}>
                {r.lastName}, {r.firstName} · {nights}N · {weekends}WE · {hours}h{mixStr ? ` · ${mixStr}` : ''}
              </span>
            );
          })}
          {stats.rows.length === 0 && <span className="text-xs text-gray-400 italic">No schedulable residents on this roster.</span>}
        </div>
        <p className="text-[10px] text-gray-400">
          Amber = nights or weekends exceed 1.5× the group median (median {stats.nightsMedian} night{stats.nightsMedian !== 1 ? 's' : ''} ·{' '}
          {stats.weekendsMedian} weekend{stats.weekendsMedian !== 1 ? 's' : ''}). Only Published saved blocks plus the current block count.
        </p>
      </div>
    </CollapsibleCard>
  );
}

// ─── YEAR CALENDAR (Dashboard) ─────────────────────────────────────────────
// July→July block calendar with global (day-strip) and granular (per-shift heatmap) coverage
// visualization. Read-only over blocksHistory + the live block — never mutates a snapshot;
// "Open Block"/"Publish" delegate entirely to the already-existing loadBlock/toggleBlockPublished
// handlers (unsaved-work guard, hydrate, tab switch, published flag all live there already).

// Same red/amber/green precedence the Schedule grid's coverage footer uses (belowMin > aboveMax
// > ok), plus a 4th "gray" state for a day with nothing scheduled at all yet — so a block that
// hasn't been generated reads as "not started" rather than a wall of false-alarm red.
function coverageDayStatus(cov) {
  if (!cov) return 'gray';
  if (cov.filled === 0 && cov.minTotal > 0) return 'gray';
  if (cov.belowMin.length) return 'red';
  if (cov.aboveMax.length) return 'amber';
  return 'green';
}
// Per-shift-cell version of the same 3(+1)-state read, mirroring the coverage footer's per-shift
// expansion row (`info.count<info.min` / `>info.max`) but adding the same "gray = nothing to show"
// case (no requirement AND nothing assigned) instead of that row's plain neutral gray-400 text.
function shiftCellStatus(info) {
  if (!info) return 'gray';
  if (info.count === 0 && info.min === 0) return 'gray';
  if (info.count < info.min) return 'red';
  if (info.count > info.max) return 'amber';
  return 'green';
}
const COVERAGE_DOT_CLASS = { red: 'bg-destructive', amber: 'bg-amber-500', green: 'bg-green-500', gray: 'bg-muted' };
// Dark-mode-safe tint for the month-grid day cells below — a flat bg-red-50/bg-amber-50 palette
// (like COVERAGE_DOT_CLASS's sibling used to be) has no `.dark` override.
const COVERAGE_DAY_BG = {
  red: 'bg-destructive/10 text-destructive', amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  green: 'bg-green-500/10 text-green-700 dark:text-green-400', gray: 'bg-muted/40 text-muted-foreground',
};
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Sunday-start month-grid calendar for a block calendar row's expanded detail — replaces the old
// per-shift × per-date heatmap table with an actual calendar (reusing buildWeekRows, the same
// Sunday-start padding ScheduleCalendarView already relies on). Read-only navigation-wise (no
// onOpenBlock/etc. side effects), but a day cell can be tapped/clicked to select it, surfacing
// the same per-shift detail the dots' hover titles carry in a touch-reachable strip below the
// grid — hover titles remain for desktop as the fast path.
function BlockMonthGrid({ dates, coverageByDate, activeShifts, schedule, nameById }) {
  const weekRows = useMemo(() => buildWeekRows(dates), [dates]);
  const firstDate = dates[0];
  const [selectedDs, setSelectedDs] = useState(null);
  const selectedCov = selectedDs ? coverageByDate[selectedDs] : null;

  return (
    <div>
      <div className="border border-border/40 rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
          {DOW.map(d => (
            <div key={d} className="text-[10px] font-semibold text-muted-foreground uppercase text-center py-1">{d}</div>
          ))}
        </div>
        {weekRows.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((ds, di) => {
              if (!ds) return <div key={di} className="min-h-[64px] border-r border-b border-border/40 p-1 bg-muted/30"/>;
              const cov = coverageByDate[ds];
              const status = coverageDayStatus(cov);
              const d = parseDate(ds);
              const label = (ds === firstDate || d.getDate() === 1)
                ? `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}` : String(d.getDate());
              const isSelected = ds === selectedDs;
              return (
                <div key={ds} onClick={() => setSelectedDs(isSelected ? null : ds)}
                  className={`min-h-[64px] border-r border-b border-border/40 p-1 cursor-pointer ${COVERAGE_DAY_BG[status]} ${isSelected ? 'ring-2 ring-inset ring-primary' : ''}`}>
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[10px] font-medium">{label}</span>
                    <span className="font-mono tabular-nums text-[10px]">{cov?.filled ?? 0}/{cov?.minTotal ?? 0}</span>
                  </div>
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {activeShifts.map(s => {
                      const info = cov?.perShift[s.id];
                      const dotStatus = shiftCellStatus(info);
                      const who = info && info.count > 0
                        ? Object.keys(schedule).filter(rid => schedule[rid]?.[ds] === s.id).map(rid => nameById[rid] || rid).join(', ')
                        : '';
                      return (
                        <span key={s.id} title={info ? `${s.id}: ${info.count}/${info.min}${who ? ` — ${who}` : ''}` : s.id}
                          className={`w-2 h-2 rounded-full ${COVERAGE_DOT_CLASS[dotStatus]}`}/>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {selectedDs && (
        <div className="mt-2 p-2 rounded-lg bg-muted/50 border border-border text-xs space-y-1">
          <div className="font-medium text-foreground">{prettyDate(selectedDs)}</div>
          {activeShifts.map(s => {
            const info = selectedCov?.perShift[s.id];
            const dotStatus = shiftCellStatus(info);
            const who = info && info.count > 0
              ? Object.keys(schedule).filter(rid => schedule[rid]?.[selectedDs] === s.id).map(rid => nameById[rid] || rid).join(', ')
              : '';
            return (
              <div key={s.id} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${COVERAGE_DOT_CLASS[dotStatus]}`}/>
                <span className="font-medium">{s.id}</span>
                <span className="text-muted-foreground">{info ? `${info.count}/${info.min}` : ''}</span>
                {who && <span className="text-muted-foreground truncate">— {who}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// One row of the year calendar — a saved blocksHistory snapshot, OR the live block (either
// standing in for a saved snapshot it also matches, with coverage always computed from the LIVE
// schedule rather than that snapshot's own stale copy, or as an extra "unsaved" row when the live
// block hasn't been saved at all). Owns its own coverage memo so switching AY/expanding one row
// never recomputes another row's numbers.
function BlockCalendarRow({ row, coverage, allResidents, expanded, onToggleExpand, onOpenBlock, onTogglePublished, onGoToSchedule, onDelete, blockSaveState, ayConf }) {
  const { snap, isLive, unsaved } = row;
  // Keyed on the row's own schedule object identity (stable for a saved snapshot until
  // blocksHistory itself changes; equal to the live block.schedule reference for the live row) —
  // this recomputes exactly when that one block's own data changes, never on an unrelated re-render.
  const dates = useMemo(() => getBlockDates(row.startDate, row.endDate), [row.startDate, row.endDate]);
  // computeCoverageByDate only ever reads `r.id` off the resident list it's given (see its
  // definition) — so rather than the LIVE roster (which can disagree with an older snapshot's
  // own residents, over- or under-counting fills for anyone added/removed since), build the
  // resident list straight from the snapshot's own schedule keys. Correct for every snapshot,
  // not just the live block.
  const residentsForCoverage = useMemo(() => Object.keys(row.schedule).map(id => ({ id })), [row.schedule]);
  const coverageByDate = useMemo(
    () => computeCoverageByDate(dates, row.schedule, coverage || {}, residentsForCoverage, ayConf),
    [dates, row.schedule, coverage, residentsForCoverage, ayConf]
  );
  // Saved, non-live rows show the snapshot's OWN stored counts (same fields HomeTab's Saved
  // Blocks list already displays) rather than a second, differently-scoped recomputation — the
  // live row has no stored count to show, so it falls back to a live count in that case only.
  const liveShiftCount = dates.reduce((s, ds) => s + (coverageByDate[ds]?.filled || 0), 0);
  const shiftCount = isLive ? liveShiftCount : (snap.shiftCount ?? liveShiftCount);
  const residentCount = isLive ? allResidents.length : (snap.residentCount ?? residentsForCoverage.length);
  const activeShifts = useMemo(() => getActiveCoverageShifts(dates, coverageByDate), [dates, coverageByDate]);
  const nameById = useMemo(() => {
    const m = {}; for (const r of allResidents) m[r.id] = `${r.lastName}, ${r.firstName}`; return m;
  }, [allResidents]);

  return (
    <div className={`border border-border rounded-xl overflow-hidden bg-card ${isLive ? 'ring-2 ring-inset ring-primary' : ''}`}>
      <div role="button" tabIndex={0} onClick={() => onToggleExpand(row.key)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpand(row.key); } }}
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-accent transition-colors">
        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : '-rotate-90'}`}/>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm text-foreground truncate">{snap.name || 'Unnamed Block'}</span>
            {snap.published && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700 shrink-0">Published</span>
            )}
            {isLive && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${blockSaveState === 'saved' ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-600'}`}>
                {blockSaveState === 'never' ? 'Unsaved · Current' : blockSaveState === 'dirty' ? 'Open · Unsaved changes' : 'Currently Open'}
              </span>
            )}
            {!unsaved && snap.id?.startsWith('blk_import_') && (
              <span title="Created by Master Matrix import — re-importing updates it in place"
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground shrink-0">
                Imported
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {prettyDate(row.startDate)} → {prettyDate(row.endDate)} · {shiftCount} shift{shiftCount !== 1 ? 's' : ''} · {residentCount} resident{residentCount !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="flex gap-px shrink-0" onClick={e => e.stopPropagation()}>
          {dates.map(ds => {
            const cov = coverageByDate[ds];
            const status = coverageDayStatus(cov);
            return (
              <div key={ds} title={`${formatDisplayDate(ds)}: ${cov?.filled ?? 0}/${cov?.minTotal ?? 0} filled`}
                className={`w-2 h-5 rounded-[1px] ${COVERAGE_DOT_CLASS[status]}`}/>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          {!unsaved && (
            <button onClick={() => onTogglePublished(snap.id)}
              title="Published blocks count toward each resident's 3-journal-club-per-year cap"
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${snap.published ? 'bg-green-50 border-green-300 text-green-700' : 'bg-card border-border text-muted-foreground hover:border-green-300'}`}>
              {snap.published ? 'Published' : 'Publish'}
            </button>
          )}
          {!isLive && <Button variant="secondary" size="sm" onClick={() => onOpenBlock(snap)}>Open Block</Button>}
          {unsaved && <Button variant="secondary" size="sm" onClick={onGoToSchedule}>Go to Schedule</Button>}
          {!unsaved && (
            <button onClick={() => onDelete(snap)} title="Delete this saved block"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 size={14}/>
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-3 no-print">
          {activeShifts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-1">No coverage requirements or assignments recorded for this block.</p>
          ) : (
            <BlockMonthGrid dates={dates} coverageByDate={coverageByDate} activeShifts={activeShifts} schedule={row.schedule} nameById={nameById}/>
          )}
        </div>
      )}
    </div>
  );
}

// AY selector + July→July timeline of every blocksHistory snapshot for that AY (plus the live
// block, always computed from its own live schedule). Purely a navigation/visualization layer —
// "Open Block"/"Publish" delegate to loadBlock/toggleBlockPublished, which already own every bit
// of the actual state transition (unsaved-work guard, hydrate, tab switch, published flag).
function BlockCalendarSection({ block, allResidents, coverage, blocksHistory, loadBlock, toggleBlockPublished, onDeleteSnapshot, setTab, ayData, updateAyData, blockSaveState }) {
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const ayOptions = useMemo(() => {
    const set = new Set(blocksHistory.map(b => b.academicYear || 'Unknown'));
    if (block.academicYear) set.add(block.academicYear);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [blocksHistory, block.academicYear]);

  const [selectedAy, setSelectedAy] = useState(() =>
    (block.academicYear && ayOptions.includes(block.academicYear)) ? block.academicYear : (ayOptions[0] || '')
  );
  // ayOptions itself never changes after mount for a given DashboardTab lifetime in practice
  // (blocksHistory/academicYear are localStorage-backed, already loaded by first render) — this
  // guard only covers the edge case of the selected AY's last block being deleted elsewhere.
  useEffect(() => {
    if (selectedAy && !ayOptions.includes(selectedAy)) {
      setSelectedAy((block.academicYear && ayOptions.includes(block.academicYear)) ? block.academicYear : (ayOptions[0] || ''));
    }
  }, [ayOptions, selectedAy, block.academicYear]);

  const [expandedKey, setExpandedKey] = useState(null);

  const snapsForAy = useMemo(() =>
    blocksHistory.filter(b => (b.academicYear || 'Unknown') === selectedAy)
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '')),
    [blocksHistory, selectedAy]);

  const liveMatchesAy = block.academicYear === selectedAy && !!block.startDate;
  const liveMatchesSnapshot = liveMatchesAy && snapsForAy.some(s => s.id === block.id);

  const rows = useMemo(() => {
    const list = snapsForAy.map(snap => {
      const isLive = liveMatchesAy && snap.id === block.id;
      return {
        key: snap.id, snap, isLive, unsaved: false,
        schedule: isLive ? (block.schedule || {}) : (snap.data?.schedule || {}),
        startDate: snap.startDate || snap.data?.startDate, endDate: snap.endDate || snap.data?.endDate,
      };
    });
    if (liveMatchesAy && !liveMatchesSnapshot) {
      list.push({
        key: `__live_${block.id}`,
        snap: { id: block.id, name: block.name, published: false },
        isLive: true, unsaved: true,
        schedule: block.schedule || {},
        startDate: block.startDate, endDate: block.endDate,
      });
    }
    return list.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  }, [snapsForAy, liveMatchesAy, liveMatchesSnapshot, block]);

  const ayWindow = ayWindowFor(selectedAy);
  const selectedAyConf = ayData[selectedAy] || { ...DEFAULT_AY_CONF };

  return (
    <div className="no-print">
      <SectionCard title="Block Calendar" subtitle={ayWindow ? `${prettyDate(ayWindow.start)} → ${prettyDate(ayWindow.end)}` : 'July→July view of every saved block'}
        action={ayOptions.length > 0 && (
          <select value={selectedAy} onChange={e => setSelectedAy(e.target.value)}
            className="text-sm px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            {ayOptions.map(ay => <option key={ay} value={ay}>{ay}</option>)}
          </select>
        )}>
        {/* Per-AY conference & ITE dates — co-located with the AY's own blocks below rather than
            edited in a separate place (the old Home tab's per-AY folder), so browsing this AY's
            blocks and editing its conference dates happen in the same spot. */}
        {selectedAy && (
          <div className="rounded-lg overflow-hidden border border-primary/20 mb-3">
            <AYConferenceEditor
              ay={selectedAy}
              conf={ayData[selectedAy] || { ...DEFAULT_AY_CONF }}
              onUpdate={conf => updateAyData(selectedAy, conf)}
            />
            <JournalClubDatesEditor
              ay={selectedAy}
              conf={ayData[selectedAy] || { ...DEFAULT_AY_CONF }}
              onUpdate={conf => updateAyData(selectedAy, conf)}
              blockStart={block.startDate}
            />
            <TwelveHourWindowsEditor
              ay={selectedAy}
              conf={ayData[selectedAy] || { ...DEFAULT_AY_CONF }}
              onUpdate={conf => updateAyData(selectedAy, conf)}
            />
          </div>
        )}
        <div className="space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No saved blocks for this academic year yet.</p>
          ) : (
            rows.map(row => (
              <BlockCalendarRow key={row.key} row={row} coverage={coverage} allResidents={allResidents}
                expanded={expandedKey === row.key}
                onToggleExpand={k => setExpandedKey(p => p === k ? null : k)}
                onOpenBlock={loadBlock} onTogglePublished={toggleBlockPublished}
                onGoToSchedule={() => setTab('schedule')}
                onDelete={snap => setDeleteConfirm(snap)}
                blockSaveState={blockSaveState}
                ayConf={selectedAyConf}
              />
            ))
          )}
        </div>
      </SectionCard>

      {deleteConfirm && (
        <ConfirmDialog icon={Trash2} tone="danger" title="Delete saved block?"
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="danger" size="sm" icon={Trash2} onClick={() => { onDeleteSnapshot(deleteConfirm.id); setDeleteConfirm(null); }}>
                Delete Block
              </Button>
            </>
          }>
          <div className="rounded-lg bg-muted border border-border px-4 py-3">
            <div className="font-semibold text-foreground">{deleteConfirm.name || 'Unnamed Block'}</div>
            <div className="text-xs text-muted-foreground/70 mt-0.5">
              {prettyDate(deleteConfirm.startDate)} → {prettyDate(deleteConfirm.endDate)}
              {deleteConfirm.savedAt && <> · saved {new Date(deleteConfirm.savedAt).toLocaleDateString()}</>}
            </div>
          </div>
          <p className="mt-3">This permanently removes the saved copy. Rosters, rules, and other blocks are not affected.</p>
          {deleteConfirm.id === block.id && (
            <p className="mt-2">This block is currently open — it stays open and keeps all its data, but will no longer have a saved copy until you save it again.</p>
          )}
          {deleteConfirm.published && (
            <p className="mt-2 text-amber-600">This block is published. Deleting it removes it from journal-club history counts used by validation.</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

function DashboardTab({ block, updateBlock, allResidents, schedulableCount, ayConf, issueCounts, coverage, blocksHistory, loadBlock, toggleBlockPublished, deleteBlockSnapshot, setTab,
  emRoster, setEmRoster, setBlocksHistory, ayData, updateAyData, appSettings, setAppSettings, onSaveBlock, onNewBlock, showToast, blockSaveState, onBlockReset, deleteCurrentBlock, currentSnapPublished }) {
  const progress     = getBlockProgress(block.startDate, block.endDate);
  const confsInBlock = getConferencesInBlock(block.startDate, block.endDate, ayConf);
  // Read through resolveTwelveHourWindows (not the raw conf) so this card shows exactly what the
  // generator will act on, including the implicit conference windows an untouched AY still gets.
  const twelveHourDaysInBlock = useMemo(() => {
    const dates = getBlockDates(block.startDate, block.endDate);
    if (!dates.length) return [];
    return resolveTwelveHourWindows(ayConf).map(w => {
      const days = dates.filter(ds => ds >= w.start && ds <= w.end);
      return days.length ? { key: w.id, label: w.label || '12h window', start: days[0], end: days[days.length - 1],
        days: days.length, areas: w.areas, mode: w.mode } : null;
    }).filter(Boolean);
  }, [block.startDate, block.endDate, ayConf]);
  // Distinct dates, not the sum of window lengths — two windows can overlap the same day.
  const twelveHourDayCount = useMemo(() => {
    const dates = getBlockDates(block.startDate, block.endDate);
    return dates.filter(ds => {
      const st = twelveHourStateFor(ds, ayConf || {});
      return st.replaceAreas.size > 0 || st.addAreas.size > 0;
    }).length;
  }, [block.startDate, block.endDate, ayConf]);
  // Assigning a Journal Club presenter from the planner card writes the same
  // resident.jcPresentDates field the profile chip editor does — one source of truth, no new
  // state. Functional updater + id matching on purpose: this component renders from the derived
  // allResidents memo, so building the next roster from that would drop concurrent roster edits.
  const assignJcPresenter = (ds, pgy, residentId) => setEmRoster(prev => (prev || []).map(r => {
    if (r.category !== 'EM_HOME' || r.pgy !== pgy) return r;
    const has = (r.jcPresentDates || []).includes(ds);
    const want = r.id === residentId;
    if (has === want) return r;
    return { ...r, jcPresentDates: want
      ? [...(r.jcPresentDates || []), ds].sort()
      : (r.jcPresentDates || []).filter(d => d !== ds) };
  }));
  const firstFridays = getFirstFridaysInBlock(block.startDate, block.endDate);
  const sd           = block.specialDays || {};
  const schedule     = block.schedule || {};

  // ── Current Block editor state (relocated from the old Home tab) ──
  const [blockOpen, setBlockOpen] = useState(true);
  const [showImportMatrix, setShowImportMatrix] = useState(false);
  const [confirmClearSchedule, setConfirmClearSchedule] = useState(false);
  const [confirmResetBlock, setConfirmResetBlock] = useState(false);
  const [confirmDeleteBlock, setConfirmDeleteBlock] = useState(false);
  // Raw counts for the Current Block card's own header subtitle — distinct from the
  // coverage-derived "Shifts Filled" stat tile below (see that tile's own comment): this is
  // every resident + every filled cell on the block regardless of min-coverage targets, exactly
  // as the old Home tab displayed it.
  const curShiftCount = Object.values(block.schedule || {}).reduce((s,d) => s + Object.values(d).filter(Boolean).length, 0);
  const curResCount   = emRoster.length + (block.offServiceResidents || []).length;

  function setBlockField(f, v) { updateBlock(b => ({ ...b, [f]: v })); }
  function onStartDateChange(s) { applyStartDate(updateBlock, appSettings, s); }

  // Reuses the same computeCoverageByDate the Schedule tab's coverage footer runs, so the
  // "Shifts Filled" tile can never drift from what the grid shows. shiftCount is derived from
  // coverageByDate's own per-date `filled` sums (scoped to allResidents) rather than a separate
  // Object.values(schedule) walk — a second, unfiltered computation could count stale schedule
  // entries for a resident no longer in allResidents while minTotal (via computeCoverageByDate)
  // would not, letting the tile read "complete" while the grid shows real under-coverage.
  const blockDates = useMemo(()=>getBlockDates(block.startDate, block.endDate), [block.startDate, block.endDate]);
  const coverageByDate = useMemo(()=>computeCoverageByDate(blockDates, schedule, coverage||{}, allResidents, ayConf), [blockDates, schedule, coverage, allResidents, ayConf]);
  const shiftCount = blockDates.reduce((s,ds)=>s+(coverageByDate[ds]?.filled||0), 0);
  const minTotal = blockDates.reduce((s,ds)=>s+(coverageByDate[ds]?.minTotal||0), 0);
  const fillPct = minTotal > 0 ? Math.round((shiftCount/minTotal)*100) : 0;

  function updSD(field, newDates) {
    updateBlock(b => ({ ...b, specialDays: { ...(b.specialDays || {}), [field]: newDates } }));
  }

  const CONF_COLORS = { acep:'bg-red-100 text-red-700 border-red-200', ite:'bg-amber-100 text-amber-700 border-amber-200',
                        aaem:'bg-blue-100 text-blue-700 border-blue-200', saem:'bg-purple-100 text-purple-700 border-purple-200' };

  return (
    <div className="space-y-5 max-w-5xl">

      {/* July→July block calendar with global (day-strip) + granular (per-shift heatmap)
          coverage visualization — read-only navigation layer over blocksHistory + the live
          block, see the "YEAR CALENDAR" section above DashboardTab. */}
      <BlockCalendarSection block={block} allResidents={allResidents} coverage={coverage}
        blocksHistory={blocksHistory} loadBlock={loadBlock} toggleBlockPublished={toggleBlockPublished}
        onDeleteSnapshot={deleteBlockSnapshot}
        setTab={setTab} ayData={ayData} updateAyData={updateAyData} blockSaveState={blockSaveState}/>

      {/* Current Block — inline editable form, relocated from the old Home tab (now removed —
          the Block Calendar above replaced its Saved Blocks list, and AYConferenceEditor moved
          into that calendar's own AY dropdown). */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden no-print">
        <CollapsibleHeader
          title="Current Block"
          subtitle={curResCount > 0 || curShiftCount > 0
            ? `${curResCount} resident${curResCount !== 1 ? 's' : ''} · ${curShiftCount} shift${curShiftCount !== 1 ? 's' : ''} assigned`
            : 'Set dates below to start scheduling'}
          open={blockOpen} onToggle={() => setBlockOpen(p => !p)}
          action={<>
            <button onClick={onSaveBlock}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors">
              <Save size={12}/> Save Block
            </button>
            <button onClick={onNewBlock}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors">
              <Plus size={12}/> New Block
            </button>
            <button onClick={() => setShowImportMatrix(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors">
              <Upload size={12}/> Import Master Matrix
            </button>
            <Button variant="dangerOutline" size="sm" icon={Trash2} disabled={curShiftCount === 0}
              onClick={() => setConfirmClearSchedule(true)}>
              Clear Schedule
            </Button>
            <Button variant="dangerOutline" size="sm" icon={RefreshCw} onClick={() => setConfirmResetBlock(true)}>
              Reset Block
            </Button>
            <Button variant="dangerOutline" size="sm" icon={Trash2} onClick={() => setConfirmDeleteBlock(true)}>
              Delete Block
            </Button>
          </>}
        />

        {blockOpen && <>
        {/* Block identity + dates grid — always visible, always editable */}
        <div className="px-5 pt-4 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Block Name</label>
              <input className="input-field" placeholder="e.g. Block 3 — Jun/Jul 2026"
                value={block.name || ''} onChange={e => setBlockField('name', e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
              <input className="input-field" placeholder={getAcademicYear()}
                value={block.academicYear || ''} onChange={e => setBlockField('academicYear', e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input type="date" className="input-field"
                value={block.startDate || ''} onChange={e => onStartDateChange(e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
              <input type="date" className="input-field"
                value={block.endDate || ''} onChange={e => setBlockField('endDate', e.target.value)}/>
            </div>
          </div>

          {/* Days-in-block indicator */}
          {blockDates.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              {blockDates.length} days · {prettyDate(block.startDate)} → {prettyDate(block.endDate)}
            </p>
          )}
        </div>

        {/* Go to Schedule */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">
            {!block.startDate ? 'Set start date above to begin' : `Ready · ${blockDates.length} day block`}
          </span>
          <button onClick={() => setTab('schedule')} disabled={!block.startDate}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 disabled:opacity-40 text-white rounded-lg transition-colors">
            Go to Schedule <ChevronRight size={14}/>
          </button>
        </div>
        </>}
      </div>

      {showImportMatrix && (
        <ImportMatrixModal
          emRoster={emRoster} setEmRoster={setEmRoster}
          blocksHistory={blocksHistory} setBlocksHistory={setBlocksHistory}
          appSettings={appSettings} showToast={showToast}
          onClose={() => setShowImportMatrix(false)}
        />
      )}

      {confirmClearSchedule && (
        <ClearScheduleConfirm blockName={block.name} hasSnapshot={blockSaveState !== 'never'}
          onConfirm={() => {
            updateBlock(b => ({ ...b, schedule: {}, generationReport: null }));
            setConfirmClearSchedule(false);
            showToast('Schedule cleared', 'amber');
          }}
          onClose={() => setConfirmClearSchedule(false)}/>
      )}

      {confirmResetBlock && (
        <ResetBlockConfirm onConfirm={() => { onBlockReset(); setConfirmResetBlock(false); }} onClose={() => setConfirmResetBlock(false)}/>
      )}

      {confirmDeleteBlock && (
        <ConfirmDialog icon={Trash2} tone="danger" title="Delete this block?"
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteBlock(false)}>Cancel</Button>
              <Button variant="danger" size="sm" icon={Trash2} onClick={() => { deleteCurrentBlock(); setConfirmDeleteBlock(false); }}>
                Delete Block
              </Button>
            </>
          }>
          <p>Removes '{block.name || 'Unnamed Block'}' completely — the saved copy on this Dashboard and everything in your current workspace. Roster, rules, and other blocks are not affected. This cannot be undone.</p>
          {currentSnapPublished && <p className="mt-2 text-amber-600">This block is published. Deleting it removes it from journal-club history counts used by validation.</p>}
        </ConfirmDialog>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Schedulable Residents" value={schedulableCount} sub={`of ${allResidents.length} on block`}
          icon={Users} tone="primary"/>
        <StatCard label="Shifts Filled" value={block.startDate ? shiftCount : '—'}
          sub={block.startDate ? `of ${minTotal} min coverage slots` : 'set block dates'}
          icon={CalendarDays} tone={block.startDate && minTotal > 0 && shiftCount >= minTotal ? 'success' : 'warn'}
          bar={block.startDate && minTotal > 0 ? { pct: fillPct, color: shiftCount >= minTotal ? 'success' : 'warn' } : null}/>
        <StatCard label="Violations" value={block.startDate ? issueCounts.errors : '—'}
          sub={block.startDate ? `${issueCounts.warns} warning${issueCounts.warns !== 1 ? 's' : ''}` : 'set block dates'}
          icon={AlertCircle} tone={issueCounts.errors > 0 ? 'danger' : 'success'}/>
        <StatCard label="Days Remaining"
          value={progress ? progress.remaining : '—'}
          sub={progress ? (progress.elapsed === 0 ? 'Not started yet' : progress.remaining === 0 ? 'Block complete' : `Day ${progress.elapsed} of ${progress.total}`) : 'No dates set'}
          icon={Activity} tone="neutral"/>
      </div>

      {/* Read-only equity/fairness card: per-resident nights/weekends/hours/area-mix for this AY */}
      <EquityPanel allResidents={allResidents} block={block} blocksHistory={blocksHistory}/>

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
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress.pct}%` }}/>
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
            {AY_CONF_DATE_FIELDS.some(f => ayConf[f])
              ? 'All AY conferences fall outside this block period.'
              : 'No conference dates set for this academic year — add them in the Block Calendar above (select this AY, then Conference & ITE Dates).'}
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

      {/* 12h windows active in this block — the whole point is that an EMPTY list says so out loud,
          rather than the chief generating a schedule and silently getting no 12h shifts. */}
      <CollapsibleCard title="12-Hour Shift Days This Block"
        subtitle={twelveHourDaysInBlock.length === 0
          ? 'None — every day of this block runs the normal 9h shifts.'
          : `${twelveHourDayCount} day${twelveHourDayCount === 1 ? '' : 's'} across ${twelveHourDaysInBlock.length} window${twelveHourDaysInBlock.length === 1 ? '' : 's'} run 12h shifts.`}>
        {twelveHourDaysInBlock.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            No 12h window covers this block. Set one in the Block Calendar above (select this AY, then
            12-Hour Shift Windows) — conference dates seed them automatically.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {twelveHourDaysInBlock.map(g => (
              <div key={g.key} className="flex flex-col px-3 py-2 rounded-xl border bg-indigo-50 border-indigo-200 text-indigo-700 text-sm font-medium">
                <span className="font-bold">{g.label}</span>
                <span className="text-xs opacity-75">{prettyDate(g.start)}{g.end !== g.start ? ` – ${prettyDate(g.end)}` : ''} · {g.days} day{g.days === 1 ? '' : 's'}</span>
                <span className="text-xs opacity-75">{g.areas.join(', ')} · {g.mode === 'add' ? 'alongside 9h' : 'replacing 9h'}</span>
              </div>
            ))}
          </div>
        )}
      </CollapsibleCard>

      {/* Journal Club presenter planning + worked-JC caps */}
      <JournalClubPlanner allResidents={allResidents} block={block} blocksHistory={blocksHistory}
        ayConf={ayConf} onAssignPresenter={assignJcPresenter}/>

      {/* Jeopardy activations / sick-call log + advisory buy-down ledger */}
      <JeopardySickCallsCard allResidents={allResidents} block={block} blocksHistory={blocksHistory}
        appSettings={appSettings} setAppSettings={setAppSettings}/>

      {/* 1st Fridays */}
      {firstFridays.length > 0 && (
        <CollapsibleCard title="First Fridays This Block"
          subtitle="Anesthesia: never schedulable (social hour) — enforced automatically.">
          <div className="flex flex-wrap gap-2">
            {firstFridays.map(d => (
              <span key={d} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-sm font-medium text-purple-700">
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
            label="BAMC Procedure Days"
            hint="BAMC resident off night before + day of (may work night-of if critical)"
            dates={sd.procDays || []}
            onUpdate={d => updSD('procDays', d)}
            chipClass="bg-blue-100 text-blue-700 border border-blue-200"
          />
          <SpecialDaysList
            label="Anesthesia US Days"
            hint="Anesthesia resident off these days (email the ultrasound coordinator annually for dates)"
            dates={sd.anesDays || []}
            onUpdate={d => updSD('anesDays', d)}
            chipClass="bg-purple-100 text-purple-700 border border-purple-200"
          />
        </div>
      </CollapsibleCard>

    </div>
  );
}

// ─── MATRIX IMPORT + AY CONFERENCE EDITOR ──────────────────────────────────────
// (Formerly "Home Tab" — the tab itself is gone; ImportMatrixModal and AYConferenceEditor below
// are now consumed by DashboardTab / BlockCalendarSection instead.)

// Sheet-name regex matching (/home/i, /off.?service/i) breaks the moment a chief's export uses
// generic tab names ("Sheet1"/"Sheet2") instead of descriptive ones — falling back to positional
// guessing then silently assigns the wrong role to each sheet. Detect by content instead: the
// Home sheet's header row(s) start column 0 with "Resident" (true for both the PGY-section
// format and the grouped-track fallback, since both open a header row that way); the Off-Service
// sheet has a literal "Dept" header cell. Used only when name-regex matching fails on both sheets.
function detectHomeAndOffSheetsByContent(wb) {
  let homeSheetName, offSheetName;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    for (let r = 0; r < Math.min(rows.length, 10) && (!homeSheetName || !offSheetName); r++) {
      const row = rows[r] || [];
      if (!homeSheetName && /^resident\b/i.test(String(row[0] ?? '').trim())) homeSheetName = name;
      for (let c = 0; c < Math.min(row.length, 25); c++) {
        if (String(row[c] ?? '').trim().toLowerCase() === 'dept') { offSheetName = name; break; }
      }
    }
  }
  return { homeSheetName, offSheetName };
}

// Uploads the chief's yearly Master Matrix workbook (.xlsx) and turns it into ready-to-load
// Saved Blocks — EM Home rotation assignments (parseHomeResidentMatrix) plus off-service
// rotators bucketed by date overlap (parseOffServiceSheet). Never touches the live/current
// block, and never generates a schedule — roster only.
function ImportMatrixModal({ emRoster, setEmRoster, blocksHistory, setBlocksHistory, appSettings, onClose, showToast }) {
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const existingKeys = useMemo(() =>
    new Set(emRoster.map(r => normalizeToken(r.firstName) + '|' + normalizeToken(r.lastName))),
    [emRoster]);

  function pickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    setPreview(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: 'array' });
        const detected = detectHomeAndOffSheetsByContent(wb);
        const homeSheetName = wb.SheetNames.find(n => /home/i.test(n)) || detected.homeSheetName || wb.SheetNames[0];
        const offSheetName  = wb.SheetNames.find(n => /off.?service/i.test(n)) || detected.offSheetName || wb.SheetNames[1] || wb.SheetNames[0];
        const homeRows = XLSX.utils.sheet_to_json(wb.Sheets[homeSheetName], { header: 1, raw: false, defval: '' });
        const offRows  = XLSX.utils.sheet_to_json(wb.Sheets[offSheetName],  { header: 1, raw: false, defval: '' });

        const ayStartYear = parseAYStartYear(homeRows);
        const home = parseHomeResidentMatrix(homeRows, ayStartYear);
        const off  = parseOffServiceSheet(offRows, ayStartYear);

        if (!home.blocks.length) {
          setError('No rotation blocks recognized — check that the Home EM residents sheet matches the expected layout: either a "Resident (EM-Home PGY-N)" section per PGY level, or blank-row-separated resident groups each starting with a "Resident" + date-range header row.');
          return;
        }

        const newResidents = home.residents.filter(r => !existingKeys.has(normalizeToken(r.firstName) + '|' + normalizeToken(r.lastName)));
        const existingCount = home.residents.length - newResidents.length;

        const blocks = home.blocks.map((b, i) => ({
          start: b.start, end: b.end,
          name: `Block ${i + 1} (${prettyDate(b.start)}–${prettyDate(b.end)})`,
          assignCount: b.assignments.length,
          offCount: off.rows.filter(o => o.start <= b.end && o.end >= b.start).length,
        }));

        const cap = appSettings?.maxSavedBlocks ?? 24;
        const newIds = new Set(blocks.map(b => `blk_import_${b.start}`));
        const projectedTotal = blocksHistory.filter(b => !newIds.has(b.id)).length + blocks.length;
        const capOverflow = Math.max(0, projectedTotal - cap);

        setPreview({ ayStartYear, home, off, newResidents, existingCount, blocks, capOverflow, warnings: [...home.warnings, ...off.warnings] });
      } catch (err) {
        setError(`Couldn't read this file — ${err?.message || 'is it a valid .xlsx workbook?'}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function commit() {
    if (!preview) return;
    const { home, off, newResidents, ayStartYear } = preview;

    const mergedRoster = [...emRoster, ...newResidents.map(r => ({
      id: uuid(), ...r, blockType: 'EM', isCCUNights: false, chiefRole: null,
      approvedDatesOff: [], jeopardyDates: [], jcPresentDates: [], grLectureDates: [], vacationDates: [],
      availabilityMode: 'full', availableRanges: [], canWorkDates: [],
    }))];
    setEmRoster(mergedRoster);

    const findResidentId = (firstName, lastName) => {
      const key = normalizeToken(firstName) + '|' + normalizeToken(lastName);
      return mergedRoster.find(r => normalizeToken(r.firstName) + '|' + normalizeToken(r.lastName) === key)?.id ?? null;
    };

    const academicYear = formatAY(ayStartYear);
    const newSnaps = home.blocks.map((b, i) => {
      const name = `Block ${i + 1} (${prettyDate(b.start)}–${prettyDate(b.end)})`;
      // Merge onto any existing snapshot's per-resident record (same import id, blk_import_<start>)
      // rather than replacing it wholesale — a re-upload of the yearly Master Matrix only carries
      // blockType per resident, so a wholesale replace silently wiped isChief/targetDelta/
      // targetNote/targetIsBuyDown recorded on a prior import of this same block (letting a chief's
      // buy-down be spent twice with no error). blockType itself is always freshly re-parsed.
      const existingAssignments = blocksHistory.find(s => s.id === `blk_import_${b.start}`)?.data?.emBlockAssignments || {};
      const emBlockAssignments = {};
      for (const a of b.assignments) {
        const rid = findResidentId(a.firstName, a.lastName);
        if (rid) emBlockAssignments[rid] = { ...(existingAssignments[rid] || {}), blockType: a.blockTypeId };
      }
      const offServiceResidents = off.rows
        .filter(o => o.start <= b.end && o.end >= b.start)
        .map(o => ({
          id: uuid(), firstName: o.firstName, lastName: o.lastName, category: o.category, pgy: o.pgy,
          blockType: 'EM', isCCUNights: false, approvedDatesOff: [], jeopardyDates: [],
          availabilityMode: 'ranges',
          availableRanges: [{ start: o.start > b.start ? o.start : b.start, end: o.end < b.end ? o.end : b.end }],
          canWorkDates: [],
        }));
      return {
        id: `blk_import_${b.start}`, name, academicYear,
        startDate: b.start, endDate: b.end, savedAt: new Date().toISOString(),
        residentCount: Object.keys(emBlockAssignments).length + offServiceResidents.length, shiftCount: 0,
        data: {
          emBlockAssignments, offServiceResidents, schedule: {},
          specialDays: { codeBlueDays: [], advocacyDays: [], procDays: [], anesDays: [] },
          conferences: { acepStart:'', acepEnd:'', iteDate:'', aaemStart:'', aaemEnd:'', saemStart:'', saemEnd:'' },
          generationReport: null, startDate: b.start, endDate: b.end, name, academicYear,
        },
      };
    });

    setBlocksHistory(prev => {
      const newIds = new Set(newSnaps.map(s => s.id));
      return [...newSnaps, ...prev.filter(b => !newIds.has(b.id))].slice(0, appSettings?.maxSavedBlocks ?? 24);
    });

    showToast(`Imported ${newSnaps.length} block${newSnaps.length !== 1 ? 's' : ''} from "${fileName}"`, 'green');
    onClose();
  }

  return (
    <Modal title="Import Master Matrix" onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Upload the chief's yearly Master Matrix workbook (.xlsx) — a "Home EM Residents" sheet with
          each resident's rotation per block, and an "Off-Service Residents" sheet listing incoming
          rotators. This populates each block's <strong>roster only</strong> (EM rotation assignments +
          off-service availability) as ready-to-load Saved Blocks — it never generates a schedule, and
          your current in-progress block is left untouched.
        </p>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
            <Upload size={12}/> Choose .xlsx file
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" onChange={pickFile} className="hidden"/>
          {fileName && <span className="text-xs text-gray-500">{fileName}</span>}
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 text-xs bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertTriangle size={14} className="shrink-0 mt-0.5"/> {error}
          </div>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="font-semibold text-gray-700">EM Home residents</p>
                <p className="text-gray-500 mt-1">{preview.newResidents.length} new · {preview.existingCount} already matched</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="font-semibold text-gray-700">Blocks to create/update</p>
                <p className="text-gray-500 mt-1">{preview.blocks.length} blocks · AY{String(preview.ayStartYear).slice(2)}/{String(preview.ayStartYear + 1).slice(2)}</p>
              </div>
            </div>

            {preview.capOverflow > 0 && (
              <div className="flex items-start gap-2 px-3 py-2 text-xs bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                <AlertTriangle size={14} className="shrink-0 mt-0.5"/>
                This will exceed your Saved Blocks cap ({appSettings?.maxSavedBlocks ?? 24}) — the {preview.capOverflow} oldest existing snapshot{preview.capOverflow !== 1 ? 's' : ''} will be dropped.
              </div>
            )}

            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
              {preview.blocks.map(b => (
                <div key={b.start} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <Check size={12} className="text-green-500 shrink-0"/>
                  <span className="text-gray-700">{b.name}</span>
                  <span className="ml-auto text-gray-400">{b.assignCount} EM · {b.offCount} off-service</span>
                </div>
              ))}
            </div>

            {preview.warnings.length > 0 && (
              <div className="border border-amber-200 rounded-lg divide-y divide-amber-100 max-h-40 overflow-y-auto">
                {preview.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-xs bg-amber-50/50">
                    <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5"/>
                    <span className="text-amber-800">{w}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-400">
              Re-uploading updates the same blocks in place (matched by start date) rather than duplicating them —
              including any block you've since loaded, edited, and re-saved under that date.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">Cancel</button>
          <button type="button" onClick={commit} disabled={!preview}
            className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 disabled:opacity-40 text-white rounded-lg font-medium transition-colors">
            Import {preview ? preview.blocks.length : ''} block{preview?.blocks.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}

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
    <div className="bg-primary/10 border-b border-primary/20">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-primary/10 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays size={13} className="text-primary shrink-0"/>
          <span className="text-xs font-semibold text-primary">Conference &amp; ITE Dates</span>
          {parts.length > 0
            ? <span className="text-xs text-primary truncate">{parts.join(' · ')}</span>
            : <span className="text-xs text-primary italic">Not set — click to add</span>}
        </div>
        <ChevronDown size={13} className={`text-primary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}/>
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
                    className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white flex-1"/>
                  <span className="text-gray-400 text-xs">–</span>
                  <input type="date" value={conf[f2]||''} onChange={e=>set(f2,e.target.value)}
                    className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white flex-1"/>
                </div>
              ) : (
                <input type="date" value={conf[f1]||''} onChange={e=>set(f1,e.target.value)}
                  className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white w-full"/>
              )}
            </div>
          ))}
          <div className="col-span-2 flex justify-end pt-1">
            <button onClick={() => setOpen(false)}
              className="text-xs px-3 py-1 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors font-medium">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline Journal Club date editor, in the same AY folder as the conference dates. JC used to be
// hardcoded to "first Tuesday of the month"; the chief needs to move one occasionally. An absent
// conf.jcDates keeps deriving first Tuesdays (zero migration), and the FIRST edit materializes the
// whole derived list before applying the change — so removing one date can't silently discard the
// other eleven. "Reset" deletes the key rather than storing the derived list, so a resident who
// later corrects a date still inherits the default.
function JournalClubDatesEditor({ ay, conf, onUpdate, blockStart }) {
  const [open, setOpen] = useState(false);
  const isCustom = Array.isArray(conf.jcDates);
  const dates = resolveJcDates(ay, conf, { fallbackDateStr: blockStart });

  const setDates = next => onUpdate({ ...conf, jcDates: [...new Set(next)].sort() });
  const reset = () => { const c = { ...conf }; delete c.jcDates; onUpdate(c); };

  return (
    <div className="bg-primary/10 border-b border-primary/20">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-primary/10 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays size={13} className="text-primary shrink-0"/>
          <span className="text-xs font-semibold text-primary">Journal Club Dates</span>
          <span className="text-xs text-primary truncate">
            {dates.length} date{dates.length === 1 ? '' : 's'} · {isCustom ? 'customized' : 'first Tuesday of each month'}
          </span>
        </div>
        <ChevronDown size={13} className={`text-primary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>

      {open && (
        <div className="px-4 py-3 space-y-2">
          <SpecialDaysList
            label={`Journal Club — ${ay}`}
            hint="Defaults to the first Tuesday of each month. Editing any date pins the whole year's list; 18:00–21:00 either way."
            dates={dates}
            onUpdate={setDates}
            chipClass="bg-violet-50 text-violet-700 border-violet-200"/>
          <p className="text-xs text-gray-500">
            Presenters are assigned on the Journal Club card below. Moving a date leaves any presenter
            still marked for the old date — Validation flags those so nothing goes missing silently.
            Worked-JC counts for already-published blocks are recomputed against this list.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            {isCustom && (
              <button onClick={reset}
                className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">
                Reset to first Tuesdays
              </button>
            )}
            <button onClick={() => setOpen(false)}
              className="text-xs px-3 py-1 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors font-medium">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline 12-hour-shift window editor. Before this existed, 12h shifts swapped in ONLY during the
// AY's ACEP/AAEM/SAEM ranges, always for POD/MT/FLEX, always all-or-nothing. An AY the chief has
// never opened here still behaves exactly that way (resolveTwelveHourWindows falls back to those
// implicit windows); opening the editor and touching anything materializes them as real editable
// rows. "Reset" deletes the key and returns to the implicit conference windows.
function TwelveHourWindowsEditor({ ay, conf, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const isCustom = Array.isArray(conf.twelveHourWindows);
  const windows = resolveTwelveHourWindows(conf);

  const commit = next => onUpdate({ ...conf, twelveHourWindows: next });
  const patch = (i, fields) => commit(windows.map((w, j) => j === i ? { ...w, ...fields } : w));
  const reset = () => { const c = { ...conf }; delete c.twelveHourWindows; onUpdate(c); setExpanded(null); };
  const addWindow = () => commit([...windows, { id: `w${windows.length + 1}_${ay}`, label: '', start: '', end: '', areas: ['POD','MT','FLEX'], mode: 'replace' }]);
  const removeWindow = i => { commit(windows.filter((_, j) => j !== i)); setExpanded(null); };

  const toggleArea = (i, area) => {
    const cur = windows[i].areas || [];
    patch(i, { areas: cur.includes(area) ? cur.filter(a => a !== area) : [...cur, area] });
  };
  const setOverride = (i, sid, field, raw) => {
    const cov = { ...(windows[i].coverage || {}) };
    const entry = { ...(cov[sid] || {}) };
    if (raw === '') delete entry[field]; else entry[field] = Math.max(0, Number(raw) || 0);
    // A half-filled override is meaningless to getCoverageFor (normalizeCoverageEntry needs both),
    // so mirror the missing side rather than storing a partial entry.
    if (entry.min == null && entry.max == null) delete cov[sid];
    else cov[sid] = { min: entry.min ?? entry.max, max: entry.max ?? entry.min };
    patch(i, { coverage: cov });
  };

  const summary = windows.length === 0
    ? 'None — 12h shifts inactive this year'
    : `${windows.length} window${windows.length === 1 ? '' : 's'} · ${windows.map(w => w.label || prettyDate(w.start)).join(', ')}`;

  return (
    <div className="bg-primary/10 border-b border-primary/20">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-primary/10 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <Clock size={13} className="text-primary shrink-0"/>
          <span className="text-xs font-semibold text-primary">12-Hour Shift Windows</span>
          <span className={`text-xs truncate ${windows.length ? 'text-primary' : 'text-primary italic'}`}>{summary}</span>
          {!isCustom && windows.length > 0 && <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-white/70 text-primary shrink-0">from conference dates</span>}
        </div>
        <ChevronDown size={13} className={`text-primary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>

      {open && (
        <div className="px-4 py-3 space-y-2">
          <p className="text-xs text-gray-500">
            On these dates the chosen areas run 12h shifts. <span className="font-medium">Replace</span> swaps
            the area's normal day/eve/night shifts out entirely (what conference weeks have always done);
            <span className="font-medium"> add</span> leaves them in place and only opens the 12h shifts, which
            stay at zero coverage until you set one below.
          </p>

          {windows.length === 0 && (
            <p className="text-xs text-gray-400 italic">No windows — 12h shifts are inactive all year. Add one below, or set conference dates above.</p>
          )}

          {windows.map((w, i) => (
            <div key={w.id || i} className="border border-gray-200 rounded-lg bg-white">
              <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
                <input type="text" value={w.label || ''} placeholder="Label" onChange={e => patch(i, { label: e.target.value })}
                  className="text-xs border border-gray-300 rounded px-1.5 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-primary"/>
                <input type="date" value={w.start || ''} onChange={e => patch(i, { start: e.target.value })}
                  className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"/>
                <span className="text-gray-400 text-xs">–</span>
                <input type="date" value={w.end || ''} onChange={e => patch(i, { end: e.target.value })}
                  className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"/>
                <div className="flex items-center gap-1 ml-1">
                  {TWELVE_HOUR_AREAS.map(area => (
                    <button key={area} onClick={() => toggleArea(i, area)}
                      className={`text-[10px] font-medium px-1.5 py-1 rounded border transition-colors ${(w.areas || []).includes(area)
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'}`}>
                      {area}
                    </button>
                  ))}
                </div>
                <select value={w.mode || 'replace'} onChange={e => patch(i, { mode: e.target.value })}
                  className="text-xs border border-gray-300 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="replace">replace 9h</option>
                  <option value="add">add alongside</option>
                </select>
                <button onClick={() => setExpanded(expanded === i ? null : i)}
                  className={`text-[10px] px-1.5 py-1 rounded border transition-colors ${Object.keys(w.coverage || {}).length
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'}`}>
                  coverage{Object.keys(w.coverage || {}).length ? ` (${Object.keys(w.coverage).length})` : ''}
                </button>
                <button onClick={() => removeWindow(i)} className="ml-auto text-gray-300 hover:text-red-500 transition-colors p-1">
                  <X size={12}/>
                </button>
              </div>

              {expanded === i && (
                <div className="border-t border-gray-100 px-2 py-2 space-y-1">
                  <p className="text-[10px] text-gray-500">
                    Blank inherits the Rules-tab number{(w.mode || 'replace') === 'add' ? ' (and 12h shifts stay at 0 until set here)' : ''}.
                  </p>
                  {(w.areas || []).length === 0 && <p className="text-[10px] text-gray-400 italic">Pick an area first.</p>}
                  {(w.areas || []).flatMap(area => {
                    const ids = [`${area}-D12`, `${area}-N12`];
                    // The add-case ids used to be `${area}-D`/`${area}-E`/`${area}-N` string
                    // templates — that's the AREA-TYPE convention, which PED-N-FM and PED-S both
                    // break (see CLAUDE.md), so those two ids could never appear here even though
                    // getCoverageFor/twelveHourAllows treat them as normal PED ids that need an
                    // editable override same as any other. Derive from the shift catalog instead
                    // so every non-12h shift actually in this area gets a row, whatever its id.
                    if ((w.mode || 'replace') === 'add') ids.push(...SHIFTS.filter(s => s.area === area && !TWELVE_HOUR_IDS.includes(s.id)).map(s => s.id));
                    return ids.filter(sid => SHIFT_MAP[sid]);
                  }).map(sid => {
                    const ov = (w.coverage || {})[sid] || {};
                    return (
                      <div key={sid} className="flex items-center gap-2 text-xs">
                        <span className="w-24 text-gray-600">{SHIFT_MAP[sid].label}</span>
                        <label className="text-[10px] text-gray-400">min</label>
                        <input type="number" min="0" value={ov.min ?? ''} onChange={e => setOverride(i, sid, 'min', e.target.value)}
                          className="w-12 text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"/>
                        <label className="text-[10px] text-gray-400">max</label>
                        <input type="number" min="0" value={ov.max ?? ''} onChange={e => setOverride(i, sid, 'max', e.target.value)}
                          className="w-12 text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"/>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={addWindow}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors font-medium">
              + Add window
            </button>
            {isCustom && (
              <button onClick={reset}
                className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">
                Reset to conference dates
              </button>
            )}
            <button onClick={() => setOpen(false)}
              className="text-xs px-3 py-1 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors font-medium">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RESIDENT FORM (shared by Add + Edit modals) ─────────────────────────────

function ResidentForm({ initial, onSubmit, onClose, title, submitLabel, persistentOnly = false, lockCategory = false, lockPgy = false, ayData = {} }) {
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
    vacationDates:    initial?.vacationDates    ?? [],
    jeopardyDates:    initial?.jeopardyDates    ?? [],
    jcPresentDates:   initial?.jcPresentDates   ?? [],
    grLectureDates:   initial?.grLectureDates   ?? [],
    availabilityMode: initial?.availabilityMode ?? 'full',
    availableRanges:  initial?.availableRanges  ?? [],
    canWorkDates:     initial?.canWorkDates     ?? [],
    qgendaStaffId:    initial?.qgendaStaffId    ?? '',
  });

  const [newOffDate, setNewOffDate] = useState('');
  const [newVacDate, setNewVacDate] = useState('');
  const [newJeoDate, setNewJeoDate] = useState('');
  const [newJcDate, setNewJcDate] = useState('');
  const [newGrDate, setNewGrDate] = useState('');
  const [jcError, setJcError] = useState('');
  const [grError, setGrError] = useState('');

  function addJcDate() {
    const d = newJcDate;
    if (!d) return;
    if (!isJcDateAnyAy(d, ayData)) { setJcError('Not a Journal Club date for that academic year (defaults to the first Tuesday of the month; edit the list on the Dashboard tab)'); return; }
    setJcError('');
    if (!form.jcPresentDates.includes(d)) set('jcPresentDates', [...form.jcPresentDates, d].sort());
    setNewJcDate('');
  }
  function removeJcDate(d) { set('jcPresentDates', form.jcPresentDates.filter(x => x !== d)); }

  function addGrDate() {
    const d = newGrDate;
    if (!d) return;
    const expectedDow = grWorkDow({ category: form.category, pgy: form.pgy });
    if (expectedDow == null || parseDate(d).getDay() !== expectedDow) {
      setGrError(`Grand Rounds lecture date must fall on a ${DOW[expectedDow] ?? 'Grand Rounds'} day for this resident`);
      return;
    }
    setGrError('');
    if (!form.grLectureDates.includes(d)) set('grLectureDates', [...form.grLectureDates, d].sort());
    setNewGrDate('');
  }
  function removeGrDate(d) { set('grLectureDates', form.grLectureDates.filter(x => x !== d)); }

  function addOffDate() {
    const d = newOffDate;
    if (!d || form.approvedDatesOff.includes(d)) { setNewOffDate(''); return; }
    set('approvedDatesOff', [...form.approvedDatesOff, d].sort());
    setNewOffDate('');
  }
  function removeOffDate(d) { set('approvedDatesOff', form.approvedDatesOff.filter(x => x !== d)); }

  function addVacDate() {
    const d = newVacDate;
    if (!d || form.vacationDates.includes(d)) { setNewVacDate(''); return; }
    set('vacationDates', [...form.vacationDates, d].sort());
    setNewVacDate('');
  }
  function removeVacDate(d) { set('vacationDates', form.vacationDates.filter(x => x !== d)); }

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
      vacationDates:    form.vacationDates,
      jeopardyDates:    form.jeopardyDates,
      jcPresentDates:   form.jcPresentDates,
      grLectureDates:   form.grLectureDates,
      availabilityMode: form.availabilityMode,
      availableRanges:  form.availableRanges,
      canWorkDates:     form.canWorkDates,
      qgendaStaffId:    form.qgendaStaffId.trim() || undefined,
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
            <span className="inline-flex items-center text-sm px-3 py-1.5 rounded-lg font-semibold bg-primary/10 text-primary">
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
                    form.pgy === p ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300 hover:border-primary'
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

        {/* Availability (off-service only) — full block / date ranges / specific days */}
        {!persistentOnly && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Availability</label>
            <select value={form.availabilityMode} onChange={e => set('availabilityMode', e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 mb-2">
              <option value="full">Available all block</option>
              <option value="ranges">Date ranges</option>
              <option value="days">Specific days only</option>
            </select>
            {form.availabilityMode === 'ranges' && (
              <AvailabilityRangesEditor ranges={form.availableRanges} onUpdate={r => set('availableRanges', r)}/>
            )}
            {form.availabilityMode === 'days' && (
              <SpecialDaysList label="Can-Work Dates" dates={form.canWorkDates}
                onUpdate={d => set('canWorkDates', d)}
                chipClass="bg-green-100 text-green-700 border border-green-200"/>
            )}
          </div>
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

        {/* Vacation Dates — distinct from Approved Dates Off so the chief can track/label
            actual vacation separately; same hard-block mechanism under the hood. */}
        {persistentOnly && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vacation Dates</label>
            <p className="text-xs text-gray-400 mb-2">Resident is on vacation these dates — blocked in the schedule grid, tracked separately from Approved Dates Off</p>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[22px]">
              {form.vacationDates.length === 0
                ? <span className="text-xs text-gray-300 italic">None set</span>
                : form.vacationDates.map(d => (
                  <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700 border border-teal-200">
                    {formatDisplayDate(d)}
                    <button type="button" onClick={() => removeVacDate(d)} className="hover:opacity-60"><X size={10}/></button>
                  </span>
                ))
              }
            </div>
            <div className="flex items-center gap-1.5">
              <input type="date" value={newVacDate} onChange={e => setNewVacDate(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addVacDate())}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white" />
              <button type="button" onClick={addVacDate} disabled={!newVacDate}
                className="text-xs px-2.5 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded-lg disabled:opacity-30 transition-colors font-medium">
                Add
              </button>
            </div>
          </div>
        )}

        {/* Jeopardy Call Dates */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Jeopardy Call Dates</label>
          <p className="text-xs text-gray-400 mb-2">Resident covers backup (jeopardy) call these dates — handling set in Settings</p>
          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[22px]">
            {form.jeopardyDates.length === 0
              ? <span className="text-xs text-gray-300 italic">None set</span>
              : form.jeopardyDates.map(d => (
                <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
                  {formatDisplayDate(d)}
                  <button type="button" onClick={() => removeJeoDate(d)} className="hover:opacity-60"><X size={10}/></button>
                </span>
              ))
            }
          </div>
          <div className="flex items-center gap-1.5">
            <input type="date" value={newJeoDate} onChange={e => setNewJeoDate(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addJeoDate())}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white" />
            <button type="button" onClick={addJeoDate} disabled={!newJeoDate}
              className="text-xs px-2.5 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded-lg disabled:opacity-30 transition-colors font-medium">
              Add
            </button>
          </div>
        </div>

        {/* Journal Club presenting dates (EM Home only — one per academic year) */}
        {persistentOnly && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Journal Club Presenting Dates</label>
            <p className="text-xs text-gray-400 mb-2">Journal Club dates this resident presents on — max 3 worked/year still applies even when not presenting. Dates default to the first Tuesday of each month; the year's list is edited on the Dashboard tab.</p>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[22px]">
              {form.jcPresentDates.length === 0
                ? <span className="text-xs text-gray-300 italic">None set</span>
                : form.jcPresentDates.map(d => (
                  <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                    {formatDisplayDate(d)}
                    <button type="button" onClick={() => removeJcDate(d)} className="hover:opacity-60"><X size={10}/></button>
                  </span>
                ))
              }
            </div>
            <div className="flex items-center gap-1.5">
              <input type="date" value={newJcDate} onChange={e => { setNewJcDate(e.target.value); setJcError(''); }}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addJcDate())}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
              <button type="button" onClick={addJcDate} disabled={!newJcDate}
                className="text-xs px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-30 transition-colors font-medium">
                Add
              </button>
            </div>
            {jcError && <p className="text-xs text-red-600 mt-1">{jcError}</p>}
          </div>
        )}

        {/* Grand Rounds lecture dates (EM Home + EM BAMC) */}
        {(persistentOnly || form.category === 'EM_BAMC') && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Grand Rounds Lecture Dates</label>
            <p className="text-xs text-gray-400 mb-2">No evening/night shift the day before a lecture date</p>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[22px]">
              {form.grLectureDates.length === 0
                ? <span className="text-xs text-gray-300 italic">None set</span>
                : form.grLectureDates.map(d => (
                  <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                    {formatDisplayDate(d)}
                    <button type="button" onClick={() => removeGrDate(d)} className="hover:opacity-60"><X size={10}/></button>
                  </span>
                ))
              }
            </div>
            <div className="flex items-center gap-1.5">
              <input type="date" value={newGrDate} onChange={e => { setNewGrDate(e.target.value); setGrError(''); }}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addGrDate())}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
              <button type="button" onClick={addGrDate} disabled={!newGrDate}
                className="text-xs px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-30 transition-colors font-medium">
                Add
              </button>
            </div>
            {grError && <p className="text-xs text-red-600 mt-1">{grError}</p>}
          </div>
        )}

        {/* QGenda Staff ID — escape hatch for a resident QGenda matches by an internal
            abbreviation/id the name-format select can't guess (see src/lib/qgenda.js's
            qgendaName, which honors this verbatim ahead of any format). Optional; leaving it
            blank exports under the name-format chosen in Settings → QGenda Task Names. */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">QGenda Staff ID</label>
          <input className="input-field" value={form.qgendaStaffId} onChange={e => set('qgendaStaffId', e.target.value)} placeholder="e.g. SMITHJ"/>
          <p className="text-xs text-gray-400 mt-1">Optional — overrides the exported name for QGenda only. Leave blank to use the name format chosen in Settings → QGenda Task Names.</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">Cancel</button>
          <button type="submit" className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded-lg font-medium transition-colors">{submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

// Add wrapper — generates a new id on submit
function AddResidentModal({ onClose, onAdd, persistentOnly = false, initialCategory, initialPgy, ayData = {} }) {
  const lockCategory = !!initialCategory;
  const lockPgy      = !!initialPgy;
  const cats = persistentOnly ? CATEGORIES.filter(c => c.persistent) : CATEGORIES.filter(c => !c.persistent);
  const startCat = initialCategory ?? cats[0]?.id ?? 'EM_HOME';
  const startPgy = initialPgy ?? CAT_MAP[startCat]?.pgyOptions[0] ?? 1;

  return (
    <ResidentForm
      title={persistentOnly ? 'Add EM Resident' : `Add ${CAT_MAP[startCat]?.label ?? 'Resident'}`}
      submitLabel="Add Resident"
      ayData={ayData}
      persistentOnly={persistentOnly}
      lockCategory={lockCategory}
      lockPgy={lockPgy}
      initial={{ category: startCat, pgy: startPgy }}
      onClose={onClose}
      onSubmit={data => { onAdd({ id: uuid(), chiefRole: null, vacationDates: [], ...data, blockType: 'EM' }); onClose(); }}
    />
  );
}

// Edit wrapper — pre-fills from existing resident
function EditResidentModal({ resident, persistentOnly = false, onClose, onSave, ayData = {} }) {
  return (
    <ResidentForm
      title={`Edit — ${resident.firstName} ${resident.lastName}`}
      submitLabel="Save Changes"
      ayData={ayData}
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
  const existingKeys = useMemo(() => new Set(existingNames.map(n => normalizeToken(n.firstName) + '|' + normalizeToken(n.lastName))), [existingNames]);

  function parse() {
    const { ok, errors } = parseRosterText(text, allowedCategoryIds);
    const seen = new Set();
    const rows = ok.map(r => {
      const key = normalizeToken(r.firstName) + '|' + normalizeToken(r.lastName);
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
          placeholder={'Doe, Jane\tEM - Home\t1\nSmith, John\tEM - Home\t1'}
          className="w-full text-xs font-mono border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary"/>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
            <Upload size={12}/> Choose file
          </button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={pickFile} className="hidden"/>
          <button type="button" onClick={parse} disabled={!text.trim()}
            className="ml-auto px-3.5 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 disabled:opacity-40 text-white rounded-lg">
            Parse
          </button>
        </div>

        {preview && (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {preview.rows.map((r,i) => (
              <div key={`ok-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                {r.status === 'new'
                  ? <Check size={12} className="text-green-500 shrink-0"/>
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
            className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 disabled:opacity-40 text-white rounded-lg font-medium transition-colors">
            Import {newCount > 0 ? newCount : ''} resident{newCount!==1?'s':''}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── VACATION IMPORT (chief's yearly vacation-tracking Excel workbook) ────────
// Parses a single-sheet workbook with three PGY sections (row col-0 text starting "PGY1"/
// "PGY2"/"PGY3"), each followed immediately by resident rows: col 1 = name ("Last, First
// Middle", sometimes with a parenthetical suffix like "(ECFMG)"), then three repeating
// 13-column groups (Fall / second group / third), each holding Requested/Logged/.../Dates/
// BLK/Rotation/.../blank — only the "Dates" cell (offset +4 within each group) matters here.
// A trailing block of policy-note rows has no comma in the name column, which is what tells
// this parser to stop (same signal parseHomeResidentMatrixGrouped already uses elsewhere).
const VAC_DATE_RANGE_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*-\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;
const VAC_NAME_COL_IDX = 1;
const VAC_GROUP_WIDTH = 13; // Requested,Logged/NI,Logged/Spreadsheet,Entered in Qgenda,Dates,BLK,Rotation,Notified,Generated,Sent to Resident,Signed,Submitted,blank

// Tolerant "M/D - M/D", "M/D - M/D/YY", "M/D/YY - M/D/YY" range parser (optional 2-digit year
// on either/both ends). When both ends omit the year, replicates parseDateRangeInAY's own
// July-cutover inference rather than importing that function directly (it's tightly coupled to
// the Master Matrix parsers elsewhere in this file); when only one end has an explicit year,
// the other end's year is inferred from it instead of the AY cutover.
function parseVacationDateRange(raw, ayStartYear) {
  const m = VAC_DATE_RANGE_RE.exec(String(raw ?? '').trim());
  if (!m) return null;
  const sm = Number(m[1]), sd = Number(m[2]), em = Number(m[4]), ed = Number(m[5]);
  const pad = n => String(n).padStart(2, '0');
  const full = y => { if (y == null) return null; const n = Number(y); return n < 100 ? 2000 + n : n; };
  let startYear = full(m[3]), endYear = full(m[6]);
  if (startYear == null && endYear == null) {
    if (em < sm) { startYear = sm >= 7 ? ayStartYear : ayStartYear + 1; endYear = startYear + 1; }
    else { const year = em >= 7 ? ayStartYear : ayStartYear + 1; startYear = year; endYear = year; }
  } else if (startYear == null) {
    startYear = em < sm ? endYear - 1 : endYear;
  } else if (endYear == null) {
    endYear = em < sm ? startYear + 1 : startYear;
  }
  return { start: `${startYear}-${pad(sm)}-${pad(sd)}`, end: `${endYear}-${pad(em)}-${pad(ed)}` };
}

function expandDateRangeInclusive(start, end) {
  const dates = [];
  let cur = parseDate(start);
  const last = parseDate(end);
  while (cur <= last) { dates.push(toDateStr(cur)); cur = addDays(cur, 1); }
  return dates;
}

// Groups the sheet's rows into PGY sections, each a run of "Last, First"-shaped name-column
// rows immediately following a "PGY\d" marker in column 0 — stops a section (without needing
// to find the next PGY marker) as soon as a row's name column isn't comma-shaped, which is
// what naturally excludes the blank divider rows and the trailing policy-note block.
function findVacationSections(sheetRows) {
  const sections = [];
  let current = null;
  for (let i = 0; i < sheetRows.length; i++) {
    const row = sheetRows[i] || [];
    const cell0 = String(row[0] ?? '').trim();
    const pgyMatch = /^PGY\s*(\d)/i.exec(cell0);
    if (pgyMatch) { current = { pgy: Number(pgyMatch[1]), headerRow: row, rows: [] }; sections.push(current); continue; }
    if (!current) continue;
    const nameCell = String(row[VAC_NAME_COL_IDX] ?? '');
    if (!nameCell.includes(',')) { current = null; continue; }
    current.rows.push({ raw: row, nameCell });
  }
  return sections;
}

function vacationGroupDatesColIdx(groupIndex) { return VAC_NAME_COL_IDX + 1 + groupIndex * VAC_GROUP_WIDTH + 4; }

// Reads the Dates cell for each of a row's 3 rotation groups. Trusts the computed column offset
// only after confirming the header row actually says "Dates" there; otherwise falls back to a
// full-row regex scan for the groupIndex-th date-range-shaped cell (defensive — the real
// workbook validates cleanly at the computed offsets, this is a guard against an off-by-one in
// some other month's export).
function extractVacationDateCells(row, headerRow) {
  const cells = [];
  for (let g = 0; g < 3; g++) {
    const idx = vacationGroupDatesColIdx(g);
    let cell = normalizeToken(headerRow[idx]) === 'dates' ? row[idx] : undefined;
    if (cell === undefined) {
      const hits = row.filter(v => VAC_DATE_RANGE_RE.test(String(v ?? '').trim()));
      cell = hits[g];
    }
    if (cell != null && String(cell).trim()) cells.push(String(cell).trim());
  }
  return cells;
}

function stripVacationNameSuffix(raw) { return String(raw ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim(); }

function vacTokenSet(str) { return new Set(String(str ?? '').trim().split(/\s+/).map(normalizeToken).filter(Boolean)); }
function vacTokensIntersect(a, b) { for (const x of a) if (b.has(x)) return true; return false; }

// Tolerant match: last-name TOKEN SETS intersect AND first-name TOKEN SETS intersect — handles
// "Avila, Anthony Joseph" (file) vs roster "Avila, Anthony" (extra middle name), "Bamback
// Shrestha, Niva" (file) vs roster "Shrestha, Niva" (extra last-name token), etc. Returns every
// roster resident that matches — caller treats >1 as ambiguous rather than guessing.
function matchVacationRoster(firstName, lastName, emRoster) {
  const lastTokens = vacTokenSet(lastName), firstTokens = vacTokenSet(firstName);
  return emRoster.filter(r => vacTokensIntersect(lastTokens, vacTokenSet(r.lastName)) && vacTokensIntersect(firstTokens, vacTokenSet(r.firstName)));
}

// Parses the whole workbook into { matched, unmatched, skipped } — matched/unmatched/skipped
// mirror the modal's own preview categories 1:1 so the standalone verification script can
// exercise this exact function shape too.
function parseVacationWorkbook(sheetRows, ayStartYear, emRoster) {
  const sections = findVacationSections(sheetRows);
  const matched = [], unmatched = [], skipped = [];
  for (const section of sections) {
    for (const row of section.rows) {
      const rawName = row.nameCell.trim();
      const cleaned = stripVacationNameSuffix(rawName);
      const name = splitName(cleaned);
      if (!name) { unmatched.push({ rawName, reason: 'Could not parse "Last, First" name' }); continue; }

      const dateCells = extractVacationDateCells(row.raw, section.headerRow);
      const parsedRanges = [], badCells = [];
      for (const c of dateCells) { const r = parseVacationDateRange(c, ayStartYear); if (r) parsedRanges.push(r); else badCells.push(c); }

      const isoDates = new Set();
      for (const r of parsedRanges) for (const d of expandDateRangeInclusive(r.start, r.end)) isoDates.add(d);

      if (badCells.length) { unmatched.push({ rawName, reason: `Unparseable date range(s): ${badCells.join(', ')}` }); continue; }
      if (isoDates.size === 0) { skipped.push({ rawName }); continue; }

      const candidates = matchVacationRoster(name.firstName, name.lastName, emRoster);
      if (candidates.length === 0) { unmatched.push({ rawName, reason: 'No roster match' }); continue; }
      if (candidates.length > 1) {
        unmatched.push({ rawName, reason: 'Ambiguous — multiple roster matches', candidates: candidates.map(c => `${c.lastName}, ${c.firstName} (PGY-${c.pgy})`) });
        continue;
      }
      matched.push({ residentId: candidates[0].id, rosterName: `${candidates[0].lastName}, ${candidates[0].firstName}`, rawName, dates: [...isoDates].sort() });
    }
  }
  return { matched, unmatched, skipped };
}

function ImportVacationModal({ emRoster, setEmRoster, onClose, showToast }) {
  const [fileName, setFileName] = useState('');
  const [ayStartYear, setAyStartYear] = useState(() => Number(getAcademicYear().slice(2, 4)) + 2000);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  function pickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    setPreview(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
        const result = parseVacationWorkbook(rows, ayStartYear, emRoster);
        if (result.matched.length === 0 && result.unmatched.length === 0) {
          setError('No PGY sections recognized — expected rows whose first column starts with "PGY1", "PGY2", or "PGY3".');
          return;
        }
        setPreview(result);
      } catch (err) {
        setError(`Couldn't read this file — ${err?.message || 'is it a valid .xlsx workbook?'}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function commit() {
    if (!preview || !preview.matched.length) return;
    const byId = new Map(preview.matched.map(m => [m.residentId, m.dates]));
    setEmRoster(prev => prev.map(r => {
      const newDates = byId.get(r.id);
      if (!newDates) return r;
      const merged = [...new Set([...(r.vacationDates || []), ...newDates])].sort();
      return { ...r, vacationDates: merged };
    }));
    showToast(`Imported vacation dates for ${preview.matched.length} resident${preview.matched.length !== 1 ? 's' : ''}`, 'green');
    onClose();
  }

  return (
    <Modal title="Import Vacation Dates" onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Upload the chief's vacation-tracking workbook (.xlsx) — PGY1/PGY2/PGY3 sections, each resident's
          name plus up to three logged date ranges. This only ever adds to each matched resident's{' '}
          <strong>Vacation Dates</strong> — it never touches any other field, and never touches off-service residents.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
            <Upload size={12}/> Choose .xlsx file
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" onChange={pickFile} className="hidden"/>
          {fileName && <span className="text-xs text-gray-500">{fileName}</span>}
          <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
            AY start year
            <input type="number" value={ayStartYear} onChange={e => setAyStartYear(Number(e.target.value))}
              className="w-20 text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"/>
          </label>
        </div>
        <p className="text-xs text-gray-400 -mt-2">Only used to infer the year for date ranges that don't spell one out (e.g. "9/14 - 9/20").</p>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 text-xs bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertTriangle size={14} className="shrink-0 mt-0.5"/> {error}
          </div>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="font-semibold text-gray-700">Matched</p>
                <p className="text-gray-500 mt-1">{preview.matched.length} resident{preview.matched.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="font-semibold text-amber-800">Unmatched / ambiguous</p>
                <p className="text-amber-700 mt-1">{preview.unmatched.length} row{preview.unmatched.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="font-semibold text-gray-700">No dates logged yet</p>
                <p className="text-gray-500 mt-1">{preview.skipped.length} skipped</p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
              {preview.matched.map(m => (
                <div key={m.residentId} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <Check size={12} className="text-green-500 shrink-0"/>
                  <span className="text-gray-700">{m.rawName}</span>
                  <span className="text-gray-400">→ {m.rosterName}</span>
                  <span className="ml-auto text-gray-400" title={m.dates.map(formatDisplayDate).join(', ')}>{m.dates.length} date{m.dates.length !== 1 ? 's' : ''}</span>
                </div>
              ))}
              {preview.matched.length === 0 && (
                <p className="px-3 py-3 text-xs text-gray-400 text-center">No matched residents.</p>
              )}
            </div>

            {preview.unmatched.length > 0 && (
              <div className="border border-amber-200 rounded-lg divide-y divide-amber-100 max-h-56 overflow-y-auto">
                {preview.unmatched.map((u,i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-xs bg-amber-50/50">
                    <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5"/>
                    <div>
                      <span className="text-amber-800 font-medium">{u.rawName}</span>
                      <span className="text-amber-700"> — {u.reason}</span>
                      {u.candidates && <p className="text-amber-600 mt-0.5">Candidates: {u.candidates.join(' · ')}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-400">
              Committing merges (dedupes + sorts) the parsed dates into each matched resident's Vacation Dates —
              re-uploading the same file again is safe, already-present dates won't duplicate.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">Cancel</button>
          <button type="button" onClick={commit} disabled={!preview || preview.matched.length === 0}
            className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 disabled:opacity-40 text-white rounded-lg font-medium transition-colors">
            Import {preview ? preview.matched.length : ''} resident{preview?.matched.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── LECTURE / M&M / JOURNAL CLUB IMPORT (paste from the chief's tracking sheet) ──────────────
// One resident per pasted line: Name, Lecture date, [M&M date], Journal Club date — tab- or
// comma-separated, 3 columns (Lecture, JC) or 4 (Lecture, M&M, JC), auto-detected per row since
// PGY-3 rows carry M&M and PGY-1/2 rows don't. M&M "counts as a lecture" per the chief — it
// merges into the SAME grLectureDates field as Lecture (the Tuesday-evening/night strip in
// getEligibleShifts and the GR-weekday check in validateAll both key off grLectureDates
// generically, with no lecture-type distinction, so no rule-engine change is needed). Journal
// Club dates merge into jcPresentDates. Validation (Wednesday/Thursday GR weekday for Lecture+
// M&M, first-Tuesday for JC, plus an "predates this AY" sanity check) is advisory only — shown
// per-date in the preview, never blocks commit.
const LECTURE_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

function parseLectureImportDate(raw) {
  const m = LECTURE_DATE_RE.exec(String(raw ?? '').trim());
  if (!m) return null;
  const mo = Number(m[1]), da = Number(m[2]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  let yr = Number(m[3]);
  if (yr < 100) yr += 2000;
  const pad = n => String(n).padStart(2, '0');
  return `${yr}-${pad(mo)}-${pad(da)}`;
}

// Tries a strict first+last token-set match (same shape as matchVacationRoster) under both
// possible word-order readings of a pasted name — this paste format is "First Last", but a
// chief could paste "Last First" by habit — then, only if neither strict reading lands a unique
// hit, falls back to last-name-token-only matching. The fallback tier exists because real names
// carry nicknames the roster's on-file name doesn't spell out ("Cat" for "Catherine", "Gabe" for
// "Gabriel", "Katie" for "Kathryn") that a first-name-token-overlap requirement would reject
// outright even though the last name alone is unique in a roster this size.
function matchLectureRosterName(rawName, emRoster) {
  const parts = String(rawName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { candidates: [], tier: 'none' };
  const asFirstLast = { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
  const asLastFirst = { firstName: parts.slice(1).join(' '), lastName: parts[0] };

  const strictA = matchVacationRoster(asFirstLast.firstName, asFirstLast.lastName, emRoster);
  if (strictA.length === 1) return { candidates: strictA, tier: 'strict' };
  const strictB = matchVacationRoster(asLastFirst.firstName, asLastFirst.lastName, emRoster);
  if (strictB.length === 1) return { candidates: strictB, tier: 'strict' };

  const lastTokens = vacTokenSet(asFirstLast.lastName);
  const lastOnly = emRoster.filter(r => vacTokensIntersect(lastTokens, vacTokenSet(r.lastName)));
  if (lastOnly.length === 1) return { candidates: lastOnly, tier: 'lastNameOnly' };
  if (lastOnly.length > 1) return { candidates: lastOnly, tier: 'ambiguous' };
  if (strictA.length > 1) return { candidates: strictA, tier: 'ambiguous' };
  return { candidates: [], tier: 'none' };
}

// Per-date advisory checks, reusing the exact rules ResidentForm/validateAll already apply to
// grLectureDates/jcPresentDates (grWorkDow, isJcDateAnyAy) plus one addition: an out-of-AY-range
// date most often means a plain year typo (e.g. a 2-digit year transcribed one year short), so it
// gets its own actionable "did you mean <year+1>?" message rather than just failing the DOW check
// silently. kind is 'lecture' | 'mm' | 'jc'.
function validateLectureImportDate(dateStr, kind, resident, ayStartYear, ayData = {}) {
  const warnings = [];
  const ayStart = `${ayStartYear}-07-01`;
  const ayEnd = `${ayStartYear + 1}-07-01`;
  if (dateStr < ayStart) {
    const bumped = `${ayStartYear + 1}${dateStr.slice(4)}`;
    warnings.push(`Predates the ${ayStartYear}/${String(ayStartYear + 1).slice(2)} academic year (starts ${formatDisplayDate(ayStart)}) — did you mean ${formatDisplayDate(bumped)}?`);
  } else if (dateStr >= ayEnd) {
    warnings.push(`Falls after the ${ayStartYear}/${String(ayStartYear + 1).slice(2)} academic year ends`);
  }
  if (kind === 'jc') {
    if (!isJcDateAnyAy(dateStr, ayData)) warnings.push('Not a Journal Club date for that academic year (defaults to the first Tuesday of the month)');
  } else {
    const expectedDow = grWorkDow(resident);
    if (expectedDow == null || parseDate(dateStr).getDay() !== expectedDow)
      warnings.push(`Not a ${DOW[expectedDow] ?? 'Grand Rounds'} — this resident's GR weekday`);
  }
  return warnings;
}

// Parses the whole pasted block into { matched, unmatched } — matched/unmatched mirror the
// modal's own preview categories 1:1, same convention as parseVacationWorkbook, so the standalone
// verification script can exercise this exact function shape too.
function parseLectureImportText(text, emRoster, ayStartYear, ayData = {}) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const matched = [], unmatched = [];
  for (const line of lines) {
    const delim = line.includes('\t') ? '\t' : ',';
    const cols = (delim === '\t' ? line.split('\t') : splitCsvLine(line)).map(s => s.trim());
    while (cols.length && cols[cols.length - 1] === '') cols.pop();
    if (/^(resident|name)$/i.test(cols[0] || '') && cols.some(c => /lecture|journal|m\s*&\s*m/i.test(c))) continue; // header row

    const rawName = cols[0] || '';
    if (cols.length < 3) { unmatched.push({ rawName: rawName || line, reason: `Expected Name + at least 2 date columns (Lecture, Journal Club) — got ${cols.length} column${cols.length === 1 ? '' : 's'}` }); continue; }

    const hasMM = cols.length >= 4;
    const lectureRaw = cols[1], mmRaw = hasMM ? cols[2] : null, jcRaw = hasMM ? cols[3] : cols[2];

    const { candidates, tier } = matchLectureRosterName(rawName, emRoster);
    if (candidates.length !== 1) {
      unmatched.push({ rawName, reason: candidates.length === 0 ? 'No roster match' : 'Ambiguous — multiple roster matches',
        candidates: candidates.map(c => `${c.firstName} ${c.lastName} (PGY-${c.pgy})`) });
      continue;
    }
    const resident = candidates[0];

    const dateEntries = [];
    for (const [kind, raw] of [['lecture', lectureRaw], ['mm', mmRaw], ['jc', jcRaw]]) {
      if (raw == null || raw === '') continue;
      const iso = parseLectureImportDate(raw);
      if (!iso) { dateEntries.push({ kind, raw, iso: null, warnings: [`Couldn't parse "${raw}" as a date (expected M/D/YY or M/D/YYYY)`] }); continue; }
      dateEntries.push({ kind, raw, iso, warnings: validateLectureImportDate(iso, kind, resident, ayStartYear, ayData) });
    }

    matched.push({ residentId: resident.id, rosterName: `${resident.firstName} ${resident.lastName}`, rawName, matchTier: tier, dateEntries });
  }
  return { matched, unmatched };
}

function ImportLecturesModal({ emRoster, setEmRoster, onClose, showToast, ayData = {} }) {
  const [text, setText] = useState('');
  const [ayStartYear, setAyStartYear] = useState(() => Number(getAcademicYear().slice(2, 4)) + 2000);
  const [preview, setPreview] = useState(null);

  function parse() { setPreview(parseLectureImportText(text, emRoster, ayStartYear, ayData)); }

  function commit() {
    if (!preview || !preview.matched.length) return;
    const byId = new Map();
    for (const m of preview.matched) {
      const lec = [], jc = [];
      for (const e of m.dateEntries) { if (!e.iso) continue; (e.kind === 'jc' ? jc : lec).push(e.iso); }
      byId.set(m.residentId, { lec, jc });
    }
    setEmRoster(prev => prev.map(r => {
      const add = byId.get(r.id);
      if (!add) return r;
      return {
        ...r,
        grLectureDates: [...new Set([...(r.grLectureDates || []), ...add.lec])].sort(),
        jcPresentDates: [...new Set([...(r.jcPresentDates || []), ...add.jc])].sort(),
      };
    }));
    showToast(`Imported lecture/JC dates for ${preview.matched.length} resident${preview.matched.length !== 1 ? 's' : ''}`, 'green');
    onClose();
  }

  const totalWarnings = preview ? preview.matched.reduce((n, m) => n + m.dateEntries.reduce((k, e) => k + e.warnings.length, 0), 0) : 0;

  return (
    <Modal title="Import Lecture / M&M / Journal Club Dates" onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Paste one resident per line: Name, Lecture date, optional M&amp;M date, Journal Club date (tab- or comma-separated;
          M&amp;M column is auto-detected — include it only for rows that have one). Dates as M/D/YY or M/D/YYYY. Lecture and
          M&amp;M dates merge into <strong>Grand Rounds Lecture Dates</strong> (M&amp;M counts as a lecture — same day-before
          eve/night strip applies to both); Journal Club dates merge into <strong>Journal Club Presenting Dates</strong>. Never
          touches any other field.
        </p>

        <textarea value={text} onChange={e => { setText(e.target.value); setPreview(null); }} rows={8}
          placeholder={'Codie Kurka\t9/30/26\t5/19/27\t1/5/27\nCaitlyn Frost\t10/7/26\t5/4/27'}
          className="w-full text-xs font-mono border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary"/>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            AY start year
            <input type="number" value={ayStartYear} onChange={e => setAyStartYear(Number(e.target.value))}
              className="w-20 text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"/>
          </label>
          <button type="button" onClick={parse} disabled={!text.trim()}
            className="ml-auto px-3.5 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 disabled:opacity-40 text-white rounded-lg">
            Parse
          </button>
        </div>

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="font-semibold text-gray-700">Matched</p>
                <p className="text-gray-500 mt-1">
                  {preview.matched.length} resident{preview.matched.length !== 1 ? 's' : ''}
                  {totalWarnings > 0 && <span className="text-amber-600"> · {totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}</span>}
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="font-semibold text-amber-800">Unmatched / ambiguous</p>
                <p className="text-amber-700 mt-1">{preview.unmatched.length} row{preview.unmatched.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {preview.matched.map(m => (
                <div key={m.residentId} className="px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Check size={12} className="text-green-500 shrink-0"/>
                    <span className="text-gray-700">{m.rawName}</span>
                    <span className="text-gray-400">→ {m.rosterName}</span>
                    {m.matchTier === 'lastNameOnly' && (
                      <span className="text-amber-500" title="Matched on last name only — first name didn't overlap (nickname?)">(last-name match)</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1 ml-5">
                    {m.dateEntries.map((e, i) => (
                      <span key={i} title={e.warnings.join('; ') || undefined}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border font-medium ${
                          !e.iso ? 'bg-red-50 border-red-200 text-red-600'
                          : e.warnings.length ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        {e.kind === 'jc' ? 'JC' : e.kind === 'mm' ? 'M&M' : 'Lec'}: {e.iso ? formatDisplayDate(e.iso) : e.raw}
                        {(e.warnings.length > 0 || !e.iso) && <AlertTriangle size={10}/>}
                      </span>
                    ))}
                  </div>
                  {m.dateEntries.some(e => e.warnings.length > 0) && (
                    <ul className="ml-5 mt-0.5 text-amber-600 space-y-0.5">
                      {m.dateEntries.filter(e => e.warnings.length > 0).map((e, i) => (
                        <li key={i}>{e.kind === 'jc' ? 'JC' : e.kind === 'mm' ? 'M&M' : 'Lecture'} {e.raw}: {e.warnings.join('; ')}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {preview.matched.length === 0 && (
                <p className="px-3 py-3 text-xs text-gray-400 text-center">No matched residents.</p>
              )}
            </div>

            {preview.unmatched.length > 0 && (
              <div className="border border-amber-200 rounded-lg divide-y divide-amber-100 max-h-56 overflow-y-auto">
                {preview.unmatched.map((u, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-xs bg-amber-50/50">
                    <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5"/>
                    <div>
                      <span className="text-amber-800 font-medium">{u.rawName}</span>
                      <span className="text-amber-700"> — {u.reason}</span>
                      {u.candidates && <p className="text-amber-600 mt-0.5">Candidates: {u.candidates.join(' · ')}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-400">
              Warnings are advisory only and never block import — review them, then commit if the chief confirms the date is
              correct as entered. Committing merges (dedupes + sorts) parsed dates into each matched resident's Grand Rounds
              Lecture Dates / Journal Club Presenting Dates; re-pasting the same rows again is safe.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">Cancel</button>
          <button type="button" onClick={commit} disabled={!preview || preview.matched.length === 0}
            className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 disabled:opacity-40 text-white rounded-lg font-medium transition-colors">
            Import {preview ? preview.matched.length : ''} resident{preview?.matched.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── EM RESIDENTS TAB ─────────────────────────────────────────────────────────

function EMResidentsTab({ emRoster, setEmRoster, block, updateBlock, appSettings, showToast, ayData = {}, blocksHistory = [] }) {
  // showAdd: null | { pgy, category }
  const [showAdd, setShowAdd]         = useState(null);
  const [showImport, setShowImport]   = useState(false);
  const [showImportVacation, setShowImportVacation] = useState(false);
  const [showImportLectures, setShowImportLectures] = useState(false);
  const [editResident, setEditResident] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const assign = block.emBlockAssignments || {};
  const sched  = block.schedule || {};

  // Jeopardy/sick-call ledger for this block's AY — same derivation as everywhere else in the
  // file (block.academicYear, falling back to deriving it from startDate). Advisory-only figures
  // (see src/lib/jeopardyLedger.js): nothing here reads or feeds the generator/scorer.
  const jeopardyAy = block.academicYear || (block.startDate ? getAcademicYearFor(block.startDate) : null);
  const jeopardyLedger = useMemo(() => {
    if (!jeopardyAy) return {};
    const log = Array.isArray(appSettings?.jeopardyLog) ? appSettings.jeopardyLog : [];
    return computeLedger(jeopardyAy, log, block, blocksHistory);
  }, [jeopardyAy, appSettings?.jeopardyLog, block, blocksHistory]);

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
  function target(r) { const ba = assign[r.id] || {}; return getShiftTarget({ ...r, isChief: !!ba.isChief, blockType: ba.blockType ?? 'EM', targetDelta: ba.targetDelta }, appSettings); }

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
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors">
              <Plus size={11}/> EM PGY-{pgy}
            </button>
          ))}
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
            <Upload size={11}/> Import Roster
          </button>
          <button onClick={() => setShowImportVacation(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
            <Upload size={11}/> Import Vacation Dates
          </button>
          <button onClick={() => setShowImportLectures(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
            <Upload size={11}/> Import Lecture / JC Dates
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
              <span className="font-display text-xs font-bold text-gray-600 uppercase tracking-widest">PGY-{pgy}</span>
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
              const delta   = Number(ba.targetDelta);
              const hasDelta = Number.isFinite(delta) && delta !== 0;
              const cat     = CAT_MAP[res.category];
              const chiefRole = effectiveChiefRole({ ...res, isChief: !!ba.isChief });
              return (
                <div key={res.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{res.firstName} {res.lastName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat?.badge}`}>{cat?.shortLabel} PGY-{res.pgy}</span>
                        {chiefRole && CHIEF_ROLES[chiefRole] && <span title={CHIEF_ROLES[chiefRole].label} className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-medium">Chief ★{CHIEF_ROLES[chiefRole].badge}</span>}
                        {!sched_ok && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground"
                            title={`On ${btObj?.label || bt} this block — not placed on the EM schedule`}>
                            Not scheduled this block
                          </span>
                        )}
                      </div>
                      {(res.approvedDatesOff?.length > 0 || res.vacationDates?.length > 0 || res.jeopardyDates?.length > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(res.approvedDatesOff || []).map(d => (
                            <span key={d} className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200 font-medium">{formatDisplayDate(d)} off</span>
                          ))}
                          {(res.vacationDates || []).map(d => (
                            <span key={`v${d}`} className="text-xs px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-600 border border-teal-200 font-medium">{formatDisplayDate(d)} VAC</span>
                          ))}
                          {(res.jeopardyDates || []).map(d => (
                            <span key={`j${d}`} className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 border border-purple-200 font-medium">J: {formatDisplayDate(d)}</span>
                          ))}
                        </div>
                      )}
                      {/* Advisory-only jeopardy/sick-call rollup for this AY (see D3 card on the
                          Dashboard for the incident log itself) — shown only when this resident
                          has a non-zero figure so ordinary tiles stay clean. */}
                      {jeopardyLedger[res.id] && (
                        <div className="text-xs text-gray-400 mt-1">
                          Sick {jeopardyLedger[res.id].sickCalls} · Activations {jeopardyLedger[res.id].activations}
                          {jeopardyLedger[res.id].remaining !== 0 && (
                            jeopardyLedger[res.id].remaining < 0
                              ? ` · ${Math.abs(jeopardyLedger[res.id].remaining)} credit${Math.abs(jeopardyLedger[res.id].remaining) === 1 ? '' : 's'} over-spent`
                              : ` · ${jeopardyLedger[res.id].remaining} credit${jeopardyLedger[res.id].remaining === 1 ? '' : 's'} left`
                          )}
                        </div>
                      )}
                    </div>
                    {/* Edit + Remove */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => setEditResident(res)} title="Edit profile"
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded transition-colors">
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
                        className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary">
                        {BLOCK_TYPES_EM
                          .filter(b => (EM_HOME_BLOCK_TYPES_BY_PGY[res.pgy] || []).includes(b.id))
                          .map(b => (
                            <option key={b.id} value={b.id}>{b.label}{!b.atUH ? ' (away)' : !b.schedulable ? ' (not sched)' : ''}</option>
                          ))
                        }
                      </select>
                    </div>
                    {res.pgy === 3 && (
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-gray-500 shrink-0">Chief role:</label>
                        <select value={res.chiefRole || ''}
                          onChange={e => setEmRoster(p => p.map(r => r.id === res.id ? { ...r, chiefRole: e.target.value || null } : r))}
                          title="Roster-level for the whole academic year — not per-block"
                          className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary">
                          <option value="">None</option>
                          <option value="academic">Academic Chief</option>
                          <option value="admin">Admin Chief</option>
                          <option value="scheduling">Scheduling Chief</option>
                        </select>
                        <span className="text-xs text-gray-400">(16 shifts)</span>
                      </div>
                    )}
                    {/* One-block target adjustment ("buy-down"/"buy-up") — a delta + reason note,
                        never an absolute number, so it survives a future SHIFT_TARGETS change and
                        stays self-documenting. Written via setBA, same merge-on-write path as
                        blockType/isChief above. */}
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-500 shrink-0" title="One-block shift-target adjustment, e.g. a buy-down earned by covering jeopardy — expressed as a delta so it survives future target changes">Target Δ:</label>
                      <input type="number" step="1" value={ba.targetDelta ?? ''}
                        onChange={e => { const v = e.target.value; setBA(res.id, 'targetDelta', v === '' ? undefined : Number(v)); }}
                        placeholder="0"
                        className="w-14 text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"/>
                      {hasDelta && (
                        <>
                          <input type="text" value={ba.targetNote ?? ''} onChange={e => setBA(res.id, 'targetNote', e.target.value)}
                            placeholder="Reason (e.g. covered jeopardy 3x)"
                            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-[9rem]"/>
                          <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0" title="Marks this as a buy-down — the jeopardy ledger reads this flag">
                            <input type="checkbox" checked={!!ba.targetIsBuyDown} onChange={e => setBA(res.id, 'targetIsBuyDown', e.target.checked)}/>
                            buy-down
                          </label>
                        </>
                      )}
                    </div>
                    {tgt != null && sched_ok && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        {hasDelta && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ba.targetIsBuyDown ? 'bg-teal-100 text-teal-700 border border-teal-200' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'}`}
                            title={ba.targetNote || (delta < 0 ? 'Target reduced this block' : 'Target increased this block')}>
                            {delta > 0 ? `+${delta}` : delta}{ba.targetIsBuyDown ? ' buy-down' : ''}
                          </span>
                        )}
                        <span className={`text-xs font-medium ${over ? 'text-red-500' : 'text-gray-400'}`}>{cnt}/{tgt}</span>
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${over ? 'bg-red-500' : cnt >= tgt ? 'bg-green-500' : 'bg-primary'}`}
                            style={{ width: `${Math.min(100, tgt ? cnt / tgt * 100 : 0)}%` }}/>
                        </div>
                      </div>
                    )}
                    {tgt == null && hasDelta && sched_ok && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-teal-100 text-teal-700 border border-teal-200"
                          title={ba.targetNote || 'Fully bought down — no shift-count target this block'}>
                          Bought down — {cnt} shift{cnt !== 1 ? 's' : ''} worked
                        </span>
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
        <AddResidentModal persistentOnly ayData={ayData}
          initialCategory={showAdd.category}
          initialPgy={showAdd.pgy}
          onClose={() => setShowAdd(null)}
          onAdd={addRes}/>
      )}
      {editResident && (
        <EditResidentModal persistentOnly ayData={ayData} resident={editResident}
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
            id: uuid(), ...r, blockType: 'EM', isCCUNights: false, chiefRole: null, approvedDatesOff: [], jeopardyDates: [],
            jcPresentDates: [], grLectureDates: [], vacationDates: [],
          }))])}
          onClose={() => setShowImport(false)}/>
      )}
      {showImportVacation && (
        <ImportVacationModal emRoster={emRoster} setEmRoster={setEmRoster} showToast={showToast}
          onClose={() => setShowImportVacation(false)}/>
      )}
      {showImportLectures && (
        <ImportLecturesModal emRoster={emRoster} setEmRoster={setEmRoster} showToast={showToast} ayData={ayData}
          onClose={() => setShowImportLectures(false)}/>
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
                              chipClass="bg-purple-100 text-purple-600 border border-purple-200"/>
                          </div>
                          {/* Availability: full block (default) / date ranges / specific days only */}
                          <div className="mt-3">
                            <p className="text-xs font-semibold text-gray-600 mb-1">Availability</p>
                            <select value={res.availabilityMode || 'full'}
                              onChange={e => setField(res.id, 'availabilityMode', e.target.value)}
                              className="text-xs border border-gray-300 rounded-lg px-2 py-1 mb-2">
                              <option value="full">Available all block</option>
                              <option value="ranges">Date ranges</option>
                              <option value="days">Specific days only</option>
                            </select>
                            {res.availabilityMode === 'ranges' && (
                              <AvailabilityRangesEditor ranges={res.availableRanges || []}
                                onUpdate={r => setField(res.id, 'availableRanges', r)}/>
                            )}
                            {res.availabilityMode === 'days' && (
                              <SpecialDaysList label="Can-Work Dates" dates={res.canWorkDates || []}
                                onUpdate={d => setField(res.id, 'canWorkDates', d)}
                                chipClass="bg-green-100 text-green-700 border border-green-200"/>
                            )}
                          </div>
                        </div>
                        {/* Edit + Remove */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => setEditResident(res)} title="Edit profile"
                            className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded transition-colors">
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
                            <div className={`h-full rounded-full ${over ? 'bg-red-500' : cnt >= tgt ? 'bg-green-500' : 'bg-primary'}`}
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
            id: uuid(), ...r, blockType: 'EM', isCCUNights: false, approvedDatesOff: [], jeopardyDates: [],
            availabilityMode: 'full', availableRanges: [], canWorkDates: [],
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

  // Reads and writes go through the same diff helpers getEffectiveEligibility uses, so this grid
  // can never show a different answer than the scheduler acts on. A toggle recomputes the whole
  // diff from the resulting list, and a diff that ends up empty DELETES the key — so putting a row
  // back to its default clears the override instead of leaving a no-op one behind (same convention
  // as the Rules-tab coverage editor).
  function baseFor(k) { return eligBaseFor(k, eligOverrides); }
  function effective(k) { return resolveEligibilityList(eligOverrides[k], baseFor(k)); }
  function isElig(k,s) { return effective(k).includes(s); }
  function writeList(k, list) {
    const diff = eligibilityDiff(list, baseFor(k));
    setEligOverrides(p => {
      const n = { ...p };
      if (isEligibilityDiffEmpty(diff)) delete n[k]; else n[k] = diff;
      return n;
    });
  }
  function toggle(k,s) {
    const cur = effective(k);
    writeList(k, cur.includes(s) ? cur.filter(x=>x!==s) : [...cur, s]);
  }
  function isModified(k) { return JSON.stringify([...(BASE_ELIGIBILITY[k]||[])].sort()) !== JSON.stringify([...effective(k)].sort()); }
  function resetRow(k) { setEligOverrides(p=>{ const n={...p}; delete n[k]; return n; }); }

  // Rotation sub-row helpers — key format: CATEGORY_PGY__ROTATION. A rotation diff applies on top
  // of its PARENT's effective list (eligBaseFor resolves that), which is what makes a category-level
  // edit still reach every rotation row that hasn't overridden that specific shift.
  function subKey(parentKey, btId) { return `${parentKey}__${btId}`; }
  function subEffective(parentKey, btId) {
    const k = subKey(parentKey, btId);
    return resolveEligibilityList(eligOverrides[k], effective(parentKey));
  }
  function subHasOverride(parentKey, btId) { return eligOverrides[subKey(parentKey, btId)] != null; }
  function subToggle(parentKey, btId, s) {
    const cur = subEffective(parentKey, btId);
    writeList(subKey(parentKey, btId), cur.includes(s) ? cur.filter(x=>x!==s) : [...cur, s]);
  }
  function subReset(parentKey, btId) { resetRow(subKey(parentKey, btId)); }

  // Schedulable rotations per EM Home PGY (sub-rows only make sense where the chief schedules)
  function rotationsFor(rowKey) {
    const m = rowKey.match(/^EM_HOME_(\d)$/);
    if (!m) return [];
    const ids = EM_HOME_BLOCK_TYPES_BY_PGY[Number(m[1])] || [];
    return ids.map(id => BLOCK_TYPE_MAP[id]).filter(b => b && b.schedulable);
  }

  // Per-area light-tint color, derived from AREA_COLORS (see CONSTANTS section) — the single
  // source of truth for shift-area color, shared with SHIFTS[].chip and PDF_AREA_LIGHT.
  const areaColor = Object.fromEntries(SHIFT_AREAS.map(a => [a, AREA_COLORS[a].tint]));

  function CellButton({ k, s, checked, inherited = false, onToggle }) {
    return (
      <td className="border-r border-gray-100 p-0 text-center">
        <button onClick={onToggle}
          title={`${checked ? 'Remove' : 'Add'} ${s.label}${inherited ? ' (inherits from category default — clicking creates a rotation override)' : ''}`}
          className={`w-full h-9 flex items-center justify-center transition-colors ${checked ? 'bg-primary/10 hover:bg-primary/10' : 'hover:bg-gray-100'}`}>
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
                    {/* s.short (e.g. PED-N-FM's 'NF') disambiguates same-type shifts that would
                        otherwise render identical single-letter headers — see s.type[0] fallback
                        for every shift without one. */}
                    <span className={`text-xs px-1 py-0.5 rounded font-bold ${s.chip}`}>{s.short ?? s.type[0].toUpperCase()}</span>
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
                              className="text-gray-400 hover:text-primary transition-colors -ml-1">
                              <ChevronDown size={12} className={`transition-transform ${isOpen ? '' : '-rotate-90'}`}/>
                            </button>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cat?.badge}`}>{row.sub}</span>
                          <span className="text-gray-700 font-medium">{row.label}</span>
                          {mod && <span className="text-primary text-xs" title="Modified from default">✎</span>}
                          {rotOverrideCount > 0 && (
                            <span className="text-xs text-purple-500" title={`${rotOverrideCount} rotation override${rotOverrideCount!==1?'s':''}`}>
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
                        {mod && <button onClick={()=>resetRow(row.key)} title="Reset row"><RefreshCw size={11} className="text-gray-400 hover:text-primary"/></button>}
                      </td>
                    </tr>

                    {/* Per-rotation sub-rows */}
                    {isOpen && rotations.map(bt=>{
                      const hasOv = subHasOverride(row.key, bt.id);
                      const eff = subEffective(row.key, bt.id);
                      return (
                        <tr key={subKey(row.key, bt.id)} className="bg-gray-50/60 hover:bg-gray-100/60 transition-colors">
                          <td className="sticky left-0 z-10 border-r border-gray-200 pl-9 pr-3 py-1.5 bg-gray-50">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 font-medium">{bt.label}</span>
                              {hasOv
                                ? <span className="text-purple-500 text-xs font-medium" title="Rotation-specific override active">override ✎</span>
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
                            {hasOv && <button onClick={()=>subReset(row.key, bt.id)} title="Remove override (revert to inherited)"><RefreshCw size={11} className="text-gray-400 hover:text-purple-600"/></button>}
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
        <p><span className="font-medium text-gray-500">How rotation rows work:</span> a dimmed check = inherited from the category row above. Click any cell in a rotation row to create a rotation-specific override — that rotation then uses its own list (marked <span className="text-purple-500 font-medium">override ✎</span>) and ignores later changes to the parent row until you reset it.</p>
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
        <span className={`font-display text-xs font-semibold uppercase tracking-wide ${titleClassName}`}>{title}</span>
        {badge}
      </button>
      {open && <div className="pl-4">{children}</div>}
    </div>
  );
}

function DayPillRow({ days, onToggle, color = 'primary' }) {
  const on  = color === 'red' ? 'bg-red-600 text-white border-red-600' : 'bg-primary text-white border-primary';
  const off = color === 'red' ? 'bg-white text-gray-500 border-gray-200 hover:border-red-300' : 'bg-white text-gray-500 border-gray-200 hover:border-primary';
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
        <div className="font-display text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Full-Day Block</div>
        <p className="text-xs text-gray-400 mb-1.5">Whole day unschedulable for this type.</p>
        <DayPillRow color="red" days={dr.fullBlockDays||[]} onToggle={i=>update(d=>({...d, fullBlockDays: toggleIn(d.fullBlockDays, i)}))}/>
      </div>

      <div>
        <label className="flex items-center gap-2 font-display text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 cursor-pointer select-none">
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
          <div className="font-display text-xs font-semibold text-gray-500 uppercase tracking-wide">Shift-Type Restrictions</div>
          <button onClick={addRestriction} className="text-xs text-primary hover:underline">+ Add</button>
        </div>
        <div className="space-y-2">
          {(dr.dayTypeRestrictions||[]).map((r,i)=>(
            <div key={i} className="flex items-center gap-2 flex-wrap bg-gray-50 rounded-lg p-2">
              <DayPillRow days={r.days||[]} onToggle={day=>updRestriction(i,{days: toggleIn(r.days, day)})}/>
              <select value={r.mode} onChange={e=>updRestriction(i,{mode: e.target.value})} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5">
                {Object.entries(DOW_MODE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input type="checkbox" checked={r.scope==='generator'} className="rounded"
                  onChange={e=>updRestriction(i,{scope: e.target.checked ? 'generator' : undefined})}/>
                Generator only
              </label>
              <button onClick={()=>rmRestriction(i)} className="text-gray-300 hover:text-red-500 ml-auto"><Trash2 size={13}/></button>
            </div>
          ))}
          {(dr.dayTypeRestrictions||[]).length===0 && <p className="text-xs text-gray-300 italic">None</p>}
        </div>
      </div>

      {/* Shift / rotation gates */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="font-display text-xs font-semibold text-gray-500 uppercase tracking-wide">Shift &amp; Rotation Gates</div>
          <button onClick={addGate} className="text-xs text-primary hover:underline">+ Add gate</button>
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
                              className={`text-xs px-1.5 py-0.5 rounded border font-medium ${checked ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200'}`}>
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
        <div className="font-display text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Special-Day Rules</div>
        <p className="text-xs text-gray-400 mb-1.5">Dates are edited on the Dashboard tab — this controls how each list affects eligibility.</p>
        <div className="space-y-1.5">
          {SPECIAL_DAY_META.map(({key,label})=>{
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

      {/* Computed-date rules */}
      <div>
        <div className="font-display text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Computed-Date Rules</div>
        <p className="text-xs text-gray-400 mb-1.5">Dates derived from the calendar itself — no manual list needed.</p>
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={(dr.computedDayRules||[]).some(c=>c.type==='firstFridayOfMonth')} className="rounded"
            onChange={e=>update(d=>({...d, computedDayRules: e.target.checked
              ? [...(d.computedDayRules||[]), { type: 'firstFridayOfMonth' }]
              : (d.computedDayRules||[]).filter(c=>c.type!=='firstFridayOfMonth') }))}/>
          1st Friday of each calendar month: block entire day
        </label>
      </div>

      {/* CCU-nights override (IM_2 only) */}
      {rowKey === 'IM_2' && (
        <div>
          <div className="font-display text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">CCU Nights Override</div>
          <p className="text-xs text-gray-400 mb-1.5">When a resident's "Covering CCU nights" flag is set, block these days instead of the Shift-Type Restrictions above.</p>
          <DayPillRow color="red" days={ccuOverride?.fullBlockDays||[]}
            onToggle={i=>update(d=>({...d, residentFlagOverrides: [{ flag:'isCCUNights', fullBlockDays: toggleIn(ccuOverride?.fullBlockDays, i) }] }))}/>
        </div>
      )}
    </div>
  );
}

function RulesTab({ allResidents, block, eligOverrides, appSettings, setAppSettings, dayRules, setDayRules, coverage, setCoverage }) {
  const [showAll, setShowAll] = useState(true);
  const [openKeys, setOpenKeys] = useState({});
  const [view, setView] = useState('coverage');
  const [typeQuery, setTypeQuery] = useState('');

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
      // Optional chaining + filter: shiftIds (an eligibility override diff) can carry an id this
      // bundle doesn't know yet after a version-skewed cross-device sync — skip it instead of
      // throwing on SHIFT_MAP[id].type, rather than crashing the whole Rules tab.
      // s.short (e.g. PED-N-FM's 'NF') keeps same-type shifts distinguishable in this summary too
      // — join with a separator only when a multi-char token is present, so every other area's
      // summary renders byte-identical to before (single-char tokens, joined with '').
      const tokens = covered.map(id=>SHIFT_MAP[id]?.short ?? SHIFT_MAP[id]?.type?.[0]?.toUpperCase()).filter(Boolean);
      const sep = tokens.some(t => t.length > 1) ? '·' : '';
      return `${area} (${tokens.join(sep)})`;
    }).filter(Boolean);
    return parts.length ? `Eligible: ${parts.join(', ')}.` : 'No shifts configured.';
  }

  const typeQueryNorm = typeQuery.trim().toLowerCase();
  const searchedRows = !typeQueryNorm ? displayRows : displayRows.filter(row => {
    const cat = CAT_MAP[row.catId];
    return row.label.toLowerCase().includes(typeQueryNorm)
      || row.sub.toLowerCase().includes(typeQueryNorm)
      || (cat?.label || '').toLowerCase().includes(typeQueryNorm);
  });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Scheduling Rules</h2>
        <p className="text-xs text-gray-500 mt-0.5">Edited here, no code changes needed.</p>
      </div>

      <div className="no-print">
        <SubTabs value={view} onChange={setView} options={[
          {id:'coverage', label:'Coverage & Priority', icon:Activity},
          {id:'types', label:'Resident-Type Rules', icon:Users},
        ]}/>
      </div>

      {view === 'coverage' && (
      <div className="space-y-3">
      <SectionCard title="Daily Shift Coverage" subtitle="Minimum and maximum residents each shift can have per day — used by Generate Schedule on the Schedule tab.">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="text-left font-medium pr-4 pb-2">Area</th>
                {SHIFT_TYPES.map(t => <th key={t} className="text-center font-medium px-3 pb-2 capitalize">{t === 'eve' ? 'Evening' : t}</th>)}
                <th className="text-center font-medium px-3 pb-2">Day 12h</th>
                <th className="text-center font-medium px-3 pb-2">Night 12h</th>
                {/* This grid is fixed area×type — it can only ever show ONE shift per (area, type)
                    cell, via SHIFT_TYPES.map below. PED-N-FM shares type:'night' with PED-N, so it
                    needs its own explicit column rather than fitting the grid; a per-shift-id
                    renderer (not per area×type) would be the real fix here, deliberately deferred. */}
                <th className="text-center font-medium px-3 pb-2">Night (FM)</th>
              </tr>
            </thead>
            <tbody>
              {SHIFT_AREAS.map(area => {
                function renderCoverageCell(key, shift) {
                  if (!shift) return <td key={key} className="text-center text-gray-300 px-3">—</td>;
                  const overridden = coverage[shift.id] != null;
                  const cov = getCoverageFor(shift.id, coverage);
                  const maxCap = shift.area === 'TRAUMA' ? 1 : 10; // trauma bay is single-resident — see D7
                  function update(next) {
                    setCoverage(p => {
                      const n = { ...p };
                      if (next.min === DEFAULT_COVERAGE[shift.id].min && next.max === DEFAULT_COVERAGE[shift.id].max) delete n[shift.id];
                      else n[shift.id] = next;
                      return n;
                    });
                  }
                  return (
                    <td key={key} className="text-center px-3 py-1">
                      <span className="inline-flex items-center gap-1">
                        <input type="number" min={0} max={maxCap} title="Minimum"
                          value={cov.min}
                          onChange={e => {
                            const min = Math.max(0, Math.min(maxCap, Number(e.target.value) || 0));
                            update({ min, max: Math.max(min, cov.max) });
                          }}
                          className={`w-12 text-center text-sm border rounded-lg py-1 ${overridden ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-gray-200'}`}/>
                        <span className="text-gray-300">–</span>
                        <input type="number" min={0} max={maxCap} title="Maximum"
                          value={cov.max}
                          onChange={e => {
                            const max = Math.max(0, Math.min(maxCap, Number(e.target.value) || 0));
                            update({ min: Math.min(cov.min, max), max });
                          }}
                          className={`w-12 text-center text-sm border rounded-lg py-1 ${overridden ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-gray-200'}`}/>
                        {overridden && (
                          <button onClick={() => setCoverage(p => { const n = { ...p }; delete n[shift.id]; return n; })}
                            title="Reset to default" className="text-gray-300 hover:text-primary"><RefreshCw size={11}/></button>
                        )}
                      </span>
                    </td>
                  );
                }
                return (
                  <tr key={area}>
                    <td className="pr-4 py-1"><span className={`text-xs px-2 py-0.5 rounded font-bold ${SHIFTS.find(s=>s.area===area).chip}`}>{area}</span></td>
                    {SHIFT_TYPES.map(t => renderCoverageCell(t, SHIFTS.find(s => s.area === area && s.type === t)))}
                    {renderCoverageCell('d12', SHIFTS.find(s => s.id === `${area}-D12`))}
                    {renderCoverageCell('n12', SHIFTS.find(s => s.id === `${area}-N12`))}
                    {renderCoverageCell('nfm', SHIFTS.find(s => s.id === `${area}-N-FM`))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {/* 12h ids are excluded on purpose. They only staff inside a 12h window, so counting them
              here inflated an ordinary day's headline by 10 min / 18 max — a number that was never
              true on any date, window or not. */}
          Minimum <strong className="text-gray-700">{SHIFTS.reduce((s, sh) => s + (TWELVE_HOUR_IDS.includes(sh.id) ? 0 : getCoverageFor(sh.id, coverage).min), 0)}</strong> – maximum <strong className="text-gray-700">{SHIFTS.reduce((s, sh) => s + (TWELVE_HOUR_IDS.includes(sh.id) ? 0 : getCoverageFor(sh.id, coverage).max), 0)}</strong> resident-shifts per day on a normal (non-12h) day.
        </p>
        <div className="mt-2">
          <Collapsible title="How coverage works" defaultOpen={false}>
            <p className="text-xs text-gray-500">
              The generator always fills every shift to its minimum first; it only fills toward the maximum for residents still under their own shift-count target. Set a shift's minimum (and maximum) to 0 to leave it out of generation entirely — Peds Night is two separate shifts, both defaulting to 0/1 best-effort (not required): PED-N-FM (23:00-08:00), FM-3-exclusive Mon/Tue/Wed, and PED-N (19:00-04:00), EM Home's own shift Thu-Sun. Trauma day-of-week limits still apply on top.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              POD max shown above is every day <strong>except Mon/Tue</strong>, when it rises to 3 (not editable here — see Rules tab prose/CLAUDE.md). A staffed POD shift also always requires an EM PGY-3 (no PGY-2 fallback, except the block's own PGY-3 Wellness Wednesday) — Validation errors if one is missing.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              12h shifts only staff inside a <strong>12-Hour Shift Window</strong> — set those per academic year on the Dashboard tab (Block Calendar → 12-Hour Shift Windows), where you choose the dates, which areas swap, and whether the 9h shifts are replaced or kept alongside. An academic year you've never opened there still behaves as before: ACEP/AAEM/SAEM dates automatically run POD/MT/FLEX on 12h and suppress their 9h shifts.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              The 12h numbers below are the <strong>in-window default</strong> — what a window uses when it doesn't set its own override — so they take effect inside a window, not on ordinary days. PED is the exception: its 12h pair stays available year-round and is gated purely by the coverage you set here.
            </p>
          </Collapsible>
        </div>
      </SectionCard>

      <SectionCard title="Soft Rule Priority" subtitle="When the generator can't satisfy every rule for a slot, it breaks the lowest-ranked one first — reorder to change which rule gives way.">
        {(() => {
          const priority = normalizeRulePriority(appSettings?.rulePriority);
          const isDefault = priority.every((id, i) => id === DEFAULT_RULE_PRIORITY[i]);
          function move(i, dir) {
            const j = i + dir;
            if (j < 0 || j >= priority.length) return;
            const next = [...priority];
            [next[i], next[j]] = [next[j], next[i]];
            setAppSettings(p => ({ ...p, rulePriority: next }));
          }
          return (
            <div className="space-y-1.5">
              {priority.map((id, i) => {
                const rule = SOFT_RULES.find(r => r.id === id);
                if (!rule) return null;
                return (
                  <div key={id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
                    <span className="text-xs font-semibold text-gray-400 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{rule.label}</div>
                      <div className="text-xs text-gray-500">{rule.description}</div>
                    </div>
                    <div className="flex flex-col shrink-0">
                      <button onClick={() => move(i, -1)} disabled={i === 0}
                        className="text-gray-400 hover:text-primary disabled:opacity-20 disabled:hover:text-gray-400" title="Move up"><ChevronUp size={14}/></button>
                      <button onClick={() => move(i, 1)} disabled={i === priority.length - 1}
                        className="text-gray-400 hover:text-primary disabled:opacity-20 disabled:hover:text-gray-400" title="Move down"><ChevronDown size={14}/></button>
                    </div>
                  </div>
                );
              })}
              {!isDefault && (
                <button onClick={() => setAppSettings(p => ({ ...p, rulePriority: [...DEFAULT_RULE_PRIORITY] }))}
                  className="text-xs text-gray-400 hover:text-primary flex items-center gap-1"><RefreshCw size={11}/> Reset to default</button>
              )}
            </div>
          );
        })()}
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
            <button onClick={resetTraumaBlocks} className="text-xs text-gray-400 hover:text-primary flex items-center gap-1"><RefreshCw size={11}/> Reset</button>
          )}
        </div>
      </SectionCard>
      </div>
      )}

      {view === 'types' && (
      <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500">{showAll ? 'All resident types' : `${displayRows.length} type${displayRows.length!==1?'s':''} active this block`}</p>
        <div className="flex items-center gap-3">
          <input type="text" value={typeQuery} onChange={e=>setTypeQuery(e.target.value)} placeholder="Search types…"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-36 focus:w-48 transition-all"/>
          <button onClick={()=>setShowAll(p=>!p)} className="text-xs text-primary hover:underline shrink-0">
            {showAll ? 'Show active only' : 'Show all types'}
          </button>
        </div>
      </div>

      {searchedRows.length === 0 && (
        <div className="text-center py-12 text-gray-400 space-y-3">
          <Shield size={36} className="mx-auto opacity-40"/>
          <p className="text-sm">{typeQueryNorm ? 'No resident types match your search.' : 'No schedulable residents active this block.'}</p>
          {!typeQueryNorm && !showAll && (
            <button onClick={()=>setShowAll(true)} className="text-xs text-primary hover:underline">Show all types anyway</button>
          )}
        </div>
      )}

      {searchedRows.map(row => {
        const cat = CAT_MAP[row.catId];
        const rn = RULE_NOTES[row.key] || {};
        const dr = effectiveDr(row.key);
        const modified = isRowModified(row.key);
        const effectiveShifts = resolveEligibilityList(eligOverrides[row.key], BASE_ELIGIBILITY[row.key] || []);
        const isOpen = openKeys[row.key] === true; // default closed
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
                {modified && <span className="text-primary text-xs" title="Modified from default">✎</span>}
                {(modified || eligOverrides[row.key]) && DAY_RULE_DEFAULTS_CHANGED.has(row.key) && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium"
                    title="This type's built-in default rules changed in a recent update — your saved override predates that change. Review it, or Reset to pick up the correction.">
                    ⚠ defaults changed — review
                  </span>
                )}
                {active.length > 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
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
                    <div className="font-display text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Shift Target</div>
                    <p className="text-sm text-gray-700">
                      {target != null ? `${target} shifts/block` : 'Per Amion — not set by this app (self-cover)'}
                      {Object.keys(BLOCK_TARGETS).some(k => k.startsWith(`${row.key}__`)) && (
                        <span className="text-gray-400"> (rotation-specific targets may apply)</span>
                      )}
                    </p>
                  </div>
                  {modified && (
                    <button onClick={()=>resetDr(row.key)} className="text-xs text-gray-400 hover:text-primary flex items-center gap-1 shrink-0"><RefreshCw size={11}/> Reset rules</button>
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
                    <p className="text-xs text-primary mt-1">✎ Matrix overrides are active for this type — edit on the Shift Matrix tab.</p>
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
                  <Collapsible title="Additional Notes by Rotation" defaultOpen={false}>
                    <div className="space-y-1">
                      {rn.blockTypeNotes.map((bn,i)=>(
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <div className="flex gap-1 shrink-0 flex-wrap">
                            {bn.ids.map(id=><span key={id} className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-medium">{BLOCK_TYPE_MAP[id]?.label||id}</span>)}
                          </div>
                          <span className="text-gray-600">{bn.note}</span>
                        </div>
                      ))}
                    </div>
                  </Collapsible>
                )}

                {/* Soft prefs */}
                {rn.softPrefs?.length > 0 && (
                  <Collapsible title="Soft Preferences" defaultOpen={false}>
                    <ul className="space-y-0.5">
                      {rn.softPrefs.map((p,i)=><li key={i} className="text-xs text-blue-700 flex items-start gap-1"><span>•</span>{p}</li>)}
                    </ul>
                  </Collapsible>
                )}

                {/* Special notes */}
                {rn.specialNotes?.length > 0 && (
                  <Collapsible title="Special Notes" defaultOpen={false}>
                    <ul className="space-y-0.5">
                      {rn.specialNotes.map((n,i)=><li key={i} className="text-xs text-gray-600 flex items-start gap-1"><span>•</span>{n}</li>)}
                    </ul>
                  </Collapsible>
                )}

                {/* TBD items */}
                {rn.tbdItems?.length > 0 && (
                  <Collapsible title="⚠ Pending Clarification" titleClassName="text-amber-600" defaultOpen={false}>
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
      )}
    </div>
  );
}

// ─── SHIFT PICKER MODAL ───────────────────────────────────────────────────────

// Shared violation aggregator for assigning `sid` to `resident` on `dateStr` against `block`'s
// current schedule — used by both ShiftPickerModal and the schedule grid's drag-and-drop so the
// two surfaces can never drift apart on what counts as a violation.
// Returns [{message, level, rule?}] — level distinguishes a hard rule (always 'error': eligibility,
// legal rest hours, max-run/eve-day-turnaround circadian checks) from the ranked postNightRest soft
// rule ('warn'), so the picker and drag-and-drop UIs can visually tell apart a genuine hard block
// from a chief-configurable preference, both surfaced the same "Assign/Swap/Move Anyway" way.
function cellViolations(resident, dateStr, sid, block, eligOverrides, appSettings, dayRules, ayConf, prevTail = {}) {
  if (!sid) return [];
  const sd = block.specialDays || {};
  const eligible = getEligibleShifts(resident, dateStr, sd, eligOverrides, appSettings, dayRules, { blockStart: block.startDate, ayConf });
  const vs = [];
  // 1. Eligibility check
  if (!eligible.includes(sid)) {
    const dow = parseDate(dateStr).getDay();
    const wwRule = resident.category === 'EM_HOME' && dow === 3 && ['day', 'eve'].includes(SHIFT_MAP[sid]?.type)
      ? (getEffectiveDayRules(`${resident.category}_${resident.pgy}`, dayRules).computedDayRules || [])
          .find(c => c.type === 'wellnessWednesday' && dateStr === nthWeekdayOnOrAfter(block.startDate, 3, c.ordinal))
      : null;
    vs.push({ message: wwRule
      ? `Wellness Wednesday (${ORDINAL_WORD[wwRule.ordinal] || `${wwRule.ordinal}th`} of block) — PGY-${resident.pgy} shouldn't work day/eve`
      : resident.category === 'EM_HOME' && dow === 3 && SHIFT_MAP[sid]?.type === 'day'
      ? 'GR Wednesday — EM Home has no day shifts (evenings/nights OK)'
      : 'Shift not in eligibility matrix for this resident/day combination', level: 'error' });
  }
  // 2. Jeopardy call warning (policy 'warn'; 'block' already empties the eligible list)
  const policy = (appSettings || {}).jeopardyPolicy ?? 'warn';
  if (policy === 'warn' && (resident.jeopardyDates || []).includes(dateStr)) {
    vs.push({ message: 'Resident is on jeopardy call this date — confirm backup coverage is acceptable', level: 'warn' });
  }
  // 3. Rest-period check against neighbouring shifts in the schedule (legal rest hours — always hard)
  vs.push(...checkRestViolations(resident.id, dateStr, sid, block.schedule || {}).map(message => ({ message, level: 'error' })));
  // 4. Circadian rules (night-run length, post-night rest before days, eve→day turnaround) — each
  // already carries its own level/rule (postNightRest is 'warn', everything else 'error').
  const nightOnly = isNightOnlyResident(resident, eligOverrides);
  vs.push(...checkCircadianViolations(resident, dateStr, sid, (block.schedule || {})[resident.id] || {}, { nightOnly })
    .map(v => ({ message: v.message, level: v.level, rule: v.rule })));
  // 5. 6-consecutive-work-day rule (ACGME 1-in-7) — same isStreakWorkDay semantics as
  // validateAll/generateSchedule, so a chief can't create an 8-day run through the picker or
  // drag-and-drop that validateAll would then flag after the fact.
  const row = (block.schedule || {})[resident.id] || {};
  const len = runLengthIfWorked(row, resident, dateStr, prevTail[resident.id] || null, streakBounds(block, prevTail));
  if (len > MAX_CONSECUTIVE_WORK_DAYS) {
    vs.push({ message: `${len} consecutive work days (max ${MAX_CONSECUTIVE_WORK_DAYS}) — Grand Rounds/JC days count as worked`, level: 'error' });
  }
  return vs;
}

function ShiftPickerModal({ resident, dateStr, currentShift, block, eligOverrides, appSettings, dayRules, onSelect, onClose, showToast, ayConf, prevTail }) {
  const [pending, setPending] = useState(null);
  const sd = block.specialDays || {};
  const eligible = getEligibleShifts(resident, dateStr, sd, eligOverrides, appSettings, dayRules, { blockStart: block.startDate, ayConf });
  const display = formatDisplayDate(dateStr);
  const name = `${resident.firstName} ${resident.lastName}`;
  const onJeopardy = (resident.jeopardyDates || []).includes(dateStr);

  const v = cellViolations(resident, dateStr, pending, block, eligOverrides, appSettings, dayRules, ayConf, prevTail);

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
        {onJeopardy && <> · <span className="font-medium text-purple-600">Jeopardy call</span></>}
      </p>

      {eligible.length === 0 ? (
        <div className="flex items-center gap-2 text-orange-600 bg-orange-50 rounded-lg p-3 text-sm mb-3">
          <AlertTriangle size={15}/> No eligible shifts on this date.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {eligible.map(sid=>{
            const s=SHIFT_MAP[sid]; const active=pending===sid;
            // eligible can carry an id an eligibility override diff granted that this bundle
            // doesn't know yet (version-skewed cross-device sync) — skip rendering it rather than
            // crash on s.chip/s.hours below.
            if (!s) return null;
            return (
              <button key={sid} onClick={()=>setPending(active?null:sid)}
                className={`flex flex-col items-start px-3 py-2.5 rounded-lg border-2 text-left transition-all ${active?'border-primary bg-primary/10':'border-gray-200 hover:border-primary'}`}>
                <div className="flex items-center gap-2 w-full">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${s.chip}`}>{sid}</span>
                  {active && <CheckCircle size={13} className="text-primary ml-auto"/>}
                </div>
                <span className="text-xs text-gray-400 mt-0.5">{s.hours}</span>
              </button>
            );
          })}
        </div>
      )}

      {pending && <ViolationPanel violations={v}/>}
      {pending && v.length === 0 && (
        <div className="flex items-center gap-1.5 text-green-600 text-xs mb-3"><CheckCircle size={13}/> No violations</div>
      )}

      <div className="flex gap-2">
        {currentShift && <button onClick={()=>{onSelect(null);showToast(`Cleared ${name} on ${display}`,'amber');onClose();}} className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200 font-medium">Clear</button>}
        <div className="flex-1"/>
        <button onClick={onClose} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">Cancel</button>
        {pending && <button onClick={confirm} className={`px-3 py-1.5 text-sm rounded-lg font-medium text-white transition-colors ${v.length>0?'bg-amber-500 hover:bg-amber-600':'bg-primary hover:bg-primary/90'}`}>
          {v.length>0?'Assign Anyway':'Assign Shift'}
        </button>}
      </div>
    </Modal>
  );
}

// ─── SCHEDULE GRID ────────────────────────────────────────────────────────────

function ScheduleGrid({ allResidents, block, updateBlock, updateBlockTracked, onUndo, onRedo, canUndo, canRedo, eligOverrides, appSettings, dayRules, coverage, blocksHistory, showToast, pendingByResident, schedulableCount, blockSaveState, ayConf }) {
  const [picker, setPicker] = useState(null);
  const [catFilter, setCatFilter] = useState('ALL');
  // Resolved once for the whole grid rather than per rendered day cell.
  const jcDaySet = useMemo(
    () => new Set(jcDatesInRange(block.startDate, block.endDate, block.academicYear, ayConf, { fallbackDateStr: block.startDate })),
    [block.startDate, block.endDate, block.academicYear, ayConf]
  );
  const twelveHourDaySet = useMemo(() => {
    const st = ds => twelveHourStateFor(ds, ayConf || {});
    return new Set(getBlockDates(block.startDate, block.endDate).filter(ds => {
      const s2 = st(ds);
      return s2.replaceAreas.size > 0 || s2.addAreas.size > 0;
    }));
  }, [block.startDate, block.endDate, ayConf]);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(null); // string[] | null — readiness warnings
  // Computed once per relevant state change (not on every re-render while the modal happens to be
  // open) — checkGenerateReadiness scans every resident's day rules plus every Journal Club date in
  // the block for JC presenters, which isn't free to redo on an unrelated re-render (a toast
  // dismissing, a picker closing elsewhere).
  const regenReadiness = useMemo(
    () => confirmRegen ? checkGenerateReadiness({ allResidents, block, dayRules, ayConf }) : [],
    [confirmRegen, allResidents, block, dayRules, ayConf]
  );
  // Partial regenerate: "Regenerate Unlocked" and date-range regenerate share one confirm modal,
  // gated by the same checkGenerateReadiness warning flow as Clear & Regenerate above.
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [confirmPartialRegen, setConfirmPartialRegen] = useState(null); // {kind:'unlocked'} | {kind:'range', start, end} | null
  const partialRegenReadiness = useMemo(
    () => confirmPartialRegen ? checkGenerateReadiness({ allResidents, block, dayRules, ayConf }) : [],
    [confirmPartialRegen, allResidents, block, dayRules, ayConf]
  );
  const [view, setView] = useState('grid'); // 'grid' | 'resident' | 'calendar' — ephemeral, not persisted
  const [areaFilter, setAreaFilter] = useState('ALL'); // calendar-view-only shift-area filter
  const [showInactive, setShowInactive] = useState({}); // per-category toggle for the not-schedulable divider row
  const sched = block.schedule || {};
  const sd = block.specialDays || {};
  const jeoBlock = (appSettings?.jeopardyPolicy ?? 'warn') === 'block';
  const dates = useMemo(()=>getBlockDates(block.startDate,block.endDate),[block.startDate,block.endDate]);
  const prevTail = useMemo(() => prevBlockTailSchedules(block, blocksHistory), [block.id, block.startDate, blocksHistory]);

  const violMap = useMemo(()=>{
    const m={};
    for (const issue of validateAll(allResidents,sched,block,eligOverrides,appSettings,dayRules,coverage,blocksHistory,ayConf)) {
      if (issue.dateStr && issue.residentId) { const k=`${issue.residentId}_${issue.dateStr}`; (m[k]=m[k]||[]).push(issue); }
    }
    return m;
  },[allResidents,sched,block,eligOverrides,appSettings,dayRules,coverage,blocksHistory,ayConf]);

  const [covExpanded, setCovExpanded] = useState(false);
  // Per-date coverage counts vs configured min/max — always computed from the FULL schedule
  // (never catFilter-ed rows), or filtering to one category would show phantom understaffing.
  const coverageByDate = useMemo(()=>computeCoverageByDate(dates, sched, coverage, allResidents, ayConf),[dates, sched, coverage, allResidents, ayConf]);
  const activeCoverageShifts = useMemo(()=>getActiveCoverageShifts(dates, coverageByDate),[dates, coverageByDate]);

  const filtered = catFilter==='ALL'?allResidents:allResidents.filter(r=>r.category===catFilter);
  const grouped = useMemo(()=>{
    const g=[];
    for (const cat of CATEGORIES) { const m=filtered.filter(r=>r.category===cat.id); if(m.length) g.push({cat,members:m}); }
    return g;
  },[filtered]);

  function assign(resId,ds,sid) {
    updateBlockTracked(b=>({...b,schedule:{...b.schedule,[resId]:{...(b.schedule[resId]||{}),[ds]:sid}}}));
  }

  // Cell locks: `block.lockedCells[residentId][dateStr] = true` — nested inside `block`, so it
  // already round-trips through res_current_block/backup/cloud sync with no new persistence key.
  // Tracked (undoable) like every other schedule-adjacent mutation here.
  function toggleLock(resId, ds) {
    updateBlockTracked(b => {
      const wasLocked = !!b.lockedCells?.[resId]?.[ds];
      const residentLocks = { ...(b.lockedCells?.[resId] || {}) };
      if (wasLocked) delete residentLocks[ds]; else residentLocks[ds] = true;
      return { ...b, lockedCells: { ...(b.lockedCells || {}), [resId]: residentLocks } };
    });
  }

  const totalAssigned = useMemo(()=>Object.values(sched).reduce((s,d)=>s+Object.values(d||{}).filter(Boolean).length,0),[sched]);

  // ── Drag-and-drop: drag payload lives in React state (not dataTransfer), mirroring
  // em-scheduler's handleSchedDrop pattern. Dropping on an empty cell moves; dropping on an
  // occupied cell swaps (validating both sides before commit).
  const [drag, setDrag] = useState(null);           // { resId, ds, sid } — source chip
  const [dragOver, setDragOver] = useState(null);   // { resId, ds } — hovered target cell
  const [dropConfirm, setDropConfirm] = useState(null); // { src, tgt, kind, violations }

  // Clears `ds` from `residentId`'s row in a copy of the full schedule map — used so validating a
  // fresh placement doesn't false-positive against the very cell being moved away from/replaced.
  function scheduleClearing(residentId, ds) {
    const row = { ...(sched[residentId] || {}) };
    delete row[ds];
    return { ...sched, [residentId]: row };
  }

  function handleDrop(tgtRes, tgtDs) {
    const src = drag;
    setDrag(null); setDragOver(null);
    if (!src) return;
    if (src.resId === tgtRes.id && src.ds === tgtDs) return; // no-op

    const srcRes = allResidents.find(r=>r.id===src.resId);
    if (!srcRes) return;

    const lockedCells = block.lockedCells || {};
    const srcLocked = !!lockedCells[src.resId]?.[src.ds];
    const tgtLocked = !!lockedCells[tgtRes.id]?.[tgtDs];
    if (srcLocked || tgtLocked) { showToast('Cannot move a locked shift — unlock the cell first', 'red'); return; }

    const tgtOff = (tgtRes.approvedDatesOff||[]).includes(tgtDs);
    const tgtVac = (tgtRes.vacationDates||[]).includes(tgtDs);
    const tgtJeoBlocked = jeoBlock && (tgtRes.jeopardyDates||[]).includes(tgtDs);
    if (tgtOff || tgtVac || tgtJeoBlocked) { showToast('Cannot drop onto an approved day off, a vacation date, or a blocked jeopardy date', 'red'); return; }
    const srcOff = (srcRes.approvedDatesOff||[]).includes(src.ds);
    const srcVac = (srcRes.vacationDates||[]).includes(src.ds);
    const srcJeoBlocked = jeoBlock && (srcRes.jeopardyDates||[]).includes(src.ds);
    if (srcOff || srcVac || srcJeoBlocked) { showToast('Cannot move a shift off an approved day off, a vacation date, or a blocked jeopardy date', 'red'); return; }

    const tgtSid = sched[tgtRes.id]?.[tgtDs] || null;
    const kind = tgtSid ? 'swap' : 'move';

    const violTgt = cellViolations(tgtRes, tgtDs, src.sid,
      { ...block, schedule: scheduleClearing(src.resId, src.ds) },
      eligOverrides, appSettings, dayRules, ayConf, prevTail
    ).map(v => ({ message: `${tgtRes.lastName}, ${tgtRes.firstName}: ${v.message}`, level: v.level, rule: v.rule }));

    const violSrc = kind === 'swap'
      ? cellViolations(srcRes, src.ds, tgtSid,
          { ...block, schedule: scheduleClearing(tgtRes.id, tgtDs) },
          eligOverrides, appSettings, dayRules, ayConf, prevTail
        ).map(v => ({ message: `${srcRes.lastName}, ${srcRes.firstName}: ${v.message}`, level: v.level, rule: v.rule }))
      : [];

    const violations = [...violTgt, ...violSrc];
    const srcInfo = { resId: src.resId, ds: src.ds, sid: src.sid, res: srcRes };
    const tgtInfo = { resId: tgtRes.id, ds: tgtDs, sid: tgtSid, res: tgtRes };
    if (!violations.length) commitDrop(srcInfo, tgtInfo, kind, false);
    else setDropConfirm({ src: srcInfo, tgt: tgtInfo, kind, violations });
  }

  function commitDrop(src, tgt, kind, wasOverridden) {
    updateBlockTracked(b => {
      const s = { ...b.schedule };
      if (src.resId === tgt.resId) {
        s[src.resId] = { ...(s[src.resId]||{}), [src.ds]: kind==='swap'?tgt.sid:null, [tgt.ds]: src.sid };
      } else {
        s[src.resId] = { ...(s[src.resId]||{}), [src.ds]: kind==='swap'?tgt.sid:null };
        s[tgt.resId] = { ...(s[tgt.resId]||{}), [tgt.ds]: src.sid };
      }
      return { ...b, schedule: s };
    });
    const verb = kind === 'swap' ? 'Swapped' : 'Moved';
    showToast(`${verb} ${src.sid} (${formatDisplayDate(src.ds)}) for ${tgt.res.lastName}${kind==='swap'?` ↔ ${tgt.sid} for ${src.res.lastName}`:''}`,
      wasOverridden ? 'amber' : 'green');
    setDropConfirm(null);
  }

  // Warns before generating if the block's manual per-block dates (special-day lists, JC
  // presenters) haven't been entered — chief can override and generate anyway.
  function requestGenerate() {
    const issues = checkGenerateReadiness({ allResidents, block, dayRules, ayConf });
    if (issues.length) setConfirmGenerate(issues);
    else runGenerate(false);
  }

  function runGenerate(clearFirst) {
    setConfirmRegen(false);
    setConfirmGenerate(null);
    const res = generateScheduleBest({ allResidents, block, coverage, eligOverrides, appSettings, dayRules, clearFirst, blocksHistory, ayConf });
    if (!res) { showToast('Set block dates first', 'red'); return; }
    if (res.report.totalSlots === 0) { showToast('Coverage is 0 for every shift — set coverage on the Scheduling Rules tab', 'red'); return; }
    updateBlockTracked(b => ({ ...b, schedule: res.schedule, generationReport: res.report }));
    const u = res.report.unfilled.length;
    const rc = res.report.restCompromises.length;
    // Filling with a <24h-rest candidate is a real safety-relevant tradeoff (default Soft Rule
    // Priority ranks coverageMin above postNightRest) — never let it pass as a silent success,
    // even when every slot got filled.
    let msg = u === 0
      ? `Schedule generated — all ${res.report.totalSlots} coverage slots filled`
      : `Filled ${res.report.filled} shifts — ${u} slots unfilled, see the Violations tab for details`;
    if (rc > 0) msg += ` (${rc} shift${rc !== 1 ? 's' : ''} filled with <24h post-night rest — reorder Soft Rule Priority to change this)`;
    showToast(msg, rc > 0 ? 'amber' : (u === 0 ? 'green' : 'amber'));
  }

  // ── Partial regenerate: "Regenerate Unlocked" and date-range regenerate share this. Both build
  // a working copy of the schedule where every cell that's unlocked (and, for the range variant,
  // inside [start,end]) is cleared, then call generateSchedule with clearFirst:false — the
  // generator's fill passes never overwrite an already-occupied cell, so only the cleared cells
  // get (re)filled; locked/out-of-range cells are never touched.
  function runPartialRegenerate(req) {
    setConfirmPartialRegen(null);
    const locked = block.lockedCells || {};
    const inRange = req.kind === 'range' ? (ds => ds >= req.start && ds <= req.end) : (() => true);
    const workingSchedule = {};
    for (const resId of Object.keys(sched)) {
      const row = sched[resId] || {};
      const newRow = {};
      for (const ds of Object.keys(row)) {
        const cellLocked = !!locked[resId]?.[ds];
        const clearIt = !cellLocked && inRange(ds);
        if (!clearIt && row[ds]) newRow[ds] = row[ds];
      }
      workingSchedule[resId] = newRow;
    }
    const res = generateScheduleBest({ allResidents, block: { ...block, schedule: workingSchedule }, coverage, eligOverrides, appSettings, dayRules, clearFirst: false, blocksHistory, ayConf });
    if (!res) { showToast('Set block dates first', 'red'); return; }
    if (res.report.totalSlots === 0) { showToast('Coverage is 0 for every shift — set coverage on the Scheduling Rules tab', 'red'); return; }
    updateBlockTracked(b => ({ ...b, schedule: res.schedule, generationReport: res.report }));
    const u = res.report.unfilled.length;
    const msg = u === 0
      ? `Regenerated — all ${res.report.totalSlots} coverage slots filled`
      : `Filled ${res.report.filled} shifts — ${u} slots unfilled, see the Violations tab for details`;
    showToast(msg, u === 0 ? 'green' : 'amber');
  }

  function requestRegenUnlocked() {
    setConfirmPartialRegen({ kind: 'unlocked' });
  }

  function requestRegenRange() {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) { showToast('Pick a valid start/end date for the regenerate range first', 'red'); return; }
    setConfirmPartialRegen({ kind: 'range', start: rangeStart, end: rangeEnd });
  }

  if (!dates.length) return (
    <div className="text-center py-16 text-gray-400">
      <Calendar size={40} className="mx-auto mb-3 opacity-40"/>
      <p className="text-sm">Set block dates in Settings to show the grid.</p>
    </div>
  );

  // Shared by the active and (expanded) inactive resident rows within a category group below —
  // identical row markup either way, non-schedulable residents just get the dimmed `opacity-50`
  // treatment from `sched_ok`.
  function renderResidentRow(res) {
    const cat=CAT_MAP[res.category];
    const sched_ok=isSchedulable(res);
    const cnt=Object.values(sched[res.id]||{}).filter(Boolean).length;
    const tgt=getShiftTarget(res, appSettings);
    const over=tgt!=null&&cnt>tgt;
    const chiefRole=effectiveChiefRole(res);
    // Buy-down/buy-up badge: an unusual target must never be invisible while editing — see
    // CLAUDE.md "buy-down". delta comes from allResidents' denormalized targetDelta seam.
    const rowDelta=Number(res.targetDelta);
    const rowHasDelta=Number.isFinite(rowDelta)&&rowDelta!==0;
    return (
      <div key={res.id} className={`flex border-b border-gray-100 ${!sched_ok?'opacity-50':''} ${cat.rowBg}`}>
        <div className={`grid-sticky border-r border-gray-200 flex items-center px-3 py-1 ${cat.rowBg}`} style={{width:NAME_W,minWidth:NAME_W}}>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-800 truncate">{res.lastName}, {res.firstName}{chiefRole && CHIEF_ROLES[chiefRole]?<span title={CHIEF_ROLES[chiefRole].label}> ★{CHIEF_ROLES[chiefRole].badge}</span>:''}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs text-gray-400">PGY-{res.pgy}</span>
              {res.blockType && res.category!=='PEDS' && (
                <span className="text-xs text-gray-300">· {BLOCK_TYPE_MAP[res.blockType]?.label||res.blockType}</span>
              )}
              {tgt!=null && <span className={`text-xs font-medium ${over?'text-red-500':'text-gray-400'}`}>{cnt}/{tgt}</span>}
              {rowHasDelta && (
                <span title={res.targetNote || (rowDelta<0?'Target reduced this block':'Target increased this block')}
                  className={`text-[10px] px-1 py-0.5 rounded-full font-medium ${res.targetIsBuyDown?'bg-teal-100 text-teal-700':'bg-indigo-100 text-indigo-700'}`}>
                  {rowDelta>0?`+${rowDelta}`:rowDelta}
                </span>
              )}
            </div>
          </div>
        </div>
        {dates.map(ds=>{
          const sid=sched[res.id]?.[ds]||null;
          const isLocked=!!(block.lockedCells?.[res.id]?.[ds]);
          const vKey=`${res.id}_${ds}`; const hasV=!!(violMap[vKey]?.length);
          const isApprovedOff=(res.approvedDatesOff||[]).includes(ds);
          const isVacation=(res.vacationDates||[]).includes(ds);
          const isJeopardy=(res.jeopardyDates||[]).includes(ds);
          const isJeoBlocked=isJeopardy&&jeoBlock;
          const isPendingRequest = pendingByResident.get(res.id)?.has(ds) || false;
          const elig=getEligibleShifts(res,ds,sd,eligOverrides,appSettings,dayRules,{blockStart:block.startDate,ayConf});
          const d=parseDate(ds); const dow=d.getDay();
          const isWed=dow===3; const isWknd=dow===0||dow===6;
          // GR cue: the resident's own weekly Grand Rounds weekday (EM Home = Wed, BAMC =
          // Thu, via grWorkDow — don't hardcode Wednesday/EM_HOME here, that was the bug
          // that made BAMC's Thursday GR invisible everywhere). Suppressed when the
          // resident isn't actually there that day.
          const isGR = grWorkDow(res)===dow && !isApprovedOff && !isVacation;
          const isJC = (res.jcPresentDates||[]).includes(ds);
          // Wellness Wednesday cue: the resident's own PGY-specific ordinal (1st/2nd/3rd
          // Wed on/after block start) — a subset of GR Wednesdays, so it always
          // coincides with isGR for that one cell. WW takes visual priority over the
          // JC/GR cues there (more specific: it additionally strips evenings), rather
          // than stacking multiple badges in one cell.
          const wwOrdinal = res.category==='EM_HOME'
            ? (getEffectiveDayRules(`${res.category}_${res.pgy}`, dayRules).computedDayRules||[]).find(c=>c.type==='wellnessWednesday')?.ordinal
            : null;
          const isWW = isWed && wwOrdinal!=null && ds===nthWeekdayOnOrAfter(block.startDate, 3, wwOrdinal);
          const shift=sid?SHIFT_MAP[sid]:null;
          let bg=isApprovedOff?'bg-orange-50':isVacation?'bg-teal-50':isJeoBlocked?'bg-purple-50':isWW?'bg-violet-50':isJC?'bg-primary/10':isGR?'bg-yellow-50':isWknd?'bg-gray-50':elig.length===0?'bg-gray-50':'bg-white';
          if(hasV) bg='bg-red-50';
          const clickable=(elig.length>0||sid)&&!isApprovedOff&&!isVacation&&!isLocked;
          const isDragSource = drag && drag.resId===res.id && drag.ds===ds;
          const isDragOverHere = dragOver && dragOver.resId===res.id && dragOver.ds===ds;
          const dayMarkerText = isWW ? `Wellness Wednesday (${ORDINAL_WORD[wwOrdinal]||`${wwOrdinal}th`} of block)` : isJC ? 'JC presenting' : isGR ? 'Grand Rounds' : null;
          const cornerLabel = isWW ? 'WW' : isJC ? 'JC' : isGR ? 'GR' : null;
          const cornerColor = isWW ? 'text-violet-600 bg-violet-100' : isJC ? 'text-primary bg-primary/10' : 'text-yellow-600 bg-yellow-100';
          return (
            <div key={ds} style={{width:CELL_W,minWidth:CELL_W,height:36}}
              onClick={()=>{ if(drag) return; clickable&&setPicker({resident:res,dateStr:ds}); }}
              onDragOver={e=>{ if(!drag) return; e.preventDefault(); setDragOver({resId:res.id,ds}); }}
              onDragLeave={e=>{ if(!e.currentTarget.contains(e.relatedTarget)) setDragOver(dOv=>(dOv&&dOv.resId===res.id&&dOv.ds===ds)?null:dOv); }}
              onDrop={e=>{ e.preventDefault(); handleDrop(res,ds); }}
              title={isApprovedOff?'Approved day off':isVacation?'On vacation':isJeoBlocked?'Jeopardy call (blocked by Settings)':isJeopardy?'Jeopardy call':dayMarkerText?(shift?`${sid} — ${dayMarkerText}`:isWW?`${dayMarkerText} — no day/eve`:dayMarkerText):isLocked?'Locked — unlock to edit':elig.length===0?'No eligible shifts':''}
              className={`relative border-r border-b border-gray-100 ${bg} ${hasV?'ring-1 ring-inset ring-red-400':''} ${isLocked?'ring-2 ring-inset ring-indigo-400':''} ${isDragOverHere?'ring-2 ring-inset ring-primary':''} ${clickable?'cursor-pointer hover:brightness-95':'cursor-default'} transition-all`}>
              {isApprovedOff&&!sid && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-orange-500">OFF</span></div>}
              {isVacation&&!sid&&!isApprovedOff && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-teal-600">VAC</span></div>}
              {isJeoBlocked&&!sid&&!isApprovedOff&&!isVacation && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-purple-500">J</span></div>}
              {isWW&&!sid&&!isApprovedOff&&!isVacation&&!isJeoBlocked && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-violet-600">WW</span></div>}
              {isJC&&!isWW&&!sid&&!isApprovedOff&&!isVacation&&!isJeoBlocked && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-primary">JC</span></div>}
              {isGR&&!isWW&&!isJC&&!sid&&!isApprovedOff&&!isVacation&&!isJeoBlocked && <div className="absolute inset-0 flex items-center justify-center"><span className="text-xs font-bold text-yellow-600">GR</span></div>}
              {shift && (
                <div draggable={!isLocked}
                  onDragStart={e=>{ if(isLocked){e.preventDefault();return;} e.stopPropagation(); e.dataTransfer.effectAllowed='move'; setDrag({resId:res.id,ds,sid}); }}
                  onDragEnd={()=>{ setDrag(null); setDragOver(null); }}
                  className={`absolute inset-1 flex items-center justify-center rounded text-xs font-bold ${isLocked?'cursor-default':'cursor-grab active:cursor-grabbing'} ${shift.chip} ${isDragSource?'opacity-40':''}`}>
                  {sid}
                </div>
              )}
              {shift && (
                <button type="button" onClick={e=>{ e.stopPropagation(); toggleLock(res.id, ds); }}
                  title={isLocked?'Unlock cell (allow drag/regenerate/edit)':'Lock cell (protect from drag, regenerate, and manual edit)'}
                  className={`absolute bottom-0 right-0 z-10 leading-none rounded-tl p-0.5 ${isLocked?'bg-indigo-600 text-white':'bg-white/70 text-gray-400 hover:text-gray-700'}`}>
                  {isLocked?<Lock size={9}/>:<Unlock size={9}/>}
                </button>
              )}
              {shift && cornerLabel && <span className={`absolute bottom-0 left-0 text-[9px] leading-none font-bold rounded-tr px-0.5 py-px z-10 ${cornerColor}`} title={dayMarkerText}>{cornerLabel}</span>}
              {isJeopardy&&!isJeoBlocked && <span className="absolute top-0 right-0 text-[9px] leading-none font-bold text-purple-600 bg-purple-100 rounded-bl px-0.5 py-px z-10" title="Jeopardy call">J</span>}
              {isPendingRequest && <span className="absolute top-0 left-0 text-[9px] leading-none font-bold text-blue-600 bg-blue-100 rounded-br px-0.5 py-px z-10" title="Day-off request pending">R</span>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Generate actions */}
      <div className="no-print flex items-center justify-between gap-2 mb-3 flex-wrap">
        <span className="font-mono text-[11px] text-muted-foreground">
          <strong className="text-foreground/80">{schedulableCount}</strong> of {allResidents.length} residents scheduling · <strong className="text-foreground/80">{totalAssigned}</strong> shifts assigned
          {block.generationReport && <> · last generated {new Date(block.generationReport.generatedAt).toLocaleString()}</>}
        </span>
        <span className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" icon={Undo2} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"/>
          <Button variant="ghost" size="sm" icon={Redo2} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z / Ctrl+Y)"/>
          <Button variant="primary" size="sm" icon={Wand2} onClick={requestGenerate}
            title="Fills empty coverage slots using the scheduling rules. Existing assignments (manual or generated) are never overwritten.">
            Generate Schedule
          </Button>
          <Button variant="dangerOutline" size="sm" icon={RefreshCw} onClick={()=>setConfirmRegen(true)}>
            Clear &amp; Regenerate
          </Button>
          <Button variant="dangerOutline" size="sm" icon={Unlock} onClick={requestRegenUnlocked}
            title="Clears every unlocked cell and regenerates it — locked cells are left untouched.">
            Regenerate Unlocked
          </Button>
          <span className="flex items-center gap-1">
            <input type="date" value={rangeStart} onChange={e=>setRangeStart(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
            <span className="text-xs text-gray-400">–</span>
            <input type="date" value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
            <Button variant="dangerOutline" size="sm" icon={RefreshCw} onClick={requestRegenRange}
              title="Clears unlocked cells within this date range and regenerates them — locked cells and cells outside the range are left untouched.">
              Regenerate Range
            </Button>
          </span>
          <Button variant="dangerOutline" size="sm" icon={Trash2} onClick={()=>setConfirmClear(true)}
            title="Empties every assignment without regenerating.">
            Clear Schedule
          </Button>
        </span>
      </div>

      <div className="no-print">
      <SubTabs value={view} onChange={setView} options={[
        {id:'grid', label:'Grid', icon:Table2},
        {id:'resident', label:'By Resident', icon:Users},
        {id:'calendar', label:'Calendar', icon:CalendarDays},
      ]}/>
      </div>

      <div className="no-print flex items-center gap-2 mb-3 flex-wrap">
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

      {/* Calendar-view-only shift-area filter */}
      {view==='calendar' && (
        <div className="no-print flex items-center gap-2 mb-3 flex-wrap">
          {['ALL',...SHIFT_AREAS].map(area=>(
            <button key={area} onClick={()=>setAreaFilter(area)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${areaFilter===area?'bg-gray-700 text-white border-gray-700':'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {area}
            </button>
          ))}
        </div>
      )}

      {/* Legend */}
      {view==='grid' && (
      <div className="flex items-center gap-2.5 mb-3 flex-wrap text-xs text-gray-400">
        <span className="px-1.5 py-0.5 rounded font-bold bg-yellow-100 text-yellow-700" title="Grand Rounds day (EM Home Wed / BAMC Thu) — distinct from GR lecture, the personal presenting date">GR</span>
        <span className="px-1.5 py-0.5 rounded font-bold bg-primary/10 text-primary" title="Journal Club presenting">JC</span>
        <span className="px-1.5 py-0.5 rounded font-bold bg-violet-100 text-violet-600">WW</span>
        <span className="px-1.5 py-0.5 rounded font-bold bg-orange-100 text-orange-500">OFF</span>
        <span className="px-1.5 py-0.5 rounded font-bold bg-teal-100 text-teal-600">VAC</span>
        <span className="px-1.5 py-0.5 rounded font-bold bg-purple-100 text-purple-600">J</span>
        <span>= Grand Rounds day · JC presenting · wellness Wednesday · approved off · vacation · jeopardy call</span>
        <span className="px-1.5 py-0.5 rounded border border-red-300 text-red-500 font-medium">red ring</span>
        <span>= rule violation</span>
      </div>
      )}

      {/* Empty-schedule CTA */}
      {totalAssigned === 0 && (
        <div className="text-center py-8 mb-3 bg-primary/10 rounded-xl border-2 border-dashed border-primary">
          <Wand2 size={28} className="mx-auto mb-2 text-primary"/>
          <p className="text-sm font-medium text-gray-700 mb-1">No shifts assigned yet</p>
          <p className="text-xs text-gray-500 mb-3">Auto-fill the whole block using the scheduling rules, coverage needs, and everyone's days off.</p>
          <Button variant="primary" icon={Wand2} onClick={requestGenerate}>
            Generate Schedule
          </Button>
          <p className="text-xs text-gray-400 mt-2.5">…or click any cell below to assign manually. Coverage per shift is set on the Scheduling Rules tab.</p>
        </div>
      )}

      {confirmClear && (
        <ClearScheduleConfirm blockName={block.name} hasSnapshot={blockSaveState !== 'never'}
          onConfirm={() => {
            updateBlock(b => ({ ...b, schedule: {}, generationReport: null }));
            setConfirmClear(false);
            showToast('Schedule cleared', 'amber');
          }}
          onClose={() => setConfirmClear(false)}/>
      )}

      {confirmRegen && (
        <Modal title="Clear & Regenerate?" onClose={()=>setConfirmRegen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This clears <strong>all current assignments — including ones you entered manually</strong> — and
              regenerates the whole schedule from scratch. You can undo this afterward with Ctrl+Z or the Undo button.
            </p>
            <ReadinessWarningPanel issues={regenReadiness}/>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setConfirmRegen(false)}>Cancel</Button>
              <Button variant="danger" onClick={()=>runGenerate(true)}>Clear &amp; Regenerate</Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmPartialRegen && (
        <Modal title={confirmPartialRegen.kind==='range' ? 'Regenerate Date Range?' : 'Regenerate Unlocked Cells?'} onClose={()=>setConfirmPartialRegen(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {confirmPartialRegen.kind==='range'
                ? <>This clears every <strong>unlocked</strong> assignment between {formatDisplayDate(confirmPartialRegen.start)} and {formatDisplayDate(confirmPartialRegen.end)} and refills them. Locked cells and cells outside this range are left untouched. You can undo this afterward with Ctrl+Z or the Undo button.</>
                : <>This clears every <strong>unlocked</strong> assignment in the block and refills them. Locked cells are left untouched. You can undo this afterward with Ctrl+Z or the Undo button.</>}
            </p>
            <ReadinessWarningPanel issues={partialRegenReadiness}/>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setConfirmPartialRegen(null)}>Cancel</Button>
              <Button variant="danger" onClick={()=>runPartialRegenerate(confirmPartialRegen)}>Regenerate</Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmGenerate && (
        <Modal title="Missing manual dates" onClose={()=>setConfirmGenerate(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Some manual per-block dates haven't been entered yet — Generate will still fill every slot it can, but
              rules that depend on these dates may not apply correctly.
            </p>
            <ReadinessWarningPanel issues={confirmGenerate}/>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setConfirmGenerate(null)}>Cancel</Button>
              <Button variant="primary" onClick={()=>runGenerate(false)}>Generate Anyway</Button>
            </div>
          </div>
        </Modal>
      )}

      {view==='grid' && (
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto schedule-scroll">
          <div style={{minWidth:NAME_W+CELL_W*dates.length}}>
            <div className="flex bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
              <div className="grid-sticky bg-gray-50 border-r border-gray-200 flex items-center px-3" style={{width:NAME_W,minWidth:NAME_W}}>
                <span className="font-display text-xs font-semibold text-gray-400 uppercase tracking-wide">Resident</span>
              </div>
              {dates.map(ds=>{
                const d=parseDate(ds); const dow=d.getDay(); const isWed=dow===3; const isWknd=dow===0||dow===6;
                return (
                  <div key={ds} style={{width:CELL_W,minWidth:CELL_W}}
                    className={`flex flex-col items-center justify-center py-1 border-r border-gray-100 ${isWed?'bg-yellow-50':isWknd?'bg-gray-100':'bg-gray-50'}`}>
                    <span className={`text-xs font-bold ${isWed?'text-yellow-700':isWknd?'text-gray-500':'text-gray-500'}`}>{DOW[dow]}</span>
                    <span className={`text-xs ${isWed?'text-yellow-600':isWknd?'text-gray-400':'text-gray-400'}`}>{d.getMonth()+1}/{d.getDate()}</span>
                    {/* Says out loud that this date runs 12h shifts — an unset window used to be a
                        completely silent no-op, which is how "ACEP didn't work" gets reported. */}
                    {twelveHourDaySet.has(ds) && (
                      <span className="text-[8px] font-bold px-1 rounded bg-indigo-100 text-indigo-700 leading-tight" title="12-hour shifts active on this date">12h</span>
                    )}
                  </div>
                );
              })}
            </div>

            {grouped.map(({cat,members})=>{
              const active=members.filter(isSchedulable);
              const inactive=members.filter(r=>!isSchedulable(r));
              const hiddenAssigned=inactive.reduce((s,r)=>s+Object.values(sched[r.id]||{}).filter(Boolean).length,0);
              const isExpanded=showInactive[cat.id] ?? true;
              return (
              <div key={cat.id}>
                <div className={`flex border-b border-gray-100 ${cat.rowBg}`}>
                  <div className="grid-sticky px-3 py-1.5 border-r border-gray-200" style={{width:NAME_W,minWidth:NAME_W,background:'inherit'}}>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${cat.badge}`}>{cat.label}</span>
                  </div>
                  <div style={{flex:1}}/>
                </div>
                {active.map(renderResidentRow)}
                {inactive.length>0 && (
                  <div className="bg-muted/50 text-xs text-muted-foreground px-2 py-1.5 flex items-center gap-1.5 cursor-pointer"
                    onClick={()=>setShowInactive(p=>({...p,[cat.id]:!isExpanded}))}>
                    <ChevronDown size={12} className={isExpanded?'':'-rotate-90'}/>
                    Not scheduled this block ({inactive.length}) — off rotation
                    {hiddenAssigned>0 && <span className="text-amber-600 dark:text-amber-400 font-medium">· {hiddenAssigned} shifts</span>}
                  </div>
                )}
                {isExpanded && inactive.map(renderResidentRow)}
              </div>
              );
            })}

            {/* Daily coverage footer — always the whole-schedule count, never catFilter-ed.
                Legacy light-print surface: kept token-first (auto-adapts in dark mode, always
                reverts to light for print via the @media screen-scoped dark overrides), but the
                red/amber/green status classes stay raw Tailwind literals — already remap-sheet
                covered for dark mode, must not be tokenized (see CLAUDE.md). */}
            <div className="flex bg-muted/60 border-t-2 border-border">
              <div className="grid-sticky bg-muted/60 border-r border-border flex items-center gap-1 px-3 cursor-pointer hover:bg-muted"
                style={{width:NAME_W,minWidth:NAME_W}} onClick={()=>setCovExpanded(p=>!p)}>
                <ChevronDown size={12} className={`text-muted-foreground transition-transform ${covExpanded?'':'-rotate-90'}`}/>
                <span className="font-display uppercase text-[10px] tracking-wide text-muted-foreground">Coverage</span>
              </div>
              {dates.map(ds=>{
                const cov = coverageByDate[ds];
                const cls = cov.belowMin.length ? 'bg-red-50 text-red-600 font-semibold' : cov.aboveMax.length ? 'bg-amber-50 text-amber-600' : 'text-green-700';
                return (
                  <div key={ds} style={{width:CELL_W,minWidth:CELL_W,height:28}}
                    title={[...cov.belowMin,...cov.aboveMax].join('; ') || 'Coverage OK'}
                    className={`flex items-center justify-center border-r border-gray-100 text-[11px] tabular-nums font-mono font-medium ${cls}`}>
                    {cov.filled}/{cov.minTotal}
                  </div>
                );
              })}
            </div>
            {covExpanded && activeCoverageShifts.map(s=>(
              <div key={s.id} className="flex border-t border-gray-100">
                <div className="grid-sticky border-r border-gray-200 flex items-center px-3" style={{width:NAME_W,minWidth:NAME_W}}>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.chip}`}>{s.id}</span>
                </div>
                {dates.map(ds=>{
                  const info = coverageByDate[ds].perShift[s.id];
                  if (!info) return <div key={ds} style={{width:CELL_W,minWidth:CELL_W,height:22}} className="border-r border-gray-50"/>;
                  const cls = info.count<info.min ? 'text-red-500 font-semibold' : info.count>info.max ? 'text-amber-500 font-semibold' : 'text-gray-400';
                  return (
                    <div key={ds} style={{width:CELL_W,minWidth:CELL_W,height:22}}
                      className={`flex items-center justify-center border-r border-gray-50 text-[10px] tabular-nums font-mono ${cls}`}>
                      {info.count}/{info.min}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {view==='resident' && (
        <ResidentCardsView grouped={grouped} sched={sched} dates={dates} appSettings={appSettings} violMap={violMap}
          dayRules={dayRules} blockStart={block.startDate}
          onRowClick={(res,ds)=>setPicker({resident:res,dateStr:ds})}/>
      )}

      {view==='calendar' && (
        <ScheduleCalendarView dates={dates} residents={filtered} sched={sched} coverageByDate={coverageByDate}
          areaFilter={areaFilter} jcDaySet={jcDaySet} onChipClick={(res,ds)=>setPicker({resident:res,dateStr:ds})}/>
      )}

      {dropConfirm && (
        <DragConfirmModal dropConfirm={dropConfirm}
          onCancel={()=>setDropConfirm(null)}
          onConfirm={()=>commitDrop(dropConfirm.src, dropConfirm.tgt, dropConfirm.kind, true)}/>
      )}

      {picker && (
        <ShiftPickerModal resident={picker.resident} dateStr={picker.dateStr}
          currentShift={sched[picker.resident.id]?.[picker.dateStr]||null}
          block={block} eligOverrides={eligOverrides} appSettings={appSettings} dayRules={dayRules}
          onSelect={sid=>assign(picker.resident.id,picker.dateStr,sid)}
          onClose={()=>setPicker(null)} showToast={showToast} ayConf={ayConf} prevTail={prevTail}/>
      )}
    </div>
  );
}

// Confirmation modal shown when a drag-drop swap/move has one or more violations — lists them and
// offers Cancel or an explicit override, matching ShiftPickerModal's "Assign Anyway" philosophy.
// Shared by the pre-Generate readiness modal and the Clear & Regenerate confirm modal — same
// red warning-panel style as DragConfirmModal's violation list below.
function ReadinessWarningPanel({ issues }) {
  if (!issues.length) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
      <div className="flex items-center gap-1.5 text-red-700 font-medium text-sm mb-1"><AlertCircle size={13}/> Missing manual dates</div>
      {issues.map((w,i)=><p key={i} className="text-xs text-red-600 ml-4">{w}</p>)}
    </div>
  );
}

// Shared by ShiftPickerModal and DragConfirmModal — switches to amber "Soft rule flagged"
// styling when every violation is a soft, chief-reorderable postNightRest warning, red
// "Violation detected" otherwise. Not reused by ReadinessWarningPanel above, which lists
// missing-data gaps (plain strings, no severity level) rather than {message, level} objects.
function ViolationPanel({ violations }) {
  if (!violations.length) return null;
  const allSoft = violations.every(w => w.level === 'warn');
  return (
    <div className={`border rounded-lg p-3 mb-3 ${allSoft ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
      <div className={`flex items-center gap-1.5 font-medium text-sm mb-1 ${allSoft ? 'text-amber-700' : 'text-red-700'}`}>
        <AlertCircle size={13}/> {allSoft ? 'Soft rule flagged' : 'Violation detected'}
      </div>
      {violations.map((w,i)=>(
        <p key={i} className={`text-xs ml-4 ${w.level==='warn' ? 'text-amber-600' : 'text-red-600'}`}>
          {w.message}{w.level==='warn' && <span className="text-amber-400"> (soft rule — chief can reorder priority)</span>}
        </p>
      ))}
    </div>
  );
}

function DragConfirmModal({ dropConfirm, onCancel, onConfirm }) {
  const { src, tgt, kind, violations } = dropConfirm;
  const srcShift = SHIFT_MAP[src.sid];
  const tgtShift = tgt.sid ? SHIFT_MAP[tgt.sid] : null;
  return (
    <Modal title={kind === 'swap' ? 'Confirm Swap' : 'Confirm Move'} onClose={onCancel}>
      <div className="flex items-center gap-3 mb-3 text-sm">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-400">{tgt.res.lastName}, {tgt.res.firstName} — {formatDisplayDate(tgt.ds)}</div>
          <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded font-bold ${srcShift?.chip}`}>{src.sid}</span>
        </div>
        {kind === 'swap' && (
          <>
            <span className="text-gray-300">↔</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-400">{src.res.lastName}, {src.res.firstName} — {formatDisplayDate(src.ds)}</div>
              <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded font-bold ${tgtShift?.chip}`}>{tgt.sid}</span>
            </div>
          </>
        )}
      </div>
      <ViolationPanel violations={violations}/>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">Cancel</button>
        <button onClick={onConfirm} className="px-3 py-1.5 text-sm rounded-lg font-medium text-white bg-amber-500 hover:bg-amber-600">
          {kind === 'swap' ? 'Swap Anyway' : 'Move Anyway'}
        </button>
      </div>
    </Modal>
  );
}

// By-resident sub-view of the schedule grid: one card per resident, grouped the same as the grid
// rows, with shifts (and non-shift markers: OFF/jeopardy/JC-presenting/GR weekly attendance/GR
// lecture/Wellness Wednesday) grouped by calendar week. Reuses ScheduleGrid's own violMap memo —
// never runs a second validateAll pass.
function ResidentCardsView({ grouped, sched, dates, appSettings, violMap, dayRules, blockStart, onRowClick }) {
  return (
    <div className="space-y-5">
      {grouped.map(({cat,members})=>(
        <div key={cat.id}>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${cat.badge}`}>{cat.label}</span>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-2">
            {members.map(res=>(
              <ResidentCard key={res.id} res={res} rs={sched[res.id]||{}} dates={dates}
                appSettings={appSettings} violMap={violMap} dayRules={dayRules} blockStart={blockStart} onRowClick={onRowClick}/>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Month-style (continuous Sunday-start week rows, no pagination) calendar sub-view of the
// Schedule tab. Read-mostly — editing goes through the same ShiftPickerModal as the grid via
// onChipClick, so there's exactly one place that validates and commits a shift change.
const CALENDAR_TIME_OF_DAY_ORDER = ['day','swing','eve','night'];
const CALENDAR_TIME_OF_DAY_LABEL = { day:'D', swing:'S', eve:'E', night:'N' };

function ScheduleCalendarView({ dates, residents, sched, coverageByDate, areaFilter, onChipClick, jcDaySet }) {
  const weekRows = useMemo(()=>buildWeekRows(dates), [dates]);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto schedule-scroll">
        <div style={{minWidth: 1100}}>
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
            {DOW.map(d => (
              <div key={d} className="px-2 py-1.5 font-display text-xs font-semibold text-gray-400 uppercase tracking-wide text-center border-r border-gray-100 last:border-r-0">{d}</div>
            ))}
          </div>
          {weekRows.map((row, i) => (
            <div key={i} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
              {row.map((ds, j) => {
                if (!ds) return <div key={j} className="min-h-[120px] bg-gray-50/40 border-r border-gray-100 last:border-r-0"/>;
                const d = parseDate(ds);
                const dow = d.getDay();
                const isWed = dow === 3;
                const cov = coverageByDate[ds];
                const assignments = residents
                  .map(r => ({ r, sid: sched[r.id]?.[ds] }))
                  .filter(({sid}) => sid && (areaFilter==='ALL' || SHIFT_MAP[sid]?.area === areaFilter))
                  .sort((a,b) => SHIFTS.findIndex(s=>s.id===a.sid) - SHIFTS.findIndex(s=>s.id===b.sid));
                const byTimeOfDay = {};
                for (const a of assignments) {
                  const t = SHIFT_MAP[a.sid]?.type;
                  (byTimeOfDay[t] = byTimeOfDay[t] || []).push(a);
                }
                const grResidents = residents.filter(r => grWorkDow(r)===dow && !(r.vacationDates||[]).includes(ds) && !(r.approvedDatesOff||[]).includes(ds));
                const isJCDay = jcDaySet?.has(ds) ?? false;
                const jcPresenters = residents.filter(r => (r.jcPresentDates||[]).includes(ds));
                const grLecturers = residents.filter(r => (r.grLectureDates||[]).includes(ds));
                return (
                  <div key={ds} className={`min-h-[120px] border-r border-gray-100 last:border-r-0 p-1.5 ${isWed?'bg-yellow-50/40':''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold ${isWed?'text-yellow-700':'text-gray-600'}`}>{d.getMonth()+1}/{d.getDate()}</span>
                      {cov && cov.minTotal > 0 && (
                        <span className={`text-[10px] tabular-nums font-mono ${cov.belowMin.length ? 'text-red-500 font-semibold' : 'text-gray-400'}`}
                          title={cov.belowMin.length ? `Below minimum: ${cov.belowMin.join(', ')}` : undefined}>
                          {cov.filled}/{cov.minTotal}
                        </span>
                      )}
                    </div>
                    {(grResidents.length>0 || isJCDay || jcPresenters.length>0 || grLecturers.length>0) && (
                      <div className="flex flex-wrap gap-0.5 mb-1">
                        {grResidents.length>0 && <span className="text-[9px] font-bold px-1 rounded bg-yellow-100 text-yellow-700" title={`Grand Rounds day: ${grResidents.map(r=>r.lastName).join(', ')}`}>GR</span>}
                        {isJCDay && <span className="text-[9px] font-bold px-1 rounded bg-primary/10 text-primary" title="Journal Club">JC</span>}
                        {jcPresenters.map(r => (
                          <span key={`jc_${r.id}`} className="text-[9px] font-medium px-1 rounded bg-primary/10 text-primary truncate max-w-[90px]" title={`${r.lastName}, ${r.firstName} — Journal Club presenting`}>JC · {r.lastName}</span>
                        ))}
                        {grLecturers.map(r => (
                          <span key={`lect_${r.id}`} className="text-[9px] font-medium px-1 rounded bg-white border border-yellow-400 text-yellow-700 truncate max-w-[90px]" title={`${r.lastName}, ${r.firstName} — Grand Rounds lecture`}>Lect · {r.lastName}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      {CALENDAR_TIME_OF_DAY_ORDER.filter(t=>byTimeOfDay[t]?.length).map((t, gi) => (
                        <div key={t} className={gi>0 ? 'pt-0.5 mt-0.5 border-t border-gray-100' : ''}>
                          <span className="text-[9px] font-semibold text-gray-300">{CALENDAR_TIME_OF_DAY_LABEL[t]}</span>
                          {byTimeOfDay[t].map(({r, sid}) => (
                            <button key={`${r.id}_${sid}`} onClick={()=>onChipClick(r, ds)}
                              className={`block w-full text-[10px] font-medium px-1 py-0.5 rounded truncate text-left ${SHIFT_MAP[sid]?.chip}`}
                              title={`${sid} — ${r.lastName}, ${r.firstName}`}>
                              {sid} · {r.lastName}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MIX_TYPE_ORDER = ['day','eve','night','swing'];
const MIX_TYPE_LABEL = { day:'D', eve:'E', night:'N', swing:'S' };

function ResidentCard({ res, rs, dates, appSettings, violMap, dayRules, blockStart, onRowClick }) {
  const sched_ok = isSchedulable(res);
  const cnt = Object.values(rs).filter(Boolean).length;
  const tgt = getShiftTarget(res, appSettings);
  const over = tgt != null && cnt > tgt;
  const chiefRole = effectiveChiefRole(res);
  // Buy-down/buy-up badge — see renderResidentRow's identical treatment on the Schedule grid.
  const cardDelta = Number(res.targetDelta);
  const cardHasDelta = Number.isFinite(cardDelta) && cardDelta !== 0;
  const violCount = Object.entries(violMap)
    .filter(([k]) => k.startsWith(`${res.id}_`))
    .reduce((s,[,v]) => s + v.length, 0);

  const mixCount = {};
  for (const sid of Object.values(rs)) { const t = SHIFT_MAP[sid]?.type; if (t) mixCount[t] = (mixCount[t]||0) + 1; }

  // One row per date that has a shift or a non-shift marker worth showing; fully blank dates are
  // skipped so cards stay compact. Grouped by calendar week (Sunday start).
  const weeks = {};
  for (const ds of dates) {
    const sid = rs[ds] || null;
    const isOff = (res.approvedDatesOff||[]).includes(ds);
    const isVac = (res.vacationDates||[]).includes(ds);
    const isJeo = (res.jeopardyDates||[]).includes(ds);
    const isJC = (res.jcPresentDates||[]).includes(ds);
    const isLecture = (res.grLectureDates||[]).includes(ds);
    const d = parseDate(ds);
    const dow = d.getDay();
    const isGR = grWorkDow(res)===dow && !isOff && !isVac;
    const wwOrdinal = res.category==='EM_HOME'
      ? (getEffectiveDayRules(`${res.category}_${res.pgy}`, dayRules).computedDayRules||[]).find(c=>c.type==='wellnessWednesday')?.ordinal
      : null;
    const isWW = dow===3 && wwOrdinal!=null && blockStart && ds===nthWeekdayOnOrAfter(blockStart, 3, wwOrdinal);
    if (!sid && !isOff && !isVac && !isJeo && !isJC && !isLecture && !isGR && !isWW) continue;
    const ws = toDateStr(addDays(d, -d.getDay()));
    (weeks[ws] = weeks[ws] || []).push({ ds, sid, isOff, isVac, isJeo, isJC, isLecture, isGR, isWW });
  }
  const weekKeys = Object.keys(weeks).sort();

  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm ${!sched_ok?'opacity-50':''}`}>
      <div className="px-3 py-2 border-b border-gray-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-800 truncate">{res.lastName}, {res.firstName}{chiefRole && CHIEF_ROLES[chiefRole]?<span title={CHIEF_ROLES[chiefRole].label}> ★{CHIEF_ROLES[chiefRole].badge}</span>:''}</div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-400">PGY-{res.pgy}</span>
            {res.blockType && res.category!=='PEDS' && (
              <span className="text-xs text-gray-300">· {BLOCK_TYPE_MAP[res.blockType]?.label||res.blockType}</span>
            )}
            {!sched_ok && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Not scheduled this block</span>}
          </div>
          {cnt > 0 && (
            <div className="text-[10px] text-gray-400 mt-1">
              {MIX_TYPE_ORDER.filter(t=>mixCount[t]).map(t=>`${MIX_TYPE_LABEL[t]} ${mixCount[t]}`).join(' · ')}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1">
            {cardHasDelta && (
              <span title={res.targetNote || (cardDelta<0?'Target reduced this block':'Target increased this block')}
                className={`text-[10px] px-1 py-0.5 rounded-full font-medium ${res.targetIsBuyDown?'bg-teal-100 text-teal-700':'bg-indigo-100 text-indigo-700'}`}>
                {cardDelta>0?`+${cardDelta}`:cardDelta}
              </span>
            )}
            {tgt != null && <span className={`text-xs font-semibold ${over?'text-red-500':'text-gray-500'}`}>{cnt}/{tgt}</span>}
          </div>
          {violCount > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{violCount} issue{violCount!==1?'s':''}</span>}
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
        {weekKeys.length === 0 && <div className="px-3 py-4 text-xs text-gray-400 text-center">No shifts.</div>}
        {weekKeys.map(ws=>{
          const rows = weeks[ws];
          return (
            <div key={ws}>
              <div className="px-3 py-1 bg-gray-50 flex items-center justify-between text-[10px] text-gray-400">
                <span>{formatDisplayDate(ws)} – {formatDisplayDate(toDateStr(addDays(parseDate(ws),6)))}</span>
                <span className="tabular-nums font-mono">{rows.filter(r=>r.sid).length} shift{rows.filter(r=>r.sid).length!==1?'s':''}</span>
              </div>
              {rows.map(({ds,sid,isOff,isVac,isJeo,isJC,isLecture,isGR,isWW})=>{
                const shift = sid ? SHIFT_MAP[sid] : null;
                const vKey = `${res.id}_${ds}`;
                const hasV = !!(violMap[vKey]?.length);
                const d = parseDate(ds);
                return (
                  <div key={ds} onClick={()=>onRowClick(res,ds)}
                    title={hasV ? violMap[vKey].map(v=>v.message).join('; ') : ''}
                    className={`flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-gray-50 ${hasV?'ring-1 ring-inset ring-red-400 bg-red-50':''}`}>
                    <span className="text-[10px] text-gray-400 tabular-nums font-mono w-10 shrink-0">{DOW[d.getDay()]} {d.getMonth()+1}/{d.getDate()}</span>
                    {shift && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${shift.chip}`}>{sid}</span>}
                    {shift && <span className="text-[10px] text-gray-400">{shift.hours}</span>}
                    {!shift && isOff && <span className="text-[10px] font-bold text-orange-500">OFF</span>}
                    {!shift && isVac && !isOff && <span className="text-[10px] font-bold text-teal-600">VAC</span>}
                    {!shift && isJeo && <span className="text-[10px] font-bold text-purple-500">J</span>}
                    {isWW && <span className="text-[10px] font-bold px-1 rounded bg-violet-100 text-violet-600">WW</span>}
                    {isGR && !isWW && <span className="text-[10px] font-bold px-1 rounded bg-yellow-100 text-yellow-700">GR</span>}
                    {isJC && <span className="text-[10px] font-bold px-1 rounded bg-primary/10 text-primary">JC</span>}
                    {isLecture && <span className="text-[10px] font-bold px-1 rounded bg-white border border-yellow-400 text-yellow-700">Lect</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── VALIDATION TAB ───────────────────────────────────────────────────────────

function GenerationReportCard({ report, appSettings }) {
  const summary = useMemo(()=>summarizeGenerationReport(report, appSettings),[report,appSettings]);
  const realGapGroups = summary.filter(s=>!s.structural);
  const structuralGroups = summary.filter(s=>s.structural);
  const structuralCount = structuralGroups.length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-border bg-primary/10">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-semibold text-primary flex items-center gap-1.5"><Wand2 size={14}/> Generation Report</span>
          <span className="text-xs text-primary">{new Date(report.generatedAt).toLocaleString()}</span>
        </div>
        <p className="text-xs text-primary mt-1">
          Filled {report.filled} of {report.totalSlots} minimum coverage slots ({report.keptManual} kept from manual entries){report.optionalFilled > 0 ? `, plus ${report.optionalFilled} optional slots toward each shift's maximum` : ''}.
          Reflects the schedule at generation time — manual edits since aren't included.
        </p>
      </div>
      <div className="p-4 space-y-3">
        {report.unfilled.length === 0 && report.underTarget.length === 0 && (report.seniorGaps||[]).length === 0 && (report.restCompromises||[]).length === 0 && (
          <p className="text-sm text-green-600 flex items-center gap-1.5"><CheckCircle size={14}/> Every minimum coverage slot was filled.</p>
        )}

        {realGapGroups.map(g => (
          <div key={g.shiftId} className="border border-amber-200 bg-amber-50/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xs px-2 py-0.5 rounded font-bold ${SHIFT_MAP[g.shiftId]?.chip}`}>{g.shiftId}</span>
              <span className="text-xs text-amber-700 font-medium">{g.slots.length} below minimum coverage</span>
            </div>
            <p className="text-xs text-gray-500 mb-1.5">{g.slots.map(s=>formatDisplayDate(s.dateStr)).join(', ')}</p>
            {g.recommendations.map((r,i)=><p key={i} className="text-xs text-gray-700">→ {r}</p>)}
          </div>
        ))}

        {(report.seniorGaps||[]).length > 0 && (
          <div className="border border-amber-200 bg-amber-50/60 rounded-lg p-3">
            <span className="text-xs font-semibold text-amber-700">FLEX/POD missing a senior resident</span>
            <ul className="mt-1 space-y-0.5">
              {report.seniorGaps.map((g,i)=>(
                <li key={i} className="text-xs text-gray-700">{formatDisplayDate(g.dateStr)} — {SHIFT_MAP[g.shiftId]?.label || g.shiftId} (no EM PGY-2/3 available — assign one manually)</li>
              ))}
            </ul>
          </div>
        )}

        {(report.restCompromises||[]).length > 0 && (
          <div className="border border-amber-200 bg-amber-50/60 rounded-lg p-3">
            <span className="text-xs font-semibold text-amber-700">24h post-night rest preference broken to fill minimum coverage</span>
            <ul className="mt-1 space-y-0.5">
              {report.restCompromises.map((c,i)=>(
                <li key={i} className="text-xs text-gray-700">{formatDisplayDate(c.dateStr)} — {SHIFT_MAP[c.shiftId]?.label || c.shiftId} — {c.name} (reorder Soft Rule Priority on the Rules tab to change this)</li>
              ))}
            </ul>
          </div>
        )}

        {structuralCount > 0 && (
          <div className="border border-gray-200 bg-gray-50 rounded-lg p-3">
            <span className="text-xs font-medium text-gray-500 px-1.5 py-0.5 rounded bg-gray-200 mr-1.5">Expected</span>
            <span className="text-xs text-gray-500">{structuralCount} shift{structuralCount!==1?'s have':' has'} gaps that match a day-of-week rule (e.g. Trauma window, GR Wednesday) — not a coverage problem.</span>
            {structuralGroups.map(g=>(
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
          <div className="border border-purple-200 bg-purple-50/60 rounded-lg p-3">
            <span className="text-xs font-semibold text-purple-700">Placed on jeopardy call dates (warn policy)</span>
            <ul className="mt-1 space-y-0.5">
              {report.jeopardyPlacements.map((j,i)=>(
                <li key={i} className="text-xs text-purple-700">{j.name} — {formatDisplayDate(j.dateStr)} · {j.shiftId}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// `issues` is the root's already-computed validateAll() result (shared with SidebarNav's badges
// and DashboardTab's stat tiles) — passed in as a prop rather than re-run here, so editing
// anything while this tab is open doesn't trigger a second full validateAll sweep for identical
// output.
// Read-only "what you keep undoing" card (Phase 3). Reports only — it never infers a rule, never
// tunes a weight, and nothing in the generator reads it. Auto-fitting score() weights to a few
// dozen override events would overfit badly and would destroy the auditability that makes the
// generator trustworthy in the first place; the deliverable here is a backlog for a human to read.
function OverrideInsightsCard({ overrideLog, allResidents }) {
  const rows = useMemo(() => {
    const byId = Object.fromEntries((allResidents || []).map(r => [r.id, r]));
    return summarizeOverrides(overrideLog || [], byId);
  }, [overrideLog, allResidents]);

  // Only a REPEATED override is signal; a one-off is just a normal edit.
  const repeated = rows.filter(r => r.count > 1);
  if (!rows.length) return null;

  const label = sid => (sid ? (SHIFT_MAP[sid]?.label || sid) : 'nothing');

  return (
    <CollapsibleCard
      title="Manual overrides — what you keep changing"
      subtitle={`${rows.length} distinct change${rows.length !== 1 ? 's' : ''} since this block was generated`}
      defaultOpen={false}
    >
      <p className="text-xs text-muted-foreground mb-3">
        Every hand-edit made to the generated schedule. Repeated entries are the useful ones — they
        point at a rule the generator doesn&apos;t know yet. Nothing here changes how schedules are
        generated.
      </p>
      {repeated.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No repeated overrides yet — nothing has been changed more than once.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {repeated.slice(0, 15).map(r => (
            <li key={r.key} className="py-2 flex items-start gap-2 text-sm">
              <span className="mt-0.5 text-violet-500">•</span>
              <div className="text-card-foreground">
                <span className="font-medium">{r.residentName}</span>
                {' — you changed '}<span className="font-medium">{label(r.from)}</span>
                {' to '}<span className="font-medium">{label(r.to)}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({r.count}x: {r.dates.slice(0, 4).map(formatDisplayDate).join(', ')}
                  {r.dates.length > 4 ? `, +${r.dates.length - 4} more` : ''})
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}

function ValidationTab({ issues, block, appSettings, allResidents }) {
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
      <OverrideInsightsCard overrideLog={block.overrideLog} allResidents={allResidents}/>
      <div className="text-center py-16">
        <CheckCircle size={48} className="mx-auto mb-3 text-green-500"/>
        <p className="text-gray-700 font-semibold">No rule violations</p>
        <p className="text-sm text-gray-400 mt-1">All scheduled shifts comply with current rules.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {report && <GenerationReportCard report={report} appSettings={appSettings}/>}
      <OverrideInsightsCard overrideLog={block.overrideLog} allResidents={allResidents}/>
      <div className="flex gap-3 flex-wrap">
        {errors.length>0 && <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5 text-sm text-destructive font-medium"><AlertCircle size={15}/>{errors.length} error{errors.length!==1?'s':''}</div>}
        {warns.length>0 && <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-700 font-medium"><AlertTriangle size={15}/>{warns.length} warning{warns.length!==1?'s':''}</div>}
      </div>
      {Object.entries(byRes).map(([id,{name,issues:ri}])=>{
        const hasErr=ri.some(i=>i.level==='error');
        return (
          <div key={id} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className={`px-4 py-2.5 border-b flex items-center gap-2 ${hasErr?'bg-destructive/10 border-destructive/20':'bg-amber-50 border-amber-100'}`}>
              {hasErr?<AlertCircle size={14} className="text-destructive"/>:<AlertTriangle size={14} className="text-amber-500"/>}
              <span className={`text-sm font-semibold ${hasErr?'text-destructive':'text-amber-800'}`}>{name}</span>
              <span className={`ml-auto text-xs ${hasErr?'text-destructive/70':'text-amber-400'}`}>{ri.length} issue{ri.length!==1?'s':''}</span>
            </div>
            <ul className="divide-y divide-border">
              {ri.map((issue,i)=>(
                <li key={i} className="px-4 py-2.5 flex items-start gap-2">
                  <span className={`mt-0.5 ${issue.level==='error'?'text-destructive':'text-amber-400'}`}>•</span>
                  <div className="text-sm text-card-foreground">
                    {issue.dateStr && <span className="font-medium text-muted-foreground text-xs mr-1.5">{formatDisplayDate(issue.dateStr)}{issue.shiftId?` · ${issue.shiftId}`:''}</span>}
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

// ─── SUPABASE SYNC ────────────────────────────────────────────────────────────
// Optional cross-device cloud sync, ported from the sibling em-scheduler app's proven pattern:
// a hand-rolled fetch()-based PostgREST client (no @supabase/supabase-js dependency), gated by
// a SUPABASE_ENABLED flag so the app runs exactly as before (pure localStorage) if unconfigured.
// One table, one fixed row — unlike em-scheduler's em_blocks (one row per independently-
// archivable block), this app's nine res_* localStorage slots are already one shared department
// document (blocksHistory is already a single flattened array in ONE slot), so a single row
// keyed by RES_STATE_ROW_ID holding the whole LS_BACKUP_KEYS-shaped object as one jsonb blob is
// the minimal-impedance-mismatch choice — no per-block rows to keep in sync.
//
// Database schema (run once in the Supabase project's SQL editor):
//   create table res_state (
//     id       text primary key,
//     data     jsonb not null,   -- the whole LS_BACKUP_KEYS-shaped document — a new res_* key
//                                -- never needs a schema migration here, only an LS_BACKUP_KEYS
//                                -- addition, same philosophy as em-scheduler's own data jsonb column
//     saved_at timestamptz default now()
//   );
//   alter table res_state enable row level security;
//   create policy "public_read_write" on res_state for all using (true) with check (true);
// (Wide-open RLS policy is intentional — same "accountability, not hard security" posture
// em-scheduler already accepts: the anon key is safe to expose client-side by Supabase's design,
// but this policy means anyone who extracts it from the deployed bundle's network requests has
// full read/write on this one row.)
//
// Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example) to enable; absent, the app
// is unchanged from before this feature existed.

const RES_STATE_ROW_ID = 'main';
// Demo Sandbox (see DEMO SANDBOX section near the root component): a second, independent
// res_state row so a demo can be resumed cross-device, exactly like the real row — never read or
// written except by demo-mode code paths.
const RES_STATE_DEMO_ROW_ID = 'demo';
// Device-local flag (like res_dark_mode) — NOT in LS_BACKUP_KEYS, never synced/backed-up. Read
// once per mount; every enter/exit/resume/delete action below sets this then reloads the page,
// since useLocalStorage's lazy initializer only reads localStorage on first mount.
const DEMO_MODE_KEY = 'res_demo_mode';

const SUPABASE_URL_RAW  = (typeof globalThis !== 'undefined' && globalThis.__SUPABASE_URL__)  || '';
const SUPABASE_ANON_RAW = (typeof globalThis !== 'undefined' && globalThis.__SUPABASE_ANON__) || '';
// Vite's %VITE_...% HTML token substitution leaves the literal unresolved token string in place
// (only a build-time warning, not an empty string) when the env var isn't defined for that build
// context — e.g. a fork PR preview, or a build with no .env. Without this guard, SUPABASE_ENABLED
// would be truthy for that broken value, sbFetch would call fetch("%VITE_SUPABASE_URL%/rest/v1/...")
// — a same-origin relative URL the browser resolves to something that isn't JSON (often this
// app's own index.html via the SPA redirect) — and JSON.parse would throw, landing the app in a
// permanent "Sync error" instead of the intended clean local-only fallback.
const isUnresolvedToken = v => typeof v === 'string' && v.startsWith('%') && v.endsWith('%');
const SUPABASE_URL     = isUnresolvedToken(SUPABASE_URL_RAW)  ? '' : SUPABASE_URL_RAW;
const SUPABASE_ANON    = isUnresolvedToken(SUPABASE_ANON_RAW) ? '' : SUPABASE_ANON_RAW;
export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON);

// When true, the root's debounced cloud-save is suppressed — set by SettingsTab's import/clear
// while they own the cloud row, so a due auto-save timer can't race in and re-POST stale state
// over the delete/import mid-operation (both reload the page on success, which resets this).
let syncSuspended = false;

const sbFetch = async (path, opts = {}) => {
  // Bound every request so a stalled (not failed — hung) network can't block indefinitely: the
  // mount load, the debounced save, and especially import/clear (which await before reloading)
  // all surface a timeout as a normal error instead of hanging the UI forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        'Prefer': opts.prefer || 'return=representation',
        ...opts.headers,
      },
      method: opts.method || 'GET',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(controller.signal.aborted ? `Supabase ${opts.method || 'GET'} ${path}: timed out` : e.message);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase ${opts.method || 'GET'} ${path}: ${msg}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

// Upsert the whole department document — POST with Prefer: resolution=merge-duplicates is an
// upsert keyed on the table's PK, same pattern em-scheduler uses (no ON CONFLICT SQL needed).
// rowId defaults to the real row; the Demo Sandbox passes RES_STATE_DEMO_ROW_ID so demo I/O never
// touches the real document.
const sbSaveState = async (data, rowId = RES_STATE_ROW_ID) => {
  if (!SUPABASE_ENABLED) return;
  await sbFetch('/res_state', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: { id: rowId, data, saved_at: new Date().toISOString() },
  });
};

// Loads a shared row — null if never saved yet (or unconfigured).
const sbLoadState = async (rowId = RES_STATE_ROW_ID) => {
  if (!SUPABASE_ENABLED) return null;
  const rows = await sbFetch(`/res_state?id=eq.${rowId}&select=data,saved_at`);
  return rows && rows[0] ? rows[0] : null;
};

// Delete a shared cloud row — SettingsTab's clearAll() gates the local wipe + reload on this
// succeeding, so the next mount's overlay can't restore the erased document from a still-intact row.
const sbDeleteState = async (rowId = RES_STATE_ROW_ID) => {
  if (!SUPABASE_ENABLED) return;
  await sbFetch(`/res_state?id=eq.${rowId}`, { method: 'DELETE', prefer: 'return=minimal' });
};

// ─── FEEDBACK ─────────────────────────────────────────────────────────────────
// A brand-new table, structurally unrelated to the single-row res_state document — it needs
// many independent rows (one per report), so it deliberately does NOT reuse res_state's sync
// machinery (sbFetch is reused as the transport, but not syncBindings/LS_BACKUP_KEYS/the
// debounced-save effect). Schema (run once in the same shared Supabase project's SQL editor —
// see docs/superpowers/plans/2026-07-18-user-feedback-plan.md Task 1 for the full statement):
//   create table feedback (
//     id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
//     app_name text not null default 'resident-scheduler',
//     type text not null check (type in ('bug','crash','idea')), message text not null,
//     contact text, page text, user_agent text, app_version text,
//     status text not null default 'new' check (status in ('new','reviewed','resolved')), meta jsonb
//   );
//   alter table feedback enable row level security;
//   create policy "anyone can submit feedback" on feedback for insert with check (true);
// No select/update/delete policy for anon — the admin view (see netlify/functions/
// feedback-admin.js) goes through a service-role key instead. Every insert hardcodes
// app_name: 'resident-scheduler' so a future em-scheduler feedback feature on the same
// project/table can't collide with this app's rows.
//
// Insert-only via the anon key. `prefer: 'return=minimal'` is required (not sbFetch's default
// return=representation) — Postgres RLS only returns an INSERT...RETURNING row if a SELECT
// policy also grants access to it, and there deliberately isn't one for anon; requesting a
// representation here would come back empty/confusing instead of erroring loudly.
export const submitFeedback = async ({ type, message, contact, page, meta }) => {
  if (!SUPABASE_ENABLED) return;
  await sbFetch('/feedback', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      app_name: 'resident-scheduler',
      type,
      message,
      contact: contact || null,
      page: page || null,
      user_agent: (typeof navigator !== 'undefined' && navigator.userAgent) || null,
      app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null,
      meta: meta || null,
    },
  });
};

// ─── SETTINGS TAB ─────────────────────────────────────────────────────────────

// `res_dark_mode` is deliberately NOT in this list — it's a device/viewer display preference,
// not chief scheduling data, and restoring a colleague's backup shouldn't flip your own theme
// (matches the sibling em-scheduler app, which excludes its own em_dark_mode the same way).
const LS_BACKUP_KEYS = ['res_em_roster','res_current_block','res_blocks_history','res_eligibility_overrides','res_ay_data','res_app_settings','res_day_rules','res_coverage','res_tab_order'];

function SettingsTab({ block, updateBlock, onBlockReset, appSettings, setAppSettings, showToast, demoMode, dbReady, onShowWhatsNew }) {
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

  // The value that would be used for this shift id if no override existed — a plain string
  // default from QGENDA_TASKS, or (for the 12h ids, deliberately absent from QGENDA_TASKS) the
  // fallback SHIFT_MAP label qgendaTaskFor itself falls back to. TRAUMA-D's default is a
  // PGY-dependent FUNCTION, not one string, so there's no single value to collapse an override
  // against — returns null, and updQgendaTask below only clears TRAUMA-D on a blank input.
  function qgendaDefaultForCompare(shiftId) {
    const entry = QGENDA_TASKS[shiftId];
    if (typeof entry === 'function') return null;
    if (typeof entry === 'string') return entry;
    return SHIFT_MAP[shiftId]?.label ?? shiftId;
  }

  // Sparse write, same convention as updTarget/the Rules-tab coverage editor/Shift Matrix: blank,
  // whitespace-only, or exactly-the-default input DELETES the override key instead of storing a
  // no-op string. Reading a stale key back would otherwise look like a deliberate chief override
  // forever, even after the input is cleared.
  function updQgendaTask(shiftId, raw) {
    setAppSettings(p => {
      const o = { ...(p.qgendaTaskOverrides || {}) };
      const trimmed = raw.trim();
      const def = qgendaDefaultForCompare(shiftId);
      if (!trimmed || trimmed === def) delete o[shiftId]; else o[shiftId] = trimmed;
      return { ...p, qgendaTaskOverrides: o };
    });
  }

  function exportData() {
    if (SUPABASE_ENABLED && demoMode && !dbReady) {
      showToast('Demo data is still loading from the cloud — wait a moment and try again.', 'amber');
      return;
    }
    const data = {};
    for (const k of LS_BACKUP_KEYS) {
      const physKey = demoMode ? k.replace(/^res_/, 'res_demo_') : k;
      try { data[k] = JSON.parse(localStorage.getItem(physKey)); } catch { data[k] = null; }
    }
    const payload = { app: 'resident-scheduler', exportedAt: new Date().toISOString(), demo: demoMode, data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `resident-scheduler-backup${demoFilenameSuffix(demoMode)}-${toDateStr(new Date())}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('Backup downloaded', 'green');
  }

  function importData(e) {
    if (demoMode) { showToast('Exit the demo sandbox first.', 'red'); e.target.value = ''; return; }
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed.demo === true) { showToast("That file is a demo-sandbox backup — it can't be restored over real data.", 'red'); return; }
        const d = parsed.data || parsed;
        // Build a clean, sync-safe object from LS_BACKUP_KEYS only — this excludes res_dark_mode
        // and any other stray keys in the file from ever reaching the shared cloud document.
        const clean = {};
        for (const k of LS_BACKUP_KEYS) {
          if (d[k] !== undefined && d[k] !== null) clean[k] = d[k];
        }
        if (Object.keys(clean).length === 0) { showToast('No recognizable data found in that file', 'red'); return; }
        if (SUPABASE_ENABLED) {
          // Cloud is the gate: push FIRST, and only commit locally + reload if it succeeds. If we
          // wrote localStorage first and the push failed, the reload's overlay would fetch the
          // still-stale cloud row and silently revert the import. syncSuspended blocks the root's
          // debounced auto-save from racing a stale write onto the row during our push.
          syncSuspended = true;
          showToast('Syncing import to the cloud…', 'amber');
          try {
            await sbSaveState(clean);
          } catch (err) {
            syncSuspended = false;
            showToast('Import could not sync to the cloud — nothing changed. Try again when online.', 'red');
            return;
          }
        }
        for (const k of LS_BACKUP_KEYS) { if (clean[k] !== undefined) localStorage.setItem(k, JSON.stringify(clean[k])); }
        window.location.reload();
      } catch {
        showToast('Could not read backup file — is it a valid export?', 'red');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function clearAll() {
    if (demoMode) { showToast('Exit the demo sandbox first.', 'red'); return; }
    if (SUPABASE_ENABLED) {
      // Delete the cloud rows FIRST, and only wipe localStorage + reload if the MAIN row succeeds —
      // otherwise the reload's overlay would fetch the still-intact row and restore everything.
      // syncSuspended blocks the root's debounced auto-save from re-creating either row during our
      // delete. Main row deleted first (not demo) so "nothing changed" stays true if it fails — the
      // demo row is a disposable, resumable sandbox slot, not real data, so its own delete is
      // attempted after and failing it doesn't block or misreport the real-data clear.
      syncSuspended = true;
      try {
        await sbDeleteState();
      } catch (err) {
        syncSuspended = false;
        showToast('Could not clear cloud data — nothing changed. Try again when online.', 'red');
        return;
      }
      try { await sbDeleteState(RES_STATE_DEMO_ROW_ID); } catch { /* demo row orphaned; real data already cleared below */ }
    }
    for (const k of LS_BACKUP_KEYS) {
      localStorage.removeItem(k);
      localStorage.removeItem(k.replace(/^res_/, 'res_demo_'));
    }
    localStorage.removeItem(DEMO_MODE_KEY);
    window.location.reload();
  }

  const jeoPolicy = appSettings.jeopardyPolicy ?? 'warn';
  const targetRows = [...MATRIX_ROWS, { key: 'CHIEF', label: 'Chief Resident', sub: 'PGY-3', catId: 'EM_HOME' }];
  const defaultTargetFor = k => k === 'CHIEF' ? 16 : (SHIFT_TARGETS[k] ?? null);

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Block name & dates */}
      <CollapsibleCard title="Block Name & Dates" subtitle="Also editable on the Dashboard tab.">
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
                  className={`flex flex-col items-start px-3 py-2 rounded-lg border-2 text-left transition-all ${jeoPolicy===v?'border-purple-500 bg-purple-50':'border-gray-200 hover:border-purple-300 bg-white'}`}>
                  <span className={`text-xs font-bold ${jeoPolicy===v?'text-purple-700':'text-gray-700'}`}>{l}</span>
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
              <label className="block text-xs font-semibold text-gray-700">EM PGY-2/3 trauma cap per block</label>
              <p className="text-xs text-gray-400">Warn when an EM Home PGY-2 or PGY-3 exceeds this many trauma shifts (target 1–2). Set 0 to disable.</p>
            </div>
            <input type="number" min="0" max="31" value={getTraumaCap(appSettings)}
              onChange={e=>updS('emTraumaCap', Math.max(0, Number(e.target.value) || 0))}
              className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-primary"/>
          </div>

          {/* General peds nudge */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700">PGY-2/3 peds shifts per block (fill-in)</label>
              <p className="text-xs text-gray-400">Soft nudge for EM Home PGY-2/3 not already on a dedicated peds rotation (Peds/EM, Trauma↔Peds) to pick up this many peds shifts per block — a gap-filler, not an emphasis.</p>
            </div>
            <input type="number" min="0" max="31" value={getGeneralPedsTarget(appSettings)}
              onChange={e=>updS('generalPedsMonthlyTarget', Math.max(0, Number(e.target.value) || 0))}
              className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-primary"/>
          </div>

          {/* Weekend off */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={appSettings.enforceWeekendOff !== false}
              onChange={e=>updS('enforceWeekendOff', e.target.checked)} className="rounded mt-0.5"/>
            <span>
              <span className="block text-xs font-semibold text-gray-700">Try to give every resident one full weekend off</span>
              <span className="block text-xs text-gray-400">Soft nudge: the generator avoids consuming a resident's last remaining free Saturday+Sunday when another candidate is available. Validation warns if a schedulable resident ends the block with none.</span>
            </span>
          </label>
        </div>
      </CollapsibleCard>

      {/* Shift targets */}
      <CollapsibleCard title="Shift Targets" subtitle="Shifts per block by residency & year. Leave blank to use the default; used for progress bars and over-target warnings. Rotation-specific targets (EM/Res/VAC 13, EM/VAC 12/11, US/EM 5, Peds↔Trauma 19, Peds/EM 19) apply automatically on top of these for EM Home — an override here replaces them for every rotation.">
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
                    className={`w-14 text-xs border rounded-lg px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-primary ${ov != null ? 'border-primary bg-primary/10 font-semibold' : 'border-gray-200'}`}/>
                  {ov != null && (
                    <button onClick={()=>updTarget(row.key, '')} title="Reset to default" className="text-gray-300 hover:text-primary"><RefreshCw size={10}/></button>
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
              className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-primary"/>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700">Saved blocks to keep</label>
              <p className="text-xs text-gray-400">Older saved blocks are dropped past this limit</p>
            </div>
            <input type="number" min="1" max="100" value={appSettings.maxSavedBlocks ?? 24}
              onChange={e=>updS('maxSavedBlocks', Math.max(1, Number(e.target.value) || 24))}
              className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-primary"/>
          </div>
        </div>
      </CollapsibleCard>

      {/* Re-open the release notes. Without this the What's New modal is a one-shot: dismissed
          once and gone, with no way back to it when someone half-reads it and closes the tab. */}
      <CollapsibleCard title="What's New" subtitle="Release notes — shown automatically the first time you open the app after an update.">
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500 flex-1">
            {CHANGELOG[0]
              ? <>Latest: <span className="font-medium text-gray-700">{CHANGELOG[0].title}</span> ({formatDisplayDate(CHANGELOG[0].date)})</>
              : 'No release notes yet.'}
          </p>
          <button onClick={onShowWhatsNew}
            className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors font-medium shrink-0">
            View release notes
          </button>
        </div>
      </CollapsibleCard>

      {/* QGenda task names — chief's own escape hatch for a rejected/mis-mapped QGenda import,
          per this app's whole design bias here: the chief has NO QGenda admin access and cannot
          trial-run an upload, so a wrong task name or staff-name format must be fixable from this
          screen, with no redeploy. Reads/writes appSettings.qgendaTaskOverrides/qgendaNameFormat —
          res_app_settings is already in LS_BACKUP_KEYS and syncBindings (see those maps above), so
          this whole card rides backup/restore, cloud sync, and demo-sandbox isolation for free;
          NO new storage key was added for it. */}
      <CollapsibleCard title="QGenda Task Names" subtitle="What each shift is called in QGenda, and how staff names export — fix these yourself if an import is rejected or shifts land under the wrong name.">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Staff name format</label>
            <select value={appSettings.qgendaNameFormat ?? 'lastFirstInitial'}
              onChange={e=>updS('qgendaNameFormat', e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary">
              {QGENDA_NAME_FORMATS.map(f => (
                <option key={f} value={f}>{QGENDA_NAME_FORMAT_LABEL[f] || f}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Preview: {qgendaName({ firstName: 'Jane', lastName: 'Doe' }, appSettings.qgendaNameFormat ?? 'lastFirstInitial')}
              {' '}(a real resident's own "QGenda Staff ID" field on their profile, if set, always overrides this format for that one person.)
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Task names by shift</label>
            <p className="text-xs text-gray-400 mb-3">Blank uses the default shown as placeholder. Fields marked <span className="text-amber-600 font-medium">amber</span> have no confirmed QGenda name yet — the export falls back to our own on-screen shift label for those until you set one.</p>
            <div className="space-y-4">
              {SHIFT_AREAS.map(area => (
                <div key={area}>
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{area}</div>
                  <div className="space-y-1.5">
                    {SHIFTS.filter(s => s.area === area).map(s => {
                      const entry = QGENDA_TASKS[s.id];
                      const isPgyFn = typeof entry === 'function';
                      const isUnmapped = entry == null; // the eight 12h ids
                      const placeholder = isPgyFn
                        ? 'Trauma Day-Intern (PGY-1) / Trauma Day (PGY-2+)'
                        : (isUnmapped ? (SHIFT_MAP[s.id]?.label ?? s.id) : entry);
                      const override = (appSettings.qgendaTaskOverrides || {})[s.id] ?? '';
                      return (
                        <div key={s.id}>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs w-28 shrink-0 truncate ${isUnmapped ? 'text-amber-600 font-medium' : 'text-gray-600'}`} title={s.label}>
                              {s.label}
                            </span>
                            <input value={override} onChange={e=>updQgendaTask(s.id, e.target.value)} placeholder={placeholder}
                              className={`flex-1 min-w-0 text-xs border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary ${
                                override ? 'border-primary bg-primary/10 font-medium' : (isUnmapped ? 'border-amber-300 bg-amber-50' : 'border-gray-200')
                              }`}/>
                            {override && (
                              <button onClick={()=>updQgendaTask(s.id, '')} title="Reset to default" className="text-gray-300 hover:text-primary shrink-0"><RefreshCw size={10}/></button>
                            )}
                          </div>
                          {isPgyFn && (
                            <p className="text-[11px] text-gray-400 mt-0.5 ml-[7.5rem]">Entering a name here collapses the PGY-1/PGY-2+ split above into one name for everyone.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Data management */}
      <CollapsibleCard title="Data Management" subtitle={SUPABASE_ENABLED
        ? "Data syncs automatically across your devices. Use these for a manual, offline point-in-time backup — a safety net if cloud sync is ever unavailable."
        : "All data lives in this browser's local storage — it does not sync between devices. Export a backup regularly."}>
        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" size="md" icon={Download} onClick={exportData}>Export Backup</Button>
          <Button variant="secondary" size="md" icon={Upload} onClick={()=>fileRef.current?.click()}>Import Backup</Button>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={importData} className="hidden"/>
        </div>
        <p className="text-xs text-gray-400 mt-2">Importing replaces ALL current data (rosters, blocks, matrix, settings) with the backup's contents, then reloads the app.</p>
      </CollapsibleCard>

      {/* Pointers */}
      <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-xs text-primary flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0"/>
        <span>Conference &amp; ITE dates: <strong>Dashboard</strong> tab → Block Calendar's AY dropdown. Special days (Code Blue, procedure, US days): <strong>Dashboard</strong> tab. Per-rotation shift eligibility: <strong>Shift Matrix</strong> tab.</span>
      </div>

      {/* Block reset */}
      <CollapsibleCard title="Block Reset" subtitle="Clears schedule, off-service residents, rotation assignments, and special days. Keeps name, dates, and academic year.">
        <Button variant="danger" size="sm" icon={RefreshCw} onClick={()=>setResetConfirm(true)}>Reset Block</Button>
        {resetConfirm && (
          <ResetBlockConfirm onConfirm={()=>{onBlockReset();setResetConfirm(false);}} onClose={()=>setResetConfirm(false)}/>
        )}
      </CollapsibleCard>

      {/* Danger zone */}
      <CollapsibleCard title="Clear All Data" subtitle="Deletes everything: rosters, all saved blocks, matrix overrides, AY data, and settings.">
        {clearConfirm ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-destructive font-medium">This erases ALL app data. Export a backup first!</span>
            <Button variant="danger" size="sm" onClick={clearAll}>Erase Everything</Button>
            <Button variant="secondary" size="sm" onClick={()=>setClearConfirm(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="danger" size="sm" icon={Trash2} onClick={()=>setClearConfirm(true)}>Clear All Data</Button>
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
              className="text-[11px] font-medium text-primary hover:text-primary hover:underline cursor-pointer whitespace-nowrap">
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
  { id: 'dashboard',  title: 'Dashboard — Blocks, Academic Years & Block at a Glance', goTab: 'dashboard', keywords: 'save load block academic year AY folder conference ITE dates block calendar progress code blue procedure US days first friday anesthesia social checklist' },
  { id: 'residents',  title: 'Residents — Profiles, Days Off & Jeopardy', goTab: 'em', keywords: 'roster intern graduate rotation off-service visiting BAMC days off jeopardy backup call CCU pencil edit import upload csv paste bulk availability date ranges specific days can-work' },
  { id: 'matrix',     title: 'Shift Matrix — Who Can Work What', goTab: 'matrix', keywords: 'eligibility matrix toggle rotation override EMS tox peds trauma reset PED-N PED-N-FM FM-3' },
  { id: 'generate',   title: 'Generate Schedule — Auto-Fill', goTab: 'rules', keywords: 'generate auto generate coverage fill regenerate clear wand button 6 day streak 1 in 7 consecutive trauma cap peds em mix' },
  { id: 'grid',       title: 'Schedule Grid — Reading the Cells', goTab: 'schedule', keywords: 'cells GR grand rounds JC journal club lecture off jeopardy red ring gray picker rest period filter chips targets generate' },
  { id: 'legend',     title: 'Cell & Shift Color Legend', goTab: 'schedule', keywords: 'colors legend chips POD PED FLEX MT trauma day eve night swatch' },
  { id: 'rules',      title: 'Violations & Generation Report', goTab: 'validation', keywords: 'errors warnings violations rules day-of-week clinic enforcement badge count generation report unfilled recommendations' },
  { id: 'export',     title: 'Exporting to QGenda', keywords: 'export CSV QGenda download grid import migrate' },
  { id: 'settings',   title: 'Settings & Data Safety', goTab: 'settings', keywords: 'backup restore import localStorage sync computers jeopardy policy rest rule trauma cap shift targets data qgenda task names staff id name format' },
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
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"/>
        {query && <button onClick={()=>setQuery('')} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>}
        <button onClick={()=>setAll(true)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 whitespace-nowrap">Expand all</button>
        <button onClick={()=>setAll(false)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 whitespace-nowrap">Collapse all</button>
      </div>

      {/* Table of contents */}
      {!q && (
        <div className="flex flex-wrap gap-1.5">
          {GUIDE_SECTIONS.map(s => (
            <button key={s.id} onClick={()=>jumpTo(s.id)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-600 hover:border-primary hover:text-primary hover:bg-primary/10 transition-colors">
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
          <li><strong>Dashboard tab</strong> — click <strong>New Block</strong>, then set the block name and start date (end date and academic year auto-fill from it — both stay editable).</li>
          <li><strong>EM Residents / Off-Service tabs</strong> — set each EM Home resident's rotation, and add this month's visiting residents (or use <strong>Import Roster</strong> to paste/upload a roster instead of adding one at a time). Enter approved dates off, vacation dates (or use <strong>Import Vacation Dates</strong> to upload the chief's vacation-tracking spreadsheet), and jeopardy call dates.</li>
          <li><strong>Dashboard tab</strong> — enter this block's special days (Code Blue, procedure, US days) before scheduling — they affect eligibility.</li>
          <li><strong>Scheduling Rules tab</strong> — set daily shift coverage (how many residents each shift needs), then click <strong>Generate Schedule</strong> on the Schedule tab to auto-fill the whole block.</li>
          <li><strong>Schedule tab</strong> — review the generated schedule, or click any cell to assign/adjust a shift manually. The picker only offers shifts that resident can legally work that day; anything else needs an explicit "Assign Anyway".</li>
          <li><strong>Violations tab</strong> — review the Generation Report and any remaining errors/warnings before finalizing.</li>
          <li><strong>Dashboard tab</strong> — click <strong>Save Block</strong> to archive it, then use the header's <strong>Export</strong> menu → <strong>QGenda CSV…</strong> to migrate the schedule into QGenda.</li>
        </ol>
      </GuideSection>}

      {show('dashboard') && <GuideSection {...sec('dashboard')}>
        <p>The <strong>Block Calendar</strong> at the top shows a July→July view of every saved block for a chosen academic year, each with a color-coded coverage strip — click a block to expand a per-shift heatmap, or "Open block" to switch to it. Pick an AY from the dropdown to browse or edit that year's <strong>Conference &amp; ITE Dates</strong> (shown inline above that AY's blocks) — these apply to every block in the year and surface below when they overlap the current block.</p>
        <p>Below the calendar, the <strong>Current Block</strong> card is your active workspace: name and dates editable inline (collapse it with the header once set up).</p>
        <ul className="list-disc space-y-1">
          <li><strong>Save Block</strong> snapshots everything (roster assignments, schedule, special days) into the Block Calendar above. Re-saving the same block updates its snapshot.</li>
          <li><strong>Load</strong> (from a Block Calendar row) restores a saved block — you'll be prompted to save current work first.</li>
          <li><strong>Import Master Matrix</strong> uploads the chief's yearly workbook and turns it into ready-to-load saved blocks — never touches the live block.</li>
        </ul>
        <p>Further down: block progress, any conferences that fall inside the current block, first Fridays (Anesthesia social), and editable special-day lists. Use it as the pre-scheduling checklist: confirm conferences, Code Blue days, procedure days, and US days are all entered before assigning shifts.</p>
      </GuideSection>}

      {show('residents') && <GuideSection {...sec('residents')}>
        <ul className="list-disc space-y-1">
          <li><strong>EM Home roster persists</strong> across blocks — add interns once a year, remove graduates. Their rotation is set per block.</li>
          <li><strong>Off-service residents are per-block</strong> — cleared on New Block/Block Reset, re-entered each month.</li>
          <li><strong>Import Roster</strong> — paste rows from a spreadsheet or upload a CSV (Name, Category, PGY — any Rotation/date columns are ignored) instead of adding residents one at a time. Shows a preview before committing; already-listed names are skipped automatically.</li>
          <li><strong>Import Vacation Dates</strong> (EM Residents tab) — upload the chief's vacation-tracking .xlsx workbook. Matches names against the EM Home roster (tolerant of extra middle/last names and parenthetical suffixes); ambiguous or unmatched rows are shown separately for manual review rather than guessed. Commit merges parsed dates into each matched resident's Vacation Dates — never touches other fields or off-service residents.</li>
          <li><strong>Approved Dates Off</strong> (orange) — hard-blocked in the grid; scheduling over one is an error. Off-service residents can add/remove these directly on their tile, no need to open Edit.</li>
          <li><strong>Jeopardy Call Dates</strong> (purple "J") — the resident is on backup call. How this affects scheduling is configurable in Settings: Block (unschedulable), Warn (default — allowed but flagged), or Ignore.</li>
          <li><strong>Availability</strong> (off-service only) — defaults to available all block; switch to <strong>Date ranges</strong> for a resident who only rotates with you part of the block, or <strong>Specific days only</strong> for a whitelist of exact dates (e.g. Peds residents' self-cover days from Amion). Outside their availability, the resident is unschedulable, same as an approved day off.</li>
          <li>Edit any profile with the pencil icon; the IM "CCU nights" toggle blocks Tue/Wed automatically.</li>
        </ul>
      </GuideSection>}

      {show('matrix') && <GuideSection {...sec('matrix')}>
        <p>The matrix defines which shift types each <strong>residency + year</strong> can work. Checks are color-coded by area (POD, PED, FLEX, MT, Trauma).</p>
        <ul className="list-disc space-y-1">
          <li>Click any cell to toggle. Modified rows show <span className="text-primary">✎</span> and a per-row reset.</li>
          <li><strong>Per-rotation rules:</strong> expand an EM Home row (▸) to see its rotations (EM, EMS, Tox, Peds/Trauma…). Dimmed checks inherit from the parent row; clicking creates a <span className="text-purple-500">rotation override</span> so e.g. an EMS month can have a different shift list than a standard EM month.</li>
          <li>Day-of-week rules (GR Wednesday, clinic days, EMS Mon/Tue, Tox Thu/Fri, trauma Tue/Thu/Sat/Sun) are enforced on top of the matrix and aren't edited here — see the Scheduling Rules tab, which now controls those directly.</li>
        </ul>
      </GuideSection>}

      {show('generate') && <GuideSection {...sec('generate')}>
        <p>Set <strong>Daily Shift Coverage</strong> on the Scheduling Rules tab first — how many residents each shift (POD Day, Trauma Night, etc.) needs per day. Then, on the Schedule tab, click <strong>Generate Schedule</strong> to auto-fill every open slot for the whole block.</p>
        <ul className="list-disc space-y-1">
          <li>The generator respects everyone's eligibility, days off, jeopardy policy, rest-period rule, the EM PGY-2/3 trauma cap, the <strong>EM PGY-3 requirement on POD</strong>, and the <strong>max 6 consecutive work days</strong> rule (Grand Rounds and Journal Club presenting days count as worked too, and the count carries across the previous block's tail) — it never assigns a shift a resident couldn't legally work.</li>
          <li><strong>Trauma Day is filled last</strong>, after every other shift for the whole block, so PGY-1 trauma-day slots don't crowd out other coverage.</li>
          <li><strong>Generate never overwrites a cell you've already filled in</strong> — manual or picker assignments are kept, and it only fills what's still empty. Run it again anytime after making manual edits.</li>
          <li><strong>Clear &amp; Regenerate</strong> wipes every assignment (including manual ones) and rebuilds from scratch — confirm before using it.</li>
          <li>After generating, check the <strong>Violations tab</strong> for a Generation Report: any coverage slot it couldn't fill, why, and what to change. Peds Night (FM-3-exclusive Mon/Tue/Wed; optional EM Home Thu-Sun) gaps are marked "Expected" when no one eligible is on the block those days.</li>
        </ul>
      </GuideSection>}

      {show('grid') && <GuideSection {...sec('grid')}>
        <ul className="list-disc space-y-1">
          <li><strong className="text-yellow-600">GR</strong> (yellow) — Grand Rounds day: every EM Home resident's Wednesday, every BAMC resident's Thursday (suppressed on a vacation/approved-off date). Shows as a corner tag on cells that also have a shift assigned, not just empty ones — a resident with GR <em>and</em> an evening/night shift the same day now shows both.</li>
          <li><strong className="text-primary">JC</strong> (blue) — this resident is presenting Journal Club that date (their own <code>jcPresentDates</code>) — a different thing from the plain GR day above.</li>
          <li><strong className="text-yellow-700">GR lecture</strong> — this resident is giving a Grand Rounds lecture that date (their own <code>grLectureDates</code>) — a personal presenting date, not the weekly GR attendance day.</li>
          <li><strong className="text-violet-600">WW</strong> (violet) — Wellness Wednesday; each EM Home PGY's own 1st/2nd/3rd Wednesday on/after the block's start date (PGY-1/2/3 respectively) — no day <em>or</em> evening shifts that day (a night shift starting that Wednesday is still workable). Takes priority over the plain GR/JC cue on that one cell since it's the stricter rule.</li>
          <li><strong className="text-orange-500">OFF</strong> (orange) — approved day off.</li>
          <li><strong className="text-teal-600">VAC</strong> (teal) — vacation date (tracked separately from approved day off, same hard block).</li>
          <li><strong className="text-purple-600">J</strong> (purple) — jeopardy call; corner badge if warn-mode, full cell if block-mode.</li>
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
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-yellow-100 text-yellow-700">GR</span> Grand Rounds day (EM Home Wed / BAMC Thu)</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-primary/10 text-primary">JC</span> Journal Club presenting</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-white border border-yellow-400 text-yellow-700">Lect</span> GR lecture (presenting)</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-violet-100 text-violet-600">WW</span> Wellness Wed (no day/eve)</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-orange-100 text-orange-600">OFF</span> approved day off</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-teal-100 text-teal-600">VAC</span> vacation</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-purple-100 text-purple-700">J</span> jeopardy call</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-white text-gray-700 ring-2 ring-red-400">POD-D</span> rule violation</span>
          <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded font-bold bg-gray-100 text-gray-400">—</span> no eligible shifts</span>
        </div>
      </GuideSection>}

      {show('rules') && <GuideSection {...sec('rules')}>
        <p>If you ran <strong>Generate Schedule</strong>, a <strong>Generation Report</strong> appears at the top of the Violations tab: how many coverage slots were filled, which ones weren't and why (no eligible resident, everyone at target, rest-rule conflicts, trauma cap…), with a plain-language recommendation for each — raise a target, lower coverage, check the Shift Matrix, and so on. Gaps that just match a day-of-week rule (Trauma's Tue/Thu/Sat/Sun window, GR Wednesday) are marked "Expected" rather than flagged as problems.</p>
        <p>Below that, the <strong>Violations list</strong> shows every error (must fix: ineligible shifts, days-off conflicts, rest violations, hard circadian turnarounds, overlaps, &gt;6 consecutive work days, two residents on one trauma shift, a staffed POD shift with no EM PGY-3) and warning (review: over target, trauma cap, jeopardy, BAMC Wednesday-night count, Peds/EM mix) grouped by resident. The sidebar badge shows the live count. Exporting a CSV with unresolved errors will prompt for confirmation first.</p>
        <p>The <strong>Scheduling Rules tab</strong> is where every residency/PGY type's day-of-week and rotation rules live — full-day blocks, day/night-only restrictions (some marked "generator only," meaning the manual picker still allows the shift), rotation-specific day windows (EMS Mon/Tue, Tox Thu/Fri, trauma Tue/Thu/Sat/Sun for days and Fri/Sat/Sun/Mon for nights), computed-date rules (e.g. Anesthesia's 1st-Friday-of-month), how Code Blue/procedure/anesthesia dates affect eligibility, and the <strong>Daily Shift Coverage</strong> grid used by Generate Schedule. Edit them directly here — no code changes needed. Each type shows a ✎ mark and reset button when modified from the built-in defaults. Shift targets and eligible shifts are shown live.</p>
      </GuideSection>}

      {show('export') && <GuideSection {...sec('export')}>
        <p>The header's <strong>Export</strong> menu (visible once the current block has a start date) offers:</p>
        <ul className="list-disc space-y-1">
          <li><strong>Grid CSV</strong> — the same resident × date matrix shown on the Schedule tab, raw shift codes only. Best for your own visual cross-check, not for importing anywhere.</li>
          <li><strong>QGenda CSV…</strong> — opens a picker for the staff-name format and a UTF-8 BOM toggle, then one of two layouts: <strong>Minimal</strong> (Staff, Date, Task — smallest surface area if QGenda's importer is picky about extra columns) or <strong>With times</strong> (adds EndDate, StartTime, EndTime, for an importer that needs explicit shift times instead of inferring them from the Task name).</li>
          <li><strong>PDF…</strong> and <strong>ICS Calendar</strong> — a printable matrix or per-resident PDF, and one .ics file per resident for Outlook/Google/Apple Calendar.</li>
        </ul>
        <p>If the schedule has unresolved errors (ineligible shifts, days-off conflicts, rest violations) — or, for QGenda specifically, any shift whose task name isn't yet confirmed — export will ask you to confirm before downloading.</p>
        <p><strong>If QGenda rejects the file, or the shifts land under the wrong name, you can fix it yourself — no developer needed.</strong> <strong>Settings tab → QGenda Task Names</strong> lets you set the exact task name QGenda expects for each shift (leave a field blank to use the best-guess default shown as its placeholder), change the exported staff-name format, and toggle the UTF-8 BOM. If QGenda matches a particular resident by an internal abbreviation rather than by name, set that resident's own <strong>QGenda Staff ID</strong> on their profile (Edit Resident) — it overrides the name format for that one person.</p>
      </GuideSection>}

      {show('settings') && <GuideSection {...sec('settings')}>
        <ul className="list-disc space-y-1">
          <li><strong>Rule Enforcement</strong> — jeopardy policy, rest-period rule on/off, PGY-2 trauma cap.</li>
          <li><strong>Shift Targets</strong> — override shifts-per-block for any residency/year (incl. Chief).</li>
          <li><strong>QGenda Task Names</strong> — the exact task name QGenda expects per shift, the exported staff-name format, and a live preview. See "Exporting to QGenda" above.</li>
          <li><strong>Data Management</strong> — everything is stored in this browser only (localStorage). It does <em>not</em> sync between computers. <strong>Export a backup</strong> regularly; Import restores it on any machine.</li>
        </ul>
      </GuideSection>}

      {show('faq') && <GuideSection {...sec('faq')}>
        <ul className="list-disc space-y-2">
          <li><strong>Why is a cell gray?</strong> That resident has no eligible shifts that day — a clinic day, day-of-week restriction (e.g. EMS Mon/Tue), GR Wednesday, or a non-schedulable rotation. Check the Shift Matrix and Scheduling Rules tabs to see why.</li>
          <li><strong>Why can't I assign a shift I know is fine?</strong> The picker only offers legal shifts. Use <strong>"Assign Anyway"</strong> in the picker to override — it will be flagged in Violations so you can track it.</li>
          <li><strong>My schedule disappeared on another computer.</strong> Data lives in the browser's localStorage and does <em>not</em> sync between machines. Use <strong>Settings → Export backup</strong> on one computer and <strong>Import</strong> on the other.</li>
          <li><strong>The Export button is missing.</strong> It appears in the header only once the current block has a start date set (Dashboard tab).</li>
          <li><strong>QGenda says the file is unreadable, or shifts import under the wrong name.</strong> Fix it yourself in <strong>Settings → QGenda Task Names</strong> — set the exact task name for the shift in question, try the other column layout (Minimal vs. With times) in the QGenda CSV picker, or toggle the UTF-8 BOM. No redeploy needed.</li>
          <li><strong>A resident shows the wrong shifts in the picker.</strong> Check their rotation for this block (EM Residents tab) and any rotation override in the Shift Matrix — dimmed checks inherit, solid checks are overrides.</li>
          <li><strong>I saved a block by mistake.</strong> Re-saving the same block just updates its snapshot; you can also Load any earlier saved block from the Block Calendar on the Dashboard tab.</li>
        </ul>
      </GuideSection>}
    </div>
  );
}

// ─── FEEDBACK WIDGET ────────────────────────────────────────────────────────
// Floating "Feedback" button, rendered by the root regardless of active tab. Hidden entirely
// when SUPABASE_ENABLED is false — matches how AutosaveIndicator's cloud states only appear
// when cloud sync is configured (see the root's own render call site).
const FEEDBACK_TYPES = [
  { id: 'bug',   label: 'Bug',   icon: Bug },
  { id: 'crash', label: 'Crash', icon: Zap },
  { id: 'idea',  label: 'Idea',  icon: Lightbulb },
];

function FeedbackWidget({ page, showToast }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('bug');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() { setType('bug'); setMessage(''); setContact(''); }

  async function handleSubmit() {
    if (!message.trim()) { showToast('Please describe the issue or idea first', 'red'); return; }
    setSubmitting(true);
    try {
      await submitFeedback({ type, message: message.trim(), contact: contact.trim(), page });
      showToast('Thanks — feedback sent', 'green');
      reset();
      setOpen(false);
    } catch (e) {
      showToast(`Could not send feedback: ${e.message}`, 'red');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} title="Report a bug, crash, or idea"
        className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-colors text-sm font-medium">
        <MessageSquare size={16}/> Feedback
      </button>
      {open && (
        <Modal title="Send Feedback" onClose={() => { setOpen(false); reset(); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Type</label>
              <div className="flex gap-1.5">
                {FEEDBACK_TYPES.map(t => {
                  const Ic = t.icon;
                  return (
                    <button key={t.id} onClick={() => setType(t.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${type === t.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                      <Ic size={13}/> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Message <span className="text-red-500">*</span></label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
                placeholder="What happened, or what would help?"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Contact (optional)</label>
              <input type="text" value={contact} onChange={e => setContact(e.target.value)}
                placeholder="Email, if you'd like a reply"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"/>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setOpen(false); reset(); }} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg font-medium">
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── FEEDBACK ADMIN TAB ─────────────────────────────────────────────────────
// Password-gated triage view — goes through netlify/functions/feedback-admin.js (service-role
// key, server-only) rather than sbFetch/the anon key, since anon has no SELECT policy on
// `feedback`. Password is held in sessionStorage once accepted (cleared when the browser tab
// closes, matching the "Track A" shared-password posture used by the sibling Kitchen
// Inventory / ecowater-pricing-app feedback features).
const FEEDBACK_ADMIN_SS_KEY = 'res_feedback_admin_password';
const FEEDBACK_STATUS_OPTIONS = ['new', 'reviewed', 'resolved'];
const FEEDBACK_TYPE_BADGE = {
  bug:   'bg-red-100 text-red-700',
  crash: 'bg-orange-100 text-orange-700',
  idea:  'bg-green-100 text-green-700',
};

// Same 15s bound as sbFetch (SUPABASE SYNC section) — without it a hung feedback-admin
// Function response would spin the admin UI forever with no recovery short of a reload.
async function fetchWithTimeout(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFeedbackAdmin(password) {
  const res = await fetchWithTimeout('/api/feedback-admin/', { headers: { 'x-feedback-password': password } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function updateFeedbackStatus(password, id, status) {
  const res = await fetchWithTimeout('/api/feedback-admin/', {
    method: 'PATCH',
    headers: { 'x-feedback-password': password, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function FeedbackAdminTab() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(FEEDBACK_ADMIN_SS_KEY) || '');
  const [unlocked, setUnlocked] = useState(() => Boolean(sessionStorage.getItem(FEEDBACK_ADMIN_SS_KEY)));
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load(pw) {
    setLoadError('');
    try {
      const data = await fetchFeedbackAdmin(pw);
      setRows(data);
    } catch (e) {
      setLoadError(e.message);
    }
  }

  useEffect(() => {
    if (unlocked && password) load(password);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  async function handleUnlock() {
    setAuthError('');
    try {
      await fetchFeedbackAdmin(passwordInput);
      sessionStorage.setItem(FEEDBACK_ADMIN_SS_KEY, passwordInput);
      setPassword(passwordInput);
      setUnlocked(true);
    } catch (e) {
      setAuthError(e.message || 'Incorrect password');
    }
  }

  async function handleStatusChange(id, status) {
    setBusyId(id);
    try {
      await updateFeedbackStatus(password, id, status);
      setRows(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!unlocked) {
    return (
      <div className="max-w-sm mx-auto mt-16 space-y-3">
        <div className="flex items-center gap-2 text-gray-700"><Lock size={16}/><h2 className="font-semibold">Feedback Admin</h2></div>
        <p className="text-sm text-gray-500">Enter the admin password to view submitted feedback.</p>
        <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleUnlock(); }}
          placeholder="Admin password"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"/>
        {authError && <p className="text-xs text-red-500">{authError}</p>}
        <button onClick={handleUnlock} className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/90 text-white rounded-lg font-medium">Unlock</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Feedback ({rows ? rows.length : '…'})</h2>
        <button onClick={() => load(password)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg">
          <RefreshCw size={12}/> Refresh
        </button>
      </div>
      {loadError && <p className="text-sm text-red-500">{loadError}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-gray-400">No feedback yet.</p>}
      <div className="space-y-2">
        {(rows || []).map(r => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${FEEDBACK_TYPE_BADGE[r.type] || 'bg-gray-100 text-gray-600'}`}>{r.type}</span>
                <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</span>
                {r.page && <span className="text-xs text-gray-400">· {r.page}</span>}
              </div>
              <select value={r.status} disabled={busyId === r.id}
                onChange={e => handleStatusChange(r.id, e.target.value)}
                className="text-xs border border-gray-300 rounded-md px-2 py-1">
                {FEEDBACK_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.message}</p>
            {r.contact && <p className="text-xs text-gray-500">Contact: {r.contact}</p>}
            {r.meta?.stack && <pre className="text-[10px] text-gray-400 bg-gray-50 rounded p-2 overflow-x-auto">{r.meta.stack}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard',  label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'em',         label: 'EM Residents',  icon: Stethoscope, blockScoped: true },
  { id: 'offservice', label: 'Off-Service',   icon: Users, blockScoped: true },
  { id: 'matrix',     label: 'Shift Matrix',  icon: Table2, global: true },
  { id: 'schedule',   label: 'Schedule',      icon: Calendar, blockScoped: true },
  { id: 'rules',      label: 'Scheduling Rules', icon: BookOpen, global: true },
  { id: 'validation', label: 'Violations',    icon: AlertTriangle, blockScoped: true },
  { id: 'requests',   label: 'Requests',      icon: Inbox },
  { id: 'settings',   label: 'Settings',      icon: SettingsIcon, global: true },
  { id: 'feedback',   label: 'Feedback',      icon: MessageSquare },
  { id: 'guide',      label: 'User Guide',    icon: HelpCircle },
];

// Tabs whose content is scoped to whichever block is currently open — shown BlockContextBar so the
// chief always knows which block they're editing without a trip back to the Dashboard. Derived from
// TABS' own blockScoped flag so the two never drift out of sync.
const BLOCK_SCOPED_TABS = new Set(TABS.filter(t => t.blockScoped).map(t => t.id));

// Saved order (validated — a corrupt/foreign backup import could hand this anything) plus any
// tabs added since the order was saved (unknown ids), appended at the end.
function reconcileTabOrder(order, tabs) {
  const safeOrder = Array.isArray(order) ? order : [];
  const byId = Object.fromEntries(tabs.map(t=>[t.id,t]));
  const known = safeOrder.map(id=>byId[id]).filter(Boolean);
  const missing = tabs.filter(t=>!safeOrder.includes(t.id));
  return [...known, ...missing];
}

// Moves fromId to land immediately before toId's original slot, regardless of drag direction.
function reorderIds(order, fromId, toId) {
  if (!fromId || fromId===toId) return order;
  const from = order.indexOf(fromId), to = order.indexOf(toId);
  if (from===-1||to===-1) return order;
  const next = [...order];
  next.splice(from,1);
  next.splice(from<to ? to-1 : to, 0, fromId);
  return next;
}

// Sidebar nav — a separate component so drag-hover state doesn't re-render the active tab's content.
// `mobileOpen`/`onNavigate` drive the below-`md` drawer behaviour. At `md:` and up the aside is a
// plain static column exactly as before — the drawer classes are all breakpoint-scoped, so desktop
// layout is untouched. Below `md` the 208px column would otherwise leave ~119px of usable content
// width on a 375px phone.
function SidebarNav({ tab, setTab, tabOrder, setTabOrder, issueCounts, hasSchedule, emResidentCount, offServiceCount, cloudEnabled, pendingRequestCount, mobileOpen, onNavigate, viewer }) {
  const [dragTabId, setDragTabId] = useState(null);
  const [dragOverTabId, setDragOverTabId] = useState(null);
  // The 'feedback' tab only ever renders when cloud sync is configured (it has nothing to
  // show otherwise — see the root's SUPABASE_ENABLED gate on FeedbackAdminTab).
  const orderedTabs = useMemo(
    () => reconcileTabOrder(tabOrder, TABS).filter(t => t.id !== 'feedback' || cloudEnabled),
    [tabOrder, cloudEnabled]
  );
  const clean = hasSchedule && issueCounts.errors === 0 && issueCounts.warns === 0;

  function resetDrag() { setDragTabId(null); setDragOverTabId(null); }

  return (
    <aside className={`w-52 shrink-0 bg-navy border-r border-white/10 flex flex-col py-2 overflow-y-auto no-print
      fixed inset-y-0 left-0 z-40 shadow-xl transition-transform duration-200
      md:static md:z-auto md:shadow-none md:translate-x-0
      ${mobileOpen ? 'translate-x-0 visible' : '-translate-x-full invisible md:visible'}`}>
      {viewer?.email && (
        <div className="md:hidden px-4 py-2 mb-1 border-b border-white/10">
          <p className="text-[11px] text-white/50 truncate" title={`Signed in as ${viewer.email}`}>Signed in as {viewer.email}</p>
        </div>
      )}
      <nav className="flex flex-col gap-0.5 px-2">
        {orderedTabs.map(t=>{
          const Icon=t.icon; const active=tab===t.id;
          const isValidation = t.id==='validation';
          const isRequests = t.id === 'requests';
          const dragOver = dragOverTabId===t.id && dragTabId!==t.id;
          const iconColor = active?'text-white':'text-white/50';
          return (
            <button key={t.id} onClick={()=>{setTab(t.id); onNavigate?.();}}
              aria-current={active ? 'page' : undefined}
              onDragOver={(e)=>{e.preventDefault(); setDragOverTabId(t.id);}}
              onDragLeave={(e)=>{if(e.currentTarget.contains(e.relatedTarget))return; setDragOverTabId(p=>p===t.id?null:p);}}
              onDrop={(e)=>{e.preventDefault(); setTabOrder(reorderIds(orderedTabs.map(x=>x.id), dragTabId, t.id)); resetDrag();}}
              className={`group w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors text-left ${active?'bg-primary text-white':'text-white/70 hover:bg-white/10 hover:text-white'} ${dragOver?'ring-2 ring-inset ring-primary':''}`}>
              <span draggable onDragStart={()=>setDragTabId(t.id)} onDragEnd={resetDrag} title="Drag to reorder"
                className="shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40">
                <GripVertical size={13} className="text-white/40"/>
              </span>
              <Icon size={15} className={`shrink-0 ${iconColor}`}/>
              <span className="flex-1">{t.label}</span>
              {t.global && <span title="Applies to all blocks"><Globe size={11} className="text-white/30 shrink-0"/></span>}
              {isValidation && (issueCounts.errors > 0 || issueCounts.warns > 0) && (
                <span className="flex items-center gap-1">
                  {issueCounts.errors > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums font-mono ${active?'bg-white/20 text-white':'bg-destructive text-destructive-foreground'}`}>
                      {issueCounts.errors}
                    </span>
                  )}
                  {issueCounts.warns > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums font-mono ${active?'bg-white/20 text-white':'bg-amber-400 text-black/80'}`}>
                      {issueCounts.warns}
                    </span>
                  )}
                </span>
              )}
              {isValidation && clean && (
                <CheckCircle size={13} className={active?'text-white':'text-green-400'}/>
              )}
              {isRequests && pendingRequestCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums font-mono ${active?'bg-white/20 text-white':'bg-amber-400 text-black/80'}`}>
                  {pendingRequestCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Legend */}
      <div className="mt-3 px-3 py-3 border-t border-white/10">
        <p className="font-display text-[10px] font-semibold text-white/50 uppercase tracking-wide mb-1.5">Legend</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SHIFT_AREAS.map(area => (
            <span key={area} className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${SHIFT_MAP[`${area}-D`].chip}`}>{area}</span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/50">
          <span className="px-1.5 py-0.5 rounded font-bold bg-white/15 text-yellow-300" title="Grand Rounds day (EM Home Wed / BAMC Thu)">GR</span>
          <span className="px-1.5 py-0.5 rounded font-bold bg-white/15 text-sky-300" title="Journal Club presenting">JC</span>
          <span className="px-1.5 py-0.5 rounded font-bold bg-white/15 text-violet-300">WW</span>
          <span className="px-1.5 py-0.5 rounded font-bold bg-white/15 text-orange-300">OFF</span>
          <span className="px-1.5 py-0.5 rounded font-bold bg-white/15 text-teal-300">VAC</span>
          <span className="px-1.5 py-0.5 rounded font-bold bg-white/15 text-purple-300">J</span>
        </div>
      </div>

      {/* Sidebar footer */}
      <div className="mt-auto px-3 py-3 border-t border-white/10">
        <div className="text-xs text-white/60 space-y-0.5">
          <p className="font-medium text-white/70">{emResidentCount} EM residents</p>
          <p>{offServiceCount} off-service this block</p>
          {issueCounts.errors > 0 && <p className="text-red-300 font-medium">{issueCounts.errors} error{issueCounts.errors!==1?'s':''}</p>}
          {issueCounts.warns > 0 && <p className="text-amber-300 font-medium">{issueCounts.warns} warning{issueCounts.warns!==1?'s':''}</p>}
        </div>
      </div>
    </aside>
  );
}

// Slim banner shown above the main content on block-scoped tabs (see BLOCK_SCOPED_TABS) — the
// chief can jump straight to EM Residents/Schedule/etc. from a deep link or leftover tab state
// without first passing through the Dashboard, so this is the one place block identity stays
// visible on every one of those tabs.
function BlockContextBar({ block, blockSaveState, onSave, onSwitch }) {
  return (
    <div className="bg-primary/5 border-b border-border px-5 py-1.5 flex items-center gap-3 text-xs no-print">
      <CalendarDays size={14} className="text-primary shrink-0"/>
      <span className="font-medium text-foreground truncate">Editing: {block.name || 'Untitled block'}</span>
      <span className="hidden sm:inline text-muted-foreground">
        {block.startDate && block.endDate ? `${prettyDate(block.startDate)} → ${prettyDate(block.endDate)}` : 'No dates set'} · {block.academicYear}
      </span>
      <SaveStatePill state={blockSaveState}/>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={onSave} disabled={blockSaveState==='saved'}>Save Block</Button>
        <Button variant="ghost" size="sm" onClick={onSwitch}>Switch block…</Button>
      </div>
    </div>
  );
}

function buildSnapData(block) {
  return { emBlockAssignments:block.emBlockAssignments||{}, offServiceResidents:block.offServiceResidents||[],
           schedule:block.schedule||{}, specialDays:block.specialDays||{}, conferences:block.conferences||{},
           generationReport:block.generationReport||null, overrideLog:block.overrideLog||[],
           startDate:block.startDate, endDate:block.endDate, name:block.name, academicYear:block.academicYear };
}

// ─── OVERRIDE CAPTURE (Phase 3) ─────────────────────────────────────────────
// Records every hand-edit made to a GENERATED schedule: which resident, which date, what the
// generator chose, what the chief changed it to. The purpose is not to change any schedule — it is
// to turn "the generator keeps doing something I don't like, but I can't articulate the rule" into
// a countable list. Nothing reads this to make scheduling decisions; it feeds a read-only card.
//
// Rides inside the block object, so it persists through the existing block save/load/backup/sync
// path with no new LS_BACKUP_KEYS entry and no syncBindings change — same convention as
// offServiceResidents (see CLAUDE.md "Data model & conventions").
const OVERRIDE_LOG_CAP = 500;

// Diffs two schedules and returns one event per changed cell. `from`/`to` are shift ids or null.
function diffScheduleCells(prevSchedule = {}, nextSchedule = {}) {
  const events = [];
  const residentIds = new Set([...Object.keys(prevSchedule), ...Object.keys(nextSchedule)]);
  for (const rid of residentIds) {
    const prevRow = prevSchedule[rid] || {};
    const nextRow = nextSchedule[rid] || {};
    for (const ds of new Set([...Object.keys(prevRow), ...Object.keys(nextRow)])) {
      const from = prevRow[ds] || null;
      const to = nextRow[ds] || null;
      if (from !== to) events.push({ residentId: rid, date: ds, from, to });
    }
  }
  return events;
}

// Returns `next` with any override events appended. Deliberately conservative about WHAT counts:
//   - Nothing is logged unless the PREVIOUS schedule came from a generation (prev.generationReport),
//     because an edit to a hand-built schedule isn't the generator being overridden.
//   - A generation itself is skipped. runGenerate/runPartialRegenerate route through the same
//     tracked updater and replace the whole schedule at once; without this guard the very act of
//     generating would log hundreds of "overrides" against its own output. The discriminator is the
//     report identity changing — a genuine hand-edit never touches generationReport.
export function withOverrideEvents(prev, next) {
  if (!prev?.generationReport) return next;
  if (next?.generationReport !== prev.generationReport) return next;
  const events = diffScheduleCells(prev.schedule, next.schedule);
  if (!events.length) return next;
  const at = new Date().toISOString();
  const stamped = events.map(e => ({ ...e, at, generatedAt: prev.generationReport.generatedAt || null }));
  const merged = [...(prev.overrideLog || []), ...stamped];
  return { ...next, overrideLog: merged.slice(-OVERRIDE_LOG_CAP) };
}

// Groups an override log into "the generator keeps making this choice and you keep undoing it".
// Pure, exported for tests. Sorted most-repeated first; ties broken by most recent.
export function summarizeOverrides(overrideLog = [], residentsById = {}) {
  const byKey = new Map();
  for (const e of overrideLog) {
    // Keyed by what the generator DID, not by the specific date — the point is to surface a repeated
    // pattern ("kept putting this resident on TRAUMA-N"), which a per-date key would never reveal.
    const key = `${e.residentId}|${e.from || 'none'}|${e.to || 'none'}`;
    const existing = byKey.get(key);
    if (existing) { existing.count++; existing.dates.push(e.date); if (e.at > existing.lastAt) existing.lastAt = e.at; }
    else byKey.set(key, { key, residentId: e.residentId, from: e.from, to: e.to, count: 1, dates: [e.date], lastAt: e.at });
  }
  const rows = [...byKey.values()].map(r => ({
    ...r,
    residentName: residentsById[r.residentId]
      ? `${residentsById[r.residentId].firstName || ''} ${residentsById[r.residentId].lastName || ''}`.trim()
      : 'Unknown resident',
  }));
  rows.sort((a, b) => (b.count - a.count) || String(b.lastAt).localeCompare(String(a.lastAt)));
  return rows;
}

// ─── PED-N -> PED-N-FM ASSIGNMENT MIGRATION ────────────────────────────────
// PED-N used to be one shift shared by FM-3 (23:00-08:00, Mon/Tue/Wed) and EM Home
// (19:00-04:00, Thu-Sun). It was split into two single-owner shift ids, and FM-3's own
// eligibility moved wholesale to the new PED-N-FM id (BASE_ELIGIBILITY.FM_3 = ['PED-N-FM'];
// PED_GUARD_LEGITIMATE_OWNER['PED-N'] no longer lists FM_3). Nothing rewrote already-assigned
// cells when that split landed — every FM-3 resident's existing PED-N cell, in the live block AND
// every saved blocksHistory snapshot, is now an assignment `validateAll` recomputes eligibility for
// and flags as a hard 'error' ("Shift not eligible for this resident on this day") with no
// indication why it suddenly broke. Those cells also now resolve through SHIFT_TIMING['PED-N']
// (19:00 start) instead of the FM shift's real 23:00 start, skewing rest-period math and
// countPublishedJC's history reads. generateScheduleBest ranks lexicographically on validateAll
// error count, so a kept stale cell injects a constant error floor into every one of its 20
// attempts. This is a one-shot mount migration (see PED_N_FM_MIGRATION_KEY below) that rewrites
// PED-N -> PED-N-FM for exactly the residents who could only ever have been assigned it as the
// FM-3 shift.
//
// Pure transform, exported for tests. `categoryForId(residentId)` resolves a resident's category
// from whatever roster the caller has on hand; a cell whose resident can't be resolved, or whose
// category isn't 'FM', is left untouched on purpose — an unmigrated PED-N cell then surfaces as a
// visible, actionable validateAll error, which beats silently guessing.
// Device-local one-shot marker, in the same res_*-key-read-directly spirit as WHATS_NEW_KEY /
// DEMO_MODE_KEY — deliberately NOT in LS_BACKUP_KEYS (it's "has this device already migrated its
// local data", not scheduling data itself).
const PED_N_FM_MIGRATION_KEY = 'res_pednfm_migrated';
export function migratePedNightAssignments(schedule, categoryForId) {
  if (!schedule || typeof schedule !== 'object') return schedule;
  let scheduleChanged = false;
  const nextSchedule = {};
  for (const [residentId, row] of Object.entries(schedule)) {
    if (!row || typeof row !== 'object') { nextSchedule[residentId] = row; continue; }
    if (categoryForId(residentId) !== 'FM') { nextSchedule[residentId] = row; continue; }
    let rowChanged = false;
    const nextRow = {};
    for (const [ds, sid] of Object.entries(row)) {
      if (sid === 'PED-N') { nextRow[ds] = 'PED-N-FM'; rowChanged = true; }
      else nextRow[ds] = sid;
    }
    if (rowChanged) { nextSchedule[residentId] = nextRow; scheduleChanged = true; }
    else nextSchedule[residentId] = row;
  }
  return scheduleChanged ? nextSchedule : schedule;
}

// `viewer` ({email, userId, role}) is supplied by AppGate, which has already resolved the session
// and profile. Optional on purpose: the unconfigured-dev-build path renders this component with no
// session at all, and the header simply omits the identity chip in that case.
export default function ResidentScheduler({ viewer } = {}) {
  const [tab, setTab] = useState('dashboard');
  // Defensive fallback: the Home tab was removed and merged into Dashboard. `tab` itself isn't
  // persisted today, but guard anyway in case a future change (deep link, restored session, etc.)
  // ever hands this a stale 'home' value.
  useEffect(() => { if (tab === 'home') setTab('dashboard'); }, [tab]);
  const [navOpen, setNavOpen] = useState(false); // below-md sidebar drawer; ignored at md+
  const [toast, setToast] = useState(null);
  const [switchPending, setSwitchPending] = useState(null);
  const [exportConfirm, setExportConfirm] = useState(null); // 'grid' | 'qgenda' | 'pdf-matrix' | 'pdf-resident' | null — pending export awaiting error confirmation
  // Sidecar state for a pending QGenda export: which variant was picked, and which shift ids (if
  // any) had no confirmed QGenda task and fell back to their on-screen label. exportConfirm itself
  // stays a plain 'qgenda' string (never 'qgenda-minimal'/'qgenda-withTimes') on purpose — the two
  // demo-mode guards below key off `kind==='qgenda'` by equality, and a second kind string per
  // variant would silently stop being caught by them.
  const [exportVariant, setExportVariant] = useState(null);
  const [exportUnmapped, setExportUnmapped] = useState([]);
  const [pdfPicker, setPdfPicker] = useState(false);
  const [qgendaPicker, setQgendaPicker] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // ─── DEMO SANDBOX ─────────────────────────────────────────────────────────
  // A disposable copy of the whole workspace an admin can experiment in without risking the real
  // schedule (see em-scheduler's own "Demo Sandbox" for the pattern this mirrors). Isolation is by
  // PHYSICAL localStorage key (res_* vs res_demo_*) plus a second Supabase row (RES_STATE_DEMO_ROW_ID).
  // The real res_* keys and the 'main' cloud row are reachable only through rowId's default param
  // and the mount-load/debounced-save effects' own demoMode ternary — a discipline each call site
  // must honor, not a structural impossibility.
  //
  // demoMode is read once per mount (useLocalStorage's lazy initializer only reads localStorage on
  // first mount) — every enter/exit/resume/delete function below sets DEMO_MODE_KEY then calls
  // window.location.reload(), the same "commit then reload" discipline SettingsTab's
  // importData/clearAll already use, so a clean remount is what actually swaps which physical keys
  // the nine hooks below resolve to.
  const demoMode = useMemo(() => {
    try { return localStorage.getItem(DEMO_MODE_KEY) === 'true'; } catch { return false; }
  }, []);
  // Maps a base res_* key to its physical storage key for the current mode. res_dark_mode is
  // deliberately never passed through this — it's a device preference shared between real and demo.
  const physKey = k => demoMode ? k.replace(/^res_/, 'res_demo_') : k;

  const [emRoster, setEmRoster]           = useLocalStorage(physKey('res_em_roster'), []);
  const [eligOverrides, setEligOverrides] = useLocalStorage(physKey('res_eligibility_overrides'), {});
  const [blocksHistory, setBlocksHistory] = useLocalStorage(physKey('res_blocks_history'), []);
  const [block, setBlock]                 = useLocalStorage(physKey('res_current_block'), makeDefaultBlock());
  // AY-level data: conference & ITE dates keyed by academic year string
  const [ayData, setAyData]               = useLocalStorage(physKey('res_ay_data'), {});
  // App-level settings: rule enforcement, targets, defaults
  const [appSettings, setAppSettings]     = useLocalStorage(physKey('res_app_settings'), DEFAULT_APP_SETTINGS);
  // Chief-editable day-of-week / block-type scheduling rules (see DEFAULT_DAY_RULES)
  const [dayRules, setDayRules]           = useLocalStorage(physKey('res_day_rules'), {});
  const [coverage, setCoverage]           = useLocalStorage(physKey('res_coverage'), {});
  const [tabOrder, setTabOrder]           = useLocalStorage(physKey('res_tab_order'), TABS.map(t=>t.id));
  // Device/viewer display preference — see the LS_BACKUP_KEYS comment for why this is excluded.
  const [darkMode, setDarkMode]           = useLocalStorage('res_dark_mode', false);

  // Cross-device cloud sync (see the SUPABASE SYNC section). dbStatus/dbError feed
  // AutosaveIndicator's cloud states. dbReady gates the debounced cloud-save effect so it never
  // writes before the mount-time load-and-overlay has decided what the cloud already holds.
  const [dbReady, setDbReady] = useState(false);
  const [dbStatus, setDbStatus] = useState('idle'); // 'idle' | 'loading' | 'saving' | 'error'
  const [dbError, setDbError] = useState(null);
  const saveTimerRef = useRef(null);
  // The in-flight sbSaveState promise once the debounce timer has fired (null before/after). Lets
  // flushPendingCloudSave rescue a save that's already mid-network-call, not just one still waiting
  // on the timer — a fired-but-unresolved save is otherwise invisible to the flush and gets aborted
  // by a demo-transition reload right underneath it.
  const savePromiseRef = useRef(null);

  // Pending resident day-off requests, for the Schedule-grid marker + sidebar badge. Gated on the
  // admin having an active Supabase auth session (RLS blocks the anonymous select otherwise) — no
  // session means this silently resolves to an empty list rather than erroring.
  const [pendingRequests, setPendingRequests] = useState([]); // [{resident_id, dates}], admin-session-gated

  // Exposed (not just effect-local) so Task 10's approve/deny can call it directly after a
  // decision — without this, the sidebar badge and grid marker would only refresh on the next
  // mount/auth-state-change, staying visibly stale immediately after the admin acts.
  //
  // Gated on role === 'admin', not just "has a session": RLS's requests_select_own policy means a
  // signed-in resident's own session can also successfully select from day_off_requests — scoped
  // to just their own rows. Without the role check, a resident who'd ever signed into /requests in
  // the same browser would see this admin-only badge/marker showing their own pending-request
  // count, mislabeled as the admin's queue.
  const refreshPendingRequests = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setPendingRequests([]); return; }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    if (profile?.role !== ROLE.ADMIN) { setPendingRequests([]); return; }
    const { data } = await supabase.from('day_off_requests').select('resident_id, dates').eq('status', 'pending');
    setPendingRequests(data || []);
  }, []);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    refreshPendingRequests();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refreshPendingRequests());
    return () => sub.subscription.unsubscribe();
  }, [refreshPendingRequests]);

  const pendingByResident = useMemo(() => {
    const m = new Map();
    for (const req of pendingRequests) {
      if (!m.has(req.resident_id)) m.set(req.resident_id, new Set());
      req.dates.forEach(d => m.get(req.resident_id).add(d));
    }
    return m;
  }, [pendingRequests]);

  // Same {id,name,startDate,endDate} shape blockLookup.js's fetchBlocksForLookup produces for the
  // resident-facing app — this is the chief-side equivalent, read directly from local state instead
  // of a res_state fetch, since RequestsTab already renders inside this component tree. Lets
  // RequestsTab's ApprovalQueue group pending requests by scheduling block (design spec: "List of
  // pending requests grouped by resident/block").
  const requestBlocks = useMemo(() => {
    const all = [...blocksHistory, block];
    return all
      .filter(b => b && b.startDate && b.endDate)
      .map(b => ({ id: b.id, name: b.name || b.startDate, startDate: b.startDate, endDate: b.endDate }));
  }, [blocksHistory, block]);
  // The nine synced values that the cloud row is currently known to hold (by reference). null
  // until the first sync decision: `null` means "push local up" (empty cloud → seed it), a value
  // array means "already matches the cloud" (just loaded it → don't re-upload). Updated after
  // every successful save. Single source of the key list is LS_BACKUP_KEYS via `syncBindings`.
  const cloudBaselineRef = useRef(null);

  // One place mapping each synced key → [current value, setter]. The cloud payload, the overlay,
  // and the baseline snapshot all derive from LS_BACKUP_KEYS through this — so a new res_* key
  // added to LS_BACKUP_KEYS (per CLAUDE.md) flows through sync automatically; forgetting to wire
  // it here throws an obvious error rather than silently not syncing.
  const syncBindings = {
    res_em_roster:             [emRoster, setEmRoster],
    res_current_block:         [block, setBlock],
    res_blocks_history:        [blocksHistory, setBlocksHistory],
    res_eligibility_overrides: [eligOverrides, setEligOverrides],
    res_ay_data:               [ayData, setAyData],
    res_app_settings:          [appSettings, setAppSettings],
    res_day_rules:             [dayRules, setDayRules],
    res_coverage:              [coverage, setCoverage],
    res_tab_order:             [tabOrder, setTabOrder],
  };

  // On mount: each useLocalStorage's lazy initializer has already loaded its localStorage value
  // synchronously (instant, no network) before this runs. If cloud sync is configured, overlay
  // with the cloud copy — it may be newer (e.g. edited on another device). Each key is applied
  // individually (skipping null/undefined) so a cloud row saved by an older app version, missing
  // (or explicitly nulling) a key, never wipes a newer local field back to its default or to null.
  useEffect(() => {
    if (!SUPABASE_ENABLED) { setDbReady(true); return; }
    setDbStatus('loading');
    sbLoadState(demoMode ? RES_STATE_DEMO_ROW_ID : undefined).then(row => {
      if (row && row.data) {
        const d = row.data;
        LS_BACKUP_KEYS.forEach(k => { if (d[k] != null) syncBindings[k][1](d[k]); });
        // Baseline = the document now in sync with the cloud (applied value where present, else
        // the local value we left untouched) — so the save effect below won't re-upload what we
        // just downloaded on every page open.
        cloudBaselineRef.current = LS_BACKUP_KEYS.map(k => (d[k] != null ? d[k] : syncBindings[k][0]));
      }
      // row == null (empty cloud): leave cloudBaselineRef null so the save effect seeds the cloud
      // once with this device's existing local data.
      setDbReady(true); setDbStatus('idle');
    }).catch(e => {
      // Load failed → do NOT set dbReady. Leaving it false keeps the debounced save disabled, so
      // this device can't overwrite the cloud with local state it never successfully read/merged
      // (that would silently destroy another device's newer data). Local editing still works;
      // the pill shows "Sync error"; a reload retries the load cleanly.
      setDbError(e.message); setDbStatus('error');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Honest local-only autosave indicator: useLocalStorage already persists synchronously on
  // every state change, this just gives the chief a brief visual confirmation it happened.
  const [saveState, setSaveState] = useState('saved'); // 'saved' | 'saving'
  // Compares actual dependency VALUES against what was last recorded, rather than a simple
  // "have I mounted yet" boolean — a boolean guard whose cleanup resets it looks StrictMode-safe
  // but isn't: React runs that same cleanup before every later re-invocation too (not just
  // StrictMode's synthetic remount), so it would silently disable "Saving…" for every real edit
  // after the first. React's own dependency-change detection already works by reference
  // inequality (Object.is per dependency), and every setter in this file replaces state with a
  // new object/array reference on a genuine change — so comparing recorded-vs-current references
  // distinguishes "StrictMode replaying the identical render" (nothing changed, deps arrive
  // byte-for-byte the same as what was just recorded) from a real subsequent edit, with no
  // cleanup-timing ambiguity at all.
  const prevSaveDepsRef = useRef(null);
  useEffect(() => {
    const deps = [emRoster, eligOverrides, blocksHistory, block, ayData, appSettings, dayRules, coverage, tabOrder];
    const changed = prevSaveDepsRef.current !== null && deps.some((d, i) => d !== prevSaveDepsRef.current[i]);
    prevSaveDepsRef.current = deps;
    if (!changed) return;
    setSaveState('saving');
    const t = setTimeout(() => setSaveState('saved'), 600);
    return () => clearTimeout(t);
  }, [emRoster, eligOverrides, blocksHistory, block, ayData, appSettings, dayRules, coverage, tabOrder]);

  // Debounced cloud sync — a SEPARATE effect from the pill-timer one above, not folded together:
  // that effect's prevSaveDepsRef reference-diffing dodges a StrictMode hazard around a boolean
  // skip-guard (see its comment); this is a plain setTimeout/clearTimeout debounce keyed off the
  // dependency array, inherently StrictMode-safe. The 1.5s network debounce is also a different
  // concern from the 600ms UI-pill timer. Guarded against re-uploading the just-loaded document:
  // it only writes when the current values differ from cloudBaselineRef (what the cloud already
  // holds), so the dbReady false→true flip on mount doesn't trigger a redundant save.
  // Shared by the debounced timeout below AND flushPendingCloudSave — a single copy of the
  // baseline-check/payload-build/upload/baseline-update sequence, so the two call sites can't drift
  // on what "save the cloud row" means. Never throws: a failed upload is recorded via
  // dbStatus/dbError (the pill goes "Sync error") rather than surfaced to the caller, since both
  // callers treat a save as best-effort.
  async function saveCloudNow() {
    const current = LS_BACKUP_KEYS.map(k => syncBindings[k][0]);
    const base = cloudBaselineRef.current;
    if (base && current.every((v, i) => v === base[i])) return; // already matches the cloud row
    setDbStatus('saving');
    const payload = {};
    LS_BACKUP_KEYS.forEach(k => { payload[k] = syncBindings[k][0]; });
    try {
      await sbSaveState(payload, demoMode ? RES_STATE_DEMO_ROW_ID : undefined);
      cloudBaselineRef.current = current;
      setDbStatus('idle');
    } catch (e) {
      setDbError(e.message); setDbStatus('error');
    }
  }

  useEffect(() => {
    if (!dbReady || !SUPABASE_ENABLED) return;
    const current = LS_BACKUP_KEYS.map(k => syncBindings[k][0]);
    const base = cloudBaselineRef.current;
    if (base && current.every((v, i) => v === base[i])) return; // already matches the cloud row
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      if (syncSuspended) return; // import/clear owns the row right now — don't race them
      savePromiseRef.current = saveCloudNow().finally(() => { savePromiseRef.current = null; });
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emRoster, eligOverrides, blocksHistory, block, ayData, appSettings, dayRules, coverage, tabOrder, dbReady]);

  // Demo Sandbox entry/exit — see the DEMO SANDBOX comment above the useLocalStorage block for the
  // isolation design. Every action here ends in window.location.reload(): demoMode is only ever
  // decided once per mount, so flipping DEMO_MODE_KEY needs a real remount to take effect.
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  // Read once on mount (not live state) — same reason demoMode is: the answer can't change while
  // the app is open, and re-reading storage on every render would be pointless work.
  const [whatsNew, setWhatsNew] = useState(() => unseenChangelog());
  const dismissWhatsNew = () => {
    try { localStorage.setItem(WHATS_NEW_KEY, CHANGELOG[0]?.id || ''); } catch { /* storage blocked — just close */ }
    setWhatsNew([]);
  };
  const [demoExisting, setDemoExisting] = useState(false); // does a resumable demo already exist?
  const [demoCheckPending, setDemoCheckPending] = useState(true); // still checking local/cloud for an existing demo?
  const [demoCheckError, setDemoCheckError] = useState(false); // couldn't confirm either way — don't guess
  const [demoBusy, setDemoBusy] = useState(false);
  const demoPhysKey = k => k.replace(/^res_/, 'res_demo_');
  // Bumped on every openDemoModal() call; a slow/stale cloud probe checks this before writing
  // state so a reopened modal's fresh result can't be clobbered by an earlier, still-in-flight
  // probe resolving/rejecting later (e.g. open, close, reopen — first sbLoadState finally lands).
  const demoCheckGenRef = useRef(0);

  // Flushes a pending or in-flight debounced cloud-save before a demo transition reloads the page.
  // Without this, an edit made shortly before clicking a demo button never gets uploaded — the
  // mount-time load then overlays the stale cloud row over the newer local state, silently losing
  // the edit (and cloudBaselineRef ends up matching, so nothing ever re-uploads it later). Two
  // cases, handled separately: a timer still WAITING (saveTimerRef set, savePromiseRef not yet
  // created) is fired immediately instead of waiting out the debounce; a save already IN FLIGHT
  // (savePromiseRef set — the timer fired and the network call is mid-flight, up to 15s) is
  // awaited rather than abandoned, since the reload would otherwise race and abort it underneath
  // the caller. Never throws — saveCloudNow itself is best-effort, so every caller can just
  // `await flushPendingCloudSave()` and proceed regardless of outcome.
  async function flushPendingCloudSave() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (SUPABASE_ENABLED && dbReady && !syncSuspended) {
        savePromiseRef.current = saveCloudNow().finally(() => { savePromiseRef.current = null; });
      }
    }
    if (savePromiseRef.current) await savePromiseRef.current;
  }

  async function openDemoModal() {
    const gen = ++demoCheckGenRef.current;
    setDemoModalOpen(true);
    setDemoCheckPending(true);
    setDemoCheckError(false);
    if (LS_BACKUP_KEYS.some(k => localStorage.getItem(demoPhysKey(k)) != null)) { setDemoExisting(true); setDemoCheckPending(false); return; }
    if (!SUPABASE_ENABLED) { setDemoExisting(false); setDemoCheckPending(false); return; }
    try {
      const row = await sbLoadState(RES_STATE_DEMO_ROW_ID);
      if (gen !== demoCheckGenRef.current) return; // superseded by a later openDemoModal() call
      setDemoExisting(!!(row && row.data));
    } catch {
      // Unknown, not "no demo" and not "a demo exists" — either guess is wrong in a different way
      // (offering a phantom Resume vs silently enabling an overwrite of a demo we never confirmed
      // is absent). Force the admin to retry rather than acting on an unconfirmed guess.
      if (gen !== demoCheckGenRef.current) return;
      setDemoCheckError(true);
    } finally {
      if (gen === demoCheckGenRef.current) setDemoCheckPending(false);
    }
  }

  // Copies the real, currently-live data into the res_demo_* keys (and the cloud demo row, if
  // configured) so the sandbox starts as a full working copy — not a blank slate.
  async function enterDemoFresh() {
    setDemoBusy(true);
    try {
      await flushPendingCloudSave();
      // Cloud-first discipline (same as SettingsTab.importData/clearAll): a device that hasn't
      // confirmed what the cloud holds must not push to it — abort instead of silently degrading
      // to a local-only demo that a later reload could overwrite with a stale cloud row.
      if (SUPABASE_ENABLED && !dbReady) {
        setDemoBusy(false);
        showToast('Cloud sync is not ready — reload and try again.', 'red');
        return;
      }
      const doc = {};
      for (const k of LS_BACKUP_KEYS) doc[k] = syncBindings[k][0];
      if (SUPABASE_ENABLED) await sbSaveState(doc, RES_STATE_DEMO_ROW_ID);
      for (const k of LS_BACKUP_KEYS) localStorage.setItem(demoPhysKey(k), JSON.stringify(doc[k]));
      localStorage.setItem(DEMO_MODE_KEY, 'true');
      window.location.reload();
    } catch {
      setDemoBusy(false);
      showToast('Could not start the demo — try again.', 'red');
    }
  }

  // flushPendingCloudSave never throws, and nothing else here can fail — so, unlike
  // enterDemoFresh/deleteDemo below (which have real network ops of their own to guard), these two
  // stay unconditional: entering/exiting the sandbox can never get stuck behind a toast.
  async function enterDemoResume() {
    setDemoBusy(true);
    await flushPendingCloudSave();
    localStorage.setItem(DEMO_MODE_KEY, 'true');
    window.location.reload();
  }

  async function exitDemo() {
    setDemoBusy(true);
    await flushPendingCloudSave();
    localStorage.setItem(DEMO_MODE_KEY, 'false');
    window.location.reload();
  }

  // Wipes the demo keys/row only — the real res_* keys and 'main' cloud row are never touched by
  // this path, since it only ever addresses demoPhysKey()'d keys and RES_STATE_DEMO_ROW_ID.
  async function deleteDemo() {
    setDemoBusy(true);
    try {
      // Rescues any save still pending or already in flight BEFORE syncSuspended goes up — this is
      // what actually closes the resurrection race below, not the belt-and-suspenders double
      // delete: once this resolves, no debounced upsert for the demo row can still be outstanding.
      await flushPendingCloudSave();
      syncSuspended = true;
      if (SUPABASE_ENABLED) {
        await sbDeleteState(RES_STATE_DEMO_ROW_ID);
        // Defense in depth: a debounced auto-save fetch that fired before syncSuspended went up
        // (and before flushPendingCloudSave started watching it — e.g. one queued between the flush
        // and the line above) could in principle still land and resurrect the row; delete again.
        await sbDeleteState(RES_STATE_DEMO_ROW_ID);
      }
      // Local demo keys are removed only after BOTH cloud deletes have succeeded — if either
      // throws, the catch below is honest: local demo data is still intact, nothing was lost.
      for (const k of LS_BACKUP_KEYS) localStorage.removeItem(demoPhysKey(k));
      localStorage.setItem(DEMO_MODE_KEY, 'false');
      window.location.reload();
    } catch {
      syncSuspended = false;
      setDemoBusy(false);
      showToast('Could not delete the cloud demo — try again.', 'red');
    }
  }

  // One-time prune: a saved override that's a no-op copy of a since-corrected default (see
  // LEGACY_DAY_RULE_DEFAULTS/LEGACY_ELIGIBILITY_DEFAULTS) would otherwise mask the new default
  // forever, since overrides replace a key's default wholesale. Genuinely customized overrides
  // are left alone — they're flagged for review on the Rules tab instead (DAY_RULE_DEFAULTS_CHANGED).
  useEffect(() => {
    setDayRules(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [key, legacyList] of Object.entries(LEGACY_DAY_RULE_DEFAULTS)) {
        if (key in next && legacyList.some(legacy => deepEqualNormalized(next[key], legacy))) { delete next[key]; changed = true; }
      }
      return changed ? next : prev;
    });
    setEligOverrides(prev => {
      let changed = false;
      const next = { ...prev };
      // (1) Prune, exactly as before. Only legacy ARRAY-shaped values can deep-equal a recorded
      // snapshot, so this has to run BEFORE the conversion below — converting first would turn an
      // "equals the old default" override into a diff that deliberately pins the old behavior.
      for (const [key, legacyList] of Object.entries(LEGACY_ELIGIBILITY_DEFAULTS)) {
        if (key in next && legacyList.some(legacy => deepEqualNormalized(next[key], legacy))) { delete next[key]; changed = true; }
      }
      // (2) One-time migration: rewrite any surviving snapshot into a diff. Category keys first, so
      // a rotation key's base (its parent's effective list) is already converted when we reach it.
      // normalizeEligibilityOverride applies the 12h backfill before diffing, so a pre-12h snapshot
      // does NOT migrate into "the chief removed all eight 12h shifts". A diff that comes out empty
      // means the override matched the default anyway — drop it.
      for (const key of Object.keys(next).sort((a, b) => (a.includes('__') ? 1 : 0) - (b.includes('__') ? 1 : 0))) {
        if (!Array.isArray(next[key])) continue;
        const diff = normalizeEligibilityOverride(next[key], eligBaseFor(key, next));
        if (isEligibilityDiffEmpty(diff)) delete next[key]; else next[key] = diff;
        changed = true;
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time mount migration: rewrite stale PED-N assignments belonging to FM-3 residents to the
  // new PED-N-FM id (see migratePedNightAssignments above for why this exists). Gated on a stored
  // marker so a re-run can never touch a cell the chief has since deliberately set to PED-N — the
  // marker is set even when zero cells needed changing, so this only ever runs once per device.
  useEffect(() => {
    // MUST run after the mount-time cloud overlay has applied, hence the dbReady gate rather than
    // a bare []. The overlay resolves in a promise callback, so a []-deps effect body runs FIRST,
    // against the pre-overlay localStorage copy; it would migrate that, write its one-shot marker,
    // and then be overwritten wholesale by the cloud row's still-unmigrated res_current_block /
    // res_blocks_history — permanently, because the marker stops it ever running again. dbReady is
    // set synchronously when cloud sync isn't configured, so a local-only install just runs this
    // one render later. A cloud load that FAILED leaves dbReady false forever by design: no
    // migration and no marker, so a later reload retries it cleanly against real data. Running
    // after the overlay also means the rewritten values differ from cloudBaselineRef, so the
    // debounced save heals the shared cloud row too instead of only this device.
    if (!dbReady) return;
    let alreadyRan = false;
    try { alreadyRan = localStorage.getItem(PED_N_FM_MIGRATION_KEY) === 'true'; } catch { /* storage blocked */ }
    if (alreadyRan) return;

    // emRoster never contains FM residents (FM is a non-persistent, off-service-only category —
    // see CATEGORIES in lib/parse.js), so this is really only a fallback for persistent categories;
    // the real lookup for every PED-N-relevant resident is each block/snapshot's OWN
    // offServiceResidents list, since that roster is per-block, not global.
    const rosterCategoryById = new Map(emRoster.map(r => [r.id, r.category]));
    function categoryForIdIn(offServiceResidents) {
      const offById = new Map(
        (Array.isArray(offServiceResidents) ? offServiceResidents : []).map(r => [r.id, r.category])
      );
      return residentId => offById.get(residentId) ?? rosterCategoryById.get(residentId);
    }

    setBlock(prev => {
      if (!prev || typeof prev !== 'object') return prev;
      const nextSchedule = migratePedNightAssignments(prev.schedule, categoryForIdIn(prev.offServiceResidents));
      return nextSchedule === prev.schedule ? prev : { ...prev, schedule: nextSchedule };
    });

    setBlocksHistory(prev => {
      if (!Array.isArray(prev)) return prev;
      let changed = false;
      const next = prev.map(snap => {
        if (!snap || typeof snap !== 'object' || !snap.data || typeof snap.data !== 'object') return snap;
        const nextSchedule = migratePedNightAssignments(snap.data.schedule, categoryForIdIn(snap.data.offServiceResidents));
        if (nextSchedule === snap.data.schedule) return snap;
        changed = true;
        return { ...snap, data: { ...snap.data, schedule: nextSchedule } };
      });
      return changed ? next : prev;
    });

    try { localStorage.setItem(PED_N_FM_MIGRATION_KEY, 'true'); } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady]);

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
      // Buy-down seam: denormalizes onto the runtime resident object exactly like blockType/
      // isChief above, so every getShiftTarget call site (generator, buildQualityInput,
      // validateAll, grid/card display) picks it up with no signature change. targetDelta is left
      // as-is (undefined when absent) — getShiftTarget's own Number.isFinite guard handles that.
      targetDelta: block.emBlockAssignments?.[r.id]?.targetDelta,
      targetNote: block.emBlockAssignments?.[r.id]?.targetNote,
      targetIsBuyDown: !!(block.emBlockAssignments?.[r.id]?.targetIsBuyDown),
    }));
    return [...em,...(block.offServiceResidents||[])];
  },[emRoster,block.emBlockAssignments,block.offServiceResidents]);

  const schedulableCount = useMemo(()=>allResidents.filter(isSchedulable).length,[allResidents]);

  // Single validateAll pass shared by the sidebar badge, pendingErrorCount, and the Dashboard
  // stat tiles — running it once per relevant state change instead of once per consumer.
  const issues = useMemo(()=>validateAll(allResidents,block.schedule||{},block,eligOverrides,appSettings,dayRules,coverage,blocksHistory,currentAyConf),[allResidents,block,eligOverrides,appSettings,dayRules,coverage,blocksHistory,currentAyConf]);
  const issueCounts = useMemo(()=>({
    errors: issues.filter(i=>i.level==='error').length,
    warns: issues.filter(i=>i.level!=='error').length,
    // Soft-rule warnings flagged blocksExport in SOFT_RULES (currently just postNightRest) are
    // still safety-relevant enough that exporting the schedule (CSV/QGenda/PDF) should gate on
    // them same as a hard error — see requestExport below.
    restWarns: issues.filter(i=>EXPORT_BLOCKING_RULE_IDS.has(i.rule)).length,
  }),[issues]);
  const hasSchedule = useMemo(()=>Object.values(block.schedule||{}).some(rs=>Object.values(rs||{}).some(Boolean)),[block.schedule]);
  const matchingSnap = useMemo(() => blocksHistory.find(b => b.id === block.id), [blocksHistory, block.id]);
  // Derived, not stored — so any code path that changes block/blocksHistory (including raw
  // setBlock/setBlocksHistory callers like the cloud-sync mount overlay and Master Matrix
  // re-import, which bypass updateBlock) recomputes the pill correctly instead of desyncing.
  const blockSaveState = useMemo(() => {
    if (!matchingSnap) return 'never';
    return deepEqualNormalized(buildSnapData(block), matchingSnap.data) ? 'saved' : 'dirty';
  }, [block, matchingSnap]);

  function updateBlock(fn) { setBlock(p=>typeof fn==='function'?fn(p):{...p,...fn}); }

  // ─── Schedule undo/redo ──────────────────────────────────────────────────
  // In-memory only (NOT persisted, NOT part of LS_BACKUP_KEYS) — a session-scoped safety net for
  // grid edits, not scheduling data. Each stack entry is a `{schedule, lockedCells}` reference
  // pair: since both are always replaced wholesale via spread (never mutated in place) by every
  // mutator below, keeping the old references around is enough to restore them later at zero copy
  // cost. A lock/unlock toggle only changes `lockedCells`, not `schedule` — the pair is required or
  // undo would silently no-op on lock toggles while still consuming a stack slot.
  const UNDO_CAP = 30;
  const [undoStack, setUndoStack] = useState([]); // oldest first
  const [redoStack, setRedoStack] = useState([]);

  // Every schedule-mutating call site (assign, drag-drop, generate/regenerate, cell lock toggle)
  // calls this instead of the bare updateBlock above, so the action becomes undoable. Non-schedule
  // updateBlock calls (block name/dates, etc.) stay on the untracked one.
  function updateBlockTracked(fn) {
    setUndoStack(s => {
      const next = [...s, { schedule: block.schedule, lockedCells: block.lockedCells }];
      return next.length > UNDO_CAP ? next.slice(next.length - UNDO_CAP) : next;
    });
    setRedoStack([]);
    // Override capture (Phase 3) wraps the update rather than sitting at each call site: this is
    // the one choke point every schedule mutation already routes through, so a future mutator gets
    // logged automatically instead of being silently missed. The diff runs against `prev` inside
    // the updater — not the `block` closure — so it always sees the authoritative previous state.
    setBlock(prev => {
      const next = typeof fn === 'function' ? fn(prev) : { ...prev, ...fn };
      return withOverrideEvents(prev, next);
    });
  }

  function undoSchedule() {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, { schedule: block.schedule, lockedCells: block.lockedCells }]);
    setUndoStack(s => s.slice(0, -1));
    setBlock(b => ({ ...b, schedule: prev.schedule, lockedCells: prev.lockedCells }));
  }

  function redoSchedule() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(s => {
      const n = [...s, { schedule: block.schedule, lockedCells: block.lockedCells }];
      return n.length > UNDO_CAP ? n.slice(n.length - UNDO_CAP) : n;
    });
    setRedoStack(r => r.slice(0, -1));
    setBlock(b => ({ ...b, schedule: next.schedule, lockedCells: next.lockedCells }));
  }

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo. Skipped while a text input/textarea has
  // focus, so it doesn't hijack normal in-field text-editing undo elsewhere in the app.
  useEffect(() => {
    function onKeyDown(e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoSchedule(); }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redoSchedule(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoStack, redoStack, block]);

  function saveBlock() {
    const shiftCount=Object.values(block.schedule||{}).reduce((s,d)=>s+Object.values(d).filter(Boolean).length,0);
    // A saved snapshot replaces its predecessor wholesale — preserve any existing "published"
    // flag from that predecessor here, or re-saving a published block would silently unpublish it.
    const published = blocksHistory.find(b=>b.id===block.id)?.published ?? false;
    const snap={ id:block.id, name:block.name||'Unnamed Block', academicYear:block.academicYear||getAcademicYear(),
      startDate:block.startDate, endDate:block.endDate, savedAt:new Date().toISOString(), published,
      residentCount:emRoster.length+(block.offServiceResidents||[]).length, shiftCount,
      data: buildSnapData(block) };
    setBlocksHistory(p=>[snap,...p.filter(b=>b.id!==snap.id)].slice(0, appSettings.maxSavedBlocks ?? 24));
    showToast(`"${snap.name}" saved`,'green');
  }
  function toggleBlockPublished(id) {
    setBlocksHistory(p=>p.map(b=>b.id===id ? {...b, published: !b.published} : b));
  }

  function deleteBlockSnapshot(id) {
    if (SUPABASE_ENABLED && !dbReady) {
      showToast('Cloud sync is in an error state — reload to retry before deleting','red');
      return;
    }
    setBlocksHistory(p=>p.filter(b=>b.id!==id));
    showToast('Saved block deleted','amber');
  }

  function deleteCurrentBlock() {
    if (SUPABASE_ENABLED && !dbReady) {
      showToast('Cloud sync is in an error state — reload to retry before deleting','red');
      return;
    }
    setBlocksHistory(p=>p.filter(b=>b.id!==block.id));
    setBlock(makeDefaultBlock());
    showToast('Block deleted','amber');
  }

  function loadBlock(snap) {
    const hasCurrent=block.startDate||(block.offServiceResidents||[]).length>0||Object.keys(block.schedule||{}).length>0;
    const needsGuard = blockSaveState === 'dirty' || (blockSaveState === 'never' && hasCurrent);
    needsGuard ? setSwitchPending(snap) : doLoadBlock(snap);
  }

  function doLoadBlock(snap) {
    const d=snap.data||{};
    setBlock({ id:snap.id, name:snap.name||d.name||'', academicYear:snap.academicYear||d.academicYear||getAcademicYear(),
      startDate:snap.startDate||d.startDate||'', endDate:snap.endDate||d.endDate||'',
      emBlockAssignments:d.emBlockAssignments||{}, offServiceResidents:d.offServiceResidents||[],
      schedule:d.schedule||{}, specialDays:d.specialDays||{codeBlueDays:[],advocacyDays:[],procDays:[],anesDays:[]},
      conferences:d.conferences||{}, generationReport:d.generationReport||null,
      // Untrusted shape (old snapshot, hand-edited storage, foreign backup) — guard with
      // Array.isArray rather than `|| []`, matching reconcileTabOrder's convention.
      overrideLog: Array.isArray(d.overrideLog) ? d.overrideLog : [] });
    setSwitchPending(null); setTab('schedule');
    showToast(`Loaded "${snap.name}"`,'green');
  }

  function newBlock() {
    const hasCurrent=block.startDate||(block.offServiceResidents||[]).length>0;
    const needsGuard = blockSaveState === 'dirty' || (blockSaveState === 'never' && hasCurrent);
    needsGuard ? setSwitchPending('__new__') : doNewBlock();
  }

  function doNewBlock() {
    setBlock(makeDefaultBlock()); setSwitchPending(null); setTab('dashboard');
    showToast('New block ready — enter dates below','amber');
  }

  function blockReset() {
    updateBlock(b=>({...makeDefaultBlock(),id:b.id,name:b.name,academicYear:b.academicYear,startDate:b.startDate,endDate:b.endDate,emBlockAssignments:{}}));
    showToast('Block reset','amber');
  }

  // quoteMode 'always' force-quotes every cell (grid CSV — humans eyeballing it in Excel);
  // 'minimal' quotes only when the raw value would otherwise corrupt the row (contains a comma,
  // double-quote, CR/LF, or leading/trailing whitespace) — some machine importers (QGenda
  // included, unconfirmed either way since there's no admin access to trial it) reject a quoted
  // plain value like `"7/6/2026"` where they expect `7/6/2026`. Embedded `"` is always escaped as
  // `""` regardless of mode. CRLF line endings + a trailing terminator per RFC 4180 for every CSV
  // this app exports — every consumer that accepts LF also accepts CRLF, so there's no reason to
  // keep two line-ending conventions in one app. `bom` is per-call, not global: ON by default for
  // the human-facing grid CSV (helps Excel's UTF-8 detection for accented names), OFF for QGenda
  // (a BOM turns the first header cell into an invisible-prefixed "Staff", which a strict importer can reject).
  function downloadCSV(filename, rows, { bom = false, quoteMode = 'always' } = {}) {
    const escapeCell = c => {
      const s = String(c ?? '');
      const needsQuote = quoteMode === 'always' || /[",\r\n]|^\s|\s$/.test(s);
      return needsQuote ? `"${s.replace(/"/g,'""')}"` : s;
    };
    const csv = rows.map(row=>row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
    const blob=new Blob([bom ? String.fromCharCode(0xFEFF) : '', csv],{type:'text/csv'});
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
    if (demoMode) {
      const marker=['DEMO - NOT THE REAL SCHEDULE',...header.slice(1).map(()=>'')];
      return [marker,header,...rows];
    }
    return [header,...rows];
  }

  // QGenda CSV: tidy/long format — one row per assignment, columns driven entirely by
  // QGENDA_VARIANTS[variant].columns (src/lib/qgenda.js) rather than hardcoded here, since we
  // cannot verify QGenda's expected header names without admin access to trial an import — a
  // wrong header is meant to be a one-line data fix in that file, not an edit here.
  // Start/EndDate/StartTime/EndTime are derived from SHIFT_TIMING's numeric startH/durationH (the
  // same source rest-period math uses), not a display label string — handles midnight rollover
  // correctly. Date/EndDate use qgendaDate() (4-digit year) — NEVER prettyDate, which QGenda's
  // importer rejects (2-digit year).
  // Returns { rows, unmapped, count }: `rows` includes the header row, ready for downloadCSV.
  // `unmapped` collects the shift id of every assignment whose QGENDA task fell back to its
  // on-screen label (qgendaTaskFor's source==='fallback') — one entry per occurrence, so its
  // length is directly "how many assignments would export with an unconfirmed task name", and the
  // caller de-dupes for display. `count` is the total number of assignment rows (independent of
  // unmapped), for any caller that wants a plain "N shifts will export" figure.
  function buildQGendaCSVRows(variant) {
    const v = QGENDA_VARIANTS[variant] ? variant : 'minimal';
    const columns = QGENDA_VARIANTS[v].columns;
    const dates=getBlockDates(block.startDate,block.endDate);
    const fmtHM = h => { const hh=Math.floor(h)%24, mm=Math.round((h-Math.floor(h))*60); return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; };
    const nameFormat = appSettings.qgendaNameFormat ?? 'lastFirstInitial';
    const overrides = appSettings.qgendaTaskOverrides ?? {};
    const unmapped=[];
    const dataRows=[];
    for (const r of allResidents) {
      for (const d of dates) {
        const sid=block.schedule?.[r.id]?.[d];
        if (!sid) continue;
        const t=SHIFT_TIMING[sid];
        const startH=t?.startH;
        const durationH=t?.durationH;
        const rollsOver = startH!=null && durationH!=null && (startH + durationH) >= 24;
        const startStr = startH!=null ? fmtHM(startH) : '';
        const endStr = (startH!=null && durationH!=null) ? fmtHM(startH + durationH) : '';
        const endDate = rollsOver ? toDateStr(addDays(parseDate(d), 1)) : d;
        const { task, source } = qgendaTaskFor(sid, r, overrides);
        if (source === 'fallback') unmapped.push(sid);
        const valuesByColumn = {
          Staff: qgendaName(r, nameFormat),
          Date: qgendaDate(d),
          EndDate: qgendaDate(endDate),
          Task: task,
          StartTime: startStr,
          EndTime: endStr,
        };
        dataRows.push(columns.map(col => valuesByColumn[col] ?? ''));
      }
    }
    return { rows: [columns, ...dataRows], unmapped, count: dataRows.length };
  }

  function downloadICS(filename, contents) {
    const blob = new Blob([contents], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // One .ics file per schedulable resident (same filter exportResidentCalendarPDF uses).
  // Browsers throttle/block several near-simultaneous <a download> clicks, so each file's
  // trigger is staggered by 150ms rather than firing all at once.
  function exportResidentICSFiles() {
    const dates = getBlockDates(block.startDate, block.endDate);
    if (!dates.length) return;
    const schedulable = allResidents.filter(isSchedulable);
    schedulable.forEach((r, i) => {
      setTimeout(() => {
        const sched = block.schedule?.[r.id] || {};
        const ics = buildResidentICS(r, dates, sched, demoMode, dayRules, block.startDate);
        const safeName = `${r.lastName}_${r.firstName}`.replace(/[^A-Za-z0-9_-]/g, '_');
        downloadICS(`${safeName}${demoFilenameSuffix(demoMode)}.ics`, ics);
      }, i * 150);
    });
  }

  function pendingErrorCount() {
    return issueCounts.errors;
  }

  function pendingRestWarnCount() {
    return issueCounts.restWarns;
  }

  // `variant` only matters for kind==='qgenda' ('minimal' | 'withTimes' — see QGENDA_VARIANTS).
  // `kind` itself is always the plain string 'qgenda' regardless of variant — see the note by
  // exportVariant's declaration for why that's load-bearing for the demo guard below.
  function runExport(kind, variant=null) {
    const demoSuffix = demoFilenameSuffix(demoMode);
    if (kind==='qgenda' && demoMode) { showToast('QGenda export is disabled in the demo sandbox.', 'red'); setExportConfirm(null); setExportVariant(null); setExportUnmapped([]); return; }
    if (kind==='grid') downloadCSV(`schedule_${block.startDate||'block'}${demoSuffix}.csv`, buildGridCSVRows(), { bom: true, quoteMode: 'always' });
    else if (kind==='qgenda') {
      const v = QGENDA_VARIANTS[variant] ? variant : 'minimal';
      const { rows } = buildQGendaCSVRows(v);
      downloadCSV(`qgenda_${v}_${block.startDate||'block'}${demoSuffix}.csv`, rows, { bom: appSettings.qgendaBom ?? false, quoteMode: 'minimal' });
    }
    else if (kind==='ics') exportResidentICSFiles();
    else if (kind==='pdf-matrix' || kind==='pdf-resident') {
      try {
        if (kind==='pdf-matrix') exportMatrixPDF({ block, allResidents, schedule: block.schedule, demoMode });
        else exportResidentCalendarPDF({ block, allResidents, schedule: block.schedule, demoMode, dayRules });
      } catch {
        // pdfSave() has nothing left to fall back to once it fails, so it propagates here —
        // surface it instead of leaving the chief thinking the export silently succeeded.
        showToast('PDF export failed — check your browser settings and try again.', 'red');
        setExportConfirm(null);
        return;
      }
    }
    setExportConfirm(null); setExportVariant(null); setExportUnmapped([]);
  }

  function requestExport(kind, variant=null) {
    if (kind==='qgenda' && demoMode) { showToast('QGenda export is disabled in the demo sandbox.', 'red'); return; }
    if (kind==='qgenda') {
      // Gate on BOTH the usual validateAll issues AND any assignment whose task name is an
      // unconfirmed fallback (see buildQGendaCSVRows) — a fallback task is the prime suspect for
      // "nothing imports" if QGenda rejects an unrecognized task string, so the chief needs the
      // chance to bail out and fix it in Settings before the file leaves the browser.
      const { unmapped } = buildQGendaCSVRows(variant || 'minimal');
      if (unmapped.length > 0 || pendingErrorCount() > 0 || pendingRestWarnCount() > 0) {
        setExportConfirm(kind); setExportVariant(variant); setExportUnmapped(unmapped); return;
      }
      runExport(kind, variant);
      return;
    }
    if (pendingErrorCount() > 0 || pendingRestWarnCount() > 0) { setExportConfirm(kind); return; }
    runExport(kind);
  }

  const EXPORT_KIND_LABEL = { grid: 'the CSV', qgenda: 'QGenda', ics: 'ICS Calendar (.ics)', 'pdf-matrix': 'the PDF', 'pdf-resident': 'the PDF' };
  // QGENDA_NAME_FORMAT_LABEL is module-level now — shared with SettingsTab's "QGenda Task Names" card.

  const isSwitchNew = switchPending==='__new__';
  const pendingSnap = !isSwitchNew&&switchPending?switchPending:null;

  return (
    <div className={`h-screen flex flex-col bg-gray-100 overflow-hidden ${darkMode ? 'dark' : ''}`}>
      {/* Header */}
      <header className="bg-card border-b border-border shrink-0 no-print relative z-50">
        <div className="px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={()=>setNavOpen(o=>!o)} title="Menu" aria-label="Toggle navigation"
              className="md:hidden p-2 -ml-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-none">
              <Menu size={18}/>
            </button>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white flex-none">
              <CalendarDays size={18}/>
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-none truncate">EM Residency Scheduler</p>
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-base font-semibold text-foreground truncate">{block.name || 'Untitled block'}</h1>
                <SaveStatePill state={blockSaveState}/>
                <span className="hidden lg:inline text-xs text-muted-foreground shrink-0">
                  {block.startDate&&block.endDate?`${prettyDate(block.startDate)} → ${prettyDate(block.endDate)}`:'No dates set'} · {block.academicYear}
                </span>
              </div>
            </div>
            <span title="Draft v0.4 — Neuro/Anes/Psych/Pod matrix needs verification with chief. FM PGY-1 Peds eligibility TBD. Several rules marked ⚠ in Scheduling Rules tab. See User Guide for help; export backups from Settings."
              className="hidden sm:inline-flex items-center gap-1.5 border border-omaha/40 bg-omaha/10 rounded-full px-2 py-0.5 flex-none">
              <span className="w-1.5 h-1.5 rounded-full bg-omaha"/>
              <span className="text-[11px] font-semibold text-foreground/80">DRAFT v0.4</span>
            </span>
          </div>
          {block.startDate && (
            <div className="hidden md:flex flex-1 max-w-xs">
              <BlockProgressBar block={block}/>
            </div>
          )}
          <div className="flex items-center gap-2 flex-none">
            <span className="hidden lg:inline text-xs text-gray-400">{allResidents.length} residents</span>
            {viewer?.email && (
              <span title={`Signed in as ${viewer.email}`}
                className="hidden sm:inline max-w-[12rem] truncate text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                {viewer.email}
              </span>
            )}
            <AutosaveIndicator state={saveState} cloudEnabled={SUPABASE_ENABLED} dbStatus={dbStatus} dbError={dbError}/>
            {!demoMode && (
              <button onClick={openDemoModal} title="Demo Sandbox — practice on a disposable copy of your data"
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <FlaskConical size={16}/>
              </button>
            )}
            <button onClick={()=>setDarkMode(d=>!d)} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              {darkMode ? <Sun size={16}/> : <Moon size={16}/>}
            </button>
            {AUTH_ENABLED && (
              <button onClick={()=>supabase.auth.signOut()} title="Sign out" aria-label="Sign out"
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <LogOut size={16}/>
              </button>
            )}
            {/* Export stays reachable at every width — below sm the text label collapses so only
                the icon (with its title/aria-label) remains, keeping 375px from overflowing. */}
            {block.startDate && (
              <div className="relative">
                <Button variant="secondary" size="sm" onClick={()=>setExportMenuOpen(o=>!o)}
                  title="Export the schedule" aria-haspopup="menu" aria-expanded={exportMenuOpen}>
                  <Download size={12}/> <span className="hidden sm:inline">Export</span> <ChevronDown size={12}/>
                </Button>
                {exportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={()=>setExportMenuOpen(false)}/>
                    <div role="menu" className="absolute right-0 top-full mt-1 w-48 bg-popover text-popover-foreground border border-border rounded-lg shadow-lg py-1 z-50">
                      <button role="menuitem" onClick={()=>{setExportMenuOpen(false); requestExport('grid');}}
                        title="Resident × date grid — matches the on-screen Schedule tab"
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent">
                        Grid CSV
                      </button>
                      <button role="menuitem" onClick={()=>{
                          setExportMenuOpen(false);
                          if (demoMode) { showToast('QGenda export is disabled in the demo sandbox.', 'red'); return; }
                          setQgendaPicker(true);
                        }}
                        title="One row per shift, for QGenda import"
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent">
                        QGenda CSV…
                      </button>
                      <button role="menuitem" onClick={()=>{setExportMenuOpen(false); setPdfPicker(true);}}
                        title="Printable PDF — matrix or per-resident pages"
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent">
                        PDF…
                      </button>
                      <button role="menuitem" onClick={()=>{setExportMenuOpen(false); requestExport('ics');}}
                        title="One .ics calendar file per resident — for import into Outlook/Google/Apple Calendar"
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent">
                        ICS Calendar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {demoMode && (
        <div className="no-print shrink-0 flex items-center justify-between gap-3 px-5 py-2 text-white"
          style={{ background: 'repeating-linear-gradient(45deg, #a21caf, #a21caf 10px, #86198f 10px, #86198f 20px)' }}>
          <span className="text-xs font-semibold">DEMO SANDBOX — you're editing a disposable copy. Your real schedules are untouched.</span>
          <div className="flex items-center gap-2 flex-none">
            <button onClick={exitDemo} className="text-xs font-medium px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30">Exit demo</button>
            <button onClick={deleteDemo} disabled={demoBusy} className="text-xs font-medium px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 disabled:opacity-50">Delete demo &amp; exit</button>
          </div>
        </div>
      )}

      {whatsNew.length > 0 && <WhatsNewModal entries={whatsNew} onClose={dismissWhatsNew}/>}

      {demoModalOpen && (
        <Modal title="Demo Sandbox" onClose={()=>setDemoModalOpen(false)}>
          <div className="space-y-3 text-sm text-gray-600">
            <p>Practice building schedules on a disposable copy of your data — your real roster, block, and rules stay untouched until you exit.</p>
            {demoCheckPending && <p className="text-xs text-gray-400">Checking for an existing demo…</p>}
            {demoCheckError && <p className="text-xs text-red-600">Could not confirm whether a demo already exists — close this and try again before starting or deleting one.</p>}
            <div className="space-y-2 pt-1">
              {demoExisting && (
                <Button variant="primary" className="w-full justify-center" disabled={demoBusy || demoCheckPending || demoCheckError} onClick={enterDemoResume}>
                  Resume existing demo
                </Button>
              )}
              <Button variant="secondary" className="w-full justify-center" disabled={demoBusy || demoCheckPending || demoCheckError} onClick={enterDemoFresh}>
                {demoExisting ? 'Start fresh (replaces existing demo)' : 'Start fresh — copy of current data'}
              </Button>
              {demoExisting && (
                <Button variant="dangerOutline" className="w-full justify-center" disabled={demoBusy || demoCheckPending || demoCheckError} onClick={deleteDemo}>
                  Delete demo
                </Button>
              )}
            </div>
            {SUPABASE_ENABLED && <p className="text-xs text-gray-400">The demo is shared across your devices, in one slot — another admin's demo edits will be lost if overwritten.</p>}
          </div>
        </Modal>
      )}

      {BLOCK_SCOPED_TABS.has(tab) && (
        <BlockContextBar block={block} blockSaveState={blockSaveState} onSave={saveBlock} onSwitch={()=>setTab('dashboard')}/>
      )}

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Backdrop for the below-md sidebar drawer. md:hidden so it can never intercept clicks
            on desktop, where the sidebar is a static column and nothing overlays the content. */}
        {navOpen && (
          <div onClick={()=>setNavOpen(false)} aria-hidden="true"
            className="md:hidden fixed inset-0 bg-black/40 z-30 no-print"/>
        )}

        {/* Vertical sidebar */}
        <SidebarNav tab={tab} setTab={setTab} tabOrder={tabOrder} setTabOrder={setTabOrder}
          issueCounts={issueCounts} hasSchedule={hasSchedule} emResidentCount={emRoster.length}
          offServiceCount={(block.offServiceResidents||[]).length} cloudEnabled={SUPABASE_ENABLED}
          pendingRequestCount={pendingRequests.length} viewer={viewer}
          mobileOpen={navOpen} onNavigate={()=>setNavOpen(false)}/>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 min-w-0">
          {tab==='dashboard' && (
            <DashboardTab block={block} updateBlock={updateBlock} allResidents={allResidents} schedulableCount={schedulableCount}
              ayConf={currentAyConf} issueCounts={issueCounts} coverage={coverage} blocksHistory={blocksHistory}
              loadBlock={loadBlock} toggleBlockPublished={toggleBlockPublished} deleteBlockSnapshot={deleteBlockSnapshot} setTab={setTab}
              emRoster={emRoster} setEmRoster={setEmRoster} setBlocksHistory={setBlocksHistory}
              ayData={ayData} updateAyData={updateAyData} appSettings={appSettings} setAppSettings={setAppSettings}
              onSaveBlock={saveBlock} onNewBlock={newBlock} showToast={showToast} blockSaveState={blockSaveState}
              onBlockReset={blockReset} deleteCurrentBlock={deleteCurrentBlock} currentSnapPublished={!!matchingSnap?.published}/>
          )}
          {tab==='em' && <EMResidentsTab emRoster={emRoster} setEmRoster={setEmRoster} block={block} updateBlock={updateBlock} appSettings={appSettings} showToast={showToast} ayData={ayData} blocksHistory={blocksHistory}/>}
          {tab==='offservice' && <OffServiceTab block={block} updateBlock={updateBlock} appSettings={appSettings}/>}
          {tab==='matrix' && <ShiftMatrixTab eligOverrides={eligOverrides} setEligOverrides={setEligOverrides}/>}
          {tab==='schedule' && <ScheduleGrid allResidents={allResidents} block={block} updateBlock={updateBlock} updateBlockTracked={updateBlockTracked} onUndo={undoSchedule} onRedo={redoSchedule} canUndo={undoStack.length>0} canRedo={redoStack.length>0} eligOverrides={eligOverrides} appSettings={appSettings} dayRules={dayRules} coverage={coverage} blocksHistory={blocksHistory} showToast={showToast} pendingByResident={pendingByResident} schedulableCount={schedulableCount} blockSaveState={blockSaveState} ayConf={currentAyConf}/>}
          {tab==='rules' && <RulesTab allResidents={allResidents} block={block} eligOverrides={eligOverrides} appSettings={appSettings} setAppSettings={setAppSettings} dayRules={dayRules} setDayRules={setDayRules} coverage={coverage} setCoverage={setCoverage}/>}
          {tab==='validation' && <ValidationTab issues={issues} block={block} appSettings={appSettings} allResidents={allResidents}/>}
          {tab==='requests' && <RequestsTab emRoster={emRoster} setEmRoster={setEmRoster} blocks={requestBlocks} onRequestsChanged={refreshPendingRequests} showToast={showToast} demoMode={demoMode}/>}
          {tab==='settings' && <SettingsTab block={block} updateBlock={updateBlock} onBlockReset={blockReset} appSettings={appSettings} setAppSettings={setAppSettings} showToast={showToast} demoMode={demoMode} dbReady={dbReady} onShowWhatsNew={()=>setWhatsNew(CHANGELOG)}/>}
          {tab==='feedback' && SUPABASE_ENABLED && <FeedbackAdminTab/>}
          {tab==='guide' && <UserGuideTab onNavigate={setTab}/>}
        </main>
      </div>

      {/* Save-before-switch modal */}
      {switchPending && (
        <ConfirmDialog icon={Archive} tone="warn" title="Save current block first?"
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={()=>setSwitchPending(null)}>Cancel</Button>
              <Button variant="secondary" size="sm" onClick={()=>{isSwitchNew?doNewBlock():doLoadBlock(pendingSnap);}}>
                {isSwitchNew?'Discard & New':'Switch Without Saving'}
              </Button>
              <Button variant="primary" size="sm" icon={Save} onClick={()=>{saveBlock();isSwitchNew?doNewBlock():doLoadBlock(pendingSnap);}}>
                Save &amp; {isSwitchNew?'New':'Switch'}
              </Button>
            </>
          }>
          <p><span className="font-medium text-foreground">"{block.name||'Current block'}"</span> has unsaved work.</p>
          {pendingSnap && (
            <div className="rounded-lg bg-muted border border-border px-4 py-3 mt-3">
              Loading: <span className="font-semibold text-foreground">{pendingSnap.name}</span>
              {pendingSnap.startDate && <span className="text-xs text-muted-foreground/70 ml-2">{prettyDate(pendingSnap.startDate)} → {prettyDate(pendingSnap.endDate)}</span>}
            </div>
          )}
        </ConfirmDialog>
      )}

      {/* Pre-export validation gate. For kind==='qgenda' this also gates on exportUnmapped (shift
          ids whose QGenda task fell back to an on-screen label — see requestExport) alongside the
          usual validateAll issues, but reuses this same dialog rather than a second mechanism. */}
      {exportConfirm && (
        <ConfirmDialog icon={AlertTriangle} tone="danger" title="Unresolved issues in this schedule"
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={()=>{setExportConfirm(null); setExportVariant(null); setExportUnmapped([]);}}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={()=>runExport(exportConfirm, exportVariant)}>Export Anyway</Button>
            </>
          }>
          {(pendingErrorCount() > 0 || pendingRestWarnCount() > 0) && (
            <p>
              {[
                pendingErrorCount() > 0 ? `${pendingErrorCount()} error${pendingErrorCount()!==1?'s':''} (ineligible shifts, approved-day-off conflicts, or rest violations)` : null,
                pendingRestWarnCount() > 0 ? `${pendingRestWarnCount()} shift${pendingRestWarnCount()!==1?'s':''} with under 24h post-night rest` : null,
              ].filter(Boolean).join(' and ')} — see the Violations tab.
            </p>
          )}
          {exportConfirm==='qgenda' && exportUnmapped.length > 0 && (
            <p className={(pendingErrorCount() > 0 || pendingRestWarnCount() > 0) ? 'mt-2' : ''}>
              {exportUnmapped.length} assignment{exportUnmapped.length!==1?'s':''} use shift{exportUnmapped.length!==1?'s':''} with no confirmed QGenda task
              ({[...new Set(exportUnmapped)].join(', ')}) — they will export under their on-screen shift label. Set task names in Settings → QGenda.
            </p>
          )}
          <p className="mt-2">
            Exporting now will carry {(pendingErrorCount()+pendingRestWarnCount()+(exportConfirm==='qgenda'?exportUnmapped.length:0))===1?'it':'them'} into {EXPORT_KIND_LABEL[exportConfirm] || 'the export'}.
          </p>
        </ConfirmDialog>
      )}

      {pdfPicker && (
        <Modal title="Export PDF" onClose={()=>setPdfPicker(false)}>
          <div className="space-y-3">
            <button onClick={()=>{setPdfPicker(false); requestExport('pdf-matrix');}}
              className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/10 transition-colors">
              <div className="text-sm font-semibold text-gray-800">Matrix (all residents)</div>
              <div className="text-xs text-gray-500 mt-0.5">One page, residents × dates — matches the Schedule tab grid. Landscape A3.</div>
            </button>
            <button onClick={()=>{setPdfPicker(false); requestExport('pdf-resident');}}
              className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/10 transition-colors">
              <div className="text-sm font-semibold text-gray-800">Per-resident pages</div>
              <div className="text-xs text-gray-500 mt-0.5">One page per schedulable resident, with date/shift/notes rows — good for a take-home printout.</div>
            </button>
          </div>
        </Modal>
      )}

      {qgendaPicker && (
        <Modal title="Export QGenda CSV" onClose={()=>setQgendaPicker(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Staff name format</label>
              <select value={appSettings.qgendaNameFormat ?? 'lastFirstInitial'}
                onChange={e=>setAppSettings(s=>({...s, qgendaNameFormat: e.target.value}))}
                className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary">
                {QGENDA_NAME_FORMATS.map(f => (
                  <option key={f} value={f}>{QGENDA_NAME_FORMAT_LABEL[f] || f}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Preview: {(() => {
                  const previewResident = allResidents.find(isSchedulable);
                  return previewResident ? qgendaName(previewResident, appSettings.qgendaNameFormat ?? 'lastFirstInitial') : '— (no schedulable residents yet)';
                })()}
              </p>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={!!appSettings.qgendaBom}
                onChange={e=>setAppSettings(s=>({...s, qgendaBom: e.target.checked}))} className="rounded mt-0.5"/>
              <span>
                <span className="block text-xs font-semibold text-gray-700">Add UTF-8 BOM</span>
                <span className="block text-xs text-gray-400">Leave off unless QGenda's importer garbles accented names — a BOM makes the very first header cell unreadable to some strict importers, so only turn this on if a plain file failed for that specific reason.</span>
              </span>
            </label>
            <div className="space-y-3 pt-1">
              <button onClick={()=>{setQgendaPicker(false); requestExport('qgenda', 'minimal');}}
                className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/10 transition-colors">
                <div className="text-sm font-semibold text-gray-800">Minimal</div>
                <div className="text-xs text-gray-500 mt-0.5">Staff, Date, Task — smallest surface area if QGenda's importer is picky about extra or unexpected columns.</div>
              </button>
              <button onClick={()=>{setQgendaPicker(false); requestExport('qgenda', 'withTimes');}}
                className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/10 transition-colors">
                <div className="text-sm font-semibold text-gray-800">With times</div>
                <div className="text-xs text-gray-500 mt-0.5">Adds EndDate, StartTime, EndTime — use if QGenda needs explicit shift times rather than inferring them from the Task.</div>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {SUPABASE_ENABLED && <FeedbackWidget page={tab} showToast={showToast}/>}
      <Toast toast={toast} onClose={()=>setToast(null)}/>
    </div>
  );
}
