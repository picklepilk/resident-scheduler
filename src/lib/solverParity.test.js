/** @vitest-environment jsdom */
// src/lib/solverParity.test.js
// End-to-end parity check between the JS-side solver seams (buildSolverPayload/mapSolverResult
// in ResidentScheduler.jsx, see solver-service/docs/PAYLOAD_SCHEMA.md) and the actual CP-SAT
// solver-service running as a real Python subprocess — not a mock. Answers a question the unit
// tests in solverPayload.test.js can't: does a real solve, on a real payload this app builds,
// come back as a schedule the app's own validateAll() accepts?
//
// GATED on SOLVER_PARITY: a `describe.skip` when unset means `npm test` is completely unaffected
// (no Python subprocess, no dependency on solver-service/.venv existing) — this only runs when
// explicitly asked for. See solver-service/README.md for how to run it.
//
// Requires solver-service/.venv (created via the solver-service README's local-dev setup) — this
// test does NOT create or provision that venv, it only shells out to the python.exe already in
// it, same posture as any other "requires local toolchain" integration test.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSolverPayload, mapSolverResult, validateAll } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const RUN_PARITY = process.env.SOLVER_PARITY === '1' || process.env.SOLVER_PARITY === 'true';

// Same "structural vs under-target" split generator.harness.test.js uses (see that file's own
// header comment on why): these small synthetic fixtures aren't guaranteed to have enough
// coverage headroom for every resident to reach their own target from a single non-optimal solve
// with no repair pass, so an "Under target: " error is an expected fixture property, not a
// parity failure. Any OTHER hard error (ineligible shift, composition, rest/circadian, coverage,
// senior composition, etc.) is a real regression — either in buildSolverPayload's resolved
// inputs, mapSolverResult's reshaping, or the solver itself.
function structuralErrorCount(issues) {
  return issues.filter(i => i.level === 'error' && !i.message.startsWith('Under target')).length;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOLVER_DIR = path.join(REPO_ROOT, 'solver-service');
// Windows-only dev environment (see CLAUDE.md) — .venv/Scripts/python.exe is the Windows venv
// layout (POSIX venvs use bin/python instead). Not resolved dynamically since this repo's own
// solver-service README documents the Windows path as the supported local-dev setup.
const PYTHON = path.join(SOLVER_DIR, '.venv', 'Scripts', 'python.exe');

(RUN_PARITY ? describe : describe.skip)('solver parity — real CP-SAT subprocess vs JS validateAll', () => {
  it('a real solve on a real payload produces a schedule with zero structural validateAll errors', () => {
    const fixture = makeFixture('standard');
    const payload = buildSolverPayload(fixture);

    const dir = mkdtempSync(path.join(tmpdir(), 'solver-parity-'));
    const inputPath = path.join(dir, 'payload.json');
    const outputPath = path.join(dir, 'result.json');
    writeFileSync(inputPath, JSON.stringify(payload), 'utf-8');

    try {
      const proc = spawnSync(PYTHON, ['cli.py', '--input', inputPath, '--output', outputPath], {
        cwd: SOLVER_DIR,
        encoding: 'utf-8',
        timeout: 120000,
      });

      // A non-zero/1 exit is expected for a genuinely INFEASIBLE solve (cli.py's own contract —
      // see its main()); anything else (missing venv, crash, timeout) should fail loudly with the
      // actual stderr rather than a confusing downstream JSON-parse error.
      if (proc.error) {
        throw new Error(`Failed to spawn solver CLI (${PYTHON}): ${proc.error.message}. Has solver-service/.venv been created? See solver-service/README.md.`);
      }
      if (proc.status !== 0 && proc.status !== 1) {
        throw new Error(`solver-service/cli.py exited ${proc.status}.\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`);
      }

      const json = JSON.parse(readFileSync(outputPath, 'utf-8'));
      expect(['OPTIMAL', 'FEASIBLE', 'RELAXED']).toContain(json.status);

      const res = mapSolverResult(json, { block: fixture.block });
      const issues = validateAll(
        fixture.allResidents, res.schedule, fixture.block, fixture.eligOverrides,
        fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf
      );
      const structural = issues.filter(i => i.level === 'error' && !i.message.startsWith('Under target'));
      if (structural.length) {
        // eslint-disable-next-line no-console
        console.error('Structural validateAll errors on solver output:', structural.slice(0, 10));
      }
      expect(structuralErrorCount(issues)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});
