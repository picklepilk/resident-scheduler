import { useCallback, useState } from 'react';
import { supabase } from '../supabaseClient';
import { APP_KEY } from './walkthroughSteps';

export const WALKTHROUGH_SEEN_LS_KEY = `walkthrough_seen:${APP_KEY}`;

/**
 * Pure. Merges this app's seen flag into whatever `walkthrough_seen` object `user_metadata`
 * already carries. MUST merge, not replace — `auth.users` is shared with sibling apps
 * (ems-inventory, Fellow-Eval, EMS-Rotation-Resident), each keyed by its own APP_KEY under the
 * same object; a wholesale write would silently clobber a sibling app's flag.
 */
export function mergeWalkthroughSeen(existing, appKey = APP_KEY) {
  return { ...(existing ?? {}), [appKey]: true };
}

function readLocalMirror() {
  try {
    return localStorage.getItem(WALKTHROUGH_SEEN_LS_KEY) === '1';
  } catch {
    return false; // private browsing / storage disabled — fall back to the cloud value only
  }
}

function writeLocalMirror() {
  try {
    localStorage.setItem(WALKTHROUGH_SEEN_LS_KEY, '1');
  } catch {
    // best-effort optimistic mirror only — a failed write here just means a slow cloud write
    // could re-show the welcome modal on an immediate reload, not a correctness bug
  }
}

/**
 * Read/write the first-login walkthrough seen-flag per docs/WALKTHROUGH.md §1.5: the flag lives
 * in `session.user.user_metadata.walkthrough_seen[APP_KEY]`, mirrored optimistically into
 * localStorage so a slow cloud write doesn't re-show the welcome modal on an immediate reload.
 * Unset in both → show.
 *
 * `session` is the Supabase Auth session for the signed-in viewer, passed down from AppGate via
 * `viewer.session` rather than re-fetched here — AppGate already resolved it once (see its own
 * "viewer is passed rather than re-fetched" note), and a second `getSession()` call here would
 * be a fourth identity lookup the app already avoids in three other places. `session` is
 * undefined/null when auth is disabled (local dev fallback) or not yet resolved; both cases fall
 * back to the localStorage mirror only.
 */
export function useWalkthroughSeen(session) {
  const [seen, setSeen] = useState(() => {
    const metaSeen = session?.user?.user_metadata?.walkthrough_seen?.[APP_KEY] === true;
    return metaSeen || readLocalMirror();
  });

  const markSeen = useCallback(() => {
    setSeen(true);
    writeLocalMirror();
    if (!supabase || !session?.user) return; // AUTH_ENABLED false — local-only, nothing to merge into
    const merged = mergeWalkthroughSeen(session.user.user_metadata?.walkthrough_seen);
    supabase.auth.updateUser({ data: { walkthrough_seen: merged } }).catch(() => {
      // Best-effort — the local mirror above already covers the "don't re-show on reload" case;
      // a failed cloud write just means another device won't see the flag until it's set there too.
    });
  }, [session]);

  return [seen, markSeen];
}
