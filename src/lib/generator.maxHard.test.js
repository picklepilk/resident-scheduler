// Owner decision 2026-11-22 "never go over max": generation (generateSchedule / generateScheduleBest,
// incl. the Phase 5 under-target lift) must never assign more residents to a (shift, date) than that
// shift's coverage max. A resident the engine cannot fit stays under target. The old Step 4
// "Overstaff" last resort is gone, so report.overstaffed is always empty.
import { describe, it, expect } from 'vitest';
import { generateScheduleBestAsync } from '../ResidentScheduler.jsx';
import { getCoverageFor } from './coverage.js';
import { parseDate } from './dates.js';
import { SHIFTS } from './shifts.js';
import { makeFixture } from './__fixtures__/syntheticRoster.js';

describe('generation never exceeds coverage max', () => {
  for (const variant of ['understaffed', 'standard']) {
    it(`no (shift, date) above max, overstaffed empty (${variant})`, async () => {
      for (const baseSeed of [42, 7]) {
        await new Promise(resolve => setImmediate(resolve));
        const fixture = makeFixture(variant);
        const { schedule, report } = await generateScheduleBestAsync({ ...fixture }, { attempts: 6, baseSeed });
        expect(report.overstaffed || []).toEqual([]);
        expect((report.repairs || []).some(r => r.type === 'underTargetOverstaff')).toBe(false);
        const counts = {};
        for (const byDate of Object.values(schedule)) {
          for (const [ds, sid] of Object.entries(byDate)) {
            if (sid) counts[`${sid}|${ds}`] = (counts[`${sid}|${ds}`] || 0) + 1;
          }
        }
        for (const [key, n] of Object.entries(counts)) {
          const [sid, ds] = key.split('|');
          if (!SHIFTS.some(s => s.id === sid)) continue;
          const { max } = getCoverageFor(sid, fixture.coverage || {}, parseDate(ds).getDay());
          expect(n, `${variant} seed ${baseSeed}: ${sid} on ${ds} has ${n} > max ${max}`).toBeLessThanOrEqual(max);
        }
      }
    }, 120000);
  }
});
