(() => {
  "use strict";

  function iniciarSubcategoriasAlimentacion() {
    if (typeof movimientoASupabase !== "function") return;

    const esAlimentacion = categoriaId => {
      if (!categoriaId || !Array.isArray(distribucion)) return false;
      const c = distribucion.find(x => x.id === categoriaId);
      const nombre = String(c?.nombre || "").trim().toLowerCase();
      return nombre === "alimentación" || nombre === "alimentacion";
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

    const originalEditarMovimiento = window.editarMovimiento;
    if (typeof originalEditarMovimiento === "function") {
      window.editarMovimiento = id => {
        originalEditarMovimiento(id);
        setTimeout(() => {
          const m = movimientos.find(x => x.id === id);
          const select = document.getElementById("editarSubcategoriaAlimentacion");
          const contenedor = document.getElementById("editarSubcategoriaAlimentacionContenedor");
          if (!m || !select || !contenedor) return;
          select.value = m.subcategoria || "";
          contenedor.style.display = esAlimentacion(m.categoria) ? "block" : "none";
        }, 0);
      };
    }

    const formGasto = document.getElementById("formGasto");
    if (formGasto) {
      formGasto.addEventListener("reset", () => {
        setTimeout(() => {
          const s = document.getElementById("subcategoriaAlimentacion");
          const c = document.getElementById("subcategoriaAlimentacionContenedor");
          if (s) s.value = "";
          if (c) c.style.display = "none";
        }, 0);
      });
    }

    const formEdicion = document.getElementById("formEdicion");
    if (formEdicion) {
      formEdicion.addEventListener("reset", () => {
        setTimeout(() => {
          const s = document.getElementById("editarSubcategoriaAlimentacion");
          const c = document.getElementById("editarSubcategoriaAlimentacionContenedor");
          if (s) s.value = "";
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
