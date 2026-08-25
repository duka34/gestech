import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { MensajeChat } from "@/lib/gestech-data";
import { adminMiddleware, authMiddleware } from "../auth";
import { db } from "../db";
import { ESTADOS_TERMINALES } from "../estados";
import { ESTADO_DB_TO_UI, type EstadoOrdenDb, type TipoServicioDb } from "../mappers";
import { clientes, conversacionesChatbot, ordenesTrabajo } from "../schema";

// T-18 — Registro de conversaciones (spec §2.15). Reemplaza el chat simulado
// que vivía en gestech-store.tsx/localStorage.

type MensajeRow = typeof conversacionesChatbot.$inferSelect;

function toMensajeUi(m: MensajeRow, clienteNombre: string): MensajeChat {
  return {
    id: String(m.id),
    ordenId: m.ordenId ?? undefined,
    cliente: clienteNombre,
    direccion: m.direccion === "ENTRANTE" ? "entrante" : "saliente",
    tipo: m.tipo as MensajeChat["tipo"],
    texto: m.contenido,
    fecha: m.fechaHora,
  };
}

const enviarMensajeSchema = z.object({
  ordenId: z.string(),
  direccion: z.enum(["entrante", "saliente"]),
  tipo: z.enum([
    "presupuesto",
    "recordatorio",
    "comprobante",
    "aprobacion",
    "respuesta",
    "abandono",
    "consulta",
  ]),
  contenido: z.string().min(1),
});

// Reemplaza sendChat() del store viejo.
export const enviarMensajeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => enviarMensajeSchema.parse(d))
  .handler(async ({ data }) => {
    const orden = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, data.ordenId)).get();
    if (!orden) throw new Error("Orden no encontrada.");
    const fila = db
      .insert(conversacionesChatbot)
      .values({
        clienteId: orden.clienteId,
        ordenId: orden.id,
        direccion: data.direccion === "entrante" ? "ENTRANTE" : "SALIENTE",
        tipo: data.tipo,
        contenido: data.contenido,
      })
      .returning()
      .get();
    const cliente = db.select().from(clientes).where(eq(clientes.id, orden.clienteId)).get();
    return toMensajeUi(fila, cliente ? `${cliente.nombre} ${cliente.apellido}` : "");
  });

// Card "Conversación WhatsApp" del detalle de una orden — Técnico y Admin.
export const listarConversacionPorOrdenFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => z.object({ ordenId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const orden = db.select().from(ordenesTrabajo).where(eq(ordenesTrabajo.id, data.ordenId)).get();
    if (!orden) return [];
    const cliente = db.select().from(clientes).where(eq(clientes.id, orden.clienteId)).get();
    const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellido}` : "";
    return db
      .select()
      .from(conversacionesChatbot)
      .where(eq(conversacionesChatbot.ordenId, data.ordenId))
      .orderBy(desc(conversacionesChatbot.fechaHora))
      .all()
      .map((m) => toMensajeUi(m, nombreCliente));
  });

// T-19/RF14/CU13 — todas las conversaciones, exclusivo del Administrador,
// solo lectura.
export const listarConversacionesFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => {
    const mensajes = db
      .select()
      .from(conversacionesChatbot)
      .orderBy(desc(conversacionesChatbot.fechaHora))
      .all();
    const clientesPorId = new Map(
      db
        .select()
        .from(clientes)
        .all()
        .map((c) => [c.id, `${c.nombre} ${c.apellido}`]),
    );
    return mensajes.map((m) => toMensajeUi(m, clientesPorId.get(m.clienteId) ?? ""));
  });

// T-20/RF13/CU11 — consulta de estado vía Chatbot. El Cliente no tiene login
// (spec §1): la dispara un Administrador simulando el mensaje entrante,
// mismo criterio que los botones "Simular respuesta del cliente" del
// detalle de orden.
function normalizarDigitos(raw: string): string {
  return raw.replace(/\D/g, "");
}

const consultarEstadoSchema = z.object({
  telefono: z.string().min(1),
  ordenId: z.string().optional(),
});

type ResultadoConsulta =
  | { tipo: "sin_cliente"; mensaje: string }
  | { tipo: "sin_ordenes"; mensaje: string }
  | { tipo: "requiere_id"; ordenes: string[] }
  | { tipo: "no_encontrada"; mensaje: string }
  | { tipo: "estado"; mensaje: string; ordenId: string };

export const consultarEstadoPorChatbotFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => consultarEstadoSchema.parse(d))
  .handler(async ({ data }): Promise<ResultadoConsulta> => {
    const telefono = normalizarDigitos(data.telefono);
    const cliente = db.select().from(clientes).where(eq(clientes.telefono, telefono)).get();
    if (!cliente) {
      return { tipo: "sin_cliente", mensaje: "No encontramos un cliente con ese número." };
    }

    const registrar = (
      direccion: "ENTRANTE" | "SALIENTE",
      contenido: string,
      ordenId: string | null,
    ) => {
      db.insert(conversacionesChatbot)
        .values({ clienteId: cliente.id, ordenId, direccion, tipo: "consulta", contenido })
        .run();
    };
    registrar(
      "ENTRANTE",
      "estado" + (data.ordenId ? ` ${data.ordenId}` : ""),
      data.ordenId ?? null,
    );

    // "Orden activa" = no está en un estado terminal (decisión de
    // implementación de la spec, RF13.1.1) — reutiliza ESTADOS_TERMINALES,
    // ya definida en estados.ts (T-02) para no duplicar la regla.
    const ordenesCliente = db
      .select()
      .from(ordenesTrabajo)
      .where(eq(ordenesTrabajo.clienteId, cliente.id))
      .all();
    const activas = ordenesCliente.filter(
      (o) => !ESTADOS_TERMINALES[o.tipoServicio as TipoServicioDb].includes(o.estado),
    );

    if (activas.length === 0) {
      const texto = "No se encontraron órdenes en curso asociadas a tu número.";
      registrar("SALIENTE", texto, null);
      return { tipo: "sin_ordenes", mensaje: texto };
    }

    let orden = activas[0];
    if (activas.length > 1 || (data.ordenId && data.ordenId !== orden.id)) {
      if (!data.ordenId) {
        return { tipo: "requiere_id", ordenes: activas.map((o) => o.id) };
      }
      // RF13.1.2 — la orden consultada debe pertenecer a este teléfono; al
      // buscar solo dentro de `activas` (ya filtradas por clienteId) es
      // imposible acceder a una orden ajena.
      const encontrada = activas.find((o) => o.id === data.ordenId);
      if (!encontrada) {
        const texto = `No encontramos la orden ${data.ordenId} asociada a tu número.`;
        registrar("SALIENTE", texto, null);
        return { tipo: "no_encontrada", mensaje: texto };
      }
      orden = encontrada;
    }

    const estadoUi = ESTADO_DB_TO_UI[orden.estado as EstadoOrdenDb];
    const subEstadoTxt =
      orden.estado === "EN_PROCESO" && orden.subEstado ? ` (${orden.subEstado})` : "";
    const texto = `Tu orden ${orden.id} está en estado: ${estadoUi}${subEstadoTxt}.`;
    registrar("SALIENTE", texto, orden.id);
    return { tipo: "estado", mensaje: texto, ordenId: orden.id };
  });
