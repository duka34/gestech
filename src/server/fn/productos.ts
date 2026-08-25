import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../auth";
import { db } from "../db";
import { productos } from "../schema";

// T-10 / RF07 — Gestión de productos. "Gestionar productos (ABM)" está
// habilitado tanto para Administrador como Técnico (spec §7), por eso todas
// las funciones de este archivo usan authMiddleware, no adminMiddleware.

function conDisponible<T extends { stock: number; stockReservado: number }>(p: T) {
  return { ...p, stockDisponible: p.stock - p.stockReservado };
}

export const listarProductosFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => db.select().from(productos).all().map(conDisponible));

const crearProductoSchema = z.object({
  nombre: z.string().min(1),
  categoria: z.enum(["DVR", "NVR", "CAMARA", "CABLE"]),
  stock: z.number().int().min(0),
  stockMinimo: z.number().int().min(0),
  precio: z.number().min(0),
});

export const crearProductoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => crearProductoSchema.parse(d))
  .handler(async ({ data }) => {
    const creado = db
      .insert(productos)
      .values({ ...data, nombre: data.nombre.trim() })
      .returning()
      .get();
    return conDisponible(creado);
  });

const actualizarProductoSchema = z.object({
  id: z.number(),
  nombre: z.string().min(1).optional(),
  categoria: z.enum(["DVR", "NVR", "CAMARA", "CABLE"]).optional(),
  stock: z.number().int().min(0).optional(),
  stockMinimo: z.number().int().min(0).optional(),
  precio: z.number().min(0).optional(),
});

export const actualizarProductoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => actualizarProductoSchema.parse(d))
  .handler(async ({ data }) => {
    const actualizado = db
      .update(productos)
      .set({
        ...(data.nombre !== undefined && { nombre: data.nombre.trim() }),
        ...(data.categoria !== undefined && { categoria: data.categoria }),
        ...(data.stock !== undefined && { stock: data.stock }),
        ...(data.stockMinimo !== undefined && { stockMinimo: data.stockMinimo }),
        ...(data.precio !== undefined && { precio: data.precio }),
      })
      .where(eq(productos.id, data.id))
      .returning()
      .get();
    if (!actualizado) throw new Error("Producto no encontrado.");
    return conDisponible(actualizado);
  });

export const darDeBajaProductoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const actual = db.select().from(productos).where(eq(productos.id, data.id)).get();
    if (!actual) throw new Error("Producto no encontrado.");
    if (actual.stockReservado > 0) {
      throw new Error("No se puede dar de baja: tiene stock reservado en presupuestos aprobados.");
    }
    db.update(productos).set({ activo: false }).where(eq(productos.id, data.id)).run();
    return { ok: true };
  });
