(() => {
  const SESSION_KEY = "kf_sesion_v2";
  let instalado = false;
  let restaurando = false;

  const json = (key, fallback = null) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const snapshotUsuario = () => {
    const session = json(SESSION_KEY, null);
    if (!session?.id) return null;
    const prefix = `kf_${session.id}_`;
    return {
      session,
      movimientos: json(`${prefix}movimientos`, []),
      fijos: json(`${prefix}fijos`, []),
      distribucion: json(`${prefix}distribucion`, null)
    };
  };

  const restore = snapshot => {
    if (!snapshot) return false;
    const prefix = `kf_${snapshot.session.id}_`;
    let restored = false;

    const currentMov = json(`${prefix}movimientos`, []);
    const currentFijos = json(`${prefix}fijos`, []);
    const currentDist = json(`${prefix}distribucion`, null);

    if (Array.isArray(snapshot.movimientos) && snapshot.movimientos.length &&
        Array.isArray(currentMov) && currentMov.length === 0) {
      localStorage.setItem(`${prefix}movimientos`, JSON.stringify(snapshot.movimientos));
      restored = true;
    }

    if (Array.isArray(snapshot.fijos) && snapshot.fijos.length &&
        Array.isArray(currentFijos) && currentFijos.length === 0) {
      localStorage.setItem(`${prefix}fijos`, JSON.stringify(snapshot.fijos));
      restored = true;
    }

    if (Array.isArray(snapshot.distribucion) && snapshot.distribucion.length &&
        Array.isArray(currentDist) && currentDist.length === 0) {
      localStorage.setItem(`${prefix}distribucion`, JSON.stringify(snapshot.distribucion));
      restored = true;
    }

    return restored;
  };

  function instalar() {
    if (instalado) return true;
    if (typeof window.cargarDatosSupabase !== "function" || typeof window.cargarDatos !== "function") return false;

    const remotoOriginal = window.cargarDatosSupabase;
    const cargaLocalOriginal = window.cargarDatos;

    window.cargarDatosSupabase = async function(...args) {
      if (restaurando) return;

      const snapshot = snapshotUsuario();
      await remotoOriginal.apply(this, args);

      if (!snapshot) return;
      if (!restore(snapshot)) return;

      restaurando = true;
      try {
        await cargaLocalOriginal.apply(this, args);
      } finally {
        restaurando = false;
      }
    };

    instalado = true;
    console.info("Kit de Finanzas: protección de persistencia instalada.");
    return true;
  }

  const intentar = () => {
    if (instalar()) return;
    setTimeout(intentar, 25);
  };

  intentar();
})();
