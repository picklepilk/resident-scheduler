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
