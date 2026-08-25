import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { detallePresupuesto, presupuestos, productos } from "../schema";
import {
  crearClienteTest,
  crearOrdenTest,
  crearProductoTest,
  crearUsuarioTest,
  db,
} from "../test-utils";
import { aplicarEfectosStock, calcularLineasPresupuesto } from "./ordenes";

describe("calcularLineasPresupuesto", () => {
  it("rechaza cantidad mayor al stock disponible", () => {
    const producto = crearProductoTest(db, { stock: 3, stockReservado: 0 });
    expect(() =>
      calcularLineasPresupuesto(db, "INSTALACION_CAMARAS", [
        { productoId: producto.id, cantidad: 5 },
      ]),
    ).toThrow(/Stock insuficiente/);
  });

  it("descuenta la reserva ya comprometida al calcular disponibilidad", () => {
    const producto = crearProductoTest(db, { stock: 5, stockReservado: 3 });
    expect(() =>
      calcularLineasPresupuesto(db, "INSTALACION_CAMARAS", [
        { productoId: producto.id, cantidad: 3 },
      ]),
    ).toThrow(/Stock insuficiente/);
    expect(() =>
      calcularLineasPresupuesto(db, "INSTALACION_CAMARAS", [
        { productoId: producto.id, cantidad: 2 },
      ]),
    ).not.toThrow();
  });

  it("congela el precio unitario del producto y calcula el subtotal", () => {
    const producto = crearProductoTest(db, { stock: 10, precio: 250 });
    const { lineas, subtotalMateriales } = calcularLineasPresupuesto(db, "INSTALACION_CAMARAS", [
      { productoId: producto.id, cantidad: 2 },
    ]);
    expect(lineas[0].precioUnitario).toBe(250);
    expect(lineas[0].subtotal).toBe(500);
    expect(subtotalMateriales).toBe(500);
  });

  it("servicio técnico no consume stock: sin líneas, subtotal 0", () => {
    const { lineas, subtotalMateriales } = calcularLineasPresupuesto(db, "SERVICIO_TECNICO", []);
    expect(lineas).toHaveLength(0);
    expect(subtotalMateriales).toBe(0);
  });
});

describe("aplicarEfectosStock", () => {
  function armarOrdenConPresupuesto(cantidad: number) {
    const cliente = crearClienteTest(db);
    const usuario = crearUsuarioTest(db);
    const producto = crearProductoTest(db, { stock: 10, stockReservado: 0 });
    const orden = crearOrdenTest(db, cliente.id, {
      tipoServicio: "INSTALACION_CAMARAS",
      estado: "PRESUPUESTADO",
    });
    const presupuesto = db
      .insert(presupuestos)
      .values({ ordenId: orden.id, detalle: "Test", montoManoObra: 0, montoTotal: 0 })
      .returning()
      .get();
    db.insert(detallePresupuesto)
      .values({
        presupuestoId: presupuesto.id,
        productoId: producto.id,
        cantidad,
        precioUnitario: producto.precio,
        subtotal: producto.precio * cantidad,
      })
      .run();
    return { orden, producto, usuario };
  }

  it("reserva stock al pasar a APROBADO (RF11.4)", () => {
    const { orden, producto, usuario } = armarOrdenConPresupuesto(3);
    db.transaction((tx) => {
      aplicarEfectosStock(tx, {
        orden,
        tipoDb: "INSTALACION_CAMARAS",
        estadoNuevo: "APROBADO",
        usuarioId: usuario.id,
      });
    });
    const actualizado = db.select().from(productos).where(eq(productos.id, producto.id)).get()!;
    expect(actualizado.stockReservado).toBe(3);
    expect(actualizado.stock).toBe(10);
  });

  it("descuenta stock y libera la reserva al FINALIZAR (RF11.5)", () => {
    const { orden, producto, usuario } = armarOrdenConPresupuesto(4);
    db.transaction((tx) => {
      aplicarEfectosStock(tx, {
        orden,
        tipoDb: "INSTALACION_CAMARAS",
        estadoNuevo: "APROBADO",
        usuarioId: usuario.id,
      });
    });
    db.transaction((tx) => {
      aplicarEfectosStock(tx, {
        orden,
        tipoDb: "INSTALACION_CAMARAS",
        estadoNuevo: "FINALIZADO",
        usuarioId: usuario.id,
      });
    });
    const actualizado = db.select().from(productos).where(eq(productos.id, producto.id)).get()!;
    expect(actualizado.stock).toBe(6);
    expect(actualizado.stockReservado).toBe(0);
  });

  it("no toca stock para servicio técnico (RF11.7)", () => {
    const cliente = crearClienteTest(db);
    const usuario = crearUsuarioTest(db);
    const orden = crearOrdenTest(db, cliente.id, { tipoServicio: "SERVICIO_TECNICO" });
    expect(() =>
      db.transaction((tx) => {
        aplicarEfectosStock(tx, {
          orden,
          tipoDb: "SERVICIO_TECNICO",
          estadoNuevo: "APROBADO",
          usuarioId: usuario.id,
        });
      }),
    ).not.toThrow();
  });
});
