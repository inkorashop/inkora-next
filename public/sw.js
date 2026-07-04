const CACHE_NAME = 'inkora-admin-v1';

// No hacemos skipWaiting aca a proposito: la version nueva se queda "esperando"
// hasta que el usuario la aplique a mano (boton) o cierre todas las pestañas
// viejas y vuelva a abrir la app (ahi el navegador la activa solo).
self.addEventListener('install', () => {});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
    ])
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Network-first: nunca sirve datos viejos si hay conexion. El cache solo se
// usa como respaldo cuando el fetch real falla (sin internet).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
