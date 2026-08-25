import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { History, Filter } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useRequireAuth } from "@/lib/use-require-auth";
import { listarAuditoriaFn, type TipoEventoAuditoria } from "@/server/fn/auditoria";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/auditoria")({
  head: () => ({ meta: [{ title: "Auditoría — GesTech" }] }),
  component: AuditoriaPage,
});

const TIPO_LABEL: Record<TipoEventoAuditoria, string> = {
  estado: "Cambio de estado",
  asignacion: "Asignación de técnico",
  stock: "Movimiento de stock",
  auditoria: "Presupuesto / Anulación",
};

const TIPO_BADGE: Record<TipoEventoAuditoria, string> = {
  estado: "bg-primary/15 text-primary",
  asignacion: "bg-info/15 text-info",
  stock: "bg-warning/20 text-warning-foreground",
  auditoria: "bg-destructive/10 text-destructive",
};

function AuditoriaPage() {
  const user = useRequireAuth({ role: "ADMINISTRADOR" });
  const eventosQuery = useQuery({
    queryKey: ["auditoria"],
    queryFn: () => listarAuditoriaFn(),
    enabled: !!user,
  });
  const eventos = useMemo(() => eventosQuery.data ?? [], [eventosQuery.data]);

  const [orden, setOrden] = useState("");
  const [tipo, setTipo] = useState<TipoEventoAuditoria | "todos">("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const filtrados = useMemo(() => {
    return eventos.filter((e) => {
      if (orden.trim() && !(e.ordenId ?? "").includes(orden.trim())) return false;
      if (tipo !== "todos" && e.tipo !== tipo) return false;
      const fecha = e.fechaHora.slice(0, 10);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    });
  }, [eventos, orden, tipo, desde, hasta]);

  if (!user) return null;

  const hayFiltros = orden.trim() || tipo !== "todos" || desde || hasta;

  return (
    <AppShell title="Auditoría">
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Filter className="size-3" /> N° de orden
              </Label>
              <Input
                value={orden}
                onChange={(e) => setOrden(e.target.value)}
                placeholder="000142"
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo de evento</Label>
              <Select
                value={tipo}
                onValueChange={(v) => setTipo(v as TipoEventoAuditoria | "todos")}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {(Object.keys(TIPO_LABEL) as TipoEventoAuditoria[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
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
            {hayFiltros && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOrden("");
                  setTipo("todos");
                  setDesde("");
                  setHasta("");
                }}
              >
                Limpiar
              </Button>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Fecha y hora</th>
                  <th className="text-left px-4 py-3 font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium">Orden</th>
                  <th className="text-left px-4 py-3 font-medium">Detalle</th>
                  <th className="text-left px-4 py-3 font-medium">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30 transition-colors align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {e.fechaHora}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={TIPO_BADGE[e.tipo]}>
                        {TIPO_LABEL[e.tipo]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {e.ordenId ? (
                        <Link
                          to="/ordenes/$id"
                          params={{ id: e.ordenId }}
                          className="font-medium text-primary hover:underline tabular-nums"
                        >
                          {e.ordenId}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-md">{e.resumen}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {e.usuario}
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      {eventosQuery.isLoading ? "Cargando…" : "No se encontraron eventos."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
