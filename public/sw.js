/*
 * Minimal offline app-shell service worker (plan §5.4).
 *
 * Strategy:
 *  - The cache is keyed by BUILD_ID (stamped into this file at build time by
 *    the Vite plugin in vite.config.ts), so every deploy activates a fresh
 *    cache and purges the previous one — no unbounded growth, no stale shell.
 *  - Navigations are network-first (cache fallback when offline) so a new
 *    deploy is picked up on the very next load instead of one load later.
 *  - Other same-origin GET requests: stale-while-revalidate.
 *  - Never cache cross-origin or non-GET requests.
 */
const BUILD_ID = '__BUILD_ID__';
const CACHE_PREFIX = 'openshotdesigner-shell-';
const CACHE = `${CACHE_PREFIX}${BUILD_ID}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./']).then(() => self.skipWaiting())),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok) cache.put('./', fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const shell = (await cache.match(request, { ignoreSearch: true })) || (await cache.match('./'));
          return shell || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => undefined);

      if (cached) {
        network.catch(() => undefined);
        return cached;
      }
      const fresh = await network;
      if (fresh) return fresh;
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }),
  );
});
