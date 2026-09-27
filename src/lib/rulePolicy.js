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
//   'info'     — not a rule violation at all; the requirement it reports on is already fully
//                satisfied (by an explicitly-allowed substitute). A plain, non-blocking warn on
//                every surface (never in EXPORT_BLOCKING_RULE_IDS, no "override" confirm step) —
//                purely a flag so the chief can see the substitute fired. See R5 (2026-09-27 chief
//                decision, memory rule-override-policy) / podPgy2Substitute below.
export const RULE_POLICY = {
  // ─── Tier: acgme ──────────────────────────────────────────────────────────
  sixConsecutiveWorkDays: { tier: 'acgme', label: 'Max 6 consecutive work days, then 24h off' },
  sixDayRunRest: { tier: 'acgme', label: '24h off after a maxed 6-day work run' },
  nightRunMax: { tier: 'acgme', label: 'Max 6 consecutive night shifts' },
  eveToNextDayDay: { tier: 'acgme', label: 'Evening shift followed by a day shift the next day' },
  rolling80h: { tier: 'acgme', label: '80h/4-week rolling average' },
  vacation: { tier: 'acgme', label: 'Shift scheduled on a vacation date' },
  rotationEligibility: { tier: 'acgme', label: 'Not eligible for this rotation/PGY/day' },
  // R3 (2026-09-26 policy, memory acgme-em-work-hours): EM Program Requirements 6.17.a — EM
  // residents (EM_HOME/EM_BAMC) on a schedulable EM rotation only; off-service residents keep
  // rolling80h only. See src/lib/acgmeHours.js.
  restShiftLength: { tier: 'acgme', label: 'Rest less than the length of the shift just worked (6.17.a.2)' },
  edWeekly60: { tier: 'acgme', label: 'More than 60 scheduled ED hours in a rolling 7 days (6.17.a.3)' },
  totalWeekly72: { tier: 'acgme', label: 'More than 72 total hours in a rolling 7 days (6.17.a.3)' },

  // ─── Tier: program ────────────────────────────────────────────────────────
  dayToNextDayEve: { tier: 'program', label: 'Day shift followed by an evening shift the next day' },
  bamcWedNight: { tier: 'program', label: 'BAMC more than one Wednesday-night shift per block' },
  traumaPedsSplit: { tier: 'program', label: 'Trauma/Peds split sub-cap exceeded' },
  jcMaxPerAy: { tier: 'program', label: 'Journal Club worked more than 3x this academic year' },
  grLectureEveNight: { tier: 'program', label: 'Evening/night shift the day before own Grand Rounds lecture' },
  jeopardyCollision: { tier: 'program', label: 'Jeopardy call collides with a clinical shift' },
  // R4 (2026-09-26 policy): a jeopardy call on date D blocks the whole [D 07:00, D+1 07:00) window,
  // not just date D — see src/lib/jeopardyWindow.js. Distinct from jeopardyCollision (same-day
  // clinical shift on D itself, which stays its own rule id/message).
  jeopardyWindow: { tier: 'program', label: 'Overnight shift running into a jeopardy call window' },

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

  // ─── Tier: info ───────────────────────────────────────────────────────────
  // R5 (2026-09-27 chief decision): "During those rare instances [PGY-3s at conference or on
  // Wellness day] they should be replaced with a PGY-2." podPgy3Composition above already treats
  // this placement as fully satisfying the requirement (compositionSatisfies) — this id exists only
  // to flag that the substitute, not the true primary, covered it. FLEX has no mirror of this: the
  // chief's directive was POD/PGY-3-specific.
  podPgy2Substitute: { tier: 'info', label: 'POD covered by an EM PGY-2 substituting for an unavailable PGY-3' },
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
  if (tier === 'info') return 'warn'; // always a plain, non-blocking flag — see the tier's own comment
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
