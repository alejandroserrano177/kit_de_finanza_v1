(() => {
  /* Módulo offline aislado: Dexie + offline.js. */
  document.write(
    '<script src="https://unpkg.com/dexie@4.4.4/dist/dexie.min.js"></script>'
  );

  document.write(
    '<script src="./offline.js"></script>'
  );

  window.addEventListener("load", () => {
    setTimeout(() => {
      ["./subcategoria-alimentacion.js", "./subcategoria-hogar.js"].forEach(src => {
        const script = document.createElement("script");
        script.src = src;
        script.async = false;
        document.body.appendChild(script);
      });
    }, 0);
  });
})();