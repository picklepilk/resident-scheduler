import { useLayoutEffect, useState } from 'react';

/** Wall-clock budget (Date.now, not a frame count — a throttled/background
 *  tab shouldn't wait forever) for `document.querySelector` retries before
 *  giving up and reporting `'missing'`. */
export const ACQUIRE_TIMEOUT_MS = 2500;

/** Consecutive unchanged rAF measurements before the tracking loop parks
 *  itself. Resize/scroll/ResizeObserver still re-arm a fresh short burst. */
export const SETTLE_FRAMES = 3;

// Dev-only duplicate-target guard: warn at most once per key, ever, so a
// step that legitimately re-polls a duplicated anchor doesn't spam the
// console every rAF tick.
const warnedDuplicateKeys = new Set();

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function roundRect(r) {
  return {
    top: Math.round(r.top),
    left: Math.round(r.left),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

function rectsEqual(a, b) {
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/**
 * Resolves `document.querySelector([data-tour="<key>"])` and tracks its
 * bounding rect over time. `epoch` should be the current walkthrough step
 * index — passing a new epoch restarts acquisition even when `key` is
 * unchanged (two consecutive steps may share one target). `enabled` gates
 * the whole hook (e.g. the walkthrough being off) — when false, does no DOM
 * work.
 *
 * Implemented as one `useLayoutEffect` keyed on `[key, epoch, enabled]` so a
 * synchronous first acquire+measure attempt happens in the same commit when
 * the anchor is already mounted. `rect` is deliberately NOT a dependency —
 * re-running on every measured rect would tear down and re-acquire every
 * frame.
 *
 * Ported verbatim from Epic Demo's src/components/common/useSpotlightTarget.ts
 * (TypeScript types stripped; logic unchanged).
 */
export function useSpotlightTarget(key, epoch, enabled) {
  const [state, setState] = useState({ status: 'idle', rect: null });

  useLayoutEffect(() => {
    if (!key || !enabled) {
      setState({ status: 'idle', rect: null });
      return;
    }
    const tourKey = key;

    let cancelled = false;
    let rafId = null;
    let el = null;
    let lastRaw = null;
    let settleCount = 0;
    let acquireDeadline = Date.now() + ACQUIRE_TIMEOUT_MS;

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => kick()) : null;

    function warnIfDuplicate() {
      if (document.querySelectorAll(`[data-tour="${tourKey}"]`).length > 1 && !warnedDuplicateKeys.has(tourKey)) {
        warnedDuplicateKeys.add(tourKey);
        console.warn(`[useSpotlightTarget] multiple elements match data-tour="${tourKey}"`);
      }
    }

    function measure() {
      if (!el) return;
      const raw = roundRect(el.getBoundingClientRect());
      const changed = lastRaw === null || !rectsEqual(lastRaw, raw);
      if (changed) {
        lastRaw = raw;
        settleCount = 0;
        setState({ status: 'found', rect: raw.width <= 0 || raw.height <= 0 ? null : raw });
      } else {
        settleCount++;
      }
    }

    function acquire() {
      const found = document.querySelector(`[data-tour="${tourKey}"]`);
      if (!found) return false;
      warnIfDuplicate();
      el = found;
      lastRaw = null;
      settleCount = 0;
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
      if (ro) {
        ro.observe(el);
        ro.observe(document.documentElement);
      }
      return true;
    }

    function trackTick() {
      if (cancelled || !el) return;
      if (!el.isConnected) {
        el = null;
        acquireDeadline = Date.now() + ACQUIRE_TIMEOUT_MS;
        setState({ status: 'searching', rect: null });
        rafId = requestAnimationFrame(acquireLoop);
        return;
      }
      measure();
      if (settleCount >= SETTLE_FRAMES) {
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(trackTick);
    }

    function acquireLoop() {
      if (cancelled) return;
      if (acquire()) {
        measure();
        rafId = requestAnimationFrame(trackTick);
        return;
      }
      if (Date.now() >= acquireDeadline) {
        setState({ status: 'missing', rect: null });
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(acquireLoop);
    }

    function kick() {
      if (cancelled || !el) return;
      settleCount = 0;
      if (rafId === null) {
        rafId = requestAnimationFrame(trackTick);
      }
    }

    setState({ status: 'searching', rect: null });

    // Synchronous first attempt — same commit if the anchor is already
    // mounted, rather than waiting a frame.
    if (acquire()) {
      measure();
      rafId = requestAnimationFrame(trackTick);
    } else {
      rafId = requestAnimationFrame(acquireLoop);
    }

    window.addEventListener('resize', kick);
    window.addEventListener('scroll', kick, { capture: true, passive: true });

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener('resize', kick);
      window.removeEventListener('scroll', kick, { capture: true });
    };
  }, [key, epoch, enabled]);

  return state;
}
