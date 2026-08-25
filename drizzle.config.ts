import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/schema.ts",
  out: "./src/server/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "db/gestech.sqlite3",
  },
});
