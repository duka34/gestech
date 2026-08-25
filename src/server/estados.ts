import { eq } from "drizzle-orm";
import { registrarHistorialEstado } from "./audit";
import type { db as dbInstance } from "./db";
import { ordenesTrabajo } from "./schema";

// T-02 — Máquina de estados centralizada (GESTECH_SPEC.md §3.1 y §3.2).
// Único lugar del sistema que decide si una transición de estado es válida.
// Toda transición no listada aquí DEBE rechazarse con un error explícito.

export type TipoServicio = "SERVICIO_TECNICO" | "INSTALACION_CAMARAS" | "MANTENIMIENTO_CAMARAS";

const TRANSICIONES_SERVICIO_TECNICO: Record<string, readonly string[]> = {
  INGRESADO: ["PRESUPUESTADO"],
  PRESUPUESTADO: ["APROBADO", "RECHAZADO"],
  APROBADO: ["EN_PROCESO"],
  EN_PROCESO: ["PENDIENTE_DE_RETIRO"],
  PENDIENTE_DE_RETIRO: ["ENTREGADO", "ABANDONADO"],
};

// Instalación y mantenimiento de cámaras comparten la misma máquina (§3.2).
const TRANSICIONES_CAMARAS: Record<string, readonly string[]> = {
  AGENDADO: ["PRESUPUESTADO"],
  PRESUPUESTADO: ["APROBADO", "RECHAZADO"],
  APROBADO: ["EN_PROCESO"],
  EN_PROCESO: ["FINALIZADO"],
};

export const ESTADO_INICIAL: Record<TipoServicio, string> = {
  SERVICIO_TECNICO: "INGRESADO",
  INSTALACION_CAMARAS: "AGENDADO",
  MANTENIMIENTO_CAMARAS: "AGENDADO",
};

export const ESTADOS_TERMINALES: Record<TipoServicio, readonly string[]> = {
  SERVICIO_TECNICO: ["ENTREGADO", "ABANDONADO", "RECHAZADO", "ANULADO"],
  INSTALACION_CAMARAS: ["FINALIZADO", "RECHAZADO", "ANULADO"],
  MANTENIMIENTO_CAMARAS: ["FINALIZADO", "RECHAZADO", "ANULADO"],
};

function tablaTransiciones(tipoServicio: TipoServicio) {
  return tipoServicio === "SERVICIO_TECNICO" ? TRANSICIONES_SERVICIO_TECNICO : TRANSICIONES_CAMARAS;
}

/**
 * `ANULADO` es alcanzable desde cualquier estado no anulado (RF17.4), pero la
 * precondición "sin cumplimentación" (RN-13) vive en la tabla `cumplimentaciones`,
 * que este módulo no conoce — es responsabilidad del llamador (Fase 3, T-15)
 * verificarla antes de invocar `aplicarTransicion`.
 */
export function transicionValida(
  tipoServicio: TipoServicio,
  estadoActual: string | null,
  estadoNuevo: string,
): boolean {
  if (estadoActual === null) return estadoNuevo === ESTADO_INICIAL[tipoServicio];
  if (estadoNuevo === "ANULADO") return estadoActual !== "ANULADO";
  const destinos = tablaTransiciones(tipoServicio)[estadoActual];
  return !!destinos && destinos.includes(estadoNuevo);
}

export class TransicionInvalidaError extends Error {}

export type Tx = Parameters<Parameters<typeof dbInstance.transaction>[0]>[0];

/**
 * Aplica una transición de estado dentro de una única transacción: valida,
 * escribe el nuevo estado, aplica los efectos colaterales ya disponibles en
 * esta fase (sellar `fechaNotificacionRetiro`) y registra `HistorialEstado`
 * sin excepción (regla transversal §9.5). `efectosExtra`, si se pasa, corre
 * dentro de la misma transacción — así el llamador (p. ej. la reserva o el
 * descuento de stock de T-12, en `fn/ordenes.ts`) queda atómico con el
 * cambio de estado en vez de ser un paso aparte. El envío por WhatsApp y las
 * alertas (spec §3.3) siguen pendientes de Fase 4.
 */
export function aplicarTransicion(
  db: typeof dbInstance,
  opts: {
    ordenId: string;
    tipoServicio: TipoServicio;
    estadoActual: string;
    estadoNuevo: string;
    usuarioId: number | null;
    automatico: boolean;
    motivo?: string | null;
  },
  efectosExtra?: (tx: Tx) => void,
) {
  if (!transicionValida(opts.tipoServicio, opts.estadoActual, opts.estadoNuevo)) {
    throw new TransicionInvalidaError(
      `Transición no permitida: ${opts.estadoActual} → ${opts.estadoNuevo} (${opts.tipoServicio}).`,
    );
  }

  db.transaction((tx) => {
    const patch: Partial<typeof ordenesTrabajo.$inferInsert> = { estado: opts.estadoNuevo };
    if (opts.estadoNuevo === "PENDIENTE_DE_RETIRO") {
      patch.fechaNotificacionRetiro = new Date().toISOString();
    }
    tx.update(ordenesTrabajo).set(patch).where(eq(ordenesTrabajo.id, opts.ordenId)).run();
    registrarHistorialEstado(tx, {
      ordenId: opts.ordenId,
      estadoAnterior: opts.estadoActual,
      estadoNuevo: opts.estadoNuevo,
      usuarioId: opts.usuarioId,
      automatico: opts.automatico,
      motivo: opts.motivo,
    });
    efectosExtra?.(tx);
  });
}
