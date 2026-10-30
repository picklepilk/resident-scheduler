/** @vitest-environment jsdom */
// src/lib/realBlockEval.test.js
//
// GATED evaluation harness for ONE real block: compares (A) the app's own generated schedule,
// (B) the chief's final hand-edited schedule (parsed from a QGenda "Calendar By Task" CSV), and
// (C) a fresh generateScheduleBest run at the built-in UI budget, all judged by the same
// validateAll / coverage / target / night-shape / quality code.
//
// REAL DATA STAYS OUT OF THE REPO. The input directory is passed through the environment and is
// read-only here; every output (report.json, report.md, payload.json) is written back into that
// same private directory. This file contains no names, rosters or emails.
//
//   REAL_BLOCK_EVAL=/path/to/private/dir npx vitest run src/lib/realBlockEval.test.js
//
// Input dir: backup.json (Settings JSON backup) + qgenda.csv (Calendar By Task export).
// Without the env var the whole suite is skipped, so `npm test` never touches it.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  generateScheduleBestAsync, validateAll, buildQualityInput, buildSolverPayload,
  offServiceWindowTargetDelta, getShiftTarget, isSchedulable, normalizeRulePriority, countBlockingWarns, isJeopardyDate,
} from '../ResidentScheduler.jsx';
import { computeQualityMetrics, computeQualityVector } from './scheduleQuality.js';
import { getBlockDates, parseDate } from './dates.js';
import { getCoverageFor, twelveHourStateFor } from './coverage.js';
import { SHIFT_MAP, SHIFT_DOW, isNightShiftId } from './shifts.js';
import { parseQGendaCalendarCsv, mapQGendaCalendar } from './qgendaCalendarParse.js';

const DIR = process.env.REAL_BLOCK_EVAL || '';
const RUN = !!DIR;
// Mirrors BUILTIN_ENGINE_OPTS in ResidentScheduler.jsx. REAL_BLOCK_EVAL_GEN_MS overrides the time
// budget (a slow host such as a Pi spends the whole 20 s on seeds and never reaches the LNS phase).
const BUILTIN_ENGINE_OPTS = { timeBudgetMs: Number(process.env.REAL_BLOCK_EVAL_GEN_MS) || 20000, lnsIters: 5000 };

const tick = () => new Promise(r => setImmediate(r));

// Mirrors ResidentScheduler.jsx composeAllResidents (not exported).
function composeAllResidents(emRoster, block, blocksHistory) {
  const em = emRoster.map(r => ({
    ...r,
    blockType: block.emBlockAssignments?.[r.id]?.blockType ?? 'EM',
    isChief: !!(block.emBlockAssignments?.[r.id]?.isChief),
    targetDelta: block.emBlockAssignments?.[r.id]?.targetDelta,
    targetNote: block.emBlockAssignments?.[r.id]?.targetNote,
    targetIsBuyDown: !!(block.emBlockAssignments?.[r.id]?.targetIsBuyDown),
  }));
  const off = (block.offServiceResidents || []).map(r => {
    const windowDelta = offServiceWindowTargetDelta(r, block, blocksHistory);
    if (windowDelta == null) return r;
    return { ...r, targetDelta: (Number(r.targetDelta) || 0) + windowDelta };
  });
  return [...em, ...off];
}

// QGenda shows off-service people as generic slot names ("Psychiatry 2", "SAMMC7 - PGY2") that
// cannot be tied to a specific off-service record. For the chief schedule they become SYNTHETIC
// residents (one per placeholder name, full-block availability) so their coverage still counts.
function syntheticFor(name) {
  const n = name.toLowerCase();
  let category = 'IM', pgy = 2;
  if (/sammc|^resident \d/.test(n)) { category = 'EM_BAMC'; pgy = 1; } // EM_BAMC is pgy 1 in the app's data
  else if (n.startsWith('anes') || n.startsWith('off service')) { category = 'ANES'; pgy = 1; }
  else if (n.startsWith('family')) { category = 'FM'; pgy = 1; }
  else if (n.startsWith('neuro')) { category = 'NEURO'; pgy = 1; }
  else if (n.startsWith('psych')) { category = 'PSYCH'; pgy = 1; }
  else if (n.startsWith('medicine')) { category = 'IM'; pgy = 2; }
  else if (n.startsWith('peds') || n.startsWith('pediatric')) { category = 'PEDS'; pgy = 2; }
  return {
    id: `syn:${name}`, synthetic: true, category, pgy, blockType: 'EM', firstName: 'Slot', lastName: name,
    isCCUNights: false, canWorkDates: [], jeopardyDates: [], availableRanges: [], approvedDatesOff: [],
    availabilityMode: 'full',
  };
}

function countBy(arr, f) { const o = {}; for (const x of arr) { const k = f(x); o[k] = (o[k] || 0) + 1; } return o; }
function sortObj(o) { return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))); }

function coverageStats(schedule, residents, block, coverage, ayConf) {
  const dates = getBlockDates(block.startDate, block.endDate);
  const byShift = {};
  let slotsMin = 0, unfilled = 0, belowMax = 0, slotsMax = 0;
  for (const ds of dates) {
    const dow = parseDate(ds).getDay();
    const st = twelveHourStateFor(ds, ayConf);
    for (const sid of Object.keys(SHIFT_MAP)) {
      if (SHIFT_DOW[sid] && !SHIFT_DOW[sid].includes(dow)) continue;
      const { min, max } = getCoverageFor(sid, coverage, dow, st);
      if (min <= 0 && !(max > 0)) continue;
      let filled = 0;
      for (const r of residents) if (schedule[r.id]?.[ds] === sid) filled++;
      const o = (byShift[sid] ??= { min: 0, max: 0, short: 0, belowMax: 0, over: 0 });
      o.min += min; o.max += max ?? min;
      const short = Math.max(0, min - filled);
      const bm = Math.max(0, (max ?? min) - Math.max(filled, min));
      o.short += short; o.belowMax += bm; o.over += Math.max(0, filled - (max ?? min));
      slotsMin += min; unfilled += short; slotsMax += max ?? min; belowMax += bm;
    }
  }
  const trimmed = Object.fromEntries(Object.entries(byShift).filter(([, v]) => v.short || v.belowMax || v.over));
  return { slotsMin, unfilled, slotsMax, belowMax, byShift: trimmed };
}

function nightShape(schedule, residents, dates) {
  const hist = {}; const runsPer = {};
  let singles = 0, total = 0;
  for (const r of residents) {
    const rs = schedule[r.id] || {};
    let i = 0, n = 0;
    while (i < dates.length) {
      if (!isNightShiftId(rs[dates[i]])) { i++; continue; }
      let j = i;
      while (j + 1 < dates.length && isNightShiftId(rs[dates[j + 1]])) j++;
      const len = j - i + 1;
      hist[len] = (hist[len] || 0) + 1; if (len === 1) singles++;
      total++; n++; i = j + 1;
    }
    if (n) runsPer[r.id] = n;
  }
  const multi = Object.entries(runsPer).filter(([, n]) => n >= 2).map(([id]) => id);
  return { totalRuns: total, singleIsolated: singles, lengthHistogram: hist, residentsWithNights: Object.keys(runsPer).length,
    residentsWithMultipleRuns: multi.length, multiRunResidentIds: multi };
}

function availableOn(r, ds, block) {
  if ((r.approvedDatesOff || []).includes(ds) || (r.vacationDates || []).includes(ds)) return false;
  const mode = r.availabilityMode || 'full';
  if (mode === 'ranges' && !(r.availableRanges || []).some(g => g.start <= ds && ds <= g.end)) return false;
  if (mode === 'days' && !(r.canWorkDates || []).includes(ds)) return false;
  if (isJeopardyDate(r, ds, block.jeopardySchedule)) return false;
  return true;
}

function targetStats(schedule, residents, block, appSettings, dates) {
  const rows = [];
  for (const r of residents) {
    if (r.synthetic || !isSchedulable(r)) continue;
    const target = getShiftTarget(r, appSettings);
    if (target == null) continue;
    const rs = schedule[r.id] || {};
    const assigned = dates.filter(d => rs[d]).length;
    const free = dates.filter(d => !rs[d] && availableOn(r, d, block)).length;
    rows.push({ id: r.id, category: r.category, pgy: r.pgy, target, assigned, delta: assigned - target, availableUnusedDays: free });
  }
  const under = rows.filter(x => x.delta < 0).sort((a, b) => a.delta - b.delta);
  const over = rows.filter(x => x.delta > 0);
  return {
    residents: rows.length, underCount: under.length, underShiftsTotal: under.reduce((a, x) => a - x.delta, 0),
    overCount: over.length, overShiftsTotal: over.reduce((a, x) => a + x.delta, 0),
    underWithAvailableCapacity: under.filter(x => x.availableUnusedDays >= -x.delta).length,
    under, rows,
  };
}

function evaluate(label, schedule, ctx) {
  const { residents, block, args, dates, rulePriority, report } = ctx;
  const scrub = (m) => {
    let t = String(m || '');
    for (const r of residents) { if (!r.synthetic) t = t.split(`${r.firstName} ${r.lastName}`).join(`<${r.id.slice(0, 6)}>`); }
    return t;
  };
  const blk = { ...block, schedule };
  const issues = validateAll(residents, schedule, blk, args.eligOverrides, args.appSettings, args.dayRules, args.coverage, args.blocksHistory, args.ayConf);
  const syn = new Set(residents.filter(r => r.synthetic).map(r => r.id));
  const realIssues = issues.filter(i => !syn.has(i.residentId));
  const byRule = (list, lvl) => sortObj(countBy(list.filter(i => i.level === lvl), i => i.rule || 'unknown'));
  const out = {
    label,
    assignedShifts: Object.values(schedule).reduce((a, rs) => a + Object.values(rs).filter(Boolean).length, 0),
    errors: issues.filter(i => i.level === 'error').length,
    warnings: issues.filter(i => i.level !== 'error').length,
    errorsByRule: byRule(issues, 'error'),
    warningsByRule: byRule(issues, 'warn'),
    realResidentsOnly: {
      errors: realIssues.filter(i => i.level === 'error').length,
      warnings: realIssues.filter(i => i.level !== 'error').length,
      errorsByRule: byRule(realIssues, 'error'),
      warningsByRule: byRule(realIssues, 'warn'),
    },
    // EM Home roster only: the one scope where chief-vs-app is apples to apples. Off-service people
    // appear in the chief's QGenda as anonymous slot names (synthetic here), so their per-person
    // eligibility/target results for schedule B are artifacts of that mapping.
    emHomeOnly: (() => {
      const scrubN = (m) => scrub(m).replace(/\d+/g, 'N').slice(0, 120);
      const ids = new Set(residents.filter(r => r.category === 'EM_HOME' && !r.synthetic).map(r => r.id));
      const l = issues.filter(i => ids.has(i.residentId));
      return { errors: l.filter(i => i.level === 'error').length, warnings: l.filter(i => i.level !== 'error').length,
        errorsByRule: byRule(l, 'error'), warningsByRule: byRule(l, 'warn'),
        errorMessages: sortObj(countBy(l.filter(i => i.level === 'error'), i => `${i.rule}: ${scrubN(i.message)}`)) };
    })(),
    blockingWarnCount: countBlockingWarns(issues, rulePriority),
    coverage: coverageStats(schedule, residents, block, args.coverage, args.ayConf),
    targets: targetStats(schedule, residents, block, args.appSettings, dates),
    targetsEmHomeOnly: targetStats(schedule, residents.filter(r => r.category === 'EM_HOME'), block, args.appSettings, dates),
    nightShape: nightShape(schedule, residents, dates),
  };
  try {
    const qIn = buildQualityInput({ schedule, report: report || {}, allResidents: residents, block: blk, appSettings: args.appSettings, eligOverrides: args.eligOverrides, blocksHistory: args.blocksHistory, ayConf: args.ayConf });
    const metrics = computeQualityMetrics({ ...qIn, dates, coverage: args.coverage, seniorGapCount: 0, restCompromiseCount: 0 });
    out.qualityMetrics = metrics;
    out.qualityVector = computeQualityVector(metrics, rulePriority);
  } catch (e) { out.qualityError = String(e?.message || e); }
  out.ruleLessMessages = sortObj(countBy(issues.filter(i => !i.rule), i => `${i.level}: ${scrub(i.message).replace(/\d+/g, 'N').slice(0, 110)}`));
  out.issueSamples = issues.filter(i => i.level === 'error').slice(0, 40)
    .map(i => ({ rule: i.rule, residentId: i.residentId, dateStr: i.dateStr, shiftId: i.shiftId, message: scrub(i.message) }));
  return out;
}

(RUN ? describe : describe.skip)('real block eval (gated on REAL_BLOCK_EVAL)', () => {
  it('evaluates app-generated vs chief-final vs fresh generation', async () => {
    const backup = JSON.parse(readFileSync(path.join(DIR, 'backup.json'), 'utf-8'));
    const d = backup.data;
    const block = d.res_current_block;
    const blocksHistory = Array.isArray(d.res_blocks_history) ? d.res_blocks_history : [];
    const ayConf = (d.res_ay_data || {})[block.academicYear] || {};
    const baseResidents = composeAllResidents(d.res_em_roster, block, blocksHistory);
    const args = {
      allResidents: baseResidents, block, coverage: d.res_coverage || {}, eligOverrides: d.res_eligibility_overrides || {},
      appSettings: d.res_app_settings || {}, dayRules: d.res_day_rules || {}, blocksHistory, ayConf,
    };
    const dates = getBlockDates(block.startDate, block.endDate);
    const rulePriority = normalizeRulePriority(args.appSettings.rulePriority);
    const nameOf = Object.fromEntries(baseResidents.map(r => [r.id, `${r.lastName}, ${r.firstName}`]));

    // ── A: the app's own generated schedule ──
    const schedA = block.lastGenerated?.schedule || block.schedule;
    const A = evaluate('A app-generated', schedA, { residents: baseResidents, block, args, dates, rulePriority, report: block.generationReport });

    // ── B: chief final from QGenda ──
    const entries = parseQGendaCalendarCsv(readFileSync(path.join(DIR, 'qgenda.csv'), 'utf-8'));
    const mapped = mapQGendaCalendar(entries, baseResidents, { lastNameFallback: true });
    const synMap = new Map();
    const schedB = JSON.parse(JSON.stringify(mapped.schedule));
    const synConflicts = [];
    for (const u of mapped.unmatchedEntries) {
      if (u.reason === 'ambiguous') continue;
      let s = synMap.get(u.name);
      if (!s) { s = syntheticFor(u.name); synMap.set(u.name, s); }
      const row = schedB[s.id] ?? (schedB[s.id] = {});
      if (row[u.date]) synConflicts.push({ name: u.name, date: u.date }); else row[u.date] = u.shiftId;
    }
    const residentsB = [...baseResidents, ...synMap.values()];
    const chiefBlock = { ...block, handOverrides: {} };
    const B = evaluate('B chief-final', schedB, { residents: residentsB, block: chiefBlock, args: { ...args, allResidents: residentsB, block: chiefBlock }, dates, rulePriority, report: {} });

    // ── C: fresh generation at the built-in UI budget ──
    await tick();
    const genBlock = { ...block, schedule: {}, handOverrides: {}, lockedCells: {} };
    const genArgs = { ...args, block: genBlock };
    const t0 = Date.now();
    const gen = await generateScheduleBestAsync(genArgs, BUILTIN_ENGINE_OPTS, () => {});
    const genMs = Date.now() - t0;
    await tick();
    const C = evaluate('C fresh generateScheduleBest', gen.schedule, { residents: baseResidents, block: genBlock, args: genArgs, dates, rulePriority, report: gen.report });
    C.wallMs = genMs;
    C.replay = gen.report?.replay;
    C.budgetMs = BUILTIN_ENGINE_OPTS.timeBudgetMs;
    C.attemptsRun = gen.report?.attempts;
    C.lnsAccepted = gen.report?.lnsAccepted ?? null;

    // ── cross-comparison A/C vs B on cells ──
    const diff = (S, label) => {
      let same = 0, diffc = 0, onlyS = 0, onlyB = 0;
      for (const r of baseResidents) {
        for (const ds of dates) {
          const a = S[r.id]?.[ds] || '', b = schedB[r.id]?.[ds] || '';
          if (a && b) (a === b ? same++ : diffc++); else if (a) onlyS++; else if (b) onlyB++;
        }
      }
      return { label, sameShift: same, differentShift: diffc, onlyInThis: onlyS, onlyInChief: onlyB };
    };

    // ── solver payload (hint = A) ──
    let payloadNote = 'ok';
    try {
      const payload = buildSolverPayload({ ...args, block: { ...block, schedule: {}, handOverrides: {}, lockedCells: {} }, hint: schedA });
      writeFileSync(path.join(DIR, 'payload.json'), JSON.stringify(payload));
    } catch (e) { payloadNote = `buildSolverPayload failed: ${e?.code || ''} ${e?.message || e}`; }

    const slim = (x) => { const { rows, ...rest } = x.targets; const { rows: r2, ...rest2 } = x.targetsEmHomeOnly; return { ...x, targets: rest, targetsEmHomeOnly: rest2 }; };
    const report = {
      block: { id: block.id, startDate: block.startDate, endDate: block.endDate, academicYear: block.academicYear },
      residentsReal: baseResidents.length, syntheticSlots: [...synMap.keys()].length,
      qgenda: {
        parsedCells: entries.length, unmappedTasks: mapped.unmappedTasks, unmatchedNames: mapped.unmatchedNames,
        sameDayConflicts: mapped.conflicts, fallbackMatchedNames: mapped.fallbackMatches.length, syntheticConflicts: synConflicts,
        jeopardyRows: mapped.jeopardy.length, jeopardyUnmatched: mapped.jeopardy.filter(j => !j.residentId).length,
      },
      payloadNote,
      A: slim(A), B: slim(B), C: slim(C),
      cellDiff: [diff(schedA, 'A vs B'), diff(gen.schedule, 'C vs B'), diff(gen.schedule, 'C vs A (via B-shape)')].slice(0, 2),
    };
    writeFileSync(path.join(DIR, 'report.json'), JSON.stringify(report, null, 2));

    // ── readable markdown (names allowed: private dir only) ──
    const L = [];
    const tab = (o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(', ') || '-';
    L.push(`# Real block eval ${block.startDate}..${block.endDate}`, '');
    for (const X of [A, B, C]) {
      L.push(`## ${X.label}`, `- assigned shifts: ${X.assignedShifts}${X.wallMs ? `, gen wall ${X.wallMs} ms, budget ${X.budgetMs}, attempts ${X.attemptsRun}, lns ${JSON.stringify(X.replay?.lns)}, lnsAccepted ${X.lnsAccepted}` : ''}`,
        `- validateAll errors ${X.errors}, warnings ${X.warnings}, blockingWarn ${X.blockingWarnCount}`,
        `- errors by rule: ${tab(X.errorsByRule)}`, `- rule-less issue messages: ${tab(X.ruleLessMessages)}`, `- warnings by rule: ${tab(X.warningsByRule)}`,
        `- real-residents-only: errors ${X.realResidentsOnly.errors} (${tab(X.realResidentsOnly.errorsByRule)}), warnings ${X.realResidentsOnly.warnings} (${tab(X.realResidentsOnly.warningsByRule)})`,
        `- coverage: min slots ${X.coverage.slotsMin}, unfilled ${X.coverage.unfilled}, below max ${X.coverage.belowMax}`,
        `- unfilled/below-max by shift: ${Object.entries(X.coverage.byShift).map(([s, v]) => `${s}(short ${v.short}, belowMax ${v.belowMax}, over ${v.over})`).join('; ') || '-'}`,
        `- targets: ${X.targets.residents} residents, under ${X.targets.underCount} (-${X.targets.underShiftsTotal} shifts), over ${X.targets.overCount} (+${X.targets.overShiftsTotal}), under with enough free available days ${X.targets.underWithAvailableCapacity}`,
        `- EM Home only: errors ${X.emHomeOnly.errors} (${tab(X.emHomeOnly.errorsByRule)}), warnings ${X.emHomeOnly.warnings} (${tab(X.emHomeOnly.warningsByRule)}); targets under ${X.targetsEmHomeOnly.underCount} (-${X.targetsEmHomeOnly.underShiftsTotal}), over ${X.targetsEmHomeOnly.overCount} (+${X.targetsEmHomeOnly.overShiftsTotal}), under with free capacity ${X.targetsEmHomeOnly.underWithAvailableCapacity}`,
        `- night shape: runs ${X.nightShape.totalRuns}, isolated singles ${X.nightShape.singleIsolated}, histogram ${JSON.stringify(X.nightShape.lengthHistogram)}, residents with >=2 runs ${X.nightShape.residentsWithMultipleRuns}`,
        `- quality vector: ${JSON.stringify(X.qualityVector)}${X.qualityError ? ` (error: ${X.qualityError})` : ''}`, '');
      L.push('Under target (resident | cat pgy | assigned/target | free available days unused):');
      for (const u of X.targets.under) L.push(`- ${nameOf[u.id] || u.id} (${u.id}) | ${u.category} ${u.pgy} | ${u.assigned}/${u.target} | ${u.availableUnusedDays}`);
      L.push('');
    }
    L.push('## QGenda mapping', `- cells parsed ${entries.length}`, `- unmapped tasks: ${JSON.stringify(mapped.unmappedTasks)}`,
      `- unmatched names (became synthetic slots): ${mapped.unmatchedNames.map(n => `${n.name} x${n.count} [${n.reason}]`).join('; ')}`,
      `- last-name-only fallback matches: ${mapped.fallbackMatches.map(f => `${f.name} -> ${nameOf[f.residentId]}`).join('; ')}`,
      `- same-day conflicts: ${mapped.conflicts.length} real, ${synConflicts.length} synthetic`, '');
    L.push('## Cell diff vs chief', ...report.cellDiff.map(x => `- ${JSON.stringify(x)}`), '');
    writeFileSync(path.join(DIR, 'report.md'), L.join('\n'));

    expect(existsSync(path.join(DIR, 'report.json'))).toBe(true);
    expect(A.assignedShifts).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});
