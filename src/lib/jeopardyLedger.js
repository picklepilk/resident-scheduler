// src/lib/jeopardyLedger.js
// Advisory-only ledger for the jeopardy "buy-down" policy: every real-world jeopardy
// activation earns the activated resident a credit toward reduced shifts in a future block;
// the chief spends that credit later via a per-resident, per-block targetDelta. Nothing here
// writes to a schedule or feeds the generator/scorer — it only reports numbers for a chief to
// look at. Pure module: no React, must never import ResidentScheduler.jsx (circular).
//
// Consumed shapes (defined/owned elsewhere, not by this file):
//   log entry:        { id, date /* 'YYYY-MM-DD' */, shiftId, sickResidentId,
//                        activatedResidentId /* nullable */, note, at }
//   block assignment:  block.emBlockAssignments[residentId] =
//                        { blockType, isChief, targetDelta, targetNote, targetIsBuyDown }
//
// All inputs are treated as untrusted — this data round-trips through JSON backups and a
// shared cloud row, so a malformed record/snapshot is skipped, never thrown on.

import { getAcademicYearFor } from './dates.js';

// -> { [residentId]: { sickCalls: number, activations: number } }
// One log record drives both counts, so they can never disagree with each other. A record
// with no activatedResidentId still counts the sick call — it just doesn't credit anyone.
//
// Note the absence semantics here vs. computeAyPriorTotals (ResidentScheduler.jsx): there,
// a resident missing from the map means "no history — do not read as zero" (zero would read
// as maximally under-worked and unfairly hammer a resident newest to the roster). HERE, a
// resident missing from the map genuinely means zero sick calls / zero activations — there is
// no "unknown" state for an incident log, only "no incidents". Callers may safely treat an
// absent id as { sickCalls: 0, activations: 0 }.
export function computeJeopardyTotals(ay, log = []) {
  const out = {};
  if (!Array.isArray(log)) return out;

  const ensure = (rid) => {
    if (!out[rid]) out[rid] = { sickCalls: 0, activations: 0 };
    return out[rid];
  };

  for (const rec of log) {
    if (!rec || typeof rec !== 'object') continue;
    if (typeof rec.date !== 'string' || !rec.date) continue;
    if (!rec.sickResidentId) continue;

    let recAy;
    try { recAy = getAcademicYearFor(rec.date); } catch { continue; }
    if (recAy !== ay) continue;

    ensure(rec.sickResidentId).sickCalls++;
    if (rec.activatedResidentId) {
      ensure(rec.activatedResidentId).activations++;
    }
  }

  return out;
}

// -> { [residentId]: number }   (total buy-down shifts spent this AY)
//
// DIVERGENCE FROM PRECEDENT, INTENTIONAL: countPublishedJC/computeAyPriorTotals (both in
// ResidentScheduler.jsx) read PUBLISHED snapshots only, because they feed fairness SCORING and
// a draft block must never move the generator. This function counts PUBLISHED AND UNPUBLISHED
// snapshots on purpose — it reports an advisory count of an administrative promise. A buy-down
// the chief enters on a draft block is already real: the resident is already scheduled for
// fewer shifts the moment the chief types the negative targetDelta, whether or not that block
// has been published. Counting published-only here would show a phantom "remaining" credit and
// invite the chief spending the same buy-down twice on two different drafts. Nothing in the
// generator/scorer reads this function, so the usual reason for the published-only convention
// (protect the generator from draft state) does not apply.
export function computeBuyDownsApplied(ay, block, blocksHistory = []) {
  const out = {};

  const addAssignments = (assignments) => {
    if (!assignments || typeof assignments !== 'object') return;
    for (const [rid, a] of Object.entries(assignments)) {
      if (!a || typeof a !== 'object') continue;
      if (a.targetIsBuyDown !== true) continue;
      const delta = a.targetDelta;
      if (!Number.isFinite(delta) || delta >= 0) continue;
      out[rid] = (out[rid] || 0) + (-delta);
    }
  };

  if (Array.isArray(blocksHistory)) {
    for (const snap of blocksHistory) {
      if (!snap || typeof snap !== 'object') continue;
      // The single easiest bug to introduce here: skip the snapshot that mirrors the live
      // block (same id) and add the LIVE block separately below, using its in-memory
      // (possibly newer-than-saved) emBlockAssignments. Without this, a block already saved
      // to blocksHistory would be counted twice — once from its snapshot, once as `block`.
      if (block && block.id != null && snap.id === block.id) continue;
      const snapAy = snap.academicYear || snap.data?.academicYear;
      if (snapAy !== ay) continue;
      addAssignments(snap.data?.emBlockAssignments);
    }
  }

  if (block && typeof block === 'object') {
    let blockAy = block.academicYear;
    if (!blockAy && typeof block.startDate === 'string' && block.startDate) {
      try { blockAy = getAcademicYearFor(block.startDate); } catch { blockAy = undefined; }
    }
    if (blockAy === ay) addAssignments(block.emBlockAssignments);
  }

  return out;
}

// -> { [residentId]: { sickCalls, activations, applied, remaining } }
// remaining = activations - applied, NOT clamped at zero — a negative remaining means the
// chief has over-spent this resident's buy-downs, which is exactly the thing the chief needs
// to see, not have silently hidden by a floor.
export function computeLedger(ay, log, block, blocksHistory) {
  const totals = computeJeopardyTotals(ay, log);
  const applied = computeBuyDownsApplied(ay, block, blocksHistory);

  const ids = new Set([...Object.keys(totals), ...Object.keys(applied)]);
  const out = {};
  for (const rid of ids) {
    const t = totals[rid] || { sickCalls: 0, activations: 0 };
    const a = applied[rid] || 0;
    out[rid] = {
      sickCalls: t.sickCalls,
      activations: t.activations,
      applied: a,
      remaining: t.activations - a,
    };
  }
  return out;
}
