// Pre-generate capacity check for the Trauma/Peds half-block split. Each split intern needs
// `perResident` TRAUMA-D shifts (TRAUMA_PEDS_SPLIT.trauma) inside their 14-day trauma half, but
// TRAUMA-D is max 1/day and runs only on SHIFT_DOW['TRAUMA-D'] weekdays, so interns sharing a half
// can need more Trauma Days than exist. Warn-only (chief decision 2026-11-06). Pure module.

import { SHIFT_DOW } from './shifts.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HALF_DAYS = 14;
const LABEL = { TRAUMA_PEDS: 'Trauma/Peds', PEDS_TRAUMA: 'Peds/Trauma' };

function utc(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function fmtStr(ms) { return new Date(ms).toISOString().slice(0, 10); }
function short(s) { const [, m, d] = s.split('-').map(Number); return `${m}/${d}`; }

// residents: schedulable EM_HOME residents (others ignored); traumaBlocks: blockType ids that
// split; shiftDow: dows TRAUMA-D runs on (default SHIFT_DOW['TRAUMA-D']).
// Returns { groups:[{blockType,start,end,count,needed,slots}], shortfalls:[group + message] }.
export function computeTraumaSplitCapacity({ residents, startDate, endDate, traumaBlocks, perResident, shiftDow } = {}) {
  const out = { groups: [], shortfalls: [] };
  if (!Array.isArray(residents) || !DATE_RE.test(startDate || '') || !DATE_RE.test(endDate || '') || endDate < startDate) return out;
  const per = Number.isFinite(perResident) ? perResident : 0;
  const dows = Array.isArray(shiftDow) ? shiftDow : SHIFT_DOW['TRAUMA-D'];
  const day0 = utc(startDate), dayN = utc(endDate);
  for (const bt of ['TRAUMA_PEDS', 'PEDS_TRAUMA']) {
    if (!(traumaBlocks || []).includes(bt)) continue;
    const count = residents.filter(r => r && r.category === 'EM_HOME' && r.blockType === bt).length;
    if (!count) continue;
    const from = bt === 'TRAUMA_PEDS' ? day0 : day0 + HALF_DAYS * 86400000;
    const to = Math.min(bt === 'TRAUMA_PEDS' ? day0 + (HALF_DAYS - 1) * 86400000 : dayN, dayN);
    let slots = 0;
    for (let t = from; t <= to; t += 86400000) if (dows.includes(new Date(t).getUTCDay())) slots++;
    const g = { blockType: bt, start: fmtStr(from), end: fmtStr(to), count, needed: count * per, slots };
    out.groups.push(g);
    if (g.needed > g.slots) {
      out.shortfalls.push({ ...g,
        message: `${count} ${LABEL[bt]} intern${count === 1 ? '' : 's'} share ${short(g.start)}-${short(g.end)}: need ${g.needed} Trauma Days, only ${g.slots} exist -- stagger them (Trauma Day is max 1 per day)` });
    }
  }
  return out;
}
