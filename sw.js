const CACHE_NAME = "kit-finanzas-v15";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.svg"
];

const SUPABASE_SCRIPT = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

const OFFLINE_SUPABASE_FALLBACK = `
(() => {
  if (window.supabase && typeof window.supabase.createClient === "function") return;

  const SESSION_KEY = "kf_sesion_v2";

  function getStoredUser() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const id = typeof parsed === "string" ? parsed : parsed?.id;
      if (!id) return null;

      return {
        id,
        email: typeof parsed === "object" ? (parsed.email || parsed.correo || "") : "",
        user_metadata: {
          nombre:
            typeof parsed === "object"
              ? (parsed.nombre || parsed.user_metadata?.nombre || parsed.email || parsed.correo || "Usuario")
              : "Usuario"
        }
      };
    } catch {
      return null;
    }
  }

  function getSession() {
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

  window.supabase = {
    createClient() {
      const listeners = new Set();

      const auth = {
        async getSession() {
          return getSession();
        },

        onAuthStateChange(callback) {
          listeners.add(callback);

          const session = getSession().data.session;
          queueMicrotask(() => {
            if (session) callback("SIGNED_IN", session);
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
              message: "Sin conexión. No puedes iniciar una sesión nueva mientras estás offline."
            }
          };
        },

        async signUp() {
          return {
            data: { user: null, session: null },
            error: {
              message: "Sin conexión. No puedes crear una cuenta mientras estás offline."
            }
          };
        },

        async resetPasswordForEmail() {
          return {
            error: {
              message: "Sin conexión. La recuperación de contraseña requiere Internet."
            }
          };
        },

        async updateUser() {
          return {
            data: { user: getStoredUser() },
            error: {
              message: "Sin conexión. Cambiar la contraseña requiere Internet."
            }
          };
        }
      };

      return {
        auth,

        from() {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return this;
            },
            async upsert() {
              return { data: null, error: { message: "Sin conexión" } };
            },
            async insert() {
              return { data: null, error: { message: "Sin conexión" } };
            },
            async update() {
              return { data: null, error: { message: "Sin conexión" } };
            },
            async delete() {
              return { data: null, error: { message: "Sin conexión" } };
            },
            single() {
              return this;
            }
          };
        }
      };
    }
  };
})();
`;

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

    await cache.put(
      "offline-supabase-fallback.js",
      new Response(OFFLINE_SUPABASE_FALLBACK, {
        headers: { "Content-Type": "application/javascript" }
      })
    );

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
        return new Response(OFFLINE_SUPABASE_FALLBACK, {
          headers: { "Content-Type": "application/javascript" }
        });
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
