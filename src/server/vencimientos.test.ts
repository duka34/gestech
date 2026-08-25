import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { alertas, conversacionesChatbot, ordenesTrabajo } from "./schema";
import { crearClienteTest, crearOrdenTest, db } from "./test-utils";
import { ejecutarControlVencimientos } from "./vencimientos";

function ordenSinAsignarHace(dias: number) {
  const cliente = crearClienteTest(db);
  const creadoEn = new Date(Date.now() - dias * 86_400_000).toISOString();
  return crearOrdenTest(db, cliente.id, {
    tipoServicio: "SERVICIO_TECNICO",
    estado: "INGRESADO",
    tecnicoResponsableId: null,
    creadoEn,
  });
}

function ordenPendienteHace(
  dias: number,
  tipoServicio: "SERVICIO_TECNICO" | "INSTALACION_CAMARAS" = "SERVICIO_TECNICO",
) {
  const cliente = crearClienteTest(db);
  const fecha = new Date(Date.now() - dias * 86_400_000).toISOString();
  return crearOrdenTest(db, cliente.id, {
    tipoServicio,
    estado: tipoServicio === "SERVICIO_TECNICO" ? "PENDIENTE_DE_RETIRO" : "EN_PROCESO",
    fechaNotificacionRetiro: tipoServicio === "SERVICIO_TECNICO" ? fecha : null,
  });
}

describe("ejecutarControlVencimientos", () => {
  it("día 85: genera alerta y recordatorio; una segunda corrida el mismo día no duplica", () => {
    const orden = ordenPendienteHace(85);

    const r1 = ejecutarControlVencimientos(db);
    expect(r1.recordatorios).toBe(1);
    expect(r1.abandonos).toBe(0);

    const r2 = ejecutarControlVencimientos(db);
    expect(r2.recordatorios).toBe(0);

    const alertasOrden = db.select().from(alertas).where(eq(alertas.ordenId, orden.id)).all();
    expect(alertasOrden).toHaveLength(1);
    expect(alertasOrden[0].estado).toBe("ACTIVA");

    const mensajes = db
      .select()
      .from(conversacionesChatbot)
      .where(eq(conversacionesChatbot.ordenId, orden.id))
      .all();
    expect(mensajes.filter((m) => m.tipo === "recordatorio")).toHaveLength(1);
  });

  it("día 90+ sin corrida previa: abandona la orden igual, sin romper por falta de alerta", () => {
    const orden = ordenPendienteHace(95);
    const r = ejecutarControlVencimientos(db);
    expect(r.abandonos).toBe(1);
    const actualizada = db
      .select()
      .from(ordenesTrabajo)
      .where(eq(ordenesTrabajo.id, orden.id))
      .get()!;
    expect(actualizada.estado).toBe("ABANDONADO");
  });

  it("recuperable: corrida en día 85 seguida de una corrida en día 95 resuelve la alerta ya creada", () => {
    const orden = ordenPendienteHace(85);
    ejecutarControlVencimientos(db);

    db.update(ordenesTrabajo)
      .set({ fechaNotificacionRetiro: new Date(Date.now() - 95 * 86_400_000).toISOString() })
      .where(eq(ordenesTrabajo.id, orden.id))
      .run();

    const r = ejecutarControlVencimientos(db);
    expect(r.abandonos).toBe(1);

    const alerta = db.select().from(alertas).where(eq(alertas.ordenId, orden.id)).get();
    expect(alerta?.estado).toBe("RESUELTA");

    const mensajes = db
      .select()
      .from(conversacionesChatbot)
      .where(eq(conversacionesChatbot.ordenId, orden.id))
      .all();
    expect(mensajes.filter((m) => m.tipo === "abandono")).toHaveLength(1);
  });

  it("nunca genera alertas para instalación/mantenimiento de cámaras", () => {
    ordenPendienteHace(95, "INSTALACION_CAMARAS");
    const r = ejecutarControlVencimientos(db);
    expect(r.recordatorios).toBe(0);
    expect(r.abandonos).toBe(0);
  });

  // RF16.6 (rev. GESTECH_CAMBIOS_ASIGNACION.md)
  it("genera ORDEN_SIN_ASIGNAR a los 7+ días sin técnico, y no la duplica en una segunda corrida", () => {
    const orden = ordenSinAsignarHace(8);
    const r1 = ejecutarControlVencimientos(db);
    expect(r1.sinAsignar).toBe(1);

    const r2 = ejecutarControlVencimientos(db);
    expect(r2.sinAsignar).toBe(0);

    const alertasOrden = db.select().from(alertas).where(eq(alertas.ordenId, orden.id)).all();
    expect(alertasOrden.filter((a) => a.tipo === "ORDEN_SIN_ASIGNAR")).toHaveLength(1);
  });

  it("no genera ORDEN_SIN_ASIGNAR antes del umbral de 7 días", () => {
    ordenSinAsignarHace(3);
    const r = ejecutarControlVencimientos(db);
    expect(r.sinAsignar).toBe(0);
  });
});
