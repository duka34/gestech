import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search, Filter } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  estadoLabel,
  estadoColor,
  tipoLabel,
  ESTADOS_TERMINALES_SERVICIO_TECNICO,
} from "@/lib/gestech-store";
import { useRequireAuth } from "@/lib/use-require-auth";
import { listarUsuariosFn } from "@/server/fn/usuarios";
import { buscarClienteFn } from "@/server/fn/clientes";
import { autoasignarTecnicoFn, crearOrdenFn, listarOrdenesFn } from "@/server/fn/ordenes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { TipoServicio, EstadoOrden, Orden } from "@/lib/gestech-data";

export const Route = createFileRoute("/ordenes/")({
  head: () => ({ meta: [{ title: "Órdenes de trabajo — GesTech" }] }),
  component: OrdenesList,
});

// Estados que el RF considera "pendientes" (no cumplimentados / no cerrados).
// "entregado" y "finalizado" también se consideran pendientes mientras no exista
// cumplimentación: son el paso previo necesario para registrar la finalización.
const ESTADOS_PENDIENTES: EstadoOrden[] = [
  "ingresado",
  "agendado",
  "presupuestado",
  "aprobado",
  "rechazado",
  "en_proceso",
  "pendiente_retiro",
  "abandonado",
  "entregado",
  "finalizado",
];

function OrdenesList() {
  const user = useRequireAuth();
  const ordenesQuery = useQuery({ queryKey: ["ordenes"], queryFn: () => listarOrdenesFn() });
  const ordenes = ordenesQuery.data ?? [];
  // La lista de usuarios ya vive en el backend real (T-01/RF10); acá solo se
  // usa para mostrar el técnico en el listado de trabajos realizados.
  const usuariosQuery = useQuery({ queryKey: ["usuarios"], queryFn: () => listarUsuariosFn() });
  const users = (usuariosQuery.data ?? []).map((u) => ({
    id: String(u.id),
    nombre: `${u.nombre} ${u.apellido}`,
  }));
  const tecnicosActivos = (usuariosQuery.data ?? []).filter((u) => u.rol === "TECNICO" && u.activo);
  const [tab, setTab] = useState<"pendientes" | "realizados">("pendientes");
  const [open, setOpen] = useState(false);
  const [soloSinAsignar, setSoloSinAsignar] = useState(false);

  // RF10.6 — cantidad de órdenes de servicio técnico sin responsable, visible
  // para ambos roles en el panel principal (esta lista lo es).
  const sinAsignar = ordenes.filter(
    (o) =>
      o.tipo === "servicio_tecnico" &&
      !o.tecnicoResponsableId &&
      !ESTADOS_TERMINALES_SERVICIO_TECNICO.includes(o.estado),
  ).length;

  if (!user) return null;

  return (
    <AppShell title="Órdenes de trabajo">
      <div className="space-y-4">
        <div className="flex justify-between items-center gap-3">
          {sinAsignar > 0 ? (
            <button
              type="button"
              onClick={() => {
                setTab("pendientes");
                setSoloSinAsignar(true);
              }}
              className="text-xs px-3 py-1.5 rounded-full bg-warning/15 text-warning-foreground hover:bg-warning/25 transition-colors"
            >
              {sinAsignar} orden{sinAsignar === 1 ? "" : "es"} sin técnico asignado
            </button>
          ) : (
            <div />
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Nueva orden
              </Button>
            </DialogTrigger>
            <NuevaOrdenDialog onClose={() => setOpen(false)} tecnicos={tecnicosActivos} />
          </Dialog>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as never)} className="space-y-4">
          <TabsList>
            <TabsTrigger value="pendientes">Trabajos pendientes</TabsTrigger>
            <TabsTrigger value="realizados">Trabajos realizados</TabsTrigger>
          </TabsList>

          <TabsContent value="pendientes" className="space-y-4 mt-0">
            <PendientesView
              ordenes={ordenes}
              rolActual={user.rol}
              soloSinAsignar={soloSinAsignar}
              setSoloSinAsignar={setSoloSinAsignar}
            />
          </TabsContent>

          <TabsContent value="realizados" className="space-y-4 mt-0">
            <RealizadosView ordenes={ordenes} users={users} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   RF06.1 — Consulta de trabajos pendientes
   ────────────────────────────────────────────────────────────────────── */

function PendientesView({
  ordenes,
  rolActual,
  soloSinAsignar,
  setSoloSinAsignar,
}: {
  ordenes: Orden[];
  rolActual: "ADMINISTRADOR" | "TECNICO";
  soloSinAsignar: boolean;
  setSoloSinAsignar: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState(""); // ID o cliente (nombre/DNI)
  const [equipo, setEquipo] = useState("");
  const [tipo, setTipo] = useState<"todos" | TipoServicio>("todos");
  const [estado, setEstado] = useState<"todos" | EstadoOrden>("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const autoasignarMutation = useMutation({
    mutationFn: (ordenId: string) => autoasignarTecnicoFn({ data: { ordenId } }),
    onSuccess: () => {
      toast.success("Te asignaste esta orden");
      queryClient.invalidateQueries({ queryKey: ["ordenes"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "No se pudo autoasignar la orden"),
  });

  const base = useMemo(
    () => ordenes.filter((o) => ESTADOS_PENDIENTES.includes(o.estado) && !o.cumplimentacion),
    [ordenes],
  );
  const hayFiltros = !!(
    q ||
    equipo ||
    tipo !== "todos" ||
    estado !== "todos" ||
    desde ||
    hasta ||
    soloSinAsignar
  );

  const filtered = useMemo(
    () =>
      base.filter((o) => {
        if (q) {
          const hay = `${o.numero} ${o.cliente} ${o.dni}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        if (equipo && !o.equipo.toLowerCase().includes(equipo.toLowerCase())) return false;
        if (tipo !== "todos" && o.tipo !== tipo) return false;
        if (estado !== "todos" && o.estado !== estado) return false;
        if (desde && o.ingresada < desde) return false;
        if (hasta && o.ingresada > hasta) return false;
        if (soloSinAsignar && (o.tipo !== "servicio_tecnico" || o.tecnicoResponsableId))
          return false;
        return true;
      }),
    [base, q, equipo, tipo, estado, desde, hasta, soloSinAsignar],
  );

  return (
    <>
      <FiltrosCard>
        <BuscadorID value={q} onChange={setQ} />
        <BuscadorEquipo value={equipo} onChange={setEquipo} />
        <FiltroTipo value={tipo} onChange={setTipo} />
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <Filter className="size-3" /> Estado
          </Label>
          <Select value={estado} onValueChange={(v) => setEstado(v as never)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {ESTADOS_PENDIENTES.map((e) => (
                <SelectItem key={e} value={e}>
                  {estadoLabel[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FiltroFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <Filter className="size-3" /> Asignación
          </Label>
          <Button
            type="button"
            variant={soloSinAsignar ? "default" : "outline"}
            size="sm"
            onClick={() => setSoloSinAsignar(!soloSinAsignar)}
          >
            Sin técnico asignado
          </Button>
        </div>
        {hayFiltros && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setEquipo("");
              setTipo("todos");
              setEstado("todos");
              setDesde("");
              setHasta("");
              setSoloSinAsignar(false);
            }}
          >
            Limpiar
          </Button>
        )}
      </FiltrosCard>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">N° OT</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 font-medium">Técnico</th>
                <th className="text-left px-4 py-3 font-medium">Descripción</th>
                <th className="text-left px-4 py-3 font-medium">Fecha ingreso</th>
                <th className="text-left px-4 py-3 font-medium">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="border-t hover:bg-muted/30 transition-colors align-top">
                  <td className="px-4 py-3">
                    <Link
                      to="/ordenes/$id"
                      params={{ id: o.id }}
                      className="font-medium text-primary hover:underline tabular-nums"
                    >
                      {o.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className={estadoColor[o.estado]}>
                      {estadoLabel[o.estado]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div>{o.cliente}</div>
                    <div className="text-[11px] text-muted-foreground">DNI {o.dni}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{tipoLabel[o.tipo]}</td>
                  <td className="px-4 py-3">
                    {o.tecnicoResponsableNombre ?? (
                      <span className="text-muted-foreground">Sin asignar</span>
                    )}
                    {!o.tecnicoResponsableId &&
                      o.tipo === "servicio_tecnico" &&
                      !ESTADOS_TERMINALES_SERVICIO_TECNICO.includes(o.estado) &&
                      rolActual === "TECNICO" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1 w-full"
                          disabled={autoasignarMutation.isPending}
                          onClick={() => autoasignarMutation.mutate(o.id)}
                        >
                          Tomar esta orden
                        </Button>
                      )}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="truncate" title={o.equipo}>
                      {o.equipo}
                    </div>
                    <div
                      className="text-[11px] text-muted-foreground truncate"
                      title={o.descripcion}
                    >
                      {o.descripcion}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{o.ingresada}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[14rem]">
                    <span className="line-clamp-2" title={o.observaciones ?? ""}>
                      {o.observaciones || "—"}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    {base.length === 0
                      ? "No hay trabajos pendientes."
                      : "No se encontraron resultados con los filtros aplicados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   RF06.2 — Consulta de trabajos realizados
   ────────────────────────────────────────────────────────────────────── */

function RealizadosView({
  ordenes,
  users,
}: {
  ordenes: Orden[];
  users: { id: string; nombre: string }[];
}) {
  const [q, setQ] = useState("");
  const [equipo, setEquipo] = useState("");
  const [tipo, setTipo] = useState<"todos" | TipoServicio>("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const base = useMemo(() => ordenes.filter((o) => !!o.cumplimentacion), [ordenes]);
  const hayFiltros = !!(q || equipo || tipo !== "todos" || desde || hasta);

  const filtered = useMemo(
    () =>
      base.filter((o) => {
        if (q) {
          const hay = `${o.numero} ${o.cliente} ${o.dni}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        if (equipo && !o.equipo.toLowerCase().includes(equipo.toLowerCase())) return false;
        if (tipo !== "todos" && o.tipo !== tipo) return false;
        const fecha = o.cumplimentacion!.fechaRealizacion;
        if (desde && fecha < desde) return false;
        if (hasta && fecha > hasta) return false;
        return true;
      }),
    [base, q, equipo, tipo, desde, hasta],
  );

  return (
    <>
      <FiltrosCard>
        <BuscadorID value={q} onChange={setQ} />
        <BuscadorEquipo value={equipo} onChange={setEquipo} />
        <FiltroTipo value={tipo} onChange={setTipo} />
        <FiltroFechas
          desde={desde}
          hasta={hasta}
          setDesde={setDesde}
          setHasta={setHasta}
          labelDesde="Realización desde"
          labelHasta="Realización hasta"
        />
        {hayFiltros && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setEquipo("");
              setTipo("todos");
              setDesde("");
              setHasta("");
            }}
          >
            Limpiar
          </Button>
        )}
      </FiltrosCard>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">N° OT</th>
                <th className="text-left px-4 py-3 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 font-medium">Trabajo / Tareas</th>
                <th className="text-left px-4 py-3 font-medium">Ingreso</th>
                <th className="text-left px-4 py-3 font-medium">Realización</th>
                <th className="text-left px-4 py-3 font-medium">Técnico</th>
                <th className="text-right px-4 py-3 font-medium">Monto</th>
                <th className="text-left px-4 py-3 font-medium">Pago</th>
                <th className="text-left px-4 py-3 font-medium">N° Comp.</th>
                <th className="text-left px-4 py-3 font-medium">Garantía</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const c = o.cumplimentacion!;
                const tec = users.find((u) => u.id === c.tecnicoRealizoId);
                return (
                  <tr key={o.id} className="border-t hover:bg-muted/30 transition-colors align-top">
                    <td className="px-4 py-3">
                      <Link
                        to="/ordenes/$id"
                        params={{ id: o.id }}
                        className="font-medium text-primary hover:underline tabular-nums"
                      >
                        {o.numero}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div>{o.cliente}</div>
                      <div className="text-[11px] text-muted-foreground">DNI {o.dni}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{tipoLabel[o.tipo]}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="truncate" title={o.descripcion}>
                        {o.equipo}
                      </div>
                      <div
                        className="text-[11px] text-muted-foreground line-clamp-2"
                        title={c.tareasRealizadas}
                      >
                        {c.tareasRealizadas}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{o.ingresada}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {c.fechaRealizacion}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{tec?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ${c.monto.toLocaleString("es-AR")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">
                      {c.metodoPago ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.comprobanteNro ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {o.garantia?.vence ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-muted-foreground">
                    {base.length === 0
                      ? "Aún no hay trabajos realizados."
                      : "No se encontraron resultados con los filtros aplicados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Helpers de filtros compartidos
   ────────────────────────────────────────────────────────────────────── */

function FiltrosCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-3 items-end">{children}</div>
    </Card>
  );
}

function BuscadorID({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1 flex-1 min-w-[16rem]">
      <Label className="text-xs">ID o cliente (nombre / DNI)</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar…"
          className="pl-9"
        />
      </div>
    </div>
  );
}

function BuscadorEquipo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Equipo</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej. Notebook"
        className="w-48"
      />
    </div>
  );
}

function FiltroTipo({
  value,
  onChange,
}: {
  value: "todos" | TipoServicio;
  onChange: (v: "todos" | TipoServicio) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1">
        <Filter className="size-3" /> Tipo de servicio
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as never)}>
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos</SelectItem>
          <SelectItem value="servicio_tecnico">Servicio técnico</SelectItem>
          <SelectItem value="instalacion_camaras">Instalación de cámaras</SelectItem>
          <SelectItem value="mantenimiento_camaras">Mantenimiento de cámaras</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function FiltroFechas({
  desde,
  hasta,
  setDesde,
  setHasta,
  labelDesde = "Desde",
  labelHasta = "Hasta",
}: {
  desde: string;
  hasta: string;
  setDesde: (v: string) => void;
  setHasta: (v: string) => void;
  labelDesde?: string;
  labelHasta?: string;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label className="text-xs">{labelDesde}</Label>
        <Input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{labelHasta}</Label>
        <Input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="w-40"
        />
      </div>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   RF03.1 — Alta de nueva solicitud
   ────────────────────────────────────────────────────────────────────── */

type NuevaOrdenForm = {
  clienteNombre: string;
  clienteApellido: string;
  dni: string;
  telefono: string;
  domicilio: string;
  tipo: TipoServicio;
  equipo: string;
  cantidadCamaras: string;
  tecnicoResponsableId: string;
  descripcion: string;
  observaciones: string;
};

function NuevaOrdenDialog({
  onClose,
  tecnicos,
}: {
  onClose: () => void;
  tecnicos: { id: number; nombre: string; apellido: string }[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<NuevaOrdenForm>({
    clienteNombre: "",
    clienteApellido: "",
    dni: "",
    telefono: "",
    domicilio: "",
    tipo: "servicio_tecnico",
    equipo: "",
    cantidadCamaras: "",
    tecnicoResponsableId: "",
    descripcion: "",
    observaciones: "",
  });
  const [buscando, setBuscando] = useState(false);
  const [clienteEncontrado, setClienteEncontrado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const requiereDomicilio = form.tipo !== "servicio_tecnico";
  // C-01 — "Equipo" solo es obligatorio en servicio técnico; instalación y
  // mantenimiento de cámaras piden en su lugar la cantidad de cámaras.
  const requiereEquipo = form.tipo === "servicio_tecnico";
  const requiereCamaras = form.tipo !== "servicio_tecnico";
  // RN-11/RF10.1 — técnico responsable obligatorio al alta solo en cámaras;
  // en servicio técnico la orden nace sin responsable (autoasignación).
  const requiereTecnico = form.tipo !== "servicio_tecnico";
  const valido =
    form.clienteNombre &&
    form.clienteApellido &&
    form.dni &&
    form.telefono &&
    form.descripcion &&
    (!requiereDomicilio || form.domicilio) &&
    (!requiereEquipo || form.equipo) &&
    (!requiereCamaras || Number(form.cantidadCamaras) > 0) &&
    (!requiereTecnico || form.tecnicoResponsableId);

  // RF09 — buscar cliente existente por DNI o teléfono y autocompletar.
  async function buscarCliente() {
    const query = form.dni.trim() || form.telefono.trim();
    if (!query) return toast.error("Ingresá el DNI o el teléfono para buscar");
    setBuscando(true);
    try {
      const cliente = await buscarClienteFn({ data: { query } });
      if (cliente) {
        setForm((f) => ({
          ...f,
          clienteNombre: cliente.nombre,
          clienteApellido: cliente.apellido,
          telefono: cliente.telefono,
          domicilio: cliente.domicilio ?? f.domicilio,
        }));
        setClienteEncontrado(true);
        toast.success("Cliente encontrado — datos autocompletados");
      } else {
        setClienteEncontrado(false);
        toast.info("No se encontró un cliente con ese DNI/teléfono. Completá el alta.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo buscar el cliente");
    } finally {
      setBuscando(false);
    }
  }

  async function submit() {
    setGuardando(true);
    try {
      const orden = await crearOrdenFn({
        data: {
          clienteNombre: form.clienteNombre.trim(),
          clienteApellido: form.clienteApellido.trim(),
          dni: form.dni.trim(),
          telefono: form.telefono.trim(),
          domicilio: requiereDomicilio ? form.domicilio.trim() : undefined,
          tipo: form.tipo,
          equipo: form.equipo.trim() || undefined,
          cantidadCamaras: requiereCamaras ? Number(form.cantidadCamaras) : undefined,
          tecnicoResponsableId: requiereTecnico ? Number(form.tecnicoResponsableId) : undefined,
          descripcion: form.descripcion.trim(),
          observaciones: form.observaciones.trim() || undefined,
        },
      });
      toast.success(`OT N° ${orden.numero} registrada`);
      queryClient.invalidateQueries({ queryKey: ["ordenes"] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar la orden");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Nueva solicitud de trabajo</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
        <div className="text-xs font-medium text-muted-foreground uppercase">Datos del cliente</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>DNI *</Label>
            <div className="flex gap-2">
              <Input
                value={form.dni}
                onChange={(e) => {
                  setClienteEncontrado(false);
                  setForm({ ...form, dni: e.target.value });
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={buscarCliente}
                disabled={buscando || (!form.dni.trim() && !form.telefono.trim())}
                title="Buscar cliente por DNI o teléfono"
              >
                <Search className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono *</Label>
            <Input
              value={form.telefono}
              onChange={(e) => {
                setClienteEncontrado(false);
                setForm({ ...form, telefono: e.target.value });
              }}
              placeholder="+54..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input
              value={form.clienteNombre}
              onChange={(e) => setForm({ ...form, clienteNombre: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Apellido *</Label>
            <Input
              value={form.clienteApellido}
              onChange={(e) => setForm({ ...form, clienteApellido: e.target.value })}
            />
          </div>
        </div>
        {clienteEncontrado && (
          <Badge variant="secondary" className="bg-success/15 text-success">
            Cliente encontrado — datos autocompletados
          </Badge>
        )}

        <div className="text-xs font-medium text-muted-foreground uppercase pt-2">Servicio</div>
        <div className="space-y-1.5">
          <Label>Tipo de servicio *</Label>
          <Select
            value={form.tipo}
            onValueChange={(v: TipoServicio) => setForm({ ...form, tipo: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="servicio_tecnico">Servicio técnico</SelectItem>
              <SelectItem value="instalacion_camaras">Instalación de cámaras</SelectItem>
              <SelectItem value="mantenimiento_camaras">Mantenimiento de cámaras</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {requiereDomicilio && (
          <div className="space-y-1.5">
            <Label>
              Domicilio *{" "}
              <span className="text-xs text-muted-foreground">(obligatorio para cámaras)</span>
            </Label>
            <Input
              value={form.domicilio}
              onChange={(e) => setForm({ ...form, domicilio: e.target.value })}
            />
          </div>
        )}
        {requiereTecnico && (
          <div className="space-y-1.5">
            <Label>Técnico responsable *</Label>
            <Select
              value={form.tecnicoResponsableId}
              onValueChange={(v) => setForm({ ...form, tecnicoResponsableId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar técnico" />
              </SelectTrigger>
              <SelectContent>
                {tecnicos.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.nombre} {t.apellido}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>
            Equipo{requiereEquipo ? " *" : ""}{" "}
            {!requiereEquipo && (
              <span className="text-xs text-muted-foreground">
                (opcional, descripción del sistema)
              </span>
            )}
          </Label>
          <Input
            value={form.equipo}
            onChange={(e) => setForm({ ...form, equipo: e.target.value })}
          />
        </div>
        {requiereCamaras && (
          <div className="space-y-1.5">
            <Label>Cantidad de cámaras *</Label>
            <Input
              type="number"
              min={1}
              value={form.cantidadCamaras}
              onChange={(e) => setForm({ ...form, cantidadCamaras: e.target.value })}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Descripción del trabajo solicitado *</Label>
          <Textarea
            rows={3}
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Observaciones{" "}
            <span className="text-xs text-muted-foreground">(contraseñas, accesorios, etc.)</span>
          </Label>
          <Textarea
            rows={2}
            value={form.observaciones}
            onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={!valido || guardando} onClick={submit}>
          {guardando ? "Guardando…" : "Registrar OT"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
