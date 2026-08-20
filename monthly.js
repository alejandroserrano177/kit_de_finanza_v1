(() => {
  "use strict";

  const SESSION_KEY = "kf_sesion_v2";
  const PREFIX = "kf_";
  const SELECTOR_ID = "selectorPeriodoFinanzas";
  const STYLE_ID = "estilosPeriodoFinanzas";

  let periodo = localStorage.getItem("kf_periodo_dashboard") || "";
  let ultimoSnapshot = "";
  let actualizando = false;

  const json = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  function session() {
    return json(SESSION_KEY, null);
  }

  function userPrefix() {
    const s = session();
    return s?.id ? `${PREFIX}${s.id}_` : null;
  }

  function hoyPeriodo() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function periodoActual() {
    const p = periodo || hoyPeriodo();
    if (!/^\d{4}-\d{2}$/.test(p)) return hoyPeriodo();
    return p;
  }

  function movimientoFecha(m) {
    const v = String(m?.fecha || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  }

  function esPeriodo(m, p) {
    return movimientoFecha(m).slice(0, 7) === p;
  }

  function movimientosUsuario() {
    const prefix = userPrefix();
    if (!prefix) return [];
    const lista = json(`${prefix}movimientos`, []);
    return Array.isArray(lista) ? lista : [];
  }

  function datosPeriodo() {
    const p = periodoActual();
    const movimientos = movimientosUsuario().filter(m => esPeriodo(m, p));

    let ingresos = 0;
    let gastos = 0;
    let ahorro = 0;

    for (const m of movimientos) {
      const monto = Number(m?.monto || 0);
      if (m?.tipo === "ingreso") ingresos += monto;
      else if (m?.tipo === "gasto") gastos += monto;
      else if (m?.tipo === "ahorro") ahorro += monto;
      else if (m?.tipo === "retiro_ahorro") ahorro -= monto;
    }

    return {
      periodo: p,
      ingresos,
      gastos,
      balance: ingresos - gastos,
      ahorro,
      disponible: ingresos - gastos - ahorro,
      cantidad: movimientos.length
    };
  }

  function formatoPeriodo(p) {
    const [y, m] = p.split("-").map(Number);
    const fecha = new Date(y, m - 1, 1);
    return fecha.toLocaleDateString("es-EC", { month: "long", year: "numeric" });
  }

  function dinero(n) {
    return "$" + Number(n || 0).toFixed(2);
  }

  function inyectarEstilos() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .periodo-dashboard {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        margin:0 0 16px;
        padding:12px 16px;
        border:1px solid rgba(100,116,139,.18);
        border-radius:14px;
        background:rgba(248,250,252,.92);
      }
      .periodo-dashboard__texto { display:flex; flex-direction:column; gap:3px; }
      .periodo-dashboard__texto strong { font-size:15px; }
      .periodo-dashboard__texto small { color:#64748b; }
      .periodo-dashboard select {
        min-width:180px;
        padding:9px 12px;
        border:1px solid #cbd5e1;
        border-radius:10px;
        background:#fff;
        font:inherit;
      }
      @media (max-width:600px) {
        .periodo-dashboard { align-items:stretch; flex-direction:column; }
        .periodo-dashboard select { width:100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function obtenerPeriodos() {
    const lista = movimientosUsuario()
      .map(m => movimientoFecha(m).slice(0, 7))
      .filter(Boolean);
    const actual = hoyPeriodo();
    lista.push(actual);

    const unicos = [...new Set(lista)].sort().reverse();
    const primero = unicos.length ? unicos[unicos.length - 1] : actual;
    const ultimo = unicos.length ? unicos[0] : actual;

    // Mantiene disponible el mes actual y todos los meses con movimientos.
    const [y1, m1] = primero.split("-").map(Number);
    const [y2, m2] = ultimo.split("-").map(Number);
    const resultado = [];
    let cursor = new Date(y1, m1 - 1, 1);
    const fin = new Date(y2, m2 - 1, 1);
    while (cursor <= fin) {
      resultado.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return resultado.reverse();
  }

  function crearSelector() {
    if (!document.querySelector("#app") || document.getElementById(SELECTOR_ID)) return;
    const resumen = document.querySelector(".resumen");
    if (!resumen) return;

    const wrapper = document.createElement("div");
    wrapper.id = SELECTOR_ID;
    wrapper.className = "periodo-dashboard";
    wrapper.innerHTML = `
      <div class="periodo-dashboard__texto">
        <strong>Período del resumen</strong>
        <small>Los movimientos se conservan; aquí solo cambia el período que estás consultando.</small>
      </div>
      <select aria-label="Seleccionar mes del resumen"></select>
    `;
    resumen.parentNode.insertBefore(wrapper, resumen);

    const select = wrapper.querySelector("select");
    select.addEventListener("change", () => {
      periodo = select.value;
      localStorage.setItem("kf_periodo_dashboard", periodo);
      ultimoSnapshot = "";
      aplicar();
    });
  }

  function actualizarOpciones() {
    const select = document.querySelector(`#${SELECTOR_ID} select`);
    if (!select) return;
    const periodos = obtenerPeriodos();
    const seleccionado = periodoActual();
    select.innerHTML = periodos.map(p =>
      `<option value="${p}">${formatoPeriodo(p).replace(/^./, c => c.toUpperCase())}</option>`
    ).join("");
    if (!periodos.includes(seleccionado)) {
      periodo = periodos[0] || hoyPeriodo();
    }
    select.value = periodoActual();
  }

  function establecer(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = dinero(valor);
  }

  function aplicar() {
    if (actualizando) return;
    const s = session();
    if (!s?.id || !document.querySelector("#app")) return;
    const resumen = document.querySelector(".resumen");
    if (!resumen || getComputedStyle(document.querySelector("#app")).display === "none") return;

    crearSelector();
    actualizarOpciones();

    const d = datosPeriodo();
    const snapshot = JSON.stringify(d);
    if (snapshot === ultimoSnapshot) return;
    ultimoSnapshot = snapshot;

    actualizando = true;
    try {
      establecer("totalIngresos", d.ingresos);
      establecer("totalGastos", d.gastos);
      establecer("totalBalance", d.balance);
      establecer("totalAhorro", d.ahorro);
      establecer("totalDisponible", d.disponible);

      const tarjetaIngresos = document.getElementById("tarjetaIngresos");
      const tarjetaGastos = document.getElementById("tarjetaGastos");
      if (tarjetaIngresos) tarjetaIngresos.title = `Ingresos de ${formatoPeriodo(d.periodo)}`;
      if (tarjetaGastos) tarjetaGastos.title = `Gastos de ${formatoPeriodo(d.periodo)}`;
    } finally {
      actualizando = false;
    }
  }

  function iniciar() {
    inyectarEstilos();
    aplicar();

    const observer = new MutationObserver(() => {
      if (!actualizando) aplicar();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    setInterval(aplicar, 1000);
    window.addEventListener("storage", () => {
      ultimoSnapshot = "";
      aplicar();
    });
    window.addEventListener("online", () => {
      ultimoSnapshot = "";
      setTimeout(aplicar, 500);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  } else {
    iniciar();
  }
})();
