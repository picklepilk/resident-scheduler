/** @vitest-environment jsdom */
// src/lib/generator.baseline.feasible.test.js
// Non-saturated variant of the generator quality-baseline gate. standard/understaffed/vacationHeavy/
// conferenceBlock are capacity-limited (avg unfilled 111-206 per block, every error underTarget), so
// they cannot show algorithm gains; `feasible` adds residents in every tier (and waives the
// rotation-only TRAUMA-D minimum) so full minimum coverage is nearly attainable.
// Measured at creation (5 seeds, repairCandidates 3): avg unfilled 4 per block (only MT-D/FLEX-D
// allRestBlocked slots), structural errors 0. Suite body + rationale: ./baselineSuite.js.
import { makeBaselineSuite } from './baselineSuite.js';

makeBaselineSuite('feasible');
