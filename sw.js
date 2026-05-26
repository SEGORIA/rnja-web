/* ══════════════════════════════════════════════
   RNJA Service Worker — Soporte offline y PWA
══════════════════════════════════════════════ */
const CACHE_NAME = 'rnja-v3';
const PRECACHE = [
  '/',
  '/index.html',
  '/logo-rnja.png',
  '/slogan-rnja.png',
  '/RNJA-COLOMBIA.png',
  '/manifest.json'
];

// Instalación — pre-cachear assets estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Activación — limpiar caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first para assets, network-first para API
self.addEventListener('fetch', event => {
  const url = event.request.url;
  // Ignorar peticiones POST/PUT/DELETE y APIs externas
  if (event.request.method !== 'GET') return;
  if (url.includes('supabase.co') || url.includes('googleapis.com') || url.includes('cdn.jsdelivr')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response.ok && url.startsWith(self.location.origin)) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// Mensaje para forzar actualización desde la app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
