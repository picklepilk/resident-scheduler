// src/lib/unfilledExplainer.js
// Pure, ResidentScheduler-agnostic summarizer for the per-slot `blockers`/`nearMiss` diagnostics
// that computeUnfilledDiagnostics (ResidentScheduler.jsx, next to candidatePool/
// firstBlockingReason) attaches to each report.unfilled entry — see that function's own header
// for what populates them and why. Groups those per-slot annotations by shiftId so
// GenerationReportCard can render one compact "why" line per shift instead of per date. Pure
// function, no React, and — per CLAUDE.md ("src/lib/* modules are pure and may never import
// ResidentScheduler.jsx") — no import of the big file; it only ever reads the plain-JSON shape
// report.unfilled already carries.
//
// `unfilledSlots` is `report.unfilled`: an array of
//   { dateStr, shiftId, slotIndex, reason, blockers?: {reasonId: count}, nearMiss?: [{residentId, reason}] }
// `blockers`/`nearMiss` are optional — an older persisted report (generated before this feature,
// or a solver-service result that never ran computeUnfilledDiagnostics) carries neither, and a
// slot missing both contributes zero to blockerTotals/nearMissResidents (callers should treat an
// empty result as "nothing to show", not as an error).

// Reasons that explain why NO ONE could even be considered for the slot, not why a considered
// resident fell short — excluded from `topBlocker` unless they're the only reasons present, same
// "excluding unless they're the only ones" rule GenerationReportCard's old noEligible-only
// handling already used.
const TRIVIAL_BLOCKERS = new Set(['noEligible', 'allWorking']);

function pickTopBlocker(blockerTotals) {
  const keys = Object.keys(blockerTotals);
  if (!keys.length) return null;
  const nonTrivial = keys.filter(k => !TRIVIAL_BLOCKERS.has(k));
  const pool = nonTrivial.length ? nonTrivial : keys;
  let best = pool[0];
  for (const k of pool) if (blockerTotals[k] > blockerTotals[best]) best = k;
  return best;
}

// `softRank` is ResidentScheduler.jsx's NEAR_MISS_SOFT_RANK (reason -> number, lower = softer) —
// passed in because this module may never import the big file (see header). Defaults to "every
// reason equally soft" so a caller that doesn't pass one still gets a (count-only, then insertion
// order) ranking instead of a crash.
const DEFAULT_SOFT_RANK = () => 0;

// Returns { [shiftId]: { slots, blockerTotals, topBlocker, nearMissResidents, closestResidents } }:
//   slots            — how many unfilled report.unfilled entries carry this shiftId
//   blockerTotals     — {reasonId: count} summed across every slot's own `blockers` histogram
//   topBlocker        — the single most common non-trivial reason (see pickTopBlocker), or null
//                        when no slot for this shift carried a `blockers` histogram at all
//   nearMissResidents — {residentId: count}, how many slots listed this resident as a near miss
//   closestResidents  — [{residentId, reason, rank, count}], one entry per resident who appeared
//                        in ANY slot's nearMiss for this shift; `reason`/`rank` are that resident's
//                        SOFTEST reason across every slot (lowest softRank), `count` is how many
//                        slots they near-missed. Sorted by rank asc, then count desc — ties left in
//                        first-seen order since this module has no resident names to break them;
//                        a caller wanting a name tiebreak re-sorts this (already rank/count-correct)
//                        list rather than recomputing rank or count.
export function summarizeSlotBlockers(unfilledSlots, softRank = DEFAULT_SOFT_RANK) {
  const byShift = {};
  for (const u of (unfilledSlots || [])) {
    if (!u || !u.shiftId) continue;
    const entry = (byShift[u.shiftId] ??= { slots: 0, blockerTotals: {}, nearMissResidents: {}, nearMissBest: {} });
    entry.slots += 1;
    if (u.blockers) {
      for (const [reason, count] of Object.entries(u.blockers)) {
        entry.blockerTotals[reason] = (entry.blockerTotals[reason] || 0) + count;
      }
    }
    if (Array.isArray(u.nearMiss)) {
      for (const nm of u.nearMiss) {
        if (!nm || !nm.residentId) continue;
        entry.nearMissResidents[nm.residentId] = (entry.nearMissResidents[nm.residentId] || 0) + 1;
        const rank = softRank(nm.reason);
        const best = entry.nearMissBest[nm.residentId];
        if (!best || rank < best.rank) entry.nearMissBest[nm.residentId] = { reason: nm.reason, rank };
      }
    }
  }
  for (const entry of Object.values(byShift)) {
    entry.topBlocker = pickTopBlocker(entry.blockerTotals);
    entry.closestResidents = Object.keys(entry.nearMissResidents)
      .map(residentId => ({
        residentId,
        count: entry.nearMissResidents[residentId],
        reason: entry.nearMissBest[residentId].reason,
        rank: entry.nearMissBest[residentId].rank,
      }))
      .sort((a, b) => a.rank - b.rank || b.count - a.count);
    delete entry.nearMissBest;
  }
  return byShift;
}
