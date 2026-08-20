(() => {
  /*
   * Orden de arranque offline-first:
   * 1) Dexie.js
   * 2) Puente IndexedDB / Supabase offline
   * 3) app.js (ya presente en index.html)
   *
   * document.write() mantiene el orden de ejecución durante el parseo.
   */
  document.write(
    '<script src="https://unpkg.com/dexie@4.4.4/dist/dexie.min.js"></script>'
  );

  document.write(
    '<script src="./offline-idb-bridge.js"></script>'
  );
})();
