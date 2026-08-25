import { createMiddleware } from "@tanstack/react-start";
import { getSession } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { usuarios } from "./schema";
import { sessionConfig, type SesionData } from "./session";

type Usuario = typeof usuarios.$inferSelect;

// Nunca devolver el hash de la contraseña al cliente.
export function toPublicUsuario(u: Usuario) {
  const { contrasena: _contrasena, ...rest } = u;
  return rest;
}

// RF01.1 / RNF03 — toda server function protegida vuelve a resolver el
// usuario desde la base en cada llamada: nunca confía en un id o rol que
// venga del cliente. Ocultar botones en la UI no es control de acceso.
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await getSession<SesionData>(sessionConfig);
  const usuarioId = session.data.usuarioId;
  if (!usuarioId) throw new Error("No autenticado.");

  const usuario = db.select().from(usuarios).where(eq(usuarios.id, usuarioId)).get();
  if (!usuario || !usuario.activo) throw new Error("No autenticado.");

  return next({ context: { usuario } });
});

export const adminMiddleware = createMiddleware({ type: "function" })
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    if (context.usuario.rol !== "ADMINISTRADOR") {
      throw new Error("No autorizado: se requiere rol Administrador.");
    }
    return next();
  });
