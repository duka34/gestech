import type { db as dbInstance } from "./db";
import { asignacionTecnico, historialEstado, movimientoStock, registroAuditoria } from "./schema";

// T-01 — Auditoría. Todas las funciones de este archivo son de solo
// inserción: el sistema nunca expone UPDATE ni DELETE sobre estas tablas
// (RNF09, regla transversal §9.7 de la spec).

// Acepta tanto la conexión principal como el `tx` que entrega
// `db.transaction(...)` — difieren en un par de propiedades internas
// (p. ej. `$client`) pero exponen la misma API de consultas.
type Tx = Parameters<Parameters<typeof dbInstance.transaction>[0]>[0];
type DbOrTx = typeof dbInstance | Tx;

export function registrarHistorialEstado(
  db: DbOrTx,
  data: {
    ordenId: string;
    estadoAnterior: string | null;
    estadoNuevo: string;
    usuarioId: number | null;
    automatico: boolean;
    motivo?: string | null;
  },
) {
  db.insert(historialEstado)
    .values({
      ordenId: data.ordenId,
      estadoAnterior: data.estadoAnterior,
      estadoNuevo: data.estadoNuevo,
      usuarioId: data.usuarioId,
      automatico: data.automatico,
      motivo: data.motivo ?? null,
    })
    .run();
}

export function registrarAsignacionTecnico(
  db: DbOrTx,
  data: {
    ordenId: string;
    tecnicoAsignadoId: number;
    tecnicoAnteriorId: number | null;
    usuarioResponsableId: number;
    tipoAsignacion: "INICIAL" | "AUTOASIGNACION" | "REASIGNACION" | "REASIGNACION_POR_BAJA";
    motivo?: string | null;
  },
) {
  db.insert(asignacionTecnico)
    .values({
      ordenId: data.ordenId,
      tecnicoAsignadoId: data.tecnicoAsignadoId,
      tecnicoAnteriorId: data.tecnicoAnteriorId,
      usuarioResponsableId: data.usuarioResponsableId,
      tipoAsignacion: data.tipoAsignacion,
      motivo: data.motivo ?? null,
    })
    .run();
}

export function registrarMovimientoStock(
  db: DbOrTx,
  data: {
    productoId: number;
    tipoMovimiento:
      "RESERVA" | "LIBERACION" | "DESCUENTO_DEFINITIVO" | "REPOSICION" | "AJUSTE_MANUAL";
    cantidad: number;
    ordenId: string | null;
    usuarioId: number | null;
  },
) {
  db.insert(movimientoStock)
    .values({
      productoId: data.productoId,
      tipoMovimiento: data.tipoMovimiento,
      cantidad: data.cantidad,
      ordenId: data.ordenId,
      usuarioId: data.usuarioId,
    })
    .run();
}

export function registrarAuditoria(
  db: DbOrTx,
  data: {
    tipoOperacion: "ANULACION_ORDEN" | "CARGA_PRESUPUESTO" | "MODIFICACION_PRESUPUESTO";
    entidadAfectada: string;
    idEntidad: string;
    descripcion: string;
    usuarioId: number;
  },
) {
  db.insert(registroAuditoria)
    .values({
      tipoOperacion: data.tipoOperacion,
      entidadAfectada: data.entidadAfectada,
      idEntidad: data.idEntidad,
      descripcion: data.descripcion,
      usuarioId: data.usuarioId,
    })
    .run();
}
