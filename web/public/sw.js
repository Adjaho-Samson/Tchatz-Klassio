/* Tchatz Klassio — service worker
 * Met en cache la coquille de l'application pour un usage hors connexion.
 * Les appels à l'API (Supabase) ne sont jamais interceptés : données fraîches
 * quand le réseau est disponible, documents téléchargés disponibles sinon.
 */
const SHELL_CACHE = 'klassio-shell-v1';
const DOCS_CACHE = 'klassio-docs-v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('klassio-shell-') && key !== SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // On ne touche jamais aux API externes ni au cache des documents.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('__klassio_offline__')) return;

  // Navigations : réseau d'abord, repli sur la coquille en cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Ressources statiques : cache d'abord, puis réseau (et mise en cache).
  const isStatic =
    url.pathname.includes('/assets/') ||
    url.pathname.includes('/icons/') ||
    SHELL_ASSETS.some((asset) => url.pathname.endsWith(asset.replace('./', '/')));

  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});
