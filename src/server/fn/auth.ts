import { createServerFn } from "@tanstack/react-start";
import { clearSession, getSession, updateSession } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { toPublicUsuario } from "../auth";
import { db } from "../db";
import { verifyPassword } from "../password";
import { usuarios } from "../schema";
import { sessionConfig, type SesionData } from "../session";

const loginSchema = z.object({
  nombreUsuario: z.string().min(1),
  contrasena: z.string().min(1),
});

// RF01.1 — la única server function pública de este módulo. El mensaje de
// error es siempre el mismo, exista o no el usuario, para no revelar cuál de
// los dos datos falló.
export const loginFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => loginSchema.parse(data))
  .handler(async ({ data }) => {
    const usuario = db
      .select()
      .from(usuarios)
      .where(eq(usuarios.nombreUsuario, data.nombreUsuario))
      .get();
    const valido =
      !!usuario && usuario.activo && verifyPassword(data.contrasena, usuario.contrasena);
    if (!valido || !usuario) {
      throw new Error("Usuario o contraseña incorrectos.");
    }
    await updateSession<SesionData>(sessionConfig, { usuarioId: usuario.id });
    return toPublicUsuario(usuario);
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  await clearSession(sessionConfig);
  return { ok: true };
});

// Usado por el cliente para saber quién está logueado (o null). No exige
// sesión: es justamente lo que resuelve.
export const meFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getSession<SesionData>(sessionConfig);
  const usuarioId = session.data.usuarioId;
  if (!usuarioId) return null;
  const usuario = db.select().from(usuarios).where(eq(usuarios.id, usuarioId)).get();
  if (!usuario || !usuario.activo) return null;
  return toPublicUsuario(usuario);
});
