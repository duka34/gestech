import { describe, expect, it } from "vitest";
import { puedePresupuestar, requiereMotivoDeCambio } from "./gestech-data";

// A pedido del usuario: un Técnico que no es el responsable puede cambiar
// el estado con motivo obligatorio (fricción, no bloqueo), pero NO puede
// presupuestar (bloqueo duro). El Administrador queda exento de ambas.
describe("requiereMotivoDeCambio", () => {
  it("no exige motivo al Administrador, sea o no el responsable", () => {
    expect(requiereMotivoDeCambio(5, { id: 1, rol: "ADMINISTRADOR" })).toBe(false);
    expect(requiereMotivoDeCambio(1, { id: 1, rol: "ADMINISTRADOR" })).toBe(false);
  });

  it("no exige motivo si la orden no tiene responsable asignado", () => {
    expect(requiereMotivoDeCambio(null, { id: 1, rol: "TECNICO" })).toBe(false);
    expect(requiereMotivoDeCambio(undefined, { id: 1, rol: "TECNICO" })).toBe(false);
  });

  it("no exige motivo al propio técnico responsable", () => {
    expect(requiereMotivoDeCambio(1, { id: 1, rol: "TECNICO" })).toBe(false);
  });

  it("exige motivo a un técnico que no es el responsable", () => {
    expect(requiereMotivoDeCambio(2, { id: 1, rol: "TECNICO" })).toBe(true);
  });

  it("compara id numérico (servidor) contra id string (UI) indistintamente", () => {
    expect(requiereMotivoDeCambio("1", { id: 1, rol: "TECNICO" })).toBe(false);
    expect(requiereMotivoDeCambio("2", { id: 1, rol: "TECNICO" })).toBe(true);
  });
});

describe("puedePresupuestar", () => {
  it("el Administrador siempre puede, sea o no el responsable", () => {
    expect(puedePresupuestar(5, { id: 1, rol: "ADMINISTRADOR" })).toBe(true);
    expect(puedePresupuestar(null, { id: 1, rol: "ADMINISTRADOR" })).toBe(true);
  });

  it("el técnico responsable puede presupuestar", () => {
    expect(puedePresupuestar(1, { id: 1, rol: "TECNICO" })).toBe(true);
  });

  it("un técnico que no es el responsable NO puede presupuestar (bloqueo duro, sin override)", () => {
    expect(puedePresupuestar(2, { id: 1, rol: "TECNICO" })).toBe(false);
  });

  it("un técnico no puede presupuestar una orden sin responsable asignado", () => {
    expect(puedePresupuestar(null, { id: 1, rol: "TECNICO" })).toBe(false);
  });
});
