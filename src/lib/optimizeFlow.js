// Pure helpers for the Generate -> Optimize -> Compare flow. No React, never imports ResidentScheduler.jsx.
// Schedule maps are { residentId: { 'YYYY-MM-DD': shiftId } }. Summaries are
// { errors, blockingWarnings, belowMin, aboveMax, quality: number[] } (lower is better everywhere).

import { pickSolverTarget, selectBestOfMachines } from './solverPool.js';

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

// ─── HOST FEATURES + BUDGET CHOICES ─────────────────────────────────────────────────────────────
// A solver host lists what it can do in /health `features` (strings). Absent / unknown = not available,
// so an older host shows exactly the old menu.
export const FEATURE_STOP = 'stop';
export const FEATURE_LONG_RUN = 'longRun';
export const BUDGET_LEVEL_OFF = 'leveloff';
export const BUDGET_LONG = 'long';
export const LEVEL_OFF_SECONDS = 900;   // "Until it levels off" budget (15 min max)
export const LONG_RUN_SECONDS = 7200;   // "Long polish" budget (2 h); host needs config.longRun
export const STANDARD_MAX_SECONDS = 1800; // what a host without longRun caps at

export function parseFeatures(json) {
  const f = json?.features;
  return Array.isArray(f) ? f.filter(x => typeof x === 'string' && x) : [];
}
export const hasFeature = (features, name) => Array.isArray(features) && features.includes(name);
// Features every listed machine has (Best-of needs all of them). No machines -> none.
export function commonFeatures(featureLists) {
  const lists = (Array.isArray(featureLists) ? featureLists : []).map(l => (Array.isArray(l) ? l : []));
  if (!lists.length) return [];
  return lists[0].filter(f => lists.every(l => l.includes(f)));
}
// Capabilities as booleans for the menu / submit: { stop, longRun }.
export const capsFromFeatures = features => ({ stop: hasFeature(features, FEATURE_STOP), longRun: hasFeature(features, FEATURE_LONG_RUN) });

export function optimizeBudgetOptions({ stop = false, longRun = false } = {}) {
  return [
    { value: 'auto', label: 'Auto' },
    ...[5, 10, 15, 30].map(m => ({ value: m, label: `${m} minutes` })),
    ...(stop ? [{ value: BUDGET_LEVEL_OFF, label: 'Until it levels off (15 min max)' }] : []),
    ...(longRun ? [{ value: BUDGET_LONG, label: 'Long polish (2 hours)' }] : []),
  ];
}

// A choice the current host cannot do falls back to Auto in the menu.
export function budgetAvailable(value, caps = {}) {
  if (value === BUDGET_LEVEL_OFF) return !!caps.stop;
  if (value === BUDGET_LONG) return !!caps.longRun;
  return true;
}

export function budgetSeconds(value, hostDefault) {
  const d = Number(hostDefault);
  const fallback = Number.isFinite(d) && d > 0 ? d : 300;
  if (value === BUDGET_LEVEL_OFF) return LEVEL_OFF_SECONDS;
  if (value === BUDGET_LONG) return LONG_RUN_SECONDS;
  if (value === 'auto' || value == null || value === '') return fallback;
  const m = Number(value);
  return Number.isFinite(m) && m > 0 ? m * 60 : fallback;
}

// What to submit for a budget choice on a host with `caps`. -> { seconds, config, autoStop, note }
// `config` = extra solver config keys; `note` = text for the chief when the choice had to be reduced.
export function optimizeRunPlan(value, hostDefault, caps = {}) {
  if (value === BUDGET_LEVEL_OFF) {
    return caps.stop
      ? { seconds: LEVEL_OFF_SECONDS, config: {}, autoStop: true, note: null }
      : { seconds: LEVEL_OFF_SECONDS, config: {}, autoStop: false, note: 'This machine cannot stop early, so it will use the full 15 minutes.' };
  }
  if (value === BUDGET_LONG) {
    return caps.longRun
      ? { seconds: LONG_RUN_SECONDS, config: { longRun: true }, autoStop: false, note: null }
      : { seconds: STANDARD_MAX_SECONDS, config: {}, autoStop: false, note: 'This machine cannot do a 2-hour run, so it will use 30 minutes.' };
  }
  return { seconds: budgetSeconds(value, hostDefault), config: {}, autoStop: false, note: null };
}

// Button / hint text for the chosen budget (minutes already resolved by the caller).
export function optimizeButtonLabel(budget, minutes) {
  if (budget === BUDGET_LEVEL_OFF) return `Optimize (up to ${minutes} min)`;
  if (budget === BUDGET_LONG) return 'Optimize (long polish, up to 2 h)';
  return `Optimize (${minutes} min)`;
}

// "Stopped early at 4:12" from a finished result + job view; null when the run was not stopped early.
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export function stoppedEarlyText(result, view) {
  if (result?.report?.stoppedEarly !== true) return null;
  const cands = [result?.report?.stoppedAtSeconds, result?.report?.elapsedSeconds, view?.elapsedSeconds, view?.progress?.elapsed];
  const sec = cands.map(Number).find(n => Number.isFinite(n) && n > 0);
  return sec ? `Stopped early at ${mmss(sec)}` : 'Stopped early';
}

// Targets for the menu: which features does the chosen machine (or every Best-of machine) offer?
// preference = optimize target ('cloud' | 'local' | 'pool:<name>' | 'pool:best'); statuses = probe results.
export function targetFeatures({ preference, localStatus = null, poolStatus = [], bestOfExtra = false }) {
  if (preference === BEST_OF_TARGET) {
    const sel = selectBestOfMachines(poolStatus, { includeExtra: bestOfExtra }).machines;
    if (sel.length < 2) { // Best of falls back to the single usable machine
      const one = sel[0] && poolStatus.find(m => m.name === sel[0].name);
      return one?.features || [];
    }
    return commonFeatures(sel.map(m => poolStatus.find(p => p.name === m.name)?.features || []));
  }
  const pick = pickSolverTarget({ preference, localStatus, poolStatus });
  if (!pick.url) return [];
  const st = pick.usingLocal ? localStatus : poolStatus.find(m => m.url === pick.url);
  return Array.isArray(st?.features) ? st.features : [];
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

// ─── BEST OF MACHINES ───────────────────────────────────────────────────────────────────────────
// "Best of both": the same Optimize job runs on 2-3 pool machines with different random seeds; the
// better result (same lexicographic comparator as isStrictImprovement) wins.
export const BEST_OF_TARGET = 'pool:best';
export const BEST_OF_SEED_BASE = 42;
export const bestOfSeed = (index, base = BEST_OF_SEED_BASE) => base + index * 1000;

// First summary slot (errors, blocking, coverage, quality...) where `other` differs from the winner,
// as a % of the winner's value (floor 1 so a 0 -> 2 gap does not divide by zero). 0 = exact tie.
function gapPercent(winnerSummary, otherSummary) {
  const w = vector(winnerSummary), o = vector(otherSummary);
  const n = Math.max(w.length, o.length);
  for (let i = 0; i < n; i++) {
    const a = w[i] || 0, b = o[i] || 0;
    if (a !== b) return Math.round(((b - a) / Math.max(Math.abs(a), 1)) * 1000) / 10;
  }
  return 0;
}

// results: [{ machine, ok, summary, ...rest }] in machine priority order (earlier wins exact ties).
// Failed / offline machines (ok !== true or no summary) are ignored. Returns
// { winner, ranked: [{ machine, result, gapPct }], failed: [machine], error }; winner null + error when none succeeded.
export function pickBestOfMachines(results) {
  const list = Array.isArray(results) ? results.filter(Boolean) : [];
  const good = list.filter(r => r.ok === true && r.summary && typeof r.summary === 'object');
  const failed = list.filter(r => !good.includes(r)).map(r => r.machine);
  if (!good.length) return { winner: null, ranked: [], failed, error: 'No machine returned a usable result.' };
  const order = good.map((r, i) => ({ r, i, v: vector(r.summary) }))
    .sort((a, b) => cmpVec(a.v, b.v) || a.i - b.i);
  const winner = order[0].r;
  const ranked = order.map(({ r }) => ({ machine: r.machine, result: r, gapPct: r === winner ? 0 : gapPercent(winner.summary, r.summary) }));
  return { winner, ranked, failed, error: null };
}

// "Best of 2: Mac won (PicklePower 1.2% behind)" / "(PicklePower tied)"; one machine -> "Ran on Mac only".
export function bestOfLine(pick) {
  if (!pick || !pick.winner) return '';
  const others = pick.ranked.slice(1);
  const failedTxt = pick.failed?.length ? `${pick.failed.join(', ')} did not finish` : '';
  if (!others.length) return `Ran on ${pick.winner.machine} only${failedTxt ? ` (${failedTxt})` : ''}`;
  const part = o => `${o.machine} ${o.gapPct === 0 ? 'tied' : `${formatQualityValue(o.gapPct)}% behind`}`;
  return `Best of ${pick.ranked.length}: ${pick.winner.machine} won (${others.map(part).join(', ')}${failedTxt ? `; ${failedTxt}` : ''})`;
}

// Folds the poll views of a Best-of run into ONE job view shaped like a single job's (so the existing
// status text / toasts / Review button keep working). entries: [{ machine, view }] where view is the
// pollSolveJob result, or null when that poll failed (treated as still running). Returns
// 'lost' | { status: 'running'|'done'|'failed'|'cancelled', result, error, progress, perMachine:[{machine,status,error,result,progress}] }.
const TERMINAL = new Set(['done', 'failed', 'cancelled', 'lost']);
export function aggregateBestOfJobs(entries) {
  const per = (Array.isArray(entries) ? entries : []).map(({ machine, view }) => {
    if (!view) return { machine, status: 'running', error: null, result: null, progress: null };
    if (view.lost || view.status === 'lost') return { machine, status: 'lost', error: null, result: null, progress: null };
    return { machine, status: String(view.status || 'running'), error: view.error || null, result: view.result ?? null, progress: view.progress || null, ...(view.stopping === true ? { stopping: true } : {}), ...(Number.isFinite(Number(view.elapsedSeconds)) ? { elapsedSeconds: Number(view.elapsedSeconds) } : {}) };
  });
  if (!per.length) return 'lost';
  const progress = (per.find(p => p.status === 'running' && p.progress) || per.find(p => p.progress) || {}).progress || null;
  if (per.some(p => !TERMINAL.has(p.status))) return { status: 'running', progress, perMachine: per, ...(per.some(p => p.stopping) ? { stopping: true } : {}) };
  const done = per.find(p => p.status === 'done');
  if (done) return { status: 'done', result: done.result, progress, perMachine: per };
  if (per.every(p => p.status === 'lost')) return 'lost';
  if (per.every(p => p.status === 'cancelled')) return { status: 'cancelled', progress, perMachine: per };
  const err = per.filter(p => p.error).map(p => `${p.machine}: ${p.error}`).join('; ');
  return { status: 'failed', error: err || 'every machine failed', progress, perMachine: per };
}
