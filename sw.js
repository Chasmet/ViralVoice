const CACHE_NAME = 'viralvoice-v20260508e';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=20260508e',
  './script.js?v=20260508e',
  './manifest.json?v=20260508e'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request).then(response => response || caches.match('./index.html')))
  );
});
