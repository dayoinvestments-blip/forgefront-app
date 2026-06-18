/**
 * ForgeFront Service Worker
 * Handles caching for offline support and fast load times.
 * Cache-first for static assets, network-first for API calls.
 */

const CACHE_NAME    = 'forgefront-v1';
const OFFLINE_URL   = '/offline.html';

// Static assets to cache on install
const PRECACHE = [
  '/',
  '/index.html',
  '/success.html',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install — cache core assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate — clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key)   { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch — strategy depends on request type
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Always network-first for Netlify functions (API calls)
  if (url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(JSON.stringify({ error: 'Offline — please reconnect' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Always network-first for Supabase
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Always network-first for Stripe
  if (url.hostname.includes('stripe.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for everything else (HTML, CSS, JS, icons)
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/offline.html');
        }
      });
    })
  );
});

// Push notifications (ready for future use)
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'ForgeFront', {
      body:  data.body  || 'New contract opportunity matched',
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data:  data.url ? { url: data.url } : {},
      actions: [{ action: 'view', title: 'View Contract' }]
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});
