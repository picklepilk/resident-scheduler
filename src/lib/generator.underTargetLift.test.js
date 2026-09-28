// src/lib/generator.underTargetLift.test.js
// A4 (fix/under-target-lift): repairPass' Phase 5 ("under-target lift" — see ResidentScheduler.jsx's
// repairPass, Steps 1-4: Room/Steal/Chain/Overstaff) tries every legal way to close a resident's
// shift-count gap before giving up on them. This test is the completeness check on that claim: for
// every resident generateScheduleBest still reports under target, NOT ONE of the (date, shift) pairs
// its own per-resident diagnostic (computeUnderTargetDiagnostics, populated automatically on the
// winning attempt — see generateSchedule's "Per-resident shortfall diagnostic" section) counted as
// `openSlots` was actually legal-and-simply-unused. Every open slot must show up in `blockedBy`
// (candidatePool's own hard-rule reason vocabulary), i.e. `sum(blockedBy) === openSlots` exactly —
// zero slots slipped through. If this ever fails, Phase 5 left real, legal headroom on the table for
// a resident it claims is unfixable, which is a real regression in the lift phase, not test noise.
import { describe, it, expect } from 'vitest';
import { generateScheduleBest } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';
import { SEEDS } from './baselineSuite.js';

const VARIANTS = ['standard', 'understaffed', 'vacationHeavy', 'conferenceBlock'];

describe('generateScheduleBest — under-target lift completeness (A4)', () => {
  for (const variant of VARIANTS) {
    it(`every still-under-target resident has zero legal-but-unused open slots (${variant})`, () => {
      for (const baseSeed of SEEDS) {
        const fixture = makeFixture(variant);
        const { report } = generateScheduleBest({ ...fixture }, { attempts: 20, baseSeed });
        for (const u of report.underTarget) {
          const openSlots = u.openSlots ?? 0;
          const blockedTotal = Object.values(u.blockedBy || {}).reduce((s, n) => s + n, 0);
          expect(
            blockedTotal,
            `${variant} seed ${baseSeed}: resident ${u.residentId} (${u.assigned}/${u.target}) has ` +
            `${openSlots} open slot(s) but only ${blockedTotal} are accounted for as hard-blocked — ` +
            `${openSlots - blockedTotal} slot(s) look legal and were left unused by Phase 5`
          ).toBe(openSlots);
        }
      }
    });
  }
});
