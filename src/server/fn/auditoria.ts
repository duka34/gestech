import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { adminMiddleware } from "../auth";
import { db } from "../db";
import {
  asignacionTecnico,
  historialEstado,
  movimientoStock,
  presupuestos,
  productos,
  registroAuditoria,
  usuarios,
} from "../schema";

// T-23/RNF09 — pantalla única de auditoría del Administrador: unifica las 4
// tablas de solo-escritura (spec §2.14) en una lista cronológica de eventos.

export type TipoEventoAuditoria = "estado" | "asignacion" | "stock" | "auditoria";

export type EventoAuditoria = {
  id: string;
  tipo: TipoEventoAuditoria;
  fechaHora: string;
  ordenId: string | null;
  resumen: string;
  usuario: string;
};

const TIPO_MOVIMIENTO_LABEL: Record<string, string> = {
  RESERVA: "Reserva de stock",
  LIBERACION: "Liberación de stock",
  DESCUENTO_DEFINITIVO: "Descuento definitivo de stock",
  REPOSICION: "Reposición de stock",
  AJUSTE_MANUAL: "Ajuste manual de stock",
};

const TIPO_OPERACION_LABEL: Record<string, string> = {
  ANULACION_ORDEN: "Anulación de orden",
  CARGA_PRESUPUESTO: "Carga de presupuesto",
  MODIFICACION_PRESUPUESTO: "Modificación de presupuesto",
};

export const listarAuditoriaFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => {
    const nombresUsuario = new Map(
      db
        .select()
        .from(usuarios)
        .all()
        .map((u) => [u.id, `${u.nombre} ${u.apellido}`]),
    );
    const nombresProducto = new Map(
      db
        .select()
        .from(productos)
        .all()
        .map((p) => [p.id, p.nombre]),
    );
    // Resuelve `registroAuditoria` (entidadAfectada="Presupuesto") a su orden.
    const ordenPorPresupuesto = new Map(
      db
        .select({ id: presupuestos.id, ordenId: presupuestos.ordenId })
        .from(presupuestos)
        .all()
        .map((p) => [p.id, p.ordenId]),
    );
    const usuario = (id: number | null) =>
      id == null ? "Sistema (automático)" : (nombresUsuario.get(id) ?? `#${id}`);

    const eventos: EventoAuditoria[] = [];

    for (const h of db
      .select()
      .from(historialEstado)
      .orderBy(desc(historialEstado.fechaHora))
      .all()) {
      eventos.push({
        id: `estado-${h.id}`,
        tipo: "estado",
        fechaHora: h.fechaHora,
        ordenId: h.ordenId,
        resumen: `Cambio de estado: ${h.estadoAnterior ?? "—"} → ${h.estadoNuevo}${h.automatico ? " (automático)" : ""}${h.motivo ? ` — fuera de asignación: "${h.motivo}"` : ""}`,
        usuario: usuario(h.usuarioId),
      });
    }

    for (const a of db
      .select()
      .from(asignacionTecnico)
      .orderBy(desc(asignacionTecnico.fechaHora))
      .all()) {
      const anterior = a.tecnicoAnteriorId ? nombresUsuario.get(a.tecnicoAnteriorId) : null;
      eventos.push({
        id: `asignacion-${a.id}`,
        tipo: "asignacion",
        fechaHora: a.fechaHora,
        ordenId: a.ordenId,
        resumen: `Técnico asignado: ${nombresUsuario.get(a.tecnicoAsignadoId) ?? "—"}${anterior ? ` (antes: ${anterior})` : ""}`,
        usuario: usuario(a.usuarioResponsableId),
      });
    }

    for (const m of db
      .select()
      .from(movimientoStock)
      .orderBy(desc(movimientoStock.fechaHora))
      .all()) {
      const signo =
        m.tipoMovimiento === "RESERVA" || m.tipoMovimiento === "DESCUENTO_DEFINITIVO" ? "-" : "+";
      const nombreProducto = nombresProducto.get(m.productoId) ?? `#${m.productoId}`;
      eventos.push({
        id: `stock-${m.id}`,
        tipo: "stock",
        fechaHora: m.fechaHora,
        ordenId: m.ordenId,
        resumen: `${TIPO_MOVIMIENTO_LABEL[m.tipoMovimiento] ?? m.tipoMovimiento}: ${signo}${m.cantidad} — ${nombreProducto}`,
        usuario: usuario(m.usuarioId),
      });
    }

    for (const r of db
      .select()
      .from(registroAuditoria)
      .orderBy(desc(registroAuditoria.fechaHora))
      .all()) {
      const ordenId =
        r.entidadAfectada === "OrdenTrabajo"
          ? r.idEntidad
          : (ordenPorPresupuesto.get(Number(r.idEntidad)) ?? null);
      eventos.push({
        id: `auditoria-${r.id}`,
        tipo: "auditoria",
        fechaHora: r.fechaHora,
        ordenId,
        resumen: `${TIPO_OPERACION_LABEL[r.tipoOperacion] ?? r.tipoOperacion}: ${r.descripcion}`,
        usuario: usuario(r.usuarioId),
      });
    }

    eventos.sort((a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime());
    return eventos;
  });
