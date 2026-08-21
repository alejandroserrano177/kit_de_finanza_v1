(() => {
  "use strict";

  function iniciarSubcategoriasHogar() {
    if (typeof movimientoASupabase !== "function") return;

    const esHogar = categoriaId => {
      if (!categoriaId || !Array.isArray(distribucion)) return false;
      const c = distribucion.find(x => x.id === categoriaId);
      const nombre = String(c?.nombre || "").trim().toLowerCase();
      return nombre === "hogar";
    };

    const opciones = `
      <option value="">Selecciona una subcategoría</option>
      <option value="limpieza_hogar">🧹 Limpieza del hogar</option>
      <option value="higiene_personal">🧴 Higiene personal</option>
    `;

    const crearSelect = (id, insertAfter) => {
      let select = document.getElementById(id);
      if (select) return select;
      const wrapper = document.createElement("div");
      wrapper.id = id + "Contenedor";
      wrapper.style.display = "none";
      wrapper.style.marginTop = "4px";
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = "Subcategoría de hogar";
      select = document.createElement("select");
      select.id = id;
      select.innerHTML = opciones;
      wrapper.append(label, select);
      insertAfter.parentNode.insertBefore(wrapper, insertAfter.nextSibling);
      return select;
    };

    const categoria = document.getElementById("categoria");
    if (categoria) {
      const select = crearSelect("subcategoriaHogar", categoria);
      const actualizar = () => {
        const visible = esHogar(categoria.value);
        document.getElementById("subcategoriaHogarContenedor").style.display = visible ? "block" : "none";
        if (!visible) select.value = "";
      };
      categoria.addEventListener("change", actualizar);
      actualizar();
    }

    const editarCategoria = document.getElementById("editarCategoria");
    if (editarCategoria) {
      const select = crearSelect("editarSubcategoriaHogar", editarCategoria);
      const actualizar = () => {
        const visible = esHogar(editarCategoria.value);
        document.getElementById("editarSubcategoriaHogarContenedor").style.display = visible ? "block" : "none";
        if (!visible) select.value = "";
      };
      editarCategoria.addEventListener("change", actualizar);
      actualizar();
    }

    const originalMovimientoASupabase = movimientoASupabase;
    movimientoASupabase = function (m) {
      const row = originalMovimientoASupabase(m);
      row.subcategoria_hogar = esHogar(m.categoria)
        ? (m.subcategoria_hogar || document.getElementById("subcategoriaHogar")?.value || null)
        : null;
      return row;
    };

    const originalMovimientoDesdeSupabase = movimientoDesdeSupabase;
    movimientoDesdeSupabase = function (row) {
      const m = originalMovimientoDesdeSupabase(row);
      m.subcategoria_hogar = row.subcategoria_hogar || "";
      return m;
    };

    const originalGuardar = guardarMovimientoSupabase;
    guardarMovimientoSupabase = async function (m) {
      m.subcategoria_hogar = esHogar(m.categoria) ? (document.getElementById("subcategoriaHogar")?.value || "") : "";
      return originalGuardar(m);
    };

    const originalActualizar = actualizarMovimientoSupabase;
    actualizarMovimientoSupabase = async function (m) {
      m.subcategoria_hogar = esHogar(m.categoria) ? (document.getElementById("editarSubcategoriaHogar")?.value || "") : "";
      return originalActualizar(m);
    };

    const originalRender = renderMovimiento;
    renderMovimiento = function (m) {
      const html = originalRender(m);
      if (!m.subcategoria_hogar || !esHogar(m.categoria)) return html;
      const texto = m.subcategoria_hogar === "limpieza_hogar" ? "🧹 Limpieza del hogar" : "🧴 Higiene personal";
      return html.replace(/(<small>\s*[^<]*<\/small>)/, `$1<small style="display:block;margin-top:3px">${escapeHtml(texto)}</small>`);
    };

    const originalEditar = window.editarMovimiento;
    if (typeof originalEditar === "function") {
      window.editarMovimiento = id => {
        originalEditar(id);
        setTimeout(() => {
          const m = movimientos.find(x => x.id === id);
          const s = document.getElementById("editarSubcategoriaHogar");
          if (m && s) {
            s.value = m.subcategoria_hogar || "";
            document.getElementById("editarSubcategoriaHogarContenedor").style.display = esHogar(m.categoria) ? "block" : "none";
          }
        }, 0);
      };
    }
  }

  window.addEventListener("load", () => {
    try { iniciarSubcategoriasHogar(); } catch (e) { console.error("Error inicializando subcategorías de hogar:", e); }
  });
})();
