// Punto de entrada de producción. El build de TanStack Start
// (dist/server/server.js) exporta un handler `fetch` estilo Web Standard,
// no un servidor Node que escuche solo — srvx es el puente que lo sirve
// sobre HTTP real, leyendo PORT/HOST del entorno (convención estándar de
// Railway/Render/Fly/etc.).
//
// Ese handler solo resuelve rutas/SSR — el build deja los estáticos del
// cliente (JS/CSS) aparte, en dist/client/. En "vite dev"/"vite preview"
// eso lo sirve Vite solo; acá hay que servirlo a mano antes de caer al
// handler de la app.
import { serve } from "srvx";
import { serveStatic } from "srvx/static";
import handler from "./dist/server/server.js";

serve({
  fetch: handler.fetch,
  middleware: [serveStatic({ dir: "./dist/client" })],
});
