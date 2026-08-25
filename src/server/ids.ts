import { eq, sql } from "drizzle-orm";
import type { db as dbInstance } from "./db";
import { secuencias } from "./schema";

// T-04 — Generación atómica de IDs correlativos (GESTECH_SPEC.md §2.3.1).
// No se calcula con MAX(id) + 1 en código de aplicación: con dos usuarios
// creando órdenes a la vez eso colisiona. En su lugar, se incrementa un
// contador en la base dentro de una transacción. Con better-sqlite3
// (síncrono, conexión única, un solo proceso Node) esto es atómico en la
// práctica: ningún otro código JS corre mientras la transacción se ejecuta.
// El contador nunca retrocede, ni siquiera si la orden se anula.

const SECUENCIA_ID = 1;
const MAX_6_DIGITOS = 999_999;

function pad6(n: number): string {
  return n.toString().padStart(6, "0");
}

function incrementar(db: typeof dbInstance, campo: "ordenSeq" | "comprobanteSeq"): number {
  const fila = db.transaction((tx) => {
    if (campo === "ordenSeq") {
      tx.update(secuencias)
        .set({ ordenSeq: sql`${secuencias.ordenSeq} + 1` })
        .where(eq(secuencias.id, SECUENCIA_ID))
        .run();
      return tx
        .select({ v: secuencias.ordenSeq })
        .from(secuencias)
        .where(eq(secuencias.id, SECUENCIA_ID))
        .get();
    }
    tx.update(secuencias)
      .set({ comprobanteSeq: sql`${secuencias.comprobanteSeq} + 1` })
      .where(eq(secuencias.id, SECUENCIA_ID))
      .run();
    return tx
      .select({ v: secuencias.comprobanteSeq })
      .from(secuencias)
      .where(eq(secuencias.id, SECUENCIA_ID))
      .get();
  });
  if (!fila) throw new Error(`No se pudo generar el siguiente valor de "${campo}".`);
  return fila.v;
}

/** IDs de orden: 6 dígitos, correlativos, irrepetibles y no reutilizables (RF03.1.1). */
export function siguienteNumeroOrden(db: typeof dbInstance): string {
  const n = incrementar(db, "ordenSeq");
  if (n > MAX_6_DIGITOS) {
    throw new Error("Se agotó el rango de 6 dígitos para IDs de orden (999999).");
  }
  return pad6(n);
}

/** Números de comprobante: misma regla de correlativo atómico. */
export function siguienteNumeroComprobante(db: typeof dbInstance): string {
  const n = incrementar(db, "comprobanteSeq");
  if (n > MAX_6_DIGITOS) {
    throw new Error("Se agotó el rango de 6 dígitos para números de comprobante (999999).");
  }
  return pad6(n);
}
