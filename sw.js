const CACHE_NAME = 'nexo-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.tsx',
  // Añade aquí otros recursos estáticos clave si los hubiera (ej. logo.png)
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Serve from cache
        }
        return fetch(event.request); // Fallback to network
      }
    )
  );
});
