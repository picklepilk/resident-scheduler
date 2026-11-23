// scripts/solver-coop.mjs - make 2-3 solver machines cooperate on ONE schedule (schedule-level cooperation; CP-SAT
// cannot share memory across computers). Same recording + live page + `RS ...` summary format as solver-live, with
// the whole run shown as ONE machine named `coop` (summary machine: coop-relay | coop-split | coop-best).
//
//   node scripts/solver-coop.mjs --mode relay|split|best --input <test.json> --solver mac=URL --solver pp=URL [--solver pb=URL] \
//        --budget 900 --seed 42 [--slice 60] [--window-days 7] [--stall 10] [--config '{..}'] [--config-for name='{..}'] \
//        --tag <t> --port 8799 [--exit-when-done] [--out rec.json] [--no-page] [--no-save]
//
// relay: slices (default 60 s); each machine solves the CURRENT global best as soft `hint` with its own seed
//   (seed + machineIndex*1000 + slice); a machine that finishes is resubmitted at once with the latest global best.
//   Global best = lexicographic tiers [t1,t2,t3,t3b,t4], lower better. stallSeconds (default 10) keeps stages from
//   burning the slice. Per-slice time-to-tier4 is recorded (machines[0].coop.slices).
// split: rounds (default 30 s) of K=#machines date-disjoint windows (default 7 days, rotating). Machine i gets the
//   payload with every cell outside its window pinned (`locked`) to the global best, hint = global best, outerLns off.
//   Changes are merged window by window, then ONE config.mode='score' request prices the merge; accepted only if
//   strictly better than the global best, else the single best machine result is accepted if strictly better.
// best ("best of both"): every machine solves the same payload with its own seed for the full budget; best final wins.
//   (Same as running solver-live with the machines and taking the better final, but reported as one coop line.)
// Never real names: test files are coded (R01..).
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { pageHtml } from "./lib/solverLivePage.mjs";
import * as AN from "./lib/solverLiveAnalysis.mjs";
import * as C from "./lib/solverCoop.mjs";
import { request, loadTestFile, dateRange, saveRecording, defaultOutPath, checkOutPath } from "./solver-live.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dayDow = (d) => new Date(d + "T00:00:00Z").getUTCDay();

// opts: { input, mode, solvers:[{name,url}], budget, seed, slice, windowDays, stall, minSlice, tag, config, configFor, port,
//         noPage, noSave, out, pollMs, log, onStart }
export async function runCoop(opts) {
  const log = opts.log || ((m) => console.error(m));
  const mode = opts.mode || "relay";
  if (!["relay", "split", "best"].includes(mode)) throw new Error(`unknown --mode ${mode}`);
  const budget = Number(opts.budget ?? 300), seed = Number(opts.seed ?? 42), tag = opts.tag || "run";
  const sliceSec = Number(opts.slice ?? (mode === "split" ? 30 : 60)), stall = opts.stall ?? 10, minSlice = opts.minSlice ?? 5;
  const pollMs = opts.pollMs ?? 2000, windowDays = opts.windowDays ?? 7;
  const tf = loadTestFile(opts.input);
  const payload = tf.payload;
  const label = tf.label || path.basename(opts.input, ".json");
  const residents = payload.residents.map((r) => r.id);
  const dates = tf.startDate && tf.endDate ? dateRange(tf.startDate, tf.endDate) : (payload.dates || []);
  const hintGrid = AN.gridFromMap(residents, dates, AN.mapFromHint(payload.hint));
  const hasHint = hintGrid.some(Boolean);
  const machines = (opts.solvers || []).map((s) => ({ name: s.name, url: s.url.replace(/\/+$/, "") }));
  if (!machines.length) throw new Error("need at least one --solver");
  const cfgBase = (name) => ({ ...(payload.config || {}), ...(opts.config || {}), ...((opts.configFor || {})[name] || {}) });
  const workers = machines.reduce((a, m) => (a == null || cfgBase(m.name).numWorkers == null ? null : a + cfgBase(m.name).numWorkers), 0);
  const summaryName = `coop-${mode}`;

  const REC = {
    version: 1,
    meta: { label, tag, seed, budget, startDate: dates[0], endDate: dates[dates.length - 1], dates, weekend: dates.map((d) => [0, 6].includes(dayDow(d))),
      dayLabels: dates.map((d) => String(Number(d.slice(8, 10)))), residents, hint: hintGrid, stages: AN.STAGE_NAMES, createdAt: new Date().toISOString() },
    machines: [{ name: "coop", url: machines.map((m) => `${m.name}=${m.url}`).join(" "), workers, config: { mode, slice: sliceSec, budget, seed, windowDays, stall },
      frames: [], incs: [], final: null, error: null, coop: { mode, machines: machines.map((m) => m.name), wins: {}, slices: [] } }],
  };
  const RM = REC.machines[0];

  const clients = new Set();
  const send = (event, data) => { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(msg); };
  const emit = (k, v) => {
    if (k === "frame") RM.frames.push(v); else if (k === "inc") RM.incs.push(v); else if (k === "final") RM.final = v; else if (k === "error") RM.error = v;
    send("ev", { m: 0, k, v });
  };
  let server = null, ping = null;
  if (!opts.noPage) {
    server = http.createServer((rq, rs) => {
      if (rq.url === "/events") {
        rs.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        rs.write(`event: hello\ndata: ${JSON.stringify(REC)}\n\n`);
        clients.add(rs); rq.on("close", () => clients.delete(rs));
      } else if (rq.url === "/" || rq.url.startsWith("/?")) { rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); rs.end(pageHtml({})); }
      else if (rq.url === "/recording.json") { rs.writeHead(200, { "Content-Type": "application/json" }); rs.end(JSON.stringify(REC)); }
      else { rs.writeHead(404); rs.end("not found"); }
    });
    await new Promise((res, rej) => { server.once("error", rej); server.listen(opts.port ?? 8799, "0.0.0.0", res); });
    ping = setInterval(() => { for (const c of clients) c.write(": ping\n\n"); }, 15000);
    log(`page: http://localhost:${server.address().port}/  (${mode}: ${machines.map((m) => `${m.name} ${m.url}`).join(", ")}; budget ${budget}s, seed ${seed})`);
  }
  log(`[input] ${label}: ${residents.length} residents, ${dates.length} days, ${hasHint ? "with" : "no"} input hint`);

  const T0 = Date.now(), rel = () => (Date.now() - T0) / 1000;
  const deadline = () => budget - rel();
  const jobs = new Map(); // key -> {url,id}
  let cancelled = false, jobKey = 0;
  let curStage = 0, curStatus = "running";

  // global best
  const G = { grid: hintGrid, tiers: null, objective: null, status: null, by: null };
  const startTiers = AN.extractHintTiers({}, tf);
  const adopt = (grid, tiers, objective, status, by) => {
    const d = AN.diffGrid(G.grid, grid);
    G.grid = grid; G.tiers = tiers; G.objective = objective ?? null; G.status = status ?? G.status; G.by = by;
    C.addWin(RM.coop.wins, by);
    emit("inc", { seq: RM.incs.length + 1, t: +rel().toFixed(2), stage: 5, tier: AN.stageName(5), objective: G.objective, d, by, tiers });
  };
  const frame = () => emit("frame", { t: +rel().toFixed(2), machine: "coop", status: curStatus, stage: curStage, stages: 5, stageName: AN.stageName(curStage), best: G.objective, elapsed: +rel().toFixed(2) });
  const framer = setInterval(frame, pollMs);

  // one job on one machine; resolves {res, t4, wall, status}
  async function runJob(mc, body) {
    const key = ++jobKey, t0 = Date.now();
    let st = null, t4 = null;
    const sub = await request("POST", `${mc.url}/jobs`, body);
    if (!sub?.jobId) throw new Error(`submit returned no jobId: ${JSON.stringify(sub)}`);
    jobs.set(key, { url: mc.url, id: sub.jobId });
    try {
      for (let fails = 0; ;) {
        try { st = await request("GET", `${mc.url}/jobs/${sub.jobId}`); fails = 0; } catch (e) {
          if (++fails > 20 || cancelled) throw e;
          await sleep(pollMs); continue;
        }
        const stage = st.progress?.stage || 0;
        if (stage > curStage) curStage = stage;
        if (stage >= 5 && t4 == null) t4 = +((Date.now() - t0) / 1000).toFixed(2);
        if (st.status !== "queued" && st.status !== "running") break;
        await sleep(pollMs);
      }
    } finally { jobs.delete(key); }
    return { res: st.status === "done" ? st.result : null, status: st.status, t4, wall: +((Date.now() - t0) / 1000).toFixed(2), error: st.error };
  }
  const gridOf = (res) => AN.gridFromMap(residents, dates, AN.mapFromSchedule(res.schedule));
  const usable = (res) => res && res.status !== "INFEASIBLE" && res.schedule && AN.tierVector(res.tiers);
  const bodyFor = (name, extra, cfgExtra) => ({ ...payload, ...extra, config: { ...cfgBase(name), ...cfgExtra, liveIncumbent: false } });

  // ---------- relay / best ----------
  async function relay(share) {
    const loop = async (mi) => {
      const mc = machines[mi];
      let n = 0;
      for (;;) {
        if (cancelled) return;
        const b = share ? C.nextSliceBudget(deadline(), sliceSec, minSlice) : (n === 0 ? budget : null);
        if (b == null) return;
        const no = ++n;
        const useHint = share && G.grid.some(Boolean);
        const hint = useHint ? C.gridToCells(residents, dates, G.grid) : payload.hint;
        const body = bodyFor(mc.name, hint ? { hint } : {}, { maxTimeSeconds: b, randomSeed: C.sliceSeed(seed, mi, no), stallSeconds: stall });
        const tS = rel();
        let r;
        try { r = await runJob(mc, body); } catch (e) { if (cancelled) return; emit("error", `[${mc.name}] ${e.message}`); log(`[${mc.name}] ERROR ${e.message}`); return; }
        const ok = usable(r.res), tiers = ok ? AN.tierVector(r.res.tiers) : null;
        const won = !!ok && C.strictlyBetter(tiers, G.tiers);
        RM.coop.slices.push({ slice: no, machine: mc.name, start: +tS.toFixed(2), budget: b, wall: r.wall, timeToTier4: r.t4, tiers, won, jobStatus: r.status });
        if (won) adopt(gridOf(r.res), tiers, r.res.objective, r.res.status, mc.name);
        log(`[${mc.name}] slice ${no}: ${tiers ? `[${tiers.join(",")}]` : r.status} ${won ? "NEW BEST" : ""}`);
        if (!share) return;
      }
    };
    await Promise.all(machines.map((_, i) => loop(i)));
  }

  // ---------- split ----------
  async function split() {
    if (hasHint) {
      const s = await scoreGrid(hintGrid);
      if (s) { G.tiers = s; log(`[score] input grid [${s.join(",")}]`); }
    }
    for (let round = 0; ; round++) {
      if (cancelled) return;
      const b = C.nextSliceBudget(deadline(), sliceSec, minSlice);
      if (b == null) return;
      const cold = !G.grid.some(Boolean);
      const nbs = cold ? machines.map((_, i) => ({ index: i, dates: new Set(dates), from: dates[0], to: dates[dates.length - 1] })) : C.pickNeighborhoods(dates, machines.length, round, windowDays);
      const hint = cold ? payload.hint : C.gridToCells(residents, dates, G.grid);
      const outs = await Promise.all(nbs.map(async (nb, i) => {
        const mc = machines[i];
        const extra = { ...(hint ? { hint } : {}), ...(cold ? {} : { locked: C.lockedForNeighborhood(payload.locked, residents, dates, G.grid, nb) }) };
        const body = bodyFor(mc.name, extra, { maxTimeSeconds: b, randomSeed: C.sliceSeed(seed, i, round + 1), stallSeconds: stall, outerLns: { enabled: false } });
        const tS = rel();
        try {
          const r = await runJob(mc, body);
          const ok = usable(r.res);
          RM.coop.slices.push({ slice: round + 1, machine: mc.name, window: `${nb.from}..${nb.to}`, start: +tS.toFixed(2), budget: b, wall: r.wall, timeToTier4: r.t4, tiers: ok ? AN.tierVector(r.res.tiers) : null, jobStatus: r.status });
          return ok ? { name: mc.name, nb, res: r.res, grid: gridOf(r.res), tiers: AN.tierVector(r.res.tiers) } : null;
        } catch (e) { if (!cancelled) { emit("error", `[${mc.name}] ${e.message}`); log(`[${mc.name}] ERROR ${e.message}`); } return null; }
      }));
      const good = outs.filter(Boolean);
      if (!good.length) continue;
      const single = C.bestOf(good);
      let cand = null;
      if (!cold && good.length > 1) {
        const merged = C.mergeNeighborhoods(residents, dates, G.grid, good);
        const mt = await scoreGrid(merged).catch(() => null);
        log(`[merge] round ${round + 1}: merged ${mt ? `[${mt.join(",")}]` : "infeasible"} vs best ${G.tiers ? `[${G.tiers.join(",")}]` : "-"}`);
        if (mt && C.strictlyBetter(mt, G.tiers)) cand = { grid: merged, tiers: mt, objective: null, status: single.res.status, by: "merge" };
        RM.coop.slices.push({ slice: round + 1, machine: "merge", merged: !!cand, tiers: mt });
      }
      if (!cand && single && C.strictlyBetter(single.tiers, G.tiers)) cand = { grid: single.grid, tiers: single.tiers, objective: single.res.objective, status: single.res.status, by: single.name };
      if (cand) adopt(cand.grid, cand.tiers, cand.objective, cand.status, cand.by);
    }
  }
  async function scoreGrid(grid) {
    const mc = machines[0];
    const body = bodyFor(mc.name, { hint: C.gridToCells(residents, dates, grid) }, { mode: "score", maxTimeSeconds: 30, randomSeed: seed, outerLns: { enabled: false } });
    const r = await runJob(mc, body);
    return r.res && r.res.status !== "INFEASIBLE" ? AN.tierVector(r.res.tiers) : null;
  }

  async function cancelAll() {
    cancelled = true;
    await Promise.all([...jobs.values()].map((j) => request("DELETE", `${j.url}/jobs/${j.id}`).catch(() => {})));
  }
  if (opts.onStart) opts.onStart({ cancelAll });

  try {
    if (mode === "split") await split(); else await relay(mode === "relay");
  } catch (e) { emit("error", String(e?.message || e)); log(`ERROR ${e?.message || e}`); }
  await cancelAll();
  clearInterval(framer);
  const wall = rel();
  curStatus = G.tiers ? "done" : "failed";
  frame();
  const status = G.tiers ? (G.status || "FEASIBLE") : "failed";
  const verdict = AN.verdictOf(startTiers, G.tiers);
  emit("inc", { seq: RM.incs.length + 1, t: +(wall + 0.01).toFixed(2), stage: 0, tier: "final", objective: G.objective, d: [] });
  emit("final", { t: +(wall + 0.01).toFixed(2), status, jobStatus: curStatus, tiers: G.tiers, startTiers, verdict, wall: +wall.toFixed(2), cellsChanged: AN.cellsDiffer(hintGrid, G.grid), lastImprovementT: AN.lastImprovementT(RM) });
  const line = AN.formatSummary({ tag, machine: summaryName, seed, label, start: startTiers, end: G.tiers, verdict, wall, status, workers });
  let outPath = null;
  if (!opts.noSave) {
    outPath = saveRecording(REC, opts.out || defaultOutPath(tag, seed));
    log(`recording saved: ${outPath}\n  replay: node scripts/solver-live.mjs --replay ${outPath} --port ${opts.port ?? 8799}`);
  }
  const close = () => { if (ping) clearInterval(ping); for (const c of clients) c.end(); return new Promise((r) => (server ? server.close(() => r()) : r())); };
  return { rec: REC, lines: [line], line, best: G, outPath, cancelAll, close, server };
}

// ---------- CLI ----------
function parseArgs(argv) {
  const all = (n) => { const o = []; argv.forEach((a, i) => { if (a === n && argv[i + 1] !== undefined) o.push(argv[i + 1]); }); return o; };
  const one = (n, d) => { const v = all(n); return v.length ? v[v.length - 1] : d; };
  const has = (n) => argv.includes(n);
  const named = (s, i) => { const m = /^([A-Za-z0-9_-]+)=(.+)$/.exec(s); return m && !/^https?$/.test(m[1]) ? { name: m[1], url: m[2] } : { name: `solver${i + 1}`, url: s }; };
  const json = (s, what) => { try { return JSON.parse(s); } catch { throw new Error(`${what} is not valid JSON: ${s}`); } };
  const configFor = {};
  for (const s of all("--config-for")) { const m = /^([A-Za-z0-9_-]+)=(.+)$/s.exec(s); if (!m) throw new Error(`--config-for needs name=<json>: ${s}`); configFor[m[1]] = json(m[2], `--config-for ${m[1]}`); }
  const mode = one("--mode", "relay");
  return {
    mode, input: one("--input", null), solvers: all("--solver").map(named), budget: Number(one("--budget", 300)), seed: Number(one("--seed", 42)),
    slice: one("--slice", null) == null ? undefined : Number(one("--slice")), windowDays: Number(one("--window-days", 7)), stall: Number(one("--stall", 10)),
    config: one("--config", null) ? json(one("--config"), "--config") : {}, configFor, tag: one("--tag", "run"), port: Number(one("--port", 8799)),
    out: one("--out", null), noPage: has("--no-page"), noSave: has("--no-save"), exitWhenDone: has("--exit-when-done"), pollMs: Number(one("--poll-ms", 2000)),
  };
}

async function cli() {
  let a;
  try { a = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (!a.input) { console.error("usage: node scripts/solver-coop.mjs --mode relay|split|best --input <test.json> --solver name=url [...] --budget 900 --seed 42 [--slice 60] --tag x [--port 8799] [--out f] [--exit-when-done]"); process.exit(2); }
  if (a.out) { try { checkOutPath(a.out); } catch (e) { console.error(e.message); process.exit(2); } }
  let live = null;
  const onSig = async () => { console.error("interrupted: cancelling jobs"); if (live) await live.cancelAll(); setTimeout(() => process.exit(130), 3000); };
  process.on("SIGINT", onSig); process.on("SIGTERM", onSig);
  try {
    const r = await runCoop({ ...a, log: (m) => console.error(m), onStart: (h) => { live = h; } });
    for (const l of r.lines) console.log(l);
    if (a.noPage || a.exitWhenDone) { await r.close(); process.exit(0); }
    console.error("serving the page until Ctrl-C");
  } catch (e) { console.error(e.message); process.exit(2); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli();
