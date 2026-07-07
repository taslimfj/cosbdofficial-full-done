/// <reference lib="webworker" />
// Circle of Success — combined Service Worker (Push + Offline app-shell).
// Built via vite-plugin-pwa (injectManifest). Kept at /sw.js scope /.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// --- Precache app shell (hashed assets) -------------------------------------
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// --- Runtime caching --------------------------------------------------------
// HTML navigations — network first, fallback to cache. Never cache-first.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'html-navigations-v1',
    networkTimeoutSeconds: 4,
    plugins: [{ cacheWillUpdate: async ({ response }) => (response && response.status === 200 ? response : null) }],
  })
);

// Same-origin static assets (JS/CSS/fonts/images not in precache).
registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    ['style', 'script', 'worker', 'font', 'image'].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: 'static-assets-v1' })
);

// CDN-hosted Lovable assets (immutable, hashed URLs).
registerRoute(
  ({ url }) => url.pathname.startsWith('/__l5e/assets-v1/'),
  new CacheFirst({ cacheName: 'lovable-assets-v1' })
);

// Do NOT cache Supabase API or edge function calls.
// (Left uncached by default — no matching route.)

// Offline fallback for failed navigations.
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    const cache = await caches.open('html-navigations-v1');
    const cached = await cache.match('/');
    if (cached) return cached;
  }
  return Response.error();
});

// --- Lifecycle --------------------------------------------------------------
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

// --- Web Push ---------------------------------------------------------------
self.addEventListener('push', (event: PushEvent) => {
  let data: any = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: 'Notification', body: event.data ? event.data.text() : '' }; }

  const LOGO = '/__l5e/assets-v1/3d234c89-fccc-424c-80cd-b6dec15f3a4a/cos-logo.png';
  const title = data.title || 'Circle of Success';
  const options: NotificationOptions = {
    body: data.body || '',
    icon: LOGO,
    badge: LOGO,
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
    ...(data.tag ? { renotify: true } : {}),
  } as NotificationOptions;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) { try { await (client as WindowClient).navigate(target); } catch {} }
          return;
        }
      } catch {}
    }
    await self.clients.openWindow(target);
  })());
});
