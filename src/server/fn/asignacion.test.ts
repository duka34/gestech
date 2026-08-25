import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cumplimentaciones, ordenesTrabajo } from "../schema";
import { crearClienteTest, crearOrdenTest, crearUsuarioTest, db } from "../test-utils";
import { autoasignarTecnicoCore } from "./ordenes";

// T-24 — condición de carrera en la autoasignación (GESTECH_CAMBIOS_ASIGNACION.md,
// Tarea 2.10, prioridad explícita). autoasignarTecnicoCore es la guarda real
// (un solo UPDATE condicionado por tecnicoResponsableId IS NULL): dos
// llamadas seguidas sobre la misma orden deben comportarse como si dos
// técnicos hubieran intentado tomarla a la vez.
describe("autoasignarTecnicoCore", () => {
  it("dos llamadas seguidas sobre la misma orden: la primera gana, la segunda falla explícito", () => {
    const cliente = crearClienteTest(db);
    const tecnico1 = crearUsuarioTest(db, { rol: "TECNICO" });
    const tecnico2 = crearUsuarioTest(db, { rol: "TECNICO" });
    const orden = crearOrdenTest(db, cliente.id, {
      tipoServicio: "SERVICIO_TECNICO",
      estado: "INGRESADO",
    });

    const r1 = autoasignarTecnicoCore(db, { ordenId: orden.id, usuarioId: tecnico1.id });
    expect(r1.ok).toBe(true);

    const r2 = autoasignarTecnicoCore(db, { ordenId: orden.id, usuarioId: tecnico2.id });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.motivo).toMatch(/ya tiene un técnico responsable/);

    const actualizada = db
      .select()
      .from(ordenesTrabajo)
      .where(eq(ordenesTrabajo.id, orden.id))
      .get()!;
    expect(actualizada.tecnicoResponsableId).toBe(tecnico1.id);
  });

  it("rechaza autoasignación en órdenes de cámaras", () => {
    const cliente = crearClienteTest(db);
    const tecnico = crearUsuarioTest(db, { rol: "TECNICO" });
    const orden = crearOrdenTest(db, cliente.id, {
      tipoServicio: "INSTALACION_CAMARAS",
      estado: "AGENDADO",
    });
    const r = autoasignarTecnicoCore(db, { ordenId: orden.id, usuarioId: tecnico.id });
    expect(r.ok).toBe(false);
  });

  // Cubre en particular las órdenes sembradas antes de que existiera la
  // asignación obligatoria de técnico, que quedaron ABANDONADO sin
  // responsable — no deben poder "tomarse" igual.
  it.each(["ENTREGADO", "ABANDONADO", "RECHAZADO"] as const)(
    "rechaza autoasignación en una orden en estado terminal (%s) sin responsable",
    (estado) => {
      const cliente = crearClienteTest(db);
      const tecnico = crearUsuarioTest(db, { rol: "TECNICO" });
      const orden = crearOrdenTest(db, cliente.id, {
        tipoServicio: "SERVICIO_TECNICO",
        estado,
        tecnicoResponsableId: null,
      });
      const r = autoasignarTecnicoCore(db, { ordenId: orden.id, usuarioId: tecnico.id });
      expect(r.ok).toBe(false);
    },
  );

  it("rechaza autoasignación sobre una orden ya cumplimentada", () => {
    const cliente = crearClienteTest(db);
    const tecnico = crearUsuarioTest(db, { rol: "TECNICO" });
    const orden = crearOrdenTest(db, cliente.id, {
      tipoServicio: "SERVICIO_TECNICO",
      estado: "ENTREGADO",
    });
    db.insert(cumplimentaciones)
      .values({
        ordenId: orden.id,
        fechaRealizacion: new Date().toISOString().slice(0, 10),
        descripcionTareas: "Test",
        tecnicoEjecutorId: tecnico.id,
        montoCobrado: 0,
        metodoPago: "EFECTIVO",
        tipoGarantia: "mantenimiento_software",
      })
      .run();
    const r = autoasignarTecnicoCore(db, { ordenId: orden.id, usuarioId: tecnico.id });
    expect(r.ok).toBe(false);
  });
});
