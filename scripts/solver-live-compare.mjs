#!/usr/bin/env node
// scripts/solver-live-compare.mjs - one static page comparing solver-live recordings: per recording and machine
// the final tiers, wall time, cells changed vs the input and time of the last improvement, plus one table across
// all recordings. Coded resident ids only.
//   node scripts/solver-live-compare.mjs <rec1.json> [rec2.json ...] --out page.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as AN from "./lib/solverLiveAnalysis.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// One row per recording x machine, from a parsed recording.
export function rowsOf(rec, file) {
  const M = rec.meta || {};
  const hint = M.hint || [];
  return (rec.machines || []).map((m) => {
    const f = m.final || {};
    const grids = AN.gridsAt(hint, m.incs || []);
    const last = grids[grids.length - 1];
    return {
      file, label: M.label, tag: M.tag, seed: M.seed, budget: M.budget, machine: m.name, workers: m.workers,
      status: f.status || (m.error ? "failed" : "?"), tiers: f.tiers || null, startTiers: f.startTiers || null, verdict: f.verdict || "n/a",
      wall: f.wall ?? null, cellsChanged: f.cellsChanged ?? AN.cellsDiffer(hint, last), lastImprovementT: f.lastImprovementT ?? AN.lastImprovementT(m),
      incumbents: (m.incs || []).filter((i) => i.tier !== "final").length, error: m.error || null,
    };
  });
}
// Order across rows: lexicographic final tiers (rows without tiers last), then wall time.
export function rankRows(rows) {
  return rows.slice().sort((a, b) => {
    if (!a.tiers !== !b.tiers) return a.tiers ? -1 : 1;
    const c = a.tiers && b.tiers ? AN.compareTiers(a.tiers, b.tiers) : 0;
    return c || (a.wall ?? 1e9) - (b.wall ?? 1e9);
  });
}
const vec = (v) => (v ? `[${v.join(", ")}]` : "-");
const rowHtml = (r, rank) => `<tr><td>${rank ?? ""}</td><td>${esc(r.tag)}</td><td>${esc(r.machine)}</td><td class="r">${esc(r.seed)}</td><td>${esc(r.status)}</td><td class="m">${vec(r.startTiers)}</td><td class="m">${vec(r.tiers)}</td><td class="v-${esc(r.verdict)}">${esc(r.verdict)}</td><td class="r">${r.wall == null ? "-" : Number(r.wall).toFixed(1) + " s"}</td><td class="r">${r.cellsChanged}</td><td class="r">${AN.fmtClock(r.lastImprovementT)}</td><td class="r">${r.incumbents}</td><td class="r">${esc(r.workers ?? "?")}</td></tr>`;
const HEAD = `<tr><th>#</th><th>Tag</th><th>Machine</th><th class="r">Seed</th><th>Status</th><th>Start tiers</th><th>End tiers</th><th>Verdict</th><th class="r">Wall</th><th class="r">Cells changed</th><th class="r">Last improvement</th><th class="r">Incumbents</th><th class="r">Workers</th></tr>`;

export function compareHtml(recs) {
  const all = recs.flatMap((r) => rowsOf(r.rec, r.file));
  const ranked = rankRows(all);
  const rank = new Map(ranked.map((r, i) => [r, i + 1]));
  const per = recs.map((r) => {
    const rows = all.filter((x) => x.file === r.file);
    const M = r.rec.meta || {};
    return `<div class="card"><h2>${esc(M.label)} <span class="mut">tag ${esc(M.tag)}, seed ${esc(M.seed)}, budget ${esc(M.budget)} s, ${(M.residents || []).length} residents, ${(M.dates || []).length} days</span></h2>
<div class="mut">${esc(path.basename(r.file))}</div><table class="d">${HEAD}${rows.map((x) => rowHtml(x, rank.get(x))).join("")}</table>${rows.filter((x) => x.error).map((x) => `<p class="err">${esc(x.machine)}: ${esc(x.error)}</p>`).join("")}</div>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resident solver compare</title><style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#1c2230;--mut:#667085;--line:#e3e6ec;--ok:#1a9e63;--bad:#d64545}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--card:#1b2029;--ink:#e6e9f0;--mut:#98a2b3;--line:#2a313d;--ok:#38c488;--bad:#f07070}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,Segoe UI,sans-serif;padding:12px;max-width:1500px;margin:0 auto}
h1{font-size:20px;margin:0 0 8px}h2{font-size:15px;margin:0 0 6px}.mut{color:var(--mut);font-weight:400;font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:12px 0;overflow-x:auto}
table.d{border-collapse:collapse;width:100%;font-size:13px}table.d td,table.d th{border-top:1px solid var(--line);padding:4px 8px;text-align:left;white-space:nowrap}
.r{text-align:right!important;font-variant-numeric:tabular-nums}.m{font-family:ui-monospace,Consolas,monospace}
.v-better{color:var(--ok);font-weight:600}.v-worse{color:var(--bad);font-weight:600}.err{color:var(--bad)}
</style></head><body><h1>Resident solver: recordings compared</h1>
<p class="mut">Tiers are [errors, blocking warnings, coverage rank, rest after coverage, quality]; lower is better, compared lexicographically. Ranking uses end tiers, then wall time.</p>
<div class="card"><h2>All recordings</h2><table class="d">${HEAD}${ranked.map((x) => rowHtml(x, rank.get(x))).join("")}</table></div>
${per}</body></html>`;
}

function main() {
  const argv = process.argv.slice(2);
  const oi = argv.indexOf("--out");
  const files = argv.filter((a, i) => !a.startsWith("--") && !(oi >= 0 && i === oi + 1));
  if (!files.length || oi < 0 || !argv[oi + 1]) { console.error("usage: node scripts/solver-live-compare.mjs <rec1.json> [rec2.json ...] --out page.html"); process.exit(2); }
  const recs = files.map((f) => ({ file: f, rec: JSON.parse(fs.readFileSync(path.resolve(f), "utf8")) }));
  const out = path.resolve(argv[oi + 1]);
  fs.writeFileSync(out, compareHtml(recs));
  console.error(`wrote ${out}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
