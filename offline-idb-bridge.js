(() => {
  const DB_NAME = "kit-finanzas-offline-v1";
  const STORE_NAME = "kv";
  const DB_VERSION = 1;
  const SESSION_KEY = "kf_sesion_v2";
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB error"));
    });
    return dbPromise;
  }

  async function getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || new Error("IndexedDB read error"));
    });
  }

  async function put(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write error"));
    });
  }

  async function remove(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB delete error"));
    });
  }

  function entries() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key);
      if (value !== null) out.push({ key, value });
    }
    return out;
  }

  async function hydrate() {
    const rows = await getAll();
    for (const row of rows) {
      try {
        if (localStorage.getItem(row.key) === null) localStorage.setItem(row.key, row.value);
      } catch {}
    }
  }

  async function mirrorAll() {
    await Promise.all(entries().map(x => put(x.key, x.value)));
  }

  function patchStorage() {
    if (window.__KF_IDB_PATCHED__) return;
    window.__KF_IDB_PATCHED__ = true;
    const proto = Storage.prototype;
    const originalSet = proto.setItem;
    const originalRemove = proto.removeItem;
    const originalClear = proto.clear;

    proto.setItem = function(key, value) {
      const result = originalSet.call(this, key, value);
      if (this === localStorage) put(String(key), String(value)).catch(() => {});
      return result;
    };

    proto.removeItem = function(key) {
      const result = originalRemove.call(this, key);
      if (this === localStorage) remove(String(key)).catch(() => {});
      return result;
    };

    proto.clear = function() {
      const result = originalClear.call(this);
      if (this === localStorage) {
        openDB().then(db => new Promise(resolve => {
          const tx = db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        })).catch(() => {});
      }
      return result;
    };
  }

  function localUser() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (!value?.id) return null;
      return {
        id: value.id,
        email: value.correo || value.email || "",
        user_metadata: { nombre: value.nombre || value.user_metadata?.nombre || value.correo || value.email || "Usuario" }
      };
    } catch {
      return null;
    }
  }

  function offlineSession() {
    const user = localUser();
    return user ? { access_token: "offline-local", refresh_token: "offline-local", user } : null;
  }

  function localBuilder() {
    let payload = null;
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      order() { return builder; },
      single() { return Promise.resolve({ data: Array.isArray(payload) ? (payload[0] || null) : payload, error: null }); },
      upsert(value) { payload = value; return builder; },
      insert(value) { payload = value; return builder; },
      update(value) { payload = value; return builder; },
      delete() { payload = null; return builder; },
      then(resolve, reject) { return Promise.resolve({ data: payload, error: null }).then(resolve, reject); },
      catch(reject) { return Promise.resolve({ data: payload, error: null }).catch(reject); }
    };
    return builder;
  }

  async function install() {
    patchStorage();
    try {
      await openDB();
      await hydrate();
      await mirrorAll();
    } catch (error) {
      console.warn("IndexedDB offline bridge:", error);
    }

    const supabase = window.supabase;
    if (!supabase?.createClient || window.__KF_SUPABASE_PATCHED__) {
      window.__KF_OFFLINE_READY__ = Promise.resolve();
      return;
    }

    const originalCreate = supabase.createClient.bind(supabase);
    supabase.createClient = function(...args) {
      const client = originalCreate(...args);
      if (!client?.auth || client.__KF_IDB_BRIDGED__) return client;
      client.__KF_IDB_BRIDGED__ = true;

      const originalGetSession = client.auth.getSession?.bind(client.auth);
      const originalFrom = client.from?.bind(client);

      if (originalGetSession) {
        client.auth.getSession = async function() {
          await window.__KF_OFFLINE_READY__;
          if (navigator.onLine === false) return { data: { session: offlineSession() }, error: null };
          return originalGetSession();
        };
      }

      if (originalFrom) {
        client.from = function(table) {
          return navigator.onLine === false ? localBuilder(table) : originalFrom(table);
        };
      }

      return client;
    };

    window.__KF_SUPABASE_PATCHED__ = true;
  }

  window.__KF_OFFLINE_READY__ = install().catch(error => {
    console.warn("No se pudo inicializar IndexedDB:", error);
  });

  window.addEventListener("online", () => mirrorAll().catch(() => {}));
})();
