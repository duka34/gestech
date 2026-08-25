import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, X, PackageCheck, PackagePlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useRequireAuth } from "@/lib/use-require-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  confirmarReposicionFn,
  listarReposicionesFn,
  recibirReposicionFn,
  registrarReposicionFn,
} from "@/server/fn/reposicion";
import { listarProductosFn } from "@/server/fn/productos";

export const Route = createFileRoute("/reposicion-stock")({
  head: () => ({ meta: [{ title: "Reposición de stock — GesTech" }] }),
  component: ReposicionStockPage,
});

const ESTADO_LABEL: Record<string, string> = {
  SOLICITADO: "Solicitado",
  CONFIRMADO: "Confirmado",
  RECIBIDO: "Recibido",
};
const ESTADO_COLOR: Record<string, string> = {
  SOLICITADO: "bg-muted text-foreground",
  CONFIRMADO: "bg-warning/20 text-warning-foreground",
  RECIBIDO: "bg-success/15 text-success",
};

function ReposicionStockPage() {
  const user = useRequireAuth({ role: "ADMINISTRADOR" });
  const queryClient = useQueryClient();
  const reposicionesQuery = useQuery({
    queryKey: ["reposiciones"],
    queryFn: () => listarReposicionesFn(),
  });
  const productosQuery = useQuery({ queryKey: ["productos"], queryFn: () => listarProductosFn() });
  const productos = productosQuery.data ?? [];
  const nombreProducto = (id: number) => productos.find((p) => p.id === id)?.nombre ?? `#${id}`;

  const [openNuevo, setOpenNuevo] = useState(false);
  const [recibiendo, setRecibiendo] = useState<(typeof reposiciones)[number] | null>(null);
  const reposiciones = reposicionesQuery.data ?? [];

  if (!user) return null;

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ["reposiciones"] });
    queryClient.invalidateQueries({ queryKey: ["productos"] });
  }

  async function confirmar(id: number) {
    try {
      await confirmarReposicionFn({ data: { id } });
      toast.success("Pedido confirmado");
      refrescar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo confirmar el pedido");
    }
  }

  return (
    <AppShell title="Reposición de stock">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Dialog open={openNuevo} onOpenChange={setOpenNuevo}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Nuevo pedido
              </Button>
            </DialogTrigger>
            <NuevoPedidoDialog
              productos={productos}
              onClose={() => setOpenNuevo(false)}
              onCreated={() => {
                setOpenNuevo(false);
                refrescar();
              }}
            />
          </Dialog>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Proveedor</th>
                  <th className="text-left px-4 py-3 font-medium">Fecha pedido</th>
                  <th className="text-left px-4 py-3 font-medium">Fecha estimada</th>
                  <th className="text-left px-4 py-3 font-medium">Productos</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reposiciones.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors align-top">
                    <td className="px-4 py-3 font-medium">{r.proveedor}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {r.fechaPedido.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {r.fechaEstimadaRecepcion ?? "—"}
                    </td>
                    <td className="px-4 py-3 max-w-sm">
                      <ul className="text-[11px] text-muted-foreground space-y-0.5">
                        {r.items.map((it) => (
                          <li key={it.id}>
                            {nombreProducto(it.productoId)}: {it.cantidadRecibida}/
                            {it.cantidadSolicitada}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={ESTADO_COLOR[r.estado]}>
                        {ESTADO_LABEL[r.estado]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {r.estado === "SOLICITADO" && (
                        <Button size="sm" variant="outline" onClick={() => confirmar(r.id)}>
                          <PackageCheck className="size-3.5" /> Confirmar
                        </Button>
                      )}
                      {r.estado === "CONFIRMADO" && (
                        <Button size="sm" variant="outline" onClick={() => setRecibiendo(r)}>
                          <PackagePlus className="size-3.5" /> Recibir
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {reposiciones.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground">
                      {reposicionesQuery.isPending ? "Cargando…" : "No hay pedidos de reposición."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Dialog open={!!recibiendo} onOpenChange={(v) => !v && setRecibiendo(null)}>
        {recibiendo && (
          <RecibirDialog
            reposicion={recibiendo}
            nombreProducto={nombreProducto}
            onClose={() => setRecibiendo(null)}
            onDone={() => {
              setRecibiendo(null);
              refrescar();
            }}
          />
        )}
      </Dialog>
    </AppShell>
  );
}

function NuevoPedidoDialog({
  productos,
  onClose,
  onCreated,
}: {
  productos: { id: number; nombre: string; stock: number }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [proveedor, setProveedor] = useState("");
  const [fechaEstimada, setFechaEstimada] = useState("");
  const [items, setItems] = useState<{ productoId: number; nombre: string; cantidad: number }[]>(
    [],
  );
  const [productoSel, setProductoSel] = useState("");
  const [cantidadSel, setCantidadSel] = useState("1");
  const [guardando, setGuardando] = useState(false);

  function agregar() {
    const p = productos.find((x) => x.id === Number(productoSel));
    if (!p) return toast.error("Seleccioná un producto");
    const cant = Number(cantidadSel);
    if (!cant || cant < 1) return toast.error("Cantidad inválida");
    setItems((it) => [...it, { productoId: p.id, nombre: p.nombre, cantidad: cant }]);
    setProductoSel("");
    setCantidadSel("1");
  }
  function quitar(idx: number) {
    setItems((it) => it.filter((_, i) => i !== idx));
  }

  async function guardar() {
    if (!proveedor.trim()) return toast.error("Ingresá el proveedor");
    if (items.length === 0) return toast.error("Agregá al menos un producto");
    setGuardando(true);
    try {
      await registrarReposicionFn({
        data: {
          proveedor: proveedor.trim(),
          fechaEstimadaRecepcion: fechaEstimada || undefined,
          items: items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
        },
      });
      toast.success("Pedido de reposición registrado");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar el pedido");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Nuevo pedido de reposición</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Proveedor *</Label>
            <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha estimada de recepción</Label>
            <Input
              type="date"
              value={fechaEstimada}
              onChange={(e) => setFechaEstimada(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Productos</Label>
          <div className="flex gap-2">
            <Select value={productoSel} onValueChange={setProductoSel}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Seleccionar producto" />
              </SelectTrigger>
              <SelectContent>
                {productos.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.nombre} (stock actual: {p.stock})
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
            <Button type="button" size="icon" variant="outline" onClick={agregar}>
              <Plus className="size-4" />
            </Button>
          </div>
          {items.length > 0 && (
            <div className="rounded-md border divide-y text-xs">
              {items.map((it, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-1.5">
                  <span>
                    {it.cantidad}× {it.nombre}
                  </span>
                  <button onClick={() => quitar(i)} className="text-destructive">
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={guardando}>
          Registrar pedido
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RecibirDialog({
  reposicion,
  nombreProducto,
  onClose,
  onDone,
}: {
  reposicion: {
    id: number;
    items: {
      id: number;
      productoId: number;
      cantidadSolicitada: number;
      cantidadRecibida: number;
    }[];
  };
  nombreProducto: (id: number) => string;
  onClose: () => void;
  onDone: () => void;
}) {
  const pendientes = reposicion.items.filter((it) => it.cantidadRecibida < it.cantidadSolicitada);
  const [cantidades, setCantidades] = useState<Record<number, string>>(
    Object.fromEntries(
      pendientes.map((it) => [it.id, String(it.cantidadSolicitada - it.cantidadRecibida)]),
    ),
  );
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      const recepciones = pendientes
        .map((it) => ({ detalleId: it.id, cantidad: Number(cantidades[it.id] ?? 0) }))
        .filter((r) => r.cantidad > 0);
      if (recepciones.length === 0) return toast.error("Ingresá alguna cantidad recibida");
      await recibirReposicionFn({ data: { id: reposicion.id, recepciones } });
      toast.success("Recepción registrada");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar la recepción");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Registrar recepción</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        {pendientes.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">{nombreProducto(it.productoId)}</div>
              <div className="text-xs text-muted-foreground">
                Solicitado {it.cantidadSolicitada} · recibido {it.cantidadRecibida}
              </div>
            </div>
            <Input
              type="number"
              min={0}
              max={it.cantidadSolicitada - it.cantidadRecibida}
              className="w-20"
              value={cantidades[it.id] ?? ""}
              onChange={(e) => setCantidades({ ...cantidades, [it.id]: e.target.value })}
            />
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">
          Podés registrar una recepción parcial: el pedido queda "Confirmado" hasta completar todo
          lo solicitado.
        </p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={guardando}>
          Registrar recepción
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
