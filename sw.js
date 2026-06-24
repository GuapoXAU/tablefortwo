const CACHE_NAME = 't4t-cache-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache Supabase API requests
  if (url.hostname.includes('supabase.co')) return;

  // Navigation requests (HTML): network-first
  const isNav = event.request.mode === 'navigate'
    || (event.request.method === 'GET' && event.request.headers.get('accept')?.includes('text/html'));

  if (isNav) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App code (JS/CSS): network-first so updates flow through
  const isCode = event.request.method === 'GET'
    && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'));

  if (isCode) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets (images/icons/fonts): cache-first
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        });
      })
    );
  }
});
