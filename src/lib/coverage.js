// src/lib/coverage.js
// Daily shift-coverage min/max helpers, extracted from ResidentScheduler.jsx's CONSTANTS
// section. No React, no side effects at import time.

import { SHIFTS, SHIFT_MAP } from './shifts.js';

// Min/max residents needed per shift per day, used by Generate Schedule. The generator fills
// every shift to its minimum first (a hard requirement — below-min surfaces as an unfilled
// slot and a Validation warning), then optionally tops up toward the maximum only for residents
// still under their own shift-count target. min:0 means the generator never auto-staffs that
// shift (e.g. PED-N and PED-N-FM — PED-N is EM Home's 19:00–04:00 Peds night, Thu–Sun; PED-N-FM
// is the separate FM-3-only 23:00–08:00 Peds night, Mon/Tue/Wed — coverage stays min:0 for both,
// chief-directed "best-effort" shift, depends on the right resident being available and willing).
// Chief edits are stored as a
// sparse override object in localStorage (res_coverage) and merged over these defaults — same
// idiom as dayRules/eligOverrides. Min/max do NOT vary by day of week (one narrow exception:
// POD's Mon/Tue max bump, DOW_COVERAGE_MAX_OVERRIDE below); PED-S is the one shift whose very
// EXISTENCE varies by day of week, handled separately via SHIFT_DOW (see Chunk 3/PED-S).
export const DEFAULT_COVERAGE_MINMAX = {
  // Baseline min 2/max 2 every day; POD is chief-directed "no priority for a 3rd resident" outside
  // Mon/Tue (see DOW_COVERAGE_MAX_OVERRIDE) — a staffed POD shift also requires an EM PGY-3 with
  // no fallback exception except the block's own PGY-3 Wellness Wednesday (see
  // podWellnessSubstituteAllowed/SENIOR_COMPOSITION.POD).
  'POD-D': { min: 2, max: 2 }, 'POD-E': { min: 2, max: 2 }, 'POD-N': { min: 2, max: 2 },
  // PED-S: "no priority" per chief — best-effort fill only (min:0), same treatment as PED-N.
  // PED-N-FM is the FM-3-only 23:00–08:00 Peds night split out of PED-N (see the comment on
  // DEFAULT_COVERAGE_MINMAX above) — same best-effort min:0 treatment.
  'PED-D': { min: 1, max: 1 }, 'PED-E': { min: 1, max: 1 }, 'PED-N': { min: 0, max: 1 }, 'PED-S': { min: 0, max: 1 },
  'PED-N-FM': { min: 0, max: 1 },
  'FLEX-D': { min: 2, max: 3 }, 'FLEX-E': { min: 2, max: 3 }, 'FLEX-N': { min: 2, max: 3 },
  'MT-D': { min: 1, max: 1 }, 'MT-E': { min: 1, max: 1 }, 'MT-N': { min: 1, max: 1 },
  'TRAUMA-D': { min: 1, max: 1 }, 'TRAUMA-N': { min: 1, max: 1 },
  // 12h conference-week pairs — POD/MT/FLEX max = the sum of the day+eve (or plain N) shifts
  // they replace, since the 12h shift absorbs both; min = the D shift's own min (the hard
  // minimum stays the same headcount, just longer shifts). PED-D12/PED-N12 stay explicit
  // {min:0,max:0} — deliberately inactive by default, chief opts in via the Rules tab (see
  // DEFAULT_COVERAGE just below, which falls back to {min:1,max:1} for anything ABSENT from
  // this map — an explicit zero entry is required to keep these truly opt-in).
  'POD-D12':  { min: 2, max: 4 },   // POD-D's own min (2); max = POD-D.max + POD-E.max (2+2)
  'POD-N12':  { min: 2, max: 2 },   // unchanged from POD-N
  'MT-D12':   { min: 1, max: 2 },   // MT-D's own min (1); max = MT-D.max + MT-E.max (1+1)
  'MT-N12':   { min: 1, max: 1 },   // unchanged from MT-N
  'FLEX-D12': { min: 2, max: 6 },   // FLEX-D's own min (2); max = FLEX-D.max + FLEX-E.max (3+3)
  'FLEX-N12': { min: 2, max: 3 },   // unchanged from FLEX-N
  'PED-D12':  { min: 0, max: 0 },
  'PED-N12':  { min: 0, max: 0 },
};
export const DEFAULT_COVERAGE = Object.fromEntries(
  SHIFTS.map(s => [s.id, DEFAULT_COVERAGE_MINMAX[s.id] ?? { min: 1, max: 1 }])
);
// The one narrow day-of-week exception to "coverage min/max don't vary by day of week" (see the
// comment above DEFAULT_COVERAGE_MINMAX): POD's max rises to 3 on Mon/Tue only (chief-directed,
// AY26/27) — every other day of the week (and every other shift) stays at the plain base max.
// Keyed by shiftId → {dow: max}. Consulted only by getCoverageFor's optional dow param; the
// Rules-tab coverage editor itself stays min/max-only (see its one-line caption near the POD row).
export const DOW_COVERAGE_MAX_OVERRIDE = { 'POD-D': { 1: 3, 2: 3 }, 'POD-E': { 1: 3, 2: 3 }, 'POD-N': { 1: 3, 2: 3 } };

// Trauma bays are single-resident by nature (validateAll's own double-booking error) — clamped
// here, the one place every consumer (generator, validateAll, computeCoverageByDate) reads
// coverage through, so a legacy backup or hand-edited res_coverage entry above 1 can never make
// the generator and the validator disagree about what TRAUMA's minimum/maximum actually is.
const TRAUMA_SOLO_IDS = ['TRAUMA-D', 'TRAUMA-N'];

// Areas whose normal D/E/N shifts auto-suppress in favor of the 12h D12/N12 pair during any
// ACEP/AAEM/SAEM conference-week date. **No longer the live mechanism** — chief-definable
// 12-hour windows (below: TWELVE_HOUR_IDS/resolveTwelveHourWindows/twelveHourStateFor/
// getCoverageFor's state param) replaced the old confActive boolean. Kept exported because other
// files still import them (e.g. for the legacy id lists themselves), and
// implicitConferenceWindows derives its backward-compat ACEP/AAEM/SAEM windows over the same POD/
// MT/FLEX areas these arrays describe.
export const CONF_SUPPRESSED_NORMAL_IDS = ['POD-D','POD-E','POD-N','MT-D','MT-E','MT-N','FLEX-D','FLEX-E','FLEX-N'];
export const CONF_AUTO_SWAP_12H_IDS     = ['POD-D12','POD-N12','MT-D12','MT-N12','FLEX-D12','FLEX-N12'];

// ─── 12-HOUR SHIFT WINDOWS ───
// Chief-definable date windows (named, per-area, replace-or-add) during which an area's normal
// D/E/N shifts give way to (or are joined by) its 12h D12/N12 pair. Replaces the old hardcoded
// ACEP/AAEM/SAEM-only, POD/MT/FLEX-only, all-or-nothing confActive boolean — implicitConferenceWindows
// below reproduces that exact behavior for any ayConf that hasn't opted into the new
// ayConf.twelveHourWindows array yet, so nothing already saved changes shape.
export const TWELVE_HOUR_IDS = ['POD-D12','POD-N12','MT-D12','MT-N12','FLEX-D12','FLEX-N12','PED-D12','PED-N12'];
export const TWELVE_HOUR_AREAS = ['POD','MT','FLEX','PED'];

const TWELVE_HOUR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Each area's normal (non-12h, non-swing) shift ids — used to scope which coverage keys a window
// is allowed to override (its own 12h pair, plus its area's 9h shifts so an 'add'-mode window can
// also tune those without opening the door to editing an unrelated area's coverage). PED now has
// a 4th normal id here, PED-N-FM (a 'night' type like PED-N, not 12h, not 'swing' like PED-S) —
// intended: a PED 12h window can tune PED-N-FM's coverage the same as PED-D/PED-E/PED-N.
const AREA_NORMAL_IDS = TWELVE_HOUR_AREAS.reduce((acc, area) => {
  acc[area] = SHIFTS.filter(s => s.area === area && !TWELVE_HOUR_IDS.includes(s.id) && s.type !== 'swing').map(s => s.id);
  return acc;
}, {});

// Normalizes a possibly-untrusted 12h-window object (arrives from a JSON backup or a cloud row)
// into { id, label, start, end, areas, mode, coverage }, or returns null if the caller should
// drop it. id defaults to a value DERIVED from start+end (never Math.random/Date.now — this
// module must stay deterministic, the baseline generator tests depend on it).
export function normalizeTwelveHourWindow(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return null;
  const start = w.start;
  if (typeof start !== 'string' || !TWELVE_HOUR_DATE_RE.test(start)) return null;
  let end = w.end;
  if (end === undefined || end === null || end === '') {
    end = start;
  } else if (typeof end !== 'string' || !TWELVE_HOUR_DATE_RE.test(end) || end < start) {
    return null;
  }
  const areas = Array.isArray(w.areas) ? w.areas.filter(a => TWELVE_HOUR_AREAS.includes(a)) : [];
  if (areas.length === 0) return null;
  const mode = w.mode === 'add' ? 'add' : 'replace';

  const allowedCoverageIds = new Set([
    ...TWELVE_HOUR_IDS,
    ...areas.flatMap(a => AREA_NORMAL_IDS[a] || []),
  ]);
  const coverage = {};
  if (w.coverage && typeof w.coverage === 'object' && !Array.isArray(w.coverage)) {
    for (const [sid, v] of Object.entries(w.coverage)) {
      if (!allowedCoverageIds.has(sid)) continue;
      const norm = normalizeCoverageEntry(v);
      if (norm) coverage[sid] = norm;
    }
  }

  const id = typeof w.id === 'string' && w.id ? w.id : `12h_${start}_${end}`;
  const label = typeof w.label === 'string' ? w.label : '';
  return { id, label, start, end, areas, mode, coverage };
}

// Backward compat: reproduces today's ACEP/AAEM/SAEM confActive behavior as explicit 'replace'
// windows over POD/MT/FLEX (never PED — matches CONF_SUPPRESSED_NORMAL_IDS/CONF_AUTO_SWAP_12H_IDS
// today, PED's 12h pair stays a separate year-round opt-in). ITE (ayConf.iteDate) is deliberately
// EXCLUDED — it's a single exam day for the whole roster, not a conference-coverage scenario.
// A falsy start (missing OR '') is skipped — this is also the latent-bug fix: the old
// isConferenceCoverageDate/getCoverageFor(confActive) path used `!= null`, so an ayConf shaped
// like {} (fields undefined) or {acepStart:''} (fields empty string) either skipped the guard or
// read as "active", both of which could put every 12h id's non-zero DEFAULT_COVERAGE minimum live
// on every date. Falsy-start here means an unset conference date contributes no window at all.
export function implicitConferenceWindows(ayConf) {
  const conf = ayConf || {};
  const specs = [
    { startKey: 'acepStart', endKey: 'acepEnd', label: 'ACEP' },
    { startKey: 'aaemStart', endKey: 'aaemEnd', label: 'AAEM' },
    { startKey: 'saemStart', endKey: 'saemEnd', label: 'SAEM' },
  ];
  const windows = [];
  for (const { startKey, endKey, label } of specs) {
    const start = conf[startKey];
    if (!start) continue;
    const end = conf[endKey] || start;
    const w = normalizeTwelveHourWindow({
      start, end, label, mode: 'replace',
      areas: TWELVE_HOUR_AREAS.filter(a => a !== 'PED'),
    });
    if (w) windows.push(w);
  }
  return windows;
}

// Resolves the effective list of 12h windows for an AY: the chief's own ayConf.twelveHourWindows
// array (each entry normalized, invalid ones dropped, ORDER PRESERVED — overlap resolution in
// twelveHourStateFor depends on stable order) if present, else the implicit ACEP/AAEM/SAEM
// windows derived from the legacy conference-date fields. An explicit [] means "no windows this
// AY" and must NOT fall back to the implicit list.
export function resolveTwelveHourWindows(ayConf) {
  if (Array.isArray(ayConf?.twelveHourWindows)) {
    return ayConf.twelveHourWindows.map(normalizeTwelveHourWindow).filter(Boolean);
  }
  return implicitConferenceWindows(ayConf);
}

// Resolves every window active on dateStr into a single state object. ALWAYS returns
// { replaceAreas: Set, addAreas: Set, covOverride: {} } — empty sets/object on an ordinary date,
// NEVER null/undefined. This is the load-bearing contract for the whole feature: a null return
// here would hit getCoverageFor's old-style `!= null` guard and fall through to DEFAULT_COVERAGE,
// putting every 12h id's non-zero minimum live on every date of every block.
export function twelveHourStateFor(dateStr, ayConf) {
  const state = { replaceAreas: new Set(), addAreas: new Set(), covOverride: {} };
  const windows = resolveTwelveHourWindows(ayConf);
  for (const w of windows) {
    if (dateStr < w.start || dateStr > w.end) continue;
    for (const area of w.areas) {
      if (w.mode === 'add') state.addAreas.add(area);
      else state.replaceAreas.add(area);
    }
    for (const [sid, cov] of Object.entries(w.coverage)) {
      state.covOverride[sid] = cov; // later windows in the (order-preserved) list win
    }
  }
  // Replace beats add for the same area on the same date, regardless of which window (replace or
  // add) for that area happened to be processed first in window order.
  for (const area of state.replaceAreas) state.addAreas.delete(area);
  return state;
}

// Eligibility predicate: is shiftId available at all on the date twelveHourStateFor resolved into
// `state`? Caller owns the state===undefined case (e.g. "no date context" call sites) — this
// function assumes a defined state object.
export function twelveHourAllows(shiftId, state) {
  const area = SHIFT_MAP[shiftId]?.area;
  if (!TWELVE_HOUR_IDS.includes(shiftId)) {
    // Normal id: suppressed only if its area is under a 'replace' window today.
    return !(area && state.replaceAreas.has(area));
  }
  // PED's 12h pair is deliberately absent from the conference auto-swap mechanism (today's
  // CONF_AUTO_SWAP_12H_IDS never included it either) — always eligible, gated purely by its own
  // coverage numbers (the Rules-tab year-round opt-in), not by window membership.
  if (shiftId === 'PED-D12' || shiftId === 'PED-N12') return true;
  return state.replaceAreas.has(area) || state.addAreas.has(area);
}

// Normalizes a possibly-untrusted coverage entry (old single-number shape from a pre-update
// backup, a hand-edited value, or the current {min,max} shape) into {min,max}. Read-time
// normalization means old backups and existing localStorage restore correctly with no migration.
export function normalizeCoverageEntry(v) {
  if (typeof v === 'number' && Number.isFinite(v)) { const n = Math.max(0, v | 0); return { min: n, max: n }; }
  if (v && typeof v === 'object') {
    const min = Math.max(0, Number(v.min) || 0);
    return { min, max: Math.max(min, Number(v.max) || 0) };
  }
  return null;
}
// dow is optional (0-6, Sunday-first) — when provided and DOW_COVERAGE_MAX_OVERRIDE has an entry
// for this shiftId+dow, the max is raised to that override (never lowered below the base max, so
// a chief who's already customized a higher max via the Rules tab editor is never clipped back
// down by this narrow exception). min is never touched by dow.
//
// `state` is a twelveHourStateFor(dateStr, ayConf) result, or undefined. undefined means "caller
// has no date context" — plain base lookup, and a 12h id with no date context resolves to its own
// DEFAULT_COVERAGE (that's what the Rules-tab editor renders, since it isn't tied to one date). No
// boolean is ever accepted here any more (see twelveHourStateFor's own comment for why a null/
// undefined *state* would be dangerous — an undefined *shiftId lookup result* is a different,
// intentional thing).
function applyTraumaClampAndDow(shiftId, base, dow) {
  let result = base;
  if (TRAUMA_SOLO_IDS.includes(shiftId)) result = { min: Math.min(result.min, 1), max: Math.min(result.max, 1) };
  if (dow != null) {
    const override = DOW_COVERAGE_MAX_OVERRIDE[shiftId]?.[dow];
    if (override != null && override > result.max) result = { min: result.min, max: override };
  }
  return result;
}

export function getCoverageFor(shiftId, coverage = {}, dow, state) {
  if (state !== undefined) {
    const area = SHIFT_MAP[shiftId]?.area;
    const is12h = TWELVE_HOUR_IDS.includes(shiftId);
    const isPed12h = shiftId === 'PED-D12' || shiftId === 'PED-N12';
    const inReplace = !!area && state.replaceAreas.has(area);
    const inAdd = !!area && state.addAreas.has(area);

    // 1. Normal id whose area is under a 'replace' window today → hard zero, no further clamping.
    if (!is12h && inReplace) return { min: 0, max: 0 };

    // 2. 12h id whose area is under NEITHER set today → hard zero, EXCEPT PED-D12/PED-N12 (the
    //    year-round opt-in, which falls through to the untouched base path below instead).
    if (is12h && !isPed12h && !inReplace && !inAdd) return { min: 0, max: 0 };

    // 3. 12h id whose area IS active today (replace or add) → covOverride, else explicit chief
    //    override, else (replace ? DEFAULT_COVERAGE : {0,0}) — the add-mode {0,0} default matters:
    //    without it, checking POD ('add') would demand POD-D/E/N *plus* POD-D12/N12, guaranteeing
    //    an unfillable day. This step must run AFTER the explicit-chief-override check above it,
    //    or a chief's existing Rules-tab PED-D12 {1,1} opt-in would get zeroed on exactly the dates
    //    they just enabled it for.
    if (is12h && (inReplace || inAdd)) {
      const mode = inReplace ? 'replace' : 'add';
      let base;
      if (state.covOverride[shiftId] !== undefined) {
        base = state.covOverride[shiftId];
      } else if (Object.prototype.hasOwnProperty.call(coverage, shiftId) && normalizeCoverageEntry(coverage[shiftId]) != null) {
        base = normalizeCoverageEntry(coverage[shiftId]);
      } else {
        base = mode === 'replace' ? (DEFAULT_COVERAGE[shiftId] ?? { min: 0, max: 0 }) : { min: 0, max: 0 };
      }
      return applyTraumaClampAndDow(shiftId, base, dow);
    }
    // 4. Every other shift (including PED-D12/PED-N12 with no active window) falls through.
  }

  const base = normalizeCoverageEntry(coverage[shiftId]) ?? DEFAULT_COVERAGE[shiftId] ?? { min: 0, max: 0 };
  return applyTraumaClampAndDow(shiftId, base, dow);
}
