// Claves para almacenamiento local
const STORAGE_USERS = 'kf_usuarios_db';
const STORAGE_SESSION = 'kf_sesion_activa';
const STORAGE_MOVIMIENTOS = 'kf_movimientos_db';

// Estado de la app
let usuarioActual = JSON.parse(localStorage.getItem(STORAGE_SESSION)) || null;
let movimientos = [];

if (usuarioActual) {
  const todosMovimientos = JSON.parse(localStorage.getItem(STORAGE_MOVIMIENTOS)) || {};
  movimientos = todosMovimientos[usuarioActual] || [];
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  render();
});

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
    <div class="space-y-4">
      <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
        <span class="font-semibold text-gray-700">Hola, ${usuarioActual}</span>
        <button onclick="cerrarSesion()" class="text-xs text-red-500 underline font-bold">Cerrar Sesión</button>
      </div>

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

      <form onsubmit="agregarMovimiento(event)" class="bg-white p-4 rounded-xl shadow-sm space-y-3">
        <h3 class="font-bold text-gray-700">Nuevo Registro</h3>
        <input type="text" id="concepto" placeholder="Concepto (ej. Comida, Sueldo)" required class="w-full p-2 border rounded-lg text-sm">
        <input type="number" step="0.01" id="monto" placeholder="Monto ($)" required class="w-full p-2 border rounded-lg text-sm">
        <select id="tipo" class="w-full p-2 border rounded-lg text-sm bg-white">
          <option value="gasto">Gasto</option>
          <option value="ingreso">Ingreso</option>
        </select>
        <button type="submit" class="w-full bg-green-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-green-700">
          Guardar Movimiento
        </button>
      </form>

      <div class="bg-white p-4 rounded-xl shadow-sm space-y-2">
        <h3 class="font-bold text-gray-700 mb-2">Historial</h3>
        ${movimientos.length === 0 ? '<p class="text-xs text-gray-400 text-center py-2">No hay registros aún.</p>' : ''}
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
              <button onclick="eliminarMovimiento(${index})" class="text-xs text-red-500 font-bold px-1">✕</button>
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