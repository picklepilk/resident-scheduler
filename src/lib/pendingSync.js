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

// Key-order-independent, JSON-round-trip-faithful serialisation: the cloud column is jsonb (reorders
// object keys), and the save path JSON-stringifies (drops undefined-valued keys, undefined in arrays
// becomes null).
function stable(v) {
  if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return undefined;
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (typeof v.toJSON === 'function') return stable(v.toJSON());
  if (Array.isArray(v)) return '[' + v.map(x => stable(x) ?? 'null').join(',') + ']';
  const parts = [];
  for (const k of Object.keys(v).sort()) {
    const sv = stable(v[k]);
    if (sv !== undefined) parts.push(JSON.stringify(k) + ':' + sv);
  }
  return '{' + parts.join(',') + '}';
}

// Does any synced key present in the cloud doc differ (by content) from the local value?
export function localDiffersFromCloud(localByKey, cloudData, keys) {
  const d = cloudData || {};
  return keys.some(k => d[k] != null && stable(d[k]) !== stable(localByKey[k]));
}

// True when the user-created content is all still at its defaults (nothing worth protecting, and
// the signature of a wiped device, e.g. after Clear all).
export function isBlankLocalState(v) {
  const empty = x => x == null || (Array.isArray(x) ? x.length === 0 : typeof x === 'object' && Object.keys(x).length === 0);
  return ['res_em_roster', 'res_blocks_history', 'res_import_log', 'res_ay_data',
    'res_eligibility_overrides', 'res_day_rules', 'res_coverage'].every(k => empty(v[k]));
}

// Called only when the cloud row loaded fine and has data. -> 'take-cloud' (today's overlay),
// 'keep-local' (cloud untouched since our base: skip the overlay, the normal versioned save pushes
// local), 'ask' (content differs and the cloud moved or is unknown, or local is blank: the existing
// conflict dialog). A failed load or empty row never reaches here (dbReady stays false / seed path).
export function decideMountOverlay({ marker, cloudVersion, localEqualsCloud, localIsBlank }) {
  if (!marker || localEqualsCloud) return 'take-cloud'; // includes "save landed, confirmation lost"
  if (localIsBlank) return 'ask';
  if (Number.isFinite(marker.baseVersion) && marker.baseVersion === cloudVersion) return 'keep-local';
  return 'ask';
}
