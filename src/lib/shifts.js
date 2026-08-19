// src/lib/shifts.js
// Shift catalog constants and their direct helpers, extracted from ResidentScheduler.jsx's
// CONSTANTS section. No React, no side effects at import time.

import { parseDate } from './dates.js';

// NOTE: AREA_COLORS is not in the original extraction spec's const list, but SHIFTS reads it
// directly (SHIFTS[].chip) to build the shift catalog, so it has to live wherever SHIFTS lives
// to avoid a circular import back into ResidentScheduler.jsx (which also uses AREA_COLORS
// directly, at the PDF_AREA_LIGHT map and ShiftMatrixTab's areaColor). Moved here and
// re-imported by ResidentScheduler.jsx for those two other call sites.
//
// Single source of truth for shift-area color, consumed across three independent rendering
// contexts that used to be hand-kept in sync separately: solid per-shift-id chips (SHIFTS[].chip,
// used in the grid), a light-tint label style (ShiftMatrixTab's areaColor, header tints), and raw
// RGB for jsPDF (PDF_AREA_LIGHT — jsPDF can't consume Tailwind classes). Add/adjust a shift area's
// color here only; SHIFTS chips, PDF_AREA_LIGHT, and ShiftMatrixTab's areaColor all derive from
// this map. Declared above SHIFTS (TDZ — SHIFTS reads AREA_COLORS.*.chip.* below).
export const AREA_COLORS = {
  POD:    { chip: { day: 'bg-blue-600 text-white',   eve: 'bg-blue-400 text-white',   night: 'bg-blue-900 text-white' },
            tint: 'text-blue-700 bg-blue-50 border-blue-200',     pdfLight: [219, 234, 254] },
  PED:    { chip: { day: 'bg-green-600 text-white',  eve: 'bg-green-400 text-white',  night: 'bg-green-900 text-white', swing: 'bg-green-700 text-white' },
            tint: 'text-green-700 bg-green-50 border-green-200',  pdfLight: [209, 250, 229] },
  FLEX:   { chip: { day: 'bg-purple-600 text-white', eve: 'bg-purple-400 text-white', night: 'bg-purple-900 text-white' },
            tint: 'text-purple-700 bg-purple-50 border-purple-200', pdfLight: [237, 233, 254] },
  MT:     { chip: { day: 'bg-amber-600 text-white',  eve: 'bg-amber-400 text-white',  night: 'bg-amber-900 text-white' },
            tint: 'text-amber-700 bg-amber-50 border-amber-200',  pdfLight: [254, 243, 199] },
  TRAUMA: { chip: { day: 'bg-red-600 text-white',    night: 'bg-red-900 text-white' },
            tint: 'text-red-700 bg-red-50 border-red-200',        pdfLight: [254, 226, 226] },
};

// PED-N-FM is a SECOND exception to the AREA-TYPE shift-id convention (PED-S was the first) —
// it's AREA-TYPE-QUALIFIER, not plain AREA-TYPE. Nothing currently parses shift ids by splitting
// on '-', but the convention itself is documented in this repo's CLAUDE.md, so note the exception
// here too. The `short` field on PED-N-FM is an optional display abbreviation consumed by the
// Shift Matrix header, which otherwise derives a column label from `type[0].toUpperCase()` — with
// two 'night' shifts in the PED area that would render two indistinguishable 'N' columns.
// Retiming PED-N's startH from 23 to 19 (below, in SHIFT_TIMING) flips shiftOverlapsJC('PED-N')
// from false to true (shiftOverlapsJC is `startH < 21 && startH + durationH > 18`) — that's an
// intended consequence of the split, not a bug: the new 19:00 PED-N genuinely overlaps Journal
// Club's 18:00-21:00 window, while PED-N-FM (still 23:00) does not.
export const SHIFTS = [
  { id: 'POD-D',    label: 'POD Day',      area: 'POD',    hours: '07:00–16:00', type: 'day',   chip: AREA_COLORS.POD.chip.day },
  { id: 'POD-E',    label: 'POD Eve',      area: 'POD',    hours: '15:00–00:00', type: 'eve',   chip: AREA_COLORS.POD.chip.eve },
  { id: 'POD-N',    label: 'POD Night',    area: 'POD',    hours: '23:00–08:00', type: 'night', chip: AREA_COLORS.POD.chip.night },
  { id: 'PED-D',    label: 'PED Day',      area: 'PED',    hours: '07:00–16:00', type: 'day',   chip: AREA_COLORS.PED.chip.day },
  { id: 'PED-E',    label: 'PED Eve',      area: 'PED',    hours: '15:00–00:00', type: 'eve',   chip: AREA_COLORS.PED.chip.eve },
  { id: 'PED-N',    label: 'Peds Night',   area: 'PED',    hours: '19:00–04:00', type: 'night', chip: AREA_COLORS.PED.chip.night },
  { id: 'PED-N-FM', label: 'Peds Night (FM Only)', area: 'PED', hours: '23:00–08:00', type: 'night', chip: AREA_COLORS.PED.chip.night, short: 'NF' },
  { id: 'FLEX-D',   label: 'FLEX Day',     area: 'FLEX',   hours: '06:00–15:00', type: 'day',   chip: AREA_COLORS.FLEX.chip.day },
  { id: 'FLEX-E',   label: 'FLEX Eve',     area: 'FLEX',   hours: '14:00–23:00', type: 'eve',   chip: AREA_COLORS.FLEX.chip.eve },
  { id: 'FLEX-N',   label: 'FLEX Night',   area: 'FLEX',   hours: '22:00–07:00', type: 'night', chip: AREA_COLORS.FLEX.chip.night },
  { id: 'MT-D',     label: 'MT Day',       area: 'MT',     hours: '07:00–16:00', type: 'day',   chip: AREA_COLORS.MT.chip.day },
  { id: 'MT-E',     label: 'MT Eve',       area: 'MT',     hours: '15:00–00:00', type: 'eve',   chip: AREA_COLORS.MT.chip.eve },
  { id: 'MT-N',     label: 'MT Night',     area: 'MT',     hours: '23:00–08:00', type: 'night', chip: AREA_COLORS.MT.chip.night },
  { id: 'TRAUMA-D', label: 'Trauma Day',   area: 'TRAUMA', hours: '06:00–18:00', type: 'day',   chip: AREA_COLORS.TRAUMA.chip.day },
  { id: 'TRAUMA-N', label: 'Trauma Night', area: 'TRAUMA', hours: '18:00–06:00', type: 'night', chip: AREA_COLORS.TRAUMA.chip.night },
  // 12h conference-week pairs (day+night, no evening) — POD/MT/FLEX auto-swap in for any
  // ACEP/AAEM/SAEM conference-week date (see CONF_SUPPRESSED_NORMAL_IDS/CONF_AUTO_SWAP_12H_IDS,
  // isConferenceCoverageDate), chief-editable via the coverage editor. PED's 12h pair exists too
  // but is deliberately NOT part of the auto-swap — it stays chief-opt-in, zero coverage by
  // default (see DEFAULT_COVERAGE_MINMAX). type stays plain 'day'/'night' — never a new type
  // string — so circadian rules, JC overlap, night-run counting, PDF/CSV export, and
  // senior-composition rules all apply with zero special-casing (they key off type/area, never id).
  { id: 'POD-D12',  label: 'POD Day 12h',  area: 'POD',  hours: '07:00–19:00', type: 'day',   chip: AREA_COLORS.POD.chip.day },
  { id: 'POD-N12',  label: 'POD Night 12h',area: 'POD',  hours: '19:00–07:00', type: 'night', chip: AREA_COLORS.POD.chip.night },
  { id: 'MT-D12',   label: 'MT Day 12h',   area: 'MT',   hours: '07:00–19:00', type: 'day',   chip: AREA_COLORS.MT.chip.day },
  { id: 'MT-N12',   label: 'MT Night 12h', area: 'MT',   hours: '19:00–07:00', type: 'night', chip: AREA_COLORS.MT.chip.night },
  { id: 'FLEX-D12', label: 'FLEX Day 12h', area: 'FLEX', hours: '06:00–18:00', type: 'day',   chip: AREA_COLORS.FLEX.chip.day },
  { id: 'FLEX-N12', label: 'FLEX Night 12h',area:'FLEX', hours: '18:00–06:00', type: 'night', chip: AREA_COLORS.FLEX.chip.night },
  { id: 'PED-D12',  label: 'PED Day 12h',  area: 'PED',  hours: '07:00–19:00', type: 'day',   chip: AREA_COLORS.PED.chip.day },
  { id: 'PED-N12',  label: 'PED Night 12h',area: 'PED',  hours: '19:00–07:00', type: 'night', chip: AREA_COLORS.PED.chip.night },
  // Staffed exclusively by EM-Home PGY-2 on EM/TOX or EM/EMS, Mon/Tue/Thu/Fri only — see
  // SHIFT_DOW and the ped_s_* gates on EM_HOME_2's day rules. type:'swing' (not 'eve') so it
  // isn't subject to the eve→day-next-day circadian rule (it ends at 20:00, well clear of it).
  { id: 'PED-S',    label: 'PED Swing',    area: 'PED',    hours: '11:00–20:00', type: 'swing', chip: AREA_COLORS.PED.chip.swing },
];
export const SHIFT_MAP = Object.fromEntries(SHIFTS.map(s => [s.id, s]));
export const SHIFT_AREAS = ['POD', 'PED', 'FLEX', 'MT', 'TRAUMA'];
export const SHIFT_TYPES = ['day', 'eve', 'night', 'swing'];

// Exact start hour (24h) and duration for each shift — used for rest-period validation.
// End time = start + duration (may cross midnight into the next calendar day).
export const SHIFT_TIMING = {
  'POD-D':    { startH: 7,  durationH: 9  },   // 07:00 – 16:00
  'POD-E':    { startH: 15, durationH: 9  },   // 15:00 – 00:00 (+1 day)
  'POD-N':    { startH: 23, durationH: 9  },   // 23:00 – 08:00 (+1 day)
  'PED-D':    { startH: 7,  durationH: 9  },
  'PED-E':    { startH: 15, durationH: 9  },
  'PED-N':    { startH: 19, durationH: 9  },   // 19:00 – 04:00 (+1 day)
  'PED-N-FM': { startH: 23, durationH: 9  },   // 23:00 – 08:00 (+1 day)
  'FLEX-D':   { startH: 6,  durationH: 9  },   // 06:00 – 15:00
  'FLEX-E':   { startH: 14, durationH: 9  },   // 14:00 – 23:00
  'FLEX-N':   { startH: 22, durationH: 9  },   // 22:00 – 07:00 (+1 day)
  'MT-D':     { startH: 7,  durationH: 9  },
  'MT-E':     { startH: 15, durationH: 9  },
  'MT-N':     { startH: 23, durationH: 9  },
  'TRAUMA-D': { startH: 6,  durationH: 12 },   // 06:00 – 18:00
  'TRAUMA-N': { startH: 18, durationH: 12 },   // 18:00 – 06:00 (+1 day)
  'POD-D12':  { startH: 7,  durationH: 12 },
  'POD-N12':  { startH: 19, durationH: 12 },
  'MT-D12':   { startH: 7,  durationH: 12 },
  'MT-N12':   { startH: 19, durationH: 12 },
  'FLEX-D12': { startH: 6,  durationH: 12 },
  'FLEX-N12': { startH: 18, durationH: 12 },
  'PED-D12':  { startH: 7,  durationH: 12 },
  'PED-N12':  { startH: 19, durationH: 12 },
  'PED-S':    { startH: 11, durationH: 9  },   // 11:00 – 20:00
};

// Shifts that only exist on certain weekdays (JS getDay(): 0=Sun..6=Sat). Coverage min/max is
// otherwise DOW-independent by design — this is a narrow exception for one shift, not a general
// per-day-of-week coverage feature.
export const SHIFT_DOW = { 'PED-S': [1, 2, 4, 5] };

// Millisecond timestamp for the START of a shift on a given date
export function shiftStartMs(shiftId, dateStr) {
  const t = SHIFT_TIMING[shiftId];
  if (!t) return null;
  const d = parseDate(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.startH, 0, 0).getTime();
}

// Millisecond timestamp for the END of a shift (may be next calendar day)
export function shiftEndMs(shiftId, dateStr) {
  const startMs = shiftStartMs(shiftId, dateStr);
  if (startMs === null) return null;
  return startMs + SHIFT_TIMING[shiftId].durationH * 3600_000;
}

export function isNightShiftId(sid) { return SHIFT_MAP[sid]?.type === 'night'; }

export function shiftOverlapsJC(sid) {
  const t = SHIFT_TIMING[sid];
  return !!t && t.startH < 21 && t.startH + t.durationH > 18;
}
