/* ============================================
   Flowdo — Service Worker
   Offline caching + Background notifications
   ============================================ */

const CACHE_NAME = "flowdo-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./manifest.json",
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap",
];

// ── IndexedDB helpers (shared with app.js) ──
const DB_NAME = "flowdo-db";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("tasks")) {
        db.createObjectStore("tasks", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbGet(storeName, key) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result?.value ?? null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function dbGetAll(storeName) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }),
  );
}

function dbPut(storeName, key, value) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.put({ key, value });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

// ── Install: Cache all assets ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate: Clean old caches ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch: Serve cached, fallback to network ──
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== location.origin &&
    !url.hostname.includes("googleapis.com") &&
    !url.hostname.includes("gstatic.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const cache = caches.open(CACHE_NAME);
              cache.then((c) => c.put(event.request, networkResponse.clone()));
            }
            return networkResponse;
          })
          .catch(() => {});

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
    }),
  );
});

// ── Background notification check (runs independently in SW) ──
async function checkAndNotifyBackground() {
  try {
    const settings = await dbGet("settings", "notif-settings");
    if (!settings || !settings.enabled) return;

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Already notified today
    if (settings.lastNotifDate === todayStr) return;

    const [targetH, targetM] = (settings.time || "21:00")
      .split(":")
      .map(Number);
    const currentH = now.getHours();
    const currentM = now.getMinutes();

    if (currentH > targetH || (currentH === targetH && currentM >= targetM)) {
      // Build notification body from stored tasks
      const tasks = await dbGetAll("tasks");
      const pendingTasks = tasks.filter((t) => !t.completed);
      const todayTasks = tasks.filter(
        (t) => t.dueDate === todayStr && !t.completed,
      );
      const importantTasks = tasks.filter((t) => t.important && !t.completed);

      let body = "";
      if (pendingTasks.length === 0) {
        body = "🎉 All tasks completed! Great job today!";
      } else {
        const parts = [];
        if (todayTasks.length > 0) parts.push(`${todayTasks.length} due today`);
        if (importantTasks.length > 0)
          parts.push(`${importantTasks.length} important`);
        parts.push(`${pendingTasks.length} total pending`);
        body = `📋 ${parts.join(" • ")}`;

        if (pendingTasks.length <= 3) {
          body += "\n" + pendingTasks.map((t) => `• ${t.title}`).join("\n");
        }
      }

      await self.registration.showNotification("Flowdo — Nightly Reminder", {
        body: body,
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        vibrate: [200, 100, 200],
        tag: "flowdo-reminder",
        renotify: true,
        data: { url: self.registration.scope },
        actions: [
          { action: "open", title: "📋 Open Flowdo" },
          { action: "dismiss", title: "Dismiss" },
        ],
      });

      // Mark as notified today
      settings.lastNotifDate = todayStr;
      await dbPut("settings", "notif-settings", settings);
    }
  } catch (err) {
    console.error("Flowdo SW notification check failed:", err);
  }
}

// ── Self-waking timer ──
// Service workers get killed after ~30s of inactivity.
// We use a trick: schedule a check, and on each wake-up, schedule the next one.
let checkTimer = null;

function scheduleNextCheck() {
  // Check every 60 seconds while SW is alive
  if (checkTimer) clearTimeout(checkTimer);
  checkTimer = setTimeout(async () => {
    await checkAndNotifyBackground();
    scheduleNextCheck();
  }, 60000);
}

// ── Push Notification ──
self.addEventListener("push", (event) => {
  let data = {
    title: "Flowdo — Nightly Reminder",
    body: "Check your pending tasks!",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
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
    icon: data.icon || "./icon-192.png",
    badge: data.badge || "./icon-192.png",
    vibrate: [200, 100, 200],
    tag: "flowdo-reminder",
    renotify: true,
    data: {
      url: self.registration.scope,
    },
    actions: [
      { action: "open", title: "📋 Open Flowdo" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ── Notification Click ──
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("index.html") && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data?.url || "./");
        }
      }),
  );
});

// ── Periodic Sync (for scheduled notifications) ──
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "flowdo-nightly-check") {
    event.waitUntil(checkAndNotifyBackground());
  }
});

// ── Message from main thread ──
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, body } = event.data;
    self.registration.showNotification(title || "Flowdo", {
      body: body || "Check your tasks!",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      vibrate: [200, 100, 200],
      tag: "flowdo-reminder",
      renotify: true,
      data: { url: self.registration.scope },
      actions: [
        { action: "open", title: "📋 Open Flowdo" },
        { action: "dismiss", title: "Dismiss" },
      ],
    });
  }

  // When the app syncs settings, start the background checker
  if (event.data && event.data.type === "SYNC_SETTINGS") {
    scheduleNextCheck();
  }

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
