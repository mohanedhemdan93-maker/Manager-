// Service Worker for Calendar Pharmacy App
const CACHE_NAME = 'calendar-pharmacy-v2';

// Only cache files that actually exist
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
  // Note: icons will be cached when they're actually requested
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Cache failed:', err);
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // For navigation requests (page loads), use network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the new version
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // If nothing in cache, return the cached index.html
            return caches.match('/index.html');
          });
        })
    );
    return;
  }

  // For other requests, use cache-first with network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Return cached version and update in background
        fetch(request)
          .then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, response);
              });
            }
          })
          .catch(() => {});
        return cached;
      }

      // Not in cache, fetch from network
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // For icon requests, return a transparent 1x1 pixel PNG
          if (request.url.match(/\.(png|jpg|jpeg|svg|ico)$/i)) {
            return new Response(
              new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 15, 0, 0, 1, 1, 0, 5, 18, 136, 167, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]),
              { headers: { 'Content-Type': 'image/png' } }
            );
          }
          return new Response('Offline', { status: 503 });
        });
    })
  );
});

// Push Notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'تقويم الصيدليات',
      body: 'لديك تنبيه جديد!',
      tag: 'calendar-notification'
    };
  }

  const options = {
    body: data.body || 'لديك تنبيه جديد!',
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/icon-72x72.png',
    tag: data.tag || 'calendar-notification',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: {
      url: data.url || '/',
      date: data.date || new Date().toISOString()
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'تقويم الصيدليات', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event);
  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data || {};

  if (action === 'dismiss') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const url = notificationData.url || '/';

        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Message handler from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
