/** @vitest-environment jsdom */
// src/lib/chiefBenchmark.solver.test.js
// Solver-side counterpart of chiefBenchmark.test.js's "generator vs benchmark" section — runs the
// SAME chiefBenchmark fixture (chief's own hand-built 2026-07-27..2026-08-23 block, anonymized;
// see src/lib/__fixtures__/chiefBenchmark.json's `_committedFixtureNotes`) through the real CP-SAT
// solver-service instead of the JS generator, exactly the way src/lib/solverParity.test.js runs
// the syntheticRoster 'standard' fixture through it — see that file's own header comment for why
// this shells out to a real Python subprocess rather than mocking the solver.
//
// GATED on SOLVER_PARITY, same convention as solverParity.test.js: a `describe.skip` when unset
// means `npm test` is completely unaffected by this file (no Python subprocess, no dependency on
// solver-service/.venv existing). Run directly with:
//   SOLVER_PARITY=1 npx vitest run src/lib/chiefBenchmark.solver.test.js   (bash)
//   $env:SOLVER_PARITY=1; npx vitest run src/lib/chiefBenchmark.solver.test.js   (PowerShell)
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSolverPayload, mapSolverResult, validateAll, offServiceWindowTargetDelta } from '../ResidentScheduler.jsx';
import { getBlockDates } from './dates.js';
import { isNightShiftId } from './shifts.js';
import chiefFixture from './__fixtures__/chiefBenchmark.json';

const RUN_PARITY = process.env.SOLVER_PARITY === '1' || process.env.SOLVER_PARITY === 'true';

// Same "structural vs under-target" split solverParity.test.js/generator.harness.test.js both use
// — an "Under target: " error is an expected property of a small single-block fixture solved from
// scratch with no repair-equivalent pass, not a parity failure. Any OTHER hard error is real.
function structuralErrorCount(issues) {
  return issues.filter(i => i.level === 'error' && !i.message.startsWith('Under target')).length;
}

// Mirrors ResidentScheduler.jsx's own `allResidents` useMemo — see chiefBenchmark.test.js's own
// copy of this helper for the full rationale (kept duplicated rather than shared/exported: this
// file must stay a self-contained, directly-runnable SOLVER_PARITY probe, same posture as
// solverParity.test.js itself).
function buildAllResidents({ emRoster, emBlockAssignments, offServiceResidents, block, blocksHistory = [] }) {
  const em = emRoster.map(r => ({
    ...r,
    blockType: emBlockAssignments?.[r.id]?.blockType ?? 'EM',
    isChief: !!(emBlockAssignments?.[r.id]?.isChief),
    targetDelta: emBlockAssignments?.[r.id]?.targetDelta,
    targetNote: emBlockAssignments?.[r.id]?.targetNote,
    targetIsBuyDown: !!(emBlockAssignments?.[r.id]?.targetIsBuyDown),
  }));
  const off = (offServiceResidents || []).map(r => {
    const windowDelta = offServiceWindowTargetDelta(r, block, blocksHistory);
    if (windowDelta == null) return r;
    const chiefDelta = Number(r.targetDelta) || 0;
    return { ...r, targetDelta: chiefDelta + windowDelta };
  });
  return [...em, ...off];
}

function nightRunsFor(schedule, allResidents, dates) {
  const runs = [];
  for (const r of allResidents) {
    const rs = schedule[r.id] || {};
    let i = 0;
    while (i < dates.length) {
      if (!isNightShiftId(rs[dates[i]])) { i++; continue; }
      let j = i;
      while (j + 1 < dates.length && isNightShiftId(rs[dates[j + 1]])) j++;
      runs.push({ rs, start: i, end: j, len: j - i + 1 });
      i = j + 1;
    }
  }
  return runs;
}

function traumaCountInRun(rs, run, dates) {
  let n = 0;
  for (let i = run.start; i <= run.end; i++) if (rs[dates[i]] === 'TRAUMA-N') n++;
  return n;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOLVER_DIR = path.join(REPO_ROOT, 'solver-service');
// Windows-only dev environment (see CLAUDE.md) — same path solverParity.test.js uses.
const PYTHON = path.join(SOLVER_DIR, '.venv', 'Scripts', 'python.exe');

(RUN_PARITY ? describe : describe.skip)('chief benchmark — solver parity (real CP-SAT subprocess)', () => {
  it('solves the chief benchmark fixture with zero structural errors and no >2-trauma-per-run night run', () => {
    const allResidents = buildAllResidents({
      emRoster: chiefFixture.emRoster,
      emBlockAssignments: chiefFixture.emBlockAssignments,
      offServiceResidents: chiefFixture.offServiceResidents,
      block: chiefFixture.block,
    });
    const block = { ...chiefFixture.block, schedule: {} };
    const fixtureArgs = {
      allResidents, block,
      coverage: {}, eligOverrides: {}, appSettings: {}, dayRules: {}, blocksHistory: [], ayConf: {},
    };
    const payload = buildSolverPayload(fixtureArgs);

    const dir = mkdtempSync(path.join(tmpdir(), 'chief-benchmark-solver-'));
    const inputPath = path.join(dir, 'payload.json');
    const outputPath = path.join(dir, 'result.json');
    writeFileSync(inputPath, JSON.stringify(payload), 'utf-8');

    try {
      const proc = spawnSync(PYTHON, ['cli.py', '--input', inputPath, '--output', outputPath], {
        cwd: SOLVER_DIR,
        encoding: 'utf-8',
        timeout: 120000,
      });

      if (proc.error) {
        throw new Error(`Failed to spawn solver CLI (${PYTHON}): ${proc.error.message}. Has solver-service/.venv been created? See solver-service/README.md.`);
      }
      if (proc.status !== 0 && proc.status !== 1) {
        throw new Error(`solver-service/cli.py exited ${proc.status}.\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
      }

      const json = JSON.parse(readFileSync(outputPath, 'utf-8'));
      expect(['OPTIMAL', 'FEASIBLE', 'RELAXED']).toContain(json.status);

      const res = mapSolverResult(json, { block });
      const issues = validateAll(
        allResidents, res.schedule, block, {}, {}, {}, {}, [], {}
      );
      const structural = issues.filter(i => i.level === 'error' && !i.message.startsWith('Under target'));
      if (structural.length) {
        // eslint-disable-next-line no-console
        console.error('Structural validateAll errors on solver output:', structural.slice(0, 10));
      }
      expect(structuralErrorCount(issues)).toBe(0);

      // Trauma-run zero-tolerance check (hard rule, both engines — CLAUDE.md/plan section A):
      // no night run may carry more than 2 TRAUMA-N placements.
      const dates = getBlockDates(block.startDate, block.endDate);
      const runs = nightRunsFor(res.schedule, allResidents, dates);
      for (const run of runs) {
        expect(traumaCountInRun(run.rs, run, dates)).toBeLessThanOrEqual(2);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});
