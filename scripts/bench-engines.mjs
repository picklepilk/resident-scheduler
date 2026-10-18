// scripts/bench-engines.mjs — local-vs-CP-SAT engine bench. NOT part of `npm test`.
//
// Run through vite-node (the app's big file is JSX/ESM and cannot be imported by plain node):
//   npx vite-node scripts/bench-engines.mjs -- <backup.json> [--block <id>] [--url <solverUrl>]
//                                             [--budgets 45,120,300] [--portfolio K]
//   npx vite-node scripts/bench-engines.mjs -- --fixture realScale [--url ...] [--budgets ...]
//
// <backup.json> is a Settings -> Backup file ({data:{res_*...}} or the bare map). The block is
// res_current_block unless --block names an id from res_current_block / res_blocks_history.
// Without --url only the local engine runs. With --url, for each budget the script POSTs
// buildSolverPayload (local result as `hint`, exactly as the app does) to <url>/solve with
// config.maxTimeSeconds (and config.portfolio when given), maps it with mapSolverResult and
// arbitrates with pickEngineResult. A Modal-style durable backend answers /solve with 400 use_jobs;
// the bench does not do submit-then-poll, so point --url at a local/Fly solver for it.
//
// REAL DATA SAFETY (public repo): a backup path inside the repo is refused unless git ignores it.
// Put real backups in `bench-input/` (gitignored) or outside the repo.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The app's modules read browser globals at import time in places; give plain node a minimal shim.
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k), clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const a = { budgets: [45], file: null, block: null, url: null, portfolio: null, fixture: null };
  const rest = argv.filter(x => x !== '--');
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t === '--block') a.block = rest[++i];
    else if (t === '--url') a.url = rest[++i].replace(/\/+$/, '');
    else if (t === '--budgets') a.budgets = rest[++i].split(',').map(Number).filter(n => n > 0);
    else if (t === '--portfolio') a.portfolio = Number(rest[++i]);
    else if (t === '--fixture') a.fixture = rest[++i];
    else if (t.startsWith('--')) throw new Error(`unknown flag ${t}`);
    else a.file = t;
  }
  if (!a.file && !a.fixture) throw new Error('usage: <backup.json> | --fixture realScale  [--block id] [--url u] [--budgets 45,120] [--portfolio K]');
  return a;
}

function refuseUntrackedRepoPath(file) {
  let abs = path.resolve(file);
  try { abs = fs.realpathSync(abs); } catch { /* missing file: later read reports it */ }
  let root = repoRoot;
  try { root = fs.realpathSync(repoRoot); } catch { /* keep */ }
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return abs; // outside the repo
  try {
    execFileSync('git', ['check-ignore', '-q', '--', rel], { cwd: root, stdio: 'ignore' });
  } catch (e) {
    if (e.status !== 1) throw new Error(`could not run git check-ignore for ${rel} (exit ${e.status ?? e.code}); is git installed and is this a git repo?`);
    throw new Error(`refusing ${rel}: inside the repo and NOT gitignored (real data could be committed). Move it to bench-input/ or outside the repo.`);
  }
  return abs;
}

const unwrap = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const app = await import('../src/ResidentScheduler.jsx');
  const { generateScheduleBest, buildSolverPayload, mapSolverResult, pickEngineResult, offServiceWindowTargetDelta } = app;

  let baseArgs; let label;
  if (args.fixture) {
    if (args.fixture !== 'realScale') throw new Error(`unknown fixture "${args.fixture}" (only realScale)`);
    const { makeRealScaleFixture } = await import('../src/lib/__fixtures__/realScale.js');
    baseArgs = makeRealScaleFixture();
    label = 'fixture realScale';
  } else {
    const abs = refuseUntrackedRepoPath(args.file);
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf-8'));
    const d = parsed.data || parsed;
    const get = (k, dflt) => (d[k] === undefined || d[k] === null ? dflt : unwrap(d[k]));
    const emRoster = get('res_em_roster', []);
    const history = get('res_blocks_history', []);
    const current = get('res_current_block', null);
    const pool = [current, ...history].filter(Boolean);
    const block = args.block ? pool.find(b => b.id === args.block) : current;
    if (!block) throw new Error(`block ${args.block || '(current)'} not found; available: ${pool.map(b => b.id).join(', ')}`);
    const em = emRoster.map(r => {
      const a = block.emBlockAssignments?.[r.id];
      return { ...r, blockType: a?.blockType ?? 'EM', isChief: !!a?.isChief, targetDelta: a?.targetDelta, targetNote: a?.targetNote, targetIsBuyDown: !!a?.targetIsBuyDown };
    });
    const off = (block.offServiceResidents || []).map(r => {
      const wd = offServiceWindowTargetDelta(r, block, history);
      return wd == null ? r : { ...r, targetDelta: (Number(r.targetDelta) || 0) + wd };
    });
    const ayData = get('res_ay_data', {});
    baseArgs = {
      allResidents: [...em, ...off], block,
      coverage: get('res_coverage', {}), eligOverrides: get('res_eligibility_overrides', {}),
      appSettings: get('res_app_settings', {}), dayRules: get('res_day_rules', {}),
      blocksHistory: history,
      ayConf: ayData[block.academicYear] || { acepStart: '', acepEnd: '', iteDate: '', aaemStart: '', aaemEnd: '', saemStart: '', saemEnd: '' },
    };
    label = `block ${block.id} (${baseArgs.allResidents.length} residents)`;
  }
  if (args.fixture) label += ` (${baseArgs.allResidents.length} residents)`;
  const solveArgs = { ...baseArgs };

  console.log(`bench-engines: ${label}`);
  const t0 = Date.now();
  const localRes = generateScheduleBest(solveArgs, { attempts: 20 });
  if (!localRes) throw new Error('block has no valid date range');
  const localWall = (Date.now() - t0) / 1000;
  const localCmp = pickEngineResult(null, localRes, solveArgs).engineComparison.local;

  const rows = [{ engine: 'local', budget: '-', wall: localWall, status: 'best-of-20', cmp: localCmp, winner: '-' }];
  if (args.url) {
    for (const budget of args.budgets) {
      const config = { maxTimeSeconds: budget };
      if (args.portfolio) config.portfolio = args.portfolio;
      const payload = buildSolverPayload({ ...solveArgs, hint: localRes.schedule, config });
      const t1 = Date.now();
      try {
        const res = await fetch(`${args.url}/solve`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          signal: AbortSignal.timeout((budget + 90) * 1000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
        const json = await res.json();
        const wall = (Date.now() - t1) / 1000;
        const solverRes = mapSolverResult(json, { block: solveArgs.block, allResidents: solveArgs.allResidents, appSettings: solveArgs.appSettings, ayConf: solveArgs.ayConf });
        const { engineComparison, winner } = pickEngineResult(solverRes, localRes, solveArgs);
        rows.push({ engine: 'cpsat', budget, wall, status: json.status, cmp: engineComparison.solver, winner });
      } catch (e) {
        rows.push({ engine: 'cpsat', budget, wall: (Date.now() - t1) / 1000, status: `ERR ${String(e.message).slice(0, 60)}`, cmp: null, winner: '-' });
      }
    }
  }

  const fmt = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v));
  console.log(['engine', 'budget', 'wall_s', 'status', 'errors', 'blockWarn', 'quality[miss,senior,rest,fair]', 'winner'].join('\t'));
  for (const r of rows) {
    console.log([r.engine, r.budget, r.wall.toFixed(1), r.status, r.cmp ? r.cmp.errorCount : '-', r.cmp ? r.cmp.blockingWarnCount : '-',
      r.cmp ? `[${r.cmp.qualityVector.map(fmt).join(', ')}]` : '-', r.winner].join('\t'));
  }
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
