import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { aplicarTransicion, ESTADOS_TERMINALES } from "./estados";
import type { db as dbInstance } from "./db";
import { alertas, clientes, conversacionesChatbot, ordenesTrabajo } from "./schema";

// T-21/RF05.5/RF16 — control diario de vencimiento del plazo de retiro. No
// importa `./db` (recibe la conexión por parámetro): así lo puede llamar
// tanto el trigger manual (fn/alertas.ts) como el scheduler de db.ts sin
// generar un ciclo de imports entre los dos módulos.
//
// Idempotente: día ≥80 solo genera la Alerta/recordatorio si todavía no
// existe una para esa orden — correrlo dos veces el mismo día no duplica
// nada. Recuperable: recorre TODAS las órdenes vencidas según la fecha
// guardada, sin importar cuántos días pasaron desde la última corrida.
const DIA_MS = 86_400_000;
const UMBRAL_SIN_ASIGNAR_DIAS = 7; // RF16.6 / P-05 (GESTECH_CAMBIOS_ASIGNACION.md)

export function ejecutarControlVencimientos(db: typeof dbInstance) {
  let recordatorios = 0;
  let abandonos = 0;
  const ahora = Date.now();

  const candidatas = db
    .select()
    .from(ordenesTrabajo)
    .where(
      and(
        eq(ordenesTrabajo.tipoServicio, "SERVICIO_TECNICO"), // RF16.5 — solo servicio técnico
        eq(ordenesTrabajo.estado, "PENDIENTE_DE_RETIRO"),
        isNotNull(ordenesTrabajo.fechaNotificacionRetiro),
      ),
    )
    .all();

  for (const orden of candidatas) {
    const dias = Math.floor((ahora - new Date(orden.fechaNotificacionRetiro!).getTime()) / DIA_MS);
    const cliente = db.select().from(clientes).where(eq(clientes.id, orden.clienteId)).get();

    if (dias >= 90) {
      aplicarTransicion(
        db,
        {
          ordenId: orden.id,
          tipoServicio: "SERVICIO_TECNICO",
          estadoActual: orden.estado,
          estadoNuevo: "ABANDONADO",
          usuarioId: null,
          automatico: true,
        },
        (tx) => {
          if (cliente) {
            tx.insert(conversacionesChatbot)
              .values({
                clienteId: cliente.id,
                ordenId: orden.id,
                direccion: "SALIENTE",
                tipo: "abandono",
                contenido: `Hola ${cliente.nombre}, lamentamos informarte que tu equipo (OT ${orden.id}) ha sido declarado ABANDONADO por superar los 90 días sin retiro.`,
              })
              .run();
          }
          // RF16.4 — se resuelve automáticamente al declararse el abandono.
          tx.update(alertas)
            .set({ estado: "RESUELTA" })
            .where(and(eq(alertas.ordenId, orden.id), eq(alertas.tipo, "VENCIMIENTO_RETIRO")))
            .run();
        },
      );
      abandonos++;
      continue;
    }

    if (dias >= 80) {
      const yaExiste = db
        .select()
        .from(alertas)
        .where(and(eq(alertas.ordenId, orden.id), eq(alertas.tipo, "VENCIMIENTO_RETIRO")))
        .get();
      if (yaExiste) continue;

      db.transaction((tx) => {
        tx.insert(alertas)
          .values({
            tipo: "VENCIMIENTO_RETIRO",
            ordenId: orden.id,
            mensaje: `OT ${orden.id} — ${cliente ? `${cliente.nombre} ${cliente.apellido}` : "cliente"} — pendiente de retiro hace ${dias} días.`,
          })
          .run();
        if (cliente) {
          tx.insert(conversacionesChatbot)
            .values({
              clienteId: cliente.id,
              ordenId: orden.id,
              direccion: "SALIENTE",
              tipo: "recordatorio",
              contenido: `Hola ${cliente.nombre}, te recordamos que tu equipo (OT ${orden.id}) sigue pendiente de retiro. Pasados los 90 días será declarado en abandono.`,
            })
            .run();
        }
      });
      recordatorios++;
    }
  }

  // RF16.6 (rev. GESTECH_CAMBIOS_ASIGNACION.md) — alerta por orden de
  // servicio técnico sin responsable hace más de 7 días. Mismo guard de
  // idempotencia (existencia de la alerta) que VENCIMIENTO_RETIRO. Se
  // resuelve sola al asignarse un responsable (autoasignarTecnicoCore, en
  // fn/ordenes.ts), no acá.
  let sinAsignar = 0;
  const candidatasSinAsignar = db
    .select()
    .from(ordenesTrabajo)
    .where(
      and(
        eq(ordenesTrabajo.tipoServicio, "SERVICIO_TECNICO"),
        isNull(ordenesTrabajo.tecnicoResponsableId),
      ),
    )
    .all()
    .filter((o) => !ESTADOS_TERMINALES.SERVICIO_TECNICO.includes(o.estado));

  for (const orden of candidatasSinAsignar) {
    const dias = Math.floor((ahora - new Date(orden.creadoEn).getTime()) / DIA_MS);
    if (dias < UMBRAL_SIN_ASIGNAR_DIAS) continue;

    const yaExiste = db
      .select()
      .from(alertas)
      .where(and(eq(alertas.ordenId, orden.id), eq(alertas.tipo, "ORDEN_SIN_ASIGNAR")))
      .get();
    if (yaExiste) continue;

    const cliente = db.select().from(clientes).where(eq(clientes.id, orden.clienteId)).get();
    db.insert(alertas)
      .values({
        tipo: "ORDEN_SIN_ASIGNAR",
        ordenId: orden.id,
        mensaje: `OT ${orden.id} — ${cliente ? `${cliente.nombre} ${cliente.apellido}` : "cliente"} — sin técnico responsable hace ${dias} días.`,
      })
      .run();
    sinAsignar++;
  }

  return { recordatorios, abandonos, sinAsignar };
}
