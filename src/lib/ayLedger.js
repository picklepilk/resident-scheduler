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
// OFF-SERVICE RESIDENTS ARE SHOWN SEPARATELY, NOT SPREAD/OUTLIER-SCORED, AND CARRY NO TARGET:
// their real obligation is their rotation WINDOW (offServiceWindowStatus), not a per-28-day-block
// count, and that window math depends on availableRanges/prior-block straddling that this module
// deliberately does not re-derive (would duplicate, and risk diverging from, the real engine in
// ResidentScheduler.jsx). Their nights/weekend/holiday/assigned counts are still real and shown,
// just without a target column or outlier highlighting — comparing a 3-week rotator's raw count
// against a full-AY EM resident's would be apples-to-oranges.

import { isNightShiftId } from './shifts.js';
import { TWELVE_HOUR_IDS } from './coverage.js';
import { parseDate, getBlockDates } from './dates.js';
import { holidayDateSet } from './holidays.js';

const TWELVE_HOUR_ID_SET = new Set(TWELVE_HOUR_IDS);

export const GROUP_LABELS = {
  EM_HOME: 'EM Home',
  EM_BAMC: 'EM BAMC',
  OFF_SERVICE: 'Off-service (rotating)',
};

// Groups with fewer than this many target-bearing members don't get IQR outlier flags — IQR on a
// handful of points is noisy and would flag someone for being merely "the only one who differs".
// Min/median/max still show for any size; outlier highlighting is the part gated.
export const DEFAULT_OUTLIER_MIN_GROUP_SIZE = 4;

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
  return { blocks: 0, assigned: 0, nights: 0, weekendShifts: 0, holidayShifts: 0, twelveHour: 0, targetSum: 0, hasTarget: false };
}

// Folds one resident's one block of real schedule data into their running AY totals. `rs` is
// that resident's {dateStr: shiftId} row for this block — guarded here (untrusted shape, per
// CLAUDE.md) so a corrupted/legacy snapshot can't throw. A falsy or non-object `rs` contributes
// NOTHING, including no "seen" marker — same as computeAyPriorTotals' own `if (!rs) continue`.
function foldResidentBlock(totalsMap, rid, rs, { dates, holidaySet, assignment, resident, getShiftTarget, appSettings, isSchedulable }) {
  if (!rs || typeof rs !== 'object') return;
  const totals = totalsMap.get(rid) || emptyTotals();
  totalsMap.set(rid, totals);

  let assigned = 0, nights = 0, weekendShifts = 0, holidayShifts = 0, twelveHour = 0;
  for (const ds of dates) {
    const sid = rs[ds];
    if (!sid) continue;
    assigned++;
    if (isNightShiftId(sid)) nights++;
    const dow = parseDate(ds).getDay();
    if (dow === 0 || dow === 6) weekendShifts++;
    if (holidaySet.has(ds)) holidayShifts++;
    if (isTwelveHourShiftId(sid)) twelveHour++;
  }
  totals.blocks += 1;
  totals.assigned += assigned;
  totals.nights += nights;
  totals.weekendShifts += weekendShifts;
  totals.holidayShifts += holidayShifts;
  totals.twelveHour += twelveHour;

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

function summarize(values) {
  if (!values.length) return { min: null, median: null, max: null, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: quantile(sorted, 0.5), max: sorted[sorted.length - 1], count: sorted.length };
}

// Classic Tukey fence (1.5x IQR beyond Q1/Q3) over one column's values within one group. Returns
// the residentIds flagged as outliers for that column. Exported for direct unit testing.
export function iqrOutlierIds(rows, col) {
  const withVals = rows.filter(r => r[col] != null);
  if (withVals.length < 4) return [];
  const sorted = withVals.map(r => r[col]).sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr, upper = q3 + 1.5 * iqr;
  return withVals.filter(r => r[col] < lower || r[col] > upper).map(r => r.residentId);
}

// Columns that get spread stats + outlier flags for the two EM groups; off-service groups get the
// same list minus deltaFromTarget (they carry no target at all — see module header).
const EM_SPREAD_COLS = ['assigned', 'nights', 'weekendShifts', 'holidayShifts', 'deltaFromTarget'];
const OFF_SERVICE_SPREAD_COLS = ['assigned', 'nights', 'weekendShifts', 'holidayShifts'];

/**
 * Builds the AY fairness ledger: one row per resident who appears in at least one in-scope block,
 * grouped into EM Home / EM BAMC / Off-service, each group carrying per-column min/median/max and
 * (group size permitting) IQR outlier ids.
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
 * @param {number} [outlierMinGroupSize]
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
  outlierMinGroupSize = DEFAULT_OUTLIER_MIN_GROUP_SIZE,
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
      name: `${resident.firstName || ''} ${resident.lastName || ''}`.trim() || rid,
      category: resident.category,
      pgy: resident.pgy,
      group,
      blocks: totals.blocks,
      assigned: totals.assigned,
      nights: totals.nights,
      weekendShifts: totals.weekendShifts,
      holidayShifts: totals.holidayShifts,
      twelveHour: totals.twelveHour,
      target,
      deltaFromTarget: target != null ? totals.assigned - target : null,
    });
  }

  const groups = Object.keys(GROUP_LABELS)
    .map(key => {
      const groupRows = rows.filter(r => r.group === key).sort((a, b) =>
        // Default order: most-under-target first (biggest unmet need surfaces at the top) for the
        // two EM groups; off-service (no target) falls back to name order.
        key === 'OFF_SERVICE' ? a.name.localeCompare(b.name) : (a.deltaFromTarget ?? 0) - (b.deltaFromTarget ?? 0));
      const cols = key === 'OFF_SERVICE' ? OFF_SERVICE_SPREAD_COLS : EM_SPREAD_COLS;
      const stats = {};
      const outlierIds = {};
      for (const col of cols) {
        stats[col] = summarize(groupRows.map(r => r[col]).filter(v => v != null));
        outlierIds[col] = groupRows.length ? iqrOutlierIds(groupRows, col) : [];
        if (groupRows.filter(r => r[col] != null).length < outlierMinGroupSize) outlierIds[col] = [];
      }
      return { key, label: GROUP_LABELS[key], rows: groupRows, stats, outlierIds, excludedFromSpread: key === 'OFF_SERVICE' };
    })
    .filter(g => g.rows.length > 0);

  return { ay, groups };
}
