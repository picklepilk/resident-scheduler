/** @vitest-environment jsdom */
// src/lib/optimalityGap.test.js
// Measures the JS generator's own OPTIMALITY GAP: for each of the 4 baselineSuite fixture
// variants, runs generateScheduleBest() (the real production local engine) and separately asks
// the CP-SAT "bound probe" (solver-service/solver/bound_probe.py, via `cli.py --bound-probe`)
// for the best achievable value AND a CP-SAT-PROVEN lower bound on 3 metrics, each measured in
// ISOLATION (ignoring every other soft rule): coverageMiss, underTargetCore (count of EM-core
// residents left under target), deficitCoreUnits (total EM-core shift-count shortfall).
//
// WHY this is a different question from engineHeadToHead.test.js: that file scores both engines
// through the SAME multi-objective judge and asks "which schedule is better overall". This file
// asks, per axis, "is the JS generator's own measured number on this axis STRUCTURAL (the roster
// genuinely cannot do better under the hard rules — the bound and the JS number are close) or
// LEFT ON THE TABLE by the greedy generator/repair pass (the bound is far below what JS achieved)?"
// See solver-service/solver/bound_probe.py's own module docstring for the full probe design —
// it builds a FRESH model per metric and never applies hint pinning (solve.py's own pass-1-only
// seam), so its bound is a genuine "best this roster could ever do on just this axis", not
// "best while also being good at everything else" the way the real polisher solve is.
//
// GATED on SOLVER_PARITY, same convention as engineHeadToHead.test.js/solverParity.test.js: a
// `describe.skip` when unset means `npm test` never shells out to Python.
//   PowerShell: $env:SOLVER_PARITY='1'; npx vitest run src/lib/optimalityGap.test.js
// Run this file ALONE — no other heavy suite concurrently (repo convention, see CLAUDE.md's
// baseline-file guidance: concurrent heavy workers have produced RPC timeouts/stalls before).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateScheduleBest, validateAll, buildQualityInput, buildSolverPayload, normalizeRulePriority,
} from '../ResidentScheduler.jsx';
import { computeQualityMetrics } from './scheduleQuality.js';
import { getBlockDates } from './dates.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const RUN_PARITY = process.env.SOLVER_PARITY === '1' || process.env.SOLVER_PARITY === 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOLVER_DIR = path.join(REPO_ROOT, 'solver-service');
const PYTHON = path.join(SOLVER_DIR, '.venv', 'Scripts', 'python.exe');

const VARIANTS = ['standard', 'understaffed', 'vacationHeavy', 'conferenceBlock'];
const JS_SEED = 42;
// CLAUDE.md's "probe-seconds 60" default, per task. Each variant runs 3 probes sequentially
// (solver/bound_probe.py's own coverageMiss/underTargetCore/deficitCoreUnits), so a single
// variant can take up to ~3x this before CP-SAT gives up searching further — see this file's own
// `it(...)` timeout below, sized for that worst case across all 4 variants.
const PROBE_SECONDS = 60;
// spawnSync's own per-process timeout, per task spec — generous relative to PROBE_SECONDS*3 so a
// slow machine still gets a real result rather than a truncated subprocess kill.
const SPAWN_TIMEOUT_MS = 300000;

const OUT_DIR = 'C:\\Users\\amade\\AppData\\Local\\Temp\\claude\\C--Users-amade-projects-resident-scheduler\\d2320667-24c3-4c97-ba36-1af708a9f28f\\scratchpad';
const OUT_FILE = path.join(OUT_DIR, 'optimality-gap.md');

// ─── EM-core classification, mirrors ResidentScheduler.jsx's own (non-exported) `isEmResident` —
// same category check `buildSolverPayload`'s own `isEmCore` field is built from (see that
// function's `residents.map` — `const isEmCore = isEmResident(r)`), kept as a small local copy
// rather than exported, same posture as engineHeadToHead.test.js's own local `nightRunsFor`/
// `issuesBreakdown` helpers (this file is meant to stay a self-contained, directly-runnable probe).
function isEmResidentLocal(r) {
  return r.category === 'EM_HOME' || r.category === 'EM_BAMC';
}

// JS's own "underTargetCore" / "deficitCoreUnits" equivalents of the solver's 2 core-deficit
// probes — computed straight off `report.underTarget` (already filtered by the generator itself
// to `target != null && isSchedulable(r) && assigned < target`, see ResidentScheduler.jsx's own
// comment at that assignment), narrowed here to EM-core residents the same way the solver payload
// marks `isEmCore`.
function jsCoreUnderTargetStats(report, allResidents) {
  const byId = new Map(allResidents.map(r => [r.id, r]));
  let count = 0;
  let units = 0;
  for (const u of (report.underTarget || [])) {
    const r = byId.get(u.residentId);
    if (!r || !isEmResidentLocal(r)) continue;
    count += 1;
    units += Math.max(0, (u.target ?? 0) - (u.assigned ?? 0));
  }
  return { count, units };
}

// "JS underTarget error count" per task spec: validateAll issues with rule==='underTarget' AND
// level==='error' — validateAll (ResidentScheduler.jsx ~line 4009/4033) only sets 'error' for
// isEmResident (isHardCategory) residents not covered by the conference-tolerance relaxation, so
// this is already scoped to EM-core by construction, same population as jsCoreUnderTargetStats.
function jsUnderTargetErrorCount(issues) {
  return issues.filter(i => i.rule === 'underTarget' && i.level === 'error').length;
}

function fmt(n) {
  if (n == null) return 'n/a';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function runVariant(variant) {
  // Separate makeFixture() calls per engine, same isolation posture as engineHeadToHead.test.js's
  // own runEngines() — neither generateScheduleBest nor buildSolverPayload is documented as
  // pure-on-its-args, so don't assume it here.
  const jsFixture = makeFixture(variant);
  const dates = getBlockDates(jsFixture.block.startDate, jsFixture.block.endDate);
  const rulePriority = normalizeRulePriority(jsFixture.appSettings?.rulePriority);

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

  const jsUnderTargetErrors = jsUnderTargetErrorCount(jsIssues);
  const { count: jsUnderTargetCoreCount, units: jsCoreDeficitUnits } =
    jsCoreUnderTargetStats(jsResult.report, jsFixture.allResidents);

  // ─── CP-SAT bound probe (real subprocess, warm-started from the JS engine's own winning
  // schedule — same `hint` convention as generateViaSolverOrLocal/engineHeadToHead.test.js, even
  // though bound_probe.py never hard-pins it; a good warm start only speeds up its search) ───────
  const solverFixture = makeFixture(variant);
  const payload = buildSolverPayload({ ...solverFixture, hint: jsResult.schedule });
  const dir = mkdtempSync(path.join(tmpdir(), 'optimality-gap-'));
  const inputPath = path.join(dir, 'payload.json');
  const outputPath = path.join(dir, 'result.json');
  writeFileSync(inputPath, JSON.stringify(payload), 'utf-8');

  let probes;
  const solverT0 = Date.now();
  try {
    const proc = spawnSync(
      PYTHON,
      ['cli.py', '--input', inputPath, '--output', outputPath, '--bound-probe', '--probe-seconds', String(PROBE_SECONDS)],
      { cwd: SOLVER_DIR, encoding: 'utf-8', timeout: SPAWN_TIMEOUT_MS }
    );
    if (proc.error) {
      throw new Error(`Failed to spawn solver CLI (${PYTHON}): ${proc.error.message}. Has solver-service/.venv been created?`);
    }
    if (proc.status !== 0) {
      throw new Error(`solver-service/cli.py --bound-probe exited ${proc.status}.\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
    }
    const json = JSON.parse(readFileSync(outputPath, 'utf-8'));
    probes = json.probes;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const solverWallMs = Date.now() - solverT0;

  return {
    variant, rulePriority, jsWallMs, solverWallMs,
    js: {
      metrics: jsMetrics,
      underTargetErrors: jsUnderTargetErrors,
      underTargetCoreCount: jsUnderTargetCoreCount,
      coreDeficitUnits: jsCoreDeficitUnits,
    },
    probes,
  };
}

// Builds one gap row: JS local value vs. the probe's own best-found value ("solver best") and
// CP-SAT-proven lower bound. `gap` is JS's OWN shortfall above the proven bound — the portion of
// JS's measured number that CP-SAT can prove is theoretically closeable, bound-wise, regardless
// of whether the probe itself had time to actually FIND a schedule that good (that's `solverBest`
// vs `provenBound` — a real but unclosed search gap, not a generator gap).
//
// `modelDrift`: per task spec, a proven bound STRICTLY GREATER than JS's own achieved value can
// only mean the solver and JS disagree on what's being counted (different hard-rule translation,
// different population scope, ...) — never a real "JS beat the theoretical optimum" result, since
// the probe's own fresh model is a strict relaxation of "match JS's schedule exactly" (no hint
// pinning). Flagged, never asserted on — see this file's own `it()` for why.
function gapRow(metricName, jsValue, probe) {
  const bound = probe.bound;
  const modelDrift = bound != null && bound > jsValue;
  const gap = bound != null ? jsValue - bound : null;
  const gapPct = gap != null ? (jsValue > 0 ? (100 * gap / jsValue) : 0) : null;
  return {
    metric: metricName, jsValue, solverBest: probe.value, provenBound: bound, gap, gapPct,
    modelDrift, status: probe.status, timeMs: probe.timeMs,
  };
}

function renderVariantMarkdown(res) {
  const rows = [
    gapRow('coverageMiss', res.js.metrics.coverageMiss, res.probes.coverageMiss),
    gapRow('underTargetCore (count)', res.js.underTargetCoreCount, res.probes.underTargetCore),
    gapRow('deficitCoreUnits', res.js.coreDeficitUnits, res.probes.deficitCoreUnits),
  ];

  let md = `## Variant: ${res.variant}\n\n`;
  md += `JS wall ${res.jsWallMs}ms (generateScheduleBest, 20 attempts, seed ${JS_SEED}) / `
      + `solver bound-probe wall ${res.solverWallMs}ms (3 probes x up to ${PROBE_SECONDS}s each, `
      + `spawnSync timeout ${SPAWN_TIMEOUT_MS}ms). validateAll underTarget errors (EM-core, `
      + `level='error'): ${res.js.underTargetErrors}.\n\n`;
  md += `| metric | JS local | solver best | proven bound | gap (JS - bound) | gap% |\n`;
  md += `|---|---|---|---|---|---|\n`;
  for (const r of rows) {
    const flag = r.modelDrift ? ' **MODEL DRIFT** (bound > JS value — see file header)' : '';
    md += `| ${r.metric}${flag} | ${fmt(r.jsValue)} | ${fmt(r.solverBest)} | ${fmt(r.provenBound)} `
        + `| ${fmt(r.gap)} | ${r.gapPct == null ? 'n/a' : r.gapPct.toFixed(1) + '%'} |\n`;
  }
  md += `\n(probe status/time) coverageMiss: ${res.probes.coverageMiss.status}/${res.probes.coverageMiss.timeMs}ms, `
      + `underTargetCore: ${res.probes.underTargetCore.status}/${res.probes.underTargetCore.timeMs}ms, `
      + `deficitCoreUnits: ${res.probes.deficitCoreUnits.status}/${res.probes.deficitCoreUnits.timeMs}ms.\n\n`;

  if (res.probes.coverageMiss.unfilledBySlot?.length) {
    md += `<details><summary>coverageMiss probe's own best-found unfilled slots (${res.probes.coverageMiss.unfilledBySlot.length})</summary>\n\n`;
    md += `| shiftId | dateStr | shortBy |\n|---|---|---|\n`;
    for (const u of res.probes.coverageMiss.unfilledBySlot) md += `| ${u.shiftId} | ${u.dateStr} | ${u.shortBy} |\n`;
    md += `\n</details>\n\n`;
  }

  // Per-axis JS quality metrics (task: "list per-axis JS quality metrics ... whatever
  // computeQualityMetrics returns") — every field computeQualityMetrics returns, dumped verbatim
  // rather than hand-picked, so this never silently drifts out of sync with that function's own
  // return shape.
  md += `### JS quality metrics (computeQualityMetrics) — ${res.variant}\n\n`;
  md += `| metric | value |\n|---|---|\n`;
  for (const [k, v] of Object.entries(res.js.metrics)) {
    md += `| ${k} | ${typeof v === 'number' ? fmt(v) : JSON.stringify(v)} |\n`;
  }
  md += `\n`;
  return md;
}

(RUN_PARITY ? describe : describe.skip)('optimality gap — JS local vs. CP-SAT bound probe', () => {
  it('measures coverageMiss/underTargetCore/deficitCoreUnits best-achievable + proven bound per fixture', () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const results = [];
    for (const variant of VARIANTS) {
      const res = runVariant(variant);
      results.push(res);

      // Shape-only assertions per task spec — this file is a MEASUREMENT harness, not a gate on
      // either engine's numbers. A model-drift bound (proven bound > JS value) is flagged in the
      // report, never asserted on — it means the two sides counted differently, not that either
      // side regressed.
      expect(res.probes.coverageMiss).toBeTruthy();
      expect(res.probes.underTargetCore).toBeTruthy();
      expect(res.probes.deficitCoreUnits).toBeTruthy();
      for (const name of ['coverageMiss', 'underTargetCore', 'deficitCoreUnits']) {
        const p = res.probes[name];
        expect(p.status, `${variant}/${name}`).toBeTypeOf('string');
        if (p.value != null && p.bound != null) {
          expect(p.bound, `${variant}/${name}: bound must never exceed the probe's own achieved value`)
            .toBeLessThanOrEqual(p.value);
        }
      }
    }
    expect(results.length).toBe(VARIANTS.length);

    let fullMd = `# Optimality gap report (JS generateScheduleBest vs. CP-SAT bound probe)\n\n`
      + `Same 4 fixtures as baselineSuite.js, JS seed ${JS_SEED}, probe seconds ${PROBE_SECONDS} per `
      + `metric (solver-service/solver/bound_probe.py via \`cli.py --bound-probe\`). Each probe builds `
      + `a FRESH CP-SAT model and minimizes exactly one metric in isolation (never hint-pinned) — see `
      + `that module's own docstring for why this measures something different from `
      + `engineHeadToHead.test.js's multi-objective comparison. "gap" = JS's own value minus CP-SAT's `
      + `PROVEN lower bound: the portion of JS's measured shortfall that is NOT structurally required `
      + `by the hard rules/roster, i.e. headroom the greedy generator (or its repair pass) could in `
      + `principle still close. A small gap means the JS number is close to structurally unavoidable; `
      + `a large gap means real room is being left on the table.\n\n`;

    for (const res of results) fullMd += renderVariantMarkdown(res);

    writeFileSync(OUT_FILE, fullMd, 'utf-8');
    // eslint-disable-next-line no-console
    console.log(fullMd);
    // eslint-disable-next-line no-console
    console.log(`\n[optimalityGap] wrote ${OUT_FILE}`);
  }, 1500000);
});
