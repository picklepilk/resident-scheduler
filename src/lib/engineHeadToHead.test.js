/** @vitest-environment jsdom */
// src/lib/engineHeadToHead.test.js
// Runs both engines (JS generateScheduleBest vs the real CP-SAT solver-service subprocess,
// WARM-STARTED from the JS engine's own winning schedule — R9, 2026-09-27, "CP-SAT as a reliable
// polisher" — see PAYLOAD_SCHEMA.md's dated R9 section) on the SAME four baselineSuite fixture
// variants, grades both outputs with the SAME JS judge (validateAll + scheduleQuality's
// computeQualityMetrics/computeQualityVector/betterQuality), and writes a per-variant markdown
// comparison table. Most of this file is still measurement-only (rule-id drift, individual quality
// metrics) — but the betterQuality ladder section per variant IS now a regression gate (R9 part 4):
// the warm-started solver's RAW result must never be strictly worse than local under the exact
// (errorCount, blockingWarnCount, qualityVector) ladder generateViaSolverOrLocal's own
// pickEngineResult arbitrates with. Purpose otherwise unchanged: surface (a) validateAll rule ids
// the solver's output trips that the JS engine's never does (candidate solver model drift — a rule
// the CP-SAT formulation doesn't encode), and (b) any other quality-vector or report-shape metric
// where one engine measurably beats the other.
//
// GATED on SOLVER_PARITY, same convention as solverParity.test.js / chiefBenchmark.solver.test.js:
// a `describe.skip` when unset means `npm test` never shells out to Python.
//   PowerShell: $env:SOLVER_PARITY='1'; npx vitest run src/lib/engineHeadToHead.test.js
// Run this file ALONE — no other heavy suite concurrently (repo convention, see CLAUDE.md's
// baseline-file guidance: concurrent heavy workers have produced RPC timeouts/stalls before).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateScheduleBest, validateAll, buildQualityInput, buildSolverPayload, mapSolverResult,
  normalizeRulePriority, pickEngineResult,
} from '../ResidentScheduler.jsx';
import { computeQualityMetrics, computeQualityVector, betterQuality } from './scheduleQuality.js';
import { getBlockDates } from './dates.js';
import { isNightShiftId } from './shifts.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const RUN_PARITY = process.env.SOLVER_PARITY === '1' || process.env.SOLVER_PARITY === 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOLVER_DIR = path.join(REPO_ROOT, 'solver-service');
const PYTHON = path.join(SOLVER_DIR, '.venv', 'Scripts', 'python.exe');

const VARIANTS = ['standard', 'understaffed', 'vacationHeavy', 'conferenceBlock'];
const JS_SEED = 42;

const OUT_DIR = 'C:\\Users\\amade\\AppData\\Local\\Temp\\claude\\C--Users-amade-projects-resident-scheduler\\18a7a3f0-e532-4783-a36c-86f1defe4d1b\\scratchpad';
const OUT_FILE = path.join(OUT_DIR, 'head-to-head.md');

// ─── shared helpers (mirrors chiefBenchmark.test.js's own copies — kept local, see that file's
// own header on why these small pure functions are duplicated rather than exported/shared) ──────
function nightRunsFor(schedule, allResidents, dates) {
  const runs = [];
  for (const r of allResidents) {
    const rs = schedule[r.id] || {};
    let i = 0;
    while (i < dates.length) {
      if (!isNightShiftId(rs[dates[i]])) { i++; continue; }
      let j = i;
      while (j + 1 < dates.length && isNightShiftId(rs[dates[j + 1]])) j++;
      runs.push({ start: i, end: j, len: j - i + 1 });
      i = j + 1;
    }
  }
  return runs;
}

// Issues without a `rule` id (most validateAll issues are message-only — see CLAUDE.md, only a
// handful of rules like 'underTarget' carry a real `rule` field) differ only by specific
// date/count, which would otherwise make every distinct date its own "rule" row. Strip
// parenthetical date clauses and collapse digits so "Below minimum staffing: 0/1 on FLEX Day (Mon
// 7/13)" and "...(Tue 7/14)" collapse to one comparable category, while still keeping shift-area
// distinctions ("... on FLEX Day" vs "... on POD Night") intact.
function normalizeMessage(msg) {
  return (msg || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function issuesBreakdown(issues) {
  const byLevel = {};
  const byRule = {};
  for (const i of issues) {
    byLevel[i.level] = (byLevel[i.level] || 0) + 1;
    const key = i.rule || `msg:${normalizeMessage(i.message)}`;
    byRule[key] = (byRule[key] || 0) + 1;
  }
  return { byLevel, byRule, total: issues.length };
}

function underTargetShortfall(report) {
  const list = report?.underTarget || [];
  return list.reduce((sum, u) => sum + Math.max(0, (u.target ?? 0) - (u.assigned ?? 0)), 0);
}

function fmtVec(v) {
  return v.map(n => (Number.isInteger(n) ? n : n.toFixed(2))).join(', ');
}

function ruleTableRows(jsByRule, solverByRule) {
  const keys = new Set([...Object.keys(jsByRule), ...Object.keys(solverByRule)]);
  return [...keys].sort().map(k => ({
    rule: k,
    js: jsByRule[k] || 0,
    solver: solverByRule[k] || 0,
  }));
}

function runEngines(variant) {
  // Separate makeFixture() calls per engine — full isolation, no risk of one engine's call
  // mutating shared state the other reads (neither generateScheduleBest nor buildSolverPayload is
  // documented as pure-on-its-args, so don't assume it here).
  const jsFixture = makeFixture(variant);
  const dates = getBlockDates(jsFixture.block.startDate, jsFixture.block.endDate);
  const rulePriority = normalizeRulePriority(jsFixture.appSettings?.rulePriority);

  // ─── JS engine ────────────────────────────────────────────────────────────────────────────
  const jsT0 = Date.now();
  const jsResult = generateScheduleBest({ ...jsFixture }, { attempts: 20, baseSeed: JS_SEED });
  const jsWallMs = Date.now() - jsT0;
  const jsIssues = validateAll(
    jsFixture.allResidents, jsResult.schedule, jsFixture.block, jsFixture.eligOverrides,
    jsFixture.appSettings, jsFixture.dayRules, jsFixture.coverage, jsFixture.blocksHistory, jsFixture.ayConf
  );
  const jsQInput = buildQualityInput({
    schedule: jsResult.schedule, report: jsResult.report, allResidents: jsFixture.allResidents,
    block: jsFixture.block, appSettings: jsFixture.appSettings, eligOverrides: jsFixture.eligOverrides,
    blocksHistory: jsFixture.blocksHistory, ayConf: jsFixture.ayConf,
  });
  const jsMetrics = computeQualityMetrics({
    ...jsQInput, dates, coverage: jsFixture.coverage,
    seniorGapCount: jsResult.report.seniorGaps.length,
    restCompromiseCount: jsResult.report.restCompromises.length,
  });
  const jsVector = computeQualityVector(jsMetrics, rulePriority);
  const jsRuns = nightRunsFor(jsResult.schedule, jsFixture.allResidents, dates);

  // ─── solver engine (real CP-SAT subprocess, same invocation as solverParity.test.js) ────────
  // R9 (2026-09-27, CP-SAT-as-polisher): WARM-STARTED from the JS engine's own winning schedule
  // (`hint`, PAYLOAD_SCHEMA.md's dated R9 section) — this is the same warm-start
  // `generateViaSolverOrLocal` now always performs in the app, so this harness measures the actual
  // production pipeline (local first, solver polishes) rather than a cold from-scratch solve.
  const solverFixture = makeFixture(variant);
  const payload = buildSolverPayload({ ...solverFixture, hint: jsResult.schedule });
  const dir = mkdtempSync(path.join(tmpdir(), 'engine-h2h-'));
  const inputPath = path.join(dir, 'payload.json');
  const outputPath = path.join(dir, 'result.json');
  writeFileSync(inputPath, JSON.stringify(payload), 'utf-8');

  let solverStatus, solverSchedule, solverReport, solverWallMs, hintPinning;
  try {
    const solverT0 = Date.now();
    const proc = spawnSync(PYTHON, ['cli.py', '--input', inputPath, '--output', outputPath], {
      cwd: SOLVER_DIR, encoding: 'utf-8', timeout: 120000,
    });
    solverWallMs = Date.now() - solverT0;
    if (proc.error) {
      throw new Error(`Failed to spawn solver CLI (${PYTHON}): ${proc.error.message}. Has solver-service/.venv been created?`);
    }
    if (proc.status !== 0 && proc.status !== 1) {
      throw new Error(`solver-service/cli.py exited ${proc.status}.\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
    }
    const json = JSON.parse(readFileSync(outputPath, 'utf-8'));
    solverStatus = json.status;
    // R9 "pin to hint" (solver/model/hint_pin.py) diagnostics — `mapSolverResult` never threads
    // this through to `solverReport` (it's an internal solver diagnostic, not app-facing report
    // shape), so it's read here, straight off the raw CLI JSON, for the coverage-pin regression
    // check below.
    hintPinning = json?.report?.hintPinning || { applied: false, hintFeasible: null, pinned: {} };
    const mapped = mapSolverResult(json, { block: solverFixture.block, allResidents: solverFixture.allResidents });
    solverSchedule = mapped.schedule;
    solverReport = mapped.report;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const solverIssues = validateAll(
    solverFixture.allResidents, solverSchedule, solverFixture.block, solverFixture.eligOverrides,
    solverFixture.appSettings, solverFixture.dayRules, solverFixture.coverage, solverFixture.blocksHistory, solverFixture.ayConf
  );
  const solverQInput = buildQualityInput({
    schedule: solverSchedule, report: solverReport, allResidents: solverFixture.allResidents,
    block: solverFixture.block, appSettings: solverFixture.appSettings, eligOverrides: solverFixture.eligOverrides,
    blocksHistory: solverFixture.blocksHistory, ayConf: solverFixture.ayConf,
  });
  const solverMetrics = computeQualityMetrics({
    ...solverQInput, dates, coverage: solverFixture.coverage,
    seniorGapCount: solverReport.seniorGaps.length,
    restCompromiseCount: solverReport.restCompromises.length,
  });
  const solverVector = computeQualityVector(solverMetrics, rulePriority);
  const solverRuns = nightRunsFor(solverSchedule, solverFixture.allResidents, dates);

  // R9 "pin to hint" coverage-mapping regression check (task: "warm-started CP-SAT with hint
  // pinning ... still sometimes loses to local on vacationHeavy ... coverageMiss 139 (local) vs
  // 142 (solver)"). `hint_pin.py` hard-pins the solver's raw `coverageMin` slack sum (its own
  // internal accounting, `report.unfilled`'s shortBy total) to at most the hint's own achieved
  // value — this assertion is the OTHER HALF of that promise: that JS's own independent
  // `coverageMiss` recompute on the FINAL MAPPED schedule (this exact `solverMetrics.coverageMiss`
  // — `computeQualityMetrics`'s `n0`-tier count) never regresses past what the pin allowed either.
  // Diagnosed by hand (throwaway script, 10 real CLI solves + 3 full engineHeadToHead runs on the
  // `vacationHeavy` fixture, 2026-09-27): `report.unfilled`'s shortBy sum and this recomputed
  // `coverageMiss` were IDENTICAL in every single run — no mapping gap was ever found between the
  // solver's pinned expression and JS's own metric. This assertion turns that finding into a
  // permanent regression guard rather than a one-off diagnostic conclusion.
  if (hintPinning.applied) {
    const pinnedCoverageMin = hintPinning.pinned.coverageMin;
    expect(
      solverMetrics.coverageMiss,
      `"${variant}": solver's coverageMiss (${solverMetrics.coverageMiss}) exceeds the hint_pin.py ` +
      `hard pin (coverageMin <= ${pinnedCoverageMin}) — a genuine coverage-mapping gap between the ` +
      `solver's pinned expression and JS's own coverageMiss metric, not just staged-solve search noise.`
    ).toBeLessThanOrEqual(pinnedCoverageMin);
  }

  // R9 proof (part 4 of the CP-SAT-as-polisher plan): score both results through the EXACT SAME
  // ladder generateViaSolverOrLocal itself arbitrates with (pickEngineResult ->
  // scoreGenerationResult -> betterQuality), scored against `jsFixture` (both results are the same
  // dates/residents/coverage as `solverFixture` by construction — makeFixture(variant) is
  // deterministic per variant). This is the RAW solver result, not gated by pickEngineResult's own
  // policy decision (a caller might still want to know how the raw solve compares even where
  // pickEngineResult would keep local on a tie).
  const { engineComparison } = pickEngineResult(
    { schedule: solverSchedule, report: solverReport },
    { schedule: jsResult.schedule, report: jsResult.report },
    jsFixture
  );
  const solverStrictlyBetter = betterQuality(engineComparison.solver, engineComparison.local);
  const solverStrictlyWorse = betterQuality(engineComparison.local, engineComparison.solver);
  const outcome = solverStrictlyBetter ? 'win' : (solverStrictlyWorse ? 'loss' : 'tie');

  return {
    variant, rulePriority,
    js: {
      wallMs: jsWallMs, issues: jsIssues, report: jsResult.report, metrics: jsMetrics,
      vector: jsVector, runs: jsRuns,
    },
    solver: {
      wallMs: solverWallMs, status: solverStatus, issues: solverIssues, report: solverReport,
      metrics: solverMetrics, vector: solverVector, runs: solverRuns, hintPinning,
    },
    comparison: { local: engineComparison.local, solver: engineComparison.solver, outcome },
  };
}

function renderVariantMarkdown(res) {
  const jsB = issuesBreakdown(res.js.issues);
  const solverB = issuesBreakdown(res.solver.issues);
  const jsIsolated = res.js.runs.filter(r => r.len === 1).length;
  const solverIsolated = res.solver.runs.filter(r => r.len === 1).length;
  const jsMaxRun = Math.max(0, ...res.js.runs.map(r => r.len));
  const solverMaxRun = Math.max(0, ...res.solver.runs.map(r => r.len));

  let md = `## Variant: ${res.variant}\n\n`;
  md += `Rule priority order (vector slots n0/n1/n2): ${res.rulePriority.join(', ')}\n\n`;
  md += `| Metric | JS (generateScheduleBest) | Solver (CP-SAT) |\n`;
  md += `|---|---|---|\n`;
  md += `| solver status | n/a | ${res.solver.status} |\n`;
  md += `| hintPinning (applied/hintFeasible/pinned.coverageMin) | n/a | ${res.solver.hintPinning.applied}/${res.solver.hintPinning.hintFeasible}/${res.solver.hintPinning.pinned?.coverageMin ?? 'n/a'} |\n`;
  md += `| wall time (ms) | ${res.js.wallMs} | ${res.solver.wallMs} |\n`;
  md += `| validateAll errors | ${jsB.byLevel.error || 0} | ${solverB.byLevel.error || 0} |\n`;
  md += `| validateAll warnings | ${jsB.byLevel.warn || 0} | ${solverB.byLevel.warn || 0} |\n`;
  md += `| validateAll total issues | ${jsB.total} | ${solverB.total} |\n`;
  md += `| quality vector [n0,n1,n2,shape] | [${fmtVec(res.js.vector)}] | [${fmtVec(res.solver.vector)}] |\n`;
  md += `| coverageMiss | ${res.js.metrics.coverageMiss} | ${res.solver.metrics.coverageMiss} |\n`;
  md += `| seniorGaps (report-level) | ${res.js.report.seniorGaps.length} | ${res.solver.report.seniorGaps.length} |\n`;
  md += `| restCompromises (report-level) | ${res.js.report.restCompromises.length} | ${res.solver.report.restCompromises.length} |\n`;
  md += `| unfilled slots | ${res.js.report.unfilled.length} | ${res.solver.report.unfilled.length} |\n`;
  md += `| underTarget residents | ${res.js.report.underTarget.length} | ${res.solver.report.underTarget.length} |\n`;
  md += `| underTarget total shortfall | ${underTargetShortfall(res.js.report)} | ${underTargetShortfall(res.solver.report)} |\n`;
  md += `| overstaffed placements | ${(res.js.report.overstaffed || []).length} | ${(res.solver.report.overstaffed || []).length} |\n`;
  md += `| deficitSpread | ${res.js.metrics.deficitSpread.toFixed(2)} | ${res.solver.metrics.deficitSpread.toFixed(2)} |\n`;
  md += `| nightSpread | ${res.js.metrics.nightSpread.toFixed(2)} | ${res.solver.metrics.nightSpread.toFixed(2)} |\n`;
  md += `| weekendSpread | ${res.js.metrics.weekendSpread.toFixed(2)} | ${res.solver.metrics.weekendSpread.toFixed(2)} |\n`;
  md += `| areaSpread | ${res.js.metrics.areaSpread.toFixed(2)} | ${res.solver.metrics.areaSpread.toFixed(2)} |\n`;
  md += `| nightShapePenalty | ${res.js.metrics.nightShapePenalty.toFixed(2)} | ${res.solver.metrics.nightShapePenalty.toFixed(2)} |\n`;
  md += `| workShapePenalty | ${res.js.metrics.workShapePenalty.toFixed(2)} | ${res.solver.metrics.workShapePenalty.toFixed(2)} |\n`;
  md += `| traumaRunPenalty | ${res.js.metrics.traumaRunPenalty.toFixed(2)} | ${res.solver.metrics.traumaRunPenalty.toFixed(2)} |\n`;
  md += `| secondRestDayPenalty | ${res.js.metrics.secondRestDayPenalty.toFixed(2)} | ${res.solver.metrics.secondRestDayPenalty.toFixed(2)} |\n`;
  md += `| night runs total | ${res.js.runs.length} | ${res.solver.runs.length} |\n`;
  md += `| isolated single-night runs | ${jsIsolated} | ${solverIsolated} |\n`;
  md += `| max night run length | ${jsMaxRun} | ${solverMaxRun} |\n`;
  md += `\n### validateAll issues by rule id — ${res.variant}\n\n`;
  md += `| rule | JS count | solver count |\n|---|---|---|\n`;
  for (const row of ruleTableRows(jsB.byRule, solverB.byRule)) {
    md += `| ${row.rule} | ${row.js} | ${row.solver} |\n`;
  }
  md += `\n`;

  // R9 proof (part 4): the SAME betterQuality ladder generateViaSolverOrLocal itself arbitrates
  // with — see runEngines()'s own comment for exactly what `comparison` scores.
  const c = res.comparison;
  md += `### betterQuality ladder (warm-started solver vs. local) — ${res.variant}\n\n`;
  md += `| | errorCount | blockingWarnCount | qualityVector [n0,n1,n2,shape] |\n|---|---|---|---|\n`;
  md += `| local | ${c.local.errorCount} | ${c.local.blockingWarnCount} | [${fmtVec(c.local.qualityVector)}] |\n`;
  md += `| solver (warm-started) | ${c.solver.errorCount} | ${c.solver.blockingWarnCount} | [${fmtVec(c.solver.qualityVector)}] |\n`;
  md += `\n**Outcome: solver ${c.outcome === 'win' ? 'WINS' : c.outcome === 'loss' ? 'LOSES' : 'TIES'} vs. local** (never-worse check: ${c.outcome !== 'loss' ? 'PASS' : 'FAIL'})\n\n`;
  return md;
}

// Deliberately ONE `it()` looping over all 4 variants, not 4 separate `it()`s: this file's own
// authoring found that splitting per-variant trips vitest's worker pool into restarting the
// worker mid-run on the long (~30-40s) synchronous `spawnSync` solver calls, which corrupts
// shared module state between tests (observed: a later variant's temp dir goes missing). Kept as
// one test — same "long synchronous work" contention class CLAUDE.md documents for the
// baseline-suite files. A benign `[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled-error
// notice AFTER this test has already reported passed is an infra artifact of that same class, not
// a real failure — the run still completes and every result below is correct; don't chase it.
(RUN_PARITY ? describe : describe.skip)('engine head-to-head — same JS judge, both engines', () => {
  it('runs both engines on all four baselineSuite variants and writes a comparison table', () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const results = [];
    for (const variant of VARIANTS) {
      const res = runEngines(variant);
      results.push(res);

      // Measurement only — assert both engines actually ran and produced a gradeable result.
      // The R9 never-worse check (part 4) is asserted AFTER the markdown table below is written —
      // see that block's own comment for why (diagnostics must survive a failing assertion).
      expect(['OPTIMAL', 'FEASIBLE', 'RELAXED']).toContain(res.solver.status);
      expect(res.js.issues).toBeInstanceOf(Array);
      expect(res.solver.issues).toBeInstanceOf(Array);
      expect(Array.isArray(res.js.report.underTarget)).toBe(true);
    }
    expect(results.length).toBe(VARIANTS.length);

    let fullMd = `# Engine head-to-head (JS generateScheduleBest vs CP-SAT solver-service, R9 warm-started)\n\n` +
      `Same 4 fixtures as baselineSuite.js, JS seed ${JS_SEED}, graded by the same validateAll + ` +
      `scheduleQuality judge. The per-variant "betterQuality ladder" section IS a regression gate ` +
      `(see the \`expect(...).not.toBe('loss')\` above); everything else here is measurement only.\n\n`;

    // R9 proof (part 4): win/tie/loss + timing rollup, printed BEFORE the per-variant detail so
    // it's visible without scrolling past 4 full tables.
    const wins = results.filter(r => r.comparison.outcome === 'win').length;
    const ties = results.filter(r => r.comparison.outcome === 'tie').length;
    const losses = results.filter(r => r.comparison.outcome === 'loss').length;
    fullMd += `## Win/tie/loss summary (warm-started solver vs. local, betterQuality)\n\n`;
    fullMd += `**${wins} win / ${ties} tie / ${losses} loss** across ${results.length} fixtures.\n\n`;
    fullMd += `| variant | outcome | local wall (ms) | solver wall (ms) |\n|---|---|---|---|\n`;
    for (const res of results) {
      fullMd += `| ${res.variant} | ${res.comparison.outcome} | ${res.js.wallMs} | ${res.solver.wallMs} |\n`;
    }
    fullMd += `\n`;

    for (const res of results) fullMd += renderVariantMarkdown(res);

    // Cross-variant rollup: rule ids where ONE engine ever produces the issue and the other NEVER
    // does, across all 4 variants combined — the (a)/(b)/(c) candidate list from the task.
    const jsRuleTotals = {};
    const solverRuleTotals = {};
    for (const res of results) {
      const jsB = issuesBreakdown(res.js.issues);
      const solverB = issuesBreakdown(res.solver.issues);
      for (const [k, v] of Object.entries(jsB.byRule)) jsRuleTotals[k] = (jsRuleTotals[k] || 0) + v;
      for (const [k, v] of Object.entries(solverB.byRule)) solverRuleTotals[k] = (solverRuleTotals[k] || 0) + v;
    }
    fullMd += `## Cross-variant rollup — validateAll rule ids by engine\n\n`;
    fullMd += `| rule | JS total | solver total |\n|---|---|---|\n`;
    for (const row of ruleTableRows(jsRuleTotals, solverRuleTotals)) {
      fullMd += `| ${row.rule} | ${row.js} | ${row.solver} |\n`;
    }
    const solverOnly = ruleTableRows(jsRuleTotals, solverRuleTotals).filter(r => r.js === 0 && r.solver > 0);
    const jsOnly = ruleTableRows(jsRuleTotals, solverRuleTotals).filter(r => r.solver === 0 && r.js > 0);
    fullMd += `\n### Solver-only rule ids (candidate solver-model drift)\n\n`;
    fullMd += solverOnly.length
      ? solverOnly.map(r => `- ${r.rule}: ${r.solver}`).join('\n') + '\n'
      : '(none)\n';
    fullMd += `\n### JS-only rule ids\n\n`;
    fullMd += jsOnly.length
      ? jsOnly.map(r => `- ${r.rule}: ${r.js}`).join('\n') + '\n'
      : '(none)\n';

    writeFileSync(OUT_FILE, fullMd, 'utf-8');
    // eslint-disable-next-line no-console
    console.log(fullMd);
    // eslint-disable-next-line no-console
    console.log(`\n[engineHeadToHead] wrote ${OUT_FILE}`);
    // eslint-disable-next-line no-console
    console.log('Solver-only rule ids:', solverOnly.map(r => r.rule));
    // eslint-disable-next-line no-console
    console.log('JS-only rule ids:', jsOnly.map(r => r.rule));
    // eslint-disable-next-line no-console
    console.log(`R9 win/tie/loss (warm-started solver vs. local): ${wins}W/${ties}T/${losses}L —`,
      results.map(r => `${r.variant}=${r.comparison.outcome}`).join(', '));

    // R9 proof (part 4 of the CP-SAT-as-polisher plan, NOT measurement-only), asserted here —
    // AFTER the full table above is already written to OUT_FILE and console, so a failure still
    // leaves the diagnostic table behind instead of aborting mid-loop with nothing to inspect. The
    // warm-started solver must never be STRICTLY WORSE than the local engine under betterQuality's
    // own lexicographic ladder (errorCount, blockingWarnCount, qualityVector) — a tie or a solver
    // win both pass. If this fails, the fix belongs in the objective-tier mapping (see
    // docs/PAYLOAD_SCHEMA.md's dated R9 section), not in loosening this assertion.
    //
    // KNOWN_GAP: previously `{'vacationHeavy'}` — REMOVED 2026-09-28 ("never fall to pass 2 when the
    // warm-start hint is feasible" task). Every prior loss recorded in this doc's history for
    // vacationHeavy/standard/conferenceBlock (see PAYLOAD_SCHEMA.md's "Coverage-mapping
    // investigation, part 3" and earlier sections) traced to the SAME two root causes, both now
    // fixed on this branch: (1) ec74598 made pass 2 unable to relax ACGME-hard duty-hour families,
    // which turned a pre-existing bug — pass 1's staged solve reporting a merely-timed-out `UNKNOWN`
    // stage as outward `INFEASIBLE` and escalating to pass 2 even when `evaluate_hint` had already
    // proven a feasible witness existed — into occasional `RELAXED`-status losses instead of the
    // quieter `TIER_QUALITY`-only noise seen before; (2) this task's fix (`solve.py`'s
    // `_solve_staged` now falls back to `evaluate_hint`'s own already-solved clone instead of
    // escalating) closes that gap, so pass 2 no longer fires at all when the hint is feasible. 3
    // sequential full runs after the fix (`SOLVER_PARITY=1`, one at a time, 2026-09-28): every
    // fixture WON or TIED every run, zero losses, zero `RELAXED` statuses observed — see
    // PAYLOAD_SCHEMA.md's dated section for the exact per-run table. Re-add a fixture here (with a
    // fresh diagnosis) if a real regression resurfaces — don't silently re-widen this on a flaky run.
    const KNOWN_GAP_VARIANTS = new Set();
    for (const res of results) {
      if (KNOWN_GAP_VARIANTS.has(res.variant)) continue;
      expect(res.comparison.outcome, `solver lost to local on the "${res.variant}" fixture — see ${OUT_FILE}`).not.toBe('loss');
    }
  }, 600000);
});
