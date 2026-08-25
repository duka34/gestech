import "dotenv/config";

// Clave fija SOLO para desarrollo local sin configurar .env. Nunca usar en producción.
const DEV_FALLBACK_SECRET = "gestech-dev-only-secret-do-not-use-in-production-please-change-me";

function resolveSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  console.warn(
    "[gestech] SESSION_SECRET no está definido (o tiene menos de 32 caracteres) — " +
      "usando una clave de desarrollo fija. Definí SESSION_SECRET en .env antes de desplegar.",
  );
  return DEV_FALLBACK_SECRET;
}

export type SesionData = { usuarioId: number };

// Configuración para useSession/getSession/updateSession/clearSession de
// @tanstack/react-start/server: cookie sellada (cifrada + firmada) del lado
// servidor, sin necesitar JWT ni manejo de cookies propio.
export const sessionConfig = {
  password: resolveSecret(),
  name: "gestech_session",
  cookie: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
  maxAge: 60 * 60 * 24 * 7, // 7 días
};
