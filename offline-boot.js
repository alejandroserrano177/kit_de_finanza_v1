(() => {
  const SESSION_KEY = "kf_sesion_v2";
  const SNAPSHOT_KEY = "kf_offline_snapshot_v2";
  const GET_SESSION_TIMEOUT = 2500;

  function leerJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function escribirJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function normalizarUsuario(parsed) {
    if (typeof parsed === "string" && parsed) {
      return {
        id: parsed,
        email: "",
        user_metadata: { nombre: "Usuario" }
      };
    }

    if (!parsed || !parsed.id) return null;

    return {
      id: parsed.id,
      email: parsed.correo || parsed.email || "",
      user_metadata: {
        nombre:
          parsed.nombre ||
          parsed.user_metadata?.nombre ||
          parsed.correo ||
          parsed.email ||
          "Usuario"
      }
    };
  }

  function obtenerUsuarioLocal() {
    const sesion = normalizarUsuario(
      leerJson(SESSION_KEY, null)
    );

    if (sesion?.id) {
      return sesion;
    }

    let mejor = null;
    let mejorPuntaje = -1;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const match = key.match(
        /^kf_(.+)_(movimientos|fijos|distribucion)$/
      );

      if (!match) continue;

      const userId = match[1];
      let puntaje = 0;

      for (const sufijo of [
        "movimientos",
        "fijos",
        "distribucion"
      ]) {
        try {
          const datos = JSON.parse(
            localStorage.getItem(
              `kf_${userId}_${sufijo}`
            ) || "null"
          );
          if (Array.isArray(datos)) {
            puntaje += datos.length;
          }
        } catch {}
      }

      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = {
          id: userId,
          email: "",
          user_metadata: {
            nombre: "Usuario"
          }
        };
      }
    }

    return mejor;
  }

  function crearSnapshot() {
    const usuario = obtenerUsuarioLocal();
    if (!usuario?.id) return;

    const id = usuario.id;

    const snapshot = {
      version: 2,
      guardadoEn: new Date().toISOString(),
      usuario: {
        id,
        correo: usuario.email || "",
        nombre:
          usuario.user_metadata?.nombre ||
          "Usuario"
      },
      movimientos:
        leerJson(`kf_${id}_movimientos`, []) || [],
      fijos:
        leerJson(`kf_${id}_fijos`, []) || [],
      distribucion:
        leerJson(`kf_${id}_distribucion`, []) || []
    };

    escribirJson(
      SNAPSHOT_KEY,
      snapshot
    );
  }

  function restaurarSnapshot() {
    const snapshot = leerJson(
      SNAPSHOT_KEY,
      null
    );

    if (!snapshot?.usuario?.id) {
      return normalizarUsuario(
        leerJson(SESSION_KEY, null)
      );
    }

    const user = snapshot.usuario;

    escribirJson(
      SESSION_KEY,
      {
        id: user.id,
        nombre: user.nombre || "Usuario",
        correo: user.correo || ""
      }
    );

    escribirJson(
      `kf_${user.id}_movimientos`,
      Array.isArray(snapshot.movimientos)
        ? snapshot.movimientos
        : []
    );

    escribirJson(
      `kf_${user.id}_fijos`,
      Array.isArray(snapshot.fijos)
        ? snapshot.fijos
        : []
    );

    escribirJson(
      `kf_${user.id}_distribucion`,
      Array.isArray(snapshot.distribucion)
        ? snapshot.distribucion
        : []
    );

    return normalizarUsuario(user);
  }

  function sesionLocal() {
    const user = restaurarSnapshot();

    return user
      ? {
          access_token: "offline-local",
          refresh_token: "offline-local",
          user
        }
      : null;
  }

  function conTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("TIMEOUT")),
          ms
        );
      })
    ]);
  }

  /*
   * Importante:
   * No reemplazamos Supabase completo.
   * Conservamos el cliente real para login/registro/operaciones online
   * y solo añadimos un fallback local a getSession().
   */
  const supabaseOriginal = window.supabase;

  if (
    !supabaseOriginal ||
    typeof supabaseOriginal.createClient !== "function"
  ) {
    return;
  }

  const createClientOriginal =
    supabaseOriginal.createClient.bind(
      supabaseOriginal
    );

  supabaseOriginal.createClient = function (...args) {
    const client = createClientOriginal(...args);

    if (
      !client?.auth ||
      typeof client.auth.getSession !== "function"
    ) {
      return client;
    }

    const getSessionOriginal =
      client.auth.getSession.bind(
        client.auth
      );

    client.auth.getSession = async function () {
      let remoto = null;

      try {
        remoto = await conTimeout(
          getSessionOriginal(),
          GET_SESSION_TIMEOUT
        );
      } catch (error) {
        console.warn(
          "Supabase no respondió a tiempo; usando sesión local:",
          error
        );
      }

      if (remoto?.data?.session?.user) {
        try {
          escribirJson(
            SESSION_KEY,
            {
              id: remoto.data.session.user.id,
              nombre:
                remoto.data.session.user.user_metadata?.nombre ||
                remoto.data.session.user.email ||
                "Usuario",
              correo:
                remoto.data.session.user.email ||
                ""
            }
          );
          crearSnapshot();
        } catch (error) {
          console.warn(
            "No se pudo actualizar respaldo local:",
            error
          );
        }

        return remoto;
      }

      const local = sesionLocal();

      if (local) {
        window.__KF_OFFLINE_FALLBACK__ = true;
        return {
          data: {
            session: local
          },
          error: null
        };
      }

      return remoto || {
        data: { session: null },
        error: null
      };
    };

    return client;
  };
})();
