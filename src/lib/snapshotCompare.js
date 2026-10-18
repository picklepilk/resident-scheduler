// Compare a freshly built block snapshot against a stored one. Optional fields added in later
// releases are absent on old snapshots; treat "absent" and "empty" as equal for those only.
export const OPTIONAL_SNAPSHOT_FIELDS = ['handOverrides', 'issueAcks', 'lastGenerated', 'generatedWithGaps'];

function normalizeForCompare(val) {
  if (Array.isArray(val)) {
    const arr = val.map(normalizeForCompare);
    return arr.every(v => v === null || typeof v !== 'object') ? [...arr].sort() : arr;
  }
  if (val && typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val).sort()) out[k] = normalizeForCompare(val[k]);
    return out;
  }
  return val;
}

function isEmptyOptional(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return typeof v === 'object' && Object.keys(v).length === 0;
}

function dropEmptyOptionals(snap) {
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return snap;
  const out = { ...snap };
  for (const k of OPTIONAL_SNAPSHOT_FIELDS) if (k in out && isEmptyOptional(out[k])) delete out[k];
  return out;
}

export function snapshotsEqual(a, b) {
  return JSON.stringify(normalizeForCompare(dropEmptyOptionals(a))) === JSON.stringify(normalizeForCompare(dropEmptyOptionals(b)));
}
