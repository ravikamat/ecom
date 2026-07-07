/* ============================================================
   Service Worker — Solo E-Commerce Command Center v2.1
   Cache-first for static assets, network-first for API calls
   ============================================================ */

const CACHE_NAME = 'eco-v2-7';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/ai-engine.js',
  '/js/currency.js',
  '/js/data-seed.js',
  '/js/db.js',
  '/js/ui-utils.js',
  '/js/dashboard.js',
  '/js/trending.js',
  '/js/search.js',
  '/js/suppliers.js',
  '/js/calculator.js',
  '/js/saved.js',
  '/js/competitor-tracker.js',
  '/js/saved-detail-modal.js',
  '/js/ai-coach.js',
  '/js/chatbot.js',
  '/js/research-engine.js',
  '/js/supplier-communicator.js',
  '/js/financial-engine.js',
  '/js/tax-engine.js',
  '/js/export-engine.js',
  '/js/agent-engine.js',
];

/* ── Install: pre-cache static assets ────────────────────── */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v2.1');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // addAll fails silently on individual 404s by catching each
        return Promise.allSettled(
          STATIC_ASSETS.map(url => cache.add(url).catch(err => {
            console.warn('[SW] Failed to cache:', url, err.message);
          }))
        );
      })
      .then(() => {
        console.log('[SW] Install complete');
        return self.skipWaiting();
      })
  );
});

/* ── Activate: purge old caches ──────────────────────────── */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => { console.log('[SW] Deleting old cache:', key); return caches.delete(key); })
      );
    }).then(() => self.clients.claim())
  );
});

/* ── Fetch: network-first for API, cache-first for static ── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin + http(s) requests
  if (!url.protocol.startsWith('http')) return;
  if (request.method !== 'GET') return;

  // API calls: network first → offline fallback JSON
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .catch(() => new Response(
          JSON.stringify({
            offline: true,
            error: 'You are offline. AI features require an internet connection.',
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }
        ))
    );
    return;
  }

  // Static assets: cache first → network fallback → cache cache
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        // Cache successful GET responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // Offline + not cached: return offline page for navigation
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

/* ── Background sync ─────────────────────────────────────── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-saved') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_COMPLETE' }));
      })
    );
  }
});

/* ── Push notifications (future) ─────────────────────────── */
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'ECO Command', {
      body:  data.body  || 'You have a new alert',
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      data:  { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(event.notification.data?.url || '/')
  );
});
