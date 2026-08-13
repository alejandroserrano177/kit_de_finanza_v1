// Claves de almacenamiento
const STORAGE_USERS = 'kf_usuarios_db';
const STORAGE_SESSION = 'kf_sesion_activa';
const STORAGE_MOVIMIENTOS = 'kf_movimientos_db';

// Estado de la app
let usuarioActual = JSON.parse(localStorage.getItem(STORAGE_SESSION)) || null;
let movimientos = [];
let modalAbierto = null; // Control de ventanas emergentes

if (usuarioActual) {
  cargarMovimientos();
}

document.addEventListener('DOMContentLoaded', render);

function cargarMovimientos() {
  const todos = JSON.parse(localStorage.getItem(STORAGE_MOVIMIENTOS)) || {};
  movimientos = todos[usuarioActual] || [];
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (!usuarioActual) {
    app.innerHTML = renderAuth();
  } else {
    app.innerHTML = renderDashboard();
  }
}

// --- VISTA AUTENTICACIÓN ---
function renderAuth() {
  return `
    <div class="bg-white p-6 rounded-xl shadow-md mt-10">
      <h2 class="text-2xl font-bold text-center mb-6 text-gray-800">Kit de Finanzas</h2>
      <form onsubmit="handleLogin(event)" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700">Usuario</label>
          <input type="text" id="user_input" required class="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">Contraseña</label>
          <input type="password" id="pass_input" required class="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
        </div>
        <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition">
          Ingresar / Registrarse
        </button>
      </form>
    </div>
  `;
}

function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById('user_input').value.trim();
  const p = document.getElementById('pass_input').value.trim();
  if (!u || !p) return;

  let usuarios = JSON.parse(localStorage.getItem(STORAGE_USERS)) || {};

  if (usuarios[u]) {
    if (usuarios[u] === p) {
      iniciarSesion(u);
    } else {
      alert('Contraseña incorrecta');
    }
  } else {
    usuarios[u] = p;
    localStorage.setItem(STORAGE_USERS, JSON.stringify(usuarios));
    iniciarSesion(u);
  }
}

function iniciarSesion(u) {
  usuarioActual = u;
  localStorage.setItem(STORAGE_SESSION, JSON.stringify(usuarioActual));
  cargarMovimientos();
  modalAbierto = null;
  render();
}

function cerrarSesion() {
  usuarioActual = null;
  movimientos = [];
  modalAbierto = null;
  localStorage.removeItem(STORAGE_SESSION);
  render();
}

// --- VISTA DASHBOARD ---
function renderDashboard() {
  const ingresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
  const gastos = movimientos.filter(m => m.tipo === 'gasto').reduce((a, m) => a + m.monto, 0);
  const balance = ingresos - gastos;

  return `
    <div class="space-y-4">
      <!-- Encabezado con Cierre de Sesion directo -->
      <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
        <span class="font-semibold text-gray-700">Hola, <strong>${usuarioActual}</strong></span>
        <button onclick="cerrarSesion()" class="bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition">
          Cerrar Sesión
        </button>
      </div>

      <!-- Card Balance -->
      <div class="bg-blue-600 text-white p-6 rounded-xl shadow-md text-center">
        <span class="text-sm opacity-80">Balance Total</span>
        <h1 class="text-3xl font-bold mt-1">$${balance.toFixed(2)}</h1>
        <div class="flex justify-around mt-4 pt-4 border-t border-blue-500">
          <div>
            <span class="text-xs block opacity-80">Ingresos</span>
            <span class="font-semibold text-green-300">+$${ingresos.toFixed(2)}</span>
          </div>
          <div>
            <span class="text-xs block opacity-80">Gastos</span>
            <span class="font-semibold text-red-300">-$${gastos.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <!-- Boton para abrir modal de registro -->
      <button onclick="abrirModal('registro')" class="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-sm hover:bg-green-700 transition">
        + Nuevo Registro
      </button>

      <!-- Historial -->
      <div class="bg-white p-4 rounded-xl shadow-sm space-y-2">
        <h3 class="font-bold text-gray-700 mb-2">Historial</h3>
        ${movimientos.length === 0 ? '<p class="text-xs text-gray-400 text-center py-4">No hay registros aún.</p>' : ''}
        ${movimientos.map((m, index) => `
          <div class="flex justify-between items-center py-2 border-b last:border-0 text-sm">
            <div>
              <p class="font-medium text-gray-800">${m.concepto}</p>
              <span class="text-xs text-gray-400">${m.fecha}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-bold ${m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}">
                ${m.tipo === 'ingreso' ? '+' : '-'}$${m.monto.toFixed(2)}
              </span>
              <button onclick="eliminarMovimiento(${index})" class="text-gray-400 hover:text-red-500 font-bold px-1">✕</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- RENDERIZADO DE MODAL -->
    ${modalAbierto === 'registro' ? renderModalRegistro() : ''}
  `;
}

// --- LOGICA DE VENTANAS EMERGENTES (MODALES) ---
function abrirModal(tipo) {
  modalAbierto = tipo;
  render();
}

function cerrarModal() {
  modalAbierto = null;
  render();
}

function renderModalRegistro() {
  return `
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div class="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
        <!-- Boton X para cerrar modal -->
        <button onclick="cerrarModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          ✕
        </button>

        <h3 class="text-lg font-bold text-gray-800 mb-4">Agregar Movimiento</h3>

        <form onsubmit="agregarMovimiento(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Concepto</label>
            <input type="text" id="concepto" placeholder="Ej. Sueldo, Comida" required class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Monto ($)</label>
            <input type="number" step="0.01" id="monto" placeholder="0.00" required class="w-full p-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Tipo</label>
            <select id="tipo" class="w-full p-2.5 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </div>

          <div class="flex gap-2 pt-2">
            <button type="button" onclick="cerrarModal()" class="w-1/2 bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-300">
              Cancelar
            </button>
            <button type="submit" class="w-1/2 bg-green-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-green-700">
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// --- LOGICA DE DATOS ---
function agregarMovimiento(e) {
  e.preventDefault();
  const concepto = document.getElementById('concepto').value.trim();
  const monto = parseFloat(document.getElementById('monto').value);
  const tipo = document.getElementById('tipo').value;

  if (!concepto || isNaN(monto) || monto <= 0) return;

  movimientos.unshift({
    concepto,
    monto,
    tipo,
    fecha: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  });

  guardarEnStorage();
  cerrarModal();
}

function eliminarMovimiento(index) {
  movimientos.splice(index, 1);
  guardarEnStorage();
  render();
}

function guardarEnStorage() {
  const todos = JSON.parse(localStorage.getItem(STORAGE_MOVIMIENTOS)) || {};
  todos[usuarioActual] = movimientos;
  localStorage.setItem(STORAGE_MOVIMIENTOS, JSON.stringify(todos));
}