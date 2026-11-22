// scripts/measure-quality.mjs — per-schedule quality metrics for the owner's complaints. NOT part of `npm test`.
//   npx vite-node scripts/measure-quality.mjs -- <backup.json> [--block id] [--out file.md] name=block|<dump.json> ...
// `block` = the schedule stored in the backup's block; a dump.json = bench-engines --dump file ({schedule}).
// Metrics: coverageBelowMin/AboveMax (validateAll), longest same-shift-id run, top-area share,
// longest consecutive working-day streak, top pair co-occurrence (same date + same area).
// Real backups must live outside the repo (or gitignored); no data is written into the repo.
import fs from 'node:fs';
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
}
const unwrap = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
const rest = process.argv.slice(2).filter(x => x !== '--');
let file = null, blockId = null, out = null; const srcs = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--block') blockId = rest[++i]; else if (rest[i] === '--out') out = rest[++i];
  else if (rest[i].includes('=')) srcs.push(rest[i].split(/=(.*)/s).slice(0, 2)); else file = rest[i];
}
const app = await import('../src/ResidentScheduler.jsx');
const { validateAll, offServiceWindowTargetDelta } = app;
const { SHIFT_MAP, SHIFTS, shiftActiveOnDow } = await import('../src/lib/shifts.js');
const { getCoverageFor, twelveHourStateFor } = await import('../src/lib/coverage.js');
const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')); const d = parsed.data || parsed;
const get = (k, dflt) => (d[k] == null ? dflt : unwrap(d[k]));
const history = get('res_blocks_history', []); const current = get('res_current_block', null);
const block = blockId ? [current, ...history].find(b => b.id === blockId) : current;
const em = get('res_em_roster', []).map(r => { const a = block.emBlockAssignments?.[r.id]; return { ...r, blockType: a?.blockType ?? 'EM', isChief: !!a?.isChief, targetDelta: a?.targetDelta, targetNote: a?.targetNote, targetIsBuyDown: !!a?.targetIsBuyDown }; });
const off = (block.offServiceResidents || []).map(r => { const wd = offServiceWindowTargetDelta(r, block, history); return wd == null ? r : { ...r, targetDelta: (Number(r.targetDelta) || 0) + wd }; });
const ayData = get('res_ay_data', {});
const A = { allResidents: [...em, ...off], block, coverage: get('res_coverage', {}), eligOverrides: get('res_eligibility_overrides', {}), appSettings: get('res_app_settings', {}), dayRules: get('res_day_rules', {}), blocksHistory: history, ayConf: ayData[block.academicYear] || {} };
const { computeQualityMetrics, computeQualityVector, FAIRNESS_AXIS_WEIGHTS } = await import('../src/lib/scheduleQuality.js');
const { varietyStats, normalizeVarietyRule } = await import('../src/lib/variety.js');
const dates = []; for (let t = new Date(block.startDate + 'T00:00:00Z'); t <= new Date(block.endDate + 'T00:00:00Z'); t = new Date(+t + 864e5)) dates.push(t.toISOString().slice(0, 10));
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function measure(schedule) {
  const issues = validateAll(A.allResidents, schedule, block, A.eligOverrides, A.appSettings, A.dayRules, A.coverage, A.blocksHistory, A.ayConf);
  const below = issues.filter(i => i.rule === 'coverageBelowMin').length, above = issues.filter(i => i.rule === 'coverageAboveMax').length;
  const errors = issues.filter(i => i.level === 'error' && !i.overridden).length;
  const cnt = {}; for (const row of Object.values(schedule)) for (const [ds, sid] of Object.entries(row)) if (sid) cnt[ds + '|' + sid] = (cnt[ds + '|' + sid] || 0) + 1;
  let surplusOverMin = 0, cellsOverMin = 0, cellsAtMax = 0, cellsAtMin = 0, atMinTotal = 0;
  for (const ds of dates) { const dow = new Date(ds + 'T00:00:00Z').getUTCDay(); const st = twelveHourStateFor(ds, A.ayConf || {});
    for (const sh of SHIFTS) { if (!shiftActiveOnDow(sh.id, dow)) continue; const cv = getCoverageFor(sh.id, A.coverage, dow, st); if (!(cv.max > 0)) continue; const c = cnt[ds + '|' + sh.id] || 0; atMinTotal++; if (c > cv.min) { cellsOverMin++; surplusOverMin += c - cv.min; } if (c === cv.max) cellsAtMax++; if (c === cv.min) cellsAtMin++; } }
  const sameRun = [], topShare = [], streak = []; const byDA = {};
  for (const [rid, row] of Object.entries(schedule)) {
    const seq = dates.map(ds => row[ds] || null); if (!seq.some(Boolean)) continue;
    let best = 0, run = 0, prev = null, st = 0, bestSt = 0; const areas = {}; let n = 0;
    for (let i = 0; i < seq.length; i++) {
      const s = seq[i];
      if (s) { st++; bestSt = Math.max(bestSt, st); run = s === prev ? run + 1 : 1; best = Math.max(best, run); const ar = SHIFT_MAP[s]?.area || s; areas[ar] = (areas[ar] || 0) + 1; n++; (byDA[`${dates[i]}|${ar}`] ||= []).push(rid); }
      else { st = 0; run = 0; }
      prev = s;
    }
    sameRun.push(best); streak.push(bestSt); topShare.push(Math.max(...Object.values(areas)) / n);
  }
  const pair = {};
  for (const ids of Object.values(byDA)) { ids.sort(); for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const k = ids[i] + '|' + ids[j]; pair[k] = (pair[k] || 0) + 1; } }
  const pv = Object.values(pair).sort((a, b) => b - a);
  const total = Object.values(schedule).reduce((s, r) => s + Object.values(r).filter(Boolean).length, 0);
  const vrule = normalizeVarietyRule(A.appSettings);
  const vs = varietyStats({ schedule, dates, residents: A.allResidents, pairResidentIds: A.allResidents.filter(r => r.category === 'EM_HOME' || r.category === 'EM_BAMC').map(r => r.id), rule: vrule });
  const qin = app.buildQualityInput({ schedule, report: {}, allResidents: A.allResidents, block, appSettings: A.appSettings, eligOverrides: A.eligOverrides, blocksHistory: A.blocksHistory, ayConf: A.ayConf });
  const qm = computeQualityMetrics({ ...qin, dates, coverage: A.coverage, seniorGapCount: 0, restCompromiseCount: issues.filter(i => i.rule === 'postNightRest').length, asNeededCount: 0 });
  const fairness = computeQualityVector(qm, ['coverageMin', 'seniorComposition', 'postNightRest'])[3];
  // fairnessExVariety: slot 3 without the two variety axes, so master and branch compare on the SAME axes
  const fairnessExVariety = fairness - FAIRNESS_AXIS_WEIGHTS.varietyRunExcess * qm.varietyRunExcess - FAIRNESS_AXIS_WEIGHTS.pairStackExcess * qm.pairStackExcess;
  return { runExcess: vs.runExcess, pairExcess: vs.pairExcess, fairnessExVariety: +fairnessExVariety.toFixed(1), shifts: total, errors, below, above, slotsTotal: atMinTotal, slotsAtMin: cellsAtMin, slotsOverMin: cellsOverMin, surplusOverMin, runMax: Math.max(...sameRun), runMean: +mean(sameRun).toFixed(2), areaMax: +Math.max(...topShare).toFixed(2), areaMean: +mean(topShare).toFixed(2), streakMax: Math.max(...streak), pairTop: pv[0] || 0, pairTop5: pv.slice(0, 5).join('/'), pairsGe5: pv.filter(x => x >= 5).length };
}
const rows = srcs.map(([name, f]) => ({ name, ...measure(f === 'block' ? block.schedule : JSON.parse(fs.readFileSync(f, 'utf-8')).schedule) }));
const keys = Object.keys(rows[0]).filter(k => k !== 'name');
const md = ['| metric | ' + rows.map(r => r.name).join(' | ') + ' |', '|---|' + rows.map(() => '---').join('|') + '|', ...keys.map(k => `| ${k} | ${rows.map(r => r[k]).join(' | ')} |`)].join('\n');
console.log(md); if (out) fs.writeFileSync(out, md + '\n');
