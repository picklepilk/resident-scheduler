// src/lib/baselineSuite.js
// Shared body of the generator quality-baseline regression gate. NOT named *.test.js on purpose —
// vitest.config.js only collects `src/lib/**/*.test.js`, so this module is imported, never
// collected as a suite of its own.
//
// WHY THIS IS SPLIT PER VARIANT
// The gate measures generateScheduleBest (best-of-20 + repair) across 5 seeds x 3 fixture variants
// = 300 generations, ~32s. Vitest parallelizes across FILES, not within them, so running all three
// variants from one file pinned the whole thing to a single worker while 15 cores sat idle. Each
// variant now lives in its own thin `generator.baseline.<variant>.test.js`, which calls
// makeBaselineSuite(variant) below — three workers, ~3x less wall clock, with no seeds dropped and
// no tolerances widened.
//
// Each variant also owns its OWN committed baseline file. That is not cosmetic: with one shared
// JSON, three workers running UPDATE_QUALITY_BASELINE=1 would each read-modify-write the same file
// and silently clobber each other's variant. Per-variant files remove the race by construction
// rather than coordinating around it.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateScheduleBest, validateAll, buildQualityInput, normalizeRulePriority } from '../ResidentScheduler.jsx';
import { getBlockDates } from './dates.js';
import { computeQualityMetrics, computeQualityVector } from './scheduleQuality.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MULTI-SEED. Generation is nondeterministic and every vector slot carries real seed-to-seed
// noise — measured: coverageMiss ~±1.5, seniorGaps ~±2, restCompromises ~±1, slot 3 ~±10. A
// single-seed baseline cannot tell a genuine regression from that drift, and in practice fired on
// noise twice for changes that were measurably neutral-or-better in aggregate.
export const SEEDS = [42, 7, 1234, 99, 555];

// Residual tolerance on the AVERAGED vector. Averaging cuts the drift but does not erase it, so a
// regression must clear these margins to count. Sized just above the observed post-average drift,
// and verified to still catch a real regression: zeroing SCORE_WEIGHTS.nightCluster moves slot 0
// by +1.8 and slot 3 by ~85, far outside these margins.
const SLOT_TOLERANCE = [0.5, 0.5, 0.5];
const SLOT3_RELATIVE_TOLERANCE = 0.01; // 1%

function baselinePath(variant) {
  return path.join(__dirname, '__fixtures__', `qualityBaseline.${variant}.json`);
}

function errorCount(issues) {
  return issues.filter(i => i.level === 'error').length;
}

function captureOnce(variant, baseSeed) {
  const fixture = makeFixture(variant);
  const { schedule, report } = generateScheduleBest({ ...fixture }, { attempts: 20, baseSeed });
  const issues = validateAll(
    fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
    fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf
  );
  const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);
  const qInput = buildQualityInput({
    schedule, report, allResidents: fixture.allResidents, block: fixture.block,
    appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides,
  });
  const metrics = computeQualityMetrics({
    ...qInput,
    dates,
    coverage: fixture.coverage,
    seniorGapCount: report.seniorGaps.length,
    restCompromiseCount: report.restCompromises.length,
  });
  const rulePriority = normalizeRulePriority(fixture.appSettings?.rulePriority);
  return { errors: errorCount(issues), quality: computeQualityVector(metrics, rulePriority), unfilled: report.unfilled.length };
}

// Averages every SEEDS run. `errors` is SUMMED rather than averaged on purpose — a hard validateAll
// error is never acceptable at any seed and must not be diluted by seeds that happened to be clean.
export function captureFor(variant) {
  const runs = SEEDS.map(s => captureOnce(variant, s));
  const n = runs.length;
  const quality = Array.from({ length: runs[0].quality.length }, (_, i) =>
    runs.reduce((sum, r) => sum + r.quality[i], 0) / n
  );
  return {
    seeds: SEEDS,
    errors: runs.reduce((sum, r) => sum + r.errors, 0),
    quality,
    unfilled: runs.reduce((sum, r) => sum + r.unfilled, 0) / n,
  };
}

// Lexicographic compare with a per-slot tolerance: a slot only counts as different once it moves
// beyond the measured seed noise. Returns <0 better, 0 within tolerance, >0 worse.
export function compareWithTolerance(after, before) {
  for (let i = 0; i < after.length; i++) {
    const tol = i < SLOT_TOLERANCE.length
      ? SLOT_TOLERANCE[i]
      : Math.abs(before[i]) * SLOT3_RELATIVE_TOLERANCE;
    const diff = after[i] - before[i];
    if (Math.abs(diff) <= tol) continue;
    return diff;
  }
  return 0;
}

function loadBaseline(variant) {
  const p = baselinePath(variant);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// Builds the whole suite for one variant. Called by the thin per-variant test files.
export function makeBaselineSuite(variant) {
  describe(`generator quality baseline — ${variant}`, () => {
    let captured;
    beforeAll(() => { captured = captureFor(variant); });

    if (process.env.UPDATE_QUALITY_BASELINE === '1') {
      it('writes the committed baseline', () => {
        const before = loadBaseline(variant);
        if (before && !process.env.FORCE_QUALITY_BASELINE) {
          const errorsWorse = captured.errors > before.errors;
          const qualityWorse = compareWithTolerance(captured.quality, before.quality) > 0;
          if (errorsWorse || qualityWorse) {
            throw new Error(
              `Refusing to write worse baseline for "${variant}" (errors ${before.errors}->${captured.errors}, ` +
              `quality ${JSON.stringify(before.quality)}->${JSON.stringify(captured.quality)}). ` +
              `Set FORCE_QUALITY_BASELINE=1 to override.`
            );
          }
          // eslint-disable-next-line no-console
          console.log(`[baseline] ${variant}: errors ${before.errors} -> ${captured.errors}, quality ${JSON.stringify(before.quality)} -> ${JSON.stringify(captured.quality)}`);
        }
        fs.writeFileSync(baselinePath(variant), JSON.stringify(captured, null, 2) + '\n', 'utf-8');
        expect(fs.existsSync(baselinePath(variant))).toBe(true);
      });
    } else {
      it('does not regress vs. the committed baseline', () => {
        const before = loadBaseline(variant);
        expect(before, `no committed baseline for "${variant}" — run with UPDATE_QUALITY_BASELINE=1 first`).not.toBeNull();
        expect(captured.errors, `${variant}: errors`).toBeLessThanOrEqual(before.errors);
        expect(
          compareWithTolerance(captured.quality, before.quality),
          `${variant}: quality vector (avg over ${SEEDS.length} seeds) ${JSON.stringify(before.quality)} -> ${JSON.stringify(captured.quality)}`
        ).toBeLessThanOrEqual(0);
      });
    }
  });
}
