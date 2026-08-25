import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth, type Rol } from "@/lib/use-auth";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  crearUsuarioFn,
  darDeBajaUsuarioFn,
  actualizarUsuarioFn,
  listarUsuariosFn,
  reasignarPorBajaFn,
} from "@/server/fn/usuarios";

export const Route = createFileRoute("/usuarios")({
  head: () => ({ meta: [{ title: "Usuarios — GesTech" }] }),
  component: UsuariosPage,
});

function UsuariosPage() {
  const user = useRequireAuth();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const usuariosQuery = useQuery({ queryKey: ["usuarios"], queryFn: () => listarUsuariosFn() });
  const usuarios = usuariosQuery.data ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    nombreUsuario: "",
    contrasena: "",
    rol: "TECNICO" as Rol,
  });

  // RF10.7/RF10.8 — si la baja queda bloqueada por órdenes activas, se
  // muestra el listado acá y se pide técnico destino + motivo antes de
  // reintentar.
  const [bajaBloqueada, setBajaBloqueada] = useState<{
    usuarioId: number;
    ordenes: { id: string; cliente: string; estado: string }[];
  } | null>(null);
  const [tecnicoDestino, setTecnicoDestino] = useState("");
  const [motivoBaja, setMotivoBaja] = useState("");
  const [reasignando, setReasignando] = useState(false);

  if (!user) return null;
  if (currentUser?.rol !== "ADMINISTRADOR") {
    return (
      <AppShell title="Usuarios">
        <Card className="p-6">
          <p className="text-sm">Solo administradores.</p>
        </Card>
      </AppShell>
    );
  }

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ["usuarios"] });
  }

  function openNew() {
    setEditing(null);
    setForm({ nombre: "", apellido: "", nombreUsuario: "", contrasena: "", rol: "TECNICO" });
    setOpen(true);
  }
  function openEdit(id: number) {
    const u = usuarios.find((x) => x.id === id)!;
    setEditing(id);
    setForm({
      nombre: u.nombre,
      apellido: u.apellido,
      nombreUsuario: u.nombreUsuario,
      contrasena: "",
      rol: u.rol,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.nombre.trim() || !form.apellido.trim()) {
      return toast.error("Ingresá nombre y apellido");
    }
    try {
      if (editing) {
        await actualizarUsuarioFn({
          data: {
            id: editing,
            nombre: form.nombre,
            apellido: form.apellido,
            nombreUsuario: form.nombreUsuario,
            contrasena: form.contrasena || undefined,
            rol: form.rol,
          },
        });
        toast.success("Usuario actualizado");
      } else {
        await crearUsuarioFn({
          data: {
            nombre: form.nombre,
            apellido: form.apellido,
            nombreUsuario: form.nombreUsuario,
            contrasena: form.contrasena,
            rol: form.rol,
          },
        });
        toast.success("Usuario creado");
      }
      setOpen(false);
      refrescar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el usuario");
    }
  }

  async function darDeBaja(id: number) {
    try {
      const resultado = await darDeBajaUsuarioFn({ data: { id } });
      if (!resultado.ok) {
        // RF10.7 — tiene órdenes activas: pedir reasignación antes de la baja.
        setBajaBloqueada({ usuarioId: id, ordenes: resultado.ordenes });
        setTecnicoDestino("");
        setMotivoBaja("");
        return;
      }
      toast.success("Usuario dado de baja");
      refrescar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo dar de baja");
    }
  }

  async function reasignarYDarDeBaja() {
    if (!bajaBloqueada || !tecnicoDestino || !motivoBaja.trim()) return;
    setReasignando(true);
    try {
      await reasignarPorBajaFn({
        data: {
          usuarioId: bajaBloqueada.usuarioId,
          tecnicoDestinoId: Number(tecnicoDestino),
          motivo: motivoBaja.trim(),
        },
      });
      toast.success("Órdenes reasignadas y usuario dado de baja");
      setBajaBloqueada(null);
      refrescar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo reasignar y dar de baja");
    } finally {
      setReasignando(false);
    }
  }

  return (
    <AppShell title="Gestión de usuarios">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="size-4" /> Nuevo usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nombre</Label>
                    <Input
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Apellido</Label>
                    <Input
                      value={form.apellido}
                      onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Nombre de usuario</Label>
                  <Input
                    value={form.nombreUsuario}
                    onChange={(e) => setForm({ ...form, nombreUsuario: e.target.value })}
                    placeholder="4 a 16 caracteres, sin espacios ni caracteres especiales"
                    maxLength={16}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Contraseña{" "}
                    {editing && (
                      <span className="text-muted-foreground text-xs">
                        (dejar en blanco para no cambiar)
                      </span>
                    )}
                  </Label>
                  <Input
                    type="password"
                    value={form.contrasena}
                    onChange={(e) => setForm({ ...form, contrasena: e.target.value })}
                    placeholder="4 a 16 caracteres, letras y números"
                    maxLength={16}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Rol</Label>
                  <Select value={form.rol} onValueChange={(v: Rol) => setForm({ ...form, rol: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMINISTRADOR">Administrador</SelectItem>
                      <SelectItem value="TECNICO">Técnico</SelectItem>
                    </SelectContent>
                  </Select>
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
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 font-medium">Usuario</th>
                <th className="text-left px-4 py-3 font-medium">Rol</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {u.nombre} {u.apellido}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.nombreUsuario}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.rol === "ADMINISTRADOR" ? "default" : "secondary"}>
                      {u.rol === "ADMINISTRADOR" ? "Administrador" : "Técnico"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={u.activo ? "outline" : "secondary"}>
                      {u.activo ? "Activo" : "Dado de baja"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(u.id)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={u.id === currentUser?.id || !u.activo}
                      onClick={() => darDeBaja(u.id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">
                    {usuariosQuery.isPending ? "Cargando…" : "No hay usuarios registrados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* RF10.7/RF10.8 — reasignación masiva antes de dar de baja a un Técnico con órdenes activas. */}
      <Dialog open={!!bajaBloqueada} onOpenChange={(v) => !v && setBajaBloqueada(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No se puede dar de baja: hay órdenes activas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Este técnico es responsable de {bajaBloqueada?.ordenes.length ?? 0} orden
              {bajaBloqueada?.ordenes.length === 1 ? "" : "es"} activa
              {bajaBloqueada?.ordenes.length === 1 ? "" : "s"}. Reasignalas a otro técnico para
              continuar con la baja.
            </p>
            <div className="max-h-40 overflow-y-auto border rounded-md divide-y text-sm">
              {bajaBloqueada?.ordenes.map((o) => (
                <div key={o.id} className="px-3 py-2 flex justify-between">
                  <span className="font-medium tabular-nums">{o.id}</span>
                  <span className="text-muted-foreground">{o.cliente}</span>
                  <span className="text-muted-foreground">{o.estado}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Reasignar todas a *</Label>
              <Select value={tecnicoDestino} onValueChange={setTecnicoDestino}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar técnico" />
                </SelectTrigger>
                <SelectContent>
                  {usuarios
                    .filter(
                      (u) => u.rol === "TECNICO" && u.activo && u.id !== bajaBloqueada?.usuarioId,
                    )
                    .map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.nombre} {u.apellido}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo *</Label>
              <Textarea
                rows={2}
                value={motivoBaja}
                onChange={(e) => setMotivoBaja(e.target.value)}
                placeholder="Motivo de la reasignación y baja"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBajaBloqueada(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!tecnicoDestino || !motivoBaja.trim() || reasignando}
              onClick={reasignarYDarDeBaja}
            >
              Reasignar y dar de baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
