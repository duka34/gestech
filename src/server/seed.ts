// Script idempotente: `npm run db:seed`. Usa imports relativos (no el alias
// "@/...") a propósito, para poder ejecutarse con `tsx` fuera de Vite (los
// imports `import type` sí pueden usar el alias — se eliminan en la
// transpilación y nunca llegan a resolverse en tiempo de ejecución).
import { eq } from "drizzle-orm";
import { ordenesSeed, stockSeed, usuariosSeed } from "../lib/gestech-data";
import { db } from "./db";
import { ESTADO_UI_TO_DB, TIPO_UI_TO_DB } from "./mappers";
import { hashPassword } from "./password";
import {
  clientes,
  comprobantes,
  cumplimentaciones,
  garantias,
  ordenesTrabajo,
  productos,
  secuencias,
  usuarios,
} from "./schema";

const ROL_MAP = { admin: "ADMINISTRADOR", tecnico: "TECNICO" } as const;
const METODO_PAGO_MAP: Record<
  string,
  "EFECTIVO" | "TRANSFERENCIA" | "TARJETA_CREDITO" | "TARJETA_DEBITO"
> = {
  efectivo: "EFECTIVO",
  transferencia: "TRANSFERENCIA",
  tarjeta_credito: "TARJETA_CREDITO",
  tarjeta_debito: "TARJETA_DEBITO",
};

function splitNombre(nombreCompleto: string): { nombre: string; apellido: string } {
  const partes = nombreCompleto.trim().split(/\s+/);
  const nombre = partes[0] ?? nombreCompleto;
  const apellido = partes.slice(1).join(" ") || nombre;
  return { nombre, apellido };
}

function normalizarDigitos(raw: string): string {
  return raw.replace(/\D/g, "");
}

function seedUsuarios() {
  for (const u of usuariosSeed) {
    const existente = db
      .select()
      .from(usuarios)
      .where(eq(usuarios.nombreUsuario, u.username))
      .get();
    if (existente) {
      console.log(`- usuario "${u.username}" ya existe, se omite.`);
      continue;
    }
    const { nombre, apellido } = splitNombre(u.nombre);
    db.insert(usuarios)
      .values({
        nombre,
        apellido,
        nombreUsuario: u.username,
        contrasena: hashPassword(u.password),
        rol: ROL_MAP[u.rol],
        activo: u.activo,
      })
      .run();
    console.log(`+ usuario "${u.username}" creado (rol ${ROL_MAP[u.rol]}).`);
  }
}

function seedProductos() {
  for (const s of stockSeed) {
    const existente = db.select().from(productos).where(eq(productos.nombre, s.nombre)).get();
    if (existente) {
      console.log(`- producto "${s.nombre}" ya existe, se omite.`);
      continue;
    }
    db.insert(productos)
      .values({
        nombre: s.nombre,
        categoria: s.categoria.toUpperCase() as "DVR" | "NVR" | "CAMARA" | "CABLE",
        stock: s.stock,
        stockMinimo: s.stockMinimo,
        precio: s.precio,
      })
      .run();
    console.log(`+ producto "${s.nombre}" creado.`);
  }
}

// Mapea el id mock viejo ("u2") -> nombreUsuario -> id real en la base.
const usernamePorMockId = new Map(usuariosSeed.map((u) => [u.id, u.username]));
function resolverTecnicoId(mockId: string): number {
  const username = usernamePorMockId.get(mockId);
  const row = username
    ? db.select().from(usuarios).where(eq(usuarios.nombreUsuario, username)).get()
    : undefined;
  return row?.id ?? 1;
}

function seedOrdenes() {
  const yaHayOrdenes = db.select({ id: ordenesTrabajo.id }).from(ordenesTrabajo).limit(1).all();
  if (yaHayOrdenes.length > 0) {
    console.log("- ya hay órdenes cargadas, se omite el seed de órdenes.");
    return;
  }

  for (const o of ordenesSeed) {
    const dni = normalizarDigitos(o.dni);
    const telefono = normalizarDigitos(o.telefono);
    let cliente = db.select().from(clientes).where(eq(clientes.dni, dni)).get();
    if (!cliente) {
      cliente = db
        .insert(clientes)
        .values({
          nombre: o.clienteNombre,
          apellido: o.clienteApellido,
          dni,
          telefono,
          domicilio: o.domicilio,
        })
        .returning()
        .get();
    }

    const ordenRow = db
      .insert(ordenesTrabajo)
      .values({
        id: o.numero,
        clienteId: cliente.id,
        tipoServicio: TIPO_UI_TO_DB[o.tipo],
        equipo: o.equipo || null,
        cantidadCamaras: o.cantidadCamaras ?? null,
        descripcionTrabajo: o.descripcion,
        fechaIngreso: o.ingresada,
        observaciones: o.observaciones ?? null,
        estado: ESTADO_UI_TO_DB[o.estado],
      })
      .returning()
      .get();

    if (o.cumplimentacion) {
      const c = o.cumplimentacion;
      const tipoGarantia = o.garantia?.tipo ?? "mantenimiento_software";
      const cumpl = db
        .insert(cumplimentaciones)
        .values({
          ordenId: ordenRow.id,
          fechaRealizacion: c.fechaRealizacion,
          descripcionTareas: c.tareasRealizadas,
          tecnicoEjecutorId: resolverTecnicoId(c.tecnicoRealizoId),
          montoCobrado: c.monto,
          metodoPago: METODO_PAGO_MAP[c.metodoPago ?? "efectivo"],
          tipoGarantia,
        })
        .returning()
        .get();

      if (o.garantia) {
        const g = o.garantia;
        const plazoDias = Math.round(
          (new Date(g.vence).getTime() - new Date(g.inicio).getTime()) / 86400000,
        );
        db.insert(garantias)
          .values({
            cumplimentacionId: cumpl.id,
            tipoGarantia: g.tipo,
            plazoDias,
            fechaInicio: g.inicio,
            fechaVencimiento: g.vence,
          })
          .run();
      }
      if (c.comprobanteNro) {
        db.insert(comprobantes)
          .values({
            numeroComprobante: c.comprobanteNro,
            cumplimentacionId: cumpl.id,
            total: c.monto,
          })
          .run();
      }
    }
    console.log(`+ orden ${o.numero} (${o.cliente}) creada.`);
  }

  // Alinea los contadores con lo que dejaba el store viejo (nextOtSeq: 146,
  // nextComprobSeq: 125), para que las próximas órdenes/comprobantes reales
  // sigan la numeración sin colisionar con las históricas recién sembradas.
  db.update(secuencias).set({ ordenSeq: 145, comprobanteSeq: 124 }).run();
  console.log("Secuencias alineadas (próxima orden 000146, próximo comprobante 000125).");
}

function main() {
  seedUsuarios();
  seedProductos();
  seedOrdenes();
  console.log("Seed completo.");
}

main();
// db.ts registra un scheduler (setInterval, T-21) al importarse, lo que
// mantiene vivo cualquier script standalone que lo importe — este script
// debe salir explícitamente al terminar.
process.exit(0);
