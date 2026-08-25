import { describe, expect, it } from "vitest";
import { db } from "./test-utils";
import { siguienteNumeroComprobante, siguienteNumeroOrden } from "./ids";

describe("siguienteNumeroOrden", () => {
  it("genera valores correlativos y distintos en llamadas sucesivas", () => {
    const a = siguienteNumeroOrden(db);
    const b = siguienteNumeroOrden(db);
    const c = siguienteNumeroOrden(db);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(Number(b)).toBe(Number(a) + 1);
    expect(Number(c)).toBe(Number(b) + 1);
  });

  it("formatea a 6 dígitos con ceros a la izquierda", () => {
    const a = siguienteNumeroOrden(db);
    expect(a).toMatch(/^\d{6}$/);
  });
});

describe("siguienteNumeroComprobante", () => {
  it("tiene su propio contador, correlativo e independiente del de órdenes", () => {
    const c1 = siguienteNumeroComprobante(db);
    const c2 = siguienteNumeroComprobante(db);
    expect(Number(c2)).toBe(Number(c1) + 1);
  });
});
