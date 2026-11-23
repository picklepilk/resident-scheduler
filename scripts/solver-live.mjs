// scripts/solver-live.mjs - watch the resident CP-SAT solver work on one coded test file, live, in a browser;
// one or more machines side by side on the same input and seed. Never real names (test files are coded R01..).
//
//   node scripts/solver-live.mjs --input <resident-solver-test.json> \
//        --solver mac=http://127.0.0.1:18792 --solver pp=http://127.0.0.1:8792 [--solver pb=...] \
//        --budget 300 --seed 42 [--config '{"numWorkers":8}'] [--config-for pp='{"numWorkers":12}'] \
//        --tag <name> --port 8799 [--out rec.json] [--no-page] [--exit-when-done]
//   --replay rec.json [--port N]              reopen a saved recording (no solver)
//   --replay rec.json --export-html page.html one self-contained static page, then exit
//
// Every machine gets the same payload with config merged as: payload.config < {maxTimeSeconds: budget,
// randomSeed: seed, liveIncumbent: true} < --config < --config-for <name>. Jobs API: POST {url}/jobs ->
// {jobId}; GET {url}/jobs/{id} polled every 2 s; DELETE cancels (on Ctrl-C). Test solvers run auth-off.
// Output: stderr = progress; stdout = ONE summary line per machine:
//   RS <tag> <machine> seed <seed>: | <label> | [t1,t2,t3,t3b,t4] start | [..] end | better|same|worse | <wall>s | <status> | workers=<n> |
// start = tiers of the input grid when the solver/test file reports them (else "-" and verdict "n/a").
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pageHtml } from "./lib/solverLivePage.mjs";
import * as AN from "./lib/solverLiveAnalysis.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------- helpers ----------
function request(method, url, body, timeoutMs = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), lib = u.protocol === "https:" ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const headers = data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {};
    const r = lib.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers }, (res) => {
      let buf = ""; res.setEncoding("utf8"); res.on("data", (c) => (buf += c));
      res.on("end", () => {
        let json = null; try { json = JSON.parse(buf); } catch { /* keep null */ }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json); else reject(new Error(`HTTP ${res.statusCode} ${buf.slice(0, 200)}`));
      });
    });
    r.setTimeout(timeoutMs); r.on("error", reject); r.end(data);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function loadTestFile(file) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); } catch (e) { throw new Error(`cannot read --input ${file}: ${e.message}`); }
  if (j?.kind !== "resident-solver-test" || !j.payload || !Array.isArray(j.payload.residents)) throw new Error("--input is not a resident-solver-test file (kind 'resident-solver-test' with a payload)");
  return j;
}
function dateRange(a, b) {
  const out = [];
  for (let d = new Date(a + "T00:00:00Z"); d <= new Date(b + "T00:00:00Z"); d = new Date(d.getTime() + 86400000)) out.push(d.toISOString().slice(0, 10));
  return out;
}
const dayDow = (d) => new Date(d + "T00:00:00Z").getUTCDay();

// Refuse to write a recording inside the repo unless git ignores it.
export function checkOutPath(out) {
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: HERE, encoding: "utf8" });
  if (top.status !== 0) return;
  const root = path.resolve(top.stdout.trim());
  const rel = path.relative(root, path.resolve(out));
  if (rel.startsWith("..") || path.isAbsolute(rel)) return;
  const ig = spawnSync("git", ["check-ignore", "-q", path.resolve(out)], { cwd: root });
  if (ig.status !== 0) throw new Error(`refusing to write recording inside the repo (${out}): not gitignored. Use --out outside the repo.`);
}
export function defaultOutPath(tag, seed) {
  const base = process.platform === "win32" ? "C:/Users/amade/bench/rs-live" : path.join(os.homedir(), "bench", "rs-live");
  return path.join(base, `${new Date().toISOString().slice(0, 10)}-${tag}-${seed}.json`);
}
export function saveRecording(rec, out) {
  checkOutPath(out);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const copy = { ...rec, machines: rec.machines.map((m) => ({ ...m, frames: AN.thinFrames(m.frames, 3000) })) };
  fs.writeFileSync(path.resolve(out), JSON.stringify(copy));
  return path.resolve(out);
}

// ---------- the run ----------
// opts: { input, solvers:[{name,url}], budget, seed, tag, config, configFor:{name:obj}, port, noPage, out, noSave,
//         pollMs, retryMs, log }
export async function runLive(opts) {
  const log = opts.log || ((m) => console.error(m));
  const budget = Number(opts.budget ?? 300), seed = Number(opts.seed ?? 42), tag = opts.tag || "run";
  const pollMs = opts.pollMs ?? 2000, retryMs = opts.retryMs ?? 3000;
  const tf = loadTestFile(opts.input);
  const payload = tf.payload;
  const label = tf.label || path.basename(opts.input, ".json");
  const residents = payload.residents.map((r) => r.id);
  const dates = tf.startDate && tf.endDate ? dateRange(tf.startDate, tf.endDate) : (payload.dates || []);
  const hintMap = AN.mapFromHint(payload.hint);
  const hintGrid = AN.gridFromMap(residents, dates, hintMap);
  const machines = (opts.solvers || []).map((s) => ({ name: s.name, url: s.url.replace(/\/+$/, "") }));
  if (!machines.length) throw new Error("need at least one --solver");

  const REC = {
    version: 1,
    meta: { label, tag, seed, budget, startDate: dates[0], endDate: dates[dates.length - 1], dates, weekend: dates.map((d) => [0, 6].includes(dayDow(d))),
      dayLabels: dates.map((d) => String(Number(d.slice(8, 10)))), residents, hint: hintGrid, stages: AN.STAGE_NAMES, createdAt: new Date().toISOString() },
    machines: [],
  };
  const cfgFor = (name) => ({ ...(payload.config || {}), maxTimeSeconds: budget, randomSeed: seed, liveIncumbent: true, ...(opts.config || {}), ...((opts.configFor || {})[name] || {}) });
  REC.machines = machines.map((m) => { const c = cfgFor(m.name); return { name: m.name, url: m.url, workers: c.numWorkers ?? null, config: c, frames: [], incs: [], final: null, error: null }; });

  // SSE + page
  const clients = new Set();
  const send = (event, data) => { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(msg); };
  const emit = (mi, k, v) => {
    const m = REC.machines[mi];
    if (k === "frame") m.frames.push(v); else if (k === "inc") m.incs.push(v); else if (k === "final") m.final = v; else if (k === "error") m.error = v;
    send("ev", { m: mi, k, v });
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
    log(`page: http://localhost:${server.address().port}/  (${machines.map((m) => `${m.name} ${m.url}`).join(", ")}; budget ${budget}s, seed ${seed})`);
  }
  log(`[input] ${label}: ${residents.length} residents, ${dates.length} days, ${hintMap.size} input cells`);

  const jobs = new Map(); // machine index -> job id
  const lines = [];
  let cancelled = false;

  async function runMachine(mi) {
    const mc = machines[mi], rm = REC.machines[mi];
    let prevGrid = hintGrid, seq = 0, lastKey = "", lastIncT = 0;
    const t0 = Date.now();
    const rel = () => (Date.now() - t0) / 1000;
    let st = null, wall = 0;
    try {
      const sub = await request("POST", `${mc.url}/jobs`, { ...payload, config: rm.config });
      if (!sub?.jobId) throw new Error(`submit returned no jobId: ${JSON.stringify(sub)}`);
      jobs.set(mi, sub.jobId);
      for (;;) {
        for (let tries = 0; ; tries++) {
          try { st = await request("GET", `${mc.url}/jobs/${sub.jobId}`); break; } catch (e) {
            if (tries >= 20 || cancelled) throw e;
            log(`[${mc.name}] poll failed (${e.message}), retrying`);
            await sleep(retryMs);
          }
        }
        const p = st.progress || {};
        const t = +rel().toFixed(2);
        const frame = { t, machine: mc.name, status: st.status, stage: p.stage || 0, stages: p.stages || 0, stageName: AN.stageName(p.stage, p.stageName), best: p.best ?? null, elapsed: st.elapsedSeconds ?? p.elapsed ?? null };
        const inc = p.incumbent;
        if (inc && Array.isArray(inc.rows)) {
          const key = `${inc.stage}|${inc.elapsed}|${inc.objective}`;
          if (key !== lastKey) {
            lastKey = key;
            const grid = AN.gridFromMap(residents, dates, AN.mapFromRows(inc.rows));
            lastIncT = Math.max(lastIncT, Number.isFinite(inc.elapsed) ? inc.elapsed : t);
            const rec = { seq: ++seq, t: +lastIncT.toFixed(2), stage: inc.stage, tier: AN.stageName(inc.stage), objective: inc.objective ?? null, d: AN.diffGrid(prevGrid, grid) };
            prevGrid = grid; frame.inc = rec.seq;
            emit(mi, "inc", rec);
          }
        }
        emit(mi, "frame", frame);
        if (st.status !== "queued" && st.status !== "running") break;
        await sleep(pollMs);
      }
      wall = rel();
      if (st.status !== "done" || !st.result) throw new Error(st.error || `job ${st.status} with no result`);
      const res = st.result;
      let finalGrid = prevGrid;
      if (res.status !== "INFEASIBLE" && res.schedule) finalGrid = AN.gridFromMap(residents, dates, AN.mapFromSchedule(res.schedule));
      emit(mi, "inc", { seq: ++seq, t: +(wall + 0.01).toFixed(2), stage: 0, tier: "final", objective: res.objective ?? null, d: AN.diffGrid(prevGrid, finalGrid) });
      const end = AN.tierVector(res.tiers), start = AN.extractHintTiers(res, tf);
      const fin = { t: +(wall + 0.01).toFixed(2), status: res.status, jobStatus: st.status, tiers: end, startTiers: start, verdict: AN.verdictOf(start, end), wall: +wall.toFixed(2), cellsChanged: AN.cellsDiffer(hintGrid, finalGrid), lastImprovementT: AN.lastImprovementT(rm) };
      emit(mi, "final", fin);
    } catch (e) {
      wall = rel();
      emit(mi, "error", String(e?.message || e));
      rm.final = { t: +wall.toFixed(2), status: st?.status === "cancelled" ? "cancelled" : "failed", jobStatus: st?.status || "error", tiers: null, startTiers: null, verdict: "n/a", wall: +wall.toFixed(2), cellsChanged: 0, lastImprovementT: AN.lastImprovementT(rm) };
      log(`[${mc.name}] ERROR ${e?.message || e}`);
    }
    const f = rm.final;
    const line = AN.formatSummary({ tag, machine: mc.name, seed, label, start: f.startTiers, end: f.tiers, verdict: f.verdict, wall: f.wall, status: f.status, workers: rm.workers });
    lines.push(line);
  }

  async function cancelAll() {
    cancelled = true;
    await Promise.all([...jobs].map(([mi, id]) => request("DELETE", `${machines[mi].url}/jobs/${id}`).catch(() => {})));
  }

  if (opts.onStart) opts.onStart({ cancelAll });
  await Promise.all(machines.map((_, i) => runMachine(i)));
  // summary lines in --solver order
  lines.sort((a, b) => machines.findIndex((m) => a.startsWith(`RS ${tag} ${m.name} `)) - machines.findIndex((m) => b.startsWith(`RS ${tag} ${m.name} `)));
  let outPath = null;
  if (!opts.noSave) {
    outPath = saveRecording(REC, opts.out || defaultOutPath(tag, seed));
    log(`recording saved: ${outPath}\n  replay: node scripts/solver-live.mjs --replay ${outPath} --port ${opts.port ?? 8799}\n  static: node scripts/solver-live.mjs --replay ${outPath} --export-html <file.html>`);
  }
  const close = () => { if (ping) clearInterval(ping); for (const c of clients) c.end(); return new Promise((r) => (server ? server.close(() => r()) : r())); };
  return { rec: REC, lines, outPath, cancelAll, close, server };
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
  return {
    input: one("--input", null), solvers: all("--solver").map(named), budget: Number(one("--budget", 300)), seed: Number(one("--seed", 42)),
    config: one("--config", null) ? json(one("--config"), "--config") : {}, configFor, tag: one("--tag", "run"), port: Number(one("--port", 8799)),
    out: one("--out", null), noPage: has("--no-page"), noSave: has("--no-save"), exitWhenDone: has("--exit-when-done"),
    replay: one("--replay", null), exportHtml: one("--export-html", null), pollMs: Number(one("--poll-ms", 2000)),
  };
}

async function cli() {
  let a;
  try { a = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (a.replay) {
    const rec = JSON.parse(fs.readFileSync(path.resolve(a.replay), "utf8"));
    if (a.exportHtml) { fs.writeFileSync(path.resolve(a.exportHtml), pageHtml({ recording: rec })); console.error(`wrote ${path.resolve(a.exportHtml)}`); return; }
    http.createServer((rq, rs) => { rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); rs.end(pageHtml({ recording: rec })); })
      .listen(a.port, "0.0.0.0", () => console.error(`replay: http://localhost:${a.port}/  (${path.basename(a.replay)})`));
    return;
  }
  if (!a.input) { console.error("usage: node scripts/solver-live.mjs --input <test.json> --solver name=url [...] --budget 300 --seed 42 --tag x [--port 8799] [--out f] [--no-page]"); process.exit(2); }
  if (a.out) { try { checkOutPath(a.out); } catch (e) { console.error(e.message); process.exit(2); } }
  let run;
  let live = null;
  const onSig = async () => { console.error("interrupted: cancelling jobs"); if (live) await live.cancelAll(); setTimeout(() => process.exit(130), 3000); };
  process.on("SIGINT", onSig); process.on("SIGTERM", onSig);
  try {
    run = runLive({ ...a, log: (m) => console.error(m), onStart: (h) => { live = h; } });
    const r = await run;
    for (const l of r.lines) console.log(l);
    if (a.noPage || a.exitWhenDone) { await r.close(); process.exit(0); }
    console.error("serving the page until Ctrl-C");
  } catch (e) { console.error(e.message); process.exit(2); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli();
