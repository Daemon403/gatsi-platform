const CACHE_NAME = 'gatsi-web-shell-v1';
const scopeUrl = new URL(self.registration.scope);
const shellUrl = scopeUrl.pathname;
const indexUrl = new URL('index.html', scopeUrl).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(indexUrl, { cache: 'reload' });
    const html = await response.clone().text();
    await cache.put(indexUrl, response.clone());
    await cache.put(shellUrl, response);
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => new URL(match[1], scopeUrl).href)
      .filter((url) => new URL(url).origin === self.location.origin);
    await Promise.all(assets.map((url) => fetch(url, { cache: 'reload' }).then((asset) => asset.ok ? cache.put(url, asset) : undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('gatsi-web-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(indexUrl, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(indexUrl)) ?? (await caches.match(shellUrl)) ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })),
  );
});
