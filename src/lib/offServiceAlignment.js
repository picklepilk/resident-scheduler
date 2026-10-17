// src/lib/offServiceAlignment.js
// Pure, display-only: how each off-service resident's real ER window lines up with this AY's block
// edges. Never feeds targets. Lib module — must not import ResidentScheduler.jsx.
//
// `ay` is the app's format ("AY26/27", see dates.js formatAY). Dates are ISO, inclusive.
// Status precedence (first match wins): noWindow, legacyClamped, outside, split, straddles, aligned.
// Interpretation choices:
//  - legacyClamped requires every record to carry exactly one range equal to its own block bounds,
//    in CONSECUTIVE blocks (a clamped legacy import of one window lands in adjacent blocks).
//    Bound-exact records in non-consecutive blocks are separate genuine rotations -> split.
//  - A person is ONE resident row; distinct windows are listed in `windows` (no `#n` key suffix).
//  - segments cover every AY block a window overlaps, whether or not the person has a record there.

import { parseDate, ayWindowFor } from './dates.js';
import { offServiceStraddle } from './offServiceWindow.js';

const DAY_MS = 86_400_000;
const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDate(s).getTime());
// Pure UTC math on the ISO string: dates.js parseDate is local-midnight but toDateStr is UTC, which
// breaks east of UTC. Never route day arithmetic here through those.
const utcDay = ds => { const [y, m, d] = ds.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const shiftDay = (ds, n) => new Date(utcDay(ds) + n * DAY_MS).toISOString().slice(0, 10);
const dayCount = (a, b) => Math.round((utcDay(b) - utcDay(a)) / DAY_MS) + 1;
export const nextDay = ds => shiftDay(ds, 1);
export const prevDay = ds => shiftDay(ds, -1);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = ds => `${MONTHS[Number(ds.slice(5, 7)) - 1]} ${Number(ds.slice(8, 10))}`;
const fmtRange = (s, e) => `${fmt(s)}–${fmt(e)}`;
const str = v => (typeof v === 'string' ? v.trim() : '');
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const STATUS_ORDER = { legacyClamped: 0, outside: 1, split: 2, straddles: 3, aligned: 4, noWindow: 5 };

/**
 * Collapse overlapping or day-adjacent windows (next.start <= day after prev.end) into one stint.
 * Input need not be sorted. Invalid entries are dropped. Returns new sorted [{start,end}].
 */
export function mergeWindows(windows) {
  const list = (Array.isArray(windows) ? windows : [])
    .filter(w => w && isIso(w.start) && isIso(w.end) && w.start <= w.end)
    .map(w => ({ start: w.start, end: w.end }))
    .sort((a, b) => cmp(a.start, b.start) || cmp(a.end, b.end));
  const out = [];
  for (const w of list) {
    const last = out[out.length - 1];
    if (last && w.start <= nextDay(last.end)) {
      if (w.end > last.end) last.end = w.end;
    } else out.push(w);
  }
  return out;
}

function collectBlocks(snapshots, liveBlock, ay) {
  const win = ayWindowFor(ay);
  const byId = new Map();
  const consider = (src, data, isLive) => {
    if (!src || typeof src !== 'object') return;
    const start = src.startDate ?? data?.startDate;
    const end = src.endDate ?? data?.endDate;
    if (!isIso(start) || !isIso(end) || start > end) return;
    const blockAy = src.academicYear ?? data?.academicYear;
    const inAy = blockAy != null ? blockAy === ay : !!win && start >= win.start && start < win.end;
    if (!inAy) return;
    const id = src.id ?? data?.id ?? `${start}|${end}`;
    const recs = data?.offServiceResidents;
    byId.set(id, {
      id, name: src.name ?? data?.name ?? '', start, end, isLive,
      records: Array.isArray(recs) ? recs : [],
    });
  };
  if (Array.isArray(snapshots)) for (const s of snapshots) consider(s, s?.data, false);
  if (liveBlock && liveBlock.academicYear === ay) consider(liveBlock, liveBlock, true);
  return [...byId.values()].sort((a, b) => cmp(a.start, b.start));
}

export function buildOffServiceAlignment({ snapshots = [], liveBlock = null, ay } = {}) {
  const blocks = collectBlocks(snapshots, liveBlock, ay);
  const idx = new Map(blocks.map((b, i) => [b.id, i]));

  const people = new Map();
  for (const b of blocks) {
    for (const rec of b.records) {
      if (!rec || typeof rec !== 'object') continue;
      const first = str(rec.firstName), last = str(rec.lastName);
      if (!first && !last) continue;
      const key = `${first}|${last}|${str(rec.category)}`.toLowerCase();
      let p = people.get(key);
      if (!p) {
        p = { key, name: [first, last].filter(Boolean).join(' '), category: rec.category, pgy: rec.pgy, recs: [] };
        people.set(key, p);
      }
      const ranges = rec.availabilityMode === 'ranges' && Array.isArray(rec.availableRanges)
        ? rec.availableRanges.filter(r => r && isIso(r.start) && isIso(r.end) && r.start <= r.end)
        : [];
      p.recs.push({ block: b, ranges });
    }
  }

  const residents = [];
  for (const p of people.values()) {
    const blockIds = [...new Set(p.recs.map(r => r.block.id))];
    const winMap = new Map();
    for (const r of p.recs) for (const rg of r.ranges) winMap.set(`${rg.start}|${rg.end}`, { start: rg.start, end: rg.end });
    // legacyClamped below inspects the RAW per-record ranges (adjacent bound-exact); merge only here.
    const windows = mergeWindows([...winMap.values()]);

    const segments = [];
    const notes = [];
    const overlapped = new Set();
    const outsideSpans = [];
    for (const w of windows) {
      const covered = [];
      for (const b of blocks) {
        const s = w.start > b.start ? w.start : b.start;
        const e = w.end < b.end ? w.end : b.end;
        if (s > e) continue;
        const st = offServiceStraddle([w], b.start, b.end);
        segments.push({ blockId: b.id, start: s, end: e, days: dayCount(s, e), daysBefore: st?.daysBefore ?? 0, daysAfter: st?.daysAfter ?? 0 });
        overlapped.add(idx.get(b.id));
        covered.push([s, e]);
      }
      // blocks are sorted by start, so `covered` is ascending; walk it to find gaps in the window
      let cur = w.start;
      for (const [s, e] of covered) {
        if (s > cur) outsideSpans.push([cur, prevDay(s)]);
        const n = nextDay(e);
        if (n > cur) cur = n;
      }
      if (cur <= w.end) outsideSpans.push([cur, w.end]);
    }

    let status;
    if (!windows.length) {
      status = 'noWindow';
    } else if (
      p.recs.length >= 2 && blockIds.length >= 2 &&
      (() => { const ix = blockIds.map(id => idx.get(id)).sort((a, b) => a - b); return ix.every((v, i) => i === 0 || v === ix[i - 1] + 1); })() &&
      p.recs.every(r => r.ranges.length === 1 && r.ranges[0].start === r.block.start && r.ranges[0].end === r.block.end) &&
      new Set(p.recs.map(r => `${r.ranges[0].start}|${r.ranges[0].end}`)).size > 1
    ) {
      status = 'legacyClamped';
      notes.push("Ranges match each block's edges exactly — likely an older import; re-import the Master Matrix to verify.");
    } else if (outsideSpans.length) {
      status = 'outside';
      for (const [s, e] of outsideSpans) notes.push(`Window days ${fmtRange(s, e)} fall outside any saved block this AY`);
    } else {
      const ov = [...overlapped].sort((a, b) => a - b);
      const consecutive = ov.every((v, i) => i === 0 || v === ov[i - 1] + 1);
      if (windows.length > 1 || !consecutive) {
        status = 'split';
        if (windows.length > 1) notes.push(`${windows.length} separate windows: ${windows.map(w => fmtRange(w.start, w.end)).join(', ')}`);
        else notes.push('Window skips over blocks that are not consecutive');
      } else {
        const w = windows[0];
        const first = blocks[ov[0]], last = blocks[ov[ov.length - 1]];
        const label = b => b.name || b.id;
        if (w.start > first.start) notes.push(`Window ${fmtRange(w.start, w.end)} starts mid-block in ${label(first)}`);
        if (w.end < last.end) notes.push(`Window ${fmtRange(w.start, w.end)} ends mid-block in ${label(last)}`);
        status = notes.length ? 'straddles' : 'aligned';
      }
    }

    residents.push({ key: p.key, name: p.name, category: p.category, pgy: p.pgy, windows, segments, blockIds, status, notes });
  }

  const lastOf = r => r.name.split(' ').slice(-1)[0].toLowerCase();
  residents.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || cmp(lastOf(a), lastOf(b)) || cmp(a.name, b.name));

  const counts = { aligned: 0, straddles: 0, split: 0, outside: 0, noWindow: 0, legacyClamped: 0, misaligned: 0 };
  for (const r of residents) counts[r.status]++;
  counts.misaligned = counts.straddles + counts.split + counts.outside + counts.legacyClamped;

  return {
    blocks: blocks.map(({ id, name, start, end, isLive }) => ({ id, name, start, end, isLive })),
    residents,
    counts,
  };
}
