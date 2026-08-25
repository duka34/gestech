import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  calcularGarantia,
  puedePresupuestar,
  requiereMotivoDeCambio,
  type EstadoOrden,
  type Orden,
  type TipoGarantia,
} from "@/lib/gestech-data";
import { adminMiddleware, authMiddleware } from "../auth";
import { db } from "../db";
import type { db as dbInstance } from "../db";
import {
  registrarAsignacionTecnico,
  registrarAuditoria,
  registrarHistorialEstado,
  registrarMovimientoStock,
} from "../audit";
import { dniSchema, telefonoSchema, upsertCliente } from "./clientes";
import { siguienteNumeroComprobante, siguienteNumeroOrden } from "../ids";
import {
  aplicarTransicion,
  ESTADO_INICIAL,
  ESTADOS_TERMINALES,
  transicionValida,
  type Tx,
} from "../estados";
import {
  ESTADO_DB_TO_UI,
  ESTADO_UI_TO_DB,
  TIPO_DB_TO_UI,
  TIPO_UI_TO_DB,
  type EstadoOrdenDb,
  type TipoServicioDb,
} from "../mappers";
import {
  alertas,
  asignacionTecnico,
  clientes,
  comprobantes,
  cumplimentaciones,
  detallePresupuesto,
  garantias,
  ordenesTrabajo,
  presupuestos,
  productos,
  reclamosGarantia,
  usuarios,
} from "../schema";

// Prerrequisito de Fase 2: T-11 (presupuesto) tiene una FK real a
// ordenes_trabajo.id, así que la orden en sí (alta, lectura, cambio de
// estado) se migra acá — no tenía su propio número en GESTECH_CAMBIOS.md,
// pero sin esto T-11/T-12 no tienen dónde apoyarse. Cumplimentación +
// garantía + comprobante (CU3) también se migran, para no dejar la pantalla
// de detalle de la orden rota a mitad de camino.

type OrdenRow = typeof ordenesTrabajo.$inferSelect;
type ClienteRow = typeof clientes.$inferSelect;
type CumplimentacionRow = typeof cumplimentaciones.$inferSelect;
type GarantiaRow = typeof garantias.$inferSelect;
type PresupuestoRow = typeof presupuestos.$inferSelect;

const METODO_PAGO_DB = ["EFECTIVO", "TRANSFERENCIA", "TARJETA_CREDITO", "TARJETA_DEBITO"] as const;
type MetodoPagoUi = "efectivo" | "transferencia" | "tarjeta_credito" | "tarjeta_debito";

function metodoPagoADb(m: MetodoPagoUi): (typeof METODO_PAGO_DB)[number] {
  return m.toUpperCase() as (typeof METODO_PAGO_DB)[number];
}
function metodoPagoAUi(m: string): MetodoPagoUi {
  return m.toLowerCase() as MetodoPagoUi;
}

// Traduce una orden (+ datos relacionados) al shape que ya consume la UI
// existente (gestech-data.ts `Orden`) — ver la decisión de mapeo del plan.
function toOrdenUi(
  o: OrdenRow,
  c: ClienteRow,
  extra: {
    presupuesto?: PresupuestoRow;
    cumplimentacion?: CumplimentacionRow;
    garantia?: GarantiaRow;
    comprobanteNro?: string;
    tecnicoResponsable?: { id: number; nombre: string; apellido: string };
  } = {},
) {
  const dias = Math.max(
    0,
    Math.floor((Date.now() - new Date(o.fechaIngreso).getTime()) / 86400000),
  );
  return {
    id: o.id,
    numero: o.id,
    clienteNombre: c.nombre,
    clienteApellido: c.apellido,
    dni: c.dni,
    telefono: c.telefono,
    domicilio: c.domicilio ?? undefined,
    cliente: `${c.nombre} ${c.apellido}`,
    tipo: TIPO_DB_TO_UI[o.tipoServicio as TipoServicioDb],
    equipo: o.equipo ?? "",
    cantidadCamaras: o.cantidadCamaras ?? undefined,
    descripcion: o.descripcionTrabajo,
    observaciones: o.observaciones ?? undefined,
    estado: ESTADO_DB_TO_UI[o.estado as EstadoOrdenDb],
    ingresada: o.fechaIngreso,
    diasEnTaller: dias,
    cumplimentacion: extra.cumplimentacion
      ? {
          fechaRealizacion: extra.cumplimentacion.fechaRealizacion,
          tareasRealizadas: extra.cumplimentacion.descripcionTareas,
          tecnicoRealizoId: String(extra.cumplimentacion.tecnicoEjecutorId),
          monto: extra.cumplimentacion.montoCobrado,
          metodoPago: metodoPagoAUi(extra.cumplimentacion.metodoPago),
          comprobanteNro: extra.comprobanteNro,
        }
      : undefined,
    garantia: extra.garantia
      ? {
          tipo: extra.garantia.tipoGarantia as TipoGarantia,
          inicio: extra.garantia.fechaInicio,
          vence: extra.garantia.fechaVencimiento,
          activa: new Date(extra.garantia.fechaVencimiento) >= new Date(),
        }
      : undefined,
    presupuestoMonto: extra.presupuesto?.montoTotal,
    presupuestoEnviado: extra.presupuesto?.fechaCreacion,
    respuestaPresupuesto: extra.presupuesto?.fechaRespuestaCliente
      ? {
          decision: (extra.presupuesto.estado === "APROBADO" ? "aprobado" : "rechazado") as
            "aprobado" | "rechazado",
          fecha: extra.presupuesto.fechaRespuestaCliente,
        }
      : undefined,
    tecnicoResponsableId: extra.tecnicoResponsable
      ? String(extra.tecnicoResponsable.id)
      : undefined,
    tecnicoResponsableNombre: extra.tecnicoResponsable
      ? `${extra.tecnicoResponsable.nombre} ${extra.tecnicoResponsable.apellido}`
      : undefined,
    motivoAnulacion: o.motivoAnulacion ?? undefined,
    fechaAnulacion: o.fechaAnulacion ?? undefined,
    bajoGarantia: o.bajoGarantia,
    ordenOriginalId: o.ordenOriginalId ?? undefined,
    subEstado: (o.subEstado ?? undefined) as Orden["subEstado"],
  };
}

function cargarOrdenCompleta(orden: OrdenRow, cliente: ClienteRow) {
  const presupuesto = db
    .select()
    .from(presupuestos)
    .where(eq(presupuestos.ordenId, orden.id))
    .get();
  const cumplimentacion = db
    .select()
    .from(cumplimentaciones)
    .where(eq(cumplimentaciones.ordenId, orden.id))
    .get();
  let garantia: GarantiaRow | undefined;
  let comprobanteNro: string | undefined;
  if (cumplimentacion) {
    garantia = db
      .select()
      .from(garantias)
      .where(eq(garantias.cumplimentacionId, cumplimentacion.id))
      .get();
    comprobanteNro = db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.cumplimentacionId, cumplimentacion.id))
      .get()?.numeroComprobante;
  }
  const tecnicoResponsable = orden.tecnicoResponsableId
    ? db.select().from(usuarios).where(eq(usuarios.id, orden.tecnicoResponsableId)).get()
    : undefined;
  return toOrdenUi(orden, cliente, {
    presupuesto,
    cumplimentacion,
    garantia,
    comprobanteNro,
    tecnicoResponsable,
  });
}

export const listarOrdenesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const ordenesRows = db
      .select()
      .from(ordenesTrabajo)
      .orderBy(desc(ordenesTrabajo.creadoEn))
      .all();
    const clientesPorId = new Map(
      db
        .select()
        .from(clientes)
        .all()
        .map((c) => [c.id, c]),
    );
    return ordenesRows.map((o) => cargarOrdenCompleta(o, clientesPorId.get(o.clienteId)!));
  });

export const obtenerOrdenFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const orden = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, data.id)).get();
    if (!orden) return null;
    const cliente = db.select().from(clientes).where(eq(clientes.id, orden.clienteId)).get();
    if (!cliente) return null;
    return cargarOrdenCompleta(orden, cliente);
  });

const crearOrdenSchema = z
  .object({
    clienteNombre: z.string().min(1),
    clienteApellido: z.string().min(1),
    dni: dniSchema,
    telefono: telefonoSchema,
    domicilio: z.string().optional(),
    tipo: z.enum(["servicio_tecnico", "instalacion_camaras", "mantenimiento_camaras"]),
    equipo: z.string().optional(),
    cantidadCamaras: z.number().int().positive().optional(),
    tecnicoResponsableId: z.number().optional(),
    descripcion: z.string().min(1),
    observaciones: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.tipo === "servicio_tecnico") {
      if (!val.equipo?.trim()) {
        ctx.addIssue({ code: "custom", path: ["equipo"], message: "El equipo es obligatorio." });
      }
    } else {
      if (!val.domicilio?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["domicilio"],
          message: "El domicilio es obligatorio.",
        });
      }
      if (!val.cantidadCamaras || val.cantidadCamaras < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["cantidadCamaras"],
          message: "La cantidad de cámaras es obligatoria.",
        });
      }
      // RN-11/RF10.1 — en cámaras el técnico responsable se asigna al alta.
      if (!val.tecnicoResponsableId) {
        ctx.addIssue({
          code: "custom",
          path: ["tecnicoResponsableId"],
          message: "El técnico responsable es obligatorio.",
        });
      }
    }
  });

// RF03.1/RF03.1.2/CU2 — reemplaza addOrden() del store viejo.
export const crearOrdenFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => crearOrdenSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tipoDb = TIPO_UI_TO_DB[data.tipo];
    const estadoDb = ESTADO_INICIAL[tipoDb];

    // RN-11/RF10.1 — en cámaras el técnico responsable se valida y asigna al
    // alta, en la misma transacción. En servicio técnico la orden nace sin
    // responsable (autoasignación posterior, T-14 rev. GESTECH_CAMBIOS_ASIGNACION.md).
    let tecnico: typeof usuarios.$inferSelect | undefined;
    if (tipoDb !== "SERVICIO_TECNICO") {
      tecnico = db.select().from(usuarios).where(eq(usuarios.id, data.tecnicoResponsableId!)).get();
      if (!tecnico || !tecnico.activo) throw new Error("Técnico responsable inválido o inactivo.");
    }

    // El número (T-04) se genera en su propia transacción atómica antes de
    // abrir la de alta: si el resto de la operación falla, el número queda
    // "quemado" (no se reutiliza), que es exactamente lo que exige RF03.1.1.
    const numero = siguienteNumeroOrden(db);

    const { orden, cliente } = db.transaction((tx) => {
      const clienteRow = upsertCliente(tx, {
        nombre: data.clienteNombre,
        apellido: data.clienteApellido,
        dni: data.dni,
        telefono: data.telefono,
        domicilio: data.domicilio,
      });
      const ordenRow = tx
        .insert(ordenesTrabajo)
        .values({
          id: numero,
          clienteId: clienteRow.id,
          tipoServicio: tipoDb,
          equipo: data.equipo?.trim() || null,
          cantidadCamaras: data.cantidadCamaras ?? null,
          tecnicoResponsableId: tecnico?.id ?? null,
          descripcionTrabajo: data.descripcion.trim(),
          fechaIngreso: new Date().toISOString().slice(0, 10),
          observaciones: data.observaciones?.trim() || null,
          estado: estadoDb,
        })
        .returning()
        .get();
      registrarHistorialEstado(tx, {
        ordenId: numero,
        estadoAnterior: null,
        estadoNuevo: estadoDb,
        usuarioId: context.usuario.id,
        automatico: false,
      });
      if (tecnico) {
        registrarAsignacionTecnico(tx, {
          ordenId: numero,
          tecnicoAsignadoId: tecnico.id,
          tecnicoAnteriorId: null,
          usuarioResponsableId: context.usuario.id,
          tipoAsignacion: "INICIAL",
        });
      }
      return { orden: ordenRow, cliente: clienteRow };
    });

    return toOrdenUi(orden, cliente);
  });

// T-12 — reserva/descuento de stock, disparados por el cambio de estado
// (spec §3.3), atómicos con él vía el hook `efectosExtra` de aplicarTransicion.
// Exportada (T-24): permite testear la aritmética de stock directo contra
// una transacción, sin pasar por el middleware de autenticación.
export function aplicarEfectosStock(
  tx: Tx,
  opts: { orden: OrdenRow; tipoDb: TipoServicioDb; estadoNuevo: EstadoOrdenDb; usuarioId: number },
) {
  if (opts.tipoDb === "SERVICIO_TECNICO") return; // RF11.7 — no consume stock

  const presupuesto = tx
    .select()
    .from(presupuestos)
    .where(eq(presupuestos.ordenId, opts.orden.id))
    .get();
  if (!presupuesto) return;

  if (opts.estadoNuevo === "APROBADO" || opts.estadoNuevo === "RECHAZADO") {
    tx.update(presupuestos)
      .set({ estado: opts.estadoNuevo, fechaRespuestaCliente: new Date().toISOString() })
      .where(eq(presupuestos.id, presupuesto.id))
      .run();
  }

  if (opts.estadoNuevo !== "APROBADO" && opts.estadoNuevo !== "FINALIZADO") return;

  const items = tx
    .select()
    .from(detallePresupuesto)
    .where(eq(detallePresupuesto.presupuestoId, presupuesto.id))
    .all();
  for (const item of items) {
    if (opts.estadoNuevo === "APROBADO") {
      tx.update(productos)
        .set({ stockReservado: sql`${productos.stockReservado} + ${item.cantidad}` })
        .where(eq(productos.id, item.productoId))
        .run();
      registrarMovimientoStock(tx, {
        productoId: item.productoId,
        tipoMovimiento: "RESERVA",
        cantidad: item.cantidad,
        ordenId: opts.orden.id,
        usuarioId: opts.usuarioId,
      });
    } else {
      tx.update(productos)
        .set({
          stock: sql`${productos.stock} - ${item.cantidad}`,
          stockReservado: sql`${productos.stockReservado} - ${item.cantidad}`,
        })
        .where(eq(productos.id, item.productoId))
        .run();
      registrarMovimientoStock(tx, {
        productoId: item.productoId,
        tipoMovimiento: "DESCUENTO_DEFINITIVO",
        cantidad: item.cantidad,
        ordenId: opts.orden.id,
        usuarioId: opts.usuarioId,
      });
    }
  }
}

const cambiarEstadoSchema = z.object({
  id: z.string(),
  nuevoEstado: z.string().refine((v): v is EstadoOrden => v in ESTADO_UI_TO_DB, "Estado inválido."),
  motivo: z.string().optional(),
});

// RN-11 (rev. GESTECH_CAMBIOS_ASIGNACION.md) — técnico responsable exigido
// desde PRESUPUESTADO en adelante. El chequeo real para ese primer paso vive
// en guardarPresupuestoFn (es el que de verdad dispara la transición, no
// pasa por cambiarEstadoOrdenFn); PRESUPUESTADO queda acá también en
// defensa, por si ese camino cambia.
const ESTADOS_REQUIEREN_TECNICO = new Set<EstadoOrdenDb>([
  "PRESUPUESTADO",
  "APROBADO",
  "EN_PROCESO",
  "PENDIENTE_DE_RETIRO",
  "ENTREGADO",
  "FINALIZADO",
]);

// RF04/CU4 — también cubre "confirmar/rechazar presupuesto" (CU5): el
// cliente respondiendo es, ni más ni menos, un cambio de estado a
// aprobado/rechazado, igual que en el store viejo.
export const cambiarEstadoOrdenFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => cambiarEstadoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orden = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, data.id)).get();
    if (!orden) throw new Error("Orden no encontrada.");
    const tipoDb = orden.tipoServicio as TipoServicioDb;
    const estadoNuevo = ESTADO_UI_TO_DB[data.nuevoEstado as EstadoOrden];

    if (!transicionValida(tipoDb, orden.estado, estadoNuevo)) {
      throw new Error(
        `Transición no permitida: ${ESTADO_DB_TO_UI[orden.estado as EstadoOrdenDb]} → ${data.nuevoEstado}.`,
      );
    }
    // RN-11/T-14 — a partir de APROBADO (y en adelante) la orden debe tener
    // un técnico responsable asignado.
    if (ESTADOS_REQUIEREN_TECNICO.has(estadoNuevo) && !orden.tecnicoResponsableId) {
      throw new Error("Asigná un técnico responsable antes de continuar (RN-11).");
    }
    // PRESUPUESTADO es alcanzable también desde este selector genérico (no
    // solo desde el formulario de presupuesto de guardarPresupuestoFn): el
    // bloqueo duro tiene que valer sin importar el camino, si no queda un
    // atajo para saltearlo.
    if (
      estadoNuevo === "PRESUPUESTADO" &&
      !puedePresupuestar(orden.tecnicoResponsableId, context.usuario)
    ) {
      throw new Error("Solo el técnico responsable puede presupuestar esta orden.");
    }
    // Decisión de implementación (a pedido del usuario): un Técnico que no
    // es el responsable de la orden puede igual cambiarle el estado, pero
    // con fricción — exige un motivo, que queda como marca en el historial
    // de que lo hizo alguien fuera de asignación. El Administrador no tiene
    // esta restricción.
    const motivoRequerido = requiereMotivoDeCambio(orden.tecnicoResponsableId, context.usuario);
    if (motivoRequerido && !data.motivo?.trim()) {
      throw new Error("Esta orden está a cargo de otro técnico: indicá un motivo para continuar.");
    }

    aplicarTransicion(
      db,
      {
        ordenId: orden.id,
        tipoServicio: tipoDb,
        estadoActual: orden.estado,
        estadoNuevo,
        usuarioId: context.usuario.id,
        automatico: false,
        motivo: motivoRequerido ? data.motivo!.trim() : null,
      },
      (tx) => {
        aplicarEfectosStock(tx, {
          orden,
          tipoDb,
          estadoNuevo,
          usuarioId: context.usuario.id,
        });
        // RF13.2 — el sub-estado es informativo y solo vale dentro de
        // EN_PROCESO: se limpia al salir, sin afectar el estado principal.
        if (orden.estado === "EN_PROCESO" && estadoNuevo !== "EN_PROCESO") {
          tx.update(ordenesTrabajo)
            .set({ subEstado: null })
            .where(eq(ordenesTrabajo.id, orden.id))
            .run();
        }
      },
    );

    return obtenerOrdenFn({ data: { id: orden.id } });
  });

// RF13.2/T-20 — sub-estado informativo, solo dentro de EN_PROCESO.
const actualizarSubEstadoSchema = z.object({
  ordenId: z.string(),
  subEstado: z.enum(["diagnostico", "esperando_repuesto", "en_reparacion", "pruebas_finales"]),
});

export const actualizarSubEstadoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => actualizarSubEstadoSchema.parse(d))
  .handler(async ({ data }) => {
    const orden = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, data.ordenId)).get();
    if (!orden) throw new Error("Orden no encontrada.");
    if (orden.estado !== "EN_PROCESO") {
      throw new Error("El sub-estado solo se puede editar mientras la orden está En proceso.");
    }
    db.update(ordenesTrabajo)
      .set({ subEstado: data.subEstado })
      .where(eq(ordenesTrabajo.id, orden.id))
      .run();
    return { ok: true };
  });

const itemPresupuestoSchema = z.object({
  productoId: z.number(),
  cantidad: z.number().int().positive(),
});

const guardarPresupuestoSchema = z.object({
  ordenId: z.string(),
  detalle: z.string().min(1),
  manoObra: z.number().min(0),
  items: z.array(itemPresupuestoSchema).default([]),
});

// RF11.3/2.5.1 — valida disponibilidad ANTES de tocar la base y congela el
// precio unitario en cada línea (RF11.6). Exportada (T-24): permite testear
// la validación de stock sin pasar por el middleware de autenticación.
export function calcularLineasPresupuesto(
  db: typeof dbInstance,
  tipoDb: TipoServicioDb,
  items: { productoId: number; cantidad: number }[],
) {
  let subtotalMateriales = 0;
  const lineas: {
    productoId: number;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
  }[] = [];
  if (tipoDb !== "SERVICIO_TECNICO") {
    for (const item of items) {
      const producto = db.select().from(productos).where(eq(productos.id, item.productoId)).get();
      if (!producto) throw new Error("Producto no encontrado.");
      const disponible = producto.stock - producto.stockReservado;
      if (item.cantidad > disponible) {
        throw new Error(
          `Stock insuficiente de "${producto.nombre}": disponible ${disponible}, solicitado ${item.cantidad}.`,
        );
      }
      const subtotal = producto.precio * item.cantidad;
      subtotalMateriales += subtotal;
      lineas.push({
        productoId: item.productoId,
        cantidad: item.cantidad,
        precioUnitario: producto.precio,
        subtotal,
      });
    }
  }
  return { lineas, subtotalMateriales };
}

// T-11/CU4 2.1–2.5 — carga de presupuesto, con productos en cámaras.
export const guardarPresupuestoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => guardarPresupuestoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orden = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, data.ordenId)).get();
    if (!orden) throw new Error("Orden no encontrada.");
    const tipoDb = orden.tipoServicio as TipoServicioDb;
    const estadoNuevo: EstadoOrdenDb = "PRESUPUESTADO";
    if (!transicionValida(tipoDb, orden.estado, estadoNuevo)) {
      throw new Error(
        `No se puede presupuestar una orden en estado ${ESTADO_DB_TO_UI[orden.estado as EstadoOrdenDb]}.`,
      );
    }
    // RN-11/RF10.3 (rev. GESTECH_CAMBIOS_ASIGNACION.md) — este es el punto
    // real de entrada a PRESUPUESTADO (no pasa por cambiarEstadoOrdenFn).
    if (!orden.tecnicoResponsableId) {
      throw new Error("Debe asignarse un técnico responsable antes de presupuestar.");
    }
    // Decisión de implementación (a pedido del usuario): presupuestar implica
    // diagnosticar el equipo y comprometer un monto con el cliente — a
    // diferencia del resto de las transiciones, acá NO hay override posible.
    // Bloqueo duro para quien no sea el técnico responsable de la orden.
    if (!puedePresupuestar(orden.tecnicoResponsableId, context.usuario)) {
      throw new Error("Solo el técnico responsable puede presupuestar esta orden.");
    }

    const { lineas, subtotalMateriales } = calcularLineasPresupuesto(db, tipoDb, data.items);
    const montoTotal = subtotalMateriales + data.manoObra;

    aplicarTransicion(
      db,
      {
        ordenId: orden.id,
        tipoServicio: tipoDb,
        estadoActual: orden.estado,
        estadoNuevo,
        usuarioId: context.usuario.id,
        automatico: false,
      },
      (tx) => {
        const existente = tx
          .select()
          .from(presupuestos)
          .where(eq(presupuestos.ordenId, orden.id))
          .get();
        let presupuestoId: number;
        if (existente) {
          tx.update(presupuestos)
            .set({
              detalle: data.detalle.trim(),
              montoManoObra: data.manoObra,
              subtotalMateriales,
              montoTotal,
              estado: "PENDIENTE",
              fechaRespuestaCliente: null,
            })
            .where(eq(presupuestos.id, existente.id))
            .run();
          presupuestoId = existente.id;
          tx.delete(detallePresupuesto)
            .where(eq(detallePresupuesto.presupuestoId, presupuestoId))
            .run();
        } else {
          presupuestoId = tx
            .insert(presupuestos)
            .values({
              ordenId: orden.id,
              detalle: data.detalle.trim(),
              montoManoObra: data.manoObra,
              subtotalMateriales,
              montoTotal,
              estado: "PENDIENTE",
            })
            .returning()
            .get().id;
        }
        for (const l of lineas) {
          tx.insert(detallePresupuesto)
            .values({
              presupuestoId,
              productoId: l.productoId,
              cantidad: l.cantidad,
              precioUnitario: l.precioUnitario,
              subtotal: l.subtotal,
            })
            .run();
        }
        registrarAuditoria(tx, {
          tipoOperacion: existente ? "MODIFICACION_PRESUPUESTO" : "CARGA_PRESUPUESTO",
          entidadAfectada: "Presupuesto",
          idEntidad: String(presupuestoId),
          descripcion: `Presupuesto de la orden ${orden.id} por $${montoTotal}.`,
          usuarioId: context.usuario.id,
        });
      },
    );

    return { ok: true, montoTotal };
  });

const registrarCumplimentacionSchema = z.object({
  ordenId: z.string(),
  fechaRealizacion: z.string().min(1),
  descripcionTareas: z.string().min(1),
  tecnicoEjecutorId: z.number(),
  montoCobrado: z.number().min(0),
  metodoPago: z.enum(["efectivo", "transferencia", "tarjeta_credito", "tarjeta_debito"]),
  tipoGarantia: z.enum([
    "mantenimiento_software",
    "hardware_reparacion",
    "mantenimiento_camaras",
    "instalacion_camaras",
  ]),
});

// CU3/RF03.2 — registra cumplimentación + garantía + comprobante. Requiere
// que la orden esté en ENTREGADO (servicio técnico) o FINALIZADO (cámaras) —
// RF03.2.1, sin excepciones aunque parezca "fuera de orden" (ver la nota de
// alcance de la spec).
export const registrarCumplimentacionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => registrarCumplimentacionSchema.parse(d))
  .handler(async ({ data }) => {
    const orden = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, data.ordenId)).get();
    if (!orden) throw new Error("Orden no encontrada.");
    const estadoRequerido: EstadoOrdenDb =
      orden.tipoServicio === "SERVICIO_TECNICO" ? "ENTREGADO" : "FINALIZADO";
    if (orden.estado !== estadoRequerido) {
      throw new Error(
        `La orden debe estar en estado ${ESTADO_DB_TO_UI[estadoRequerido]} para registrar la cumplimentación.`,
      );
    }
    const yaExiste = db
      .select()
      .from(cumplimentaciones)
      .where(eq(cumplimentaciones.ordenId, orden.id))
      .get();
    if (yaExiste) throw new Error("Esta orden ya fue cumplimentada.");

    const garantiaInfo = calcularGarantia(data.tipoGarantia, data.fechaRealizacion);
    const plazoDias = Math.round(
      (new Date(garantiaInfo.vence).getTime() - new Date(garantiaInfo.inicio).getTime()) / 86400000,
    );
    const numeroComprobante = siguienteNumeroComprobante(db);
    // RF15.2 — la orden generada por un reclamo de garantía no se cobra,
    // más allá de lo que mande el cliente.
    const montoCobrado = orden.bajoGarantia ? 0 : data.montoCobrado;

    db.transaction((tx) => {
      const cumpl = tx
        .insert(cumplimentaciones)
        .values({
          ordenId: orden.id,
          fechaRealizacion: data.fechaRealizacion,
          descripcionTareas: data.descripcionTareas.trim(),
          tecnicoEjecutorId: data.tecnicoEjecutorId,
          montoCobrado,
          metodoPago: metodoPagoADb(data.metodoPago),
          tipoGarantia: data.tipoGarantia,
        })
        .returning()
        .get();

      tx.insert(garantias)
        .values({
          cumplimentacionId: cumpl.id,
          tipoGarantia: data.tipoGarantia,
          plazoDias,
          fechaInicio: garantiaInfo.inicio,
          fechaVencimiento: garantiaInfo.vence,
        })
        .run();

      tx.insert(comprobantes)
        .values({ numeroComprobante, cumplimentacionId: cumpl.id, total: montoCobrado })
        .run();
    });

    return { ok: true, comprobanteNro: numeroComprobante };
  });

// T-14/RF10 — GESTECH_CAMBIOS_ASIGNACION.md redefine la asignación con un
// modelo mixto: autoasignación (servicio técnico, sin responsable) y
// reasignación (Administrador, orden ya asignada) son operaciones distintas
// con reglas y permisos propios — reemplaza el antiguo asignarTecnicoFn
// (único endpoint, abierto a cualquiera, sin distinguir ambos casos).

// Exportado para poder testear la guarda de condición de carrera (T-24)
// directo contra la base, sin pasar por authMiddleware.
export function autoasignarTecnicoCore(
  db: typeof dbInstance,
  opts: { ordenId: string; usuarioId: number },
): { ok: true } | { ok: false; motivo: string } {
  const orden = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, opts.ordenId)).get();
  if (!orden) return { ok: false, motivo: "Orden no encontrada." };
  if (orden.tipoServicio !== "SERVICIO_TECNICO") {
    return { ok: false, motivo: "La autoasignación solo aplica a órdenes de servicio técnico." };
  }
  // Ningún estado terminal admite autoasignación: el ciclo de vida de la
  // orden ya cerró (ENTREGADO/ABANDONADO/RECHAZADO/ANULADO) y no hay ningún
  // paso operativo siguiente posible. Cubre en particular las órdenes
  // abandonadas sembradas antes de que existiera la asignación obligatoria
  // de técnico, que quedaron sin responsable.
  if (ESTADOS_TERMINALES.SERVICIO_TECNICO.includes(orden.estado)) {
    return { ok: false, motivo: "La orden ya está en un estado final: no admite autoasignación." };
  }
  const yaCumplimentada = db
    .select()
    .from(cumplimentaciones)
    .where(eq(cumplimentaciones.ordenId, orden.id))
    .get();
  if (yaCumplimentada) return { ok: false, motivo: "La orden ya está cumplimentada." };

  let resultado: { ok: true } | { ok: false; motivo: string } = {
    ok: false,
    motivo: "No se pudo autoasignar.",
  };
  db.transaction((tx) => {
    // Update condicionado por `tecnicoResponsableId IS NULL`: un solo
    // statement atómico, sin SELECT-then-UPDATE de por medio — es la guarda
    // real contra dos técnicos tomando la misma orden a la vez.
    const cambios = tx
      .update(ordenesTrabajo)
      .set({ tecnicoResponsableId: opts.usuarioId })
      .where(and(eq(ordenesTrabajo.id, opts.ordenId), isNull(ordenesTrabajo.tecnicoResponsableId)))
      .run();
    if (cambios.changes === 0) {
      resultado = { ok: false, motivo: "La orden ya tiene un técnico responsable asignado." };
      return;
    }
    registrarAsignacionTecnico(tx, {
      ordenId: opts.ordenId,
      tecnicoAsignadoId: opts.usuarioId,
      tecnicoAnteriorId: null,
      usuarioResponsableId: opts.usuarioId,
      tipoAsignacion: "AUTOASIGNACION",
    });
    // RF16.6 — se resuelve sola al asignarse un responsable.
    tx.update(alertas)
      .set({ estado: "RESUELTA" })
      .where(and(eq(alertas.ordenId, opts.ordenId), eq(alertas.tipo, "ORDEN_SIN_ASIGNAR")))
      .run();
    resultado = { ok: true };
  });
  return resultado;
}

export const autoasignarTecnicoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ ordenId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    // RF10.2 — la matriz de permisos marca esta fila exclusiva del Técnico
    // (a diferencia del resto de la spec, donde el Administrador hereda
    // todo lo del Técnico): un Admin no se "autoasigna" trabajo operativo.
    if (context.usuario.rol !== "TECNICO") {
      throw new Error("Solo un Técnico puede autoasignarse una orden.");
    }
    const resultado = autoasignarTecnicoCore(db, {
      ordenId: data.ordenId,
      usuarioId: context.usuario.id,
    });
    if (!resultado.ok) throw new Error(resultado.motivo);
    return obtenerOrdenFn({ data: { id: data.ordenId } });
  });

const reasignarTecnicoSchema = z.object({
  ordenId: z.string(),
  tecnicoId: z.number(),
  motivo: z.string().min(1, "El motivo es obligatorio."),
});

// RF10.4 — reasignar una orden YA asignada es exclusivo del Administrador.
export const reasignarTecnicoFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => reasignarTecnicoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orden = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, data.ordenId)).get();
    if (!orden) throw new Error("Orden no encontrada.");
    const yaCumplimentada = db
      .select()
      .from(cumplimentaciones)
      .where(eq(cumplimentaciones.ordenId, orden.id))
      .get();
    if (yaCumplimentada) throw new Error("La orden ya está cumplimentada: no se puede reasignar.");
    if (!orden.tecnicoResponsableId) {
      throw new Error("La orden todavía no tiene técnico responsable: usá la autoasignación.");
    }
    const tecnico = db.select().from(usuarios).where(eq(usuarios.id, data.tecnicoId)).get();
    if (!tecnico || !tecnico.activo) throw new Error("Técnico inválido o inactivo.");

    db.transaction((tx) => {
      tx.update(ordenesTrabajo)
        .set({ tecnicoResponsableId: data.tecnicoId })
        .where(eq(ordenesTrabajo.id, orden.id))
        .run();
      registrarAsignacionTecnico(tx, {
        ordenId: orden.id,
        tecnicoAsignadoId: data.tecnicoId,
        tecnicoAnteriorId: orden.tecnicoResponsableId,
        usuarioResponsableId: context.usuario.id,
        motivo: data.motivo.trim(),
        tipoAsignacion: "REASIGNACION",
      });
    });

    return obtenerOrdenFn({ data: { id: orden.id } });
  });

export const obtenerAsignacionesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ ordenId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const filas = db
      .select()
      .from(asignacionTecnico)
      .where(eq(asignacionTecnico.ordenId, data.ordenId))
      .orderBy(desc(asignacionTecnico.fechaHora))
      .all();
    const idsUsuarios = new Set<number>();
    for (const f of filas) {
      idsUsuarios.add(f.tecnicoAsignadoId);
      if (f.tecnicoAnteriorId) idsUsuarios.add(f.tecnicoAnteriorId);
      idsUsuarios.add(f.usuarioResponsableId);
    }
    const usuariosPorId = new Map(
      db
        .select()
        .from(usuarios)
        .all()
        .filter((u) => idsUsuarios.has(u.id))
        .map((u) => [u.id, `${u.nombre} ${u.apellido}`]),
    );
    return filas.map((f) => ({
      id: f.id,
      fecha: f.fechaHora,
      tecnicoAsignado: usuariosPorId.get(f.tecnicoAsignadoId) ?? `#${f.tecnicoAsignadoId}`,
      tecnicoAnterior: f.tecnicoAnteriorId
        ? (usuariosPorId.get(f.tecnicoAnteriorId) ?? null)
        : null,
      usuarioResponsable: usuariosPorId.get(f.usuarioResponsableId) ?? `#${f.usuarioResponsableId}`,
      tipoAsignacion: f.tipoAsignacion,
      motivo: f.motivo,
    }));
  });

// T-15/RF17/CU15 — anulación de orden. Exclusivo del Administrador.
function liberarReservaSiCorresponde(tx: Tx, orden: OrdenRow, usuarioId: number) {
  // Solo hay reserva viva entre APROBADO y EN_PROCESO: en FINALIZADO el
  // stock ya se descontó definitivamente (no hay nada que liberar).
  if (orden.estado !== "APROBADO" && orden.estado !== "EN_PROCESO") return;
  const presupuesto = tx
    .select()
    .from(presupuestos)
    .where(eq(presupuestos.ordenId, orden.id))
    .get();
  if (!presupuesto || presupuesto.estado !== "APROBADO") return;
  const items = tx
    .select()
    .from(detallePresupuesto)
    .where(eq(detallePresupuesto.presupuestoId, presupuesto.id))
    .all();
  for (const item of items) {
    tx.update(productos)
      .set({ stockReservado: sql`${productos.stockReservado} - ${item.cantidad}` })
      .where(eq(productos.id, item.productoId))
      .run();
    registrarMovimientoStock(tx, {
      productoId: item.productoId,
      tipoMovimiento: "LIBERACION",
      cantidad: item.cantidad,
      ordenId: orden.id,
      usuarioId,
    });
  }
}

const anularOrdenSchema = z.object({
  ordenId: z.string(),
  motivo: z.string().min(1, "El motivo es obligatorio."),
});

export const anularOrdenFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => anularOrdenSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orden = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, data.ordenId)).get();
    if (!orden) throw new Error("Orden no encontrada.");
    if (orden.estado === "ANULADO") throw new Error("La orden ya está anulada.");
    const yaCumplimentada = db
      .select()
      .from(cumplimentaciones)
      .where(eq(cumplimentaciones.ordenId, orden.id))
      .get();
    // RN-13/RF17.3 — no pueden anularse órdenes cumplimentadas.
    if (yaCumplimentada) throw new Error("No se puede anular una orden ya cumplimentada.");

    const tipoDb = orden.tipoServicio as TipoServicioDb;
    const ahora = new Date().toISOString();

    aplicarTransicion(
      db,
      {
        ordenId: orden.id,
        tipoServicio: tipoDb,
        estadoActual: orden.estado,
        estadoNuevo: "ANULADO",
        usuarioId: context.usuario.id,
        automatico: false,
      },
      (tx) => {
        liberarReservaSiCorresponde(tx, orden, context.usuario.id);
        tx.update(ordenesTrabajo)
          .set({ motivoAnulacion: data.motivo.trim(), fechaAnulacion: ahora })
          .where(eq(ordenesTrabajo.id, orden.id))
          .run();
        registrarAuditoria(tx, {
          tipoOperacion: "ANULACION_ORDEN",
          entidadAfectada: "OrdenTrabajo",
          idEntidad: orden.id,
          descripcion: `Orden ${orden.id} anulada. Motivo: ${data.motivo.trim()}`,
          usuarioId: context.usuario.id,
        });
      },
    );

    return obtenerOrdenFn({ data: { id: orden.id } });
  });

// T-17/RF15/RN-12/CU14 — reclamo de garantía.
const registrarReclamoSchema = z.object({
  ordenOriginalId: z.string(),
  fallaCoincide: z.boolean(),
  presentaComprobante: z.boolean(),
  danosFisicos: z.boolean(),
  danosLiquidos: z.boolean(),
  alteracionTerceros: z.boolean(),
  observaciones: z.string().min(1, "Ingresá las observaciones de la inspección."),
});

export const registrarReclamoGarantiaFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => registrarReclamoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const original = db
      .select()
      .from(ordenesTrabajo)
      .where(eq(ordenesTrabajo.id, data.ordenOriginalId))
      .get();
    if (!original) throw new Error("Orden original no encontrada.");
    const cumplimentacion = db
      .select()
      .from(cumplimentaciones)
      .where(eq(cumplimentaciones.ordenId, original.id))
      .get();
    if (!cumplimentacion) throw new Error("La orden original no está cumplimentada.");
    const garantia = db
      .select()
      .from(garantias)
      .where(eq(garantias.cumplimentacionId, cumplimentacion.id))
      .get();
    if (!garantia) throw new Error("La orden original no tiene garantía registrada.");

    // RN-05 (plazo vigente) + RN-06 (falla coincide, comprobante presentado)
    // + RN-07 (ausencia de causales de anulación).
    const vigente = new Date(garantia.fechaVencimiento) >= new Date();
    const causal = data.danosFisicos || data.danosLiquidos || data.alteracionTerceros;
    const aceptado = vigente && data.fallaCoincide && data.presentaComprobante && !causal;

    if (!aceptado) {
      const motivos: string[] = [];
      if (!vigente) motivos.push("garantía vencida");
      if (!data.fallaCoincide) motivos.push("la falla no coincide con la original");
      if (!data.presentaComprobante) motivos.push("no se presentó el comprobante");
      if (data.danosFisicos) motivos.push("daños físicos posteriores a la entrega");
      if (data.danosLiquidos) motivos.push("daños por líquidos o sobretensión");
      if (data.alteracionTerceros) motivos.push("signos de desarme o alteración por terceros");
      const motivoRechazo = motivos.join("; ");
      db.insert(reclamosGarantia)
        .values({
          ordenOriginalId: original.id,
          observacionesInspeccion: data.observaciones.trim(),
          resultado: "RECHAZADO",
          motivoRechazo,
          usuarioRegistroId: context.usuario.id,
        })
        .run();
      return { aceptado: false as const, motivo: motivoRechazo };
    }

    const tipoDb = original.tipoServicio as TipoServicioDb;
    const estadoDb = ESTADO_INICIAL[tipoDb];
    const numero = siguienteNumeroOrden(db);

    const nuevaOrden = db.transaction((tx) => {
      const fila = tx
        .insert(ordenesTrabajo)
        .values({
          id: numero,
          clienteId: original.clienteId,
          tipoServicio: original.tipoServicio,
          equipo: original.equipo,
          cantidadCamaras: original.cantidadCamaras,
          descripcionTrabajo: `Reclamo de garantía de la orden ${original.id}. ${data.observaciones.trim()}`,
          fechaIngreso: new Date().toISOString().slice(0, 10),
          estado: estadoDb,
          ordenOriginalId: original.id,
          bajoGarantia: true,
        })
        .returning()
        .get();
      registrarHistorialEstado(tx, {
        ordenId: numero,
        estadoAnterior: null,
        estadoNuevo: estadoDb,
        usuarioId: context.usuario.id,
        automatico: false,
      });
      tx.insert(reclamosGarantia)
        .values({
          ordenOriginalId: original.id,
          ordenGeneradaId: numero,
          observacionesInspeccion: data.observaciones.trim(),
          resultado: "ACEPTADO",
          usuarioRegistroId: context.usuario.id,
        })
        .run();
      return fila;
    });

    return { aceptado: true as const, ordenGeneradaId: nuevaOrden.id };
  });
