/** @vitest-environment jsdom */
// Chief decision 2026-11-01: Peds/EM PGY-2 may work Peds Night (PED-N) as ordinary peds work, and it
// counts toward the 10-12 peds-shift mix like Peds Day/Eve (every counter keys off area === 'PED').
import { describe, it, expect } from 'vitest';
import { getEligibleShifts, validateAll } from '../ResidentScheduler.jsx';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

function fixtureWithPedsEm() {
  const fixture = makeFixture('standard');
  const base = fixture.allResidents.find(r => r.id === 'syn_kilo');
  const pedsEm = { ...base, blockType: 'PEDS_EM' };
  const allResidents = fixture.allResidents.map(r => (r.id === pedsEm.id ? pedsEm : r));
  return { fixture: { ...fixture, allResidents }, pedsEm };
}

function dates(start, n) {
  const out = [];
  const d = new Date(start + 'T00:00:00Z');
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

function mixIssues(fixture, pedsEm, cells) {
  const issues = validateAll(
    fixture.allResidents, { [pedsEm.id]: cells }, fixture.block, fixture.eligOverrides,
    fixture.appSettings, fixture.dayRules, fixture.coverage, [], fixture.ayConf
  );
  return issues.filter(i => i.residentId === pedsEm.id && /^Peds\/EM mix/.test(i.message));
}

describe('Peds/EM PGY-2 and Peds Night', () => {
  it('getEligibleShifts offers PED-N on every weekday', () => {
    const { fixture, pedsEm } = fixtureWithPedsEm();
    for (const ds of dates(fixture.block.startDate, 7)) {
      const elig = getEligibleShifts(pedsEm, ds, {}, fixture.eligOverrides, fixture.appSettings, fixture.dayRules,
        { blockStart: fixture.block.startDate, ayConf: fixture.ayConf });
      expect(elig, ds).toContain('PED-N');
    }
  });

  it('validateAll counts PED-N toward the >12 cap (13 peds shifts incl. PED-N warns)', () => {
    const { fixture, pedsEm } = fixtureWithPedsEm();
    const ds = dates(fixture.block.startDate, 13);
    const cells = {};
    ds.forEach((d, i) => { cells[d] = i < 12 ? (i % 2 ? 'PED-E' : 'PED-D') : 'PED-N'; });
    const found = mixIssues(fixture, pedsEm, cells);
    expect(found.length).toBe(1);
    expect(found[0].message).toContain('13 peds shifts');
  });

  it('validateAll counts PED-N toward the <10 floor (9 day/eve + 1 PED-N, total >= target, no warn)', () => {
    const { fixture, pedsEm } = fixtureWithPedsEm();
    const ds = dates(fixture.block.startDate, 19);
    const cells = {};
    ds.forEach((d, i) => { cells[d] = i < 9 ? 'PED-D' : i === 9 ? 'PED-N' : 'POD-D'; });
    expect(mixIssues(fixture, pedsEm, cells)).toEqual([]);
    // control: same total with only 9 peds shifts DOES warn
    cells[ds[9]] = 'POD-D';
    expect(mixIssues(fixture, pedsEm, cells).length).toBe(1);
  });
});
