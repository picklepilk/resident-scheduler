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

import { SHIFT_MAP, SHIFT_DOW, isNightShiftId } from './shifts.js';
import { parseDate, addDays, toDateStr } from './dates.js';
import { getCoverageFor, twelveHourStateFor } from './coverage.js';

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

// Trauma-night-within-run penalty (mirrors ResidentScheduler.jsx's candidatePool traumaRunCapped
// hard exclusion and score()'s traumaSecondInRun/traumaMidRun soft terms — the retrospective
// counterpart of that same chief-directed rule): for ONE night run, count TRAUMA-N placements
// sitting strictly mid-run (not first/last position within the run) PLUS max(0, trauma-nights-in-
// run - 1) — i.e. every trauma night beyond the first, wherever it sits. `run` is
// `{start, end, len}` (indices into `dates`), matching nightShapePenalty's own run-detection
// shape. Exported for direct unit testing (src/lib/scheduleQuality.test.js).
export function traumaRunPenaltyFor(rs, run, dates) {
  const shiftIds = [];
  for (let i = run.start; i <= run.end; i++) shiftIds.push(rs[dates[i]]);
  const traumaCount = shiftIds.filter(sid => sid === 'TRAUMA-N').length;
  if (traumaCount === 0) return 0;
  let midRunCount = 0;
  shiftIds.forEach((sid, idx) => {
    if (sid === 'TRAUMA-N' && idx > 0 && idx < shiftIds.length - 1) midRunCount++;
  });
  return midRunCount + Math.max(0, traumaCount - 1);
}

// Second-rest-day penalty (mirrors score()'s secondRestDay soft term — the retrospective
// counterpart): a night run of >=3 nights whose 1st following date is a genuine rest day (empty)
// but whose 2nd following date is WORKED counts once — the chief's own data shows a modal 2-day
// gap after a night run, so leaving only one is a real (if soft) deviation. Block-edge exempt: if
// the 2nd following date falls outside the block's own date range at all, there's nothing to
// observe, so this is not counted as a violation. Exported for direct unit testing.
export function secondRestDayPenaltyFor(rs, run, dates, lastIdx) {
  if (run.len < 3) return 0;
  const day2Idx = run.end + 2;
  if (day2Idx > lastIdx) return 0; // block-edge exempt — 2nd following date isn't in this block
  const day1Idx = run.end + 1;
  if (rs[dates[day1Idx]]) return 0; // day 1 was also worked — not the "exactly 1 rest day" shape
  return rs[dates[day2Idx]] ? 1 : 0;
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
  // UNDELTA'D per-resident target (see ResidentScheduler.jsx's getShiftTarget/buildQualityInput —
  // "buy-down" feature). `targets` is the EFFECTIVE (delta'd) value used everywhere else in this
  // module; the AY carryover blend below needs the baseline instead, or a single-block delta gets
  // multiplied across every prior block in the AY (target 19, delta -2, 3 prior blocks would
  // otherwise scale to 19-2=17 * 4 = 68 instead of the real 19+19+19+17 = 74 obligation, reading
  // the resident as over-worked for the rest of the block). Per-resident `?? target` fallback is
  // MANDATORY, not cosmetic: several existing callers (baselineSuite.js, generator.harness.test.js,
  // most of scheduleQuality.test.js) never pass this map, and `undefined * n` is NaN — without the
  // fallback `scaledTarget` silently collapses to 0 and ayDeficitSpread goes to 0 with no test
  // failing loudly. Defaults to {} so an omitting caller's `baselineTargets[r.id]` reads
  // undefined and the fallback engages for every resident.
  baselineTargets = {},
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
  // holidays, assigned, blocks} accumulated over PUBLISHED earlier blocks in the same academic
  // year. A resident with no history is ABSENT from the map, never present-with-zeros — see the
  // no-history handling below for why that distinction is load-bearing. Defaults to {} so every
  // caller that doesn't supply it gets exactly today's block-only behavior.
  ayPriorTotals = {},
  ayCarryoverFullAt = 3,
  // Holiday dates falling inside THIS block, resolved by the caller from the AY's chief-editable
  // holiday list (see lib/holidays.js — an AY with no configured holidays yields none, and this
  // whole metric is then a strict no-op). Accepted as an array or a Set; normalized below.
  holidayDates = [],
  // 12h-window context (chief-definable ACEP/AAEM/SAEM-style conference windows — see
  // coverage.js's TWELVE_HOUR_IDS/twelveHourStateFor). The scorer must see EXACTLY the coverage
  // the generator saw, or it permanently disagrees with the thing it's supposed to be scoring
  // (every 12h shift's DEFAULT_COVERAGE minimum would count as a phantom miss on every ordinary
  // date). This module can't import ResidentScheduler.jsx's ayConf state itself (circular — see
  // file header), so the caller (buildQualityInput) must pass it through. Defaults to {} so an
  // older/omitting caller still gets a resolvable (all-empty) state.
  ayConf = {},
}) {
  // coverageMiss: Σ over dates × every catalog shift of max(0, coverageMin - filledCount).
  let coverageMiss = 0;
  const scheduleResidentIds = Object.keys(schedule || {});
  for (const ds of dates) {
    const dow = parseDate(ds).getDay();
    // Resolved once per date, not per shift — twelveHourStateFor re-walks every configured window
    // on each call, and there are ~40 shift ids to check against the same date.
    const twelveHourState = twelveHourStateFor(ds, ayConf);
    for (const shiftId of Object.keys(SHIFT_MAP)) {
      // A shift absent from SHIFT_DOW on this weekday doesn't exist at all today (e.g.
      // TRAUMA-D/TRAUMA-N only run specific weekdays) — same guard as computeCoverageByDate/
      // composeCoverage/generator.harness.test.js, or every non-existent day charges a phantom
      // coverage miss the generator never had a chance to fill.
      if (SHIFT_DOW[shiftId] && !SHIFT_DOW[shiftId].includes(dow)) continue;
      const { min } = getCoverageFor(shiftId, coverage, dow, twelveHourState);
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

  // holidaySpread: count of chief-configured HOLIDAY dates worked, spread across each
  // (category,pgy) cohort — the same construction as weekendSpread, over a much sparser and far
  // more contested set of dates.
  //
  // STRICT NO-OP ON EMPTY CONFIG. With no holidays configured for the AY (the state of every
  // existing block, and of the committed quality-baseline fixtures) `holidayDateSet` is empty and
  // this is exactly 0 — not "0 by arithmetic coincidence", but by an explicit early exit, so the
  // guarantee is visible rather than inferred. Same discipline as the AY-carryover blend below.
  //
  // A resident on vacation/approved time off over a holiday counts 0 for it, exactly like anyone
  // else who didn't work — see lib/holidays.js's header on why "unavailable" is deliberately not
  // "spared" (their lower total is what steers the NEXT holiday toward them).
  const holidayDateSet = holidayDates instanceof Set ? holidayDates : new Set(holidayDates || []);
  const holidaySpread = holidayDateSet.size === 0 ? 0 : groupedSpread(targetBearing, r => {
    const rs = schedule[r.id] || {};
    let n = 0;
    for (const ds of holidayDateSet) if (rs[ds]) n++;
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
  let blendedHolidaySpread = holidaySpread;

  if (confidence > 0) {
    const ayDeficitSpread = groupedSpread(withHistory, r => {
      const target = targets[r.id];
      const prior = ayPriorTotals[r.id];
      // Prior blocks are scaled by the UNDELTA'D baseline target (bt), not the current block's
      // possibly-bought-down `target` — a one-block delta must not retroactively apply to blocks
      // it never affected. This block's own contribution still uses the effective `target`, since
      // that's what the resident was actually held to this block.
      const bt = baselineTargets?.[r.id] ?? target;
      const scaledTarget = bt > 0 ? bt * prior.blocks + target : 0;
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

    // Holiday carryover is the MOST important of the four, and the reason carryover exists at all
    // for this metric: holidays are sparse (a handful of dates a year, often one or zero inside a
    // given 28-day block), so within-block spread alone can never express "she worked Thanksgiving,
    // so he takes Christmas." Measured over the year, it can. Blended on the same confidence ramp
    // as the other three rather than a bespoke one — a program with too little published history to
    // trust for nights has too little to trust for holidays either.
    //
    // Blended over `withHistory`, NOT over everyone: a resident absent from ayPriorTotals is
    // excluded, never read as zero holidays worked. Zeroing them would mark the newest resident on
    // the roster as maximally holiday-deprived and aim every holiday straight at them.
    const ayHolidaySpread = holidayDateSet.size === 0 ? 0 : groupedSpread(withHistory, r => {
      const rs = schedule[r.id] || {};
      let n = ayPriorTotals[r.id].holidays || 0;
      for (const ds of holidayDateSet) if (rs[ds]) n++;
      return n;
    });

    const blend = (blockValue, ayValue) => (1 - confidence) * blockValue + confidence * ayValue;
    blendedDeficitSpread = blend(deficitSpread, ayDeficitSpread);
    blendedNightSpread = blend(nightSpread, ayNightSpread);
    blendedWeekendSpread = blend(weekendSpread, ayWeekendSpread);
    blendedHolidaySpread = blend(holidaySpread, ayHolidaySpread);
  }

  // nightShapePenalty: maximal consecutive-date night runs per non-night-only resident. A run
  // touching the block's first or last date is exempt from all penalties (edge policy mirrors the
  // validator, which tolerates short runs that may continue into the adjacent block).
  let nightShapePenalty = 0;
  let traumaRunPenalty = 0;
  let secondRestDayPenalty = 0;
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
    // Second-rest-day penalty is checked against every run (only the run's OWN end matters — a
    // run touching the block's START but not its end is still fully checkable), unlike the
    // shortness/fragmentation/trauma-position penalties below, which are edge-exempt on BOTH
    // sides (see traumaRunPenaltyFor/secondRestDayPenaltyFor's own comments for why).
    for (const run of runs) secondRestDayPenalty += secondRestDayPenaltyFor(rs, run, dates, lastIdx);
    const interior = runs.filter(run => run.start > 0 && run.end < lastIdx);
    interior.forEach((run, idx) => {
      const { len } = run;
      // Night-run SHAPE relaxation (chief-directed — mirrors ResidentScheduler.jsx's own
      // nightCluster relaxation in score(): his real hand-built schedules run mostly 1-3 nights,
      // 61% of real runs, not the aspirational 5-6 NIGHT_RULES ideal). Runs of 2-6 now incur NO
      // shortness penalty at all; only a genuinely ISOLATED single night (run length 1) is still
      // penalized, at the same magnitude as before. Fragmentation (every run beyond the first,
      // below) and the block-edge exemption are both UNCHANGED.
      if (len === 1) nightShapePenalty += (nightRules.minRun - 1);
      // len 2..maxRun: no shortness penalty. len > maxRun: validateAll's hard rule already
      // forbids this; not this scorer's job to penalize twice.
      if (idx > 0) nightShapePenalty += 2; // fragmentation: every run beyond the first
      traumaRunPenalty += traumaRunPenaltyFor(rs, run, dates);
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

    // Phase 2.3 (day<->eve<->night type-churn) was implemented here as a mirror of score()'s
    // typeChurn term, then reverted alongside it — isolated A/B testing showed the fill-time term
    // consistently INCREASED workShapePenalty (the opposite of its intent) via a destructive
    // mixShare interaction. See ResidentScheduler.jsx's SCORE_WEIGHTS comment for the measurement.

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
    holidaySpread: blendedHolidaySpread,
    // Block-only originals kept alongside for diagnostics and for tests that need to prove the
    // blend is a strict no-op on empty history without re-deriving it.
    blockDeficitSpread: deficitSpread,
    blockNightSpread: nightSpread,
    blockWeekendSpread: weekendSpread,
    blockHolidaySpread: holidaySpread,
    ayCarryoverConfidence: confidence,
    nightShapePenalty,
    workShapePenalty,
    traumaRunPenalty,
    secondRestDayPenalty,
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
  //
  // holidaySpread joins the same slot at coefficient 8 — between deficitSpread (10) and
  // nightSpread (6). The ordering is the argument:
  //   * BELOW deficitSpread(10), because overall workload fairness governs all ~28 days of the
  //     block and holiday equity governs one or two of them; a schedule that equalizes Christmas
  //     by leaving someone 4 shifts short of target is not a better schedule.
  //   * ABOVE nightSpread(6) and weekendSpread(4), because the underlying counts are far sparser.
  //     One extra night out of ~5, or one extra weekend day out of ~8, is a modest inequity; one
  //     extra Christmas out of the ONE Christmas in the year is total. A per-unit weight has to
  //     carry that difference, since the stddevs themselves are computed identically.
  // 8 also sits deliberately between them rather than at a new extreme: this term must be able to
  // break a tie between otherwise comparable schedules, never to buy its way past a real
  // target-fairness regression.
  //
  // `?? 0` guards callers built before this metric existed (several tests construct metrics
  // objects by hand) — undefined would poison the whole sum to NaN and silently make every
  // comparison false rather than failing loudly.
  //
  // traumaRunPenalty/secondRestDayPenalty (chief-directed trauma-run rules — see their own
  // computeQualityMetrics comments) join this SAME existing slot too, at small coefficients (2
  // and 1 respectively) — never a new slot, same reasoning as workShapePenalty/holidaySpread
  // above: these are shape/preference concerns and must never outrank coverage/seniority/rest.
  // 2 (trauma-run position/count) sits below nightShapePenalty's implicit 1.0-per-unit-length but
  // is still meaningfully larger than 1 (second-rest-day), since a mid-run/3rd-trauma placement is
  // a more concrete deviation from the chief's benchmark than a single missed rest day. `?? 0`
  // guards the same hand-built-metrics-object test callers as the other optional fields above.
  const fairnessPlusShape =
    2 * metrics.underTargetTotal +
    10 * metrics.deficitSpread +
    8 * (metrics.holidaySpread ?? 0) +
    6 * metrics.nightSpread +
    4 * metrics.weekendSpread +
    metrics.nightShapePenalty +
    0.5 * metrics.workShapePenalty +
    2 * (metrics.traumaRunPenalty ?? 0) +
    1 * (metrics.secondRestDayPenalty ?? 0);
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
