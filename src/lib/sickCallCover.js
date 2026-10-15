// src/lib/sickCallCover.js
// Pure candidate math for the "Cover a sick call" chief workflow: given a resident out sick (or
// needing an ad-hoc day off after the block is published) over a date range, find every shift they
// were scheduled for in that range and, for each, rank legal candidates to cover it. Lib-legal
// (lib/* may never import ResidentScheduler.jsx) — reuses findGiveCandidates from
// cellAlternatives.js for the actual legality/eligibility math rather than re-deriving it, and
// takes every schedule-domain helper (eligibility, hard/soft violations, target/assigned counts,
// jeopardy-for-date, night/weekend tallies) as a PARAMETER, same trick cellAlternatives.js and
// scheduleGrouping.js use.
import { findGiveCandidates } from './cellAlternatives.js';

// Sorts a date's ranked candidate list: needsOverride always sorts last (same posture as
// cellAlternatives.js's byDeficitThenSoftCount — a candidate requiring an explicit rule override
// never outranks one that doesn't, regardless of its other numbers). Among candidates that are
// equally not-needing-override, a resident on jeopardy THAT DATE sorts first — "who's already on
// call" is the natural first cover (CLAUDE.md "jeopardy tracks ... the natural first cover"). Then
// under-target first (bigger deficit first), then fewest shifts this block, then — only for a
// night/weekend shift — fewest nights/weekends this block, then fewest soft violations.
function rankForCover(candidates, { jeopardyIds, nightWeekendCountFor, isNightOrWeekend }) {
  const withTieBreaks = candidates.map(c => ({
    ...c,
    isJeopardy: jeopardyIds.has(c.residentId),
    nightWeekendCount: isNightOrWeekend && nightWeekendCountFor ? nightWeekendCountFor(c.residentId) : null,
  }));
  withTieBreaks.sort((a, b) => {
    const overrideDiff = Number(!!a.needsOverride) - Number(!!b.needsOverride);
    if (overrideDiff) return overrideDiff;
    const jeopDiff = Number(!!b.isJeopardy) - Number(!!a.isJeopardy);
    if (jeopDiff) return jeopDiff;
    if (a.deficit !== b.deficit) return b.deficit - a.deficit;
    if (a.count !== b.count) return a.count - b.count;
    if (isNightOrWeekend && a.nightWeekendCount !== b.nightWeekendCount) return a.nightWeekendCount - b.nightWeekendCount;
    return a.softCount - b.softCount;
  });
  return withTieBreaks;
}

// -> [{ dateStr, shiftId, locked, candidates: [...ranked] }]
// One entry per date in `dates` where `sickResidentId` actually had a shift assigned — a date with
// no shift (vacation, already off, day outside their schedule) contributes nothing, there's
// nothing to cover. `locked` mirrors block.lockedCells for that cell: findGiveCandidates already
// returns [] for a locked source cell (the "skip with a note" half of the locked-cell contract —
// see CLAUDE.md "locked cells untouchable"), surfaced here as a flag so the UI can say WHY the
// candidate list is empty instead of rendering it identically to "no legal candidate exists".
//
// jeopardyResidentIdsFor(dateStr) => Set<string>|string[] (optional) — residents on jeopardy that
// date; omitting it just means no candidate ever sorts as "on jeopardy" (never throws).
// nightWeekendCountFor(residentId) => number (optional) — only consulted as a TIEBREAK, and only
// for a night/weekend shift (isNightOrWeekendShift(shiftId, dateStr) => boolean, optional, defaults
// to false — a day-shift cover race never reaches for it).
export function findSickCallCoverage({
  sickResidentId, dates, schedule, residents, lockedCells,
  isEligible, eligibilityReason, hardViolations, softViolations, targetInfo,
  jeopardyResidentIdsFor, nightWeekendCountFor, isNightOrWeekendShift,
}) {
  const out = [];
  for (const dateStr of dates || []) {
    const shiftId = (schedule || {})[sickResidentId]?.[dateStr] || null;
    if (!shiftId) continue;
    const locked = !!lockedCells?.[sickResidentId]?.[dateStr];
    const rawCandidates = findGiveCandidates({
      residentId: sickResidentId, dateStr, shiftId, residents, schedule, lockedCells,
      isEligible, eligibilityReason, hardViolations, softViolations, targetInfo,
    });
    const jeopardyRaw = jeopardyResidentIdsFor ? jeopardyResidentIdsFor(dateStr) : null;
    const jeopardyIds = jeopardyRaw instanceof Set ? jeopardyRaw : new Set(jeopardyRaw || []);
    const isNightOrWeekend = isNightOrWeekendShift ? !!isNightOrWeekendShift(shiftId, dateStr) : false;
    const candidates = rankForCover(rawCandidates, { jeopardyIds, nightWeekendCountFor, isNightOrWeekend });
    out.push({ dateStr, shiftId, locked, candidates });
  }
  return out;
}
