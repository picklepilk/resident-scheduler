// src/lib/optimizerSweep.js
// Pure helpers for the "What-If Optimization Sweep" decision-support feature (see
// ResidentScheduler.jsx's `runOptimizationSweep`, ported from sibling em-scheduler's
// `runOptimizationAnalysis`). No React, no generator/validator calls, no ResidentScheduler.jsx
// import (same rule as coverageComposition.js/scheduleQuality.js — a lib module may never import
// that file, which imports lib/* the other direction) — everything here is plain-data in,
// plain-data out, so it's unit-testable without spinning up a generation run.

import { compareVectors } from './scheduleQuality.js';

// ─── Schedule diff ──────────────────────────────────────────────────────────
// Compares two {residentId: {dateStr: shiftId}} maps (the app's schedule shape) and returns,
// per resident, the list of date cells that differ, plus aggregate counts. A cell can be
// `added` (empty -> filled), `removed` (filled -> empty), or `changed` (filled -> a DIFFERENT
// shift) — mirrors em-scheduler's diffSchedules three-way split, collapsed to this app's
// single-shift-per-cell shape (no separate "moved"/"supervision-changed" categories, since a
// resident-scheduler cell has no attending/anchor dimension to diverge on).
export function diffSchedules(currentSchedule = {}, altSchedule = {}) {
  const allResidentIds = new Set([...Object.keys(currentSchedule), ...Object.keys(altSchedule)]);
  const byResident = {};
  let added = 0, removed = 0, changed = 0;

  for (const rid of allResidentIds) {
    const curRow = currentSchedule[rid] || {};
    const altRow = altSchedule[rid] || {};
    const dates = new Set([...Object.keys(curRow), ...Object.keys(altRow)]);
    const cellChanges = [];
    for (const ds of dates) {
      const curSid = curRow[ds] || null;
      const altSid = altRow[ds] || null;
      if (curSid === altSid) continue;
      if (!curSid) { cellChanges.push({ date: ds, type: 'added', to: altSid }); added++; }
      else if (!altSid) { cellChanges.push({ date: ds, type: 'removed', from: curSid }); removed++; }
      else { cellChanges.push({ date: ds, type: 'changed', from: curSid, to: altSid }); changed++; }
    }
    if (cellChanges.length) {
      cellChanges.sort((a, b) => a.date.localeCompare(b.date));
      byResident[rid] = cellChanges;
    }
  }

  return { byResident, counts: { added, removed, changed, total: added + removed + changed } };
}

// ─── Rule-priority variant list ─────────────────────────────────────────────
// All orderings of `arr` (small — the app has exactly 3 soft rules, so this is 6 permutations,
// never more). Exported mainly for buildRulePriorityVariants below and its own unit tests.
export function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

// Every reordering of the chief's current soft-rule priority EXCEPT the current order itself
// (the sweep never re-tests the config the chief already has). With 3 soft rules this is 5
// variants — cheap enough to just enumerate all of them rather than a hand-picked adjacent-swap
// subset (see CLAUDE.md "What-If Optimization Sweep").
export function buildRulePriorityVariants(rulePriority) {
  const base = Array.isArray(rulePriority) ? rulePriority : [];
  const baseKey = base.join('>');
  const seen = new Set([baseKey]);
  const variants = [];
  for (const perm of permutations(base)) {
    const key = perm.join('>');
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push({ kind: 'rules', rulePriority: perm });
  }
  return variants;
}

// ─── Candidate ranking ───────────────────────────────────────────────────────
// Compares two scored sweep candidates — each `{errorCount, blockingWarnCount, qualityVector,
// diffTotal}` — the SAME way generateScheduleBest's own betterQuality does (hard errors first,
// export-blocking warnings second, the quality vector last, all lexicographic — see
// scheduleQuality.js), with one addition: when a tie survives all of that, prefer the candidate
// with the SMALLER schedule diff against the chief's current schedule (fewer cells to review is
// strictly better between two otherwise-equal candidates). Negative means `a` ranks better/first.
export function compareSweepCandidates(a, b) {
  const av = [a.errorCount, a.blockingWarnCount, ...a.qualityVector];
  const bv = [b.errorCount, b.blockingWarnCount, ...b.qualityVector];
  const cmp = compareVectors(av, bv);
  if (cmp !== 0) return cmp;
  return (a.diffTotal ?? 0) - (b.diffTotal ?? 0);
}

// Sorted copy, best (lowest) first. Does not mutate the input array.
export function rankSweepCandidates(candidates) {
  return [...candidates].sort(compareSweepCandidates);
}

// True iff `candidate` is strictly better than `baseline` under the same comparator sweep
// ranking uses — diffTotal deliberately excluded from this one comparison (a candidate isn't
// "better than baseline" for having fewer changes than itself; that comparison is meaningless).
export function isBetterThanBaseline(candidate, baseline) {
  const cv = [candidate.errorCount, candidate.blockingWarnCount, ...candidate.qualityVector];
  const bv = [baseline.errorCount, baseline.blockingWarnCount, ...baseline.qualityVector];
  return compareVectors(cv, bv) < 0;
}
