import React, { useState, useEffect, useRef } from 'react';
import {
  extractBundleHash, isStale, shouldRunCheck, bannerVisibleAfterStaleCheck,
  VERSION_POLL_MS, VERSION_SNOOZE_MS, VERSION_FETCH_TIMEOUT_MS,
} from './lib/versionCheck.js';

// Polls the deployed index.html (cache-busted, no-store) for the hashed entry bundle name and
// compares with the one this tab loaded. Inert in dev (no hashed bundle, Vite HMR instead).
function useUpdateAvailable() {
  const [stale, setStale] = useState(false);
  const dismissedAtRef = useRef(null);
  const lastCheckRef = useRef(null);
  const currentRef = useRef(null);

  useEffect(() => {
    if (import.meta.env.DEV || typeof document === 'undefined') return undefined;
    const tag = Array.from(document.querySelectorAll('script[type="module"][src]'))
      .map(s => extractBundleHash(s.getAttribute('src'))).find(Boolean);
    currentRef.current = tag || null;
    if (!currentRef.current) return undefined;
    let cancelled = false;

    async function check(force) {
      const now = Date.now();
      if (!force && !shouldRunCheck(lastCheckRef.current, now)) return;
      lastCheckRef.current = now;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), VERSION_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(`/?v=${now}`, { cache: 'no-store', signal: ctrl.signal });
        if (!res.ok) return;
        const latest = extractBundleHash(await res.text());
        if (cancelled) return;
        if (isStale(currentRef.current, latest)) {
          setStale(bannerVisibleAfterStaleCheck(dismissedAtRef.current, Date.now(), VERSION_SNOOZE_MS));
        }
      } catch { /* offline / aborted: never show a false banner */ }
      finally { clearTimeout(t); }
    }
    const onVis = () => { if (document.visibilityState === 'visible') check(false); };
    const iv = setInterval(() => check(true), VERSION_POLL_MS);
    window.addEventListener('focus', onVis);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true; clearInterval(iv);
      window.removeEventListener('focus', onVis);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const dismiss = () => { dismissedAtRef.current = Date.now(); setStale(false); };
  return { stale, dismiss };
}

// `flush` = root's flushPendingCloudSave (never throws). Reload only after it settles.
export default function UpdateBanner({ flush }) {
  const { stale, dismiss } = useUpdateAvailable();
  const [busy, setBusy] = useState(false);
  if (!stale) return null;
  const reload = async () => {
    setBusy(true);
    try { await flush?.(); } catch { /* best effort */ }
    window.location.reload();
  };
  return (
    <div role="status" aria-live="polite"
      className="no-print shrink-0 flex items-center justify-between gap-3 px-5 py-2 bg-amber-50 border-b border-amber-300 text-amber-900 text-sm">
      <span>A newer version is available. Your work is saved first.</span>
      <span className="flex items-center gap-2 flex-none">
        <button type="button" onClick={reload} disabled={busy}
          className="px-3 py-1 rounded-md text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60">
          {busy ? 'Saving…' : 'Reload'}
        </button>
        <button type="button" onClick={dismiss} disabled={busy}
          className="px-3 py-1 rounded-md text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60">
          Later
        </button>
      </span>
    </div>
  );
}
