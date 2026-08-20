(() => {
  const SESSION_KEY = "kf_sesion_v2";
  const SNAPSHOT_KEY = "kf_offline_snapshot_v3";
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

  function leerDatosUsuario(userId) {
    if (!userId) {
      return {
        movimientos: [],
        fijos: [],
        distribucion: []
      };
    }

    return {
      movimientos:
        leerJson(`kf_${userId}_movimientos`, []) || [],
      fijos:
        leerJson(`kf_${userId}_fijos`, []) || [],
      distribucion:
        leerJson(`kf_${userId}_distribucion`, []) || []
    };
  }

  function puntajeDatos(datos) {
    return (
      (Array.isArray(datos.movimientos) ? datos.movimientos.length : 0) +
      (Array.isArray(datos.fijos) ? datos.fijos.length : 0) +
      (Array.isArray(datos.distribucion) ? datos.distribucion.length : 0)
    );
  }

  function detectarUsuarioConDatos() {
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
      const datos = leerDatosUsuario(userId);
      const puntaje = puntajeDatos(datos);

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

  function usuarioLocalActual() {
    const sesion = normalizarUsuario(
      leerJson(SESSION_KEY, null)
    );

    if (sesion?.id) {
      return sesion;
    }

    return detectarUsuarioConDatos();
  }

  function snapshotExistente() {
    return leerJson(SNAPSHOT_KEY, null);
  }

  function crearSnapshot() {
    const usuario = usuarioLocalActual();
    if (!usuario?.id) return null;

    const id = usuario.id;
    const datos = leerDatosUsuario(id);
    const puntajeActual = puntajeDatos(datos);
    const anterior = snapshotExistente();
    const puntajeAnterior = anterior
      ? puntajeDatos({
          movimientos: anterior.movimientos,
          fijos: anterior.fijos,
          distribucion: anterior.distribucion
        })
      : -1;

    // Nunca sustituir un respaldo válido por uno vacío o claramente incompleto.
    if (
      anterior?.usuario?.id === id &&
      puntajeActual < puntajeAnterior
    ) {
      return anterior;
    }

    const snapshot = {
      version: 3,
      guardadoEn: new Date().toISOString(),
      usuario: {
        id,
        correo: usuario.email || "",
        nombre:
          usuario.user_metadata?.nombre ||
          "Usuario"
      },
      movimientos: datos.movimientos,
      fijos: datos.fijos,
      distribucion: datos.distribucion
    };

    escribirJson(SNAPSHOT_KEY, snapshot);
    return snapshot;
  }

  function restaurarSesionYSoloDatosFaltantes() {
    let usuario = usuarioLocalActual();

    const snapshot = snapshotExistente();

    if (!usuario?.id && snapshot?.usuario?.id) {
      usuario = normalizarUsuario(snapshot.usuario);
    }

    if (!usuario?.id) {
      return null;
    }

    const id = usuario.id;
    const actuales = leerDatosUsuario(id);
    const actualesPuntaje = puntajeDatos(actuales);

    // El estado local real tiene prioridad.
    // El snapshot solo completa lo que falte.
    if (
      snapshot?.usuario?.id === id
    ) {
      const snapshotDatos = {
        movimientos: Array.isArray(snapshot.movimientos)
          ? snapshot.movimientos
          : [],
        fijos: Array.isArray(snapshot.fijos)
          ? snapshot.fijos
          : [],
        distribucion: Array.isArray(snapshot.distribucion)
          ? snapshot.distribucion
          : []
      };

      const snapshotPuntaje = puntajeDatos(snapshotDatos);

      if (actualesPuntaje === 0 && snapshotPuntaje > 0) {
        escribirJson(
          `kf_${id}_movimientos`,
          snapshotDatos.movimientos
        );
        escribirJson(
          `kf_${id}_fijos`,
          snapshotDatos.fijos
        );
        escribirJson(
          `kf_${id}_distribucion`,
          snapshotDatos.distribucion
        );
      } else {
        // Si existe información local, jamás la reemplazamos por un snapshot vacío.
        if (!Array.isArray(actuales.movimientos)) {
          escribirJson(
            `kf_${id}_movimientos`,
            snapshotDatos.movimientos
          );
        }
        if (!Array.isArray(actuales.fijos)) {
          escribirJson(
            `kf_${id}_fijos`,
            snapshotDatos.fijos
          );
        }
        if (!Array.isArray(actuales.distribucion)) {
          escribirJson(
            `kf_${id}_distribucion`,
            snapshotDatos.distribucion
          );
        }
      }
    }

    const usuarioNormalizado = normalizarUsuario(usuario);

    escribirJson(
      SESSION_KEY,
      {
        id: usuarioNormalizado.id,
        nombre:
          usuarioNormalizado.user_metadata?.nombre ||
          "Usuario",
        correo:
          usuarioNormalizado.email ||
          ""
      }
    );

    return usuarioNormalizado;
  }

  function sesionLocal() {
    const user = restaurarSesionYSoloDatosFaltantes();

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
          "Supabase no respondió a tiempo; usando respaldo local:",
          error
        );
      }

      if (remoto?.data?.session?.user) {
        try {
          const user = remoto.data.session.user;

          escribirJson(
            SESSION_KEY,
            {
              id: user.id,
              nombre:
                user.user_metadata?.nombre ||
                user.email ||
                "Usuario",
              correo:
                user.email ||
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
        data: {
          session: null
        },
        error: null
      };
    };

    return client;
  };
})();
