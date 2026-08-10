/** @vitest-environment jsdom */
// src/lib/generator.baseline.vacationHeavy.test.js
// One variant of the generator quality-baseline gate. Deliberately thin: the whole suite body
// lives in ./baselineSuite.js, and each variant gets its own FILE so vitest runs the three in
// parallel workers instead of serializing them behind a single `beforeAll` (see that module's
// header for the full rationale, including why each variant owns its own baseline JSON).
import { makeBaselineSuite } from './baselineSuite.js';

makeBaselineSuite('vacationHeavy');
