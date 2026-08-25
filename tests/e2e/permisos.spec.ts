import { expect, test, type Page, type Request } from "@playwright/test";

// T-24 — "Un Técnico que llama al endpoint de anulación recibe error de
// autorización, aunque la interfaz no muestre el botón" (spec §10). No se
// puede invocar authMiddleware/adminMiddleware fuera de una request real
// (dependen de getSession()), así que esto se prueba contra el server real.

const ADMIN = { username: "admin", password: "Admin123" };
const TECNICO = { username: "marcelo", password: "Marcelo1" };
const ORDEN_ID = "000142"; // sembrada; estado no-anulado, no bloqueada.

async function login(page: Page, user: { username: string; password: string }) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.waitForSelector("#username", { timeout: 20_000 });
  await page.waitForTimeout(500); // deja hidratar React antes de tocar el form
  await page.fill("#username", user.username);
  await page.fill("#password", user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(ordenes|dashboard)/, { timeout: 20_000 });
}

function decodeServerFnUrl(url: string): { file: string; export: string } | null {
  const marker = "/_serverFn/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const encoded = url.slice(idx + marker.length).split("?")[0];
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

type Capturada = {
  url: string;
  method: string;
  postData: string | null;
  headers: Record<string, string>;
};

// Headers que NO se deben replicar al reproducir la request como Técnico:
// "cookie" es la sesión del Admin capturada — reenviarla anularía por
// completo el sentido del test (estaríamos llamando como Admin, no como
// Técnico). host/content-length los recalcula el cliente HTTP solo.
const HEADERS_EXCLUIDOS = new Set(["cookie", "host", "content-length", "connection"]);
function headersSeguros(h: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(h).filter(([k]) => !HEADERS_EXCLUIDOS.has(k.toLowerCase())),
  );
}

// Captura la request real de una server function sin dejar que llegue al
// backend (route.abort): evita ejecutar de verdad una acción destructiva
// (como anular una orden) solo para aprender la URL/encoding, que son un
// detalle interno del framework — se descubren en vivo en vez de hardcodearse.
async function capturarYAbortar(
  page: Page,
  matcher: (d: { file: string; export: string }) => boolean,
  trigger: () => Promise<void>,
): Promise<Capturada> {
  let capturada: Capturada | null = null;
  await page.route("**/_serverFn/**", async (route) => {
    const req = route.request();
    const decoded = decodeServerFnUrl(req.url());
    if (decoded && matcher(decoded) && !capturada) {
      capturada = {
        url: req.url(),
        method: req.method(),
        postData: req.postData(),
        headers: req.headers(),
      };
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await trigger();
  await page.waitForTimeout(500);
  await page.unroute("**/_serverFn/**");
  if (!capturada) throw new Error("No se capturó la request esperada.");
  return capturada;
}

// Para endpoints de solo lectura (sin efecto secundario), alcanza con
// observar la request real sin interceptarla.
async function capturarSoloLectura(
  page: Page,
  matcher: (d: { file: string; export: string }) => boolean,
  trigger: () => Promise<void>,
): Promise<Capturada> {
  let capturada: Capturada | null = null;
  const onRequest = (req: Request) => {
    const decoded = decodeServerFnUrl(req.url());
    if (decoded && matcher(decoded) && !capturada) {
      capturada = {
        url: req.url(),
        method: req.method(),
        postData: req.postData(),
        headers: req.headers(),
      };
    }
  };
  page.on("request", onRequest);
  await trigger();
  await page.waitForTimeout(800);
  page.off("request", onRequest);
  if (!capturada) throw new Error("No se capturó la request esperada.");
  return capturada;
}

test.describe("Permisos — endpoints admin-only rechazan a un Técnico", () => {
  test("anularOrdenFn rechaza a un Técnico aunque conozca la URL exacta", async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await login(adminPage, ADMIN);

    const capturada = await capturarYAbortar(
      adminPage,
      (d) => d.file.includes("fn/ordenes.ts") && d.export.startsWith("anularOrdenFn"),
      async () => {
        await adminPage.goto(`/ordenes/${ORDEN_ID}`);
        await adminPage.waitForSelector('button:has-text("Anular orden")', { timeout: 10_000 });
        await adminPage.click('button:has-text("Anular orden")');
        await adminPage.waitForTimeout(300);
        await adminPage.fill("textarea", "Motivo de prueba — no debería ejecutarse jamás");
        await adminPage.click('button:has-text("Confirmar anulación")');
      },
    );
    await adminCtx.close();

    const tecnicoCtx = await browser.newContext();
    const tecnicoPage = await tecnicoCtx.newPage();
    await login(tecnicoPage, TECNICO);

    const resp = await tecnicoPage.request.fetch(capturada.url, {
      method: capturada.method,
      headers: headersSeguros(capturada.headers),
      data: capturada.postData ?? undefined,
    });
    const body = await resp.text();
    // El framework serializa el error dentro de un 200 (no vía status HTTP) —
    // se verifica el mensaje exacto de adminMiddleware, no solo "no fue 200".
    expect(body, `Respuesta: ${body}`).toContain("No autorizado: se requiere rol Administrador.");
    expect(body).toContain("$TSR/Error");
    await tecnicoCtx.close();
  });

  test("listarAlertasFn rechaza a un Técnico", async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await login(adminPage, ADMIN);
    const capturada = await capturarSoloLectura(
      adminPage,
      (d) => d.file.includes("fn/alertas.ts") && d.export.startsWith("listarAlertasFn"),
      () => adminPage.goto("/dashboard"),
    );
    await adminCtx.close();

    const tecnicoCtx = await browser.newContext();
    const tecnicoPage = await tecnicoCtx.newPage();
    await login(tecnicoPage, TECNICO);
    const resp = await tecnicoPage.request.fetch(capturada.url, {
      method: capturada.method,
      headers: headersSeguros(capturada.headers),
    });
    const body = await resp.text();
    // El framework serializa el error dentro de un 200 (no vía status HTTP) —
    // se verifica el mensaje exacto de adminMiddleware, no solo "no fue 200".
    expect(body, `Respuesta: ${body}`).toContain("No autorizado: se requiere rol Administrador.");
    expect(body).toContain("$TSR/Error");
    await tecnicoCtx.close();
  });

  test("listarConversacionesFn rechaza a un Técnico", async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await login(adminPage, ADMIN);
    const capturada = await capturarSoloLectura(
      adminPage,
      (d) => d.file.includes("fn/chatbot.ts") && d.export.startsWith("listarConversacionesFn"),
      () => adminPage.goto("/chatbot"),
    );
    await adminCtx.close();

    const tecnicoCtx = await browser.newContext();
    const tecnicoPage = await tecnicoCtx.newPage();
    await login(tecnicoPage, TECNICO);
    const resp = await tecnicoPage.request.fetch(capturada.url, {
      method: capturada.method,
      headers: headersSeguros(capturada.headers),
    });
    const body = await resp.text();
    // El framework serializa el error dentro de un 200 (no vía status HTTP) —
    // se verifica el mensaje exacto de adminMiddleware, no solo "no fue 200".
    expect(body, `Respuesta: ${body}`).toContain("No autorizado: se requiere rol Administrador.");
    expect(body).toContain("$TSR/Error");
    await tecnicoCtx.close();
  });
});
