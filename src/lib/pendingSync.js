// "Local edits not yet confirmed in the cloud" marker + the mount-time decision that uses it.
// Without it, the mount overlay (cloud copy over localStorage) silently discarded edits that were
// made but never saved (reload/crash/offline right after an edit). Pure + storage-injected so it is
// testable; ResidentScheduler.jsx only wires it.

export const pendingKey = (rowId) => `res_sync_pending_${rowId}`;

// null = no marker. A marker that exists but cannot be parsed still means "unsynced edits", with an
// unknown base (so the caller asks rather than guessing).
export function readPending(rowId, storage = globalThis.localStorage) {
  let raw;
  try { raw = storage.getItem(pendingKey(rowId)); } catch { return null; }
  if (raw == null) return null;
  try {
    const v = JSON.parse(raw);
    return { baseVersion: Number.isFinite(v?.baseVersion) ? v.baseVersion : null };
  } catch { return { baseVersion: null }; }
}

export function writePending(rowId, marker, storage = globalThis.localStorage) {
  try { storage.setItem(pendingKey(rowId), JSON.stringify({ baseVersion: marker?.baseVersion ?? null })); } catch { /* best-effort */ }
}

export function clearPending(rowId, storage = globalThis.localStorage) {
  try { storage.removeItem(pendingKey(rowId)); } catch { /* best-effort */ }
}

// Does any synced key present in the cloud doc differ (deeply) from the local value?
export function localDiffersFromCloud(localByKey, cloudData, keys) {
  const d = cloudData || {};
  return keys.some(k => d[k] != null && JSON.stringify(d[k]) !== JSON.stringify(localByKey[k]));
}

// -> 'take-cloud' (today's overlay), 'keep-local' (cloud untouched since our base: skip the overlay,
// the normal versioned save pushes local), 'ask' (both sides changed or unknown: existing conflict
// dialog), 'hold' (cloud unreadable: touch nothing, write nothing).
export function decideMountOverlay({ marker, cloud, localDiffers }) {
  if (cloud?.status === 'error') return marker ? 'hold' : 'take-cloud';
  if (!marker || cloud?.status !== 'ok' || !localDiffers) return 'take-cloud';
  if (Number.isFinite(marker.baseVersion) && marker.baseVersion === cloud.version) return 'keep-local';
  return 'ask';
}
