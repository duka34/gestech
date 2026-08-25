import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { adminMiddleware } from "../auth";
import { registrarMovimientoStock } from "../audit";
import { db } from "../db";
import { detalleReposicion, productos, reposicionesStock } from "../schema";

// T-13 / RF12 / CU12 — Reposición de stock. Exclusivo del Administrador
// (spec §7 y CU12: "Actores: Administrador").

type ReposicionRow = typeof reposicionesStock.$inferSelect;

function conDetalle(reposicion: ReposicionRow) {
  const items = db
    .select()
    .from(detalleReposicion)
    .where(eq(detalleReposicion.reposicionId, reposicion.id))
    .all();
  return { ...reposicion, items };
}

export const listarReposicionesFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => db.select().from(reposicionesStock).all().map(conDetalle));

const itemSchema = z.object({ productoId: z.number(), cantidad: z.number().int().positive() });
const registrarSchema = z.object({
  proveedor: z.string().min(1),
  fechaEstimadaRecepcion: z.string().optional(),
  items: z.array(itemSchema).min(1, "Agregá al menos un producto."),
});

// RF12.1 — alta del pedido en SOLICITADO.
export const registrarReposicionFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => registrarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const reposicion = db.transaction((tx) => {
      const rep = tx
        .insert(reposicionesStock)
        .values({
          proveedor: data.proveedor.trim(),
          fechaEstimadaRecepcion: data.fechaEstimadaRecepcion || null,
          usuarioRegistroId: context.usuario.id,
        })
        .returning()
        .get();
      for (const item of data.items) {
        tx.insert(detalleReposicion)
          .values({
            reposicionId: rep.id,
            productoId: item.productoId,
            cantidadSolicitada: item.cantidad,
          })
          .run();
      }
      return rep;
    });
    return conDetalle(reposicion);
  });

// RF12.2 — SOLICITADO → CONFIRMADO (el proveedor confirmó la operación).
export const confirmarReposicionFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const actual = db
      .select()
      .from(reposicionesStock)
      .where(eq(reposicionesStock.id, data.id))
      .get();
    if (!actual) throw new Error("Pedido no encontrado.");
    if (actual.estado !== "SOLICITADO") throw new Error("El pedido ya fue confirmado o recibido.");
    db.update(reposicionesStock)
      .set({ estado: "CONFIRMADO" })
      .where(eq(reposicionesStock.id, data.id))
      .run();
    return { ok: true };
  });

const recepcionItemSchema = z.object({ detalleId: z.number(), cantidad: z.number().int().min(0) });
const recibirSchema = z.object({
  id: z.number(),
  recepciones: z.array(recepcionItemSchema).min(1),
});

// RF12.3 — admite recepción parcial: cada llamada suma lo efectivamente
// recibido en ese momento (no reemplaza el acumulado). El pedido pasa a
// RECIBIDO solo cuando todas las líneas completaron su cantidad solicitada.
export const recibirReposicionFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => recibirSchema.parse(d))
  .handler(async ({ data, context }) => {
    const reposicion = db
      .select()
      .from(reposicionesStock)
      .where(eq(reposicionesStock.id, data.id))
      .get();
    if (!reposicion) throw new Error("Pedido no encontrado.");
    if (reposicion.estado === "SOLICITADO") {
      throw new Error("Confirmá el pedido antes de registrar la recepción.");
    }
    if (reposicion.estado === "RECIBIDO") {
      throw new Error("El pedido ya fue recibido por completo.");
    }

    db.transaction((tx) => {
      for (const r of data.recepciones) {
        if (r.cantidad <= 0) continue;
        const detalle = tx
          .select()
          .from(detalleReposicion)
          .where(eq(detalleReposicion.id, r.detalleId))
          .get();
        if (!detalle || detalle.reposicionId !== data.id) {
          throw new Error("Detalle de reposición inválido.");
        }
        const pendiente = detalle.cantidadSolicitada - detalle.cantidadRecibida;
        const recibirAhora = Math.min(r.cantidad, pendiente);
        if (recibirAhora <= 0) continue;

        tx.update(detalleReposicion)
          .set({ cantidadRecibida: sql`${detalleReposicion.cantidadRecibida} + ${recibirAhora}` })
          .where(eq(detalleReposicion.id, r.detalleId))
          .run();
        tx.update(productos)
          .set({ stock: sql`${productos.stock} + ${recibirAhora}` })
          .where(eq(productos.id, detalle.productoId))
          .run();
        registrarMovimientoStock(tx, {
          productoId: detalle.productoId,
          tipoMovimiento: "REPOSICION",
          cantidad: recibirAhora,
          ordenId: null,
          usuarioId: context.usuario.id,
        });
      }

      const itemsActualizados = tx
        .select()
        .from(detalleReposicion)
        .where(eq(detalleReposicion.reposicionId, data.id))
        .all();
      const completo = itemsActualizados.every(
        (it) => it.cantidadRecibida >= it.cantidadSolicitada,
      );
      tx.update(reposicionesStock)
        .set({ estado: completo ? "RECIBIDO" : "CONFIRMADO" })
        .where(eq(reposicionesStock.id, data.id))
        .run();
    });

    return conDetalle(
      db.select().from(reposicionesStock).where(eq(reposicionesStock.id, data.id)).get()!,
    );
  });
