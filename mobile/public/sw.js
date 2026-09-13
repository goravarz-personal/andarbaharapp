/**
 * Service worker for the installed app.
 *
 * Two jobs:
 *   1. Make the app installable at all - a browser will not offer "install"
 *      without one.
 *   2. Open instantly on a phone, even on a bad connection, by serving the
 *      shell from cache while the network catches up.
 *
 * It deliberately never caches API responses. Money records go stale in
 * seconds and a cached balance that disagrees with the server is worse than
 * no app at all.
 */

const VERSION = 'v1';
const SHELL_CACHE = `aadarbahar-shell-${VERSION}`;
const ASSET_CACHE = `aadarbahar-assets-${VERSION}`;

const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A missing file must not wedge the install - the app still works online.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !name.endsWith(VERSION))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Anything on another origin is the API. Always go to the network.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: try the network so a deployed update is picked up, and fall
  // back to the cached shell when there is no signal.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Everything else is a build asset with a hashed filename, so a cache hit is
  // always the right answer.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
