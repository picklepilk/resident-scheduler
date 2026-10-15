// src/lib/slotFixes.js
// Pure search for "legal after 1-2 changes to their own schedule" plans (step 2 of the
// 2026-10-15 coverage-board plan) — given the `blocked` bucket findSlotCandidates.js already
// computed for one empty (dateStr, shiftId) slot, tries a bounded search of drop/move/handoff edits
// to each fixable resident's OWN nearby shifts until the candidate placement is fully hard-clean.
// Lib-legal (lib/* may never import ResidentScheduler.jsx) — every schedule-domain predicate is
// injected as a PARAMETER, same trick src/lib/cellAlternatives.js and src/lib/sickCallCover.js use;
// reuses cellAlternatives.js's findGiveCandidates for the 'handoff' edit instead of re-deriving its
// legality math.
import { findGiveCandidates } from './cellAlternatives.js';
import { RULE_POLICY } from './rulePolicy.js';
import { parseDate, toDateStr, addDays } from './dates.js';

function hasOverrideTierViolation(violations) {
  return (violations || []).some(v => RULE_POLICY[v.rule]?.tier === 'override');
}

// The hard-rule ids a blocked resident may be fixed out of by editing THEIR OWN nearby shifts (see
// CLAUDE.md "Scheduling rules" + rulePolicy.js) — rest-gap, circadian (night-run length, eve->day
// turnaround), the 6-consecutive-work-day streak + its 24h-rest-after mirror, the ACGME weekly/
// rolling hour caps, and the night-count/night-stint caps. Deliberately excludes anything that isn't
// about THIS resident's own nearby placements — eligibility failures (vacation, rotation
// eligibility, jeopardy collision/window, approved day off, Wellness Wednesday, ...), trauma-run
// cap, BAMC Wednesday-night, trauma/peds split, Journal Club max, and senior-composition rules are
// never "fixable" this way (dropping/moving ONE shift doesn't resolve them, or they're not about the
// candidate's own schedule at all).
const FIXABLE_HARD_RULE_IDS = new Set([
  'restShiftLength',
  'eveToNextDayDay',
  'nightRunMax',
  'sixConsecutiveWorkDays',
  'sixDayRunRest',
  'rolling80h',
  'edWeekly60',
  'totalWeekly72',
  'nightsTotalBlock',
  'nightStintCount',
]);

// A blocked entry (findSlotCandidates.js shape) is fixable here when every one of its reasons is
// either the synthetic 'ownShift' blocker (resident already works dateStr — free it, then recheck
// eligibility/hard-clean from scratch) or one of FIXABLE_HARD_RULE_IDS above. An 'eligibility' or
// 'locked' blocker (or any hard-rule reason outside the fixable set) disqualifies the resident
// entirely — a partial plan that still leaves one unfixable reason standing is not offered.
export function isFixableBlocked(entry) {
  if (!entry || !Array.isArray(entry.reasons) || !entry.reasons.length) return false;
  const kinds = entry.blockerKinds || [];
  if (kinds.includes('eligibility') || kinds.includes('locked')) return false;
  if (kinds.includes('ownShift')) return true;
  return entry.reasons.every(r => FIXABLE_HARD_RULE_IDS.has(r.rule));
}

// Immutable schedule-cell setter (same trick cellAlternatives.js's clearCell uses) — never mutates
// the schedule object a caller passed in.
function withCell(schedule, residentId, dateStr, shiftId) {
  const row = { ...((schedule || {})[residentId] || {}) };
  if (shiftId == null) delete row[dateStr]; else row[dateStr] = shiftId;
  return { ...(schedule || {}), [residentId]: row };
}

// Date strings within +/- windowDays of centerDateStr, nearest first (interleaved -1,+1,-2,+2,...).
function datesByDistance(centerDateStr, windowDays, includeCenter) {
  const center = parseDate(centerDateStr);
  const out = [];
  if (includeCenter) out.push({ d: toDateStr(center), dist: 0 });
  for (let n = 1; n <= windowDays; n++) {
    out.push({ d: toDateStr(addDays(center, -n)), dist: n });
    out.push({ d: toDateStr(addDays(center, n)), dist: n });
  }
  return out.map(o => o.d);
}

// Caller-supplied dates, reordered nearest-to-centerDateStr first (ties: earlier date first) so a
// 'move' prefers the closest legal target, same as the default window's order.
function sortByDistance(centerDateStr, dates) {
  const c = parseDate(centerDateStr).getTime();
  return dates
    .map(d => ({ d, dist: Math.abs(parseDate(d).getTime() - c) }))
    .sort((a, b) => a.dist - b.dist || (a.d < b.d ? -1 : 1))
    .map(o => o.d);
}

// This resident's OWN non-empty, unlocked cells within the window, nearest-to-dateStr first
// (dateStr itself sorts first, at distance 0, which is exactly the cell an 'ownShip'/allWorking
// blocker needs freed). Bounded to the first `limit` candidates — complexity control, not a
// correctness requirement (a resident rarely has more than one or two relevant own-shifts this
// close to the target date).
function ownEditableDates(scratch, residentId, lockedCells, dateStr, windowDays, limit, inBlock) {
  const out = [];
  for (const d of datesByDistance(dateStr, windowDays, true)) {
    if (inBlock && !inBlock.has(d)) continue; // never edit a date outside the block
    const sid = (scratch[residentId] || {})[d];
    if (!sid) continue;
    if (lockedCells?.[residentId]?.[d]) continue; // locked cells are never edited
    out.push({ dateStr: d, shiftId: sid });
    if (out.length >= limit) break;
  }
  return out;
}

// Re-validates every still-occupied touched cell against the latest scratch schedule — an edit
// elsewhere (e.g. dropping a neighboring night shift) can change the rest/circadian context for a
// cell an EARLIER edit in this same plan already placed, so every touched cell is rechecked after
// each new edit, not just once at the end.
function revalidateTouched(hardViolations, touched, scratch) {
  for (const t of touched) {
    if (t.shiftId == null) continue; // now empty — nothing to validate
    const hard = hardViolations(t.residentId, t.dateStr, t.shiftId, scratch) || [];
    if (hard.length) return false;
  }
  return true;
}

function replaceTouch(touched, residentId, dateStr, shiftId) {
  const next = touched.filter(t => !(t.residentId === residentId && t.dateStr === dateStr));
  next.push({ residentId, dateStr, shiftId });
  return next;
}

// Depth-first search of edit sequences (drop / move / handoff) to `residentId`'s own nearby shifts,
// trying to make the final (dateStr, shiftId) placement fully hard-clean and override-free. Collects
// up to `maxPlansPerResident` successful plans into `plansOut`. Deterministic order: nearest own
// date first, drop before move before handoff, nearest searchDates target first, best (first-ranked)
// handoff recipient only.
function search(ctx, residentId, scratch, touched, edits, depthLeft, plansOut) {
  if (plansOut.length >= ctx.maxPlansPerResident) return;

  const busy = !!(scratch[residentId] || {})[ctx.dateStr];
  if (!busy) {
    const hardFinal = ctx.hardViolations(residentId, ctx.dateStr, ctx.shiftId, scratch) || [];
    if (!hardFinal.length && ctx.isEligible(residentId, ctx.dateStr, ctx.shiftId)) {
      const soft = ctx.softViolations(residentId, ctx.dateStr, ctx.shiftId, scratch) || [];
      if (!hasOverrideTierViolation(soft) && revalidateTouched(ctx.hardViolations, touched, scratch)) {
        plansOut.push({ residentId, edits: edits.slice(), final: { dateStr: ctx.dateStr, shiftId: ctx.shiftId } });
        return;
      }
    }
  }

  if (depthLeft <= 0) return;

  const ownDates = ownEditableDates(scratch, residentId, ctx.lockedCells, ctx.dateStr, ctx.windowDays, ctx.maxEditCandidatesPerLevel, ctx.inBlock);

  for (const { dateStr: d, shiftId: sAtD } of ownDates) {
    if (plansOut.length >= ctx.maxPlansPerResident) return;

    // 1. DROP — only if the shift stays >= its coverage min after removal.
    const covD = ctx.coverageFor(sAtD, d) || {};
    const minD = covD.min ?? 0;
    const countD = covD.count ?? 0;
    if (countD - 1 >= minD) {
      const scratch2 = withCell(scratch, residentId, d, null);
      const touched2 = replaceTouch(touched, residentId, d, null);
      if (revalidateTouched(ctx.hardViolations, touched2, scratch2)) {
        search(ctx, residentId, scratch2, touched2, [...edits, { kind: 'drop', fromDate: d, shiftId: sAtD }], depthLeft - 1, plansOut);
      }
    }
    if (plansOut.length >= ctx.maxPlansPerResident) return;

    // 2. MOVE — to another date in the search window where this resident is free, eligible, it has
    // headroom (count < max), and it creates no hard violation.
    const scratchWithoutD = withCell(scratch, residentId, d, null);
    let moveChecks = 0;
    for (const t of ctx.searchDates) {
      if (plansOut.length >= ctx.maxPlansPerResident) break;
      if (t === d || t === ctx.dateStr) continue;
      if (ctx.lockedCells?.[residentId]?.[t]) continue;
      if ((scratchWithoutD[residentId] || {})[t]) continue; // not free
      if (!ctx.isEligible(residentId, t, sAtD)) continue;
      // Bound the expensive hard-rule checks per own date (nearest targets come first).
      if (++moveChecks > ctx.maxMoveCandidatesPerLevel) break;
      const hardAtT = ctx.hardViolations(residentId, t, sAtD, scratchWithoutD) || [];
      if (hardAtT.length) continue;
      const covT = ctx.coverageFor(sAtD, t) || {};
      const maxT = covT.max ?? Infinity;
      const countT = covT.count ?? 0;
      if (countT >= maxT) continue;
      const scratch2 = withCell(scratchWithoutD, residentId, t, sAtD);
      const touched2 = replaceTouch(replaceTouch(touched, residentId, d, null), residentId, t, sAtD);
      if (revalidateTouched(ctx.hardViolations, touched2, scratch2)) {
        search(ctx, residentId, scratch2, touched2, [...edits, { kind: 'move', fromDate: d, shiftId: sAtD, toDate: t }], depthLeft - 1, plansOut);
      }
    }
    if (plansOut.length >= ctx.maxPlansPerResident) return;

    // 3. HANDOFF — give this own shift to another free+eligible+hard-clean resident (reuses
    // cellAlternatives.js's findGiveCandidates rather than re-deriving its legality math; no
    // eligibilityReason/targetInfo here, so only outright-eligible, non-override, hard-clean
    // recipients are offered — the best-ranked one is taken).
    const giveCandidates = findGiveCandidates({
      residentId, dateStr: d, shiftId: sAtD, residents: ctx.residents, schedule: scratchWithoutD,
      lockedCells: ctx.lockedCells, isEligible: ctx.isEligible, eligibilityReason: undefined,
      hardViolations: ctx.hardViolations, softViolations: ctx.softViolations, targetInfo: () => ({}),
    }).filter(c => !c.needsOverride);
    if (giveCandidates.length) {
      const recipientId = giveCandidates[0].residentId;
      const scratch2 = withCell(scratchWithoutD, recipientId, d, sAtD);
      const touched2 = replaceTouch(replaceTouch(touched, residentId, d, null), recipientId, d, sAtD);
      if (revalidateTouched(ctx.hardViolations, touched2, scratch2)) {
        search(ctx, residentId, scratch2, touched2, [...edits, { kind: 'handoff', fromDate: d, shiftId: sAtD, toResidentId: recipientId }], depthLeft - 1, plansOut);
      }
    }
  }
}

// findFixablePlans({ dateStr, shiftId, blocked, residents, schedule, lockedCells, coverageFor,
//   isEligible, hardViolations, softViolations, maxEdits = 2, maxResidents = 10,
//   maxPlansPerResident = 2, searchDates }) -> [{ residentId, edits: [...], final: {dateStr, shiftId} }]
//
//   blocked — the `blocked` array findSlotCandidates.js returned for this same (dateStr, shiftId).
//   coverageFor(shiftId, dateStr) => { min, max, count }.
//   searchDates — optional list of candidate dates for a 'move' edit's target (reordered nearest
//     first); defaults to +/- 7 days of dateStr, nearest first.
//   blockDates — the block's own date list. When given, every edited or target date is clamped to
//     it, so a plan never touches a date outside the block (no view would show that change).
//
// Only attempts residents whose blocker reasons are "own-schedule fixable" (see
// FIXABLE_HARD_RULE_IDS / isFixableBlocked above); eligibility failures, jeopardy, vacation/
// approved-off are never attempted. Each edit touches only that resident's OWN shifts (or a
// handoff recipient's matching empty cell) within +/- 7 days of dateStr; locked cells are never
// edited. A plan is only returned once every touched cell is hard-clean and the final placement is
// hard-clean and does not need an override. Processes at most `maxResidents` blocked entries (in
// the order given) and returns at most `maxPlansPerResident` plans per resident — bounded work, not
// an exhaustive search.
export function findFixablePlans({
  dateStr, shiftId, blocked, residents, schedule, lockedCells, coverageFor,
  isEligible, hardViolations, softViolations,
  maxEdits = 2, maxResidents = 10, maxPlansPerResident = 2, searchDates, blockDates,
}) {
  const windowDays = 7;
  const inBlock = Array.isArray(blockDates) ? new Set(blockDates) : null;
  const targets = (searchDates ? sortByDistance(dateStr, searchDates) : datesByDistance(dateStr, windowDays, false))
    .filter(d => !inBlock || inBlock.has(d));
  const ctx = {
    dateStr, shiftId,
    residents: residents || [],
    lockedCells: lockedCells || {},
    coverageFor, isEligible, hardViolations, softViolations,
    searchDates: targets,
    inBlock,
    windowDays,
    maxEditCandidatesPerLevel: 4,
    maxMoveCandidatesPerLevel: 8,
    maxPlansPerResident,
  };

  const out = [];
  let processed = 0;
  for (const entry of blocked || []) {
    if (processed >= maxResidents) break;
    if (!isFixableBlocked(entry)) continue;
    processed++;
    const plansOut = [];
    search(ctx, entry.residentId, schedule, [], [], maxEdits, plansOut);
    out.push(...plansOut);
  }
  return out;
}
