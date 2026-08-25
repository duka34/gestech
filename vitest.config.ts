import { defineConfig } from "vitest/config";

// Config propia, separada de vite.config.ts: los tests son de módulos de
// servidor (Node), no necesitan tanstackStart()/viteReact()/tailwindcss().
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Crítico: db.ts NO se reevalúa de forma confiable por archivo de test
    // (el módulo — y su conexión sqlite — puede quedar cacheado entre
    // archivos dentro del mismo worker). Setearlo acá, a nivel de proceso
    // ANTES de que cualquier módulo se importe, es la única forma robusta de
    // garantizar que jamás se abra la base de datos real durante los tests.
    env: { DATABASE_URL: ":memory:" },
    isolate: true,
    fileParallelism: false,
  },
});
