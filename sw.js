/**
 * sw.js – Service Worker for "Agenda" (PWA).
 * Provides full offline capability and instantaneous cache-first loading.
 *
 * SW_VERSION is stamped by scripts/sync-version.js so every release changes sw.js's own bytes.
 * Version and name are also loaded dynamically from src/version.js via importScripts().
 * All URLs use relative paths to support GitHub Pages subpath deployment (/repo-name/).
 */

const SW_VERSION = '0.2.2';

importScripts('./src/version.js');

// APP_VERSION and APP_NAME are set on self by src/version.js (single source of truth)
const APP_VERSION = typeof SW_VERSION !== 'undefined' ? SW_VERSION : self.APP_VERSION;
const APP_NAME = self.APP_NAME || 'Agenda';
const CACHE_NAME = `agenda-v${SW_VERSION}`;

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

// ── Install: Precache app shell using cache: 'reload' and skip waiting ────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const requests = PRECACHE_ASSETS.map(
        (url) => new Request(url, { cache: 'reload' })
      );

      await Promise.all(
        requests.map(async (req) => {
          try {
            const response = await fetch(req);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            await cache.put(req, response);
          } catch (err) {
            console.error(`[SW Precache] Falha ao baixar e armazenar no cache: ${req.url}`, err);
            throw err;
          }
        })
      );
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
