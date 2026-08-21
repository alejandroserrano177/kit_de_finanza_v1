(() => {
  "use strict";

  function iniciarSubcategoriasAlimentacion() {
    if (typeof movimientoASupabase !== "function") return;

    const esAlimentacion = categoriaId => {
      if (!categoriaId || !Array.isArray(distribucion)) return false;
      const c = distribucion.find(x => x.id === categoriaId);
      return String(c?.nombre || "").trim().toLowerCase() === "alimentación" ||
             String(c?.nombre || "").trim().toLowerCase() === "alimentacion";
    };

    const crearSelect = (id, label, insertAfter) => {
      let select = document.getElementById(id);
      if (select) return select;

      const wrapper = document.createElement("div");
      wrapper.id = id + "Contenedor";
      wrapper.style.display = "none";
      wrapper.style.marginTop = "4px";

      const etiqueta = document.createElement("label");
      etiqueta.htmlFor = id;
      etiqueta.textContent = label;

      select = document.createElement("select");
      select.id = id;
      select.innerHTML = `
        <option value="">Selecciona una subcategoría</option>
        <option value="mercado">🛒 Mercado</option>
        <option value="comida_fuera">🍔 Comida fuera</option>
      `;

      wrapper.appendChild(etiqueta);
      wrapper.appendChild(select);
      insertAfter.parentNode.insertBefore(wrapper, insertAfter.nextSibling);
      return select;
    };

    const categoria = document.getElementById("categoria");
    if (categoria) {
      const subcategoria = crearSelect(
        "subcategoriaAlimentacion",
        "Subcategoría de alimentación",
        categoria
      );

      const actualizarVisibilidad = () => {
        const visible = esAlimentacion(categoria.value);
        const contenedor = document.getElementById("subcategoriaAlimentacionContenedor");
        if (contenedor) contenedor.style.display = visible ? "block" : "none";
        if (!visible) subcategoria.value = "";
      };

      categoria.addEventListener("change", actualizarVisibilidad);
      actualizarVisibilidad();
    }

    const editarCategoria = document.getElementById("editarCategoria");
    if (editarCategoria) {
      const subcategoriaEditar = crearSelect(
        "editarSubcategoriaAlimentacion",
        "Subcategoría de alimentación",
        editarCategoria
      );

      const actualizarEdicion = () => {
        const visible = esAlimentacion(editarCategoria.value);
        const contenedor = document.getElementById("editarSubcategoriaAlimentacionContenedor");
        if (contenedor) contenedor.style.display = visible ? "block" : "none";
        if (!visible) subcategoriaEditar.value = "";
      };

      editarCategoria.addEventListener("change", actualizarEdicion);
      actualizarEdicion();
    }

    const originalMovimientoASupabase = movimientoASupabase;
    movimientoASupabase = function (m) {
      const row = originalMovimientoASupabase(m);
      row.subcategoria = esAlimentacion(m.categoria)
        ? (m.subcategoria || document.getElementById("subcategoriaAlimentacion")?.value || null)
        : null;
      return row;
    };

    const originalMovimientoDesdeSupabase = movimientoDesdeSupabase;
    movimientoDesdeSupabase = function (row) {
      const m = originalMovimientoDesdeSupabase(row);
      m.subcategoria = row.subcategoria || "";
      return m;
    };

    const originalGuardarMovimientoSupabase = guardarMovimientoSupabase;
    guardarMovimientoSupabase = async function (m) {
      if (esAlimentacion(m.categoria)) {
        m.subcategoria = document.getElementById("subcategoriaAlimentacion")?.value || "";
      } else {
        m.subcategoria = "";
      }
      return originalGuardarMovimientoSupabase(m);
    };

    const originalActualizarMovimientoSupabase = actualizarMovimientoSupabase;
    actualizarMovimientoSupabase = async function (m) {
      if (esAlimentacion(m.categoria)) {
        m.subcategoria = document.getElementById("editarSubcategoriaAlimentacion")?.value || "";
      } else {
        m.subcategoria = "";
      }
      return originalActualizarMovimientoSupabase(m);
    };

    const originalRenderMovimiento = renderMovimiento;
    renderMovimiento = function (m) {
      const html = originalRenderMovimiento(m);
      if (!m.subcategoria || !esAlimentacion(m.categoria)) return html;

      const texto = m.subcategoria === "mercado"
        ? "🛒 Mercado"
        : m.subcategoria === "comida_fuera"
          ? "🍔 Comida fuera"
          : m.subcategoria;

      return html.replace(
        /(<small>\s*[^<]*<\/small>)/,
        `$1<small style="display:block;margin-top:3px">${escapeHtml(texto)}</small>`
      );
    };

    const actualizarEdicionDesdeMovimiento = id => {
      const m = movimientos.find(x => x.id === id);
      const select = document.getElementById("editarSubcategoriaAlimentacion");
      if (!m || !select) return;
      select.value = m.subcategoria || "";
      document.getElementById("editarSubcategoriaAlimentacionContenedor").style.display =
        esAlimentacion(m.categoria) ? "block" : "none";
    };

    const originalEditarMovimiento = window.editarMovimiento;
    if (typeof originalEditarMovimiento === "function") {
      window.editarMovimiento = id => {
        originalEditarMovimiento(id);
        setTimeout(() => actualizarEdicionDesdeMovimiento(id), 0);
      };
    }

    const filtroCategoria = document.getElementById("filtroCategoria");
    if (filtroCategoria && !document.getElementById("filtroSubcategoriaAlimentacion")) {
      const filtro = document.createElement("select");
      filtro.id = "filtroSubcategoriaAlimentacion";
      filtro.innerHTML = `
        <option value="todas">Todas las subcategorías</option>
        <option value="mercado">🛒 Mercado</option>
        <option value="comida_fuera">🍔 Comida fuera</option>
      `;
      filtro.style.display = "none";
      filtroCategoria.parentNode.insertBefore(filtro, filtroCategoria.nextSibling);

      filtroCategoria.addEventListener("change", () => {
        const c = distribucion.find(x => x.id === filtroCategoria.value);
        const visible = String(c?.nombre || "").trim().toLowerCase() === "alimentación" ||
          String(c?.nombre || "").trim().toLowerCase() === "alimentacion";
        filtro.style.display = visible ? "block" : "none";
        if (!visible) filtro.value = "todas";
        if (typeof renderHistorial === "function") renderHistorial(true);
      });

      filtro.addEventListener("change", () => {
        if (typeof renderHistorial === "function") renderHistorial(true);
      });
    }

    const originalRenderHistorial = renderHistorial;
    renderHistorial = function (completo = false) {
      originalRenderHistorial(completo);
      const filtroSub = document.getElementById("filtroSubcategoriaAlimentacion")?.value || "todas";
      if (filtroSub === "todas") return;

      const box = document.getElementById("historialMovimientos");
      if (!box) return;
      const movimientosFiltrados = movimientos.filter(m =>
        m.subcategoria === filtroSub && m.tipo === "gasto"
      );

      const textoActual = box.innerHTML;
      if (!movimientosFiltrados.length) {
        box.innerHTML = `<div class="historial-vacio"><span>📋</span>No hay movimientos con esta subcategoría.</div>`;
      }
    };

    const formGasto = document.getElementById("formGasto");
    if (formGasto) {
      formGasto.addEventListener("reset", () => {
        setTimeout(() => {
          const s = document.getElementById("subcategoriaAlimentacion");
          if (s) s.value = "";
          const c = document.getElementById("subcategoriaAlimentacionContenedor");
          if (c) c.style.display = "none";
        }, 0);
      });
    }
  }

  window.addEventListener("load", () => {
    try {
      iniciarSubcategoriasAlimentacion();
      if (typeof render === "function") render();
    } catch (error) {
      console.error("Error inicializando subcategorías de alimentación:", error);
    }
  });
})();
