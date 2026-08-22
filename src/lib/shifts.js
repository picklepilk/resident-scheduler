// src/lib/shifts.js
// Shift catalog constants and their direct helpers, extracted from ResidentScheduler.jsx's
// CONSTANTS section. No React, no side effects at import time.

import { parseDate, addDays, toDateStr } from './dates.js';

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
// Evening chips keep their -400 background on purpose (the palette reads day-600 / eve-400 /
// night-900, so eve is meant to be the light one) but carry BLACK text, not white: white on a
// -400 mid-tone measures 1.67-2.64 contrast in the deployed app — unreadable, and equally so in
// light and dark mode, since the chip color is theme-independent. Black on the same background
// measures 8-11 and leaves every hue exactly as it was. Same convention as the sidebar count
// badges, which have always paired bg-amber-400 with text-black/80 and read fine.
export const AREA_COLORS = {
  POD:    { chip: { day: 'bg-blue-600 text-white',   eve: 'bg-blue-400 text-black/80',   night: 'bg-blue-900 text-white' },
            tint: 'text-blue-700 bg-blue-50 border-blue-200',     pdfLight: [219, 234, 254] },
  PED:    { chip: { day: 'bg-green-600 text-white',  eve: 'bg-green-400 text-black/80',  night: 'bg-green-900 text-white', swing: 'bg-green-700 text-white' },
            tint: 'text-green-700 bg-green-50 border-green-200',  pdfLight: [209, 250, 229] },
  FLEX:   { chip: { day: 'bg-purple-600 text-white', eve: 'bg-purple-400 text-black/80', night: 'bg-purple-900 text-white' },
            tint: 'text-purple-700 bg-purple-50 border-purple-200', pdfLight: [237, 233, 254] },
  MT:     { chip: { day: 'bg-amber-600 text-white',  eve: 'bg-amber-400 text-black/80',  night: 'bg-amber-900 text-white' },
            tint: 'text-amber-700 bg-amber-50 border-amber-200',  pdfLight: [254, 243, 199] },
  TRAUMA: { chip: { day: 'bg-red-600 text-white',    night: 'bg-red-900 text-white' },
            tint: 'text-red-700 bg-red-50 border-red-200',        pdfLight: [254, 226, 226] },
};

// PED-N-FM is a SECOND exception to the AREA-TYPE shift-id convention (PED-S was the first) —
// it's AREA-TYPE-QUALIFIER, not plain AREA-TYPE. Nothing currently parses shift ids by splitting
// on '-', but the convention itself is documented in this repo's CLAUDE.md, so note the exception
// here too. Every entry now carries an explicit `short` display abbreviation, consumed by the
// Shift Matrix column header and eligSummaryFor — without it a shift falls back to
// `type[0].toUpperCase()`, which collapses same-type shifts to identical single letters (POD-D and
// POD-D12 both 'D', PED-N and PED-N-FM both 'N'). Add a `short` to any new shift id for the same
// reason, rather than relying on the fallback.
// Retiming PED-N's startH from 23 to 19 (below, in SHIFT_TIMING) flips shiftOverlapsJC('PED-N')
// from false to true (shiftOverlapsJC is `startH < 21 && startH + durationH > 18`) — that's an
// intended consequence of the split, not a bug: the new 19:00 PED-N genuinely overlaps Journal
// Club's 18:00-21:00 window, while PED-N-FM (still 23:00) does not.
export const SHIFTS = [
  { id: 'POD-D',    label: 'POD Day',      area: 'POD',    hours: '07:00–16:00', type: 'day',   chip: AREA_COLORS.POD.chip.day, short: 'D' },
  { id: 'POD-E',    label: 'POD Eve',      area: 'POD',    hours: '15:00–00:00', type: 'eve',   chip: AREA_COLORS.POD.chip.eve, short: 'E' },
  { id: 'POD-N',    label: 'POD Night',    area: 'POD',    hours: '23:00–08:00', type: 'night', chip: AREA_COLORS.POD.chip.night, short: 'N' },
  { id: 'PED-D',    label: 'PED Day',      area: 'PED',    hours: '07:00–16:00', type: 'day',   chip: AREA_COLORS.PED.chip.day, short: 'D' },
  { id: 'PED-E',    label: 'PED Eve',      area: 'PED',    hours: '15:00–00:00', type: 'eve',   chip: AREA_COLORS.PED.chip.eve, short: 'E' },
  { id: 'PED-N',    label: 'Peds Night',   area: 'PED',    hours: '19:00–04:00', type: 'night', chip: AREA_COLORS.PED.chip.night, short: 'N' },
  { id: 'PED-N-FM', label: 'Peds Night (FM Only)', area: 'PED', hours: '23:00–08:00', type: 'night', chip: AREA_COLORS.PED.chip.night, short: 'NF' },
  { id: 'FLEX-D',   label: 'FLEX Day',     area: 'FLEX',   hours: '06:00–15:00', type: 'day',   chip: AREA_COLORS.FLEX.chip.day, short: 'D' },
  { id: 'FLEX-E',   label: 'FLEX Eve',     area: 'FLEX',   hours: '14:00–23:00', type: 'eve',   chip: AREA_COLORS.FLEX.chip.eve, short: 'E' },
  { id: 'FLEX-N',   label: 'FLEX Night',   area: 'FLEX',   hours: '22:00–07:00', type: 'night', chip: AREA_COLORS.FLEX.chip.night, short: 'N' },
  { id: 'MT-D',     label: 'MT Day',       area: 'MT',     hours: '07:00–16:00', type: 'day',   chip: AREA_COLORS.MT.chip.day, short: 'D' },
  { id: 'MT-E',     label: 'MT Eve',       area: 'MT',     hours: '15:00–00:00', type: 'eve',   chip: AREA_COLORS.MT.chip.eve, short: 'E' },
  { id: 'MT-N',     label: 'MT Night',     area: 'MT',     hours: '23:00–08:00', type: 'night', chip: AREA_COLORS.MT.chip.night, short: 'N' },
  { id: 'TRAUMA-D', label: 'Trauma Day',   area: 'TRAUMA', hours: '06:00–18:00', type: 'day',   chip: AREA_COLORS.TRAUMA.chip.day, short: 'D' },
  { id: 'TRAUMA-N', label: 'Trauma Night', area: 'TRAUMA', hours: '18:00–06:00', type: 'night', chip: AREA_COLORS.TRAUMA.chip.night, short: 'N' },
  // 12h conference-week pairs (day+night, no evening) — POD/MT/FLEX auto-swap in for any
  // ACEP/AAEM/SAEM conference-week date (see CONF_SUPPRESSED_NORMAL_IDS/CONF_AUTO_SWAP_12H_IDS,
  // isConferenceCoverageDate), chief-editable via the coverage editor. PED's 12h pair exists too
  // but is deliberately NOT part of the auto-swap — it stays chief-opt-in, zero coverage by
  // default (see DEFAULT_COVERAGE_MINMAX). type stays plain 'day'/'night' — never a new type
  // string — so circadian rules, JC overlap, night-run counting, PDF/CSV export, and
  // senior-composition rules all apply with zero special-casing (they key off type/area, never id).
  // Explicit `short: 'D12'/'N12'` — without it these fell back to `type[0].toUpperCase()` and
  // rendered identically to the 9h D/N columns in the Shift Matrix header (POD-D and POD-D12 both
  // showing 'D'), which is exactly the ambiguity the Shift Matrix readability pass was meant to fix.
  { id: 'POD-D12',  label: 'POD Day 12h',  area: 'POD',  hours: '07:00–19:00', type: 'day',   chip: AREA_COLORS.POD.chip.day, short: 'D12' },
  { id: 'POD-N12',  label: 'POD Night 12h',area: 'POD',  hours: '19:00–07:00', type: 'night', chip: AREA_COLORS.POD.chip.night, short: 'N12' },
  { id: 'MT-D12',   label: 'MT Day 12h',   area: 'MT',   hours: '07:00–19:00', type: 'day',   chip: AREA_COLORS.MT.chip.day, short: 'D12' },
  { id: 'MT-N12',   label: 'MT Night 12h', area: 'MT',   hours: '19:00–07:00', type: 'night', chip: AREA_COLORS.MT.chip.night, short: 'N12' },
  { id: 'FLEX-D12', label: 'FLEX Day 12h', area: 'FLEX', hours: '06:00–18:00', type: 'day',   chip: AREA_COLORS.FLEX.chip.day, short: 'D12' },
  { id: 'FLEX-N12', label: 'FLEX Night 12h',area:'FLEX', hours: '18:00–06:00', type: 'night', chip: AREA_COLORS.FLEX.chip.night, short: 'N12' },
  { id: 'PED-D12',  label: 'PED Day 12h',  area: 'PED',  hours: '07:00–19:00', type: 'day',   chip: AREA_COLORS.PED.chip.day, short: 'D12' },
  { id: 'PED-N12',  label: 'PED Night 12h',area: 'PED',  hours: '19:00–07:00', type: 'night', chip: AREA_COLORS.PED.chip.night, short: 'N12' },
  // Open to EM Home (all 3 PGYs), BAMC, FM-1, and Peds PGY-2/3, all 7 days (see
  // PED_GUARD_LEGITIMATE_OWNER/BASE_ELIGIBILITY) — used to be EM-Home-PGY-2-on-EM/TOX-or-EM/EMS,
  // Mon/Tue/Thu/Fri only, but chief-confirmed against live QGenda that PED Swing genuinely runs
  // every day and every one of these categories actually staffs it. type:'swing' (not 'eve') so
  // it isn't subject to the eve→day-next-day circadian rule (it ends at 20:00, well clear of it).
  { id: 'PED-S',    label: 'PED Swing',    area: 'PED',    hours: '11:00–20:00', type: 'swing', chip: AREA_COLORS.PED.chip.swing, short: 'S' },
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
// otherwise DOW-independent by design — this is a narrow exception, not a general per-day-of-week
// coverage feature. TRAUMA-D/TRAUMA-N are must-fill-only-on-these-days (chief-directed AY26/27):
// these match the existing EM Home eligibility windows (trauma_day_gate/trauma_n_window
// shiftGates in DEFAULT_DAY_RULES) exactly, so this doesn't change WHO can work trauma, only stops
// coverage from demanding a min:1 body on a day the shift structurally can't be staffed at all
// (previously a phantom unfilled slot on every non-window day of every block).
// PED-S used to be Mon/Tue/Thu/Fri-only here (its old TOX/EMS rotation window) — chief-confirmed
// against live QGenda that PED Swing genuinely runs all 7 days, so PED-S carries no entry at all
// now (absence = unrestricted, per the "missing key" convention every SHIFT_DOW consumer already
// implements). Coverage stays {min:0,max:1}; most off-window days genuinely have nobody on it.
export const SHIFT_DOW = { 'TRAUMA-D': [0, 2, 4, 6], 'TRAUMA-N': [0, 1, 5, 6] };

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

// "Who else is around this shift" lookup for the grid's hover card / ShiftPickerModal's inline
// panel (see CLAUDE.md Phase 8) — one pure helper so both surfaces read the exact same answer.
// Mirrors checkRestViolations' cross-midnight approach (ResidentScheduler.jsx): exact-ms interval
// overlap via shiftStartMs/shiftEndMs, scanned across dateStr-1/dateStr/dateStr+1 rather than
// hand-rolled minute arithmetic per direction. A day/night/evening shift never exceeds 12h, so a
// same-shift-id hit on an adjacent date can never itself overlap the hovered instant — no special
// casing needed to keep "same shift, different date" out of the `same` bucket.
// `schedule` is the whole block.schedule map ({residentId: {dateStr: shiftId}}); `allResidents`
// must be the denormalized roster (EM + off-service) every other consumer in this app already
// uses, or off-service assignments won't show up here. `residentId` (optional) excludes the
// hovered resident from both buckets — "who ELSE is working" — since the 4-arg positional
// signature has no other way to identify who's being hovered.
export function overlappingAssignments(schedule, allResidents, dateStr, shiftId, { residentId } = {}) {
  const result = { same: [], overlapping: [] };
  const hovStart = shiftStartMs(shiftId, dateStr);
  if (hovStart === null) return result;
  const hovEnd = shiftEndMs(shiftId, dateStr);

  const refDate = parseDate(dateStr);
  const offsets = [-1, 0, 1];
  const groupMap = new Map(); // otherShiftId -> resident[] (in first-seen order; re-sorted below)

  for (const r of (allResidents || [])) {
    if (residentId != null && r.id === residentId) continue;
    const rs = schedule?.[r.id];
    if (!rs) continue;
    const name = `${r.firstName} ${r.lastName}`;
    for (const offset of offsets) {
      const checkDs = toDateStr(addDays(refDate, offset));
      const sid = rs[checkDs];
      if (!sid) continue;
      if (offset === 0 && sid === shiftId) { result.same.push({ id: r.id, name }); continue; }
      const exStart = shiftStartMs(sid, checkDs);
      if (exStart === null) continue;
      const exEnd = shiftEndMs(sid, checkDs);
      if (hovStart < exEnd && exStart < hovEnd) {
        if (!groupMap.has(sid)) groupMap.set(sid, []);
        groupMap.get(sid).push({ id: r.id, name });
      }
    }
  }

  result.overlapping = SHIFTS.filter(s => groupMap.has(s.id)).map(s => ({ shiftId: s.id, residents: groupMap.get(s.id) }));
  return result;
}

// Nearest scheduled shift before/after `dateStr` in one resident's own schedule row, plus the gap
// (hours) between each and `dateStr`'s own shift — lets a hover card/picker show "Xh before/after"
// without re-deriving rest-period math a second time. `rs` is one resident's {dateStr: shiftId}
// row (values may be null/undefined/an unrecognized id); if `dateStr` itself has no anchor shift
// there's nothing to measure a gap from, so both come back null. Builds the whole timeline fresh
// each call rather than caching it — blocks are ~28 days, a full sort per call is fine, same
// tradeoff validateAll's own per-resident timeline walk (ResidentScheduler.jsx) makes.
export function shiftGapsFor(rs, dateStr) {
  const result = { prev: null, next: null };
  const anchorSid = rs?.[dateStr];
  if (!anchorSid || !SHIFT_TIMING[anchorSid]) return result;

  const timeline = Object.entries(rs || {})
    .filter(([, sid]) => sid && SHIFT_TIMING[sid])
    .map(([ds, sid]) => ({ ds, sid, startMs: shiftStartMs(sid, ds), endMs: shiftEndMs(sid, ds) }))
    .sort((a, b) => a.startMs - b.startMs);

  const idx = timeline.findIndex(e => e.ds === dateStr);
  if (idx === -1) return result; // anchorSid checked above, but guard anyway

  if (idx > 0) {
    const p = timeline[idx - 1];
    result.prev = { ds: p.ds, sid: p.sid, gapH: (timeline[idx].startMs - p.endMs) / 3_600_000 };
  }
  if (idx < timeline.length - 1) {
    const n = timeline[idx + 1];
    result.next = { ds: n.ds, sid: n.sid, gapH: (n.startMs - timeline[idx].endMs) / 3_600_000 };
  }
  return result;
}

// Display idiom shared with checkRestViolations' own inline formatting (ResidentScheduler.jsx) —
// whole-hour gaps print bare ("34h"), fractional gaps print one decimal ("10.5h"). '' for a
// non-finite input rather than "NaNh"/"Infinityh".
export function formatGapH(h) {
  return Number.isFinite(h) ? `${h % 1 === 0 ? h : h.toFixed(1)}h` : '';
}

// True when this gap is shorter than the legally required rest — the earlier shift's own
// duration, same threshold checkRestViolations uses in ResidentScheduler.jsx (a 9h shift requires
// 9h rest before the next one starts). False for an unrecognized shift id or a non-finite gap.
export function gapIsShort(earlierShiftId, gapH) {
  const t = SHIFT_TIMING[earlierShiftId];
  return !!t && Number.isFinite(gapH) && gapH < t.durationH;
}
