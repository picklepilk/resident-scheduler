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

// 2026-10-18 (ranking follows Soft Rule Priority): rest compromises now rank above under-target in the
// quality vector and no longer pay blockingWarnCount, so a repair lift that costs a postNightRest
// warning is (correctly) not strictly better and an unrepaired winner can keep legal headroom. Known
// measured exception, pinned so any NEW occurrence still fails.
const KNOWN_LEGAL_UNUSED = new Set(['conferenceBlock:1234:syn_kilo']);

describe('generateScheduleBest — under-target lift completeness (A4)', () => {
  for (const variant of VARIANTS) {
    // Async + a setImmediate yield per seed: vitest's between-test awaits are microtasks, so without a
    // real macrotask this whole file (~80s) is one uninterrupted block and the worker's RPC timer
    // (60s) fires before the queued reply is read — `Timeout calling "onTaskUpdate"`.
    it(`every still-under-target resident has zero legal-but-unused open slots (${variant})`, async () => {
      for (const baseSeed of SEEDS) {
        await new Promise(resolve => setImmediate(resolve));
        const fixture = makeFixture(variant);
        const { report } = generateScheduleBest({ ...fixture }, { attempts: 20, baseSeed });
        for (const u of report.underTarget) {
          const openSlots = u.openSlots ?? 0;
          const blockedTotal = Object.values(u.blockedBy || {}).reduce((s, n) => s + n, 0);
          if (KNOWN_LEGAL_UNUSED.has(`${variant}:${baseSeed}:${u.residentId}`)) continue;
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
