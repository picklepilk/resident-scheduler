// src/lib/stateDiff.js
// Pure summary diff between two LS_BACKUP_KEYS-shaped documents (see ResidentScheduler.jsx's
// SUPABASE SYNC section / CLAUDE.md Persistence section) — backs Settings' Version History
// "Preview diff summary". Deliberately a coarse SUMMARY, not a field-by-field diff: the chief
// needs "is this the save I think it is" at a glance, not a full audit trail. Pure module: no
// React, must never import ResidentScheduler.jsx (circular — see CLAUDE.md).
//
// Every input is treated as untrusted (same posture as jeopardyLedger.js) — this data round-trips
// through a shared cloud row and historical snapshots that may predate later-added fields, so a
// missing/malformed shape is tolerated (treated as empty), never thrown on.

// Generic structural equality — deliberately NOT JSON.stringify comparison, which is sensitive to
// key insertion order and would false-positive two objects built in a different order as
// "changed". Treats arrays as objects with numeric-index keys, which is fine here: we only ever
// compare same-shaped arrays (both sides are the same block/roster field).
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// res_current_block + every res_blocks_history snapshot, keyed by block id — the same "current
// block plus history" combination resident_block_lookup() (Supabase) reads, so a block edited
// only in the live block (not yet saved to history) is still counted.
function blocksById(doc) {
  const map = new Map();
  const add = b => { if (b && b.id) map.set(b.id, b); };
  add(doc?.res_current_block);
  for (const b of doc?.res_blocks_history || []) add(b);
  return map;
}

// block.schedule shape: { [residentId]: { [dateStr]: shiftId } }. Counts one changed cell per
// (resident, date) pair whose assigned shift id differs (added, removed, or swapped) — `??`
// collapses a missing row/cell to null so "never assigned" and "explicitly cleared" compare equal.
function scheduleCellsChanged(oldSchedule, newSchedule) {
  const os = oldSchedule || {};
  const ns = newSchedule || {};
  const residentIds = new Set([...Object.keys(os), ...Object.keys(ns)]);
  let changed = 0;
  for (const rid of residentIds) {
    const oldRow = os[rid] || {};
    const newRow = ns[rid] || {};
    const dates = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
    for (const d of dates) {
      if ((oldRow[d] ?? null) !== (newRow[d] ?? null)) changed++;
    }
  }
  return changed;
}

// A block "changed" if its schedule has any changed cell, OR any non-schedule field differs
// (dates, assignments, special days, etc.) — schedule is compared separately (cell-granularity)
// so it never double-triggers blocksChanged on its own content alone being the only field diff.
function blockChanged(oldBlock, newBlock) {
  if (!oldBlock || !newBlock) return true; // only exists on one side = changed (added/removed)
  if (scheduleCellsChanged(oldBlock.schedule, newBlock.schedule) > 0) return true;
  const { schedule: _os, ...oldMeta } = oldBlock;
  const { schedule: _ns, ...newMeta } = newBlock;
  return !deepEqual(oldMeta, newMeta);
}

// diffState(oldDoc, newDoc) -> { blocksChanged, residentsAdded, residentsRemoved, scheduleCellsChanged }
// "old"/"new" are directional: for Version History's "what would restoring this change" preview,
// pass (current live document, historical snapshot) — residentsAdded/Removed and blocksChanged
// then read as "added by restoring" / "removed by restoring".
export function diffState(oldDoc, newDoc) {
  const od = oldDoc || {};
  const nd = newDoc || {};

  const oldRoster = Array.isArray(od.res_em_roster) ? od.res_em_roster : [];
  const newRoster = Array.isArray(nd.res_em_roster) ? nd.res_em_roster : [];
  const oldIds = new Set(oldRoster.map(r => r?.id).filter(Boolean));
  const newIds = new Set(newRoster.map(r => r?.id).filter(Boolean));
  let residentsAdded = 0;
  let residentsRemoved = 0;
  for (const id of newIds) if (!oldIds.has(id)) residentsAdded++;
  for (const id of oldIds) if (!newIds.has(id)) residentsRemoved++;

  const oldBlocks = blocksById(od);
  const newBlocks = blocksById(nd);
  const allBlockIds = new Set([...oldBlocks.keys(), ...newBlocks.keys()]);
  let blocksChanged = 0;
  let scheduleCellsChangedTotal = 0;
  for (const id of allBlockIds) {
    const ob = oldBlocks.get(id);
    const nb = newBlocks.get(id);
    scheduleCellsChangedTotal += scheduleCellsChanged(ob?.schedule, nb?.schedule);
    if (blockChanged(ob, nb)) blocksChanged++;
  }

  return { blocksChanged, residentsAdded, residentsRemoved, scheduleCellsChanged: scheduleCellsChangedTotal };
}
