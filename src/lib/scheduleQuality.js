// src/lib/scheduleQuality.js
// Pure schedule-quality scorer for the generator's quality harness / best-of-N restart. No
// React, no side effects. Imports only from sibling src/lib/ modules (shifts.js, dates.js,
// coverage.js) — never from ResidentScheduler.jsx, which would create a circular import (that
// file imports lib/* the other direction).
//
// Design intent (see plan doc "Key decisions & tradeoffs"): scoring is schedule-derived wherever
// possible — coverage/target/fairness/night-shape facts are all recomputed straight off the
// `schedule` object, never trusted from a caller-supplied report array. The only two report-like
// inputs accepted (`seniorGapCount`/`restCompromiseCount`) are counts the caller computes from the
// FINAL schedule (post-repair), not raw fill-time bookkeeping — see ResidentScheduler.jsx's
// `buildQualityInput` for how those are produced.

import { SHIFT_MAP, isNightShiftId } from './shifts.js';
import { parseDate, addDays, toDateStr } from './dates.js';
import { getCoverageFor } from './coverage.js';

// Population standard deviation (denominator = N, not N-1) — we're measuring spread within a
// fixed, fully-known group (every resident in that category/pgy cohort on this block), not
// estimating a sample statistic, so population stddev is the correct measure here.
function stddevPop(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function groupKey(r) { return `${r.category}::${r.pgy}`; }

// Mean, over (category,pgy) groups with >=2 members within `population`, of the population
// stddev of valueFn(resident) within each group. Groups with fewer than 2 members contribute
// nothing (a group of 1 has no meaningful spread) and are excluded from the mean itself, not
// counted as a 0.
function groupedSpread(population, valueFn) {
  const groups = new Map();
  for (const r of population) {
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const stddevs = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    stddevs.push(stddevPop(members.map(valueFn)));
  }
  return stddevs.length ? stddevs.reduce((a, b) => a + b, 0) / stddevs.length : 0;
}

function assignedCount(schedule, rid, dates) {
  const rs = schedule[rid] || {};
  let n = 0;
  for (const ds of dates) if (rs[ds]) n++;
  return n;
}

// computeQualityMetrics: derives every scoring fact directly from `schedule` (+ coverage/dates/
// residents/targets/nightRules/weekendPairs), except seniorGapCount/restCompromiseCount, which
// arrive pre-computed by the caller from the final (post-repair) schedule.
export function computeQualityMetrics({
  schedule,
  coverage,
  dates,
  residents,
  targets,
  nightOnlyIds,
  nightRules,
  weekendPairs,
  seniorGapCount,
  restCompromiseCount,
}) {
  // coverageMiss: Σ over dates × every catalog shift of max(0, coverageMin - filledCount).
  let coverageMiss = 0;
  const scheduleResidentIds = Object.keys(schedule || {});
  for (const ds of dates) {
    const dow = parseDate(ds).getDay();
    for (const shiftId of Object.keys(SHIFT_MAP)) {
      const { min } = getCoverageFor(shiftId, coverage, dow);
      if (min <= 0) continue;
      let filled = 0;
      for (const rid of scheduleResidentIds) {
        if (schedule[rid]?.[ds] === shiftId) filled++;
      }
      if (filled < min) coverageMiss += (min - filled);
    }
  }

  // Schedulable, target-bearing population — the only pool spreads/underTarget are computed
  // over (raw headcounts across residents with different targets would be unfair; see
  // deficitSpread below for the normalized-ratio fix).
  const targetBearing = residents.filter(r => targets[r.id] != null);

  let underTargetTotal = 0;
  for (const r of targetBearing) {
    const target = targets[r.id];
    const assigned = assignedCount(schedule, r.id, dates);
    underTargetTotal += Math.max(0, target - assigned);
  }

  // deficitSpread: normalized assigned/target ratio, not raw counts — two residents with
  // different targets but equal completion ratio should contribute zero spread.
  const deficitSpread = groupedSpread(targetBearing, r => {
    const target = targets[r.id];
    const assigned = assignedCount(schedule, r.id, dates);
    return target > 0 ? assigned / target : 0;
  });

  // nightSpread: same target-bearing population, minus night-only residents (excluded from both
  // the group membership and the spread calc — their night counts are structural, not a fairness
  // signal).
  const nightPopulation = targetBearing.filter(r => !nightOnlyIds.has(r.id));
  const nightSpread = groupedSpread(nightPopulation, r => {
    const rs = schedule[r.id] || {};
    let n = 0;
    for (const ds of dates) if (isNightShiftId(rs[ds])) n++;
    return n;
  });

  // weekendSpread: count of individual weekend DATES worked (a date counts if it appears in any
  // pair in weekendPairs — Saturday or Sunday individually — not per weekend-pair).
  const weekendDates = new Set();
  for (const pair of weekendPairs) for (const ds of pair) weekendDates.add(ds);
  const weekendSpread = groupedSpread(targetBearing, r => {
    const rs = schedule[r.id] || {};
    let n = 0;
    for (const ds of weekendDates) if (rs[ds]) n++;
    return n;
  });

  // nightShapePenalty: maximal consecutive-date night runs per non-night-only resident. A run
  // touching the block's first or last date is exempt from all penalties (edge policy mirrors the
  // validator, which tolerates short runs that may continue into the adjacent block).
  let nightShapePenalty = 0;
  const lastIdx = dates.length - 1;
  for (const r of residents) {
    if (nightOnlyIds.has(r.id)) continue;
    const rs = schedule[r.id] || {};
    const runs = [];
    let i = 0;
    while (i < dates.length) {
      if (!isNightShiftId(rs[dates[i]])) { i++; continue; }
      const start = i;
      let j = i;
      while (
        j + 1 < dates.length &&
        isNightShiftId(rs[dates[j + 1]]) &&
        toDateStr(addDays(parseDate(dates[j]), 1)) === dates[j + 1]
      ) j++;
      runs.push({ start, end: j, len: j - start + 1 });
      i = j + 1;
    }
    const interior = runs.filter(run => run.start > 0 && run.end < lastIdx);
    interior.forEach((run, idx) => {
      const { len } = run;
      if (len === 1) nightShapePenalty += 3;
      else if (len === 2) nightShapePenalty += 2;
      else if (len === 3) nightShapePenalty += 1;
      else if (len >= nightRules.minRun && len <= nightRules.maxRun) {
        nightShapePenalty += 0.25 * (nightRules.idealRun - len);
      }
      // else: len > maxRun (or otherwise unmatched) — validateAll's hard rule already forbids
      // this; not this scorer's job to penalize twice.
      if (idx > 0) nightShapePenalty += 2; // fragmentation: every run beyond the first
    });
  }

  return {
    coverageMiss,
    seniorGaps: seniorGapCount,
    restCompromises: restCompromiseCount,
    underTargetTotal,
    deficitSpread,
    nightSpread,
    weekendSpread,
    nightShapePenalty,
  };
}

// Maps each soft-rule id (as ordered by normalizeRulePriority) to its metric field.
const RULE_METRIC_FIELD = {
  coverageMin: 'coverageMiss',
  seniorComposition: 'seniorGaps',
  postNightRest: 'restCompromises',
};

// computeQualityVector: [n0, n1, n2, fairnessPlusShape], LOWER IS BETTER. n0/n1/n2 are the three
// soft-rule counts in `rulePriority` order (index 0 = highest priority = compared first) — a
// lexicographic tuple, not a scalar weighted sum, so a count in a lower-priority tier can never
// outrank any difference in a higher-priority tier regardless of magnitude.
export function computeQualityVector(metrics, rulePriority) {
  const [id0, id1, id2] = rulePriority;
  const n0 = metrics[RULE_METRIC_FIELD[id0]];
  const n1 = metrics[RULE_METRIC_FIELD[id1]];
  const n2 = metrics[RULE_METRIC_FIELD[id2]];
  const fairnessPlusShape =
    2 * metrics.underTargetTotal +
    10 * metrics.deficitSpread +
    6 * metrics.nightSpread +
    4 * metrics.weekendSpread +
    metrics.nightShapePenalty;
  return [n0, n1, n2, fairnessPlusShape];
}

// compareVectors: plain lexicographic array compare. Negative if a<b (a better), positive if
// a>b, 0 if equal. `a`/`b` are always the same length at call sites in this app.
export function compareVectors(a, b) {
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    if (diff !== 0) return diff;
  }
  return 0;
}

// betterQuality: true iff `a` is strictly better than `b`. Compares (errorCount,
// blockingWarnCount, qualityVector) lexicographically — hard errors first (a floor no quality
// score can buy down), export-blocking warnings second, the quality tuple last. Equal on all
// three is NOT better (strict improvement only — see Step 6/7's repair-acceptance gate, which
// relies on ties keeping the pre-repair result).
export function betterQuality(a, b) {
  const av = [a.errorCount, a.blockingWarnCount, ...a.qualityVector];
  const bv = [b.errorCount, b.blockingWarnCount, ...b.qualityVector];
  return compareVectors(av, bv) < 0;
}
