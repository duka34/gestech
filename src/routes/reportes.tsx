import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, Filter } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { tipoLabel } from "@/lib/gestech-store";
import { useAuth } from "@/lib/use-auth";
import { useRequireAuth } from "@/lib/use-require-auth";
import { listarOrdenesFn } from "@/server/fn/ordenes";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
import { NEGOCIO, type TipoServicio } from "@/lib/gestech-data";

export const Route = createFileRoute("/reportes")({
  head: () => ({ meta: [{ title: "Reportes — GesTech" }] }),
  component: ReportesPage,
});

const TIPOS: TipoServicio[] = ["servicio_tecnico", "instalacion_camaras", "mantenimiento_camaras"];

function ReportesPage() {
  const user = useRequireAuth({ role: "ADMINISTRADOR" });
  const ordenesQuery = useQuery({ queryKey: ["ordenes"], queryFn: () => listarOrdenesFn() });
  const ordenes = useMemo(() => ordenesQuery.data ?? [], [ordenesQuery.data]);
  const { currentUser } = useAuth();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  // RF17.6/RN-10 — las órdenes anuladas se excluyen por completo del cálculo
  // de informes; se listan aparte. Las rechazadas sí quedan (se consideran
  // "cerradas", RN-10) pero se muestran como un total distinto al de
  // trabajos cumplimentados.
  const filtradas = useMemo(
    () =>
      ordenes.filter((o) => {
        if (o.estado === "anulado") return false;
        const fecha = o.cumplimentacion?.fechaRealizacion ?? o.ingresada;
        return (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
      }),
    [ordenes, desde, hasta],
  );
  const anuladasEnPeriodo = useMemo(
    () =>
      ordenes.filter((o) => {
        if (o.estado !== "anulado") return false;
        return (!desde || o.ingresada >= desde) && (!hasta || o.ingresada <= hasta);
      }),
    [ordenes, desde, hasta],
  );

  const cumplimentadas = filtradas.filter((o) => !!o.cumplimentacion);
  const cerradasPorRechazo = filtradas.filter((o) => o.estado === "rechazado");
  const totalTrabajos = cumplimentadas.length;
  // RF15.2 — las órdenes bajo garantía cuentan como trabajo realizado pero
  // no aportan a los ingresos (no se cobran).
  const totalIngresos = cumplimentadas
    .filter((o) => !o.bajoGarantia)
    .reduce((a, o) => a + (o.cumplimentacion?.monto ?? 0), 0);

  const porTipo = TIPOS.map((t) => ({
    tipo: t,
    name: tipoLabel[t],
    total: cumplimentadas.filter((o) => o.tipo === t).length,
    facturado: cumplimentadas
      .filter((o) => o.tipo === t && !o.bajoGarantia)
      .reduce((a, o) => a + (o.cumplimentacion?.monto ?? 0), 0),
  }));

  const masSolicitado = [...porTipo].sort((a, b) => b.total - a.total)[0];

  if (!user) return null;

  function exportarCSV() {
    const filas = [
      ["GesTech — Reporte de actividad"],
      [`Período: ${desde || "—"} a ${hasta || "—"}`],
      [`Generado: ${new Date().toLocaleString("es-AR")}`],
      [],
      ["Resumen"],
      ["Trabajos realizados", totalTrabajos],
      ["Ingresos totales", totalIngresos],
      ["Tipo más solicitado", masSolicitado?.name ?? "—"],
      [],
      ["Detalle por tipo de servicio"],
      ["Tipo", "Trabajos", "Facturado"],
      ...porTipo.map((t) => [t.name, t.total, t.facturado]),
      [],
      ["Detalle de órdenes cumplimentadas"],
      ["N° OT", "Cliente", "DNI", "Tipo", "Fecha realización", "Técnico", "Monto"],
      ...cumplimentadas.map((o) => [
        o.numero,
        o.cliente,
        o.dni,
        tipoLabel[o.tipo],
        o.cumplimentacion?.fechaRealizacion ?? "",
        o.cumplimentacion?.tecnicoRealizoId ?? "",
        o.cumplimentacion?.monto ?? 0,
      ]),
    ];
    const csv = filas
      .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `gestech-reporte-${Date.now()}.csv`);
    toast.success("Informe exportado en Excel (CSV)");
  }

  function exportarPDF() {
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return;
    const filaTipo = porTipo
      .map(
        (t) =>
          `<tr><td>${t.name}</td><td style="text-align:right">${t.total}</td><td style="text-align:right">$${t.facturado.toLocaleString("es-AR")}</td></tr>`,
      )
      .join("");
    const detalle = cumplimentadas
      .map(
        (o) => `<tr>
      <td>${o.numero}</td><td>${o.cliente}</td><td>${tipoLabel[o.tipo]}</td>
      <td>${o.cumplimentacion!.fechaRealizacion}</td>
      <td style="text-align:right">$${o.cumplimentacion!.monto.toLocaleString("es-AR")}</td>
    </tr>`,
      )
      .join("");
    w.document
      .write(`<!doctype html><html><head><meta charset="utf-8"><title>Reporte GesTech</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,sans-serif;padding:28px;max-width:820px;margin:0 auto;color:#111}
        h1{margin:0;font-size:22px} .muted{color:#666;font-size:12px}
        table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
        th,td{padding:8px;border-bottom:1px solid #eee;text-align:left}
        th{background:#f6f6f6}
        .stats{display:flex;gap:12px;margin:18px 0}
        .stat{flex:1;border:1px solid #ddd;border-radius:8px;padding:12px}
        .stat .label{font-size:11px;color:#666;text-transform:uppercase}
        .stat .val{font-size:20px;font-weight:600;margin-top:4px}
        button{padding:8px 16px;border-radius:6px;border:1px solid #111;background:#111;color:#fff;cursor:pointer}
        @media print{.noprint{display:none}body{padding:0}}
      </style></head><body>
      <h1>${NEGOCIO.nombre}</h1>
      <div class="muted">Reporte de actividad · Generado por ${currentUser ? `${currentUser.nombre} ${currentUser.apellido}` : ""} · ${new Date().toLocaleString("es-AR")}</div>
      <div class="muted">Período: ${desde || "Inicio"} a ${hasta || "Hoy"}</div>
      <div class="stats">
        <div class="stat"><div class="label">Trabajos realizados</div><div class="val">${totalTrabajos}</div></div>
        <div class="stat"><div class="label">Ingresos totales</div><div class="val">$${totalIngresos.toLocaleString("es-AR")}</div></div>
        <div class="stat"><div class="label">Más solicitado</div><div class="val">${masSolicitado?.name ?? "—"}</div></div>
      </div>
      <h3>Por tipo de servicio</h3>
      <table><thead><tr><th>Tipo</th><th style="text-align:right">Trabajos</th><th style="text-align:right">Facturado</th></tr></thead><tbody>${filaTipo}</tbody></table>
      <h3 style="margin-top:24px">Detalle de órdenes</h3>
      <table><thead><tr><th>N° OT</th><th>Cliente</th><th>Tipo</th><th>Fecha</th><th style="text-align:right">Monto</th></tr></thead><tbody>${detalle || `<tr><td colspan=5 style="text-align:center;padding:12px;color:#999">Sin datos en el período</td></tr>`}</tbody></table>
      <div class="noprint" style="text-align:right;margin-top:18px"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
    </body></html>`);
    w.document.close();
    toast.success("Reporte abierto para impresión / PDF");
  }

  return (
    <AppShell title="Reportes y estadísticas">
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-end justify-between">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Filter className="size-3" /> Desde
                </Label>
                <Input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <Input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="w-44"
                />
              </div>
              {(desde || hasta) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDesde("");
                    setHasta("");
                  }}
                >
                  Limpiar
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportarCSV}>
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
              <Button onClick={exportarPDF}>
                <FileDown className="size-4" /> PDF
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Trabajos realizados</div>
            <div className="text-3xl font-semibold mt-1">{totalTrabajos}</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Ingresos totales</div>
            <div className="text-3xl font-semibold mt-1">
              ${totalIngresos.toLocaleString("es-AR")}
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase text-muted-foreground">Tipo más solicitado</div>
            <div className="text-lg font-semibold mt-1">{masSolicitado?.name ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              {masSolicitado?.total ?? 0} trabajos
            </div>
          </Card>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">
              Cerradas por rechazo (RN-10)
            </div>
            <div className="text-xl font-semibold mt-1">{cerradasPorRechazo.length}</div>
            <div className="text-xs text-muted-foreground">
              No cumplimentadas, cerradas por rechazo del cliente.
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">
              Anuladas (excluidas del cálculo)
            </div>
            <div className="text-xl font-semibold mt-1">{anuladasEnPeriodo.length}</div>
            <div className="text-xs text-muted-foreground">
              RF17.6 — no suman a los totales de arriba.
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Trabajos por tipo de servicio</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={porTipo}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="total" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-4">Distribución de ingresos</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={porTipo}
                    dataKey="facturado"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {porTipo.map((_, i) => (
                      <Cell key={i} fill={`var(--color-chart-${i + 1})`} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="font-semibold mb-3">Resumen económico por tipo de servicio</h3>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left py-2 font-medium">Tipo de servicio</th>
                <th className="text-right py-2 font-medium">Trabajos</th>
                <th className="text-right py-2 font-medium">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {porTipo.map((t) => (
                <tr key={t.tipo} className="border-t">
                  <td className="py-2">{t.name}</td>
                  <td className="py-2 text-right tabular-nums">{t.total}</td>
                  <td className="py-2 text-right tabular-nums">
                    ${t.facturado.toLocaleString("es-AR")}
                  </td>
                </tr>
              ))}
              <tr className="border-t font-medium">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">{totalTrabajos}</td>
                <td className="py-2 text-right tabular-nums">
                  ${totalIngresos.toLocaleString("es-AR")}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
