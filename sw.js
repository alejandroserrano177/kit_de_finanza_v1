const CACHE_NAME = "kit-finanzas-v19";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.svg"
];

const SUPABASE_SCRIPT_PREFIX =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

const SESSION_KEY = "kf_sesion_v2";

/* =========================================================
   FALLBACK LOCAL DE SUPABASE
   ========================================================= */

const OFFLINE_SUPABASE_FALLBACK = `
(() => {
  const SESSION_KEY = "kf_sesion_v2";

  function getStoredUser() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const id =
        typeof parsed === "string"
          ? parsed
          : parsed?.id;

      if (!id) return null;

      return {
        id,
        email:
          typeof parsed === "object"
            ? (parsed.email || parsed.correo || "")
            : "",
        user_metadata: {
          nombre:
            typeof parsed === "object"
              ? (
                  parsed.nombre ||
                  parsed.user_metadata?.nombre ||
                  parsed.email ||
                  parsed.correo ||
                  "Usuario"
                )
              : "Usuario"
        }
      };
    } catch {
      return null;
    }
  }

  function sessionPayload() {
    const user = getStoredUser();

    return {
      data: {
        session: user
          ? {
              access_token: "offline",
              refresh_token: "offline",
              user
            }
          : null
      },
      error: null
    };
  }

  function offlineQuery() {
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      order() { return chain; },
      single() { return chain; },
      async upsert() {
        return {
          data: null,
          error: { message: "Sin conexión" }
        };
      },
      async insert() {
        return {
          data: null,
          error: { message: "Sin conexión" }
        };
      },
      async update() {
        return {
          data: null,
          error: { message: "Sin conexión" }
        };
      },
      async delete() {
        return {
          data: null,
          error: { message: "Sin conexión" }
        };
      }
    };

    return chain;
  }

  function createOfflineClient() {
    return {
      auth: {
        async getSession() {
          return sessionPayload();
        },

        onAuthStateChange() {
          return {
            data: {
              subscription: {
                unsubscribe() {}
              }
            }
          };
        },

        async signOut() {
          try {
            localStorage.removeItem(SESSION_KEY);
          } catch {}
          return { error: null };
        },

        async signInWithPassword() {
          return {
            data: { user: null, session: null },
            error: {
              message:
                "Sin conexión. No puedes iniciar una sesión nueva mientras estás offline."
            }
          };
        },

        async signUp() {
          return {
            data: { user: null, session: null },
            error: {
              message:
                "Sin conexión. No puedes crear una cuenta mientras estás offline."
            }
          };
        },

        async resetPasswordForEmail() {
          return {
            error: {
              message:
                "Sin conexión. La recuperación requiere Internet."
            }
          };
        },

        async updateUser() {
          return {
            data: { user: getStoredUser() },
            error: {
              message:
                "Sin conexión. Cambiar la contraseña requiere Internet."
            }
          };
        }
      },

      from() {
        return offlineQuery();
      }
    };
  }

  window.__KF_OFFLINE_SUPABASE__ = true;
  window.__KF_CREATE_OFFLINE_CLIENT__ = createOfflineClient;

  if (!window.supabase) {
    window.supabase = {};
  }

  window.supabase.createClient =
    createOfflineClient;
})();
`;

/* =========================================================
   PROTECCIÓN PARA APP.JS OFFLINE
   ========================================================= */

const OFFLINE_APP_BOOT = `
(() => {
  if (
    !window.__KF_OFFLINE_SUPABASE__ &&
    typeof window.__KF_CREATE_OFFLINE_CLIENT__ !== "function"
  ) {
    return;
  }

  const originalCreateClient =
    window.__KF_CREATE_OFFLINE_CLIENT__ ||
    window.supabase?.createClient;

  if (typeof originalCreateClient !== "function") {
    return;
  }

  window.supabase = window.supabase || {};
  window.supabase.createClient =
    function () {
      return originalCreateClient();
    };
})();
`;

/* =========================================================
   INSTALACIÓN
   ========================================================= */

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      for (const asset of APP_ASSETS) {
        try {
          const response = await fetch(asset, {
            cache: "no-store"
          });

          if (response.ok) {
            await cache.put(asset, response.clone());
          }
        } catch (error) {
          console.warn("No se pudo precachear:", asset, error);
        }
      }

      await cache.put(
        "offline-supabase-fallback.js",
        new Response(OFFLINE_SUPABASE_FALLBACK, {
          headers: {
            "Content-Type": "application/javascript"
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

/* =========================================================
   ACTIVACIÓN
   ========================================================= */

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

/* =========================================================
   PETICIONES
   ========================================================= */

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    (async () => {
      const url = event.request.url;
      const esSupabase =
        url.startsWith(SUPABASE_SCRIPT_PREFIX);
      const esAppJs =
        new URL(url).pathname.endsWith("/app.js");

      /*
       * OFFLINE REAL:
       * no intentar red ni HTTP cache para Supabase.
       */
      if (esSupabase) {
        try {
          const response = await fetch(event.request, {
            cache: "no-store"
          });

          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
            return response;
          }
        } catch {}

        return new Response(
          OFFLINE_SUPABASE_FALLBACK,
          {
            headers: {
              "Content-Type": "application/javascript"
            }
          }
        );
      }

      try {
        const response = await fetch(event.request, {
          cache: "no-store"
        });

        if (
          response.ok ||
          response.type === "opaque"
        ) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }

        return response;
      } catch (error) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request);

        if (!cached) {
          if (event.request.mode === "navigate") {
            const index = await cache.match("./index.html");
            if (index) return index;
          }

          return new Response("Sin conexión", {
            status: 503,
            statusText: "Offline"
          });
        }

        /*
         * Cuando app.js se entrega offline, anteponemos
         * una protección que fuerza el cliente local.
         */
        if (esAppJs) {
          const source = await cached.text();

          return new Response(
            OFFLINE_APP_BOOT + "\n" + OFFLINE_SUPABASE_FALLBACK + "\n" + source,
            {
              headers: {
                "Content-Type": "application/javascript"
              }
            }
          );
        }

        return cached;
      }
    })()
  );
});
