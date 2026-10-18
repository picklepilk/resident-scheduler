// Pure leaf: "is a newer deploy live than the bundle this tab is running?" Imports nothing.
//
// Vite emits index.html referencing a content-hashed entry bundle, e.g.
//   <script type="module" crossorigin src="/assets/index-CRiJQbJH.js"></script>
// The running tab reads its own hash from that tag in the DOM; the update poll fetches "/"
// (no-store) and reads the same tag out of the fresh HTML. Different hashes = a new deploy.
// Anything unparseable returns null, and isStale(null, ...) is false — a network hiccup or an
// odd response must never show a false "new version" banner.

export const VERSION_POLL_MS = 5 * 60 * 1000;    // background poll cadence
export const VERSION_MIN_GAP_MS = 60 * 1000;     // at most one check per minute (focus/visibility bursts)
export const VERSION_SNOOZE_MS = 30 * 60 * 1000; // "Later" hides the banner at least this long
export const VERSION_FETCH_TIMEOUT_MS = 15 * 1000; // a hung index.html fetch is abandoned after this

// Matches the entry bundle path: .../assets/index-<hash>.js, optional ?query / #hash suffix.
const ENTRY_SRC_RE = /\/assets\/index-([A-Za-z0-9_-]+)\.js(?:[?#].*)?$/;
const SCRIPT_TAG_RE = /<script\b[^>]*>/gi;
const TYPE_MODULE_RE = /\btype\s*=\s*["']?module["']?(?=[\s>/]|$)/i;
const SRC_ATTR_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

// Hash of the entry bundle from either a whole HTML document or a bare script src/URL.
// Only <script type="module" src=".../assets/index-*.js"> counts — a <link rel="modulepreload">
// for some other chunk is never mistaken for the entry. Returns null when nothing matches.
export function extractBundleHash(htmlOrSrc) {
  if (typeof htmlOrSrc !== "string" || !htmlOrSrc) return null;
  if (!htmlOrSrc.includes("<")) {
    const m = htmlOrSrc.trim().match(ENTRY_SRC_RE);
    return m ? m[1] : null;
  }
  SCRIPT_TAG_RE.lastIndex = 0;
  let tag;
  while ((tag = SCRIPT_TAG_RE.exec(htmlOrSrc)) !== null) {
    const t = tag[0];
    if (!TYPE_MODULE_RE.test(t)) continue;
    const s = t.match(SRC_ATTR_RE);
    const src = s ? (s[1] ?? s[2] ?? s[3]) : null;
    if (!src) continue;
    const m = src.trim().match(ENTRY_SRC_RE);
    if (m) return m[1];
  }
  return null;
}

// True only when both hashes are known and differ.
export function isStale(currentHash, latestHash) {
  return !!currentHash && !!latestHash && currentHash !== latestHash;
}

// Throttle gate: run a check unless one ran less than minGapMs ago.
export function shouldRunCheck(lastCheckAt, now, minGapMs = VERSION_MIN_GAP_MS) {
  return lastCheckAt == null || now - lastCheckAt >= minGapMs;
}

// After a check that found the tab stale: should the banner be showing? Not-yet-dismissed = yes;
// dismissed ("Later") = only once the snooze has elapsed.
export function bannerVisibleAfterStaleCheck(dismissedAt, now, snoozeMs = VERSION_SNOOZE_MS) {
  return dismissedAt == null || now - dismissedAt >= snoozeMs;
}
