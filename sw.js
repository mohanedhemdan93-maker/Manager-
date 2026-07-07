// Service Worker for Calendar Pharmacy App
const CACHE_NAME = 'calendar-pharmacy-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-72x72.png',
  '/icon-96x96.png',
  '/icon-128x128.png',
  '/icon-144x144.png',
  '/icon-152x152.png',
  '/icon-192x192.png',
  '/icon-384x384.png',
  '/icon-512x512.png'
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
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Strategy: Cache First for static assets, Network First for API/data
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

function isStaticAsset(url) {
  const staticExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.json', '.woff', '.woff2'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext)) || url.pathname === '/';
}

// Cache First strategy
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    // Return cached version and update cache in background
    fetch(request)
      .then((response) => {
        if (response.ok) {
          cache.put(request, response.clone());
        }
      })
      .catch(() => {});
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Fetch failed:', error);
    return new Response('Offline - Content not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Network First strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

// Background Sync for offline data
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-calendar-data') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncCalendarData());
  }
});

async function syncCalendarData() {
  // This will be handled by the app itself
  // The SW just ensures the sync happens when online
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_COMPLETE' });
  });
}

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
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
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
    actions: [
      {
        action: 'open',
        title: 'فتح التطبيق',
        icon: '/icon-72x72.png'
      },
      {
        action: 'dismiss',
        title: 'تجاهل',
        icon: '/icon-72x72.png'
      }
    ],
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

        // Focus existing window if open
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }

        // Open new window if not already open
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Message handler from main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'calendar-sync') {
    console.log('[SW] Periodic sync triggered');
    event.waitUntil(syncCalendarData());
  }
});
