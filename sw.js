const CACHE_NAME = "kit-finanzas-v14";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.svg"
];

const SUPABASE_SCRIPT = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
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
      if (response.ok || response.type === "opaque") {
        await cache.put(SUPABASE_SCRIPT, response.clone());
      }
    } catch (error) {
      console.warn("No se pudo precachear Supabase:", error);
    }

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request, { cache: "no-store" });

      if (response.ok || response.type === "opaque") {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        } catch (error) {
          console.warn("No se pudo actualizar caché:", error);
        }
      }

      return response;
    } catch (error) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);

      if (cached) return cached;

      if (event.request.url === SUPABASE_SCRIPT) {
        const cachedSupabase = await cache.match(SUPABASE_SCRIPT);
        if (cachedSupabase) return cachedSupabase;
      }

      if (event.request.mode === "navigate") {
        const index = await cache.match("./index.html");
        if (index) return index;
      }

      return new Response("Sin conexión", {
        status: 503,
        statusText: "Offline"
      });
    }
  })());
});
