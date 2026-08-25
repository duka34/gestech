import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Minus, Pencil, Trash2 } from "lucide-react";
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
  actualizarProductoFn,
  crearProductoFn,
  darDeBajaProductoFn,
  listarProductosFn,
} from "@/server/fn/productos";

export const Route = createFileRoute("/stock")({
  head: () => ({ meta: [{ title: "Gestión de productos — GesTech" }] }),
  component: StockPage,
});

type Categoria = "DVR" | "NVR" | "CAMARA" | "CABLE";
const CATEGORIA_LABEL: Record<Categoria, string> = {
  DVR: "DVR",
  NVR: "NVR",
  CAMARA: "Cámara",
  CABLE: "Cable",
};

type FormState = {
  nombre: string;
  categoria: Categoria;
  stock: number;
  stockMinimo: number;
  precio: number;
};

function StockPage() {
  const user = useRequireAuth();
  const queryClient = useQueryClient();
  const productosQuery = useQuery({ queryKey: ["productos"], queryFn: () => listarProductosFn() });
  const items = productosQuery.data ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({
    nombre: "",
    categoria: "CAMARA",
    stock: 0,
    stockMinimo: 1,
    precio: 0,
  });
  if (!user) return null;

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ["productos"] });
  }

  function openNew() {
    setEditing(null);
    setForm({ nombre: "", categoria: "CAMARA", stock: 0, stockMinimo: 1, precio: 0 });
    setOpen(true);
  }
  function openEdit(p: (typeof items)[number]) {
    setEditing(p.id);
    setForm({
      nombre: p.nombre,
      categoria: p.categoria as Categoria,
      stock: p.stock,
      stockMinimo: p.stockMinimo,
      precio: p.precio,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.nombre.trim()) return toast.error("Ingresá el nombre del producto");
    if (form.stock < 0 || form.stockMinimo < 0 || form.precio < 0) {
      return toast.error("Los valores no pueden ser negativos");
    }
    try {
      if (editing) {
        await actualizarProductoFn({ data: { id: editing, ...form } });
        toast.success("Producto actualizado");
      } else {
        await crearProductoFn({ data: form });
        toast.success("Producto agregado");
      }
      setOpen(false);
      refrescar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el producto");
    }
  }

  async function remove(id: number, nombre: string) {
    if (!confirm(`¿Dar de baja el producto "${nombre}"?`)) return;
    try {
      await darDeBajaProductoFn({ data: { id } });
      toast.success("Producto dado de baja");
      refrescar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo dar de baja");
    }
  }

  async function ajustar(id: number, stockActual: number, delta: number) {
    try {
      await actualizarProductoFn({ data: { id, stock: Math.max(0, stockActual + delta) } });
      refrescar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo ajustar el stock");
    }
  }

  return (
    <AppShell title="Gestión de productos">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="size-4" /> Nuevo producto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar producto" : "Nuevo producto"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label>Producto</Label>
                  <Input
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Categoría</Label>
                  <Select
                    value={form.categoria}
                    onValueChange={(v: Categoria) => setForm({ ...form, categoria: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CATEGORIA_LABEL) as Categoria[]).map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORIA_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Stock</Label>
                    <Input
                      type="number"
                      value={form.stock}
                      onChange={(e) => setForm({ ...form, stock: +e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mínimo de stock</Label>
                    <Input
                      type="number"
                      value={form.stockMinimo}
                      onChange={(e) => setForm({ ...form, stockMinimo: +e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Precio</Label>
                    <Input
                      type="number"
                      value={form.precio}
                      onChange={(e) => setForm({ ...form, precio: +e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={save}>Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 font-medium">Categoría</th>
                  <th className="text-right px-4 py-3 font-medium">Stock</th>
                  <th className="text-right px-4 py-3 font-medium">Reservado</th>
                  <th className="text-right px-4 py-3 font-medium">Disponible</th>
                  <th className="text-right px-4 py-3 font-medium">Mínimo</th>
                  <th className="text-right px-4 py-3 font-medium">Precio</th>
                  <th className="text-right px-4 py-3 font-medium">Ajuste</th>
                  <th className="text-right px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => {
                  const bajo = s.stockDisponible <= s.stockMinimo;
                  return (
                    <tr
                      key={s.id}
                      className={`border-t hover:bg-muted/30 transition-colors ${!s.activo ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">
                        {s.nombre}
                        {!s.activo && (
                          <span className="text-xs text-muted-foreground"> (baja)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{CATEGORIA_LABEL[s.categoria as Categoria]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.stock}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {s.stockReservado}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={bajo ? "text-destructive font-medium" : ""}>
                          {s.stockDisponible}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {s.stockMinimo}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        ${s.precio.toLocaleString("es-AR")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-7"
                            disabled={!s.activo}
                            onClick={() => ajustar(s.id, s.stock, -1)}
                          >
                            <Minus className="size-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-7"
                            disabled={!s.activo}
                            onClick={() => ajustar(s.id, s.stock, 1)}
                          >
                            <Plus className="size-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={!s.activo}
                          onClick={() => remove(s.id, s.nombre)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      {productosQuery.isPending ? "Cargando…" : "No hay productos cargados."}
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
