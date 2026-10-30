/**
 * sw.js – Service Worker for "Agenda" (PWA).
 * Provides full offline capability and instantaneous cache-first loading.
 *
 * Version and name are loaded dynamically from src/version.js via importScripts().
 * All URLs use relative paths to support GitHub Pages subpath deployment (/repo-name/).
 */

importScripts('./src/version.js');

// APP_VERSION and APP_NAME are set on self by src/version.js (single source of truth)
const APP_VERSION = self.APP_VERSION;
const CACHE_NAME = `agenda-v${APP_VERSION}`;

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/version.js',
  './src/app.js',
  './src/storage/storage.js',
  './src/logic/dateUtils.js',
  './src/logic/activityLogic.js',
  './src/ui/calendarView.js',
  './src/ui/dayDetailView.js',
  './src/ui/activitiesView.js',
  './src/ui/summaryView.js',
  './src/ui/icons.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── Install: Precache app shell and immediately skip waiting ─────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

// ── Activate: Claim clients immediately and clean up old version caches ──────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => (name.startsWith('agenda-') || name.startsWith('meu-calendario-')) && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      }),
    ])
  );
});

// ── Fetch: Cache-first strategy for app shell ────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        // Cache newly fetched valid local GET responses
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
