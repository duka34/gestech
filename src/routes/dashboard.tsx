import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  TrendingUp,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Wrench,
  Camera,
  BellRing,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { estadoLabel, estadoColor, tipoLabel } from "@/lib/gestech-store";
import { useRequireAuth } from "@/lib/use-require-auth";
import { listarOrdenesFn } from "@/server/fn/ordenes";
import { listarProductosFn } from "@/server/fn/productos";
import { listarAlertasFn, marcarAlertaVistaFn } from "@/server/fn/alertas";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Panel — GesTech" }] }),
  component: Dashboard,
});

// (adicional) — Esta vista resumen no figura entre los RF; se muestra solo al Administrador.
function Dashboard() {
  const user = useRequireAuth({ role: "ADMINISTRADOR" });
  const queryClient = useQueryClient();
  const ordenesQuery = useQuery({ queryKey: ["ordenes"], queryFn: () => listarOrdenesFn() });
  const productosQuery = useQuery({ queryKey: ["productos"], queryFn: () => listarProductosFn() });
  const alertasQuery = useQuery({
    queryKey: ["alertas"],
    queryFn: () => listarAlertasFn(),
    enabled: !!user,
  });
  const ordenes = ordenesQuery.data ?? [];
  const stock = productosQuery.data ?? [];
  const alertas = alertasQuery.data ?? [];
  const marcarVistaMutation = useMutation({
    mutationFn: (id: number) => marcarAlertaVistaFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alertas"] }),
  });
  if (!user) return null;

  const cerrados = ["entregado", "finalizado", "abandonado", "rechazado"];
  const enTaller = ordenes.filter((o) => !cerrados.includes(o.estado));
  const listas = ordenes.filter((o) => o.estado === "pendiente_retiro");
  const presupuestadas = ordenes.filter((o) => o.estado === "presupuestado");
  const abandonadas = ordenes.filter((o) => o.estado === "abandonado");
  const stockBajo = stock.filter((s) => s.stockDisponible <= s.stockMinimo);
  const facturado = ordenes
    .filter((o) => o.estado === "entregado" || o.estado === "finalizado")
    .reduce((acc, o) => acc + (o.cumplimentacion?.monto ?? 0), 0);

  const stats = [
    {
      label: "Órdenes activas",
      value: enTaller.length,
      icon: ClipboardList,
      hint: "en taller / agendadas",
      tone: "bg-primary/10 text-primary",
    },
    {
      label: "Pendiente de retiro",
      value: listas.length,
      icon: CheckCircle2,
      hint: "esperando cliente",
      tone: "bg-success/15 text-success",
    },
    {
      label: "Presupuestos pendientes",
      value: presupuestadas.length,
      icon: Clock,
      hint: "aguardando respuesta",
      tone: "bg-warning/20 text-warning-foreground",
    },
    {
      label: "Facturado",
      value: `$${facturado.toLocaleString("es-AR")}`,
      icon: TrendingUp,
      hint: "trabajos finalizados",
      tone: "bg-info/15 text-info",
    },
  ];

  const porTipo = [
    {
      name: "Servicio técnico",
      value: ordenes.filter((o) => o.tipo === "servicio_tecnico").length,
      color: "var(--color-chart-1)",
    },
    {
      name: "Instalación cámaras",
      value: ordenes.filter((o) => o.tipo === "instalacion_camaras").length,
      color: "var(--color-chart-2)",
    },
    {
      name: "Mantenimiento cámaras",
      value: ordenes.filter((o) => o.tipo === "mantenimiento_camaras").length,
      color: "var(--color-chart-3)",
    },
  ];

  const porEstado = [
    { estado: "Ingresado", n: ordenes.filter((o) => o.estado === "ingresado").length },
    { estado: "Agendado", n: ordenes.filter((o) => o.estado === "agendado").length },
    { estado: "Presupuestado", n: ordenes.filter((o) => o.estado === "presupuestado").length },
    { estado: "Aprobado", n: ordenes.filter((o) => o.estado === "aprobado").length },
    { estado: "En proceso", n: ordenes.filter((o) => o.estado === "en_proceso").length },
    { estado: "Pte. retiro", n: ordenes.filter((o) => o.estado === "pendiente_retiro").length },
    { estado: "Entregado", n: ordenes.filter((o) => o.estado === "entregado").length },
    { estado: "Finalizado", n: ordenes.filter((o) => o.estado === "finalizado").length },
  ];

  return (
    <AppShell title="Panel Principal">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">
                    {s.label}
                  </div>
                  <div className="text-2xl font-semibold mt-1 tabular-nums">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.hint}</div>
                </div>
                <div className={`size-10 rounded-lg flex items-center justify-center ${s.tone}`}>
                  <s.icon className="size-5" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* RF16/T-21 — alertas de vencimiento (80/90 días), visibles solo dentro del sistema. */}
        {alertas.length > 0 && (
          <Card className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <BellRing className="size-4 text-warning" /> Alertas ({alertas.length})
            </h3>
            <div className="space-y-2">
              {alertas.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="text-sm truncate">{a.mensaje}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <Link to="/ordenes/$id" params={{ id: a.ordenId }} className="text-primary">
                        Ver orden {a.ordenId} →
                      </Link>
                      {a.estado === "VISTA" && <Badge variant="outline">Vista</Badge>}
                    </div>
                  </div>
                  {a.estado === "ACTIVA" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => marcarVistaMutation.mutate(a.id)}
                      disabled={marcarVistaMutation.isPending}
                    >
                      Marcar vista
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {(stockBajo.length > 0 || abandonadas.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {stockBajo.length > 0 && (
              <Card className="p-4 border-warning/40 bg-warning/5">
                <div className="flex items-center gap-2 text-warning-foreground/90 font-medium">
                  <ShieldAlert className="size-4 text-warning" />
                  Stock bajo en {stockBajo.length} insumo(s)
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {stockBajo.map((s) => s.nombre).join(" · ")}
                </div>
                <Link to="/stock" className="text-xs text-primary mt-2 inline-block">
                  Ver stock →
                </Link>
              </Card>
            )}
            {abandonadas.length > 0 && (
              <Card className="p-4 border-destructive/40 bg-destructive/5">
                <div className="flex items-center gap-2 text-destructive font-medium">
                  <ShieldAlert className="size-4" />
                  {abandonadas.length} equipo(s) en estado abandonado (+90 días sin retiro)
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Requieren decisión administrativa.
                </div>
              </Card>
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Órdenes por estado</h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={porEstado}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="estado"
                    tick={{ fontSize: 11 }}
                    stroke="var(--color-muted-foreground)"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    stroke="var(--color-muted-foreground)"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="n" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-4">Distribución por tipo</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={porTipo}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {porTipo.map((p, i) => (
                      <Cell key={i} fill={p.color} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Órdenes recientes</h3>
            <Link to="/ordenes" className="text-xs text-primary">
              Ver todas →
            </Link>
          </div>
          <div className="space-y-2">
            {ordenes.slice(0, 5).map((o) => {
              const Icon = o.tipo === "servicio_tecnico" ? Wrench : Camera;
              return (
                <Link
                  key={o.id}
                  to="/ordenes/$id"
                  params={{ id: o.id }}
                  className="flex items-center gap-4 p-3 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <div className="size-9 rounded-md bg-muted flex items-center justify-center">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      OT {o.numero} · {o.cliente}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {tipoLabel[o.tipo]} — {o.equipo}
                    </div>
                  </div>
                  <Badge variant="secondary" className={estadoColor[o.estado]}>
                    {estadoLabel[o.estado]}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
