// Rotation ledger: an off-service rotation (7-35 days) owes ONE category shift count for the whole
// rotation, however many scheduling blocks it straddles. Pure helpers; never import
// ResidentScheduler.jsx. Dates are ISO 'YYYY-MM-DD' strings (lexicographic compare is safe).
// BAMC (EM_BAMC) is a per-block quota and never enters this math; neither do
// scheduledByUs === false rows (BAMC PA reference rows): obligation/ledger return null for both.
import { isoDayNumber } from './dates.js';

/** Standard rotation length in days; shorter rotations scale their obligation by days. */
export const STANDARD_ROTATION_DAYS = { default: 28, IM: 15 };

const DAY_MS = 86_400_000;
const RANGE_SOURCES = ['typed', 'qgenda', 'saved'];
const SOURCE_RANK = { typed: 3, qgenda: 2, saved: 1 };

function dayToIso(n) { return new Date(n * DAY_MS).toISOString().slice(0, 10); }
function validIso(s) {
  if (typeof s !== 'string') return false;
  const n = isoDayNumber(s);
  return n != null && !Number.isNaN(n) && dayToIso(n) === s;
}
function nonNegInt(v) {
  if (typeof v === 'string' && v.trim() !== '') v = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v);
}
function inclusiveDays(start, end) { return isoDayNumber(end) - isoDayNumber(start) + 1; }
function addIso(iso, n) { return dayToIso(isoDayNumber(iso) + n); }

/**
 * Sanitize an untrusted stored rotation.
 * Returns null unless start/end are valid ISO dates with start <= end. Drops bad ranges/splits,
 * clamps ranges to [start,end], counts become non-negative ints, splits are deduped, sorted and
 * kept only inside (start,end]. `scheduledByUs` is false only when explicitly false.
 * @param {*} raw
 * @returns {null|{id:*,firstName:string,lastName:string,category:string,pgy:*,start:string,end:string,
 *   scheduledByUs:boolean,obligation:(number|null),
 *   ranges:{start:string,end:string,count:number,source:string,slotLabel?:string}[],
 *   splits:string[],importedAt:*}}
 */
export function normalizeRotation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!validIso(raw.start) || !validIso(raw.end) || raw.start > raw.end) return null;
  const start = raw.start, end = raw.end;
  const ranges = [];
  for (const r of Array.isArray(raw.ranges) ? raw.ranges : []) {
    if (!r || typeof r !== 'object' || !validIso(r.start) || !validIso(r.end) || r.start > r.end) continue;
    const count = nonNegInt(r.count);
    if (count == null) continue;
    const s = r.start < start ? start : r.start;
    const e = r.end > end ? end : r.end;
    if (s > e) continue;
    const out = { start: s, end: e, count, source: RANGE_SOURCES.includes(r.source) ? r.source : 'typed' };
    if (typeof r.slotLabel === 'string') out.slotLabel = r.slotLabel;
    if (typeof r.qgendaRunId === 'string') out.qgendaRunId = r.qgendaRunId;
    ranges.push(out);
  }
  const splits = [...new Set((Array.isArray(raw.splits) ? raw.splits : [])
    .filter(d => validIso(d) && d > start && d <= end))].sort();
  return {
    id: raw.id ?? null,
    firstName: typeof raw.firstName === 'string' ? raw.firstName : '',
    lastName: typeof raw.lastName === 'string' ? raw.lastName : '',
    category: typeof raw.category === 'string' ? raw.category : '',
    pgy: raw.pgy ?? null,
    start, end,
    scheduledByUs: raw.scheduledByUs !== false,
    obligation: nonNegInt(raw.obligation),
    ranges, splits,
    importedAt: raw.importedAt ?? null,
  };
}

/**
 * Stable identity: `${last}|${first}|${category}|${start}`, lowercase, names letters only.
 * @param {object} rot
 * @returns {string}
 */
export function rotationKey(rot) {
  const letters = s => String(s ?? '').toLowerCase().replace(/[^\p{L}]/gu, '');
  return `${letters(rot?.lastName)}|${letters(rot?.firstName)}|${String(rot?.category ?? '').toLowerCase()}|${rot?.start ?? ''}`;
}

function isOurs(rot) {
  return !!rot && rot.category !== 'EM_BAMC' && rot.scheduledByUs !== false;
}

/**
 * Whole-rotation obligation. Typed chief override wins. Auto: base = shiftTargets[`${category}_${pgy}`];
 * days >= standard (STANDARD_ROTATION_DAYS[category] ?? default) keeps base, shorter scales by days
 * (rounded, min 1 when base > 0). Null for BAMC, scheduledByUs false, unknown base, or bad rotation.
 * @returns {null|{value:number,source:'typed'|'auto',base:number}}
 */
export function rotationObligation(rot, shiftTargets) {
  const r = normalizeRotation(rot);
  if (!r || !isOurs(r)) return null;
  const base = shiftTargets?.[`${r.category}_${r.pgy}`];
  if (typeof base !== 'number' || !Number.isFinite(base)) return null;
  if (r.obligation != null) return { value: r.obligation, source: 'typed', base };
  const days = inclusiveDays(r.start, r.end);
  const std = STANDARD_ROTATION_DAYS[r.category] ?? STANDARD_ROTATION_DAYS.default;
  let value = days >= std ? base : Math.round(base * days / std);
  if (base > 0 && days > 0 && value < 1) value = 1;
  return { value, source: 'auto', base };
}

function cutSegments(r, blocks, extraCuts = []) {
  const cuts = new Set(r.splits);
  for (const b of blocks || []) {
    if (!b || !validIso(b.startDate) || !validIso(b.endDate)) continue;
    cuts.add(b.startDate);
    cuts.add(addIso(b.endDate, 1));
  }
  for (const c of extraCuts) cuts.add(c);
  const points = [r.start, ...[...cuts].filter(c => c > r.start && c <= r.end).sort()];
  const segs = [];
  for (let i = 0; i < points.length; i++) {
    const start = points[i];
    const end = i + 1 < points.length ? addIso(points[i + 1], -1) : r.end;
    const blk = (blocks || []).find(b => b && validIso(b.startDate) && validIso(b.endDate)
      && b.startDate <= start && end <= b.endDate);
    segs.push({ start, end, days: inclusiveDays(start, end), blockId: blk ? (blk.id ?? null) : null });
  }
  return segs;
}

/**
 * Cut [start,end] at every block edge inside it and at every chief split (a new segment STARTS on
 * the split date). blockId is the block fully containing the segment, else null.
 * @param {object} rot
 * @param {{id:*,startDate:string,endDate:string}[]} blocks any order
 * @returns {{start:string,end:string,days:number,blockId:*}[]} date order; [] for a bad rotation
 */
export function rotationSegments(rot, blocks) {
  const r = normalizeRotation(rot);
  return r ? cutSegments(r, blocks) : [];
}

/**
 * Max shifts a segment can hold: days minus one rest day per 7 (6-day streak approximation), min 0.
 * @param {{days:number}} seg
 */
export function segmentCapacity(seg) {
  const d = Number(seg?.days) || 0;
  return Math.max(0, d - Math.floor(d / 7));
}

// Largest-remainder split of `total` over weights; ties to earlier index. Returns int array.
function shareByWeight(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || total <= 0) return weights.map(() => 0);
  const raw = weights.map(w => total * w / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i]++;
  return out;
}

/**
 * Per-segment ledger of one rotation relative to the open block.
 * Pinned ranges: each range's start and end+1 become extra cut points so segments align with it;
 * the segments a range covers share its count by days (largest remainder) and carry its source.
 * Overlapping ranges: earlier start (then earlier end, then input order) claims a segment first.
 * Pinned counts are never capped (chief wins) and never add to cannotFit.
 * Remaining = max(0, obligation - pinned) spreads over unpinned segments by days (largest
 * remainder, ties to earlier), each capped at segmentCapacity; overflow goes to other unpinned
 * segments with spare capacity; what still does not fit is cannotFit. Auto segments have source 'auto'.
 * Returns null for null obligation, BAMC, scheduledByUs false, bad rotation or bad block.
 * `today` is accepted and unused (pure, no clock).
 * @returns {null|{obligation:number,obligationSource:string,base:number,doneBefore:number,
 *   doneBeforeSource:'typed'|'qgenda'|'saved'|'estimated'|'none',dueHere:number,owedAfter:number,
 *   cannotFit:number,segments:{start:string,end:string,days:number,blockId:*,where:'before'|'here'|'after',
 *   capacity:number,count:number,source:'typed'|'qgenda'|'saved'|'auto'}[]}}
 */
export function rotationLedger(rot, block, { blocks = [], shiftTargets, today } = {}) {
  void today;
  const r = normalizeRotation(rot);
  if (!r || !isOurs(r)) return null;
  const ob = rotationObligation(r, shiftTargets);
  if (!ob) return null;
  if (!block || !validIso(block.startDate) || !validIso(block.endDate)) return null;

  const allBlocks = [...(blocks || []), block];
  const cuts = [];
  for (const g of r.ranges) cuts.push(g.start, addIso(g.end, 1));
  const segs = cutSegments(r, allBlocks, cuts).map(s => ({
    ...s,
    where: s.end < block.startDate ? 'before' : s.start > block.endDate ? 'after' : 'here',
    capacity: segmentCapacity(s),
    count: 0,
    source: 'auto',
  }));

  const sortedRanges = r.ranges.map((g, i) => ({ g, i }))
    .sort((a, b) => a.g.start.localeCompare(b.g.start) || a.g.end.localeCompare(b.g.end) || a.i - b.i)
    .map(x => x.g);
  const pinned = new Array(segs.length).fill(false);
  let pinnedTotal = 0;
  for (const g of sortedRanges) {
    const idx = [];
    segs.forEach((s, i) => { if (!pinned[i] && s.start >= g.start && s.end <= g.end) idx.push(i); });
    if (!idx.length) continue;
    const parts = shareByWeight(g.count, idx.map(i => segs[i].days));
    idx.forEach((i, k) => {
      segs[i].count = parts[k];
      segs[i].source = g.source;
      pinned[i] = true;
      pinnedTotal += parts[k];
    });
  }

  let remaining = Math.max(0, ob.value - pinnedTotal);
  for (let guard = 0; remaining > 0 && guard < segs.length + 2; guard++) {
    const open = segs.map((s, i) => i).filter(i => !pinned[i] && segs[i].count < segs[i].capacity);
    if (!open.length) break;
    const parts = shareByWeight(remaining, open.map(i => segs[i].days));
    let placed = 0;
    open.forEach((i, k) => {
      const add = Math.min(parts[k], segs[i].capacity - segs[i].count);
      segs[i].count += add;
      placed += add;
    });
    remaining -= placed;
    if (placed === 0) break;
  }
  const cannotFit = remaining;

  const sum = w => segs.filter(s => s.where === w).reduce((a, s) => a + s.count, 0);
  const before = segs.filter(s => s.where === 'before');
  let doneBeforeSource = before.length ? 'estimated' : 'none';
  let rank = 0;
  for (const s of before) {
    if ((SOURCE_RANK[s.source] || 0) > rank) { rank = SOURCE_RANK[s.source]; doneBeforeSource = s.source; }
  }
  return {
    obligation: ob.value,
    obligationSource: ob.source,
    base: ob.base,
    doneBefore: sum('before'),
    doneBeforeSource,
    dueHere: sum('here'),
    owedAfter: sum('after'),
    cannotFit,
    segments: segs,
  };
}
