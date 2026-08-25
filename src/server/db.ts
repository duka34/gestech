import "dotenv/config";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { ejecutarControlVencimientos } from "./vencimientos";

const dbPath = process.env.DATABASE_URL ?? "db/gestech.sqlite3";
const dbDir = dirname(dbPath);
if (dbDir && !existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Aplica migraciones pendientes al levantar el servidor — sin pasos manuales
// en npm run dev. Se ejecuta una sola vez por proceso.
// Ruta relativa a process.cwd() (no a import.meta.dirname): una vez
// compilado para producción, db.ts queda empaquetado en un único archivo
// (dist/server/server.js) que ya no tiene la carpeta `migrations` al lado —
// esta ruta sigue apuntando a los .sql fuente, que se despliegan tal cual.
migrate(db, { migrationsFolder: join(process.cwd(), "src/server/migrations") });

// Garantiza la fila única de contadores (T-04) si la base es nueva.
const secuenciasExistentes = sqlite.prepare("SELECT COUNT(*) as n FROM secuencias").get() as {
  n: number;
};
if (secuenciasExistentes.n === 0) {
  sqlite.prepare("INSERT INTO secuencias (orden_seq, comprobante_seq) VALUES (0, 0)").run();
}

// T-21 — "tarea programada diaria" (spec, decisión de implementación de
// RF05.5): sin infraestructura de jobs en este proyecto, se corre acá mismo,
// una vez al levantar el proceso y después cada 24 h. `globalThis` sobrevive
// el HMR de Vite en desarrollo, así que el flag evita registrar el interval
// más de una vez por proceso.
// No registrar el scheduler bajo Vitest (variable que setea solo en sus
// workers): importar db.ts en un test no debe dejar un setInterval real
// corriendo — misma clase de bug que colgaba `npm run db:seed` (ver seed.ts).
const g = globalThis as unknown as { __gestechSchedulerStarted?: boolean };
if (!process.env.VITEST && !g.__gestechSchedulerStarted) {
  g.__gestechSchedulerStarted = true;
  const correr = () => {
    try {
      ejecutarControlVencimientos(db);
    } catch (err) {
      console.error("[gestech] Falló el control de vencimientos programado:", err);
    }
  };
  correr();
  setInterval(correr, 24 * 60 * 60 * 1000);
}
