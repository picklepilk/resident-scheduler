// src/lib/offServiceLanes.js
// Pure geometry for the Dashboard's off-service lanes. Display-only; never feeds targets.
// Lib module - must not import ResidentScheduler.jsx.
//
// Block i occupies [i*cellWidth, (i+1)*cellWidth); a day at offset d of n days in block i spans
// [i*cw + d/n*cw, i*cw + (d+1)/n*cw). A window's START uses its day's left edge, its END the day's
// right edge. Window ends outside every block clamp to the rail edge (or the neighbouring block
// edge when it falls in a gap) and set contLeft/contRight so the UI can draw an arrow cap.
// startMid/endMid mark an edge that lands inside a block rather than on its first/last day - the
// "not synced with our blocks" signal.

const DAY_MS = 86_400_000;
const dayNum = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS : null;
};

/** Block-boundary x positions: n+1 entries (0, cw, 2cw ...). */
export function laneBoundaries(blockCount, cellWidth) {
  return Array.from({ length: Math.max(0, blockCount) + 1 }, (_, i) => i * cellWidth);
}

/**
 * @param blocks [{start,end}] sorted ascending (ISO inclusive)
 * @param window {start,end}
 * @returns {x0,x1,startMid,endMid,contLeft,contRight,outside} | null for an invalid window
 */
export function laneBar(blocks, window, cellWidth) {
  const list = Array.isArray(blocks) ? blocks : [];
  const ws = dayNum(window?.start), we = dayNum(window?.end);
  if (!list.length || ws == null || we == null || we < ws) return null;
  const spans = list.map(b => ({ s: dayNum(b.start), e: dayNum(b.end) }));
  const total = list.length * cellWidth;

  const locate = t => {
    for (let i = 0; i < spans.length; i++) {
      const { s, e } = spans[i];
      if (s == null || e == null) continue;
      if (t >= s && t <= e) return { i, d: t - s, n: e - s + 1 };
    }
    return null;
  };

  let x0, x1, startMid = false, endMid = false, contLeft = false, contRight = false;

  const sp = locate(ws);
  if (sp) {
    x0 = sp.i * cellWidth + (sp.d / sp.n) * cellWidth;
    startMid = sp.d > 0;
  } else if (ws < spans[0].s) {
    x0 = 0; contLeft = true;
  } else if (ws > spans[spans.length - 1].e) {
    x0 = total; contRight = true;
  } else {
    // gap between blocks: begin at the next block's left edge, flag as continuing from outside
    const j = spans.findIndex(sb => sb.s > ws);
    x0 = j * cellWidth; contLeft = true;
  }

  const ep = locate(we);
  if (ep) {
    x1 = ep.i * cellWidth + ((ep.d + 1) / ep.n) * cellWidth;
    endMid = ep.d < ep.n - 1;
  } else if (we > spans[spans.length - 1].e) {
    x1 = total; contRight = true;
  } else if (we < spans[0].s) {
    x1 = 0; contLeft = true;
  } else {
    let j = -1;
    for (let i = 0; i < spans.length; i++) if (spans[i].e < we) j = i;
    x1 = (j + 1) * cellWidth; contRight = true;
  }

  if (x1 < x0) x1 = x0;
  return { x0, x1, startMid, endMid, contLeft, contRight, outside: x1 === x0 };
}
