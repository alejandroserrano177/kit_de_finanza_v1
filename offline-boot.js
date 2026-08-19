(() => {
  const SESSION_KEY = "kf_sesion_v2";

  function leerUsuarioLocal() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      if (typeof parsed === "string") {
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
    } catch {
      return null;
    }
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

  function instalarStubOffline() {
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
              data: { session: sesionLocal() },
              error: null
            };
          },

          onAuthStateChange(callback) {
            listeners.add(callback);

            const session = sesionLocal();

            queueMicrotask(() => {
              if (session) {
                try {
                  callback("SIGNED_IN", session);
                } catch {}
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

        function builder(result) {
          return {
            select() { return this; },
            eq() { return this; },
            order() { return this; },
            single() { return this; },
            then(resolve) {
              return Promise.resolve(result).then(resolve);
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
            return builder({
              data: null,
              error: { message: "Sin conexión" }
            });
          }
        };
      }
    };
  }

  if (!navigator.onLine) {
    instalarStubOffline();
    return;
  }

  if (
    window.supabase &&
    typeof window.supabase.createClient === "function"
  ) {
    const originalCreateClient =
      window.supabase.createClient;

    if (originalCreateClient.__kfOfflineWrapped) {
      return;
    }

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
        try {
          const result =
            await originalGetSession(...sessionArgs);

          if (result?.data?.session?.user) {
            return result;
          }

          const local = sesionLocal();

          if (local) {
            return {
              data: { session: local },
              error: null
            };
          }

          return result;
        } catch (error) {
          const local = sesionLocal();

          if (local) {
            return {
              data: { session: local },
              error: null
            };
          }

          throw error;
        }
      };

      return client;
    };

    wrappedCreateClient.__kfOfflineWrapped = true;
    window.supabase.createClient =
      wrappedCreateClient;
  }
})();
