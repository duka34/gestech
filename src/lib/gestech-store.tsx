import type { EstadoOrden } from "./gestech-data";

// Ya no queda ningún dato de negocio en localStorage: autenticación/usuarios
// (Fase 0), clientes (Fase 1), órdenes/stock (Fase 2), y el chat de WhatsApp
// (Fase 4, T-18 — ver src/server/fn/chatbot.ts) viven todos en el backend
// real. Este módulo sobrevive solo como las constantes de UI que ya usan
// varias pantallas (estadoLabel/estadoColor/tipoLabel), para no generar más
// *churn* de imports.

export const estadoLabel: Record<EstadoOrden, string> = {
  ingresado: "Ingresado",
  agendado: "Agendado",
  presupuestado: "Presupuestado",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  en_proceso: "En proceso",
  pendiente_retiro: "Pendiente de retiro",
  entregado: "Entregado",
  finalizado: "Finalizado",
  abandonado: "Abandonado",
  anulado: "Anulado",
};

export const estadoColor: Record<EstadoOrden, string> = {
  ingresado: "bg-muted text-foreground",
  agendado: "bg-muted text-foreground",
  presupuestado: "bg-warning/20 text-warning-foreground",
  aprobado: "bg-success/15 text-success",
  rechazado: "bg-destructive/15 text-destructive",
  en_proceso: "bg-primary/15 text-primary",
  pendiente_retiro: "bg-success/20 text-success",
  entregado: "bg-foreground/10 text-foreground",
  finalizado: "bg-foreground/10 text-foreground",
  abandonado: "bg-destructive/20 text-destructive",
  anulado: "bg-destructive/10 text-destructive",
};

export const tipoLabel = {
  servicio_tecnico: "Servicio técnico",
  instalacion_camaras: "Instalación de cámaras",
  mantenimiento_camaras: "Mantenimiento de cámaras",
} as const;

// Espejo (en enum de UI) de ESTADOS_TERMINALES.SERVICIO_TECNICO en
// src/server/estados.ts — ningún estado terminal admite autoasignación
// (RF10.2, GESTECH_CAMBIOS_ASIGNACION.md): el ciclo de vida ya cerró.
export const ESTADOS_TERMINALES_SERVICIO_TECNICO: EstadoOrden[] = [
  "entregado",
  "abandonado",
  "rechazado",
  "anulado",
];
