// src/lib/coverage.js
// Daily shift-coverage min/max helpers, extracted from ResidentScheduler.jsx's CONSTANTS
// section. No React, no side effects at import time.

import { SHIFTS } from './shifts.js';

// Min/max residents needed per shift per day, used by Generate Schedule. The generator fills
// every shift to its minimum first (a hard requirement — below-min surfaces as an unfilled
// slot and a Validation warning), then optionally tops up toward the maximum only for residents
// still under their own shift-count target. min:0 means the generator never auto-staffs that
// shift (e.g. PED-N, which depends on an FM-3 Mon/Tue/Wed or an EM Home resident Thu/Sun being
// available and willing — coverage stays min:0 either way, chief-directed "best-effort" shift).
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
  'PED-D': { min: 1, max: 1 }, 'PED-E': { min: 1, max: 1 }, 'PED-N': { min: 0, max: 1 }, 'PED-S': { min: 0, max: 1 },
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
// ACEP/AAEM/SAEM conference-week date (see isConferenceCoverageDate) — PED's 12h shifts exist
// too but are deliberately NOT in these arrays, staying chief-opt-in year-round instead.
export const CONF_SUPPRESSED_NORMAL_IDS = ['POD-D','POD-E','POD-N','MT-D','MT-E','MT-N','FLEX-D','FLEX-E','FLEX-N'];
export const CONF_AUTO_SWAP_12H_IDS     = ['POD-D12','POD-N12','MT-D12','MT-N12','FLEX-D12','FLEX-N12'];

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
export function getCoverageFor(shiftId, coverage = {}, dow, confActive) {
  if (confActive != null) {
    if (CONF_SUPPRESSED_NORMAL_IDS.includes(shiftId)) return confActive ? { min: 0, max: 0 } : getCoverageFor(shiftId, coverage, dow);
    if (CONF_AUTO_SWAP_12H_IDS.includes(shiftId))     return confActive ? getCoverageFor(shiftId, coverage, dow) : { min: 0, max: 0 };
  }
  const base = normalizeCoverageEntry(coverage[shiftId]) ?? DEFAULT_COVERAGE[shiftId] ?? { min: 0, max: 0 };
  if (TRAUMA_SOLO_IDS.includes(shiftId)) return { min: Math.min(base.min, 1), max: Math.min(base.max, 1) };
  if (dow != null) {
    const override = DOW_COVERAGE_MAX_OVERRIDE[shiftId]?.[dow];
    if (override != null && override > base.max) return { min: base.min, max: override };
  }
  return base;
}
