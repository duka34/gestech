// Tipos y datos mock — alineados a los Requisitos Funcionales (RF)
export type Role = "admin" | "tecnico";

export type User = {
  id: string;
  nombre: string; // RF02.1 nombre y apellido
  username: string; // único, sin espacios ni caracteres especiales (RF01.2)
  password: string; // mín 8, letras + números (RF01.2)
  rol: Role;
  activo: boolean; // RF02.3 eliminación lógica
};

export type TipoServicio = "servicio_tecnico" | "instalacion_camaras" | "mantenimiento_camaras";

// RF04 — Estados unificados. La UI filtra los válidos según tipoServicio.
export type EstadoOrden =
  // Servicio técnico
  | "ingresado"
  | "presupuestado"
  | "aprobado"
  | "rechazado"
  | "en_proceso"
  | "pendiente_retiro"
  | "entregado"
  | "abandonado"
  // Cámaras (instalación / mantenimiento)
  | "agendado"
  | "finalizado"
  // RF17/C-08 — alcanzable desde cualquier estado no cumplimentado, para
  // ambos tipos de servicio. No aparece en estadosPorTipo (no es una opción
  // manual del selector de estado: se llega solo vía "Anular orden").
  | "anulado";

export type TipoGarantia =
  | "mantenimiento_software" // 30 días
  | "hardware_reparacion" // 90 días
  | "mantenimiento_camaras" // 30 días
  | "instalacion_camaras"; // 6 meses

export type Garantia = {
  tipo: TipoGarantia;
  inicio: string; // ISO
  vence: string; // ISO
  activa: boolean;
};

// RN-01 — medios de pago habilitados.
export type MetodoPago = "efectivo" | "transferencia" | "tarjeta_credito" | "tarjeta_debito";

export type Cumplimentacion = {
  fechaRealizacion: string; // RF03.2
  tareasRealizadas: string; // RF03.2
  tecnicoRealizoId: string; // RF03.2
  monto: number; // RF03.2
  metodoPago?: MetodoPago;
  comprobanteNro?: string; // generado al cumplimentar
};

// RF13.2 — sub-estados informativos, solo válidos con estado "en_proceso".
export type SubEstadoOrden =
  "diagnostico" | "esperando_repuesto" | "en_reparacion" | "pruebas_finales";

export type Orden = {
  id: string;
  numero: string; // RF03.1.1 — 6 dígitos correlativos, ej. "000001"
  // RF03.1 datos del cliente
  clienteNombre: string;
  clienteApellido: string;
  dni: string;
  telefono: string;
  domicilio?: string; // obligatorio solo para cámaras
  cliente: string; // derivado "Nombre Apellido" (compat. visual)
  // Servicio
  tipo: TipoServicio;
  equipo: string; // obligatorio solo para servicio técnico (C-01)
  cantidadCamaras?: number; // obligatorio solo para instalación/mantenimiento de cámaras (C-01)
  descripcion: string; // descripción del trabajo solicitado
  observaciones?: string; // RF03.1 opcional

  estado: EstadoOrden;
  subEstado?: SubEstadoOrden; // RF13.2 — solo con estado "en_proceso"
  ingresada: string; // fecha de ingreso (ISO)
  diasEnTaller: number;
  // Cumplimentación + garantía
  cumplimentacion?: Cumplimentacion;
  garantia?: Garantia;
  // RF05.2 — control de presupuesto
  presupuestoMonto?: number;
  presupuestoEnviado?: string; // fecha ISO
  respuestaPresupuesto?: { decision: "aprobado" | "rechazado"; fecha: string };
  // RF05.4 — control de plazos pendiente_retiro
  fechaPendienteRetiro?: string; // cuando pasó a pendiente_retiro
  recordatorio80Enviado?: boolean;
  // RF10/RN-11 — técnico responsable
  tecnicoResponsableId?: string;
  tecnicoResponsableNombre?: string;
  // RF17/RN-13 — anulación
  motivoAnulacion?: string;
  fechaAnulacion?: string;
  // RF15/RN-12 — reclamo de garantía
  bajoGarantia?: boolean;
  ordenOriginalId?: string;
};

export type Insumo = {
  id: string;
  nombre: string;
  categoria: "DVR" | "NVR" | "Camara" | "Cable";
  stock: number;
  stockMinimo: number;
  precio: number;
};

export type MensajeChat = {
  id: string;
  ordenId?: string; // ausente en mensajes no asociados a una orden puntual (p. ej. RF13 sin órdenes activas)
  cliente: string;
  direccion: "saliente" | "entrante";
  tipo:
    | "presupuesto"
    | "recordatorio"
    | "comprobante"
    | "aprobacion"
    | "respuesta"
    | "abandono"
    | "consulta"; // RF13/CU11 — consulta de estado vía Chatbot
  texto: string;
  fecha: string;
};

export const NEGOCIO = {
  nombre: "GesTech — Servicio Técnico e Instalaciones",
  direccion: "Av. Belgrano 234, Santiago del Estero",
  cuit: "30-71234567-8",
  telefono: "+54 385 422 0000",
  email: "contacto@gestech.com.ar",
};

export const usuariosSeed: User[] = [
  {
    id: "u1",
    nombre: "Carlos López",
    username: "admin",
    password: "Admin123",
    rol: "admin",
    activo: true,
  },
  {
    id: "u2",
    nombre: "Marcelo Diaz",
    username: "marcelo",
    password: "Marcelo1",
    rol: "tecnico",
    activo: true,
  },
  {
    id: "u3",
    nombre: "Gastón Ducca",
    username: "gaston",
    password: "Gaston12",
    rol: "tecnico",
    activo: true,
  },
  {
    id: "u4",
    nombre: "Mauro Miranda",
    username: "mauro",
    password: "Mauro123",
    rol: "tecnico",
    activo: true,
  },
];

const c = (nombre: string, apellido: string) => `${nombre} ${apellido}`;

export const ordenesSeed: Orden[] = [
  {
    id: "o1",
    numero: "000142",
    clienteNombre: "Lucía",
    clienteApellido: "Fernández",
    dni: "34.221.119",
    telefono: "+54 385 412 8821",
    cliente: c("Lucía", "Fernández"),
    tipo: "servicio_tecnico",
    equipo: "Notebook Lenovo IdeaPad 3",
    descripcion: "No enciende. Posible falla de fuente.",
    observaciones: "Cargador entregado. Contraseña Windows: 1234.",
    estado: "en_proceso",
    ingresada: "2026-06-22",
    diasEnTaller: 2,
  },
  {
    id: "o2",
    numero: "000143",
    clienteNombre: "Roberto",
    clienteApellido: "Salas",
    dni: "30.115.402",
    telefono: "+54 385 511 0099",
    cliente: c("Roberto", "Salas"),
    tipo: "servicio_tecnico",
    equipo: "PC armada gamer",
    descripcion: "Reinicios aleatorios, posible RAM defectuosa.",
    estado: "presupuestado",
    presupuestoMonto: 45000,
    presupuestoEnviado: "2026-06-23",
    ingresada: "2026-06-20",
    diasEnTaller: 4,
  },
  {
    id: "o3",
    numero: "000144",
    clienteNombre: "Andrea",
    clienteApellido: "Pereyra",
    dni: "28.901.554",
    telefono: "+54 385 666 2233",
    cliente: c("Andrea", "Pereyra"),
    domicilio: "Av. Belgrano 1245",
    tipo: "instalacion_camaras",
    equipo: "Kit 4 cámaras Hikvision + DVR",
    descripcion: "Instalación en local comercial.",
    estado: "aprobado",
    presupuestoMonto: 320000,
    presupuestoEnviado: "2026-06-19",
    respuestaPresupuesto: { decision: "aprobado", fecha: "2026-06-19 14:02" },
    ingresada: "2026-06-18",
    diasEnTaller: 6,
  },
  {
    id: "o4",
    numero: "000140",
    clienteNombre: "Diego",
    clienteApellido: "Romero",
    dni: "32.554.018",
    telefono: "+54 385 555 7711",
    cliente: c("Diego", "Romero"),
    tipo: "servicio_tecnico",
    equipo: "Notebook HP 240",
    descripcion: "Cambio de teclado.",
    estado: "pendiente_retiro",
    cumplimentacion: {
      fechaRealizacion: "2026-06-19",
      tareasRealizadas: "Reemplazo de teclado completo, pruebas OK.",
      tecnicoRealizoId: "u4",
      monto: 28000,
      metodoPago: "efectivo",
      comprobanteNro: "000124",
    },
    ingresada: "2026-06-14",
    diasEnTaller: 10,
    fechaPendienteRetiro: "2026-06-19",
  },
  {
    id: "o5",
    numero: "000125",
    clienteNombre: "María",
    clienteApellido: "Acuña",
    dni: "29.300.110",
    telefono: "+54 385 422 1100",
    cliente: c("María", "Acuña"),
    tipo: "servicio_tecnico",
    equipo: "Notebook Asus X515",
    descripcion: "Limpieza y cambio de pasta térmica.",
    estado: "entregado",
    cumplimentacion: {
      fechaRealizacion: "2026-05-30",
      tareasRealizadas: "Limpieza interna y pasta térmica.",
      tecnicoRealizoId: "u2",
      monto: 18000,
      metodoPago: "transferencia",
      comprobanteNro: "000118",
    },
    ingresada: "2026-05-30",
    diasEnTaller: 3,
    garantia: {
      tipo: "mantenimiento_software",
      inicio: "2026-05-30",
      vence: "2026-06-29",
      activa: true,
    },
  },
  {
    id: "o6",
    numero: "000098",
    clienteNombre: "Jorge",
    clienteApellido: "Maldonado",
    dni: "20.111.005",
    telefono: "+54 385 401 5566",
    cliente: c("Jorge", "Maldonado"),
    tipo: "servicio_tecnico",
    equipo: "PC oficina Dell",
    descripcion: "Cliente no respondió al presupuesto.",
    estado: "abandonado",
    ingresada: "2026-03-10",
    diasEnTaller: 105,
  },
  {
    id: "o7",
    numero: "000145",
    clienteNombre: "Mariana",
    clienteApellido: "Soto",
    dni: "33.788.024",
    telefono: "+54 385 700 8899",
    cliente: c("Mariana", "Soto"),
    domicilio: "Calle Independencia 540",
    tipo: "mantenimiento_camaras",
    equipo: "Sistema 6 cámaras existente",
    descripcion: "Revisión anual y limpieza.",
    estado: "agendado",
    ingresada: "2026-06-23",
    diasEnTaller: 1,
  },
  {
    id: "o8",
    numero: "000128",
    clienteNombre: "Sofía",
    clienteApellido: "Vargas",
    dni: "31.220.887",
    telefono: "+54 385 433 9090",
    cliente: c("Sofía", "Vargas"),
    tipo: "servicio_tecnico",
    equipo: "Notebook Acer Aspire 5",
    descripcion: "Cambio de bisagras y carcasa superior.",
    estado: "pendiente_retiro",
    cumplimentacion: {
      fechaRealizacion: "2026-04-05",
      tareasRealizadas: "Reemplazo de bisagras y carcasa, pruebas OK.",
      tecnicoRealizoId: "u3",
      monto: 35000,
      metodoPago: "efectivo",
      comprobanteNro: "000121",
    },
    ingresada: "2026-04-01",
    diasEnTaller: 84,
    fechaPendienteRetiro: "2026-04-05",
    recordatorio80Enviado: true,
  },
  {
    id: "o9",
    numero: "000119",
    clienteNombre: "Hernán",
    clienteApellido: "Cabrera",
    dni: "27.882.341",
    telefono: "+54 385 477 5544",
    cliente: c("Hernán", "Cabrera"),
    tipo: "servicio_tecnico",
    equipo: "PC escritorio HP",
    descripcion: "Reemplazo de fuente de poder.",
    estado: "abandonado",
    cumplimentacion: {
      fechaRealizacion: "2026-03-26",
      tareasRealizadas: "Reemplazo de fuente 500W, pruebas OK.",
      tecnicoRealizoId: "u2",
      monto: 42000,
      metodoPago: "efectivo",
      comprobanteNro: "000115",
    },
    ingresada: "2026-03-22",
    diasEnTaller: 94,
    fechaPendienteRetiro: "2026-03-26",
    recordatorio80Enviado: true,
  },
];

export const stockSeed: Insumo[] = [
  {
    id: "s1",
    nombre: "DVR Hikvision 4 canales",
    categoria: "DVR",
    stock: 6,
    stockMinimo: 2,
    precio: 85000,
  },
  {
    id: "s2",
    nombre: "DVR Hikvision 8 canales",
    categoria: "DVR",
    stock: 3,
    stockMinimo: 2,
    precio: 145000,
  },
  {
    id: "s3",
    nombre: "NVR Dahua 8 canales",
    categoria: "NVR",
    stock: 2,
    stockMinimo: 2,
    precio: 175000,
  },
  {
    id: "s4",
    nombre: "Cámara bullet 2MP Hikvision",
    categoria: "Camara",
    stock: 18,
    stockMinimo: 6,
    precio: 32000,
  },
  {
    id: "s5",
    nombre: "Cámara domo 4MP Dahua",
    categoria: "Camara",
    stock: 9,
    stockMinimo: 4,
    precio: 48000,
  },
  {
    id: "s6",
    nombre: "Cable UTP CAT6 (mt)",
    categoria: "Cable",
    stock: 240,
    stockMinimo: 100,
    precio: 850,
  },
  {
    id: "s7",
    nombre: "Cable HDMI 1.5m",
    categoria: "Cable",
    stock: 12,
    stockMinimo: 5,
    precio: 4500,
  },
  {
    id: "s8",
    nombre: "Cable coaxial RG59 (mt)",
    categoria: "Cable",
    stock: 180,
    stockMinimo: 50,
    precio: 920,
  },
];

export const chatSeed: MensajeChat[] = [
  {
    id: "m1",
    ordenId: "o2",
    cliente: "Roberto Salas",
    direccion: "saliente",
    tipo: "presupuesto",
    texto:
      "Hola Roberto 👋 Soy el chatbot de GesTech. Tu presupuesto para la PC gamer es $45.000. Respondé CONFIRMAR o RECHAZAR.",
    fecha: "2026-06-23 10:24",
  },
  {
    id: "m2",
    ordenId: "o4",
    cliente: "Diego Romero",
    direccion: "saliente",
    tipo: "comprobante",
    texto:
      "¡Listo Diego! Trabajo finalizado y cobrado. Te adjuntamos el comprobante N°000124 en PDF.",
    fecha: "2026-06-19 17:30",
  },
  {
    id: "m3",
    ordenId: "o5",
    cliente: "María Acuña",
    direccion: "saliente",
    tipo: "comprobante",
    texto: "¡Gracias María! Comprobante N°000118 adjunto. Garantía vigente por 30 días.",
    fecha: "2026-05-30 18:11",
  },
  {
    id: "m4",
    ordenId: "o3",
    cliente: "Andrea Pereyra",
    direccion: "entrante",
    tipo: "respuesta",
    texto: "CONFIRMAR. Coordinemos para el viernes a la mañana.",
    fecha: "2026-06-19 14:02",
  },
  {
    id: "m5",
    ordenId: "o8",
    cliente: "Sofía Vargas",
    direccion: "saliente",
    tipo: "recordatorio",
    texto:
      "Hola Sofía, te recordamos que tu equipo (OT 000128) sigue pendiente de retiro. Han pasado 80 días desde la notificación. Tenés 10 días para retirarlo antes de que sea declarado en abandono.",
    fecha: "2026-06-24 09:00",
  },
  {
    id: "m6",
    ordenId: "o9",
    cliente: "Hernán Cabrera",
    direccion: "saliente",
    tipo: "recordatorio",
    texto:
      "Hola Hernán, te recordamos que tu equipo (OT 000119) sigue pendiente de retiro. Han pasado 80 días desde la notificación. Tenés 10 días para retirarlo antes de que sea declarado en abandono.",
    fecha: "2026-06-14 09:00",
  },
  {
    id: "m7",
    ordenId: "o9",
    cliente: "Hernán Cabrera",
    direccion: "saliente",
    tipo: "abandono",
    texto:
      "Hola Hernán, lamentamos informarte que tu equipo (OT 000119) ha sido declarado en ABANDONO por haber transcurrido 90 días desde la notificación de retiro sin respuesta.",
    fecha: "2026-06-24 09:00",
  },
];

// RF03.1.2 — estado inicial por tipo
export const estadoInicial = (tipo: TipoServicio): EstadoOrden =>
  tipo === "servicio_tecnico" ? "ingresado" : "agendado";

// RF04 — estados válidos por tipo
export const estadosPorTipo = (tipo: TipoServicio): EstadoOrden[] =>
  tipo === "servicio_tecnico"
    ? [
        "ingresado",
        "presupuestado",
        "aprobado",
        "rechazado",
        "en_proceso",
        "pendiente_retiro",
        "entregado",
        "abandonado",
      ]
    : ["agendado", "presupuestado", "aprobado", "rechazado", "en_proceso", "finalizado"];

// RF03.2.2 — cálculo de garantía
export function calcularGarantia(tipoGarantia: TipoGarantia, fechaISO: string): Garantia {
  const inicio = new Date(fechaISO);
  const vence = new Date(inicio);
  if (tipoGarantia === "mantenimiento_software" || tipoGarantia === "mantenimiento_camaras") {
    vence.setDate(vence.getDate() + 30);
  } else if (tipoGarantia === "hardware_reparacion") {
    vence.setDate(vence.getDate() + 90);
  } else {
    vence.setMonth(vence.getMonth() + 6);
  }
  return {
    tipo: tipoGarantia,
    inicio: fechaISO,
    vence: vence.toISOString().slice(0, 10),
    activa: true,
  };
}

// RF01.2 — validaciones
// Usuario: 4–16 chars, solo letras y números, sin espacios ni caracteres especiales.
export const validarUsername = (u: string) =>
  /^[A-Za-z0-9]+$/.test(u) && u.length >= 4 && u.length <= 16 && !/\s/.test(u);
// Contraseña: 4–16 chars, debe incluir letras y números, sin espacios.
export const validarPassword = (p: string) =>
  p.length >= 4 && p.length <= 16 && /[A-Za-z]/.test(p) && /\d/.test(p) && !/\s/.test(p);

// Decisión de implementación (a pedido del usuario, no de la spec original):
// cambiar el estado de una orden que no es la propia queda permitido pero
// con fricción — advertencia + motivo obligatorio, registrado en el
// historial. El Administrador queda exento (autoridad plena, como en el
// resto del sistema). Función pura, sin dependencias de servidor: se usa
// tanto en el backend (fn/ordenes.ts, revalida siempre) como en el cliente
// (para decidir si mostrar el diálogo de confirmación).
export function requiereMotivoDeCambio(
  tecnicoResponsableId: number | string | null | undefined,
  usuario: { id: number | string; rol: "ADMINISTRADOR" | "TECNICO" },
): boolean {
  if (usuario.rol === "ADMINISTRADOR") return false;
  if (tecnicoResponsableId == null) return false;
  return String(tecnicoResponsableId) !== String(usuario.id);
}

// Presupuestar es sustantivo (diagnóstico + monto comprometido con el
// cliente), no solo "quién hizo el trámite": a diferencia del resto de las
// transiciones, acá no hay override posible — bloqueo duro para quien no
// sea el técnico responsable (el Administrador siempre puede).
export function puedePresupuestar(
  tecnicoResponsableId: number | string | null | undefined,
  usuario: { id: number | string; rol: "ADMINISTRADOR" | "TECNICO" },
): boolean {
  if (usuario.rol === "ADMINISTRADOR") return true;
  return tecnicoResponsableId != null && String(tecnicoResponsableId) === String(usuario.id);
}
