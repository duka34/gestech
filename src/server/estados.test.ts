import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { aplicarTransicion, transicionValida } from "./estados";
import { historialEstado } from "./schema";
import { crearClienteTest, crearOrdenTest, crearUsuarioTest, db } from "./test-utils";

describe("transicionValida", () => {
  it("acepta la secuencia normal de servicio técnico", () => {
    expect(transicionValida("SERVICIO_TECNICO", "INGRESADO", "PRESUPUESTADO")).toBe(true);
    expect(transicionValida("SERVICIO_TECNICO", "PRESUPUESTADO", "APROBADO")).toBe(true);
    expect(transicionValida("SERVICIO_TECNICO", "APROBADO", "EN_PROCESO")).toBe(true);
    expect(transicionValida("SERVICIO_TECNICO", "EN_PROCESO", "PENDIENTE_DE_RETIRO")).toBe(true);
    expect(transicionValida("SERVICIO_TECNICO", "PENDIENTE_DE_RETIRO", "ENTREGADO")).toBe(true);
  });

  it("rechaza saltos no permitidos", () => {
    expect(transicionValida("SERVICIO_TECNICO", "INGRESADO", "ENTREGADO")).toBe(false);
    expect(transicionValida("SERVICIO_TECNICO", "PENDIENTE_DE_RETIRO", "EN_PROCESO")).toBe(false);
  });

  it("ANULADO es alcanzable desde cualquier estado no anulado, pero no dos veces", () => {
    for (const estado of [
      "INGRESADO",
      "PRESUPUESTADO",
      "APROBADO",
      "EN_PROCESO",
      "PENDIENTE_DE_RETIRO",
    ]) {
      expect(transicionValida("SERVICIO_TECNICO", estado, "ANULADO")).toBe(true);
    }
    expect(transicionValida("SERVICIO_TECNICO", "ANULADO", "ANULADO")).toBe(false);
  });

  it("cámaras: EN_PROCESO → FINALIZADO válido; no existen PENDIENTE_DE_RETIRO/ABANDONADO", () => {
    expect(transicionValida("INSTALACION_CAMARAS", "EN_PROCESO", "FINALIZADO")).toBe(true);
    expect(transicionValida("INSTALACION_CAMARAS", "EN_PROCESO", "PENDIENTE_DE_RETIRO")).toBe(
      false,
    );
    expect(transicionValida("MANTENIMIENTO_CAMARAS", "FINALIZADO", "ABANDONADO")).toBe(false);
  });
});

describe("aplicarTransicion", () => {
  it("escribe exactamente un HistorialEstado por llamada", () => {
    const cliente = crearClienteTest(db);
    const usuario = crearUsuarioTest(db);
    const orden = crearOrdenTest(db, cliente.id, { estado: "INGRESADO" });

    aplicarTransicion(db, {
      ordenId: orden.id,
      tipoServicio: "SERVICIO_TECNICO",
      estadoActual: "INGRESADO",
      estadoNuevo: "PRESUPUESTADO",
      usuarioId: usuario.id,
      automatico: false,
    });

    const historial = db
      .select()
      .from(historialEstado)
      .where(eq(historialEstado.ordenId, orden.id))
      .all();
    expect(historial).toHaveLength(1);
    expect(historial[0].estadoAnterior).toBe("INGRESADO");
    expect(historial[0].estadoNuevo).toBe("PRESUPUESTADO");
    expect(historial[0].automatico).toBe(false);
  });

  it("rechaza una transición no permitida y no escribe historial", () => {
    const cliente = crearClienteTest(db);
    const orden = crearOrdenTest(db, cliente.id, { estado: "INGRESADO" });

    expect(() =>
      aplicarTransicion(db, {
        ordenId: orden.id,
        tipoServicio: "SERVICIO_TECNICO",
        estadoActual: "INGRESADO",
        estadoNuevo: "ENTREGADO",
        usuarioId: null,
        automatico: false,
      }),
    ).toThrow();

    const historial = db
      .select()
      .from(historialEstado)
      .where(eq(historialEstado.ordenId, orden.id))
      .all();
    expect(historial).toHaveLength(0);
  });
});
