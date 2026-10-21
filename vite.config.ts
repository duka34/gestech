import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { allowedHosts: [".trycloudflare.com", ".ts.net"] },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
