// scripts/make-solver-test-file.mjs — write a coded solver test file (what Optimize would send) from a backup.
//   npx vite-node scripts/make-solver-test-file.mjs -- <backup.json> [--block <id>] --out <file>
// <backup.json> is a Settings -> Backup file ({data:{res_*...}} or the bare map); block = res_current_block
// unless --block names an id from res_current_block / res_blocks_history. Residents are coded R01.. and
// every name/email/notes field is stripped (src/lib/solverTestFile.js); the id map is never written.
// REAL DATA SAFETY (public repo): an --out path inside the repo is refused unless git ignores it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  const a = { file: null, block: null, out: null };
  const rest = argv.filter(x => x !== '--');
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t === '--block') a.block = rest[++i];
    else if (t === '--out') a.out = rest[++i];
    else if (t.startsWith('--')) throw new Error(`unknown flag ${t}`);
    else a.file = t;
  }
  if (!a.file || !a.out) throw new Error('usage: <backup.json> [--block id] --out <file>');
  return a;
}

function refuseUntrackedRepoPath(file) {
  let abs = path.resolve(file);
  try { abs = fs.realpathSync(abs); } catch { /* missing file: fine for --out */ }
  let root = repoRoot;
  try { root = fs.realpathSync(repoRoot); } catch { /* keep */ }
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return abs; // outside the repo
  try {
    execFileSync('git', ['check-ignore', '-q', '--', rel], { cwd: root, stdio: 'ignore' });
  } catch (e) {
    if (e.status !== 1) throw new Error(`could not run git check-ignore for ${rel} (exit ${e.status ?? e.code}); is git installed and is this a git repo?`);
    throw new Error(`refusing ${rel}: inside the repo and NOT gitignored (real data could be committed). Write it outside the repo.`);
  }
  return abs;
}

const unwrap = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outAbs = refuseUntrackedRepoPath(args.out);
  const abs = refuseUntrackedRepoPath(args.file);
  const app = await import('../src/ResidentScheduler.jsx');
  const { buildSolverPayload, offServiceWindowTargetDelta } = app;
  const { buildSolverTestFile } = await import('../src/lib/solverTestFile.js');

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
  const baseArgs = {
    allResidents: [...em, ...off], block,
    coverage: get('res_coverage', {}), eligOverrides: get('res_eligibility_overrides', {}),
    appSettings: get('res_app_settings', {}), dayRules: get('res_day_rules', {}),
    blocksHistory: history,
    ayConf: ayData[block.academicYear] || { acepStart: '', acepEnd: '', iteDate: '', aaemStart: '', aaemEnd: '', saemStart: '', saemEnd: '' },
  };

  const payload = buildSolverPayload({ ...baseArgs, optimizeExisting: true });
  const nameStrings = [];
  for (const r of baseArgs.allResidents) nameStrings.push(r.firstName, r.lastName, r.email);
  const file = buildSolverTestFile(payload, { label: 'solver test', startDate: block.startDate, endDate: block.endDate, nameStrings });

  // Belt and braces: no original resident id may survive.
  const text = JSON.stringify(file);
  const idLeaks = payload.residents.filter(r => String(r.id).length >= 4 && text.includes(String(r.id))).length;
  if (idLeaks) throw new Error(`${idLeaks} original resident ids still present in output; not writing`);

  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, text);
  const hintCells = Object.values(file.payload.hint || {}).reduce((t, m) => t + (m && typeof m === 'object' ? Object.keys(m).length : 0), 0);
  console.log(JSON.stringify({ residents: file.residentCount, startDate: file.startDate, endDate: file.endDate, hintCells, locked: (file.payload.locked || []).length, out: outAbs }));
}

main().catch(e => { console.error(e.message); process.exit(1); });
