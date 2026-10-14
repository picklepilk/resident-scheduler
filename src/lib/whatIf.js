// src/lib/whatIf.js
// Pure "What-if staffing" scenario builder + comparison math for the chief's what-if simulator
// (Violations tab — see ResidentScheduler.jsx's WhatIfCard/runWhatIf). Per CLAUDE.md ("src/lib/*
// modules are pure and may never import ResidentScheduler.jsx"), this module never imports the
// big file: the actual generateScheduleBest/validateAll/computeQualityVector runs happen in
// ResidentScheduler.jsx's runWhatIf, which calls applyScenario (below) to build the scenario's
// args object and compareResults (below) to diff the two already-computed results.
//
// Change kinds consumed by applyScenario:
//   {kind:'cloneResident', templateId, count, start?, end?} — add `count` hypothetical residents
//     copying the template resident's scheduling-relevant traits (category/pgy/blockType/
//     isCCUNights/eligibility-affecting fields — everything on the template object, via a plain
//     spread) under fresh ids `whatif_<n>` and display names "What-if PGY-<pgy> #<i>". Every
//     PERSONAL date list/field (vacation/jeopardy/JC/GR/approved-off/work-restrictions/wellness
//     override/QGenda staff id) is stripped — a clone is a fresh body, not a copy of the
//     template's calendar. isChief/chiefRole/targetDelta/targetNote/targetIsBuyDown are stripped
//     too — a hypothetical resident is never chief and never inherits someone else's buy-down.
//     start/end (optional): restricts the clone's availability to that window via
//     availabilityMode:'ranges' + availableRanges — confirmed by reading getEligibleShifts in the
//     big file that isAvailableOnDate (the function this mechanism feeds) is checked for EVERY
//     resident regardless of category, not just off-service ones — so this one mechanism covers
//     both EM and off-service templates with no carve-out needed. No start/end: 'full' mode,
//     available the whole block, same as a freshly-added real resident defaults to.
//   {kind:'removeResident', residentId, start?, end?} — no start/end: the resident is dropped
//     from the roster entirely (filtered out of allResidents — this also removes their shift
//     target/demand). With start/end: the resident STAYS on the roster (their target is
//     unchanged — they're still obligated for the rest of the block) but every date in the range
//     is added to their approvedDatesOff — the SAME hard per-date block getEligibleShifts already
//     checks first (before isAvailableOnDate) for any resident, any category.
//   {kind:'coverageMin', shiftId, min} — overrides that shift's coverage.min; max is raised to
//     match when the existing max was lower (coverage is always {min,max}, min<=max — see
//     normalizeCoverageEntry).
// Unknown/malformed changes (no kind, or missing templateId/residentId/shiftId) are skipped, same
// "untrusted shape, don't guess" posture CLAUDE.md asks for elsewhere (reconcileTabOrder etc).

import { getBlockDates } from './dates.js';
import { normalizeCoverageEntry } from './coverage.js';

function cloneOneResident(template, index, start, end) {
  const clone = {
    ...template,
    firstName: 'What-if',
    lastName: `PGY-${template.pgy} #${index}`,
    isChief: false,
    chiefRole: null,
    targetDelta: undefined,
    targetNote: undefined,
    targetIsBuyDown: false,
    approvedDatesOff: [],
    vacationDates: [],
    jeopardyDates: [],
    jcPresentDates: [],
    grLectureDates: [],
    workRestrictions: [],
    wellnessOverride: null,
    qgendaStaffId: undefined,
    canWorkDates: [],
    availabilityMode: 'full',
    availableRanges: [],
  };
  if (start && end) {
    clone.availabilityMode = 'ranges';
    clone.availableRanges = [{ start, end }];
  }
  return clone;
}

function applyCloneResident(allResidents, change, counter) {
  const template = allResidents.find(r => r.id === change.templateId);
  if (!template) return allResidents; // template vanished from the roster — no-op, not a throw
  const count = Math.max(1, Math.floor(Number(change.count)) || 1);
  const added = [];
  for (let i = 1; i <= count; i++) {
    counter.n += 1;
    added.push({ ...cloneOneResident(template, i, change.start, change.end), id: `whatif_${counter.n}` });
  }
  return [...allResidents, ...added];
}

function applyRemoveResident(allResidents, change) {
  if (!change.residentId) return allResidents;
  if (!change.start || !change.end) {
    return allResidents.filter(r => r.id !== change.residentId);
  }
  const offDates = getBlockDates(change.start, change.end);
  return allResidents.map(r => {
    if (r.id !== change.residentId) return r;
    const merged = new Set([...(r.approvedDatesOff || []), ...offDates]);
    return { ...r, approvedDatesOff: [...merged].sort() };
  });
}

function applyCoverageMin(coverage, change) {
  if (!change.shiftId) return coverage;
  const current = normalizeCoverageEntry(coverage[change.shiftId]) || { min: 0, max: 0 };
  const min = Math.max(0, Math.floor(Number(change.min)) || 0);
  return { ...coverage, [change.shiftId]: { min, max: Math.max(min, current.max) } };
}

// Deep-copies baseArgs and applies every change in order; NEVER mutates baseArgs (or anything
// reachable from it) — callers rely on being able to reuse the same baseArgs object for both the
// base run and every scenario. Returns a new args object with the same shape
// (allResidents/block/coverage/eligOverrides/appSettings/dayRules/blocksHistory/ayConf/...),
// ready to hand straight to generateScheduleBest.
export function applyScenario(baseArgs, changes) {
  const cloned = structuredClone(baseArgs);
  let allResidents = cloned.allResidents || [];
  let coverage = cloned.coverage || {};
  const counter = { n: 0 };
  for (const change of (changes || [])) {
    if (!change || typeof change.kind !== 'string') continue;
    if (change.kind === 'cloneResident') allResidents = applyCloneResident(allResidents, change, counter);
    else if (change.kind === 'removeResident') allResidents = applyRemoveResident(allResidents, change);
    else if (change.kind === 'coverageMin') coverage = applyCoverageMin(coverage, change);
    // Unrecognized kind: skipped, not thrown — a future caller sending a kind this version
    // doesn't know about should degrade to "did nothing" rather than crash the simulator.
  }
  return { ...cloned, allResidents, coverage };
}

function unfilledKey(u) { return `${u.dateStr}::${u.shiftId}::${u.slotIndex}`; }
function countByShift(list) {
  const m = {};
  for (const u of list) m[u.shiftId] = (m[u.shiftId] || 0) + 1;
  return m;
}

// Pure diff over two already-computed results. Each of `base`/`scenario` is
// {report, issues, qualityVector}:
//   report        — a generateScheduleBest result's own .report (report.unfilled is the MIN-pass
//                    unfilled-slot list — see generateSchedule's `if (phase === 'min')
//                    report.unfilled.push(...)` — i.e. exactly "unfilled minimum slots")
//   issues        — that same result's validateAll() output
//   qualityVector — that same result's computeQualityVector() output
// All three are computed by the caller (ResidentScheduler.jsx's runWhatIf) since this module may
// never import the generator/validator/scorer itself. Slot identity for "closed"/"opened" is
// (dateStr, shiftId, slotIndex) — the same triple report.unfilled entries already carry.
export function compareResults(base, scenario) {
  const baseUnfilled = base?.report?.unfilled || [];
  const scenarioUnfilled = scenario?.report?.unfilled || [];
  const baseKeys = new Set(baseUnfilled.map(unfilledKey));
  const scenarioKeys = new Set(scenarioUnfilled.map(unfilledKey));
  let slotsClosed = 0, slotsOpened = 0;
  for (const k of baseKeys) if (!scenarioKeys.has(k)) slotsClosed++;
  for (const k of scenarioKeys) if (!baseKeys.has(k)) slotsOpened++;

  const beforeByShift = countByShift(baseUnfilled);
  const afterByShift = countByShift(scenarioUnfilled);
  const perShift = {};
  for (const shiftId of new Set([...Object.keys(beforeByShift), ...Object.keys(afterByShift)])) {
    const before = beforeByShift[shiftId] || 0;
    const after = afterByShift[shiftId] || 0;
    perShift[shiftId] = { before, after, delta: after - before };
  }

  const baseIssues = base?.issues || [];
  const scenarioIssues = scenario?.issues || [];
  const errBefore = baseIssues.filter(i => i.level === 'error').length;
  const errAfter = scenarioIssues.filter(i => i.level === 'error').length;
  const utBefore = baseIssues.filter(i => i.rule === 'underTarget').length;
  const utAfter = scenarioIssues.filter(i => i.rule === 'underTarget').length;

  return {
    coverageMiss: { before: baseUnfilled.length, after: scenarioUnfilled.length, delta: scenarioUnfilled.length - baseUnfilled.length },
    errorCount: { before: errBefore, after: errAfter, delta: errAfter - errBefore },
    underTargetCount: { before: utBefore, after: utAfter, delta: utAfter - utBefore },
    perShift,
    slotsClosed,
    slotsOpened,
    qualityVector: { before: base?.qualityVector ?? null, after: scenario?.qualityVector ?? null },
  };
}

// ─── MULTI-RUN (MEDIAN) COMPARISON ─────────────────────────────────────────────────────────
// A single base-vs-scenario run at one seed is noisy: which of generateScheduleBest's 20 seeded
// attempts wins can move errors/under-target by several counts on its own, swamping the actual
// staffing-change signal (observed live: removing one resident moved errors 3→10 and under-target
// 5→11 with unfilled 0→0 — mostly attempt-selection noise). compareResultSets runs each side
// `repeats` times (same seed list on both sides — see ResidentScheduler.jsx's runWhatIf, which
// pairs seed_k = (baseSeed + k*0x9E3779B9)>>>0 across base/scenario so neither side gets a
// different random-restart budget) and reports MEDIANS instead of one draw.
//
// `before`/`after`/`delta` per metric are the statistical median (average of the two middle values
// for an even run count, so these can be fractional) across that side's `repeats` runs — this
// answers "is the staffing change real" without picking any single run as ground truth.
//
// perShift/slotsClosed/slotsOpened/qualityVector need ONE concrete generated schedule per side,
// not an interpolated average, so those reuse compareResults(...) on a REPRESENTATIVE pair: the
// run on each side whose own coverageMiss is closest to (for an even count, the LOWER of the two
// middle) that side's median coverageMiss. Base and scenario representatives are chosen
// independently of each other (not forced to share a seed index) — "representative" means
// "typical for this side's distribution", not "paired with the other side's pick".
function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor((n - 1) / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid] + sorted[mid + 1]) / 2;
}

function rangeOf(nums) {
  return nums.length ? { min: Math.min(...nums), max: Math.max(...nums) } : { min: 0, max: 0 };
}

// Index (into the ORIGINAL array, not the sorted copy) of the run that best represents the
// median: for an odd count this is exactly the middle value; for an even count, the lower of the
// two middle values (a deterministic, real run — never an average of two runs that don't exist).
function medianRepresentativeIndex(nums) {
  const n = nums.length;
  if (!n) return -1;
  const order = nums.map((_, i) => i).sort((a, b) => nums[a] - nums[b] || a - b);
  return order[Math.floor((n - 1) / 2)];
}

function metricsFromResult(result) {
  const unfilled = result?.report?.unfilled || [];
  const issues = result?.issues || [];
  return {
    coverageMiss: unfilled.length,
    errorCount: issues.filter(i => i.level === 'error').length,
    underTargetCount: issues.filter(i => i.rule === 'underTarget').length,
  };
}

function medianMetricBlock(beforeArr, afterArr) {
  const before = median(beforeArr);
  const after = median(afterArr);
  return { before, after, delta: after - before, beforeRange: rangeOf(beforeArr), afterRange: rangeOf(afterArr) };
}

// `baseList`/`scenarioList`: arrays of per-run results, each in the same {report, issues,
// qualityVector} shape compareResults expects for one side — i.e. `repeats` entries per side,
// same seed list used to produce both (see this function's own header above). Returns
// { coverageMiss, errorCount, underTargetCount } (each {before,after,delta,beforeRange,
// afterRange}), plus perShift/slotsClosed/slotsOpened/qualityVector from the two sides'
// median-representative runs, and `representativeIndex: {base, scenario}` so a caller can look up
// which run in each list was used for those.
export function compareResultSets(baseList, scenarioList) {
  const baseMetrics = (baseList || []).map(metricsFromResult);
  const scenarioMetrics = (scenarioList || []).map(metricsFromResult);

  const coverageMiss = medianMetricBlock(baseMetrics.map(m => m.coverageMiss), scenarioMetrics.map(m => m.coverageMiss));
  const errorCount = medianMetricBlock(baseMetrics.map(m => m.errorCount), scenarioMetrics.map(m => m.errorCount));
  const underTargetCount = medianMetricBlock(baseMetrics.map(m => m.underTargetCount), scenarioMetrics.map(m => m.underTargetCount));

  const baseRepIdx = medianRepresentativeIndex(baseMetrics.map(m => m.coverageMiss));
  const scenarioRepIdx = medianRepresentativeIndex(scenarioMetrics.map(m => m.coverageMiss));
  const baseRep = baseRepIdx >= 0 ? baseList[baseRepIdx] : null;
  const scenarioRep = scenarioRepIdx >= 0 ? scenarioList[scenarioRepIdx] : null;
  const repComparison = compareResults(baseRep, scenarioRep);

  return {
    coverageMiss,
    errorCount,
    underTargetCount,
    perShift: repComparison.perShift,
    slotsClosed: repComparison.slotsClosed,
    slotsOpened: repComparison.slotsOpened,
    qualityVector: repComparison.qualityVector,
    repeats: { base: baseList?.length || 0, scenario: scenarioList?.length || 0 },
    representativeIndex: { base: baseRepIdx, scenario: scenarioRepIdx },
  };
}
