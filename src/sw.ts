import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

// Precache all Vite build output (injected at build time)
precacheAndRoute(self.__WB_MANIFEST);

// Clean up caches from old SW versions
cleanupOutdatedCaches();

// Navigation: serve app shell for all navigation requests
const handler = createHandlerBoundToURL('/index.html');
const navigationRoute = new NavigationRoute(handler, {
  denylist: [/\/offline\.html/],
});
registerRoute(navigationRoute);

// Images: Cache First (long-lived)
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'rfe-images-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// Fonts: Cache First
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'rfe-fonts-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  })
);

// Supabase API: Network First with fallback
registerRoute(
  ({ url }) => url.hostname.includes('supabase'),
  new NetworkFirst({
    cacheName: 'rfe-api-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 5 * 60 }),
    ],
  })
);

// Background Sync: queue failed POST requests (estimate saves, etc.)
const bgSyncPlugin = new BackgroundSyncPlugin('rfe-sync-queue', {
  maxRetentionTime: 24 * 60, // 24 hours in minutes
});

registerRoute(
  ({ request }) =>
    request.method === 'POST' && request.url.includes('supabase'),
  new NetworkFirst({
    cacheName: 'rfe-post-cache',
    plugins: [bgSyncPlugin],
  }),
  'POST'
);

// Offline fallback for navigation failures
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/offline.html').then((r) => r ?? new Response('Offline'))
      )
    );
  }
});

// Immediate activation
self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());
