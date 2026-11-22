// Pure helpers for the Generate -> Optimize -> Compare flow. No React, never imports ResidentScheduler.jsx.
// Schedule maps are { residentId: { 'YYYY-MM-DD': shiftId } }. Summaries are
// { errors, blockingWarnings, belowMin, aboveMax, quality: number[] } (lower is better everywhere).

const isFilled = v => v !== undefined && v !== null && v !== '';

function cellMap(sched) {
  const out = new Map();
  if (!sched || typeof sched !== 'object') return out;
  for (const rid of Object.keys(sched)) {
    const row = sched[rid];
    if (!row || typeof row !== 'object') continue;
    for (const date of Object.keys(row)) {
      if (isFilled(row[date])) out.set(`${rid}\u0000${date}`, { residentId: rid, date, shiftId: row[date] });
    }
  }
  return out;
}

const byResDate = (a, b) => (a.residentId < b.residentId ? -1 : a.residentId > b.residentId ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function diffSchedules(before, after) {
  const b = cellMap(before), a = cellMap(after);
  const added = [], removed = [], changed = [];
  let kept = 0;
  for (const [k, cell] of b) {
    const nx = a.get(k);
    if (!nx) removed.push({ ...cell });
    else if (nx.shiftId !== cell.shiftId) changed.push({ residentId: cell.residentId, date: cell.date, from: cell.shiftId, to: nx.shiftId });
    else kept++;
  }
  for (const [k, cell] of a) if (!b.has(k)) added.push({ ...cell });
  added.sort(byResDate); removed.sort(byResDate); changed.sort(byResDate);
  return { added, removed, changed, kept, total: b.size };
}

const QUALITY_LABELS = ['Coverage misses', 'Senior gaps', 'Rest compromises', 'Fairness + shape'];
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Display helper: integers print as-is, other numbers round to 1 decimal (no trailing .0 artifacts).
export function formatQualityValue(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

export function compareQuality(beforeSummary, afterSummary) {
  const b = beforeSummary || {}, a = afterSummary || {};
  const mk = (key, label, bv, av) => ({ key, label, before: num(bv), after: num(av), better: num(av) < num(bv) ? true : num(av) > num(bv) ? false : null });
  const rows = [
    mk('errors', 'Errors', b.errors, a.errors),
    mk('blockingWarnings', 'Blocking warnings', b.blockingWarnings, a.blockingWarnings),
    mk('belowMin', 'Coverage below min', b.belowMin, a.belowMin),
    mk('aboveMax', 'Coverage above max', b.aboveMax, a.aboveMax),
  ];
  const bq = Array.isArray(b.quality) ? b.quality : [], aq = Array.isArray(a.quality) ? a.quality : [];
  const n = Math.max(bq.length, aq.length);
  for (let i = 0; i < n; i++) rows.push(mk(`quality${i}`, QUALITY_LABELS[i] || `Quality ${i + 1}`, bq[i], aq[i]));
  return rows;
}

function vector(s) {
  const x = s || {};
  return [num(x.errors), num(x.blockingWarnings), num(x.belowMin) + num(x.aboveMax), ...(Array.isArray(x.quality) ? x.quality.map(num) : [])];
}

// <0 a better, 0 equal, >0 a worse (lexicographic; shorter vectors padded with 0)
function cmpVec(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function isStrictImprovement(beforeSummary, afterSummary) {
  return cmpVec(vector(afterSummary), vector(beforeSummary)) < 0;
}

function changedCount(current, schedule) {
  const d = diffSchedules(current, schedule);
  return d.added.length + d.removed.length + d.changed.length;
}

// candidates: [{schedule, summary, ...}]. Best quality first (lexicographic); exact ties go to fewest changed cells vs current.
export function pickFewestChanges(candidates, current) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  let best = null, bestVec = null, bestChanges = Infinity;
  for (const c of candidates) {
    if (!c) continue;
    const v = vector(c.summary), ch = changedCount(current, c.schedule);
    const cmp = best ? cmpVec(v, bestVec) : -1;
    if (cmp < 0 || (cmp === 0 && ch < bestChanges)) { best = c; bestVec = v; bestChanges = ch; }
  }
  return best;
}

export function optimizeBudgetOptions() {
  return [
    { value: 'auto', label: 'Auto' },
    ...[5, 10, 15, 30].map(m => ({ value: m, label: `${m} minutes` })),
  ];
}

export function budgetSeconds(value, hostDefault) {
  const d = Number(hostDefault);
  const fallback = Number.isFinite(d) && d > 0 ? d : 300;
  if (value === 'auto' || value == null || value === '') return fallback;
  const m = Number(value);
  return Number.isFinite(m) && m > 0 ? m * 60 : fallback;
}

// Only user-locked cells (block.lockedCells[rid][date] truthy) that hold a shift in block.schedule.
export function lockedCellsForOptimize(block) {
  const out = [];
  const locked = block?.lockedCells, sched = block?.schedule;
  if (!locked || typeof locked !== 'object' || !sched) return out;
  for (const rid of Object.keys(locked)) {
    const row = locked[rid];
    if (!row || typeof row !== 'object') continue;
    for (const date of Object.keys(row)) {
      const shiftId = sched[rid]?.[date];
      if (row[date] && isFilled(shiftId)) out.push({ residentId: rid, date, shiftId });
    }
  }
  return out.sort(byResDate);
}
