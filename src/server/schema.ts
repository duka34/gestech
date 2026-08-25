import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Schema completo de GESTECH_SPEC.md §2. En la Fase 0 solo se pueblan y usan
// `usuarios`, `secuencias` y las cuatro tablas de auditoría — el resto queda
// listo para las fases siguientes de GESTECH_CAMBIOS.md, evitando reescribir
// migraciones a cada paso.

/* ── Usuarios y clientes (§2.1, §2.2) ─────────────────────────────────── */

export const usuarios = sqliteTable("usuarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  apellido: text("apellido").notNull(),
  nombreUsuario: text("nombre_usuario").notNull().unique(),
  contrasena: text("contrasena").notNull(), // hash "salt:hash", nunca texto plano
  rol: text("rol", { enum: ["ADMINISTRADOR", "TECNICO"] }).notNull(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  creadoEn: text("creado_en")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const clientes = sqliteTable("clientes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  apellido: text("apellido").notNull(),
  dni: text("dni").notNull().unique(),
  telefono: text("telefono").notNull().unique(), // normalizado, solo dígitos + cód. país
  domicilio: text("domicilio"),
});

/* ── Órdenes de trabajo y presupuestos (§2.3–§2.5) ────────────────────── */

export const ordenesTrabajo = sqliteTable("ordenes_trabajo", {
  id: text("id").primaryKey(), // idOrden: 6 dígitos formateados, ej. "000001"
  clienteId: integer("cliente_id")
    .notNull()
    .references(() => clientes.id),
  tipoServicio: text("tipo_servicio", {
    enum: ["SERVICIO_TECNICO", "INSTALACION_CAMARAS", "MANTENIMIENTO_CAMARAS"],
  }).notNull(),
  equipo: text("equipo"), // obligatorio solo si tipoServicio = SERVICIO_TECNICO (validado en la app)
  cantidadCamaras: integer("cantidad_camaras"),
  descripcionTrabajo: text("descripcion_trabajo").notNull(),
  fechaIngreso: text("fecha_ingreso").notNull(),
  observaciones: text("observaciones"),
  estado: text("estado").notNull(),
  subEstado: text("sub_estado"), // solo válido si estado = EN_PROCESO
  tecnicoResponsableId: integer("tecnico_responsable_id").references(() => usuarios.id),
  fechaNotificacionRetiro: text("fecha_notificacion_retiro"),
  ordenOriginalId: text("orden_original_id").references((): AnySQLiteColumn => ordenesTrabajo.id),
  bajoGarantia: integer("bajo_garantia", { mode: "boolean" }).notNull().default(false),
  motivoAnulacion: text("motivo_anulacion"),
  fechaAnulacion: text("fecha_anulacion"),
  creadoEn: text("creado_en")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const presupuestos = sqliteTable("presupuestos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ordenId: text("orden_id")
    .notNull()
    .unique()
    .references(() => ordenesTrabajo.id),
  detalle: text("detalle").notNull(),
  montoManoObra: real("monto_mano_obra").notNull(),
  subtotalMateriales: real("subtotal_materiales").notNull().default(0), // calculado en backend
  montoTotal: real("monto_total").notNull(), // calculado en backend
  fechaCreacion: text("fecha_creacion")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  estado: text("estado", { enum: ["PENDIENTE", "APROBADO", "RECHAZADO"] })
    .notNull()
    .default("PENDIENTE"),
  fechaRespuestaCliente: text("fecha_respuesta_cliente"),
});

/* ── Productos y stock (§2.6) ──────────────────────────────────────────── */

export const productos = sqliteTable("productos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  categoria: text("categoria", { enum: ["DVR", "NVR", "CAMARA", "CABLE"] }).notNull(),
  stock: integer("stock").notNull().default(0),
  stockReservado: integer("stock_reservado").notNull().default(0),
  stockMinimo: integer("stock_minimo").notNull().default(0),
  precio: real("precio").notNull().default(0),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
});

export const detallePresupuesto = sqliteTable("detalle_presupuesto", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  presupuestoId: integer("presupuesto_id")
    .notNull()
    .references(() => presupuestos.id),
  productoId: integer("producto_id")
    .notNull()
    .references(() => productos.id),
  cantidad: integer("cantidad").notNull(),
  precioUnitario: real("precio_unitario").notNull(), // congelado al crear el detalle (RF11.6)
  subtotal: real("subtotal").notNull(),
});

/* ── Cumplimentación, garantía y comprobante (§2.7–§2.9) ──────────────── */

export const cumplimentaciones = sqliteTable("cumplimentaciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ordenId: text("orden_id")
    .notNull()
    .unique()
    .references(() => ordenesTrabajo.id),
  fechaRealizacion: text("fecha_realizacion").notNull(),
  descripcionTareas: text("descripcion_tareas").notNull(),
  tecnicoEjecutorId: integer("tecnico_ejecutor_id")
    .notNull()
    .references(() => usuarios.id),
  montoCobrado: real("monto_cobrado").notNull(),
  metodoPago: text("metodo_pago", {
    enum: ["TRANSFERENCIA", "TARJETA_CREDITO", "TARJETA_DEBITO", "EFECTIVO"],
  }).notNull(),
  tipoGarantia: text("tipo_garantia").notNull(),
  fechaRegistro: text("fecha_registro")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const garantias = sqliteTable("garantias", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cumplimentacionId: integer("cumplimentacion_id")
    .notNull()
    .unique()
    .references(() => cumplimentaciones.id),
  tipoGarantia: text("tipo_garantia").notNull(),
  plazoDias: integer("plazo_dias").notNull(),
  fechaInicio: text("fecha_inicio").notNull(),
  fechaVencimiento: text("fecha_vencimiento").notNull(),
});

export const comprobantes = sqliteTable("comprobantes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  numeroComprobante: text("numero_comprobante").notNull().unique(),
  cumplimentacionId: integer("cumplimentacion_id")
    .notNull()
    .unique()
    .references(() => cumplimentaciones.id),
  fechaEmision: text("fecha_emision")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  total: real("total").notNull(),
  archivoPdf: text("archivo_pdf"),
});

/* ── Reposición de stock (§2.10–§2.11) ─────────────────────────────────── */

export const reposicionesStock = sqliteTable("reposiciones_stock", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proveedor: text("proveedor").notNull(), // texto libre, no es una entidad
  fechaPedido: text("fecha_pedido")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  fechaEstimadaRecepcion: text("fecha_estimada_recepcion"),
  estado: text("estado", { enum: ["SOLICITADO", "CONFIRMADO", "RECIBIDO"] })
    .notNull()
    .default("SOLICITADO"),
  usuarioRegistroId: integer("usuario_registro_id")
    .notNull()
    .references(() => usuarios.id),
});

export const detalleReposicion = sqliteTable("detalle_reposicion", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reposicionId: integer("reposicion_id")
    .notNull()
    .references(() => reposicionesStock.id),
  productoId: integer("producto_id")
    .notNull()
    .references(() => productos.id),
  cantidadSolicitada: integer("cantidad_solicitada").notNull(),
  cantidadRecibida: integer("cantidad_recibida").notNull().default(0),
});

/* ── Alertas y reclamos de garantía (§2.12–§2.13) ──────────────────────── */

export const alertas = sqliteTable("alertas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tipo: text("tipo").notNull(), // "VENCIMIENTO_RETIRO", extensible a futuro
  ordenId: text("orden_id")
    .notNull()
    .references(() => ordenesTrabajo.id),
  mensaje: text("mensaje").notNull(),
  fechaGeneracion: text("fecha_generacion")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  estado: text("estado", { enum: ["ACTIVA", "VISTA", "RESUELTA"] })
    .notNull()
    .default("ACTIVA"),
});

export const reclamosGarantia = sqliteTable("reclamos_garantia", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ordenOriginalId: text("orden_original_id")
    .notNull()
    .references(() => ordenesTrabajo.id),
  ordenGeneradaId: text("orden_generada_id").references(() => ordenesTrabajo.id),
  fechaReclamo: text("fecha_reclamo")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  observacionesInspeccion: text("observaciones_inspeccion").notNull(),
  resultado: text("resultado", { enum: ["ACEPTADO", "RECHAZADO"] }).notNull(),
  motivoRechazo: text("motivo_rechazo"),
  usuarioRegistroId: integer("usuario_registro_id")
    .notNull()
    .references(() => usuarios.id),
});

/* ── Conversaciones del Chatbot (§2.15) ────────────────────────────────── */

export const conversacionesChatbot = sqliteTable("conversaciones_chatbot", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clienteId: integer("cliente_id")
    .notNull()
    .references(() => clientes.id),
  ordenId: text("orden_id").references(() => ordenesTrabajo.id),
  direccion: text("direccion", { enum: ["ENTRANTE", "SALIENTE"] }).notNull(),
  // No está en la spec §2.15 literal, pero la UI ya distinguía mensajes por
  // tipo (presupuesto/recordatorio/comprobante/respuesta/abandono) para
  // íconos y RF08 — se agrega sin `{enum}`, mismo criterio que `sub_estado`.
  tipo: text("tipo").notNull(),
  contenido: text("contenido").notNull(),
  fechaHora: text("fecha_hora")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/* ── Auditoría — solo inserción, nunca UPDATE/DELETE (§2.14, RNF09) ────── */

export const historialEstado = sqliteTable("historial_estado", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ordenId: text("orden_id")
    .notNull()
    .references(() => ordenesTrabajo.id),
  estadoAnterior: text("estado_anterior"),
  estadoNuevo: text("estado_nuevo").notNull(),
  fechaHora: text("fecha_hora")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  usuarioId: integer("usuario_id").references(() => usuarios.id), // null si fue automático
  automatico: integer("automatico", { mode: "boolean" }).notNull().default(false),
  // Decisión de implementación (fuera de la spec original): obligatorio
  // únicamente cuando quien cambia el estado no es el técnico responsable
  // de la orden — funciona como marca implícita de "fuera de asignación".
  motivo: text("motivo"),
});

export const asignacionTecnico = sqliteTable("asignacion_tecnico", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ordenId: text("orden_id")
    .notNull()
    .references(() => ordenesTrabajo.id),
  tecnicoAsignadoId: integer("tecnico_asignado_id")
    .notNull()
    .references(() => usuarios.id),
  tecnicoAnteriorId: integer("tecnico_anterior_id").references(() => usuarios.id),
  fechaHora: text("fecha_hora")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  usuarioResponsableId: integer("usuario_responsable_id")
    .notNull()
    .references(() => usuarios.id),
  // GESTECH_CAMBIOS_ASIGNACION.md — motivo obligatorio solo en reasignaciones;
  // tipoAsignacion distingue asignación inicial (cámaras, al alta),
  // autoasignación (servicio técnico) y las dos formas de reasignación.
  motivo: text("motivo"),
  tipoAsignacion: text("tipo_asignacion", {
    enum: ["INICIAL", "AUTOASIGNACION", "REASIGNACION", "REASIGNACION_POR_BAJA"],
  })
    .notNull()
    .default("INICIAL"),
});

export const movimientoStock = sqliteTable("movimiento_stock", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productoId: integer("producto_id")
    .notNull()
    .references(() => productos.id),
  tipoMovimiento: text("tipo_movimiento", {
    enum: ["RESERVA", "LIBERACION", "DESCUENTO_DEFINITIVO", "REPOSICION", "AJUSTE_MANUAL"],
  }).notNull(),
  cantidad: integer("cantidad").notNull(),
  ordenId: text("orden_id").references(() => ordenesTrabajo.id), // null en reposiciones/ajustes
  fechaHora: text("fecha_hora")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  usuarioId: integer("usuario_id").references(() => usuarios.id), // null si fue automático
});

export const registroAuditoria = sqliteTable("registro_auditoria", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tipoOperacion: text("tipo_operacion", {
    enum: ["ANULACION_ORDEN", "CARGA_PRESUPUESTO", "MODIFICACION_PRESUPUESTO"],
  }).notNull(),
  entidadAfectada: text("entidad_afectada").notNull(),
  idEntidad: text("id_entidad").notNull(),
  descripcion: text("descripcion").notNull(),
  fechaHora: text("fecha_hora")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  usuarioId: integer("usuario_id")
    .notNull()
    .references(() => usuarios.id),
});

/* ── Secuencias atómicas (§2.3.1, T-04) ────────────────────────────────── */

// Fila única (id = 1) con los contadores correlativos del sistema.
export const secuencias = sqliteTable("secuencias", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ordenSeq: integer("orden_seq").notNull().default(0),
  comprobanteSeq: integer("comprobante_seq").notNull().default(0),
});
