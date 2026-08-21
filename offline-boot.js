(() => {
  /* Módulo offline aislado: Dexie + offline.js. */
  document.write(
    '<script src="https://unpkg.com/dexie@4.4.4/dist/dexie.min.js"></script>'
  );

  document.write(
    '<script src="./offline.js"></script>'
  );

  document.write(
    '<script src="./subcategoria-alimentacion.js"></script>'
  );
})();