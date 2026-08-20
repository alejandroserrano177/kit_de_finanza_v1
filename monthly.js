(() => {
  "use strict";

  const SESSION_KEY = "kf_sesion_v2";
  const PREFIX = "kf_";
  const SELECTOR_ID = "selectorPeriodoFinanzas";
  const STYLE_ID = "estilosPeriodoFinanzas";
  let periodo = localStorage.getItem("kf_periodo_dashboard") || "";
  let ultimoSnapshot = "";

  const json = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  };

  const session = () => json(SESSION_KEY, null);
  const prefix = () => session()?.id ? `${PREFIX}${session().id}_` : null;
  const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const periodoActual = () => /^\d{4}-\d{2}$/.test(periodo || "") ? periodo : hoy();
  const movimientos = () => {
    const p = prefix();
    const data = p ? json(`${p}movimientos`, []) : [];
    return Array.isArray(data) ? data : [];
  };
  const fecha = m => String(m?.fecha || "").slice(0, 7);

  function calcular() {
    const p = periodoActual();
    let ingresos = 0, gastos = 0, ahorro = 0;
    for (const m of movimientos()) {
      if (fecha(m) !== p) continue;
      const n = Number(m?.monto || 0);
      if (m?.tipo === "ingreso") ingresos += n;
      else if (m?.tipo === "gasto") gastos += n;
      else if (m?.tipo === "ahorro") ahorro += n;
      else if (m?.tipo === "retiro_ahorro") ahorro -= n;
    }
    return { periodo: p, ingresos, gastos, balance: ingresos - gastos, ahorro, disponible: ingresos - gastos - ahorro };
  }

  function nombreMes(p) {
    const [y, m] = p.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-EC", { month: "long", year: "numeric" }).replace(/^./, c => c.toUpperCase());
  }

  function periodosDisponibles() {
    const set = new Set(movimientos().map(fecha).filter(Boolean));
    set.add(hoy());
    return [...set].sort().reverse();
  }

  function estilos() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      #${SELECTOR_ID}{display:flex;align-items:center;justify-content:flex-end;margin:0 0 16px;min-height:38px}
      #${SELECTOR_ID}::before{content:"Período";margin-right:10px;color:#475569;font-size:13px;font-weight:600}
      #${SELECTOR_ID} select{appearance:none;min-width:148px;height:38px;padding:0 36px 0 13px;border:1px solid #1e40af;border-radius:9px;background:#1e3a8a;color:#fff;font:inherit;font-size:14px;font-weight:600;box-shadow:0 2px 7px rgba(30,58,138,.16);cursor:pointer;outline:none;background-image:linear-gradient(45deg,transparent 50%,#fff 50%),linear-gradient(135deg,#fff 50%,transparent 50%);background-position:calc(100% - 17px) 16px,calc(100% - 12px) 16px;background-size:5px 5px,5px 5px;background-repeat:no-repeat;transition:background .15s,box-shadow .15s,border-color .15s}
      #${SELECTOR_ID} select:hover{background:#1e40af;border-color:#1e40af;box-shadow:0 3px 9px rgba(30,64,175,.20)}
      #${SELECTOR_ID} select:focus{border-color:#1e40af;box-shadow:0 0 0 3px rgba(30,64,175,.14)}
      #${SELECTOR_ID} select option{background:#fff;color:#1e293b;font-weight:600}
      @media(max-width:600px){#${SELECTOR_ID}{justify-content:space-between;margin-bottom:12px}#${SELECTOR_ID} select{min-width:0;width:155px}}
    `;
    document.head.appendChild(s);
  }

  function selector() {
    if (document.getElementById(SELECTOR_ID)) return document.querySelector(`#${SELECTOR_ID} select`);
    const resumen = document.querySelector(".resumen");
    if (!resumen) return null;
    const wrap = document.createElement("div");
    wrap.id = SELECTOR_ID;
    wrap.innerHTML = `<select aria-label="Período del resumen"></select>`;
    resumen.parentNode.insertBefore(wrap, resumen);
    const select = wrap.firstElementChild;
    select.addEventListener("change", () => {
      periodo = select.value;
      localStorage.setItem("kf_periodo_dashboard", periodo);
      ultimoSnapshot = "";
      aplicar();
    });
    return select;
  }

  function actualizarSelector(select) {
    const opciones = periodosDisponibles();
    const actual = periodoActual();
    const html = opciones.map(p => `<option value="${p}">${nombreMes(p)}</option>`).join("");
    if (select.dataset.opciones !== html) {
      select.innerHTML = html;
      select.dataset.opciones = html;
    }
    if (opciones.includes(actual)) select.value = actual;
    else {
      periodo = opciones[0] || hoy();
      select.value = periodo;
      localStorage.setItem("kf_periodo_dashboard", periodo);
    }
  }

  function dinero(n) { return "$" + Number(n || 0).toFixed(2); }
  function set(id, value) { const el = document.getElementById(id); if (el) el.textContent = dinero(value); }

  function aplicar() {
    const app = document.querySelector("#app");
    const resumen = document.querySelector(".resumen");
    if (!app || !resumen || app.style.display === "none" || !session()?.id) return;
    estilos();
    const select = selector();
    if (!select) return;
    actualizarSelector(select);
    const d = calcular();
    const snapshot = JSON.stringify(d);
    if (snapshot === ultimoSnapshot) return;
    ultimoSnapshot = snapshot;
    set("totalIngresos", d.ingresos);
    set("totalGastos", d.gastos);
    set("totalBalance", d.balance);
    set("totalAhorro", d.ahorro);
    set("totalDisponible", d.disponible);
  }

  function iniciar() {
    estilos();
    aplicar();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) aplicar(); });
    window.addEventListener("storage", () => { ultimoSnapshot = ""; aplicar(); });
    window.addEventListener("online", () => { ultimoSnapshot = ""; setTimeout(aplicar, 300); });
    const observer = new MutationObserver(() => {
      if (document.querySelector("#app")?.style.display !== "none") aplicar();
    });
    observer.observe(document.getElementById("app") || document.body, { attributes: true, attributeFilter: ["style", "class"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  else iniciar();
})();