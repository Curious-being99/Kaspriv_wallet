// Simple service worker for PWA installability
const CACHE_NAME = 'kaspriv-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/kas_icon.svg'
];

// List of keywords representing sensitive info that must never be cached or intercepted
const SENSITIVE_KEYWORDS = [
  'api',
  'wallet',
  'key',
  'seed',
  'private',
  'transaction',
  'balance',
  'address',
  'covenant',
  'auth',
  'token',
  'secret',
  'credential',
  'mnemonic',
  'password',
  'fiat',
  'price'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'PANIC_WIPE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => caches.delete(cache))
        );
      }).then(() => {
        console.log('[Service Worker] Cleaned caches on panic wipe signal.');
      })
    );
  }
});

self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // 1. Bypass Service Worker entirely for external API calls, third-party endpoints, and non-local origins
  if (url.origin !== self.location.origin) {
    return;
  }

  // 2. Bypass Service Worker for any requests containing sensitive paths or keywords
  const lowercasePath = url.pathname.toLowerCase();
  const lowercaseSearch = url.search.toLowerCase();
  const isSensitive = SENSITIVE_KEYWORDS.some(keyword => 
    lowercasePath.includes(keyword) || lowercaseSearch.includes(keyword)
  );

  if (isSensitive) {
    return; // Fetch directly from network, do not touch cache
  }

  // 3. Match only local, non-sensitive static assets in cache
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
