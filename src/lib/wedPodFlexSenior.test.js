/** @vitest-environment jsdom */
// Chief decisions 2026-11-06: (1) Wednesday POD-D max 3; (2) soft preference for one BAMC body on
// Wednesday POD-D; (3) FLEX senior defaults to EM PGY-2, PGY-3 still accepted but only as fallback.
import { describe, it, expect } from 'vitest';
import { generateSchedule, SCORE_TIERS, validateAll } from '../ResidentScheduler.jsx';
import { getCoverageFor } from './coverage.js';
import { mulberry32 } from './rng.js';
import { parseDate } from './dates.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const W = SCORE_TIERS.SCORE_WEIGHTS;
const isWed = ds => parseDate(ds).getDay() === 3;

function withWeight(key, value, fn) {
  const old = W[key];
  W[key] = value;
  try { return fn(); } finally { W[key] = old; }
}

// Synthetic roster builders: clones of fixture residents with fresh ids.
function clones(fx, pick, n, over = {}) {
  const base = fx.allResidents.find(pick);
  return Array.from({ length: n }, (_, i) => ({ ...base, id: `cl_${base.id}_${i}`, firstName: `C${i}`, ...over }));
}
const bamcAnes = (nB, nA) => {
  const fx = makeFixture('feasible');
  const bamc = clones(fx, r => r.category === 'EM_BAMC', nB);
  const anes = clones(fx, r => r.category === 'NEURO', nA, { category: 'ANES', availabilityMode: 'full', canWorkDates: [] });
  return { ...fx, allResidents: [...bamc, ...anes] };
};

function wedPodDayCells(fx, seeds) {
  const cells = [];
  for (const seed of seeds) {
    const { schedule } = generateSchedule({ ...fx, rng: mulberry32(seed) });
    const dates = new Set(fx.allResidents.flatMap(r => Object.keys(schedule[r.id] || {})));
    for (const ds of dates) {
      if (!isWed(ds)) continue;
      const who = fx.allResidents.filter(r => schedule[r.id]?.[ds] === 'POD-D');
      cells.push({ n: who.length, bamc: who.filter(r => r.category === 'EM_BAMC').length });
    }
  }
  return cells;
}

describe('Wednesday POD-D max 3', () => {
  it('coverage resolves min 1 / max 3 on Wednesday, even over a saved old max-2 or a lower override', () => {
    expect(getCoverageFor('POD-D', {}, 3)).toEqual({ min: 1, max: 3 });
    expect(getCoverageFor('POD-D', { 'POD-D': { min: 1, max: 2 } }, 3)).toEqual({ min: 1, max: 3 });
    expect(getCoverageFor('FLEX-D', {}, 3)).toEqual({ min: 1, max: 2 });
  });
  it('generator takes a 3rd body on Wednesday POD-D (off-service supply) and never a 4th', () => {
    const cells = wedPodDayCells(bamcAnes(4, 8), [1]);
    expect(cells.some(c => c.n === 3)).toBe(true);
    expect(cells.every(c => c.n <= 3)).toBe(true);
  });
});

describe('Wednesday POD-D prefers a BAMC body (soft)', () => {
  it('BAMC lands on more Wednesday POD-D cells than with the preference off', () => {
    const fx = bamcAnes(12, 8);
    const frac = cs => cs.filter(c => c.bamc > 0).length / cs.length;
    const on = wedPodDayCells(fx, [1, 2]);
    const off = withWeight('wedPodBamcBody', 0, () => wedPodDayCells(fx, [1, 2]));
    expect(frac(on)).toBeGreaterThan(frac(off));
  });
});

describe('FLEX senior: PGY-2 preferred, PGY-3 fallback', () => {
  const flexRoster = (n2, n3) => {
    const fx = makeFixture('feasible');
    const em = fx.allResidents.filter(r => r.category === 'EM_HOME');
    const p2 = clones(fx, r => r.category === 'EM_HOME' && r.pgy === 2 && r.blockType === 'EM', n2);
    const p3 = clones(fx, r => r.category === 'EM_HOME' && r.pgy === 3, n3);
    return { ...fx, allResidents: [...p2, ...p3], em };
  };
  const flexCount = (fx, schedule) => {
    let pgy3 = 0, pgy2 = 0;
    for (const r of fx.allResidents) for (const sid of Object.values(schedule[r.id] || {})) {
      if (!String(sid).startsWith('FLEX-')) continue;
      if (r.pgy === 3) pgy3++; else if (r.pgy === 2) pgy2++;
    }
    return { pgy3, pgy2 };
  };
  it('Phase 3b swaps a lone FLEX PGY-3 for an under-target PGY-2; keeps the PGY-3 when no PGY-2 can take it', () => {
    const DAY = '2026-07-09'; // Thursday
    const swap = (fx, schedule) => generateSchedule({ ...fx, block: { ...fx.block, schedule }, repair: 'truePrimaryOnly', clearFirst: false, keptCellsOverride: new Set(), rng: mulberry32(1) }).schedule;
    const both = flexRoster(1, 1);
    const [p2, p3] = both.allResidents;
    const out = swap(both, { [p2.id]: {}, [p3.id]: { [DAY]: 'FLEX-E' } });
    expect(out[p2.id][DAY]).toBe('FLEX-E');
    expect(out[p3.id][DAY]).toBeUndefined();
    const only3 = flexRoster(0, 1);
    const q3 = only3.allResidents[0];
    expect(swap(only3, { [q3.id]: { [DAY]: 'FLEX-E' } })[q3.id][DAY]).toBe('FLEX-E');
  });
  it('still accepts a PGY-3 as the FLEX senior when no PGY-2 exists', () => {
    const fx = flexRoster(0, 10);
    const { schedule } = generateSchedule({ ...fx, rng: mulberry32(3), repair: true });
    expect(flexCount(fx, schedule).pgy3).toBeGreaterThan(0);
    const issues = validateAll(fx.allResidents, schedule, fx.block, fx.eligOverrides, fx.appSettings, fx.dayRules, {}, [], fx.ayConf);
    expect(issues.filter(i => i.rule === 'flexSeniorComposition' && i.level === 'error')).toEqual([]);
  });
});
