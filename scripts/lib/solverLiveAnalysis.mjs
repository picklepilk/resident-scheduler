// Pure helpers for scripts/solver-live.mjs and scripts/solver-live-compare.mjs. No I/O.
// Schedule rows follow the solver contract: [residentId, date, shiftId]. Ids are coded (R01..).

export const TIER_KEYS = ["tier1_errors", "tier2_blockingWarns", "tier3_qualityRank", "tier3b_restAfterCoverage", "tier4_quality"];
// Job progress stage 1..5 = tiers, 6 = outer LNS polishing.
export const STAGE_NAMES = ["tier1_errors", "tier2_blockingWarns", "tier3_qualityRank", "tier3b_restAfterCoverage", "tier4_quality", "outerLns"];
export const STAGE_LABELS = {
  tier1_errors: "Errors (hard breaks)",
  tier2_blockingWarns: "Blocking warnings",
  tier3_qualityRank: "Coverage rank",
  tier3b_restAfterCoverage: "Rest after coverage",
  tier4_quality: "Quality",
  outerLns: "Outer LNS polish",
};
export const stageName = (stage, given) => given || STAGE_NAMES[(Number(stage) || 0) - 1] || "";

// ---- schedule maps: key "resident|date" -> shift id ----
export const cellKey = (rid, date) => `${rid}|${date}`;

export function mapFromRows(rows) {
  const m = new Map();
  for (const r of rows || []) if (r && r[2]) m.set(cellKey(r[0], r[1]), r[2]);
  return m;
}
// hint / locked shape: [{residentId, date, shiftId}]
export function mapFromHint(hint) {
  const m = new Map();
  for (const h of hint || []) if (h && h.shiftId) m.set(cellKey(h.residentId, h.date), h.shiftId);
  return m;
}
// result.schedule shape: { residentId: { date: shiftId } }
export function mapFromSchedule(schedule) {
  const m = new Map();
  for (const [rid, row] of Object.entries(schedule || {})) for (const [d, s] of Object.entries(row || {})) if (s) m.set(cellKey(rid, d), s);
  return m;
}
export function diffMaps(a, b) {
  const out = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k) || "", y = b.get(k) || "";
    if (x !== y) { const [rid, date] = k.split("|"); out.push({ rid, date, from: x, to: y }); }
  }
  out.sort((p, q) => p.rid.localeCompare(q.rid) || p.date.localeCompare(q.date));
  return out;
}
export const countChanged = (a, b) => diffMaps(a, b).length;

// ---- flat grid (residents x dates) and delta encoding ----
export function gridFromMap(residents, dates, map) {
  const nd = dates.length, g = new Array(residents.length * nd).fill("");
  const ri = Object.fromEntries(residents.map((r, i) => [r, i])), di = Object.fromEntries(dates.map((d, i) => [d, i]));
  for (const [k, v] of map) { const [rid, date] = k.split("|"); if (ri[rid] !== undefined && di[date] !== undefined) g[ri[rid] * nd + di[date]] = v; }
  return g;
}
export function diffGrid(prev, next) {
  const d = [];
  for (let i = 0; i < next.length; i++) if (next[i] !== prev[i]) d.push([i, next[i]]);
  return d;
}
export function applyDelta(grid, d) { const g = grid.slice(); for (const [i, v] of d) g[i] = v; return g; }
export function gridsAt(hintGrid, incs) {
  const out = [hintGrid.slice()];
  for (const inc of incs) out.push(applyDelta(out[out.length - 1], inc.d));
  return out;
}
export const cellsDiffer = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };

// ---- tiers ----
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// Accepts {tier1_errors:..} objects or arrays; returns a 5-vector or null.
export function tierVector(t) {
  if (t == null) return null;
  if (Array.isArray(t)) return t.length ? TIER_KEYS.map((_, i) => num(t[i])) : null;
  if (typeof t !== "object") return null;
  if (!TIER_KEYS.some((k) => k in t)) return null;
  return TIER_KEYS.map((k) => num(t[k]));
}

// Lexicographic compare of tier vectors: -1 = a better (lower) than b, 1 = worse, 0 = equal.
export function compareTiers(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (Math.abs(d) > 1e-9) return d < 0 ? -1 : 1; }
  return 0;
}
// end vs start. No start tiers -> "n/a".
export function verdictOf(start, end) {
  if (!start || !end) return "n/a";
  const c = compareTiers(end, start);
  return c < 0 ? "better" : c > 0 ? "worse" : "same";
}
// Start tiers of the input grid, if the solver (or the test file) reported them anywhere we know of.
export function extractHintTiers(result, testFile) {
  const r = result || {}, rep = r.report || {};
  const cands = [r.hintTiers, rep.hintTiers, rep.hintEval?.tiers, rep.hintEval, rep.hintPinning?.tiers, rep.hintPinning?.hintTiers, testFile?.hintTiers];
  for (const c of cands) { const v = tierVector(c); if (v) return v; }
  return null;
}

// ---- summary line (a monitor parses this; keep the format exact) ----
const fmtVec = (v) => (v ? `[${v.join(",")}]` : "-");
export function formatSummary({ tag, machine, seed, label, start, end, verdict, wall, status, workers }) {
  const w = Number.isFinite(Number(wall)) ? Number(wall).toFixed(1) : "?";
  return `RS ${tag} ${machine} seed ${seed}: | ${label} | ${fmtVec(start)} start | ${fmtVec(end)} end | ${verdict} | ${w}s | ${status} | workers=${workers ?? "?"} |`;
}
export function parseSummary(line) {
  const m = /^RS (\S+) (\S+) seed (\S+): \| (.*) \| (\[[^\]]*\]|-) start \| (\[[^\]]*\]|-) end \| (better|same|worse|n\/a) \| ([\d.?]+)s \| (\S+) \| workers=(\S+) \|$/.exec(line);
  if (!m) return null;
  const vec = (s) => (s === "-" ? null : JSON.parse(s));
  return { tag: m[1], machine: m[2], seed: m[3], label: m[4], start: vec(m[5]), end: vec(m[6]), verdict: m[7], wall: Number(m[8]), status: m[9], workers: m[10] };
}

// ---- frames ----
// Keep first, last and every frame whose (status, stage, best) differs from the previous; then evenly decimate to max.
export function thinFrames(frames, max = 400) {
  if (frames.length <= 2) return frames.slice();
  const keep = [];
  frames.forEach((f, i) => {
    const p = frames[i - 1];
    if (i === 0 || i === frames.length - 1 || f.status !== p.status || f.stage !== p.stage || f.best !== p.best) keep.push(f);
  });
  if (keep.length <= max) return keep;
  const out = [], step = (keep.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(keep[Math.round(i * step)]);
  return out;
}
// Best objective per stage, in stage order: [{stage, name, points:[[t,best]]}]
export function bestByStage(frames) {
  const by = new Map();
  for (const f of frames) {
    if (f.best == null || !f.stage) continue;
    if (!by.has(f.stage)) by.set(f.stage, { stage: f.stage, name: stageName(f.stage, f.stageName), points: [] });
    by.get(f.stage).points.push([f.t, f.best]);
  }
  return [...by.values()].sort((a, b) => a.stage - b.stage);
}
// Time of the last improvement: last non-final incumbent with changes, or last time `best` changed within a stage.
export function lastImprovementT(machine) {
  let t = 0;
  for (const inc of machine.incs || []) if (inc.tier !== "final" && inc.d.length) t = Math.max(t, inc.t);
  const fr = machine.frames || [];
  for (let i = 1; i < fr.length; i++) if (fr[i].stage === fr[i - 1].stage && fr[i].best != null && fr[i].best !== fr[i - 1].best) t = Math.max(t, fr[i].t);
  return +t.toFixed(2);
}
export const fmtClock = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
