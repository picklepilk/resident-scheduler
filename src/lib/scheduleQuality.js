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
  // Supplied by buildQualityInput rather than imported: this module must never import from
  // ResidentScheduler.jsx (that file imports lib/* the other direction — circular). Defaulted so
  // an older/among-tests caller that omits it still produces a finite workShapePenalty.
  maxConsecutiveWorkDays = 6,
  // AY-to-date carryover (Phase 2). `ayPriorTotals` maps residentId -> {nights, weekendDates,
  // assigned, blocks} accumulated over PUBLISHED earlier blocks in the same academic year. A
  // resident with no history is ABSENT from the map, never present-with-zeros — see the
  // no-history handling below for why that distinction is load-bearing. Defaults to {} so every
  // caller that doesn't supply it gets exactly today's block-only behavior.
  ayPriorTotals = {},
  ayCarryoverFullAt = 3,
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

  // ── AY-to-date carryover blend ────────────────────────────────────────────────────────────
  // Fairness measured only inside one block lets a resident who was hammered last block start even
  // again this block. These three spreads are therefore re-measured over (prior AY total + this
  // block) and blended into the block-only figures above.
  //
  // Two properties this MUST have, both load-bearing:
  //   1. STRICT NO-OP ON EMPTY HISTORY. With no published prior blocks, `confidence` is 0 and every
  //      blended value is exactly the block-only value. That keeps the committed baseline fixtures
  //      (which carry no history) meaningful, and means turning this on cannot change behavior for
  //      anyone who hasn't published a block yet.
  //   2. NO-HISTORY RESIDENTS ARE EXCLUDED, NOT ZEROED. A resident absent from ayPriorTotals is
  //      dropped from the AY population entirely. Treating them as 0 prior nights would read as
  //      maximally under-worked and would systematically load the newest resident on the roster —
  //      the exact opposite of the fairness this is for.
  const withHistory = targetBearing.filter(r => ayPriorTotals[r.id]?.blocks > 0);
  const nightWithHistory = withHistory.filter(r => !nightOnlyIds.has(r.id));

  // Confidence ramps with how much history the population actually has. groupedSpread already
  // ignores groups smaller than 2, but a population that small can't express a spread at all, so
  // fall to 0 rather than trusting a one-resident "AY spread".
  const meanPriorBlocks = withHistory.length
    ? withHistory.reduce((sum, r) => sum + ayPriorTotals[r.id].blocks, 0) / withHistory.length
    : 0;
  const confidence = withHistory.length >= 2 && ayCarryoverFullAt > 0
    ? Math.min(1, meanPriorBlocks / ayCarryoverFullAt)
    : 0;

  let blendedDeficitSpread = deficitSpread;
  let blendedNightSpread = nightSpread;
  let blendedWeekendSpread = weekendSpread;

  if (confidence > 0) {
    const ayDeficitSpread = groupedSpread(withHistory, r => {
      const target = targets[r.id];
      const prior = ayPriorTotals[r.id];
      // Ratio against a target scaled by blocks worked, so a resident with more prior blocks isn't
      // automatically "over target" — the comparison stays completion-rate-based, matching the
      // block-only deficitSpread above.
      const scaledTarget = target > 0 ? target * (prior.blocks + 1) : 0;
      const total = prior.assigned + assignedCount(schedule, r.id, dates);
      return scaledTarget > 0 ? total / scaledTarget : 0;
    });
    const ayNightSpread = groupedSpread(nightWithHistory, r => {
      const rs = schedule[r.id] || {};
      let n = ayPriorTotals[r.id].nights;
      for (const ds of dates) if (isNightShiftId(rs[ds])) n++;
      return n;
    });
    const ayWeekendSpread = groupedSpread(withHistory, r => {
      const rs = schedule[r.id] || {};
      let n = ayPriorTotals[r.id].weekendDates;
      for (const ds of weekendDates) if (rs[ds]) n++;
      return n;
    });

    const blend = (blockValue, ayValue) => (1 - confidence) * blockValue + confidence * ayValue;
    blendedDeficitSpread = blend(deficitSpread, ayDeficitSpread);
    blendedNightSpread = blend(nightSpread, ayNightSpread);
    blendedWeekendSpread = blend(weekendSpread, ayWeekendSpread);
  }

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

  // workShapePenalty: the shape of each resident's WORKED days across the block, regardless of
  // shift type — the general-purpose complement to nightShapePenalty, which only ever sees night
  // runs. Motivated by the chief's "fixed bad sequences" hand-fixes: individually legal shifts that
  // add up to an ugly stretch (scattered singles, churning between areas day to day, a shift butted
  // against the start or end of vacation).
  //
  // IMPORTANT — fragmentation is NOT scored the way nightShapePenalty scores it. The night metric
  // penalizes every run beyond the first because one clean night run per block is the goal. Worked
  // days cannot work that way: MAX_CONSECUTIVE_WORK_DAYS caps a run at 6, so a resident with an
  // 18-shift target REQUIRES at least 3 runs. Penalizing "every run beyond the first" would punish
  // legally-mandated structure. Instead, runs are compared against the theoretical minimum
  // ceil(worked / maxConsecutiveWorkDays), and only the excess is penalized.
  let workShapePenalty = 0;
  for (const r of residents) {
    const rs = schedule[r.id] || {};
    const offDates = new Set([...(r.vacationDates || []), ...(r.approvedDatesOff || [])]);

    const runs = [];
    let i = 0;
    let worked = 0;
    while (i < dates.length) {
      if (!rs[dates[i]]) { i++; continue; }
      const start = i;
      let j = i;
      while (
        j + 1 < dates.length &&
        rs[dates[j + 1]] &&
        toDateStr(addDays(parseDate(dates[j]), 1)) === dates[j + 1]
      ) j++;
      const len = j - start + 1;
      worked += len;
      runs.push({ start, end: j, len });
      i = j + 1;
    }
    if (!runs.length) continue;

    // Block-edge exemption mirrors nightShapePenalty: a run touching the first or last date may
    // legitimately continue into the adjacent block, so its shape can't be judged from here.
    const interior = runs.filter(run => run.start > 0 && run.end < lastIdx);

    // Scattered singles and near-singles. A lone shift between two days off is the "awkward gap"
    // pattern; a 2-day run is mildly undesirable but common and cheap to tolerate.
    for (const run of interior) {
      if (run.len === 1) workShapePenalty += 3;
      else if (run.len === 2) workShapePenalty += 1;
    }

    // Excess fragmentation beyond what the consecutive-day cap forces.
    const minRuns = Math.ceil(worked / maxConsecutiveWorkDays);
    workShapePenalty += 2 * Math.max(0, runs.length - minRuns);

    // Area churn: consecutive worked days in a different shift AREA. Working POD three days running
    // is easier than POD/PED/FLEX on rotation. Only counted WITHIN a run (consecutive dates), so a
    // day off between assignments resets it and costs nothing.
    for (const run of interior) {
      for (let k = run.start; k < run.end; k++) {
        const a = SHIFT_MAP[rs[dates[k]]]?.area;
        const b = SHIFT_MAP[rs[dates[k + 1]]]?.area;
        if (a && b && a !== b) workShapePenalty += 1;
      }
    }

    // Vacation adjacency: a shift the day before vacation starts or the day after it ends. Scored
    // symmetrically because there's no evidence yet that one side matters more than the other —
    // see the plan's open questions. Cheap (1) so it only ever breaks ties.
    for (let k = 0; k < dates.length; k++) {
      if (!rs[dates[k]]) continue;
      const prev = toDateStr(addDays(parseDate(dates[k]), -1));
      const next = toDateStr(addDays(parseDate(dates[k]), 1));
      if (offDates.has(prev) || offDates.has(next)) workShapePenalty += 1;
    }
  }

  return {
    coverageMiss,
    seniorGaps: seniorGapCount,
    restCompromises: restCompromiseCount,
    underTargetTotal,
    // The three spreads reported (and consumed by computeQualityVector) are the AY-BLENDED values.
    // With no published history they are identical to the block-only figures by construction.
    deficitSpread: blendedDeficitSpread,
    nightSpread: blendedNightSpread,
    weekendSpread: blendedWeekendSpread,
    // Block-only originals kept alongside for diagnostics and for tests that need to prove the
    // blend is a strict no-op on empty history without re-deriving it.
    blockDeficitSpread: deficitSpread,
    blockNightSpread: nightSpread,
    blockWeekendSpread: weekendSpread,
    ayCarryoverConfidence: confidence,
    nightShapePenalty,
    workShapePenalty,
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
  // workShapePenalty joins the EXISTING last slot rather than becoming a 5th tuple element, on
  // purpose: a new slot would rank sequence aesthetics above coverage/seniority/rest, and shape
  // must never outrank those. Its 0.5 coefficient is deliberately below nightShapePenalty's
  // implicit 1.0 — work-shape is a softer preference than circadian night shaping, and it accrues
  // over far more days (every worked day, not just nights), so an equal coefficient would let it
  // dominate the whole slot.
  const fairnessPlusShape =
    2 * metrics.underTargetTotal +
    10 * metrics.deficitSpread +
    6 * metrics.nightSpread +
    4 * metrics.weekendSpread +
    metrics.nightShapePenalty +
    0.5 * metrics.workShapePenalty;
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
