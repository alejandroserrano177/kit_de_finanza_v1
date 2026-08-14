const $ = id => document.getElementById(id);

const money = n =>
  "$" + Number(n || 0).toFixed(2);


/* =========================================================
   SUPABASE AUTH
   ========================================================= */

const SUPABASE_URL =
  "https://qbyrgjkyemdnqortkxcc.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_CyU2fuL97wQwdahYgXil0Q_RN0-IYr2";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


/* =========================================================
   CONFIGURACIÓN LOCAL ACTUAL
   ========================================================= */

const USERS_KEY = "kf_usuarios_v2";
const SESSION_KEY = "kf_sesion_v2";

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

const DEFAULT_GASTOS_FIJOS = [
  {
    id: "fijo_alquiler",
    nombre: "Alquiler",
    monto: 120,
    dia: 1,
    activo: true
  },
  {
    id: "fijo_internet",
    nombre: "Internet",
    monto: 30,
    dia: 5,
    activo: true
  },
  {
    id: "fijo_telefono",
    nombre: "Teléfono",
    monto: 23,
    dia: 10,
    activo: true
  }
];

let usuario = null;
let movimientos = [];
let gastosFijos = [];
let categorias = {};
let distribucion = [];


/* =========================================================
   SEGURIDAD / LOCALSTORAGE
   ========================================================= */

async function hashPassword(password) {

  const data =
    new TextEncoder().encode(password);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return [...new Uint8Array(hash)]
    .map(
      b =>
        b.toString(16).padStart(2, "0")
    )
    .join("");
}


function leerLocal(
  key,
  fallback = null
) {

  try {

    const v =
      localStorage.getItem(key);

    return v === null
      ? fallback
      : JSON.parse(v);

  } catch {

    return fallback;
  }
}


function escribirLocal(
  key,
  value
) {

  try {

    localStorage.setItem(
      key,
      JSON.stringify(value)
    );

    return true;

  } catch (error) {

    console.error(
      "No se pudo guardar:",
      key,
      error
    );

    return false;
  }
}


function usuarios() {

  return leerLocal(
    USERS_KEY,
    []
  ) || [];
}


function guardarUsuarios(
  lista
) {

  return escribirLocal(
    USERS_KEY,
    lista
  );
}


function userKey(nombre) {

  return `kf_${usuario.id}_${nombre}`;
}


function guardarDatos() {

  if (!usuario) return;

  escribirLocal(
    userKey("movimientos"),
    movimientos
  );

  escribirLocal(
    userKey("fijos"),
    gastosFijos
  );

  escribirLocal(
    userKey("distribucion"),
    distribucion
  );
}


function guardarMovimientos() {

  if (!usuario) return;

  escribirLocal(
    userKey("movimientos"),
    movimientos
  );
}


function guardarFijos() {

  if (!usuario) return;

  escribirLocal(
    userKey("fijos"),
    gastosFijos
  );
}


function guardarDistribucion() {

  if (!usuario) return;

  escribirLocal(
    userKey("distribucion"),
    distribucion
  );
}


/* =========================================================
   FECHAS
   ========================================================= */

function hoyISO() {

  const d =
    new Date();

  d.setMinutes(
    d.getMinutes() -
    d.getTimezoneOffset()
  );

  return d
    .toISOString()
    .slice(0, 10);
}


function parseFechaLocal(valor) {

  if (!valor) {
    return new Date();
  }

  const texto =
    String(valor);

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      texto
    )
  ) {

    const [
      y,
      m,
      d
    ] =
      texto
        .split("-")
        .map(Number);

    return new Date(
      y,
      m - 1,
      d,
      12,
      0,
      0
    );
  }

  return new Date(valor);
}


function fechaTexto(v) {

  if (!v) return "";

  return parseFechaLocal(v)
    .toLocaleDateString(
      "es-EC"
    );
}


function fechaISO(valor) {

  return String(valor || "")
    .slice(0, 10);
}


/* =========================================================
   UTILIDADES
   ========================================================= */

function escapeHtml(s) {

  return String(s ?? "").replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
      }[c])
  );
}


function crearCategoriasDefault() {

  return Object.entries(
    DEFAULT_CATEGORIAS
  ).map(
    ([id, v]) => ({
      id,
      nombre: v[1],
      icono: v[0],
      limite: v[2],
      activo: true
    })
  );
}


function crearFijosDefault() {

  return DEFAULT_GASTOS_FIJOS.map(
    g => ({
      ...g,
      creado:
        new Date().toISOString()
    })
  );
}


/* =========================================================
   MIGRACIÓN
   ========================================================= */

function migrarEstructuras() {

  movimientos =
    Array.isArray(movimientos)
      ? movimientos.map(m => ({

          ...m,

          id:
            m.id ||
            crypto.randomUUID(),

          fecha:
            fechaISO(m.fecha) ||
            hoyISO(),

          monto:
            Number(m.monto) || 0

        }))
      : [];


  gastosFijos =
    Array.isArray(gastosFijos)
      ? gastosFijos.map(g => ({

          ...g,

          id:
            g.id ||
            crypto.randomUUID(),

          activo:
            g.activo !== false,

          creado:
            g.creado ||
            new Date().toISOString(),

          monto:
            Number(g.monto) || 0,

          dia:
            Number(g.dia) || 1

        }))
      : [];


  distribucion =
    Array.isArray(distribucion)
      ? distribucion
      : [];


  if (!distribucion.length) {

    distribucion =
      crearCategoriasDefault();
  }


  if (!gastosFijos.length) {

    gastosFijos =
      crearFijosDefault();
  }


  guardarDatos();
}


/* =========================================================
   CARGAR DATOS DEL USUARIO
   ========================================================= */

function cargarDatos() {

  if (!usuario) return;


  movimientos =
    leerLocal(
      userKey("movimientos"),
      []
    ) || [];


  gastosFijos =
    leerLocal(
      userKey("fijos"),
      []
    ) || [];


  distribucion =
    leerLocal(
      userKey("distribucion"),
      null
    );


  if (!Array.isArray(distribucion)) {

    distribucion =
      crearCategoriasDefault();
  }


  categorias = {};


  distribucion
    .filter(
      x =>
        x.activo !== false
    )
    .forEach(x => {

      categorias[x.id] = [
        x.icono || "📦",
        x.nombre,
        Number(x.limite) || 0
      ];

    });


  migrarEstructuras();
}


/* =========================================================
   PANELES
   ========================================================= */

function cerrarPaneles() {

  document
    .querySelectorAll(
      ".formulario-panel"
    )
    .forEach(
      x =>
        x.style.display =
          "none"
    );


  [
    "modalDistribucion",
    "formGastoFijo"
  ].forEach(id => {

    const el =
      $(id);

    if (el) {

      el.style.display =
        "none";
    }
  });


  try {

    $("formGasto").reset();
    $("formIngreso").reset();
    $("formEdicion").reset();
    $("formGastoFijo").reset();

  } catch {}


  try {

    $("fijoId").value = "";

  } catch {}


  try {

    $("tipoSalida").value =
      "gasto";

    $("tipoSalida").dispatchEvent(
      new Event("change")
    );

  } catch {}
}


/* =========================================================
   MOSTRAR APP
   ========================================================= */

function mostrarApp() {

  cargarDatos();

  $("pantallaAuth")
    .style.display =
    "none";

  $("app")
    .style.display =
    "block";


  $("usuarioActual")
    .textContent =
      `Cuenta: ${usuario.nombre} · ${usuario.correo}`;


  cerrarPaneles();

  establecerFechasHoy();

  render();
}


/* =========================================================
   CERRAR SESIÓN
   ========================================================= */

async function cerrarSesion() {

  try {

    await supabaseClient.auth.signOut();

  } catch (error) {

    console.error(
      "Error cerrando sesión Supabase:",
      error
    );
  }


  try {

    localStorage.removeItem(
      SESSION_KEY
    );

  } catch {}


  usuario = null;

  movimientos = [];
  gastosFijos = [];
  categorias = {};
  distribucion = [];


  cerrarPaneles();


  $("app")
    .style.display =
    "none";


  $("pantallaAuth")
    .style.display =
    "flex";


  $("formLogin").reset();

  $("loginMensaje")
    .textContent =
    "";


  $("tabLogin").click();
}


$("botonCerrarSesion")
  .onclick =
  cerrarSesion;


/* =========================================================
   MENSAJES
   ========================================================= */

function mensaje(
  id,
  texto,
  error = false
) {

  const el =
    $(id);

  if (!el) return;

  el.textContent =
    texto;

  el.className =
    "auth-mensaje" +
    (error ? " error" : "");
}


/* =========================================================
   LOGIN / REGISTRO
   ========================================================= */

$("tabLogin").onclick =
  () => {

    $("tabLogin")
      .classList.add("activo");

    $("tabRegistro")
      .classList.remove("activo");


    $("formLogin")
      .style.display =
      "block";


    $("formRegistro")
      .style.display =
      "none";
  };


$("tabRegistro").onclick =
  () => {

    $("tabRegistro")
      .classList.add("activo");

    $("tabLogin")
      .classList.remove("activo");


    $("formRegistro")
      .style.display =
      "block";


    $("formLogin")
      .style.display =
      "none";
  };


/* =========================================================
   REGISTRO — SUPABASE AUTH
   ========================================================= */

$("formRegistro").onsubmit =
  async e => {

    e.preventDefault();


    const nombre =
      $("registroNombre")
        .value
        .trim();


    const correo =
      $("registroCorreo")
        .value
        .trim()
        .toLowerCase();


    const p1 =
      $("registroPassword")
        .value;


    const p2 =
      $("registroPassword2")
        .value;


    if (!nombre) {

      return mensaje(
        "registroMensaje",
        "Escribe tu nombre.",
        true
      );
    }


    if (p1 !== p2) {

      return mensaje(
        "registroMensaje",
        "Las contraseñas no coinciden.",
        true
      );
    }


    if (p1.length < 6) {

      return mensaje(
        "registroMensaje",
        "La contraseña debe tener al menos 6 caracteres.",
        true
      );
    }


    const {
      data,
      error
    } =
      await supabaseClient.auth.signUp({

        email:
          correo,

        password:
          p1,

        options: {

          data: {
            nombre
          }

        }

      });


    if (error) {

      console.error(
        "Error Supabase registro:",
        error
      );

      return mensaje(
        "registroMensaje",
        error.message ||
        "No se pudo crear la cuenta.",
        true
      );
    }


    if (!data.user) {

      return mensaje(
        "registroMensaje",
        "No se pudo crear la cuenta.",
        true
      );
    }


    /*
     * Si Supabase tiene activada la confirmación
     * por correo, puede crear el usuario pero
     * no entregar una sesión todavía.
     */

    if (!data.session) {

      return mensaje(
        "registroMensaje",
        "Cuenta creada. Revisa tu correo para confirmar la cuenta y luego inicia sesión."
      );
    }


    usuario = {

      id:
        data.user.id,

      nombre:
        data.user.user_metadata?.nombre ||
        nombre,

      correo:
        data.user.email ||
        correo

    };


    localStorage.setItem(
      SESSION_KEY,
      data.user.id
    );


    mostrarApp();
  };


/* =========================================================
   LOGIN — SUPABASE AUTH
   ========================================================= */

$("formLogin").onsubmit =
  async e => {

    e.preventDefault();


    const correo =
      $("loginCorreo")
        .value
        .trim()
        .toLowerCase();


    const password =
      $("loginPassword")
        .value;


    const {
      data,
      error
    } =
      await supabaseClient.auth.signInWithPassword({

        email:
          correo,

        password

      });


    if (error) {

      console.error(
        "Error Supabase login:",
        error
      );

      return mensaje(
        "loginMensaje",
        "Correo o contraseña incorrectos.",
        true
      );
    }


    if (!data.user) {

      return mensaje(
        "loginMensaje",
        "No se pudo iniciar sesión.",
        true
      );
    }


    usuario = {

      id:
        data.user.id,

      nombre:
        data.user.user_metadata?.nombre ||
        data.user.email ||
        "Usuario",

      correo:
        data.user.email ||
        correo

    };


    localStorage.setItem(
      SESSION_KEY,
      data.user.id
    );


    mostrarApp();
  };


/* =========================================================
   TOTALES
   ========================================================= */

function obtenerTotales() {

  const ing =
    movimientos
      .filter(
        m =>
          m.tipo === "ingreso"
      )
      .reduce(
        (s, m) =>
          s + Number(m.monto || 0),
        0
      );


  const gas =
    movimientos
      .filter(
        m =>
          m.tipo === "gasto"
      )
      .reduce(
        (s, m) =>
          s + Number(m.monto || 0),
        0
      );


  const aportes =
    movimientos
      .filter(
        m =>
          m.tipo === "ahorro"
      )
      .reduce(
        (s, m) =>
          s + Number(m.monto || 0),
        0
      );


  const retiros =
    movimientos
      .filter(
        m =>
          m.tipo === "retiro_ahorro"
      )
      .reduce(
        (s, m) =>
          s + Number(m.monto || 0),
        0
      );


  return {

    ing,

    gas,

    ahorro:
      Math.max(
        aportes - retiros,
        0
      ),

    disponible:
      ing - gas
  };
}


/* =========================================================
   RESUMEN
   ========================================================= */

function renderResumen() {

  const {
    ing,
    gas,
    ahorro,
    disponible
  } =
    obtenerTotales();


  $("totalIngresos")
    .textContent =
    money(ing);


  $("totalGastos")
    .textContent =
    money(gas);


  $("totalBalance")
    .textContent =
    money(disponible);


  $("totalAhorro")
    .textContent =
    money(ahorro);


  $("totalDisponible")
    .textContent =
    money(disponible);


  $("totalDisponible")
    .style.color =
    disponible < 0
      ? "var(--rojo-alerta)"
      : "var(--celeste-accent)";


  $("totalBalance")
    .style.color =
    disponible < 0
      ? "var(--rojo-alerta)"
      : "var(--texto-principal)";
}


/* =========================================================
   CATEGORÍAS
   ========================================================= */

function renderCategorias() {

  const grid =
    $("gridCategorias");


  if (!grid) return;


  grid.innerHTML =
    "";


  distribucion
    .filter(
      x =>
        x.activo !== false
    )
    .forEach(c => {

      const gastos =
        movimientos
          .filter(
            m =>
              m.tipo === "gasto" &&
              m.categoria === c.id
          )
          .reduce(
            (s, m) =>
              s + Number(m.monto || 0),
            0
          );


      const lim =
        Number(c.limite) || 0;


      const pct =
        lim
          ? Math.min(
              gastos / lim * 100,
              100
            )
          : 0;


      const ms =
        movimientos
          .filter(
            m =>
              m.tipo === "gasto" &&
              m.categoria === c.id
          )
          .sort(
            (a, b) =>
              parseFechaLocal(b.fecha) -
              parseFechaLocal(a.fecha)
          )
          .slice(0, 3);


      const div =
        document.createElement(
          "article"
        );


      div.className =
        "categoria-card";


      div.innerHTML = `

        <div class="categoria-icono">
          ${escapeHtml(
            c.icono || "📦"
          )}
        </div>

        <div class="categoria-info">

          <h3>
            ${escapeHtml(
              c.nombre
            )}
          </h3>

          <p>
            ${money(gastos)}
            /
            ${money(lim)}
          </p>

        </div>

        <div class="barra">

          <div
            class="progreso"
            style="width:${pct}%"
          ></div>

        </div>

        <small>
          ${
            lim
              ? `${Math.round(pct)}% utilizado`
              : "Sin límite definido"
          }
        </small>

        <div class="movimientos">

          ${
            ms.length
              ? ms
                  .map(
                    m => `

                      <div class="movimiento">

                        <span>
                          ${escapeHtml(
                            m.descripcion ||
                            c.nombre
                          )}
                        </span>

                        <span>
                          ${money(
                            m.monto
                          )}
                        </span>

                      </div>

                    `
                  )
                  .join("")
              : `
                  <small>
                    Sin movimientos
                  </small>
                `
          }

        </div>
      `;


      grid.appendChild(div);
    });
}


/* =========================================================
   GASTOS FIJOS
   ========================================================= */

function daysInMonth(
  y,
  m
) {

  return new Date(
    y,
    m + 1,
    0
  ).getDate();
}


function getFixedProgress(
  g,
  refDate = new Date()
) {

  const y =
    refDate.getFullYear();


  const m =
    refDate.getMonth();


  const pagos =
    movimientos
      .filter(
        x =>
          x.tipo === "gasto" &&
          x.origenFijo === g.id
      )
      .filter(x => {

        const d =
          parseFechaLocal(
            x.fecha
          );


        return (
          d.getFullYear() === y &&
          d.getMonth() === m
        );
      });


  const pagado =
    pagos.reduce(
      (s, x) =>
        s + Number(x.monto || 0),
      0
    );


  const objetivo =
    Number(g.monto) || 0;


  const pendiente =
    Math.max(
      objetivo - pagado,
      0
    );


  const pct =
    objetivo
      ? Math.min(
          pagado /
            objetivo *
            100,
          100
        )
      : 0;


  const diaVencimiento =
    Math.min(
      Math.max(
        Number(g.dia) || 1,
        1
      ),
      daysInMonth(
        y,
        m
      )
    );


  const venc =
    new Date(
      y,
      m,
      diaVencimiento,
      23,
      59,
      59
    );


  const completa =
    pagado >= objetivo &&
    objetivo > 0;


  let estado;


  if (completa) {

    estado =
      "pagado";

  } else if (
    new Date() > venc
  ) {

    estado =
      pagado > 0
        ? "parcial-atrasado"
        : "vencido";

  } else if (
    pagado > 0
  ) {

    estado =
      "parcial";

  } else {

    estado =
      "pendiente";
  }


  return {

    pagos,

    pagado,

    objetivo,

    pendiente,

    pct,

    venc,

    estado
  };
}


function estadoFechaPago(
  fecha,
  venc
) {

  const p =
    parseFechaLocal(
      fecha
    );


  const v =
    new Date(venc);


  const diff =
    Math.round(
      (
        p -
        v
      ) /
      86400000
    );


  if (
    Math.abs(diff) <= 10
  ) {

    if (diff < 0) {

      return `Pagado ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? "s" : ""} antes`;
    }


    if (diff === 0) {

      return "Pagado a tiempo";
    }


    return `Pagado ${diff} día${diff !== 1 ? "s" : ""} tarde`;
  }


  return fechaTexto(
    fecha
  );
}


function obtenerClaseFijo(
  estado
) {

  if (
    estado === "pagado"
  ) {

    return "pagado";
  }


  if (
    estado === "vencido" ||
    estado === "parcial-atrasado"
  ) {

    return "atrasado";
  }


  if (
    estado === "parcial"
  ) {

    return "parcial";
  }


  return "pendiente";
}


function obtenerTextoEstadoFijo(
  estado
) {

  const estados = {

    pagado:
      "✓ Pagado",

    pendiente:
      "○ Pendiente",

    parcial:
      "◐ Pago parcial",

    vencido:
      "⚠ Vencido",

    "parcial-atrasado":
      "⚠ Parcial atrasado"
  };


  return estados[estado] ||
    "Pendiente";
}


function renderGastosFijos() {

  const box =
    $("listaGastosFijos");


  if (!box) return;


  const activos =
    gastosFijos.filter(
      g =>
        g.activo !== false
    );


  if (!activos.length) {

    box.innerHTML = `

      <div class="historial-vacio">

        <span>📌</span>

        No hay gastos fijos registrados.

      </div>

    `;

    return;
  }


  box.innerHTML =
    activos
      .map(g => {

        const p =
          getFixedProgress(g);


        const cl =
          obtenerClaseFijo(
            p.estado
          );


        const pagosInfo =
          p.pagos.length

            ? p.pagos
                .slice()
                .sort(
                  (a, b) =>
                    parseFechaLocal(
                      b.fecha
                    ) -
                    parseFechaLocal(
                      a.fecha
                    )
                )
                .slice(0, 3)
                .map(
                  x => `

                    <div class="fijo-pago">

                      ${fechaTexto(
                        x.fecha
                      )}

                      ·

                      ${money(
                        x.monto
                      )}

                      ·

                      ${estadoFechaPago(
                        x.fecha,
                        p.venc
                      )}

                    </div>

                  `
                )
                .join("")

            : `

                <div class="fijo-pago">
                  Sin pagos este mes
                </div>

              `;


        return `

          <div
            class="fijo-item ${cl}"
          >

            <div class="fijo-info">

              <strong>
                ${escapeHtml(
                  g.nombre
                )}
              </strong>

              <small class="fijo-estado">
                ${obtenerTextoEstadoFijo(
                  p.estado
                )}
              </small>

              <small>
                Vence día ${g.dia}
                · ${money(g.monto)}
              </small>

              <div class="barra">

                <div
                  class="progreso"
                  style="width:${p.pct}%"
                ></div>

              </div>

              <small>

                ${money(p.pagado)}
                /
                ${money(p.objetivo)}

                · Pendiente
                ${money(p.pendiente)}

              </small>

              <div class="fijo-pagos">
                ${pagosInfo}
              </div>

            </div>

            <div class="fijo-acciones">

              <button
                class="boton-secundario boton-pequeno"
                onclick="abrirPagoFijo('${g.id}')"
                type="button"
              >
                Registrar pago
              </button>

              <button
                class="boton-secundario boton-pequeno"
                onclick="editarFijo('${g.id}')"
                type="button"
              >
                Editar
              </button>

              <button
                class="boton-eliminar"
                onclick="desactivarFijo('${g.id}')"
                type="button"
                title="Desactivar gasto fijo"
              >
                ✕
              </button>

            </div>

          </div>

        `;
      })
      .join("");
}


/* =========================================================
   SELECTS
   ========================================================= */

function actualizarSelects() {

  const cat =
    $("categoria");


  if (cat) {

    cat.innerHTML =
      `
        <option value="">
          Selecciona una categoría
        </option>
      ` +

      distribucion
        .filter(
          x =>
            x.activo !== false
        )
        .map(
          c => `

            <option
              value="${escapeHtml(c.id)}"
            >
              ${escapeHtml(
                c.icono || "📦"
              )}
              ${escapeHtml(
                c.nombre
              )}
            </option>

          `
        )
        .join("");
  }


  const filtro =
    $("filtroCategoria");


  if (filtro) {

    filtro.innerHTML =
      `
        <option value="todas">
          Todas las categorías
        </option>
      ` +

      distribucion
        .filter(
          x =>
            x.activo !== false
        )
        .map(
          c => `

            <option
              value="${escapeHtml(c.id)}"
            >
              ${escapeHtml(
                c.icono || "📦"
              )}
              ${escapeHtml(
                c.nombre
              )}
            </option>

          `
        )
        .join("") +

      `

        <option value="ahorro">
          💎 Aporte a ahorro
        </option>

        <option value="retiro_ahorro">
          ↩️ Retiro de ahorro
        </option>

      `;
  }


  const fijo =
    $("gastoFijoSeleccion");


  if (fijo) {

    fijo.innerHTML =
      `
        <option value="">
          Ninguno
        </option>
      ` +

      gastosFijos
        .filter(
          x =>
            x.activo !== false
        )
        .map(
          g => `

            <option
              value="${escapeHtml(g.id)}"
            >
              ${escapeHtml(
                g.nombre
              )}
              —
              ${money(g.monto)}
            </option>

          `
        )
        .join("");
  }
}


/* =========================================================
   MOVIMIENTOS RECIENTES
   ========================================================= */

function renderMovimientosRecientes() {

  const recientes =
    $("movimientosRecientes");


  if (!recientes) return;


  const ultimos =
    movimientos
      .slice()
      .sort(
        (a, b) =>
          parseFechaLocal(b.fecha) -
          parseFechaLocal(a.fecha)
      )
      .slice(0, 3);


  recientes.innerHTML =
    ultimos.length

      ? ultimos
          .map(
            renderMovimiento
          )
          .join("")

      : `

          <div class="historial-vacio">

            <span>📋</span>

            No hay movimientos todavía.

          </div>

        `;


  const contador =
    $("contadorMovimientosRecientes");


  if (contador) {

    contador.textContent =
      `${ultimos.length} movimiento${ultimos.length === 1 ? "" : "s"}`;
  }
}


/* =========================================================
   HISTORIAL
   ========================================================= */

function renderHistorial(
  completo = false
) {

  const cat =
    $("filtroCategoria")
      ?.value ||
    "todas";


  const tipo =
    $("filtroTipo")
      ?.value ||
    "todos";


  const periodo =
    $("filtroPeriodo")
      ?.value ||
    "todos";


  const desde =
    $("filtroDesde")
      ?.value ||
    "";


  const hasta =
    $("filtroHasta")
      ?.value ||
    "";


  let arr =
    movimientos.slice();


  if (cat !== "todas") {

    arr =
      arr.filter(
        m =>
          m.categoria === cat ||
          m.tipo === cat
      );
  }


  if (tipo !== "todos") {

    arr =
      arr.filter(
        m =>
          m.tipo === tipo
      );
  }


  const now =
    new Date();


  if (
    periodo === "semana"
  ) {

    arr =
      arr.filter(m => {

        const d =
          parseFechaLocal(
            m.fecha
          );


        const diff =
          (
            now -
            d
          ) /
          86400000;


        return (
          diff >= 0 &&
          diff <= 7
        );
      });
  }


  if (
    periodo === "mes"
  ) {

    arr =
      arr.filter(m => {

        const d =
          parseFechaLocal(
            m.fecha
          );


        return (
          d.getMonth() ===
            now.getMonth() &&
          d.getFullYear() ===
            now.getFullYear()
        );
      });
  }


  if (
    periodo === "dia"
  ) {

    arr =
      arr.filter(
        m =>
          fechaISO(m.fecha) ===
          hoyISO()
      );
  }


  if (desde) {

    arr =
      arr.filter(
        m =>
          fechaISO(m.fecha) >=
          desde
      );
  }


  if (hasta) {

    arr =
      arr.filter(
        m =>
          fechaISO(m.fecha) <=
          hasta
      );
  }


  arr.sort(
    (a, b) =>
      parseFechaLocal(b.fecha) -
      parseFechaLocal(a.fecha)
  );


  const listaCompleta =
    arr.slice();


  if (!completo) {

    arr =
      arr.slice(0, 3);
  }


  const box =
    $("historialMovimientos");


  if (!box) return;


  box.innerHTML =
    arr.length

      ? arr
          .map(
            renderMovimiento
          )
          .join("")

      : `

          <div class="historial-vacio">

            <span>📋</span>

            No hay movimientos con estos filtros.

          </div>

        `;


  const contador =
    $("contadorHistorial");


  if (contador) {

    contador.textContent =
      `${listaCompleta.length} movimiento${listaCompleta.length === 1 ? "" : "s"}`;
  }
}


/* =========================================================
   RENDER MOVIMIENTO
   ========================================================= */

function renderMovimiento(m) {

  const esIngreso =
    m.tipo === "ingreso";


  const esAhorro =
    m.tipo === "ahorro";


  const esRetiro =
    m.tipo ===
    "retiro_ahorro";


  const cat =
    distribucion.find(
      c =>
        c.id ===
        m.categoria
    );


  const icon =
    esIngreso
      ? "💰"
      : esAhorro
        ? "💎"
        : esRetiro
          ? "↩️"
          : cat?.icono ||
            "💸";


  const nombre =
    esIngreso
      ? "Ingreso"
      : esAhorro
        ? "Aporte a ahorro"
        : esRetiro
          ? "Retiro de ahorro"
          : cat?.nombre ||
            "Gasto";


  const signo =
    esIngreso
      ? "+"
      : esRetiro
        ? "↩"
        : "-";


  const claseValor =
    esIngreso
      ? "ingreso"
      : esAhorro
        ? "ahorro"
        : esRetiro
          ? "retiro"
          : "gasto";


  return `

    <div class="movimiento-historial">

      <div class="movimiento-principal">

        <div class="movimiento-icono">
          ${icon}
        </div>

        <div>

          <strong>
            ${escapeHtml(
              m.descripcion ||
              nombre
            )}
          </strong>

          <small>

            ${escapeHtml(
              nombre
            )}

            ·

            ${fechaTexto(
              m.fecha
            )}

            ${
              m.origenFijo
                ? " · Gasto fijo"
                : ""
            }

          </small>

        </div>

      </div>

      <div class="movimiento-valor">

        <strong
          class="${claseValor}"
        >
          ${signo}${money(
            m.monto
          )}
        </strong>

        <br>

        <button
          class="boton-secundario boton-pequeno"
          onclick="editarMovimiento('${m.id}')"
          type="button"
        >
          Editar
        </button>

        <button
          class="boton-eliminar"
          onclick="eliminarMovimiento('${m.id}')"
          type="button"
          title="Eliminar movimiento"
        >
          ✕
        </button>

      </div>

    </div>

  `;
}


/* =========================================================
   RENDER GENERAL
   ========================================================= */

function render() {

  actualizarSelects();

  renderResumen();

  renderCategorias();

  renderMovimientosRecientes();

  renderHistorial();

  renderGastosFijos();

  guardarDatos();
}


/* =========================================================
   FORMULARIOS
   ========================================================= */

function mostrar(id) {

  document
    .querySelectorAll(
      ".formulario-panel"
    )
    .forEach(
      x =>
        x.style.display =
          "none"
    );


  const el =
    $(id);


  if (!el) return;


  el.style.display =
    "block";


  establecerFechasHoy();


  el.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


function cerrarFormGasto() {

  $("formularioGasto")
    .style.display =
    "none";


  $("formGasto")
    .reset();


  $("gastoFijoSeleccion")
    .value =
    "";


  $("tipoSalida")
    .value =
    "gasto";


  $("tipoSalida")
    .dispatchEvent(
      new Event("change")
    );
}


function establecerFechasHoy() {

  const hoy =
    hoyISO();


  if ($("fechaIngreso")) {

    $("fechaIngreso")
      .value =
      hoy;
  }


  if ($("fechaGasto")) {

    $("fechaGasto")
      .value =
      hoy;
  }
}


/* =========================================================
   TARJETAS
   ========================================================= */

function activarTarjeta(
  id,
  accion
) {

  const el =
    $(id);


  if (!el) return;


  el.onclick =
    accion;


  el.onkeydown =
    e => {

      if (
        e.key === "Enter" ||
        e.key === " "
      ) {

        e.preventDefault();

        accion();
      }
    };
}


activarTarjeta(
  "tarjetaIngresos",
  () =>
    mostrar(
      "formularioIngreso"
    )
);


activarTarjeta(
  "tarjetaGastos",
  () => {

    $("tipoSalida")
      .value =
      "gasto";


    $("tipoSalida")
      .dispatchEvent(
        new Event("change")
      );


    mostrar(
      "formularioGasto"
    );
  }
);


activarTarjeta(
  "tarjetaAhorro",
  () => {

    $("tipoSalida")
      .value =
      "ahorro";


    $("tipoSalida")
      .dispatchEvent(
        new Event("change")
      );


    mostrar(
      "formularioGasto"
    );
  }
);


/* =========================================================
   INGRESOS
   ========================================================= */

$("cerrarFormularioIngreso")
  .onclick =
  () => {

    $("formularioIngreso")
      .style.display =
      "none";


    $("formIngreso")
      .reset();


    establecerFechasHoy();
  };


$("formIngreso").onsubmit =
  e => {

    e.preventDefault();


    const tipo =
      $("tipoIngreso")
        .value;


    const monto =
      Number(
        $("montoIngreso")
          .value
      );


    const fecha =
      $("fechaIngreso")
        .value ||
      hoyISO();


    if (
      !tipo ||
      monto <= 0
    ) {

      return alert(
        "Completa correctamente el tipo y el monto."
      );
    }


    movimientos.push({

      id:
        crypto.randomUUID(),

      tipo:
        "ingreso",

      categoria:
        tipo,

      monto,

      descripcion:
        $("descripcionIngreso")
          .value
          .trim(),

      fecha

    });


    guardarMovimientos();


    e.target.reset();


    render();


    establecerFechasHoy();


    $("formularioIngreso")
      .style.display =
      "none";
  };


/* =========================================================
   GASTOS / AHORRO
   ========================================================= */

$("cerrarFormularioGasto")
  .onclick =
  cerrarFormGasto;


$("tipoSalida").onchange =
  () => {

    const v =
      $("tipoSalida")
        .value;


    const normal =
      v === "gasto";


    const ahorro =
      v === "ahorro";


    const retiro =
      v === "retiro_ahorro";


    $("camposGasto")
      .style.display =
      normal
        ? "block"
        : "none";


    $("campoTipoGasto")
      .style.display =
      normal
        ? "block"
        : "none";


    $("campoGastoFijo")
      .style.display =
      normal
        ? "block"
        : "none";


    $("campoRetiroAhorro")
      .style.display =
      retiro
        ? "block"
        : "none";


    $("descripcion")
      .placeholder =
      ahorro
        ? "Ej. Fondo de emergencia"
        : retiro
          ? "Ej. Proyecto o emergencia"
          : "¿En qué gastaste?";


    $("guardarSalida")
      .textContent =
      ahorro
        ? "Guardar aporte a ahorro"
        : retiro
          ? "Registrar retiro de ahorro"
          : "Guardar gasto";


    if (
      ahorro ||
      retiro
    ) {

      $("categoria")
        .value =
        "";


      $("gastoFijoSeleccion")
        .value =
        "";
    }
  };


$("formGasto").onsubmit =
  e => {

    e.preventDefault();


    const tipo =
      $("tipoSalida")
        .value;


    const monto =
      Number(
        $("monto").value
      );


    const fecha =
      $("fechaGasto")
        .value ||
      hoyISO();


    if (
      monto <= 0
    ) {

      return alert(
        "Completa correctamente el monto."
      );
    }


    if (
      tipo === "gasto" &&
      !$("categoria").value &&
      !$("gastoFijoSeleccion").value
    ) {

      return alert(
        "Selecciona una categoría."
      );
    }


    if (
      tipo === "gasto" &&
      $("gastoFijoSeleccion").value
    ) {

      const g =
        gastosFijos.find(
          x =>
            x.id ===
            $("gastoFijoSeleccion")
              .value
        );


      const descripcion =
        $("descripcion")
          .value
          .trim() ||
        g?.nombre ||
        "Gasto fijo";


      movimientos.push({

        id:
          crypto.randomUUID(),

        tipo:
          "gasto",

        categoria:
          $("categoria")
            .value ||
          "otros",

        monto,

        descripcion,

        tipoGasto:
          "fijo",

        fecha,

        origenFijo:
          g?.id

      });

    } else if (
      tipo === "gasto"
    ) {

      movimientos.push({

        id:
          crypto.randomUUID(),

        tipo:
          "gasto",

        categoria:
          $("categoria")
            .value,

        monto,

        descripcion:
          $("descripcion")
            .value
            .trim(),

        tipoGasto:
          $("tipoGasto")
            .value,

        fecha

      });

    } else if (
      tipo === "ahorro"
    ) {

      movimientos.push({

        id:
          crypto.randomUUID(),

        tipo:
          "ahorro",

        categoria:
          "ahorro",

        monto,

        descripcion:
          $("descripcion")
            .value
            .trim(),

        fecha

      });

    } else {

      const saldo =
        obtenerTotales()
          .ahorro;


      if (
        monto > saldo
      ) {

        return alert(
          `No puedes retirar ${money(monto)} porque tu ahorro disponible es ${money(saldo)}.`
        );
      }


      movimientos.push({

        id:
          crypto.randomUUID(),

        tipo:
          "retiro_ahorro",

        categoria:
          "retiro_ahorro",

        monto,

        descripcion:
          $("descripcion")
            .value
            .trim(),

        fecha

      });
    }


    guardarMovimientos();


    e.target.reset();


    cerrarFormGasto();


    render();


    establecerFechasHoy();
  };


/* =========================================================
   EDITAR / ELIMINAR MOVIMIENTOS
   ========================================================= */

window.eliminarMovimiento =
  id => {

    if (
      confirm(
        "¿Eliminar este movimiento?"
      )
    ) {

      movimientos =
        movimientos.filter(
          m =>
            m.id !== id
        );


      guardarMovimientos();

      render();
    }
  };


window.editarMovimiento =
  id => {

    const m =
      movimientos.find(
        x =>
          x.id === id
      );


    if (!m) return;


    $("editarId")
      .value =
      m.id;


    $("editarTipo")
      .value =
      m.tipo;


    $("editarMonto")
      .value =
      m.monto;


    $("editarFecha")
      .value =
      fechaISO(
        m.fecha
      );


    $("editarDescripcion")
      .value =
      m.descripcion ||
      "";


    $("editarCategoria")
      .innerHTML =

      distribucion
        .filter(
          c =>
            c.activo !== false
        )
        .map(
          c => `

            <option
              value="${escapeHtml(c.id)}"
            >
              ${escapeHtml(
                c.icono || "📦"
              )}
              ${escapeHtml(
                c.nombre
              )}
            </option>

          `
        )
        .join("") +

      `

        <option value="ahorro">
          💎 Aporte a ahorro
        </option>

        <option value="retiro_ahorro">
          ↩️ Retiro de ahorro
        </option>

      `;


    $("editarCategoria")
      .value =
      m.categoria;


    $("formularioEdicion")
      .style.display =
      "block";


    $("formularioEdicion")
      .scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  };


$("cerrarEdicion")
  .onclick =
  () => {

    $("formularioEdicion")
      .style.display =
      "none";

    $("formEdicion")
      .reset();
  };


$("cancelarEdicion")
  .onclick =
  () => {

    $("formularioEdicion")
      .style.display =
      "none";
  };


$("formEdicion").onsubmit =
  e => {

    e.preventDefault();


    const m =
      movimientos.find(
        x =>
          x.id ===
          $("editarId")
            .value
      );


    if (!m) return;


    const nuevoTipo =
      $("editarTipo")
        .value;


    const nuevoMonto =
      Number(
        $("editarMonto")
          .value
      );


    const nuevaFecha =
      $("editarFecha")
        .value ||
      hoyISO();


    const nuevaCategoria =
      $("editarCategoria")
        .value;


    if (
      nuevoMonto <= 0
    ) {

      return alert(
        "El monto debe ser mayor que cero."
      );
    }


    if (
      nuevoTipo ===
      "retiro_ahorro"
    ) {

      const ahorroActual =
        obtenerTotales()
          .ahorro;


      const retiroAnterior =
        m.tipo ===
        "retiro_ahorro"
          ? Number(m.monto)
          : 0;


      const ahorroDisponible =
        ahorroActual +
        retiroAnterior;


      if (
        nuevoMonto >
        ahorroDisponible
      ) {

        return alert(
          `No puedes guardar este retiro. Tu ahorro disponible sería insuficiente.`
        );
      }
    }


    m.tipo =
      nuevoTipo;


    m.monto =
      nuevoMonto;


    m.fecha =
      nuevaFecha;


    m.descripcion =
      $("editarDescripcion")
        .value
        .trim();


    m.categoria =
      nuevaCategoria;


    if (
      nuevoTipo !== "gasto"
    ) {

      delete m.origenFijo;
      delete m.tipoGasto;
    }


    guardarMovimientos();


    render();


    $("formularioEdicion")
      .style.display =
      "none";
  };


/* =========================================================
   GASTOS FIJOS
   ========================================================= */

$("mostrarFormFijo")
  .onclick =
  () => {

    resetFijoForm();


    $("formGastoFijo")
      .style.display =
      "block";


    $("fijoNombre")
      .focus();
  };


$("cancelarFijo")
  .onclick =
  () => {

    resetFijoForm();


    $("formGastoFijo")
      .style.display =
      "none";
  };


function resetFijoForm() {

  $("formGastoFijo")
    .reset();


  $("fijoId")
    .value =
    "";
}


window.editarFijo =
  id => {

    const g =
      gastosFijos.find(
        x =>
          x.id === id
      );


    if (!g) return;


    $("fijoId")
      .value =
      g.id;


    $("fijoNombre")
      .value =
      g.nombre;


    $("fijoMonto")
      .value =
      g.monto;


    $("fijoDia")
      .value =
      g.dia;


    $("formGastoFijo")
      .style.display =
      "block";


    $("fijoNombre")
      .focus();


    $("formGastoFijo")
      .scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  };


$("formGastoFijo").onsubmit =
  e => {

    e.preventDefault();


    const id =
      $("fijoId")
        .value;


    const nombre =
      $("fijoNombre")
        .value
        .trim();


    const monto =
      Number(
        $("fijoMonto")
          .value
      );


    const dia =
      Number(
        $("fijoDia")
          .value
      );


    if (
      !nombre ||
      monto <= 0 ||
      dia < 1 ||
      dia > 31
    ) {

      return alert(
        "Completa correctamente el gasto fijo."
      );
    }


    if (id) {

      const g =
        gastosFijos.find(
          x =>
            x.id === id
        );


      if (g) {

        g.nombre =
          nombre;

        g.monto =
          monto;

        g.dia =
          dia;

        g.activo =
          true;
      }

    } else {

      gastosFijos.push({

        id:
          crypto.randomUUID(),

        nombre,

        monto,

        dia,

        activo:
          true,

        creado:
          new Date()
            .toISOString()
      });
    }


    guardarFijos();


    resetFijoForm();


    $("formGastoFijo")
      .style.display =
      "none";


    render();
  };


window.desactivarFijo =
  id => {

    const g =
      gastosFijos.find(
        x =>
          x.id === id
      );


    if (
      g &&
      confirm(
        `¿Dejar de usar ${g.nombre} como gasto fijo? Sus pagos históricos se conservarán.`
      )
    ) {

      g.activo =
        false;


      guardarFijos();

      render();
    }
  };


window.abrirPagoFijo =
  id => {

    $("tipoSalida")
      .value =
      "gasto";


    $("tipoSalida")
      .dispatchEvent(
        new Event("change")
      );


    actualizarSelects();


    $("gastoFijoSeleccion")
      .value =
      id;


    const g =
      gastosFijos.find(
        x =>
          x.id === id
      );


    if (g) {

      const vivienda =
        distribucion.find(
          c =>
            c.nombre
              .toLowerCase()
              .includes(
                "vivienda"
              )
        );


      $("categoria")
        .value =
        vivienda?.id ||
        distribucion[0]?.id ||
        "otros";


      $("descripcion")
        .value =
        g.nombre;
    }


    mostrar(
      "formularioGasto"
    );
  };


/* =========================================================
   DISTRIBUCIÓN
   ========================================================= */

$("mostrarDistribucion")
  .onclick =
  () => {

    renderEditorDistribucion();


    $("modalDistribucion")
      .style.display =
      "flex";
  };


$("cerrarDistribucion")
  .onclick =
  () => {

    $("modalDistribucion")
      .style.display =
      "none";
  };


$("modalDistribucion")
  .addEventListener(
    "click",
    e => {

      if (
        e.target ===
        $("modalDistribucion")
      ) {

        $("modalDistribucion")
          .style.display =
          "none";
      }
    }
  );


function renderEditorDistribucion() {

  const box =
    $("listaDistribucionEditar");


  if (!box) return;


  box.innerHTML =
    distribucion
      .filter(
        c =>
          c.activo !== false
      )
      .map(
        c => `

          <div
            class="distribucion-edit-row"
          >

            <span>

              ${escapeHtml(
                c.icono || "📦"
              )}

              ${escapeHtml(
                c.nombre
              )}

            </span>

            <input
              type="number"
              min="0"
              step="0.01"
              value="${Number(c.limite) || 0}"
              data-id="${escapeHtml(c.id)}"
              title="Monto de control"
            >

            <button
              class="boton-secundario boton-pequeno"
              onclick="editarArea('${c.id}')"
              type="button"
            >
              Editar
            </button>

            <button
              class="boton-eliminar"
              onclick="eliminarArea('${c.id}')"
              type="button"
              title="Eliminar área"
            >
              ✕
            </button>

          </div>

        `
      )
      .join("");
}


window.editarArea =
  id => {

    const c =
      distribucion.find(
        x =>
          x.id === id
      );


    if (!c) return;


    const n =
      prompt(
        "Nombre del área:",
        c.nombre
      );


    if (n === null)
      return;


    const nombre =
      n.trim();


    if (!nombre) {

      return alert(
        "El nombre no puede estar vacío."
      );
    }


    const i =
      prompt(
        "Ícono (emoji):",
        c.icono ||
          "📦"
      );


    if (i === null)
      return;


    c.nombre =
      nombre;


    c.icono =
      i.trim() ||
      c.icono ||
      "📦";


    guardarDistribucion();


    renderEditorDistribucion();

    render();
  };


window.eliminarArea =
  id => {

    if (
      distribucion.filter(
        x =>
          x.activo !== false
      ).length <= 1
    ) {

      return alert(
        "Debes conservar al menos un área."
      );
    }


    const c =
      distribucion.find(
        x =>
          x.id === id
      );


    if (
      c &&
      confirm(
        `¿Eliminar ${c.nombre} de la distribución? Sus movimientos históricos se conservarán.`
      )
    ) {

      c.activo =
        false;


      guardarDistribucion();


      renderEditorDistribucion();

      render();
    }
  };


$("formNuevaArea")
  .onsubmit =
  e => {

    e.preventDefault();


    const nombre =
      $("nuevaAreaNombre")
        .value
        .trim();


    const icono =
      $("nuevaAreaIcono")
        .value
        .trim() ||
      "📦";


    const limite =
      Number(
        $("nuevaAreaLimite")
          .value
      ) || 0;


    if (!nombre) {

      return alert(
        "Escribe un nombre para el área."
      );
    }


    const nombreExiste =
      distribucion.some(
        c =>
          c.activo !== false &&
          c.nombre
            .trim()
            .toLowerCase() ===
          nombre
            .toLowerCase()
      );


    if (nombreExiste) {

      return alert(
        "Ya existe un área con ese nombre."
      );
    }


    distribucion.push({

      id:
        crypto.randomUUID(),

      nombre,

      icono,

      limite,

      activo:
        true

    });


    guardarDistribucion();


    e.target.reset();


    renderEditorDistribucion();

    render();
  };


$("guardarLimitesDistribucion")
  .onclick =
  () => {

    document
      .querySelectorAll(
        "#listaDistribucionEditar input[data-id]"
      )
      .forEach(i => {

        const c =
          distribucion.find(
            x =>
              x.id ===
              i.dataset.id
          );


        if (c) {

          c.limite =
            Math.max(
              Number(i.value) || 0,
              0
            );
        }
      });


    guardarDistribucion();


    $("modalDistribucion")
      .style.display =
      "none";


    render();
  };


/* =========================================================
   FILTROS
   ========================================================= */

$("filtroCategoria")
  .onchange =
  () =>
    renderHistorial(true);


$("filtroTipo")
  .onchange =
  () =>
    renderHistorial(true);


$("filtroPeriodo")
  .onchange =
  () =>
    renderHistorial(true);


$("filtroDesde")
  .onchange =
  () =>
    renderHistorial(true);


$("filtroHasta")
  .onchange =
  () =>
    renderHistorial(true);


$("gestionarMovimientos")
  .onclick =
  () => {

    renderHistorial(true);


    $("seccionHistorial")
      .style.display =
      "block";


    $("seccionHistorial")
      .scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  };


$("cerrarHistorial")
  .onclick =
  () => {

    $("seccionHistorial")
      .style.display =
      "none";
  };


$("seccionHistorial")
  .style.display =
  "none";


/* =========================================================
   EXPORTAR
   ========================================================= */

function exportar(
  filtro
) {

  let arr =
    movimientos.slice();


  if (
    filtro === "semana"
  ) {

    arr =
      arr.filter(
        m => {

          const diff =
            (
              new Date() -
              parseFechaLocal(
                m.fecha
              )
            ) /
            86400000;


          return (
            diff >= 0 &&
            diff <= 7
          );
        }
      );
  }


  if (
    filtro === "mes"
  ) {

    const n =
      new Date();


    arr =
      arr.filter(m => {

        const d =
          parseFechaLocal(
            m.fecha
          );


        return (
          d.getMonth() ===
            n.getMonth() &&
          d.getFullYear() ===
            n.getFullYear()
        );
      });
  }


  arr.sort(
    (a, b) =>
      parseFechaLocal(b.fecha) -
      parseFechaLocal(a.fecha)
  );


  const encabezado =
    [
      "Fecha",
      "Tipo",
      "Categoría",
      "Monto",
      "Descripción",
      "Tipo de gasto"
    ]
      .map(
        x =>
          `"${x}"`
      )
      .join(",");


  const filas =
    arr
      .map(
        m =>
          [

            fechaTexto(
              m.fecha
            ),

            m.tipo,

            m.categoria ===
            "ahorro"

              ? "Ahorro"

              : m.categoria ===
                "retiro_ahorro"

                ? "Retiro de ahorro"

                : (
                    distribucion.find(
                      c =>
                        c.id ===
                        m.categoria
                    )?.nombre ||
                    m.categoria
                  ),

            Number(m.monto || 0)
              .toFixed(2),

            m.descripcion,

            m.tipoGasto ||
              ""

          ]
            .map(
              x =>
                `"${String(
                  x ?? ""
                ).replaceAll(
                  '"',
                  '""'
                )}"`
            )
            .join(",")
      )
      .join("\n");


  const csv =
    encabezado +
    "\n" +
    filas;


  const blob =
    new Blob(
      [
        "\ufeff" +
        csv
      ],
      {
        type:
          "text/csv;charset=utf-8"
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement(
      "a"
    );


  a.href =
    url;


  a.download =
    `finanzas_${filtro}_${hoyISO()}.csv`;


  document.body.appendChild(a);

  a.click();

  a.remove();


  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    100
  );
}


$("exportarSemana")
  .onclick =
  () =>
    exportar(
      "semana"
    );


$("exportarMes")
  .onclick =
  () =>
    exportar(
      "mes"
    );


$("exportarTodo")
  .onclick =
  () =>
    exportar(
      "todo"
    );


/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

$("botonConfiguracion")
  .onclick =
  () =>
    alert(
      "La configuración de cuenta y datos se mantiene local en este dispositivo. Las personalizaciones financieras se realizan desde Distribución y Gastos Fijos."
    );


/* =========================================================
   INICIO / SESIÓN SUPABASE
   ========================================================= */

async function iniciarAplicacion() {

  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth.getSession();


    if (error) {

      console.error(
        "Error obteniendo sesión Supabase:",
        error
      );
    }


    const session =
      data?.session;


    if (session?.user) {

      const authUser =
        session.user;


      usuario = {

        id:
          authUser.id,

        nombre:
          authUser.user_metadata?.nombre ||
          authUser.email ||
          "Usuario",

        correo:
          authUser.email ||
          ""

      };


      localStorage.setItem(
        SESSION_KEY,
        authUser.id
      );


      mostrarApp();

      return;
    }

  } catch (error) {

    console.error(
      "No se pudo consultar Supabase Auth:",
      error
    );
  }


  /*
   * Compatibilidad temporal con la sesión
   * local anterior de la V1.
   */

  let sessionId = null;


  try {

    sessionId =
      localStorage.getItem(
        SESSION_KEY
      );

  } catch {}


  const u =
    usuarios().find(
      x =>
        x.id ===
        sessionId
    );


  if (u) {

    usuario =
      u;


    mostrarApp();

    return;
  }


  $("pantallaAuth")
    .style.display =
    "flex";


  $("app")
    .style.display =
    "none";
}


/* =========================================================
   OBSERVAR CAMBIOS DE SESIÓN
   ========================================================= */

supabaseClient.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    if (
      event ===
      "SIGNED_OUT"
    ) {

      return;
    }


    if (
      session?.user &&
      !usuario
    ) {

      const authUser =
        session.user;


      usuario = {

        id:
          authUser.id,

        nombre:
          authUser.user_metadata?.nombre ||
          authUser.email ||
          "Usuario",

        correo:
          authUser.email ||
          ""

      };


      localStorage.setItem(
        SESSION_KEY,
        authUser.id
      );


      mostrarApp();
    }

  }
);


/* =========================================================
   INICIAR
   ========================================================= */

$("tipoSalida")
  .dispatchEvent(
    new Event("change")
  );


establecerFechasHoy();


iniciarAplicacion();


/* =========================================================
   SERVICE WORKER
   ========================================================= */

if (
  "serviceWorker" in
  navigator
) {

  window.addEventListener(
    "load",
    async () => {

      try {

        const registrations =
          await navigator
            .serviceWorker
            .getRegistrations();


        for (
          const registration
          of registrations
        ) {

          await registration
            .unregister();
        }


        if (
          window.caches &&
          caches.keys
        ) {

          const keys =
            await caches.keys();


          for (
            const key
            of keys
          ) {

            await caches.delete(
              key
            );
          }
        }

      } catch {}

    }
  );
}
