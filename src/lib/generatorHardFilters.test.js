/** @vitest-environment jsdom */
// src/lib/generatorHardFilters.test.js
// Generator-quality-pack items 1 and 4 — item 1 through the real generateSchedule()/validateAll()
// path (same jsdom-import pattern as generator.harness.test.js); item 4 against the pre-pass's own
// pure core (computeScarceSeniorReservations), since the small synthetic fixtures used elsewhere
// in this repo have genuine EM Home PGY-2/3 undersupply relative to POD/FLEX-night demand — the
// pre-pass reorders WHICH day a scarce senior covers, it can't manufacture seniors that don't
// exist, so "0 senior-composition gaps" is not a real invariant on those fixtures and would be a
// false test. computeScarceSeniorReservations's own combinatorics (exactly one qualifier -> scarce)
// is what's actually new and testable in isolation.
import { describe, it, expect } from 'vitest';
import { generateSchedule, validateAll, computeScarceSeniorReservations } from '../ResidentScheduler.jsx';
import { mulberry32 } from './rng.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';
import { SHIFT_MAP } from './shifts.js';
import { parseDate } from './dates.js';

// item 1: BAMC Wednesday-night cap. candidatePool now hard-excludes an EM_BAMC candidate from a
// second Wednesday-night shift the same block, matching validateAll's own warn threshold ("BAMC
// allows at most one per block"). Run several seeds — a single seed passing could be coincidence
// if the fixture rarely reaches for a 2nd Wednesday night at all.
describe('item 1 — BAMC Wednesday-night hard cap', () => {
  for (const seed of [1, 2, 3, 42, 99]) {
    it(`generateSchedule never gives an EM_BAMC resident a 2nd Wednesday-night shift (standard, seed=${seed})`, () => {
      const fixture = makeFixture('standard');
      const { schedule } = generateSchedule({ ...fixture, rng: mulberry32(seed) });
      for (const r of fixture.allResidents) {
        if (r.category !== 'EM_BAMC') continue;
        const wedNightCount = Object.entries(schedule[r.id] || {})
          .filter(([ds, sid]) => sid && SHIFT_MAP[sid]?.type === 'night' && parseDate(ds).getDay() === 3).length;
        expect(wedNightCount, `${r.id} Wednesday-night count`).toBeLessThanOrEqual(1);
      }
      // Cross-check against validateAll's own warn — it should never fire for this rule now.
      const issues = validateAll(fixture.allResidents, schedule, fixture.block, fixture.eligOverrides, fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf);
      const bamcWedWarns = issues.filter(i => i.message.includes('Wednesday-night shifts'));
      expect(bamcWedWarns).toEqual([]);
    });
  }
});

// item 4: senior-scarcity pre-pass core combinatorics.
describe('item 4 — computeScarceSeniorReservations', () => {
  it('flags a date as scarce for a resident only when they are the SOLE qualifier that date/area', () => {
    const qualifiersByAreaDate = {
      POD: {
        '2026-07-06': ['alice', 'bob'],  // 2 qualifiers -> not scarce
        '2026-07-07': ['alice'],         // sole qualifier -> scarce for alice
        '2026-07-08': [],                // 0 qualifiers -> not scarce (nobody to reserve)
      },
      FLEX: {
        '2026-07-06': ['carol'],         // sole qualifier -> scarce for carol
      },
    };
    const { scarceDatesByResident, scarceReserveCount } = computeScarceSeniorReservations(qualifiersByAreaDate);
    expect([...scarceDatesByResident.alice]).toEqual(['2026-07-07']);
    expect([...scarceDatesByResident.carol]).toEqual(['2026-07-06']);
    expect(scarceDatesByResident.bob).toBeUndefined();
    expect(scarceReserveCount).toEqual({ alice: 1, carol: 1 });
  });

  it('accumulates multiple scarce dates for the same resident across areas', () => {
    const qualifiersByAreaDate = {
      POD:  { '2026-07-06': ['alice'], '2026-07-13': ['alice'] },
      FLEX: { '2026-07-06': ['alice', 'bob'], '2026-07-20': ['alice'] },
    };
    const { scarceDatesByResident, scarceReserveCount } = computeScarceSeniorReservations(qualifiersByAreaDate);
    expect([...scarceDatesByResident.alice].sort()).toEqual(['2026-07-06', '2026-07-13', '2026-07-20']);
    expect(scarceReserveCount.alice).toBe(3);
  });

  it('returns empty maps for no scarce dates at all', () => {
    const qualifiersByAreaDate = { POD: { '2026-07-06': ['alice', 'bob'] } };
    const { scarceDatesByResident, scarceReserveCount } = computeScarceSeniorReservations(qualifiersByAreaDate);
    expect(scarceDatesByResident).toEqual({});
    expect(scarceReserveCount).toEqual({});
  });
});

// item 4, weak end-to-end sanity check: the pre-pass must never make the generator WORSE off on a
// spread of seeds — the strict "0 gaps" invariant does not hold on these thin synthetic fixtures
// (measured: the standard fixture alone has ~70-90 pgy3Required/pgy2Required unfilled slots
// regardless of this change, a genuine PGY-2/3 headcount shortfall the pre-pass cannot manufacture
// its way out of), but generation must still complete without throwing and without introducing new
// STRUCTURAL validateAll errors.
describe('item 4 — end-to-end sanity (no crash, no new structural errors)', () => {
  for (const seed of [1, 2, 3]) {
    it(`generateSchedule + validateAll complete cleanly (standard, seed=${seed})`, () => {
      const fixture = makeFixture('standard');
      const { schedule, report } = generateSchedule({ ...fixture, rng: mulberry32(seed) });
      expect(report.unfilled.length).toBeGreaterThanOrEqual(0); // ran to completion
      const issues = validateAll(fixture.allResidents, schedule, fixture.block, fixture.eligOverrides, fixture.appSettings, fixture.dayRules, fixture.coverage, fixture.blocksHistory, fixture.ayConf);
      const structural = issues.filter(i => i.level === 'error' && !i.message.startsWith('Under target'));
      expect(structural).toEqual([]);
    });
  }
});
