/** @vitest-environment jsdom */
// src/lib/generator.baseline.conferenceBlock.test.js
// One variant of the generator quality-baseline gate. Deliberately thin: the whole suite body
// lives in ./baselineSuite.js, and each variant gets its own FILE so vitest runs them in parallel
// workers instead of serializing them behind a single `beforeAll` (see that module's header for the
// full rationale, including why each variant owns its own baseline JSON).
//
// This variant covers a block overlapping a conference window, which none of the other three did:
// inside an ACEP/AAEM/SAEM 'replace' window the POD/MT/FLEX 9h shifts give way to their 12h pair,
// and a 12h shift credits +1 toward a shift-count target while burning 12h rather than 9h of the
// ACGME 80h rolling cap. That interaction is what leaves residents under target on a conference
// block, and it now has a committed regression number instead of no coverage at all.
import { makeBaselineSuite } from './baselineSuite.js';

makeBaselineSuite('conferenceBlock');
