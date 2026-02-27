/* ============================================
   Flowdo — Service Worker
   Offline caching + Push notifications
   ============================================ */

const CACHE_NAME = 'flowdo-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './icon-192.png',
    './icon-512.png',
    './apple-touch-icon.png',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
];

// ── Install: Cache all assets ──
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: Clean old caches ──
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: Serve cached, fallback to network ──
self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests except fonts
    const url = new URL(event.request.url);
    if (url.origin !== location.origin && !url.hostname.includes('googleapis.com') && !url.hostname.includes('gstatic.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cache but also update in background
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const cache = caches.open(CACHE_NAME);
                        cache.then((c) => c.put(event.request, networkResponse.clone()));
                    }
                    return networkResponse;
                }).catch(() => {}); // Ignore network errors

                return cachedResponse;
            }

            return fetch(event.request).then((response) => {
                if (!response || response.status !== 200) return response;

                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });

                return response;
            });
        })
    );
});

// ── Push Notification ──
self.addEventListener('push', (event) => {
    let data = {
        title: 'Flowdo — Nightly Reminder',
        body: 'Check your pending tasks!',
        icon: './icon-192.png',
        badge: './icon-192.png',
    };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || './icon-192.png',
        badge: data.badge || './icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'flowdo-reminder',
        renotify: true,
        data: {
            url: self.registration.scope,
        },
        actions: [
            { action: 'open', title: '📋 Open Flowdo' },
            { action: 'dismiss', title: 'Dismiss' },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ── Notification Click ──
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'dismiss') return;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus existing window if open
            for (const client of clientList) {
                if (client.url.includes('index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open new window
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data?.url || './');
            }
        })
    );
});

// ── Periodic Sync (for scheduled notifications) ──
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'flowdo-nightly-check') {
        event.waitUntil(checkAndNotify());
    }
});

async function checkAndNotify() {
    // Read notification settings from the main thread via message
    const allClients = await clients.matchAll();
    for (const client of allClients) {
        client.postMessage({ type: 'CHECK_NOTIFICATION' });
    }
}

// ── Message from main thread ──
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body } = event.data;
        self.registration.showNotification(title || 'Flowdo', {
            body: body || 'Check your tasks!',
            icon: './icon-192.png',
            badge: './icon-192.png',
            vibrate: [200, 100, 200],
            tag: 'flowdo-reminder',
            renotify: true,
            data: { url: self.registration.scope },
            actions: [
                { action: 'open', title: '📋 Open Flowdo' },
                { action: 'dismiss', title: 'Dismiss' },
            ],
        });
    }

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
