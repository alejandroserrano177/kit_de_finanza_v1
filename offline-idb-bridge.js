(() => {
  const DB_NAME = "kit-finanzas-offline-v4";
  const DB_VERSION = 1;
  const SESSION_KEY = "kf_sesion_v2";

  if (!window.Dexie) {
    window.__KF_OFFLINE_READY__ = Promise.resolve();
    return;
  }

  const db = new Dexie(DB_NAME);
  db.version(DB_VERSION).stores({
    movimientos: "++id_local,id,tipo,monto,concepto,fecha,sincronizado,user_id",
    ops: "++id,table,operation,createdAt"
  });

  window.__KF_DEXIE_DB__ = db;

  const json = (v, fallback = null) => {
    try { return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  };

  function userId() {
    return json(localStorage.getItem(SESSION_KEY), {})?.id || null;
  }

  function movementKey() {
    const id = userId();
    return id ? `kf_${id}_movimientos` : null;
  }

  function normalize(m, synced = 1) {
    const concepto = String(m?.concepto ?? m?.descripcion ?? "");
    return {
      id: m?.id || null,
      user_id: userId(),
      tipo: m?.tipo || "gasto",
      monto: Number(m?.monto || 0),
      concepto,
      fecha: String(m?.fecha || ""),
      sincronizado: synced ? 1 : 0,
      payload: { ...m, concepto }
    };
  }

  async function saveLocalMovement(movement, synced = 0) {
    const row = normalize(movement, synced);
    const existing = row.id
      ? await db.movimientos.where("id").equals(row.id).first()
      : null;

    if (existing) {
      row.id_local = existing.id_local;
      await db.movimientos.put(row);
    } else {
      await db.movimientos.add(row);
    }

    const key = movementKey();
    if (key) {
      const current = json(localStorage.getItem(key), []) || [];
      const index = current.findIndex(x => x?.id === row.id);
      const payload = row.payload;
      if (index >= 0) current[index] = payload;
      else current.push(payload);
      localStorage.setItem(key, JSON.stringify(current));
    }

    return row;
  }

  async function localMovements() {
    const id = userId();
    const rows = await db.movimientos
      .filter(r => !id || r.user_id === id)
      .toArray();

    return rows
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
      .map(r => r.payload || {
        id: r.id,
        tipo: r.tipo,
        monto: r.monto,
        descripcion: r.concepto,
        fecha: r.fecha
      });
  }

  async function importLocalStorage() {
    const id = userId();
    if (!id) return;

    const key = `kf_${id}_movimientos`;
    const list = json(localStorage.getItem(key), []) || [];
    const pending = new Set(
      (json(localStorage.getItem(`kf_${id}_pendientes_movimientos`), []) || [])
        .map(x => x?.id)
        .filter(Boolean)
    );

    for (const m of list) {
      await saveLocalMovement(m, !pending.has(m?.id));
    }
  }

  async function hydrateLocalStorage() {
    const key = movementKey();
    if (!key) return;
    const rows = await localMovements();
    if (rows.length) localStorage.setItem(key, JSON.stringify(rows));
  }

  async function queue(table, operation, payload, filters = []) {
    await db.ops.add({ table, operation, payload, filters, createdAt: Date.now() });
  }

  function localTable(table) {
    const id = userId();
    return id ? json(localStorage.getItem(`kf_${id}_${table}`), []) || [] : [];
  }

  function offlineBuilder(table) {
    let operation = "select";
    let payload = null;
    const filters = [];
    let done = false;

    async function finish() {
      if (done) return { data: payload, error: null };
      done = true;

      if (operation === "select") {
        return {
          data: table === "movimientos" ? await localMovements() : localTable(table),
          error: null
        };
      }

      if (table === "movimientos") {
        if (operation === "insert") {
          const items = Array.isArray(payload) ? payload : [payload];
          for (const item of items) await saveLocalMovement(item, 0);
        } else if (operation === "update") {
          const rows = await localMovements();
          const targets = rows.filter(r => filters.every(f => r?.[f.column] === f.value));
          for (const target of targets) await saveLocalMovement({ ...target, ...payload }, 0);
        } else if (operation === "delete") {
          const id = filters.find(f => f.column === "id")?.value;
          if (id) {
            await db.movimientos.where("id").equals(id).delete();
            const key = movementKey();
            const rows = json(localStorage.getItem(key), []) || [];
            localStorage.setItem(key, JSON.stringify(rows.filter(x => x.id !== id)));
          }
        }
      }

      await queue(table, operation, payload, filters);
      return { data: Array.isArray(payload) ? payload : payload, error: null };
    }

    const builder = {
      select() { return builder; },
      eq(column, value) { filters.push({ column, value }); return builder; },
      order() { return builder; },
      insert(value) { operation = "insert"; payload = value; return builder; },
      update(value) { operation = "update"; payload = value; return builder; },
      delete() { operation = "delete"; payload = null; return builder; },
      upsert(value) { operation = "upsert"; payload = value; return builder; },
      single() { return finish(); },
      then(resolve, reject) { return finish().then(resolve, reject); },
      catch(reject) { return finish().catch(reject); }
    };
    return builder;
  }

  let onlineFrom = null;
  let syncing = false;

  async function syncPending() {
    if (!navigator.onLine || !onlineFrom || syncing) return;
    syncing = true;

    try {
      const operations = await db.ops.orderBy("id").toArray();

      for (const op of operations) {
        try {
          let query = onlineFrom(op.table);

          if (op.operation === "insert") query = query.insert(op.payload);
          else if (op.operation === "update") query = query.update(op.payload);
          else if (op.operation === "delete") query = query.delete();
          else if (op.operation === "upsert") query = query.upsert(op.payload, { onConflict: "id" });

          for (const f of op.filters || []) query = query.eq(f.column, f.value);

          const result = await query.select();
          if (result.error) throw result.error;

          if (op.table === "movimientos" && (op.operation === "insert" || op.operation === "upsert")) {
            const returned = result.data?.[0] || op.payload;
            const realId = returned?.id || op.payload?.id;
            const row = realId ? await db.movimientos.where("id").equals(realId).first() : null;
            if (row) {
              await db.movimientos.put({
                ...row,
                id: realId,
                sincronizado: 1,
                payload: { ...row.payload, ...returned, id: realId }
              });
            }
          }

          await db.ops.delete(op.id);
        } catch (error) {
          console.warn("Sincronización pendiente:", error);
          break;
        }
      }

      await hydrateLocalStorage();
    } finally {
      syncing = false;
    }
  }

  window.sincronizarPendientes = syncPending;
  window.__KF_OFFLINE_READY__ = (async () => {
    await db.open();
    await importLocalStorage();
    await hydrateLocalStorage();
  })();

  function patchSupabase() {
    const s = window.supabase;
    if (!s?.createClient || s.__KF_OFFLINE_PATCHED__) return;

    const createClient = s.createClient.bind(s);
    s.createClient = (...args) => {
      const client = createClient(...args);
      onlineFrom = client.from?.bind(client);

      if (client.from && !client.__KF_FROM_PATCHED__) {
        const originalFrom = client.from.bind(client);
        client.from = table => navigator.onLine ? originalFrom(table) : offlineBuilder(table);
        client.__KF_FROM_PATCHED__ = true;
      }

      if (client.auth?.getSession && !client.auth.__KF_SESSION_PATCHED__) {
        const originalGetSession = client.auth.getSession.bind(client.auth);
        client.auth.getSession = async (...args2) => {
          if (!navigator.onLine) {
            const session = json(localStorage.getItem(SESSION_KEY), null);
            return { data: { session: session ? { user: session } : null }, error: null };
          }
          return originalGetSession(...args2);
        };
        client.auth.__KF_SESSION_PATCHED__ = true;
      }

      setTimeout(() => syncPending().catch(console.error), 0);
      return client;
    };

    s.__KF_OFFLINE_PATCHED__ = true;
  }

  patchSupabase();

  window.addEventListener("online", async () => {
    await syncPending();
    if (typeof window.cargarDatosSupabase === "function") await window.cargarDatosSupabase();
    if (typeof window.render === "function") window.render();
  });

  window.__KF_OFFLINE_READY__.then(() => syncPending()).catch(console.error);
})();