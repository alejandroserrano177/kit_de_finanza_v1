const $=id=>document.getElementById(id);
const money=n=>"$"+Number(n||0).toFixed(2);
const USERS_KEY="kf_usuarios_v2", SESSION_KEY="kf_sesion_v2";
const DEFAULT_CATEGORIAS={
  alimentacion:["🍽️","Alimentación",150], vivienda:["🏠","Vivienda",150], transporte:["🚌","Transporte",100],
  comunicaciones:["📱","Comunicaciones",50], familia:["❤️","Familia",100], educacion:["🎓","Educación",75],
  inversion:["📈","Inversión",100], otros:["📦","Otros",75]
};
let usuario=null, movimientos=[], gastosFijos=[], categorias={}, distribucion=[];

async function hashPassword(password){const data=new TextEncoder().encode(password);const hash=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function leerLocal(key,fallback=null){
  try{const v=localStorage.getItem(key);return v===null?fallback:JSON.parse(v)}
  catch{return fallback}
}
function escribirLocal(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}
}
function usuarios(){return leerLocal(USERS_KEY,[])}
function guardarUsuarios(lista){return escribirLocal(USERS_KEY,lista)}
function userKey(s){return `kf_${usuario.id}_${s}`}
function hoyISO(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function fechaTexto(v){if(!v)return "";const d=new Date(v.includes("T")?v:v+"T12:00:00");return d.toLocaleDateString("es-EC")}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function cargarDatos(){
  try{
    movimientos=leerLocal(userKey("movimientos"),[]);
    gastosFijos=leerLocal(userKey("fijos"),[]);
    distribucion=leerLocal(userKey("distribucion"),null)||Object.entries(DEFAULT_CATEGORIAS).map(([id,v])=>({id,nombre:v[1],icono:v[0],limite:v[2],activo:true}));
    categorias={};distribucion.filter(x=>x.activo!==false).forEach(x=>categorias[x.id]=[x.icono||"📦",x.nombre,Number(x.limite)||0]);
  }catch{movimientos=[];gastosFijos=[];distribucion=[];categorias={}}
  migrarEstructuras();
}
function migrarEstructuras(){
  gastosFijos=gastosFijos.map(g=>({...g,activo:g.activo!==false, creado:g.creado||new Date().toISOString()}));
  movimientos=movimientos.map(m=>({...m,fecha:m.fecha||new Date().toISOString(),id:m.id||crypto.randomUUID()}));
}
function guardarDatos(){
  if(!usuario)return;
  escribirLocal(userKey("movimientos"),movimientos);
  escribirLocal(userKey("fijos"),gastosFijos);
  escribirLocal(userKey("distribucion"),distribucion);
}
function migrarDatosAntiguos(){const legacy=localStorage.getItem("kf_movimientos");
if(legacy&&!localStorage.getItem(userKey("movimientos"))){
  try{localStorage.setItem(userKey("movimientos"),legacy);localStorage.removeItem("kf_movimientos")}catch{}
}}
function cerrarPaneles(){
  document.querySelectorAll(".formulario-panel").forEach(x=>x.style.display="none");
  ["formularioEdicion","modalDistribucion"].forEach(id=>{const el=$(id);if(el)el.style.display="none"});
  const fijo=$("formGastoFijo");if(fijo)fijo.style.display="none";
  try{$("formGasto").reset();$("formIngreso").reset();$("formEdicion").reset();}catch{}
  try{$("tipoSalida").value="gasto";$("tipoSalida").dispatchEvent(new Event("change"));}catch{}
}
function mostrarApp(){
  migrarDatosAntiguos();
  cargarDatos();
  $("pantallaAuth").style.display="none";
  $("app").style.display="block";
  $("usuarioActual").textContent=`Cuenta: ${usuario.nombre} · ${usuario.correo}`;
  cerrarPaneles();
  render();
}
function cerrarSesion(){
  guardarDatos();
  try{localStorage.removeItem(SESSION_KEY)}catch{}
  usuario=null;
  movimientos=[];gastosFijos=[];categorias={};distribucion=[];
  cerrarPaneles();
  $("app").style.display="none";
  $("pantallaAuth").style.display="flex";
  $("formLogin").reset();
  $("loginMensaje").textContent="";
  $("tabLogin").click();
}
function mensaje(id,texto,error=false){const el=$(id);el.textContent=texto;el.className="auth-mensaje"+(error?" error":"")}

$("tabLogin").onclick=()=>{$("tabLogin").classList.add("activo");$("tabRegistro").classList.remove("activo");$("formLogin").style.display="block";$("formRegistro").style.display="none"};
$("tabRegistro").onclick=()=>{$("tabRegistro").classList.add("activo");$("tabLogin").classList.remove("activo");$("formRegistro").style.display="block";$("formLogin").style.display="none"};
$("formRegistro").onsubmit=async e=>{e.preventDefault();const nombre=$("registroNombre").value.trim(),correo=$("registroCorreo").value.trim().toLowerCase(),p1=$("registroPassword").value,p2=$("registroPassword2").value;if(p1!==p2)return mensaje("registroMensaje","Las contraseñas no coinciden.",true);if(p1.length<6)return mensaje("registroMensaje","La contraseña debe tener al menos 6 caracteres.",true);const lista=usuarios();if(lista.some(u=>u.correo===correo))return mensaje("registroMensaje","Ese correo ya está registrado.",true);const nuevo={id:crypto.randomUUID(),nombre,correo,passwordHash:await hashPassword(p1),creado:new Date().toISOString()};lista.push(nuevo);guardarUsuarios(lista);usuario=nuevo;try{localStorage.setItem(SESSION_KEY,nuevo.id)}catch{};mostrarApp()};
$("formLogin").onsubmit=async e=>{e.preventDefault();const correo=$("loginCorreo").value.trim().toLowerCase(),hash=await hashPassword($("loginPassword").value),u=usuarios().find(x=>x.correo===correo&&x.passwordHash===hash);if(!u)return mensaje("loginMensaje","Correo o contraseña incorrectos.",true);usuario=u;try{localStorage.setItem(SESSION_KEY,u.id)}catch{};mostrarApp()};
$("botonCerrarSesion").onclick=cerrarSesion;

function obtenerTotales(){
  const ing=movimientos.filter(m=>m.tipo==="ingreso").reduce((s,m)=>s+Number(m.monto),0);
  const gas=movimientos.filter(m=>m.tipo==="gasto").reduce((s,m)=>s+Number(m.monto),0);
  const aportes=movimientos.filter(m=>m.tipo==="ahorro").reduce((s,m)=>s+Number(m.monto),0);
  const retiros=movimientos.filter(m=>m.tipo==="retiro_ahorro").reduce((s,m)=>s+Number(m.monto),0);
  return {ing,gas,ahorro:aportes-retiros,disponible:ing-gas};
}
function renderResumen(){const {ing,gas,ahorro,disponible}=obtenerTotales();$("totalIngresos").textContent=money(ing);$("totalGastos").textContent=money(gas);$("totalBalance").textContent=money(disponible);$("totalAhorro").textContent=money(ahorro);$("totalBalance").style.color=disponible<0?"var(--rojo)":"var(--principal)";$("balanceIngresos").textContent=money(ing);$("balanceGastos").textContent=money(gas);$("balanceAhorro").textContent=money(ahorro);$("balanceDisponible").textContent=money(disponible);$("balanceDisponible").style.color=disponible<0?"var(--rojo)":"var(--principal)"}
function renderCategorias(){const grid=$("gridCategorias");grid.innerHTML="";distribucion.filter(x=>x.activo!==false).forEach(c=>{const gastos=movimientos.filter(m=>m.tipo==="gasto"&&m.categoria===c.id).reduce((s,m)=>s+Number(m.monto),0),lim=Number(c.limite)||0,pct=lim?Math.min(gastos/lim*100,100):0;const ms=movimientos.filter(m=>m.tipo==="gasto"&&m.categoria===c.id).slice(-3).reverse();const div=document.createElement("article");div.className="categoria-card";div.innerHTML=`<div class="categoria-icono">${escapeHtml(c.icono||"📦")}</div><div class="categoria-info"><h3>${escapeHtml(c.nombre)}</h3><p>${money(gastos)} / ${money(lim)}</p></div><div class="barra"><div class="progreso" style="width:${pct}%"></div></div><small>${Math.round(pct)}% utilizado</small><div class="movimientos">${ms.map(m=>`<div class="movimiento"><span>${escapeHtml(m.descripcion||c.nombre)}</span><span>${money(m.monto)}</span></div>`).join("")}</div>`;grid.appendChild(div)})}

function getFixedProgress(g,refDate=new Date()){
  const y=refDate.getFullYear(),m=refDate.getMonth();const pagos=movimientos.filter(x=>x.tipo==="gasto"&&x.origenFijo===g.id).filter(x=>{const d=new Date(x.fecha);return d.getFullYear()===y&&d.getMonth()===m});const pagado=pagos.reduce((s,x)=>s+Number(x.monto),0),objetivo=Number(g.monto)||0,pendiente=Math.max(objetivo-pagado,0),pct=objetivo?Math.min(pagado/objetivo*100,100):0;const venc=new Date(y,m,Math.min(Number(g.dia)||1,daysInMonth(y,m)),23,59,59);const completa=pagado>=objetivo&&objetivo>0;let estado=completa?"pagado":(new Date()>venc?"vencido":"pendiente");if(pagado>0&&!completa&&new Date()>venc)estado="parcial-atrasado";return {pagos,pagado,objetivo,pendiente,pct,venc,estado}}
function daysInMonth(y,m){return new Date(y,m+1,0).getDate()}
function estadoFechaPago(fecha,venc){const p=new Date(fecha+"T12:00:00"),v=new Date(venc);const diff=Math.round((p-v)/86400000);if(Math.abs(diff)<=10){if(diff<0)return `Pagado ${Math.abs(diff)} día${Math.abs(diff)!==1?"s":""} antes`;if(diff===0)return "Pagado a tiempo";return `Pagado ${diff} día${diff!==1?"s":""} tarde`}return fechaTexto(fecha)}
function renderGastosFijos(){const box=$("listaGastosFijos"),activos=gastosFijos.filter(g=>g.activo!==false);if(!activos.length){box.innerHTML=`<div class="historial-vacio"><span>📌</span>No hay gastos fijos registrados.</div>`;return}box.innerHTML=activos.map(g=>{const p=getFixedProgress(g),cl=p.estado==="pagado"?"pagado":(p.estado.includes("atrasado")||p.estado==="vencido"?"atrasado":"");const pagosInfo=p.pagos.length?p.pagos.slice().sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,3).map(x=>`<div class="fijo-pago">${fechaTexto(x.fecha)} · ${money(x.monto)} · ${estadoFechaPago(x.fecha,p.venc)}</div>`).join(""):"<div class=\"fijo-pago\">Sin pagos este mes</div>";return `<div class="fijo-item ${cl}"><div class="fijo-info"><strong>${escapeHtml(g.nombre)}</strong><small>Vence día ${g.dia} · ${money(g.monto)} · ${p.pagado>=p.objetivo?"Pagado":"Pendiente"}</small><div class="barra"><div class="progreso" style="width:${p.pct}%"></div></div><small>${money(p.pagado)} / ${money(p.objetivo)} · Pendiente ${money(p.pendiente)}</small><div class="fijo-pagos">${pagosInfo}</div></div><div class="fijo-acciones"><button class="boton-secundario boton-pequeno" onclick="abrirPagoFijo('${g.id}')">Registrar pago</button><button class="boton-secundario boton-pequeno" onclick="editarFijo('${g.id}')">Editar</button><button class="boton-eliminar" onclick="desactivarFijo('${g.id}')">✕</button></div></div>`}).join("")}

function actualizarSelects(){
  const cat=$("categoria");cat.innerHTML='<option value="">Selecciona una categoría</option>'+distribucion.filter(x=>x.activo!==false).map(c=>`<option value="${c.id}">${escapeHtml(c.icono||"📦")} ${escapeHtml(c.nombre)}</option>`).join("");
  const filtro=$("filtroCategoria");filtro.innerHTML='<option value="todas">Todas las categorías</option>'+distribucion.filter(x=>x.activo!==false).map(c=>`<option value="${c.id}">${escapeHtml(c.icono||"📦")} ${escapeHtml(c.nombre)}</option>`).join("")+`<option value="ahorro">💎 Aporte a ahorro</option><option value="retiro_ahorro">↩️ Retiro de ahorro</option>`;
  const fijo=$("gastoFijoSeleccion");fijo.innerHTML='<option value="">Selecciona un gasto fijo</option>'+gastosFijos.filter(x=>x.activo!==false).map(g=>`<option value="${g.id}">${escapeHtml(g.nombre)} — ${money(g.monto)}</option>`).join("");
}
function renderHistorial(completo=false){
  const cat=$("filtroCategoria").value,
        tipo=$("filtroTipo").value,
        periodo=$("filtroPeriodo").value,
        desde=$("filtroDesde").value,
        hasta=$("filtroHasta").value;

  let arr=movimientos.slice();

  if(cat!=="todas")
    arr=arr.filter(m=>m.categoria===cat||m.tipo===cat);

  if(tipo!=="todos")
    arr=arr.filter(m=>m.tipo===tipo);

  const now=new Date();

  if(periodo==="semana")
    arr=arr.filter(m=>{
      const d=new Date(m.fecha),diff=(now-d)/86400000;
      return diff>=0&&diff<7;
    });

  if(periodo==="mes")
    arr=arr.filter(m=>{
      const d=new Date(m.fecha);
      return d.getMonth()===now.getMonth()&&
             d.getFullYear()===now.getFullYear();
    });

  if(periodo==="dia")
    arr=arr.filter(m=>m.fecha.slice(0,10)===hoyISO());

  if(desde)
    arr=arr.filter(m=>m.fecha.slice(0,10)>=desde);

  if(hasta)
    arr=arr.filter(m=>m.fecha.slice(0,10)<=hasta);

  arr.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));

  const listaCompleta=arr;

  if(!completo){
    arr=arr.slice(0,3);
  }

  const box=$("historialMovimientos");

  box.innerHTML=arr.length
    ? arr.map(renderMovimiento).join("")
    : `<div class="historial-vacio">
        <span>📋</span>No hay movimientos con estos filtros.
      </div>`;

  $("contadorHistorial").textContent=
    `${listaCompleta.length} movimiento${listaCompleta.length===1?"":"s"}`;
}
function renderMovimiento(m){const esIngreso=m.tipo==="ingreso",esAhorro=m.tipo==="ahorro",esRetiro=m.tipo==="retiro_ahorro",cat=distribucion.find(c=>c.id===m.categoria),icon=esIngreso?"💰":esAhorro?"💎":esRetiro?"↩️":cat?.icono||"💸",nombre=esIngreso?"Ingreso":esAhorro?"Aporte a ahorro":esRetiro?"Retiro de ahorro":cat?.nombre||"Gasto";const signo=esIngreso?"+":esRetiro?"↩":"-";return `<div class="movimiento-historial"><div class="movimiento-principal"><div class="movimiento-icono">${icon}</div><div><strong>${escapeHtml(m.descripcion||nombre)}</strong><small>${escapeHtml(nombre)} · ${fechaTexto(m.fecha)}${m.origenFijo?" · Gasto fijo":""}</small></div></div><div class="movimiento-valor"><strong class="${esIngreso?"ingreso":esRetiro?"retiro":"gasto"}">${signo}${money(m.monto)}</strong><br><button class="boton-secundario boton-pequeno" onclick="editarMovimiento('${m.id}')">Editar</button> <button class="boton-eliminar" onclick="eliminarMovimiento('${m.id}')">✕</button></div></div>`}

function render(){actualizarSelects();renderResumen();renderCategorias();renderHistorial();renderGastosFijos();guardarDatos()}
function mostrar(id){document.querySelectorAll(".formulario-panel").forEach(x=>x.style.display="none");$(id).style.display="block";$(id).scrollIntoView({behavior:"smooth",block:"start"})}
function cerrarFormGasto(){$("formularioGasto").style.display="none";$("formGasto").reset();$("gastoFijoSeleccion").value="";$("tipoSalida").value="gasto";$("tipoSalida").dispatchEvent(new Event("change"))}
function activarTarjeta(id,accion){const el=$(id);el.onclick=accion;el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();accion()}}}
activarTarjeta("tarjetaIngresos",()=>mostrar("formularioIngreso"));
activarTarjeta("tarjetaGastos",()=>{$("tipoSalida").value="gasto";$('tipoSalida').dispatchEvent(new Event("change"));mostrar("formularioGasto")});
activarTarjeta("tarjetaAhorro",()=>{$("tipoSalida").value="ahorro";$('tipoSalida').dispatchEvent(new Event("change"));mostrar("formularioGasto")});
$("cerrarFormularioIngreso").onclick=()=>$("formularioIngreso").style.display="none";$("cerrarFormularioGasto").onclick=cerrarFormGasto;
$("tipoSalida").onchange=()=>{const v=$("tipoSalida").value,normal=v==="gasto",ahorro=v==="ahorro",retiro=v==="retiro_ahorro";$("camposGasto").style.display=normal?"block":"none";$("campoTipoGasto").style.display=normal?"block":"none";$("campoGastoFijo").style.display=normal?"block":"none";$("campoRetiroAhorro").style.display=retiro?"block":"none";$("descripcion").placeholder=ahorro?"Ej. Fondo de emergencia":retiro?"Ej. Proyecto o emergencia":"¿En qué gastaste?";$("guardarSalida").textContent=ahorro?"Guardar aporte a ahorro":retiro?"Registrar retiro de ahorro":"Guardar gasto";if(ahorro||retiro){$("categoria").value="";$("gastoFijoSeleccion").value=""}};
$("formIngreso").onsubmit=e=>{e.preventDefault();const tipo=$("tipoIngreso").value,monto=Number($("montoIngreso").value),fecha=$("fechaIngreso").value||hoyISO();if(!tipo||monto<=0)return alert("Completa el tipo, monto y fecha.");movimientos.push({id:crypto.randomUUID(),tipo:"ingreso",categoria:tipo,monto,descripcion:$("descripcionIngreso").value.trim(),fecha});e.target.reset();render();$("formularioIngreso").style.display="none"};
$("formGasto").onsubmit=e=>{e.preventDefault();const tipo=$("tipoSalida").value,monto=Number($("monto").value),fecha=$("fechaGasto").value||hoyISO();if(monto<=0)return alert("Completa el monto.");if(tipo==="gasto"&&!$("categoria").value&&!$("gastoFijoSeleccion").value)return alert("Selecciona una categoría.");if(tipo==="gasto"&&$("gastoFijoSeleccion").value){const g=gastosFijos.find(x=>x.id===$("gastoFijoSeleccion").value);if(g)$("descripcion").value=$("descripcion").value.trim()||g.nombre;movimientos.push({id:crypto.randomUUID(),tipo:"gasto",categoria:$("categoria").value||"otros",monto,descripcion:$("descripcion").value.trim()||g.nombre,tipoGasto:$("tipoGasto").value,fecha,origenFijo:g.id})}else if(tipo==="gasto"){movimientos.push({id:crypto.randomUUID(),tipo:"gasto",categoria:$("categoria").value,monto,descripcion:$("descripcion").value.trim(),tipoGasto:$("tipoGasto").value,fecha})}else if(tipo==="ahorro"){movimientos.push({id:crypto.randomUUID(),tipo:"ahorro",categoria:"ahorro",monto,descripcion:$("descripcion").value.trim(),fecha})}else{const saldo=obtenerTotales().ahorro;if(monto>saldo)return alert(`No puedes retirar ${money(monto)} porque tu ahorro disponible es ${money(saldo)}.`);movimientos.push({id:crypto.randomUUID(),tipo:"retiro_ahorro",categoria:"retiro_ahorro",monto,descripcion:$("descripcion").value.trim(),fecha})}e.target.reset();cerrarFormGasto();render()};
window.eliminarMovimiento=id=>{if(confirm("¿Eliminar este movimiento?")){movimientos=movimientos.filter(m=>m.id!==id);render()}};
window.editarMovimiento=id=>{const m=movimientos.find(x=>x.id===id);if(!m)return;$("editarId").value=m.id;$("editarTipo").value=m.tipo;$("editarMonto").value=m.monto;$("editarFecha").value=m.fecha.slice(0,10);$("editarDescripcion").value=m.descripcion||"";$("editarCategoria").innerHTML=distribucion.filter(c=>c.activo!==false).map(c=>`<option value="${c.id}">${escapeHtml(c.icono)} ${escapeHtml(c.nombre)}</option>`).join("")+`<option value="ahorro">💎 Aporte a ahorro</option><option value="retiro_ahorro">↩️ Retiro de ahorro</option>`;$("editarCategoria").value=m.categoria;$("formularioEdicion").style.display="block";$("formularioEdicion").scrollIntoView({behavior:"smooth"})};
$("cancelarEdicion").onclick=()=>$("formularioEdicion").style.display="none";
$("formEdicion").onsubmit=e=>{e.preventDefault();const m=movimientos.find(x=>x.id===$("editarId").value);if(!m)return;m.tipo=$("editarTipo").value;m.monto=Number($("editarMonto").value);m.fecha=$("editarFecha").value||hoyISO();m.descripcion=$("editarDescripcion").value.trim();m.categoria=$("editarCategoria").value;render();$("formularioEdicion").style.display="none"};

$("mostrarFormFijo").onclick=()=>{resetFijoForm();$("formGastoFijo").style.display="block";$("fijoNombre").focus()};$("cancelarFijo").onclick=()=>{$("formGastoFijo").reset();$("fijoId").value="";$("formGastoFijo").style.display="none"};
function resetFijoForm(){$("formGastoFijo").reset();$("fijoId").value=""}
window.editarFijo=id=>{const g=gastosFijos.find(x=>x.id===id);if(!g)return;$("fijoId").value=g.id;$("fijoNombre").value=g.nombre;$("fijoMonto").value=g.monto;$("fijoDia").value=g.dia;$("formGastoFijo").style.display="block";$("fijoNombre").focus()};
$("formGastoFijo").onsubmit=e=>{e.preventDefault();const id=$("fijoId").value,nombre=$("fijoNombre").value.trim(),monto=Number($("fijoMonto").value),dia=Number($("fijoDia").value);if(!nombre||monto<=0||dia<1||dia>31)return alert("Completa correctamente el gasto fijo.");if(id){const g=gastosFijos.find(x=>x.id===id);if(g){g.nombre=nombre;g.monto=monto;g.dia=dia;g.activo=true}}else gastosFijos.push({id:crypto.randomUUID(),nombre,monto,dia,activo:true,creado:new Date().toISOString()});resetFijoForm();$("formGastoFijo").style.display="none";render()};
window.desactivarFijo=id=>{const g=gastosFijos.find(x=>x.id===id);if(g&&confirm(`¿Dejar de usar ${g.nombre} como gasto fijo? Sus pagos históricos se conservarán.`)){g.activo=false;render()}};
window.abrirPagoFijo=id=>{$("tipoSalida").value="gasto";$("tipoSalida").dispatchEvent(new Event("change"));$("gastoFijoSeleccion").value=id;const g=gastosFijos.find(x=>x.id===id);if(g){$("categoria").value=distribucion.find(c=>c.nombre.toLowerCase().includes("vivienda"))?.id||distribucion[0]?.id||"otros";$("descripcion").value=g.nombre}mostrar("formularioGasto")};

$("mostrarDistribucion").onclick=()=>{renderEditorDistribucion();$("modalDistribucion").style.display="flex"};$("cerrarDistribucion").onclick=()=>$("modalDistribucion").style.display="none";
function renderEditorDistribucion(){const box=$("listaDistribucionEditar");box.innerHTML=distribucion.filter(c=>c.activo!==false).map(c=>`<div class="distribucion-edit-row"><span>${escapeHtml(c.icono)} ${escapeHtml(c.nombre)}</span><input type="number" min="0" step="0.01" value="${Number(c.limite)||0}" data-id="${c.id}" title="Monto de control"><button class="boton-secundario boton-pequeno" onclick="editarArea('${c.id}')">Editar</button><button class="boton-eliminar" onclick="eliminarArea('${c.id}')">✕</button></div>`).join("");}
window.editarArea=id=>{const c=distribucion.find(x=>x.id===id);if(!c)return;const n=prompt("Nombre del área:",c.nombre);if(n===null)return;const i=prompt("Ícono (emoji):",c.icono||"📦");if(i===null)return;c.nombre=n.trim()||c.nombre;c.icono=i.trim()||c.icono;renderEditorDistribucion();render()};
window.eliminarArea=id=>{if(distribucion.filter(x=>x.activo!==false).length<=1)return alert("Debes conservar al menos un área.");const c=distribucion.find(x=>x.id===id);if(c&&confirm(`¿Eliminar ${c.nombre} de la distribución? Sus movimientos históricos se conservarán.`)){c.activo=false;renderEditorDistribucion();render()}};
$("formNuevaArea").onsubmit=e=>{e.preventDefault();const nombre=$("nuevaAreaNombre").value.trim(),icono=$("nuevaAreaIcono").value.trim()||"📦",limite=Number($("nuevaAreaLimite").value)||0;if(!nombre)return alert("Escribe un nombre para el área.");distribucion.push({id:crypto.randomUUID(),nombre,icono,limite,activo:true});e.target.reset();renderEditorDistribucion();render()};
$("guardarLimitesDistribucion").onclick=()=>{document.querySelectorAll("#listaDistribucionEditar input[data-id]").forEach(i=>{const c=distribucion.find(x=>x.id===i.dataset.id);if(c)c.limite=Number(i.value)||0});$("modalDistribucion").style.display="none";render()};

$("limpiarMovimientos").onclick=()=>{if(confirm("¿Seguro que quieres eliminar todos los movimientos? Esta acción no se puede deshacer.")){movimientos=[];render()}};
$("filtroCategoria").onchange=renderHistorial;$("filtroTipo").onchange=renderHistorial;$("filtroPeriodo").onchange=renderHistorial;$("filtroDesde").onchange=renderHistorial;$("filtroHasta").onchange=renderHistorial;
$("gestionarMovimientos").onclick=()=>{
  renderHistorial(true);
  $("seccionHistorial").style.display="block";
  $("seccionHistorial").scrollIntoView({
    behavior:"smooth",
    block:"start"
  });
};
$("seccionHistorial").style.display="none";
function exportar(filtro){let arr=movimientos.slice();if(filtro==="semana")arr=arr.filter(m=>(Date.now()-new Date(m.fecha))/86400000<=7);if(filtro==="mes"){const n=new Date();arr=arr.filter(m=>{const d=new Date(m.fecha);return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear()})}const csv="Fecha,Tipo,Categoría,Monto,Descripción,Tipo de gasto\n"+arr.map(m=>[fechaTexto(m.fecha),m.tipo,m.categoria==="ahorro"?"Ahorro":(m.categoria==="retiro_ahorro"?"Retiro de ahorro":(distribucion.find(c=>c.id===m.categoria)?.nombre||m.categoria)),m.monto,m.descripcion,m.tipoGasto||""].map(x=>`"${String(x??"").replaceAll('"','""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download=`finanzas_${filtro}.csv`;a.click();URL.revokeObjectURL(a.href)}
$("exportarSemana").onclick=()=>exportar("semana");$("exportarMes").onclick=()=>exportar("mes");$("exportarTodo").onclick=()=>exportar("todo");
$("botonConfiguracion").onclick=()=>alert("La configuración de cuenta y datos se mantiene local en este dispositivo. Las personalizaciones financieras se realizan desde Distribución y Gastos Fijos.");
$("tipoSalida").dispatchEvent(new Event("change"));
let sessionId=null;
try{sessionId=localStorage.getItem(SESSION_KEY)}catch{}
const u=usuarios().find(x=>x.id===sessionId);if(u){usuario=u;mostrarApp()}else{$("pantallaAuth").style.display="flex";$('app').style.display="none"}


// Mantener actualizado el Service Worker para evitar que Vercel entregue una versión antigua.
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js").then(reg=>reg.update()).catch(()=>{});
  });
}
