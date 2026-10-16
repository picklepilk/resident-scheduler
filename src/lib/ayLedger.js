// src/lib/ayLedger.js
// Academic-year fairness ledger: cumulative per-resident load across every saved (published)
// block of the current academic year, plus the live current block, for the chief's Dashboard
// card. Pure, no React, no side effects — may never import ResidentScheduler.jsx (that file
// imports lib/* the other direction; see CLAUDE.md).
//
// DISPLAY ONLY. This module feeds nothing back into targets, eligibility, or the generator — see
// CLAUDE.md "Per-resident counts from real historical schedules never derive/validate targets".
// It exists purely so a chief can eyeball "who's been under/over-worked this year" before
// balancing the next block. Nothing here is read by generateSchedule/generateScheduleBest/
// validateAll/buildSolverPayload.
//
// DEFINITIONS ARE BORROWED, NEVER RE-DERIVED:
//   - night shift   -> lib/shifts.js isNightShiftId (SHIFT_MAP[id].type === 'night')
//   - weekend shift -> JS getDay() 0 (Sun) or 6 (Sat), same test ResidentScheduler.jsx's
//                      computeAyPriorTotals uses for its own (differently-scoped) AY carryover map
//   - holiday shift -> lib/holidays.js holidayDateSet(ayConf) ("absent config derives NOTHING")
//   - 12h shift     -> lib/coverage.js TWELVE_HOUR_IDS
//   - hours         -> lib/shifts.js SHIFT_TIMING[id].durationH (same formula the old Dashboard
//                      EquityPanel card used before being folded into this ledger)
//   - AY window     -> not needed directly here (blocksHistory snapshots already carry their own
//                      academicYear string; filtering is a plain string match against `ay`)
//
// AY POPULATION RULE (mirrors computeAyPriorTotals in ResidentScheduler.jsx — "a resident absent
// from every published snapshot is simply absent from the map; callers MUST treat that as 'no
// history', never as zero"): a resident only appears in the ledger if their id is a key in at
// least one in-scope block's `schedule` object with a truthy (even if entirely empty) row. A
// resident never touched by any in-scope block is omitted outright, not shown with zeroed columns
// — showing a zero would read as "fully rested" when it may really mean "wasn't on the roster yet"
// or "this block's snapshot predates them".
//
// TARGET RECONSTRUCTION, DOCUMENTED LIMITATION: `getShiftTarget` and the resident roster
// (category/pgy/name) are both owned by ResidentScheduler.jsx and are NOT stored inside a
// blocksHistory snapshot (buildSnapData only persists emBlockAssignments + schedule + dates, never
// the roster) — so a resident's category/pgy/name always come from the CURRENT roster
// (`allResidents`), not from whatever they were when a past block was saved. Within one academic
// year this is safe (PGY only advances at the AY boundary). A resident removed from the roster
// entirely since a past block was saved can't be named or categorized, so they're silently
// dropped from the ledger (not zeroed, not miscategorized) — a known, acceptable gap for a
// display-only nice-to-have. Likewise `appSettings.targetOverrides` is read from the CURRENT
// settings for every historical block too, since past overrides aren't versioned/stored per
// snapshot — the ledger shows "what you'd target this resident at today", not a time-accurate
// historical target. This is fine for the ledger's actual purpose (balancing the NEXT block).
//
// A resident whose every in-scope block was a non-schedulable rotation (Elective, Ortho/VAC, ...)
// has no target at all this AY (`target === null`) even though their category is EM_HOME/EM_BAMC —
// these are grouped alongside their PGY peers but pulled into a per-group "not on EM rotation"
// bucket (`noTargetRows`), never compared against peers who do have a target.
//
// OFF-SERVICE RESIDENTS (different category entirely — PED/MT/etc. rotators) ARE SHOWN SEPARATELY,
// NEVER FLAGGED: their real obligation is their rotation WINDOW (offServiceWindowStatus), not a
// per-28-day-block count, and that window math depends on availableRanges/prior-block straddling
// that this module deliberately does not re-derive (would duplicate, and risk diverging from, the
// real engine in ResidentScheduler.jsx). Their nights/weekend/holiday/assigned counts are still
// real and shown, just without a target, a peer-median comparison, or outlier/behind-target flags.

import { isNightShiftId, SHIFT_TIMING } from './shifts.js';
import { TWELVE_HOUR_IDS } from './coverage.js';
import { parseDate, getBlockDates } from './dates.js';
import { holidayDateSet } from './holidays.js';

const TWELVE_HOUR_ID_SET = new Set(TWELVE_HOUR_IDS);

export const GROUP_LABELS = {
  EM_HOME: 'EM Home',
  EM_BAMC: 'EM BAMC',
  OFF_SERVICE: 'Off-service (rotating)',
};

// Mirrors ResidentScheduler.jsx's own isEmResident exactly (category === 'EM_HOME' ||
// 'EM_BAMC') — kept here as the default only so this module is independently testable; the real
// caller (DashboardTab) should pass the actual isEmResident so the two can never silently drift.
export function defaultIsEm(resident) {
  return resident?.category === 'EM_HOME' || resident?.category === 'EM_BAMC';
}

function isTwelveHourShiftId(sid) {
  return TWELVE_HOUR_ID_SET.has(sid);
}

function emptyTotals() {
  return { blocks: 0, assigned: 0, nights: 0, weekendShifts: 0, holidayShifts: 0, twelveHour: 0, hours: 0, targetSum: 0, hasTarget: false };
}

// Folds one resident's one block of real schedule data into their running AY totals. `rs` is
// that resident's {dateStr: shiftId} row for this block — guarded here (untrusted shape, per
// CLAUDE.md) so a corrupted/legacy snapshot can't throw. A falsy or non-object `rs` contributes
// NOTHING, including no "seen" marker — same as computeAyPriorTotals' own `if (!rs) continue`.
function foldResidentBlock(totalsMap, rid, rs, { dates, holidaySet, assignment, resident, getShiftTarget, appSettings, isSchedulable }) {
  if (!rs || typeof rs !== 'object') return;
  const totals = totalsMap.get(rid) || emptyTotals();
  totalsMap.set(rid, totals);

  let assigned = 0, nights = 0, weekendShifts = 0, holidayShifts = 0, twelveHour = 0, hours = 0;
  for (const ds of dates) {
    const sid = rs[ds];
    if (!sid) continue;
    assigned++;
    if (isNightShiftId(sid)) nights++;
    const dow = parseDate(ds).getDay();
    if (dow === 0 || dow === 6) weekendShifts++;
    if (holidaySet.has(ds)) holidayShifts++;
    if (isTwelveHourShiftId(sid)) twelveHour++;
    // Same SHIFT_TIMING-based duration EquityPanel used (row.hours += SHIFT_TIMING[sid]?.durationH
    // || 0) — reused verbatim rather than re-derived, per CLAUDE.md.
    hours += SHIFT_TIMING[sid]?.durationH || 0;
  }
  totals.blocks += 1;
  totals.assigned += assigned;
  totals.nights += nights;
  totals.weekendShifts += weekendShifts;
  totals.holidayShifts += holidayShifts;
  totals.twelveHour += twelveHour;
  totals.hours += hours;

  // Target reconstruction — same {...resident, isChief, blockType, targetDelta} assembly idiom
  // EmBlockAssignmentsEditor's own `target(r)` helper uses (ResidentScheduler.jsx), applied to
  // whichever block this row came from. Off-service residents reach here too (their category's
  // SHIFT_TARGETS baseline resolves fine through getShiftTarget), but the caller discards their
  // target below — see the module header on why.
  if (resident && typeof getShiftTarget === 'function') {
    const ba = assignment && typeof assignment === 'object' ? assignment : {};
    const asOfBlock = { ...resident, isChief: !!ba.isChief, blockType: ba.blockType ?? 'EM', targetDelta: ba.targetDelta };
    // A non-schedulable rotation (Elective, Ortho/VAC, ...) owes no EM shifts that block —
    // getShiftTarget alone would return the base EM target, so gate it like the generator does.
    const owes = typeof isSchedulable === 'function' ? isSchedulable(asOfBlock) : true;
    const t = owes ? getShiftTarget(asOfBlock, appSettings || {}) : null;
    if (t != null) {
      totals.targetSum += t;
      totals.hasTarget = true;
    }
  }
}

function quantile(sortedVals, q) {
  if (!sortedVals.length) return null;
  if (sortedVals.length === 1) return sortedVals[0];
  const idx = (sortedVals.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedVals[lo];
  return sortedVals[lo] + (sortedVals[hi] - sortedVals[lo]) * (idx - lo);
}

function median(values) {
  const vals = values.filter(v => v != null);
  if (!vals.length) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  return quantile(sorted, 0.5);
}

// A column is only worth a place in the table when at least one resident in the whole AY has a
// non-zero value in it — otherwise it's all-zero noise (CLAUDE.md task: "Hol/12h/Blocks columns
// are mostly 0/1 noise"). `blocks` is special-cased to ">1" since every compared resident has at
// least one block by construction (that's how they entered the ledger at all).
export function computeColumnVisibility(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    holidays: list.some(r => (r.holidayShifts || 0) > 0),
    twelveHour: list.some(r => (r.twelveHour || 0) > 0),
    blocks: list.some(r => (r.blocks || 0) > 1),
  };
}

const CATEGORY_LABELS = { EM_HOME: GROUP_LABELS.EM_HOME, EM_BAMC: GROUP_LABELS.EM_BAMC };
const PGY_SORT_FALLBACK = 999;
const NO_PGY_KEY = '__none__';

function pgyLabel(pgy) {
  return (pgy === null || pgy === undefined || pgy === '') ? 'PGY-?' : `PGY-${pgy}`;
}

// Splits one category's rows (already resolved to EM_HOME or EM_BAMC) into per-PGY groups, each
// carrying its own "compared" rows (has a target this AY) and "not on EM rotation" rows (no target
// this AY — e.g. every in-scope block was an Elective/Ortho rotation) separately, plus the
// compared group's own median assigned/nights/weekendShifts/hours (used both for the group header
// subtitle and, by flagLedgerRows, as the "peer median" a resident's raw counts get compared to).
function buildPgyGroups(categoryKey, categoryRows) {
  const byPgy = new Map();
  for (const r of categoryRows) {
    const pgyKey = r.pgy ?? NO_PGY_KEY;
    if (!byPgy.has(pgyKey)) byPgy.set(pgyKey, []);
    byPgy.get(pgyKey).push(r);
  }
  return [...byPgy.entries()]
    .sort(([a], [b]) => {
      const av = a === NO_PGY_KEY ? PGY_SORT_FALLBACK : Number(a);
      const bv = b === NO_PGY_KEY ? PGY_SORT_FALLBACK : Number(b);
      return av - bv;
    })
    .map(([pgyKey, groupRows]) => {
      const pgy = pgyKey === NO_PGY_KEY ? null : pgyKey;
      const compared = groupRows.filter(r => r.target != null).sort((a, b) => a.name.localeCompare(b.name));
      const noTargetRows = groupRows.filter(r => r.target == null).sort((a, b) => a.name.localeCompare(b.name));
      return {
        key: `${categoryKey}_PGY${pgy ?? 'X'}`,
        pgy,
        label: pgyLabel(pgy),
        rows: compared,
        noTargetRows,
        medians: {
          assigned: median(compared.map(r => r.assigned)),
          nights: median(compared.map(r => r.nights)),
          weekendShifts: median(compared.map(r => r.weekendShifts)),
          hours: median(compared.map(r => r.hours)),
        },
      };
    });
}

function buildCategory(key, categoryRows) {
  if (!categoryRows.length) return null;
  return { key, label: CATEGORY_LABELS[key], pgyGroups: buildPgyGroups(key, categoryRows) };
}

/**
 * Builds the AY fairness ledger: one row per resident who appears in at least one in-scope block,
 * grouped EM Home / EM BAMC (each split further into per-PGY groups, comparable residents only —
 * see module header) with Off-service kept entirely separate (no target, no flags, no PGY split).
 *
 * @param {string} ay                 academic-year string this ledger is scoped to (e.g. "AY26/27")
 * @param {object[]} allResidents     current denormalized roster (EM + off-service) — the only
 *                                    source of name/category/pgy; see module header
 * @param {object|null} currentBlock  the live (possibly unsaved) block: {id, academicYear,
 *                                    startDate, endDate, schedule, emBlockAssignments}
 * @param {object[]} blocksHistory    untrusted-shape array of saved snapshots
 * @param {object} ayConf             this AY's config (ayData[ay]) — read only for holidays
 * @param {object} appSettings        current app settings (targetOverrides etc.)
 * @param {(resident:object, appSettings:object)=>number|null} getShiftTarget  injected (owned by
 *   ResidentScheduler.jsx) — lib may not import it, see CLAUDE.md
 * @param {(resident:object)=>boolean} [isEm]  injected classifier, defaults to defaultIsEm
 * @param {(resident:object)=>boolean} [isSchedulable]  injected; a block whose rotation is not
 *   schedulable contributes shifts but no target
 */
export function buildAyLedger({
  ay,
  allResidents = [],
  currentBlock = null,
  blocksHistory = [],
  ayConf = {},
  appSettings = {},
  getShiftTarget,
  isEm = defaultIsEm,
  isSchedulable,
}) {
  const residentIndex = new Map((Array.isArray(allResidents) ? allResidents : []).filter(Boolean).map(r => [r.id, r]));
  const holidaySet = holidayDateSet(ayConf);
  const totalsByResident = new Map();

  // Published snapshots for this AY only — same "published" gate computeAyPriorTotals applies, so
  // a draft/abandoned save never pollutes the ledger. The current block's OWN possibly-stale saved
  // copy is excluded here; its live, possibly-further-edited version is folded in separately below.
  const history = (Array.isArray(blocksHistory) ? blocksHistory : [])
    .filter(snap => snap && typeof snap === 'object' && snap.published)
    .filter(snap => (snap.academicYear || snap?.data?.academicYear) === ay)
    .filter(snap => !currentBlock || snap.id !== currentBlock.id);

  for (const snap of history) {
    const data = snap.data && typeof snap.data === 'object' ? snap.data : {};
    const schedule = data.schedule && typeof data.schedule === 'object' ? data.schedule : {};
    const dates = getBlockDates(snap.startDate || data.startDate, snap.endDate || data.endDate);
    if (!dates.length) continue;
    const assignments = data.emBlockAssignments && typeof data.emBlockAssignments === 'object' ? data.emBlockAssignments : {};
    for (const rid of Object.keys(schedule)) {
      foldResidentBlock(totalsByResident, rid, schedule[rid], {
        dates, holidaySet, assignment: assignments[rid], resident: residentIndex.get(rid), getShiftTarget, appSettings, isSchedulable,
      });
    }
  }

  // Live current block — included unconditionally (no `published` gate), because the whole point
  // of this card is helping the chief balance the block they're actively working on right now.
  if (currentBlock && (currentBlock.academicYear || ay) === ay) {
    const schedule = currentBlock.schedule && typeof currentBlock.schedule === 'object' ? currentBlock.schedule : {};
    const dates = getBlockDates(currentBlock.startDate, currentBlock.endDate);
    if (dates.length) {
      const assignments = currentBlock.emBlockAssignments && typeof currentBlock.emBlockAssignments === 'object' ? currentBlock.emBlockAssignments : {};
      for (const rid of Object.keys(schedule)) {
        foldResidentBlock(totalsByResident, rid, schedule[rid], {
          dates, holidaySet, assignment: assignments[rid], resident: residentIndex.get(rid), getShiftTarget, appSettings, isSchedulable,
        });
      }
    }
  }

  const rows = [];
  for (const [rid, totals] of totalsByResident) {
    const resident = residentIndex.get(rid);
    if (!resident) continue; // can't name/categorize — see module header; silently dropped, not zeroed
    const group = isEm(resident) ? (resident.category === 'EM_BAMC' ? 'EM_BAMC' : 'EM_HOME') : 'OFF_SERVICE';
    const target = group !== 'OFF_SERVICE' && totals.hasTarget ? totals.targetSum : null;
    rows.push({
      residentId: rid,
      // "Last, First" (no PGY suffix — callers render residents already grouped by PGY).
      name: `${resident.lastName || ''}, ${resident.firstName || ''}`.replace(/^, /, '').replace(/, $/, '') || rid,
      category: resident.category,
      pgy: resident.pgy,
      group,
      blocks: totals.blocks,
      assigned: totals.assigned,
      nights: totals.nights,
      weekendShifts: totals.weekendShifts,
      holidayShifts: totals.holidayShifts,
      twelveHour: totals.twelveHour,
      hours: totals.hours,
      target,
      deltaFromTarget: target != null ? totals.assigned - target : null,
    });
  }

  const emHomeRows = rows.filter(r => r.group === 'EM_HOME');
  const emBamcRows = rows.filter(r => r.group === 'EM_BAMC');
  const offServiceRows = rows.filter(r => r.group === 'OFF_SERVICE').sort((a, b) => a.name.localeCompare(b.name));

  const categories = [buildCategory('EM_HOME', emHomeRows), buildCategory('EM_BAMC', emBamcRows)].filter(Boolean);
  const offService = { key: 'OFF_SERVICE', label: GROUP_LABELS.OFF_SERVICE, rows: offServiceRows };

  return { ay, categories, offService, columnVisibility: computeColumnVisibility(rows) };
}

// ─── FLAGGING ───────────────────────────────────────────────────────────────
// Everything below operates on the `categories` buildAyLedger already produced (never on
// off-service — "their real obligation is their rotation window... without a target, a peer-
// median comparison, or outlier/behind-target flags", see module header).

// A resident reading "behind" needs to be MEANINGFULLY behind, not off by a single swapped shift.
export const DEFAULT_BEHIND_TARGET_THRESHOLD = 2;
// "Heavy"/"light" nights or weekends compares a resident's RATE (nights per shift worked, so a
// reduced/vacation-heavy block doesn't get flagged just for working less) against their own
// group's median rate, but ALSO requires the raw count to differ from the group's median raw
// count by at least DEFAULT_FLAG_RAW_DELTA — the raw-count gate keeps a tiny group (or a
// resident who worked very few shifts) from being flagged over noise like "1 night vs 0".
export const DEFAULT_HEAVY_RATE_MULTIPLIER = 1.4;
export const DEFAULT_LIGHT_RATE_MULTIPLIER = 0.6;
export const DEFAULT_FLAG_RAW_DELTA = 2;
// Rate-based flags need at least this many comparable (assigned > 0) peers in the group, or a
// single resident's own rate would trivially equal "the median", producing meaningless flags.
const MIN_COMPARABLE_FOR_RATE_FLAGS = 2;

function rateOf(count, assigned) {
  return assigned > 0 ? count / assigned : null;
}

// Flags one PGY group's compared rows in place (returns a new group + mutates nothing passed in).
function flagGroup(group, opts) {
  const { behindTargetThreshold, heavyRateMultiplier, lightRateMultiplier, flagRawDelta } = opts;
  const rows = group.rows;
  const nightsMedian = group.medians.nights ?? 0;
  const weekendMedian = group.medians.weekendShifts ?? 0;
  const comparable = rows.filter(r => r.assigned > 0);
  const nightRateMedian = median(comparable.map(r => rateOf(r.nights, r.assigned)));
  const weekendRateMedian = median(comparable.map(r => rateOf(r.weekendShifts, r.assigned)));
  const canFlagRates = comparable.length >= MIN_COMPARABLE_FOR_RATE_FLAGS;

  const flaggedRows = rows.map(r => {
    const behindTarget = r.target != null && (r.target - r.assigned) >= behindTargetThreshold;
    let heavyNights = false, lightNights = false, heavyWeekends = false, lightWeekends = false;
    if (canFlagRates && r.assigned > 0) {
      const nightRate = rateOf(r.nights, r.assigned);
      if (nightRateMedian != null) {
        heavyNights = nightRate >= heavyRateMultiplier * nightRateMedian && r.nights >= nightsMedian + flagRawDelta;
        lightNights = nightRate <= lightRateMultiplier * nightRateMedian && r.nights <= nightsMedian - flagRawDelta;
      }
      const weekendRate = rateOf(r.weekendShifts, r.assigned);
      if (weekendRateMedian != null) {
        heavyWeekends = weekendRate >= heavyRateMultiplier * weekendRateMedian && r.weekendShifts >= weekendMedian + flagRawDelta;
        lightWeekends = weekendRate <= lightRateMultiplier * weekendRateMedian && r.weekendShifts <= weekendMedian - flagRawDelta;
      }
    }
    return { ...r, flags: { behindTarget, heavyNights, lightNights, heavyWeekends, lightWeekends } };
  });

  // Default display order: behind-target first, then heavy (nights or weekends), then everyone
  // else, each tier alphabetical by name — see CLAUDE.md task spec item 6. Column headers can
  // still re-sort (that's a presentation concern the caller/component owns).
  const rank = r => r.flags.behindTarget ? 0 : (r.flags.heavyNights || r.flags.heavyWeekends) ? 1 : 2;
  flaggedRows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  return { ...group, rows: flaggedRows };
}

/**
 * Annotates every compared row in `categories` (buildAyLedger's own `categories` array) with a
 * `flags` object ({behindTarget, heavyNights, lightNights, heavyWeekends, lightWeekends}), sorts
 * each PGY group's rows into the default flagged-first order, and returns a top-level `summary` of
 * residentIds per flag (for Dashboard summary chips + click-to-filter). Pure; off-service is
 * untouched (not passed in here at all — see module header).
 *
 * @param {object[]} categories  buildAyLedger's `categories` array
 * @param {object} [opts]  threshold overrides (see the DEFAULT_* consts above)
 */
export function flagLedgerRows(categories, opts = {}) {
  const resolvedOpts = {
    behindTargetThreshold: opts.behindTargetThreshold ?? DEFAULT_BEHIND_TARGET_THRESHOLD,
    heavyRateMultiplier: opts.heavyRateMultiplier ?? DEFAULT_HEAVY_RATE_MULTIPLIER,
    lightRateMultiplier: opts.lightRateMultiplier ?? DEFAULT_LIGHT_RATE_MULTIPLIER,
    flagRawDelta: opts.flagRawDelta ?? DEFAULT_FLAG_RAW_DELTA,
  };

  const summary = { behindTargetIds: [], heavyNightsIds: [], lightNightsIds: [], heavyWeekendsIds: [], lightWeekendsIds: [] };

  const annotatedCategories = (Array.isArray(categories) ? categories : []).map(cat => ({
    ...cat,
    pgyGroups: cat.pgyGroups.map(group => {
      const flagged = flagGroup(group, resolvedOpts);
      for (const r of flagged.rows) {
        if (r.flags.behindTarget) summary.behindTargetIds.push(r.residentId);
        if (r.flags.heavyNights) summary.heavyNightsIds.push(r.residentId);
        if (r.flags.lightNights) summary.lightNightsIds.push(r.residentId);
        if (r.flags.heavyWeekends) summary.heavyWeekendsIds.push(r.residentId);
        if (r.flags.lightWeekends) summary.lightWeekendsIds.push(r.residentId);
      }
      return flagged;
    }),
  }));

  return { categories: annotatedCategories, summary };
}
