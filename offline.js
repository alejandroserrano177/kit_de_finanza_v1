(() => {
  const DB_NAME = "kit-finanzas-offline-v5";
  const DB_VERSION = 1;
  const SESSION_KEY = "kf_sesion_v2";

  if (!window.Dexie) return;

  const db = new Dexie(DB_NAME);
  db.version(DB_VERSION).stores({
    movimientos: "++id_local,id,tipo,monto,concepto,fecha,sincronizado,user_id",
    estado: "&clave",
    operaciones: "++id,tabla,operacion,creado"
  });

  window.KitFinanzasOffline = { db };

  const leer = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const usuarioId = () => leer(SESSION_KEY, null)?.id || null;
  const prefijo = () => {
    const id = usuarioId();
    return id ? `kf_${id}_` : null;
  };

  const clave = tabla => {
    const p = prefijo();
    return p ? `${p}${tabla}` : null;
  };

  function esListaDatos(key) {
    return /kf_[^_]+_(movimientos|fijos|distribucion)$/.test(key || "");
  }

  /* Nunca permitimos que una respuesta remota vacía destruya una copia local válida. */
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    if (esListaDatos(key)) {
      try {
        const anterior = JSON.parse(this.getItem(key) || "[]");
        const nuevo = JSON.parse(value);
        if (Array.isArray(anterior) && anterior.length > 0 && Array.isArray(nuevo) && nuevo.length === 0) {
          return;
        }
      } catch {}
    }
    return originalSetItem.call(this, key, value);
  };

  function movimientoNormalizado(m, sincronizado = 1) {
    return {
      id_local: undefined,
      id: m?.id || null,
      user_id: usuarioId(),
      tipo: m?.tipo || "gasto",
      monto: Number(m?.monto || 0),
      concepto: String(m?.concepto ?? m?.descripcion ?? ""),
      fecha: String(m?.fecha || ""),
      sincronizado: sincronizado ? 1 : 0,
      payload: { ...m }
    };
  }

  async function guardarMovimientoLocal(m, sincronizado = 0) {
    if (!usuarioId()) return;
    await db.open();
    const row = movimientoNormalizado(m, sincronizado);
    const existente = row.id
      ? await db.movimientos.where("id").equals(row.id).first()
      : null;
    if (existente) row.id_local = existente.id_local;
    await db.movimientos.put(row);

    const key = clave("movimientos");
    const lista = leer(key, []) || [];
    const i = lista.findIndex(x => x?.id === row.id);
    if (i >= 0) lista[i] = row.payload;
    else lista.push(row.payload);
    originalSetItem.call(localStorage, key, JSON.stringify(lista));
  }

  async function guardarEstado(tabla, valor) {
    const key = clave(tabla);
    if (!key) return;
    await db.estado.put({ clave: key, valor });
    originalSetItem.call(localStorage, key, JSON.stringify(valor));
  }

  async function capturarEstadoLocal() {
    if (!usuarioId()) return;
    await db.open();
    const p = prefijo();
    const movimientosLocal = leer(`${p}movimientos`, []) || [];
    for (const m of movimientosLocal) await guardarMovimientoLocal(m, 1);
    for (const tabla of ["fijos", "distribucion"]) {
      const value = leer(`${p}${tabla}`, null);
      if (value !== null) await guardarEstado(tabla, value);
    }
  }

  async function restaurarEstadoLocal() {
    if (!usuarioId()) return;
    await db.open();
    const p = prefijo();

    const movimientos = await db.movimientos
      .where("user_id").equals(usuarioId())
      .toArray();
    if (movimientos.length) {
      const lista = movimientos.map(r => r.payload || {
        id: r.id,
        tipo: r.tipo,
        monto: r.monto,
        descripcion: r.concepto,
        fecha: r.fecha
      });
      originalSetItem.call(localStorage, `${p}movimientos`, JSON.stringify(lista));
    }

    for (const tabla of ["fijos", "distribucion"]) {
      const row = await db.estado.get(`${p}${tabla}`);
      if (row && row.valor != null) {
        const actual = leer(`${p}${tabla}`, null);
        if (Array.isArray(row.valor) && row.valor.length && (!Array.isArray(actual) || actual.length === 0)) {
          originalSetItem.call(localStorage, `${p}${tabla}`, JSON.stringify(row.valor));
        }
      }
    }
  }

  async function guardarPendiente(tabla, operacion, payload, filtros = []) {
    await db.open();
    await db.operaciones.add({ tabla, operacion, payload, filtros, creado: Date.now() });
  }

  function builderOffline(tabla) {
    let operacion = "select";
    let payload = null;
    const filtros = [];
    let terminado = false;

    const terminar = async () => {
      if (terminado) return { data: payload, error: null };
      terminado = true;

      if (operacion === "select") {
        if (tabla === "movimientos") {
          const rows = await db.movimientos.where("user_id").equals(usuarioId()).toArray();
          return { data: rows.map(r => r.payload), error: null };
        }
        return { data: leer(clave(tabla), []), error: null };
      }

      if (tabla === "movimientos") {
        const items = Array.isArray(payload) ? payload : [payload];
        if (operacion === "insert" || operacion === "upsert") {
          for (const item of items) await guardarMovimientoLocal(item, 0);
        }
      } else if (operacion === "upsert" || operacion === "insert") {
        const actuales = leer(clave(tabla), []) || [];
        const items = Array.isArray(payload) ? payload : [payload];
        for (const item of items) {
          const i = actuales.findIndex(x => x?.id === item?.id);
          if (i >= 0) actuales[i] = { ...actuales[i], ...item };
          else actuales.push(item);
        }
        await guardarEstado(tabla, actuales);
      }

      await guardarPendiente(tabla, operacion, payload, filtros);
      return { data: Array.isArray(payload) ? payload : [payload], error: null };
    };

    const b = {
      select() { return b; },
      eq(column, value) { filtros.push({ column, value }); return b; },
      order() { return b; },
      insert(value) { operacion = "insert"; payload = value; return b; },
      upsert(value) { operacion = "upsert"; payload = value; return b; },
      update(value) { operacion = "update"; payload = value; return b; },
      delete() { operacion = "delete"; return b; },
      single() { return terminar(); },
      then(resolve, reject) { return terminar().then(resolve, reject); },
      catch(reject) { return terminar().catch(reject); }
    };
    return b;
  }

  let clienteOnline = null;
  let sincronizando = false;

  async function sincronizarPendientes() {
    if (!navigator.onLine || !clienteOnline || sincronizando) return;
    sincronizando = true;
    try {
      await db.open();
      const ops = await db.operaciones.orderBy("id").toArray();
      for (const op of ops) {
        try {
          let q = clienteOnline.from(op.tabla);
          if (op.operacion === "insert") q = q.insert(op.payload);
          else if (op.operacion === "upsert") q = q.upsert(op.payload, { onConflict: "id" });
          else if (op.operacion === "update") q = q.update(op.payload);
          else if (op.operacion === "delete") q = q.delete();
          for (const f of op.filtros || []) q = q.eq(f.column, f.value);
          const resultado = await q.select();
          if (resultado?.error) throw resultado.error;

          if (op.tabla === "movimientos") {
            const items = Array.isArray(op.payload) ? op.payload : [op.payload];
            for (const item of items) {
              const id = resultado?.data?.find(x => x?.id === item?.id)?.id || item?.id;
              const row = id ? await db.movimientos.where("id").equals(id).first() : null;
              if (row) await db.movimientos.put({ ...row, id, sincronizado: 1 });
            }
          }
          await db.operaciones.delete(op.id);
        } catch (error) {
          console.warn("Kit de Finanzas: sincronización pendiente", error);
          break;
        }
      }
    } finally {
      sincronizando = false;
    }
  }

  window.sincronizarPendientes = sincronizarPendientes;
  window.addEventListener("online", sincronizarPendientes);

  /* Intercepta el cliente sin tocar el app.js de miles de líneas. */
  const supabase = window.supabase;
  if (supabase?.createClient) {
    const originalCreateClient = supabase.createClient.bind(supabase);
    supabase.createClient = (...args) => {
      const client = originalCreateClient(...args);
      clienteOnline = client;
      const originalFrom = client.from.bind(client);
      client.from = tabla => navigator.onLine ? originalFrom(tabla) : builderOffline(tabla);
      return client;
    };
  }

  window.__KF_OFFLINE_READY__ = (async () => {
    await db.open();
    await restaurarEstadoLocal();
    await capturarEstadoLocal();
    await sincronizarPendientes();
  })();
})();