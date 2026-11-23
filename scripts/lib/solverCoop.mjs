// Pure helpers for scripts/solver-coop.mjs (cooperation of several solver machines on ONE schedule, at the
// schedule level). No I/O. Grids are flat residents x dates arrays of shift ids ("" = empty), as in solverLiveAnalysis.
import * as AN from "./solverLiveAnalysis.mjs";

// Lexicographic tier compare, lower better. null tiers = worst (unknown). -1 a better, 1 b better, 0 equal.
export function compareTiersNullable(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return AN.compareTiers(a, b);
}
export const strictlyBetter = (a, b) => compareTiersNullable(a, b) < 0;

// results: [{name, tiers, ...}] -> best entry (first wins ties) or null when empty / none has tiers.
export function bestOf(results) {
  let best = null;
  for (const r of results || []) {
    if (!r || !r.tiers) continue;
    if (!best || compareTiersNullable(r.tiers, best.tiers) < 0) best = r;
  }
  return best;
}

// Per-machine seed for a slice/round: seed + machineIndex*1000 + slice.
export const sliceSeed = (seed, machineIndex, slice) => Number(seed) + machineIndex * 1000 + slice;

// Budget for the next slice given time left; null when the remainder is too small to be worth a job.
export function nextSliceBudget(remainingSec, sliceSec, minSliceSec = 5) {
  if (!(remainingSec >= minSliceSec)) return null;
  return Math.min(sliceSec, remainingSec);
}

// grid -> payload hint / locked list [{residentId,date,shiftId}]
export function gridToCells(residents, dates, grid) {
  const nd = dates.length, out = [];
  for (let ri = 0; ri < residents.length; ri++) for (let di = 0; di < nd; di++) {
    const s = grid[ri * nd + di];
    if (s) out.push({ residentId: residents[ri], date: dates[di], shiftId: s });
  }
  return out;
}

// K disjoint date-window neighborhoods for a round. Dates are cut into consecutive blocks of windowDays; round r
// takes K consecutive blocks starting at (r*K) mod blocks (rotating, wrapping). Fewer than K when blocks < K.
// Returns [{index, dates:Set<string>, from, to}].
export function pickNeighborhoods(dates, k, round, windowDays = 7) {
  const w = Math.max(1, Math.floor(windowDays));
  const blocks = [];
  for (let i = 0; i < dates.length; i += w) blocks.push(dates.slice(i, i + w));
  const n = Math.min(k, blocks.length), out = [];
  for (let j = 0; j < n; j++) {
    const b = blocks[(round * k + j) % blocks.length];
    out.push({ index: j, dates: new Set(b), from: b[0], to: b[b.length - 1] });
  }
  return out;
}

// Locked cells for a sub-solve: payload's own locked cells, plus every non-empty grid cell OUTSIDE the
// neighborhood's dates pinned to the global grid. Existing locked entries win on a (resident,date) clash.
export function lockedForNeighborhood(baseLocked, residents, dates, grid, nb) {
  const seen = new Set(), out = [];
  for (const c of baseLocked || []) { seen.add(`${c.residentId}|${c.date}`); out.push(c); }
  for (const c of gridToCells(residents, dates, grid)) {
    if (nb.dates.has(c.date)) continue;
    const k = `${c.residentId}|${c.date}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(c);
  }
  return out;
}

// Apply each machine's result inside ITS OWN neighborhood onto the global grid.
// parts: [{nb, grid}] (grid = that machine's full result grid). Neighborhoods must be date-disjoint.
export function mergeNeighborhoods(residents, dates, globalGrid, parts) {
  const nd = dates.length, g = globalGrid.slice();
  for (const { nb, grid } of parts) {
    for (let di = 0; di < nd; di++) {
      if (!nb.dates.has(dates[di])) continue;
      for (let ri = 0; ri < residents.length; ri++) g[ri * nd + di] = grid[ri * nd + di];
    }
  }
  return g;
}

// Contribution bookkeeping: wins per machine name.
export function addWin(contrib, name) {
  contrib[name] = (contrib[name] || 0) + 1;
  return contrib;
}
