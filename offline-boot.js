(() => {
  const SESSION_KEY = "kf_sesion_v2";

  if (navigator.onLine) {
    return;
  }

  function normalizarUsuario(parsed) {
    if (typeof parsed === "string" && parsed) {
      return {
        id: parsed,
        email: "",
        user_metadata: { nombre: "Usuario" }
      };
    }

    if (!parsed || !parsed.id) {
      return null;
    }

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

  function detectarUsuarioDesdeDatosLocales() {
    try {
      const candidatos = new Map();

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        const match = key.match(/^kf_(.+)_(movimientos|distribucion|fijos)$/);
        if (!match) continue;

        const userId = match[1];
        let cantidad = 0;

        try {
          const valor = JSON.parse(localStorage.getItem(key));
          cantidad = Array.isArray(valor) ? valor.length : 0;
        } catch {}

        const actual = candidatos.get(userId) || 0;
        candidatos.set(userId, actual + cantidad);
      }

      let mejorId = null;
      let mejorPuntaje = -1;

      for (const [userId, puntaje] of candidatos.entries()) {
        if (puntaje > mejorPuntaje) {
          mejorId = userId;
          mejorPuntaje = puntaje;
        }
      }

      if (!mejorId) return null;

      const usuario = {
        id: mejorId,
        email: "",
        user_metadata: {
          nombre: "Usuario"
        }
      };

      try {
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            id: mejorId,
            nombre: "Usuario",
            correo: ""
          })
        );
      } catch {}

      return usuario;
    } catch {
      return null;
    }
  }

  function leerUsuarioLocal() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);

      if (raw) {
        const parsed = JSON.parse(raw);
        const usuario = normalizarUsuario(parsed);
        if (usuario) return usuario;
      }
    } catch {}

    return detectarUsuarioDesdeDatosLocales();
  }

  function sesionLocal() {
    const user = leerUsuarioLocal();

    return user
      ? {
          access_token: "offline",
          refresh_token: "offline",
          user
        }
      : null;
  }

  window.__KF_OFFLINE_MODE__ = true;

  window.supabase = {
    createClient() {
      const listeners = new Set();

      const auth = {
        async getSession() {
          return {
            data: { session: sesionLocal() },
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
            data: { user: leerUsuarioLocal() },
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
          error: {
            message: "Sin conexión"
          }
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
