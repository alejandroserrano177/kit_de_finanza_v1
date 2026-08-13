document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const money = n => "$" + Number(n || 0).toFixed(2);
  const USERS_KEY = "kf_usuarios_v2", SESSION_KEY = "kf_sesion_v2";
  
  const DEFAULT_CATEGORIAS = {
    alimentacion: ["🍽️", "Alimentación", 150],
    vivienda: ["🏠", "Vivienda", 150],
    transporte: ["🚌", "Transporte", 100],
    comunicaciones: ["📱", "Comunicaciones", 50],
    familia: ["❤️", "Familia", 100],
    educacion: ["🎓", "Educación", 75],
    inversion: ["📈", "Inversión", 100],
    otros: ["📦", "Otros", 75]
  };

  let usuario = null, movimientos = [], gastosFijos = [], categorias = {}, distribucion = [];

  // --- MÓDULO DE AUTENTICACIÓN Y CIFRADO ---
  async function hashPassword(password) { 
    const data = new TextEncoder().encode(password); 
    const hash = await crypto.subtle.digest("SHA-256", data); 
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join(""); 
  }

  function usuarios() { 
    try { 
      return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); 
    } catch { 
      return []; 
    } 
  }

  function guardarUsuarios(lista) { 
    localStorage.setItem(USERS_KEY, JSON.stringify(lista)); 
  }

  function userKey(s) { 
    return `kf_${usuario ? usuario.id : "guest"}_${s}`; 
  }

  function hoyISO() { 
    const d = new Date(); 
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); 
    return d.toISOString().slice(0, 10); 
  }

  function fechaTexto(v) { 
    if (!v) return ""; 
    const d = new Date(v.includes("T") ? v : v + "T12:00:00"); 
    return d.toLocaleDateString("es-EC"); 
  }

  function escapeHtml(s) { 
    return String(s ?? "").replace(/[&<>"']/g, c => ({ 
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" 
    }[c])); 
  }

  function cerrarTodasLasVentanas() {
    const paneles = ["formularioIngreso", "formularioGasto", "formularioEdicion", "formGastoFijo", "modalDistribucion", "formRecuperar"];
    paneles.forEach(id => { 
      const el = $(id); 
      if (el) el.style.display = "none"; 
    });
  }

  function mensaje(id, texto, error = false) { 
    const el = $(id); 
    if (el) { 
      el.textContent = texto; 
      el.className = "auth-mensaje" + (error ? " error" : ""); 
    } 
  }

  // --- CARGA Y GUARDA DE DATOS ---
  function cargarDatos() {
    if (!usuario) return;
    try {
      movimientos = JSON.parse(localStorage.getItem(userKey("movimientos")) || "[]");
      gastosFijos = JSON.parse(localStorage.getItem(userKey("fijos")) || "[]");
      distribucion = JSON.parse(localStorage.getItem(userKey("distribucion")) || "null") || 
        Object.entries(DEFAULT_CATEGORIAS).map(([id, v]) => ({ id, nombre: v[1], icono: v[0], limite: v[2], activo: true }));
      
      categorias = {}; 
      distribucion.filter(x => x.activo !== false).forEach(x => categorias[x.id] = [x.icono || "📦", x.nombre, Number(x.limite) || 0]);
    } catch { 
      movimientos = []; 
      gastosFijos = []; 
      distribucion = []; 
      categorias = {}; 
    }
    migrarEstructuras();
  }

  function migrarEstructuras() {
    gastosFijos = gastosFijos.map(g => ({ ...g, activo: g.activo !== false, creado: g.creado || new Date().toISOString() }));
    movimientos = movimientos.map(m => ({ ...m, fecha: m.fecha || new Date().toISOString(), id: m.id || crypto.randomUUID() }));
  }

  function guardarDatos() { 
    if (!usuario) return; 
    localStorage.setItem(userKey("movimientos"), JSON.stringify(movimientos)); 
    localStorage.setItem(userKey("fijos"), JSON.stringify(gastosFijos)); 
    localStorage.setItem(userKey("distribucion"), JSON.stringify(distribucion)); 
  }

  function mostrarApp() { 
    cargarDatos(); 
    cerrarTodasLasVentanas();
    if ($("pantallaAuth")) $("pantallaAuth").style.display = "none"; 
    if ($("app")) $("app").style.display = "block"; 
    if ($("usuarioActual")) $("usuarioActual").textContent = `Cuenta: ${usuario.nombre} · ${usuario.correo}`; 
    render(); 
  }

  function cerrarSesion() { 
    if (usuario) guardarDatos(); 
    localStorage.removeItem(SESSION_KEY); 
    usuario = null; 
    movimientos = [];
    gastosFijos = [];
    distribucion = [];
    cerrarTodasLasVentanas(); 
    if ($("app")) $("app").style.display = "none"; 
    if ($("pantallaAuth")) $("pantallaAuth").style.display = "flex"; 
    if ($('formLogin')) $('formLogin').reset(); 
    if ($('formRegistro')) $('formRegistro').reset(); 
    mensaje("loginMensaje", "");
    mensaje("registroMensaje", "");
  }

  // --- EVENTOS DE AUTENTICACIÓN ---
  if ($("btnCerrarSesion")) $("btnCerrarSesion").onclick = cerrarSesion;
  
  if ($("tabLogin") && $("tabRegistro")) {
    $("tabLogin").onclick = () => { 
      cerrarTodasLasVentanas(); 
      $("tabLogin").classList.add("activo"); 
      $("tabRegistro").classList.remove("activo"); 
      if ($("formLogin")) $("formLogin").style.display = "block"; 
      if ($("formRegistro")) $("formRegistro").style.display = "none"; 
    };
    $("tabRegistro").onclick = () => { 
      cerrarTodasLasVentanas(); 
      $("tabRegistro").classList.add("activo"); 
      $("tabLogin").classList.remove("activo"); 
      if ($("formRegistro")) $("formRegistro").style.display = "block"; 
      if ($("formLogin")) $("formLogin").style.display = "none"; 
    };
  }

  if ($("btnOlvidoPass")) {
    $("btnOlvidoPass").onclick = () => { 
      cerrarTodasLasVentanas(); 
      if ($("formLogin")) $("formLogin").style.display = "none"; 
      if ($("formRegistro")) $("formRegistro").style.display = "none"; 
      if ($("formRecuperar")) $("formRecuperar").style.display = "block"; 
      mensaje("loginMensaje", ""); 
    };
  }

  if ($("btnCancelarRecuperacion")) {
    $("btnCancelarRecuperacion").onclick = () => { 
      cerrarTodasLasVentanas(); 
      if ($("formLogin")) $("formLogin").style.display = "block"; 
    };
  }

  if ($("formRegistro")) {
    $("formRegistro").onsubmit = async e => {
      e.preventDefault();
      const nombre = $("registroNombre").value.trim();
      const correo = $("registroCorreo").value.trim().toLowerCase();
      const p1 = $("registroPassword").value;
      const p2 = $("registroPassword2").value;
      const claveRecuperacion = $("registroClaveRecuperacion") ? $("registroClaveRecuperacion").value.trim() : "clave123";

      if (p1 !== p2) return mensaje("registroMensaje", "Las contraseñas no coinciden.", true);
      if (p1.length < 6) return mensaje("registroMensaje", "La contraseña debe tener al menos 6 caracteres.", true);
      
      const lista = usuarios();
      if (lista.some(u => u.correo === correo)) return mensaje("registroMensaje", "Ese correo ya está registrado.", true);
      
      const nuevo = { 
        id: crypto.randomUUID(), 
        nombre, 
        correo, 
        passwordHash: await hashPassword(p1), 
        claveRecuperacionHash: await hashPassword(claveRecuperacion), 
        creado: new Date().toISOString() 
      };
      
      lista.push(nuevo); 
      guardarUsuarios(lista); 
      usuario = nuevo; 
      localStorage.setItem(SESSION_KEY, nuevo.id); 
      mostrarApp();
    };
  }

  if ($("formLogin")) {
    $("formLogin").onsubmit = async e => {
      e.preventDefault();
      const correo = $("loginCorreo").value.trim().toLowerCase();
      const pass = $("loginPassword").value;
      const passHash = await hashPassword(pass);
      const lista = usuarios();
      
      const u = lista.find(x => x.correo === correo && x.passwordHash === passHash);
      if (!u) return mensaje("loginMensaje", "Correo o contraseña incorrectos.", true);
      
      usuario = u; 
      localStorage.setItem(SESSION_KEY, u.id); 
      mostrarApp();
    };
  }

  // --- RENDERIZADO Y CÁLCULOS ---
  function obtenerTotales() {
    const ing = movimientos.filter(m => m.tipo === "ingreso").reduce((s, m) => s + Number(m.monto), 0);
    const gas = movimientos.filter(m => m.tipo === "gasto").reduce((s, m) => s + Number(m.monto), 0);
    const aportes = movimientos.filter(m => m.tipo === "ahorro").reduce((s, m) => s + Number(m.monto), 0);
    const retiros = movimientos.filter(m => m.tipo === "retiro_ahorro").reduce((s, m) => s + Number(m.monto), 0);
    return { ing, gas, ahorro: aportes - retiros, disponible: ing - gas };
  }

  function renderResumen() { 
    const { ing, gas, ahorro, disponible } = obtenerTotales(); 
    if ($("totalIngresos")) $("totalIngresos").textContent = money(ing); 
    if ($("totalGastos")) $("totalGastos").textContent = money(gas); 
    if ($("totalBalance")) { 
      $("totalBalance").textContent = money(disponible); 
      $("totalBalance").style.color = disponible < 0 ? "var(--rojo-alerta)" : "var(--azul-primary)"; 
    }
    if ($("totalAhorro")) $("totalAhorro").textContent = money(ahorro); 
    if ($("balanceIngresos")) $("balanceIngresos").textContent = money(ing); 
    if ($("balanceGastos")) $("balanceGastos").textContent = money(gas); 
    if ($("balanceAhorro")) $("balanceAhorro").textContent = money(ahorro); 
    if ($("balanceDisponible")) { 
      $("balanceDisponible").textContent = money(disponible); 
      $("balanceDisponible").style.color = disponible < 0 ? "var(--rojo-alerta)" : "var(--azul-primary)"; 
    }
  }

  function renderCategorias() { 
    const grid = $("gridCategorias"); 
    if (!grid) return; 
    grid.innerHTML = ""; 
    distribucion.filter(x => x.activo !== false).forEach(c => { 
      const gastos = movimientos.filter(m => m.tipo === "gasto" && m.categoria === c.id).reduce((s, m) => s + Number(m.monto), 0);
      const lim = Number(c.limite) || 0;
      const pct = lim ? Math.min(gastos / lim * 100, 100) : 0; 
      const ms = movimientos.filter(m => m.tipo === "gasto" && m.categoria === c.id).slice(-3).reverse(); 
      const div = document.createElement("article"); 
      div.className = "categoria-card"; 
      div.innerHTML = `<div class="categoria-icono">${escapeHtml(c.icono || "📦")}</div>
                       <div class="categoria-info"><h3>${escapeHtml(c.nombre)}</h3><p>${money(gastos)} / ${money(lim)}</p></div>
                       <div class="barra"><div class="progreso" style="width:${pct}%"></div></div>
                       <small>${Math.round(pct)}% utilizado</small>
                       <div class="movimientos">${ms.map(m => `<div class="movimiento"><span>${escapeHtml(m.descripcion || c.nombre)}</span><span>${money(m.monto)}</span></div>`).join("")}</div>`; 
      grid.appendChild(div);
    });
  }

  function getFixedProgress(g, refDate = new Date()) {
    const y = refDate.getFullYear(), m = refDate.getMonth(); 
    const pagos = movimientos.filter(x => x.tipo === "gasto" && x.origenFijo === g.id).filter(x => { 
      const d = new Date(x.fecha); 
      return d.getFullYear() === y && d.getMonth() === m; 
    }); 
    const pagado = pagos.reduce((s, x) => s + Number(x.monto), 0);
    const objetivo = Number(g.monto) || 0;
    const pendiente = Math.max(objetivo - pagado, 0);
    const pct = objetivo ? Math.min(pagado / objetivo * 100, 100) : 0; 
    const venc = new Date(y, m, Math.min(Number(g.dia) || 1, new Date(y, m + 1, 0).getDate()), 23, 59, 59); 
    const completa = pagado >= objetivo && objetivo > 0; 
    let estado = completa ? "pagado" : (new Date() > venc ? "vencido" : "pendiente"); 
    if (pagado > 0 && !completa && new Date() > venc) estado = "parcial-atrasado"; 
    return { pagos, pagado, objetivo, pendiente, pct, venc, estado };
  }

  function renderGastosFijos() { 
    const box = $("listaGastosFijos"); 
    if (!box) return;
    const activos = gastosFijos.filter(g => g.activo !== false); 
    if (!activos.length) { 
      box.innerHTML = `<div class="historial-vacio"><span>📌</span>No hay gastos fijos registrados.</div>`; 
      return; 
    } 
    box.innerHTML = activos.map(g => { 
      const p = getFixedProgress(g);
      const cl = p.estado === "pagado" ? "pagado" : (p.estado.includes("atrasado") || p.estado === "vencido" ? "atrasado" : ""); 
      const pagosInfo = p.pagos.length ? p.pagos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 3).map(x => `<div class="fijo-pago">${fechaTexto(x.fecha)} · ${money(x.monto)}</div>`).join("") : "<div class=\"fijo-pago\">Sin pagos este mes</div>"; 
      return `<div class="fijo-item ${cl}"><div class="fijo-info"><strong>${escapeHtml(g.nombre)}</strong><small>Vence día ${g.dia} · ${money(g.monto)} · ${p.pagado >= p.objetivo ? "Pagado" : "Pendiente"}</small><div class="barra"><div class="progreso" style="width:${p.pct}%"></div></div><small>${money(p.pagado)} / ${money(p.objetivo)} · Pendiente ${money(p.pendiente)}</small><div class="fijo-pagos">${pagosInfo}</div></div><div class="fijo-acciones"><button class="boton-secundario boton-pequeno" onclick="window.abrirPagoFijo('${g.id}')">Registrar pago</button><button class="boton-secundario boton-pequeno" onclick="window.editarFijo('${g.id}')">Editar</button><button class="boton-eliminar" onclick="window.desactivarFijo('${g.id}')">✕</button></div></div>`; 
    }).join(""); 
  }

  function actualizarSelects() {
    const cat = $("categoria"); 
    if (cat) cat.innerHTML = '<option value="">Selecciona una categoría</option>' + distribucion.filter(x => x.activo !== false).map(c => `<option value="${c.id}">${escapeHtml(c.icono || "📦")} ${escapeHtml(c.nombre)}</option>`).join("");
    
    const filtro = $("filtroCategoria"); 
    if (filtro) filtro.innerHTML = '<option value="todas">Todas las categorías</option>' + distribucion.filter(x => x.activo !== false).map(c => `<option value="${c.id}">${escapeHtml(c.icono || "📦")} ${escapeHtml(c.nombre)}</option>`).join("") + `<option value="ahorro">💎 Aporte a ahorro</option><option value="retiro_ahorro">↩️ Retiro de ahorro</option>`;
    
    const fijo = $("gastoFijoSeleccion"); 
    if (fijo) fijo.innerHTML = '<option value="">Selecciona un gasto fijo</option>' + gastosFijos.filter(x => x.activo !== false).map(g => `<option value="${g.id}">${escapeHtml(g.nombre)} — ${money(g.monto)}</option>`).join("");
  }

  function renderHistorial() { 
    const box = $("historialMovimientos"); 
    if (!box) return;
    const cat = $("filtroCategoria") ? $("filtroCategoria").value : "todas";
    const tipo = $("filtroTipo") ? $("filtroTipo").value : "todos";
    const periodo = $("filtroPeriodo") ? $("filtroPeriodo").value : "todos";
    const desde = $("filtroDesde") ? $("filtroDesde").value : "";
    const hasta = $("filtroHasta") ? $("filtroHasta").value : ""; 

    let arr = movimientos.slice(); 
    if (cat !== "todas") arr = arr.filter(m => m.categoria === cat || m.tipo === cat); 
    if (tipo !== "todos") arr = arr.filter(m => m.tipo === tipo); 

    const now = new Date(); 
    if (periodo === "semana") arr = arr.filter(m => { const d = new Date(m.fecha), diff = (now - d) / 86400000; return diff >= 0 && diff < 7; }); 
    if (periodo === "mes") arr = arr.filter(m => { const d = new Date(m.fecha); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }); 
    if (periodo === "dia") arr = arr.filter(m => m.fecha.slice(0, 10) === hoyISO()); 
    if (desde) arr = arr.filter(m => m.fecha.slice(0, 10) >= desde); 
    if (hasta) arr = arr.filter(m => m.fecha.slice(0, 10) <= hasta); 

    const lista = arr.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); 
    box.innerHTML = lista.length ? lista.map(renderMovimiento).join("") : `<div class="historial-vacio"><span>📋</span>No hay movimientos con estos filtros.</div>`; 
    if ($("contadorHistorial")) $("contadorHistorial").textContent = `${lista.length} movimiento${lista.length === 1 ? "" : "s"}`; 
  }

  function renderMovimiento(m) { 
    const esIngreso = m.tipo === "ingreso";
    const esAhorro = m.tipo === "ahorro";
    const esRetiro = m.tipo === "retiro_ahorro";
    const cat = distribucion.find(c => c.id === m.categoria);
    const icon = esIngreso ? "💰" : esAhorro ? "💎" : esRetiro ? "↩️" : cat?.icono || "💸";
    const nombre = esIngreso ? "Ingreso" : esAhorro ? "Aporte a ahorro" : esRetiro ? "Retiro de ahorro" : cat?.nombre || "Gasto"; 
    const signo = esIngreso ? "+" : esRetiro ? "↩" : "-"; 

    return `<div class="movimiento-historial">
              <div class="movimiento-principal">
                <div class="movimiento-icono">${icon}</div>
                <div><strong>${escapeHtml(m.descripcion || nombre)}</strong><small>${escapeHtml(nombre)} · ${fechaTexto(m.fecha)}</small></div>
              </div>
              <div class="movimiento-valor">
                <strong class="${esIngreso ? "ingreso" : esRetiro ? "retiro" : "gasto"}">${signo}${money(m.monto)}</strong><br>
                <button class="boton-secundario boton-pequeno" onclick="window.editarMovimiento('${m.id}')">Editar</button> 
                <button class="boton-eliminar" onclick="window.eliminarMovimiento('${m.id}')">✕</button>
              </div>
            </div>`; 
  }

  function render() { 
    actualizarSelects(); 
    renderResumen(); 
    renderCategorias(); 
    renderHistorial(); 
    renderGastosFijos(); 
    guardarDatos(); 
  }

  function mostrarExclusivo(id) { 
    cerrarTodasLasVentanas(); 
    if ($(id)) { 
      $(id).style.display = "block"; 
      $(id).scrollIntoView({ behavior: "smooth", block: "start" }); 
    } 
  }

  function activarTarjeta(id, accion) { 
    const el = $(id); 
    if (el) { 
      el.onclick = accion; 
      el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); accion(); } }; 
    } 
  }

  activarTarjeta("tarjetaIngresos", () => mostrarExclusivo("formularioIngreso"));
  activarTarjeta("tarjetaGastos", () => { 
    if ($("tipoSalida")) $("tipoSalida").value = "gasto"; 
    if ($('tipoSalida')) $('tipoSalida').dispatchEvent(new Event("change")); 
    mostrarExclusivo("formularioGasto"); 
  });
  activarTarjeta("tarjetaAhorro", () => { 
    if ($("tipoSalida")) $("tipoSalida").value = "ahorro"; 
    if ($('tipoSalida')) $('tipoSalida').dispatchEvent(new Event("change")); 
    mostrarExclusivo("formularioGasto"); 
  });

  if ($("cerrarFormularioIngreso")) $("cerrarFormularioIngreso").onclick = cerrarTodasLasVentanas;
  if ($("cerrarFormularioGasto")) $("cerrarFormularioGasto").onclick = cerrarTodasLasVentanas;
  if ($("cancelarEdicion")) $("cancelarEdicion").onclick = cerrarTodasLasVentanas;

  if ($("tipoSalida")) {
    $("tipoSalida").onchange = () => { 
      const v = $("tipoSalida").value, normal = v === "gasto", ahorro = v === "ahorro", retiro = v === "retiro_ahorro"; 
      if ($("camposGasto")) $("camposGasto").style.display = normal ? "block" : "none"; 
      if ($("campoTipoGasto")) $("campoTipoGasto").style.display = normal ? "block" : "none"; 
      if ($("campoGastoFijo")) $("campoGastoFijo").style.display = normal ? "block" : "none"; 
      if ($("campoRetiroAhorro")) $("campoRetiroAhorro").style.display = retiro ? "block" : "none"; 
      if ($("descripcion")) $("descripcion").placeholder = ahorro ? "Ej. Fondo de emergencia" : retiro ? "Ej. Proyecto o emergencia" : "¿En qué gastaste?"; 
      if ($("guardarSalida")) $("guardarSalida").textContent = ahorro ? "Guardar aporte a ahorro" : retiro ? "Registrar retiro de ahorro" : "Guardar gasto"; 
    };
  }

  if ($("formIngreso")) {
    $("formIngreso").onsubmit = e => { 
      e.preventDefault(); 
      const tipo = $("tipoIngreso").value, monto = Number($("montoIngreso").value), fecha = $("fechaIngreso").value || hoyISO(); 
      if (!tipo || monto <= 0) return alert("Completa el tipo, monto y fecha."); 
      movimientos.push({ id: crypto.randomUUID(), tipo: "ingreso", categoria: tipo, monto, descripcion: $("descripcionIngreso").value.trim(), fecha }); 
      e.target.reset(); 
      render(); 
      cerrarTodasLasVentanas(); 
    };
  }

  if ($("formGasto")) {
    $("formGasto").onsubmit = e => { 
      e.preventDefault(); 
      const tipo = $("tipoSalida").value, monto = Number($("monto").value), fecha = $("fechaGasto").value || hoyISO(); 
      if (monto <= 0) return alert("Completa el monto."); 
      if (tipo === "gasto" && !$("categoria").value) return alert("Selecciona una categoría."); 
      movimientos.push({ id: crypto.randomUUID(), tipo, categoria: $("categoria").value || "otros", monto, descripcion: $("descripcion").value.trim(), fecha }); 
      e.target.reset(); 
      render(); 
      cerrarTodasLasVentanas(); 
    };
  }

  window.eliminarMovimiento = id => { 
    if (confirm("¿Eliminar este movimiento?")) { 
      movimientos = movimientos.filter(m => m.id !== id); 
      render(); 
    } 
  };

  if ($("mostrarDistribucion")) $("mostrarDistribucion").onclick = () => { 
    renderEditorDistribucion(); 
    mostrarExclusivo("modalDistribucion"); 
    if ($("modalDistribucion")) $("modalDistribucion").style.display = "flex"; 
  }; 
  if ($("cerrarDistribucion")) $("cerrarDistribucion").onclick = cerrarTodasLasVentanas;

  function renderEditorDistribucion() { 
    const box = $("listaDistribucionEditar"); 
    if (!box) return; 
    box.innerHTML = distribucion.filter(c => c.activo !== false).map(c => `<div class="distribucion-edit-row"><span>${escapeHtml(c.icono)} ${escapeHtml(c.nombre)}</span><input type="number" min="0" step="0.01" value="${Number(c.limite) || 0}" data-id="${c.id}" title="Monto de control"></div>`).join(""); 
  }

  if ($("filtroCategoria")) $("filtroCategoria").onchange = renderHistorial; 
  if ($("filtroTipo")) $("filtroTipo").onchange = renderHistorial; 
  if ($("filtroPeriodo")) $("filtroPeriodo").onchange = renderHistorial; 

  // --- COMPROBACIÓN DE SESIÓN AL CARGAR ---
  const sessionId = localStorage.getItem(SESSION_KEY);
  const u = usuarios().find(x => x.id === sessionId);
  
  if (u) { 
    usuario = u; 
    mostrarApp(); 
  } else { 
    cerrarTodasLasVentanas(); 
    if ($("pantallaAuth")) $("pantallaAuth").style.display = "flex"; 
    if ($("app")) $("app").style.display = "none"; 
  }
});