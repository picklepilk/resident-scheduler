// Per-viewer UI preferences (sidebar "Other" overflow membership, per-card collapsed/expanded
// state) — device-local by default, with an optional per-profile cloud overlay when auth is
// configured. Deliberately standalone (imports only React + supabaseClient, never
// ResidentScheduler.jsx) so it stays unit-testable in isolation and ResidentScheduler.jsx doesn't
// have to pull in auth UI to use it. Plain .js (no JSX) — the Provider below uses
// React.createElement instead of a `.jsx` extension, on purpose, to match the file's declared
// module type.
//
// Storage posture mirrors `res_dark_mode` (see ResidentScheduler.jsx's LS_BACKUP_KEYS comment):
// this is a device/viewer display preference, not chief scheduling data, so it is NOT one of the
// nine `LS_BACKUP_KEYS` slots and never rides through Settings backup/restore or the hand-rolled
// `res_state` cloud sync. It is also NOT wrapped by the Demo Sandbox's `physKey` — same reasoning
// as `res_dark_mode`: a viewer's own UI layout preference has nothing to do with which sandbox
// they're currently poking at.
import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, createElement } from 'react';
import { supabase, AUTH_ENABLED } from './supabaseClient.js';
import { DEFAULT_UI_PREFS, normalizeUiPrefs } from './lib/uiPrefs.js';

export const UI_PREFS_KEY = 'res_ui_prefs';
export { normalizeUiPrefs } from './lib/uiPrefs.js';

function readDeviceLocal() {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    return raw ? normalizeUiPrefs(JSON.parse(raw)) : { ...DEFAULT_UI_PREFS };
  } catch {
    return { ...DEFAULT_UI_PREFS };
  }
}

const UI_PREFS_SAVE_DEBOUNCE_MS = 1500;

// `viewer` is the same `{email, userId, role}` shape AppGate hands ResidentScheduler — `userId` is
// `auth.users.id` / `profiles.id`. Auth off (dev fallthrough, or unconfigured build) or no viewer
// yet: device-local only, identical behavior to before this feature existed.
export function useUiPrefs(viewer) {
  const [prefs, setPrefs] = useState(readDeviceLocal);
  // Gates the debounced cloud SAVE effect until the mount-time cloud LOAD has resolved (or there
  // is nothing to load) — same "don't overwrite the cloud with pre-load local state" discipline as
  // the `dbReady` gate on the hand-rolled res_state sync in ResidentScheduler.jsx. Without this, a
  // fresh tab would briefly hold only the device-local value, and the save effect firing before
  // the cloud read returns would clobber a genuinely different cloud value with it.
  const cloudLoadedRef = useRef(!AUTH_ENABLED);
  const saveTimerRef = useRef(null);
  // Set by setCardOpen/toggleTabOverflow/setShowUnscheduled when they fire while the mount-time
  // cloud load is still in flight. Without this, a real local edit made in that narrow window was
  // silently destroyed the instant the load's `setPrefs(normalizeUiPrefs(data.ui_prefs))` landed
  // — or, if the load found nothing to overlay, the edit itself survived but never reached the
  // cloud, since the save effect below had already bailed out on `!cloudLoadedRef.current` and
  // nothing re-triggers it once that ref flips true (refs aren't effect deps). The load effect
  // below both skips the overwrite and flushes the pending edit once it resolves.
  const editedDuringLoadRef = useRef(false);
  // Re-assigned on every render (not inside an effect) so it always closes over the latest
  // `prefs`/`viewer` — the debounced save effect and the post-load flush both call through this
  // ref instead of duplicating the save call, so there is exactly one place that talks to
  // Supabase for a save.
  const saveNowRef = useRef(() => {});
  saveNowRef.current = async () => {
    if (!AUTH_ENABLED || !viewer?.userId) return;
    const { error } = await supabase.from('profiles').update({ ui_prefs: prefs }).eq('id', viewer.userId);
    if (error) console.warn('uiPrefs: cloud save failed', error);
  };

  useEffect(() => {
    try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable — device-local is best-effort */ }
  }, [prefs]);

  // Mount-time (and viewer-change-time) cloud load. Cloud value overlays the device value only
  // when present (`data.ui_prefs != null`) — a brand-new profile with no saved prefs yet must not
  // wipe out whatever this device already has. If a local edit landed while this load was still in
  // flight (`editedDuringLoadRef`), the overlay is skipped entirely (the local edit wins) and that
  // edit is flushed to the cloud immediately once the load resolves.
  useEffect(() => {
    if (!AUTH_ENABLED || !viewer?.userId) { cloudLoadedRef.current = true; return; }
    let cancelled = false;
    cloudLoadedRef.current = false;
    editedDuringLoadRef.current = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('ui_prefs').eq('id', viewer.userId).maybeSingle();
      if (cancelled) return;
      if (data?.ui_prefs != null && !editedDuringLoadRef.current) setPrefs(normalizeUiPrefs(data.ui_prefs));
      cloudLoadedRef.current = true;
      if (editedDuringLoadRef.current) {
        editedDuringLoadRef.current = false;
        saveNowRef.current();
      }
    })();
    return () => { cancelled = true; };
  }, [viewer?.userId]);

  // Debounced per-profile save, using the real auth client (this writes the caller's own
  // `profiles` row, gated by `profiles_update_own` — see supabase/migrate_profile_ui_prefs.sql),
  // not the hand-rolled `sbFetch` client the `res_state` sync uses. Routed through `saveNowRef` so
  // this and the post-load flush above share one implementation; the shared implementation awaits
  // the Supabase builder (a lazy thenable — nothing fires until awaited/thenned) and logs rather
  // than throws on error, since a failed background sync must never crash the app or block local
  // editing.
  useEffect(() => {
    if (!AUTH_ENABLED || !viewer?.userId || !cloudLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveNowRef.current(); }, UI_PREFS_SAVE_DEBOUNCE_MS);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [prefs, viewer?.userId]);

  const setCardOpen = useCallback((prefId, open) => {
    if (!prefId) return;
    if (!cloudLoadedRef.current) editedDuringLoadRef.current = true;
    setPrefs(p => ({ ...p, cardOpen: { ...p.cardOpen, [prefId]: open } }));
  }, []);

  const toggleTabOverflow = useCallback(tabId => {
    if (!tabId) return;
    if (!cloudLoadedRef.current) editedDuringLoadRef.current = true;
    setPrefs(p => ({
      ...p,
      tabOverflow: p.tabOverflow.includes(tabId)
        ? p.tabOverflow.filter(id => id !== tabId)
        : [...p.tabOverflow, tabId],
    }));
  }, []);

  const setShowUnscheduled = useCallback(v => {
    if (!cloudLoadedRef.current) editedDuringLoadRef.current = true;
    setPrefs(p => ({ ...p, showUnscheduled: !!v }));
  }, []);

  // Memoized so consumers reading this via UiPrefsContext (~20 CollapsibleCard call sites plus
  // SidebarNav) don't all re-render on every root render — only when prefs actually change (the
  // four callbacks are already stable via useCallback([]), so in practice this only changes when
  // `prefs` does).
  return useMemo(
    () => ({ prefs, setCardOpen, toggleTabOverflow, setShowUnscheduled }),
    [prefs, setCardOpen, toggleTabOverflow, setShowUnscheduled]
  );
}

// Context so deeply-nested primitives (CollapsibleCard, used ~20 places across
// ResidentScheduler.jsx's tabs) and SidebarNav can read/write prefs without threading two more
// props through every intermediate tab component. Falls back to a no-op shape when rendered
// outside the provider (e.g. a future isolated test of CollapsibleCard) rather than throwing.
const UiPrefsContext = createContext(null);

export function UiPrefsProvider({ viewer, children }) {
  const value = useUiPrefs(viewer);
  return createElement(UiPrefsContext.Provider, { value }, children);
}

const NOOP_UI_PREFS = { prefs: DEFAULT_UI_PREFS, setCardOpen: () => {}, toggleTabOverflow: () => {}, setShowUnscheduled: () => {} };

export function useUiPrefsContext() {
  return useContext(UiPrefsContext) || NOOP_UI_PREFS;
}
