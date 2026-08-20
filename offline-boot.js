(() => {
  const SESSION_KEY = "kf_sesion_v2";
  const SNAPSHOT_KEY = "kf_offline_snapshot_v1";

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

  function datosUsuario(userId) {
    if (!userId) return null;

    return {
      movimientos:
        leerJson(`kf_${userId}_movimientos`, []) || [],
      fijos:
        leerJson(`kf_${userId}_fijos`, []) || [],
      distribucion:
        leerJson(`kf_${userId}_distribucion`, []) || []
    };
  }

  function puntuarDatos(datos) {
    return (
      (Array.isArray(datos.movimientos) ? datos.movimientos.length : 0) +
      (Array.isArray(datos.fijos) ? datos.fijos.length : 0) +
      (Array.isArray(datos.distribucion) ? datos.distribucion.length : 0)
    );
  }

  function detectarMejorUsuarioLocal() {
    let mejorId = null;
    let mejorDatos = null;
    let mejorPuntaje = -1;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const match = key.match(/^kf_(.+)_(movimientos|fijos|distribucion)$/);
      if (!match) continue;

      const userId = match[1];
      const datos = datosUsuario(userId);
      const puntaje = puntuarDatos(datos);

      if (puntaje > mejorPuntaje) {
        mejorId = userId;
        mejorDatos = datos;
        mejorPuntaje = puntaje;
      }
    }

    return mejorId
      ? {
          id: mejorId,
          usuario: {
            id: mejorId,
            correo: "",
            nombre: "Usuario"
          },
          datos: mejorDatos || datosUsuario(mejorId)
        }
      : null;
  }

  function crearSnapshotDesdeLocal() {
    const sesion = normalizarUsuario(leerJson(SESSION_KEY, null));
    const candidato = sesion?.id
      ? {
          id: sesion.id,
          usuario: {
            id: sesion.id,
            correo: sesion.email || "",
            nombre: sesion.user_metadata?.nombre || "Usuario"
          },
          datos: datosUsuario(sesion.id)
        }
      : detectarMejorUsuarioLocal();

    if (!candidato) return null;

    const snapshot = {
      version: 1,
      guardadoEn: new Date().toISOString(),
      usuario: candidato.usuario,
      datos: candidato.datos
    };

    escribirJson(SNAPSHOT_KEY, snapshot);
    return snapshot;
  }

  function restaurarSnapshotOffline() {
    const snapshot = leerJson(SNAPSHOT_KEY, null);
    if (!snapshot?.usuario?.id) return null;

    const user = snapshot.usuario;
    const datos = snapshot.datos || {};

    escribirJson(SESSION_KEY, user);
    escribirJson(`kf_${user.id}_movimientos`, Array.isArray(datos.movimientos) ? datos.movimientos : []);
    escribirJson(`kf_${user.id}_fijos`, Array.isArray(datos.fijos) ? datos.fijos : []);
    escribirJson(`kf_${user.id}_distribucion`, Array.isArray(datos.distribucion) ? datos.distribucion : []);

    return normalizarUsuario(user);
  }

  function leerUsuarioOffline() {
    const restaurado = restaurarSnapshotOffline();
    if (restaurado) return restaurado;

    return normalizarUsuario(leerJson(SESSION_KEY, null));
  }

  function sesionOffline() {
    const user = leerUsuarioOffline();
    return user
      ? {
          access_token: "offline",
          refresh_token: "offline",
          user
        }
      : null;
  }

  if (navigator.onLine) {
    window.addEventListener("load", () => {
      setTimeout(() => {
        try {
          crearSnapshotDesdeLocal();
        } catch (error) {
          console.warn("No se pudo crear snapshot offline:", error);
        }
      }, 0);
    }, { once: true });
    return;
  }

  window.__KF_OFFLINE_MODE__ = true;

  const usuarioOffline = leerUsuarioOffline();
  if (usuarioOffline) {
    escribirJson(SESSION_KEY, {
      id: usuarioOffline.id,
      nombre: usuarioOffline.user_metadata?.nombre || "Usuario",
      correo: usuarioOffline.email || ""
    });
  }

  window.supabase = {
    createClient() {
      const listeners = new Set();

      const auth = {
        async getSession() {
          return {
            data: { session: sesionOffline() },
            error: null
          };
        },

        onAuthStateChange(callback) {
          listeners.add(callback);
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
                "Sin conexión. Debes haber iniciado sesión previamente para usar la aplicación offline."
            }
          };
        },

        async signUp() {
          return {
            data: { user: null, session: null },
            error: {
              message:
                "Sin conexión. Crear una cuenta requiere Internet."
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
            data: { user: usuarioOffline },
            error: {
              message:
                "Sin conexión. Cambiar la contraseña requiere Internet."
            }
          };
        }
      };

      function builder() {
        const result = {
          data: null,
          error: { message: "Sin conexión" }
        };

        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          single() { return this; },
          then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
          },
          catch(reject) {
            return Promise.resolve(result).catch(reject);
          },
          upsert: async () => result,
          insert: async () => result,
          update: async () => result,
          delete: async () => result
        };
      }

      return {
        auth,
        from() {
          return builder();
        }
      };
    }
  };

  window.addEventListener("online", () => {
    if (window.__KF_OFFLINE_MODE__) {
      window.location.reload();
    }
  }, { once: true });
})();
