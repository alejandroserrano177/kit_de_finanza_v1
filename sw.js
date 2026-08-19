const CACHE_NAME = "kit-finanzas-v23";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.svg",
  "./offline-boot.js"
];

const SUPABASE_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

function transformarIndex(html) {
  if (html.includes("offline-boot.js")) {
    return html;
  }

  const patrones = [
    '<script src="./app.js"',
    '<script src="app.js"',
    "<script src='./app.js'",
    "<script src='app.js'"
  ];

  for (const patron of patrones) {
    if (html.includes(patron)) {
      return html.replace(
        patron,
        '<script src="./offline-boot.js"></script>\n    ' + patron
      );
    }
  }

  return html;
}

async function cacheRespuesta(request, response) {
  if (!response || !response.ok) {
    return response;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const isNavigation =
      request.mode === "navigate" ||
      new URL(request.url).pathname.endsWith("/index.html");

    if (isNavigation) {
      const html = await response.clone().text();
      const transformado = new Response(
        transformarIndex(html),
        {
          headers: {
            "Content-Type": "text/html; charset=UTF-8",
            "Cache-Control": "no-store"
          }
        }
      );

      await cache.put(request, transformado.clone());
      return transformado;
    }

    await cache.put(request, response.clone());
  } catch (error) {
    console.warn("No se pudo actualizar caché:", error);
  }

  return response;
}

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      for (const asset of APP_ASSETS) {
        try {
          const response = await fetch(asset, { cache: "no-store" });
          if (!response.ok) continue;

          if (asset === "./index.html") {
            const html = await response.clone().text();
            await cache.put(
              asset,
              new Response(transformarIndex(html), {
                headers: {
                  "Content-Type": "text/html; charset=UTF-8"
                }
              })
            );
          } else {
            await cache.put(asset, response.clone());
          }
        } catch (error) {
          console.warn("No se pudo precachear:", asset, error);
        }
      }

      try {
        const response = await fetch(SUPABASE_SCRIPT, {
          cache: "no-store"
        });

        if (response.ok) {
          await cache.put(SUPABASE_SCRIPT, response.clone());
        }
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
        const response = await fetch(event.request, {
          cache: "no-store"
        });

        return await cacheRespuesta(event.request, response);
      } catch {
        const cached = await caches.match(event.request);

        if (cached) {
          return cached;
        }

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
