// Invented demo data for RotationLedgerPreview. No real residents. demoComputeLedger is a crude
// proportional stand-in for lib/rotationLedger.js, used only for the visual check.

export const demoBlock = { id: 'demo-b5', startDate: '2026-11-16', endDate: '2026-12-13' };
export const demoBlocks = [
  { id: 'demo-b4', startDate: '2026-10-19', endDate: '2026-11-15' },
  demoBlock,
  { id: 'demo-b6', startDate: '2026-12-14', endDate: '2027-01-10' },
];

const DAY = 86400000;
const toT = iso => Date.parse(iso + 'T00:00:00Z');
const toISO = t => new Date(t).toISOString().slice(0, 10);
const addDays = (iso, n) => toISO(toT(iso) + n * DAY);
const diffDays = (a, b) => Math.round((toT(b) - toT(a)) / DAY) + 1;

const AUTO_OBLIGATION = { PEDS: 15, POD: 14, NEURO: 7, PSYCH: 14 };

export function demoComputeLedger(rot, block = demoBlock) {
  if (!rot.start || !rot.end || rot.end < rot.start) {
    return { obligation: 0, obligationSource: 'auto', base: 0, doneBefore: 0, doneBeforeSource: 'none', dueHere: 0, owedAfter: 0, cannotFit: 0, segments: [] };
  }
  const base = AUTO_OBLIGATION[rot.category] ?? 10;
  const obligation = rot.obligation != null ? rot.obligation : base;
  const cutSet = new Set([rot.start]);
  const bs = block.startDate, be = block.endDate;
  if (bs > rot.start && bs <= rot.end) cutSet.add(bs);
  if (be < rot.end) cutSet.add(addDays(be, 1));
  (rot.splits || []).forEach(s => { if (s > rot.start && s <= rot.end) cutSet.add(s); });
  const starts = [...cutSet].sort();
  const segs = starts.map((s, i) => {
    const end = i + 1 < starts.length ? addDays(starts[i + 1], -1) : rot.end;
    const where = end < bs ? 'before' : s > be ? 'after' : 'here';
    const days = diffDays(s, end);
    const pin = (rot.ranges || []).find(r => r.start === s && r.end === end);
    return { start: s, end, days, blockId: null, where, capacity: days, count: pin ? pin.count : null, source: pin ? pin.source : 'auto' };
  });
  const pinned = segs.reduce((a, s) => a + (s.count ?? 0), 0);
  const free = segs.filter(s => s.count == null);
  let left = Math.max(0, obligation - pinned);
  const total = left;
  const freeDays = free.reduce((a, s) => a + s.days, 0) || 1;
  free.forEach((s, i) => {
    s.count = i === free.length - 1 ? left : Math.min(left, Math.round(total * s.days / freeDays));
    left -= s.count;
  });
  const sum = w => segs.filter(s => s.where === w).reduce((a, s) => a + s.count, 0);
  const before = segs.filter(s => s.where === 'before');
  const srcs = before.map(s => s.source).filter(s => s !== 'auto');
  return {
    obligation, obligationSource: rot.obligation != null ? 'typed' : 'auto', base,
    doneBefore: sum('before'), doneBeforeSource: srcs[0] || (before.length ? 'estimated' : 'none'),
    dueHere: sum('here'), owedAfter: sum('after'),
    cannotFit: segs.filter(s => s.where === 'here').reduce((a, s) => a + Math.max(0, s.count - s.capacity), 0),
    segments: segs,
  };
}

const mk = (id, firstName, lastName, category, pgy, start, end, obligation, ranges, scheduledByUs = true) =>
  ({ id, firstName, lastName, category, pgy, start, end, scheduledByUs, obligation, ranges, splits: [] });

export const demoRots = [
  mk('r1', 'Ada', 'Quill', 'PEDS', 2, '2026-11-02', '2026-11-29', 15, [{ start: '2026-11-02', end: '2026-11-15', count: 7, source: 'qgenda' }]),
  mk('r2', 'Basil', 'Marsh', 'PEDS', 2, '2026-11-09', '2026-12-13', 15, [{ start: '2026-11-09', end: '2026-11-15', count: 5, source: 'saved' }]),
  mk('r3', 'Cleo', 'Fenn', 'POD', 3, '2026-11-02', '2026-12-06', null, [{ start: '2026-11-02', end: '2026-11-15', count: 6, source: 'typed' }]),
  mk('r4', 'Dario', 'Lund', 'NEURO', 1, '2026-11-07', '2026-11-20', null, [{ start: '2026-11-07', end: '2026-11-15', count: 5, source: 'qgenda' }]),
  mk('r5', 'Edda', 'Pike', 'PSYCH', 2, '2026-11-23', '2026-12-20', 14, [{ start: '2026-12-14', end: '2026-12-20', count: 4, source: 'typed' }]),
  mk('r6', 'Finn', 'Okoro', 'BAMC-PA', 3, '2026-11-02', '2026-12-13', null, [], false),
];
export const demoSpecialty = { PEDS: 'Peds', POD: 'Pod', NEURO: 'Neuro', PSYCH: 'Psych', 'BAMC-PA': 'BAMC PA' };
const placedMap = { r1: 7, r2: 10, r3: 6, r4: 2, r5: 8, r6: 0 };

export function demoRows(rots = demoRots, block = demoBlock) {
  return rots.map(rot => {
    const ledger = demoComputeLedger(rot, block);
    if (rot.id === 'r3') ledger.cannotFit = 1;
    return {
      rot, ledger, placedHere: placedMap[rot.id] ?? 0,
      residentId: rot.scheduledByUs ? rot.id : null,
      displayName: `${rot.firstName} ${rot.lastName}`,
      specialtyLabel: demoSpecialty[rot.category] || rot.category,
    };
  });
}
