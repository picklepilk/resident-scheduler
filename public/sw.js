// Minimal app-shell service worker. Registered production-only (see src/main.jsx) so `npm run
// dev` never fights Vite's own module graph with a stale cache.
//
// Strategy:
//   - navigation requests (HTML page loads / SPA route changes): network-first, falling back to
//     the cached shell when offline — lets a deployed update show up immediately on next visit
//     while still giving something to show with no network.
//   - same-origin hashed static assets (/assets/*, built by Vite with content-hash filenames):
//     cache-first — the hash in the filename IS the invalidation, so serving from cache is safe
//     and fast, never stale.
//   - everything else same-origin (icons, manifest): stale-while-revalidate-ish via cache-first
//     with a network fallback, kept simple since this app has very few of these.
//   - anything cross-origin (Supabase REST/Auth, the Netlify Function endpoints under
//     /.netlify/functions/ or /api/) is NEVER intercepted — this app is local-first with a
//     cloud-sync layer that already has its own retry/timeout handling (see CLAUDE.md's "Cloud
//     sync" section); a service worker caching or racing those calls could serve stale schedule
//     data or break the 15s AbortController timeout the app relies on.
//
// Versioned from one constant — bump CACHE_VERSION on any change to this file's caching
// behavior so `activate` cleans out the old cache instead of serving mismatched assets forever.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `em-sched-shell-${CACHE_VERSION}`;
const APP_SHELL_URL = '/index.html';

const NEVER_INTERCEPT_PATHS = ['/.netlify/functions/', '/api/', '/rest/', '/auth/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(APP_SHELL_URL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function isNeverIntercept(url) {
  return NEVER_INTERCEPT_PATHS.some((p) => url.pathname.startsWith(p));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache mutating requests

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin (Supabase etc.) — untouched
  if (isNeverIntercept(url)) return;

  // Navigations: network-first with offline fallback to the cached shell (SPA — every route
  // renders from index.html anyway, per netlify.toml's catch-all redirect).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL_URL, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(APP_SHELL_URL).then((cached) => cached || caches.match(request)))
    );
    return;
  }

  // Hashed static assets: cache-first, the filename hash is the cache key's real invalidation.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else same-origin (manifest, icons): cache-first, network fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request));
    })
  );
});
