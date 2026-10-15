// src/lib/slotCandidates.js
// Pure candidate math for the Coverage tab's empty-slot panel (step 1 of the 2026-10-15
// coverage-board plan). Given one (dateStr, shiftId) empty slot, partitions the whole roster into
// legal / override-needed / blocked buckets. Lib-legal (lib/* may never import
// ResidentScheduler.jsx) — every schedule-domain predicate (eligibility, hard/soft violations,
// target/assigned counts, night/weekend tallies) is injected as a PARAMETER, the exact trick
// src/lib/cellAlternatives.js and src/lib/sickCallCover.js already use. rulePolicy.js is itself a
// lib module (pure, no ResidentScheduler.jsx import), so importing it directly here is lib-legal.
import { RULE_POLICY } from './rulePolicy.js';

// Same posture as cellAlternatives.js's hasOverrideTierViolation: a soft violation whose rule id is
// tiered 'override' in rulePolicy.js means "the generator never does this, but a chief may confirm
// it by hand" — not re-exported from cellAlternatives.js, so redefined here (same one-liner).
function hasOverrideTierViolation(violations) {
  return (violations || []).some(v => RULE_POLICY[v.rule]?.tier === 'override');
}

// target may be null (self-cover / fully bought down) — a resident with no target has no distance
// to measure and ranks last, never treated as maximally under target (same as cellAlternatives.js).
function underTargetScore(info) {
  const { count = 0, target = null } = info || {};
  return target == null ? -Infinity : target - count;
}

// Ranking shared by the legal/override buckets: under target first (biggest deficit first), then
// fewest shifts this block, then — only for a night/weekend shift — fewest nights/weekends this
// block, then fewest soft violations. Mirrors sickCallCover.js's rankForCover tiebreak ladder minus
// the jeopardy-first tiebreak (not applicable to an empty-slot fill).
function rankCandidates(list, { shiftId, dateStr, isNightOrWeekendShift, nightWeekendCountFor }) {
  const isNightOrWeekend = isNightOrWeekendShift ? !!isNightOrWeekendShift(shiftId, dateStr) : false;
  const withTieBreaks = list.map(c => ({
    ...c,
    nightWeekendCount: isNightOrWeekend && nightWeekendCountFor ? nightWeekendCountFor(c.residentId) : null,
  }));
  withTieBreaks.sort((a, b) => {
    if (a.deficit !== b.deficit) return b.deficit - a.deficit;
    if (a.count !== b.count) return a.count - b.count;
    if (isNightOrWeekend && a.nightWeekendCount !== b.nightWeekendCount) return a.nightWeekendCount - b.nightWeekendCount;
    return a.softCount - b.softCount;
  });
  return withTieBreaks;
}

// findSlotCandidates({ dateStr, shiftId, residents, schedule, lockedCells, isEligible,
//   eligibilityReason, hardViolations, softViolations, targetInfo, isNightOrWeekendShift?,
//   nightWeekendCountFor? }) -> { legal, override, blocked }
//
//   isEligible(residentId, dateStr, shiftId) => boolean
//   eligibilityReason(residentId, dateStr, shiftId) => { rule, tier, label } | null — mirrors
//     ResidentScheduler.jsx's eligibilityBlockReasons; only consulted when !isEligible. A
//     'override'-tier reason still offers the candidate (bucketed `override`, tagged needsOverride)
//     instead of silently dropping it — same posture as cellAlternatives.js's
//     ineligibleButOverridable. Its `label` (or `.message`, if a caller's stub prefers that key)
//     becomes the blocked reason's display text when the reason ISN'T overridable.
//   hardViolations(residentId, dateStr, shiftId, scheduleOverride = schedule) => array of
//     { rule, message } — HARD (acgme/program tier, 'error' level) violations for a hypothetical
//     placement.
//   softViolations(residentId, dateStr, shiftId, scheduleOverride = schedule) => array of
//     { rule, message } — SOFT ('warn' level) violations, override-tier or advisory.
//   targetInfo(residentId) => { count, target }.
//   isNightOrWeekendShift(shiftId, dateStr) => boolean / nightWeekendCountFor(residentId) => number
//     — optional, only consulted as a tiebreak for a night/weekend shift (same contract as
//     sickCallCover.js).
//
// A resident is considered only if NOT already working `dateStr` (schedule[rid][dateStr] empty);
// already-working residents are blocked outright with reason 'allWorking' (kind 'ownShift') — the
// exact set slotFixes.js knows how to try to resolve by editing that resident's own schedule.
//
// legal = eligible outright + zero hard violations + no override-tier soft violation.
// override = needsOverride exactly as cellAlternatives.js's finders define it (eligible only via an
//   override-tier reason, and/or carries an override-tier soft violation) but otherwise hard-clean.
// blocked = everything else, carrying the reasons (eligibilityReason text when not eligible, else
//   the hard violation messages/rules) plus a coarse `blockerKinds` tag array for the UI's
//   why-not grouping: 'ownShift' (already working), 'eligibility' (acgme/program-tier ineligible),
//   'hardRule' (eligible but a hard rule fires on this hypothetical placement).
//
// classifyResidentForSlot() is the single-resident core of the loop below, extracted (2026-10-15,
// under-target explainer) so src/lib/underTargetExplainer.js can ask the exact same "is this
// resident placeable in THIS (date,shift)" question while looping over SLOTS for one fixed
// resident, instead of over RESIDENTS for one fixed slot — same predicates, same bucketing, no
// second hand-written copy of the eligibility/hard/soft decision tree. Returns
// { bucket: 'blocked', entry: { residentId, reasons, blockerKinds } } or
// { bucket: 'legal'|'override', entry: { residentId, count, target, softViolations, softCount,
//   deficit, needsOverride } } — callers that only need ranking (findSlotCandidates) or only need
// the blocked shape (underTargetExplainer) each read the half they want.
export function classifyResidentForSlot({
  residentId, dateStr, shiftId, schedule, lockedCells,
  isEligible, eligibilityReason, hardViolations, softViolations, targetInfo,
}) {
  const row = (schedule || {})[residentId] || {};

  if (lockedCells?.[residentId]?.[dateStr]) {
    // Defensive — an empty cell shouldn't normally be locked, but never offer to fill one that is.
    return { bucket: 'blocked', entry: { residentId, reasons: [{ rule: 'locked', message: 'Cell is locked' }], blockerKinds: ['locked'] } };
  }

  if (row[dateStr]) {
    return {
      bucket: 'blocked',
      entry: {
        residentId,
        reasons: [{ rule: 'allWorking', message: `Already working ${row[dateStr]} this date` }],
        blockerKinds: ['ownShift'],
      },
    };
  }

  const eligibleOutright = isEligible(residentId, dateStr, shiftId);
  if (!eligibleOutright) {
    const reason = eligibilityReason ? eligibilityReason(residentId, dateStr, shiftId) : null;
    const overridable = reason?.tier === 'override';
    if (!overridable) {
      return {
        bucket: 'blocked',
        entry: {
          residentId,
          reasons: [{ rule: reason?.rule || 'ineligible', message: reason?.label || reason?.message || 'Not eligible for this shift' }],
          blockerKinds: ['eligibility'],
        },
      };
    }
  }

  const hard = hardViolations(residentId, dateStr, shiftId, schedule) || [];
  if (hard.length) {
    return {
      bucket: 'blocked',
      entry: {
        residentId,
        reasons: hard.map(v => ({ rule: v.rule, message: v.message })),
        blockerKinds: ['hardRule'],
      },
    };
  }

  const soft = softViolations(residentId, dateStr, shiftId, schedule) || [];
  const info = targetInfo ? (targetInfo(residentId) || {}) : {};
  const needsOverride = !eligibleOutright || hasOverrideTierViolation(soft);
  const entry = {
    residentId, count: info.count ?? 0, target: info.target ?? null,
    softViolations: soft, softCount: soft.length, deficit: underTargetScore(info),
    needsOverride,
  };
  return { bucket: needsOverride ? 'override' : 'legal', entry };
}

export function findSlotCandidates({
  dateStr, shiftId, residents, schedule, lockedCells,
  isEligible, eligibilityReason, hardViolations, softViolations, targetInfo,
  isNightOrWeekendShift, nightWeekendCountFor,
}) {
  const legal = [];
  const override = [];
  const blocked = [];

  for (const r of residents || []) {
    if (!r) continue;
    const result = classifyResidentForSlot({
      residentId: r.id, dateStr, shiftId, schedule, lockedCells,
      isEligible, eligibilityReason, hardViolations, softViolations, targetInfo,
    });
    if (result.bucket === 'blocked') blocked.push(result.entry);
    else if (result.bucket === 'override') override.push(result.entry);
    else legal.push(result.entry);
  }

  const rankOpts = { dateStr, shiftId, isNightOrWeekendShift, nightWeekendCountFor };
  return {
    legal: rankCandidates(legal, rankOpts),
    override: rankCandidates(override, rankOpts),
    blocked,
  };
}
