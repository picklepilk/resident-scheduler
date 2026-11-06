/** @vitest-environment jsdom */
// Chief decision 2026-11-06: Neurology PGY-1 (NEURO_1) avoids Tuesday/Thursday NIGHT shifts (soft).
import { describe, it, expect } from 'vitest';
import { generateSchedule, SCORE_TIERS, AVOID_NIGHT_DOW } from '../ResidentScheduler.jsx';
import { isNightShiftId } from './shifts.js';
import { mulberry32 } from './rng.js';
import { parseDate } from './dates.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

const W = SCORE_TIERS.SCORE_WEIGHTS;

function tueThuNights(fx, neuroIds, seeds) {
  let n = 0, total = 0;
  for (const seed of seeds) {
    const { schedule } = generateSchedule({ ...fx, rng: mulberry32(seed) });
    for (const id of neuroIds) for (const [ds, sid] of Object.entries(schedule[id] || {})) {
      if (!isNightShiftId(sid)) continue;
      total++;
      if (AVOID_NIGHT_DOW.NEURO_1.includes(parseDate(ds).getDay())) n++;
    }
  }
  return { n, total };
}

describe('Neuro PGY-1 avoids Tue/Thu nights (soft)', () => {
  const fx0 = makeFixture('feasible');
  const base = fx0.allResidents.find(r => r.category === 'NEURO' && r.pgy === 1);
  const neuros = Array.from({ length: 4 }, (_, i) => ({ ...base, id: `neuro_${i}`, firstName: `N${i}`, availabilityMode: 'full', canWorkDates: [] }));
  const fx = { ...fx0, allResidents: [...fx0.allResidents, ...neuros] };
  const ids = neuros.map(r => r.id);

  it('keys the rule in one place', () => {
    expect(AVOID_NIGHT_DOW).toEqual({ NEURO_1: [2, 4] });
  });

  it('places a smaller share of NEURO_1 nights on Tue/Thu than with the preference off', () => {
    const seeds = [1, 2, 3, 4, 5];
    const old = W.neuroTueThuNight;
    let on, off;
    try {
      W.neuroTueThuNight = 40; // ships at 0 (see SCORE_WEIGHTS): enable explicitly to prove the term works
      on = tueThuNights(fx, ids, seeds);
      W.neuroTueThuNight = 0;
      off = tueThuNights(fx, ids, seeds);
    } finally { W.neuroTueThuNight = old; }
    expect(off.total).toBeGreaterThan(0);
    expect(on.total).toBeGreaterThan(0);
    expect(on.n / on.total).toBeLessThan(off.n / off.total);
  });
});
