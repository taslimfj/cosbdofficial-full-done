// Circle of Success — Web Push service worker.
// Handles push events and notification clicks. Kept minimal: no app-shell caching.

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

// Minimal fetch handler — required for Chrome/Android "Install app" prompt.
// Pass-through only; no caching so previews and updates aren't affected.
self.addEventListener('fetch', () => { /* network default */ });

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: 'Notification', body: event.data ? event.data.text() : '' }; }

  const LOGO = '/__l5e/assets-v1/3d234c89-fccc-424c-80cd-b6dec15f3a4a/cos-logo.png';
  const title = data.title || 'Circle of Success';
  const options = {
    body: data.body || '',
    icon: LOGO,
    badge: LOGO,
    image: data.image || LOGO,
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
    renotify: !!data.tag,
    vibrate: [180, 80, 180],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) { try { await client.navigate(target); } catch (_) {} }
          return;
        }
      } catch (_) {}
    }
    await self.clients.openWindow(target);
  })());
});
