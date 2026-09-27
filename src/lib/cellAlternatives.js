// src/lib/cellAlternatives.js
// Pure candidate math for the Schedule tab's cell inspector (P3 of the chief-review-loop plan).
// Lib-legal (lib/* may never import ResidentScheduler.jsx): every helper that needs
// schedule-domain logic — eligibility, hard/soft rule violations, target/assigned counts,
// coverage — is injected as a PARAMETER by the caller, same trick lib/scheduleGrouping.js uses
// for CATEGORIES/BLOCK_TYPES_EM/isEmResident.
//
// Shared vocabulary across all three finders:
//   residents    — the resident list (only `.id` is read here; the caller resolves display
//                  fields like name/PGY onto the returned candidates itself).
//   schedule     — the CURRENT schedule map { residentId: { dateStr: shiftId|null } }.
//   lockedCells  — the CURRENT block.lockedCells map { residentId: { dateStr: true } }.
//   isEligible(residentId, dateStr, shiftId) => boolean
//       Whether shiftId is in that resident's eligible-shift list for that date
//       (getEligibleShifts membership) — already excludes vacation/approved-off/
//       off-service-unavailable dates and any jeopardy 'block'-policy conflict, since those are
//       exactly what getEligibleShifts itself excludes (see CLAUDE.md).
//   hardViolations(residentId, dateStr, shiftId, scheduleOverride = schedule) => array
//   softViolations(residentId, dateStr, shiftId, scheduleOverride = schedule) => array
//       Both mirror cellViolations(...).filter(v => v.level==='error'|'warn') for a HYPOTHETICAL
//       placement of shiftId on residentId at dateStr, evaluated against scheduleOverride (a
//       full schedule map) instead of the live one — the same "clear the cell(s) being moved
//       first" trick ScheduleGrid's own handleDrop/scheduleClearing uses, so neither side of a
//       swap sees its own about-to-be-vacated shift as a phantom double-booking. Only the length
//       of the hard array is used for filtering; the soft array is surfaced to the UI verbatim.
//   targetInfo(residentId) => { count, target } — target may be null (self-cover / fully bought
//       down, see getShiftTarget); a resident with no target has no distance to measure and is
//       ranked last, never treated as maximally under target.
//
// Every finder returns candidates already sorted, MOST relevant first, and does NOT truncate to
// "top 5" itself — that's a UI concern (slice + "show more"); this is cheap for ~25 residents x a
// handful of shifts, so there's no need to short-circuit here.

function underTargetScore(info) {
  const { count = 0, target = null } = info || {};
  return target == null ? -Infinity : target - count;
}

function byDeficitThenSoftCount(a, b) {
  return (b.deficit - a.deficit) || (a.softCount - b.softCount);
}

// Clears `dateStr` from `residentId`'s row in a copy of the full schedule map — local twin of
// ScheduleGrid's own scheduleClearing, kept here (rather than injected) since it's plain object
// manipulation with no schedule-domain rule knowledge.
function clearCell(schedule, residentId, dateStr) {
  const row = { ...((schedule || {})[residentId] || {}) };
  delete row[dateStr];
  return { ...(schedule || {}), [residentId]: row };
}

// A. "Give to" — residents free this date who could take THIS shift instead of residentId.
export function findGiveCandidates({
  residentId, dateStr, shiftId, residents, schedule, lockedCells,
  isEligible, hardViolations, softViolations, targetInfo,
}) {
  const out = [];
  for (const r of residents || []) {
    if (!r || r.id === residentId) continue;
    const row = (schedule || {})[r.id] || {};
    if (row[dateStr]) continue; // not free that day (busy)
    if (lockedCells?.[r.id]?.[dateStr]) continue; // defensive — an empty cell shouldn't be locked, but never touch one if it is
    if (!isEligible(r.id, dateStr, shiftId)) continue;
    const hard = hardViolations(r.id, dateStr, shiftId, schedule) || [];
    if (hard.length) continue;
    const soft = softViolations(r.id, dateStr, shiftId, schedule) || [];
    const info = targetInfo(r.id) || {};
    out.push({
      residentId: r.id, count: info.count ?? 0, target: info.target ?? null,
      softViolations: soft, softCount: soft.length, deficit: underTargetScore(info),
    });
  }
  return out.sort(byDeficitThenSoftCount);
}

// B. "Swap with" — residents working a DIFFERENT shift the same date, where trading shifts
// leaves BOTH cells clean (zero hard violations on either side), validated the same way
// ScheduleGrid's handleDrop validates a drag-drop swap: each side is checked with the OTHER
// side's cell cleared first.
export function findSwapCandidates({
  residentId, dateStr, shiftId, residents, schedule, lockedCells,
  isEligible, hardViolations, softViolations, targetInfo,
}) {
  if (lockedCells?.[residentId]?.[dateStr]) return []; // defensive — inspector never offers this for a locked source cell
  const scheduleWithoutSource = clearCell(schedule, residentId, dateStr);
  const out = [];
  for (const r of residents || []) {
    if (!r || r.id === residentId) continue;
    if (lockedCells?.[r.id]?.[dateStr]) continue; // never touch a locked cell on the other side
    const otherShiftId = (schedule || {})[r.id]?.[dateStr] || null;
    if (!otherShiftId || otherShiftId === shiftId) continue; // must be working a DIFFERENT shift that day
    if (!isEligible(r.id, dateStr, shiftId)) continue;           // candidate must be able to take the source's shift
    if (!isEligible(residentId, dateStr, otherShiftId)) continue; // source must be able to take the candidate's shift
    const scheduleWithoutCandidate = clearCell(schedule, r.id, dateStr);
    const hardCandidateSide = hardViolations(r.id, dateStr, shiftId, scheduleWithoutSource) || [];
    const hardSourceSide = hardViolations(residentId, dateStr, otherShiftId, scheduleWithoutCandidate) || [];
    if (hardCandidateSide.length || hardSourceSide.length) continue;
    const softCandidateSide = softViolations(r.id, dateStr, shiftId, scheduleWithoutSource) || [];
    const softSourceSide = softViolations(residentId, dateStr, otherShiftId, scheduleWithoutCandidate) || [];
    const soft = [...softCandidateSide, ...softSourceSide];
    const info = targetInfo(r.id) || {};
    out.push({
      residentId: r.id, otherShiftId, count: info.count ?? 0, target: info.target ?? null,
      softViolations: soft, softCount: soft.length, deficit: underTargetScore(info),
    });
  }
  return out.sort(byDeficitThenSoftCount);
}

// C. "Assign" — shifts residentId could take on this (currently empty) date, under coverage
// max, ranked by coverage shortfall (below-minimum shifts first, biggest gap first; then by
// remaining headroom, most room first).
export function findAssignOptions({
  residentId, dateStr, candidateShiftIds, schedule, lockedCells,
  hardViolations, softViolations, coverageFor,
}) {
  if (lockedCells?.[residentId]?.[dateStr]) return [];
  const out = [];
  for (const sid of candidateShiftIds || []) {
    const cov = coverageFor(sid) || { count: 0, min: 0, max: Infinity };
    if (cov.count >= cov.max) continue; // no headroom
    const hard = hardViolations(residentId, dateStr, sid, schedule) || [];
    if (hard.length) continue;
    const soft = softViolations(residentId, dateStr, sid, schedule) || [];
    out.push({
      shiftId: sid, count: cov.count, min: cov.min, max: cov.max,
      shortfall: cov.min - cov.count, softViolations: soft, softCount: soft.length,
    });
  }
  return out.sort((a, b) => {
    const aBelow = a.shortfall > 0, bBelow = b.shortfall > 0;
    if (aBelow !== bBelow) return aBelow ? -1 : 1;
    if (aBelow) return (b.shortfall - a.shortfall) || (a.softCount - b.softCount);
    const aHeadroom = a.max - a.count, bHeadroom = b.max - b.count;
    return (bHeadroom - aHeadroom) || (a.softCount - b.softCount);
  });
}
