import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Aislado en su propio módulo a propósito: `authMiddleware`/`adminMiddleware`
// (src/server/auth.ts) se importan desde archivos que el cliente también
// carga (para construir la cadena de la server function), y ese import no
// pasa por la extracción de "solo servidor" que sí aplica sobre el cuerpo de
// `.handler(...)`. Si estas funciones vivieran en el mismo archivo que el
// middleware, su `import "node:crypto"` de nivel superior terminaría
// evaluándose también en el bundle del navegador. Mientras se use
// exclusivamente dentro de `.handler(...)` (fn/auth.ts, fn/usuarios.ts,
// seed.ts), el bundler sí logra dejarlo fuera del cliente.

const KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const candidate = scryptSync(plain, salt, KEYLEN);
  if (candidate.length !== hashBuffer.length) return false;
  return timingSafeEqual(candidate, hashBuffer);
}
