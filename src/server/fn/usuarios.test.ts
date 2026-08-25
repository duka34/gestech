import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { asignacionTecnico, ordenesTrabajo, usuarios } from "../schema";
import { crearClienteTest, crearOrdenTest, crearUsuarioTest, db } from "../test-utils";
import { reasignarPorBajaCore } from "./usuarios";

// T-24 — transacción de baja con reasignación masiva (GESTECH_CAMBIOS_ASIGNACION.md,
// Tarea 2.10, prioridad explícita junto con la condición de carrera).
describe("reasignarPorBajaCore", () => {
  it("reasigna todas las órdenes activas individualmente y da de baja al usuario", () => {
    const cliente = crearClienteTest(db);
    const admin = crearUsuarioTest(db, { rol: "ADMINISTRADOR" });
    const origen = crearUsuarioTest(db, { rol: "TECNICO" });
    const destino = crearUsuarioTest(db, { rol: "TECNICO" });
    const orden1 = crearOrdenTest(db, cliente.id, {
      estado: "EN_PROCESO",
      tecnicoResponsableId: origen.id,
    });
    const orden2 = crearOrdenTest(db, cliente.id, {
      estado: "PENDIENTE_DE_RETIRO",
      tecnicoResponsableId: origen.id,
    });
    // No activa (terminal): no debe tocarse.
    const ordenCerrada = crearOrdenTest(db, cliente.id, {
      estado: "ENTREGADO",
      tecnicoResponsableId: origen.id,
    });

    const resultado = reasignarPorBajaCore(db, {
      usuarioId: origen.id,
      tecnicoDestinoId: destino.id,
      motivo: "Renuncia del técnico",
      usuarioResponsableId: admin.id,
    });
    expect(resultado.reasignadas).toBe(2);

    const o1 = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, orden1.id)).get()!;
    const o2 = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, orden2.id)).get()!;
    const oCerrada = db
      .select()
      .from(ordenesTrabajo)
      .where(eq(ordenesTrabajo.id, ordenCerrada.id))
      .get()!;
    expect(o1.tecnicoResponsableId).toBe(destino.id);
    expect(o2.tecnicoResponsableId).toBe(destino.id);
    expect(oCerrada.tecnicoResponsableId).toBe(origen.id); // sin tocar

    const usuarioOrigen = db.select().from(usuarios).where(eq(usuarios.id, origen.id)).get()!;
    expect(usuarioOrigen.activo).toBe(false);

    // Registro individual por orden, no agrupado (pedido explícito del doc).
    // Se acota por usuarioResponsableId (el admin de este test, id único) en
    // vez de por tabla completa, para no depender de si Vitest aísla el
    // módulo de base entre archivos de test.
    const asignaciones = db
      .select()
      .from(asignacionTecnico)
      .where(eq(asignacionTecnico.usuarioResponsableId, admin.id))
      .all();
    expect(asignaciones).toHaveLength(2);
    expect(asignaciones.every((a) => a.tipoAsignacion === "REASIGNACION_POR_BAJA")).toBe(true);
    expect(asignaciones.every((a) => a.motivo === "Renuncia del técnico")).toBe(true);
  });

  it("no permite reasignar al mismo técnico que se está dando de baja, y no cambia nada", () => {
    const cliente = crearClienteTest(db);
    const admin = crearUsuarioTest(db, { rol: "ADMINISTRADOR" });
    const origen = crearUsuarioTest(db, { rol: "TECNICO" });
    const orden = crearOrdenTest(db, cliente.id, {
      estado: "EN_PROCESO",
      tecnicoResponsableId: origen.id,
    });

    expect(() =>
      reasignarPorBajaCore(db, {
        usuarioId: origen.id,
        tecnicoDestinoId: origen.id,
        motivo: "x",
        usuarioResponsableId: admin.id,
      }),
    ).toThrow();

    const ordenSinCambios = db
      .select()
      .from(ordenesTrabajo)
      .where(eq(ordenesTrabajo.id, orden.id))
      .get()!;
    expect(ordenSinCambios.tecnicoResponsableId).toBe(origen.id);
    const usuarioSinCambios = db.select().from(usuarios).where(eq(usuarios.id, origen.id)).get()!;
    expect(usuarioSinCambios.activo).toBe(true);
  });

  it("rechaza técnico destino inexistente/inactivo sin tocar órdenes ni al usuario", () => {
    const cliente = crearClienteTest(db);
    const admin = crearUsuarioTest(db, { rol: "ADMINISTRADOR" });
    const origen = crearUsuarioTest(db, { rol: "TECNICO" });
    const destinoInactivo = crearUsuarioTest(db, { rol: "TECNICO", activo: false });
    const orden = crearOrdenTest(db, cliente.id, {
      estado: "EN_PROCESO",
      tecnicoResponsableId: origen.id,
    });

    expect(() =>
      reasignarPorBajaCore(db, {
        usuarioId: origen.id,
        tecnicoDestinoId: destinoInactivo.id,
        motivo: "x",
        usuarioResponsableId: admin.id,
      }),
    ).toThrow();

    const ordenSinCambios = db
      .select()
      .from(ordenesTrabajo)
      .where(eq(ordenesTrabajo.id, orden.id))
      .get()!;
    expect(ordenSinCambios.tecnicoResponsableId).toBe(origen.id);
    const usuarioSinCambios = db.select().from(usuarios).where(eq(usuarios.id, origen.id)).get()!;
    expect(usuarioSinCambios.activo).toBe(true);
  });
});
