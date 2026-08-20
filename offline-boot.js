(() => {
  /*
   * Arranque offline-first:
   * 1) Dexie
   * 2) Puente IndexedDB
   * 3) Protección de persistencia
   * 4) app.js
   */
  document.write(
    '<script src="https://unpkg.com/dexie@4.4.4/dist/dexie.min.js"></script>'
  );

  document.write(
    '<script src="./offline-idb-bridge.js"></script>'
  );

  document.write(
    '<script src="./offline-finalizer.js"></script>'
  );
})();
