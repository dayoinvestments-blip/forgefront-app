/**
 * ForgeFront Service Worker
 * Network-first for HTML/navigation so new deploys load immediately.
 * Cache-first only for static assets (icons, etc.).
 */

const CACHE_NAME  = 'forgefront-v2';
const OFFLINE_URL = '/offline.html';

// Pre-cache only non-HTML shell assets
const PRECACHE = [
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install — cache shell assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate — purge old caches (including v1)
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

// Fetch
self.addEventListener('fetch', function(event) {
  // Ignore non-GET
  if (event.request.method !== 'GET') return;

  var url = new URL(event.request.url);

  // Network-first: Netlify Functions
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

  // Network-first: Supabase
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first: Stripe
  if (url.hostname.includes('stripe.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first: HTML / navigation requests
  var acceptHeader = event.request.headers.get('accept') || '';
  if (event.request.mode === 'navigate' || acceptHeader.includes('text/html')) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        // Store a fresh copy for offline fallback
        if (response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline: try cached copy, then /offline.html
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match(OFFLINE_URL);
        });
      })
    );
    return;
  }

  // Cache-first: other static assets (icons, css, js)
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(OFFLINE_URL);
      });
    })
  );
});

// Push notifications
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
