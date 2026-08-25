// T-24 — helpers compartidos por los tests de Vitest. Fuerza una base
// SQLite en memoria ANTES de importar "./db": ese módulo corre sus
// migraciones y siembra `secuencias` al importarse (mismo mecanismo que usa
// en dev/prod), así que una base de test lista no requiere setup manual.
process.env.DATABASE_URL = ":memory:";

import { clientes, ordenesTrabajo, productos, usuarios } from "./schema";

export { db } from "./db";

// Sufijo único por llamada, basado en el reloj monotónico del proceso (no un
// contador reiniciado en 0): evita colisiones de UNIQUE sin asumir nada
// sobre si Vitest reevalúa este módulo fresco entre archivos de test.
let contadorLocal = 0;
function sufijo(): string {
  contadorLocal += 1;
  return `${process.hrtime.bigint()}${contadorLocal}`;
}

export function crearClienteTest(
  db: typeof import("./db").db,
  overrides: Partial<typeof clientes.$inferInsert> = {},
) {
  const s = sufijo();
  return db
    .insert(clientes)
    .values({
      nombre: "Cliente",
      apellido: "Test",
      dni: s.slice(-8),
      telefono: `549${s.slice(-10)}`,
      ...overrides,
    })
    .returning()
    .get();
}

export function crearUsuarioTest(
  db: typeof import("./db").db,
  overrides: Partial<typeof usuarios.$inferInsert> = {},
) {
  const s = sufijo();
  return db
    .insert(usuarios)
    .values({
      nombre: "Usuario",
      apellido: "Test",
      nombreUsuario: `test${s.slice(-8)}`,
      contrasena: "hash:irrelevante",
      rol: "TECNICO",
      ...overrides,
    })
    .returning()
    .get();
}

export function crearProductoTest(
  db: typeof import("./db").db,
  overrides: Partial<typeof productos.$inferInsert> = {},
) {
  return db
    .insert(productos)
    .values({
      nombre: `Producto Test ${sufijo()}`,
      categoria: "CAMARA",
      stock: 10,
      stockReservado: 0,
      stockMinimo: 1,
      precio: 1000,
      ...overrides,
    })
    .returning()
    .get();
}

export function crearOrdenTest(
  db: typeof import("./db").db,
  clienteId: number,
  overrides: Partial<typeof ordenesTrabajo.$inferInsert> = {},
) {
  return db
    .insert(ordenesTrabajo)
    .values({
      id: `T${sufijo()}`,
      clienteId,
      tipoServicio: "SERVICIO_TECNICO",
      descripcionTrabajo: "Trabajo de prueba",
      fechaIngreso: new Date().toISOString(),
      estado: "INGRESADO",
      ...overrides,
    })
    .returning()
    .get();
}
