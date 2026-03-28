self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("russcan-static-v1").then((cache) =>
      cache.addAll(["/", "/documentation", "/ai", "/favicon.svg", "/manifest.webmanifest"]),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open("russcan-dynamic-v1").then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("/"));
    }),
  );
});
