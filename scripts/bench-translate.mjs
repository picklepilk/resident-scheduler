// scripts/bench-translate.mjs — turn solver-live recordings into plain schedule metrics. NOT part of `npm test`.
//   npx vite-node scripts/bench-translate.mjs -- <backup.json> <recording.json> [more recordings...] [--out file.json]
// The backup is the Settings backup the solver test file was made from (codes R01.. follow buildSolverPayload's
// residents order, so the same backup maps them back). For each recording + machine, the FINAL incumbent grid
// (start grid + every recorded incumbent delta) is scored with the app's own validateAll + variety stats.
// Prints/writes metrics only (counts), never names. Real backups must live outside the repo.
import fs from 'node:fs';
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
}
const unwrap = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
const argv = process.argv.slice(2).filter(x => x !== '--');
let out = null; const files = [];
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--out') out = argv[++i]; else files.push(argv[i]); }
const [backupFile, ...recFiles] = files;

const app = await import('../src/ResidentScheduler.jsx');
const { buildSolverPayload, offServiceWindowTargetDelta, validateAll } = app;
const { varietyStats, normalizeVarietyRule } = await import('../src/lib/variety.js');
const { gridFromMap, mapFromHint, gridsAt } = await import('./lib/solverLiveAnalysis.mjs');

const parsed = JSON.parse(fs.readFileSync(backupFile, 'utf-8')); const d = parsed.data || parsed;
const get = (k, dflt) => (d[k] == null ? dflt : unwrap(d[k]));
const history = get('res_blocks_history', []); const block = get('res_current_block', null);
const em = get('res_em_roster', []).map(r => { const a = block.emBlockAssignments?.[r.id]; return { ...r, blockType: a?.blockType ?? 'EM', isChief: !!a?.isChief, targetDelta: a?.targetDelta, targetNote: a?.targetNote, targetIsBuyDown: !!a?.targetIsBuyDown }; });
const off = (block.offServiceResidents || []).map(r => { const wd = offServiceWindowTargetDelta(r, block, history); return wd == null ? r : { ...r, targetDelta: (Number(r.targetDelta) || 0) + wd }; });
const ayData = get('res_ay_data', {});
const A = { allResidents: [...em, ...off], block, coverage: get('res_coverage', {}), eligOverrides: get('res_eligibility_overrides', {}), appSettings: get('res_app_settings', {}), dayRules: get('res_day_rules', {}), blocksHistory: history, ayConf: ayData[block.academicYear] || {} };
const payload = buildSolverPayload({ ...A, optimizeExisting: true });
const pad = payload.residents.length > 99 ? 3 : 2;
const codeToId = Object.fromEntries(payload.residents.map((r, i) => [`R${String(i + 1).padStart(pad, '0')}`, r.id]));

function metrics(grid, residents, dates) {
  const schedule = {};
  residents.forEach((code, ri) => { const id = codeToId[code]; if (!id) return; const row = {}; dates.forEach((ds, di) => { const s = grid[ri * dates.length + di]; if (s) row[ds] = s; }); schedule[id] = row; });
  const issues = validateAll(A.allResidents, schedule, block, A.eligOverrides, A.appSettings, A.dayRules, A.coverage, A.blocksHistory, A.ayConf);
  const live = issues.filter(i => !i.overridden);
  const count = (pred) => live.filter(pred).length;
  const under = live.filter(i => i.rule === 'underTarget');
  // "Under target: count/target shifts..." (validateAll carries no numeric field; parse the counts only)
  const short = under.reduce((s, i) => { const m = /Under target: (\d+)\/(\d+)/.exec(i.message || ''); return s + (m ? Math.max(0, +m[2] - +m[1]) : 1); }, 0);
  const vs = varietyStats({ schedule, dates, residents: A.allResidents, pairResidentIds: A.allResidents.filter(r => r.category === 'EM_HOME' || r.category === 'EM_BAMC').map(r => r.id), rule: normalizeVarietyRule(A.appSettings) });
  let streakMax = 0;
  for (const row of Object.values(schedule)) { let st = 0; for (const ds of dates) { if (row[ds]) { st++; streakMax = Math.max(streakMax, st); } else st = 0; } }
  const byRule = {}; for (const i of live.filter(i => i.level === 'warn')) byRule[i.rule] = (byRule[i.rule] || 0) + 1;
  return {
    shifts: Object.values(schedule).reduce((s, r) => s + Object.keys(r).length, 0),
    errors: count(i => i.level === 'error'), warnings: count(i => i.level === 'warn'),
    slotsShort: count(i => i.rule === 'coverageBelowMin'), slotsOverMax: count(i => i.rule === 'coverageAboveMax'),
    residentsUnderTarget: under.length, shiftsShortOfTarget: short,
    sameShiftRunExcess: vs.runExcess, pairStackExcess: vs.pairExcess, longestWorkStreak: streakMax,
    restAfterNight: count(i => i.rule === 'postNightRest'),
    topWarnings: Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
}

const rows = [];
let startDone = false;
for (const f of recFiles) {
  const rec = JSON.parse(fs.readFileSync(f, 'utf-8')); const { residents, dates, hint } = rec.meta;
  // meta.hint is the start grid already flattened (residents x dates, '' = off); older shapes fall back
  const hintGrid = Array.isArray(hint) && hint.length === residents.length * dates.length && (typeof hint[0] === 'string') ? hint.slice() : gridFromMap(residents, dates, mapFromHint(hint));
  if (!startDone) { rows.push({ run: 'START ' + rec.meta.tag, machine: '-', ...metrics(hintGrid, residents, dates) }); startDone = true; }
  for (const m of rec.machines) {
    const grids = gridsAt(hintGrid, m.incs || []); const fin = grids[grids.length - 1];
    rows.push({ run: `${rec.meta.tag} s${rec.meta.seed}`, machine: m.name, workers: m.workers, tiers: m.final?.tiers, lastImprovementS: m.final?.lastImprovementT, ...metrics(fin, residents, dates) });
  }
}
const keys = ['run', 'machine', 'workers', 'errors', 'slotsShort', 'slotsOverMax', 'residentsUnderTarget', 'shiftsShortOfTarget', 'sameShiftRunExcess', 'pairStackExcess', 'longestWorkStreak', 'restAfterNight', 'warnings', 'lastImprovementS'];
console.log('| ' + keys.join(' | ') + ' |'); console.log('|' + keys.map(() => '---').join('|') + '|');
for (const r of rows) console.log('| ' + keys.map(k => r[k] ?? '').join(' | ') + ' |');
for (const r of rows) console.log(r.run, r.machine, 'top warnings', JSON.stringify(r.topWarnings));
if (out) fs.writeFileSync(out, JSON.stringify(rows, null, 1));
