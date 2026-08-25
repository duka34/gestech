import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../auth";
import { db as dbInstance } from "../db";
import { clientes } from "../schema";

// RF09 / CU2 — Verificación de cliente existente.

type Tx = Parameters<Parameters<typeof dbInstance.transaction>[0]>[0];
type DbOrTx = typeof dbInstance | Tx;

// Decisión de implementación (spec §2.2) — el teléfono (y, por prolijidad,
// el DNI) se normalizan a solo dígitos al guardar: es la clave con la que
// más adelante el Chatbot identificará al cliente en los mensajes entrantes.
function normalizarDigitos(raw: string): string {
  return raw.replace(/\D/g, "");
}

export const dniSchema = z
  .string()
  .transform(normalizarDigitos)
  .refine((v) => v.length >= 6, "DNI inválido.");
export const telefonoSchema = z
  .string()
  .transform(normalizarDigitos)
  .refine((v) => v.length >= 8, "Teléfono inválido.");

export type ClienteInput = {
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  domicilio?: string;
};

// Alta o actualización por DNI, reutilizable desde cualquier transacción del
// servidor (p. ej. crearOrdenFn en fn/ordenes.ts) — no solo desde la server
// function pública `guardarClienteFn`.
export function upsertCliente(db: DbOrTx, data: ClienteInput) {
  try {
    const existente = db.select().from(clientes).where(eq(clientes.dni, data.dni)).get();
    if (existente) {
      return db
        .update(clientes)
        .set({
          nombre: data.nombre.trim(),
          apellido: data.apellido.trim(),
          telefono: data.telefono,
          domicilio: data.domicilio ?? existente.domicilio,
        })
        .where(eq(clientes.id, existente.id))
        .returning()
        .get();
    }
    return db
      .insert(clientes)
      .values({
        nombre: data.nombre.trim(),
        apellido: data.apellido.trim(),
        dni: data.dni,
        telefono: data.telefono,
        domicilio: data.domicilio,
      })
      .returning()
      .get();
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      throw new Error("Ya existe otro cliente registrado con ese teléfono.");
    }
    throw err;
  }
}

const buscarSchema = z.object({ query: z.string().min(1) });

export const buscarClienteFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => buscarSchema.parse(d))
  .handler(async ({ data }) => {
    const normalizado = normalizarDigitos(data.query);
    if (!normalizado) return null;
    const porDni = dbInstance.select().from(clientes).where(eq(clientes.dni, normalizado)).get();
    if (porDni) return porDni;
    return (
      dbInstance.select().from(clientes).where(eq(clientes.telefono, normalizado)).get() ?? null
    );
  });

const guardarClienteSchema = z.object({
  nombre: z.string().min(1),
  apellido: z.string().min(1),
  dni: dniSchema,
  telefono: telefonoSchema,
  domicilio: z.string().optional(),
});

export const guardarClienteFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => guardarClienteSchema.parse(d))
  .handler(async ({ data }) => upsertCliente(dbInstance, data));
