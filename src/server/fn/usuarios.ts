import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { validarPassword, validarUsername } from "@/lib/gestech-data";
import { registrarAsignacionTecnico } from "../audit";
import { adminMiddleware, authMiddleware, toPublicUsuario } from "../auth";
import { db } from "../db";
import type { db as dbInstance } from "../db";
import { ESTADOS_TERMINALES, type TipoServicio } from "../estados";
import { ESTADO_DB_TO_UI, type EstadoOrdenDb } from "../mappers";
import { hashPassword } from "../password";
import { clientes, ordenesTrabajo, usuarios } from "../schema";

function contarOtrosAdminsActivos(excludeId: number): number {
  const rows = db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.rol, "ADMINISTRADOR"), eq(usuarios.activo, true)))
    .all();
  return rows.filter((u) => u.id !== excludeId).length;
}

// RF10.7 (rev. GESTECH_CAMBIOS_ASIGNACION.md) — "orden activa" = no está en un
// estado terminal para su tipo de servicio. Mismo criterio que ya usa
// consultarEstadoPorChatbotFn (fn/chatbot.ts): se reutiliza ESTADOS_TERMINALES
// en vez de redefinir la regla.
function ordenesActivasDe(db: typeof dbInstance, tecnicoId: number) {
  return db
    .select({
      id: ordenesTrabajo.id,
      tipoServicio: ordenesTrabajo.tipoServicio,
      estado: ordenesTrabajo.estado,
      clienteId: ordenesTrabajo.clienteId,
    })
    .from(ordenesTrabajo)
    .where(eq(ordenesTrabajo.tecnicoResponsableId, tecnicoId))
    .all()
    .filter((o) => !ESTADOS_TERMINALES[o.tipoServicio as TipoServicio].includes(o.estado));
}

const nombreUsuarioSchema = z
  .string()
  .refine(
    validarUsername,
    "Usuario inválido: 4–16 caracteres, solo letras y números, sin espacios.",
  );
const contrasenaSchema = z
  .string()
  .refine(
    validarPassword,
    "Contraseña inválida: 4–16 caracteres, con letras y números, sin espacios.",
  );

const crearUsuarioSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio."),
  apellido: z.string().min(1, "El apellido es obligatorio."),
  nombreUsuario: nombreUsuarioSchema,
  contrasena: contrasenaSchema,
  rol: z.enum(["ADMINISTRADOR", "TECNICO"]),
});

export const crearUsuarioFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => crearUsuarioSchema.parse(d))
  .handler(async ({ data }) => {
    const existente = db
      .select()
      .from(usuarios)
      .where(eq(usuarios.nombreUsuario, data.nombreUsuario))
      .get();
    if (existente) throw new Error("El nombre de usuario ya existe.");

    const creado = db
      .insert(usuarios)
      .values({
        nombre: data.nombre.trim(),
        apellido: data.apellido.trim(),
        nombreUsuario: data.nombreUsuario,
        contrasena: hashPassword(data.contrasena),
        rol: data.rol,
      })
      .returning()
      .get();
    return toPublicUsuario(creado);
  });

const actualizarUsuarioSchema = z.object({
  id: z.number(),
  nombre: z.string().min(1).optional(),
  apellido: z.string().min(1).optional(),
  nombreUsuario: nombreUsuarioSchema.optional(),
  contrasena: contrasenaSchema.optional(),
  rol: z.enum(["ADMINISTRADOR", "TECNICO"]).optional(),
});

export const actualizarUsuarioFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => actualizarUsuarioSchema.parse(d))
  .handler(async ({ data }) => {
    const actual = db.select().from(usuarios).where(eq(usuarios.id, data.id)).get();
    if (!actual) throw new Error("Usuario no encontrado.");

    if (data.nombreUsuario && data.nombreUsuario !== actual.nombreUsuario) {
      const duplicado = db
        .select()
        .from(usuarios)
        .where(eq(usuarios.nombreUsuario, data.nombreUsuario))
        .get();
      if (duplicado) throw new Error("El nombre de usuario ya existe.");
    }

    // Última línea de defensa contra dejar el sistema sin administrador
    // (decisión de implementación de spec §2.1).
    const dejaDeSerAdmin =
      actual.rol === "ADMINISTRADOR" && data.rol && data.rol !== "ADMINISTRADOR";
    if (dejaDeSerAdmin && actual.activo && contarOtrosAdminsActivos(actual.id) === 0) {
      throw new Error("No es posible dar de baja al único administrador del sistema.");
    }

    const actualizado = db
      .update(usuarios)
      .set({
        ...(data.nombre !== undefined && { nombre: data.nombre.trim() }),
        ...(data.apellido !== undefined && { apellido: data.apellido.trim() }),
        ...(data.nombreUsuario !== undefined && { nombreUsuario: data.nombreUsuario }),
        ...(data.contrasena !== undefined && { contrasena: hashPassword(data.contrasena) }),
        ...(data.rol !== undefined && { rol: data.rol }),
      })
      .where(eq(usuarios.id, data.id))
      .returning()
      .get();
    return toPublicUsuario(actualizado);
  });

export const darDeBajaUsuarioFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const actual = db.select().from(usuarios).where(eq(usuarios.id, data.id)).get();
    if (!actual) throw new Error("Usuario no encontrado.");
    if (
      actual.rol === "ADMINISTRADOR" &&
      actual.activo &&
      contarOtrosAdminsActivos(actual.id) === 0
    ) {
      throw new Error("No es posible dar de baja al único administrador del sistema.");
    }

    // RF10.7 — no se puede dar de baja directo a un Técnico con órdenes
    // activas: hay que reasignarlas antes (reasignarPorBajaFn).
    const activas = ordenesActivasDe(db, data.id);
    if (activas.length > 0) {
      const clientesPorId = new Map(
        db
          .select()
          .from(clientes)
          .all()
          .map((c) => [c.id, c]),
      );
      return {
        ok: false as const,
        ordenes: activas.map((o) => {
          const c = clientesPorId.get(o.clienteId);
          return {
            id: o.id,
            cliente: c ? `${c.nombre} ${c.apellido}` : "—",
            estado: ESTADO_DB_TO_UI[o.estado as EstadoOrdenDb],
          };
        }),
      };
    }

    db.update(usuarios).set({ activo: false }).where(eq(usuarios.id, data.id)).run();
    return { ok: true as const };
  });

// RF10.8 — reasignación masiva + baja, en una única transacción: si falla
// la reasignación de alguna orden, no se da de baja al usuario. Exportado
// (T-24): permite testear la reversión completa sin pasar por adminMiddleware.
export function reasignarPorBajaCore(
  db: typeof dbInstance,
  opts: {
    usuarioId: number;
    tecnicoDestinoId: number;
    motivo: string;
    usuarioResponsableId: number;
  },
) {
  if (opts.tecnicoDestinoId === opts.usuarioId) {
    throw new Error("El técnico destino no puede ser el mismo que se está dando de baja.");
  }
  const destino = db.select().from(usuarios).where(eq(usuarios.id, opts.tecnicoDestinoId)).get();
  if (!destino || !destino.activo) throw new Error("Técnico destino inválido o inactivo.");

  const activas = ordenesActivasDe(db, opts.usuarioId);

  db.transaction((tx) => {
    for (const orden of activas) {
      tx.update(ordenesTrabajo)
        .set({ tecnicoResponsableId: opts.tecnicoDestinoId })
        .where(eq(ordenesTrabajo.id, orden.id))
        .run();
      // Registro individual por orden (no agrupado) — pedido explícito de
      // GESTECH_CAMBIOS_ASIGNACION.md, para que el historial por orden siga
      // siendo completo.
      registrarAsignacionTecnico(tx, {
        ordenId: orden.id,
        tecnicoAsignadoId: opts.tecnicoDestinoId,
        tecnicoAnteriorId: opts.usuarioId,
        usuarioResponsableId: opts.usuarioResponsableId,
        motivo: opts.motivo,
        tipoAsignacion: "REASIGNACION_POR_BAJA",
      });
    }
    tx.update(usuarios).set({ activo: false }).where(eq(usuarios.id, opts.usuarioId)).run();
  });

  return { ok: true as const, reasignadas: activas.length };
}

const reasignarPorBajaSchema = z.object({
  usuarioId: z.number(),
  tecnicoDestinoId: z.number(),
  motivo: z.string().min(1, "El motivo es obligatorio."),
});

export const reasignarPorBajaFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => reasignarPorBajaSchema.parse(d))
  .handler(async ({ data, context }) => {
    return reasignarPorBajaCore(db, {
      usuarioId: data.usuarioId,
      tecnicoDestinoId: data.tecnicoDestinoId,
      motivo: data.motivo.trim(),
      usuarioResponsableId: context.usuario.id,
    });
  });

// Lectura disponible para cualquier usuario autenticado: la gestión completa
// (crear/editar/dar de baja) es exclusiva del Administrador (spec §7), pero
// otras pantallas —como asignar el técnico responsable de una orden—
// necesitan poder listar los usuarios activos sin ser Admin.
export const listarUsuariosFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const rows = db.select().from(usuarios).all();
    return rows.map(toPublicUsuario);
  });
