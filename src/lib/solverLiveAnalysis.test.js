// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as AN from '../../scripts/lib/solverLiveAnalysis.mjs';
import { pageHtml } from '../../scripts/lib/solverLivePage.mjs';
import { runLive, checkOutPath } from '../../scripts/solver-live.mjs';
import { compareHtml, rowsOf, rankRows } from '../../scripts/solver-live-compare.mjs';

describe('solverLiveAnalysis helpers', () => {
  it('diffs two row sets', () => {
    const a = AN.mapFromRows([['R01', '2026-07-01', 'POD-D'], ['R02', '2026-07-01', 'PED-D']]);
    const b = AN.mapFromRows([['R01', '2026-07-01', 'POD-E'], ['R03', '2026-07-02', 'FLEX-D']]);
    const d = AN.diffMaps(a, b);
    expect(d).toEqual([
      { rid: 'R01', date: '2026-07-01', from: 'POD-D', to: 'POD-E' },
      { rid: 'R02', date: '2026-07-01', from: 'PED-D', to: '' },
      { rid: 'R03', date: '2026-07-02', from: '', to: 'FLEX-D' },
    ]);
    expect(AN.countChanged(a, a)).toBe(0);
  });

  it('delta-encodes grids and round-trips', () => {
    const res = ['R01', 'R02'], dates = ['2026-07-01', '2026-07-02'];
    const g0 = AN.gridFromMap(res, dates, AN.mapFromRows([['R01', '2026-07-01', 'POD-D']]));
    const g1 = AN.gridFromMap(res, dates, AN.mapFromRows([['R01', '2026-07-01', 'POD-D'], ['R02', '2026-07-02', 'PED-N']]));
    const d = AN.diffGrid(g0, g1);
    expect(d).toEqual([[3, 'PED-N']]);
    expect(AN.applyDelta(g0, d)).toEqual(g1);
    expect(AN.gridsAt(g0, [{ d }])[1]).toEqual(g1);
    expect(AN.cellsDiffer(g0, g1)).toBe(1);
  });

  it('compares tier vectors lexicographically', () => {
    expect(AN.compareTiers([0, 0, 5, 0, 9], [0, 1, 0, 0, 0])).toBe(-1);
    expect(AN.compareTiers([0, 0, 5, 0, 9], [0, 0, 5, 0, 9])).toBe(0);
    expect(AN.compareTiers([1, 0, 0, 0, 0], [0, 9, 9, 9, 9])).toBe(1);
    expect(AN.verdictOf([0, 1, 2, 0, 3], [0, 1, 2, 0, 2])).toBe('better');
    expect(AN.verdictOf([0, 1, 2, 0, 3], [0, 1, 2, 0, 3])).toBe('same');
    expect(AN.verdictOf([0, 0, 2, 0, 3], [0, 1, 0, 0, 0])).toBe('worse');
    expect(AN.verdictOf(null, [0, 0, 0, 0, 0])).toBe('n/a');
  });

  it('reads tier objects and finds hint tiers', () => {
    expect(AN.tierVector({ tier1_errors: 1, tier2_blockingWarns: 2, tier3_qualityRank: 3, tier4_quality: 5 })).toEqual([1, 2, 3, 0, 5]);
    expect(AN.tierVector(null)).toBeNull();
    expect(AN.tierVector({ foo: 1 })).toBeNull();
    expect(AN.extractHintTiers({ report: { hintEval: { tiers: [1, 2, 3, 4, 5] } } })).toEqual([1, 2, 3, 4, 5]);
    expect(AN.extractHintTiers({ report: { hintPinning: { applied: true, pinned: { coverageMin: 3 } } } })).toBeNull();
  });

  it('formats and parses the summary line', () => {
    const line = AN.formatSummary({ tag: 'b1', machine: 'pp', seed: 42, label: 'block 3 test', start: [0, 1, 2, 0, 9], end: [0, 0, 2, 0, 7], verdict: 'better', wall: 301.234, status: 'FEASIBLE', workers: 12 });
    expect(line).toBe('RS b1 pp seed 42: | block 3 test | [0,1,2,0,9] start | [0,0,2,0,7] end | better | 301.2s | FEASIBLE | workers=12 |');
    expect(AN.parseSummary(line)).toMatchObject({ tag: 'b1', machine: 'pp', seed: '42', start: [0, 1, 2, 0, 9], end: [0, 0, 2, 0, 7], verdict: 'better', wall: 301.2, status: 'FEASIBLE', workers: '12' });
    const noStart = AN.formatSummary({ tag: 't', machine: 'm', seed: 1, label: 'x', start: null, end: [0, 0, 0, 0, 0], verdict: 'n/a', wall: 2, status: 'OPTIMAL', workers: 8 });
    expect(noStart).toContain('| - start |');
    expect(AN.parseSummary(noStart).start).toBeNull();
  });

  it('thins frames but keeps changes and the ends', () => {
    const frames = [];
    for (let i = 0; i < 1000; i++) frames.push({ t: i, status: 'running', stage: 1 + Math.floor(i / 500), best: i % 100 === 0 ? i : 7 });
    const thin = AN.thinFrames(frames, 10);
    expect(thin.length).toBe(10);
    expect(thin[0]).toBe(frames[0]);
    expect(thin[thin.length - 1]).toBe(frames[999]);
    const same = [{ t: 0, status: 'running', stage: 1, best: 3 }, { t: 2, status: 'running', stage: 1, best: 3 }, { t: 4, status: 'running', stage: 1, best: 3 }, { t: 6, status: 'done', stage: 1, best: 3 }];
    expect(AN.thinFrames(same).map((f) => f.t)).toEqual([0, 6]);
  });

  it('finds best-by-stage and last improvement', () => {
    const frames = [
      { t: 0, stage: 1, best: 3 }, { t: 2, stage: 1, best: 2 }, { t: 4, stage: 2, best: 9 }, { t: 6, stage: 2, best: 9 }, { t: 8, stage: 2, best: 8 },
    ];
    expect(AN.bestByStage(frames).map((s) => [s.stage, s.points.length])).toEqual([[1, 2], [2, 3]]);
    expect(AN.lastImprovementT({ frames, incs: [{ t: 5, tier: 'x', d: [[0, 'A']] }, { t: 99, tier: 'final', d: [[1, 'B']] }] })).toBe(8);
  });
});

// ---------- end to end against a fake jobs server ----------
const RES = ['R01', 'R02'];
const DATES = ['2026-07-01', '2026-07-02', '2026-07-03'];
function testFile() {
  return {
    kind: 'resident-solver-test', version: 1, label: 'fake block', startDate: DATES[0], endDate: DATES[2], residentCount: 2,
    payload: {
      residents: RES.map((id) => ({ id })), dates: DATES, config: { numWorkers: 4 },
      hint: [{ residentId: 'R01', date: DATES[0], shiftId: 'POD-D' }, { residentId: 'R02', date: DATES[1], shiftId: 'PED-D' }],
    },
  };
}
const servers = [];
function fakeSolver({ hintTiers = null, failSubmit = false } = {}) {
  const seen = { submitted: null, polls: 0, deleted: false };
  const srv = http.createServer((rq, rs) => {
    let body = '';
    rq.on('data', (c) => (body += c));
    rq.on('end', () => {
      const send = (code, j) => { rs.writeHead(code, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(j)); };
      if (rq.method === 'POST' && rq.url === '/jobs') {
        if (failSubmit) return send(500, { error: 'boom' });
        seen.submitted = JSON.parse(body); return send(200, { jobId: 'j1' });
      }
      if (rq.method === 'DELETE') { seen.deleted = true; return send(200, { status: 'cancelled' }); }
      if (rq.method === 'GET' && rq.url === '/jobs/j1') {
        seen.polls++;
        const n = seen.polls;
        if (n < 4) {
          const rows = n === 1 ? [] : n === 2 ? [['R01', DATES[0], 'POD-E']] : [['R01', DATES[0], 'POD-E'], ['R02', DATES[2], 'FLEX-D']];
          const progress = { stage: n < 3 ? 1 : 5, stages: 6, elapsed: n, budget: 10, best: 10 - n, runner: 'x' };
          if (n > 1) progress.incumbent = { stage: progress.stage, elapsed: n - 0.5, objective: 10 - n, rows };
          return send(200, { status: 'running', elapsedSeconds: n, budgetSeconds: 10, progress });
        }
        const report = hintTiers ? { hintEval: { tiers: hintTiers } } : {};
        return send(200, {
          status: 'done', elapsedSeconds: 3, budgetSeconds: 10, progress: null,
          result: { status: 'FEASIBLE', objective: 5, schedule: { R01: { [DATES[0]]: 'POD-E' }, R02: { [DATES[2]]: 'FLEX-D' } }, tiers: { tier1_errors: 0, tier2_blockingWarns: 0, tier3_qualityRank: 1, tier4_quality: 4 }, report },
        });
      }
      send(404, {});
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => { servers.push(srv); r({ url: `http://127.0.0.1:${srv.address().port}`, seen, srv }); }));
}
afterEach(async () => { for (const s of servers.splice(0)) await new Promise((r) => s.close(r)); });

describe('solver-live end to end (fake jobs server)', () => {
  it('submits, polls, records, prints summary lines, exports html and compares', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-live-'));
    const input = path.join(dir, 'test.json');
    fs.writeFileSync(input, JSON.stringify(testFile()));
    const a = await fakeSolver({ hintTiers: [0, 2, 5, 0, 20] });
    const b = await fakeSolver();
    const out = path.join(dir, 'rec.json');
    const r = await runLive({
      input, solvers: [{ name: 'mac', url: a.url }, { name: 'pp', url: b.url }], budget: 10, seed: 42, tag: 't1',
      config: { numWorkers: 8 }, configFor: { pp: { numWorkers: 12 } }, noPage: true, out, pollMs: 5, retryMs: 5, log: () => {},
    });
    // config merge
    expect(a.seen.submitted.config).toMatchObject({ maxTimeSeconds: 10, randomSeed: 42, liveIncumbent: true, numWorkers: 8 });
    expect(b.seen.submitted.config.numWorkers).toBe(12);
    expect(a.seen.submitted.hint).toHaveLength(2);
    // summary lines
    expect(r.lines).toHaveLength(2);
    const la = AN.parseSummary(r.lines[0]), lb = AN.parseSummary(r.lines[1]);
    expect(la).toMatchObject({ tag: 't1', machine: 'mac', seed: '42', label: 'fake block', start: [0, 2, 5, 0, 20], end: [0, 0, 1, 0, 4], verdict: 'better', status: 'FEASIBLE', workers: '8' });
    expect(lb).toMatchObject({ machine: 'pp', start: null, verdict: 'n/a', workers: '12' });
    // recording
    const rec = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(rec.machines).toHaveLength(2);
    const m = rec.machines[0];
    expect(m.frames.length).toBeGreaterThanOrEqual(4);
    expect(m.frames.find((f) => f.stage === 5).stageName).toBe('tier4_quality');
    expect(m.incs.filter((i) => i.tier !== 'final')).toHaveLength(2);
    // final grid from deltas == result schedule
    const grids = AN.gridsAt(rec.meta.hint, m.incs);
    const last = grids[grids.length - 1];
    expect(last[0 * 3 + 0]).toBe('POD-E');
    expect(last[1 * 3 + 2]).toBe('FLEX-D');
    expect(last[1 * 3 + 1]).toBe(''); // input PED-D dropped by the final schedule
    expect(m.final.cellsChanged).toBe(3);
    expect(m.final.verdict).toBe('better');
    // static page + compare page
    const html = pageHtml({ recording: rec });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('fake block');
    expect(html).not.toMatch(/https?:\/\/(?!localhost|127.0.0.1)/);
    const rows = rowsOf(rec, out);
    expect(rows).toHaveLength(2);
    expect(rankRows(rows)[0].machine).toBeDefined();
    const cmp = compareHtml([{ file: out, rec }]);
    expect(cmp).toContain('mac');
    expect(cmp).toContain('[0, 0, 1, 0, 4]');
    await r.close();
  });

  it('reports a failed machine without breaking the run', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-live-'));
    const input = path.join(dir, 'test.json');
    fs.writeFileSync(input, JSON.stringify(testFile()));
    const bad = await fakeSolver({ failSubmit: true });
    const r = await runLive({ input, solvers: [{ name: 'x', url: bad.url }], budget: 5, seed: 1, tag: 'f', noPage: true, noSave: true, pollMs: 5, retryMs: 5, log: () => {} });
    const l = AN.parseSummary(r.lines[0]);
    expect(l).toMatchObject({ machine: 'x', status: 'failed', verdict: 'n/a', end: null });
    expect(r.rec.machines[0].error).toMatch(/HTTP 500/);
  });

  it('serves the live page over SSE', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-live-'));
    const input = path.join(dir, 'test.json');
    fs.writeFileSync(input, JSON.stringify(testFile()));
    const a = await fakeSolver();
    const r = await runLive({ input, solvers: [{ name: 'mac', url: a.url }], budget: 5, seed: 1, tag: 's', port: 0, noSave: true, pollMs: 5, retryMs: 5, log: () => {} });
    const port = r.server.address().port;
    const page = await new Promise((res) => http.get(`http://127.0.0.1:${port}/`, (rs) => { let s = ''; rs.on('data', (c) => (s += c)); rs.on('end', () => res(s)); }));
    expect(page).toContain("EventSource('/events')");
    const recJson = await new Promise((res) => http.get(`http://127.0.0.1:${port}/recording.json`, (rs) => { let s = ''; rs.on('data', (c) => (s += c)); rs.on('end', () => res(JSON.parse(s))); }));
    expect(recJson.machines[0].final.status).toBe('FEASIBLE');
    await r.close();
  });

  it('refuses to save a recording inside the repo unless gitignored', () => {
    const inRepo = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '../../scripts/rec-test.json');
    expect(() => checkOutPath(inRepo)).toThrow(/refusing/);
    expect(() => checkOutPath(path.join(os.tmpdir(), 'ok.json'))).not.toThrow();
  });
});
