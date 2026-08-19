const CACHE_NAME = "kit-finanzas-v20";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.svg"
];

const SUPABASE_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

const OFFLINE_SUPABASE_FALLBACK = `
(() => {
  const SESSION_KEY = "kf_sesion_v2";

  function getStoredUser() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const id = typeof parsed === "string" ? parsed : parsed?.id;
      if (!id) return null;

      const email =
        typeof parsed === "object"
          ? (parsed.email || parsed.correo || "")
          : "";

      const nombre =
        typeof parsed === "object"
          ? (
              parsed.nombre ||
              parsed.user_metadata?.nombre ||
              email ||
              "Usuario"
            )
          : "Usuario";

      return {
        id,
        email,
        user_metadata: {
          nombre
        }
      };
    } catch {
      return null;
    }
  }

  function buildSession() {
    const user = getStoredUser();

    return user
      ? {
          access_token: "offline",
          refresh_token: "offline",
          user
        }
      : null;
  }

  window.supabase = {
    createClient() {
      const listeners = new Set();

      const auth = {
        async getSession() {
          return {
            data: {
              session: buildSession()
            },
            error: null
          };
        },

        onAuthStateChange(callback) {
          listeners.add(callback);

          const session = buildSession();

          queueMicrotask(() => {
            if (session) {
              callback("SIGNED_IN", session);
            }
          });

          return {
            data: {
              subscription: {
                unsubscribe() {
                  listeners.delete(callback);
                }
              }
            }
          };
        },

        async signOut() {
          try {
            localStorage.removeItem(SESSION_KEY);
          } catch {}

          for (const callback of listeners) {
            try {
              callback("SIGNED_OUT", null);
            } catch {}
          }

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
                "Sin conexión. La recuperación de contraseña requiere Internet."
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
      };

      return {
        auth,
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            order() { return this; },
            single() { return this; },
            upsert: async () => ({ data: null, error: { message: "Sin conexión" } }),
            insert: async () => ({ data: null, error: { message: "Sin conexión" } }),
            update: async () => ({ data: null, error: { message: "Sin conexión" } }),
            delete: async () => ({ data: null, error: { message: "Sin conexión" } })
          };
        }
      };
    }
  };
})();
`;

function esAppJs(url) {
  return url.endsWith("/app.js") || url.endsWith("./app.js");
}

function esSupabaseScript(url) {
  return url === SUPABASE_SCRIPT;
}

async function cachear(cache, request, response) {
  if (!response) return;

  if (response.ok || response.type === "opaque") {
    try {
      await cache.put(request, response.clone());
    } catch (error) {
      console.warn("No se pudo actualizar caché:", error);
    }
  }
}

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      for (const asset of APP_ASSETS) {
        try {
          const response = await fetch(asset, { cache: "no-store" });
          await cachear(cache, asset, response);
        } catch (error) {
          console.warn("No se pudo precachear:", asset, error);
        }
      }

      await cache.put(
        "offline-supabase-fallback.js",
        new Response(OFFLINE_SUPABASE_FALLBACK, {
          headers: {
            "Content-Type": "application/javascript; charset=UTF-8"
          }
        })
      );

      try {
        const response = await fetch(SUPABASE_SCRIPT, { cache: "no-store" });
        await cachear(cache, SUPABASE_SCRIPT, response);
      } catch (error) {
        console.warn("Supabase no disponible durante instalación:", error);
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
      const request = event.request;
      const url = request.url;

      try {
        const response = await fetch(request, { cache: "no-store" });

        if (response.ok || response.type === "opaque") {
          const cache = await caches.open(CACHE_NAME);
          await cachear(cache, request, response);
        }

        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);

        if (esSupabaseScript(url)) {
          return new Response(OFFLINE_SUPABASE_FALLBACK, {
            headers: {
              "Content-Type": "application/javascript; charset=UTF-8"
            }
          });
        }

        if (esAppJs(url)) {
          const cachedApp = await cache.match(request);

          if (cachedApp) {
            const appText = await cachedApp.text();

            return new Response(
              OFFLINE_SUPABASE_FALLBACK + "\n" + appText,
              {
                headers: {
                  "Content-Type": "application/javascript; charset=UTF-8",
                  "Cache-Control": "no-store"
                }
              }
            );
          }
        }

        const cached = await cache.match(request);
        if (cached) return cached;

        if (request.mode === "navigate") {
          const index = await cache.match("./index.html");
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
