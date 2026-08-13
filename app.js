const STORAGE_USERS = 'kf_usuarios_db';
const STORAGE_SESSION = 'kf_sesion_activa';
const STORAGE_MOVIMIENTOS = 'kf_movimientos_db';

let usuarioActual = JSON.parse(localStorage.getItem(STORAGE_SESSION)) || null;
let movimientos = [];

if (usuarioActual) {
  const todosMovimientos = JSON.parse(localStorage.getItem(STORAGE_MOVIMIENTOS)) || {};
  movimientos = todosMovimientos[usuarioActual] || [];
}

window.onload = function() {
  render();
};

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (!usuarioActual) {
    app.innerHTML = renderAuth();
  } else {
    app.innerHTML = renderDashboard();
  }
}

function renderAuth() {
  return `
    <div class="card" style="margin-top: 40px;">
      <h2 class="title">Kit de Finanzas</h2>
      <form onsubmit="handleLogin(event)">
        <div class="input-group">
          <label>Usuario</label>
          <input type="text" id="user_input" required autocomplete="username">
        </div>
        <div class="input-group">
          <label>Contraseña</label>
          <input type="password" id="pass_input" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-blue">Ingresar / Registrarse</button>
      </form>
    </div>
  `;
}

function handleLogin(e) {
  e.preventDefault();
  const userInput = document.getElementById('user_input').value.trim();
  const passInput = document.getElementById('pass_input').value.trim();

  if (!userInput || !passInput) return;

  let usuarios = JSON.parse(localStorage.getItem(STORAGE_USERS)) || {};

  if (usuarios[userInput]) {
    if (usuarios[userInput] === passInput) {
      iniciarSesion(userInput);
    } else {
      alert('Contraseña incorrecta');
    }
  } else {
    usuarios[userInput] = passInput;
    localStorage.setItem(STORAGE_USERS, JSON.stringify(usuarios));
    iniciarSesion(userInput);
  }
}

function iniciarSesion(usuario) {
  usuarioActual = usuario;
  localStorage.setItem(STORAGE_SESSION, JSON.stringify(usuarioActual));
  
  const todosMovimientos = JSON.parse(localStorage.getItem(STORAGE_MOVIMIENTOS)) || {};
  movimientos = todosMovimientos[usuarioActual] || [];
  
  render();
}

function cerrarSesion() {
  usuarioActual = null;
  localStorage.removeItem(STORAGE_SESSION);
  render();
}

function renderDashboard() {
  const ingresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((acc, m) => acc + m.monto, 0);
  const gastos = movimientos.filter(m => m.tipo === 'gasto').reduce((acc, m) => acc + m.monto, 0);
  const balance = ingresos - gastos;

  return `
    <div>
      <div class="card header-user">
        <span>Hola, <strong>${usuarioActual}</strong></span>
        <button onclick="cerrarSesion()" class="btn-logout">Cerrar Sesión</button>
      </div>

      <div class="balance-box">
        <span style="font-size: 0.85rem; opacity: 0.9;">Balance Total</span>
        <div class="balance-amount">$${balance.toFixed(2)}</div>
        <div class="row">
          <div>
            <span style="font-size: 0.75rem; display: block; opacity: 0.9;">Ingresos</span>
            <strong style="color: #4ade80;">+$${ingresos.toFixed(2)}</strong>
          </div>
          <div>
            <span style="font-size: 0.75rem; display: block; opacity: 0.9;">Gastos</span>
            <strong style="color: #f87171;">-$${gastos.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      <form onsubmit="agregarMovimiento(event)" class="card">
        <h3 style="margin-bottom: 12px; font-size: 1rem;">Nuevo Registro</h3>
        <div class="input-group">
          <input type="text" id="concepto" placeholder="Concepto (ej. Comida, Sueldo)" required>
        </div>
        <div class="input-group">
          <input type="number" step="0.01" id="monto" placeholder="Monto ($)" required>
        </div>
        <div class="input-group">
          <select id="tipo">
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>
        </div>
        <button type="submit" class="btn btn-green">Guardar Movimiento</button>
      </form>

      <div class="card">
        <h3 style="margin-bottom: 12px; font-size: 1rem;">Historial</h3>
        ${movimientos.length === 0 ? '<p style="font-size: 0.85rem; color: #9ca3af; text-align: center;">No hay registros aún.</p>' : ''}
        ${movimientos.map((m, index) => `
          <div class="history-item">
            <div>
              <div><strong>${m.concepto}</strong></div>
              <div style="font-size: 0.75rem; color: #9ca3af;">${m.fecha}</div>
            </div>
            <div>
              <span class="${m.tipo}">
                ${m.tipo === 'ingreso' ? '+' : '-'}$${m.monto.toFixed(2)}
              </span>
              <button onclick="eliminarMovimiento(${index})" class="btn-del">✕</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function agregarMovimiento(e) {
  e.preventDefault();
  const concepto = document.getElementById('concepto').value.trim();
  const monto = parseFloat(document.getElementById('monto').value);
  const tipo = document.getElementById('tipo').value;

  if (!concepto || isNaN(monto) || monto <= 0) return;

  const nuevoMovimiento = {
    concepto,
    monto,
    tipo,
    fecha: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  };

  movimientos.unshift(nuevoMovimiento);
  guardarEnStorage();
  render();
}

function eliminarMovimiento(index) {
  movimientos.splice(index, 1);
  guardarEnStorage();
  render();
}

function guardarEnStorage() {
  const todosMovimientos = JSON.parse(localStorage.getItem(STORAGE_MOVIMIENTOS)) || {};
  todosMovimientos[usuarioActual] = movimientos;
  localStorage.setItem(STORAGE_MOVIMIENTOS, JSON.stringify(todosMovimientos));
}