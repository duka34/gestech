import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  MessageCircle,
  Send,
  FileText,
  Bell,
  CheckCheck,
  AlertOctagon,
  HelpCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useRequireAuth } from "@/lib/use-require-auth";
import { consultarEstadoPorChatbotFn, listarConversacionesFn } from "@/server/fn/chatbot";
import { ejecutarVencimientosManualFn } from "@/server/fn/alertas";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MensajeChat } from "@/lib/gestech-data";

export const Route = createFileRoute("/chatbot")({
  head: () => ({ meta: [{ title: "Chatbot WhatsApp — GesTech" }] }),
  component: ChatbotPage,
});

const tipoIcon = {
  presupuesto: FileText,
  recordatorio: Bell,
  comprobante: CheckCheck,
  aprobacion: CheckCheck,
  respuesta: MessageCircle,
  abandono: AlertOctagon,
  consulta: HelpCircle,
} as const;

const tipoLabel: Record<MensajeChat["tipo"], string> = {
  presupuesto: "Envío de presupuesto",
  recordatorio: "Recordatorio de retiro",
  comprobante: "Comprobante de trabajo",
  aprobacion: "Aprobación",
  respuesta: "Respuesta del cliente",
  abandono: "Aviso de abandono",
  consulta: "Consulta de estado",
};

type Grupo = {
  key: string;
  ordenId?: string;
  cliente: string;
  mensajes: MensajeChat[];
};

type ResultadoConsulta = Awaited<ReturnType<typeof consultarEstadoPorChatbotFn>>;

function ChatbotPage() {
  const user = useRequireAuth({ role: "ADMINISTRADOR" });
  const queryClient = useQueryClient();
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [telefono, setTelefono] = useState("");
  const [ordenIdConsulta, setOrdenIdConsulta] = useState("");
  const [resultado, setResultado] = useState<ResultadoConsulta | null>(null);

  const conversacionesQuery = useQuery({
    queryKey: ["conversaciones"],
    queryFn: () => listarConversacionesFn(),
    enabled: !!user,
  });
  const mensajes = useMemo(() => conversacionesQuery.data ?? [], [conversacionesQuery.data]);

  // CU13 — agrupa por orden (o por cliente, para mensajes sin orden asociada).
  const grupos = useMemo<Grupo[]>(() => {
    const porClave = new Map<string, Grupo>();
    for (const m of mensajes) {
      const key = m.ordenId ?? `sin-orden-${m.cliente}`;
      let g = porClave.get(key);
      if (!g) {
        g = { key, ordenId: m.ordenId, cliente: m.cliente, mensajes: [] };
        porClave.set(key, g);
      }
      g.mensajes.push(m);
    }
    return Array.from(porClave.values()).sort(
      (a, b) => new Date(b.mensajes[0].fecha).getTime() - new Date(a.mensajes[0].fecha).getTime(),
    );
  }, [mensajes]);

  const grupoSeleccionado = grupos.find((g) => g.key === seleccion) ?? grupos[0] ?? null;

  const ejecutarMutation = useMutation({
    mutationFn: () => ejecutarVencimientosManualFn(),
    onSuccess: (r) => {
      toast.success(
        `Control ejecutado: ${r.recordatorios} recordatorio(s), ${r.abandonos} abandono(s), ${r.sinAsignar} orden(es) sin asignar alertada(s).`,
      );
      queryClient.invalidateQueries({ queryKey: ["conversaciones"] });
      queryClient.invalidateQueries({ queryKey: ["alertas"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "No se pudo ejecutar el control"),
  });

  const consultarMutation = useMutation({
    mutationFn: () =>
      consultarEstadoPorChatbotFn({
        data: { telefono, ordenId: ordenIdConsulta || undefined },
      }),
    onSuccess: (r) => {
      setResultado(r);
      queryClient.invalidateQueries({ queryKey: ["conversaciones"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo consultar"),
  });

  if (!user) return null;

  const enviados = mensajes.filter((m) => m.direccion === "saliente").length;
  const recibidos = mensajes.filter((m) => m.direccion === "entrante").length;

  return (
    <AppShell title="Chatbot WhatsApp">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Estado integración
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="size-2 rounded-full bg-success animate-pulse" />
              <span className="font-medium">Conectado</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">API WhatsApp Business</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Mensajes enviados
            </div>
            <div className="text-2xl font-semibold mt-1 tabular-nums">{enviados}</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Respuestas recibidas
            </div>
            <div className="text-2xl font-semibold mt-1 tabular-nums">{recibidos}</div>
          </Card>
        </div>

        <Card className="p-4 flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-sm">Control diario de vencimientos</div>
            <p className="text-xs text-muted-foreground">
              Día 80: recordatorio al cliente. Día 90: cambio automático a Abandonado y aviso final.
              Corre solo cada 24 hs — este botón lo dispara manualmente.
            </p>
          </div>
          <Button onClick={() => ejecutarMutation.mutate()} disabled={ejecutarMutation.isPending}>
            <RefreshCw className={`size-4 ${ejecutarMutation.isPending ? "animate-spin" : ""}`} />
            Ejecutar ahora
          </Button>
        </Card>

        {/* CU11 — el Cliente no tiene sesión propia; así se simula el mensaje
            entrante "estado" que recibiría el chatbot desde WhatsApp. */}
        <Card className="p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <HelpCircle className="size-4" /> Simular consulta de cliente
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs">Teléfono del cliente</Label>
              <Input
                value={telefono}
                onChange={(e) => {
                  setTelefono(e.target.value);
                  setResultado(null);
                  setOrdenIdConsulta("");
                }}
                placeholder="11xxxxxxxx"
                className="mt-1"
              />
            </div>
            {resultado?.tipo === "requiere_id" && (
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs">Orden</Label>
                <Select value={ordenIdConsulta} onValueChange={setOrdenIdConsulta}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Elegir orden" />
                  </SelectTrigger>
                  <SelectContent>
                    {resultado.ordenes.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              onClick={() => consultarMutation.mutate()}
              disabled={!telefono.trim() || consultarMutation.isPending}
            >
              <Send className="size-4" /> Consultar
            </Button>
          </div>
          {resultado && (
            <div className="text-sm p-3 rounded-md bg-muted">
              {resultado.tipo === "requiere_id"
                ? "El cliente tiene más de una orden activa: elegí una para continuar."
                : resultado.mensaje}
            </div>
          )}
        </Card>

        {/* CU13 — listado maestro-detalle de conversaciones, solo lectura. */}
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="p-0 overflow-hidden lg:col-span-1">
            <div className="p-4 border-b">
              <h3 className="font-semibold">Conversaciones</h3>
            </div>
            <div className="max-h-[520px] overflow-auto divide-y">
              {grupos.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">Sin conversaciones aún.</div>
              )}
              {grupos.map((g) => {
                const ultimo = g.mensajes[0];
                return (
                  <button
                    key={g.key}
                    onClick={() => setSeleccion(g.key)}
                    className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                      grupoSeleccionado?.key === g.key ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{g.cliente || "—"}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {g.mensajes.length}
                      </Badge>
                    </div>
                    {g.ordenId && (
                      <div className="text-[11px] text-muted-foreground">OT {g.ordenId}</div>
                    )}
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{ultimo.texto}</p>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Send className="size-4 text-whatsapp" />
                {grupoSeleccionado
                  ? `Conversación — ${grupoSeleccionado.cliente || "—"}`
                  : "Conversación"}
              </h3>
              {grupoSeleccionado?.ordenId && (
                <Link
                  to="/ordenes/$id"
                  params={{ id: grupoSeleccionado.ordenId }}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  Ver orden {grupoSeleccionado.ordenId} →
                </Link>
              )}
            </div>
            <div className="space-y-3">
              {!grupoSeleccionado && (
                <div className="text-sm text-muted-foreground">
                  Seleccioná una conversación de la izquierda.
                </div>
              )}
              {grupoSeleccionado?.mensajes.map((m) => {
                const Icon = tipoIcon[m.tipo];
                return (
                  <div
                    key={m.id}
                    className="flex gap-3 p-3 rounded-md hover:bg-muted/40 border transition-colors"
                  >
                    <div
                      className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${
                        m.direccion === "saliente"
                          ? "bg-whatsapp/15 text-whatsapp"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {tipoLabel[m.tipo]}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {m.direccion === "saliente" ? "→ Enviado" : "← Recibido"}
                        </Badge>
                      </div>
                      <p className="text-sm mt-1 leading-relaxed">{m.texto}</p>
                      <div className="text-[11px] text-muted-foreground mt-1">{m.fecha}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
