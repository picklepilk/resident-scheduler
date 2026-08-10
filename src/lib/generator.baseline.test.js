/** @vitest-environment jsdom */
// src/lib/generator.baseline.test.js
// Regression gate for the schedule generator's measured quality (see docs/plans — "Schedule
// Generator: Quality Harness + Best-of-N + Repair Pass", Steps 5/8). Committed baseline lives at
// __fixtures__/qualityBaseline.json and reflects generateScheduleBest — the production algorithm
// (best-of-20 restart + post-selection repair), not the bare single-shot generateSchedule — so
// this catches regressions anywhere in that pipeline, not just the underlying greedy fill. This
// file only ASSERTS non-regression by default; it does NOT write new numbers unless
// UPDATE_QUALITY_BASELINE=1 is set, and even then it refuses to commit a worse number than what's
// already on disk unless FORCE_QUALITY_BASELINE=1 is also set (see plan's "Key decisions &
// tradeoffs" — the update mode must not launder regressions).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateScheduleBest, validateAll, buildQualityInput, normalizeRulePriority } from '../ResidentScheduler.jsx';
import { getBlockDates } from './dates.js';
import { computeQualityMetrics, computeQualityVector, compareVectors } from './scheduleQuality.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, '__fixtures__', 'qualityBaseline.json');
const VARIANTS = ['standard', 'understaffed', 'vacationHeavy'];

// MULTI-SEED (was a single seed=42). Generation is nondeterministic and every vector slot carries
// real seed-to-seed noise — measured across 6 seeds while building the Phase 1 work-shape metric:
// coverageMiss drifts ~±1.5, seniorGaps ~±2, restCompromises ~±1, slot 3 ~±10. A single-seed
// baseline cannot tell a genuine regression from that drift, and in practice it fired on noise
// twice for changes that were measurably neutral-or-better in aggregate. Averaging several
// independent baseSeeds shrinks the noise enough for the gate to mean something.
const SEEDS = [42, 7, 1234, 99, 555];

// Residual tolerance on the AVERAGED vector. Averaging cuts the drift but does not erase it, so a
// regression must clear these margins to be called one. Sized just above the observed post-average
// drift, deliberately tight enough that a real regression (which moves these numbers by far more)
// still trips the gate. Slots 0-2 are counts; slot 3 is the composite fairness+shape scalar, whose
// magnitude varies by fixture, so its tolerance is relative.
const SLOT_TOLERANCE = [0.5, 0.5, 0.5];
const SLOT3_RELATIVE_TOLERANCE = 0.01; // 1%

function errorCount(issues) {
  return issues.filter(i => i.level === 'error').length;
}

// Measures the PRODUCTION algorithm — generateScheduleBest (best-of-20 restart + post-selection
// repair), the same function runGenerate/runPartialRegenerate call — not the bare single-shot
// generateSchedule. The committed baseline therefore always reflects whatever the app actually
// ships, so a future regression in generateScheduleBest itself (not just the underlying
// generateSchedule) is still caught here. attempts=20/baseSeed=SEED for reproducibility.
function captureOnce(variant, baseSeed) {
  const fixture = makeFixture(variant);
  const { schedule, report } = generateScheduleBest({ ...fixture }, { attempts: 20, baseSeed });
  const issues = validateAll(
    fixture.allResidents, schedule, fixture.block, fixture.eligOverrides,
    fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf
  );
  const dates = getBlockDates(fixture.block.startDate, fixture.block.endDate);
  const qInput = buildQualityInput({ schedule, report, allResidents: fixture.allResidents, block: fixture.block, appSettings: fixture.appSettings, eligOverrides: fixture.eligOverrides });
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

// Averages every SEEDS run for one variant. `errors` is summed rather than averaged on purpose —
// a hard validateAll error is never acceptable at any seed, so it must not be diluted by seeds that
// happened to be clean.
function captureFor(variant) {
  const runs = SEEDS.map(s => captureOnce(variant, s));
  const n = runs.length;
  const slots = runs[0].quality.length;
  const quality = Array.from({ length: slots }, (_, i) =>
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
function compareWithTolerance(after, before) {
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

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
}

describe('generator quality baseline', () => {
  let captured;
  beforeAll(() => {
    captured = Object.fromEntries(VARIANTS.map(v => [v, captureFor(v)]));
  });

  if (process.env.UPDATE_QUALITY_BASELINE === '1') {
    it('writes the committed baseline', () => {
      const existing = loadBaseline();
      if (existing && !process.env.FORCE_QUALITY_BASELINE) {
        for (const v of VARIANTS) {
          const before = existing[v];
          const after = captured[v];
          if (before) {
            const errorsWorse = after.errors > before.errors;
            const qualityWorse = compareWithTolerance(after.quality, before.quality) > 0;
            if (errorsWorse || qualityWorse) {
              throw new Error(
                `Refusing to write worse baseline for "${v}" (errors ${before.errors}->${after.errors}, ` +
                `quality ${JSON.stringify(before.quality)}->${JSON.stringify(after.quality)}). ` +
                `Set FORCE_QUALITY_BASELINE=1 to override.`
              );
            }
          }
          // eslint-disable-next-line no-console
          console.log(`[baseline] ${v}: errors ${before?.errors ?? 'n/a'} -> ${after.errors}, quality ${JSON.stringify(before?.quality ?? null)} -> ${JSON.stringify(after.quality)}`);
        }
      }
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(captured, null, 2) + '\n', 'utf-8');
      expect(fs.existsSync(BASELINE_PATH)).toBe(true);
    });
  } else {
    it('does not regress vs. the committed baseline', () => {
      const baseline = loadBaseline();
      expect(baseline, 'no committed baseline yet — run with UPDATE_QUALITY_BASELINE=1 first').not.toBeNull();
      for (const v of VARIANTS) {
        const before = baseline[v];
        const after = captured[v];
        expect(after.errors, `${v}: errors`).toBeLessThanOrEqual(before.errors);
        expect(
          compareWithTolerance(after.quality, before.quality),
          `${v}: quality vector (avg over ${SEEDS.length} seeds) ${JSON.stringify(before.quality)} -> ${JSON.stringify(after.quality)}`
        ).toBeLessThanOrEqual(0);
      }
    });
  }
});
