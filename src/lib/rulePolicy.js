// src/lib/rulePolicy.js
// One table for "how hard is this rule" — chief-approved policy from 2026-09-26 (memory
// `rule-override-policy`). Every rule id used by validateAll/checkCircadianViolations/
// cellViolations/getEligibleShifts-derived ineligibility reasons lives here exactly once, so the
// generator (never breaks any of these), the validator (severityFor(..., 'validator')) and hand
// edits (severityFor(..., 'handEdit') — picker/drag-drop/inspector) can't drift on what a given
// rule id means. Pure, lib-legal (no import of ResidentScheduler.jsx).
//
// Tiers:
//   'acgme'    — accreditation-required, never broken, anywhere. No "place anyway" path.
//   'program'  — chief-decided hard policy, blocks everywhere exactly like 'acgme' (the two tiers
//                differ in WHY they're hard, not in how hard they are — see severityFor).
//   'override' — the generator never breaks these either, but a chief may break one by hand: the
//                validator downgrades it to a flagged warning (and it counts toward export-blocking
//                warnings — see EXPORT_BLOCKING_RULE_IDS in ResidentScheduler.jsx) and a hand-edit
//                surface must ask for an explicit confirmation before applying it.
export const RULE_POLICY = {
  // ─── Tier: acgme ──────────────────────────────────────────────────────────
  sixConsecutiveWorkDays: { tier: 'acgme', label: 'Max 6 consecutive work days, then 24h off' },
  sixDayRunRest: { tier: 'acgme', label: '24h off after a maxed 6-day work run' },
  nightRunMax: { tier: 'acgme', label: 'Max 6 consecutive night shifts' },
  eveToNextDayDay: { tier: 'acgme', label: 'Evening shift followed by a day shift the next day' },
  rolling80h: { tier: 'acgme', label: '80h/4-week rolling average' },
  vacation: { tier: 'acgme', label: 'Shift scheduled on a vacation date' },
  rotationEligibility: { tier: 'acgme', label: 'Not eligible for this rotation/PGY/day' },

  // ─── Tier: program ────────────────────────────────────────────────────────
  dayToNextDayEve: { tier: 'program', label: 'Day shift followed by an evening shift the next day' },
  bamcWedNight: { tier: 'program', label: 'BAMC more than one Wednesday-night shift per block' },
  traumaPedsSplit: { tier: 'program', label: 'Trauma/Peds split sub-cap exceeded' },
  jcMaxPerAy: { tier: 'program', label: 'Journal Club worked more than 3x this academic year' },
  grLectureEveNight: { tier: 'program', label: 'Evening/night shift the day before own Grand Rounds lecture' },
  jeopardyCollision: { tier: 'program', label: 'Jeopardy call collides with a clinical shift' },

  // ─── Tier: override ───────────────────────────────────────────────────────
  nightsTotalBlock: { tier: 'override', label: 'More than 6 night shifts total this block' },
  nightStintCount: { tier: 'override', label: 'More than 2 separate night stints this block' },
  traumaRunCap: { tier: 'override', label: 'More than 2 Trauma Night shifts in one night run' },
  podPgy3Composition: { tier: 'override', label: 'POD shift missing its required PGY-3' },
  flexSeniorComposition: { tier: 'override', label: 'FLEX shift missing its required senior PGY' },
  wellnessWednesday: { tier: 'override', label: 'Wellness Wednesday day/evening shift' },
  academicChiefTueEveNight: { tier: 'override', label: 'Academic chief scheduled Tuesday evening/night' },
  approvedDayOff: { tier: 'override', label: 'Shift scheduled on an approved day off' },
  finalSundayOvernight: { tier: 'override', label: 'Final-Sunday overnight leaving the ED for a non-continuing rotation' },
  pedNightSwingOwnerGuard: { tier: 'override', label: "Peds night/swing shift given to a non-owner category" },
};

// All rule ids whose tier is 'override' — the exact set a hand-edit surface must show a confirm
// step for (severityFor handles the acgme/program "just block" side on its own). Exported so
// callers that need the raw id list (e.g. EXPORT_BLOCKING_RULE_IDS in ResidentScheduler.jsx,
// cellAlternatives.js's tier-aware ranking) don't re-filter RULE_POLICY themselves.
export const OVERRIDE_TIER_RULE_IDS = Object.keys(RULE_POLICY).filter(id => RULE_POLICY[id].tier === 'override');

// severityFor(ruleId, surface) — the ONE place a rule id becomes a concrete level.
//   surface 'validator': acgme/program -> 'error' (matches how validateAll has always treated a
//     hard rule); override -> 'warn' (flagged, but review-panel/export-blocking still show it).
//   surface 'handEdit': acgme/program -> 'error' (blocking — the picker/drag-drop/inspector must
//     never offer a "place/move anyway" path for these); override -> 'confirm' (the caller shows
//     an explicit "Override program rule" step; NOT a bare warn — a hand edit is an ACTION, not a
//     retrospective report, so it needs its own affirmative step before it's allowed through).
// An unrecognized/untiered ruleId (a custom per-resident work restriction has no policy tier of its
// own, for instance) defaults to the strictest reading ('error') on both surfaces — a rule this
// table doesn't understand should never accidentally become quietly overridable.
export function severityFor(ruleId, surface) {
  const tier = RULE_POLICY[ruleId]?.tier;
  if (surface === 'validator') {
    if (tier === 'override') return 'warn';
    return 'error'; // acgme, program, or unrecognized
  }
  if (surface === 'handEdit') {
    if (tier === 'override') return 'confirm';
    return 'error'; // acgme, program, or unrecognized
  }
  return 'warn';
}
