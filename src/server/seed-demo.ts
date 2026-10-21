// `npm run db:demo` — reemplaza TODOS los datos por un escenario de demo
// verosímil (evaluación UX). Antes de borrar, guarda una copia completa en
// db/backup-<fecha>.sqlite3. Las fechas son relativas al momento de correrlo,
// así los plazos (alertas a 80 días, orden sin asignar a 7 días, garantías)
// quedan siempre coherentes. Imports relativos por el mismo motivo que seed.ts.
import { existsSync, mkdirSync } from "node:fs";
import { calcularGarantia, type TipoGarantia } from "../lib/gestech-data";
import { db } from "./db";
import { hashPassword } from "./password";
import {
  alertas,
  asignacionTecnico,
  clientes,
  comprobantes,
  conversacionesChatbot,
  cumplimentaciones,
  detallePresupuesto,
  detalleReposicion,
  garantias,
  historialEstado,
  movimientoStock,
  ordenesTrabajo,
  presupuestos,
  productos,
  reclamosGarantia,
  registroAuditoria,
  reposicionesStock,
  secuencias,
  usuarios,
} from "./schema";

/* ── Fechas ───────────────────────────────────────────────────────────── */

const AHORA = new Date();
const DIA_MS = 86_400_000;

function hace(dias: number, hora = 10, min = 0): Date {
  const d = new Date(AHORA.getTime() - dias * DIA_MS);
  d.setHours(hora, min, 0, 0);
  return d;
}
const pad = (n: number) => String(n).padStart(2, "0");
const fechaLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Mismo formato que CURRENT_TIMESTAMP de SQLite (UTC).
const ts = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const masMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
const pesos = (n: number) => n.toLocaleString("es-AR");

/* ── Datos ────────────────────────────────────────────────────────────── */

const USUARIOS = [
  { nombre: "Carlos", apellido: "López", usuario: "admin", clave: "Admin123", rol: "ADMINISTRADOR", activo: true },
  { nombre: "Marcelo", apellido: "Díaz", usuario: "marcelo", clave: "Marcelo1", rol: "TECNICO", activo: true },
  { nombre: "Gastón", apellido: "Ducca", usuario: "gaston", clave: "Gaston12", rol: "TECNICO", activo: true },
  { nombre: "Mauro", apellido: "Miranda", usuario: "mauro", clave: "Mauro123", rol: "TECNICO", activo: false },
] as const;
type Username = (typeof USUARIOS)[number]["usuario"];

const PRODUCTOS = [
  { nombre: "DVR Hikvision 4 canales Turbo HD", categoria: "DVR", stock: 8, stockMinimo: 3, precio: 85000 },
  { nombre: "DVR Hikvision 8 canales Turbo HD", categoria: "DVR", stock: 4, stockMinimo: 2, precio: 145000 },
  { nombre: "DVR Dahua 16 canales XVR", categoria: "DVR", stock: 1, stockMinimo: 2, precio: 260000 },
  { nombre: "NVR Dahua 8 canales PoE", categoria: "NVR", stock: 3, stockMinimo: 2, precio: 175000 },
  { nombre: "NVR Hikvision 4 canales PoE", categoria: "NVR", stock: 2, stockMinimo: 2, precio: 158000 },
  { nombre: "Cámara bullet 2MP Hikvision", categoria: "CAMARA", stock: 24, stockMinimo: 8, precio: 32000 },
  { nombre: "Cámara domo 2MP Hikvision", categoria: "CAMARA", stock: 15, stockMinimo: 8, precio: 29500 },
  { nombre: "Cámara domo 4MP Dahua", categoria: "CAMARA", stock: 9, stockMinimo: 4, precio: 48000 },
  { nombre: "Cámara bullet 4MP IP PoE Dahua", categoria: "CAMARA", stock: 8, stockMinimo: 4, precio: 68000 },
  { nombre: "Cámara Wi-Fi Ezviz C6N 360°", categoria: "CAMARA", stock: 6, stockMinimo: 3, precio: 52000 },
  { nombre: "Cámara bullet 5MP ColorVu Hikvision", categoria: "CAMARA", stock: 5, stockMinimo: 2, precio: 74000 },
  { nombre: "Cable UTP CAT6 exterior (mt)", categoria: "CABLE", stock: 320, stockMinimo: 100, precio: 950 },
  { nombre: "Cable UTP CAT5e interior (mt)", categoria: "CABLE", stock: 60, stockMinimo: 100, precio: 620 },
  { nombre: "Cable coaxial RG59 + alimentación (mt)", categoria: "CABLE", stock: 180, stockMinimo: 50, precio: 920 },
  { nombre: "Cable HDMI 1.5m", categoria: "CABLE", stock: 12, stockMinimo: 5, precio: 4500 },
  { nombre: "Cable HDMI 3m", categoria: "CABLE", stock: 7, stockMinimo: 5, precio: 7200 },
] as const;
type NombreProducto = (typeof PRODUCTOS)[number]["nombre"];

const CLIENTES = [
  { nombre: "Lucía", apellido: "Fernández", dni: "34221119", telefono: "543854128821" },
  { nombre: "Roberto", apellido: "Salas", dni: "30115402", telefono: "543855110099", domicilio: "Ruta 9 km 1132, Galpón 4" },
  { nombre: "Andrea", apellido: "Pereyra", dni: "28901554", telefono: "543856662233", domicilio: "Av. Belgrano Sur 1245" },
  { nombre: "Diego", apellido: "Romero", dni: "32554018", telefono: "543855557711" },
  { nombre: "María", apellido: "Acuña", dni: "29300110", telefono: "543854221100" },
  { nombre: "Jorge", apellido: "Maldonado", dni: "20111005", telefono: "543854015566" },
  { nombre: "Sofía", apellido: "Vargas", dni: "38455120", telefono: "543854339087" },
  { nombre: "Hernán", apellido: "Cabrera", dni: "31877654", telefono: "543855203344" },
  { nombre: "Valeria", apellido: "Ledesma", dni: "35662091", telefono: "543854776120", domicilio: "Libertad 560" },
  { nombre: "Martín", apellido: "Paz", dni: "27998431", telefono: "543854612278" },
  { nombre: "Carolina", apellido: "Gómez", dni: "33410876", telefono: "543855489902", domicilio: "Pje. Los Ceibos 112, Bº Belgrano" },
  { nombre: "Ricardo", apellido: "Juárez", dni: "22345987", telefono: "543854398812", domicilio: "Av. Roca 890 (Ferretería El Tala)" },
  { nombre: "Natalia", apellido: "Ibáñez", dni: "36120458", telefono: "543854901133", domicilio: "San Martín 1478, Dpto. 3B" },
  { nombre: "Pablo", apellido: "Coronel", dni: "25677342", telefono: "543855011987", domicilio: "Mendoza 455, La Banda" },
  { nombre: "Gabriela", apellido: "Sosa", dni: "39004517", telefono: "543854550764" },
  { nombre: "Ezequiel", apellido: "Herrera", dni: "40211983", telefono: "543855632410" },
  { nombre: "Silvia", apellido: "Toledo", dni: "23558901", telefono: "543854187245", domicilio: "Av. Moreno Sur 1520 (Kiosco Silvia)" },
  { nombre: "Facundo", apellido: "Ruiz", dni: "37789012", telefono: "543855774501" },
] as const;
type Dni = (typeof CLIENTES)[number]["dni"];

type Estado =
  | "INGRESADO"
  | "AGENDADO"
  | "PRESUPUESTADO"
  | "APROBADO"
  | "RECHAZADO"
  | "EN_PROCESO"
  | "PENDIENTE_DE_RETIRO"
  | "ENTREGADO"
  | "ABANDONADO"
  | "FINALIZADO"
  | "ANULADO";
type Metodo = "EFECTIVO" | "TRANSFERENCIA" | "TARJETA_CREDITO" | "TARJETA_DEBITO";

type OrdenDemo = {
  key: string;
  dni: Dni;
  tipo: "SERVICIO_TECNICO" | "INSTALACION_CAMARAS" | "MANTENIMIENTO_CAMARAS";
  equipo?: string;
  camaras?: number;
  descripcion: string;
  observaciones?: string;
  tecnico?: Username;
  /** Primer paso = estado inicial en la fecha de ingreso. Días hacia atrás, no crecientes. */
  pasos: [Estado, number][];
  presupuesto?: { detalle: string; manoObra: number; items?: [NombreProducto, number][] };
  subEstado?: "diagnostico" | "esperando_repuesto" | "en_reparacion" | "pruebas_finales";
  cumpl?: { tareas: string; monto: number; metodo: Metodo; garantia: TipoGarantia };
  anulacion?: string;
  reasignadoDesde?: { tecnico: Username; dias: number; motivo: string };
  reclamoDe?: string;
};

const ORDENES: OrdenDemo[] = [
  {
    key: "abandonada",
    dni: "31877654",
    tipo: "SERVICIO_TECNICO",
    equipo: "PC de escritorio Intel i3",
    descripcion: "No enciende, el cliente comenta olor a quemado.",
    tecnico: "marcelo",
    pasos: [["INGRESADO", 200], ["PRESUPUESTADO", 197], ["APROBADO", 196], ["EN_PROCESO", 195], ["PENDIENTE_DE_RETIRO", 185], ["ABANDONADO", 95]],
    presupuesto: { detalle: "Reemplazo de fuente de alimentación 500W y control de placa madre", manoObra: 42000 },
  },
  {
    key: "acuna",
    dni: "29300110",
    tipo: "SERVICIO_TECNICO",
    equipo: "Notebook HP 15-dw",
    descripcion: "Muy lenta, se calienta y se apaga sola.",
    tecnico: "marcelo",
    pasos: [["INGRESADO", 120], ["PRESUPUESTADO", 118], ["APROBADO", 117], ["EN_PROCESO", 116], ["PENDIENTE_DE_RETIRO", 113], ["ENTREGADO", 110]],
    presupuesto: { detalle: "Limpieza interna, cambio de pasta térmica y reinstalación de Windows", manoObra: 18000 },
    cumpl: { tareas: "Limpieza interna completa, pasta térmica nueva, reinstalación de Windows 11 y drivers. Pruebas de temperatura OK.", monto: 18000, metodo: "TRANSFERENCIA", garantia: "mantenimiento_software" },
  },
  {
    key: "vargas",
    dni: "38455120",
    tipo: "SERVICIO_TECNICO",
    equipo: "Notebook Dell Inspiron 14",
    descripcion: "Varias teclas no responden.",
    tecnico: "marcelo",
    pasos: [["INGRESADO", 100], ["PRESUPUESTADO", 98], ["APROBADO", 96], ["EN_PROCESO", 92], ["PENDIENTE_DE_RETIRO", 84]],
    presupuesto: { detalle: "Reemplazo de teclado completo", manoObra: 38000 },
  },
  {
    key: "pereyra",
    dni: "28901554",
    tipo: "INSTALACION_CAMARAS",
    camaras: 4,
    descripcion: "Instalación de 4 cámaras bullet 2MP en frente y patio de vivienda, con DVR y acceso remoto desde el celular.",
    tecnico: "gaston",
    pasos: [["AGENDADO", 75], ["PRESUPUESTADO", 73], ["APROBADO", 72], ["EN_PROCESO", 68], ["FINALIZADO", 67]],
    presupuesto: {
      detalle: "Instalación completa: 4 cámaras bullet 2MP, DVR 4 canales, cableado UTP y configuración de app móvil",
      manoObra: 60000,
      items: [["DVR Hikvision 4 canales Turbo HD", 1], ["Cámara bullet 2MP Hikvision", 4], ["Cable UTP CAT6 exterior (mt)", 60]],
    },
    cumpl: { tareas: "Instalación de 4 cámaras, DVR en placard del living, cableado por cañería existente. App Hik-Connect configurada en el celular de la clienta.", monto: 330000, metodo: "TARJETA_DEBITO", garantia: "instalacion_camaras" },
  },
  {
    key: "maldonado",
    dni: "20111005",
    tipo: "SERVICIO_TECNICO",
    equipo: "Notebook Lenovo IdeaPad 3",
    descripcion: "Pantalla rota por golpe, el resto funciona.",
    tecnico: "gaston",
    pasos: [["INGRESADO", 60], ["PRESUPUESTADO", 58], ["APROBADO", 57], ["EN_PROCESO", 55], ["PENDIENTE_DE_RETIRO", 48], ["ENTREGADO", 45]],
    presupuesto: { detalle: "Reemplazo de display 15.6\" FHD", manoObra: 95000 },
    cumpl: { tareas: "Reemplazo de display 15.6\" FHD 30 pines. Pruebas de imagen y bisagras OK.", monto: 95000, metodo: "EFECTIVO", garantia: "hardware_reparacion" },
  },
  {
    key: "toledo-mant",
    dni: "23558901",
    tipo: "MANTENIMIENTO_CAMARAS",
    camaras: 6,
    descripcion: "Mantenimiento preventivo del sistema de 6 cámaras del comercio: limpieza de lentes, revisión de conectores y actualización de firmware del DVR.",
    tecnico: "marcelo",
    pasos: [["AGENDADO", 50], ["PRESUPUESTADO", 49], ["APROBADO", 48], ["EN_PROCESO", 46], ["FINALIZADO", 46]],
    presupuesto: { detalle: "Mantenimiento preventivo de 6 cámaras y DVR", manoObra: 45000 },
    cumpl: { tareas: "Limpieza de lentes y domos, ajuste de 3 conectores BNC sulfatados, firmware del DVR actualizado.", monto: 45000, metodo: "TRANSFERENCIA", garantia: "mantenimiento_camaras" },
  },
  {
    key: "fernandez",
    dni: "34221119",
    tipo: "SERVICIO_TECNICO",
    equipo: "Impresora Epson L3250",
    descripcion: "No toma el papel y marca error de atasco.",
    tecnico: "marcelo",
    pasos: [["INGRESADO", 40], ["PRESUPUESTADO", 39], ["APROBADO", 38], ["EN_PROCESO", 37], ["PENDIENTE_DE_RETIRO", 35], ["ENTREGADO", 33]],
    presupuesto: { detalle: "Reemplazo de rodillo de arrastre y limpieza de cabezal", manoObra: 22000 },
    cumpl: { tareas: "Rodillo de arrastre reemplazado, limpieza de cabezal y almohadillas. Impresión de prueba OK.", monto: 22000, metodo: "TARJETA_CREDITO", garantia: "hardware_reparacion" },
  },
  {
    key: "paz",
    dni: "27998431",
    tipo: "SERVICIO_TECNICO",
    equipo: "PC gamer Ryzen 5 + RTX 3060",
    descripcion: "Se reinicia al abrir juegos.",
    tecnico: "gaston",
    pasos: [["INGRESADO", 30], ["PRESUPUESTADO", 29], ["RECHAZADO", 27]],
    presupuesto: { detalle: "Reemplazo de fuente 650W certificada 80 Plus Bronze", manoObra: 135000 },
  },
  {
    key: "salas-ram",
    dni: "30115402",
    tipo: "SERVICIO_TECNICO",
    equipo: "Notebook HP 240 G8",
    descripcion: "Ampliación de memoria RAM a 16 GB y cambio a disco SSD.",
    tecnico: "marcelo",
    pasos: [["INGRESADO", 25], ["PRESUPUESTADO", 24], ["APROBADO", 23], ["EN_PROCESO", 22], ["PENDIENTE_DE_RETIRO", 20], ["ENTREGADO", 18]],
    presupuesto: { detalle: "Módulo RAM 8 GB DDR4 + SSD 480 GB con clonado del disco", manoObra: 58000 },
    cumpl: { tareas: "Instalado módulo de 8 GB (total 16 GB) y SSD 480 GB, clonado del sistema sin pérdida de datos.", monto: 58000, metodo: "EFECTIVO", garantia: "hardware_reparacion" },
  },
  {
    key: "juarez",
    dni: "22345987",
    tipo: "INSTALACION_CAMARAS",
    camaras: 8,
    descripcion: "Instalación de 8 cámaras en ferretería (6 bullet exterior + 2 domo interior) con NVR PoE.",
    observaciones: "El cliente pide trabajar fuera del horario comercial (después de las 20 hs).",
    tecnico: "gaston",
    pasos: [["AGENDADO", 20], ["PRESUPUESTADO", 18], ["APROBADO", 15], ["EN_PROCESO", 5]],
    presupuesto: {
      detalle: "Sistema IP: NVR 8 canales PoE, 6 bullet 4MP IP, 2 domo 4MP y cableado UTP CAT6",
      manoObra: 150000,
      items: [["NVR Dahua 8 canales PoE", 1], ["Cámara bullet 4MP IP PoE Dahua", 6], ["Cámara domo 4MP Dahua", 2], ["Cable UTP CAT6 exterior (mt)", 120]],
    },
  },
  {
    key: "gomez",
    dni: "33410876",
    tipo: "MANTENIMIENTO_CAMARAS",
    camaras: 4,
    descripcion: "Dos cámaras sin imagen y el DVR no está grabando.",
    tecnico: "marcelo",
    pasos: [["AGENDADO", 12], ["PRESUPUESTADO", 9], ["APROBADO", 7]],
    presupuesto: { detalle: "Recableado de 2 cámaras y revisión del disco del DVR", manoObra: 35000, items: [["Cable coaxial RG59 + alimentación (mt)", 30]] },
  },
  {
    key: "anulada",
    dni: "39004517",
    tipo: "SERVICIO_TECNICO",
    equipo: "Tablet Samsung Galaxy Tab A8",
    descripcion: "No carga.",
    pasos: [["INGRESADO", 11], ["ANULADO", 11]],
    anulacion: "Orden cargada por error: la clienta retiró el equipo antes del diagnóstico.",
  },
  {
    key: "romero",
    dni: "32554018",
    tipo: "SERVICIO_TECNICO",
    equipo: "Notebook Asus VivoBook 15",
    descripcion: "No carga la batería, solo funciona enchufada.",
    tecnico: "marcelo",
    pasos: [["INGRESADO", 14], ["PRESUPUESTADO", 13], ["APROBADO", 12], ["EN_PROCESO", 8]],
    presupuesto: { detalle: "Reemplazo de pin de carga y batería original", manoObra: 47000 },
    subEstado: "esperando_repuesto",
  },
  {
    key: "sosa",
    dni: "39004517",
    tipo: "SERVICIO_TECNICO",
    equipo: "All-in-one Lenovo IdeaCentre",
    descripcion: "Pantalla azul al iniciar Windows.",
    tecnico: "gaston",
    reasignadoDesde: { tecnico: "marcelo", dias: 10, motivo: "Marcelo tiene alta carga de trabajo esta semana." },
    pasos: [["INGRESADO", 10], ["PRESUPUESTADO", 9], ["APROBADO", 8], ["EN_PROCESO", 6]],
    presupuesto: { detalle: "Reemplazo de disco HDD por SSD 480 GB y reinstalación del sistema", manoObra: 32000 },
    subEstado: "en_reparacion",
  },
  {
    key: "coronel",
    dni: "25677342",
    tipo: "SERVICIO_TECNICO",
    equipo: "Notebook Acer Aspire 5",
    descripcion: "Derrame de líquido sobre el teclado, no enciende.",
    tecnico: "gaston",
    pasos: [["INGRESADO", 9], ["PRESUPUESTADO", 7]],
    presupuesto: { detalle: "Limpieza por ultrasonido de placa, reemplazo de teclado y reparación de línea de alimentación", manoObra: 85000 },
  },
  {
    key: "herrera",
    dni: "40211983",
    tipo: "SERVICIO_TECNICO",
    equipo: "Notebook HP Pavilion 14",
    descripcion: "Bisagra izquierda rota, la tapa no cierra.",
    pasos: [["INGRESADO", 9]],
  },
  {
    key: "toledo-nb",
    dni: "23558901",
    tipo: "SERVICIO_TECNICO",
    equipo: "Notebook Lenovo ThinkPad E14",
    descripcion: "Limpieza y mantenimiento general, ventilador ruidoso.",
    tecnico: "gaston",
    pasos: [["INGRESADO", 8], ["PRESUPUESTADO", 7], ["APROBADO", 6], ["EN_PROCESO", 4], ["PENDIENTE_DE_RETIRO", 1]],
    presupuesto: { detalle: "Limpieza interna, lubricación de ventilador y pasta térmica", manoObra: 20000 },
  },
  {
    key: "ibanez",
    dni: "36120458",
    tipo: "INSTALACION_CAMARAS",
    camaras: 2,
    descripcion: "Instalación de 2 cámaras Wi-Fi 360° para monitoreo interior (cuarto del bebé y entrada).",
    tecnico: "gaston",
    pasos: [["AGENDADO", 6], ["PRESUPUESTADO", 4]],
    presupuesto: { detalle: "2 cámaras Wi-Fi Ezviz 360° con instalación y configuración en el celular", manoObra: 25000, items: [["Cámara Wi-Fi Ezviz C6N 360°", 2]] },
  },
  {
    key: "ledesma",
    dni: "35662091",
    tipo: "SERVICIO_TECNICO",
    equipo: "PC de escritorio (oficina)",
    descripcion: "Publicidad emergente y lentitud, posible virus.",
    tecnico: "marcelo",
    pasos: [["INGRESADO", 5], ["PRESUPUESTADO", 4], ["APROBADO", 2]],
    presupuesto: { detalle: "Eliminación de malware, respaldo de archivos y optimización del sistema", manoObra: 25000 },
  },
  {
    key: "reclamo",
    dni: "20111005",
    tipo: "SERVICIO_TECNICO",
    equipo: "Notebook Lenovo IdeaPad 3",
    descripcion: "", // se completa con el número de la orden original
    tecnico: "gaston",
    reclamoDe: "maldonado",
    pasos: [["INGRESADO", 3]],
  },
  {
    key: "salas-camaras",
    dni: "30115402",
    tipo: "INSTALACION_CAMARAS",
    camaras: 6,
    descripcion: "Instalación de 6 cámaras en galpón: perímetro exterior con visión nocturna.",
    observaciones: "Coordinar visita técnica para relevar el galpón el sábado por la mañana.",
    tecnico: "marcelo",
    pasos: [["AGENDADO", 2]],
  },
  {
    key: "ruiz",
    dni: "37789012",
    tipo: "SERVICIO_TECNICO",
    equipo: "Monitor Samsung 24\"",
    descripcion: "No da imagen, el LED de encendido parpadea.",
    pasos: [["INGRESADO", 1]],
  },
];

/* ── Script ───────────────────────────────────────────────────────────── */

const sqlite = db.$client;

function respaldar() {
  if (!existsSync("db")) mkdirSync("db");
  const destino = `db/backup-${fechaLocal(AHORA)}-${pad(AHORA.getHours())}${pad(AHORA.getMinutes())}${pad(AHORA.getSeconds())}.sqlite3`;
  sqlite.exec(`VACUUM INTO '${destino}'`);
  console.log(`Respaldo de la base anterior: ${destino}`);
}

function vaciar() {
  const tablas = [
    "registro_auditoria",
    "movimiento_stock",
    "asignacion_tecnico",
    "historial_estado",
    "conversaciones_chatbot",
    "reclamos_garantia",
    "alertas",
    "detalle_reposicion",
    "reposiciones_stock",
    "comprobantes",
    "garantias",
    "cumplimentaciones",
    "detalle_presupuesto",
    "presupuestos",
    "ordenes_trabajo",
    "productos",
    "clientes",
    "usuarios",
  ];
  sqlite.transaction(() => {
    for (const t of tablas) sqlite.prepare(`DELETE FROM ${t}`).run();
    sqlite.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${tablas.map(() => "?").join(",")})`).run(...tablas);
  })();
}

function main() {
  respaldar();
  vaciar();

  const usuarioId = new Map<Username, number>();
  for (const u of USUARIOS) {
    const row = db
      .insert(usuarios)
      .values({
        nombre: u.nombre,
        apellido: u.apellido,
        nombreUsuario: u.usuario,
        contrasena: hashPassword(u.clave),
        rol: u.rol,
        activo: u.activo,
        creadoEn: ts(hace(240, 9)),
      })
      .returning()
      .get();
    usuarioId.set(u.usuario, row.id);
  }
  const ADMIN = usuarioId.get("admin")!;

  const producto = new Map<string, { id: number; precio: number }>();
  const reservado = new Map<number, number>();
  for (const p of PRODUCTOS) {
    const row = db.insert(productos).values(p).returning().get();
    producto.set(p.nombre, { id: row.id, precio: p.precio });
  }

  const cliente = new Map<string, { id: number; nombre: string; apellido: string }>();
  for (const c of CLIENTES) {
    const row = db.insert(clientes).values(c).returning().get();
    cliente.set(c.dni, row);
  }

  const chat = (clienteId: number, ordenId: string | null, direccion: "ENTRANTE" | "SALIENTE", tipo: string, contenido: string, fecha: Date) =>
    db.insert(conversacionesChatbot).values({ clienteId, ordenId, direccion, tipo, contenido, fechaHora: ts(fecha) }).run();

  // Numeración correlativa en orden de ingreso, como si el sistema ya
  // viniera usándose desde la orden 000101.
  const ordenadas = [...ORDENES].sort((a, b) => b.pasos[0][1] - a.pasos[0][1]);
  const numero = new Map<string, string>();
  let seqOrden = 100;
  for (const o of ordenadas) numero.set(o.key, String(++seqOrden).padStart(6, "0"));

  const pendientesCumpl: { ordenId: string; o: OrdenDemo; clienteRow: { id: number; nombre: string }; fecha: Date }[] = [];

  for (const o of ordenadas) {
    const id = numero.get(o.key)!;
    const cli = cliente.get(o.dni)!;
    const tecId = o.tecnico ? usuarioId.get(o.tecnico)! : null;
    const esCamaras = o.tipo !== "SERVICIO_TECNICO";
    const fechaPaso = o.pasos.map(([, dias], i) => hace(dias, 9 + ((i * 2 + Number(id)) % 9), (Number(id) * 7) % 60));
    for (let i = 1; i < fechaPaso.length; i++) {
      if (fechaPaso[i] <= fechaPaso[i - 1]) fechaPaso[i] = masMin(fechaPaso[i - 1], 90);
    }
    const ingreso = fechaPaso[0];
    const [estadoFinal] = o.pasos[o.pasos.length - 1];
    const idxRetiro = o.pasos.findIndex(([e]) => e === "PENDIENTE_DE_RETIRO");
    const notifRetiro = idxRetiro >= 0 ? fechaPaso[idxRetiro] : null;
    const descripcion = o.reclamoDe
      ? `Reclamo de garantía de la orden ${numero.get(o.reclamoDe)}. La pantalla nueva presenta líneas verticales intermitentes.`
      : o.descripcion;

    db.insert(ordenesTrabajo)
      .values({
        id,
        clienteId: cli.id,
        tipoServicio: o.tipo,
        equipo: o.equipo ?? null,
        cantidadCamaras: o.camaras ?? null,
        descripcionTrabajo: descripcion,
        fechaIngreso: fechaLocal(ingreso),
        observaciones: o.observaciones ?? null,
        estado: estadoFinal,
        subEstado: estadoFinal === "EN_PROCESO" ? (o.subEstado ?? null) : null,
        tecnicoResponsableId: tecId,
        fechaNotificacionRetiro: notifRetiro?.toISOString() ?? null,
        ordenOriginalId: o.reclamoDe ? numero.get(o.reclamoDe)! : null,
        bajoGarantia: !!o.reclamoDe,
        motivoAnulacion: o.anulacion ?? null,
        fechaAnulacion: o.anulacion ? fechaPaso[fechaPaso.length - 1].toISOString() : null,
        creadoEn: ts(ingreso),
      })
      .run();

    // Asignación de técnico: inicial (cámaras, al alta) o autoasignación (servicio técnico).
    if (tecId) {
      const primero = o.reasignadoDesde ? usuarioId.get(o.reasignadoDesde.tecnico)! : tecId;
      db.insert(asignacionTecnico)
        .values({
          ordenId: id,
          tecnicoAsignadoId: primero,
          fechaHora: ts(masMin(ingreso, esCamaras ? 0 : 20)),
          usuarioResponsableId: esCamaras ? ADMIN : primero,
          tipoAsignacion: esCamaras ? "INICIAL" : "AUTOASIGNACION",
        })
        .run();
      if (o.reasignadoDesde) {
        db.insert(asignacionTecnico)
          .values({
            ordenId: id,
            tecnicoAsignadoId: tecId,
            tecnicoAnteriorId: primero,
            fechaHora: ts(masMin(ingreso, 45)),
            usuarioResponsableId: ADMIN,
            motivo: o.reasignadoDesde.motivo,
            tipoAsignacion: "REASIGNACION",
          })
          .run();
      }
    }

    // Historial de estados.
    o.pasos.forEach(([estado], i) => {
      const automatico = estado === "ABANDONADO";
      const porTecnico = ["PRESUPUESTADO", "EN_PROCESO", "PENDIENTE_DE_RETIRO", "FINALIZADO"].includes(estado);
      db.insert(historialEstado)
        .values({
          ordenId: id,
          estadoAnterior: i === 0 ? null : o.pasos[i - 1][0],
          estadoNuevo: estado,
          fechaHora: ts(fechaPaso[i]),
          usuarioId: automatico ? null : porTecnico && tecId ? tecId : ADMIN,
          automatico,
        })
        .run();
    });

    // Presupuesto, respuesta del cliente y efectos de stock.
    const idxPres = o.pasos.findIndex(([e]) => e === "PRESUPUESTADO");
    if (o.presupuesto && idxPres >= 0) {
      const p = o.presupuesto;
      const items = (p.items ?? []).map(([nombre, cantidad]) => {
        const prod = producto.get(nombre)!;
        return { productoId: prod.id, cantidad, precioUnitario: prod.precio, subtotal: prod.precio * cantidad };
      });
      const subtotalMateriales = items.reduce((s, it) => s + it.subtotal, 0);
      const montoTotal = p.manoObra + subtotalMateriales;
      const idxResp = o.pasos.findIndex(([e]) => e === "APROBADO" || e === "RECHAZADO");
      const respuesta = idxResp >= 0 ? (o.pasos[idxResp][0] as "APROBADO" | "RECHAZADO") : null;
      const fPres = fechaPaso[idxPres];

      const pres = db
        .insert(presupuestos)
        .values({
          ordenId: id,
          detalle: p.detalle,
          montoManoObra: p.manoObra,
          subtotalMateriales,
          montoTotal,
          fechaCreacion: ts(fPres),
          estado: respuesta ?? "PENDIENTE",
          fechaRespuestaCliente: respuesta ? fechaPaso[idxResp].toISOString() : null,
        })
        .returning()
        .get();
      for (const it of items) db.insert(detallePresupuesto).values({ presupuestoId: pres.id, ...it }).run();

      db.insert(registroAuditoria)
        .values({
          tipoOperacion: "CARGA_PRESUPUESTO",
          entidadAfectada: "Presupuesto",
          idEntidad: String(pres.id),
          descripcion: `Presupuesto de la orden ${id} por $${montoTotal}.`,
          fechaHora: ts(fPres),
          usuarioId: tecId ?? ADMIN,
        })
        .run();

      const objeto = o.equipo || o.descripcion;
      chat(cli.id, id, "SALIENTE", "presupuesto", `Hola ${cli.nombre} 👋 Tu presupuesto por "${objeto}" es $${pesos(montoTotal)}. Detalle: ${p.detalle}. Respondé CONFIRMAR o RECHAZAR.`, masMin(fPres, 1));
      if (respuesta) {
        chat(cli.id, id, "ENTRANTE", "respuesta", respuesta === "APROBADO" ? "CONFIRMAR" : "RECHAZAR", masMin(fechaPaso[idxResp], -3));
      }

      if (respuesta === "APROBADO") {
        const fFin = o.pasos.findIndex(([e]) => e === "FINALIZADO");
        for (const it of items) {
          db.insert(movimientoStock)
            .values({ productoId: it.productoId, tipoMovimiento: "RESERVA", cantidad: it.cantidad, ordenId: id, fechaHora: ts(fechaPaso[idxResp]), usuarioId: ADMIN })
            .run();
          if (fFin >= 0) {
            db.insert(movimientoStock)
              .values({ productoId: it.productoId, tipoMovimiento: "DESCUENTO_DEFINITIVO", cantidad: it.cantidad, ordenId: id, fechaHora: ts(fechaPaso[fFin]), usuarioId: tecId })
              .run();
          } else {
            reservado.set(it.productoId, (reservado.get(it.productoId) ?? 0) + it.cantidad);
          }
        }
      }
    }

    // Retiro, recordatorio a 80 días y abandono a 90 (mismo criterio que vencimientos.ts).
    if (notifRetiro) {
      chat(cli.id, id, "SALIENTE", "recordatorio", `Hola ${cli.nombre}, tu equipo (OT ${id}) ya está listo para el retiro. Atención: Lunes a Viernes 9 a 13 hs y 17 a 20 hs. Requisitos: DNI titular.`, masMin(notifRetiro, 1));
      const diasDesdeNotif = Math.floor((AHORA.getTime() - notifRetiro.getTime()) / DIA_MS);
      if (diasDesdeNotif >= 80 && (estadoFinal === "PENDIENTE_DE_RETIRO" || estadoFinal === "ABANDONADO")) {
        const f80 = new Date(notifRetiro.getTime() + 80 * DIA_MS);
        f80.setHours(3, 0, 0, 0);
        db.insert(alertas)
          .values({
            tipo: "VENCIMIENTO_RETIRO",
            ordenId: id,
            mensaje: `OT ${id} — ${cli.nombre} ${cli.apellido} — pendiente de retiro hace 80 días.`,
            fechaGeneracion: ts(f80),
            estado: estadoFinal === "ABANDONADO" ? "RESUELTA" : "ACTIVA",
          })
          .run();
        chat(cli.id, id, "SALIENTE", "recordatorio", `Hola ${cli.nombre}, te recordamos que tu equipo (OT ${id}) sigue pendiente de retiro. Pasados los 90 días será declarado en abandono.`, f80);
      }
      if (estadoFinal === "ABANDONADO") {
        chat(cli.id, id, "SALIENTE", "abandono", `Hola ${cli.nombre}, lamentamos informarte que tu equipo (OT ${id}) ha sido declarado ABANDONADO por superar los 90 días sin retiro.`, fechaPaso[fechaPaso.length - 1]);
      }
    }

    // Orden de servicio técnico sin responsable hace 7 días o más.
    if (o.tipo === "SERVICIO_TECNICO" && !tecId && !["ENTREGADO", "ABANDONADO", "RECHAZADO", "ANULADO"].includes(estadoFinal)) {
      const dias = Math.floor((AHORA.getTime() - ingreso.getTime()) / DIA_MS);
      if (dias >= 7) {
        const f7 = new Date(ingreso.getTime() + 7 * DIA_MS);
        f7.setHours(3, 0, 0, 0);
        db.insert(alertas)
          .values({
            tipo: "ORDEN_SIN_ASIGNAR",
            ordenId: id,
            mensaje: `OT ${id} — ${cli.nombre} ${cli.apellido} — sin técnico responsable hace 7 días.`,
            fechaGeneracion: ts(f7),
          })
          .run();
      }
    }

    if (o.anulacion) {
      db.insert(registroAuditoria)
        .values({
          tipoOperacion: "ANULACION_ORDEN",
          entidadAfectada: "OrdenTrabajo",
          idEntidad: id,
          descripcion: `Orden ${id} anulada. Motivo: ${o.anulacion}`,
          fechaHora: ts(fechaPaso[fechaPaso.length - 1]),
          usuarioId: ADMIN,
        })
        .run();
    }

    if (o.reclamoDe) {
      db.insert(reclamosGarantia)
        .values({
          ordenOriginalId: numero.get(o.reclamoDe)!,
          ordenGeneradaId: id,
          fechaReclamo: ts(ingreso),
          observacionesInspeccion: "Falla coincide con el trabajo original (display). Sin golpes ni signos de humedad. Cliente presenta comprobante.",
          resultado: "ACEPTADO",
          usuarioRegistroId: ADMIN,
        })
        .run();
    }

    if (o.cumpl) pendientesCumpl.push({ ordenId: id, o, clienteRow: cli, fecha: masMin(fechaPaso[fechaPaso.length - 1], 15) });
  }

  // Cumplimentaciones en orden cronológico, para que los comprobantes queden correlativos.
  let seqComprobante = 50;
  pendientesCumpl.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  for (const { ordenId, o, clienteRow, fecha } of pendientesCumpl) {
    const c = o.cumpl!;
    const fechaISO = fechaLocal(fecha);
    const g = calcularGarantia(c.garantia, fechaISO);
    const plazoDias = Math.round((new Date(g.vence).getTime() - new Date(g.inicio).getTime()) / DIA_MS);
    const nro = String(++seqComprobante).padStart(6, "0");
    const cumpl = db
      .insert(cumplimentaciones)
      .values({
        ordenId,
        fechaRealizacion: fechaISO,
        descripcionTareas: c.tareas,
        tecnicoEjecutorId: usuarioId.get(o.tecnico!)!,
        montoCobrado: c.monto,
        metodoPago: c.metodo,
        tipoGarantia: c.garantia,
        fechaRegistro: ts(fecha),
      })
      .returning()
      .get();
    db.insert(garantias)
      .values({ cumplimentacionId: cumpl.id, tipoGarantia: c.garantia, plazoDias, fechaInicio: g.inicio, fechaVencimiento: g.vence })
      .run();
    db.insert(comprobantes)
      .values({ numeroComprobante: nro, cumplimentacionId: cumpl.id, fechaEmision: ts(fecha), total: c.monto })
      .run();
    chat(clienteRow.id, ordenId, "SALIENTE", "comprobante", `¡Listo ${clienteRow.nombre}! Trabajo finalizado y cobrado. Te adjuntamos el comprobante N°${nro} en PDF.`, masMin(fecha, 2));
  }

  // Reclamo rechazado: garantía de mantenimiento de cámaras ya vencida.
  db.insert(reclamosGarantia)
    .values({
      ordenOriginalId: numero.get("toledo-mant")!,
      fechaReclamo: ts(hace(8, 11)),
      observacionesInspeccion: "La clienta reporta una cámara sin imagen. Se constata que la garantía de mantenimiento venció.",
      resultado: "RECHAZADO",
      motivoRechazo: "garantía vencida",
      usuarioRegistroId: ADMIN,
    })
    .run();

  // Consulta de estado por el chatbot.
  const romero = cliente.get("32554018")!;
  const otRomero = numero.get("romero")!;
  chat(romero.id, null, "ENTRANTE", "consulta", "estado", hace(3, 18, 40));
  chat(romero.id, otRomero, "SALIENTE", "consulta", `Tu orden ${otRomero} está en estado: en_proceso (esperando_repuesto).`, hace(3, 18, 40));

  for (const [productoId, cantidad] of reservado) {
    sqlite.prepare("UPDATE productos SET stock_reservado = ? WHERE id = ?").run(cantidad, productoId);
  }

  // Reposiciones de stock: una recibida, una confirmada en camino y una recién solicitada.
  const reposiciones: {
    proveedor: string;
    dias: number;
    estimadaEn: number;
    estado: "SOLICITADO" | "CONFIRMADO" | "RECIBIDO";
    items: [NombreProducto, number][];
  }[] = [
    { proveedor: "Distribuidora Seguridad Total S.A.", dias: 40, estimadaEn: 3, estado: "RECIBIDO", items: [["Cámara bullet 2MP Hikvision", 12], ["Cable UTP CAT6 exterior (mt)", 305]] },
    { proveedor: "TecnoSeguridad NOA S.R.L.", dias: 3, estimadaEn: 7, estado: "CONFIRMADO", items: [["DVR Dahua 16 canales XVR", 2], ["Cámara bullet 4MP IP PoE Dahua", 6], ["Cable UTP CAT5e interior (mt)", 305]] },
    { proveedor: "Distribuidora Seguridad Total S.A.", dias: 1, estimadaEn: 10, estado: "SOLICITADO", items: [["NVR Hikvision 4 canales PoE", 2]] },
  ];
  for (const r of reposiciones) {
    const pedido = hace(r.dias, 11, 15);
    const recepcion = hace(r.dias - r.estimadaEn, 16);
    const rep = db
      .insert(reposicionesStock)
      .values({
        proveedor: r.proveedor,
        fechaPedido: ts(pedido),
        fechaEstimadaRecepcion: fechaLocal(recepcion),
        estado: r.estado,
        usuarioRegistroId: ADMIN,
      })
      .returning()
      .get();
    for (const [nombre, cantidad] of r.items) {
      const prod = producto.get(nombre)!;
      db.insert(detalleReposicion)
        .values({ reposicionId: rep.id, productoId: prod.id, cantidadSolicitada: cantidad, cantidadRecibida: r.estado === "RECIBIDO" ? cantidad : 0 })
        .run();
      if (r.estado === "RECIBIDO") {
        db.insert(movimientoStock)
          .values({ productoId: prod.id, tipoMovimiento: "REPOSICION", cantidad, fechaHora: ts(recepcion), usuarioId: ADMIN })
          .run();
      }
    }
  }

  db.update(secuencias).set({ ordenSeq: seqOrden, comprobanteSeq: seqComprobante }).run();

  console.log(`\nDemo cargada: ${USUARIOS.length} usuarios, ${CLIENTES.length} clientes, ${PRODUCTOS.length} productos, ${ORDENES.length} órdenes (000101–${String(seqOrden).padStart(6, "0")}).`);
  console.log("\nUsuarios para la evaluación:");
  for (const u of USUARIOS) {
    console.log(`  ${u.usuario.padEnd(8)} / ${u.clave.padEnd(9)} ${u.rol}${u.activo ? "" : " (dado de baja, no puede ingresar)"}`);
  }
}

main();
// db.ts deja un setInterval vivo al importarse (ver seed.ts).
process.exit(0);
