import { defineConfig } from "@playwright/test";

// T-24 — suite chica de integración para los casos de "permisos" que no se
// pueden testear con Vitest (authMiddleware/adminMiddleware dependen del
// contexto de request real de TanStack Start). Levanta el server real de
// `npm run dev` y espera el puerto antes de correr.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
