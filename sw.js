const CACHE_NAME = "kit-finanzas-v21";

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

const BOOT_MARKER = "__KF_OFFLINE_BOOT_V21__";

const OFFLINE_BOOT = `
(() => {
  if (window.${BOOT_MARKER}) return;
  window.${BOOT_MARKER} = true;

  const SESSION_KEY = "kf_sesion_v2";

  function localUser() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const id =
        typeof parsed === "string"
          ? parsed
          : parsed?.id;

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

  function localSession() {
    const user = localUser();

    return user
      ? {
          access_token: "offline",
          refresh_token: "offline",
          user
        }
      : null;
  }

  function installLocalSupabase() {
    if (
      window.supabase &&
      typeof window.supabase.createClient === "function"
    ) {
      return;
    }

    window.supabase = {
      createClient() {
        const listeners = new Set();

        const auth = {
          async getSession() {
            return {
              data: {
                session: localSession()
              },
              error: null
            };
          },

          onAuthStateChange(callback) {
            listeners.add(callback);

            const session = localSession();

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
              data: { user: localUser() },
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
              upsert: async () => ({
                data: null,
                error: { message: "Sin conexión" }
              }),
              insert: async () => ({
                data: null,
                error: { message: "Sin conexión" }
              }),
              update: async () => ({
                data: null,
                error: { message: "Sin conexión" }
              }),
              delete: async () => ({
                data: null,
                error: { message: "Sin conexión" }
              })
            };
          }
        };
      }
    };
  }

  if (
    window.supabase &&
    typeof window.supabase.createClient === "function"
  ) {
    const originalCreateClient =
      window.supabase.createClient;

    if (!originalCreateClient.__kfWrapped) {
      const wrappedCreateClient = function (...args) {
        const client =
          originalCreateClient.apply(this, args);

        if (
          !client ||
          !client.auth ||
          typeof client.auth.getSession !== "function"
        ) {
          return client;
        }

        const originalGetSession =
          client.auth.getSession.bind(client.auth);

        client.auth.getSession = async (...sessionArgs) => {
          const local = localSession();

          if (!navigator.onLine && local) {
            return {
              data: {
                session: local
              },
              error: null
            };
          }

          try {
            const result =
              await originalGetSession(...sessionArgs);

            if (
              result?.data?.session?.user
            ) {
              return result;
            }

            if (local) {
              return {
                data: {
                  session: local
                },
                error: null
              };
            }

            return result;
          } catch (error) {
            if (local) {
              return {
                data: {
                  session: local
                },
                error: null
              };
            }

            throw error;
          }
        };

        return client;
      };

      wrappedCreateClient.__kfWrapped = true;
      window.supabase.createClient =
        wrappedCreateClient;
    }
  } else {
    installLocalSupabase();
  }
})();
`;

const OFFLINE_SUPABASE_FALLBACK = OFFLINE_BOOT;

function esAppJs(url) {
  return url.endsWith("/app.js") || url.endsWith("./app.js");
}

function esSupabaseScript(url) {
  return url === SUPABASE_SCRIPT;
}

function transformarAppJs(texto) {
  if (texto.includes(BOOT_MARKER)) {
    return texto;
  }

  return OFFLINE_BOOT + "\n" + texto;
}

async function cachear(cache, request, response, transformar = false) {
  if (!response) return response;

  if (
    !response.ok &&
    response.type !== "opaque"
  ) {
    return response;
  }

  try {
    if (transformar) {
      const texto =
        await response.clone().text();

      const contenido =
        transformarAppJs(texto);

      const transformada =
        new Response(
          contenido,
          {
            headers: {
              "Content-Type":
                "application/javascript; charset=UTF-8",
              "Cache-Control":
                "no-store"
            }
          }
        );

      await cache.put(
        request,
        transformada.clone()
      );

      return transformada;
    }

    await cache.put(
      request,
      response.clone()
    );
  } catch (error) {
    console.warn(
      "No se pudo actualizar caché:",
      error
    );
  }

  return response;
}

self.addEventListener(
  "install",
  event => {
    event.waitUntil(
      (async () => {
        const cache =
          await caches.open(
            CACHE_NAME
          );

        for (
          const asset
          of APP_ASSETS
        ) {
          try {
            const response =
              await fetch(
                asset,
                {
                  cache:
                    "no-store"
                }
              );

            await cachear(
              cache,
              asset,
              response,
              esAppJs(asset)
            );
          } catch (
            error
          ) {
            console.warn(
              "No se pudo precachear:",
              asset,
              error
            );
          }
        }

        await cache.put(
          "offline-supabase-fallback.js",
          new Response(
            OFFLINE_SUPABASE_FALLBACK,
            {
              headers: {
                "Content-Type":
                  "application/javascript; charset=UTF-8"
              }
            }
          )
        );

        await self.skipWaiting();
      })()
    );
  }
);

self.addEventListener(
  "activate",
  event => {
    event.waitUntil(
      (async () => {
        const keys =
          await caches.keys();

        await Promise.all(
          keys
            .filter(
              key =>
                key !==
                CACHE_NAME
            )
            .map(
              key =>
                caches.delete(
                  key
                )
            )
        );

        await self.clients.claim();
      })()
    );
  }
);

self.addEventListener(
  "fetch",
  event => {
    if (
      event.request.method !==
      "GET"
    ) {
      return;
    }

    event.respondWith(
      (async () => {
        const request =
          event.request;

        const url =
          request.url;

        try {
          const response =
            await fetch(
              request,
              {
                cache:
                  "no-store"
              }
            );

          return await cachear(
            await caches.open(
              CACHE_NAME
            ),
            request,
            response,
            esAppJs(url)
          );
        } catch {
          const cache =
            await caches.open(
              CACHE_NAME
            );

          if (
            esSupabaseScript(url)
          ) {
            return new Response(
              OFFLINE_SUPABASE_FALLBACK,
              {
                headers: {
                  "Content-Type":
                    "application/javascript; charset=UTF-8"
                }
              }
            );
          }

          if (
            esAppJs(url)
          ) {
            const cachedApp =
              await cache.match(
                request
              );

            if (cachedApp) {
              return cachedApp;
            }
          }

          const cached =
            await cache.match(
              request
            );

          if (cached) {
            return cached;
          }

          if (
            request.mode ===
            "navigate"
          ) {
            const index =
              await cache.match(
                "./index.html"
              );

            if (index) {
              return index;
            }
          }

          return new Response(
            "Sin conexión",
            {
              status:
                503,
              statusText:
                "Offline"
            }
          );
        }
      })()
    );
  }
);
