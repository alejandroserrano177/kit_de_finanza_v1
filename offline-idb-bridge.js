(() => {
  const DB_NAME = "kit-finanzas-offline-v3";
  const DB_VERSION = 1;
  const SESSION_KEY = "kf_sesion_v2";
  const MOV_PREFIX = /^kf_(.+)_movimientos$/;

  if (!window.Dexie) {
    console.error("Dexie.js no está disponible; se mantiene el modo localStorage.");
    window.__KF_OFFLINE_READY__ = Promise.resolve();
    return;
  }

  const db = new Dexie(DB_NAME);

  db.version(DB_VERSION).stores({
    kv: "&key",
    movimientos: "++id_local,id,tipo,monto,concepto,fecha,sincronizado",
    ops: "++id,table,operation,createdAt"
  });

  window.__KF_DEXIE_DB__ = db;

  function safeJson(value, fallback = null) {
    try {
      return value === null || value === undefined ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function sessionUserId() {
    const session = safeJson(localStorage.getItem(SESSION_KEY), null);
    return session?.id || null;
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

  function normalizeMovement(m, sincronizado = 1, idLocal) {
    const concepto = String(m?.concepto ?? m?.descripcion ?? "");
    const row = {
      id: m?.id || null,
      tipo: m?.tipo || "gasto",
      monto: Number(m?.monto || 0),
      concepto,
      fecha: String(m?.fecha || ""),
      sincronizado: sincronizado ? 1 : 0,
      payload: { ...m, concepto }
    };

    if (idLocal !== undefined) row.id_local = idLocal;
    return row;
  }

  async function mirrorLocalStorage() {
    const rows = localEntries();
    if (rows.length) await db.kv.bulkPut(rows);

    const movementRows = [];
    for (const row of rows) {
      const match = row.key.match(MOV_PREFIX);
      if (!match) continue;

      const movements = safeJson(row.value, []);
      if (!Array.isArray(movements)) continue;

      const pending = safeJson(
        localStorage.getItem(`kf_${match[1]}_pendientes_movimientos`),
        []
      ) || [];
      const pendingIds = new Set(pending.map(x => x?.id).filter(Boolean));

      movements.forEach((movement, index) => {
        const normalized = normalizeMovement(
          movement,
          pendingIds.has(movement?.id) ? 0 : 1,
          index + 1
        );
        normalized.user_id = match[1];
        movementRows.push(normalized);
      });
    }

    if (!movementRows.length) return;

    const currentUser = sessionUserId();
    const existing = await db.movimientos.toArray().catch(() => []);
    const others = currentUser
      ? existing.filter(row => row.user_id && row.user_id !== currentUser)
      : [];

    await db.movimientos.clear();
    await db.movimientos.bulkPut([
      ...others,
      ...movementRows.filter(row => !currentUser || row.user_id === currentUser)
    ]);
  }

  async function hydrateLocalStorage() {
    const rows = await db.kv.toArray();
    for (const row of rows) {
      try {
        if (localStorage.getItem(row.key) === null) {
          localStorage.setItem(row.key, row.value);
        }
      } catch {}
    }
  }

  function localUser() {
    const parsed = safeJson(localStorage.getItem(SESSION_KEY), null);
    if (!parsed?.id) return null;
    return {
      id: parsed.id,
      email: parsed.correo || parsed.email || "",
      user_metadata: {
        nombre: parsed.nombre || parsed.user_metadata?.nombre || parsed.correo || parsed.email || "Usuario"
      }
    };
  }

  function localSession() {
    const user = localUser();
    return user
      ? { access_token: "offline-local", refresh_token: "offline-local", user }
      : null;
  }

  async function queueOperation(operation) {
    await db.ops.add({ ...operation, createdAt: Date.now() });
  }

  async function readLocalMovimientos() {
    const userId = sessionUserId();
    const rows = await db.movimientos.toArray();
    return rows
      .filter(row => !userId || !row.user_id || row.user_id === userId)
      .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
      .map(row => row.payload || {
        id: row.id,
        tipo: row.tipo,
        monto: row.monto,
        concepto: row.concepto,
        descripcion: row.concepto,
        fecha: row.fecha
      });
  }

  function localTableValue(table) {
    const userId = sessionUserId();
    if (!userId) return [];
    return safeJson(localStorage.getItem(`kf_${userId}_${table}`), []) || [];
  }

  function offlineBuilder(table) {
    let operation = null;
    let payload = null;
    const filters = [];
    let finished = false;

    async function finish() {
      if (finished) return { data: payload, error: null };
      finished = true;

      if (!operation || operation === "select") {
        const data = table === "movimientos"
          ? await readLocalMovimientos()
          : localTableValue(table);
        return { data, error: null };
      }

      await queueOperation({ table, operation, payload, filters });

      if (table === "movimientos" && operation === "insert") {
        const movement = normalizeMovement(payload, 0);
        movement.user_id = sessionUserId();
        await db.movimientos.add(movement);
      }

      return { data: Array.isArray(payload) ? (payload[0] || null) : payload, error: null };
    }

    const builder = {
      select() {
        if (!operation) operation = "select";
        return builder;
      },
      eq(column, value) {
        filters.push({ column, value });
        return builder;
      },
      order() { return builder; },
      upsert(value) { operation = "upsert"; payload = value; return builder; },
      insert(value) { operation = "insert"; payload = value; return builder; },
      update(value) { operation = "update"; payload = value; return builder; },
      delete() { operation = "delete"; payload = null; return builder; },
      async single() { return finish(); },
      then(resolve, reject) { return finish().then(resolve, reject); },
      catch(reject) { return finish().catch(reject); }
    };

    return builder;
  }

  let activeClient = null;
  let activeFromOnline = null;
  let syncRunning = false;

  async function markMovementSynced(payload, returnedRow) {
    const localId = payload?.id || returnedRow?.id || null;
    let rows = localId
      ? await db.movimientos.where("id").equals(localId).toArray()
      : [];

    if (!rows.length && payload) {
      const concepto = String(payload.concepto ?? payload.descripcion ?? "");
      rows = (await db.movimientos.where("concepto").equals(concepto).toArray())
        .filter(row => Number(row.monto) === Number(payload.monto));
    }

    for (const row of rows) {
      const realId = returnedRow?.id || row.id || localId;
      await db.movimientos.put({
        ...row,
        id: realId,
        sincronizado: 1,
        payload: { ...(row.payload || payload || {}), ...(returnedRow || {}), id: realId }
      });
    }
  }

  async function replayQueuedOperations() {
    if (!navigator.onLine || !activeClient || !activeFromOnline || syncRunning) return;
    syncRunning = true;

    try {
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

          const result = await query.select?.();
          if (op.table === "movimientos" && op.operation === "insert") {
            await markMovementSynced(op.payload, result?.data?.[0] || null);
          }

          await db.ops.delete(op.id);
        } catch (error) {
          console.warn("Operación offline pendiente:", op, error);
          break;
        }
      }

      await mirrorLocalStorage();
    } finally {
      syncRunning = false;
    }
  }

  async function sincronizarPendientes() {
    await window.__KF_OFFLINE_READY__;
    await replayQueuedOperations();

    if (navigator.onLine && typeof window.sincronizarPendientesMovimientos === "function") {
      await window.sincronizarPendientesMovimientos();
    }
  }

  window.sincronizarPendientes = sincronizarPendientes;
  window.replayDexieQueue = replayQueuedOperations;

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
      if (this === localStorage) db.kv.delete(String(key)).catch(() => {});
      return result;
    };

    proto.clear = function() {
      const result = originalClear.call(this);
      if (this === localStorage) {
        db.kv.clear().catch(() => {});
        db.movimientos.clear().catch(() => {});
        db.ops.clear().catch(() => {});
      }
      return result;
    };
  }

  function patchSupabase() {
    const supabaseGlobal = window.supabase;
    if (!supabaseGlobal?.createClient || window.__KF_DEXIE_SUPABASE_PATCHED__) return;

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
          if (!navigator.onLine) {
            return { data: { session: localSession() }, error: null };
          }
          return originalGetSession(...getSessionArgs);
        };
      }

      if (client?.from && !client.__KF_DEXIE_FROM_PATCHED__) {
        client.__KF_DEXIE_FROM_PATCHED__ = true;
        const originalFrom = client.from.bind(client);
        client.from = function(table) {
          return navigator.onLine ? originalFrom(table) : offlineBuilder(table);
        };
      }

      setTimeout(() => sincronizarPendientes().catch(() => {}), 0);
      return client;
    };

    window.__KF_DEXIE_SUPABASE_PATCHED__ = true;
  }

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
      await sincronizarPendientes();
      if (typeof window.cargarDatosSupabase === "function") {
        await window.cargarDatosSupabase();
      }
      if (typeof window.render === "function") window.render();
    } catch (error) {
      console.warn("Error sincronizando datos Dexie:", error);
    }
  });

  window.__KF_OFFLINE_READY__.then(() => sincronizarPendientes().catch(() => {}));
})();
