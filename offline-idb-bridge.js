(() => {
  const DB_NAME = "kit-finanzas-offline-v2";
  const SESSION_KEY = "kf_sesion_v2";
  const MOV_PREFIX = /^kf_(.+)_movimientos$/;
  const READY = Symbol("ready");

  if (!window.Dexie) {
    console.error("Dexie.js no está disponible; se mantiene el modo localStorage.");
    window.__KF_OFFLINE_READY__ = Promise.resolve();
    return;
  }

  const db = new Dexie(DB_NAME);

  db.version(1).stores({
    kv: "&key",
    movimientos: "++id_local,id,tipo,monto,fecha,sincronizado",
    ops: "++id,table,operation,createdAt"
  });

  function safeJson(value, fallback = null) {
    try {
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function localEntries() {
    const rows = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key);
      if (value !== null) rows.push({ key, value });
    }
    return rows;
  }

  function shouldHydrateExisting(localValue, indexedValue) {
    if (indexedValue === null || indexedValue === undefined) return false;
    if (localValue === null || localValue === undefined) return true;

    const localJson = safeJson(localValue, undefined);
    const indexedJson = safeJson(indexedValue, undefined);

    if (Array.isArray(localJson) && Array.isArray(indexedJson)) {
      return localJson.length === 0 && indexedJson.length > 0;
    }

    if (localJson === null && indexedJson && typeof indexedJson === "object") {
      return true;
    }

    return false;
  }

  async function hydrateLocalStorage() {
    const rows = await db.kv.toArray();

    for (const row of rows) {
      try {
        const current = localStorage.getItem(row.key);
        if (shouldHydrateExisting(current, row.value)) {
          localStorage.setItem(row.key, row.value);
        }
      } catch {}
    }
  }

  async function mirrorLocalStorage() {
    const rows = localEntries();
    if (rows.length) {
      await db.kv.bulkPut(rows);
    }

    for (const row of rows) {
      const match = row.key.match(MOV_PREFIX);
      if (!match) continue;

      const movements = safeJson(row.value, []);
      if (!Array.isArray(movements)) continue;

      await db.movimientos.clear();
      const pending = safeJson(
        localStorage.getItem(`kf_${match[1]}_pendientes_movimientos`),
        []
      ) || [];
      const pendingIds = new Set(pending.map(x => x?.id).filter(Boolean));

      const normalized = movements.map((m, index) => ({
        id_local: index + 1,
        id: m?.id || `local-${index}`,
        tipo: m?.tipo || "gasto",
        monto: Number(m?.monto || 0),
        fecha: m?.fecha || "",
        sincronizado: pendingIds.has(m?.id) ? 0 : 1,
        payload: m
      }));

      if (normalized.length) {
        await db.movimientos.bulkPut(normalized);
      }
    }
  }

  function localUser() {
    const parsed = safeJson(localStorage.getItem(SESSION_KEY), null);
    if (!parsed?.id) return null;

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

  function localSession() {
    const user = localUser();
    return user
      ? {
          access_token: "offline-local",
          refresh_token: "offline-local",
          user
        }
      : null;
  }

  async function queueOperation(operation) {
    await db.ops.add({
      ...operation,
      createdAt: Date.now()
    });
  }

  function normalizeResult(payload) {
    return Array.isArray(payload) ? (payload[0] || null) : payload;
  }

  function offlineBuilder(table) {
    let operation = null;
    let payload = null;
    const filters = [];
    let finished = false;

    async function finish() {
      if (finished) {
        return {
          data: normalizeResult(payload),
          error: null
        };
      }

      finished = true;

      if (operation) {
        await queueOperation({
          table,
          operation,
          payload,
          filters
        });
      }

      return {
        data: normalizeResult(payload),
        error: null
      };
    }

    const builder = {
      select() {
        return builder;
      },

      eq(column, value) {
        filters.push({ column, value });
        return builder;
      },

      order() {
        return builder;
      },

      upsert(value) {
        operation = "upsert";
        payload = value;
        return builder;
      },

      insert(value) {
        operation = "insert";
        payload = value;
        return builder;
      },

      update(value) {
        operation = "update";
        payload = value;
        return builder;
      },

      delete() {
        operation = "delete";
        payload = null;
        return builder;
      },

      async single() {
        return finish();
      },

      then(resolve, reject) {
        return finish().then(resolve, reject);
      },

      catch(reject) {
        return finish().catch(reject);
      }
    };

    return builder;
  }

  let activeClient = null;
  let activeFromOnline = null;

  async function replayQueuedOperations() {
    if (!navigator.onLine || !activeClient || !activeFromOnline) return;

    const operations = await db.ops.orderBy("id").toArray();

    for (const op of operations) {
      try {
        let query = activeFromOnline(op.table);

        if (op.operation === "upsert") {
          query = query.upsert(op.payload, { onConflict: "id" });
        } else if (op.operation === "insert") {
          query = query.insert(op.payload);
        } else if (op.operation === "update") {
          query = query.update(op.payload);
        } else if (op.operation === "delete") {
          query = query.delete();
        }

        for (const filter of op.filters || []) {
          query = query.eq(filter.column, filter.value);
        }

        await query;
        await db.ops.delete(op.id);
      } catch (error) {
        console.warn("Operación offline pendiente:", op, error);
        break;
      }
    }

    try {
      await mirrorLocalStorage();
    } catch {}
  }

  function patchStorage() {
    if (window.__KF_DEXIE_STORAGE_PATCHED__) return;
    window.__KF_DEXIE_STORAGE_PATCHED__ = true;

    const proto = Storage.prototype;
    const originalSetItem = proto.setItem;
    const originalRemoveItem = proto.removeItem;
    const originalClear = proto.clear;

    proto.setItem = function(key, value) {
      const result = originalSetItem.call(this, key, value);
      if (this === localStorage) {
        db.kv.put({ key: String(key), value: String(value) }).catch(() => {});
      }
      return result;
    };

    proto.removeItem = function(key) {
      const result = originalRemoveItem.call(this, key);
      if (this === localStorage) {
        db.kv.delete(String(key)).catch(() => {});
      }
      return result;
    };

    proto.clear = function() {
      const result = originalClear.call(this);
      if (this === localStorage) {
        db.kv.clear().catch(() => {});
        db.movimientos.clear().catch(() => {});
      }
      return result;
    };
  }

  function patchSupabase() {
    const supabaseGlobal = window.supabase;
    if (!supabaseGlobal?.createClient || window.__KF_DEXIE_SUPABASE_PATCHED__) {
      return;
    }

    const originalCreateClient = supabaseGlobal.createClient.bind(supabaseGlobal);

    supabaseGlobal.createClient = function(...args) {
      const client = originalCreateClient(...args);
      activeClient = client;
      activeFromOnline = client.from?.bind(client) || null;

      if (client?.auth?.getSession && !client.auth.__KF_DEXIE_PATCHED__) {
        client.auth.__KF_DEXIE_PATCHED__ = true;
        const originalGetSession = client.auth.getSession.bind(client.auth);

        client.auth.getSession = async function(...getSessionArgs) {
          await window.__KF_OFFLINE_READY__;

          if (navigator.onLine === false) {
            return {
              data: { session: localSession() },
              error: null
            };
          }

          return originalGetSession(...getSessionArgs);
        };
      }

      if (client?.from && !client.__KF_DEXIE_FROM_PATCHED__) {
        client.__KF_DEXIE_FROM_PATCHED__ = true;
        const originalFrom = client.from.bind(client);

        client.from = function(table) {
          if (navigator.onLine === false) {
            return offlineBuilder(table);
          }
          return originalFrom(table);
        };
      }

      setTimeout(() => {
        replayQueuedOperations().catch(() => {});
      }, 0);

      return client;
    };

    window.__KF_DEXIE_SUPABASE_PATCHED__ = true;
  }

  /*
   * IMPORTANTE: parcheamos Supabase ANTES de iniciar cualquier await.
   * app.js crea supabaseClient inmediatamente al cargarse.
   */
  patchSupabase();
  patchStorage();

  window.__KF_OFFLINE_READY__ = (async () => {
    try {
      await db.open();
      await hydrateLocalStorage();
      await mirrorLocalStorage();
    } catch (error) {
      console.warn("Persistencia Dexie no disponible:", error);
    }
  })();

  window.addEventListener("online", async () => {
    try {
      await window.__KF_OFFLINE_READY__;
      await replayQueuedOperations();

      if (typeof window.sincronizarPendientesMovimientos === "function") {
        await window.sincronizarPendientesMovimientos();
      }

      if (typeof window.cargarDatosSupabase === "function") {
        await window.cargarDatosSupabase();
      }

      if (typeof window.render === "function") {
        window.render();
      }
    } catch (error) {
      console.warn("Error sincronizando datos Dexie:", error);
    }
  });
})();
