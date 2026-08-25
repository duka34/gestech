import { createServerFn } from "@tanstack/react-start";
import { desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { adminMiddleware } from "../auth";
import { db } from "../db";
import { ejecutarControlVencimientos } from "../vencimientos";
import { alertas } from "../schema";

// T-21/RF16 — panel de alertas del Administrador. RF16.2: se visualizan
// dentro del sistema, nunca por canales externos.
export const listarAlertasFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => {
    return db
      .select()
      .from(alertas)
      .where(ne(alertas.estado, "RESUELTA"))
      .orderBy(desc(alertas.fechaGeneracion))
      .all();
  });

export const marcarAlertaVistaFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    db.update(alertas).set({ estado: "VISTA" }).where(eq(alertas.id, data.id)).run();
    return { ok: true };
  });

// Botón "Ejecutar ahora" en /chatbot — dispara manualmente el mismo proceso
// que corre solo cada 24 h (src/server/db.ts).
export const ejecutarVencimientosManualFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .handler(async () => ejecutarControlVencimientos(db));
