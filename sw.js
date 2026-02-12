const CACHE_NAME = 'focus-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
];

// CDN resources to cache for offline use
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache local assets immediately
      cache.addAll(ASSETS).catch(() => {});
      // Try to cache CDN assets (non-blocking)
      CDN_ASSETS.forEach(url => {
        fetch(url).then(resp => {
          if (resp.ok) cache.put(url, resp);
        }).catch(() => {});
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't cache Google API calls (they need to be live)
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('accounts.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Network first for HTML, cache first for assets
      if (event.request.destination === 'document') {
        return fetch(event.request)
          .then((resp) => {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return resp;
          })
          .catch(() => cached || new Response('Offline — please reconnect', { headers: { 'Content-Type': 'text/html' } }));
      }
      return cached || fetch(event.request).then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return resp;
      });
    })
  );
});
