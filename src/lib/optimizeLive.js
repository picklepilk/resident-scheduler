// Pure helpers for the live view of an Optimize run: the numbers a chief understands while the solver
// works (isolated single nights, warnings, change versus the starting grid), the "still improving /
// levelling off" read-out, and the "until it levels off" auto-stop rule. No React, no fetching, never
// imports ResidentScheduler.jsx (the app passes its own validator in as a function).
//
// Time: every `t` / `now` here is SERVER seconds since the run started (progress.elapsed), so the series
// survives a slow poll or a page reload without depending on the browser clock.
import { isNightShiftId } from './shifts.js';

// ── thresholds (one place; tune here) ───────────────────────────────────────────────────────────
// Rule: stop when the gain over the last WINDOW is under MIN_SHARE_PCT of the gain made since the final stage
// began (stage-start best minus current best), but never below a small absolute floor (MIN_FLOOR_PCT of the
// stage-start best, so a run that gained almost nothing can still stop). Independent of how big the score is.
// Chosen by replaying ~200 bench runs (15 min S0 runs: no stop with more than 10% of the final gain still to
// come in the next 5 min; the old 0.3%-of-best rule failed that on 34 of 80).
export const AUTO_STOP_MIN_STAGE_SECONDS = 300; // final improvement stage must have run at least this long
export const AUTO_STOP_WINDOW_SECONDS = 120;    // ... and `best` must have gained less than the threshold over this window
export const AUTO_STOP_MIN_SHARE_PCT = 3;       // percent of the gain since the final stage began
export const AUTO_STOP_MIN_FLOOR_PCT = 0.05;    // absolute floor, percent of the stage-start best
export const FINAL_STAGE_NAME = 'outerLns';     // solver's last improvement stage (small-piece polishing)
export const TREND_WINDOW_SECONDS = AUTO_STOP_WINDOW_SECONDS;
export const LIVE_RECOMPUTE_MS = 10000;         // never recompute live numbers more often than this
export const SERIES_MAX_SAMPLES = 4000;         // 2 h at one sample per 2 s is 3600

const finite = v => typeof v === 'number' && Number.isFinite(v);

// Is this progress / sample the final improvement stage? (stageName when the host sends it, else stage 6 of 6.)
export function isFinalStage(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.stageName === 'string' && p.stageName) return p.stageName === FINAL_STAGE_NAME;
  return Number(p.stages) === 6 && Number(p.stage) === 6;
}

// ── best-over-time series ───────────────────────────────────────────────────────────────────────
// Sample = { t, stage, final, best }. `best` is only comparable inside one stage.
export function appendSample(series, progress, max = SERIES_MAX_SAMPLES) {
  const prev = Array.isArray(series) ? series : [];
  if (!progress || typeof progress !== 'object') return prev;
  const t = Number(progress.elapsed), best = progress.best, stage = Number(progress.stage) || 0;
  if (!Number.isFinite(t) || !finite(best)) return prev;
  const last = prev[prev.length - 1];
  if (last && last.stage === stage && last.t === t && last.best === best) return prev;
  if (last && t < last.t) return prev; // clock went backwards (stale poll): ignore
  const next = [...prev, { t, stage, final: isFinalStage(progress), best }];
  return next.length > max ? next.slice(next.length - max) : next;
}

// Samples of the latest stage (the contiguous tail with the same stage number).
function currentStageSamples(series) {
  if (!Array.isArray(series) || !series.length) return [];
  const stage = series[series.length - 1].stage;
  let i = series.length - 1;
  while (i > 0 && series[i - 1].stage === stage) i--;
  return series.slice(i);
}

// Gain of `best` over the last `windowSeconds`, same stage only. `now` = latest server seconds.
// -> { known, gain, pct, stageSeconds, total, threshold }. known=false when the stage has not run a full window yet.
// total = stage-start best minus current best; threshold = the gain a window must reach to count as "still improving".
export function recentGain(series, now, windowSeconds = TREND_WINDOW_SECONDS, { minSharePct = AUTO_STOP_MIN_SHARE_PCT, minFloorPct = AUTO_STOP_MIN_FLOOR_PCT } = {}) {
  const tail = currentStageSamples(series);
  if (!tail.length || !Number.isFinite(now)) return { known: false, gain: 0, pct: 0, stageSeconds: 0, total: 0, threshold: 0 };
  const last = tail[tail.length - 1];
  const stageSeconds = Math.max(0, now - tail[0].t);
  const cutoff = now - windowSeconds;
  let ref = null;
  for (const s of tail) { if (s.t <= cutoff) ref = s; else break; }
  const total = Math.max(0, tail[0].best - last.best);
  const threshold = Math.max((minSharePct / 100) * total, (minFloorPct / 100) * Math.max(0, tail[0].best));
  if (!ref) return { known: false, gain: 0, pct: 0, stageSeconds, total, threshold };
  const gain = Math.max(0, ref.best - last.best);
  const pct = last.best > 0 ? (gain / last.best) * 100 : 0;
  return { known: true, gain, pct, stageSeconds, total, threshold };
}

// Plain-words trend. -> { state: 'unknown'|'improving'|'levelling', text }
export function describeTrend(series, now, { windowSeconds = TREND_WINDOW_SECONDS, ...rule } = {}) {
  const g = recentGain(series, now, windowSeconds, rule);
  const mins = Math.round(windowSeconds / 60);
  const span = `the last ${mins} minute${mins === 1 ? '' : 's'}`;
  if (!g.known) return { state: 'unknown', text: 'Too early to tell if it is still improving' };
  const last = currentStageSamples(series).slice(-1)[0];
  if (g.gain > 0 && last.best > 0 && g.gain >= g.threshold) {
    const pct = g.pct >= 10 ? Math.round(g.pct) : Math.round(g.pct * 10) / 10;
    return { state: 'improving', text: `Still improving (${pct}% better in ${span})` };
  }
  return { state: 'levelling', text: `Levelling off (almost no gain in ${span})` };
}

// ── auto-stop ("Until it levels off") ───────────────────────────────────────────────────────────
// True when the FINAL improvement stage has been running >= minStageSeconds and `best` improved over the
// last windowSeconds by less than max(minSharePct of the gain since the stage began, floor). A stage change restarts the
// clock (best is not comparable across stages); a non-final stage never stops; missing samples never stop.
export function shouldAutoStop(series, now, opts = {}) {
  const cfg = {
    minStageSeconds: AUTO_STOP_MIN_STAGE_SECONDS, windowSeconds: AUTO_STOP_WINDOW_SECONDS, minSharePct: AUTO_STOP_MIN_SHARE_PCT, minFloorPct: AUTO_STOP_MIN_FLOOR_PCT, ...opts,
  };
  if (!Array.isArray(series) || !series.length || !Number.isFinite(now)) return false;
  const tail = currentStageSamples(series);
  const last = tail[tail.length - 1];
  if (!last.final) return false;
  if (now - tail[0].t < cfg.minStageSeconds) return false;
  const g = recentGain(series, now, cfg.windowSeconds, cfg);
  if (!g.known) return false;
  if (last.best <= 0) return true; // nothing left to gain
  return g.gain < g.threshold;
}

// One synthetic progress for a Best-of run (several jobs): the running machine furthest along, lowest `best` on ties.
export function bestOfProgress(perMachine) {
  const cands = (Array.isArray(perMachine) ? perMachine : [])
    .filter(p => p && p.status === 'running' && p.progress && finite(p.progress.best))
    .map(p => p.progress);
  if (!cands.length) return null;
  cands.sort((a, b) => (Number(b.stage) || 0) - (Number(a.stage) || 0) || a.best - b.best);
  return cands[0];
}

// ── live numbers from the current best grid ─────────────────────────────────────────────────────
// rows: [[residentId, date, shiftId], ...] (progress.incumbent.rows). Cells of the start grid whose
// shift id the solver cannot represent (isKnownShift false) are carried over, like the final review does.
export function incumbentToSchedule(rows, baseSchedule = {}, isKnownShift = () => true) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const [rid, date, sid] = row;
    if (!rid || !date || !sid) continue;
    (out[rid] = out[rid] || {})[date] = sid;
  }
  for (const [rid, r] of Object.entries(baseSchedule || {})) {
    for (const [ds, sid] of Object.entries(r || {})) {
      if (sid && !isKnownShift(sid) && !out[rid]?.[ds]) (out[rid] = out[rid] || {})[ds] = sid;
    }
  }
  return out;
}

// Night runs of exactly one night that do not touch the block's first or last day (those may continue in
// the next block; same rule as the validator's isolated-stint warning). dates = block dates, ascending.
export function countIsolatedNights(schedule, dates, isNight = isNightShiftId) {
  if (!schedule || !Array.isArray(dates) || dates.length < 3) return 0;
  let n = 0;
  for (const row of Object.values(schedule)) {
    if (!row) continue;
    let run = 0;
    for (let i = 0; i <= dates.length; i++) {
      const night = i < dates.length && !!row[dates[i]] && isNight(row[dates[i]]);
      if (night) { run++; continue; }
      if (run === 1 && i - 1 > 0 && i - 1 < dates.length - 1) n++; // the single night sat at index i-1
      run = 0;
    }
  }
  return n;
}

export const countWarnings = issues => (Array.isArray(issues) ? issues.filter(i => i && i.level === 'warn' && !i.overridden).length : 0);

// schedule -> { isolatedNights, warnings }. `validate(schedule)` returns the app's validateAll issues.
export function summarizeLive(schedule, dates, validate) {
  return { isolatedNights: countIsolatedNights(schedule, dates), warnings: countWarnings(validate ? validate(schedule) : []) };
}

// start/now: summarizeLive results. -> [{ key, label, now, start, delta, text }] (delta < 0 = fewer = better)
export function liveComparison(start, now) {
  const row = (key, label, s, n) => {
    const delta = n - s;
    const change = delta === 0 ? 'no change' : `${Math.abs(delta)} ${delta < 0 ? 'fewer' : 'more'}`;
    return { key, label, now: n, start: s, delta, text: `${label}: ${n} (was ${s}, ${change})` };
  };
  return [
    row('isolatedNights', 'Single isolated nights', start?.isolatedNights ?? 0, now?.isolatedNights ?? 0),
    row('warnings', 'Warnings', start?.warnings ?? 0, now?.warnings ?? 0),
  ];
}

// Recompute gate: the incumbent actually changed AND at least minMs passed since the last recompute.
export function shouldRecomputeLive({ lastAt = null, lastKey = null, key, now, minMs = LIVE_RECOMPUTE_MS }) {
  if (key == null || key === lastKey) return false;
  return lastAt == null || now - lastAt >= minMs;
}

export const incumbentKey = inc => (inc && Array.isArray(inc.rows) ? `${inc.stage}|${inc.elapsed}|${inc.objective}|${inc.rows.length}` : null);
