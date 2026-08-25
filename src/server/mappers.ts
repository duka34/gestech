import type { EstadoOrden, TipoServicio } from "@/lib/gestech-data";

// La base guarda los enums literales de la spec (mayúsculas, trazables a
// RF04/§3); toda la UI existente (estadoLabel, estadoColor, tipoLabel,
// estadosPorTipo, filtros, badges) ya funciona sobre los valores en
// minúsculas de gestech-data.ts. En vez de reescribir esa UI ya pulida, se
// traduce acá, en el límite entre servidor y cliente.

export const TIPO_DB_TO_UI = {
  SERVICIO_TECNICO: "servicio_tecnico",
  INSTALACION_CAMARAS: "instalacion_camaras",
  MANTENIMIENTO_CAMARAS: "mantenimiento_camaras",
} as const satisfies Record<string, TipoServicio>;

export type TipoServicioDb = keyof typeof TIPO_DB_TO_UI;

export const TIPO_UI_TO_DB = {
  servicio_tecnico: "SERVICIO_TECNICO",
  instalacion_camaras: "INSTALACION_CAMARAS",
  mantenimiento_camaras: "MANTENIMIENTO_CAMARAS",
} as const satisfies Record<TipoServicio, TipoServicioDb>;

export const ESTADO_DB_TO_UI = {
  INGRESADO: "ingresado",
  AGENDADO: "agendado",
  PRESUPUESTADO: "presupuestado",
  APROBADO: "aprobado",
  RECHAZADO: "rechazado",
  EN_PROCESO: "en_proceso",
  PENDIENTE_DE_RETIRO: "pendiente_retiro",
  ENTREGADO: "entregado",
  ABANDONADO: "abandonado",
  FINALIZADO: "finalizado",
  ANULADO: "anulado",
} as const satisfies Record<string, EstadoOrden>;

export type EstadoOrdenDb = keyof typeof ESTADO_DB_TO_UI;

export const ESTADO_UI_TO_DB = {
  ingresado: "INGRESADO",
  agendado: "AGENDADO",
  presupuestado: "PRESUPUESTADO",
  aprobado: "APROBADO",
  rechazado: "RECHAZADO",
  en_proceso: "EN_PROCESO",
  pendiente_retiro: "PENDIENTE_DE_RETIRO",
  entregado: "ENTREGADO",
  abandonado: "ABANDONADO",
  finalizado: "FINALIZADO",
  anulado: "ANULADO",
} as const satisfies Record<EstadoOrden, EstadoOrdenDb>;
