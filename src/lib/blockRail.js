// src/lib/blockRail.js
// Pure data shaping for the Dashboard's academic-year block rail. Lib-legal: every input is a plain
// value the caller already holds (blocksHistory snapshots + the live block) - nothing here reads
// ResidentScheduler.jsx state.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Sorted-descending unique AY strings across saved snapshots and the live block ('Unknown' = no AY). */
export function ayOptionsFor(blocksHistory, liveBlock) {
  const set = new Set((Array.isArray(blocksHistory) ? blocksHistory : []).map(b => b?.academicYear || 'Unknown'));
  if (liveBlock?.academicYear) set.add(liveBlock.academicYear);
  return [...set].sort((a, b) => b.localeCompare(a));
}

/**
 * One entry per block of `ay`, sorted by start date. The live block stands in for the snapshot with
 * its id (so its schedule/activity are the live ones), or is appended as `unsaved` when no snapshot
 * matches. `snap` is always present (a stub for an unsaved live block).
 */
export function buildRailBlocks({ blocksHistory, liveBlock, ay }) {
  const history = Array.isArray(blocksHistory) ? blocksHistory : [];
  const snaps = history.filter(b => (b?.academicYear || 'Unknown') === ay);
  const liveMatchesAy = !!liveBlock && liveBlock.academicYear === ay && !!liveBlock.startDate;
  const liveMatchesSnapshot = liveMatchesAy && snaps.some(s => s.id === liveBlock.id);

  const list = snaps.map(snap => {
    const isLive = liveMatchesAy && snap.id === liveBlock.id;
    return {
      key: snap.id, id: snap.id,
      // The live row shows the live block's own name/dates (unsaved edits included).
      name: isLive ? (liveBlock.name || snap.name || '') : (snap.name || ''),
      startDate: isLive ? liveBlock.startDate : (snap.startDate || snap.data?.startDate),
      endDate: isLive ? (liveBlock.endDate || snap.endDate || snap.data?.endDate) : (snap.endDate || snap.data?.endDate),
      isLive, unsaved: false,
      published: !!snap.published,
      imported: typeof snap.id === 'string' && snap.id.startsWith('blk_import_'),
      schedule: isLive ? (liveBlock.schedule || {}) : (snap.data?.schedule || {}),
      activityLog: isLive ? (liveBlock.activityLog || []) : (snap.data?.activityLog || []),
      snap,
    };
  });
  if (liveMatchesAy && !liveMatchesSnapshot) {
    list.push({
      key: `__live_${liveBlock.id}`, id: liveBlock.id,
      name: liveBlock.name || '',
      startDate: liveBlock.startDate, endDate: liveBlock.endDate,
      isLive: true, unsaved: true, published: false, imported: false,
      schedule: liveBlock.schedule || {},
      activityLog: liveBlock.activityLog || [],
      snap: { id: liveBlock.id, name: liveBlock.name, published: false },
    });
  }
  return list.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
}

/** Two-digit block numeral: first integer in the name, else position (1-based). */
export function railNumeral(name, index) {
  const m = /\d+/.exec(typeof name === 'string' ? name : '');
  const n = m ? parseInt(m[0], 10) : (Number(index) || 0) + 1;
  return String(n).padStart(2, '0');
}

function dayNumber(iso) {
  const m = ISO_RE.exec(iso || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
}

/** Which block contains `todayIso`, and where (0..1, centre of today's day column) within its inclusive span. */
export function todayMarker(blocks, todayIso) {
  const t = dayNumber(todayIso);
  if (t == null) return null;
  for (const b of Array.isArray(blocks) ? blocks : []) {
    const s = dayNumber(b?.startDate), e = dayNumber(b?.endDate);
    if (s == null || e == null || e < s) continue;
    if (t >= s && t <= e) return { key: b.key, fraction: (t - s + 0.5) / (e - s + 1) };
  }
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(iso) {
  const m = ISO_RE.exec(iso || '');
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}` : '';
}

/** "Oct 13-Nov 9" (en dash) for the rail cell; '' when either date is missing. */
export function shortDateRange(startIso, endIso) {
  const a = shortDate(startIso), b = shortDate(endIso);
  if (!a || !b) return a || b || '';
  return `${a}–${b}`;
}
