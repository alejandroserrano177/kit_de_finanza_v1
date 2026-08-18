const $ = id => document.getElementById(id);

const money = n => "$" + Number(n || 0).toFixed(2);


/* =========================================================
   SUPABASE
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
   CONFIGURACIÓN LOCAL
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

let sincronizando = false;


/* =========================================================
   LOCALSTORAGE
   ========================================================= */

function leerLocal(key, fallback = null) {

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


function escribirLocal(key, value) {

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


function guardarUsuarios(lista) {

  return escribirLocal(
    USERS_KEY,
    lista
  );
}


function userKey(nombre) {

  return `kf_${usuario.id}_${nombre}`;
}


/* =========================================================
   CONVERSIÓN DE DATOS
   ========================================================= */

function uuidValido(valor) {

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(
      String(valor || "")
    );
}


function nuevoUUID() {

  return crypto.randomUUID();
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

  return v
    ? parseFechaLocal(v)
        .toLocaleDateString("es-EC")
    : "";
}


function fechaISO(valor) {

  return String(
    valor || ""
  ).slice(0, 10);
}


/* =========================================================
   UTILIDADES
   ========================================================= */

function escapeHtml(s) {

  return String(
    s ?? ""
  ).replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
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

      nombre:
        v[1],

      icono:
        v[0],

      limite:
        v[2],

      activo:
        true

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
   GUARDADO LOCAL
   ========================================================= */

function guardarDatosLocal() {

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


function guardarMovimientosLocal() {

  if (!usuario) return;

  escribirLocal(
    userKey("movimientos"),
    movimientos
  );
}


function guardarFijosLocal() {

  if (!usuario) return;

  escribirLocal(
    userKey("fijos"),
    gastosFijos
  );
}


function guardarDistribucionLocal() {

  if (!usuario) return;

  escribirLocal(
    userKey("distribucion"),
    distribucion
  );
}


/* =========================================================
   MAPEO DE MOVIMIENTOS
   ========================================================= */

function movimientoASupabase(m) {

  return {

    id:
      uuidValido(m.id)
        ? m.id
        : nuevoUUID(),

    user_id:
      usuario.id,

    tipo:
      m.tipo || "gasto",

    categoria_id:
      (
        m.tipo === "gasto" &&
        uuidValido(m.categoria)
      )
        ? m.categoria
        : null,

    gasto_fijo_id:
      uuidValido(m.origenFijo)
        ? m.origenFijo
        : null,

    monto:
      Number(m.monto) || 0,

    descripcion:
      m.descripcion ||
      null,

    tipo_gasto:
      m.tipoGasto ||
      null,

    fecha:
      fechaISO(m.fecha) ||
      hoyISO()

  };
}


function movimientoDesdeSupabase(row) {

  return {

    id:
      row.id,

    tipo:
      row.tipo,

    categoria:
      row.categoria_id ||
      (
        row.tipo === "ahorro"
          ? "ahorro"
          : row.tipo === "retiro_ahorro"
            ? "retiro_ahorro"
            : ""
      ),

    monto:
      Number(row.monto) || 0,

    descripcion:
      row.descripcion ||
      "",

    tipoGasto:
      row.tipo_gasto ||
      "",

    fecha:
      fechaISO(row.fecha),

    origenFijo:
      row.gasto_fijo_id ||
      null

  };
}


/* =========================================================
   MAPEO DE GASTOS FIJOS
   ========================================================= */

function fijoASupabase(g) {

  return {

    id:
      uuidValido(g.id)
        ? g.id
        : nuevoUUID(),

    user_id:
      usuario.id,

    nombre:
      g.nombre,

    monto:
      Number(g.monto) || 0,

    dia:
      Number(g.dia) || 1,

    activo:
      g.activo !== false

  };
}


function fijoDesdeSupabase(row) {

  return {

    id:
      row.id,

    nombre:
      row.nombre,

    monto:
      Number(row.monto) || 0,

    dia:
      Number(row.dia) || 1,

    activo:
      row.activo !== false,

    creado:
      row.created_at ||
      new Date().toISOString()

  };
}


/* =========================================================
   MAPEO DE CATEGORÍAS
   ========================================================= */

function categoriaASupabase(c) {

  return {

    id:
      uuidValido(c.id)
        ? c.id
        : nuevoUUID(),

    user_id:
      usuario.id,

    nombre:
      c.nombre,

    icono:
      c.icono ||
      "📦",

    limite:
      Number(c.limite) || 0,

    activo:
      c.activo !== false

  };
}


function categoriaDesdeSupabase(row) {

  return {

    id:
      row.id,

    nombre:
      row.nombre,

    icono:
      row.icono ||
      "📦",

    limite:
      Number(row.limite) || 0,

    activo:
      row.activo !== false

  };
}


/* =========================================================
   MIGRACIÓN LOCAL → SUPABASE
   ========================================================= */

async function migrarDatosLocalesASupabase() {

  if (!usuario) return;

  try {

    const movimientosLocales =
      leerLocal(
        userKey("movimientos"),
        []
      ) || [];

    const fijosLocales =
      leerLocal(
        userKey("fijos"),
        []
      ) || [];

    const categoriasLocales =
      leerLocal(
        userKey("distribucion"),
        null
      );


    /*
     * Solo hacemos migración si existen datos locales.
     */

    if (
      Array.isArray(categoriasLocales) &&
      categoriasLocales.length
    ) {

      const mapaCategorias =
        {};

      const categoriasParaSubir =
        categoriasLocales.map(
          c => {

            const viejoId =
              c.id;

            const nuevoId =
              uuidValido(c.id)
                ? c.id
                : nuevoUUID();

            mapaCategorias[viejoId] =
              nuevoId;

            return {

              id:
                nuevoId,

              user_id:
                usuario.id,

              nombre:
                c.nombre,

              icono:
                c.icono ||
                "📦",

              limite:
                Number(
                  c.limite
                ) || 0,

              activo:
                c.activo !== false

            };
          }
        );


      const {
        error
      } =
        await supabaseClient
          .from("categorias")
          .upsert(
            categoriasParaSubir,
            {
              onConflict:
                "id"
            }
          );


      if (error) {

        console.error(
          "Error migrando categorías:",
          error
        );

      } else {

        /*
         * Actualizamos los IDs locales
         * de las categorías.
         */

        distribucion =
          categoriasLocales.map(
            c => ({

              ...c,

              id:
                mapaCategorias[
                  c.id
                ] ||
                c.id

            })
          );


        /*
         * Actualizamos las categorías
         * de los movimientos.
         */

        movimientos =
          Array.isArray(
            movimientosLocales
          )
            ? movimientosLocales.map(
                m => ({

                  ...m,

                  id:
                    uuidValido(m.id)
                      ? m.id
                      : nuevoUUID(),

                  categoria:
                    mapaCategorias[
                      m.categoria
                    ] ||
                    (
                      uuidValido(
                        m.categoria
                      )
                        ? m.categoria
                        : m.categoria
                    )

                })
              )
            : [];

      }
    }


    /*
     * Si no había categorías locales,
     * utilizamos las categorías que
     * ya estén en Supabase.
     */

    if (
      !distribucion.length
    ) {

      const {
        data
      } =
        await supabaseClient
          .from("categorias")
          .select("*")
          .eq(
            "user_id",
            usuario.id
          );

      if (
        Array.isArray(data) &&
        data.length
      ) {

        distribucion =
          data.map(
            categoriaDesdeSupabase
          );
      }
    }


    /*
     * Migración de gastos fijos.
     */

    if (
      Array.isArray(
        fijosLocales
      ) &&
      fijosLocales.length
    ) {

      gastosFijos =
        fijosLocales.map(
          g => ({

            ...g,

            id:
              uuidValido(g.id)
                ? g.id
                : nuevoUUID()

          })
        );


      const filas =
        gastosFijos.map(
          fijoASupabase
        );


      const {
        error
      } =
        await supabaseClient
          .from("gastos_fijos")
          .upsert(
            filas,
            {
              onConflict:
                "id"
            }
          );


      if (error) {

        console.error(
          "Error migrando gastos fijos:",
          error
        );
      }
    }


    /*
     * Migración de movimientos.
     */

    if (
      Array.isArray(
        movimientos
      ) &&
      movimientos.length
    ) {

      const filas =
        movimientos.map(
          movimientoASupabase
        );


      const {
        error
      } =
        await supabaseClient
          .from("movimientos")
          .upsert(
            filas,
            {
              onConflict:
                "id"
            }
          );


      if (error) {

        console.error(
          "Error migrando movimientos:",
          error
        );

      } else {

        movimientos =
          filas.map(
            movimientoDesdeSupabase
          );
      }
    }


    guardarDatosLocal();

  } catch (error) {

    console.error(
      "Error durante migración local:",
      error
    );
  }
}


/* =========================================================
   CARGAR DATOS DESDE SUPABASE
   ========================================================= */

async function cargarDatosSupabase() {

  if (!usuario) return;

  try {

    /*
     * CATEGORÍAS
     */

    const {
      data:
        categoriasData,
      error:
        categoriasError
    } =
      await supabaseClient
        .from("categorias")
        .select("*")
        .eq(
          "user_id",
          usuario.id
        )
        .order(
          "created_at",
          {
            ascending: true
          }
        );


    if (categoriasError) {

      console.error(
        "Error cargando categorías:",
        categoriasError
      );

    } else {

      distribucion =
        (
          categoriasData || []
        ).map(
          categoriaDesdeSupabase
        );
    }


    /*
     * Si el usuario todavía no tiene
     * categorías, creamos las predeterminadas.
     */

    if (
      !distribucion.length
    ) {

      const defaults =
        crearCategoriasDefault();


      const filas =
        defaults.map(
          c => ({

            ...categoriaASupabase(c),

            id:
              nuevoUUID()

          })
        );


      const {
        data,
        error
      } =
        await supabaseClient
          .from("categorias")
          .insert(
            filas
          )
          .select();


      if (error) {

        console.error(
          "Error creando categorías predeterminadas:",
          error
        );

        distribucion =
          defaults;

      } else {

        distribucion =
          (
            data || []
          ).map(
            categoriaDesdeSupabase
          );
      }
    }


    /*
     * GASTOS FIJOS
     */

    const {
      data:
        fijosData,
      error:
        fijosError
    } =
      await supabaseClient
        .from("gastos_fijos")
        .select("*")
        .eq(
          "user_id",
          usuario.id
        )
        .order(
          "created_at",
          {
            ascending: true
          }
        );


    if (fijosError) {

      console.error(
        "Error cargando gastos fijos:",
        fijosError
      );

    } else {

      gastosFijos =
        (
          fijosData || []
        ).map(
          fijoDesdeSupabase
        );
    }


    /*
     * MOVIMIENTOS
     */

    const {
      data:
        movimientosData,
      error:
        movimientosError
    } =
      await supabaseClient
        .from("movimientos")
        .select("*")
        .eq(
          "user_id",
          usuario.id
        )
        .order(
          "fecha",
          {
            ascending: false
          }
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        );


    if (movimientosError) {

      console.error(
        "Error cargando movimientos:",
        movimientosError
      );

    } else {

      movimientos =
        (
          movimientosData || []
        ).map(
          movimientoDesdeSupabase
        );
    }


    /*
     * Guardamos una copia local
     * para respaldo.
     */

    guardarDatosLocal();


  } catch (error) {

    console.error(
      "Error cargando datos desde Supabase:",
      error
    );
  }
}


/* =========================================================
   CARGAR DATOS GENERAL
   ========================================================= */

async function cargarDatos() {

  if (!usuario) return;


  /*
   * Primero cargamos una copia local
   * para que la interfaz no quede vacía
   * mientras consultamos Supabase.
   */

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


  if (
    !Array.isArray(
      distribucion
    )
  ) {

    distribucion =
      crearCategoriasDefault();
  }


  /*
   * Migramos datos locales solamente
   * cuando existan.
   */

  await migrarDatosLocalesASupabase();


  /*
   * Después Supabase pasa a ser
   * la fuente principal.
   */

  await cargarDatosSupabase();


  construirCategorias();
}


/* =========================================================
   CATEGORÍAS INTERNAS
   ========================================================= */

function construirCategorias() {

  categorias = {};


  distribucion
    .filter(
      x =>
        x.activo !== false
    )
    .forEach(
      x => {

        categorias[x.id] = [

          x.icono ||
          "📦",

          x.nombre,

          Number(
            x.limite
          ) || 0

        ];

      }
    );
}


/* =========================================================
   GUARDAR MOVIMIENTO EN SUPABASE
   ========================================================= */

async function guardarMovimientoSupabase(m) {

  if (!usuario) return false;


  const fila =
    movimientoASupabase(m);


  const {
    data,
    error
  } =
    await supabaseClient
      .from("movimientos")
      .upsert(
        fila,
        {
          onConflict:
            "id"
        }
      )
      .select()
      .single();


  if (error) {

    console.error(
      "Error guardando movimiento:",
      error
    );

    alert(
      "No se pudo guardar el movimiento en la nube. El dato queda en el respaldo local."
    );

    return false;
  }


  /*
   * Guardamos el UUID real devuelto
   * por Supabase.
   */

  const convertido =
    movimientoDesdeSupabase(
      data
    );


  const indice =
    movimientos.findIndex(
      x =>
        x.id === m.id
    );


  if (
    indice >= 0
  ) {

    movimientos[indice] =
      convertido;
  }


  guardarMovimientosLocal();

  return true;
}


/* =========================================================
   ACTUALIZAR MOVIMIENTO EN SUPABASE
   ========================================================= */

async function actualizarMovimientoSupabase(m) {

  if (!usuario) return false;


  const fila =
    movimientoASupabase(m);


  const {
    data,
    error
  } =
    await supabaseClient
      .from("movimientos")
      .update(
        fila
      )
      .eq(
        "id",
        m.id
      )
      .eq(
        "user_id",
        usuario.id
      )
      .select()
      .single();


  if (error) {

    console.error(
      "Error actualizando movimiento:",
      error
    );

    alert(
      "No se pudo actualizar el movimiento en Supabase."
    );

    return false;
  }


  const convertido =
    movimientoDesdeSupabase(
      data
    );


  const indice =
    movimientos.findIndex(
      x =>
        x.id === m.id
    );


  if (
    indice >= 0
  ) {

    movimientos[indice] =
      convertido;
  }


  guardarMovimientosLocal();

  return true;
}


/* =========================================================
   ELIMINAR MOVIMIENTO SUPABASE
   ========================================================= */

async function eliminarMovimientoSupabase(id) {

  if (!usuario) return false;


  const {
    error
  } =
    await supabaseClient
      .from("movimientos")
      .delete()
      .eq(
        "id",
        id
      )
      .eq(
        "user_id",
        usuario.id
      );


  if (error) {

    console.error(
      "Error eliminando movimiento:",
      error
    );

    alert(
      "No se pudo eliminar el movimiento de Supabase."
    );

    return false;
  }


  return true;
}


/* =========================================================
   GUARDAR GASTO FIJO SUPABASE
   ========================================================= */

async function guardarFijoSupabase(g) {

  if (!usuario) return false;


  const fila =
    fijoASupabase(g);


  const {
    data,
    error
  } =
    await supabaseClient
      .from("gastos_fijos")
      .upsert(
        fila,
        {
          onConflict:
            "id"
        }
      )
      .select()
      .single();


  if (error) {

    console.error(
      "Error guardando gasto fijo:",
      error
    );

    alert(
      "No se pudo guardar el gasto fijo en Supabase."
    );

    return false;
  }


  const convertido =
    fijoDesdeSupabase(
      data
    );


  const indice =
    gastosFijos.findIndex(
      x =>
        x.id === g.id
    );


  if (
    indice >= 0
  ) {

    gastosFijos[indice] =
      convertido;

  } else {

    gastosFijos.push(
      convertido
    );
  }


  guardarFijosLocal();

  return true;
}


/* =========================================================
   ACTUALIZAR GASTO FIJO SUPABASE
   ========================================================= */

async function actualizarFijoSupabase(g) {

  if (!usuario) return false;


  const fila =
    fijoASupabase(g);


  const {
    data,
    error
  } =
    await supabaseClient
      .from("gastos_fijos")
      .update(
        fila
      )
      .eq(
        "id",
        g.id
      )
      .eq(
        "user_id",
        usuario.id
      )
      .select()
      .single();


  if (error) {

    console.error(
      "Error actualizando gasto fijo:",
      error
    );

    alert(
      "No se pudo actualizar el gasto fijo."
    );

    return false;
  }


  const convertido =
    fijoDesdeSupabase(
      data
    );


  const indice =
    gastosFijos.findIndex(
      x =>
        x.id === g.id
    );


  if (
    indice >= 0
  ) {

    gastosFijos[indice] =
      convertido;
  }


  guardarFijosLocal();

  return true;
}


/* =========================================================
   ELIMINAR / DESACTIVAR GASTO FIJO
   ========================================================= */

async function desactivarFijoSupabase(id) {

  if (!usuario) return false;


  const {
    error
  } =
    await supabaseClient
      .from("gastos_fijos")
      .update({
        activo: false
      })
      .eq(
        "id",
        id
      )
      .eq(
        "user_id",
        usuario.id
      );


  if (error) {

    console.error(
      "Error desactivando gasto fijo:",
      error
    );

    alert(
      "No se pudo desactivar el gasto fijo."
    );

    return false;
  }


  return true;
}


/* =========================================================
   GUARDAR CATEGORÍA SUPABASE
   ========================================================= */

async function guardarCategoriaSupabase(c) {

  if (!usuario) return false;


  const fila =
    categoriaASupabase(c);


  const {
    data,
    error
  } =
    await supabaseClient
      .from("categorias")
      .upsert(
        fila,
        {
          onConflict:
            "id"
        }
      )
      .select()
      .single();


  if (error) {

    console.error(
      "Error guardando categoría:",
      error
    );

    alert(
      "No se pudo guardar el área en Supabase."
    );

    return false;
  }


  const convertido =
    categoriaDesdeSupabase(
      data
    );


  const indice =
    distribucion.findIndex(
      x =>
        x.id === c.id
    );


  if (
    indice >= 0
  ) {

    distribucion[indice] =
      convertido;

  } else {

    distribucion.push(
      convertido
    );
  }


  construirCategorias();

  guardarDistribucionLocal();

  return true;
}


/* =========================================================
   DESACTIVAR CATEGORÍA
   ========================================================= */

async function desactivarCategoriaSupabase(id) {

  if (!usuario) return false;


  const {
    error
  } =
    await supabaseClient
      .from("categorias")
      .update({
        activo: false
      })
      .eq(
        "id",
        id
      )
      .eq(
        "user_id",
        usuario.id
      );


  if (error) {

    console.error(
      "Error eliminando categoría:",
      error
    );

    alert(
      "No se pudo eliminar el área."
    );

    return false;
  }


  return true;
}


/* =========================================================
   GUARDAR TODOS LOS DATOS
   ========================================================= */

async function guardarDatos() {

  if (!usuario) return;


  guardarDatosLocal();


  /*
   * No hacemos una sincronización masiva
   * automáticamente en cada render.
   *
   * Los cambios individuales se envían
   * a Supabase en sus respectivas funciones.
   */
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

    $("fijoId")
      .value = "";

  } catch {}


  try {

    $("tipoSalida")
      .value =
      "gasto";

    $("tipoSalida")
      .dispatchEvent(
        new Event("change")
      );

  } catch {}
}


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
    (
      error
        ? " error"
        : ""
    );
}


/* =========================================================
   MOSTRAR APP
   ========================================================= */

async function mostrarApp() {

  $("pantallaAuth")
    .style.display =
    "none";


  if (
    $("formularioNuevaPassword")
  ) {

    $("formularioNuevaPassword")
      .style.display =
      "none";
  }


  $("app")
    .style.display =
    "block";


  $("usuarioActual")
    .textContent =
    `Cuenta: ${usuario.nombre} · ${usuario.correo}`;


  cerrarPaneles();

  establecerFechasHoy();

  render();


  /*
   * Ahora cargamos desde Supabase.
   */

  await cargarDatos();


  render();
}


/* =========================================================
   CERRAR SESIÓN
   ========================================================= */

async function cerrarSesion() {

  try {

    await supabaseClient
      .auth
      .signOut();

  } catch (error) {

    console.error(
      "Error cerrando sesión:",
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


  if (
    $("formularioNuevaPassword")
  ) {

    $("formularioNuevaPassword")
      .style.display =
      "none";
  }


  $("app")
    .style.display =
    "none";


  $("pantallaAuth")
    .style.display =
    "flex";


  $("formLogin")
    .reset();


  $("loginMensaje")
    .textContent =
    "";


  $("tabLogin")
    .click();
}


$("botonCerrarSesion")
  .onclick =
  cerrarSesion;


/* =========================================================
   LOGIN / REGISTRO
   ========================================================= */

$("tabLogin")
  .onclick =
  () => {

    $("tabLogin")
      .classList.add(
        "activo"
      );

    $("tabRegistro")
      .classList.remove(
        "activo"
      );

    $("formLogin")
      .style.display =
      "block";

    $("formRegistro")
      .style.display =
      "none";

    $("formRecuperarPassword")
      .style.display =
      "none";
  };


$("tabRegistro")
  .onclick =
  () => {

    $("tabRegistro")
      .classList.add(
        "activo"
      );

    $("tabLogin")
      .classList.remove(
        "activo"
      );

    $("formRegistro")
      .style.display =
      "block";

    $("formLogin")
      .style.display =
      "none";

    $("formRecuperarPassword")
      .style.display =
      "none";
  };


/* =========================================================
   REGISTRO
   ========================================================= */

$("formRegistro")
  .onsubmit =
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
      await supabaseClient
        .auth
        .signUp({

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


    if (!data?.user) {

      return mensaje(
        "registroMensaje",
        "No se pudo crear la cuenta.",
        true
      );
    }


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
        data.user
          .user_metadata
          ?.nombre ||
        nombre,

      correo:
        data.user.email ||
        correo

    };


    localStorage.setItem(
      SESSION_KEY,
      data.user.id
    );


    await mostrarApp();
  };


/* =========================================================
   LOGIN
   ========================================================= */

$("formLogin")
  .onsubmit =
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


    $("loginMensaje")
      .textContent =
      "";


    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .signInWithPassword({

          email:
            correo,

          password

        });


    if (error) {

      console.error(
        "Error Supabase login:",
        error
      );


      if (
        error.code ===
        "email_not_confirmed"
      ) {

        return mensaje(
          "loginMensaje",
          "Tu correo todavía no está confirmado.",
          true
        );
      }


      return mensaje(
        "loginMensaje",
        error.message ||
        "No se pudo iniciar sesión.",
        true
      );
    }


    if (!data?.user) {

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
        data.user
          .user_metadata
          ?.nombre ||
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


    await mostrarApp();
  };


/* =========================================================
   RECUPERAR CONTRASEÑA
   ========================================================= */

function mostrarRecuperacion() {

  $("formLogin")
    .style.display =
    "none";

  $("formRegistro")
    .style.display =
    "none";

  $("formRecuperarPassword")
    .style.display =
    "block";

  $("tabLogin")
    .classList.remove(
      "activo"
    );

  $("tabRegistro")
    .classList.remove(
      "activo"
    );

  $("recuperarCorreo")
    .value =
    $("loginCorreo")
      .value
      .trim()
      .toLowerCase();

  $("recuperarCorreo")
    .focus();
}


function volverLogin() {

  $("formRecuperarPassword")
    .style.display =
    "none";

  $("formLogin")
    .style.display =
    "block";

  $("formRegistro")
    .style.display =
    "none";

  $("tabLogin")
    .classList.add(
      "activo"
    );

  $("tabRegistro")
    .classList.remove(
      "activo"
    );

  $("recuperarMensaje")
    .textContent =
    "";
}


$("botonRecuperarPassword")
  .onclick =
  mostrarRecuperacion;


$("volverLoginDesdeRecuperacion")
  .onclick =
  volverLogin;


$("formRecuperarPassword")
  .onsubmit =
  async e => {

    e.preventDefault();


    const correo =
      $("recuperarCorreo")
        .value
        .trim()
        .toLowerCase();


    if (!correo) {

      return mensaje(
        "recuperarMensaje",
        "Escribe tu correo.",
        true
      );
    }


    const redirectTo =
      `${window.location.origin}${window.location.pathname}`;


    const {
      error
    } =
      await supabaseClient
        .auth
        .resetPasswordForEmail(
          correo,
          {
            redirectTo
          }
        );


    if (error) {

      console.error(
        "Error recuperación contraseña:",
        error
      );

      return mensaje(
        "recuperarMensaje",
        "No se pudo enviar el enlace de recuperación.",
        true
      );
    }


    mensaje(
      "recuperarMensaje",
      "Si el correo existe, recibirás un enlace para cambiar tu contraseña."
    );
  };


/* =========================================================
   NUEVA CONTRASEÑA
   ========================================================= */

function mostrarNuevaPassword() {

  $("pantallaAuth")
    .style.display =
    "none";


  $("app")
    .style.display =
    "block";


  document
    .querySelectorAll(
      "#app > *"
    )
    .forEach(
      el => {

        if (
          el.id !==
          "formularioNuevaPassword"
        ) {

          el.style.display =
            "none";
        }

      }
    );


  $("formularioNuevaPassword")
    .style.display =
    "block";


  $("formularioNuevaPassword")
    .scrollIntoView({
      behavior:
        "smooth",
      block:
        "start"
    });
}


$("formNuevaPassword")
  .onsubmit =
  async e => {

    e.preventDefault();


    const p1 =
      $("nuevaPassword")
        .value;


    const p2 =
      $("nuevaPassword2")
        .value;


    if (p1.length < 6) {

      return mensaje(
        "nuevaPasswordMensaje",
        "La contraseña debe tener al menos 6 caracteres.",
        true
      );
    }


    if (p1 !== p2) {

      return mensaje(
        "nuevaPasswordMensaje",
        "Las contraseñas no coinciden.",
        true
      );
    }


    const {
      error
    } =
      await supabaseClient
        .auth
        .updateUser({

          password:
            p1

        });


    if (error) {

      console.error(
        "Error cambiando contraseña:",
        error
      );

      return mensaje(
        "nuevaPasswordMensaje",
        "No se pudo actualizar la contraseña.",
        true
      );
    }


    mensaje(
      "nuevaPasswordMensaje",
      "Contraseña actualizada correctamente."
    );


    setTimeout(
      async () => {

        await supabaseClient
          .auth
          .signOut();


        $("formularioNuevaPassword")
          .style.display =
          "none";


        $("pantallaAuth")
          .style.display =
          "flex";


        $("app")
          .style.display =
          "none";


        $("tabLogin")
          .click();

      },
      1200
    );
  };


/* =========================================================
   TOTALES
   ========================================================= */

function obtenerTotales() {

  const ing =
    movimientos
      .filter(
        m =>
          m.tipo ===
          "ingreso"
      )
      .reduce(
        (s, m) =>
          s +
          Number(
            m.monto || 0
          ),
        0
      );


  const gas =
    movimientos
      .filter(
        m =>
          m.tipo ===
          "gasto"
      )
      .reduce(
        (s, m) =>
          s +
          Number(
            m.monto || 0
          ),
        0
      );


  const aportes =
    movimientos
      .filter(
        m =>
          m.tipo ===
          "ahorro"
      )
      .reduce(
        (s, m) =>
          s +
          Number(
            m.monto || 0
          ),
        0
      );


  const retiros =
    movimientos
      .filter(
        m =>
          m.tipo ===
          "retiro_ahorro"
      )
      .reduce(
        (s, m) =>
          s +
          Number(
            m.monto || 0
          ),
        0
      );


  return {

    ing,

    gas,

    ahorro:
      Math.max(
        aportes -
        retiros,
        0
      ),

    disponible:
      ing -
      gas

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


  grid.innerHTML = "";


  distribucion
    .filter(
      x =>
        x.activo !==
        false
    )
    .forEach(
      c => {

        const gastos =
          movimientos
            .filter(
              m =>
                m.tipo ===
                  "gasto" &&
                m.categoria ===
                  c.id
            )
            .reduce(
              (s, m) =>
                s +
                Number(
                  m.monto || 0
                ),
              0
            );


        const lim =
          Number(
            c.limite
          ) || 0;


        const pct =
          lim
            ? Math.min(
                gastos /
                  lim *
                  100,
                100
              )
            : 0;


        const ms =
          movimientos
            .filter(
              m =>
                m.tipo ===
                  "gasto" &&
                m.categoria ===
                  c.id
            )
            .sort(
              (a, b) =>
                parseFechaLocal(
                  b.fecha
                ) -
                parseFechaLocal(
                  a.fecha
                )
            )
            .slice(
              0,
              3
            );


        const div =
          document.createElement(
            "article"
          );


        div.className =
          "categoria-card";


        div.innerHTML = `

          <div class="categoria-icono">
            ${escapeHtml(
              c.icono ||
              "📦"
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


        grid.appendChild(
          div
        );
      }
    );
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
          x.tipo ===
            "gasto" &&
          x.origenFijo ===
            g.id
      )
      .filter(
        x => {

          const d =
            parseFechaLocal(
              x.fecha
            );

          return (
            d.getFullYear() ===
              y &&
            d.getMonth() ===
              m
          );
        }
      );


  const pagado =
    pagos.reduce(
      (s, x) =>
        s +
        Number(
          x.monto || 0
        ),
      0
    );


  const objetivo =
    Number(
      g.monto
    ) || 0;


  const pendiente =
    Math.max(
      objetivo -
      pagado,
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
        Number(
          g.dia
        ) || 1,
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
    pagado >=
      objetivo &&
    objetivo > 0;


  let estado;


  if (completa) {

    estado =
      "pagado";

  } else if (
    new Date() >
    venc
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
    Math.abs(diff) <=
    10
  ) {

    if (
      diff < 0
    ) {

      return `Pagado ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? "s" : ""} antes`;
    }


    if (
      diff === 0
    ) {

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
    estado ===
    "pagado"
  ) {

    return "pagado";
  }


  if (
    estado ===
      "vencido" ||
    estado ===
      "parcial-atrasado"
  ) {

    return "atrasado";
  }


  if (
    estado ===
    "parcial"
  ) {

    return "parcial";
  }


  return "pendiente";
}


function obtenerTextoEstadoFijo(
  estado
) {

  return {

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

  }[estado] ||
  "Pendiente";
}


function renderGastosFijos() {

  const box =
    $("listaGastosFijos");

  if (!box) return;


  const activos =
    gastosFijos.filter(
      g =>
        g.activo !==
        false
    );


  if (!activos.length) {

    box.innerHTML = `

      <div class="historial-vacio">

        <span>
          📌
        </span>

        No hay gastos fijos registrados.

      </div>

    `;

    return;
  }


  box.innerHTML =
    activos
      .map(
        g => {

          const p =
            getFixedProgress(g);


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
                  .slice(
                    0,
                    3
                  )
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
              class="fijo-item ${obtenerClaseFijo(
                p.estado
              )}"
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
                  ·
                  ${money(g.monto)}
                </small>

                <div class="barra">

                  <div
                    class="progreso"
                    style="width:${p.pct}%"
                  ></div>

                </div>

                <small>

                  ${money(
                    p.pagado
                  )}
                  /
                  ${money(
                    p.objetivo
                  )}

                  · Pendiente
                  ${money(
                    p.pendiente
                  )}

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
        }
      )
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
            x.activo !==
            false
        )
        .map(
          c => `

            <option
              value="${escapeHtml(
                c.id
              )}"
            >
              ${escapeHtml(
                c.icono ||
                "📦"
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
            x.activo !==
            false
        )
        .map(
          c => `

            <option
              value="${escapeHtml(
                c.id
              )}"
            >
              ${escapeHtml(
                c.icono ||
                "📦"
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
            x.activo !==
            false
        )
        .map(
          g => `

            <option
              value="${escapeHtml(
                g.id
              )}"
            >
              ${escapeHtml(
                g.nombre
              )}
              —
              ${money(
                g.monto
              )}
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
          parseFechaLocal(
            b.fecha
          ) -
          parseFechaLocal(
            a.fecha
          )
      )
      .slice(
        0,
        3
      );


  recientes.innerHTML =
    ultimos.length

      ? ultimos
          .map(
            renderMovimiento
          )
          .join("")

      : `

          <div class="historial-vacio">

            <span>
              📋
            </span>

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


  if (
    cat !==
    "todas"
  ) {

    arr =
      arr.filter(
        m =>
          m.categoria ===
            cat ||
          m.tipo ===
            cat
      );
  }


  if (
    tipo !==
    "todos"
  ) {

    arr =
      arr.filter(
        m =>
          m.tipo ===
          tipo
      );
  }


  const now =
    new Date();


  if (
    periodo ===
    "semana"
  ) {

    arr =
      arr.filter(
        m => {

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
            diff >=
              0 &&
            diff <=
              7
          );
        }
      );
  }


  if (
    periodo ===
    "mes"
  ) {

    arr =
      arr.filter(
        m => {

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
        }
      );
  }


  if (
    periodo ===
    "dia"
  ) {

    arr =
      arr.filter(
        m =>
          fechaISO(
            m.fecha
          ) ===
          hoyISO()
      );
  }


  if (desde) {

    arr =
      arr.filter(
        m =>
          fechaISO(
            m.fecha
          ) >=
          desde
      );
  }


  if (hasta) {

    arr =
      arr.filter(
        m =>
          fechaISO(
            m.fecha
          ) <=
          hasta
      );
  }


  arr.sort(
    (a, b) =>
      parseFechaLocal(
        b.fecha
      ) -
      parseFechaLocal(
        a.fecha
      )
  );


  const listaCompleta =
    arr.slice();


  if (!completo) {

    arr =
      arr.slice(
        0,
        3
      );
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

            <span>
              📋
            </span>

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

function renderMovimiento(
  m
) {

  const esIngreso =
    m.tipo ===
    "ingreso";


  const esAhorro =
    m.tipo ===
    "ahorro";


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

  construirCategorias();

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

function mostrar(
  id
) {

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
    behavior:
      "smooth",
    block:
      "start"
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
      new Event(
        "change"
      )
    );
}


function establecerFechasHoy() {

  const hoy =
    hoyISO();


  if (
    $("fechaIngreso")
  ) {

    $("fechaIngreso")
      .value =
      hoy;
  }


  if (
    $("fechaGasto")
  ) {

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
        e.key ===
          "Enter" ||
        e.key ===
          " "
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
        new Event(
          "change"
        )
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
        new Event(
          "change"
        )
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


$("formIngreso")
  .onsubmit =
  async e => {

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


    const movimiento = {

      id:
        nuevoUUID(),

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

    };


    movimientos.push(
      movimiento
    );


    guardarMovimientosLocal();


    const ok =
      await guardarMovimientoSupabase(
        movimiento
      );


    if (!ok) {

      movimientos =
        movimientos.filter(
          m =>
            m.id !==
            movimiento.id
        );

      guardarMovimientosLocal();

      return;
    }


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


$("tipoSalida")
  .onchange =
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


$("formGasto")
  .onsubmit =
  async e => {

    e.preventDefault();


    const tipo =
      $("tipoSalida")
        .value;


    const monto =
      Number(
        $("monto")
          .value
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
      tipo ===
        "gasto" &&
      !$("categoria")
        .value &&
      !$("gastoFijoSeleccion")
        .value
    ) {

      return alert(
        "Selecciona una categoría."
      );
    }


    let movimiento;


    if (
      tipo ===
        "gasto" &&
      $("gastoFijoSeleccion")
        .value
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


      movimiento = {

        id:
          nuevoUUID(),

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
          g?.id ||
          null

      };

    } else if (
      tipo ===
      "gasto"
    ) {

      movimiento = {

        id:
          nuevoUUID(),

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

        fecha,

        origenFijo:
          null

      };

    } else if (
      tipo ===
      "ahorro"
    ) {

      movimiento = {

        id:
          nuevoUUID(),

        tipo:
          "ahorro",

        categoria:
          "ahorro",

        monto,

        descripcion:
          $("descripcion")
            .value
            .trim(),

        fecha,

        origenFijo:
          null

      };

    } else {

      const saldo =
        obtenerTotales()
          .ahorro;


      if (
        monto >
        saldo
      ) {

        return alert(
          `No puedes retirar ${money(
            monto
          )} porque tu ahorro disponible es ${money(
            saldo
          )}.`
        );
      }


      movimiento = {

        id:
          nuevoUUID(),

        tipo:
          "retiro_ahorro",

        categoria:
          "retiro_ahorro",

        monto,

        descripcion:
          $("descripcion")
            .value
            .trim(),

        fecha,

        origenFijo:
          null

      };
    }


    movimientos.push(
      movimiento
    );


    guardarMovimientosLocal();


    const ok =
      await guardarMovimientoSupabase(
        movimiento
      );


    if (!ok) {

      movimientos =
        movimientos.filter(
          m =>
            m.id !==
            movimiento.id
        );

      guardarMovimientosLocal();

      return;
    }


    e.target.reset();


    cerrarFormGasto();


    render();


    establecerFechasHoy();
  };


/* =========================================================
   EDITAR / ELIMINAR MOVIMIENTOS
   ========================================================= */

window.eliminarMovimiento =
  async id => {

    if (
      !confirm(
        "¿Eliminar este movimiento?"
      )
    ) return;


    const anterior =
      movimientos.find(
        m =>
          m.id ===
          id
      );


    movimientos =
      movimientos.filter(
        m =>
          m.id !==
          id
      );


    guardarMovimientosLocal();


    const ok =
      await eliminarMovimientoSupabase(
        id
      );


    if (!ok) {

      if (anterior) {

        movimientos.push(
          anterior
        );
      }

      guardarMovimientosLocal();

      render();

      return;
    }


    render();
  };


window.editarMovimiento =
  id => {

    const m =
      movimientos.find(
        x =>
          x.id ===
          id
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
            c.activo !==
            false
        )
        .map(
          c => `

            <option
              value="${escapeHtml(
                c.id
              )}"
            >

              ${escapeHtml(
                c.icono ||
                "📦"
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
        behavior:
          "smooth",
        block:
          "start"
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


$("formEdicion")
  .onsubmit =
  async e => {

    e.preventDefault();


    const m =
      movimientos.find(
        x =>
          x.id ===
          $("editarId")
            .value
      );


    if (!m) return;


    const copia =
      {
        ...m
      };


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
      nuevoMonto <=
      0
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
          ? Number(
              m.monto
            )
          : 0;


      const ahorroDisponible =
        ahorroActual +
        retiroAnterior;


      if (
        nuevoMonto >
        ahorroDisponible
      ) {

        return alert(
          "No puedes guardar este retiro. Tu ahorro disponible sería insuficiente."
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
      (
        nuevoTipo === "gasto"
          ? nuevaCategoria
          : nuevoTipo === "ahorro"
            ? "ahorro"
            : "retiro_ahorro"
      );


    if (
      nuevoTipo !==
      "gasto"
    ) {

      m.origenFijo =
        null;

      m.tipoGasto =
        null;

    } else {

      /*
       * Al editar conservamos el
       * gasto fijo existente.
       */
      m.origenFijo =
        copia.origenFijo ||
        null;

      m.tipoGasto =
        copia.tipoGasto ||
        "variable";
    }


    guardarMovimientosLocal();


    const ok =
      await actualizarMovimientoSupabase(
        m
      );


    if (!ok) {

      Object.assign(
        m,
        copia
      );

      guardarMovimientosLocal();

      render();

      return;
    }


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
          x.id ===
          id
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
        behavior:
          "smooth",
        block:
          "start"
      });
  };


$("formGastoFijo")
  .onsubmit =
  async e => {

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


    let gasto;


    if (id) {

      const existente =
        gastosFijos.find(
          x =>
            x.id ===
            id
        );


      if (!existente) return;


      gasto = {

        ...existente,

        nombre,

        monto,

        dia,

        activo:
          true

      };

    } else {

      gasto = {

        id:
          nuevoUUID(),

        nombre,

        monto,

        dia,

        activo:
          true,

        creado:
          new Date()
            .toISOString()

      };
    }


    const indice =
      gastosFijos.findIndex(
        x =>
          x.id ===
          gasto.id
      );


    if (
      indice >= 0
    ) {

      gastosFijos[indice] =
        gasto;

    } else {

      gastosFijos.push(
        gasto
      );
    }


    guardarFijosLocal();


    const ok =
      await guardarFijoSupabase(
        gasto
      );


    if (!ok) {

      if (
        indice >= 0
      ) {

        gastosFijos[indice] =
          gastosFijos[indice];

      } else {

        gastosFijos =
          gastosFijos.filter(
            x =>
              x.id !==
              gasto.id
          );
      }

      guardarFijosLocal();

      return;
    }


    resetFijoForm();


    $("formGastoFijo")
      .style.display =
      "none";


    actualizarSelects();

    render();
  };


window.desactivarFijo =
  async id => {

    const g =
      gastosFijos.find(
        x =>
          x.id ===
          id
      );


    if (
      !g ||
      !confirm(
        `¿Dejar de usar ${g.nombre} como gasto fijo? Sus pagos históricos se conservarán.`
      )
    ) return;


    const anterior =
      g.activo;


    g.activo =
      false;


    guardarFijosLocal();


    const ok =
      await desactivarFijoSupabase(
        id
      );


    if (!ok) {

      g.activo =
        anterior;

      guardarFijosLocal();

      render();

      return;
    }


    render();
  };


window.abrirPagoFijo =
  id => {

    $("tipoSalida")
      .value =
      "gasto";


    $("tipoSalida")
      .dispatchEvent(
        new Event(
          "change"
        )
      );


    actualizarSelects();


    $("gastoFijoSeleccion")
      .value =
      id;


    const g =
      gastosFijos.find(
        x =>
          x.id ===
          id
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
        "";


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
          c.activo !==
          false
      )
      .map(
        c => `

          <div
            class="distribucion-edit-row"
          >

            <span>
              ${escapeHtml(
                c.icono ||
                "📦"
              )}

              ${escapeHtml(
                c.nombre
              )}

            </span>


            <input
              type="number"
              min="0"
              step="0.01"
              value="${
                Number(
                  c.limite
                ) || 0
              }"
              data-id="${escapeHtml(
                c.id
              )}"
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
  async id => {

    const c =
      distribucion.find(
        x =>
          x.id ===
          id
      );

    if (!c) return;


    const n =
      prompt(
        "Nombre del área:",
        c.nombre
      );


    if (
      n ===
      null
    ) return;


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


    if (
      i ===
      null
    ) return;


    const anterior =
      {
        ...c
      };


    c.nombre =
      nombre;


    c.icono =
      i.trim() ||
      c.icono ||
      "📦";


    guardarDistribucionLocal();


    const ok =
      await guardarCategoriaSupabase(
        c
      );


    if (!ok) {

      Object.assign(
        c,
        anterior
      );

      guardarDistribucionLocal();

      renderEditorDistribucion();

      return;
    }


    construirCategorias();

    renderEditorDistribucion();

    render();
  };


window.eliminarArea =
  async id => {

    if (
      distribucion
        .filter(
          x =>
            x.activo !==
            false
        )
        .length <=
      1
    ) {

      return alert(
        "Debes conservar al menos un área."
      );
    }


    const c =
      distribucion.find(
        x =>
          x.id ===
          id
      );


    if (
      !c ||
      !confirm(
        `¿Eliminar ${c.nombre} de la distribución? Sus movimientos históricos se conservarán.`
      )
    ) return;


    const anterior =
      c.activo;


    c.activo =
      false;


    guardarDistribucionLocal();


    const ok =
      await desactivarCategoriaSupabase(
        id
      );


    if (!ok) {

      c.activo =
        anterior;

      guardarDistribucionLocal();

      renderEditorDistribucion();

      return;
    }


    construirCategorias();

    renderEditorDistribucion();

    render();
  };


$("formNuevaArea")
  .onsubmit =
  async e => {

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


    if (
      distribucion.some(
        c =>
          c.activo !==
            false &&
          c.nombre
            .trim()
            .toLowerCase() ===
          nombre
            .toLowerCase()
      )
    ) {

      return alert(
        "Ya existe un área con ese nombre."
      );
    }


    const nueva = {

      id:
        nuevoUUID(),

      nombre,

      icono,

      limite,

      activo:
        true

    };


    distribucion.push(
      nueva
    );


    guardarDistribucionLocal();


    const ok =
      await guardarCategoriaSupabase(
        nueva
      );


    if (!ok) {

      distribucion =
        distribucion.filter(
          x =>
            x.id !==
            nueva.id
        );

      guardarDistribucionLocal();

      return;
    }


    e.target.reset();


    construirCategorias();

    renderEditorDistribucion();

    render();
  };


$("guardarLimitesDistribucion")
  .onclick =
  async () => {

    const cambios = [];


    document
      .querySelectorAll(
        "#listaDistribucionEditar input[data-id]"
      )
      .forEach(
        i => {

          const c =
            distribucion.find(
              x =>
                x.id ===
                i.dataset.id
            );


          if (c) {

            c.limite =
              Math.max(
                Number(
                  i.value
                ) || 0,
                0
              );

            cambios.push(
              c
            );
          }

        }
      );


    guardarDistribucionLocal();


    for (
      const c
      of cambios
    ) {

      await guardarCategoriaSupabase(
        c
      );
    }


    $("modalDistribucion")
      .style.display =
      "none";


    render();
  };


/* =========================================================
   FILTROS / HISTORIAL
   ========================================================= */

$("filtroCategoria")
  .onchange =
  () =>
    renderHistorial(
      true
    );


$("filtroTipo")
  .onchange =
  () =>
    renderHistorial(
      true
    );


$("filtroPeriodo")
  .onchange =
  () =>
    renderHistorial(
      true
    );


$("filtroDesde")
  .onchange =
  () =>
    renderHistorial(
      true
    );


$("filtroHasta")
  .onchange =
  () =>
    renderHistorial(
      true
    );


$("gestionarMovimientos")
  .onclick =
  () => {

    renderHistorial(
      true
    );


    $("seccionHistorial")
      .style.display =
      "block";


    $("seccionHistorial")
      .scrollIntoView({
        behavior:
          "smooth",
        block:
          "start"
      });
  };


$("cerrarHistorial")
  .onclick =
  () => {

    $("seccionHistorial")
      .style.display =
      "none";
  };


/* =========================================================
   EXPORTAR
   ========================================================= */

function exportar(
  filtro
) {

  let arr =
    movimientos.slice();


  if (
    filtro ===
    "semana"
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
            diff >=
              0 &&
            diff <=
              7
          );
        }
      );
  }


  if (
    filtro ===
    "mes"
  ) {

    const n =
      new Date();


    arr =
      arr.filter(
        m => {

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
        }
      );
  }


  arr.sort(
    (a, b) =>
      parseFechaLocal(
        b.fecha
      ) -
      parseFechaLocal(
        a.fecha
      )
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

            Number(
              m.monto ||
              0
            ).toFixed(
              2
            ),

            m.descripcion,

            m.tipoGasto ||
            ""

          ]
            .map(
              x =>
                `"${String(
                  x ??
                  ""
                ).replaceAll(
                  '"',
                  '""'
                )}"`
            )
            .join(",")
      )
      .join("\n");


  const blob =
    new Blob(
      [
        "\ufeff" +
        encabezado +
        "\n" +
        filas
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


  document.body.appendChild(
    a
  );


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
      "Tu cuenta y tus datos financieros están protegidos por Supabase. Las personalizaciones financieras se realizan desde Distribución y Gastos Fijos."
    );


/* =========================================================
   SESIÓN SUPABASE
   ========================================================= */

async function iniciarAplicacion() {

  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .getSession();


    if (error) {

      console.error(
        "Error obteniendo sesión Supabase:",
        error
      );
    }


    const session =
      data?.session;


    if (
      session?.user
    ) {

      const authUser =
        session.user;


      usuario = {

        id:
          authUser.id,

        nombre:
          authUser
            .user_metadata
            ?.nombre ||
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


      await mostrarApp();


      return;
    }

  } catch (error) {

    console.error(
      "No se pudo consultar Supabase Auth:",
      error
    );
  }


  $("pantallaAuth")
    .style.display =
    "flex";


  $("app")
    .style.display =
    "none";
}


/* =========================================================
   CAMBIOS DE SESIÓN
   ========================================================= */

supabaseClient
  .auth
  .onAuthStateChange(
    async (
      event,
      session
    ) => {

      if (
        event ===
        "PASSWORD_RECOVERY"
      ) {

        mostrarNuevaPassword();

        return;
      }


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
            authUser
              .user_metadata
              ?.nombre ||
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


        await mostrarApp();
      }

    }
  );


/* =========================================================
   INICIO
   ========================================================= */

$("tipoSalida")
  .dispatchEvent(
    new Event(
      "change"
    )
  );


if (
  $("seccionHistorial")
) {

  $("seccionHistorial")
    .style.display =
    "none";
}


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
