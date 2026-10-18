/** @vitest-environment jsdom */
// src/lib/generator.baseline.realScale.test.js
// Real-scale (58 synthetic residents, off-service partial windows, 7 vacations, ACEP window)
// variant of the quality-baseline gate. Unlike the saturated variants and `feasible`, local
// best-of-20 leaves headroom here (see ./__fixtures__/realScale.js header and the baseline JSON).
// ~8s per seed, 3 seeds (seedsFor) in beforeAll (inside the 120s vitest timeout). Suite body: ./baselineSuite.js.
import { makeBaselineSuite } from './baselineSuite.js';

makeBaselineSuite('realScale');
