const CACHE_NAME = "kit-finanzas-v22";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.svg"
];

const SUPABASE_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@Supabase/supabase-js@2";

const BOOT_MARKER = "__KF_BOOT_V22__";

const BOOT = `
(() => {
  if (window.__KF_BOOT_INSTALLED__) return;
  window.__KF_BOOT_INSTALLED__ = true;

  const SESSION_KEY = "kf_sesion_v2";

  function readLocalUser() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const id = typeof parsed === "string" ? parsed : parsed?.id;
      if (!id) return null;
      const email = typeof parsed === "object" ? (parsed.email || parsed.correo || "") : "";
      const nombre = typeof parsed === "object"
        ? (parsed.nombre || parsed.user_metadata?.nombre || email || "Usuario")
        : "Usuario";
      return { id, email, user_metadata: { nombre } };
    } catch {
      return null;
    }
  }

  function localSession() {
    const user = readLocalUser();
    return user ? { access_token: "offline", refresh_token: "offline", user } : null;
  }

  function wrapSupabase() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") return;
    const original = window.supabase.createClient;
    if (original.__kfWrappedV22) return;

    const wrapped = function (...args) {
      const client = original.apply(this, args);
      if (!client?.auth?.getSession) return client;

      const originalGetSession = client.auth.getSession.bind(client.auth);
      client.auth.getSession = async (...sessionArgs) => {
        const local = localSession();
        if (!navigator.onLine && local) {
          return { data: { session: local }, error: null };
        }
        try {
          const result = await originalGetSession(...sessionArgs);
          if (result?.data?.session?.user) return result;
          if (local) return { data: { session: local }, error: null };
          return result;
        } catch (error) {
          if (local) return { data: { session: local }, error: null };
          throw error;
        }
      };
      return client;
    };

    wrapped.__kfWrappedV22 = true;
    window.supabase.createClient = wrapped;
  }

  function replaceInicio(texto) {
    if (texto.includes(BOOT_MARKER)) return texto;

    const reemplazo = `
async function iniciarAplicacion() {
  if (iniciandoAplicacion) return;
  iniciandoAplicacion = true;

  try {
    const local = leerLocal(SESSION_KEY, null);

    if (local?.id) {
      usuario = local;
      await mostrarApp();

      if (navigator.onLine) {
        try {
          const { data } = await supabaseClient.auth.getSession();
          if (data?.session?.user) {
            usuario = establecerUsuarioDesdeAuth(data.session.user);
            escribirLocal(SESSION_KEY, usuario);
            await cargarDatos();
            render();
          }
        } catch (error) {
          console.warn("No se pudo actualizar la sesión remota:", error);
        }
      }
      return;
    }

    if (navigator.onLine) {
      try {
        const { data } = await supabaseClient.auth.getSession();
        if (data?.session?.user) {
          usuario = establecerUsuarioDesdeAuth(data.session.user);
          escribirLocal(SESSION_KEY, usuario);
          await mostrarApp();
          return;
        }
      } catch (error) {
        console.warn("Error restaurando sesión remota:", error);
      }
    }

    $("pantallaAuth").style.display = "flex";
    $("app").style.display = "none";
  } catch (error) {
    console.error("Error iniciando aplicación:", error);

    const local = leerLocal(SESSION_KEY, null);
    if (local?.id) {
      usuario = local;
      await mostrarApp();
      return;
    }

    $("pantallaAuth").style.display = "flex";
    $("app").style.display = "none";
  } finally {
    iniciandoAplicacion = false;
  }
}
`;

    const patron = /async function iniciarAplicacion\(\)\s*\{[\s\S]*?\n\}\s*\n\s*async function cerrarSesion/;
    if (!patron.test(texto)) return texto;

    return texto.replace(patron, reemplazo + "\nasync function cerrarSesion");
  }

  window.__KF_TRANSFORM_APP__ = replaceInicio;
  wrapSupabase();
})();
`;

function isAppJs(url) {
  return url.endsWith("/app.js") || url.endsWith("./app.js");
}

function isSupabase(url) {
  return url === SUPABASE_SCRIPT;
}

function transformApp(text) {
  const withBoot = text.includes(BOOT_MARKER) ? text : BOOT + "\n" + text;
  return withBoot.includes("__KF_TRANSFORM_APP__")
    ? withBoot
    : withBoot;
}

async function serveApp(request, response) {
  const text = await response.clone().text();
  const content = transformApp(text);
  return new Response(content, {
    headers: {
      "Content-Type": "application/javascript; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const asset of APP_ASSETS) {
      try {
        const response = await fetch(asset, { cache: "no-store" });
        if (isAppJs(asset)) {
          await cache.put(asset, await serveApp(asset, response));
        } else if (response.ok || response.type === "opaque") {
          await cache.put(asset, response.clone());
        }
      } catch {}
    }
    try {
      const response = await fetch(SUPABASE_SCRIPT, { cache: "no-store" });
      if (response.ok || response.type === "opaque") await cache.put(SUPABASE_SCRIPT, response.clone());
    } catch {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith((async () => {
    const request = event.request;
    const url = request.url;

    try {
      const response = await fetch(request, { cache: "no-store" });
      const cache = await caches.open(CACHE_NAME);
      if (isAppJs(url)) {
        const served = await serveApp(request, response);
        await cache.put(request, served.clone());
        return served;
      }
      if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
      return response;
    } catch {
      const cache = await caches.open(CACHE_NAME);

      if (isSupabase(url)) {
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response("", { status: 503 });
      }

      const cached = await cache.match(request);
      if (cached) return cached;

      if (request.mode === "navigate") {
        const index = await cache.match("./index.html");
        if (index) return index;
      }

      return new Response("Sin conexión", { status: 503, statusText: "Offline" });
    }
  })());
});
