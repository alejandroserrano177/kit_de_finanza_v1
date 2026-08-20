(() => {
  /*
   * Cargamos el puente IndexedDB de forma síncrona durante el parseo
   * para garantizar que termina antes de que el navegador ejecute app.js.
   * El puente conserva Supabase real online y actúa como capa local offline.
   */
  document.write(
    '<script src="./offline-idb-bridge.js"></script>'
  );
})();
