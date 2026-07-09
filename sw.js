/**
 * AquaCheck v3.1 Service Worker
 */
const CACHE_NAME = 'aquacheck-water-v3.1.2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './favicon.png',
  './xlsx.full.min.js',
  './jspdf.umd.min.js',
  './js/config.js',
  './js/utils.js',
  './js/storage.js',
  './js/ocr.js',
  './js/export.js',
  './js/charts.js',
  './js/notifications.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './images/logo.png'
];

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([...STATIC_ASSETS, ...CDN_ASSETS]).catch(() => cache.addAll(STATIC_ASSETS)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);

      if (request.mode === 'navigate') {
        return fetchPromise.catch(() => caches.match('./index.html'));
      }
      return cached || fetchPromise;
    })
  );
});
