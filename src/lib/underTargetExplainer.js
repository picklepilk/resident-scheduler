// src/lib/underTargetExplainer.js
// Pure "why is this ONE resident still under target, and what can actually be done about it"
// scan — the Violations-tab companion to computeUnderTargetDiagnostics (ResidentScheduler.jsx,
// next to candidatePool/firstBlockingReason). That generator-side diagnostic answers "how many
// open slots existed and which rule stopped each one" in aggregate (one blockedBy histogram);
// this module answers the chief's actual follow-up question — "which of those slots could I fill
// right now, which need a small schedule edit first, and which are genuinely closed" — for a
// single resident so the Violations tab can offer one-click actions, not just a tally.
//
// Lib-legal (src/lib/* may never import ResidentScheduler.jsx, CLAUDE.md) — every schedule-domain
// predicate (eligibility, hard/soft violations, target/assigned counts, coverage) is injected as a
// PARAMETER, the same trick cellAlternatives.js/sickCallCover.js/slotCandidates.js/slotFixes.js all
// use. Reuses slotCandidates.js's classifyResidentForSlot (same eligibility/hard/soft decision
// tree the Coverage board's SlotPanel already relies on, just driven one resident x many slots
// instead of one slot x many residents) and slotFixes.js's isFixableBlocked (same FIXABLE_HARD_
// RULE_IDS vocabulary) rather than re-deriving either.
import { classifyResidentForSlot } from './slotCandidates.js';
import { isFixableBlocked } from './slotFixes.js';
import { shiftActiveOnDow } from './shifts.js';
import { parseDate } from './dates.js';

// scanUnderTargetSlots({ residentId, dates, shifts, schedule, lockedCells, isEligible,
//   eligibilityReason, hardViolations, softViolations, targetInfo, coverageFor }) ->
//   { legal, override, blockedFixable, blockedOther, blockerTotals, noHeadroomCount, scanned }
//
//   dates  — the block's own date strings (e.g. getBlockDates(block.startDate, block.endDate)).
//   shifts — the shift catalog to scan (SHIFTS) — every entry needs an `.id`.
//   coverageFor(shiftId, dateStr) => { min, max, count } — same contract SlotPanel's
//     coverageForAny already uses (built from shiftActiveOnDow/twelveHourStateFor/getCoverageFor,
//     never a forked coverage computation — CLAUDE.md "never fork coverage math").
//
// For every (date, shift) this resident is NOT already working, with the shift active that
// weekday:
//   - no headroom (coverageFor's count >= max) -> tallied in `noHeadroomCount`, nothing else is
//     computed for that pair (there is no slot to place them in regardless of their own
//     eligibility/rules, so it is never counted as a missed opportunity).
//   - legal / override (classifyResidentForSlot's own buckets) -> pushed to `legal`/`override`,
//     each entry carrying its own {dateStr, shiftId} alongside the usual count/target/
//     needsOverride/softViolations shape, ready for a direct "Assign" action.
//   - blocked -> tallied into `blockerTotals` by rule id; also sorted into `blockedFixable` (every
//     reason is one of slotFixes.js's FIXABLE_HARD_RULE_IDS or the synthetic 'ownShift' blocker —
//     see isFixableBlocked) vs `blockedOther` (an eligibility/locked block, or a hard rule
//     slotFixes.js has no own-schedule fix for — trauma/peds split, Journal Club max, seniority,
//     etc.). Only `blockedFixable` entries are worth handing to slotFixes.js's findFixablePlans;
//     `blockedOther` is display-only (the "blocked by" tally already covers it).
//
// Already-working dates are skipped silently (not a missed opportunity, nothing to tally) — same
// exclusion computeUnderTargetDiagnostics and unfilledExplainer.js's TRIVIAL_BLOCKERS both apply to
// 'allWorking'. A resident with zero (date,shift) pairs scanned (e.g. an empty `dates`/`shifts`
// list) returns all-empty buckets, never throws.
export function scanUnderTargetSlots({
  residentId, dates, shifts, schedule, lockedCells,
  isEligible, eligibilityReason, hardViolations, softViolations, targetInfo, coverageFor,
}) {
  const legal = [];
  const override = [];
  const blockedFixable = [];
  const blockedOther = [];
  const blockerTotals = {};
  let noHeadroomCount = 0;
  let scanned = 0;

  for (const ds of dates || []) {
    const dow = parseDate(ds).getDay();
    for (const shift of shifts || []) {
      const shiftId = shift?.id;
      if (!shiftId || !shiftActiveOnDow(shiftId, dow)) continue;

      const result = classifyResidentForSlot({
        residentId, dateStr: ds, shiftId, schedule, lockedCells,
        isEligible, eligibilityReason, hardViolations, softViolations, targetInfo,
      });
      // Already working this date (on ANY shift) — not a missed opportunity for this slot, and
      // not worth a headroom lookup; skip entirely, same as computeUnderTargetDiagnostics' own
      // `if (schedule[r.id][ds]) continue`.
      if (result.bucket === 'blocked' && result.entry.blockerKinds.includes('ownShift')) continue;

      scanned++;
      const cov = coverageFor ? (coverageFor(shiftId, ds) || {}) : {};
      const max = cov.max ?? Infinity;
      const count = cov.count ?? 0;
      if (count >= max) { noHeadroomCount++; continue; }

      // belowMin: taking this slot also fills a coverage hole, so it sorts first.
      const belowMin = count < (cov.min ?? 0);
      if (result.bucket === 'legal') { legal.push({ dateStr: ds, shiftId, belowMin, ...result.entry }); continue; }
      if (result.bucket === 'override') { override.push({ dateStr: ds, shiftId, belowMin, ...result.entry }); continue; }

      const entry = { dateStr: ds, shiftId, ...result.entry };
      for (const r of entry.reasons) blockerTotals[r.rule] = (blockerTotals[r.rule] || 0) + 1;
      if (isFixableBlocked(entry)) blockedFixable.push(entry); else blockedOther.push(entry);
    }
  }

  // Stable: below-min slots first, otherwise date order.
  const holesFirst = (a, b) => (b.belowMin ? 1 : 0) - (a.belowMin ? 1 : 0);
  legal.sort(holesFirst);
  override.sort(holesFirst);
  return { legal, override, blockedFixable, blockedOther, blockerTotals, noHeadroomCount, scanned };
}

// Top N {rule, count} entries from a scan's blockerTotals, most common first (ties: first-seen
// order, same stable-sort posture as unfilledExplainer.js's pickTopBlocker) — the "WHY" tally line
// ("blocked by: rest (6), 60h weekly cap (3), eligibility (2)") the Violations tab renders above
// whichever suggestion (assign / fix / buy-down) scanUnderTargetSlots' own buckets support.
export function topBlockerReasons(blockerTotals, n = 4) {
  return Object.entries(blockerTotals || {})
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
