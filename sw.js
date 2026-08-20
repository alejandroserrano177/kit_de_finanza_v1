const CACHE_NAME = "kit-finanzas-v26";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.svg",
  "./offline-boot.js",
  "./offline-idb-bridge.js"
];

const SUPABASE_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      for (const asset of APP_ASSETS) {
        try {
          const response = await fetch(asset, { cache: "no-store" });
          if (response.ok) await cache.put(asset, response.clone());
        } catch (error) {
          console.warn("No se pudo precachear:", asset, error);
        }
      }

      try {
        const response = await fetch(SUPABASE_SCRIPT, { cache: "no-store" });
        if (response.ok) await cache.put(SUPABASE_SCRIPT, response.clone());
      } catch (error) {
        console.warn("No se pudo precachear Supabase:", error);
      }

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request, { cache: "no-store" });

        if (response && response.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          } catch (cacheError) {
            console.warn("No se pudo actualizar caché:", cacheError);
          }
        }

        return response;
      } catch (error) {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        if (event.request.mode === "navigate") {
          const index = await caches.match("./index.html");
          if (index) return index;
        }

        return new Response("Sin conexión", {
          status: 503,
          statusText: "Offline"
        });
      }
    })()
  );
});
