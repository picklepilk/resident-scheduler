// Tests for scripts/lib/solverCoop.mjs helpers and scripts/solver-coop.mjs against a LOCAL mock jobs server
// (never a real solver). Ids are coded.
import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as C from '../../scripts/lib/solverCoop.mjs';
import { runCoop } from '../../scripts/solver-coop.mjs';

const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'];
const residents = ['R01', 'R02'];

describe('solverCoop helpers', () => {
  it('compares tiers lexicographically, null worst', () => {
    expect(C.strictlyBetter([0, 0, 0, 0, 3], [0, 0, 0, 0, 4])).toBe(true);
    expect(C.strictlyBetter([1, 0, 0, 0, 0], [0, 9, 9, 9, 9])).toBe(false);
    expect(C.strictlyBetter([0, 0, 0, 0, 1], null)).toBe(true);
    expect(C.compareTiersNullable(null, null)).toBe(0);
  });
  it('bestOf picks lowest tiers, first on ties, skips missing tiers', () => {
    const r = [{ name: 'a', tiers: [0, 0, 0, 0, 5] }, { name: 'b', tiers: [0, 0, 0, 0, 2] }, { name: 'c', tiers: [0, 0, 0, 0, 2] }, { name: 'd', tiers: null }];
    expect(C.bestOf(r).name).toBe('b');
    expect(C.bestOf([{ name: 'x', tiers: null }])).toBe(null);
    expect(C.bestOf([])).toBe(null);
  });
  it('slice scheduling and seeds', () => {
    expect(C.sliceSeed(42, 2, 3)).toBe(2045);
    expect(C.nextSliceBudget(100, 60)).toBe(60);
    expect(C.nextSliceBudget(20, 60)).toBe(20);
    expect(C.nextSliceBudget(3, 60, 5)).toBe(null);
  });
  it('picks disjoint rotating windows', () => {
    const ds = Array.from({ length: 28 }, (_, i) => `d${String(i).padStart(2, '0')}`);
    const r0 = C.pickNeighborhoods(ds, 2, 0, 7), r1 = C.pickNeighborhoods(ds, 2, 1, 7);
    expect(r0.length).toBe(2);
    expect([...r0[0].dates].some((d) => r0[1].dates.has(d))).toBe(false);
    expect(r0[0].from).toBe('d00'); expect(r0[1].from).toBe('d07');
    expect(r1[0].from).toBe('d14');
    expect(C.pickNeighborhoods(ds, 3, 0, 14).length).toBe(2);
  });
  it('locks cells outside the neighborhood, keeps base locked', () => {
    // R01 = D,N,'',D,D ; R02 = X,'','',D,D ; neighborhood = dates 2..3
    const grid = ['D', 'N', '', 'D', 'D', 'X', '', '', 'D', 'D'];
    const nb = { dates: new Set([dates[1], dates[2]]) };
    const base = [{ residentId: 'R01', date: dates[1], shiftId: 'Z' }];
    const l = C.lockedForNeighborhood(base, residents, dates, grid, nb);
    const keys = l.map((c) => `${c.residentId}|${c.date}|${c.shiftId}`);
    expect(keys).toContain('R01|2026-01-01|D');
    expect(keys).toContain('R01|2026-01-02|Z');
    expect(keys).not.toContain('R01|2026-01-02|N');
    expect(l.some((c) => c.date === dates[2])).toBe(false);
    expect(l.length).toBe(7); // base + 3 R01 + 3 R02 outside cells
  });
  it('merges each result only inside its own neighborhood', () => {
    const g = new Array(10).fill('X');
    const a = new Array(10).fill('A'), b = new Array(10).fill('B');
    const m = C.mergeNeighborhoods(residents, dates, g, [{ nb: { dates: new Set([dates[0]]) }, grid: a }, { nb: { dates: new Set([dates[4]]) }, grid: b }]);
    expect(m[0]).toBe('A'); expect(m[5]).toBe('A'); expect(m[4]).toBe('B'); expect(m[9]).toBe('B'); expect(m[2]).toBe('X');
  });
});

// ---------- mock jobs server ----------
function mockServer(prefer, { jobMs = 30 } = {}) {
  const jobs = new Map(); let n = 0;
  const srv = http.createServer((rq, rs) => {
    let body = ''; rq.on('data', (c) => (body += c));
    rq.on('end', () => {
      const out = (code, o) => { rs.writeHead(code, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(o)); };
      const m = /^\/jobs\/?(.*)$/.exec(rq.url);
      if (!m) return out(404, {});
      if (rq.method === 'POST') {
        const p = JSON.parse(body), id = `j${++n}`;
        jobs.set(id, { ready: Date.now() + jobMs, result: prefer(p), cancelled: false });
        return out(200, { jobId: id });
      }
      const j = jobs.get(m[1]);
      if (!j) return out(404, {});
      if (rq.method === 'DELETE') { j.cancelled = true; return out(200, { status: 'cancelled' }); }
      if (j.cancelled) return out(200, { status: 'cancelled' });
      if (Date.now() < j.ready) return out(200, { status: 'running', progress: { stage: 1, stages: 5 } });
      return out(200, { status: 'done', elapsedSeconds: 0.03, result: j.result });
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, url: `http://127.0.0.1:${srv.address().port}` })));
}
const gridMap = (p) => { const m = new Map(); for (const h of p.hint || []) m.set(`${h.residentId}|${h.date}`, h.shiftId); return m; };
const scheduleOf = (p, m) => {
  const s = {}; for (const r of p.residents) s[r.id] = {};
  for (const [k, v] of m) { const [r, d] = k.split('|'); if (v) s[r][d] = v; }
  return s;
};

const tmpFiles = [];
function writeTest(payload, startDate, endDate) {
  const f = path.join(os.tmpdir(), `coop-test-${process.pid}-${tmpFiles.length}.json`);
  fs.writeFileSync(f, JSON.stringify({ kind: 'resident-solver-test', label: 'T01', startDate, endDate, payload }));
  tmpFiles.push(f); return f;
}
afterAll(() => { for (const f of tmpFiles) try { fs.unlinkSync(f); } catch { /* ignore */ } });

describe('solver-coop against a mock jobs server', () => {
  it('relay improves monotonically and credits machines', async () => {
    // target: every cell D. each job fixes (1 + seed%3) free cells.
    const prefer = (p) => {
      const m = gridMap(p), locked = new Set((p.locked || []).map((c) => `${c.residentId}|${c.date}`));
      let k = 1 + (p.config.randomSeed % 3);
      for (const key of [...m.keys()]) if (k > 0 && m.get(key) !== 'D' && !locked.has(key)) { m.set(key, 'D'); k--; }
      const mism = [...m.values()].filter((v) => v !== 'D').length;
      return { status: 'FEASIBLE', tiers: { tier1_errors: 0, tier2_blockingWarns: 0, tier3_qualityRank: 0, tier3b_restAfterCoverage: 0, tier4_quality: mism }, objective: mism, schedule: scheduleOf(p, m) };
    };
    const A = await mockServer(prefer), B = await mockServer(prefer);
    const hint = []; for (const r of residents) for (const d of dates) hint.push({ residentId: r, date: d, shiftId: 'X' });
    const input = writeTest({ residents: residents.map((id) => ({ id })), hint, config: {} }, dates[0], dates[4]);
    const run = await runCoop({ input, mode: 'relay', solvers: [{ name: 'mac', url: A.url }, { name: 'pp', url: B.url }], budget: 1.5, slice: 0.2, minSlice: 0.05, pollMs: 15, minGapMs: 10, backoffMs: [20, 40, 80], seed: 42, tag: 't', noPage: true, noSave: true, log: () => {} });
    A.srv.close(); B.srv.close();
    const incs = run.rec.machines[0].incs.filter((i) => i.tier !== 'final');
    expect(incs.length).toBeGreaterThan(1);
    for (let i = 1; i < incs.length; i++) expect(C.strictlyBetter(incs[i].tiers, incs[i - 1].tiers)).toBe(true);
    expect(run.best.tiers[4]).toBe(0);
    expect(run.line).toMatch(/^RS t coop-relay seed 42: \| T01 \| - start \| \[0,0,0,0,0\] end \| n\/a \|/);
    expect(Object.values(run.rec.machines[0].coop.wins).reduce((a, b) => a + b, 0)).toBe(incs.length);
    expect(run.rec.machines[0].coop.slices.length).toBeGreaterThan(1);
  });

  it('split rejects a worse merge and accepts the best single result', async () => {
    // preferred N,D,D,D,D; tier1 = N followed by D; tier4 = mismatches. A job fills free cells to the preference
    // unless that makes N-then-D; score mode (config.mode) prices the hint grid exactly.
    const pref = ['N', 'D', 'D', 'D', 'D'];
    const tiersOf = (m) => {
      let conf = 0, mism = 0;
      pref.forEach((v, i) => {
        const x = m.get(`R01|${dates[i]}`) || '';
        if (x !== v) mism++;
        if (x === 'N' && m.get(`R01|${dates[i + 1]}`) === 'D') conf++;
      });
      return { tier1_errors: conf, tier2_blockingWarns: 0, tier3_qualityRank: 0, tier3b_restAfterCoverage: 0, tier4_quality: mism };
    };
    const prefer = (p) => {
      const m = gridMap(p);
      if (p.config.mode === 'score') return { status: 'SCORED', tiers: tiersOf(m), schedule: scheduleOf(p, m) };
      const locked = new Set((p.locked || []).map((c) => `${c.residentId}|${c.date}`));
      pref.forEach((v, i) => {
        const key = `R01|${dates[i]}`;
        if (locked.has(key) || m.get(key) === v) return;
        const prev = m.get(`R01|${dates[i - 1]}`), next = m.get(`R01|${dates[i + 1]}`);
        if ((v === 'N' && next === 'D') || (v === 'D' && prev === 'N')) return;
        m.set(key, v);
      });
      return { status: 'FEASIBLE', tiers: tiersOf(m), schedule: scheduleOf(p, m) };
    };
    const A = await mockServer(prefer), B = await mockServer(prefer);
    const hint = dates.map((d) => ({ residentId: 'R01', date: d, shiftId: 'X' }));
    const input = writeTest({ residents: [{ id: 'R01' }], hint, config: {} }, dates[0], dates[4]);
    const logs = [];
    const run = await runCoop({ input, mode: 'split', solvers: [{ name: 'mac', url: A.url }, { name: 'pp', url: B.url }], budget: 0.35, slice: 0.2, minSlice: 0.05, windowDays: 1, pollMs: 15, minGapMs: 10, backoffMs: [20, 40, 80], seed: 42, tag: 't', noPage: true, noSave: true, log: (m) => logs.push(m) });
    A.srv.close(); B.srv.close();
    // round 0 windows = d1 (N) and d2 (D): merged = N,D => tier1 conflict => rejected
    expect(logs.some((l) => /^\[merge\] round 1: merged \[1,/.test(l))).toBe(true);
    const incs = run.rec.machines[0].incs.filter((i) => i.tier !== 'final');
    expect(incs[0].by).not.toBe('merge');
    expect(incs[0].tiers).toEqual([0, 0, 0, 0, 4]);
    for (const i of incs) expect(i.tiers[0]).toBe(0);
    expect(run.rec.machines[0].coop.slices.some((s) => s.machine === 'merge' && s.merged === false)).toBe(true);
    expect(run.line).toMatch(/coop-split/);
  });

  it('best mode runs every machine once for the full budget and keeps the best', async () => {
    const prefer = (fixN) => (p) => {
      const m = gridMap(p); let k = fixN;
      for (const key of [...m.keys()]) if (k > 0 && m.get(key) !== 'D') { m.set(key, 'D'); k--; }
      const mism = [...m.values()].filter((v) => v !== 'D').length;
      return { status: 'FEASIBLE', tiers: [0, 0, 0, 0, mism], objective: mism, schedule: scheduleOf(p, m) };
    };
    const A = await mockServer(prefer(2)), B = await mockServer(prefer(5));
    const hint = dates.map((d) => ({ residentId: 'R01', date: d, shiftId: 'X' }));
    const input = writeTest({ residents: [{ id: 'R01' }], hint, config: {} }, dates[0], dates[4]);
    const run = await runCoop({ input, mode: 'best', solvers: [{ name: 'mac', url: A.url }, { name: 'pp', url: B.url }], budget: 5, pollMs: 15, minGapMs: 10, backoffMs: [20, 40, 80], seed: 7, tag: 't', noPage: true, noSave: true, log: () => {} });
    A.srv.close(); B.srv.close();
    expect(run.rec.machines[0].coop.slices.length).toBe(2);
    expect(run.best.tiers[4]).toBe(0);
    expect(run.best.by).toBe('pp');
    expect(run.line).toMatch(/coop-best/);
  });
});


// ---------- robustness: backoff, drop, min gap, split bootstrap ----------
function flakyServer(inner, { failFirst = Infinity, code = 429 } = {}) {
  // wraps a mock: POST /jobs answers `code` for the first failFirst submissions (default: always); records submit times.
  const times = []; let seen = 0;
  const srv = http.createServer((rq, rs) => {
    if (rq.method === 'POST') {
      times.push(Date.now());
      if (++seen <= failFirst) { rs.writeHead(code, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify({ detail: 'rate limit exceeded' })); rq.resume(); return; }
    }
    const f = http.request({ host: '127.0.0.1', port: inner.srv.address().port, path: rq.url, method: rq.method, headers: rq.headers }, (r) => { rs.writeHead(r.statusCode, r.headers); r.pipe(rs); });
    rq.pipe(f);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, times, url: `http://127.0.0.1:${srv.address().port}`, close: () => { srv.close(); inner.srv.close(); } })));
}
const fixD = (p) => {
  const m = gridMap(p); let k = 2;
  for (const key of [...m.keys()]) if (k > 0 && m.get(key) !== 'D') { m.set(key, 'D'); k--; }
  const mism = [...m.values()].filter((v) => v !== 'D').length;
  return { status: 'FEASIBLE', tiers: [0, 0, 0, 0, mism], objective: mism, schedule: scheduleOf(p, m) };
};
const hintInput = () => writeTest({ residents: [{ id: 'R01' }], hint: dates.map((d) => ({ residentId: 'R01', date: d, shiftId: 'X' })), config: {} }, dates[0], dates[4]);

describe('solver-coop robustness', () => {
  it('drops a machine after 3 consecutive failures, backs off in between, keeps the other going', async () => {
    const good = await mockServer(fixD), bad = await flakyServer(await mockServer(fixD));
    const logs = [];
    const run = await runCoop({ input: hintInput(), mode: 'relay', solvers: [{ name: 'mac', url: good.url }, { name: 'pp', url: bad.url }], budget: 2, slice: 0.3, minSlice: 0.05, pollMs: 15, minGapMs: 10, backoffMs: [100, 200, 400], seed: 1, tag: 't', noPage: true, noSave: true, log: (m) => logs.push(m) });
    good.srv.close(); bad.close();
    expect(bad.times.length).toBe(3); // dropped after exactly 3 submissions, no more
    expect(bad.times[1] - bad.times[0]).toBeGreaterThanOrEqual(90); // backoff 100 ms
    expect(bad.times[2] - bad.times[1]).toBeGreaterThanOrEqual(190); // backoff 200 ms
    const d = run.rec.machines[0].coop.dropped;
    expect(d.length).toBe(1);
    expect(d[0].machine).toBe('pp');
    expect(d[0].reason).toMatch(/429/);
    expect(typeof d[0].at).toBe('number');
    expect(logs.some((l) => /DROPPED/.test(l) && /pp/.test(l))).toBe(true);
    expect(run.line).toMatch(/ dropped=pp$/);
    expect(run.rec.machines[0].final.dropped.length).toBe(1);
    expect(run.best.tiers[4]).toBe(0); // mac alone still finished the job
    expect(run.rec.machines[0].coop.slices.filter((s) => s.machine === 'pp').every((s) => s.jobStatus === 'error' && /429/.test(s.error))).toBe(true);
  });

  it('a transient failure recovers: fail counter resets on success, machine not dropped', async () => {
    const flaky = await flakyServer(await mockServer(fixD), { failFirst: 2 });
    const run = await runCoop({ input: hintInput(), mode: 'relay', solvers: [{ name: 'mac', url: flaky.url }], budget: 1.5, slice: 0.3, minSlice: 0.05, pollMs: 15, minGapMs: 10, backoffMs: [50, 50, 50], seed: 1, tag: 't', noPage: true, noSave: true, log: () => {} });
    flaky.close();
    expect(run.rec.machines[0].coop.dropped).toEqual([]);
    expect(run.best.tiers[4]).toBe(0);
    expect(run.line).not.toMatch(/dropped/);
  });

  it('ends the run with a clear message when every machine is dropped (split too)', async () => {
    for (const mode of ['relay', 'split']) {
      const a = await flakyServer(await mockServer(fixD)), b = await flakyServer(await mockServer(fixD));
      const logs = [];
      const run = await runCoop({ input: hintInput(), mode, solvers: [{ name: 'mac', url: a.url }, { name: 'pp', url: b.url }], budget: 30, slice: 0.3, minSlice: 0.05, pollMs: 15, minGapMs: 10, backoffMs: [10, 10, 10], seed: 1, tag: 't', noPage: true, noSave: true, log: (m) => logs.push(m) });
      a.close(); b.close();
      expect(run.rec.machines[0].coop.dropped.map((x) => x.machine).sort()).toEqual(['mac', 'pp']);
      expect(logs.some((l) => /ALL 2 MACHINES DROPPED/.test(l))).toBe(true);
      expect(run.best.tiers).toBe(null);
      expect(run.line).toMatch(/dropped=mac,pp$|dropped=pp,mac$/);
      expect(run.rec.machines[0].final.wall).toBeLessThan(10);
    }
  });

  it('keeps at least minGapMs between submissions to one machine', async () => {
    const m = await flakyServer(await mockServer(fixD), { failFirst: 0 });
    await runCoop({ input: hintInput(), mode: 'relay', solvers: [{ name: 'mac', url: m.url }], budget: 1.2, slice: 0.1, minSlice: 0.05, pollMs: 5, minGapMs: 250, seed: 1, tag: 't', noPage: true, noSave: true, log: () => {} });
    m.close();
    expect(m.times.length).toBeGreaterThan(1);
    for (let i = 1; i < m.times.length; i++) expect(m.times[i] - m.times[i - 1]).toBeGreaterThanOrEqual(240);
  });

  it('split bootstraps from a full solve when the input grid is strictly infeasible (pinned windows would be INFEASIBLE)', async () => {
    // score of the original input -> INFEASIBLE; a sub-solve with locked cells pins infeasible input -> INFEASIBLE;
    // full solve (no locked) -> fixD result. After bootstrap, windows pin the feasible global best and succeed.
    const prefer = (p) => {
      const m = gridMap(p);
      const hasX = [...m.values()].includes('X');
      if (p.config.mode === 'score') return hasX ? { status: 'INFEASIBLE', schedule: {} } : { status: 'SCORED', tiers: [0, 0, 0, 0, [...m.values()].filter((v) => v !== 'D').length], schedule: scheduleOf(p, m) };
      const locked = new Set((p.locked || []).map((c) => `${c.residentId}|${c.date}`));
      if (hasX && locked.size) return { status: 'INFEASIBLE', schedule: {}, tiers: null };
      let k = 2;
      for (const key of [...m.keys()]) if (k > 0 && m.get(key) !== 'D' && !locked.has(key)) { m.set(key, 'D'); k--; }
      const mism = [...m.values()].filter((v) => v !== 'D').length;
      return { status: 'FEASIBLE', tiers: [0, 0, 0, 0, mism], objective: mism, schedule: scheduleOf(p, m) };
    };
    const A = await mockServer(prefer), B = await mockServer(prefer);
    const logs = [];
    const run = await runCoop({ input: hintInput(), mode: 'split', solvers: [{ name: 'mac', url: A.url }, { name: 'pp', url: B.url }], budget: 2.5, slice: 0.3, minSlice: 0.05, windowDays: 1, pollMs: 15, minGapMs: 10, seed: 3, tag: 't', noPage: true, noSave: true, log: (m) => logs.push(m) });
    A.srv.close(); B.srv.close();
    expect(logs.some((l) => /NOT strictly feasible/.test(l))).toBe(true);
    const slices = run.rec.machines[0].coop.slices;
    expect(slices.filter((s) => s.window === 'full').every((s) => s.jobStatus === 'done')).toBe(true);
    expect(slices.some((s) => s.window && s.window !== 'full' && s.tiers)).toBe(true); // window sub-solves now return tiers
    expect(slices.every((s) => s.jobStatus === undefined || s.jobStatus === 'done')).toBe(true);
    expect(run.best.tiers[4]).toBe(0);
  });
});
