// "Changes since last Generate": compact baseline stored at generate commit + diff/revert helpers.
// Pure; reuses diffSchedules. Baseline rides inside the block (`block.lastGenerated`) so it
// round-trips through backup/cloud with no new res_* key.
import { diffSchedules } from './optimizerSweep.js';

// Strip empty cells so the baseline stays small (residentId -> date -> shiftId).
export function compactSchedule(schedule) {
  const out = {};
  for (const [rid, row] of Object.entries(schedule || {})) {
    if (!row || typeof row !== 'object') continue;
    const r = {};
    for (const [ds, sid] of Object.entries(row)) if (sid) r[ds] = sid;
    if (Object.keys(r).length) out[rid] = r;
  }
  return out;
}

export function buildLastGenerated({ schedule, engine, at }) {
  return { at: at || new Date().toISOString(), engine: engine || 'local', schedule: compactSchedule(schedule) };
}

// Flat rows [{residentId, date, from, to, type}] where from = baseline shift, to = current shift.
// diffSchedules(current=baseline, alt=now): 'from' = baseline, 'to' = now.
export function sinceGenerateRows(lastGenerated, currentSchedule) {
  if (!lastGenerated || typeof lastGenerated.schedule !== 'object' || !lastGenerated.schedule) return [];
  const { byResident } = diffSchedules(lastGenerated.schedule, compactSchedule(currentSchedule));
  const rows = [];
  for (const [residentId, changes] of Object.entries(byResident)) {
    for (const c of changes) {
      rows.push({ residentId, date: c.date, from: c.from || null, to: c.to || null, type: c.type });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.residentId.localeCompare(b.residentId));
  return rows;
}

// Apply reverts (restore baseline value) to a block. Skips locked cells unless allowLocked.
// Returns { block, reverted, skippedLocked }.
export function revertRows(block, rows, { allowLocked = false } = {}) {
  const schedule = { ...(block.schedule || {}) };
  const copied = new Set();
  let reverted = 0, skippedLocked = 0;
  for (const r of rows) {
    if (!allowLocked && block.lockedCells?.[r.residentId]?.[r.date]) { skippedLocked++; continue; }
    if (!copied.has(r.residentId)) { schedule[r.residentId] = { ...(schedule[r.residentId] || {}) }; copied.add(r.residentId); }
    if (r.from) schedule[r.residentId][r.date] = r.from; else delete schedule[r.residentId][r.date];
    reverted++;
  }
  return { block: { ...block, schedule }, reverted, skippedLocked };
}
