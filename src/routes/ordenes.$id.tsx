import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  MessageSquare,
  Printer,
  Send,
  FileCheck2,
  CheckCircle2,
  FileText,
  Plus,
  X,
  UserCog,
  Ban,
  ShieldQuestion,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  estadoLabel,
  estadoColor,
  tipoLabel,
  ESTADOS_TERMINALES_SERVICIO_TECNICO,
} from "@/lib/gestech-store";
import { useAuth } from "@/lib/use-auth";
import { useRequireAuth } from "@/lib/use-require-auth";
import { listarUsuariosFn } from "@/server/fn/usuarios";
import {
  actualizarSubEstadoFn,
  anularOrdenFn,
  autoasignarTecnicoFn,
  cambiarEstadoOrdenFn,
  guardarPresupuestoFn,
  obtenerAsignacionesFn,
  obtenerOrdenFn,
  reasignarTecnicoFn,
  registrarCumplimentacionFn,
  registrarReclamoGarantiaFn,
} from "@/server/fn/ordenes";
import { enviarMensajeFn, listarConversacionPorOrdenFn } from "@/server/fn/chatbot";
import { listarProductosFn } from "@/server/fn/productos";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  estadosPorTipo,
  NEGOCIO,
  puedePresupuestar,
  requiereMotivoDeCambio,
  type EstadoOrden,
  type MetodoPago,
  type Orden,
  type SubEstadoOrden,
  type TipoGarantia,
} from "@/lib/gestech-data";

export const Route = createFileRoute("/ordenes/$id")({
  component: OrdenDetalle,
});

function OrdenDetalle() {
  const user = useRequireAuth();
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();

  const ordenQuery = useQuery({
    queryKey: ["orden", id],
    queryFn: () => obtenerOrdenFn({ data: { id } }),
  });
  const orden = ordenQuery.data;

  // T-18 — chat de WhatsApp real (antes vivía en gestech-store.tsx/localStorage).
  const conversacionQuery = useQuery({
    queryKey: ["conversacion", id],
    queryFn: () => listarConversacionPorOrdenFn({ data: { ordenId: id } }),
    enabled: !!orden,
  });
  const conversacion = conversacionQuery.data ?? [];
  async function enviarMensaje(m: {
    direccion: "entrante" | "saliente";
    tipo:
      | "presupuesto"
      | "recordatorio"
      | "comprobante"
      | "aprobacion"
      | "respuesta"
      | "abandono"
      | "consulta";
    contenido: string;
  }) {
    await enviarMensajeFn({ data: { ordenId: id, ...m } });
    queryClient.invalidateQueries({ queryKey: ["conversacion", id] });
  }

  const usuariosQuery = useQuery({ queryKey: ["usuarios"], queryFn: () => listarUsuariosFn() });
  const users = (usuariosQuery.data ?? []).map((u) => ({
    id: String(u.id),
    nombre: `${u.nombre} ${u.apellido}`,
    rol: u.rol,
    activo: u.activo,
  }));

  const esCamaras = orden?.tipo !== "servicio_tecnico";
  const productosQuery = useQuery({
    queryKey: ["productos"],
    queryFn: () => listarProductosFn(),
    enabled: !!orden && esCamaras,
  });
  const productosDisponibles = productosQuery.data ?? [];

  const [monto, setMonto] = useState("");
  const [detalle, setDetalle] = useState("");
  const [manoObra, setManoObra] = useState("");
  const [lineas, setLineas] = useState<
    { productoId: number; nombre: string; cantidad: number; precioUnitario: number }[]
  >([]);
  const [productoSel, setProductoSel] = useState("");
  const [cantidadSel, setCantidadSel] = useState("1");
  const [enviandoPresupuesto, setEnviandoPresupuesto] = useState(false);
  const [openCumpl, setOpenCumpl] = useState(false);

  // Prefill del monto (servicio técnico) al cargar la orden — solo una vez
  // por orden, no en cada refetch, para no pisar lo que el usuario esté tipeando.
  useEffect(() => {
    if (orden?.tipo === "servicio_tecnico" && orden.presupuestoMonto != null) {
      setMonto(String(orden.presupuestoMonto));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden?.id]);

  const invalidarOrden = () => {
    queryClient.invalidateQueries({ queryKey: ["orden", id] });
    queryClient.invalidateQueries({ queryKey: ["ordenes"] });
    queryClient.invalidateQueries({ queryKey: ["productos"] });
  };

  const cambiarEstadoMutation = useMutation({
    mutationFn: ({ estado, motivo }: { estado: EstadoOrden; motivo?: string }) =>
      cambiarEstadoOrdenFn({ data: { id, nuevoEstado: estado, motivo } }),
    onSuccess: (_data, { estado }) => {
      toast.success(`Estado actualizado: ${estadoLabel[estado]}`);
      if (estado === "pendiente_retiro" && orden) {
        void enviarMensaje({
          direccion: "saliente",
          tipo: "recordatorio",
          contenido: `Hola ${orden.clienteNombre}, tu equipo (OT ${orden.numero}) ya está listo para el retiro. Atención: Lunes a Viernes 9 a 13 hs y 17 a 20 hs. Requisitos: DNI titular.`,
        });
      }
      invalidarOrden();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar el estado"),
  });

  // Decisión de implementación (a pedido del usuario): un Técnico que no es
  // el responsable de la orden puede igual cambiarle el estado, pero con
  // fricción — advertencia + motivo obligatorio, registrado en el
  // historial. El Administrador no tiene esta restricción.
  const [confirmandoCambio, setConfirmandoCambio] = useState<EstadoOrden | null>(null);
  const [motivoCambio, setMotivoCambio] = useState("");

  // RF13.2 — sub-estado del proceso de reparación (solo con estado "en_proceso").
  const subEstadoMutation = useMutation({
    mutationFn: (subEstado: SubEstadoOrden) =>
      actualizarSubEstadoFn({ data: { ordenId: id, subEstado } }),
    onSuccess: () => invalidarOrden(),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el sub-estado"),
  });

  // T-14 — técnico responsable
  const asignacionesQuery = useQuery({
    queryKey: ["asignaciones", id],
    queryFn: () => obtenerAsignacionesFn({ data: { ordenId: id } }),
    enabled: !!orden,
  });
  const [tecnicoSel, setTecnicoSel] = useState("");
  const [motivoReasignacion, setMotivoReasignacion] = useState("");
  const invalidarAsignacion = () => {
    invalidarOrden();
    queryClient.invalidateQueries({ queryKey: ["asignaciones", id] });
  };
  // RF10.2 — autoasignación, exclusiva del Técnico.
  const autoasignarMutation = useMutation({
    mutationFn: () => autoasignarTecnicoFn({ data: { ordenId: id } }),
    onSuccess: () => {
      toast.success("Te asignaste esta orden");
      invalidarAsignacion();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "No se pudo autoasignar la orden"),
  });
  // RF10.4 — reasignar una orden ya asignada, exclusiva del Administrador.
  const reasignarMutation = useMutation({
    mutationFn: () =>
      reasignarTecnicoFn({
        data: { ordenId: id, tecnicoId: Number(tecnicoSel), motivo: motivoReasignacion.trim() },
      }),
    onSuccess: () => {
      toast.success("Técnico reasignado");
      setTecnicoSel("");
      setMotivoReasignacion("");
      invalidarAsignacion();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "No se pudo reasignar el técnico"),
  });

  // T-15 — anulación de orden
  const [openAnular, setOpenAnular] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const anularMutation = useMutation({
    mutationFn: (motivo: string) => anularOrdenFn({ data: { ordenId: id, motivo } }),
    onSuccess: () => {
      toast.success("Orden anulada");
      setOpenAnular(false);
      setMotivoAnulacion("");
      invalidarOrden();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "No se pudo anular la orden"),
  });

  // T-17 — reclamo de garantía
  const [openReclamo, setOpenReclamo] = useState(false);

  if (!user) return null;
  if (ordenQuery.isPending) {
    return <AppShell title="Orden">Cargando…</AppShell>;
  }
  if (!orden) {
    return (
      <AppShell title="Orden no encontrada">
        <Link to="/ordenes" className="text-primary text-sm">
          ← Volver a órdenes
        </Link>
      </AppShell>
    );
  }

  const tecnicoRealizo = orden.cumplimentacion
    ? users.find((u) => u.id === orden.cumplimentacion!.tecnicoRealizoId)
    : null;
  const estadosValidos = estadosPorTipo(orden.tipo);
  // Bloqueo total de edición tras cumplimentar o anular la OT (RF03.2.3, RF17.4).
  const bloqueado = !!orden.cumplimentacion || orden.estado === "anulado";
  const puedeCumplimentar =
    !orden.cumplimentacion && (orden.estado === "entregado" || orden.estado === "finalizado");
  // Decisión de implementación (a pedido del usuario): presupuestar es
  // sustantivo (diagnóstico + monto comprometido) — bloqueo duro, sin
  // override, para quien no sea el técnico responsable de la orden.
  const puedePresupuestarOrden =
    !currentUser || puedePresupuestar(orden.tecnicoResponsableId, currentUser);

  function cambiarEstado(estado: EstadoOrden) {
    if (bloqueado || !currentUser) return;
    // PRESUPUESTADO es alcanzable también desde este selector genérico, no
    // solo desde el formulario de presupuesto — el bloqueo duro (sin
    // override) tiene que valer por igual acá.
    if (estado === "presupuestado" && !puedePresupuestarOrden) {
      toast.error("Solo el técnico responsable puede presupuestar esta orden.");
      return;
    }
    if (requiereMotivoDeCambio(orden!.tecnicoResponsableId, currentUser)) {
      setConfirmandoCambio(estado);
      setMotivoCambio("");
      return;
    }
    cambiarEstadoMutation.mutate({ estado });
  }

  function confirmarCambioForzado() {
    if (!confirmandoCambio || !motivoCambio.trim()) return;
    cambiarEstadoMutation.mutate({ estado: confirmandoCambio, motivo: motivoCambio.trim() });
    setConfirmandoCambio(null);
    setMotivoCambio("");
  }

  function agregarLinea() {
    const p = productosDisponibles.find((x) => x.id === Number(productoSel));
    if (!p) return toast.error("Seleccioná un producto");
    const cant = Number(cantidadSel);
    if (!cant || cant < 1) return toast.error("Cantidad inválida");
    setLineas((ls) => [
      ...ls,
      { productoId: p.id, nombre: p.nombre, cantidad: cant, precioUnitario: p.precio },
    ]);
    setProductoSel("");
    setCantidadSel("1");
  }
  function quitarLinea(idx: number) {
    setLineas((ls) => ls.filter((_, i) => i !== idx));
  }
  const subtotalMateriales = lineas.reduce((a, l) => a + l.cantidad * l.precioUnitario, 0);
  const totalPresupuesto = subtotalMateriales + (Number(manoObra) || 0);

  async function enviarPresupuesto() {
    if (bloqueado || !orden || !puedePresupuestarOrden) return;
    const manoObraNum = esCamaras ? Number(manoObra) || 0 : parseFloat(monto);
    if (!esCamaras && !manoObraNum) return toast.error("Ingresá un monto válido");
    if (esCamaras && lineas.length === 0 && !manoObraNum) {
      return toast.error("Agregá al menos un producto o ingresá el monto de mano de obra");
    }
    setEnviandoPresupuesto(true);
    try {
      const resultado = await guardarPresupuestoFn({
        data: {
          ordenId: orden.id,
          detalle: detalle.trim() || orden.descripcion,
          manoObra: manoObraNum,
          items: esCamaras
            ? lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad }))
            : [],
        },
      });
      await enviarMensaje({
        direccion: "saliente",
        tipo: "presupuesto",
        contenido: `Hola ${orden.clienteNombre} 👋 Tu presupuesto por "${orden.equipo || orden.descripcion}" es $${resultado.montoTotal.toLocaleString("es-AR")}. Detalle: ${detalle.trim() || orden.descripcion}. Respondé CONFIRMAR o RECHAZAR.`,
      });
      toast.success("Presupuesto enviado por WhatsApp");
      setLineas([]);
      invalidarOrden();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo guardar el presupuesto";
      if (msg.includes("Stock insuficiente")) {
        toast.error(msg, {
          action: { label: "Reponer stock", onClick: () => navigate({ to: "/reposicion-stock" }) },
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setEnviandoPresupuesto(false);
    }
  }

  function simularRespuestaCliente(decision: "aprobado" | "rechazado") {
    void enviarMensaje({
      direccion: "entrante",
      tipo: "respuesta",
      contenido: decision === "aprobado" ? "Confirmar" : "Rechazar",
    });
    cambiarEstado(decision);
  }

  // RF05.2.1 — si el cliente responde algo distinto a "confirmar"/"rechazar",
  // el chatbot pide reenvío con el formato válido y la orden queda en Presupuestado.
  function simularRespuestaInvalida() {
    void enviarMensaje({
      direccion: "entrante",
      tipo: "respuesta",
      contenido: "Si, dale",
    });
    void enviarMensaje({
      direccion: "saliente",
      tipo: "presupuesto",
      contenido: `No pudimos interpretar tu respuesta. Por favor reenviá CONFIRMAR o RECHAZAR para el presupuesto de la OT ${orden!.numero}.`,
    });
    toast.info("Respuesta no reconocida — el chatbot solicitó reenvío.");
  }

  function imprimirComprobante() {
    if (!orden!.cumplimentacion) return toast.error("La orden aún no está cumplimentada");
    abrirComprobante(orden!, tecnicoRealizo?.nombre ?? "—");
  }

  return (
    <AppShell title={`Orden N° ${orden.numero}`}>
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/ordenes" })}>
          <ArrowLeft className="size-4" /> Volver
        </Button>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {tipoLabel[orden.tipo]} · OT N° {orden.numero}
                  </div>
                  <h2 className="text-xl font-semibold mt-0.5">
                    {orden.equipo ||
                      (orden.cantidadCamaras
                        ? `${orden.cantidadCamaras} cámara${orden.cantidadCamaras === 1 ? "" : "s"}`
                        : "—")}
                  </h2>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge variant="secondary" className={estadoColor[orden.estado] + " text-sm"}>
                    {estadoLabel[orden.estado]}
                  </Badge>
                  {orden.bajoGarantia && (
                    <Badge variant="outline" className="text-[10px]">
                      <ShieldQuestion className="size-3" /> Bajo garantía
                      {orden.ordenOriginalId && (
                        <>
                          {" — "}
                          <Link
                            to="/ordenes/$id"
                            params={{ id: orden.ordenOriginalId }}
                            className="underline"
                          >
                            OT {orden.ordenOriginalId}
                          </Link>
                        </>
                      )}
                    </Badge>
                  )}
                </div>
              </div>
              {orden.estado === "anulado" && (
                <div className="mt-3 p-3 rounded-md bg-destructive/10 text-sm">
                  <div className="font-medium text-destructive">Orden anulada</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {orden.fechaAnulacion} · {orden.motivoAnulacion}
                  </div>
                </div>
              )}
              {orden.tipo === "servicio_tecnico" && orden.estado === "en_proceso" && (
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground uppercase mb-1">
                    Sub-estado del proceso
                  </div>
                  <Select
                    value={orden.subEstado ?? undefined}
                    onValueChange={(v) => subEstadoMutation.mutate(v as SubEstadoOrden)}
                    disabled={subEstadoMutation.isPending}
                  >
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder="Seleccionar sub-estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SUB_ESTADO_LABEL) as SubEstadoOrden[]).map((se) => (
                        <SelectItem key={se} value={se}>
                          {SUB_ESTADO_LABEL[se]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Separator className="my-4" />
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <Info label="Cliente" value={`${orden.clienteNombre} ${orden.clienteApellido}`} />
                <Info label="DNI" value={orden.dni} />
                <Info label="Teléfono" value={orden.telefono} />
                {orden.domicilio && <Info label="Domicilio" value={orden.domicilio} />}
                {orden.cantidadCamaras != null && (
                  <Info label="Cantidad de cámaras" value={String(orden.cantidadCamaras)} />
                )}
                <Info label="Ingresada" value={orden.ingresada} />
                {orden.tecnicoResponsableNombre && (
                  <Info label="Técnico responsable" value={orden.tecnicoResponsableNombre} />
                )}
              </div>
              <Separator className="my-4" />
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-1">
                  Descripción del trabajo
                </div>
                <p className="text-sm leading-relaxed">{orden.descripcion}</p>
              </div>
              {orden.observaciones && (
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground uppercase mb-1">Observaciones</div>
                  <p className="text-sm leading-relaxed">{orden.observaciones}</p>
                </div>
              )}
            </Card>

            {orden.cumplimentacion && (
              <Card className="p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="size-4 text-primary" /> Cumplimentación
                </h3>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <Info
                    label="Fecha de realización"
                    value={orden.cumplimentacion.fechaRealizacion}
                  />
                  <Info label="Técnico que realizó" value={tecnicoRealizo?.nombre ?? "—"} />
                  <Info
                    label="Monto cobrado"
                    value={`$${orden.cumplimentacion.monto.toLocaleString("es-AR")}`}
                  />
                  <Info
                    label="Método de pago"
                    value={metodoPagoLabel(orden.cumplimentacion.metodoPago)}
                  />
                  <Info
                    label="N° Comprobante"
                    value={orden.cumplimentacion.comprobanteNro ?? "—"}
                  />
                  {orden.garantia && <Info label="Garantía hasta" value={orden.garantia.vence} />}
                </div>
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground uppercase mb-1">
                    Tareas realizadas
                  </div>
                  <p className="text-sm leading-relaxed">
                    {orden.cumplimentacion.tareasRealizadas}
                  </p>
                </div>
              </Card>
            )}

            <Card className="p-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="size-4 text-whatsapp" />
                Conversación WhatsApp
              </h3>
              {conversacion.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin mensajes todavía.</p>
              ) : (
                <div className="space-y-3">
                  {conversacion.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.direccion === "saliente" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          m.direccion === "saliente" ? "bg-whatsapp/15 text-foreground" : "bg-muted"
                        }`}
                      >
                        <div>{m.texto}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {m.fecha} · {m.tipo}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Estado del trabajo</h3>
              <Label className="text-xs">Cambiar estado</Label>
              <Select
                value={orden.estado}
                onValueChange={(v) => cambiarEstado(v as EstadoOrden)}
                disabled={bloqueado || cambiarEstadoMutation.isPending}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {estadosValidos.map((e) => (
                    <SelectItem key={e} value={e}>
                      {estadoLabel[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-2">
                Secuencia permitida según tipo:{" "}
                {orden.tipo === "servicio_tecnico" ? "servicio técnico" : "cámaras"}. El sistema
                rechaza cualquier salto que no corresponda.
              </p>
              {currentUser?.rol === "ADMINISTRADOR" && orden.estado !== "anulado" && (
                <Dialog open={openAnular} onOpenChange={setOpenAnular}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3 text-destructive hover:text-destructive"
                      disabled={bloqueado}
                    >
                      <Ban className="size-3.5" /> Anular orden
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Anular orden N° {orden.numero}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-1.5 py-2">
                      <Label>Motivo de la anulación *</Label>
                      <Textarea
                        rows={3}
                        value={motivoAnulacion}
                        onChange={(e) => setMotivoAnulacion(e.target.value)}
                        placeholder="Orden cargada por error, datos duplicados, etc."
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setOpenAnular(false)}>
                        Cancelar
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={!motivoAnulacion.trim() || anularMutation.isPending}
                        onClick={() => anularMutation.mutate(motivoAnulacion.trim())}
                      >
                        Confirmar anulación
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </Card>

            {/* Decisión de implementación (a pedido del usuario): un Técnico que
                no es el responsable puede igual cambiar el estado, con
                advertencia + motivo obligatorio, registrado en el historial. */}
            <Dialog
              open={!!confirmandoCambio}
              onOpenChange={(v) => !v && setConfirmandoCambio(null)}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Esta orden está a cargo de otro técnico</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">
                    Esta orden está a cargo de{" "}
                    <span className="font-medium text-foreground">
                      {orden.tecnicoResponsableNombre ?? "otro técnico"}
                    </span>
                    . Podés cambiar el estado igual, pero indicá el motivo — queda registrado en el
                    historial.
                  </p>
                  <div className="space-y-1.5">
                    <Label>Motivo *</Label>
                    <Textarea
                      rows={3}
                      value={motivoCambio}
                      onChange={(e) => setMotivoCambio(e.target.value)}
                      placeholder="Por qué estás cambiando el estado de una orden que no es tuya"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setConfirmandoCambio(null)}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={!motivoCambio.trim() || cambiarEstadoMutation.isPending}
                    onClick={confirmarCambioForzado}
                  >
                    Confirmar cambio
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Card className="p-5 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <UserCog className="size-4" /> Técnico responsable
              </h3>
              <div className="text-sm">
                {orden.tecnicoResponsableNombre ?? (
                  <span className="text-muted-foreground">Sin asignar</span>
                )}
              </div>

              {/* RF10.2 — sin responsable: solo un Técnico puede tomarla (autoasignación).
                  Ningún estado terminal admite autoasignación. */}
              {!orden.tecnicoResponsableId &&
                orden.tipo === "servicio_tecnico" &&
                !ESTADOS_TERMINALES_SERVICIO_TECNICO.includes(orden.estado) &&
                currentUser?.rol === "TECNICO" && (
                  <Button
                    size="sm"
                    disabled={bloqueado || autoasignarMutation.isPending}
                    onClick={() => autoasignarMutation.mutate()}
                  >
                    Tomar esta orden
                  </Button>
                )}

              {/* RF10.4 — ya asignada: solo el Administrador puede reasignar, con motivo. */}
              {orden.tecnicoResponsableId && currentUser?.rol === "ADMINISTRADOR" && (
                <div className="space-y-2">
                  <Select value={tecnicoSel} onValueChange={setTecnicoSel} disabled={bloqueado}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Nuevo técnico" />
                    </SelectTrigger>
                    <SelectContent>
                      {users
                        .filter((u) => u.rol === "TECNICO" && u.activo)
                        .map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    rows={2}
                    placeholder="Motivo de la reasignación *"
                    value={motivoReasignacion}
                    onChange={(e) => setMotivoReasignacion(e.target.value)}
                    disabled={bloqueado}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={
                      !tecnicoSel ||
                      !motivoReasignacion.trim() ||
                      bloqueado ||
                      reasignarMutation.isPending
                    }
                    onClick={() => reasignarMutation.mutate()}
                  >
                    Reasignar
                  </Button>
                </div>
              )}

              {(asignacionesQuery.data?.length ?? 0) > 0 && (
                <div className="text-[11px] text-muted-foreground space-y-1 pt-1 border-t">
                  {asignacionesQuery.data!.map((a) => (
                    <div key={a.id}>
                      {a.fecha} — {TIPO_ASIGNACION_LABEL[a.tipoAsignacion] ?? a.tipoAsignacion}:{" "}
                      {a.tecnicoAnterior ? `${a.tecnicoAnterior} → ` : ""}
                      {a.tecnicoAsignado} (por {a.usuarioResponsable})
                      {a.motivo ? ` — "${a.motivo}"` : ""}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5 space-y-3">
              <h3 className="font-semibold">Presupuesto</h3>
              {!puedePresupuestarOrden && (
                <p className="text-xs text-muted-foreground bg-muted rounded-md p-2">
                  Solo el técnico responsable ({orden.tecnicoResponsableNombre}) puede presupuestar
                  esta orden.
                </p>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Detalle del trabajo a presupuestar</Label>
                <Textarea
                  rows={2}
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder={orden.descripcion}
                  disabled={bloqueado || !puedePresupuestarOrden}
                />
              </div>

              {esCamaras && (
                <div className="space-y-2">
                  <Label className="text-xs">Productos</Label>
                  <div className="flex gap-2">
                    <Select value={productoSel} onValueChange={setProductoSel}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Seleccionar producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {productosDisponibles.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.nombre} — disp. {p.stockDisponible} · $
                            {p.precio.toLocaleString("es-AR")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      value={cantidadSel}
                      onChange={(e) => setCantidadSel(e.target.value)}
                      className="w-16"
                    />
                    <Button type="button" size="icon" variant="outline" onClick={agregarLinea}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  {lineas.length > 0 && (
                    <div className="rounded-md border divide-y text-xs">
                      {lineas.map((l, i) => (
                        <div key={i} className="flex items-center justify-between px-2 py-1.5">
                          <span>
                            {l.cantidad}× {l.nombre}
                          </span>
                          <span className="flex items-center gap-2">
                            ${(l.cantidad * l.precioUnitario).toLocaleString("es-AR")}
                            <button onClick={() => quitarLinea(i)} className="text-destructive">
                              <X className="size-3" />
                            </button>
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-2 py-1.5 font-medium">
                        <span>Subtotal materiales</span>
                        <span>${subtotalMateriales.toLocaleString("es-AR")}</span>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mano de obra</Label>
                    <Input
                      type="number"
                      value={manoObra}
                      onChange={(e) => setManoObra(e.target.value)}
                      placeholder="0"
                      disabled={bloqueado}
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm font-semibold pt-1">
                    <span>Total</span>
                    <span>${totalPresupuesto.toLocaleString("es-AR")}</span>
                  </div>
                  <Button
                    className="w-full"
                    onClick={enviarPresupuesto}
                    disabled={bloqueado || !puedePresupuestarOrden || enviandoPresupuesto}
                  >
                    <Send className="size-4" /> Enviar presupuesto
                  </Button>
                </div>
              )}

              {!esCamaras && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Monto a presupuestar (mano de obra)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      placeholder="0"
                      disabled={bloqueado || !puedePresupuestarOrden}
                    />
                    <Button
                      onClick={enviarPresupuesto}
                      disabled={bloqueado || !puedePresupuestarOrden || enviandoPresupuesto}
                    >
                      <Send className="size-4" /> Enviar
                    </Button>
                  </div>
                </div>
              )}

              {orden.estado === "presupuestado" && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-muted-foreground">
                    Simular respuesta del cliente por WhatsApp (adicional):
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => simularRespuestaCliente("aprobado")}
                    >
                      Confirmar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => simularRespuestaCliente("rechazado")}
                    >
                      Rechazar
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs"
                    onClick={simularRespuestaInvalida}
                  >
                    Simular respuesta no reconocida
                  </Button>
                </div>
              )}
              {orden.respuestaPresupuesto && (
                <div className="text-xs p-2 rounded bg-muted">
                  Cliente respondió{" "}
                  <strong>{orden.respuestaPresupuesto.decision.toUpperCase()}</strong> el{" "}
                  {orden.respuestaPresupuesto.fecha}
                </div>
              )}
            </Card>

            <Card className="p-5 space-y-2">
              <h3 className="font-semibold">Cumplimentación del trabajo</h3>
              <Dialog open={openCumpl} onOpenChange={setOpenCumpl}>
                <DialogTrigger asChild>
                  <Button className="w-full" disabled={!puedeCumplimentar}>
                    <CheckCircle2 className="size-4" /> Registrar finalización
                  </Button>
                </DialogTrigger>
                <CumplimentarDialog
                  orden={orden}
                  tecnicos={users.filter((u) => u.rol === "TECNICO" && u.activo)}
                  defaultTecnicoId={
                    orden.tecnicoResponsableId ?? (currentUser ? String(currentUser.id) : "")
                  }
                  onClose={() => setOpenCumpl(false)}
                  onSubmit={async (data) => {
                    try {
                      const resultado = await registrarCumplimentacionFn({
                        data: {
                          ordenId: orden.id,
                          fechaRealizacion: data.fechaRealizacion,
                          descripcionTareas: data.tareasRealizadas,
                          tecnicoEjecutorId: Number(data.tecnicoRealizoId),
                          montoCobrado: data.monto,
                          metodoPago: data.metodoPago,
                          tipoGarantia: data.tipoGarantia,
                        },
                      });
                      await enviarMensaje({
                        direccion: "saliente",
                        tipo: "comprobante",
                        contenido: `¡Listo ${orden.clienteNombre}! Trabajo finalizado y cobrado. Te adjuntamos el comprobante N°${resultado.comprobanteNro} en PDF.`,
                      });
                      toast.success("Trabajo cumplimentado. Comprobante enviado.");
                      setOpenCumpl(false);
                      invalidarOrden();
                      const actualizada = await obtenerOrdenFn({ data: { id: orden.id } });
                      const tecNombre =
                        users.find((u) => u.id === data.tecnicoRealizoId)?.nombre ?? "—";
                      if (actualizada) {
                        setTimeout(() => abrirComprobante(actualizada, tecNombre), 300);
                      }
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "No se pudo registrar la cumplimentación",
                      );
                    }
                  }}
                />
              </Dialog>
              {!puedeCumplimentar && !orden.cumplimentacion && (
                <p className="text-[11px] text-muted-foreground">
                  Para registrar la finalización, la OT debe estar en estado{" "}
                  {orden.tipo === "servicio_tecnico" ? "Entregado" : "Finalizado"}.
                </p>
              )}
              {bloqueado && (
                <p className="text-[11px] text-muted-foreground">
                  {orden.estado === "anulado"
                    ? "Orden anulada: los datos quedan bloqueados y no pueden modificarse."
                    : "Orden cumplimentada: los datos quedan bloqueados y no pueden modificarse."}
                </p>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={imprimirComprobante}
                disabled={!orden.cumplimentacion}
              >
                <Printer className="size-4" /> Ver / Imprimir comprobante
              </Button>
              {orden.garantia && (
                <div className="mt-2 p-3 rounded-md bg-success/10 text-sm">
                  <div className="flex items-center gap-1.5 font-medium text-success">
                    <FileCheck2 className="size-4" /> Garantía activa
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {garantiaLabel(orden.garantia.tipo)} · vence el {orden.garantia.vence}
                  </div>
                </div>
              )}
              {orden.cumplimentacion && orden.garantia?.activa && (
                <Dialog open={openReclamo} onOpenChange={setOpenReclamo}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <ShieldQuestion className="size-4" /> Registrar reclamo de garantía
                    </Button>
                  </DialogTrigger>
                  <ReclamoGarantiaDialog
                    ordenId={orden.id}
                    onClose={() => setOpenReclamo(false)}
                    onResuelto={(resultado) => {
                      setOpenReclamo(false);
                      if (resultado.aceptado) {
                        toast.success(
                          `Reclamo aceptado — nueva OT N° ${resultado.ordenGeneradaId}`,
                        );
                        navigate({ to: "/ordenes/$id", params: { id: resultado.ordenGeneradaId } });
                      } else {
                        toast.error(`Reclamo rechazado: ${resultado.motivo}`);
                      }
                    }}
                  />
                </Dialog>
              )}
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function garantiaLabel(t: TipoGarantia) {
  if (t === "mantenimiento_software") return "Mantenimiento/Software (30 días)";
  if (t === "hardware_reparacion") return "Hardware/Reparación (90 días)";
  if (t === "mantenimiento_camaras") return "Mantenimiento de cámaras (30 días)";
  return "Instalación de cámaras (6 meses)";
}

// RN-01 — medios de pago habilitados.
const METODO_PAGO_LABEL: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta_credito: "Tarjeta de crédito",
  tarjeta_debito: "Tarjeta de débito",
};
function metodoPagoLabel(m?: MetodoPago) {
  return m ? METODO_PAGO_LABEL[m] : "—";
}

// RF13.2 — sub-estados del proceso de reparación, solo mientras la orden está "En proceso".
const SUB_ESTADO_LABEL: Record<SubEstadoOrden, string> = {
  diagnostico: "Diagnóstico",
  esperando_repuesto: "Esperando repuesto",
  en_reparacion: "En reparación",
  pruebas_finales: "Pruebas finales",
};

// RF10.5 — historial de asignaciones, con tipo y motivo (rev. GESTECH_CAMBIOS_ASIGNACION.md).
const TIPO_ASIGNACION_LABEL: Record<string, string> = {
  INICIAL: "Asignación inicial",
  AUTOASIGNACION: "Autoasignación",
  REASIGNACION: "Reasignación",
  REASIGNACION_POR_BAJA: "Reasignación por baja",
};

// Opciones de garantía válidas según el tipo de servicio (RF03.2.2).
function garantiasPorTipoServicio(tipo: Orden["tipo"]): { value: TipoGarantia; label: string }[] {
  if (tipo === "servicio_tecnico") {
    return [
      { value: "mantenimiento_software", label: "Mantenimiento / Software — 30 días" },
      { value: "hardware_reparacion", label: "Reparación / Hardware — 90 días" },
    ];
  }
  if (tipo === "mantenimiento_camaras") {
    return [{ value: "mantenimiento_camaras", label: "Mantenimiento de cámaras — 30 días" }];
  }
  return [{ value: "instalacion_camaras", label: "Instalación de cámaras — 6 meses" }];
}

function CumplimentarDialog({
  orden,
  tecnicos,
  defaultTecnicoId,
  onClose,
  onSubmit,
}: {
  orden: Orden;
  tecnicos: { id: string; nombre: string }[];
  defaultTecnicoId: string;
  onClose: () => void;
  onSubmit: (data: {
    fechaRealizacion: string;
    tareasRealizadas: string;
    tecnicoRealizoId: string;
    monto: number;
    metodoPago: MetodoPago;
    tipoGarantia: TipoGarantia;
  }) => void;
}) {
  const opcionesGarantia = garantiasPorTipoServicio(orden.tipo);
  const garantiaDefault: TipoGarantia = opcionesGarantia[0].value;
  const [data, setData] = useState({
    fechaRealizacion: new Date().toISOString().slice(0, 10),
    tareasRealizadas: "",
    tecnicoRealizoId: defaultTecnicoId,
    monto: "",
    metodoPago: "efectivo" as MetodoPago,
    tipoGarantia: garantiaDefault as TipoGarantia,
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Registrar cumplimentación</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label>Fecha de realización *</Label>
          <Input
            type="date"
            value={data.fechaRealizacion}
            onChange={(e) => setData({ ...data, fechaRealizacion: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Tareas realizadas *</Label>
          <Textarea
            rows={3}
            value={data.tareasRealizadas}
            onChange={(e) => setData({ ...data, tareasRealizadas: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Técnico que realizó la tarea *</Label>
          <Select
            value={data.tecnicoRealizoId}
            onValueChange={(v) => setData({ ...data, tecnicoRealizoId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {tecnicos.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Monto cobrado *</Label>
            <Input
              type="number"
              value={data.monto}
              onChange={(e) => setData({ ...data, monto: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Método de pago</Label>
            <Select
              value={data.metodoPago}
              onValueChange={(v: MetodoPago) => setData({ ...data, metodoPago: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METODO_PAGO_LABEL) as MetodoPago[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METODO_PAGO_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de garantía *</Label>
          <Select
            value={data.tipoGarantia}
            onValueChange={(v: TipoGarantia) => setData({ ...data, tipoGarantia: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opcionesGarantia.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={!data.tareasRealizadas || !data.monto || !data.tecnicoRealizoId}
          onClick={() =>
            onSubmit({
              fechaRealizacion: data.fechaRealizacion,
              tareasRealizadas: data.tareasRealizadas.trim(),
              tecnicoRealizoId: data.tecnicoRealizoId,
              monto: parseFloat(data.monto),
              metodoPago: data.metodoPago,
              tipoGarantia: data.tipoGarantia,
            })
          }
        >
          Finalizar y emitir comprobante
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// CU14/RN-06/RN-07 — reclamo de garantía. RN-06 exige coincidencia de falla
// y comprobante presentado; RN-07 anula la garantía si se detecta cualquiera
// de las tres causales.
function ReclamoGarantiaDialog({
  ordenId,
  onClose,
  onResuelto,
}: {
  ordenId: string;
  onClose: () => void;
  onResuelto: (
    r: { aceptado: true; ordenGeneradaId: string } | { aceptado: false; motivo: string },
  ) => void;
}) {
  const [fallaCoincide, setFallaCoincide] = useState(false);
  const [presentaComprobante, setPresentaComprobante] = useState(false);
  const [danosFisicos, setDanosFisicos] = useState(false);
  const [danosLiquidos, setDanosLiquidos] = useState(false);
  const [alteracionTerceros, setAlteracionTerceros] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!observaciones.trim()) return toast.error("Ingresá las observaciones de la inspección");
    setEnviando(true);
    try {
      const resultado = await registrarReclamoGarantiaFn({
        data: {
          ordenOriginalId: ordenId,
          fallaCoincide,
          presentaComprobante,
          danosFisicos,
          danosLiquidos,
          alteracionTerceros,
          observaciones: observaciones.trim(),
        },
      });
      onResuelto(resultado);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar el reclamo");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Reclamo de garantía</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={fallaCoincide} onCheckedChange={(v) => setFallaCoincide(!!v)} />
          La falla coincide con la original (RN-06)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={presentaComprobante}
            onCheckedChange={(v) => setPresentaComprobante(!!v)}
          />
          El cliente presenta el comprobante (RN-06)
        </label>
        <div className="pt-1 space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">
            Causales de anulación de garantía (RN-07)
          </Label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={danosFisicos} onCheckedChange={(v) => setDanosFisicos(!!v)} />
            Daños físicos posteriores a la entrega
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={danosLiquidos} onCheckedChange={(v) => setDanosLiquidos(!!v)} />
            Daños por líquidos o sobretensiones
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={alteracionTerceros}
              onCheckedChange={(v) => setAlteracionTerceros(!!v)}
            />
            Signos de desarme o alteración por terceros
          </label>
        </div>
        <div className="space-y-1.5">
          <Label>Observaciones de la inspección *</Label>
          <Textarea
            rows={3}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={enviando} onClick={enviar}>
          Registrar reclamo
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// Genera el comprobante en una ventana lista para imprimir / guardar como PDF.
function abrirComprobante(orden: Orden, tecnicoNombre: string) {
  const c = orden.cumplimentacion!;
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return;
  const tipoTxt =
    orden.tipo === "servicio_tecnico"
      ? "Servicio técnico"
      : orden.tipo === "instalacion_camaras"
        ? "Instalación de cámaras"
        : "Mantenimiento de cámaras";
  const incluirDom = orden.tipo !== "servicio_tecnico" && orden.domicilio;
  const hoy = new Date().toLocaleDateString("es-AR");
  w.document
    .write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante N° ${c.comprobanteNro}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color:#111; padding: 32px; max-width: 720px; margin: 0 auto; }
    h1 { font-size: 22px; margin: 0; }
    .muted { color: #666; font-size: 12px; }
    .box { border:1px solid #ddd; border-radius:8px; padding:16px; margin:14px 0; }
    .row { display:flex; justify-content:space-between; gap:16px; margin: 6px 0; font-size:14px; }
    .row b { font-weight:600; }
    table { width:100%; border-collapse: collapse; margin-top: 6px; font-size:14px; }
    table td { padding: 8px 0; border-bottom: 1px dashed #eee; vertical-align: top; }
    .total { font-size: 22px; font-weight: 700; text-align:right; padding-top:14px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:12px; }
    button { padding:8px 16px; border-radius:6px; border:1px solid #111; background:#111; color:#fff; cursor:pointer; }
    @media print { .noprint { display:none; } body { padding:0; } }
  </style></head><body>
    <div class="header">
      <div>
        <h1>${NEGOCIO.nombre}</h1>
        <div class="muted">${NEGOCIO.direccion}</div>
        <div class="muted">CUIT ${NEGOCIO.cuit} · Tel ${NEGOCIO.telefono} · ${NEGOCIO.email}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px"><b>COMPROBANTE</b></div>
        <div class="muted">N° ${c.comprobanteNro}</div>
        <div class="muted">Emitido: ${hoy}</div>
      </div>
    </div>

    <div class="box">
      <div style="font-weight:600; margin-bottom:6px">Cliente</div>
      <div class="row"><span>Nombre y apellido</span><b>${orden.clienteNombre} ${orden.clienteApellido}</b></div>
      <div class="row"><span>DNI</span><b>${orden.dni}</b></div>
      <div class="row"><span>Teléfono</span><b>${orden.telefono}</b></div>
      ${incluirDom ? `<div class="row"><span>Domicilio</span><b>${orden.domicilio}</b></div>` : ""}
    </div>

    <div class="box">
      <div style="font-weight:600; margin-bottom:6px">Trabajo realizado</div>
      <div class="row"><span>Orden de trabajo</span><b>N° ${orden.numero}</b></div>
      <div class="row"><span>Tipo de servicio</span><b>${tipoTxt}</b></div>
      <div class="row"><span>Equipo</span><b>${orden.equipo}</b></div>
      <div class="row"><span>Fecha de realización</span><b>${c.fechaRealizacion}</b></div>
      <div class="row"><span>Técnico</span><b>${tecnicoNombre}</b></div>
      <table>
        <tr><td><b>Detalle</b><br/><span class="muted">${c.tareasRealizadas}</span></td></tr>
      </table>
      <div class="total">TOTAL: $${c.monto.toLocaleString("es-AR")}</div>
      <div class="muted" style="text-align:right">Método de pago: ${metodoPagoLabel(c.metodoPago)}</div>
    </div>

    ${orden.garantia ? `<div class="box"><b>Garantía</b> · ${garantiaLabelHtml(orden.garantia.tipo)} · vence el ${orden.garantia.vence}</div>` : ""}

    <div class="noprint" style="text-align:right; margin-top:18px">
      <button onclick="window.print()">Imprimir / Guardar PDF</button>
    </div>
  </body></html>`);
  w.document.close();
}

function garantiaLabelHtml(t: TipoGarantia) {
  if (t === "mantenimiento_software") return "Mantenimiento/Software (30 días)";
  if (t === "hardware_reparacion") return "Hardware/Reparación (90 días)";
  return "Instalación de cámaras (6 meses)";
}
