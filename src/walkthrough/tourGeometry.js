/**
 * Pure geometry helpers for a guided-tour spotlight: a scrim with a
 * rectangular cutout over a highlighted element, plus a floating
 * instruction card that repositions to avoid covering the highlighted
 * element.
 *
 * No React, no DOM APIs — pure functions operating on plain numbers, fully
 * unit-testable. Ported verbatim from Epic Demo's
 * src/components/common/tourGeometry.ts (TypeScript types stripped; logic
 * unchanged).
 */

/** The app header is a fixed ~56px bar at the top of the viewport and must
 *  never be dimmed by the tour scrim — enforced geometrically: the scrim's
 *  top edge never goes above y=20 (mirrors Epic's own SCRIM_TOP, which
 *  protected its synthetic-data banner the same way). */
export const SCRIM_TOP = 20;
export const SPOTLIGHT_PAD = 6;
export const CARD_W = 380;
export const CARD_H_FALLBACK = 260;
export const CARD_GAP = 16;

/**
 * Pure. Given the target element's rect, the viewport size, and an optional
 * padding, returns the four rectangles (top/bottom/left/right) that together
 * cover the viewport EXCEPT a padded hole around the target — i.e. the scrim
 * geometry for a "spotlight cutout" effect using four plain divs (chosen over
 * box-shadow-based cutouts because a box-shadow scrim can't be simultaneously
 * click-blocking outside the hole AND click-passthrough inside it; four empty
 * rects have no element covering the hole at all, so hit-testing is correct
 * for free).
 *
 * Rounds outward (floor on top/left edges of the hole, ceil on right/bottom)
 * so adjacent rects always overlap by up to 1px rather than leaving a gap.
 *
 * Returns null for a degenerate/zero-size target (e.g. an element that is
 * display:none, not yet laid out, or — notably — ANY element measured in
 * jsdom, since jsdom's getBoundingClientRect always returns zeros). Callers
 * must treat null as "render no scrim at all", not as an error.
 */
export function scrimRects(target, vp, pad = SPOTLIGHT_PAD) {
  if (target.width <= 0 || target.height <= 0) return null;

  // The padded hole, rounded outward so neighboring rects overlap rather
  // than gap, then clamped to the viewport (and to the banner-safe top).
  const holeTop = Math.max(SCRIM_TOP, Math.floor(target.top - pad));
  const holeLeft = Math.max(0, Math.floor(target.left - pad));
  const holeRight = Math.min(vp.width, Math.ceil(target.left + target.width + pad));
  const holeBottom = Math.min(vp.height, Math.ceil(target.top + target.height + pad));

  const top = {
    top: SCRIM_TOP,
    left: 0,
    width: Math.max(0, vp.width),
    height: Math.max(0, holeTop - SCRIM_TOP),
  };

  const bottom = {
    top: holeBottom,
    left: 0,
    width: Math.max(0, vp.width),
    height: Math.max(0, vp.height - holeBottom),
  };

  const left = {
    top: holeTop,
    left: 0,
    width: Math.max(0, holeLeft),
    height: Math.max(0, holeBottom - holeTop),
  };

  const right = {
    top: holeTop,
    left: Math.min(vp.width, holeRight),
    width: Math.max(0, vp.width - holeRight),
    height: Math.max(0, holeBottom - holeTop),
  };

  return { top, bottom, left, right };
}

/** Grows `rect` by `amount` on all sides. Assumes a non-negative `amount`. */
export function inflate(rect, amount) {
  return {
    top: rect.top - amount,
    left: rect.left - amount,
    width: Math.max(0, rect.width + 2 * amount),
    height: Math.max(0, rect.height + 2 * amount),
  };
}

/** The card's rect if placed in the given viewport corner, inset by CARD_GAP. */
export function cornerBox(corner, card, vp) {
  switch (corner) {
    case 'bottom-right':
      return {
        top: vp.height - card.height - CARD_GAP,
        left: vp.width - card.width - CARD_GAP,
        width: card.width,
        height: card.height,
      };
    case 'bottom-left':
      return {
        top: vp.height - card.height - CARD_GAP,
        left: CARD_GAP,
        width: card.width,
        height: card.height,
      };
    case 'top-right':
      return {
        top: CARD_GAP,
        left: vp.width - card.width - CARD_GAP,
        width: card.width,
        height: card.height,
      };
    case 'top-left':
      return {
        top: CARD_GAP,
        left: CARD_GAP,
        width: card.width,
        height: card.height,
      };
    default:
      return { top: CARD_GAP, left: CARD_GAP, width: card.width, height: card.height };
  }
}

/** Standard 2D rectangle intersection area; 0 if disjoint. */
export function overlapArea(a, b) {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

/**
 * Pure. Picks which viewport corner the instruction card should occupy so it
 * overlaps the (padded) target rect as little as possible.
 *
 * - If `target` is null or degenerate (width<=0 or height<=0), always returns
 *   'bottom-right' (today's fixed position, unchanged default behavior).
 * - Otherwise: build a candidate corner order based on which HALF of the
 *   viewport the target's center falls into — if the target's horizontal
 *   center is left of viewport-center, prefer right-side corners first
 *   (['bottom-right','top-right','bottom-left','top-left']); else prefer
 *   left-side corners first (['bottom-left','top-left','bottom-right','top-right']).
 * - For each candidate corner in that order, compute the card's bounding box
 *   at that corner (using `card.width`/`card.height`, positioned with
 *   CARD_GAP inset from the relevant viewport edges) and compute its overlap
 *   area with the target rect inflated by CARD_GAP on all sides. Return the
 *   FIRST corner with zero overlap.
 * - If none has zero overlap (target is huge), return the corner with the
 *   SMALLEST overlap area (still a deterministic, valid corner).
 */
export function pickCardCorner(target, card, vp) {
  if (target === null || target.width <= 0 || target.height <= 0) {
    return 'bottom-right';
  }

  const targetCenterX = target.left + target.width / 2;
  const vpCenterX = vp.width / 2;

  const candidates =
    targetCenterX < vpCenterX
      ? ['bottom-right', 'top-right', 'bottom-left', 'top-left']
      : ['bottom-left', 'top-left', 'bottom-right', 'top-right'];

  const inflatedTarget = inflate(target, CARD_GAP);

  let best = candidates[0];
  let bestOverlap = Infinity;

  for (const corner of candidates) {
    const box = cornerBox(corner, card, vp);
    const overlap = overlapArea(box, inflatedTarget);
    if (overlap === 0) {
      return corner;
    }
    if (overlap < bestOverlap) {
      bestOverlap = overlap;
      best = corner;
    }
  }

  return best;
}
